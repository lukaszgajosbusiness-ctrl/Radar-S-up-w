// Odbudowa data/index.json ze wszystkich plików obszarów.
import fs from 'node:fs/promises';
const idx = [];
for (const f of await fs.readdir('data')) {
  if (!f.endsWith('.json') || ['index.json', 'api.json'].includes(f)) continue;
  try { const d = JSON.parse(await fs.readFile('data/' + f, 'utf8')); if (!d.parcels) continue;
    idx.push({ slug: d.slug, name: d.name, center: d.center, radius: d.radius, generated: d.generated, parcels: d.parcels.length, domy: d.parcels.filter(r => r.domPrzyLinii).length }) } catch (e) {}
}
await fs.writeFile('data/index.json', JSON.stringify(idx.sort((x, y) => x.name.localeCompare(y.name, 'pl')), null, 1));
console.log('obszary:', idx.length);
