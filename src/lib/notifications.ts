// 生成完了通知 (ServiceWorker経由)
export async function sendCompletionNotification(title: string, coursesCount: number): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({
            type: 'GENERATION_COMPLETE',
            title: 'Meguru - コース完成！',
            body: `「${title}」を含む${coursesCount > 0 ? coursesCount : ''}コースが完成しました。`,
            icon: '/pwa-192x192.png',
        });
    } catch (e) {
        console.warn('SW notification failed:', e);
    }
}

// 初回インタラクション時に通知許可をリクエスト。クリーンアップ関数を返す
export function requestNotificationPermissionOnFirstInteraction(): () => void {
    if (!('Notification' in window) || Notification.permission !== 'default') {
        return () => { /* nothing */ };
    }
    const requestOnInteraction = () => {
        Notification.requestPermission();
        document.removeEventListener('click', requestOnInteraction);
        document.removeEventListener('touchstart', requestOnInteraction);
    };
    document.addEventListener('click', requestOnInteraction, { once: true });
    document.addEventListener('touchstart', requestOnInteraction, { once: true });
    return () => {
        document.removeEventListener('click', requestOnInteraction);
        document.removeEventListener('touchstart', requestOnInteraction);
    };
}
