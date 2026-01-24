import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Howl } from 'howler';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Define available sound keys
export type SoundType = 'click' | 'hover' | 'win' | 'lose' | 'countdown' | 'match_found' | 'tick' | 'bgm_main' | 'error' | 'level_complete' | 'correct';

interface SoundContextType {
    playSound: (type: SoundType) => void;
    isMuted: boolean;
    toggleMute: () => void;
    volume: number;
    setVolume: (vol: number) => void;
    isVibrationEnabled: boolean;
    toggleVibration: () => void;
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
const SOUND_FILES: Record<SoundType, string> = {
    click: '/sounds/click_002.ogg',
    hover: '/sounds/select_001.ogg',
    win: '/sounds/confirmation_001.ogg',
    lose: '/sounds/error_001.ogg',
    countdown: '/sounds/tick_001.ogg',
    match_found: '/sounds/maximize_001.ogg',
    tick: '/sounds/tick_001.ogg',
    bgm_main: '/sounds/back_001.ogg',
    error: '/sounds/error_006.ogg',
    level_complete: '/sounds/confirmation_001.ogg',
    correct: '/sounds/confirmation_002.ogg',
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

    const [isVibrationEnabled, setIsVibrationEnabled] = useState<boolean>(() => {
        const saved = localStorage.getItem('vibration_enabled');
        return saved !== 'false'; // Default to true
    });

    const [sounds, setSounds] = useState<Record<SoundType, Howl | null>>({
        click: null, hover: null, win: null, lose: null,
        countdown: null, match_found: null, tick: null, bgm_main: null, error: null, level_complete: null, correct: null
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

    // Effect for Volume/Mute/Vibration changes
    useEffect(() => {
        localStorage.setItem('sound_muted', String(isMuted));
        localStorage.setItem('sound_volume', String(volume));
        localStorage.setItem('vibration_enabled', String(isVibrationEnabled));

        Object.values(sounds).forEach(sound => {
            if (sound) {
                sound.mute(isMuted);
                sound.volume(volume);
            }
        });

    }, [isMuted, volume, isVibrationEnabled, sounds]);

    const triggerHaptic = async (type: SoundType) => {
        if (!isVibrationEnabled) return;

        try {
            switch (type) {
                case 'click':
                case 'hover':
                case 'tick':
                    await Haptics.impact({ style: ImpactStyle.Light });
                    break;
                case 'match_found':
                case 'correct':
                case 'level_complete':
                    await Haptics.notification({ type: NotificationType.Success });
                    break;
                case 'error':
                case 'lose':
                    await Haptics.notification({ type: NotificationType.Error });
                    break;
                case 'win':
                    await Haptics.vibrate({ duration: 200 });
                    break;
                default:
                    break;
            }
        } catch (error) {
            // Haptics might fail on web or unsupported devices, ignore safely
            console.debug('Haptic feedback failed or unsupported:', error);
        }
    };

    const playSound = useCallback((type: SoundType) => {
        // Trigger Haptics regardless of mute status (unless we want them linked)
        // Usually vibration is separate setting.
        triggerHaptic(type);

        if (isMuted) return;
        const sound = sounds[type];
        if (sound) {
            sound.seek(0); 
            sound.play();
        }
    }, [isMuted, sounds, isVibrationEnabled]);

    const toggleMute = () => setIsMuted(prev => !prev);
    const setVolume = (vol: number) => setVolumeState(Math.max(0, Math.min(1, vol)));
    const toggleVibration = () => setIsVibrationEnabled(prev => !prev);

    return (
        <SoundContext.Provider value={{ playSound, isMuted, toggleMute, volume, setVolume, isVibrationEnabled, toggleVibration }}>
            {children}
        </SoundContext.Provider>
    );
};
