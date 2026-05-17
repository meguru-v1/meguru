import React, { useEffect, useState } from 'react';
import { Clock, MapPin, X, History as HistoryIcon } from 'lucide-react';
import type { Course } from '../types';
import { getHistory, removeHistory, type HistoryEntry } from '../lib/history';

interface HistorySectionProps {
    onSelect: (course: Course) => void;
    refreshKey?: number;
}

const formatRelative = (ts: number): string => {
    const diffMs = Date.now() - ts;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}時間前`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}日前`;
    return new Date(ts).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
};

const HistorySection: React.FC<HistorySectionProps> = ({ onSelect, refreshKey }) => {
    const [entries, setEntries] = useState<HistoryEntry[]>([]);

    useEffect(() => {
        setEntries(getHistory());
    }, [refreshKey]);

    const handleRemove = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        removeHistory(id);
        setEntries(getHistory());
    };

    if (entries.length === 0) return null;

    return (
        <div className="px-4 mt-2 mb-1 animate-fade-in">
            <div className="flex items-center gap-2 mb-2.5">
                <HistoryIcon size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    最近見たコース
                </span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
                {entries.map(entry => (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => onSelect(entry.course)}
                        className="shrink-0 w-[180px] rounded-xl overflow-hidden text-left transition-all active:scale-95 group relative"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                    >
                        <div className="relative h-20 overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                            {entry.thumbnailUrl ? (
                                <img
                                    src={entry.thumbnailUrl}
                                    alt={entry.course.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center"
                                    style={{
                                        background: `linear-gradient(135deg, #f7f3eb 0%, #e8dcc4 100%)`,
                                    }}>
                                    <span className="text-2xl opacity-30 font-serif" style={{ color: 'var(--wa-sumi)' }}>◯</span>
                                </div>
                            )}
                            <div
                                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 transition-opacity"
                                style={{ background: 'rgba(0,0,0,0.5)', color: 'white' }}
                                onClick={(e) => handleRemove(e, entry.id)}
                                role="button"
                                aria-label="履歴から削除"
                            >
                                <X size={12} />
                            </div>
                        </div>
                        <div className="p-2.5">
                            <h4 className="text-[12px] font-bold leading-tight line-clamp-1 mb-1" style={{ color: 'var(--text-primary)' }}>
                                {entry.course.title}
                            </h4>
                            <p className="text-[10px] line-clamp-1 mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                {entry.query}
                            </p>
                            <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                <span className="flex items-center gap-0.5"><Clock size={9} />{entry.course.totalTime}分</span>
                                <span className="flex items-center gap-0.5"><MapPin size={9} />{entry.course.spots.length}</span>
                                <span className="ml-auto">{formatRelative(entry.viewedAt)}</span>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default HistorySection;
