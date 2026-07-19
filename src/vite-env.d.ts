/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Maps JavaScript API（地図表示）専用。HTTPリファラ制限を必ず設定すること */
    readonly VITE_GOOGLE_MAPS_API_KEY: string;
    readonly VITE_MAP_ID?: string;

    /** APIプロキシ（Cloud Functions）のベースURL */
    readonly VITE_API_PROXY_URL?: string;
    /** 旧名。VITE_API_PROXY_URL 未設定時のフォールバック */
    readonly VITE_GEMINI_PROXY_URL?: string;

    /** Firebase App Check（全て設定された場合のみ有効化される） */
    readonly VITE_FIREBASE_API_KEY?: string;
    readonly VITE_FIREBASE_PROJECT_ID?: string;
    readonly VITE_FIREBASE_APP_ID?: string;
    readonly VITE_RECAPTCHA_SITE_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
