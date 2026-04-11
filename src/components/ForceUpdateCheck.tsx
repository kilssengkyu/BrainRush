import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';

function compareVersions(current: string, minimum: string): number {
    const a = current.split('.').map(Number);
    const b = minimum.split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const av = a[i] || 0;
        const bv = b[i] || 0;
        if (av < bv) return -1;
        if (av > bv) return 1;
    }
    return 0;
}

const ForceUpdateCheck = () => {
    const { t } = useTranslation();
    const [needsUpdate, setNeedsUpdate] = useState(false);
    const [storeUrl, setStoreUrl] = useState('');
    const [debugInfo, setDebugInfo] = useState<any>(null);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const checkVersion = async () => {
            try {
                const info = await App.getInfo();
                const currentVersion = info.version; // e.g. "1.0.0"
                const platform = Capacitor.getPlatform(); // "ios" or "android"

                const versionKey = platform === 'ios' ? 'min_ios_version' : 'min_android_version';
                const urlKey = platform === 'ios' ? 'store_url_ios' : 'store_url_android';

                const { data, error } = await supabase
                    .from('app_config')
                    .select('key, value')
                    .in('key', [versionKey, urlKey]);

                if (error || !data) return;

                const minVersion = data.find(d => d.key === versionKey)?.value;
                const url = data.find(d => d.key === urlKey)?.value;

                const cmp = minVersion ? compareVersions(currentVersion, minVersion) : 0;

                setDebugInfo({
                    current: currentVersion,
                    currentType: typeof currentVersion,
                    min: minVersion,
                    platform,
                    compareResult: cmp
                });

                if (minVersion && cmp < 0) {
                    setNeedsUpdate(true);
                    setStoreUrl(url || '');
                }
            } catch (err) {
                console.error('[ForceUpdate] Check failed:', err);
                // Fail silently on error so we don't block the user
            }
        };

        checkVersion();
    }, []);

    const handleUpdate = async () => {
        if (storeUrl) {
            await Browser.open({ url: storeUrl });
        }
    };

    if (!needsUpdate || !debugInfo) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-6">
            <div className="bg-slate-50 dark:bg-gray-900 rounded-2xl p-8 max-w-sm w-full text-center border border-yellow-500/30 shadow-2xl">
                <div className="text-5xl mb-4">🚀</div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    {t('update.title', '업데이트 필요')}
                </h2>
                <p className="text-slate-600 dark:text-gray-300 text-sm mb-4 leading-relaxed">
                    {t('update.message', '새로운 버전이 출시되었습니다. 원활한 플레이를 위해 업데이트해주세요.')}
                </p>
                <p className="text-gray-500 text-xs mb-6">
                    {t('update.versionInfo', { current: debugInfo?.current || '?', min: debugInfo?.min || '?' })}
                </p>
                {storeUrl ? (
                    <button
                        onClick={handleUpdate}
                        className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-xl text-lg active:scale-95 transition-transform"
                    >
                        {t('update.button', '업데이트')}
                    </button>
                ) : (
                    <p className="text-gray-500 text-xs">
                        {t('update.storeNotReady', '스토어 준비 중입니다.')}
                    </p>
                )}
            </div>
        </div>
    );
};

export default ForceUpdateCheck;
