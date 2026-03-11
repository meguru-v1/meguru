import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, MapPin, Compass, ChevronRight } from 'lucide-react';
import type { WaitingScreenContent } from '../lib/gemini';

// ===== フォールバック用の静的データ =====
const FALLBACK_STATUS = [
    "周辺のスポットを分析しています…",
    "あなたにぴったりのテーマを選定中…",
    "コースの流れを最適化しています…",
    "地元の隠れた名所を探索中…",
    "おすすめの立ち寄りスポットを厳選中…",
    "散策ルートの距離を計算しています…",
    "素敵なカフェを組み込み中…",
    "各スポットの見どころを調査中…",
    "タイムラインを最終調整しています…",
    "もうすぐ完成します…あと少し！"
];

const FALLBACK_FORECASTS = [
    "きっと素敵な発見がある旅になります",
    "あなただけの物語が、もうすぐ始まります",
    "いつもの街が、特別に見える一日を",
    "偶然の出会いが、最高の思い出になる",
    "知らなかった景色が、すぐそこに",
    "今日という日を、忘れられない一日に",
    "歩くたびに、新しい世界が広がる"
];

const FALLBACK_TIPS = [
    "💡 神社では、二礼二拍手一礼が基本のマナーです",
    "📸 写真映えスポットは午前中の柔らかい光がベスト",
    "🍵 抹茶は「薄茶(うすちゃ)」が初心者におすすめ",
    "🚶 日本の道は左側通行。歩道も左寄りを歩きましょう",
    "⛩️ 鳥居をくぐるときは、中央を避けて端を通るのが礼儀",
    "🎋 竹林は早朝が最も美しく、人も少なめです",
    "🏯 お城の石垣の「刻印」探しは隠れた楽しみ方",
    "🍜 ラーメン店は11時台に並ぶと待ち時間が短め"
];

const FALLBACK_SURVEYS = [
    {
        question: "今日は何を重視したい？",
        options: [
            { id: "A", label: "📸 映えスポット重視" },
            { id: "B", label: "🍽️ グルメ重視" }
        ]
    },
    {
        question: "歩くペースは？",
        options: [
            { id: "A", label: "🐢 のんびりゆっくり" },
            { id: "B", label: "🏃 サクサク回りたい" }
        ]
    }
];

const SLIDESHOW_IMAGES = [
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80",
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800&q=80",
    "https://images.unsplash.com/photo-1528164344705-47542687000d?w=800&q=80",
    "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=800&q=80",
    "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=800&q=80",
    "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=800&q=80",
];

// ===== Props =====
interface GenerationScreenProps {
    statusText: string;
    isFinished: boolean;
    onAnswer?: (questionIndex: number, answer: string) => void;
    locationName?: string;
    onTransitionComplete?: () => void;
    subAiContent?: WaitingScreenContent | null; // サブAIからの動的データ
}

