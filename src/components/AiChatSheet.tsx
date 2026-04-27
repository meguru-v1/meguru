import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, MessageCircle } from 'lucide-react';
import type { Course, Spot } from '../types';

const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL as string
    || 'https://asia-northeast1-project-6f8c0b7f-7452-4e63-a48.cloudfunctions.net/gemini-proxy';

interface Message {
    role: 'user' | 'ai';
    text: string;
    loading?: boolean;
}

interface AiChatSheetProps {
    isOpen: boolean;
    onClose: () => void;
    course: Course | null;
    focusedSpot: Spot | null;
}

export default function AiChatSheet({ isOpen, onClose, course, focusedSpot }: AiChatSheetProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // 初回メッセージ
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            const spot = focusedSpot || course?.spots[0];
            const greeting = spot
                ? `こんにちは！私はAI旅ガイドです。「${spot.name}」について、または「${course?.title}」コースのことなら何でも聞いてください！`
                : `こんにちは！AI旅ガイドです。このコースについて何でもお気軽に質問どうぞ。`;
            setMessages([{ role: 'ai', text: greeting }]);
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
    }, [isOpen]);

    const buildSystemContext = useCallback((): string => {
        const spotInfo = focusedSpot
            ? `現在注目中のスポット: ${focusedSpot.name}（${focusedSpot.category}）`
            : '';
        const courseInfo = course
            ? `コースタイトル: ${course.title}\nスポット一覧: ${course.spots.map(s => s.name).join('、')}`
            : '';
        return `あなたは親切でユーモアのある日本の旅行ガイドAIです。
ユーザーが今まさに旅をしているか計画中です。
${courseInfo}
${spotInfo}
・質問に対して簡潔（3〜5文）かつ具体的に答えてください。
・地元のプロが教えるような、一般的すぎない情報を提供してください。
・絵文字を適度に使い、フレンドリーなトーンで。
・場所の歴史・穴場情報・ベストな時間帯・食べ物・アクセス・混雑などに詳しいです。`;
    }, [course, focusedSpot]);

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || isSending) return;
        setInput('');
        setIsSending(true);

        const userMsg: Message = { role: 'user', text };
        const loadingMsg: Message = { role: 'ai', text: '', loading: true };
        setMessages(prev => [...prev, userMsg, loadingMsg]);

        try {
            const history = messages
                .filter(m => !m.loading)
                .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`)
                .join('\n');

            const prompt = `${buildSystemContext()}\n\n会話履歴:\n${history}\n\nユーザー: ${text}\n\nAI:`;

            const res = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, model: 'gemini-2.5-flash-lite', jsonMode: false }),
            });
            const data = await res.json();
            const reply = data.text || '申し訳ありません、うまく答えられませんでした。';
            setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'ai', text: reply } : m));
        } catch {
            setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { role: 'ai', text: 'エラーが発生しました。もう一度お試しください。' } : m));
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[800] flex flex-col justify-end" onClick={onClose}>
            {/* オーバーレイ */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

            {/* チャットシート */}
            <div
                className="relative flex flex-col rounded-t-3xl overflow-hidden shadow-2xl"
                style={{
                    background: 'var(--bg-primary)',
                    height: '75dvh',
                    animation: 'chatSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* ヘッダー */}
                <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-400/10 flex items-center justify-center">
                            <Sparkles size={16} className="text-amber-500" />
                        </div>
                        <div>
                            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>AI旅ガイド</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                {focusedSpot ? focusedSpot.name : course?.title || 'あなたの旅をサポート'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={18} style={{ color: 'var(--text-muted)' }} />
                    </button>
                </div>

                {/* メッセージ一覧 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'ai' && (
                                <div className="w-6 h-6 rounded-lg bg-amber-400 flex items-center justify-center mr-2 mt-1 shrink-0">
                                    <Sparkles size={12} className="text-white" />
                                </div>
                            )}
                            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-slate-900 text-white rounded-tr-sm'
                                    : 'rounded-tl-sm'
                            }`} style={msg.role === 'ai' ? {
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-default)',
                            } : {}}>
                                {msg.loading ? (
                                    <div className="flex items-center gap-1.5">
                                        {[0,1,2].map(i => (
                                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
                                                style={{ animationDelay: `${i * 0.15}s` }} />
                                        ))}
                                    </div>
                                ) : msg.text}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* クイック質問 */}
                {messages.length === 1 && (
                    <div className="shrink-0 px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
                        {['歴史を教えて', 'ベストな時間は？', '周辺のランチ', '混雑状況は？'].map(q => (
                            <button key={q} onClick={() => { setInput(q); setTimeout(sendMessage, 0); }}
                                className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors"
                                style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
                                {q}
                            </button>
                        ))}
                    </div>
                )}

                {/* 入力エリア */}
                <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-t"
                    style={{ borderColor: 'var(--border-default)', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}>
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        placeholder="何でも聞いてください..."
                        className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1.5px solid var(--border-input)' }}
                    />
                    <button onClick={sendMessage} disabled={!input.trim() || isSending}
                        className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center transition-all active:scale-90 disabled:opacity-40">
                        {isSending ? <Loader2 size={16} className="text-white animate-spin" /> : <Send size={16} className="text-white" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
