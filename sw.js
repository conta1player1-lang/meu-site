/* Service Worker — A.V. Leitura em Foco v3 */
const CACHE = 'av-leitura-v26';
const ASSETS = [
    '/index.html',
    '/main.css', '/componentes.css', '/temas.css',
    '/animacoes.css', '/dark-overrides.css', '/responsivo.css',
    '/app.js', '/usuarios.js', '/supabase.js', '/relatorios.js',
    '/atividades.js', '/rotinas.js', '/configuracoes.js',
    '/mensagens.js', '/loading.js', '/notifications.js',
    '/frequencia.js', '/frequencia.css',
    '/manifest.json',
    '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'
];

self.addEventListener('install', e => {
    self.skipWaiting(); /* força ativação imediata */
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(ASSETS))
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        /* Remove TODOS os caches antigos (av-leitura-v1, v2, etc) */
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => {
                console.log('[SW] Deletando cache antigo:', k);
                return caches.delete(k);
            }))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('supabase.co')) return;
    if (e.request.url.includes('googleapis.com')) return;
    if (e.request.url.includes('cdnjs.cloudflare.com')) return;
    if (e.request.url.includes('jsdelivr.net')) return;
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
/* v4 — force cache refresh */
