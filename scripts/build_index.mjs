// Odbudowa data/index.json ze wszystkich plików obszarów.
import fs from 'node:fs/promises';
const idx = [];
for (const f of await fs.readdir('data')) {
  if (!f.endsWith('.json') || ['index.json', 'api.json'].includes(f)) continue;
  try { const d = JSON.parse(await fs.readFile('data/' + f, 'utf8')); if (!d.parcels) continue;
    idx.push({ slug: d.slug, name: d.name, center: d.center, radius: d.radius, generated: d.generated, parcels: d.parcels.length, domy: d.parcels.filter(r => r.domPrzyLinii).length, gm: (() => { const c = {}; for (const r of d.parcels) if (r.gm) c[r.gm] = (c[r.gm] || 0) + 1; return (Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '').replace(/ \((miasto|gmina miejska|obszar wiejski)\)/, '').replace(/^Miasto /, '') })() }) } catch (e) {}
}
await fs.writeFile('data/index.json', JSON.stringify(idx.sort((x, y) => x.name.localeCompare(y.name, 'pl')), null, 1));
console.log('obszary:', idx.length);
