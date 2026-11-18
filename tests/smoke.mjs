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
  if (u.includes('uldk.gugik.gov.pl')) return r.fulfill({ contentType: 'text/plain', body: '0\n240101_1.0001.10509|10509|Będzin|Będzin (miasto)|powiat będziński|POLYGON((19.1 50.3,19.2 50.3,19.2 50.4,19.1 50.3))' });
  return u.startsWith(base) ? r.continue() : r.abort() });
await pg.goto(base + '/index.html'); await pg.waitForTimeout(800);
const tu = await pg.evaluate(async () => { await tuShow(50.3114, 19.1493, 'map'); return document.querySelector('#card').innerText });
await pg.evaluate(() => { document.querySelector('#tuN').value = 'linia SN nad działką'; document.querySelector('#tuS').click() });
const sv = await pg.evaluate(() => localStorage.getItem('rs:u:240101_1.0001.10509'));
if (!/linia SN nad dzia/.test(sv || '') || !/do sprawdzenia/.test(sv)) { console.log('ZAPIS DZIAŁKI TU NIE DZIAŁA', sv); process.exit(1) }
if (!/Działka 10509/.test(tu) || !/obręb Będzin/.test(tu)) { console.log('DZIAŁKA TU NIE DZIAŁA', tu.slice(0, 200)); process.exit(1) }
const f0 = await pg.evaluate(() => document.querySelectorAll('#gotowe option').length);
await pg.fill('#gFilt', 'zawiercie'); await pg.waitForTimeout(200);
const f1 = await pg.evaluate(() => document.querySelectorAll('#gotowe option').length);
if (!(f1 > 1 && f1 < f0)) { console.log('FILTR OBSZARÓW NIE DZIAŁA', f0, f1); process.exit(1) }
await pg.fill('#gFilt', 'bielsko'); await pg.waitForTimeout(200);
const bb = await pg.evaluate(() => [...document.querySelectorAll('#gotowe option')].map(o => o.textContent));
if (!bb.some(t => / nr 2 ·/.test(t))) { console.log('BRAK NUMERACJI POWTÓRZONYCH OBSZARÓW', bb.slice(0, 4)); process.exit(1) }
await pg.fill('#gFilt', '');
const o = await pg.evaluate(async () => {
  await loadArea('tuliszow');
  const r = RES.find(x => x.num === '113' && x.obr === 'Tuliszów');
  if (r) openCard(r);
  return { n: RES.length, ok: RES.filter(x => x.ok).length, r113: r ? { dom: r.domPrzyLinii, ok: r.ok } : null, fb: !!document.querySelector('#fbS'), small: typeof MIN_DOM !== 'undefined', trasa: (trShow(), document.querySelectorAll('#trasa .st').length), crm: (() => { const T = TODAY(); store.set('u:t1', { lab: '0001 5/1', stat: 'umowa', trasa: 'zainteresowany', trDay: T, upd: 1 }); store.set('u:t2', { lab: '0001 6', trasa: 'nikogo', trDay: T, upd: 2 }); crmShow(); const t = $('#crm').innerText; const ok = /2\/10/.test(t) && /0001 5\/1/.test(t) && /Wróć po 17 \(1\)/.test(t); store.set('u:t1', {}); store.set('u:t2', {}); $('#crm').hidden = true; return { ok, t: t.slice(0, 120) } })(), nowyDzien: (() => { const st = trPick().stops; const a = st[0].r, b = st[1].r; store.set('u:' + a.id, { trasa: 'zainteresowany', trDay: '2000-01-01' }); store.set('u:' + b.id, { trasa: 'nikogo', trDay: '2000-01-01' }); const n = trPick().stops; return { bezA: !n.some(p => p.r.id === a.id), bNaPoczatku: n[0].r.id === b.id || !ME && n.some(p => p.r.id === b.id), bCzysty: trStat(b) === '' } })() };
});
console.log(JSON.stringify(o), errs);
const fail = []; if (errs.length) fail.push('błędy JS: ' + errs.join('; '));
if (!(o.n > 500)) fail.push('za mało działek w Tuliszowie: ' + o.n);
if (!o.r113) fail.push('brak działki 113 (Tuliszów) w danych'); else if (!o.r113.dom) fail.push('działka 113 nie ma flagi „dom przy linii”');
if (!o.fb) fail.push('brak bloku uwag z terenu w karcie');
if (!o.nowyDzien.bezA || !o.nowyDzien.bNaPoczatku || !o.nowyDzien.bCzysty) fail.push('trasa: nowy dzień ' + JSON.stringify(o.nowyDzien));
if (!o.crm.ok) fail.push('CRM: ' + JSON.stringify(o.crm));
if (!(o.trasa >= 5)) fail.push('trasa na dzień ma za mało przystanków: ' + o.trasa);
// Trasa z linku (?lista=obszar:id,...) — kolejność jak w linku, wszystkie przystanki
const ids = ['240107_5.0010.91/10','240107_5.0010.112','240107_4.0001.8787'];
const pg2 = await b.newPage(); const e2 = []; pg2.on('pageerror', e => e2.push(e.message));
await pg2.route('**/*', r => { const u = r.request().url(); if (u.includes('leaflet') && u.endsWith('.js')) return r.fulfill({ contentType: 'application/javascript', body: stub }); if (u.includes('leaflet') && u.endsWith('.css')) return r.fulfill({ contentType: 'text/css', body: '' }); return u.startsWith(base) ? r.continue() : r.abort() });
await pg2.goto(base + '/index.html?lista=tuliszow:' + ids.map(encodeURIComponent).join(',')); await pg2.waitForTimeout(2500);
const lt = await pg2.evaluate(() => { try { return { n: trPick().stops.map(s => s.r.id), fix: !!trFix(), auto: !!document.querySelector('#trAuto') } } catch (e) { return { err: e.message } } });
console.log('lista', JSON.stringify(lt), e2);
if (lt.err || JSON.stringify(lt.n) !== JSON.stringify(ids)) fail.push('trasa z linku: ' + JSON.stringify(lt));
if (e2.length) fail.push('błędy JS (link): ' + e2.join('; '));
// Dopisz kolejne 4 z okolicy: dokłada do przypiętej trasy, nie zmienia kolejności pierwszych
const mo = await pg2.evaluate(async () => { trShow(); const b = document.querySelector('#trMore'); if (!b) return { err: 'brak przycisku' }; const before = trFix().length; b.click(); await new Promise(r => setTimeout(r, 300)); return { before, after: trFix().length, first: trFix().slice(0, 3) } });
console.log('more', JSON.stringify(mo));
if (mo.err || mo.after <= mo.before || mo.after > mo.before + 4 || JSON.stringify(mo.first) !== JSON.stringify(ids)) fail.push('Dopisz kolejne 4: ' + JSON.stringify(mo));
// Ostrzeżenie o danych osobowych
const os = await pg2.evaluate(() => ({ tel: !!osobowe('tel 600 123 456'), mail: !!osobowe('a@b.pl'), pan: !!osobowe('Pan Kowalski wróci po 17'), ok: !osobowe('dom pod linią, wróć po 17, pies na posesji') }));
console.log('osobowe', JSON.stringify(os));
if (!os.tel || !os.mail || !os.pan || !os.ok) fail.push('ostrzeżenie osobowe: ' + JSON.stringify(os));
// Pasek postępu licznika dnia
const bar = await pg2.evaluate(() => { localStorage.setItem('cel', '10'); dzisUp(); const b = document.getElementById('dzis'); return { bg: b.style.backgroundImage, al: b.getAttribute('aria-label') } });
console.log('bar', JSON.stringify(bar));
if (!bar.al || !/Dziś \d+ z 10/.test(bar.al)) fail.push('licznik dnia: ' + JSON.stringify(bar));
// Podsumowanie dnia w CRM
const sm = await pg2.evaluate(() => { crmShow(); const b = document.getElementById('crmSum'); if (!b) return { err: 'brak' }; try { b.click() } catch (e) {} return { t: window.__sum || '' } });
console.log('sum', JSON.stringify(sm));
if (sm.err || !/^Radar Słupów, \d{4}-\d\d-\d\d: odwiedzone \d+/.test(sm.t) || /\d{3}[ -]?\d{3}[ -]?\d{3}/.test(sm.t)) fail.push('podsumowanie dnia: ' + JSON.stringify(sm));
// Cofnij ostatni status
const un = await pg2.evaluate(() => { const r = trPick().stops[0].r, k = 'rs:u:' + r.id; const g = () => (JSON.parse(localStorage.getItem(k) || '{}').trasa || ''); const b0 = g(); trSet(r, 'nikogo'); const b1 = g(); const btn = document.querySelector('#trUndo'); if (btn) btn.click(); return { b0, b1, b2: g(), btn: !!btn } });
console.log('undo', JSON.stringify(un));
if (!un.btn || un.b1 !== 'nikogo' || un.b2 !== un.b0) fail.push('cofnij status: ' + JSON.stringify(un));
// Nawiguj do następnej
const nx = await pg2.evaluate(() => { trShow(); const a = document.querySelector('#trNext'); return a ? { h: a.getAttribute('href'), t: a.textContent } : { err: 'brak' } });
console.log('next', JSON.stringify(nx));
if (nx.err || !/maps\/dir/.test(nx.h) || !/Nawiguj do następnej/.test(nx.t)) fail.push('nawiguj do następnej: ' + JSON.stringify(nx));
// Service worker: kafelki i dane offline, składnia
{ const fs = await import('node:fs'); const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'); try { new Function(sw) } catch (e) { fail.push('sw.js składnia: ' + e.message) } if (!sw.includes("radar-tiles") || !sw.includes("radar-data")) fail.push('sw.js: brak cache kafelków/danych') }
// Status Karteczka zostawiona
const kt = await pg2.evaluate(() => { const r = trPick().stops[1].r; trSet(r, 'karteczka'); const u = JSON.parse(localStorage.getItem('rs:u:' + r.id) || '{}'); const chip = !!document.querySelector('[data-v="karteczka"]'); return { s: u.trasa, chip, o: dzisN().o } });
console.log('karteczka', JSON.stringify(kt));
if (kt.s !== 'karteczka' || !kt.chip || kt.o < 1) fail.push('karteczka: ' + JSON.stringify(kt));
// Wskaźnik offline
const of = await pg2.evaluate(() => { const e = document.getElementById('offl'); if (!e) return { err: 'brak' }; const a = getComputedStyle(e).display; window.dispatchEvent(new Event('offline')); return { a, ok: true } });
console.log('offline', JSON.stringify(of));
if (of.err || of.a !== 'none') fail.push('wskaźnik offline: ' + JSON.stringify(of));
// Filtr Tylko dom pod linią (trasa automatyczna)
const fd = await pg.evaluate(() => { localStorage.setItem('rs:trDom', '1'); const a = trPick().stops; const ok = a.every(p => p.r.domPrzyLinii); localStorage.setItem('rs:trDom', '0'); return { n: a.length, ok } });
console.log('trDom', JSON.stringify(fd));
if (!fd.ok) fail.push('filtr dom pod linią: ' + JSON.stringify(fd));
// Linia od mojej pozycji do następnego przystanku (bez błędów JS)
const ln = await pg.evaluate(() => { try { ME = [50.4393, 19.198]; trShow(); const ok = Array.isArray(window.__trLine); trClose(); return { ok } } catch (e) { return { err: e.message } } });
console.log('linia', JSON.stringify(ln));
if (ln.err || !ln.ok) fail.push('linia do następnego: ' + JSON.stringify(ln));
// Kopiuj opis działki (bez danych osób)
const op = await pg.evaluate(() => { const r = RES.find(x => x.ok) || RES[0]; if (typeof openCard === 'function') { try { openCard(r) } catch (e) {} } const b = document.getElementById('opis'); if (!b) return { err: 'brak przycisku' }; try { b.click() } catch (e) {} return { t: window.__opis || '' } });
console.log('opis', JSON.stringify(op));
if (op.err || !/^Działka /.test(op.t)) fail.push('opis działki: ' + JSON.stringify(op));
// Licznik: zostało N przystanków
const lf = await pg.evaluate(() => { trShow(); const e = document.getElementById('trLeft'); const r = e ? e.textContent : ''; trClose(); return r });
console.log('zostało', lf);
if (!/^zostało \d+$/.test(lf)) fail.push('licznik zostało: ' + lf);
// Wróć po 17: sortowanie i kopiowanie numerów
const wo = await pg.evaluate(() => { crmShow(); const o = document.getElementById('wrOld'), c = document.getElementById('wrCp'); if (!o || !c) return { err: 'brak przycisków' }; o.click(); const o2 = document.getElementById('wrOld').textContent; document.getElementById('wrCp').click(); const t = window.__wr; document.getElementById('wrOld').click(); return { o2, t } });
console.log('wr', JSON.stringify(wo));
if (wo.err || !/Najnowsze/.test(wo.o2) || typeof wo.t !== 'string') fail.push('wróć po 17 sort/kopiuj: ' + JSON.stringify(wo));
// Dostępność: każdy przycisk ma nazwę (tekst, aria-label albo title)
const an = await pg.evaluate(() => { try { openCard(RES.find(x => x.ok) || RES[0]); crmShow(); trShow() } catch (e) {} const bad = [...document.querySelectorAll('button')].filter(b => !((b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('title'))).map(b => b.id || b.className || b.outerHTML.slice(0, 60)); return bad });
console.log('bez nazwy', JSON.stringify(an));
if (an.length) fail.push('przyciski bez nazwy: ' + JSON.stringify(an));
// Przypomnienie o kopii: komunikat po celu dnia, bez kopii dziś
const bk = await pg.evaluate(() => { localStorage.setItem('rs:celOk', '""'); localStorage.setItem('rs:bakDay', '""'); localStorage.setItem('rs:cel', '1'); const k = 'rs:u:__bk'; localStorage.setItem(k, JSON.stringify({ trasa: 'byłem', trDay: TODAY(), lab: 'test' })); let msg = ''; const old = window.status; try { window.status = m => { msg = m }; } catch (e) {} dzisUp(); const st = document.getElementById('status'); localStorage.removeItem(k); localStorage.setItem('rs:cel', '10'); localStorage.setItem('rs:celOk', '""'); dzisUp(); return { fn: dzisUp.toString().includes('bakDay'), crm: crmShow.toString().includes("store.set('bakDay'") } });
console.log('kopia', JSON.stringify(bk));
if (!bk.fn || !bk.crm) fail.push('przypomnienie o kopii: ' + JSON.stringify(bk));
// Tryb dzienny
const sun = await pg2.evaluate(() => { const b = document.getElementById('sunBtn'); if (!b) return { err: 'brak' }; b.click(); const on = document.body.classList.contains('sun'); b.click(); return { on, off: !document.body.classList.contains('sun') } });
console.log('sun', JSON.stringify(sun));
if (sun.err || !sun.on || !sun.off) fail.push('Tryb dzienny: ' + JSON.stringify(sun));
// Teren na dziś: z pozycji w Tuliszowie podpowiada obszar z domami
const ter = await pg2.evaluate(async () => { navigator.geolocation.getCurrentPosition = ok => ok({ coords: { latitude: 50.4393, longitude: 19.198 } }); $('#terBtn').click(); await new Promise(r => setTimeout(r, 1500)); const o = document.getElementById('ter'); return o ? { t: o.innerText.slice(0, 160), btn: o.querySelectorAll('[data-s]').length } : null });
console.log('teren', JSON.stringify(ter));
if (!ter || ter.btn < 1) fail.push('Teren na dziś: brak podpowiedzi ' + JSON.stringify(ter));
await b.close(); srv.close();
if (fail.length) { console.error('NIEPOWODZENIE:\n- ' + fail.join('\n- ')); process.exit(1) }
console.log('OK');
