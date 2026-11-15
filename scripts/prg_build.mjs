// Radar Słupów – punkty adresowe z PRG (GUGiK, dane publiczne) dla powiatów z obszarami.
// Wynik: scripts/prg.json = [[lat, lon, "ulica nr, miejscowość"], ...] (WGS84). Bez danych o właścicielach.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import proj4 from 'proj4';
import * as shapefile from 'shapefile';
const TER = JSON.parse(await fs.readFile(new URL('./ter_slask.json', import.meta.url), 'utf8')); // 36 powiatów woj. śląskiego (17 ziemskich + 19 grodzkich)
const DEF = '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs';
// zostawiamy tylko adresy blisko linii elektroenergetycznych (do 120 m) – reszta nie jest potrzebna, a plik byłby ogromny
const NEAR = []; const CELL = 0.002; const grid = new Map();
try { const bj = JSON.parse(await fs.readFile(new URL('./bdot.json', import.meta.url), 'utf8'));
  for (const l of bj.lines) { if (!['NN', 'WN', 'SN'].includes(l.k)) continue;
    for (let i = 0; i < l.g.length - 1; i++) { const [ax, ay] = l.g[i], [bx, by] = l.g[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.0004));
      for (let j = 0; j <= n; j++) { const x = ax + (bx - ax) * j / n, y = ay + (by - ay) * j / n; const key = Math.floor(x / CELL) + ',' + Math.floor(y / CELL); (grid.get(key) || grid.set(key, []).get(key)).push([x, y]) } } }
} catch (e) { console.log('brak bdot.json – bez filtra') }
const nearLine = (lat, lon) => { if (!grid.size) return true; const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [x, y] of grid.get((cx + dx) + ',' + (cy + dy)) || []) { const mx = (x - lon) * 71000, my = (y - lat) * 111000; if (mx * mx + my * my < 14400) return true } return false };
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
    if (!nearLine(+y0, +x0)) continue;
    pts.push([+y0.toFixed(6), +x0.toFixed(6), ul ? `${ul.replace(/^ul\.\s*/i, '')} ${nr}, ${mc}` : `${mc} ${nr}`]);
  }
  console.log(' ', t, pts.length - start);
} catch (e) { console.log(t, 'BŁĄD', e.message, '– zostawiam poprzednie'); pts.push(...old.filter(q => q[3] === t)) }
  for (let i = start; i < pts.length; i++) pts[i][3] = t }
await fs.writeFile(new URL('./prg.json', import.meta.url), JSON.stringify({ generated: new Date().toISOString(), src: 'PRG – punkty adresowe (GUGiK), dane publiczne', pts }));
console.log('punkty:', pts.length, JSON.stringify(pts[0]));
