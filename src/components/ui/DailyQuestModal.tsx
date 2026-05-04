import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Gift, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useSound } from '../../contexts/SoundContext';
import { useUI } from '../../contexts/UIContext';
import { logAnalyticsEvent } from '../../lib/analytics';

type DailyQuest = {
    quest_code: string;
    event_type: string;
    threshold: number;
    points: number;
    sort_order: number;
    progress_count: number;
    completed: boolean;
    completed_at: string | null;
    claimed: boolean;
    claimed_at: string | null;
    can_claim_points: boolean;
    metadata?: {
        title_key?: string;
        description_key?: string;
    } | null;
};

type DailyReward = {
    milestone: number;
    reward: Record<string, unknown>;
    claimed: boolean;
    claimed_at: string | null;
    can_claim: boolean;
};

type DailyQuestStatus = {
    quest_date: string;
    total_points: number;
    quests: DailyQuest[];
    rewards: DailyReward[];
};

type ClaimedRewardSummary = {
    xp: number;
    gold: number;
    pencils: number;
    randomItems: number;
    itemCodes: string[];
    milestones: number[];
};

type DailyQuestModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onRewardClaimed?: () => void | Promise<void>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const parseStatus = (value: unknown): DailyQuestStatus => {
    const root = isRecord(value) ? value : {};
    const quests = Array.isArray(root.quests) ? root.quests.filter(isRecord).map((quest) => ({
        quest_code: String(quest.quest_code ?? ''),
        event_type: String(quest.event_type ?? ''),
        threshold: Number(quest.threshold ?? 1),
        points: Number(quest.points ?? 0),
        sort_order: Number(quest.sort_order ?? 0),
        progress_count: Number(quest.progress_count ?? 0),
        completed: Boolean(quest.completed),
        completed_at: typeof quest.completed_at === 'string' ? quest.completed_at : null,
        claimed: Boolean(quest.claimed),
        claimed_at: typeof quest.claimed_at === 'string' ? quest.claimed_at : null,
        can_claim_points: Boolean(quest.can_claim_points),
        metadata: isRecord(quest.metadata) ? quest.metadata as DailyQuest['metadata'] : null,
    })) : [];
    const rewards = Array.isArray(root.rewards) ? root.rewards.filter(isRecord).map((reward) => ({
        milestone: Number(reward.milestone ?? 0),
        reward: isRecord(reward.reward) ? reward.reward : {},
        claimed: Boolean(reward.claimed),
        claimed_at: typeof reward.claimed_at === 'string' ? reward.claimed_at : null,
        can_claim: Boolean(reward.can_claim),
    })) : [];

    return {
        quest_date: String(root.quest_date ?? ''),
        total_points: Number(root.total_points ?? 0),
        quests,
        rewards,
    };
};

const formatReward = (reward: Record<string, unknown>, t: ReturnType<typeof useTranslation>['t']) => {
    const parts: string[] = [];
    const xp = Number(reward.xp ?? 0);
    const gold = Number(reward.gold ?? 0);
    const pencils = Number(reward.pencils ?? 0);
    const randomItem = Number(reward.random_item ?? 0);
    const itemCode = typeof reward.item_code === 'string' ? reward.item_code : '';

    if (xp > 0) parts.push(t('dailyQuests.reward.xp', 'XP +{{count}}', { count: xp }));
    if (gold > 0) parts.push(t('dailyQuests.reward.gold', 'Gold +{{count}}', { count: gold }));
    if (pencils > 0) parts.push(t('dailyQuests.reward.pencils', 'Pencil +{{count}}', { count: pencils }));
    if (randomItem > 0) parts.push(itemCode
        ? t('dailyQuests.reward.itemWithCode', 'Random item +{{count}} ({{itemCode}})', { count: randomItem, itemCode })
        : t('dailyQuests.reward.randomItem', 'Random item +{{count}}', { count: randomItem })
    );

    return parts.join(' · ') || t('dailyQuests.reward.empty', 'Reward');
};

const getRewardSummary = (reward: Record<string, unknown>): Omit<ClaimedRewardSummary, 'milestones'> => ({
    xp: Math.max(0, Number(reward.xp ?? 0)),
    gold: Math.max(0, Number(reward.gold ?? 0)),
    pencils: Math.max(0, Number(reward.pencils ?? 0)),
    randomItems: Math.max(0, Number(reward.random_item ?? 0)),
    itemCodes: typeof reward.item_code === 'string' && reward.item_code
        ? [reward.item_code]
        : [],
});

