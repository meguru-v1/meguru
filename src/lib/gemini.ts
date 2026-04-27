import type { Spot, Course, PersonaId, ExploreMode } from '../types';
import { getSeasonalPromptContext } from './seasonal';

// Cloud Functions エンドポイント（Gemini APIキーはサーバー側で管理）
const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL as string || 'https://asia-northeast1-project-6f8c0b7f-7452-4e63-a48.cloudfunctions.net/gemini-proxy';

// Cloud Functions 経由でAI生成を実行
const callGeminiProxy = async (prompt: string, model: string, jsonMode: boolean = false): Promise<string> => {
    const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, jsonMode }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const err = new Error(errorData.error || `Proxy error: ${response.status}`) as any;
        err.status = response.status;
        throw err;
    }
    const data = await response.json();
    return data.text;
};


// 待機用
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// <thinking>ブロックの除去（Gemini 2.5系が出力することがある）
const stripThinkingBlock = (text: string): string => {
    return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
};

// モデル別最終リクエスト時刻管理
const lastRequestTimes: Record<string, number> = {
    "gemini-2.5-flash-lite": 0,
    "gemini-2.5-flash": 0
};

// レート制限待機用
const waitRateLimit = async (modelName: string, intervalMs: number) => {
    const now = Date.now();
    const elapsed = now - (lastRequestTimes[modelName] || 0);
    if (elapsed < intervalMs) {
        const wait = intervalMs - elapsed;
        console.log(`[RateLimit] Waiting ${wait}ms for model: ${modelName}`);
        await sleep(wait);
    }
    lastRequestTimes[modelName] = Date.now();
};

// ===== ペルソナ定義 =====
const PERSONA_INSTRUCTIONS: Record<PersonaId, { label: string; kanji: string; systemPrompt: string }> = {
    miyabi: {
        label: 'コンシェルジュ', kanji: '雅',
        systemPrompt: `あなたは「雅のコンシェルジュ」です。伝統と格式を重んじる最高品質の案内人として振る舞ってください。
語り口は上品で落ち着き、王道の名所の「知られざる一流の魅力」を丁寧に紐解きます。
好む語彙: 「風格」「佇まい」「格別」「趣深い」「洗練」`
    },
    shiki: {
        label: 'ストーリーテラー', kanji: '識',
        systemPrompt: `あなたは「識のストーリーテラー」です。千年の記憶を紐解く歴史家として振る舞ってください。
街の由来、伝説、歴史の裏側をドラマチックに語ります。石碑の一文字、地名の響きにすら物語を見出します。
好む語彙: 「悠久」「礎」「刻まれた」「かつて」「伝承」`
    },
    ei: {
        label: 'フォトグラファー', kanji: '映',
        systemPrompt: `あなたは「映のフォトグラファー」です。一瞬の美を切り取る蒐集家として振る舞ってください。
光の角度、構図、最高の撮影タイミングを具体的に提案します。「何時の光が最も美しいか」を常に意識します。
好む語彙: 「斜光」「構図」「逆光」「黄金比」「シャッターチャンス」`
    },
    aji: {
        label: 'エピキュリアン', kanji: '味',
        systemPrompt: `あなたは「味のエピキュリアン」です。五感を刺激する美食の旅人として振る舞ってください。
隠れた名店、地元民しか知らない味、その土地の食文化の深層を探求します。匂いと食感の描写を重視します。
好む語彙: 「芳醇」「口福」「土地の記憶」「香ばしい」「滋味」`
    },
    sei: {
        label: 'ナビゲーター', kanji: '静',
        systemPrompt: `あなたは「静のナビゲーター」です。喧騒を離れ心を整える案内人として振る舞ってください。
人混みを避け、静かな路地裏や寺院、隠れた公園で自分を見つめ直す旅を提案します。「呼吸が深くなる場所」を選びます。
好む語彙: 「静寂」「木漏れ日」「一息」「余白」「調和」`
    },
    un: {
        label: 'アドバイザー', kanji: '運',
        systemPrompt: `あなたは「運のアドバイザー」です。福を呼び込むパワースポット専門家として振る舞ってください。
運気が上がる神社仏閣、祈りの作法、良い気が流れる場所を専門にガイドします。心身を整える旅を提案します。
好む語彙: 「御利益」「気脈」「浄化」「導き」「神徳」`
    }
};

