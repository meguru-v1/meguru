# Meguru - あなたのための、特別なよりみち

AIがあなた好みの散策コースを提案する、次世代の旅行プランニング・プロトタイプ。

## 🌟 コンセプト
「目的地への最短距離」ではなく、**「その道中の発見と感動」**を主役に。
Googleマップでは見つけられない、あなたの気分や天気に合わせた「よりみち」をAIコンシェルジュが提案します。

## 🚀 主要機能
- **AIスマートコース生成**: Gemini APIを活用し、時間・天気・気分に最適化された旅程を作成。
- **6人のAIガイド（ペルソナ）**: 個性豊かなガイドが独自の視点で街を案内。
- **リミックス機能**: 生成されたコースに「わがまま」を伝えて自分好みに再構成。
- **ルートよりみち検索**: A地点からB地点への移動を一つの旅に変える独自ロジック。
- **PWA対応**: インストール可能、バックグラウンド生成通知、オフラインキャッシュ。

## 🛠 技術スタック
- **Frontend**: React 19, Vite, Tailwind CSS (Vanilla CSS Utility)
- **AI**: Google Gemini API (`2.5-flash-lite` / `2.5-flash` 動的切替)
- **Map**: Google Places API, React Google Maps (@vis.gl/react-google-maps)
- **Infrastructure**: GitHub Actions (CI/CD), GitHub Pages

## 📦 セットアップ
1. リポジトリをクローン
2. `npm install`
3. `.env` ファイルを作成し、以下のAPIキーを設定
   - `VITE_GEMINI_API_KEY`: Google AI Studioから取得
   - `VITE_GOOGLE_MAPS_API_KEY`: Google Cloud Consoleから取得
4. `npm run dev` で開発サーバー起動
5. `npm run build` で本番ビルド生成

---
Meguru is a prototype for an AI-powered travel assistant that focuses on the joy of detours.
