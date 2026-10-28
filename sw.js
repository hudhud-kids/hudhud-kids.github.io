/* Hudhud service worker: offline shell + push notifications */
const V = 'hh-v3';
const CORE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon-180.png',
  'fonts/dubai-regular.woff2', 'fonts/dubai-medium.woff2', 'fonts/dubai-bold.woff2', 'content/i18n-en.json', 'content/index.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if(r.method !== 'GET') return;
  const u = new URL(r.url); if(u.origin !== location.origin) return;
  const put = res => { if(res && res.ok){ const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; };
  if(r.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname)){
    e.respondWith(fetch(r).then(put).catch(() => caches.match(r).then(m => m || caches.match('index.html')))); return; }
  if(/\/content\//.test(u.pathname)){
    e.respondWith(caches.match(r).then(m => { const net = fetch(r).then(put).catch(() => m); return m || net; })); return; }
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