const emptyClaimedRewardSummary = (): ClaimedRewardSummary => ({
    xp: 0,
    gold: 0,
    pencils: 0,
    randomItems: 0,
    itemCodes: [],
    milestones: [],
});

const getItemRewardIconSrc = (itemCode: string) => {
    switch (itemCode) {
        case 'SCREEN_BLOCK':
            return '/images/icon/icon_bomb_black.png';
        case 'AUTO_SOLVE':
            return '/images/icon/Bolt - Yellow (Border).png';
        case 'EMOJI_BOMB':
            return '/images/icon/icon_bomb_choco.png';
        default:
            return null;
    }
};

const DailyQuestModal = ({ isOpen, onClose, onRewardClaimed }: DailyQuestModalProps) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { playSound } = useSound();
    const { showToast } = useUI();
    const [status, setStatus] = useState<DailyQuestStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [claimingQuestCode, setClaimingQuestCode] = useState<string | null>(null);
    const [claimingRewards, setClaimingRewards] = useState(false);
    const [selectedRewardMilestone, setSelectedRewardMilestone] = useState<number | null>(null);
    const [claimedRewardSummary, setClaimedRewardSummary] = useState<ClaimedRewardSummary | null>(null);

    const progressPercent = useMemo(() => {
        const points = Math.max(0, status?.total_points ?? 0);
        return Math.min(100, Math.round((points / 100) * 100));
    }, [status?.total_points]);

    const loadStatus = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_daily_quest_status');
            if (error) throw error;
            setStatus(parseStatus(data));
        } catch (error) {
            console.error('Failed to load daily quests:', error);
            showToast(t('dailyQuests.loadFail', '일일 퀘스트를 불러오지 못했습니다.'), 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast, t, user]);

    const claimQuestPoints = async (questCode: string) => {
        if (!user || claimingQuestCode || claimingRewards) return;
        setClaimingQuestCode(questCode);
        try {
            const { data, error } = await supabase.rpc('claim_daily_quest_points', { p_quest_code: questCode });
            if (error) throw error;
            const claimedQuest = status?.quests.find((quest) => quest.quest_code === questCode);
            setStatus(parseStatus(data));
            void logAnalyticsEvent('br_daily_quest_claim', {
                quest_code: questCode,
                points: claimedQuest?.points ?? 0,
                event_type: claimedQuest?.event_type ?? '',
            });
            playSound('level_complete');
            window.dispatchEvent(new CustomEvent('brainrush:daily-quest-updated'));
        } catch (error) {
            console.error('Failed to claim daily quest points:', error);
            showToast(t('dailyQuests.questClaimFail', '퀘스트 완료 처리에 실패했습니다.'), 'error');
        } finally {
            setClaimingQuestCode(null);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        void logAnalyticsEvent('br_daily_quest_open');
        void loadStatus();
    }, [isOpen, loadStatus]);

    useEffect(() => {
        if (!isOpen) return;
        const handleModalCloseRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ handled?: boolean }>;
            if (customEvent.detail?.handled) return;
            if (customEvent.detail) customEvent.detail.handled = true;
            onClose();
        };
        window.addEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        return () => window.removeEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
    }, [isOpen, onClose]);

    const quests = useMemo(() => {
        const getGroup = (quest: DailyQuest) => {
            if (quest.can_claim_points) return 0;
            if (!quest.completed) return 1;
            return 2;
        };
        return [...(status?.quests ?? [])].sort((a, b) => (
            getGroup(a) - getGroup(b) || a.sort_order - b.sort_order || a.quest_code.localeCompare(b.quest_code)
        ));
    }, [status?.quests]);
    const rewards = status?.rewards ?? [];
    const claimableRewards = useMemo(() => rewards.filter((reward) => reward.can_claim && !reward.claimed), [rewards]);
    const hasClaimableRewards = claimableRewards.length > 0;
    const selectedReward = useMemo(() => (
        rewards.find((reward) => reward.milestone === selectedRewardMilestone) ?? null
    ), [rewards, selectedRewardMilestone]);
    const rewardPreview = useMemo(() => {
        if (!selectedReward) {
            return {
                milestone: null,
                summary: hasClaimableRewards
                    ? t('dailyQuests.claimAvailableRewardsHint', '받을 수 있는 상자를 눌러 보상을 받아보세요.')
                    : t('dailyQuests.rewardProgressHint', '퀘스트 완료 점수에 따라 상자가 열립니다.'),
                status: hasClaimableRewards
                    ? t('dailyQuests.rewardReady', '지금 받을 수 있어요.')
                    : t('dailyQuests.rewardProgressHint', '퀘스트 완료 점수에 따라 상자가 열립니다.'),
                claimed: false,
                canClaim: hasClaimableRewards,
            };
        }

        return {
            milestone: selectedReward.milestone,
            summary: formatReward(selectedReward.reward, t),
            status: selectedReward.claimed
                ? t('dailyQuests.rewardAlreadyClaimed', '이미 받은 보상입니다.')
                : selectedReward.can_claim
                    ? t('dailyQuests.rewardReady', '지금 받을 수 있어요.')
                    : t('dailyQuests.rewardLockedUntil', '{{points}}점이 되면 받을 수 있어요.', { points: selectedReward.milestone }),
            claimed: selectedReward.claimed,
            canClaim: selectedReward.can_claim,
        };
    }, [hasClaimableRewards, selectedReward, t]);

    const claimAllRewards = async () => {
        if (!user || claimingRewards || !hasClaimableRewards) return;
        setClaimingRewards(true);
        try {
            let latestStatus: DailyQuestStatus | null = null;
            const nextClaimedSummary = emptyClaimedRewardSummary();
            for (const reward of claimableRewards) {
                const { data, error } = await supabase.rpc('claim_daily_quest_reward', { p_milestone: reward.milestone });
                if (error) throw error;
                const response = isRecord(data) ? data : {};
                const grantedReward = isRecord(response.reward) ? response.reward : reward.reward;
                const summary = getRewardSummary(grantedReward);
                nextClaimedSummary.xp += summary.xp;
                nextClaimedSummary.gold += summary.gold;
                nextClaimedSummary.pencils += summary.pencils;
                nextClaimedSummary.randomItems += summary.randomItems;
                nextClaimedSummary.itemCodes.push(...summary.itemCodes);
                nextClaimedSummary.milestones.push(reward.milestone);
                void logAnalyticsEvent('br_daily_reward_claim', {
                    milestone: reward.milestone,
                    xp: summary.xp,
                    gold: summary.gold,
                    pencils: summary.pencils,
                    random_item: summary.randomItems,
                });
                latestStatus = parseStatus(isRecord(data) ? data.status : data);
                setStatus(latestStatus);
            }
            playSound('level_complete');
            setClaimedRewardSummary(nextClaimedSummary);
            await onRewardClaimed?.();
            window.dispatchEvent(new CustomEvent('brainrush:daily-quest-updated'));
        } catch (error) {
            console.error('Failed to claim daily quest rewards:', error);
            showToast(t('dailyQuests.claimFail', '보상 수령에 실패했습니다.'), 'error');
        } finally {
            setClaimingRewards(false);
        }
    };

    const handleRewardBoxClick = (reward: DailyReward) => {
        if (reward.can_claim && !reward.claimed) {
            void claimAllRewards();
            return;
        }
        playSound('click');
        setSelectedRewardMilestone((current) => current === reward.milestone ? null : reward.milestone);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.94, y: 24 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.94, y: 24 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                        className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-white/10 dark:bg-gray-900"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="relative border-b border-slate-200 px-5 py-5 dark:border-white/10">
                            <div className="absolute -right-16 -top-20 h-44 w-44 rounded-full bg-yellow-300/25 blur-3xl dark:bg-yellow-400/20" />
                            <div className="absolute -left-20 top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />
                            <div className="relative z-10 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-300/10">
                                        <img src="/images/icon/icon_question.png" alt="" className="h-5 w-5 object-contain" aria-hidden="true" />
                                    </div>
                                    <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('dailyQuests.title', '일일 퀘스트')}</h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-full p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20 dark:hover:text-white"
                                    aria-label={t('common.close')}
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="relative z-20 mt-5 w-full text-left">
                                <div className="mb-2 flex items-end justify-between">
                                    <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t('dailyQuests.progress', '진행도')}</span>
                                    <span className="text-lg font-black text-yellow-600 dark:text-yellow-200">
                                        {claimingRewards ? <Loader2 className="inline h-4 w-4 animate-spin" /> : Math.min(status?.total_points ?? 0, 100)} / 100
                                    </span>
                                </div>
                                <div className="relative px-2 pb-8 pt-4">
                                    <div className={`absolute left-2 right-2 top-7 h-3 rounded-full bg-slate-200 dark:bg-white/10 ${hasClaimableRewards ? 'shadow-[0_0_18px_rgba(250,204,21,0.18)]' : ''}`}>
                                        <motion.div
                                            className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-yellow-300"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progressPercent}%` }}
                                            transition={{ duration: 0.35, ease: 'easeOut' }}
                                        />
                                    </div>
                                    {rewards.map((reward) => {
                                        const reached = (status?.total_points ?? 0) >= reward.milestone;
                                        const left = `${Math.min(100, Math.max(0, reward.milestone))}%`;
                                        return (
                                            <div
                                                key={reward.milestone}
                                                className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
                                                style={{ left }}
                                            >
                                                <button
                                                    type="button"
                                                    title={formatReward(reward.reward, t)}
                                                    onClick={() => handleRewardBoxClick(reward)}
                                                    disabled={claimingRewards}
                                                    className={`relative flex h-10 w-10 items-center justify-center rounded-2xl border text-base font-black transition ${reward.claimed
                                                        ? 'border-emerald-300/50 bg-emerald-300 text-slate-950'
                                                        : reward.can_claim
                                                            ? 'border-yellow-200 bg-yellow-300 text-slate-950 shadow-[0_0_22px_rgba(250,204,21,0.55)] animate-pulse'
                                                            : reached
                                                                ? 'border-blue-200/50 bg-blue-300/80 text-slate-950'
                                                                : 'border-slate-300 bg-white text-slate-400 dark:border-white/15 dark:bg-slate-900 dark:text-slate-500'
                                                        } ${claimingRewards ? 'cursor-wait opacity-80' : 'active:scale-95'}`}
                                                >
                                                    {reward.claimed ? <CheckCircle2 className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
                                                    {reward.can_claim && (
                                                        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-950" />
                                                    )}
                                                </button>
                                                <span className={`text-[10px] font-black ${reward.can_claim ? 'text-yellow-600 dark:text-yellow-200' : reward.claimed ? 'text-emerald-600 dark:text-emerald-200' : 'text-slate-500'}`}>
                                                    {reward.milestone}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <motion.div
                                    layout
                                    className="relative z-30 mt-3 min-h-[86px] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl shadow-slate-200/60 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95 dark:shadow-black/40"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${rewardPreview.claimed ? 'bg-emerald-300 text-slate-950' : rewardPreview.canClaim ? 'bg-yellow-300 text-slate-950' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                                            {rewardPreview.claimed ? <CheckCircle2 className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-slate-900 dark:text-white">
                                                {rewardPreview.milestone !== null
                                                    ? t('dailyQuests.reward.milestone', '{{points}}점 보상', { points: rewardPreview.milestone })
                                                    : t('dailyQuests.progress', '진행도')}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                                {rewardPreview.summary}
                                            </p>
                                            <p className={`mt-1 text-[11px] font-bold ${rewardPreview.claimed ? 'text-emerald-600 dark:text-emerald-300' : rewardPreview.canClaim ? 'text-yellow-600 dark:text-yellow-200' : 'text-slate-500'}`}>
                                                {rewardPreview.status}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
                            {loading && !status ? (
                                <div className="flex min-h-64 items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-300" />
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <section>
                                        <h3 className="mb-3 text-sm font-black text-slate-900 dark:text-white">{t('dailyQuests.questSection', '오늘의 할 일')}</h3>
                                        <div className="space-y-2.5">
                                            {quests.map((quest) => {
                                                const titleKey = quest.metadata?.title_key || `dailyQuests.quests.${quest.quest_code}.title`;
                                                const progress = Math.min(quest.progress_count, quest.threshold);
                                                const isClaimingQuest = claimingQuestCode === quest.quest_code;
                                                return (
                                                    <div
                                                        key={quest.quest_code}
                                                        className={`rounded-2xl border px-4 py-3 transition ${quest.claimed
                                                            ? 'border-emerald-300/30 bg-emerald-400/10'
                                                            : quest.can_claim_points
                                                                ? 'border-yellow-300/40 bg-yellow-300/10 shadow-[0_0_24px_rgba(250,204,21,0.12)]'
                                                            : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]'
                                                            }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="font-black text-slate-900 dark:text-white">{t(titleKey, quest.quest_code)}</p>
                                                            </div>
                                                            {quest.claimed ? (
                                                                <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs font-black text-emerald-700 dark:text-emerald-200">
                                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                                    +{quest.points}
                                                                </div>
                                                            ) : quest.can_claim_points ? (
                                                                <button
                                                                    type="button"
                                                                    disabled={isClaimingQuest}
                                                                    onClick={() => claimQuestPoints(quest.quest_code)}
                                                                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-950 transition hover:bg-yellow-100 active:scale-95 disabled:opacity-70"
                                                                >
                                                                    {isClaimingQuest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('dailyQuests.completeQuest', '완료')}
                                                                    <span className="text-yellow-600">+{quest.points}</span>
                                                                </button>
                                                            ) : (
                                                                <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-black text-yellow-700 dark:bg-black/20 dark:text-yellow-200">
                                                                    +{quest.points}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="mt-3 flex items-center gap-3">
                                                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                                                                <div
                                                                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"
                                                                    style={{ width: `${Math.min(100, Math.round((progress / quest.threshold) * 100))}%` }}
                                                                />
                                                            </div>
                                                            <div className="w-12 text-right text-xs font-black text-slate-500 dark:text-slate-300">
                                                                {progress}/{quest.threshold}
                                                            </div>
                                                            {quest.claimed ? (
                                                                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                                                            ) : quest.can_claim_points ? (
                                                                <Gift className="h-4 w-4 text-yellow-300" />
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                </div>
                            )}
                        </div>
                    </motion.div>
                    <AnimatePresence>
                        {claimedRewardSummary && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setClaimedRewardSummary(null);
                                }}
                            >
                                <motion.div
                                    initial={{ scale: 0.82, y: 24, opacity: 0 }}
                                    animate={{ scale: 1, y: 0, opacity: 1 }}
                                    exit={{ scale: 0.88, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                                    className="w-full max-w-sm overflow-hidden rounded-3xl border border-yellow-300/30 bg-gradient-to-b from-white to-slate-100 p-6 text-center shadow-2xl dark:from-slate-900 dark:to-slate-950"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-yellow-200/40 bg-yellow-300 text-slate-950 shadow-[0_0_36px_rgba(250,204,21,0.35)]">
                                        <Gift className="h-10 w-10" />
                                    </div>
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                                        {t('dailyQuests.rewardClaimModal.title', '보상을 받았습니다!')}
                                    </h3>

                                    <div className="mt-5 grid grid-cols-2 gap-2 text-left">
                                        {claimedRewardSummary.xp > 0 && (
                                            <div className="rounded-2xl border border-blue-300/20 bg-blue-400/10 px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-300 text-xs font-black text-slate-950">XP</span>
                                                    <p className="text-xl font-black text-slate-900 dark:text-white">+{claimedRewardSummary.xp}</p>
                                                </div>
                                            </div>
                                        )}
                                        {claimedRewardSummary.gold > 0 && (
                                            <div className="rounded-2xl border border-yellow-300/20 bg-yellow-400/10 px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-300/20 p-0.5">
                                                        <img src="/images/icon/icon_coin.png" alt={t('ad.gold', '골드')} className="h-full w-full object-contain" />
                                                    </span>
                                                    <p className="text-xl font-black text-slate-900 dark:text-white">+{claimedRewardSummary.gold}</p>
                                                </div>
                                            </div>
                                        )}
                                        {claimedRewardSummary.pencils > 0 && (
                                            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-300 p-1">
                                                        <img src="/images/icon/icon_pen.png" alt={t('ad.pencils', '연필')} className="h-full w-full object-contain" />
                                                    </span>
                                                    <p className="text-xl font-black text-slate-900 dark:text-white">+{claimedRewardSummary.pencils}</p>
                                                </div>
                                            </div>
                                        )}
                                        {claimedRewardSummary.randomItems > 0 && (
                                            <div className="rounded-2xl border border-pink-300/20 bg-pink-400/10 px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-300 text-lg text-slate-950">
                                                        {getItemRewardIconSrc(claimedRewardSummary.itemCodes[0] ?? '') ? (
                                                            <img src={getItemRewardIconSrc(claimedRewardSummary.itemCodes[0] ?? '')!} alt="" className="h-7 w-7 object-contain" aria-hidden="true" />
                                                        ) : (
                                                            '🎁'
                                                        )}
                                                    </span>
                                                    <p className="text-xl font-black text-slate-900 dark:text-white">+{claimedRewardSummary.randomItems}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setClaimedRewardSummary(null)}
                                        className="mt-6 w-full rounded-2xl bg-white py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-100 active:scale-95"
                                    >
                                        {t('common.ok', '확인')}
                                    </button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default DailyQuestModal;
