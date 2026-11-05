// Radar Słupów – serwer pośredniczący z pamięcią (Cloudflare Worker).
// Przekazuje zapytania tylko do publicznych usług (ULDK GUGiK, Overpass OSM) i zapamiętuje odpowiedzi.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
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
