/* Meguru Service Worker Registration */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/meguru/sw.js', { scope: '/meguru/' })
            .then(function(registration) {
                console.log('[SW] Registered:', registration.scope);
            })
            .catch(function(error) {
                console.warn('[SW] Registration failed:', error);
            });
    });
}
