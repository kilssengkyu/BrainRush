import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, HelpCircle, X } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';
import AdModal from '../components/ui/AdModal';
import { PRACTICE_GUIDES } from '../content/practiceGuides';
import { PRACTICE_GAMES } from '../content/practiceGames';

type PracticeViewMode = 'list' | 'grid';
const PRACTICE_VIEW_MODE_STORAGE_KEY = 'practice_view_mode_v2';

const GUIDE_INSTRUCTION_KEY_BY_GAME: Record<string, string> = {
    RPS: 'rps.instruction',
    NUMBER: 'number.instruction',
    NUMBER_DESC: 'number.instructionDesc',
    MATH: 'math.instruction',
    TEN: 'ten.instruction',
    COLOR: 'color.instruction',
    MEMORY: 'memory.instruction',
    SEQUENCE: 'sequence.instruction',
    SEQUENCE_NORMAL: 'sequence.instructionNormal',
    LARGEST: 'largest.instruction',
    PAIR: 'pair.instruction',
    UPDOWN: 'updown.instruction',
    SLIDER: 'slider.instruction',
    ARROW: 'arrow.instruction',
    BLANK: 'fillBlanks.instruction',
    OPERATOR: 'findOperator.instruction',
    LADDER: 'ladder.instruction',
    PATH: 'path.instruction',
    BLIND_PATH: 'blindPath.instruction',
    BALLS: 'balls.instruction',
    CATCH_COLOR: 'catchColor.instruction',
    TAP_COLOR: 'tapTheColor.instruction',
    AIM: 'aim.instruction',
    MOST_COLOR: 'mostColor.instruction',
    SORTING: 'sorting.instruction',
    SPY: 'spy.instruction',
    COLOR_TIMING: 'colorTiming.instruction',
    STAIRWAY: 'stairway.instruction',
    MAKE_ZERO: 'zero.instruction',
};

