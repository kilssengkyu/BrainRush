import { AdMob } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

const AD_COUNTER_KEY = 'brainrush_ad_counter';
const AD_FREQUENCY = 2;
const AD_LAST_OUTCOME_KEY = 'brainrush_ad_last_outcome';
const AD_STREAK_COUNT_KEY = 'brainrush_ad_streak_count';
const AD_LOSE_SKIP_ONCE_KEY = 'brainrush_ad_lose_skip_once';

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
    checkAndShowInterstitial: async (outcome?: 'win' | 'lose' | 'draw') => {
        if (!Capacitor.isNativePlatform()) return;

        let count = parseInt(localStorage.getItem(AD_COUNTER_KEY) || '0');
        let lastOutcome = localStorage.getItem(AD_LAST_OUTCOME_KEY) || '';
        let streakCount = parseInt(localStorage.getItem(AD_STREAK_COUNT_KEY) || '0');
        let loseSkipOnce = localStorage.getItem(AD_LOSE_SKIP_ONCE_KEY) === '1';

        if (outcome) {
            if (outcome === lastOutcome) {
                streakCount += 1;
            } else {
                streakCount = 1;
                lastOutcome = outcome;
            }

            // Losing streak protection: if user keeps losing, skip next interstitial trigger once.
            if (outcome === 'lose' && streakCount >= 3 && !loseSkipOnce) {
                loseSkipOnce = true;
                localStorage.setItem(AD_LOSE_SKIP_ONCE_KEY, '1');
            }

            if (outcome !== 'lose' && loseSkipOnce) {
                loseSkipOnce = false;
                localStorage.setItem(AD_LOSE_SKIP_ONCE_KEY, '0');
            }

            localStorage.setItem(AD_LAST_OUTCOME_KEY, lastOutcome);
            localStorage.setItem(AD_STREAK_COUNT_KEY, String(streakCount));
        }

        count++;

        console.log(`[AdLogic] Game Count: ${count}/${AD_FREQUENCY}, Streak: ${streakCount} (${lastOutcome}), LoseSkipOnce: ${loseSkipOnce}`);

        if (count >= AD_FREQUENCY) {
            if (loseSkipOnce) {
                console.log('[AdLogic] Skipping interstitial once due to losing streak');
                localStorage.setItem(AD_COUNTER_KEY, '0');
                localStorage.setItem(AD_LOSE_SKIP_ONCE_KEY, '0');
                return;
            }
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

    // Show Interstitial Ad (with retry on NoFill)
    showInterstitial: async () => {
        const platform = Capacitor.getPlatform();
        const adsMode = String(import.meta.env.VITE_ADS_MODE ?? import.meta.env.VITE_APP_ENV ?? '').toLowerCase();
        const isProd = adsMode === 'prod' || adsMode === 'production';

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

        const MAX_RETRIES = 2;
        const RETRY_DELAYS = [1500, 3000]; // ms

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`[AdLogic] Interstitial retry ${attempt}/${MAX_RETRIES}...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
                }
                await AdMob.prepareInterstitial({ adId });
                await AdMob.showInterstitial();
                return true;
            } catch (error: any) {
                const msg = error?.message || error?.errorMessage || String(error);
                const isNoFill = msg.toLowerCase().includes('no fill') || msg.toLowerCase().includes('nofill');
                if (isNoFill && attempt < MAX_RETRIES) {
                    console.warn(`[AdLogic] Interstitial NoFill (attempt ${attempt + 1}), will retry...`);
                    continue;
                }
                console.error('[AdLogic] Failed to show interstitial:', error);
                return false;
            }
        }
        return false;
    },

    // Reset counter (Fair Ad Logic - Call this when user watches Rewarded Ad)
    resetAdCounter: () => {
        console.log('[AdLogic] Fair Ad: Counter Reset!');
        localStorage.setItem(AD_COUNTER_KEY, '0');
    }
};
