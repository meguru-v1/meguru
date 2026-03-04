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

const saveFavorites = (favorites: Course[]): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch (e) {
        console.error('Failed to save favorites:', e);
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
