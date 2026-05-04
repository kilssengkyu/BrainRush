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
import { logAnalyticsEvent } from '../lib/analytics';
import AdModal from '../components/ui/AdModal';

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

type ItemShopCatalogRow = {
    item_code: string;
    name_key: string;
    description_key: string;
    gold_price: number;
    cooldown_seconds: number;
    duration_seconds: number;
    sort_order: number;
    effect_type: string;
    target_type: string;
    metadata: Record<string, unknown> | null;
};

type UserItemRow = {
    item_code: string;
    quantity: number;
};

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

const ITEM_VISUALS: Record<string, { icon: ReactNode; accent: string }> = {
    SCREEN_BLOCK: {
        icon: <img src="/images/icon/icon_bomb_black.png" alt="" className="h-9 w-9 object-contain" aria-hidden="true" />,
        accent: 'from-slate-500/20 to-transparent',
    },
    AUTO_SOLVE: {
        icon: <img src="/images/icon/Bolt - Yellow (Border).png" alt="" className="h-9 w-9 object-contain" aria-hidden="true" />,
        accent: 'from-amber-500/20 to-transparent',
    },
    EMOJI_BOMB: {
        icon: <img src="/images/icon/icon_bomb_choco.png" alt="" className="h-9 w-9 object-contain" aria-hidden="true" />,
        accent: 'from-pink-500/20 to-transparent',
    },
};

type ShopTab = 'premium' | 'items';

const GOLD_PENCIL_PACKAGES = [
    {
        id: 'gold_pencil_1',
        quantity: 1,
        goldPrice: 100,
        titleKey: 'shop.goldPencils.oneTitle',
        descKey: 'shop.goldPencils.oneDesc',
    },
    {
        id: 'gold_pencil_5',
        quantity: 5,
        goldPrice: 450,
        titleKey: 'shop.goldPencils.fiveTitle',
        descKey: 'shop.goldPencils.fiveDesc',
        tagKey: 'shop.bestValue',
    },
] as const;

