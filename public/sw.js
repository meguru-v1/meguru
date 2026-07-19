/* Meguru Service Worker — キャッシュ戦略 + バージョン更新通知 */
const SW_VERSION = '2.1.0';
const CACHE_NAME = `meguru-v${SW_VERSION}`;

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/pwa-192x192.png',
    '/pwa-512x512.png',
];

self.addEventListener('install', (event) => {
    console.log(`[SW] Install v${SW_VERSION}`);
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_URLS).catch((err) => {
                console.warn('[SW] Precache failed (non-critical):', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log(`[SW] Activate v${SW_VERSION}`);
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('meguru-') && name !== CACHE_NAME)
                        .map((name) => {
                            console.log(`[SW] Deleting old cache: ${name}`);
                            return caches.delete(name);
                        })
                );
            }),
            self.clients.claim(),
            self.clients.matchAll({ type: 'window' }).then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
                });
            })
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (
        url.origin !== self.location.origin ||
        url.pathname.includes('/v1/') ||
        url.pathname.includes('/api/') ||
        event.request.method !== 'GET'
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

self.addEventListener('message', (event) => {
    // 同一オリジンのクライアントからのメッセージのみ受け付ける
    if (event.origin && event.origin !== self.location.origin) return;

    const { type, title, body } = event.data || {};

    // 通知本文は長さを制限し、アイコンはメッセージ側から指定させない（固定のローカル資産のみ）
    const clamp = (v, max) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);

    if (type === 'GENERATION_COMPLETE') {
        if (self.registration && Notification.permission === 'granted') {
            self.registration.showNotification(clamp(title, 100) || 'Meguru - コース完成！', {
                body: clamp(body, 200) || 'コースが完成しました。タップして確認しましょう。',
                icon: '/pwa-192x192.png',
                tag: 'meguru-generation-complete',
                badge: '/pwa-192x192.png',
                vibrate: [200, 100, 200],
                requireInteraction: false,
                data: { url: '/' }
            });
        }
    }

    if (type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});
