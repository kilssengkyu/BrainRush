import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, Pencil, Ban, Sparkles } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { consumePurchaseToken, getTransactionId, loadProducts, PRODUCT_IDS, purchaseProduct, type ShopProductId } from '../lib/purchaseService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Capacitor } from '@capacitor/core';

type ShopItem = {
    id: string;
    productId: ShopProductId;
    titleKey: string;
    descKey: string;
    priceLabel?: string;
    tagKey?: string;
    accent: string;
    icon: ReactNode;
    isConsumable?: boolean;
};

const Shop = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { playSound } = useSound();
    const { showToast } = useUI();
    const { user, profile, refreshProfile } = useAuth();
    const [priceMap, setPriceMap] = useState<Record<string, string>>({});
    const [loadingPrices, setLoadingPrices] = useState(false);

    const items = useMemo<ShopItem[]>(() => ([
        {
            id: 'remove_ads',
            productId: PRODUCT_IDS.removeAds,
            titleKey: 'shop.removeAds.title',
            descKey: 'shop.removeAds.desc',
            priceLabel: priceMap[PRODUCT_IDS.removeAds] || t('shop.priceTbd', 'TBD'),
            tagKey: 'shop.premium',
            accent: 'from-rose-500/20 to-transparent',
            icon: <Ban className="w-8 h-8 text-rose-300" />
        },
        {
            id: 'pencils_5',
            productId: PRODUCT_IDS.pencils5,
            titleKey: 'shop.pencils5.title',
            descKey: 'shop.pencils5.desc',
            priceLabel: priceMap[PRODUCT_IDS.pencils5] || '₩1,200',
            accent: 'from-yellow-500/20 to-transparent',
            icon: <Pencil className="w-8 h-8 text-yellow-300" />,
            isConsumable: true,
        },
        {
            id: 'pencils_20',
            productId: PRODUCT_IDS.pencils20,
            titleKey: 'shop.pencils20.title',
            descKey: 'shop.pencils20.desc',
            priceLabel: priceMap[PRODUCT_IDS.pencils20] || '₩3,900',
            tagKey: 'shop.popular',
            accent: 'from-emerald-500/20 to-transparent',
            icon: <Pencil className="w-8 h-8 text-emerald-300" />,
            isConsumable: true,
        },
        {
            id: 'pencils_100',
            productId: PRODUCT_IDS.pencils100,
            titleKey: 'shop.pencils100.title',
            descKey: 'shop.pencils100.desc',
            priceLabel: priceMap[PRODUCT_IDS.pencils100] || '₩19,000',
            tagKey: 'shop.bestValue',
            accent: 'from-sky-500/20 to-transparent',
            icon: <Sparkles className="w-8 h-8 text-sky-300" />,
            isConsumable: true,
        }
    ]), [priceMap, t]);

    useEffect(() => {
        let active = true;
        const fetchPrices = async () => {
            setLoadingPrices(true);
            try {
                const products = await loadProducts([
                    PRODUCT_IDS.removeAds,
                    PRODUCT_IDS.pencils5,
                    PRODUCT_IDS.pencils20,
                    PRODUCT_IDS.pencils100,
                ]);
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
    }, []);

    const handleBack = () => {
        playSound('click');
        navigate('/');
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
        try {
            const transaction = await purchaseProduct(item.productId);
            const transactionId = getTransactionId(transaction);
            if (!transactionId) {
                throw new Error('Missing transaction id');
            }

            const { data, error: verifyError } = await supabase.functions.invoke('verify-purchase', {
                body: {
                    platform: Capacitor.getPlatform(),
                    productId: item.productId,
                    transactionId
                }
            });
            if (verifyError || !data?.ok) {
                throw new Error(verifyError?.message || data?.error || 'Verification failed');
            }

            if (item.isConsumable) {
                await consumePurchaseToken(transactionId);
            }
            await refreshProfile();
            showToast(t('shop.purchaseSuccess', 'Purchase completed.'), 'success');
            console.log('Purchase success:', item.productId);
        } catch (err: any) {
            console.error('Purchase failed:', err);
            const message = err?.message?.includes('Billing not supported')
                ? t('shop.billingUnavailable', 'Billing not supported on this device.')
                : t('shop.purchaseFail', 'Purchase failed.');
            showToast(message, 'error');
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
        <div className="h-[100dvh] bg-gray-900 text-white flex flex-col p-4 pt-[calc(env(safe-area-inset-top)+1rem)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black pointer-events-none" />

            <div className="w-full max-w-5xl mx-auto flex items-center justify-between z-10 mb-6 pt-4">
                <button onClick={handleBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
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
                        <p className="text-xs text-gray-400 uppercase tracking-widest">
                            {t('shop.subtitle', 'Boost your play')}
                        </p>
                    </div>
                </div>
                <div className="w-10" />
            </div>

            <div className="flex-1 w-full max-w-5xl mx-auto z-10 overflow-y-auto pb-8 scrollbar-hide">
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
                            className="relative bg-gray-800/60 border border-gray-700 rounded-2xl p-6 overflow-hidden shadow-xl"
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} opacity-70`} />

                            <div className="relative z-10 flex items-center justify-between mb-6">
                                <div className="p-3 rounded-full bg-gray-900/60 border border-white/10">
                                    {item.icon}
                                </div>
                                {item.tagKey && (
                                    <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full bg-white/10 border border-white/20 text-white">
                                        {t(item.tagKey, 'Popular')}
                                    </span>
                                )}
                            </div>

                            <div className="relative z-10">
                                <h3 className="text-xl font-bold text-white mb-2">
                                    {t(item.titleKey)}
                                </h3>
                                <p className="text-sm text-gray-400 mb-6">
                                    {t(item.descKey)}
                                </p>
                                <div className="flex items-center justify-between">
                                    <div className="text-2xl font-black text-white">
                                        {item.priceLabel}
                                    </div>
                                    {item.productId === PRODUCT_IDS.removeAds && profile?.ads_removed ? (
                                        <button
                                            disabled
                                            className="px-4 py-2 rounded-xl bg-gray-600 text-gray-300 font-bold text-sm cursor-not-allowed"
                                        >
                                            {t('shop.purchased', 'Purchased')}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handlePurchase(item)}
                                            disabled={loadingPrices}
                                            className="px-4 py-2 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors active:scale-95"
                                        >
                                            {loadingPrices ? t('shop.loading', 'Loading...') : t('shop.buy', 'Buy')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                <div className="mt-6 text-center text-xs text-gray-500">
                    {t('shop.notice', 'Payments are processed via App Store / Google Play.')}
                </div>
            </div>
        </div>
    );
};

export default Shop;
