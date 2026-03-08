import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, Ban, Loader2 } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { consumePurchaseToken, getPurchaseToken, getTransactionId, loadProducts, PRODUCT_IDS, purchaseProduct, type ShopProductId } from '../lib/purchaseService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Capacitor } from '@capacitor/core';
import { useTheme } from '../contexts/ThemeContext';

type ShopItem = {
    id: string;
    productId: ShopProductId;
    titleKey: string;
    descKey: string;
    fallbackPriceLabel: string;
    priceLabel: string;
    tagKey?: string;
    accent: string;
    icon: ReactNode;
    runtimeIconUrl?: string;
    isConsumable?: boolean;
};

type ShopCatalogItem = Omit<ShopItem, 'priceLabel'>;

const SHOP_PRODUCT_ALIAS_MAP: Record<string, ShopProductId> = {
    remove_ads: PRODUCT_IDS.removeAds,
    nickname_change_ticket: PRODUCT_IDS.nicknameChangeTicket,
    nickname_ticket: PRODUCT_IDS.nicknameChangeTicket,
    pencils_5: PRODUCT_IDS.pencils5,
    pencil_5: PRODUCT_IDS.pencils5,
    pencils_20: PRODUCT_IDS.pencils20,
    pencil_20: PRODUCT_IDS.pencils20,
    pencils_100: PRODUCT_IDS.pencils100,
    pencil_100: PRODUCT_IDS.pencils100,
    practice_notes_10: PRODUCT_IDS.practiceNotes10,
    practice_note_10: PRODUCT_IDS.practiceNotes10,
    practice_notes_20: PRODUCT_IDS.practiceNotes20,
    practice_note_20: PRODUCT_IDS.practiceNotes20,
    practice_notes_100: PRODUCT_IDS.practiceNotes100,
    practice_note_100: PRODUCT_IDS.practiceNotes100,
};

