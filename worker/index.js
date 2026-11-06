// Radar Słupów – serwer pośredniczący z pamięcią (Cloudflare Worker).
// Przekazuje zapytania tylko do publicznych usług (ULDK GUGiK, Overpass OSM) i zapamiętuje odpowiedzi.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = { 'User-Agent': 'RadarSlupow/1.0 (github.com/lukaszgajosbusiness-ctrl/Radar-S-up-w)' };

async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('') }
async function cached(ctx, key, ttl, fetcher) {
  const cache = caches.default, req = new Request('https://cache.radar/' + key);
  const hit = await cache.match(req); if (hit) { const r = new Response(hit.body, hit); r.headers.set('X-Radar-Cache', 'HIT'); return r }
  const res = await fetcher(); if (!res.ok) return res;
  const body = await res.arrayBuffer();
  const out = new Response(body, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/plain; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}`, ...CORS } });
  ctx.waitUntil(cache.put(req, out.clone()));
  const r = new Response(body, out); r.headers.set('X-Radar-Cache', 'MISS'); return r;
}


// ---------- konta i rezerwacje (D1) ----------
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');
async function hashPass(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function newSession(db, uid) { const t = rnd(32); await db.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(t, uid, Date.now() + 60 * 864e5).run(); return t }
async function me(db, req) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, ''); if (!t) return null;
  return await db.prepare('SELECT u.id,u.login,u.name,u.role,u.team FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').bind(t, Date.now()).first();
}
const STATUSES = ['', 'do sprawdzenia', 'sprawdzona – pasuje', 'odrzucona', 'kontakt z właścicielem', 'umowa'];
async function api(req, env, url) {
  const db = env.DB; if (!db) return J({ error: 'Baza nie jest podłączona' }, 503);
  const p = url.pathname, m = req.method;
  const body = m === 'POST' ? await req.json().catch(() => ({})) : {};
  if (p === '/api/register' && m === 'POST') {
    const { login, name, password, invite } = body;
    if (!/^[a-z0-9._-]{3,30}$/i.test(login || '') || !(name || '').trim() || (password || '').length < 8) return J({ error: 'Login 3–30 znaków (litery, cyfry), imię i hasło min. 8 znaków.' }, 400);
    const count = (await db.prepare('SELECT COUNT(*) c FROM users').first()).c;
    let role = 'admin', team = 'główny', inv = null;
    if (count === 0 && (!env.BOOTSTRAP || String(invite || '').trim() !== env.BOOTSTRAP)) return J({ error: 'Pierwsze konto (administratora) zakłada się z kodem startowym.' }, 403);
    if (count > 0) {
      inv = await db.prepare('SELECT * FROM invites WHERE code=? AND used_by IS NULL').bind(String(invite || '').trim().toUpperCase()).first();
      if (!inv) return J({ error: 'Nieprawidłowy albo wykorzystany kod zaproszenia.' }, 403);
      role = inv.role; team = inv.team;
    }
    if (await db.prepare('SELECT 1 FROM users WHERE login=?').bind(login.toLowerCase()).first()) return J({ error: 'Taki login już istnieje.' }, 409);
    const salt = rnd(16), pass = await hashPass(password, salt);
    const r = await db.prepare('INSERT INTO users (login,name,pass,salt,role,team,created) VALUES (?,?,?,?,?,?,?)').bind(login.toLowerCase(), name.trim().slice(0, 60), pass, salt, role, team, new Date().toISOString()).run();
    const uid = r.meta.last_row_id;
    if (inv) await db.prepare('UPDATE invites SET used_by=? WHERE code=?').bind(uid, inv.code).run();
    return J({ token: await newSession(db, uid), user: { login: login.toLowerCase(), name: name.trim(), role, team } });
  }
  if (p === '/api/login' && m === 'POST') {
    const u = await db.prepare('SELECT * FROM users WHERE login=?').bind(String(body.login || '').toLowerCase()).first();
    if (!u || await hashPass(String(body.password || ''), u.salt) !== u.pass) { await new Promise(r => setTimeout(r, 600)); return J({ error: 'Zły login lub hasło.' }, 401) }
    return J({ token: await newSession(db, u.id), user: { login: u.login, name: u.name, role: u.role, team: u.team } });
  }
  const u = await me(db, req);
  if (!u) return J({ error: 'Zaloguj się.' }, 401);
  if (p === '/api/me') return J({ user: u });
  if (p === '/api/logout' && m === 'POST') { await db.prepare('DELETE FROM sessions WHERE token=?').bind((req.headers.get('Authorization') || '').slice(7)).run(); return J({ ok: true }) }
  if (p === '/api/invites' && m === 'POST') {
    if (!['admin', 'kierownik'].includes(u.role)) return J({ error: 'Kody wydaje administrator lub kierownik.' }, 403);
    const role = u.role === 'admin' && ['kierownik', 'handlowiec', 'admin'].includes(body.role) ? body.role : 'handlowiec';
    const team = u.role === 'admin' ? String(body.team || u.team).slice(0, 40) : u.team;
    const code = rnd(4).toUpperCase();
    await db.prepare('INSERT INTO invites (code,role,team,created_by,created) VALUES (?,?,?,?,?)').bind(code, role, team, u.id, new Date().toISOString()).run();
    return J({ code, role, team });
  }
  if (p === '/api/reservations' && (m === 'GET' || m === 'POST')) {
    // rezerwacje widoczne dla wszystkich (żeby nie dublować wizyt); notatki zostają na urządzeniu
    const ids = (Array.isArray(body.ids) ? body.ids : (url.searchParams.get('ids') || '').split(',')).map(String).filter(Boolean).slice(0, 3000);
    const now = Date.now(); const out = {};
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const rs = await db.prepare(`SELECT r.parcel_id,r.until,r.status,u.name,u.team,u.id uid FROM reservations r JOIN users u ON u.id=r.user_id WHERE r.until>? AND r.parcel_id IN (${chunk.map(() => '?').join(',')})`).bind(now, ...chunk).all();
      for (const r of rs.results) out[r.parcel_id] = { holder: r.name, team: r.team, mine: r.uid === u.id, until: r.until, status: r.uid === u.id || u.role !== 'handlowiec' ? r.status : undefined };
    }
    return J({ reservations: out });
  }
  if (p === '/api/reserve' && m === 'POST') {
    const pid = String(body.parcel_id || ''); if (!/^\d{6}_\d\.\d{4}\./.test(pid)) return J({ error: 'Zły identyfikator działki.' }, 400);
    const cur = await db.prepare('SELECT r.*,u.name FROM reservations r JOIN users u ON u.id=r.user_id WHERE parcel_id=?').bind(pid).first();
    if (cur && cur.until > Date.now() && cur.user_id !== u.id && u.role === 'handlowiec') return J({ error: `Działka zarezerwowana przez: ${cur.name}.` }, 409);
    if (body.release) { await db.prepare('DELETE FROM reservations WHERE parcel_id=? AND (user_id=? OR ?)').bind(pid, u.id, u.role !== 'handlowiec' ? 1 : 0).run(); return J({ ok: true, released: true }) }
    let owner = u.id;
    if (body.for_user && ['admin', 'kierownik'].includes(u.role)) {
      const t = await db.prepare('SELECT id,team FROM users WHERE id=?').bind(+body.for_user).first();
      if (!t || (u.role === 'kierownik' && t.team !== u.team)) return J({ error: 'Nie możesz przydzielić działki tej osobie.' }, 403);
      owner = t.id;
    }
    const status = STATUSES.includes(body.status) ? body.status : (cur?.status || 'do sprawdzenia');
    const days = Math.min(30, Math.max(1, +body.days || 14)); const until = status === 'umowa' ? Date.now() + 3650 * 864e5 : Date.now() + days * 864e5;
    await db.prepare('INSERT INTO reservations (parcel_id,user_id,label,until,status,updated) VALUES (?,?,?,?,?,?) ON CONFLICT(parcel_id) DO UPDATE SET user_id=excluded.user_id,label=COALESCE(NULLIF(excluded.label,\'\'),reservations.label),until=excluded.until,status=excluded.status,updated=excluded.updated').bind(pid, owner, String(body.label || '').slice(0, 120), until, status, Date.now()).run();
    if (!cur || cur.status !== status) await db.prepare('INSERT INTO events (user_id,parcel_id,status,at) VALUES (?,?,?,?)').bind(owner, pid, status, Date.now()).run();
    return J({ ok: true, until, status });
  }
  if (p === '/api/team-users') {
    if (!['admin', 'kierownik'].includes(u.role)) return J({ error: 'Tylko dla kierownika.' }, 403);
    const rs = await db.prepare(`SELECT id,name,team,role FROM users ${u.role === 'kierownik' ? 'WHERE team=?' : ''} ORDER BY name`).bind(...(u.role === 'kierownik' ? [u.team] : [])).all();
    return J({ users: rs.results });
  }
  if (p === '/api/team-reservations') {
    if (!['admin', 'kierownik'].includes(u.role)) return J({ error: 'Tylko dla kierownika.' }, 403);
    const rs = await db.prepare(`SELECT r.parcel_id,r.label,r.until,r.status,r.updated,u.name,u.team FROM reservations r JOIN users u ON u.id=r.user_id WHERE r.until>? ${u.role === 'kierownik' ? 'AND u.team=?' : ''} ORDER BY r.updated DESC LIMIT 3000`).bind(...(u.role === 'kierownik' ? [Date.now(), u.team] : [Date.now()])).all();
    return J({ reservations: rs.results });
  }
  if (p === '/api/stats') {
    if (!['admin', 'kierownik'].includes(u.role)) return J({ error: 'Tylko dla kierownika.' }, 403);
    const since = Date.now() - (+url.searchParams.get('days') || 30) * 864e5;
    const rows = await db.prepare(`SELECT u.name,u.team,e.status,COUNT(*) n FROM events e JOIN users u ON u.id=e.user_id WHERE e.at>? ${u.role === 'kierownik' ? 'AND u.team=?' : ''} GROUP BY u.id,e.status`).bind(...(u.role === 'kierownik' ? [since, u.team] : [since])).all();
    const users = await db.prepare(`SELECT name,team,role FROM users ${u.role === 'kierownik' ? 'WHERE team=?' : ''}`).bind(...(u.role === 'kierownik' ? [u.team] : [])).all();
    return J({ stats: rows.results, users: users.results });
  }
  return J({ error: 'Nie znaleziono' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname.startsWith('/api/')) return api(request, env, url);
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'radar-slupow', time: new Date().toISOString() }, { headers: CORS });
    if (url.pathname === '/uldk') {
      const req = url.searchParams.get('request') || '';
      if (!/^(GetParcelByXY|GetParcelById|GetParcelByIdOrNr|GetBuildingByXY)$/.test(req)) return new Response('Nieobsługiwane zapytanie', { status: 400, headers: CORS });
      const target = 'https://uldk.gugik.gov.pl/' + url.search;
      return cached(ctx, 'uldk/' + await sha(url.search), 30 * 86400, () => fetch(target, { headers: UA }));
    }
    if (url.pathname === '/overpass' && request.method === 'POST') {
      const body = await request.text();
      if (body.length > 4000) return new Response('Za duże zapytanie', { status: 413, headers: CORS });
      return cached(ctx, 'ov/' + await sha(body), 7 * 86400, async () => {
        for (const h of OVERPASS) { try { const r = await fetch(h, { method: 'POST', body, headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' } }); if (r.ok) return r } catch (e) {} }
        return new Response('Overpass niedostępny', { status: 502, headers: CORS });
      });
    }
    return new Response('Radar Słupów API', { headers: CORS });
  }
};