const getPersonaPrompt = (persona?: PersonaId): string => {
    if (!persona || !PERSONA_INSTRUCTIONS[persona]) return '';
    const p = PERSONA_INSTRUCTIONS[persona];
    return `\n**【AIガイド・ペルソナ: 【${p.kanji}】${p.label}】**\n${p.systemPrompt}\n上記のペルソナの口調・視点・専門用語で、すべての説明文（aiDescription, must_see, pro_tip, trivia）を書いてください。\n`;
};

// ===== ジャンル別滞在時間推定 =====
const getStayTimeByType = (category: string): number => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('museum') || cat.includes('art_gallery') || cat.includes('aquarium') || cat.includes('zoo')) return 90;
    if (cat.includes('park') || cat.includes('garden') || cat.includes('botanical')) return 60;
    if (cat.includes('temple') || cat.includes('shrine') || cat.includes('church')) return 45;
    if (cat.includes('castle') || cat.includes('palace') || cat.includes('monument')) return 60;
    if (cat.includes('cafe') || cat.includes('bakery') || cat.includes('ice_cream')) return 30;
    if (cat.includes('restaurant') || cat.includes('meal_delivery') || cat.includes('bar')) return 60;
    if (cat.includes('store') || cat.includes('shop') || cat.includes('market') || cat.includes('mall')) return 40;
    if (cat.includes('theater') || cat.includes('stadium') || cat.includes('cinema')) return 120;
    if (cat.includes('spa') || cat.includes('onsen') || cat.includes('hot_spring')) return 90;
    if (cat.includes('beach') || cat.includes('waterfall') || cat.includes('scenic')) return 45;
    return 40; // デフォルト
};

// 【08】 3モード分離テンプレート
const getExploreModeTemplate = (mode?: ExploreMode): string => {
    switch (mode) {
        case 'quick':
            return `
**【探索モード: クイック散策】**
- 短時間で楽しめる軽いコースを作成してください。
- スポット数は控えめに。移動距離を最小限にし、密度より「一つ一つをゆっくり味わう」ことを重視。
- 重たい食事よりカフェや軽食を優先してください。`;
        case 'fullday':
            return `
**【探索モード: 1日トラベル】**
- 朝から夕方まで充実した1日プランを作成してください。
- ランチは必ず1件含めること。午前・午後で異なるテーマの体験を織り交ぜてください。
- 休憩スポット（カフェ等）を午後に1件入れてバランスを取ってください。`;
        case 'multiday':
            return `
**【探索モード: 連泊プラン】**
- 複数日にわたる壮大な旅程を作成してください。
- 1日あたり8〜10時間の活動時間を想定し、各日に明確なテーマを設けてください。
- 各日の最初と最後はホテル/宿泊施設周辺に戻れる配慮をしてください。
- 日ごとにエリアを変え、効率的な移動を心がけてください。`;
        default:
            return '';
    }
};

// 【07】 モデル動的選択
const selectModel = (durationMinutes: number): string => {
    // 3時間以下の散策 → flash-lite（高速・低コスト）
    // それ以上 → flash（リッチなプロンプト処理能力）
    return durationMinutes <= 180 ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
};

const getDiningRule = (durationMinutes: number) => {
    if (durationMinutes <= 90) {
        return `- **食事・カフェの制限**: 各コースにおいて **最大1件** まで。サクッと立ち寄れるカフェや軽食を含めてください。`;
    } else if (durationMinutes <= 180) {
        return `- **食事・カフェの制限**: 各コースにおいて **最大2件（必ず1件は含める）**。体験をメインに据えつつ、美味しい休憩スポットを確保。`;
    } else if (durationMinutes <= 300) {
        return `- **食事・カフェの制限**: 各コースにおいて **必ず1〜2件含める**。ランチとカフェなど、観光の合間に名物を楽しんで。`;
    } else {
        return `- **食事・カフェの制限**: 各コースにおいて **必ず2〜3件含める**。ランチやディナー、休憩カフェなど、長旅に見合った食事体験を。`;
    }
};

const getRecommendedSpotCount = (durationMinutes: number) => {
    if (durationMinutes <= 90) return `**1〜2件**`;
    if (durationMinutes <= 180) return `**2〜3件**`;
    if (durationMinutes <= 300) return `**3〜4件**`;
    return `**4〜5件**`;
};