const PracticeMode = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { playSound } = useSound();
    const { user, profile, refreshProfile } = useAuth();
    const { showToast } = useUI();
    const [loading, setLoading] = useState(false);
    const [showAdModal, setShowAdModal] = useState(false);
    const [guideGameId, setGuideGameId] = useState<string | null>(null);
    const [enabledPracticeGameIds, setEnabledPracticeGameIds] = useState<Set<string> | null>(null);
    const [highscores, setHighscores] = useState<Record<string, number>>({});
    const [viewMode, setViewMode] = useState<PracticeViewMode>('grid');
    const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const edgeSwipeTriggeredRef = useRef(false);
    const language = i18n.resolvedLanguage || i18n.language || 'en';
    const isKoreanLanguage = language.toLowerCase().startsWith('ko');

    const NOTE_MAX = 5;
    const AD_DAILY_LIMIT = 10;
    const today = new Date().toISOString().slice(0, 10);
    const adRewardDay = profile?.practice_ad_reward_day;
    const adRewardCount = profile?.practice_ad_reward_count ?? 0;
    const adRemaining = user
        ? (!adRewardDay || adRewardDay !== today)
            ? AD_DAILY_LIMIT
            : Math.max(0, AD_DAILY_LIMIT - adRewardCount)
        : AD_DAILY_LIMIT;
    const displayedPracticeNotes = Math.max(0, Number(profile?.practice_notes ?? NOTE_MAX));

    useEffect(() => {
        if (user) refreshProfile();
    }, [user, refreshProfile]);

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(PRACTICE_VIEW_MODE_STORAGE_KEY);
            if (saved === 'grid' || saved === 'list') setViewMode(saved);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(PRACTICE_VIEW_MODE_STORAGE_KEY, viewMode);
        } catch {
            // ignore
        }
    }, [viewMode]);

    useEffect(() => {
        let active = true;
        const fetchEnabledPracticeGames = async () => {
            try {
                const { data, error } = await (supabase as any)
                    .from('game_catalog')
                    .select('game_type')
                    .eq('is_enabled', true)
                    .eq('use_in_practice', true);
                if (error) throw error;

                const ids = new Set<string>((data || []).map((row: any) => String(row.game_type)));
                if (active) setEnabledPracticeGameIds(ids);
            } catch (error) {
                console.error('Failed to load game catalog for practice mode:', error);
                // Null means fallback to static defaults.
                if (active) setEnabledPracticeGameIds(null);
            }
        };

        fetchEnabledPracticeGames();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        const fetchHighscores = async () => {
            if (!user) {
                if (active) setHighscores({});
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('player_highscores')
                    .select('game_type, best_score')
                    .eq('user_id', user.id);
                if (error) throw error;
                const mapped = (data || []).reduce<Record<string, number>>((acc, row) => {
                    acc[String(row.game_type)] = Number(row.best_score || 0);
                    return acc;
                }, {});
                if (active) setHighscores(mapped);
            } catch (error) {
                console.error('Failed to load practice highscores:', error);
                if (active) setHighscores({});
            }
        };

        fetchHighscores();
        return () => {
            active = false;
        };
    }, [user]);

    const practiceGames = useMemo(() => {
        const randomGame = PRACTICE_GAMES.find((game) => game.id === 'RANDOM');
        const baseGames = PRACTICE_GAMES.filter((game) => game.id !== 'RANDOM');
        const filteredGames = enabledPracticeGameIds
            ? baseGames.filter((game) => enabledPracticeGameIds.has(game.id))
            : baseGames;

        return randomGame && filteredGames.length > 0
            ? [randomGame, ...filteredGames]
            : filteredGames;
    }, [enabledPracticeGameIds]);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const handleEdgeSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
        if (loading || showAdModal || !!guideGameId || event.touches.length !== 1) {
            edgeSwipeStartRef.current = null;
            edgeSwipeTriggeredRef.current = false;
            return;
        }

        const touch = event.touches[0];
        if (touch.clientX > 24) {
            edgeSwipeStartRef.current = null;
            edgeSwipeTriggeredRef.current = false;
            return;
        }

        edgeSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        edgeSwipeTriggeredRef.current = false;
    };

    const handleEdgeSwipeMove = (event: React.TouchEvent<HTMLDivElement>) => {
        if (!edgeSwipeStartRef.current || edgeSwipeTriggeredRef.current || event.touches.length !== 1) return;

        const touch = event.touches[0];
        const deltaX = touch.clientX - edgeSwipeStartRef.current.x;
        const deltaY = touch.clientY - edgeSwipeStartRef.current.y;

        if (deltaX > 72 && deltaX > Math.abs(deltaY) * 1.35) {
            edgeSwipeTriggeredRef.current = true;
            handleBack();
        }
    };

    const handleEdgeSwipeEnd = () => {
        edgeSwipeStartRef.current = null;
        edgeSwipeTriggeredRef.current = false;
    };

    const handleGameSelect = async (gameId: string) => {
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
            return;
        }

        // Random: pick a random game from the list (excluding RANDOM itself)
        let actualGameId = gameId;
        if (gameId === 'RANDOM') {
            const games = practiceGames.filter((g) => g.id !== 'RANDOM');
            if (games.length < 1) {
                showToast(t('practice.noEnabledGames', '현재 이용 가능한 연습 게임이 없습니다.'), 'info');
                return;
            }
            actualGameId = games[Math.floor(Math.random() * games.length)].id;
        }

        const notes = profile?.practice_notes ?? 0;
        if (notes < 1) {
            playSound('error');
            setShowAdModal(true);
            return;
        }

        playSound('click');
        setLoading(true);

        try {
            // Call create_practice_session RPC
            const { data: roomId, error } = await supabase
                .rpc('create_practice_session', {
                    p_player_id: user.id,
                    p_game_type: actualGameId
                });

            if (error) {
                if (error.message?.toLowerCase().includes('practice notes')) {
                    playSound('error');
                    setShowAdModal(true);
                    return;
                }
                throw error;
            }

            await refreshProfile();
            navigate(`/game/${roomId}`, {
                state: {
                    roomId,
                    myId: user.id,
                    opponentId: 'practice_solo',
                    mode: 'practice'
                }
            });

        } catch (error: any) {
            console.error('Error starting practice:', error);
            showToast(t('common.error'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAdReward = async (): Promise<'ok' | 'limit' | 'error'> => {
        if (!user) return 'error';
        if (adRemaining <= 0) {
            showToast(t('ad.limitReached', 'Daily ad limit reached.'), 'info');
            return 'limit';
        }
        try {
            const { error } = await supabase.rpc('reward_ad_practice_notes', { user_id: user.id });
            if (!error) {
                await refreshProfile();
                playSound('level_complete');
                return 'ok';
            }
            if (error?.message?.toLowerCase().includes('daily ad reward limit')) {
                showToast(t('ad.limitReached', 'Daily ad limit reached.'), 'info');
                return 'limit';
            }
            showToast(t('common.error'), 'error');
            return 'error';
        } catch (err) {
            console.error(err);
            showToast(t('common.error'), 'error');
            return 'error';
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };
    const selectedGuide = useMemo(
        () => {
            if (!guideGameId) return null;
            const baseGuide = PRACTICE_GUIDES[guideGameId];
            if (!baseGuide) return null;

            if (isKoreanLanguage) return baseGuide;

            const selectedGame = practiceGames.find((game) => game.id === guideGameId);
            const title = selectedGame ? t(selectedGame.title) : guideGameId;
            const instructionKey = GUIDE_INSTRUCTION_KEY_BY_GAME[guideGameId];
            const localizedInstruction = instructionKey ? t(instructionKey, '') : '';
            const objective = localizedInstruction || t('practice.autoGuide.objectiveFallback', 'Start and follow the on-screen rule.');

            return {
                summary: t('practice.autoGuide.summary', 'Practice {{title}} and learn the core rule quickly.', { title }),
                objective,
                howTo: [objective],
                tip: t('practice.autoGuide.tip', 'Read the rule once, then focus on speed and accuracy.')
            };
        },
        [guideGameId, isKoreanLanguage, practiceGames, t]
    );
    const selectedGuideGame = useMemo(
        () => (guideGameId ? practiceGames.find((game) => game.id === guideGameId) ?? null : null),
        [guideGameId, practiceGames]
    );

    return (
        <div
            className={`h-[100dvh] flex flex-col p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] relative overflow-hidden bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white`}
            onTouchStart={handleEdgeSwipeStart}
            onTouchMove={handleEdgeSwipeMove}
            onTouchEnd={handleEdgeSwipeEnd}
            onTouchCancel={handleEdgeSwipeEnd}
        >
            {/* Background Effects */}
            <div className={`absolute top-0 left-0 w-full h-full pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-slate-100 to-slate-200 dark:from-gray-800 dark:via-gray-900 dark:to-black`} />

            {/* Header */}
            <div className="w-full max-w-5xl mx-auto flex items-center justify-between z-10 mb-8 pt-4">
                <button onClick={handleBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-8 h-8" />
                </button>
                <h1 className="text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 drop-shadow-lg">
                    {t('menu.practice.title', '연습 모드')}
                </h1>
                {user ? (
                    <button
                        onClick={() => setShowAdModal(true)}
                        className="bg-white dark:bg-gray-800/80 backdrop-blur-md border border-gray-700 rounded-full py-2 px-4 flex items-center gap-3 hover:bg-slate-100 dark:bg-gray-700 transition-all shadow-lg active:scale-95"
                    >
                        <div className="flex flex-col items-end leading-none">
                            <div className="flex items-center gap-1.5">
                                <span className={`text-lg font-black ${displayedPracticeNotes < 1 ? 'text-red-400' : 'text-green-300'}`}>
                                    {displayedPracticeNotes}
                                </span>
                                <span className="text-gray-500 text-xs font-bold">/ {NOTE_MAX}</span>
                            </div>
                            {displayedPracticeNotes < NOTE_MAX && profile?.practice_last_recharge_at && (
                                <div className="text-[10px] text-slate-500 dark:text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    <PracticeRechargeTimer lastRecharge={profile.practice_last_recharge_at} />
                                </div>
                            )}
                        </div>
                        <img src="/images/icon/icon_note.png" alt="Practice Note" className="w-5 h-5 object-contain" />
                    </button>
                ) : (
                    <div className="w-10" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 w-full max-w-5xl mx-auto z-10 overflow-y-auto pb-8 scrollbar-hide">
                <div className="mb-3 flex justify-end">
                    <div className="inline-flex rounded-xl border border-gray-700 bg-white/70 dark:bg-gray-800/70 p-1">
                        <button
                            type="button"
                            onClick={() => { playSound('click'); setViewMode('grid'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === 'grid'
                                ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-500/30 dark:text-cyan-200'
                                : 'text-slate-600 dark:text-gray-300 hover:bg-slate-200/60 dark:hover:bg-gray-700/80'
                                }`}
                        >
                            {t('practice.viewGrid', '그리드로 보기')}
                        </button>
                        <button
                            type="button"
                            onClick={() => { playSound('click'); setViewMode('list'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === 'list'
                                ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-500/30 dark:text-cyan-200'
                                : 'text-slate-600 dark:text-gray-300 hover:bg-slate-200/60 dark:hover:bg-gray-700/80'
                                }`}
                        >
                            {t('practice.viewList', '줄로 보기')}
                        </button>
                    </div>
                </div>
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-3'}
                >
                    {practiceGames.map((game) => {
                        const guide = PRACTICE_GUIDES[game.id];
                        const highscore = highscores[game.id] ?? 0;
                        const instructionKey = GUIDE_INSTRUCTION_KEY_BY_GAME[game.id];
                        const localizedSummary = isKoreanLanguage
                            ? (guide?.summary || t('practice.descriptionPending', '설명 준비 중'))
                            : (instructionKey ? t(instructionKey, t('practice.descriptionPending', '설명 준비 중')) : t('practice.descriptionPending', '설명 준비 중'));
                        return (
                            <motion.div
                                key={game.id}
                                variants={itemVariants}
                                className={viewMode === 'grid'
                                    ? 'group relative bg-white dark:bg-gray-800/50 backdrop-blur-sm border border-gray-700 hover:border-green-500 hover:bg-slate-100 dark:hover:bg-gray-700/80 rounded-2xl p-0 flex flex-col items-center justify-between transition-all overflow-hidden'
                                    : 'group relative'}
                            >
                                {viewMode === 'grid' ? (
                                    <button
                                        type="button"
                                        onClick={() => handleGameSelect(game.id)}
                                        onMouseEnter={() => playSound('hover')}
                                        disabled={loading}
                                        className="relative w-full aspect-square text-left overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-slate-50 dark:bg-gray-900/50 z-0" />
                                        <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-0" />
                                        <div className="absolute inset-0 flex items-center justify-center z-10 pb-16">
                                            <div className="relative w-[90%] h-[90%] group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
                                                {game.icon || game.defaultIcon}
                                            </div>
                                        </div>
                                        <div className="absolute inset-x-0 bottom-0 text-center px-3 py-2 bg-black/35 backdrop-blur-md z-20 border-t border-white/10">
                                            <h3 className="font-bold text-base text-slate-700 dark:text-gray-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors truncate w-full">
                                                {t(game.title)}
                                            </h3>
                                            <p className="text-[11px] mt-1 text-blue-600 dark:text-blue-300 font-semibold">
                                                {t('practice.myHighscoreLabel', '내 하이스코어')}: <span className="font-black tabular-nums">{highscore.toLocaleString()}</span>
                                            </p>
                                        </div>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleGameSelect(game.id)}
                                        onMouseEnter={() => playSound('hover')}
                                        disabled={loading}
                                        className="w-full rounded-2xl border border-gray-700 bg-white dark:bg-gray-800/60 px-4 py-4 text-left transition-all hover:bg-slate-100 dark:hover:bg-gray-700/90 hover:border-green-500 active:scale-[0.995] disabled:opacity-70"
                                    >
                                        <div className="pr-12">
                                            <div className="text-base md:text-lg font-black text-slate-900 dark:text-white">
                                                {t(game.title)}
                                            </div>
                                            <div className="mt-1 text-xs md:text-sm text-slate-600 dark:text-gray-300 line-clamp-2">
                                                {localizedSummary}
                                            </div>
                                            <div className="mt-3 flex flex-col gap-1 text-[11px] md:text-xs">
                                                <div className="text-blue-600 dark:text-blue-300 font-semibold">
                                                    {t('practice.myHighscoreLabel', '내 하이스코어')}: <span className="font-black tabular-nums">{highscore.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        playSound('click');
                                        setGuideGameId(game.id);
                                    }}
                                    className={viewMode === 'grid'
                                        ? 'absolute top-2 left-2 z-20 rounded-full bg-black/50 border border-white/10 p-1.5 text-white/85 hover:text-white hover:bg-black/70 transition-colors'
                                        : 'absolute right-3 top-1/2 -translate-y-1/2 z-20 rounded-full border border-white/15 bg-slate-200/70 dark:bg-gray-900/70 p-2 text-slate-700 dark:text-gray-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300/80 dark:hover:bg-gray-800 transition-colors'
                                    }
                                    aria-label={`${t(game.title)} 설명`}
                                >
                                    <HelpCircle size={viewMode === 'grid' ? 15 : 16} />
                                </button>
                            </motion.div>
                        );
                    })}
                </motion.div>
                {practiceGames.length === 0 && (
                    <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-700 dark:text-amber-200">
                        {t('practice.noEnabledGames', '현재 이용 가능한 연습 게임이 없습니다.')}
                    </div>
                )}
            </div>

            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            <AdModal
                isOpen={showAdModal}
                onClose={() => setShowAdModal(false)}
                onReward={handleAdReward}
                adRemaining={adRemaining}
                adLimit={AD_DAILY_LIMIT}
                adsRemoved={!!profile?.ads_removed}
                variant="practice_notes"
            />

            {selectedGuide && selectedGuideGame && (
                <div
                    className="absolute inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-end sm:items-center sm:justify-center p-4"
                    onClick={() => setGuideGameId(null)}
                >
                    <div
                        className="w-full max-w-lg max-h-[78vh] overflow-hidden rounded-3xl border border-white/10 bg-slate-50 dark:bg-gray-900 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3 p-5 border-b border-white/10 bg-slate-50 dark:bg-gray-900/95">
                            <div className="min-w-0">
                                <div className="text-xs uppercase tracking-[0.24em] text-emerald-300/80 mb-1">{t('practice.guideTitle', 'Practice Guide')}</div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white truncate">{t(selectedGuideGame.title)}</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setGuideGameId(null)}
                                className="rounded-full p-2 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white hover:bg-white/10 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="overflow-y-auto max-h-[calc(78vh-5rem)] p-5 space-y-5">
                            <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-300 mb-2">{t('practice.guideAtAGlance', '한눈에 보기')}</div>
                                <p className="text-sm leading-relaxed text-slate-700 dark:text-gray-100">{selectedGuide.summary}</p>
                            </section>

                            <section className="space-y-2">
                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-300">{t('practice.guideObjective', '목표')}</div>
                                <p className="text-sm leading-relaxed text-slate-600 dark:text-gray-300">{selectedGuide.objective}</p>
                            </section>

                            <section className="space-y-3">
                                <div className="text-sm font-semibold text-purple-600 dark:text-purple-300">{t('practice.guideHowTo', '플레이 방법')}</div>
                                <div className="space-y-2">
                                    {selectedGuide.howTo.map((step: string, index: number) => (
                                        <div key={`${selectedGuideGame.id}-${index}`} className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-white/5 p-3">
                                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-black text-purple-600 dark:text-purple-200">
                                                {index + 1}
                                            </div>
                                            <p className="text-sm leading-relaxed text-slate-700 dark:text-gray-200">{step}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                                <div className="text-sm font-semibold text-amber-600 dark:text-amber-300 mb-2">{t('practice.guideTip', '팁')}</div>
                                <p className="text-sm leading-relaxed text-slate-700 dark:text-gray-100">{selectedGuide.tip}</p>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PracticeMode;

const PracticeRechargeTimer = ({ lastRecharge }: { lastRecharge: string }) => {
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        const calculateTime = () => {
            if (!lastRecharge) return;
            const last = new Date(lastRecharge).getTime();
            const now = new Date().getTime();
            const diff = now - last;
            const thirtyMinutes = 30 * 60 * 1000;
            const remaining = thirtyMinutes - diff;

            if (remaining <= 0) {
                setTimeLeft('00:00');
            } else {
                const m = Math.floor(remaining / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
            }
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, [lastRecharge]);

    return (
        <span className="ml-0 text-[10px] text-slate-500 dark:text-gray-400 font-mono">
            +{timeLeft}
        </span>
    );
};
