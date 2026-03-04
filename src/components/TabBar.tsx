import React from 'react';
import { Search, Footprints, Map, Heart } from 'lucide-react';
import type { TabId } from '../types';

interface TabBarProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
    coursesCount: number;
    favoritesCount: number;
}

interface TabConfig {
    id: TabId;
    label: string;
    Icon: React.ElementType;
}

const TABS: TabConfig[] = [
    { id: 'search', label: '検索', Icon: Search },
    { id: 'courses', label: 'モデルコース', Icon: Footprints },
    { id: 'map', label: '地図', Icon: Map },
    { id: 'favorites', label: '履歴', Icon: Heart },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange, coursesCount, favoritesCount }) => {
    return (
        <nav className="shrink-0 z-[600] px-3 pb-2" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))' }}>
            <div className="rounded-2xl overflow-hidden"
                style={{
                    background: 'linear-gradient(135deg, rgba(26,26,46,0.92), rgba(22,33,62,0.88))',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    boxShadow: '0 -4px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.06)'
                }}>
                <div className="flex items-stretch">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.id;
                        const badge = tab.id === 'courses' ? coursesCount : tab.id === 'favorites' ? favoritesCount : 0;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-3 px-1 transition-all duration-300 ease-out
                                    ${isActive ? '' : 'opacity-40 hover:opacity-70 active:scale-90'}`}
                                aria-label={tab.label}
                            >
                                {/* active glow */}
                                {isActive && (
                                    <span className="absolute inset-x-3 top-0 h-[2px] rounded-b-full"
                                        style={{
                                            background: 'linear-gradient(90deg, transparent, #e2b040, transparent)',
                                            animation: 'slideDownIndicator 0.25s ease-out'
                                        }} />
                                )}

                                {/* icon */}
                                <span className={`relative flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-300
                                    ${isActive ? 'scale-110' : ''}`}
                                    style={isActive ? {
                                        background: 'rgba(226,176,64,0.15)',
                                    } : {}}>
                                    <tab.Icon
                                        size={isActive ? 20 : 18}
                                        strokeWidth={isActive ? 2.5 : 1.5}
                                        className="transition-all duration-200"
                                        style={{ color: isActive ? '#e2b040' : 'rgba(255,255,255,0.7)' }}
                                    />
                                    {badge > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none text-primary"
                                            style={{ background: 'linear-gradient(135deg, #e2b040, #f5d98b)' }}>
                                            {badge > 99 ? '99+' : badge}
                                        </span>
                                    )}
                                </span>

                                <span className={`text-[10px] font-semibold tracking-tight transition-all duration-200
                                    ${isActive ? 'text-accent opacity-100' : 'text-white/60 opacity-60'}`}>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
};

export default TabBar;
