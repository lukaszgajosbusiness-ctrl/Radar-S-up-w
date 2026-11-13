// Radar Słupów – punkty adresowe z PRG (GUGiK, dane publiczne) dla powiatów z obszarami.
// Wynik: scripts/prg.json = [[lat, lon, "ulica nr, miejscowość"], ...] (WGS84). Bez danych o właścicielach.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import proj4 from 'proj4';
import * as shapefile from 'shapefile';
const TER = ['2401', '2465', '2416', '2413', '2410', '2475', '2468', '2462'];
const DEF = '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs';
let old = []; try { old = JSON.parse(await fs.readFile(new URL('./prg.json', import.meta.url), 'utf8')).pts } catch (e) {}
const pts = []; let shown = false;
for (const t of TER) { const start = pts.length; try {
  const r = await fetch(`https://integracja.gugik.gov.pl/PRG/pobierz.php?teryt=${t}&adresy`, { headers: { 'User-Agent': 'RadarSlupow/1.0' }, signal: AbortSignal.timeout(900000) });
  console.log(t, r.status); if (!r.ok) throw new Error('HTTP ' + r.status);
  const dir = `/tmp/prg_${t}`; await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(`${dir}/p.zip`, Buffer.from(await r.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', `${dir}/p.zip`, '*PunktyAdresowe*', '-d', dir]);
  const shp = (await fs.readdir(dir)).find(f => f.endsWith('.shp'));
  const src = await shapefile.open(`${dir}/${shp}`, `${dir}/${shp.replace('.shp', '.dbf')}`, { encoding: 'utf-8' });
  for (let x = await src.read(); !x.done; x = await src.read()) {
    const p = x.value.properties, g = x.value.geometry; if (!g) continue;
    if (!shown) { console.log('pola:', JSON.stringify(p).slice(0, 800)); shown = true }
    const get = (...ks) => { for (const k of Object.keys(p)) if (ks.some(s => k.toUpperCase() === s)) return (p[k] ?? '').toString().trim(); return '' };
    const nr = get('NUMER', 'NUMERPORZADKOWY', 'NUMER_PORZ', 'NR'); if (!nr) continue;
    const mc = get('NAZWA_MSC', 'MIEJSCOWOS', 'MIEJSCOWOSC', 'MIEJSC_NAZ', 'MSC'); const ul = get('NAZWA_ULC', 'ULICA', 'NAZWA_ULIC', 'ULICA_NAZW', 'UL');
    let [x0, y0] = g.coordinates; if (Math.abs(x0) > 190) { if (x0 > y0 && x0 > 1e6) [x0, y0] = [y0, x0]; [x0, y0] = proj4(DEF, 'WGS84', [x0, y0]) }
    pts.push([+y0.toFixed(6), +x0.toFixed(6), ul ? `${ul.replace(/^ul\.\s*/i, '')} ${nr}, ${mc}` : `${mc} ${nr}`]);
  }
  console.log(' ', t, pts.length - start);
} catch (e) { console.log(t, 'BŁĄD', e.message, '– zostawiam poprzednie'); pts.push(...old.filter(q => q[3] === t)) }
  for (let i = start; i < pts.length; i++) pts[i][3] = t }
await fs.writeFile(new URL('./prg.json', import.meta.url), JSON.stringify({ generated: new Date().toISOString(), src: 'PRG – punkty adresowe (GUGiK), dane publiczne', pts }));
console.log('punkty:', pts.length, JSON.stringify(pts[0]));
