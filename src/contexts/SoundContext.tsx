import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Howl } from 'howler';

// Define available sound keys
export type SoundType = 'click' | 'hover' | 'win' | 'lose' | 'countdown' | 'match_found' | 'tick' | 'bgm_main';

interface SoundContextType {
    playSound: (type: SoundType) => void;
    isMuted: boolean;
    toggleMute: () => void;
    volume: number;
    setVolume: (vol: number) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export const useSound = () => {
    const context = useContext(SoundContext);
    if (!context) {
        throw new Error('useSound must be used within a SoundProvider');
    }
    return context;
};

// Map sound keys to file paths (Assumes files are in /public/sounds/)
// You will need to add these files later!
const SOUND_FILES: Record<SoundType, string> = {
    click: '/sounds/click_002.ogg',
    hover: '/sounds/select_001.ogg',
    win: '/sounds/confirmation_001.ogg',
    lose: '/sounds/error_001.ogg',
    countdown: '/sounds/tick_001.ogg',
    match_found: '/sounds/maximize_001.ogg',
    tick: '/sounds/tick_001.ogg',
    bgm_main: '/sounds/back_001.ogg',
};

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isMuted, setIsMuted] = useState<boolean>(() => {
        const saved = localStorage.getItem('sound_muted');
        return saved === 'true';
    });

    const [volume, setVolumeState] = useState<number>(() => {
        const saved = localStorage.getItem('sound_volume');
        return saved ? parseFloat(saved) : 0.5;
    });

    const [sounds, setSounds] = useState<Record<SoundType, Howl | null>>({
        click: null, hover: null, win: null, lose: null,
        countdown: null, match_found: null, tick: null, bgm_main: null
    });

    // Initialize Sounds
    useEffect(() => {
        const loadedSounds: any = {};

        Object.entries(SOUND_FILES).forEach(([key, src]) => {
            loadedSounds[key] = new Howl({
                src: [src],
                format: ['ogg'],
                volume: volume,
                preload: true,
                onload: () => console.log(`[Sound] Loaded: ${key}`),
                onloaderror: (_id, err) => console.error(`[Sound] Load Error: ${key}`, err),
                onplayerror: (_id, err) => console.error(`[Sound] Play Error: ${key}`, err),
            });
        });

        setSounds(loadedSounds);

        // Cleanup
        return () => {
            Object.values(loadedSounds).forEach((s: any) => s.unload());
        };
    }, []);

    // Effect for Volume/Mute changes
    useEffect(() => {
        localStorage.setItem('sound_muted', String(isMuted));
        localStorage.setItem('sound_volume', String(volume));

        // Update Howler global volume safely
        // Note: Howler.volume() sets global volume. 
        // If we want individual control, we'd update each instance.
        // For simplicity, we keep it global or update instances.

        Object.values(sounds).forEach(sound => {
            if (sound) {
                sound.mute(isMuted);
                sound.volume(volume);
            }
        });

    }, [isMuted, volume, sounds]);

    const playSound = useCallback((type: SoundType) => {
        if (isMuted) return;
        const sound = sounds[type];
        if (sound) {
            sound.seek(0); // Restart if already playing (for rapid clicks)
            sound.play();
        }
    }, [isMuted, sounds]);

    const toggleMute = () => setIsMuted(prev => !prev);
    const setVolume = (vol: number) => setVolumeState(Math.max(0, Math.min(1, vol)));

    return (
        <SoundContext.Provider value={{ playSound, isMuted, toggleMute, volume, setVolume }}>
            {children}
        </SoundContext.Provider>
    );
};
