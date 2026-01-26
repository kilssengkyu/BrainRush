import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Howl, Howler } from 'howler';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Increase Audio Pool globally
Howler.html5PoolSize = 50;

// Define available sound keys
export type SoundType = 'click' | 'hover' | 'win' | 'lose' | 'countdown' | 'match_found' | 'tick' | 'error' | 'level_complete' | 'correct';
export type BGMType = 'bgm_main' | 'bgm_game';

interface SoundContextType {
    playSound: (type: SoundType) => void;
    playBGM: (type: BGMType) => void;
    stopBGM: () => void;
    isMuted: boolean;
    toggleMute: () => void;
    volume: number;
    setVolume: (vol: number) => void;
    bgmVolume: number;
    setBGMVolume: (vol: number) => void;
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

// Map sound keys to file paths
const SOUND_FILES: Record<SoundType, string> = {
    click: '/sounds/click_002.ogg',
    hover: '/sounds/select_001.ogg',
    win: '/sounds/confirmation_001.ogg',
    lose: '/sounds/error_001.ogg',
    countdown: '/sounds/tick_001.ogg',
    match_found: '/sounds/maximize_001.ogg',
    tick: '/sounds/tick_001.ogg',
    error: '/sounds/error_006.ogg',
    level_complete: '/sounds/confirmation_001.ogg',
    correct: '/sounds/confirmation_002.ogg',
};

// Separate BGM Files
const BGM_FILES: Record<BGMType, string> = {
    bgm_main: '/sounds/bgm_main.mp3',
    bgm_game: '/sounds/bgm_game.mp3'
};

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const resumeAudioContext = useCallback(() => {
        const ctx = Howler.ctx;
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => undefined);
        }
    }, []);

    const [isMuted, setIsMuted] = useState<boolean>(() => {
        const saved = localStorage.getItem('sound_muted');
        return saved === 'true';
    });

    const [volume, setVolumeState] = useState<number>(() => {
        const saved = localStorage.getItem('sound_volume');
        return saved ? parseFloat(saved) : 0.5;
    });

    const [bgmVolume, setBGMVolumeState] = useState<number>(() => {
        const saved = localStorage.getItem('bgm_volume');
        return saved ? parseFloat(saved) : 0.3; // Lower default for BGM
    });

    const [isVibrationEnabled, setIsVibrationEnabled] = useState<boolean>(() => {
        const saved = localStorage.getItem('vibration_enabled');
        return saved !== 'false';
    });

    const [sounds, setSounds] = useState<Record<SoundType, Howl | null>>({
        click: null, hover: null, win: null, lose: null,
        countdown: null, match_found: null, tick: null, error: null, level_complete: null, correct: null
    });

    // We manage BGM separately securely to control fading
    const bgmRef = useRef<Record<BGMType, Howl | null>>({
        bgm_main: null,
        bgm_game: null
    });

    const currentBGM = useRef<BGMType | null>(null);

    // Attempt to resume audio context on first user interaction.
    useEffect(() => {
        const unlock = () => {
            resumeAudioContext();
        };

        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });

        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };
    }, [resumeAudioContext]);

    // Initialize Sounds
    useEffect(() => {
        const loadedSounds: any = {};
        Object.entries(SOUND_FILES).forEach(([key, src]) => {
            loadedSounds[key] = new Howl({
                src: [src],
                format: ['ogg', 'mp3'],
                html5: false, // Force Web Audio for SFX
                pool: 2,
                volume: volume,
                preload: true
            });
        });
        setSounds(loadedSounds);

        // Initialize BGM
        Object.entries(BGM_FILES).forEach(([key, src]) => {
            const bgm = new Howl({
                src: [src],
                format: ['mp3', 'ogg'],
                html5: true,
                pool: 1,
                loop: true,
                volume: 0,
                preload: true,
                onload: () => console.log(`[BGM] Loaded: ${key}`),
                onloaderror: (_id, err) => console.error(`[BGM] Load Error: ${key}`, err),
            });
            bgm.on('playerror', (_id, err) => {
                console.error(`[BGM] Play Error: ${key}`, err);
                const ctx = Howler.ctx;
                if (ctx && ctx.state === 'suspended') {
                    ctx.resume().catch(() => undefined);
                }
                bgm.once('unlock', () => bgm.play());
            });
            bgmRef.current[key as BGMType] = bgm;
        });

        return () => {
            Object.values(loadedSounds).forEach((s: any) => s.unload());
            Object.values(bgmRef.current).forEach((s: any) => s?.unload());
        };
    }, []);

    // Effect for SFX Volume/Mute
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

    // Effect for BGM Volume/Mute
    useEffect(() => {
        localStorage.setItem('bgm_volume', String(bgmVolume));

        const currentType = currentBGM.current;
        if (currentType && bgmRef.current[currentType]) {
            const sound = bgmRef.current[currentType];
            if (sound) {
                sound.mute(isMuted);
                // Only update volume if it's not fading. 
                // Simple approach: just update globally, fading will end at this target.
                if (!isMuted) sound.volume(bgmVolume);
            }
        }
    }, [isMuted, bgmVolume]);


    const triggerHaptic = async (type: SoundType) => {
        if (!isVibrationEnabled) return;
        try {
            switch (type) {
                case 'click': case 'hover': case 'tick':
                    await Haptics.impact({ style: ImpactStyle.Light });
                    break;
                case 'match_found': case 'correct': case 'level_complete':
                    await Haptics.notification({ type: NotificationType.Success });
                    break;
                case 'error': case 'lose':
                    await Haptics.notification({ type: NotificationType.Error });
                    break;
                case 'win':
                    await Haptics.vibrate({ duration: 200 });
                    break;
            }
        } catch (error) {
            // Ignore haptic errors
        }
    };

    const playSound = useCallback((type: SoundType) => {
        triggerHaptic(type);
        resumeAudioContext();
        if (isMuted) return;

        const sound = sounds[type];
        if (sound) {
            sound.seek(0);
            sound.play();
        }
    }, [isMuted, sounds, isVibrationEnabled]);

    const playBGM = useCallback((type: BGMType) => {
        resumeAudioContext();
        if (currentBGM.current === type) return; // Already playing this track

        console.log(`[BGM] Switching to: ${type}`);

        // Fade out current
        if (currentBGM.current) {
            const oldSound = bgmRef.current[currentBGM.current];
            if (oldSound) {
                oldSound.fade(oldSound.volume(), 0, 1000);
                setTimeout(() => {
                    if (currentBGM.current !== type) oldSound.stop();
                }, 1000);
            }
        }

        // Fade in new
        currentBGM.current = type;
        const newSound = bgmRef.current[type];
        if (newSound) {
            newSound.mute(isMuted);
            newSound.stop();
            newSound.volume(0);
            const id = newSound.play();
            console.log(`[BGM] Play triggered for ${type}, ID: ${id}, Muted: ${isMuted}, TargetVol: ${bgmVolume}`);

            if (!isMuted) {
                newSound.fade(0, bgmVolume, 1000);
            }
        }
    }, [bgmVolume, isMuted]);

    const stopBGM = useCallback(() => {
        if (currentBGM.current) {
            const sound = bgmRef.current[currentBGM.current];
            if (sound) {
                sound.fade(sound.volume(), 0, 1000);
                setTimeout(() => sound.stop(), 1000);
            }
            currentBGM.current = null;
        }
    }, []);

    const toggleMute = () => setIsMuted(prev => !prev);
    const setVolume = (vol: number) => setVolumeState(Math.max(0, Math.min(1, vol)));
    const setBGMVolume = (vol: number) => setBGMVolumeState(Math.max(0, Math.min(1, vol)));
    const toggleVibration = () => setIsVibrationEnabled(prev => !prev);

    return (
        <SoundContext.Provider value={{
            playSound, playBGM, stopBGM,
            isMuted, toggleMute,
            volume, setVolume,
            bgmVolume, setBGMVolume,
            isVibrationEnabled, toggleVibration
        }}>
            {children}
        </SoundContext.Provider>
    );
};
