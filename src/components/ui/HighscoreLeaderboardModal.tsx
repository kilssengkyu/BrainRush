import { useEffect, useState } from 'react';
import { X, User as UserIcon, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import Flag from './Flag';

interface HighscoreLeaderboardModalProps {
    isOpen: boolean;
    onClose: () => void;
    gameType: string | null;
    title: string;
}

const HighscoreLeaderboardModal = ({ isOpen, onClose, gameType, title }: HighscoreLeaderboardModalProps) => {
    const { t } = useTranslation();
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !gameType) return;
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase.rpc('get_game_highscores', { p_game_type: gameType, p_limit: 10 });
                if (cancelled) return;
                if (error) {
                    console.error('Failed to load highscores', error);
                    setRows([]);
                } else {
                    setRows(data || []);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [isOpen, gameType]);

    useEffect(() => {
        if (!isOpen) return;
        const handleModalCloseRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ handled?: boolean }>;
            if (customEvent.detail?.handled) return;
            if (customEvent.detail) customEvent.detail.handled = true;
            onClose();
        };
        window.addEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        return () => {
            window.removeEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !gameType) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                        <Trophy className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
                        <span>{t('profile.highscoreLeaderboardTitle', 'Top 10')} - {title}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition"
                        aria-label={t('common.close')}
                    >
                        <X className="w-5 h-5 text-slate-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="px-5 py-4">
                    <div className="grid grid-cols-[0.5fr_1.4fr_0.8fr] text-[10px] uppercase tracking-widest text-gray-500 pb-2">
                        <span>{t('profile.highscoreLeaderboardColumns.rank', '#')}</span>
                        <span>{t('profile.highscoreLeaderboardColumns.player', 'Player')}</span>
                        <span className="text-right">{t('profile.highscoreLeaderboardColumns.score', 'Score')}</span>
                    </div>

                    {loading ? (
                        <div className="text-center text-sm text-gray-500 py-6">{t('common.loading')}</div>
                    ) : rows.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-6">{t('profile.highscoreLeaderboardEmpty', 'No records yet.')}</div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {rows.map((row) => (
                                <div
                                    key={`${row.user_id}-${row.rank}`}
                                    className="grid grid-cols-[0.5fr_1.4fr_0.8fr] items-center bg-white dark:bg-gray-800/60 rounded-lg px-3 py-2 border border-slate-200 dark:border-transparent shadow-sm dark:shadow-none"
                                >
                                    <span className="text-yellow-600 dark:text-yellow-400 font-bold tabular-nums text-lg">{row.rank}</span>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 dark:bg-gray-700 border border-slate-300 dark:border-white/10 flex items-center justify-center">
                                            {row.avatar_url ? (
                                                <img src={row.avatar_url} alt={row.nickname} className="w-full h-full object-cover" />
                                            ) : (
                                                <UserIcon className="w-4 h-4 text-slate-500 dark:text-gray-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm text-slate-800 dark:text-white font-semibold truncate">{row.nickname || t('game.unknownPlayer')}</div>
                                            <div className="text-[10px] text-slate-500 dark:text-gray-400 flex items-center gap-1">
                                                <Flag code={row.country} size="xs" />
                                                <span className="truncate">{row.country || ''}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-right text-blue-600 dark:text-blue-400 font-bold tabular-nums">{row.best_score ?? 0}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HighscoreLeaderboardModal;
