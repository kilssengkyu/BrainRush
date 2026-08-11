import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light';
export type ThemePreference = ThemeMode | 'system';
export type VisualTheme = 'playful' | 'classic';

interface ThemeContextType {
    themeMode: ThemeMode;
    themePreference: ThemePreference;
    setThemePreference: (preference: ThemePreference) => void;
    visualTheme: VisualTheme;
    setVisualTheme: (theme: VisualTheme) => void;
}

const THEME_STORAGE_KEY = 'brainrush_theme_preference';
const VISUAL_THEME_STORAGE_KEY = 'brainrush_visual_theme';

const getSystemThemeMode = (): ThemeMode => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const getInitialThemePreference = (): ThemePreference => {
    if (typeof window === 'undefined') return 'dark';

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;

    return 'dark';
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [themePreference, setThemePreference] = useState<ThemePreference>(getInitialThemePreference);
    const [systemThemeMode, setSystemThemeMode] = useState<ThemeMode>(getSystemThemeMode);
    const [visualTheme, setVisualTheme] = useState<VisualTheme>(() => {
        if (typeof window === 'undefined') return 'playful';
        return window.localStorage.getItem(VISUAL_THEME_STORAGE_KEY) === 'classic' ? 'classic' : 'playful';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const media = window.matchMedia('(prefers-color-scheme: light)');
        const handleChange = () => {
            setSystemThemeMode(media.matches ? 'light' : 'dark');
        };

        handleChange();
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);

    const themeMode: ThemeMode = themePreference === 'system' ? systemThemeMode : themePreference;

    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('dark', themeMode === 'dark');
        root.style.colorScheme = themeMode;
        window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    }, [themeMode, themePreference]);

    useEffect(() => {
        document.documentElement.dataset.visualTheme = visualTheme;
        window.localStorage.setItem(VISUAL_THEME_STORAGE_KEY, visualTheme);
    }, [visualTheme]);

    const value = useMemo(
        () => ({
            themeMode,
            themePreference,
            setThemePreference,
            visualTheme,
            setVisualTheme,
        }),
        [themeMode, themePreference, visualTheme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
