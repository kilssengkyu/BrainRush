import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, Pencil, Ban, Sparkles } from 'lucide-react';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';

type ShopItem = {
    id: string;
    titleKey: string;
    descKey: string;
    priceLabel?: string;
    tagKey?: string;
    accent: string;
    icon: JSX.Element;
};

const Shop = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { playSound } = useSound();
    const { showToast } = useUI();

    const items = useMemo<ShopItem[]>(() => ([
        {
            id: 'remove_ads',
            titleKey: 'shop.removeAds.title',
            descKey: 'shop.removeAds.desc',
            priceLabel: t('shop.priceTbd', 'TBD'),
            tagKey: 'shop.premium',
            accent: 'from-rose-500/20 to-transparent',
            icon: <Ban className="w-8 h-8 text-rose-300" />
        },
        {
            id: 'pencils_5',
            titleKey: 'shop.pencils5.title',
            descKey: 'shop.pencils5.desc',
            priceLabel: '₩1,200',
            accent: 'from-yellow-500/20 to-transparent',
            icon: <Pencil className="w-8 h-8 text-yellow-300" />
        },
        {
            id: 'pencils_20',
            titleKey: 'shop.pencils20.title',
            descKey: 'shop.pencils20.desc',
            priceLabel: '₩5,500',
            tagKey: 'shop.popular',
            accent: 'from-emerald-500/20 to-transparent',
            icon: <Pencil className="w-8 h-8 text-emerald-300" />
        },
        {
            id: 'pencils_100',
            titleKey: 'shop.pencils100.title',
            descKey: 'shop.pencils100.desc',
            priceLabel: '₩25,000',
            tagKey: 'shop.bestValue',
            accent: 'from-sky-500/20 to-transparent',
            icon: <Sparkles className="w-8 h-8 text-sky-300" />
        }
    ]), [t]);

    const handleBack = () => {
        playSound('click');
        navigate('/');
    };

    const handlePurchase = (itemId: string) => {
        playSound('click');
        showToast(t('shop.comingSoon', 'Preparing purchase flow...'), 'info');
        console.log('Purchase clicked:', itemId);
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
        <div className="h-[100dvh] bg-gray-900 text-white flex flex-col p-4 relative overflow-hidden">
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
                                    <button
                                        onClick={() => handlePurchase(item.id)}
                                        className="px-4 py-2 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors active:scale-95"
                                    >
                                        {t('shop.buy', 'Buy')}
                                    </button>
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
