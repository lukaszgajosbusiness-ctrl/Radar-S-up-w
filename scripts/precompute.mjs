// Radar Słupów – nocne przeliczanie obszarów (GitHub Actions, Node 20+).
// Dane wyłącznie publiczne: OpenStreetMap (Overpass), ULDK GUGiK (działki, budynki).
// Wynik: data/<slug>.json + data/index.json – apka wczytuje je bez odpytywania usług.
import fs from 'node:fs/promises';
import { mergeBdot } from './bdot_merge.mjs';

const AREAS = JSON.parse(await fs.readFile(new URL('./areas.json', import.meta.url), 'utf8'));
const ONLY = process.env.ONLY_AREA || '';
let BDOT = []; try { BDOT = JSON.parse(await fs.readFile(new URL('./bdot.json', import.meta.url), 'utf8')).lines } catch (e) { console.log('BDOT10k: brak scripts/bdot.json – tylko OSM') }
const UA = 'RadarSlupow/1.0 (github.com/lukaszgajosbusiness-ctrl/Radar-S-up-w)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, opt = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opt, headers: { 'User-Agent': UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(opt.tmo || 60000) });
      if (r.ok) return await r.text();
      if (r.status === 429 || r.status >= 500) { await sleep(3000 * (i + 1)); continue }
      throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === tries - 1) throw e; await sleep(2000 * (i + 1)) }
  }
}
const U = { ok: 0, err: 0 };
async function uldk(url) { try { const t = await get(url, {}, 6); U.ok++; return t } catch (e) { U.err++; throw e } }
async function pool(items, n, fn, onp = () => {}) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { await fn(items[k]) } catch (e) {} onp(++done) } }));
}

// ---------- geometria (jak w apce) ----------
let K = { kx: 71000, ky: 110540 };
const setK = lat => { K = { kx: 111320 * Math.cos(lat * Math.PI / 180), ky: 110540 } };
const M = ([lon, lat]) => [lon * K.kx, lat * K.ky];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function inRing(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [a, b] = r[i], [cx, cy] = r[j]; if ((b > p[1]) != (cy > p[1]) && p[0] < (cx - a) * (p[1] - b) / (cy - b) + a) c = !c } return c }
const inRings = (p, rs) => { let c = 0; for (const r of rs) if (inRing(p, r)) c ^= 1; return !!c };
function dSeg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1); t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
const dRings = (p, rs) => { let m = 1e9; for (const r of rs) for (let i = 0; i < r.length - 1; i++) m = Math.min(m, dSeg(p, r[i], r[i + 1])); return m };
const dLine = (p, g) => { let m = 1e9; for (let i = 0; i < g.length - 1; i++) m = Math.min(m, dSeg(p, g[i], g[i + 1])); return m };
const wktRings = w => [...w.replace(/^SRID=\d+;/, '').matchAll(/\(([-\d\. ,]+)\)/g)].map(m => m[1].split(',').map(s => s.trim().split(/\s+/).map(Number)));
const areaM2 = rs => rs.reduce((A, r) => { const m = r.map(M); let s = 0; for (let i = 0; i < m.length - 1; i++) s += m[i][0] * m[i + 1][1] - m[i + 1][0] * m[i][1]; return A + Math.abs(s) / 2 }, 0);
const round6 = rs => rs.map(r => r.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]));

function classify(t) {
  if (t.man_made === 'pipeline') { const s = (t.substance || t.type || '').toLowerCase(); if (s.includes('gas')) return 'gaz'; if (s.includes('water')) return 'woda'; return null }
  const v = Math.max(0, ...String(t.voltage || '').split(';').map(Number).filter(n => !isNaN(n)));
  if (v >= 220000) return 'NN'; if (v >= 60000) return 'WN'; if (v >= 1000) return 'SN'; if (v > 0) return 'nN';
  return t.power === 'line' ? 'WN' : 'SN';
}
const kind = t => (t.power === 'cable' || t.location === 'underground' || (t.man_made === 'pipeline' && t.location !== 'overground')) ? 'podziemna' : 'napowietrzna';

