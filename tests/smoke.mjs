// Test dymny: apka się ładuje, gotowy obszar Tuliszów wczytuje się, dom przy linii (działka 113) jest znaleziony, karta ma blok uwag.
// Uruchomienie: npm i playwright && npx playwright install chromium && node tests/smoke.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end() } s.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(s) });
await new Promise(r => srv.listen(0, r)); const base = `http://localhost:${srv.address().port}`;
const stub = `const mk=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:(k==='getBounds'?()=>({getSouth:()=>0,getNorth:()=>1,getWest:()=>0,getEast:()=>1,getCenter:()=>({lat:50,lng:19})}):(k==='getCenter'?()=>({lat:50,lng:19}):mk())),apply:()=>mk()});window.L=mk();`;
const b = await chromium.launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route('**/*', r => { const u = r.request().url();
  if (u.includes('leaflet') && u.endsWith('.js')) return r.fulfill({ contentType: 'application/javascript', body: stub });
  if (u.includes('leaflet') && u.endsWith('.css')) return r.fulfill({ contentType: 'text/css', body: '' });
  return u.startsWith(base) ? r.continue() : r.abort() });
await pg.goto(base + '/index.html'); await pg.waitForTimeout(800);
const o = await pg.evaluate(async () => {
  await loadArea('tuliszow');
  const r = RES.find(x => x.num === '113' && x.obr === 'Tuliszów');
  if (r) openCard(r);
  return { n: RES.length, ok: RES.filter(x => x.ok).length, r113: r ? { dom: r.domPrzyLinii, ok: r.ok } : null, fb: !!document.querySelector('#fbS'), small: typeof MIN_DOM !== 'undefined', trasa: (trShow(), document.querySelectorAll('#trasa .st').length) };
});
console.log(JSON.stringify(o), errs);
const fail = []; if (errs.length) fail.push('błędy JS: ' + errs.join('; '));
if (!(o.n > 500)) fail.push('za mało działek w Tuliszowie: ' + o.n);
if (!o.r113) fail.push('brak działki 113 (Tuliszów) w danych'); else if (!o.r113.dom) fail.push('działka 113 nie ma flagi „dom przy linii”');
if (!o.fb) fail.push('brak bloku uwag z terenu w karcie');
if (!(o.trasa >= 5)) fail.push('trasa na dzień ma za mało przystanków: ' + o.trasa);
await b.close(); srv.close();
if (fail.length) { console.error('NIEPOWODZENIE:\n- ' + fail.join('\n- ')); process.exit(1) }
console.log('OK');
