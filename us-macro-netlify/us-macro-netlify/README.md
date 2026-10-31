# US Macro Watch di Netlify (live, tanpa deploy ulang)
Halaman memanggil `/api/macro` (Netlify Function). Hasilnya di-cache 1 jam di CDN, jadi data selalu
segar tanpa build baru (hemat kredit deploy).

## Pasang
1. Daftar API key FRED gratis: https://fred.stlouisfed.org/docs/api/api_key.html
2. Unggah folder ini ke repo GitHub (boleh private), lalu di Netlify: Add new site > Import from Git.
   (Alternatif: `npm i -g netlify-cli && netlify deploy --prod`.)
3. Site configuration > Environment variables:
   - `FRED_API_KEY` (wajib)
   - `ANTHROPIC_API_KEY` (opsional; tanpa ini analisis memakai aturan sederhana, gratis)
4. Deploy. Buka `https://NAMA-SITUS.netlify.app`.

Uji lokal: `netlify dev` (butuh env var yang sama).