async function overpass(bb) {
  const b = `(${bb.s},${bb.w},${bb.n},${bb.e})`;
  const q = `[out:json][timeout:180];(way["power"~"^(line|minor_line|cable)$"]${b};way["man_made"="pipeline"]${b};)->.n;(.n;way(around.n:15)["landuse"="forest"];way(around.n:15)["natural"="wood"];node(around.n:3)["power"~"^(tower|pole)$"];);out tags geom;`;
  for (const host of ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    try { const t = await get(host, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, tmo: 200000 }, 2); return JSON.parse(t).elements }
    catch (e) { console.log('overpass fail', host, e.message) }
  }
  throw new Error('Overpass niedostępny');
}
async function uldkXY(lon, lat) {
  const t = (await uldk(`https://uldk.gugik.gov.pl/?request=GetParcelByXY&xy=${lon},${lat},4326&result=id,parcel,region,commune,geom_wkt&srid=4326`)).trim().split('\n');
  if (t[0] !== '0') return null; const [id, num, obr, gm, wkt] = t[1].split('|'); return { id, num, obr, gm, wkt };
}

async function geocode(qs) {
  for (const q of [].concat(qs)) {
    const j = JSON.parse(await get('https://nominatim.openstreetmap.org/search?countrycodes=pl&format=json&limit=1&q=' + encodeURIComponent(q)));
    await sleep(1100); if (j.length) return [+j[0].lat, +j[0].lon];
  }
  throw new Error('nie znaleziono: ' + [].concat(qs).join(' | '));
}
async function runArea(a) {
  if (a.lat == null) [a.lat, a.lon] = await geocode(a.q);
  const lat = a.lat, lon = a.lon, R = a.radius;
  setK(lat);
  const dLat = R / 110540, dLon = R / (111320 * Math.cos(lat * Math.PI / 180));
  const bb = { s: lat - dLat, n: lat + dLat, w: lon - dLon, e: lon + dLon };
  const inBB = ([x, y]) => x > bb.w && x < bb.e && y > bb.s && y < bb.n;
  U.ok = 0; U.err = 0;
  console.log(`== ${a.name}: OSM`);
  const els = await overpass(bb);
  const nets = [], forests = [], poles = [];
  for (const e of els) {
    if (e.type === 'node') { poles.push(M([e.lon, e.lat])); continue }
    if (!e.geometry) continue; const g = e.geometry.map(p => [p.lon, p.lat]); const t = e.tags || {};
    if (t.landuse === 'forest' || t.natural === 'wood') { forests.push(g.map(M)); continue }
    const k = classify(t); if (!k) continue;
    nets.push({ id: e.id, k, kind: kind(t), t, g, m: g.map(M) });
  }
  if (BDOT.length) { const st = mergeBdot(nets, BDOT, M, bb); console.log(`   BDOT10k: linii ${st.lines}, pokrycie OSM ${Math.round(100 * st.covered / Math.max(1, st.pts))}%, nowe odcinki ${st.newNets} (${Math.round(st.newLen)} m), potwierdzone ${st.confirm}, zmiana klasy ${st.relabel}, sprzeczne ${st.mismatch}`) }
  // punkty co 15 m wzdłuż sieci (bez nN)
  const pts = [];
  for (const n of nets) { if (n.k === 'nN') continue; const g = n.g;
    for (let i = 0; i < g.length - 1; i++) { const s = Math.max(1, Math.ceil(dist(M(g[i]), M(g[i + 1])) / 15)); for (let k = 0; k < s; k++) { const t = k / s; const p = [g[i][0] + (g[i + 1][0] - g[i][0]) * t, g[i][1] + (g[i + 1][1] - g[i][1]) * t]; if (inBB(p)) pts.push(p) } } }
  // pas linii: punkty po obu stronach osi linii NN i WN (działki bez przewodów nad sobą, ale w pasie technicznym)
  const PAS = { NN: 25, WN: 15, SN: 5 }, OFF = { NN: [-24, -12, 12, 24], WN: [-13, 13] };
  for (const n of nets) { const offs = OFF[n.k]; if (!offs) continue; const g = n.m;
    for (let i = 0; i < g.length - 1; i++) { const S = dist(g[i], g[i + 1]); if (!S) continue; const ux = (g[i + 1][0] - g[i][0]) / S, uy = (g[i + 1][1] - g[i][1]) / S; const s = Math.max(1, Math.round(S / 20));
      for (let k = 0; k < s; k++) { const x = g[i][0] + (g[i + 1][0] - g[i][0]) * (k + .5) / s, y = g[i][1] + (g[i + 1][1] - g[i][1]) * (k + .5) / s;
        for (const o of offs) { const ll = [(x - uy * o) / K.kx, (y + ux * o) / K.ky]; if (inBB(ll)) pts.push(ll) } } } }
  console.log(`   sieci ${nets.length}, punkty ${pts.length}`);
  const P = new Map(); let last = Date.now();
  await pool(pts, 4, async p => { const m = M(p); for (const d of P.values()) if (inRings(m, d.rm)) return; const d = await uldkXY(p[0], p[1]); if (!d || P.has(d.id)) return; d.rings = wktRings(d.wkt); d.rm = d.rings.map(r => r.map(M)); P.set(d.id, d) },
    k => { if (Date.now() - last > 30000) { last = Date.now(); console.log(`   ULDK ${k}/${pts.length}, działki ${P.size}`) } });
  const RES = [];
  for (const d of P.values()) {
    const sieci = [];
    for (const nt of nets) { if (nt.k === 'nN') continue; const g = nt.m; let len = 0, maxd = 0;
      for (let i = 0; i < g.length - 1; i++) { const S = dist(g[i], g[i + 1]); const s = Math.ceil(S); for (let k = 0; k < s; k++) { const q = [g[i][0] + (g[i + 1][0] - g[i][0]) * (k + .5) / s, g[i][1] + (g[i + 1][1] - g[i][1]) * (k + .5) / s]; if (inRings(q, d.rm)) { len += S / s; maxd = Math.max(maxd, dRings(q, d.rm)) } } }
      if (len >= 1) sieci.push({ id: nt.id, k: nt.k, kind: nt.kind, v: nt.t.voltage || '', op: nt.t.operator || '', bd: nt.bd ? 1 : 0, len: Math.round(len), maxd: +maxd.toFixed(1) })
      else if (PAS[nt.k]) { let dm = 1e9; for (let i = 0; i < g.length - 1; i++) { const S = dist(g[i], g[i + 1]); const s = Math.max(1, Math.ceil(S / 4)); for (let k = 0; k <= s; k++) { const q = [g[i][0] + (g[i + 1][0] - g[i][0]) * k / s, g[i][1] + (g[i + 1][1] - g[i][1]) * k / s]; dm = Math.min(dm, dRings(q, d.rm)) } }
        if (dm <= PAS[nt.k]) sieci.push({ id: nt.id, k: nt.k, kind: nt.kind, v: nt.t.voltage || '', op: nt.t.operator || '', bd: nt.bd ? 1 : 0, len: 0, maxd: 0, pas: 1, odl: Math.round(dm) }) } }
    if (!sieci.length) continue;
    let cx = 0, cy = 0; d.rm[0].forEach(p => { cx += p[0]; cy += p[1] }); const cen = [cx / d.rm[0].length, cy / d.rm[0].length];
    RES.push({ id: d.id, num: d.num, obr: d.obr, gm: d.gm, area: Math.round(areaM2(d.rings)), rings: round6(d.rings), rm: d.rm, sieci,
      slupy: poles.some(p => inRings(p, d.rm)), las: forests.some(f => inRing(cen, f)), domy: 0, domPrzyLinii: false, domOdl: null });
  }
  // budynki (baza budynków GUGiK) tylko na działkach spełniających odległość 5 m
  const ok = RES.filter(r => !r.las && r.sieci.some(s => s.maxd >= 5 || s.pas));
  const okP = ok.map(r => { const f = r.rm.flat(); return { r, x0: Math.min(...f.map(p => p[0])), x1: Math.max(...f.map(p => p[0])), y0: Math.min(...f.map(p => p[1])), y1: Math.max(...f.map(p => p[1])) } });
  const bpts = [];
  for (const n of nets) { if (!['NN', 'WN', 'gaz'].includes(n.k)) continue; const g = n.m;
    for (let i = 0; i < g.length - 1; i++) { const S = dist(g[i], g[i + 1]); if (!S) continue; const ux = (g[i + 1][0] - g[i][0]) / S, uy = (g[i + 1][1] - g[i][1]) / S; const s = Math.max(1, Math.round(S / 15));
      for (let k = 0; k < s; k++) { const x = g[i][0] + (g[i + 1][0] - g[i][0]) * (k + .5) / s, y = g[i][1] + (g[i + 1][1] - g[i][1]) * (k + .5) / s;
        for (const o of [-27, -18, -9, 0, 9, 18, 27]) { const q = [x - uy * o, y + ux * o]; const ll = [q[0] / K.kx, q[1] / K.ky]; if (inBB(ll) && okP.some(o2 => q[0] >= o2.x0 && q[0] <= o2.x1 && q[1] >= o2.y0 && q[1] <= o2.y1 && inRings(q, o2.r.rm))) bpts.push({ q, ll, net: n }) } } } }
  console.log(`   budynki: ${bpts.length} punktów`);
  const found = new Map(); last = Date.now();
  await pool(bpts, 6, async p => { for (const b of found.values()) if (inRings(p.q, b.rm)) return;
    const t = (await uldk(`https://uldk.gugik.gov.pl/?request=GetBuildingByXY&xy=${p.ll[0]},${p.ll[1]},4326&result=id,geom_wkt&srid=4326`)).trim().split('\n');
    if (t[0] !== '0' || !t[1]) return; const [bid, wkt] = t[1].split('|'); if (found.has(bid)) return; const rm = wktRings(wkt).map(r => r.map(M)); let cx = 0, cy = 0; rm[0].forEach(q => { cx += q[0]; cy += q[1] }); const c = [cx / rm[0].length, cy / rm[0].length]; let a = 0; for (let i = 0; i < rm[0].length - 1; i++) a += rm[0][i][0] * rm[0][i + 1][1] - rm[0][i + 1][0] * rm[0][i][1]; found.set(bid, { rm, c, d: dLine(c, p.net.m), a: Math.abs(a) / 2 }) },
    k => { if (Date.now() - last > 30000) { last = Date.now(); console.log(`   budynki ${k}/${bpts.length}, znalezione ${found.size}`) } });
  for (const r of RES) { const bs = [...found.values()].filter(b => b.a >= 40 && inRings(b.c, r.rm)); if (bs.length) { r.domy = bs.length; const d = Math.min(...bs.map(b => b.d)); if (d < 40) { r.domPrzyLinii = true; r.domOdl = Math.round(d) } } delete r.rm }
  const usedNets = new Set(RES.flatMap(r => r.sieci.map(s => s.id)));
  const out = {
    name: a.name, slug: a.slug, center: [lat, lon], radius: R, bbox: bb, generated: new Date().toISOString(),
    zrodla: 'OpenStreetMap (ODbL), BDOT10k i ULDK GUGiK – dane publiczne',
    nets: nets.filter(n => n.k !== 'nN' || usedNets.has(n.id)).map(n => ({ id: n.id, k: n.k, kind: n.kind, v: n.t.voltage || '', op: n.t.operator || '', bd: n.bd ? 1 : 0, g: n.g.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]) })),
    parcels: RES
  };
  const errRate = U.err / Math.max(1, U.ok + U.err);
  let prev = 0; try { prev = JSON.parse(await fs.readFile(`data/${a.slug}.json`, 'utf8')).parcels.length } catch (e) {}
  if (errRate > 0.1) throw new Error(`ULDK zawodzi (${U.err} błędów na ${U.ok + U.err} zapytań) – zostawiam poprzednie dane`);
  if (!RES.length) throw new Error('0 działek – nie zapisuję');
  if (prev && RES.length < prev * 0.7) throw new Error(`wynik słabszy niż poprzedni (${RES.length} < ${prev}) – zostawiam poprzednie dane`);
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(`data/${a.slug}.json`, JSON.stringify(out));
  console.log(`   zapisano data/${a.slug}.json: ${RES.length} działek, ${RES.filter(r => r.domPrzyLinii).length} z budynkiem przy linii`);
  return { slug: a.slug, name: a.name, center: [lat, lon], radius: R, generated: out.generated, parcels: RES.length, domy: RES.filter(r => r.domPrzyLinii).length };
}

let index = [];
try { index = JSON.parse(await fs.readFile('data/index.json', 'utf8')) } catch (e) {}
for (const a of AREAS) {
  if (ONLY && a.slug !== ONLY) continue;
  try { const s = await runArea(a); index = index.filter(x => x.slug !== s.slug).concat(s) }
  catch (e) { console.log(`!! ${a.name}: ${e.message}`) }
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/index.json', JSON.stringify(index.sort((x, y) => x.name.localeCompare(y.name, 'pl')), null, 1));
}
