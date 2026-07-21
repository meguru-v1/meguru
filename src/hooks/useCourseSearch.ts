import { useState } from 'react';
import { planSearch } from '../lib/courseSearch';
import { generateSmartCourses, generateWaitingScreenContent } from '../lib/gemini';
import type { WaitingScreenContent } from '../lib/gemini';
import { getCurrentWeatherDetailed } from '../lib/weather';
import { sendCompletionNotification } from '../lib/notifications';
import type { Course, Spot, SearchParams } from '../types';

/** リミックス時に「前回どんな条件で探したか」を引き継ぐための記録 */
export interface RemixContext {
    duration: number;
    mood: string;
    budget: string;
    groupSize: string;
    query: string;
}

const INITIAL_REMIX_CONTEXT: RemixContext = {
    duration: 120, mood: '不明', budget: '不明', groupSize: '不明', query: '',
};

/** 待ち画面のサブAIをメインより遅らせる時間（同時呼び出しの負荷を分散する） */
const SUB_AI_DELAY_MS = 250;
/** エラー時に生成画面を閉じるまでの猶予（メッセージを読む時間） */
const ERROR_CLOSE_DELAY_MS = 1500;

interface Options {
    /** お気に入り・履歴から作る好み傾向。favorites に依存するため呼び出し側から渡す */
    getPreferenceContext: () => string;
    /** コースが出揃った（または部分表示できた）タイミング */
    onCoursesReady: () => void;
    /** 検索を開始した（選択中コースの解除など） */
    onSearchStart: () => void;
}

/**
 * 検索条件からコースを生成するまでの一連の状態と手続きをまとめる。
 * ルート検索・エリア検索の違いは planSearch が吸収する。
 */
export function useCourseSearch({ getPreferenceContext, onCoursesReady, onSearchStart }: Options) {
    const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
    const [radius, setRadius] = useState(1000);
    const [courses, setCourses] = useState<Course[]>([]);
    const [searchCandidates, setSearchCandidates] = useState<Spot[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);

    // 生成中の待ち画面まわり
    const [showGenScreen, setShowGenScreen] = useState(false);
    const [searchLocationName, setSearchLocationName] = useState('');
    const [subAiContent, setSubAiContent] = useState<WaitingScreenContent | null>(null);
    const [generationImages, setGenerationImages] = useState<string[]>([]);

    const [remixContext, setRemixContext] = useState<RemixContext>(INITIAL_REMIX_CONTEXT);

    const search = async (params: SearchParams) => {
        setLoading(true);
        setError(null);
        setSubAiContent(null);
        setCourses([]);
        setStatus('場所を検索中...');
        onSearchStart();

        let hasError = false;
        try {
            setRemixContext({
                duration: params.duration,
                mood: params.mood || '不明',
                budget: params.budget || '不明',
                groupSize: params.groupSize || '不明',
                query: params.query,
            });

            const plan = await planSearch(params, setStatus);
            setCenter(plan.center);
            setRadius(plan.radius);
            setSearchCandidates(plan.candidates);

            setStatus('AIが最適なコースを生成中...');
            setShowGenScreen(true);
            setSearchLocationName(plan.locationName);
            setGenerationImages(plan.images);

            const now = new Date();
            const timeContext =
                params.startTime || `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
            const weather = await getCurrentWeatherDetailed(plan.center.lat, plan.center.lon);

            const mainPromise = generateSmartCourses(
                plan.candidates,
                plan.center,
                params.duration,
                timeContext,
                weather.text,
                params.mood,
                params.budget,
                params.groupSize,
                getPreferenceContext(),
                params.persona,
                params.exploreMode,
                params.daysCount ?? 1,
                // 部分的にできたコースから順に見せる
                (partialCourses) => {
                    const enhanced = plan.enhance(partialCourses);
                    setCourses(enhanced);
                    if (enhanced.length > 0) {
                        setShowGenScreen(false);
                        onCoursesReady();
                    }
                },
                weather.tag,
                weather.temperatureC
            );

            setTimeout(() => {
                generateWaitingScreenContent(plan.locationName, weather.text, params.persona)
                    .then((content) => { if (content) setSubAiContent(content); })
                    .catch(() => { /* 出せなくてもフォールバック表示で足りる */ });
            }, SUB_AI_DELAY_MS);

            const generated = await mainPromise;
            if (!generated || generated.length === 0) {
                throw new Error('AIがコース案を作成できませんでした。別の条件で試してみてください。');
            }

            const enhanced = plan.enhance(generated);
            setCourses(enhanced);
            sendCompletionNotification(enhanced[0].title, enhanced.length);
            onCoursesReady();
        } catch (err) {
            console.error('コース生成に失敗:', err);
            setError(err instanceof Error ? err.message : '検索中にエラーが発生しました。');
            hasError = true;
        } finally {
            setLoading(false);
            const close = () => {
                setShowGenScreen(false);
                setSubAiContent(null);
                setStatus('');
            };
            // エラーは statusPanel に出るので、少し待ってから生成画面を閉じる
            if (hasError) setTimeout(close, ERROR_CLOSE_DELAY_MS);
            else close();
        }
    };

    return {
        center, setCenter,
        radius,
        courses, setCourses,
        searchCandidates,
        loading, status, error,
        showGenScreen, setShowGenScreen, searchLocationName, subAiContent, generationImages,
        remixContext,
        search,
    };
}
