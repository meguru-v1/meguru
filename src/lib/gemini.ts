import type { Spot, Course, PersonaId, ExploreMode, WeatherTag } from '../types';
import { getSeasonalPromptContext } from './seasonal';
import {
    callGeminiProxy,
    sleep,
    waitRateLimit,
    stripThinkingBlock,
    selectModel,
    extractJsonString,
} from './geminiApi';
import { PERSONA_INSTRUCTIONS, getPersonaPrompt } from './personas';
import { WEEKDAY_NAMES, parseTimeToMinutes, checkOpenStatus } from './openingHours';
import { getStayTimeByType, buildSmartItinerary } from './routeAlgorithms';
import {
    buildWeatherDirective,
    getExploreModeTemplate,
    getDiningRule,
    getRecommendedSpotCount,
    getMinSpotCount,
} from './geminiPrompts';

// UUID 生成
const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

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
    exploreMode?: ExploreMode,
    daysCount: number = 1,
    onProgress?: (partialCourses: Course[]) => void,
    weatherTag?: WeatherTag,
    temperatureC?: number | null
): Promise<Course[]> => {
    const weatherDirective = buildWeatherDirective(weatherContext, weatherTag, temperatureC);
    const isMultiday = exploreMode === 'multiday' || daysCount > 1;
    const effectiveDays = isMultiday ? Math.max(2, daysCount) : 1;
    const perDayMinutes = isMultiday ? 780 : durationMinutes; // 連泊は1日13時間固定

    // ===== 訪問予定の曜日・時刻を確定 =====
    const visitDate = new Date();
    const visitDayOfWeek = visitDate.getDay(); // 0=日 ... 6=土
    const visitStartMin = parseTimeToMinutes(timeContext);
    const visitEndMin = visitStartMin + (isMultiday ? perDayMinutes : durationMinutes);
    const visitDayLabel = `${visitDate.getFullYear()}-${String(visitDate.getMonth() + 1).padStart(2, '0')}-${String(visitDate.getDate()).padStart(2, '0')}(${WEEKDAY_NAMES[visitDayOfWeek]})`;
    const visitTimeLabel = `${Math.floor(visitStartMin / 60)}:${String(visitStartMin % 60).padStart(2, '0')}〜${Math.floor(visitEndMin / 60) % 24}:${String(visitEndMin % 60).padStart(2, '0')}`;

    // ===== 候補品質フィルタ（評価重み付きスコアリング）=====
    const qualityFiltered = candidates
        .filter(s => {
            if ((s as Spot & { business_status?: string }).business_status === 'CLOSED_PERMANENTLY') return false;
            if (s.rating && s.rating < 3.5) return false;
            return true;
        })
        .map(s => {
            const dx = (s.lat - center.lat) * 111000;
            const dy = (s.lon - center.lon) * 111000 * Math.cos(center.lat * Math.PI / 180);
            const dist = Math.sqrt(dx * dx + dy * dy);
            // 高評価スポットを距離ペナルティより優先
            const ratingBonus = (s.rating ?? 3.5) * 400;
            const popularityBonus = Math.min(s.user_ratings_total ?? 0, 5000) * 0.04;
            return { spot: s, score: dist - ratingBonus - popularityBonus };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, isMultiday ? 80 : 60)
        .map(item => item.spot);

    // ===== #2: トークン圧縮した候補リスト (ダイエット化) =====
    // 連泊は曜日が複数あるためここでの可否判定は省略（unknown扱い）
    const candidateList = qualityFiltered.map((s, i) => {
        const indoorTag = s.isIndoor === true ? '屋内' : s.isIndoor === false ? '屋外' : null;
        let openTag: string | null = null;
        if (!isMultiday) {
            const status = checkOpenStatus(s.opening_hours, visitDayOfWeek, visitStartMin, visitEndMin);
            if (status.status === 'closed') openTag = `❌${status.label || '訪問時刻外'}`;
            else if (status.status === 'open') openTag = `✅${status.label || '営業中'}`;
        }
        const details = [
            s.category,
            s.rating ? `★${s.rating}` : null,
            `Stay:${s.estimatedStayTime || getStayTimeByType(s.category)}m`,
            indoorTag,
            openTag,
        ].filter(Boolean).join(',');
        return `${i}:${s.name}(${details})`;
    }).join('|');

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

    // ===== 連泊プラン生成パス =====
    if (isMultiday) {
        const perDaySpots = '5〜8';
        const planThemes = effectiveDays === 2
            ? [
                ["🏯 古都の王道：歴史と文化の深掘り", "🌿 自然と癒し：隠れた名所へ"],
                ["🎨 アートとグルメ：五感の旅", "🌊 水辺と新発見：フォトジェニックスポット"]
              ]
            : [
                ["🏯 歴史と文化", "🌿 自然と癒し", "🍜 グルメと下町"],
                ["🎨 アートと感性", "🌊 水辺と絶景", "⛩️ 神社仏閣と開運"]
              ];

        const multidayPrompt = `
You are a world-class Japanese travel curator. Create **2 completely different ${effectiveDays}-day travel plans**.
${personaPrompt}
${weatherDirective}
**【最重要ルール】**
1. プランAとプランBで **スポットを一切被らせない**
2. 同じプラン内でも日ごとに **エリアを変える**（Day1とDay2で異なる地区）
3. 各日のスポットは **互いに3km圏内** に集める（移動効率のため）
4. 各日必ずランチスポットを1件含む
5. 1日あたり **${perDayMinutes}分（約${Math.round(perDayMinutes/60)}時間）** に収める
6. スポット数：1日あたり ${perDaySpots}件

**【季節・時刻コンテキスト】**
${getSeasonalPromptContext()}

**【プランAの日別テーマ（厳守）】**
${planThemes[0].map((t, i) => `Day ${i+1}: ${t}`).join('\n')}

**【プランBの日別テーマ（厳守）】**
${planThemes[1].map((t, i) => `Day ${i+1}: ${t}`).join('\n')}

**5. 文化財の判定:**
スポットが国宝、重要文化財、世界遺産に該当する場合、"cultural_property"にその称号を記入（例: "国宝"）。該当しない場合はnull。

**6. 営業時間への配慮（連泊一般則）:**
- 美術館・博物館は月曜定休が多い → 月曜のDayには選ばない
- 寺社の御朱印・拝観は16:00頃終了が多い → 夕方以降の時間帯には選ばない
- 朝市・モーニング系カフェは午前中限定が多い → 午後のDayには選ばない

**CANDIDATES:**
${candidateList}

**SYSTEM INFO:**
- Mood: ${mood}, Budget: ${budget}, People: ${groupSize}
- Context: ${timeContext}
${userPreferenceContext ? `- User Preference: ${userPreferenceContext}` : ''}

**OUTPUT SCHEMA (JSON only, 2 plans × ${effectiveDays} days):**
{
  "plans": [
    {
      "planIndex": 0,
      "days": [
        {
          "dayIndex": 0,
          "title": "Day 1: 詩的タイトル",
          "theme": "カテゴリー名",
          "description": "雑誌風の紹介文（2〜3文）",
          "spots": [{"id": 0, "stayTime": 60, "aiDescription": "五感描写（3〜4文、末尾。）", "must_see": "必見ポイント。", "pro_tip": "旅のヒント。", "trivia": "面白い小ネタ。", "cultural_property": null}]
        }
      ]
    },
    { "planIndex": 1, "days": [...] }
  ]
}
すべての値（title, description, aiDescription等）は100%日本語で出力。JSONキーは英語のまま。`;

        const multidayModel = 'gemini-2.5-flash';
        let mdText: string | undefined;
        const MD_RETRIES = 2;
        for (let attempt = 0; attempt <= MD_RETRIES; attempt++) {
            try {
                await waitRateLimit(multidayModel, 2000);
                mdText = await callGeminiProxy(multidayPrompt, multidayModel, attempt > 0);
                break;
            } catch (err) {
                const e = err as Error & { status?: number };
                const is429 = e?.status === 429 || e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
                if (is429 && attempt < MD_RETRIES) { await sleep(Math.min(4000 * Math.pow(2, attempt), 30000)); continue; }
                if (attempt < MD_RETRIES) continue;
                throw err;
            }
        }

        if (!mdText) return [];

        const mdJson = extractJsonString(mdText);

        try {
            const mdData = JSON.parse(mdJson);
            const plans: Array<{ planIndex?: number; days?: Array<Record<string, unknown>> }> = mdData.plans || [];
            const allDayCourses: Course[] = [];

            // 連泊用: ID→名前フォールバック
            const resolveMultiday = (s: { id?: unknown; name?: unknown }): Spot | undefined => {
                const idNum = Number(s.id);
                if (Number.isFinite(idNum) && qualityFiltered[idNum]) return qualityFiltered[idNum];
                if (s.name && typeof s.name === 'string') {
                    const n = s.name;
                    return qualityFiltered.find(c => c.name === n)
                        ?? qualityFiltered.find(c => c.name.includes(n) || n.includes(c.name));
                }
                return undefined;
            };

            for (const plan of plans) {
                const planId = generateId();
                for (const day of (plan.days || [])) {
                    const d = day as { spots?: Array<Record<string, unknown>>; dayIndex?: number; title?: string; theme?: string; description?: string };
                    const hydratedSpots: Spot[] = (d.spots || []).map((s) => {
                        const original = resolveMultiday(s as { id?: unknown; name?: unknown });
                        if (!original) return null;
                        return {
                            ...original,
                            stayTime: Number(s.stayTime) || 45,
                            aiDescription: (s.aiDescription as string) || "魅力的なスポットです",
                            must_see: (s.must_see as string) || null,
                            pro_tip: (s.pro_tip as string) || null,
                            trivia: (s.trivia as string) || undefined,
                            cultural_property: (s.cultural_property as string) || null,
                        } as Spot;
                    }).filter((s): s is Spot => s !== null);

                    // 連泊：Day1は実際の出発時刻、Day2以降は9:00開始と仮定
                    const dayStartMin = (d.dayIndex ?? 0) === 0 ? parseTimeToMinutes(timeContext) : 9 * 60;
                    const dayOrdered = buildSmartItinerary(hydratedSpots, { startTimeMin: dayStartMin, durationMin: perDayMinutes });
                    allDayCourses.push({
                        id: generateId(),
                        title: d.title || `Day ${(d.dayIndex ?? 0) + 1}`,
                        theme: d.theme || '旅程',
                        description: d.description || '',
                        totalTime: perDayMinutes,
                        spots: dayOrdered,
                        persona,
                        dayIndex: d.dayIndex ?? 0,
                        planId,
                        planIndex: plan.planIndex ?? 0,
                    } as Course);
                }
            }

            if (onProgress) onProgress(allDayCourses);
            return allDayCourses;
        } catch (e) {
            console.error('Multiday JSON parse error:', e);
            return [];
        }
    }
    // ===== 連泊パスここまで =====

    // ヘルパー: 実際にAIを呼び出す内部関数
    const callGeneration = async (num: number, themeStartIndex: number): Promise<Array<Record<string, unknown>>> => {
        const themeSlice = selectedThemes.slice(themeStartIndex, themeStartIndex + num).map((theme, i) => `   Course ${i + 1}: Based strictly on theme "${theme}"`).join('\n');

        const promptTemplate = `
You are a top-tier Japanese luxury travel curator.
Your task is to create ${num} **COMPLETELY DISTINCT** plans for a **${durationMinutes} minute** trip.
${personaPrompt}
${exploreModeTemplate}
${weatherDirective}
**【最重要ミッション】**
あなたは世界最高峰のトラベルキュレーターです。提供された候補から、必ず **全く異なる${num}つのプラン** を作成してください。

**【季節・時刻コンテキスト（最重要）】**
${getSeasonalPromptContext()}

**1. コースの完全な独立性と重複排除 (極めて重要):**
- **${num}つのコース間で、スポットを被らせることは絶対に禁止です。**

**2. 体験・観光の主役化と飲食選定ルール:**
${diningRule}
- 食べてばかりのプランにならないよう、公園、神社仏閣、名所、美術館などの**「体験・景色」をコースの主役に**してください。
- 食事スポットを選ぶ際は **「ランチ向きのレストラン」「カフェ休憩向きのカフェ」「ディナー向きの店」** を意識して、目的が明確なものを選定してください。
- **配置順序（並び順）の指定は不要です**。順序とタイミングは自動でクロックタイム最適化されます。AIはスポットの「選定」のみに集中してください。

**3. スポット数（厳格な絶対ルール）:**
- 推奨: ${spotCountRule}（食事スポットを含む全体）
- **最低 ${getMinSpotCount(durationMinutes)}件 は必ず確保すること。これより少ないコースは絶対禁止です。**
- 「各スポットの推定滞在時間（Stay）」＋「移動時間（徒歩15分程度）」を積み上げて${durationMinutes}分に収めつつ、最低数は妥協しないこと。
- 余裕があれば上限まで増やしてよい。短時間でも体験密度を確保すること。

**4. 魅力的な命名と具体的な解説:**
- **タイトル**: 雑誌の特集のように、詩的でキャッチーな日本語タイトルにしてください。
- **解説 (aiDescription)**: 「おすすめです」「ぜひ訪れてみてください」等の定型表現は**絶対禁止**。その場所の歴史や五感（音、匂い、手触り）を具体的に語ってください。

**5. 文化財の判定:**
- スポットが国宝、重要文化財、世界遺産、日本遺産に該当する場合、"cultural_property" フィールドにその称号を記入してください（例: "国宝", "世界遺産"）。該当しない場合はnullにしてください。

**6. 構成と多様性:**
${themeSlice}

**【訪問予定（営業時間判定の基準）】**
- 日時: ${visitDayLabel} ${visitTimeLabel}
- **❌バッジ付き候補（訪問時刻に閉店 or 定休日）は絶対に選ばないでください**。
- ✅バッジは訪問時刻に営業中、バッジなしは営業情報不明（選んでも可）。

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
          "name": "候補リストの正確なスポット名（idと同じ位置のもの）",
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
                await waitRateLimit(currentModel, 2000);
                const useJsonMode = attempt > 0;
                text = await callGeminiProxy(promptTemplate, currentModel, useJsonMode);
                break; // 成功したらループ脱出
            } catch (err) {
                const e = err as Error & { status?: number };
                const is429 = e?.status === 429 || e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
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

        const jsonStr = extractJsonString(text);
        try {
            const data = JSON.parse(jsonStr);
            if (Array.isArray(data)) return data;
            if (data.courses && Array.isArray(data.courses)) return data.courses;
            console.warn('Gemini returned unusual JSON structure:', data);
            return [];
        } catch {
            console.error('Gemini JSON Parse Error. Raw string:', jsonStr);
            return [];
        }
    };

    // ID→名前フォールバック付きスポット解決
    const resolveOriginal = (s: { id?: unknown; name?: unknown }): Spot | undefined => {
        const idNum = Number(s.id);
        if (Number.isFinite(idNum) && qualityFiltered[idNum]) return qualityFiltered[idNum];
        if (s.name && typeof s.name === 'string') {
            const n = s.name;
            const exact = qualityFiltered.find(c => c.name === n);
            if (exact) return exact;
            const partial = qualityFiltered.find(c => c.name.includes(n) || n.includes(c.name));
            if (partial) return partial;
        }
        return undefined;
    };

    // コースデータをhydrateして整形する関数
    const hydrateCourses = (rawCourses: Array<Record<string, unknown>>): Course[] => {
        return rawCourses.map((course) => {
            const uniqueId = generateId();
            const rawSpots = (course.spots as Array<Record<string, unknown>>) || [];
            const hydratedSpots: Spot[] = rawSpots.map((s) => {
                const original = resolveOriginal(s as { id?: unknown; name?: unknown });
                if (!original) { console.warn(`[hydrate] Cannot resolve spot:`, s); return null; }
                return {
                    ...original,
                    stayTime: Number(s.stayTime) || 30,
                    aiDescription: (s.aiDescription as string) || (s.recommendation_reason as string) || "魅力的なスポットです",
                    must_see: (s.must_see as string) || null,
                    pro_tip: (s.pro_tip as string) || null,
                    trivia: (s.trivia as string) || undefined,
                    cultural_property: (s.cultural_property as string) || null,
                } as Spot;
            }).filter((s): s is Spot => s !== null);

            const startMin = parseTimeToMinutes(timeContext);
            const orderedSpots = buildSmartItinerary(hydratedSpots, { startTimeMin: startMin, durationMin: durationMinutes });
            return {
                id: uniqueId,
                title: course.title as string,
                theme: course.theme as string,
                description: course.description as string,
                totalTime: durationMinutes,
                spots: orderedSpots,
                persona,
            } as Course;
        });
    };

    // 2段階生成を並列化（フル・パラレル処理）
    let accumulatedCourses: Course[] = [];
    const handleSetCompleted = (rawCourses: Array<Record<string, unknown>>) => {
        const hydrated = hydrateCourses(rawCourses);
        accumulatedCourses = [...accumulatedCourses, ...hydrated];
        if (onProgress) onProgress([...accumulatedCourses]); // 新しい配列を渡して再描画を促す
        return hydrated;
    };

    const firstSetPromise = callGeneration(3, 0).then(handleSetCompleted).catch(e => { console.error("Generation part 1 failed", e); return []; });
    const secondSetPromise = callGeneration(2, 3).then(handleSetCompleted).catch(e => { console.error("Generation part 2 failed", e); return []; });

    await Promise.all([firstSetPromise, secondSetPromise]);

    return accumulatedCourses.slice(0, 5);
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
            await waitRateLimit(currentModel, 2000);
            const useJsonMode = attempt > 0;
            text = await callGeminiProxy(prompt, currentModel, useJsonMode);
            break;
        } catch (err) {
            const e = err as Error & { status?: number };
            const is429 = e?.status === 429 || e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
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
        const jsonStr = extractJsonString(text);
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch {
            console.error('Gemini JSON Parse Error in Remix. Raw string:', jsonStr);
            return null;
        }

        const rawSpots = (data.spots as Array<Record<string, unknown>>) || [];
        const hydratedSpots = rawSpots.map((s) => {
            const original = candidates[Number(s.id)];
            if (!original) return null;
            return {
                ...original,
                stayTime: Number(s.stayTime) || 30,
                aiDescription: (s.aiDescription as string) || "リミックスされたスポットです",
                must_see: (s.must_see as string) || original.must_see || null,
                pro_tip: (s.pro_tip as string) || original.pro_tip || null,
                trivia: (s.trivia as string) || original.trivia || ""
            } as Spot;
        }).filter((s): s is Spot => s !== null);

        if (hydratedSpots.length === 0) throw new Error("有効なスポットが生成されませんでした。");

        return {
            id: generateId(),
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
        return JSON.parse(stripThinkingBlock(text)) as WaitingScreenContent;
    } catch (err) {
        console.warn(`Sub-AI (Flash-Lite) failed, trying Flash:`, err);
        try {
            const fbModel = "gemini-2.5-flash";
            await waitRateLimit(fbModel, 7000);
            const text = await callGeminiProxy(prompt, fbModel, true);
            return JSON.parse(stripThinkingBlock(text)) as WaitingScreenContent;
        } catch (fbErr) {
            console.warn(`Sub-AI (Flash) also failed:`, fbErr);
            return null;
        }
    }
};
