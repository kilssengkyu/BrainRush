import { AdMob } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

const PROD_REWARDED_ADS = {
    ios: 'ca-app-pub-4893861547827379/8300296145',
    android: 'ca-app-pub-4893861547827379/1519157571',
};

const TEST_REWARDED_ADS = {
    ios: 'ca-app-pub-3940256099942544/1712485313',
    android: 'ca-app-pub-3940256099942544/5224354917',
};

const MIN_PREPARE_INTERVAL_MS = 2500;
const NO_FILL_COOLDOWN_MS = 15000;
const ERROR_COOLDOWN_MS = 5000;

let isPrepared = false;
let preparingPromise: Promise<boolean> | null = null;
let cooldownUntil = 0;
let lastPrepareAt = 0;

const getRewardedAdId = () => {
    const platform = Capacitor.getPlatform();
    const adsMode = String(import.meta.env.VITE_ADS_MODE ?? import.meta.env.VITE_APP_ENV ?? '').toLowerCase();
    const isProdAds = adsMode === 'prod' || adsMode === 'production';

    if (isProdAds) {
        return platform === 'ios' ? PROD_REWARDED_ADS.ios : PROD_REWARDED_ADS.android;
    }
    return platform === 'ios' ? TEST_REWARDED_ADS.ios : TEST_REWARDED_ADS.android;
};

export const isNoFillError = (err: unknown): boolean => {
    const msg = String((err as any)?.message ?? (err as any)?.errorMessage ?? err ?? '').toLowerCase();
    return msg.includes('no fill') || msg.includes('nofill');
};

export const primeRewardedAd = async (force = false): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    if (isPrepared) return true;
    if (preparingPromise) return preparingPromise;

    const now = Date.now();
    if (!force) {
        if (now < cooldownUntil) return false;
        if (now - lastPrepareAt < MIN_PREPARE_INTERVAL_MS) return false;
    }

    lastPrepareAt = now;
    const adId = getRewardedAdId();

    preparingPromise = (async () => {
        try {
            await AdMob.prepareRewardVideoAd({ adId });
            isPrepared = true;
            cooldownUntil = 0;
            return true;
        } catch (err) {
            isPrepared = false;
            cooldownUntil = Date.now() + (isNoFillError(err) ? NO_FILL_COOLDOWN_MS : ERROR_COOLDOWN_MS);
            return false;
        } finally {
            preparingPromise = null;
        }
    })();

    return preparingPromise;
};

export const showRewardedAd = async (): Promise<void> => {
    await AdMob.showRewardVideoAd();
    isPrepared = false;
    // Warm up next rewarded ad in background with built-in throttle/cooldown.
    window.setTimeout(() => {
        void primeRewardedAd(false);
    }, 400);
};