const DAILY_SHOP_GOLD_AMOUNT = 30;

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
    const [itemCatalog, setItemCatalog] = useState<ItemShopCatalogRow[]>([]);
    const [itemInventory, setItemInventory] = useState<Record<string, number>>({});
    const [loadingItemShop, setLoadingItemShop] = useState(false);
    const [buyingItemCode, setBuyingItemCode] = useState<string | null>(null);
    const [buyingGoldPencilQuantity, setBuyingGoldPencilQuantity] = useState<number | null>(null);
    const [claimingDailyPencil, setClaimingDailyPencil] = useState(false);
    const [claimingDailyGold, setClaimingDailyGold] = useState(false);
    const [showDailyPencilAdModal, setShowDailyPencilAdModal] = useState(false);
    const [showDailyGoldAdModal, setShowDailyGoldAdModal] = useState(false);
    const [activeTab, setActiveTab] = useState<ShopTab>('premium');
    const dailyQuestVisitRecordedRef = useRef<string | null>(null);
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
        if (!user?.id || dailyQuestVisitRecordedRef.current === user.id) return;
        dailyQuestVisitRecordedRef.current = user.id;
        supabase.rpc('record_daily_quest_event', {
            p_event_type: 'SHOP_VISIT',
            p_amount: 1,
        }).then(({ error }) => {
            if (error) {
                dailyQuestVisitRecordedRef.current = null;
                console.error('Failed to record shop daily quest:', error);
            } else {
                window.dispatchEvent(new CustomEvent('brainrush:daily-quest-updated'));
            }
        });
    }, [user?.id]);

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

    const displayedGold = Math.max(0, Number(profile?.gold ?? 0));
    const isClaimedToday = useMemo(() => {
        return (claimedOnValue: unknown) => {
            const claimedOn = typeof claimedOnValue === 'string' ? claimedOnValue : '';
            if (!claimedOn) return false;

            try {
                const timeZone = typeof profile?.timezone === 'string' && profile.timezone.trim()
                    ? profile.timezone.trim()
                    : Intl.DateTimeFormat().resolvedOptions().timeZone;
                const today = new Intl.DateTimeFormat('en-CA', {
                    timeZone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                }).format(new Date());
                return claimedOn === today;
            } catch {
                return claimedOn === new Date().toISOString().slice(0, 10);
            }
        };
    }, [profile?.timezone]);
    const shopFreePencilClaimedToday = useMemo(() => (
        isClaimedToday(profile?.shop_free_pencil_claimed_on)
    ), [isClaimedToday, profile?.shop_free_pencil_claimed_on]);
    const shopFreePencilAdClaimedToday = useMemo(() => (
        isClaimedToday((profile as any)?.shop_free_pencil_ad_claimed_on)
    ), [isClaimedToday, profile]);
    const shopFreeGoldClaimedToday = useMemo(() => (
        isClaimedToday((profile as any)?.shop_free_gold_claimed_on)
    ), [isClaimedToday, profile]);
    const shopFreeGoldAdClaimedToday = useMemo(() => (
        isClaimedToday((profile as any)?.shop_free_gold_ad_claimed_on)
    ), [isClaimedToday, profile]);
    const hasDailyShopFreeReward = (
        !shopFreePencilClaimedToday
        || (shopFreePencilClaimedToday && !shopFreePencilAdClaimedToday)
        || !shopFreeGoldClaimedToday
        || (shopFreeGoldClaimedToday && !shopFreeGoldAdClaimedToday)
    );

    const itemShopItems = useMemo(() => (
        itemCatalog.map((item) => ({
            ...item,
            ownedQuantity: itemInventory[item.item_code] ?? 0,
            visual: ITEM_VISUALS[item.item_code] ?? {
                icon: <span className="text-3xl leading-none select-none">🎁</span>,
                accent: 'from-cyan-500/20 to-transparent',
            }
        }))
    ), [itemCatalog, itemInventory]);

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

    useEffect(() => {
        let active = true;

        const fetchItemShop = async () => {
            setLoadingItemShop(true);
            try {
                const [{ data: catalogData, error: catalogError }, inventoryResult] = await Promise.all([
                    supabase
                        .from('item_catalog')
                        .select('item_code, name_key, description_key, gold_price, cooldown_seconds, duration_seconds, sort_order, effect_type, target_type, metadata')
                        .eq('is_enabled', true)
                        .order('sort_order', { ascending: true })
                        .order('item_code', { ascending: true }),
                    user
                        ? supabase
                            .from('user_items')
                            .select('item_code, quantity')
                            .eq('user_id', user.id)
                        : Promise.resolve({ data: [] as UserItemRow[], error: null })
                ]);

                if (catalogError) throw catalogError;
                if (inventoryResult.error) throw inventoryResult.error;
                if (!active) return;

                setItemCatalog((catalogData ?? []) as ItemShopCatalogRow[]);
                const nextInventory: Record<string, number> = {};
                for (const row of (inventoryResult.data ?? []) as UserItemRow[]) {
                    nextInventory[row.item_code] = Math.max(0, Number(row.quantity ?? 0));
                }
                setItemInventory(nextInventory);
            } catch (error) {
                console.error('Failed to load item shop:', error);
                if (!active) return;
                setItemCatalog([]);
                setItemInventory({});
            } finally {
                if (active) setLoadingItemShop(false);
            }
        };

        fetchItemShop();
        return () => {
            active = false;
        };
    }, [user]);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const handleTabChange = (tab: ShopTab) => {
        playSound('click');
        setActiveTab(tab);
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
        void logAnalyticsEvent('br_purchase_attempt', {
            product_id: item.productId,
            platform: Capacitor.getPlatform(),
        });
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
            // Fair Ad logic: successful purchase should not be followed by an immediate interstitial.
            {
                const { AdLogic } = await import('../utils/AdLogic');
                AdLogic.resetAdCounter();
            }
            await refreshProfile();
            void logAnalyticsEvent('br_purchase', {
                product_id: item.productId,
                platform: Capacitor.getPlatform(),
                success: true,
                consumable: Boolean(item.isConsumable),
            });
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
            void logAnalyticsEvent('br_purchase', {
                product_id: item.productId,
                platform: Capacitor.getPlatform(),
                success: false,
            });
            const errMsg = err?.message || String(err);
            const message = err?.message?.includes('Billing not supported')
                ? t('shop.billingUnavailable', 'Billing not supported on this device.')
                : t('shop.purchaseFailWithReason', { message: errMsg });
            showToast(message, 'error');
        } finally {
            setPurchasing(false);
        }
    };

    const handleItemPurchase = async (itemCode: string) => {
        playSound('click');
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
            return;
        }

        setBuyingItemCode(itemCode);
        try {
            const { data, error } = await supabase.rpc('purchase_item', {
                p_item_code: itemCode,
                p_quantity: 1,
            });

            if (error) throw error;

            const payload = (data ?? {}) as {
                new_quantity?: number;
                gold_balance?: number;
            };

            setItemInventory((prev) => ({
                ...prev,
                [itemCode]: Math.max(0, Number(payload.new_quantity ?? (prev[itemCode] ?? 0) + 1)),
            }));

            await refreshProfile();
            const purchasedItem = itemShopItems.find((item) => item.item_code === itemCode);
            void logAnalyticsEvent('br_item_purchase', {
                item_code: itemCode,
                gold_price: purchasedItem?.gold_price ?? 0,
                quantity: 1,
                owned_after: Number(payload.new_quantity ?? 0),
            });
        } catch (error: any) {
            console.error('Failed to purchase item:', error);
            const message = String(error?.message ?? '');
            if (message.toLowerCase().includes('not enough gold')) {
                showToast(t('shop.notEnoughGold', '골드가 부족합니다.'), 'error');
            } else if (message.toLowerCase().includes('item not available')) {
                showToast(t('shop.itemUnavailable', '구매할 수 없는 아이템입니다.'), 'error');
            } else {
                showToast(t('shop.itemPurchaseFailed', '아이템 구매에 실패했습니다.'), 'error');
            }
        } finally {
            setBuyingItemCode(null);
        }
    };

    const handleGoldPencilPurchase = async (quantity: number) => {
        playSound('click');
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
            return;
        }

        setBuyingGoldPencilQuantity(quantity);
        try {
            const { error } = await supabase.rpc('purchase_pencils_with_gold', {
                p_quantity: quantity,
            });

            if (error) throw error;

            await refreshProfile();
            const goldPrice = GOLD_PENCIL_PACKAGES.find((item) => item.quantity === quantity)?.goldPrice ?? 0;
            void logAnalyticsEvent('br_gold_spend', {
                source: 'shop_pencil',
                gold_amount: goldPrice,
                reward: 'pencil',
                reward_amount: quantity,
            });
            setPurchaseReward({
                amount: quantity,
                unitLabel: t('ad.pencils', '연필'),
                description: t('shop.goldPencilPurchaseSuccess', '골드로 연필을 구매했습니다.'),
                iconSrc: '/images/icon/icon_pen.png',
                iconAlt: t('ad.pencils', '연필'),
            });
        } catch (error: any) {
            console.error('Failed to purchase pencils with gold:', error);
            const message = String(error?.message ?? '');
            if (message.toLowerCase().includes('not enough gold')) {
                showToast(t('shop.notEnoughGold', '골드가 부족합니다.'), 'error');
            } else {
                showToast(t('shop.goldPencilPurchaseFailed', '연필 구매에 실패했습니다.'), 'error');
            }
        } finally {
            setBuyingGoldPencilQuantity(null);
        }
    };

    const claimDailyPencil = async (isAd = false): Promise<'ok' | 'limit' | 'error'> => {
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
            return 'error';
        }

        setClaimingDailyPencil(true);
        try {
            const { data, error } = await supabase.rpc('claim_daily_shop_pencil', { p_is_ad: isAd });
            if (error) throw error;

            const payload = (data ?? {}) as {
                claimed?: boolean;
                already_claimed?: boolean;
                base_required?: boolean;
                amount?: number;
            };

            await refreshProfile();

            if (payload.base_required) {
                showToast(t('shop.dailyFreeBaseRequired', '먼저 무료 선물을 받아주세요.'), 'info');
                return 'limit';
            }

            if (payload.already_claimed && !payload.claimed) {
                showToast(t('shop.dailyFreePencilAlreadyClaimed', '오늘의 무료 연필은 이미 받았습니다.'), 'info');
                return 'limit';
            }

            void logAnalyticsEvent('br_daily_shop_gift_claim', {
                reward: 'pencil',
                amount: 1,
                source: isAd ? 'rewarded_ad' : 'free',
            });
            setPurchaseReward({
                amount: 1,
                unitLabel: t('ad.pencils', '연필'),
                description: t('shop.dailyFreePencilClaimSuccess', '오늘의 무료 연필을 받았습니다.'),
                iconSrc: '/images/icon/icon_pen.png',
                iconAlt: t('ad.pencils', '연필'),
            });
            window.dispatchEvent(new CustomEvent('brainrush:daily-quest-updated'));
            return 'ok';
        } catch (error: any) {
            console.error('Failed to claim daily shop pencil:', error);
            showToast(t('shop.dailyFreePencilClaimFailed', '무료 연필 수령에 실패했습니다.'), 'error');
            return 'error';
        } finally {
            setClaimingDailyPencil(false);
        }
    };

    const handleDailyPencilClaim = () => {
        playSound('click');
        void claimDailyPencil(false);
    };

    const claimDailyGold = async (isAd = false): Promise<'ok' | 'limit' | 'error'> => {
        if (!user) {
            showToast(t('auth.loginRequired'), 'error');
            return 'error';
        }

        setClaimingDailyGold(true);
        try {
            const { data, error } = await supabase.rpc('claim_daily_shop_gold', { p_is_ad: isAd });
            if (error) throw error;

            const payload = (data ?? {}) as {
                claimed?: boolean;
                already_claimed?: boolean;
                base_required?: boolean;
                amount?: number;
            };
            const amount = Math.max(0, Number(payload.amount ?? DAILY_SHOP_GOLD_AMOUNT));

            await refreshProfile();

            if (payload.base_required) {
                showToast(t('shop.dailyFreeBaseRequired', '먼저 무료 선물을 받아주세요.'), 'info');
                return 'limit';
            }

            if (payload.already_claimed && !payload.claimed) {
                showToast(t('shop.dailyFreeGoldAlreadyClaimed', '오늘의 무료 골드는 이미 받았습니다.'), 'info');
                return 'limit';
            }

            void logAnalyticsEvent('br_daily_shop_gift_claim', {
                reward: 'gold',
                amount,
                source: isAd ? 'rewarded_ad' : 'free',
            });
            setPurchaseReward({
                amount,
                unitLabel: t('ad.gold', '골드'),
                description: t('shop.dailyFreeGoldClaimSuccess', '오늘의 무료 골드를 받았습니다.'),
                iconSrc: '/images/icon/icon_coin.png',
                iconAlt: t('ad.gold', '골드'),
            });
            window.dispatchEvent(new CustomEvent('brainrush:daily-quest-updated'));
            return 'ok';
        } catch (error: any) {
            console.error('Failed to claim daily shop gold:', error);
            showToast(t('shop.dailyFreeGoldClaimFailed', '무료 골드 수령에 실패했습니다.'), 'error');
            return 'error';
        } finally {
            setClaimingDailyGold(false);
        }
    };

    const handleDailyGoldClaim = () => {
        playSound('click');
        void claimDailyGold(false);
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
                <div className="flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1.5">
                    <img src="/images/icon/icon_coin.png" alt="" className="h-5 w-5 object-contain" aria-hidden="true" />
                    <span className="text-sm font-black text-yellow-300 font-mono">{displayedGold}</span>
                </div>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 w-full max-w-5xl mx-auto z-10 overflow-y-auto px-4 pb-8 scrollbar-hide min-h-0">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="sticky top-0 z-20 -mx-4 mb-5 px-4 pb-3 pt-2 backdrop-blur-sm"
                >
                    <motion.div
                        variants={itemVariants}
                        className="mb-4 flex gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-2 shadow-lg backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/80"
                    >
                        <button
                            onClick={() => handleTabChange('premium')}
                            className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition-all ${activeTab === 'premium'
                                ? 'bg-slate-900 text-white shadow-md dark:bg-white dark:text-black'
                                : 'text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-700/60'}`}
                        >
                            {t('shop.premiumTab', '프리미엄')}
                        </button>
                        <button
                            onClick={() => handleTabChange('items')}
                            className={`relative flex-1 rounded-xl px-4 py-3 text-sm font-black transition-all ${activeTab === 'items'
                                ? 'bg-slate-900 text-white shadow-md dark:bg-white dark:text-black'
                                : 'text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-700/60'}`}
                        >
                            {hasDailyShopFreeReward && (
                                <span className="absolute right-3 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-slate-50 dark:ring-gray-900" aria-hidden="true" />
                            )}
                            {t('shop.goldTab', '골드')}
                        </button>
                    </motion.div>
                </motion.div>

                <AnimatePresence mode="wait">
                    {activeTab === 'items' ? (
                        <motion.div
                            key="item-shop-tab"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                        >
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="grid grid-cols-1 gap-4 sm:col-span-3 sm:grid-cols-2">
                                    <div className="relative overflow-hidden rounded-2xl border border-cyan-300/30 bg-white p-5 shadow-md dark:border-cyan-300/20 dark:bg-gray-800/60">
                                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 via-blue-500/10 to-yellow-300/15 opacity-90" />
                                        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/40 bg-cyan-400/10 shadow-sm dark:border-cyan-200/20 dark:bg-cyan-400/10 dark:shadow-none">
                                                    <img src="/images/icon/icon_pen.png" alt={t('ad.pencils', '연필')} className="h-10 w-10 object-contain" />
                                                </div>
                                                <div>
                                                    <div className="mb-1 inline-flex rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-200">
                                                        {t('shop.dailyFreePencilBadge', 'Daily Gift')}
                                                    </div>
                                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                                        {t('shop.dailyFreePencilTitle', '오늘의 무료 연필')}
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-gray-400">
                                                        {!shopFreePencilClaimedToday
                                                            ? t('shop.dailyFreePencilDesc', '하루에 한 번 상점에서 연필 1개를 받을 수 있어요.')
                                                            : !shopFreePencilAdClaimedToday
                                                                ? t('shop.dailyFreePencilAdDesc', '광고를 보고 오늘 한 번 더 받을 수 있어요.')
                                                                : t('shop.dailyFreePencilClaimedDesc', '오늘은 이미 받았습니다. 내일 다시 받아보세요.')}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={!shopFreePencilClaimedToday ? handleDailyPencilClaim : () => setShowDailyPencilAdModal(true)}
                                                disabled={!user || claimingDailyPencil || (shopFreePencilClaimedToday && shopFreePencilAdClaimedToday)}
                                                className="inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-white shadow-md shadow-cyan-500/20 transition-colors hover:bg-cyan-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-60 dark:text-slate-950"
                                            >
                                                {claimingDailyPencil ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        {t('common.loading', '로딩 중...')}
                                                    </>
                                                ) : !shopFreePencilClaimedToday ? (
                                                    t('shop.dailyFreePencilClaimButton', '무료로 받기')
                                                ) : !shopFreePencilAdClaimedToday ? (
                                                    t('shop.dailyFreeAdClaimButton', '광고로 한 번 더')
                                                ) : (
                                                    t('shop.dailyFreePencilClaimedButton', '수령 완료')
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="relative overflow-hidden rounded-2xl border border-yellow-300/30 bg-white p-5 shadow-md dark:border-yellow-300/20 dark:bg-gray-800/60">
                                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/25 via-amber-500/10 to-orange-300/15 opacity-90" />
                                        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-yellow-200/50 bg-yellow-400/15 shadow-sm dark:border-yellow-200/20 dark:bg-yellow-400/10 dark:shadow-none">
                                                    <img src="/images/icon/icon_coin.png" alt={t('ad.gold', '골드')} className="h-11 w-11 object-contain" />
                                                </div>
                                                <div>
                                                    <div className="mb-1 inline-flex rounded-full border border-yellow-300/40 bg-yellow-400/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-600 dark:text-yellow-200">
                                                        {t('shop.dailyFreeGoldBadge', 'Daily Gold')}
                                                    </div>
                                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                                        {t('shop.dailyFreeGoldTitle', '오늘의 무료 골드')}
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-gray-400">
                                                        {!shopFreeGoldClaimedToday
                                                            ? t('shop.dailyFreeGoldDesc', '하루에 한 번 골드 {{count}}개를 받을 수 있어요.', { count: DAILY_SHOP_GOLD_AMOUNT })
                                                            : !shopFreeGoldAdClaimedToday
                                                                ? t('shop.dailyFreeGoldAdDesc', '광고를 보고 오늘 한 번 더 받을 수 있어요.')
                                                                : t('shop.dailyFreeGoldClaimedDesc', '오늘은 이미 받았습니다. 내일 다시 받아보세요.')}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={!shopFreeGoldClaimedToday ? handleDailyGoldClaim : () => setShowDailyGoldAdModal(true)}
                                                disabled={!user || claimingDailyGold || (shopFreeGoldClaimedToday && shopFreeGoldAdClaimedToday)}
                                                className="inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-slate-950 shadow-md shadow-yellow-500/20 transition-colors hover:bg-yellow-300 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-60"
                                            >
                                                {claimingDailyGold ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        {t('common.loading', '로딩 중...')}
                                                    </>
                                                ) : !shopFreeGoldClaimedToday ? (
                                                    t('shop.dailyFreeGoldClaimButton', '무료로 받기')
                                                ) : !shopFreeGoldAdClaimedToday ? (
                                                    t('shop.dailyFreeAdClaimButton', '광고로 한 번 더')
                                                ) : (
                                                    t('shop.dailyFreeGoldClaimedButton', '수령 완료')
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {GOLD_PENCIL_PACKAGES.map((item) => (
                                    <div
                                        key={item.id}
                                        className="relative overflow-hidden rounded-2xl border border-yellow-400/20 bg-white p-5 shadow-md dark:border-yellow-400/20 dark:bg-gray-800/60"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 via-transparent to-cyan-500/10 opacity-80" />
                                        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex min-w-0 items-center gap-4">
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-yellow-300/30 bg-yellow-400/10 shadow-sm dark:border-yellow-300/20 dark:bg-yellow-400/10 dark:shadow-none">
                                                    <img src="/images/icon/icon_pen.png" alt={t('ad.pencils', '연필')} className="h-10 w-10 object-contain" />
                                                </div>
                                                <div className="min-w-0">
                                                    {'tagKey' in item && item.tagKey ? (
                                                        <span className="mb-1 inline-flex rounded-full border border-yellow-300/40 bg-yellow-400/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-yellow-600 dark:text-yellow-200">
                                                            {t(item.tagKey, 'Best Value')}
                                                        </span>
                                                    ) : null}
                                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                                        {t(item.titleKey)}
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-gray-400">
                                                        {t(item.descKey)}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleGoldPencilPurchase(item.quantity)}
                                                disabled={!user || buyingGoldPencilQuantity === item.quantity || displayedGold < item.goldPrice}
                                                className="inline-flex min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:shadow-none"
                                            >
                                                {buyingGoldPencilQuantity === item.quantity ? (
                                                    <span className="inline-flex items-center gap-2">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        {t('common.loading', '로딩 중...')}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <img src="/images/icon/icon_coin.png" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
                                                        <span>{item.goldPrice}</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {itemShopItems.map((item) => (
                                    <div
                                        key={item.item_code}
                                        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800/60"
                                    >
                                        <div className={`absolute inset-0 bg-gradient-to-br ${item.visual.accent} opacity-70`} />
                                        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex min-w-0 items-center gap-4">
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 shadow-sm dark:border-white/10 dark:bg-gray-900/60 dark:shadow-none">
                                                    {item.visual.icon}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="mb-1 inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">
                                                        {t('shop.ownedCount', '보유 {{count}}개', { count: item.ownedQuantity })}
                                                    </div>
                                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                                        {t(item.name_key)}
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-gray-400">
                                                        {t(item.description_key)}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleItemPurchase(item.item_code)}
                                                disabled={!user || buyingItemCode === item.item_code || loadingItemShop || displayedGold < item.gold_price}
                                                className="inline-flex min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:shadow-none"
                                            >
                                                {buyingItemCode === item.item_code ? (
                                                    <span className="inline-flex items-center gap-2">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        {t('common.loading', '로딩 중...')}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <img src="/images/icon/icon_coin.png" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
                                                        <span>{item.gold_price}</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {!loadingItemShop && itemShopItems.length < 1 && (
                                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-700 dark:text-amber-200">
                                    {t('shop.noItemShopItems', '현재 구매 가능한 아이템이 없습니다.')}
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="premium-shop-tab"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                        >
                            <motion.div
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                            >
                                {items.map((item) => (
                                    <motion.div
                                        key={item.id}
                                        variants={itemVariants}
                                        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800/60"
                                    >
                                        <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} opacity-70`} />

                                        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex min-w-0 items-center gap-4">
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 shadow-sm dark:border-white/10 dark:bg-gray-900/60 dark:shadow-none">
                                                    <div className="relative flex h-10 w-10 items-center justify-center">
                                                        {item.icon}
                                                        {item.runtimeIconUrl && (
                                                            <img
                                                                src={item.runtimeIconUrl}
                                                                alt={t(item.titleKey)}
                                                                className="absolute inset-0 h-full w-full object-contain"
                                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="min-w-0">
                                                    {item.tagKey && (
                                                        <span className="mb-1 inline-flex rounded-full border border-slate-200 bg-white/50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-800 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-white dark:shadow-none">
                                                            {t(item.tagKey, 'Popular')}
                                                        </span>
                                                    )}
                                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                                        {t(item.titleKey)}
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-gray-400">
                                                        {t(item.descKey)}
                                                    </p>
                                                </div>
                                            </div>
                                            {item.productId === PRODUCT_IDS.removeAds && profile?.ads_removed ? (
                                                <button
                                                    disabled
                                                    className="inline-flex min-w-[7rem] cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 dark:bg-gray-600 dark:text-gray-300"
                                                >
                                                    {t('shop.purchased', 'Purchased')}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handlePurchase(item)}
                                                    disabled={loadingPrices || purchasing}
                                                    className="inline-flex min-w-[7rem] items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:shadow-none dark:hover:bg-gray-200"
                                                >
                                                    {loadingPrices ? t('shop.loading', 'Loading...') : item.priceLabel}
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                            {items.length === 0 && (
                                <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-700 dark:text-amber-200">
                                    {t('shop.noEnabledItems', '현재 구매 가능한 상품이 없습니다.')}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>


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
                            <h3 className="text-xl font-black text-white mb-3">
                                {t('shop.rewardTitle', '획득')}
                            </h3>
                            {purchaseReward.amount !== null && (
                                <div className="mb-6 flex items-center justify-center gap-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-5 py-4">
                                    {purchaseReward.iconEmoji ? (
                                        <span className="text-4xl select-none" role="img" aria-label={purchaseReward.iconAlt}>
                                            {purchaseReward.iconEmoji}
                                        </span>
                                    ) : (
                                        <img
                                            src={purchaseReward.iconSrc}
                                            alt={purchaseReward.iconAlt}
                                            className="h-12 w-12 object-contain"
                                        />
                                    )}
                                    <span className="text-3xl font-black text-yellow-300">
                                        +{purchaseReward.amount}
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
            <AdModal
                isOpen={showDailyPencilAdModal}
                onClose={() => setShowDailyPencilAdModal(false)}
                onReward={() => claimDailyPencil(true)}
                adsRemoved={Boolean(profile?.ads_removed)}
                variant="pencils"
                closeOnReward
            />
            <AdModal
                isOpen={showDailyGoldAdModal}
                onClose={() => setShowDailyGoldAdModal(false)}
                onReward={() => claimDailyGold(true)}
                adsRemoved={Boolean(profile?.ads_removed)}
                variant="gold"
                closeOnReward
            />
        </div>
    );
};

export default Shop;
