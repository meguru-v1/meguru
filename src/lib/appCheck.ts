// ===== Firebase App Check =====
// プロキシへのリクエストが「本物の Meguru アプリから来たこと」を証明するトークンを取得する。
// Origin ヘッダは詐称できるため、サーバー側の実質的な認証はこのトークンで行う。
//
// 必要な環境変数（未設定ならApp Checkは無効のまま動作する）:
//   VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID / VITE_FIREBASE_APP_ID
//   VITE_RECAPTCHA_SITE_KEY

let tokenProvider: Promise<{ getToken: () => Promise<string | null> } | null> | null = null;

const env = import.meta.env as Record<string, string | undefined>;

const isConfigured = (): boolean =>
    !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID
        && env.VITE_FIREBASE_APP_ID && env.VITE_RECAPTCHA_SITE_KEY);

async function initAppCheck() {
    if (!isConfigured()) return null;
    try {
        const { initializeApp } = await import('firebase/app');
        const { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } =
            await import('firebase/app-check');

        const app = initializeApp({
            apiKey: env.VITE_FIREBASE_API_KEY,
            projectId: env.VITE_FIREBASE_PROJECT_ID,
            appId: env.VITE_FIREBASE_APP_ID,
        });
        const appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY!),
            isTokenAutoRefreshEnabled: true,
        });

        return {
            getToken: async () => {
                try {
                    const result = await getToken(appCheck, false);
                    return result.token;
                } catch (e) {
                    console.warn('[AppCheck] token fetch failed:', e);
                    return null;
                }
            },
        };
    } catch (e) {
        console.warn('[AppCheck] initialization failed:', e);
        return null;
    }
}

/** App Check トークンを含むヘッダを返す。未設定・失敗時は空オブジェクト */
export async function getAppCheckHeaders(): Promise<Record<string, string>> {
    if (!isConfigured()) return {};
    if (!tokenProvider) tokenProvider = initAppCheck();
    const provider = await tokenProvider;
    if (!provider) return {};
    const token = await provider.getToken();
    return token ? { 'X-Firebase-AppCheck': token } : {};
}
