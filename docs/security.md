# セキュリティ構成

## 全体像

```
ブラウザ (静的SPA)
  ├─ Maps JavaScript API ── VITE_GOOGLE_MAPS_API_KEY（地図表示のみ・リファラ制限必須）
  └─ APIプロキシ (Cloud Functions)
       ├─ Gemini API        ── GEMINI_API_KEY
       └─ Places / Routes / Geocoding / 写真 / StreetView ── GOOGLE_MAPS_API_KEY
```

**原則: 課金対象APIのキーはクライアントに置かない。** 唯一の例外は Maps JavaScript API
（仕様上ブラウザに露出する）で、これは HTTP リファラ制限で保護する。

## クライアント側の環境変数

| 変数 | 必須 | 用途 |
|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | ○ | 地図表示のみ。**Maps JavaScript API だけに API 制限**し、リファラ制限を設定する |
| `VITE_API_PROXY_URL` | ○ | プロキシのベースURL |
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` / `VITE_RECAPTCHA_SITE_KEY` | － | App Check。4つ揃った時のみ有効化される |

## サーバー側（Cloud Functions）の環境変数

| 変数 | 必須 | 用途 |
|---|---|---|
| `GEMINI_API_KEY` | ○ | Gemini |
| `GOOGLE_MAPS_API_KEY` | ○ | Places/Routes/Geocoding/写真。リファラ制限は付けず、**API制限**で必要なAPIのみ許可する |
| `REQUIRE_APP_CHECK` | 推奨 | `true` で App Check 必須。本番では有効にする |
| `ALLOW_LOCALHOST` | － | `true` で localhost オリジンを許可（**開発時のみ**） |
| `RATE_LIMIT_MAX` | － | 1分あたりのリクエスト上限（既定60） |

## 多層防御の内訳

1. **App Check**（実質的な認証）— `REQUIRE_APP_CHECK=true` で有効。
   Origin ヘッダは非ブラウザクライアントから詐称できるため、これが唯一の本物の認証。
2. **Origin / Referer 照合** — ブラウザ経由の誤用防止。認証ではない。
3. **レート制限** — LB が付与する信頼できる IP（`X-Forwarded-For` の末尾から2番目）をキーにする。
4. **入力検証** — `lib/validate.js` で全リクエストの型・範囲を検証。クライアントのボディを
   Google API へ素通ししない。FieldMask はサーバー固定（課金フィールドを選ばせない）。
5. **CSP ほかセキュリティヘッダ** — `vercel.json` で配信。
6. **共有URLの検証** — `sanitizeSharedCourse()` が第三者製のペイロードを正規化する。
7. **画像URLの allowlist** — `safeImageUrl()` / `safePhotoRef()`。

## App Check の有効化手順

1. Firebase コンソールでプロジェクトに Web アプリを登録
2. App Check → reCAPTCHA Enterprise プロバイダを登録し、サイトキーを取得
3. フロント側に `VITE_FIREBASE_*` と `VITE_RECAPTCHA_SITE_KEY` を設定してデプロイ
4. 動作確認（App Check の「未検証リクエスト」メトリクスが0になるのを待つ）
5. Cloud Functions に `REQUIRE_APP_CHECK=true` を設定してデプロイ

**順序が重要**: 5 を先に行うと、App Check 未対応のクライアントが全て 401 になる。

## 運用上の注意

- GCP 側で **予算アラートと API 割り当て上限** を必ず設定する（キー漏洩時の被害上限）。
- キーをローテーションする際は、地図表示用とサーバー用を**別のキー**として発行する。
- `.env` はコミットしない（`.gitignore` 済み）。
