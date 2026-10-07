/* Service worker: permite abrir la app sin internet y acelera la carga.
   - Archivos propios y librerías: se guardan al primer uso.
   - Página principal: busca la versión nueva en la red y, si no hay internet, usa la guardada.
   - No toca las conexiones a Firebase (base de datos y cuentas). */
const VERSION='pollo-pos-2.0.0';
const PRECACHE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png',
 'vendor/fa/css/all.min.css','vendor/fa/webfonts/fa-solid-900.woff2','vendor/fa/webfonts/fa-regular-400.woff2',
 'vendor/inter/inter.css','vendor/inter/inter-latin-400-normal.woff2','vendor/inter/inter-latin-500-normal.woff2','vendor/inter/inter-latin-600-normal.woff2','vendor/inter/inter-latin-700-normal.woff2',
 'vendor/firebase/firebase-app-compat.js','vendor/firebase/firebase-database-compat.js','vendor/firebase/firebase-auth-compat.js'];
const CDN_HOSTS=['cdnjs.cloudflare.com','cdn.jsdelivr.net','www.gstatic.com'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>Promise.all(PRECACHE.map(u=>c.add(u).catch(()=>{})))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('pollo-pos-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.protocol!=='http:'&&url.protocol!=='https:')return;
 const mine=url.origin===self.location.origin,cdn=CDN_HOSTS.includes(url.hostname);
 if(!mine&&!cdn)return;
 if(req.mode==='navigate'){
  e.respondWith((async()=>{const cache=await caches.open(VERSION);
   try{const res=await Promise.race([fetch(req),new Promise((_,rj)=>setTimeout(()=>rj(new Error('lento')),4000))]);
    if(res&&res.ok){cache.put('index.html',res.clone())}return res}
   catch(err){return (await cache.match('index.html'))||(await cache.match('./'))||Response.error()}})());return}
 e.respondWith((async()=>{const cache=await caches.open(VERSION);const hit=await cache.match(req);
  const net=fetch(req).then(res=>{if(res&&(res.ok||res.type==='opaque'))cache.put(req,res.clone());return res}).catch(()=>null);
  return hit||(await net)||Response.error()})())});
