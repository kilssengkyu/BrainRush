import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSound } from '../../contexts/SoundContext';

const BGMManager = () => {
    const location = useLocation();
    const { playBGM } = useSound();

    useEffect(() => {
        const path = location.pathname;

        // Game Routes -> Battle Music
        if (path.startsWith('/game/') || path.startsWith('/practice')) {
            playBGM('bgm_game');
        }
        // Menu Routes -> Main Theme
        else if (path === '/' || path === '/home' || path === '/profile' || path === '/settings' || path === '/login') {
            playBGM('bgm_main');
        }
        // Fallback (e.g. 404 or unknown) -> Keep playing main or do nothing
        else {
            playBGM('bgm_main');
        }

        // Cleanup? No, we let the next route handle the switch.
        // But if we unmount completely (app close), sound stops via Context.
    }, [location.pathname, playBGM]);

    return null;
};

export default BGMManager;
