/* Meguru Service Worker — キャッシュ戦略 + バージョン更新通知 */
const SW_VERSION = '2.0.0';
const CACHE_NAME = `meguru-v${SW_VERSION}`;

// キャッシュ対象の静的アセット
const PRECACHE_URLS = [
    '/meguru/',
    '/meguru/index.html',
    '/meguru/manifest.json',
    '/meguru/pwa-192x192.png',
    '/meguru/pwa-512x512.png',
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
            // 古いキャッシュを削除
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
            // バージョン更新を全クライアントに通知
            self.clients.matchAll({ type: 'window' }).then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
                });
            })
        ])
    );
});

// Network-first戦略（API呼び出し以外の静的リソースのみキャッシュ）
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API呼び出しやexternal URLはキャッシュしない
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
                // 成功したレスポンスをキャッシュに保存
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // オフライン時はキャッシュから返す
                return caches.match(event.request);
            })
    );
});

// メインスレッドからのメッセージを受信
self.addEventListener('message', (event) => {
    const { type, title, body, icon } = event.data || {};

    if (type === 'GENERATION_COMPLETE') {
        if (self.registration && Notification.permission === 'granted') {
            self.registration.showNotification(title || 'Meguru - コース完成！', {
                body: body || 'コースが完成しました。タップして確認しましょう。',
                icon: icon || '/meguru/pwa-192x192.png',
                tag: 'meguru-generation-complete',
                badge: '/meguru/pwa-192x192.png',
                vibrate: [200, 100, 200],
                requireInteraction: false,
                data: { url: '/meguru/' }
            });
        }
    }

    if (type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 通知クリックでアプリにフォーカス
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/meguru/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if (client.url.includes('/meguru/') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});
