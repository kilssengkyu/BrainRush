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
    if (typeof window === 'undefined') return 'light';

    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
    } catch {
        // Storage can be unavailable in privacy-restricted webviews.
    }

    return 'light';
};

const getInitialVisualTheme = (): VisualTheme => {
    if (typeof window === 'undefined') return 'playful';

    try {
        return window.localStorage.getItem(VISUAL_THEME_STORAGE_KEY) === 'classic' ? 'classic' : 'playful';
    } catch {
        return 'playful';
    }
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [themePreference, setThemePreference] = useState<ThemePreference>(getInitialThemePreference);
    const [systemThemeMode, setSystemThemeMode] = useState<ThemeMode>(getSystemThemeMode);
    const [visualTheme, setVisualTheme] = useState<VisualTheme>(getInitialVisualTheme);

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

    const effectiveThemePreference: ThemePreference = visualTheme === 'playful' ? 'light' : themePreference;
    const themeMode: ThemeMode = effectiveThemePreference === 'system' ? systemThemeMode : effectiveThemePreference;

    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('dark', themeMode === 'dark');
        root.style.colorScheme = themeMode;
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
        } catch {
            // Keep the active theme usable even when storage is unavailable.
        }
    }, [themeMode, themePreference]);

    useEffect(() => {
        document.documentElement.dataset.visualTheme = visualTheme;
        try {
            window.localStorage.setItem(VISUAL_THEME_STORAGE_KEY, visualTheme);
        } catch {
            // Keep the active theme usable even when storage is unavailable.
        }
    }, [visualTheme]);

    const value = useMemo(
        () => ({
            themeMode,
            themePreference: effectiveThemePreference,
            setThemePreference,
            visualTheme,
            setVisualTheme,
        }),
        [effectiveThemePreference, themeMode, visualTheme]
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