const Shop = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { themeMode } = useTheme();
    const { playSound } = useSound();
    const { showToast } = useUI();
    const { user, profile, refreshProfile } = useAuth();
    const [priceMap, setPriceMap] = useState<Record<string, string>>({});
    const [loadingPrices, setLoadingPrices] = useState(false);
    const [enabledProductOrder, setEnabledProductOrder] = useState<ShopProductId[] | null>(null);
    const [shopIconUrlMap, setShopIconUrlMap] = useState<Partial<Record<ShopProductId, string>>>({});
    const [purchasing, setPurchasing] = useState(false);
    const [purchaseReward, setPurchaseReward] = useState<{
        amount: number | null;
        unitLabel: string;
        description: string;
        iconSrc?: string;
        iconEmoji?: string;
        iconAlt: string;
    } | null>(null);
    const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
    const edgeSwipeTriggeredRef = useRef(false);

    useEffect(() => {
        const handleModalCloseRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ handled?: boolean }>;
            if (customEvent.detail?.handled) return;
            if (!purchaseReward) return;
            setPurchaseReward(null);
            if (customEvent.detail) customEvent.detail.handled = true;
        };
        window.addEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        return () => {
            window.removeEventListener('brainrush:request-modal-close', handleModalCloseRequest as EventListener);
        };
    }, [purchaseReward]);

    const catalogItems = useMemo<ShopCatalogItem[]>(() => ([
        {
            id: 'remove_ads',
            productId: PRODUCT_IDS.removeAds,
            titleKey: 'shop.removeAds.title',
            descKey: 'shop.removeAds.desc',
            fallbackPriceLabel: t('shop.priceTbd', 'TBD'),
            tagKey: 'shop.premium',
            accent: 'from-rose-500/20 to-transparent',
            icon: <Ban className="w-8 h-8 text-rose-300" />
        },
        {
            id: 'nickname_change_ticket',
            productId: PRODUCT_IDS.nicknameChangeTicket,
            titleKey: 'shop.nicknameChangeTicket.title',
            descKey: 'shop.nicknameChangeTicket.desc',
            fallbackPriceLabel: '₩5,500',
            tagKey: 'shop.premium',
            accent: 'from-indigo-500/20 to-transparent',
            icon: <span className="w-8 h-8 flex items-center justify-center text-3xl leading-none select-none" role="img" aria-label="ticket">🎫</span>,
            isConsumable: true,
        },
        {
            id: 'pencils_5',
            productId: PRODUCT_IDS.pencils5,
            titleKey: 'shop.pencils5.title',
            descKey: 'shop.pencils5.desc',
            fallbackPriceLabel: '₩1,200',
            accent: 'from-yellow-500/20 to-transparent',
            icon: <img src="/images/icon/icon_pen.png" alt="Pencil" className="w-8 h-8 object-contain" />,
            isConsumable: true,
        },
        {
            id: 'pencils_20',
            productId: PRODUCT_IDS.pencils20,
            titleKey: 'shop.pencils20.title',
            descKey: 'shop.pencils20.desc',
            fallbackPriceLabel: '₩3,900',
            tagKey: 'shop.popular',
            accent: 'from-emerald-500/20 to-transparent',
            icon: <img src="/images/icon/icon_pen.png" alt="Pencil" className="w-8 h-8 object-contain" />,
            isConsumable: true,
        },
        {
            id: 'pencils_100',
            productId: PRODUCT_IDS.pencils100,
            titleKey: 'shop.pencils100.title',
            descKey: 'shop.pencils100.desc',
            fallbackPriceLabel: '₩19,000',
            tagKey: 'shop.bestValue',
            accent: 'from-sky-500/20 to-transparent',
            icon: <img src="/images/icon/icon_pen.png" alt="Pencil" className="w-8 h-8 object-contain" />,
            isConsumable: true,
        },
        {
            id: 'practice_notes_10',
            productId: PRODUCT_IDS.practiceNotes10,
            titleKey: 'shop.practiceNotes5.title',
            descKey: 'shop.practiceNotes5.desc',
            fallbackPriceLabel: '₩1,200',
            accent: 'from-green-500/20 to-transparent',
            icon: <img src="/images/icon/icon_note.png" alt="Practice Note" className="w-8 h-8 object-contain" />,
            isConsumable: true,
        },
        {
            id: 'practice_notes_20',
            productId: PRODUCT_IDS.practiceNotes20,
            titleKey: 'shop.practiceNotes20.title',
            descKey: 'shop.practiceNotes20.desc',
            fallbackPriceLabel: '₩2,200',
            tagKey: 'shop.popular',
            accent: 'from-lime-500/20 to-transparent',
            icon: <img src="/images/icon/icon_note.png" alt="Practice Note" className="w-8 h-8 object-contain" />,
            isConsumable: true,
        },
        {
            id: 'practice_notes_100',
            productId: PRODUCT_IDS.practiceNotes100,
            titleKey: 'shop.practiceNotes100.title',
            descKey: 'shop.practiceNotes100.desc',
            fallbackPriceLabel: '₩9,900',
            tagKey: 'shop.bestValue',
            accent: 'from-emerald-500/20 to-transparent',
            icon: <img src="/images/icon/icon_note.png" alt="Practice Note" className="w-8 h-8 object-contain" />,
            isConsumable: true,
        }
    ]), [t]);

    useEffect(() => {
        let active = true;
        const fetchShopCatalog = async () => {
            try {
                let data: any[] | null = null;
                let error: any = null;

                const withIcon = await (supabase as any)
                    .from('shop_catalog')
                    .select('product_id, sort_order, icon_url')
                    .eq('is_enabled', true)
                    .order('sort_order', { ascending: true })
                    .order('product_id', { ascending: true });

                data = withIcon.data;
                error = withIcon.error;

                // Backward compatibility: older schema without icon_url.
                if (error) {
                    const withoutIcon = await (supabase as any)
                        .from('shop_catalog')
                        .select('product_id, sort_order')
                        .eq('is_enabled', true)
                        .order('sort_order', { ascending: true })
                        .order('product_id', { ascending: true });
                    data = withoutIcon.data;
                    error = withoutIcon.error;
                }
                if (error) throw error;
                if (!active) return;
                const dedup = new Set<ShopProductId>();
                const nextOrder: ShopProductId[] = [];
                const nextIconMap: Partial<Record<ShopProductId, string>> = {};
                for (const row of data || []) {
                    const rawId = String(row.product_id);
                    const mappedId = SHOP_PRODUCT_ALIAS_MAP[rawId];
                    if (!mappedId) continue;
                    const iconUrl = typeof row.icon_url === 'string' ? row.icon_url.trim() : '';
                    if (iconUrl && !nextIconMap[mappedId]) nextIconMap[mappedId] = iconUrl;
                    if (dedup.has(mappedId)) continue;
                    dedup.add(mappedId);
                    nextOrder.push(mappedId);
                }
                setEnabledProductOrder(nextOrder);
                setShopIconUrlMap(nextIconMap);
            } catch (err) {
                console.error('Failed to load shop catalog:', err);
                // null means fallback to local defaults.
                if (active) setEnabledProductOrder(null);
                if (active) setShopIconUrlMap({});
            }
        };

        fetchShopCatalog();
        return () => {
            active = false;
        };
    }, []);

    const enabledCatalogItems = useMemo(() => {
        if (!enabledProductOrder) return catalogItems;
        const byProductId = new Map(catalogItems.map((item) => [item.productId, item]));
        const orderedItems: ShopCatalogItem[] = [];
        for (const productId of enabledProductOrder) {
            const item = byProductId.get(productId);
            if (item) orderedItems.push(item);
        }
        return orderedItems;
    }, [catalogItems, enabledProductOrder]);

    const items = useMemo<ShopItem[]>(() => (
        enabledCatalogItems.map((item) => ({
            ...item,
            priceLabel: priceMap[item.productId] || item.fallbackPriceLabel,
            runtimeIconUrl: shopIconUrlMap[item.productId],
        }))
    ), [enabledCatalogItems, priceMap, shopIconUrlMap]);

    useEffect(() => {
        let active = true;
        const fetchPrices = async () => {
            if (enabledCatalogItems.length < 1) {
                setPriceMap({});
                setLoadingPrices(false);
                return;
            }
            setLoadingPrices(true);
            try {
                const products = await loadProducts(enabledCatalogItems.map((item) => item.productId));
                if (!active) return;
                const nextMap: Record<string, string> = {};
                products.forEach((product) => {
                    if (product?.identifier && product.priceString) {
                        nextMap[product.identifier] = product.priceString;
                    }
                });
                setPriceMap(nextMap);
            } catch (err) {
                console.error('Failed to load store products', err);
            } finally {
                if (active) setLoadingPrices(false);
            }
        };

        fetchPrices();
        return () => {
            active = false;
        };
    }, [enabledCatalogItems]);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const handleEdgeSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
        if (purchasing || purchaseReward || event.touches.length !== 1) {
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

    const handlePurchase = async (item: ShopItem) => {
        playSound('click');
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
            return;
        }
        if (item.productId === PRODUCT_IDS.removeAds && profile?.ads_removed) {
            return;
        }
        setPurchasing(true);
        try {
            const transaction = await purchaseProduct(item.productId);
            const transactionId = getTransactionId(transaction);
            let purchaseToken = getPurchaseToken(transaction);

            if (Capacitor.getPlatform() === 'android' && !purchaseToken && transactionId) {
                // Heuristic: If we don't have an explicit purchaseToken, and we have a transactionId
                // (which for Android tokens is a very long string, not starting with GPA usually in raw form before verification),
                // we treat transactionId as the token.
                purchaseToken = transactionId;
            }

            if (!transactionId) {
                throw new Error('Missing transaction id');
            }

            // Always refresh right before verify-purchase.
            // iOS purchase flow can outlive existing access token and trigger Invalid JWT.
            const refreshed = await supabase.auth.refreshSession();
            if (refreshed.error) {
                throw new Error(t('shop.sessionRefreshFailed', { message: refreshed.error.message }));
            }
            let accessToken = refreshed.data.session?.access_token ?? null;
            if (!accessToken) {
                const fallbackSession = await supabase.auth.getSession();
                accessToken = fallbackSession.data.session?.access_token ?? null;
            }

            if (!accessToken) {
                throw new Error(t('shop.sessionExpired'));
            }

            const { data, error: verifyError } = await supabase.functions.invoke('verify-purchase', {
                body: {
                    platform: Capacitor.getPlatform(),
                    productId: item.productId,
                    transactionId,
                    purchaseToken
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            if (verifyError || !data?.ok) {
                // If verification response failed, but we got a response, it might be due to duplicate.
                // However, if we fail here, we should NOT consume the purchase.
                let contextText = '';
                try {
                    const context = (verifyError as any)?.context;
                    if (context && typeof context.text === 'function') {
                        contextText = await context.text();
                    }
                } catch {
                    // ignore context parsing errors
                }

                const realErrorMsg =
                    contextText ||
                    data?.detail ||
                    data?.error ||
                    (verifyError instanceof Error ? verifyError.message : (verifyError as any)?.message) ||
                    JSON.stringify(verifyError);

                console.error('Edge Function Error Detail:', realErrorMsg, verifyError);
                if (String(realErrorMsg).toLowerCase().includes('invalid jwt')) {
                    throw new Error(t('shop.sessionExpired'));
                }
                throw new Error(`Function Error: ${realErrorMsg}`);
            }

            if (item.isConsumable) {
                // For Android, we MUST consume the item to allow repurchase.
                // Use the purchaseToken we resolved (could be transactionId on Android)
                const tokenToConsume = purchaseToken || transactionId;
                await consumePurchaseToken(tokenToConsume);
            }
            await refreshProfile();
            const rewardMap: Partial<Record<ShopProductId, { amount: number; unitLabel: string }>> = {
                [PRODUCT_IDS.nicknameChangeTicket]: { amount: 1, unitLabel: t('shop.nicknameChangeTicket.unit', '닉네임 변경권') },
                [PRODUCT_IDS.pencils5]: { amount: 5, unitLabel: t('ad.pencils', '연필') },
                [PRODUCT_IDS.pencils20]: { amount: 20, unitLabel: t('ad.pencils', '연필') },
                [PRODUCT_IDS.pencils100]: { amount: 100, unitLabel: t('ad.pencils', '연필') },
                [PRODUCT_IDS.practiceNotes10]: { amount: 10, unitLabel: t('ad.practiceNotes', '연습노트') },
                [PRODUCT_IDS.practiceNotes20]: { amount: 20, unitLabel: t('ad.practiceNotes', '연습노트') },
                [PRODUCT_IDS.practiceNotes100]: { amount: 100, unitLabel: t('ad.practiceNotes', '연습노트') },
            };
            const reward = rewardMap[item.productId];
            const isPracticeNoteReward = item.productId === PRODUCT_IDS.practiceNotes10
                || item.productId === PRODUCT_IDS.practiceNotes20
                || item.productId === PRODUCT_IDS.practiceNotes100;
            const isNicknameTicketReward = item.productId === PRODUCT_IDS.nicknameChangeTicket;
            if (reward) {
                setPurchaseReward({
                    amount: reward.amount,
                    unitLabel: reward.unitLabel,
                    description: t('shop.purchaseRewardDesc', '구매하신 아이템이 지급되었습니다.'),
                    iconSrc: isNicknameTicketReward ? undefined : (isPracticeNoteReward ? '/images/icon/icon_note.png' : '/images/icon/icon_pen.png'),
                    iconEmoji: isNicknameTicketReward ? '🎫' : undefined,
                    iconAlt: isPracticeNoteReward
                        ? t('ad.practiceNotes')
                        : (isNicknameTicketReward ? t('shop.nicknameChangeTicket.unit', '닉네임 변경권') : t('ad.pencils'))
                });
            } else {
                setPurchaseReward({
                    amount: null,
                    unitLabel: t('shop.purchased', '구매 완료'),
                    description: t('shop.removeAdsApplied', '광고 제거가 적용되었습니다.'),
                    iconSrc: '/images/icon/icon_pen.png',
                    iconAlt: t('ad.pencils')
                });
            }
        } catch (err: any) {
            console.error('Purchase failed:', err);
            const errMsg = err?.message || String(err);
            const message = err?.message?.includes('Billing not supported')
                ? t('shop.billingUnavailable', 'Billing not supported on this device.')
                : t('shop.purchaseFailWithReason', { message: errMsg });
            showToast(message, 'error');
        } finally {
            setPurchasing(false);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.08
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    return (
        <div
            className={`h-[100dvh] flex flex-col relative overflow-hidden bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white`}
            onTouchStart={handleEdgeSwipeStart}
            onTouchMove={handleEdgeSwipeMove}
            onTouchEnd={handleEdgeSwipeEnd}
            onTouchCancel={handleEdgeSwipeEnd}
        >
            <div className={`absolute top-0 left-0 w-full h-full pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-slate-100 to-slate-200 dark:from-gray-800 dark:via-gray-900 dark:to-black`} />

            {/* Header - Fixed to top */}
            <div className={`flex-none w-full max-w-5xl mx-auto flex items-center justify-between z-20 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4 backdrop-blur-sm sticky top-0 ${themeMode === 'light' ? 'bg-slate-100/75' : 'bg-gray-900/50'}`}>
                <button onClick={handleBack} disabled={purchasing} className={`p-2 rounded-full transition-colors ${purchasing ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}>
                    <ArrowLeft className="w-8 h-8" />
                </button>
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-blue-500/20">
                        <ShoppingBag className="w-6 h-6 text-blue-300" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 drop-shadow-lg">
                            {t('shop.title', 'Shop')}
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-widest">
                            {t('shop.subtitle', 'Boost your play')}
                        </p>
                    </div>
                </div>
                <div className="w-10" />
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 w-full max-w-5xl mx-auto z-10 overflow-y-auto px-4 pb-8 scrollbar-hide min-h-0">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                >
                    {items.map((item) => (
                        <motion.div
                            key={item.id}
                            variants={itemVariants}
                            className="relative bg-white dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-2xl p-6 overflow-hidden shadow-xl"
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} opacity-70`} />

                            <div className="relative z-10 flex items-center justify-between mb-6">
                                <div className="p-3 rounded-full bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none">
                                    <div className="relative w-8 h-8 flex items-center justify-center">
                                        {item.icon}
                                        {item.runtimeIconUrl && (
                                            <img
                                                src={item.runtimeIconUrl}
                                                alt={t(item.titleKey)}
                                                className="absolute inset-0 w-full h-full object-contain"
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                        )}
                                    </div>
                                </div>
                                {item.tagKey && (
                                    <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full bg-white/50 dark:bg-white/10 border border-slate-200 dark:border-white/20 text-slate-800 dark:text-white shadow-sm dark:shadow-none">
                                        {t(item.tagKey, 'Popular')}
                                    </span>
                                )}
                            </div>

                            <div className="relative z-10">
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                    {t(item.titleKey)}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
                                    {t(item.descKey)}
                                </p>
                                <div className="flex items-center justify-between">
                                    {loadingPrices ? (
                                        <div className="h-8 w-24 bg-slate-100 dark:bg-gray-700 rounded animate-pulse" />
                                    ) : (
                                        <div className="text-2xl font-black text-slate-900 dark:text-white">
                                            {item.priceLabel}
                                        </div>
                                    )}
                                    {item.productId === PRODUCT_IDS.removeAds && profile?.ads_removed ? (
                                        <button
                                            disabled
                                            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-gray-600 text-slate-500 dark:text-gray-300 font-bold text-sm cursor-not-allowed"
                                        >
                                            {t('shop.purchased', 'Purchased')}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handlePurchase(item)}
                                            disabled={loadingPrices || purchasing}
                                            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-sm hover:bg-slate-800 dark:hover:bg-gray-200 transition-colors active:scale-95 shadow-md dark:shadow-none"
                                        >
                                            {loadingPrices ? t('shop.loading', 'Loading...') : t('shop.buy', 'Buy')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
                {items.length === 0 && (
                    <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-700 dark:text-amber-200">
                        {t('shop.noEnabledItems', '현재 구매 가능한 상품이 없습니다.')}
                    </div>
                )}


            </div>
            {/* 구매 처리 중 오버레이 */}
            {purchasing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-gray-900/80 border border-white/10 rounded-2xl px-5 py-4 shadow-xl">
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        <span className="text-sm font-bold text-slate-700 dark:text-gray-200">
                            {t('shop.processing', '처리 중...')}
                        </span>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {purchaseReward && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
                        onClick={() => setPurchaseReward(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.7, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                            className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-3xl p-8 max-w-sm w-full border border-gray-600/50 shadow-2xl text-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mb-4 flex justify-center">
                                {purchaseReward.iconEmoji ? (
                                    <span className="text-6xl select-none" role="img" aria-label={purchaseReward.iconAlt}>
                                        {purchaseReward.iconEmoji}
                                    </span>
                                ) : (
                                    <img
                                        src={purchaseReward.iconSrc}
                                        alt={purchaseReward.iconAlt}
                                        className="w-16 h-16 object-contain"
                                    />
                                )}
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">
                                {t('shop.purchaseSuccess', 'Purchase completed.')}
                            </h3>
                            <p className="text-slate-600 dark:text-gray-300 text-sm leading-relaxed mb-6">
                                {purchaseReward.description}
                            </p>
                            {purchaseReward.amount !== null && (
                                <div className="flex items-center justify-center gap-2 mb-6 py-3 px-4 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                                    {purchaseReward.iconEmoji ? (
                                        <span className="text-2xl select-none" role="img" aria-label={purchaseReward.iconAlt}>
                                            {purchaseReward.iconEmoji}
                                        </span>
                                    ) : (
                                        <img
                                            src={purchaseReward.iconSrc}
                                            alt={purchaseReward.iconAlt}
                                            className="w-7 h-7 object-contain"
                                        />
                                    )}
                                    <span className="text-yellow-400 font-bold text-lg">
                                        +{purchaseReward.amount} {purchaseReward.unitLabel}
                                    </span>
                                </div>
                            )}
                            <button
                                onClick={() => setPurchaseReward(null)}
                                className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition active:scale-95"
                            >
                                {t('common.ok', '확인')}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Shop;
