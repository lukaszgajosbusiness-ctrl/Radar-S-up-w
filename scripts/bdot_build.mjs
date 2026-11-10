// Radar Słupów – pobranie linii przesyłowych z BDOT10k (GUGiK, dane publiczne) dla powiatów z areas.json.
// Wynik: scripts/bdot.json (linie SULN = elektroenergetyczne z klasą napięcia, SUPR = rurociągi gaz/woda), WGS84.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import proj4 from 'proj4';
import * as shapefile from 'shapefile';
const TER = ['2401', '2465', '2416']; // powiat będziński, m. Dąbrowa Górnicza, powiat zawierciański
const DEF = '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs';
const tr = ([x, y]) => (Math.abs(x) < 190 ? [x, y] : proj4(DEF, 'WGS84', [x, y])).map(v => +v.toFixed(6));
const CLS = { 'linia elektroenergetyczna najwyższego napięcia': 'NN', 'linia elektroenergetyczna wysokiego napięcia': 'WN', 'linia elektroenergetyczna średniego napięcia': 'SN' };
const lines = [];
for (const t of TER) { try {
  const url = `https://opendata.geoportal.gov.pl/bdot10k/schemat2021/SHP/${t.slice(0, 2)}/${t}_SHP.zip`;
  const r = await fetch(url, { headers: { 'User-Agent': 'RadarSlupow/1.0' }, signal: AbortSignal.timeout(900000) });
  console.log(t, r.status, r.headers.get('content-length'));
  if (!r.ok) continue;
  const dir = `/tmp/bdot_${t}`; await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(`${dir}/p.zip`, Buffer.from(await r.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', `${dir}/p.zip`, '*SULN_L*', '*SUPR_L*', '-d', dir]);
  for (const f of await fs.readdir(dir)) {
    if (!f.endsWith('.shp')) continue; const kind = f.includes('SULN') ? 'SULN' : 'SUPR';
    const src = await shapefile.open(`${dir}/${f}`, `${dir}/${f.replace('.shp', '.dbf')}`, { encoding: 'utf-8' });
    let n = 0;
    for (let x = await src.read(); !x.done; x = await src.read()) {
      const p = x.value.properties, g = x.value.geometry; if (!g) continue;
      let k = null;
      if (kind === 'SULN') k = CLS[p.RODZAJ]; else k = p.RODZAJ === 'gazowy' ? 'gaz' : p.RODZAJ === 'wodociągowy' ? 'woda' : null;
      if (!k) continue;
      const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const c of parts) { lines.push({ k, src: kind, teryt: t, ground: /pod ziemię/.test(p.INFO_DODAT || '') ? 1 : 0, g: c.map(tr) }); n++ }
    }
    console.log(' ', f, n);
  }
  } catch (e) { console.log(t, 'BŁĄD', e.message, '– zostawiam poprzednie linie');
    try { const old = JSON.parse(await fs.readFile(new URL('./bdot.json', import.meta.url), 'utf8')).lines.filter(l => l.teryt === t); lines.push(...old) } catch (e2) {} }
}
await fs.writeFile(new URL('./bdot.json', import.meta.url), JSON.stringify({ generated: new Date().toISOString(), src: 'BDOT10k (GUGiK) – dane publiczne', lines }));
console.log('linie:', lines.length, 'przykład:', JSON.stringify(lines[0]?.g?.[0]));
