import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { APIProvider } from '@vis.gl/react-google-maps'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <APIProvider apiKey={API_KEY} language="ja">
                <App />
            </APIProvider>
        </ErrorBoundary>
    </StrictMode>,
)
