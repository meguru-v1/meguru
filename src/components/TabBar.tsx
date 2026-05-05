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
        <nav className="shrink-0 z-[600]"
            style={{
                background: 'var(--nav-bg)',
                borderTop: '1px solid var(--nav-border)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                paddingBottom: 'max(4px, env(safe-area-inset-bottom, 0px))',
            }}>
            <div className="flex items-stretch">
                {TABS.map(tab => {
                    const isActive = activeTab === tab.id;
                    const badge = tab.id === 'courses' ? coursesCount : tab.id === 'favorites' ? favoritesCount : 0;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-all duration-200
                                ${isActive ? '' : 'opacity-40 hover:opacity-70 active:scale-90'}`}
                            aria-label={tab.label}
                        >
                            {isActive && (
                                <span className="absolute inset-x-4 top-0 h-[2px] rounded-b-full"
                                    style={{
                                        background: 'var(--wa-accent)',
                                        animation: 'slideDownIndicator 0.2s ease-out',
                                    }} />
                            )}
                            <span className={`relative flex items-center justify-center w-10 h-7 rounded-lg transition-all duration-200`}
                                style={isActive ? { background: 'rgba(196, 151, 47, 0.08)' } : {}}>
                                <tab.Icon size={isActive ? 20 : 18} strokeWidth={isActive ? 2.5 : 1.5}
                                    style={{ color: isActive ? 'var(--wa-accent)' : 'var(--text-muted)', transition: 'all 0.2s' }} />
                                {badge > 0 && (
                                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none text-white"
                                        style={{ background: 'var(--wa-accent)' }}>
                                        {badge > 99 ? '99+' : badge}
                                    </span>
                                )}
                            </span>
                            <span className="text-[10px] font-semibold tracking-tight"
                                style={{ color: isActive ? 'var(--wa-accent)' : 'var(--text-muted)' }}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default TabBar;