export const generateSmartCourses = async (
    candidates: Spot[],
    center: { lat: number; lon: number },
    durationMinutes: number,
    timeContext: string = "不明",
    weatherContext: string = "不明",
    mood: string = "不明",
    budget: string = "不明",
    groupSize: string = "不明",
    userPreferenceContext: string = "",
    persona?: PersonaId,
    exploreMode?: ExploreMode
): Promise<Course[]> => {
    // ===== #1: 候補品質フィルタ + #8: 距離ソート =====
    const qualityFiltered = candidates
        .filter(s => {
            // 閉業済みを除外
            if ((s as any).business_status === 'CLOSED_PERMANENTLY') return false;
            // 評価がある場合、★3.5未満を除外（評価なしは許可）
            if (s.rating && s.rating < 3.5) return false;
            return true;
        })
        .map(s => {
            // 中心からの距離を計算
            const dx = (s.lat - center.lat) * 111000;
            const dy = (s.lon - center.lon) * 111000 * Math.cos(center.lat * Math.PI / 180);
            return { spot: s, dist: Math.sqrt(dx * dx + dy * dy) };
        })
        .sort((a, b) => a.dist - b.dist) // 近い順
        .slice(0, 60) // 最大60件に絞る
        .map(item => item.spot);

    // ===== #2: トークン圧縮した候補リスト =====
    const candidateList = qualityFiltered.map((s, i) => {
        const details = [
            s.category,
            s.rating ? `★${s.rating}` : null,
            s.price_level ? `Price:${'\u00a5'.repeat(s.price_level)}` : null,
            s.editorial_summary ? `Info:${s.editorial_summary.substring(0, 30)}` : null,
            `Stay:${s.estimatedStayTime || getStayTimeByType(s.category)}min`
        ].filter(Boolean).join(', ');
        return `ID ${i}: ${s.name} (${details})`;
    }).join('\n');

    const diningRule = getDiningRule(durationMinutes);
    const spotCountRule = getRecommendedSpotCount(durationMinutes);
    const personaPrompt = getPersonaPrompt(persona);
    const exploreModeTemplate = getExploreModeTemplate(exploreMode);

    const allThemes = [
        "🕰️ Time Travel: 時代を感じる歴史旅",
        "🌿 Nature's Whisper: 静寂と緑",
        "🏙️ Urban Jungle: 都会の喧騒と魅力を歩く",
        "⛩️ Spiritual Awakening: 神社仏閣とパワースポット",
        "🎨 Art & Soul: アートとクリエイティブ",
        "💎 Hidden Gems: 地元民しか知らない穴場",
        "📸 Photogenic: 思わず写真を撮りたくなる風景",
        "☕ Retro Revival: 昭和レトロな純喫茶・路地裏",
        "✨ Luxury & Leisure: ちょっぴり贅沢な大人の休日",
        "🌅 Morning/Evening Glow: 朝焼け・夕焼けが美しい場所",
        "📚 Culture & Book: 本とカルチャー、知的好奇心を満たす旅",
        "👾 Pop Culture & Anime: アニメ・ゲーム・サブカルの聖地へ",
        "🌊 Waterfront: 海や川辺の爽やかな風を感じて"
    ];

    const selectedThemes = allThemes.sort(() => 0.5 - Math.random()).slice(0, 5);
    const themeInstructions = selectedThemes.map((theme: string, i: number) => `   Course ${i + 1}: Based strictly on theme "${theme}"`).join('\n');

    // ヘルパー: 実際にAIを呼び出す内部関数
    const callGeneration = async (num: number, existingTitles: string[] = []): Promise<any[]> => {
        const exclusionPrompt = existingTitles.length > 0 
            ? `\n**【重要：以下のテーマとは重複しない、全く新しい切り口で提案してください】**\n- ${existingTitles.join('\n- ')}`
            : "";

        const themeSlice = existingTitles.length > 0 
            ? selectedThemes.slice(3).map((theme, i) => `   Course ${i + 1}: Based strictly on theme "${theme}"`).join('\n')
            : selectedThemes.slice(0, num).map((theme, i) => `   Course ${i + 1}: Based strictly on theme "${theme}"`).join('\n');

        const promptTemplate = `
You are a top-tier Japanese luxury travel curator.
Your task is to create ${num} **COMPLETELY DISTINCT** plans for a **${durationMinutes} minute** trip.
${personaPrompt}
${exploreModeTemplate}
**【最重要ミッション】**
あなたは世界最高峰のトラベルキュレーターです。提供された候補から、必ず **全く異なる${num}つのプラン** を作成してください。
${exclusionPrompt}

**【季節・時刻コンテキスト（最重要）】**
${getSeasonalPromptContext()}

**1. コースの完全な独立性と重複排除 (極めて重要):**
- **${num}つのコース間で、スポットを被らせることは絶対に禁止です。**

**2. 体験・観光の主役化と飲食制限:**
${diningRule}
- 食べてばかりのプランにならないよう、公園、神社仏閣、名所、美術館などの**「体験・景色」をコースの主役に**してください。

**3. 自然なペース配分 (Natural Pacing):**
- スポット数の「上限」は設定しません。代わりに、「各スポットの推定滞在時間（Stayフィールド参照）」＋「スポット間の移動時間（徒歩15分程度を想定）」を積み上げて、合計が **${durationMinutes}分** に自然に収まるスポット数を選んでください。
- 無理に詰め込まず、各スポットで余裕を持って楽しめるペースで構成してください。

**4. 魅力的な命名と具体的な解説:**
- **タイトル**: 雑誌の特集のように、詩的でキャッチーな日本語タイトルにしてください。
- **解説 (aiDescription)**: 「おすすめです」「ぜひ訪れてみてください」等の定型表現は**絶対禁止**。その場所の歴史や五感（音、匂い、手触り）を具体的に語ってください。

**5. 文化財の判定:**
- スポットが国宝、重要文化財、世界遺産、日本遺産に該当する場合、"cultural_property" フィールドにその称号を記入してください（例: "国宝", "世界遺産"）。該当しない場合はnullにしてください。

**6. 構成と多様性:**
${themeSlice}

**【出力形式】**
- **JSONの「値」（タイトル、説明文、aiDescription、must_see、pro_tip、trivia）はすべて100%日本語**で出力してください。英語の混入は一切禁止です（固有名詞「Starbucks」等は例外）。
- **JSONの「キー」（title, theme, description, spots, id 等）は絶対に英語のまま**にしてください。
- **must_see, pro_tip, trivia の末尾は必ず「。」で終えてください。**
- **aiDescription は3〜4文の日本語で、末尾は「。」で終えてください。**

**CANDIDATES:**
${candidateList}

**SYSTEM INFO:**
- Mood: ${mood}, Budget: ${budget}, People: ${groupSize}
- Context: ${timeContext}, ${weatherContext}
${userPreferenceContext ? `- User Preference: ${userPreferenceContext}` : ''}

**OUTPUT SCHEMA (JSON only, after <thinking>):**
{
  "courses": [
    {
      "title": "Emotional Title",
      "theme": "Theme Name",
      "description": "Mag-style intro",
      "spots": [
        { 
          "id": 0, 
          "stayTime": MINS, 
          "travel_time_minutes": MINS,
          "aiDescription": "五感を使った具体的な魅力描写（定型文禁止）",
          "must_see": "必見ポイント",
          "pro_tip": "旅のプロの視点",
          "trivia": "知識欲を刺激する小ネタ（3行以上）",
          "cultural_property": "国宝 or 世界遺産 or null"
        }
      ]
    }
  ]
}
`;

        const modelName = selectModel(durationMinutes);
        let text: string | undefined;

        // 指数バックオフ付きリトライ
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const currentModel = attempt === 0 ? modelName : "gemini-2.5-flash";
                await waitRateLimit(currentModel, 5000);
                const useJsonMode = attempt > 0;
                text = await callGeminiProxy(promptTemplate, currentModel, useJsonMode);
                break; // 成功したらループ脱出
            } catch (err: any) {
                const is429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
                if (is429 && attempt < MAX_RETRIES) {
                    const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30000);
                    console.warn(`[Gemini API] 429 Rate Limited. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await sleep(backoffMs);
                    continue;
                }
                if (attempt < MAX_RETRIES) {
                    console.warn(`[Gemini API] Model failed (attempt ${attempt + 1}), trying fallback:`, err);
                    continue;
                }
                console.error(`[Gemini API] All ${MAX_RETRIES + 1} attempts failed:`, err);
                throw err;
            }
        }

        if (!text) return [];

        let jsonStr = stripThinkingBlock(text);
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, jsonStr];
        jsonStr = jsonMatch[1] || jsonStr;
        const firstBrace = jsonStr.indexOf('{');
        const firstBracket = jsonStr.indexOf('[');
        const start = (firstBrace !== -1 && firstBracket !== -1) ? Math.min(firstBrace, firstBracket) : Math.max(firstBrace, firstBracket);
        const lastBrace = jsonStr.lastIndexOf('}');
        const lastBracket = jsonStr.lastIndexOf(']');
        const end = Math.max(lastBrace, lastBracket);
        if (start !== -1 && end !== -1 && start < end) {
            jsonStr = jsonStr.substring(start, end + 1);
        }
        
        try {
            const data = JSON.parse(jsonStr.replace(/,\s*([\]}])/g, '$1'));
            if (Array.isArray(data)) return data;
            if (data.courses && Array.isArray(data.courses)) return data.courses;
            console.warn('Gemini returned unusual JSON structure:', data);
            return [];
        } catch (e) {
            console.error('Gemini JSON Parse Error. Raw string:', jsonStr);
            return [];
        }
    };

    // 2段階生成: 3コース + 2コース
    const firstSet = await callGeneration(3);
    const firstTitles = firstSet.map(c => c.title);
    const secondSet = await callGeneration(2, firstTitles);

    const courses = [...firstSet, ...secondSet].slice(0, 5);

    // UUID
    const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);

    return courses.map((course: any) => {
        const uniqueId = generateId();
        const hydratedSpots: Spot[] = (course.spots || []).map((s: any) => {
            const original = qualityFiltered[Number(s.id)];
            if (!original) return null;
            return {
                ...original,
                stayTime: Number(s.stayTime) || 30,
                aiDescription: s.aiDescription || s.recommendation_reason || "魅力的なスポットです",
                must_see: s.must_see || null,
                pro_tip: s.pro_tip || null,
                trivia: s.trivia || undefined,
                cultural_property: s.cultural_property || null
            } as Spot;
        }).filter((s: any): s is Spot => s !== null);

        // Sorting/Travel time (already implemented in gemini.ts before, keeping logic)
        if (hydratedSpots.length > 1) {
            // 最近傍法でスポットをソート
            const sorted: Spot[] = [hydratedSpots[0]];
            const remaining = hydratedSpots.slice(1);
            while (remaining.length > 0) {
                const current = sorted[sorted.length - 1];
                let nearestIdx = 0;
                let nearestDist = Infinity;
                for (let i = 0; i < remaining.length; i++) {
                    const dx = (remaining[i].lat - current.lat) * 111000;
                    const dy = (remaining[i].lon - current.lon) * 111000 * Math.cos(current.lat * Math.PI / 180);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
                }
                // 最近傍でも3km以上離れている場合はスキップ（遠すぎるルート防止）
                if (nearestDist > 3000) {
                    remaining.splice(nearestIdx, 1);
                    continue;
                }
                const picked = remaining.splice(nearestIdx, 1)[0];
                if (picked) sorted.push(picked);
            }
            // 移動時間はApp.tsx側でtravelModeに応じて計算するため、ここではソートのみ
            return { id: uniqueId, title: course.title, theme: course.theme, description: course.description, totalTime: durationMinutes, spots: sorted, persona } as Course;
        }
        return { id: uniqueId, title: course.title, theme: course.theme, description: course.description, totalTime: durationMinutes, spots: hydratedSpots, persona } as Course;
    });
};

export const remixCourse = async (
    originalCourse: Course,
    candidates: Spot[],
    remixInstruction: string,
    center: { lat: number; lon: number },
    durationMinutes: number,
    timeContext: string = "不明",
    weatherContext: string = "不明",
    mood: string = "不明",
    budget: string = "不明",
    groupSize: string = "不明",
    userPreferenceContext: string = ""
): Promise<Course | null> => {
    const candidateList = candidates.map((s, i) => {
        const details = [
            s.category,
            s.rating ? `★${s.rating}` : null,
            s.price_level ? `Price:${'¥'.repeat(s.price_level)}` : null,
            `Est.Stay:${s.estimatedStayTime || 30}min`
        ].filter(Boolean).join(', ');
        return `ID ${i}: ${s.name} (${details})`;
    }).join('\n');

    const diningRule = getDiningRule(durationMinutes);
    const spotCountRule = getRecommendedSpotCount(durationMinutes);

    const prompt = `
You are a top-tier Japanese luxury travel curator.
Your task is to REDESIGN this course: "${originalCourse.title}"
Based on the specific user instruction: "${remixInstruction}"

**【ミッション：継続と革新のバランス】**
1. **指示の正確な反映**: ユーザーの指示 "${remixInstruction}" を最優先で実現してください。
2. **スマートな再構成**: すべてを入れ替える必要はありません。既存の素晴らしいスポットは活かしつつ、指示に合わせて一部を差し替えたり、順序を入れ替えたり、滞在時間を調整してください。
3. **メタデータの完全維持・生成**: 各スポットに以下の情報を必ず含めてください。
   - **must_see**: その場所で絶対に外せない見どころ（2〜3文の具体的な描写。末尾は「。」）
   - **pro_tip**: 混雑回避や裏技などの実用的な助言（2〜3文の具体的な文章。末尾は「。」）
   - **trivia**: 歴史や背景などの面白い小ネタ（2〜3文の具体的な文章。末尾は「。」）
   - **aiDescription**: その場所の魅力を感情豊かに語る日本語の文章（3〜4文。末尾は「。」）
   ※既存のスポットを使い続ける場合は、元の情報をベースにさらに魅力的に磨き上げてください。
4. **圧倒的なネーミングセンス**: タイトルは雑誌の特集のように、**詩的でキャッチーな日本語タイトル**に新しく書き換えてください。英語のタイトルは絶対に禁止です。
5. **飲食制限の絶対遵守**: ${diningRule}
6. **スポット数の安定化**: 現在のコースは **${originalCourse.spots.length}件** のスポットで構成されています。指示に応じて微調整は可能ですが、極端な増減（±2件以上）は避け、時間枠（${durationMinutes}分）に自然に収まるように調整してください。
7. **テーマのカテゴリー化**: "theme" フィールドには、コース全体を端的に表す **日本語のカテゴリー名（例: 「歴史散策」「グルメ巡り」「自然と癒し」「アート探訪」）** を1つだけ出力してください。ユーザーの指示文をそのまま入れないでください。

**CANDIDATES:**
${candidateList}

**SYSTEM INFO:**
- Current Mood: ${mood}, Budget: ${budget}, People: ${groupSize}
- Context: ${timeContext}, ${weatherContext}
${userPreferenceContext ? `- User Preference: ${userPreferenceContext}` : ''}

**OUTPUT SCHEMA (JSON only, after <thinking>):**
{
  "title": "詩的でキャッチーな日本語タイトル",
  "description": "雑誌風の日本語イントロ",
  "theme": "カテゴリー名（例: 歴史散策、グルメ巡り、自然と癒し）",
  "spots": [
    { 
      "id": 0, 
      "stayTime": MINS, 
      "aiDescription": "その場所の魅力を情感豊かに語る（日本語、末尾は「。」）",
      "must_see": "必見ポイント（末尾は「。」）",
      "pro_tip": "旅のヒント（末尾は「。」）",
      "trivia": "賢者の小ネタ（末尾は「。」）"
    }
  ]
}

**【出力ルール】**
- **JSONの「値」（title, description, aiDescription, must_see, pro_tip, trivia）はすべて100%日本語**で出力してください。英語のタイトルや説明は絶対に禁止です。
- **JSONの「キー」（title, description, spots, id 等）は英語のまま**にしてください。
- **must_see, pro_tip, trivia, aiDescription の末尾は必ず「。」で終えてください。**
`;

    const modelName = selectModel(durationMinutes);
    let text: string | undefined;

    // 指数バックオフ付きリトライ
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const currentModel = attempt === 0 ? modelName : "gemini-2.5-flash";
            await waitRateLimit(currentModel, 5000);
            const useJsonMode = attempt > 0;
            text = await callGeminiProxy(prompt, currentModel, useJsonMode);
            break;
        } catch (err: any) {
            const is429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
            if (is429 && attempt < MAX_RETRIES) {
                const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30000);
                console.warn(`[Remix] 429 Rate Limited. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(backoffMs);
                continue;
            }
            if (attempt < MAX_RETRIES) {
                console.warn(`[Remix] Model failed (attempt ${attempt + 1}), trying fallback:`, err);
                continue;
            }
            console.warn(`[Remix] All attempts failed`);
        }
    }

    if (!text) throw new Error("AIによるリミックスに失敗しました。時間をおいて再度お試しください。");

    try {
        let jsonStr = stripThinkingBlock(text);
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            const firstBrace = jsonStr.indexOf('{');
            const firstBracket = jsonStr.indexOf('[');
            const start = (firstBrace !== -1 && firstBracket !== -1) ? Math.min(firstBrace, firstBracket) : Math.max(firstBrace, firstBracket);
            const lastBrace = jsonStr.lastIndexOf('}');
            const lastBracket = jsonStr.lastIndexOf(']');
            const end = Math.max(lastBrace, lastBracket);
            if (start !== -1 && end !== -1 && start < end) {
                jsonStr = jsonStr.substring(start, end + 1);
            }
        }
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1'); 

        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error('Gemini JSON Parse Error in Remix. Raw string:', jsonStr);
            return null;
        }
        
        const hydratedSpots = (data.spots || []).map((s: any) => {
            const original = candidates[Number(s.id)];
            if (!original) return null;
            return { 
                ...original, 
                stayTime: Number(s.stayTime) || 30, 
                aiDescription: s.aiDescription || "リミックスされたスポットです",
                must_see: s.must_see || original.must_see || null,
                pro_tip: s.pro_tip || original.pro_tip || null,
                trivia: s.trivia || original.trivia || ""
            } as Spot;
        }).filter((s: any): s is Spot => s !== null);

        if (hydratedSpots.length === 0) throw new Error("有効なスポットが生成されませんでした。");

        return {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
            title: data.title || originalCourse.title + " (Remix)",
            description: data.description || "",
            totalTime: durationMinutes,
            spots: hydratedSpots,
            theme: data.theme || originalCourse.theme || "よりみち",
            travelMode: originalCourse.travelMode,
            persona: originalCourse.persona
        } as Course;
    } catch (err) {
        console.error(`Remix processing failed:`, err);
        throw err;
    }
};

