import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { APIProvider } from '@vis.gl/react-google-maps'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// キャッシュ破りのためのバージョン管理
const APP_VERSION = '1.0.3'; // 修正ごとにカウントアップ
const storedVersion = localStorage.getItem('meguru_app_version');

if (storedVersion !== APP_VERSION) {
    localStorage.setItem('meguru_app_version', APP_VERSION);
    // 初回または更新時にクエリパラメータを付与してリロードし、
    // index.html のブラウザキャッシュを回避させる
    const url = new URL(window.location.href);
    url.searchParams.set('v', APP_VERSION);
    window.location.replace(url.toString());
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <APIProvider apiKey={API_KEY} language="ja">
                <App />
            </APIProvider>
        </ErrorBoundary>
    </StrictMode>,
)
