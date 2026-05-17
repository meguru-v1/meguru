# Meguru 改善ロードマップ

最終更新: 2026-05-17

家族で使ってる現フェーズの「品質UP系」改善プラン。公開準備は別途。

## ✅ 実装済み（2026-05-17）
- **#7 履歴機能**: `src/lib/history.ts`, `src/components/HistorySection.tsx`, App.tsx で自動push & 検索画面上部に表示
- **#5 天候連動強化**: `weather.ts` に WeatherTag 追加、`places.ts` に inferIsIndoor、`gemini.ts` に天候厳守ルール
- **#2 営業時間考慮**: `gemini.ts` に checkOpenStatus、候補リストに ✅/❌ バッジ、訪問日時情報をプロンプトに反映

---

## 🎯 現在のフェーズ

- **ユーザー**: 家族 2〜3 人
- **月額コスト**: 約 ¥850（誤差レベル）
- **方針**: コスト最適化より品質UPに振る期間
- **公開予定**: 未定（公開を意識し始めたら別途「公開準備プラン」発動）

---

## 📋 着手予定の3案

### 着手順
1. **#7 履歴機能** （リスクゼロ、即効性高）
2. **#5 天候連動強化** （雨の日に劇的）
3. **#2 営業時間考慮** （外れ防止、最重要だが工数大）

---

## 案1 ─ #7 コース履歴の自動保存

### 目的
「あのコースもう一回見たい」を解決。お気に入りより低ハードル。

### データ設計

```ts
// localStorage キー: meguru:history:v1
type HistoryEntry = {
  id: string;              // course の hash か uuid
  course: Course;
  query: string;           // 「京都駅 / 雅 / 半日」表示用ラベル
  viewedAt: number;        // unix ms
  thumbnailUrl?: string;
};

type HistoryStore = {
  version: 1;
  entries: HistoryEntry[];  // 最新が先頭、上限20件
};
```

### 変更ファイル

- **`src/lib/history.ts`** （新規）
  - `pushHistory(course, query)` / `getHistory()` / `removeHistory(id)` / `clearHistory()`
  - 同じ course ID は既存削除→先頭挿入で重複防止
- **`src/App.tsx`**
  - コース表示画面遷移時に `useEffect` で自動 push
- **`src/components/SearchInterface.tsx`** （or 新規 `HistorySection.tsx`）
  - 検索フォーム下に「最近見たコース」セクション
  - 横スクロール式カード（モバイル親和性高）
  - カード: サムネ / タイトル / 日付 / × 削除
  - タップで `setSelectedCourse(entry.course)` 復元
  - 履歴ゼロ件なら非表示

### 工数: 2〜3時間
### 効果: 再訪率UP。家族間の「あれ見せて」が一発
### コスト影響: ¥0（localStorage完結）

---

## 案2 ─ #5 天候連動の強化

### 目的
雨の日に屋外スポット、猛暑日に日向公園、を AI が選ばない状態。

### 現状確認事項
- `getCurrentWeather` は呼ばれているが、プロンプトへの反映が弱い疑い
- スポット候補側に屋内/屋外フラグなし

### 変更ファイル

- **`src/lib/weather.ts`**
  - 天候結果に `conditionTag` を付与
  - `rainy` / `snowy` / `hot`(>30°C) / `cold`(<5°C) / `normal`
  - 数値よりタグの方が AI が素直に従う

- **`src/lib/places.ts`**
  - `types` から `isIndoor` を推定するヘルパー追加
  ```ts
  const INDOOR_TYPES = ['museum','library','aquarium','art_gallery',
    'shopping_mall','cafe','restaurant','book_store','spa'];
  const OUTDOOR_TYPES = ['park','tourist_attraction','natural_feature',
    'campground','zoo','garden'];
  ```
  - 各候補スポットに `isIndoor?: boolean | null` を持たせる

