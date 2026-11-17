/* Hudhud service worker: offline shell + push notifications */
const V = 'hh-v25';
const CORE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon-180.png',
  'nosleep.mp4', 'fonts/dubai-regular.woff2', 'fonts/dubai-medium.woff2', 'fonts/dubai-bold.woff2', 'content/i18n-en.json', 'content/index.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if(r.method !== 'GET') return;
  const u = new URL(r.url); if(u.origin !== location.origin) return;
  if(u.pathname.endsWith('/version.json')) return; // version checks always go to the network and are never stored
  const put = res => { if(res && res.ok){ const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; };
  if(r.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname)){
    // network first, but a hanging connection (weak Wi-Fi) falls back to the cached shell after 4 s instead of a blank screen
    const cached = () => caches.match(r).then(m => m || caches.match('index.html'));
    e.respondWith(new Promise(done => { let over = false;
      const t = setTimeout(() => cached().then(m => { if(m && !over){ over = true; done(m); } }), 4000);
      fetch(r).then(put).then(res => { clearTimeout(t); if(!over){ over = true; done(res); } })
        .catch(() => { clearTimeout(t); cached().then(m => { if(!over){ over = true; done(m || Response.error()); } }); }); })); return; }
  // lessons and placement banks: network first, so an edited lesson reaches the child on the very next visit (cache-first showed
  // it only on the second one); a slow or missing connection falls back to the cached copy after 2.5 s
  if(/\/content\//.test(u.pathname)){
    e.respondWith(caches.match(r).then(m => { const net = fetch(r).then(put);
      if(!m) return net;
      return Promise.race([net.catch(() => m), new Promise(res => setTimeout(() => res(m), 2500))]); })); return; }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(put)));
});
self.addEventListener('push', e => {
  let d = {}; try{ d = e.data ? e.data.json() : {}; }catch(err){ d = {title:'هدهد', body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'هدهد', {body:d.body || '', icon:'icon-192.png', badge:'icon-192.png', tag:d.tag || undefined, data:{url:d.url || './'}, lang:'ar', dir:'rtl'}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(cs => { for(const c of cs){ if('focus' in c) return c.focus(); } return self.clients.openWindow(url); }));
});
