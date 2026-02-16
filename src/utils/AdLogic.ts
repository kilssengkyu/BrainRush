import { AdMob } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

const AD_COUNTER_KEY = 'brainrush_ad_counter';
const AD_FREQUENCY = 3;

// Production Ad Unit IDs
const ADS = {
    ios: {
        interstitial: 'ca-app-pub-4893861547827379/2286186595',
    },
    android: {
        interstitial: 'ca-app-pub-4893861547827379/5384065171',
    }
};

// Test IDs
const TEST_ADS = {
    ios: {
        interstitial: 'ca-app-pub-3940256099942544/4411468910',
    },
    android: {
        interstitial: 'ca-app-pub-3940256099942544/1033173712',
    }
};

export const AdLogic = {
    // Increment game counter and check if ad should be shown
    checkAndShowInterstitial: async () => {
        if (!Capacitor.isNativePlatform()) return;

        let count = parseInt(localStorage.getItem(AD_COUNTER_KEY) || '0');
        count++;

        console.log(`[AdLogic] Game Count: ${count}/${AD_FREQUENCY}`);

        if (count >= AD_FREQUENCY) {
            // Show Ad
            const shown = await AdLogic.showInterstitial();
            if (shown) {
                // Reset only when ad was actually shown.
                localStorage.setItem(AD_COUNTER_KEY, '0');
            } else {
                // Keep it one step before threshold so we can retry soon.
                localStorage.setItem(AD_COUNTER_KEY, String(AD_FREQUENCY - 1));
            }
        } else {
            // Just save incremented count
            localStorage.setItem(AD_COUNTER_KEY, count.toString());
        }
    },

    // Show Interstitial Ad
    showInterstitial: async () => {
        try {
            const platform = Capacitor.getPlatform();
            const adsMode = String(import.meta.env.VITE_ADS_MODE ?? import.meta.env.VITE_APP_ENV ?? '').toLowerCase();
            const isProd = adsMode === 'prod' || adsMode === 'production';

            // Determine ID
            let adId = '';
            if (isProd) {
                adId = platform === 'ios' ? ADS.ios.interstitial : ADS.android.interstitial;
            } else {
                adId = platform === 'ios' ? TEST_ADS.ios.interstitial : TEST_ADS.android.interstitial;
            }

            if (adId.includes('xxx')) {
                console.warn('[AdLogic] Android Interstitial ID missing, skipping.');
                return false;
            }

            await AdMob.prepareInterstitial({ adId });
            await AdMob.showInterstitial();
            return true;
        } catch (error) {
            console.error('[AdLogic] Failed to show interstitial:', error);
            return false;
        }
    },

    // Reset counter (Fair Ad Logic - Call this when user watches Rewarded Ad)
    resetAdCounter: () => {
        console.log('[AdLogic] Fair Ad: Counter Reset!');
        localStorage.setItem(AD_COUNTER_KEY, '0');
    }
};
