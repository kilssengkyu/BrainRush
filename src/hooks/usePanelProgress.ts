import { useState, useCallback, useRef } from 'react';

/**
 * A drop-in replacement for `useState(0)` that persists the progress counter
 * to sessionStorage so that mini-games can resume after a page reload / app
 * crash / navigation away and back.
 *
 * Usage:
 *   const [panelIndex, setPanelIndex] = usePanelProgress(seed);
 *
 * The stored value is automatically keyed by the seed so it resets for a new
 * round (which has a different seed).
 */
export function usePanelProgress(
    seed: string | null,
    varName: string = 'p',
    defaultValue: number = 0
): [number, (v: number | ((prev: number) => number)) => void] {
    const storageKey = seed ? `gp:${seed}:${varName}` : null;

    const [value, setValueRaw] = useState<number>(() => {
        if (!storageKey) return defaultValue;
        try {
            const saved = sessionStorage.getItem(storageKey);
            return saved !== null ? parseInt(saved, 10) : defaultValue;
        } catch {
            return defaultValue;
        }
    });

    // Keep a ref so the setter closure always has the latest value
    const valueRef = useRef(value);
    valueRef.current = value;

    const setValue = useCallback(
        (v: number | ((prev: number) => number)) => {
            setValueRaw((prev) => {
                const next = typeof v === 'function' ? v(prev) : v;
                if (storageKey) {
                    try {
                        sessionStorage.setItem(storageKey, String(next));
                    } catch {
                        // quota exceeded – acceptable to ignore
                    }
                }
                return next;
            });
        },
        [storageKey]
    );

    return [value, setValue];
}

/**
 * Clear all game-progress keys from sessionStorage.
 * Call this on round transitions.
 */
export function clearGameProgress() {
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key?.startsWith('gp:')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
        // ignore
    }
}
