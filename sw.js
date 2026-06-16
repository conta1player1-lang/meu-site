/* Service Worker — A.V. Leitura em Foco */
const CACHE = 'av-leitura-v1';
const ASSETS = [
    '/', '/index.html',
    '/main.css', '/componentes.css', '/temas.css',
    '/animacoes.css', '/dark-overrides.css', '/responsivo.css',
    '/app.js', '/usuarios.js', '/supabase.js', '/relatorios.js',
    '/atividades.js', '/rotinas.js', '/configuracoes.js',
    '/mensagens.js', '/loading.js', '/notifications.js',
    '/manifest.json', '/icon-192.svg', '/icon-512.svg'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('supabase.co')) return; /* não cacheia API */
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
