// Radar Słupów – automatyczny wybór nowych obszarów: skupiska domów (punkty adresowe PRG) przy napowietrznych liniach NN/WN.
// Użycie: node scripts/gen_areas.mjs [ile=40] [min_domów=8]  → dopisuje do scripts/areas.json (pomija miejsca już pokryte).
import fs from 'node:fs/promises';
const N = +process.argv[2] || 40, MIN = +process.argv[3] || 8;
const rd = async f => JSON.parse(await fs.readFile(new URL(f, import.meta.url), 'utf8'));
const prg = (await rd('./prg.json')).pts, bdot = (await rd('./bdot.json')).lines, areas = await rd('./areas.json');
const K = 111320, CELL = 0.002;
// siatka odcinków linii NN/WN (tylko napowietrzne)
const G = new Map();
for (const l of bdot) { if ((l.k !== 'NN' && l.k !== 'WN') || l.ground) continue;
  for (let i = 1; i < l.g.length; i++) { const a = l.g[i - 1], b = l.g[i];
    for (let x = Math.floor(Math.min(a[0], b[0]) / CELL) - 1; x <= Math.floor(Math.max(a[0], b[0]) / CELL) + 1; x++)
      for (let y = Math.floor(Math.min(a[1], b[1]) / CELL) - 1; y <= Math.floor(Math.max(a[1], b[1]) / CELL) + 1; y++) {
        const key = x + ':' + y; (G.get(key) || G.set(key, []).get(key)).push([a, b, l.k]) } } }
const dist = (p, a, b, c) => { const X = q => [(q[0] - p[1]) * K * c, (q[1] - p[0]) * K]; const A = X(a), B = X(b);
  const dx = B[0] - A[0], dy = B[1] - A[1]; let t = (-A[0] * dx - A[1] * dy) / (dx * dx + dy * dy || 1); t = Math.max(0, Math.min(1, t));
  return Math.hypot(A[0] + t * dx, A[1] + t * dy) };
const covered = p => areas.some(a => Math.hypot((a.lat - p[0]) * K, (a.lon - p[1]) * K * Math.cos(p[0] * Math.PI / 180)) < (a.radius || 1500) + 200);
// punkty „przy linii”: NN ≤ 30 m, WN ≤ 20 m
let hits = [];
for (const p of prg) { if (covered(p)) continue; const c = Math.cos(p[0] * Math.PI / 180); let ok = false;
  for (const s of G.get(Math.floor(p[1] / CELL) + ':' + Math.floor(p[0] / CELL)) || []) { if (dist(p, s[0], s[1], c) < (s[2] === 'NN' ? 30 : 20)) { ok = true; break } }
  if (ok) hits.push({ lat: p[0], lon: p[1], msc: (p[2].split(', ').pop() || '').trim(), t: p[3] || '' }) }
console.log('punkty przy liniach poza obszarami:', hits.length);
const R = 1500, out = [];
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const used = new Set(areas.map(a => a.slug));
while (out.length < N && hits.length) {
  // gęstość w komórkach 0,01°
  const cell = new Map(); for (const h of hits) { const k = Math.floor(h.lat * 100) + ':' + Math.floor(h.lon * 100); (cell.get(k) || cell.set(k, []).get(k)).push(h) }
  let best = null, bn = 0;
  for (const [k, arr] of cell) { const [a, b] = k.split(':').map(Number); let n = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) n += (cell.get((a + i) + ':' + (b + j)) || []).length; if (n > bn) { bn = n; best = [a, b] } }
  if (bn < MIN) break;
  const near = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) near.push(...(cell.get((best[0] + i) + ':' + (best[1] + j)) || []));
  const la = near.reduce((s, h) => s + h.lat, 0) / near.length, lo = near.reduce((s, h) => s + h.lon, 0) / near.length, cs = Math.cos(la * Math.PI / 180);
  const inR = h => Math.hypot((h.lat - la) * K, (h.lon - lo) * K * cs) < R;
  const mem = hits.filter(inR); const cnt = {}; mem.forEach(h => cnt[h.msc] = (cnt[h.msc] || 0) + 1);
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0] || 'obszar';
  let sl = slug(top) || 'obszar'; if (used.has(sl)) { let i = 2; while (used.has(sl + '-' + i)) i++; sl += '-' + i } used.add(sl);
  out.push({ slug: sl, name: top, q: top, lat: +la.toFixed(4), lon: +lo.toFixed(4), radius: R, n: mem.length });
  hits = hits.filter(h => !inR(h) && Math.hypot((h.lat - la) * K, (h.lon - lo) * K * cs) > R + 200);
}
console.log('nowe obszary:', out.length); out.slice(0, 15).forEach(a => console.log(a.n, a.slug));
areas.push(...out.map(({ n, ...a }) => a));
await fs.writeFile(new URL('./areas.json', import.meta.url), JSON.stringify(areas, null, 1));