export default function GenerationScreen({
    statusText,
    isFinished,
    onAnswer,
    locationName = "この街",
    onTransitionComplete,
    subAiContent
}: GenerationScreenProps) {
    // サブAIデータがあればそちらを使い、なければフォールバック
    const statusMessages = subAiContent?.status_texts?.length ? subAiContent.status_texts : FALLBACK_STATUS;
    const forecastCopies = subAiContent?.forecast_copies?.length ? subAiContent.forecast_copies : FALLBACK_FORECASTS;
    const travelTips = subAiContent?.travel_tips?.length ? subAiContent.travel_tips : FALLBACK_TIPS;
    const surveyQuestions = subAiContent?.interaction?.length ? subAiContent.interaction : FALLBACK_SURVEYS;

    // ===== State =====
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [currentStatusIdx, setCurrentStatusIdx] = useState(0);
    const [currentImageIdx, setCurrentImageIdx] = useState(0);
    const [currentForecastIdx, setCurrentForecastIdx] = useState(0);
    const [currentTipIdx, setCurrentTipIdx] = useState(0);
    const [activeSurvey, setActiveSurvey] = useState<number | null>(null);
    const [surveyAutoCloseTimer, setSurveyAutoCloseTimer] = useState(15);
    const [shownSurveys, setShownSurveys] = useState<Set<number>>(new Set());
    const [isExiting, setIsExiting] = useState(false);
    const [fadeImage, setFadeImage] = useState(true);
    const [fadeForecast, setFadeForecast] = useState(true);
    const [fadeTip, setFadeTip] = useState(true);
    const [hasSubAiArrived, setHasSubAiArrived] = useState(false);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // サブAIのコンテンツが途中で届いたことを検知
    useEffect(() => {
        if (subAiContent && !hasSubAiArrived) {
            setHasSubAiArrived(true);
            // リセットして新しいデータからフレッシュに表示
            setCurrentStatusIdx(0);
            setCurrentForecastIdx(0);
            setCurrentTipIdx(0);
        }
    }, [subAiContent, hasSubAiArrived]);

    // ===== 非線形プログレスバー =====
    const progress = isFinished ? 100 : (1 - Math.exp(-0.03 * elapsedSeconds)) * 95;

    // ===== メインタイマー =====
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    // ===== ステータステキスト切替（10秒ごと）=====
    useEffect(() => {
        if (elapsedSeconds > 0 && elapsedSeconds % 10 === 0) {
            setCurrentStatusIdx(prev => (prev + 1) % statusMessages.length);
        }
    }, [elapsedSeconds, statusMessages.length]);

    // ===== 画像切替（5秒ごと、フェード）=====
    useEffect(() => {
        const imageTimer = setInterval(() => {
            setFadeImage(false);
            setTimeout(() => {
                setCurrentImageIdx(prev => (prev + 1) % SLIDESHOW_IMAGES.length);
                setFadeImage(true);
            }, 600);
        }, 5000);
        return () => clearInterval(imageTimer);
    }, []);

    // ===== 予報コピー切替（7秒ごと）=====
    useEffect(() => {
        const forecastTimer = setInterval(() => {
            setFadeForecast(false);
            setTimeout(() => {
                setCurrentForecastIdx(prev => (prev + 1) % forecastCopies.length);
                setFadeForecast(true);
            }, 500);
        }, 7000);
        return () => clearInterval(forecastTimer);
    }, [forecastCopies.length]);

    // ===== 豆知識切替（8秒ごと）=====
    useEffect(() => {
        const tipTimer = setInterval(() => {
            setFadeTip(false);
            setTimeout(() => {
                setCurrentTipIdx(prev => (prev + 1) % travelTips.length);
                setFadeTip(true);
            }, 400);
        }, 8000);
        return () => clearInterval(tipTimer);
    }, [travelTips.length]);

    // ===== アンケート表示（30秒後 / 60秒後）=====
    useEffect(() => {
        if (elapsedSeconds === 30 && !shownSurveys.has(0) && surveyQuestions.length > 0) {
            setActiveSurvey(0);
            setSurveyAutoCloseTimer(15);
            setShownSurveys(prev => new Set(prev).add(0));
        }
        if (elapsedSeconds === 60 && !shownSurveys.has(1) && surveyQuestions.length > 1) {
            setActiveSurvey(1);
            setSurveyAutoCloseTimer(15);
            setShownSurveys(prev => new Set(prev).add(1));
        }
    }, [elapsedSeconds, shownSurveys, surveyQuestions.length]);

    // ===== アンケート自動閉じ（15秒）=====
    useEffect(() => {
        if (activeSurvey === null) return;
        if (surveyAutoCloseTimer <= 0) {
            if (onAnswer) onAnswer(activeSurvey, "omakase");
            setActiveSurvey(null);
            return;
        }
        const t = setTimeout(() => setSurveyAutoCloseTimer(prev => prev - 1), 1000);
        return () => clearTimeout(t);
    }, [activeSurvey, surveyAutoCloseTimer, onAnswer]);

    // ===== 完了時の演出 =====
    useEffect(() => {
        if (isFinished && !isExiting) {
            setIsExiting(true);
            setTimeout(() => {
                onTransitionComplete?.();
            }, 1200);
        }
    }, [isFinished, isExiting, onTransitionComplete]);

    const handleSurveyAnswer = useCallback((answer: string) => {
        if (activeSurvey !== null && onAnswer) {
            onAnswer(activeSurvey, answer);
        }
        setActiveSurvey(null);
    }, [activeSurvey, onAnswer]);

    const displayStatus = statusText || statusMessages[currentStatusIdx];

    return (
        <div className={`fixed inset-0 z-[9999] bg-white flex flex-col transition-all duration-700
            ${isExiting ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}>

            {/* ① 進捗ヘッダー */}
            <div className="shrink-0">
                <div className="h-1 bg-slate-100 w-full overflow-hidden">
                    <div
                        className="h-full transition-all duration-1000 ease-out rounded-r-full"
                        style={{
                            width: `${progress}%`,
                            background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 2s linear infinite'
                        }}
                    />
                </div>
                <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-[11px] font-semibold text-slate-500 tracking-wide">
                            {displayStatus}
                        </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-300">
                        {Math.round(progress)}%
                    </span>
                </div>
            </div>

            {/* ② メインビジュアル */}
            <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={SLIDESHOW_IMAGES[currentImageIdx]}
                        alt="destination"
                        className={`w-full h-full object-cover transition-all duration-[1500ms] ease-out
                            ${fadeImage ? 'opacity-100 scale-110' : 'opacity-0 scale-100'}`}
                        style={{ animation: fadeImage ? 'kenBurns 5s ease-out forwards' : 'none' }}
                    />
                    <div className="absolute inset-0" style={{
                        background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 30%, rgba(0,0,0,0.2) 70%, rgba(0,0,0,0.6) 100%)'
                    }} />
                </div>

                <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
                    <div className="glass-gen-panel p-6 rounded-3xl max-w-sm w-full text-center">
                        <Compass className="w-8 h-8 text-amber-500 mx-auto mb-3 animate-pulse" />
                        <p className="text-[10px] font-bold text-amber-600 tracking-[0.2em] uppercase mb-2">
                            {locationName} の旅
                        </p>
                        <p className={`text-lg font-bold text-slate-800 leading-relaxed font-serif transition-all duration-500
                            ${fadeForecast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                            {forecastCopies[currentForecastIdx]}
                        </p>
                        {/* サブAI到着インジケーター */}
                        <div className="mt-4 flex items-center justify-center gap-1.5">
                            {hasSubAiArrived ? (
                                <span className="text-[9px] font-bold text-emerald-500 tracking-wider flex items-center gap-1">
                                    <Sparkles size={10} /> AI がコンテンツをお届け中
                                </span>
                            ) : (
                                [0, 1, 2].map(i => (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
                                        style={{ animationDelay: `${i * 0.15}s` }} />
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* ③ アンケートオーバーレイ */}
                {activeSurvey !== null && activeSurvey < surveyQuestions.length && (
                    <div className="absolute inset-0 flex items-center justify-center z-50"
                        style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.5)' }}>
                        <div className="max-w-xs w-full mx-6 animate-scale-in">
                            <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100">
                                <div className="flex items-center gap-2 mb-1">
                                    <Sparkles size={14} className="text-amber-500" />
                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                                        Quick Question
                                    </span>
                                </div>
                                <p className="text-base font-bold text-slate-800 mb-5">
                                    {surveyQuestions[activeSurvey]?.question}
                                </p>
                                <div className="space-y-2.5">
                                    {surveyQuestions[activeSurvey]?.options.map(opt => (
                                        <button key={opt.id} onClick={() => handleSurveyAnswer(opt.id)}
                                            className="w-full py-3.5 px-4 rounded-2xl text-sm font-bold text-left
                                                bg-slate-50 hover:bg-amber-50 hover:border-amber-200
                                                border-2 border-transparent transition-all active:scale-95
                                                flex items-center justify-between group">
                                            <span>{opt.label}</span>
                                            <ChevronRight size={14} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
                                        </button>
                                    ))}
                                    <button onClick={() => handleSurveyAnswer("omakase")}
                                        className="w-full py-3 px-4 rounded-2xl text-xs font-semibold
                                            text-amber-600 bg-amber-50/60 hover:bg-amber-50
                                            transition-all active:scale-95 flex items-center justify-center gap-1.5">
                                        <Sparkles size={12} />
                                        AIにおまかせ
                                    </button>
                                </div>
                                <div className="mt-4 flex items-center justify-center gap-2">
                                    <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-400 rounded-full transition-all duration-1000"
                                            style={{ width: `${(surveyAutoCloseTimer / 15) * 100}%` }} />
                                    </div>
                                    <span className="text-[9px] font-mono text-slate-300 shrink-0">
                                        {surveyAutoCloseTimer}s
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ④ 豆知識テロップ */}
            <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-white/90 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1">
                    <MapPin size={10} className="text-amber-500" />
                    <span className="text-[9px] font-extrabold text-slate-300 uppercase tracking-[0.15em]">
                        Travel Tip
                    </span>
                </div>
                <p className={`text-xs text-slate-500 font-medium leading-relaxed transition-all duration-500
                    ${fadeTip ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
                    {travelTips[currentTipIdx]}
                </p>
            </div>
        </div>
    );
}
