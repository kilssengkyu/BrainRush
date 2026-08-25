import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { motion } from 'framer-motion';
import { Gamepad2, Palette, RotateCcw, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

const NOTICE_STORAGE_KEY = 'brainrush_visual_theme_notice_v1';

const ThemeUpdateNotice = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { setThemePreference, setVisualTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (location.pathname !== '/') {
            setIsOpen(false);
            return;
        }

        try {
            setIsOpen(window.localStorage.getItem(NOTICE_STORAGE_KEY) !== 'seen');
        } catch {
            setIsOpen(true);
        }
    }, [location.pathname]);

    const dismiss = () => {
        try {
            window.localStorage.setItem(NOTICE_STORAGE_KEY, 'seen');
        } catch {
            // Storage can be unavailable in privacy-restricted webviews.
        }
        setIsOpen(false);
    };

    const usePlayful = () => {
        flushSync(dismiss);
        setVisualTheme('playful');
        setThemePreference('light');
    };

    const useClassic = () => {
        flushSync(dismiss);
        setVisualTheme('classic');
        setThemePreference('dark');
    };

    const openSettings = () => {
        flushSync(dismiss);
        navigate('/settings');
    };

    if (!isOpen) return null;

    return (
        <motion.div
            className="theme-update-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-update-title"
        >
            <motion.div
                className="theme-update-card"
                initial={{ y: 28, scale: 0.94, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 25 }}
            >
                <div className="theme-update-confetti" aria-hidden="true"><span /><span /><span /></div>
                <div className="theme-update-icon" aria-hidden="true"><Gamepad2 /><Sparkles /></div>
                <div className="theme-update-kicker"><Palette size={14} />{t('themeUpdate.kicker', 'NEW THEME')}</div>
                <h2 id="theme-update-title">{t('themeUpdate.title', 'A new theme has arrived in BrainRush!')}</h2>
                <p>{t('themeUpdate.description', 'Thank you for continuing to play BrainRush! You can switch between the new and classic themes anytime in Settings.')}</p>
                <div className="theme-update-actions">
                    <button type="button" className="theme-update-primary" onClick={usePlayful}><Sparkles size={18} />{t('themeUpdate.confirm', 'Try the new theme')}</button>
                    <button type="button" className="theme-update-classic" onClick={useClassic}><RotateCcw size={17} />{t('themeUpdate.useClassic', 'Return to classic theme')}</button>
                    <button type="button" className="theme-update-settings" onClick={openSettings}>{t('themeUpdate.openSettings', 'Choose in Settings')}</button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ThemeUpdateNotice;