- **`src/lib/gemini.ts`**
  - プロンプト先頭に**天候ブロック**を追加
    ```
    【現在の天候】
    - 状況: 雨（rainy）
    - 気温: 18°C
    
    【天候による必須ルール】
    - 雨天: 屋内スポットのみ選択。屋外公園・展望台は除外
    - 猛暑(>30°C): 日陰・冷房ありを優先
    - 寒波(<5°C): 屋内・温泉・温かい食事を優先
    ```
  - 候補スポットシリアライズに `[屋内]` / `[屋外]` バッジ追加

### 工数: 1.5〜2時間
### 効果: 雨の日体験が激変。外れ案の質的下限を底上げ
### コスト影響: ¥0

---

## 案3 ─ #2 営業時間考慮

### 目的
月曜定休の美術館、夜閉まる寺などをAIが選ばない。「行ったら閉まってた」体験ゼロへ。

### コスト注意
- New Places API は **field ごとに SKU 課金**
- `regularOpeningHours` は **Enterprise SKU ($25/1000)**
- 全候補に付けると痛い → **上位候補のみ Details 叩く** 戦略

### 変更ファイル

- **`src/lib/places.ts`**
  - 新関数 `enrichWithOpeningHours(spots, topN=15)`
  - 距離・評価で**上位15件のみ**に絞り Place Details で `regularOpeningHours.weekdayDescriptions` 取得
  - 並列フェッチ（Promise.all）
  ```ts
  async function enrichWithOpeningHours(
    spots: Spot[], 
    topN = 15
  ): Promise<Spot[]> {
    const top = spots.slice(0, topN);
    const rest = spots.slice(topN);
    const enriched = await Promise.all(top.map(async s => {
      const hours = await fetchOpeningHours(s.place_id);
      return { ...s, openingHours: hours };
    }));
    return [...enriched, ...rest];
  }
  ```

- **`src/lib/gemini.ts`**
  - 訪問日時をプロンプトに渡す
    ```
    【訪問予定】
    - 日付: 2026-05-20（火曜日）
    - 時間帯: 10:00 〜 18:00
    ```
  - 候補シリアライズに営業時間情報＋訪問可否バッジ
    ```
    [寺院A] 評価4.6 / 火曜定休 / 営業 09:00-17:00 ❌訪問時刻に閉店
    [美術館B] 評価4.4 / 火曜10:00-20:00 ✅訪問時刻に営業中
    ```
  - 厳守ルール追加: 「❌表示のスポットは絶対に選ばない」

- **`src/App.tsx`**
  - 検索パラメータに `searchDate` を確認・追加
  - `daysCount` がある場合は Day1, Day2 それぞれ曜日計算

### 工数: 3〜4時間
### 効果: 「閉まってた」事故ゼロ。質的に最も大きい改善
### コスト影響: 月 ¥100〜200（30検索 × 15候補 × Details単価）

---

## 🚫 今はやらないと決めた施策（理由付き）

### コスト最適化系
- **クロスユーザーキャッシング**: ユーザー2-3人だと重複ほぼ無し
- **Cloud Function ウォームアップ (min-instances=1)**: 月数十回しか叩かれない
- **Session Token**: コスト影響小、公開時に入れれば十分
- **Field Mask 監査**: 公開時に入れれば十分

### 公開準備系
- **API キー悪用対策＋予算アラート**: 公開意識し始めた時に最優先で
- **プライバシーポリシー / 利用規約**: 公開前必須
- **エラートラッキング (Sentry)**: 公開前推奨
- **OGP動的生成**: シェアされ始める前に
- **アナリティクス**: 公開直前
- **PWAインストールバナー**: 公開時のリテンション施策
- **オンボーディング**: 公開時の離脱率対策

---

## 📌 メモ

- `getCurrentWeather` の現状実装は要確認（案2着手時）
- `searchDate` パラメータの有無も要確認（案3着手時）
- 着手時は本ドキュメントを起点に Plan モードで再検討してOK
