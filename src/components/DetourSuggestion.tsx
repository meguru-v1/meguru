import React, { useState } from 'react';
import { MapPin, Footprints, Loader2, X, Plus } from 'lucide-react';
import type { Spot } from '../types';
import { searchNearbySpots } from '../lib/places';

const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL as string
    || 'https://asia-northeast1-project-6f8c0b7f-7452-4e63-a48.cloudfunctions.net/gemini-proxy';

interface DetourSuggestionProps {
    currentPosition: { lat: number; lng: number } | null;
    currentCourseSpots: Spot[];
    onAddDetour: (spot: Spot) => void;
}

interface DetourSpot {
    spot: Spot;
    reason: string;
    walkMinutes: number;
}

export default function DetourSuggestion({ currentPosition, currentCourseSpots, onAddDetour }: DetourSuggestionProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [suggestions, setSuggestions] = useState<DetourSpot[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchDetours = async () => {
        if (!currentPosition) {
            setError('現在地が取得できていません。');
            return;
        }
        setLoading(true);
        setError('');
        setSuggestions([]);

        try {
            // 現在地周辺300mのスポットを検索
            const nearbySpots = await searchNearbySpots(currentPosition.lat, currentPosition.lng, 300, { maxStage: 2 });
            // 既にコースにあるスポットを除外
            const existingIds = new Set(currentCourseSpots.map(s => s.id));
            const candidates = nearbySpots.filter(s => !existingIds.has(s.id)).slice(0, 10);

            if (candidates.length === 0) {
                setError('周辺に追加できるスポットが見つかりませんでした。');
                setLoading(false);
                return;
            }

            // AIに寄り道スポット提案を依頼
            const prompt = `あなたは旅のプロです。
現在のコースのスポット: ${currentCourseSpots.map(s => s.name).join('、')}
現在地周辺の候補スポット（名前:カテゴリ形式）:
${candidates.map(s => `- ${s.name}（${s.category}）`).join('\n')}

上記の候補から、現在のコースの流れに最も合う寄り道スポットを3件まで選び、
以下のJSON配列形式で回答してください（コードブロック不要）：
[{"name": "スポット名", "reason": "コースに合う理由（1文）", "walkMinutes": 推定徒歩分数}]
理由は「〜だから」の形で具体的に20文字以内で。JSON ONLY。`;

            const res = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, model: 'gemini-2.5-flash-lite', jsonMode: true }),
            });
            const data = await res.json();
            const parsed: { name: string; reason: string; walkMinutes: number }[] = JSON.parse(
                data.text.replace(/```json?/g, '').replace(/```/g, '').trim()
            );

            const result: DetourSpot[] = parsed.map(p => {
                const spot = candidates.find(c => c.name === p.name) || candidates[0];
                return { spot, reason: p.reason, walkMinutes: p.walkMinutes };
            }).filter(Boolean);

            setSuggestions(result);
        } catch (e) {
            setError('提案の取得に失敗しました。もう一度お試しください。');
        } finally {
            setLoading(false);
        }
    };

    const handleOpen = () => {
        setIsOpen(true);
        fetchDetours();
    };

    return (
        <>
            {/* フローティングボタン */}
            <button
                onClick={handleOpen}
                className="fixed right-4 z-[600] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl font-bold text-sm transition-all active:scale-95"
                style={{
                    bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
                    background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                    color: 'white',
                    animation: 'detourPop 0.4s cubic-bezier(0.16,1,0.3,1)',
                    boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
                }}
            >
                <Footprints size={16} />
                ちょっと寄り道
            </button>

            {/* 提案シート */}
            {isOpen && (
                <div className="fixed inset-0 z-[700] flex flex-col justify-end" onClick={() => setIsOpen(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative rounded-t-3xl p-5 shadow-2xl"
                        style={{ background: 'var(--bg-primary)', animation: 'chatSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>ちょっと寄り道</h3>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>今いる場所の周辺でAIが厳選</p>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="p-2 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                                <X size={16} style={{ color: 'var(--text-muted)' }} />
                            </button>
                        </div>

                        {loading && (
                            <div className="flex flex-col items-center py-8 gap-3">
                                <Loader2 size={24} className="animate-spin text-amber-400" />
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>周辺スポットを探しています...</p>
                            </div>
                        )}

                        {error && <p className="text-sm text-center py-4 text-red-400">{error}</p>}

                        <div className="space-y-3 max-h-72 overflow-y-auto">
                            {suggestions.map(({ spot, reason, walkMinutes }, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl border transition-all"
                                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                        <MapPin size={16} className="text-amber-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{spot.name}</p>
                                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{reason} · 徒歩{walkMinutes}分</p>
                                    </div>
                                    <button
                                        onClick={() => { onAddDetour(spot); setIsOpen(false); }}
                                        className="shrink-0 w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center transition-all active:scale-90"
                                    >
                                        <Plus size={14} className="text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
                    </div>
                </div>
            )}
        </>
    );
}
