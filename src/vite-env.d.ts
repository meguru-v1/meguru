/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GOOGLE_MAPS_API_KEY: string;
    readonly VITE_GEMINI_API_KEY: string;
    readonly VITE_MAP_ID?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