export interface WaitingScreenContent {
    status_texts: string[];
    forecast_copies: string[];
    travel_tips: string[];
    interaction: {
        question: string;
        options: { id: string; label: string }[];
    }[];
}

export const generateWaitingScreenContent = async (
    locationName: string,
    weatherContext: string = "不明",
    persona?: PersonaId
): Promise<WaitingScreenContent | null> => {
    const personaContext = persona && PERSONA_INSTRUCTIONS[persona]
        ? `選ばれたガイド: 【${PERSONA_INSTRUCTIONS[persona].kanji}】${PERSONA_INSTRUCTIONS[persona].label}。このガイドの視点でチップスを書いてください。`
        : '';
    const now = new Date();
    const month = now.getMonth() + 1;
    const hour = now.getHours();
    const seasonHint = month <= 2 || month === 12 ? '冬' : month <= 5 ? '春' : month <= 8 ? '夏' : '秋';
    const timeHint = hour < 10 ? '朝' : hour < 15 ? '昼' : hour < 18 ? '夕方' : '夜';

    const prompt = `あなたは「${locationName}」を知り尽くした地元の達人です。
今の状況: 季節=${seasonHint}, 時間帯=${timeHint}, 天気=${weatherContext}
${personaContext}

以下のJSON形式で、**この場所・この天気・この時間だからこそ言える**極めて具体的なコンテンツを日本語で生成してください。
「傘を持って」「歩きやすい靴で」等の一般的すぎる助言は禁止。「今の${weatherContext}なら〇〇寺の苔が映える」のような、場所と状況に紐づいた専門的な助言のみ許可します。

{
  "status_texts": ["生成中の演出テキスト4つ（詩的で${locationName}にちなんだもの）"],
  "forecast_copies": ["今の天気・季節に即した、${locationName}ならではの楽しみ方を2つ"],
  "travel_tips": ["プロ級の旅のヒント3つ（具体的な場所名・時間・体験を含む）"],
  "interaction": [{"question": "旅の気分を高める質問", "options": [{"id": "a", "label": "選択肢"}]}]
}
JSON ONLY.`;
    const modelName = "gemini-2.5-flash-lite";
    try {
        await waitRateLimit(modelName, 5000);
        const text = await callGeminiProxy(prompt, modelName, true);
        return JSON.parse(text) as WaitingScreenContent;
    } catch (err) {
        console.warn(`Sub-AI (Flash-Lite) failed, trying Flash:`, err);
        try {
            const fbModel = "gemini-2.5-flash";
            await waitRateLimit(fbModel, 7000);
            const text = await callGeminiProxy(prompt, fbModel, true);
            return JSON.parse(text) as WaitingScreenContent;
        } catch (fbErr) {
            console.warn(`Sub-AI (Flash) also failed:`, fbErr);
            return null;
        }
    }
};
