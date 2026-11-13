const C='radar-v72';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','manifest.json','icon.svg','icon-192.png','icon-512.png','data/index.json']).catch(()=>{})))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&k!=='radar-data').map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  // biblioteka mapy z CDN: najpierw pamięć
  if(u.host==='cdnjs.cloudflare.com'||u.host==='fonts.googleapis.com'||u.host==='fonts.gstatic.com'){e.respondWith(caches.match(e.request).then(h=>h||fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r})));return}
  if(u.origin!==location.origin)return;
  // własne pliki i dane obszarów: najpierw sieć, bez sieci pamięć
  const D=u.pathname.includes('/data/')?'radar-data':C;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(D).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})))});
