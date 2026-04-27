import { useState, useCallback } from 'react';
import type { Course } from '../types';

const STORAGE_KEY = 'meguru_favorites';

const loadFavorites = (): Course[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as Course[];
    } catch {
        return [];
    }
};

const MAX_FAVORITES = 50; // 保存上限

const saveFavorites = (favorites: Course[]): void => {
    try {
        // 上限を超えた場合、古い項目を自動削除
        const trimmed = favorites.slice(0, MAX_FAVORITES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e: any) {
        // QuotaExceededError: 容量超過時は古い項目を削除してリトライ
        if (e?.name === 'QuotaExceededError' || e?.code === 22) {
            console.warn('localStorage quota exceeded. Trimming old favorites...');
            try {
                const reduced = favorites.slice(0, Math.max(10, Math.floor(favorites.length / 2)));
                localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
            } catch {
                console.error('Failed to save favorites even after trimming.');
            }
        } else {
            console.error('Failed to save favorites:', e);
        }
    }
};

interface UseFavoritesReturn {
    favorites: Course[];
    addFavorite: (course: Course) => void;
    removeFavorite: (courseId: string) => void;
    isFavorite: (courseId: string) => boolean;
}

export const useFavorites = (): UseFavoritesReturn => {
    const [favorites, setFavorites] = useState<Course[]>(loadFavorites);

    const addFavorite = useCallback((course: Course) => {
        setFavorites(prev => {
            if (prev.some(f => f.id === course.id)) return prev;
            const updated = [{ ...course, savedAt: new Date().toISOString() }, ...prev];
            saveFavorites(updated);
            return updated;
        });
    }, []);

    const removeFavorite = useCallback((courseId: string) => {
        setFavorites(prev => {
            const updated = prev.filter(f => f.id !== courseId);
            saveFavorites(updated);
            return updated;
        });
    }, []);

    const isFavorite = useCallback((courseId: string): boolean => {
        return favorites.some(f => f.id === courseId);
    }, [favorites]);

    return { favorites, addFavorite, removeFavorite, isFavorite };
};
