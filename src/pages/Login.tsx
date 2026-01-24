import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useSound } from '../contexts/SoundContext';
import { User, Loader2, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Login = () => {
    const { signInWithGoogle, signInAnonymously, user } = useAuth();
    const { playSound } = useSound();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Redirect if already logged in (handles Deep Link return)
    useEffect(() => {
        if (user) {
            navigate('/');
        }
    }, [user, navigate]);

    const handleGoogleLogin = async () => {
        playSound('click');
        setIsLoggingIn(true);
        try {
            await signInWithGoogle();
        } catch (error) {
            console.error(error);
            setIsLoggingIn(false);
        }
    };

    const handleGuestLogin = async () => {
        console.log('Guest login clicked');
        playSound('click');
        setIsLoggingIn(true);
        try {
            await signInAnonymously();
            navigate('/');
        } catch (error) {
            console.error(error);
            setIsLoggingIn(false);
        }
    };

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-gray-900 to-black pointer-events-none" />
            <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[80%] bg-blue-600/10 rounded-full blur-3xl animate-pulse pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="z-10 w-full max-w-md bg-gray-800/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative"
            >
                {/* Back Button */}
                <button
                    onClick={handleBack}
                    className="absolute top-6 left-6 p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                    <ArrowLeft size={24} className="text-gray-400" />
                </button>

                <div className="text-center mb-10 mt-4">
                    <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">
                        BrainRush
                    </h1>
                    <p className="text-gray-400">{t('menu.login')}</p>
                </div>

                <div className="space-y-4">
                    {/* Google Login */}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={isLoggingIn}
                        className="w-full p-4 bg-white text-gray-900 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {isLoggingIn ? (
                            <Loader2 className="animate-spin" />
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                {t('common.google')}
                            </>
                        )}
                    </button>

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-gray-800 text-gray-500">{t('common.or')}</span>
                        </div>
                    </div>

                    {/* Guest Login */}
                    <button
                        onClick={handleGuestLogin}
                        disabled={isLoggingIn}
                        className="w-full p-4 bg-gray-700/50 border-2 border-dashed border-gray-600 rounded-xl font-medium text-gray-300 flex items-center justify-center gap-3 hover:bg-gray-700/80 hover:border-gray-500 transition-all disabled:opacity-50"
                    >
                        <User className="w-5 h-5" />
                        {t('auth.guestMode')}
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                        {t('auth.guestWarning')}
                    </p>

                    <p className="text-center text-xs text-gray-500 mt-4">
                        {t('auth.terms')}
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default Login;
