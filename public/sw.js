/* Meguru Service Worker — バックグラウンド通知対応 */
const SW_VERSION = '1.0.0';

self.addEventListener('install', (event) => {
    console.log(`[SW] Install v${SW_VERSION}`);
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log(`[SW] Activate v${SW_VERSION}`);
    event.waitUntil(self.clients.claim());
});

// メインスレッドからのメッセージを受信
self.addEventListener('message', (event) => {
    const { type, title, body, icon } = event.data || {};

    if (type === 'GENERATION_COMPLETE') {
        // 通知を表示
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
});

// 通知クリックでアプリにフォーカス
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/meguru/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            // 既に開いているタブがあればフォーカス
            for (const client of clients) {
                if (client.url.includes('/meguru/') && 'focus' in client) {
                    return client.focus();
                }
            }
            // なければ新しいタブで開く
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});
