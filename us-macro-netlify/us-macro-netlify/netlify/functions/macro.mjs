// GET /api/macro -> data FRED + berita RSS + analisis. Di-cache di CDN Netlify 1 jam,
// jadi data selalu segar TANPA deploy ulang (hemat kredit build).
// Key FRED dibaca dari environment variable Netlify (aman untuk repo publik).
const FRED_KEY = process.env.FRED_API_KEY;

const FEEDS = {
  "Federal Reserve": "https://www.federalreserve.gov/feeds/press_all.xml",
  "BLS": "https://www.bls.gov/feed/bls_latest.rss",
  "Berita": "https://news.google.com/rss/search?q=US+economy+Fed+inflation+jobs&hl=en-US&gl=US&ceid=US:en",
};

async function fred(id, limit = 14) {
  const u = new URL("https://api.stlouisfed.org/fred/series/observations");
  u.search = new URLSearchParams({ series_id: id, api_key: FRED_KEY, file_type: "json", sort_order: "desc", limit }).toString();
  const r = await fetch(u);
  if (!r.ok) throw new Error(`FRED ${id}: ${r.status}`);
  const j = await r.json();
  return j.observations.filter(o => o.value !== ".").map(o => [o.date, parseFloat(o.value)]);
}
const yoy = async id => { const o = await fred(id, 14); return [o[0][0], (o[0][1] / o[12][1] - 1) * 100]; };

async function news() {
  const clean = s => (s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
  const pick = (x, t) => clean((x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
  const all = await Promise.all(Object.entries(FEEDS).map(async ([src, url]) => {
    try {
      const xml = await (await fetch(url, { headers: { "User-Agent": "us-macro-watch" } })).text();
      return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].slice(0, 6).map(m => ({
        src, title: pick(m[0], "title"), link: pick(m[0], "link"), t: Date.parse(pick(m[0], "pubDate")) || 0 }));
    } catch { return []; }
  }));
  return all.flat().sort((a, b) => b.t - a.t).slice(0, 12);
}

function ruleAnalysis(d) {
  return `Inflasi CPI ${d.cpi.toFixed(1)}% yoy (inti ${d.core.toFixed(1)}%) ${d.cpi > 3 ? "tergolong panas" : "relatif terkendali"}. ` +
    `Pasar kerja ${d.nfp < 75 ? "melemah" : "solid"}: payrolls ${d.nfp >= 0 ? "+" : ""}${Math.round(d.nfp)} ribu, pengangguran ${d.unemp.toFixed(1)}%. ` +
    `Fed funds ${d.fedLo.toFixed(2)}–${d.fedHi.toFixed(2)}%, yield 10 tahun ${d.y10.toFixed(2)}%. ` +
    "Inflasi tinggi dengan pasar kerja melemah menyulitkan Fed; dolar kuat dan yield tinggi menekan rupiah dan arus modal ke emerging market.";
}

async function aiAnalysis(d, items) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return ruleAnalysis(d);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 800, messages: [{ role: "user", content:
        "Anda analis makro. Tulis analisis fundamental ekonomi AS dalam Bahasa Indonesia (maks 200 kata): kondisi, risiko, dampak ke Indonesia. Gunakan hanya data ini; bukan nasihat investasi.\n" +
        `DATA: ${JSON.stringify(d)}\nJUDUL BERITA: ${JSON.stringify(items.map(i => i.title))}` }] }) });
    if (!r.ok) throw new Error(r.status);
    return (await r.json()).content.map(b => b.text || "").join("");
  } catch { return ruleAnalysis(d); }
}

export default async () => {
  const h = { "content-type": "application/json",
    // cache 1 jam di CDN, sajikan versi lama sambil menyegarkan di belakang layar
    "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    "Cache-Control": "public, max-age=300" };
  if (!FRED_KEY)
    return new Response(JSON.stringify({ error: "FRED_API_KEY belum diset di Netlify" }), { status: 500, headers: { "content-type": "application/json" } });
  try {
    const [hi, lo, [cpiDate, cpi], [, core], un, pay, gas, gdp, y10, items] = await Promise.all([
      fred("DFEDTARU", 1), fred("DFEDTARL", 1), yoy("CPIAUCSL"), yoy("CPILFESL"), fred("UNRATE", 2),
      fred("PAYEMS", 2), fred("GASREGW", 1), fred("A191RL1Q225SBEA", 2), fred("DGS10", 1), news()]);
    const d = { fedHi: hi[0][1], fedLo: lo[0][1], cpiDate, cpi, core, unemp: un[0][1], unempPrev: un[1][1],
      nfp: pay[0][1] - pay[1][1], gas: gas[0][1], gdp: gdp[0][1], gdpDate: gdp[0][0], y10: y10[0][1] };
    const analysis = await aiAnalysis(d, items);
    return new Response(JSON.stringify({ updated: new Date().toISOString(), d, items, analysis }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers: { "content-type": "application/json" } });
  }
};

export const config = { path: "/api/macro" };
