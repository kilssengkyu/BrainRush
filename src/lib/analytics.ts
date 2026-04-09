import { FirebaseAnalytics } from '@capacitor-firebase/analytics';

type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

const toSerializableParams = (params?: AnalyticsParams) => {
    if (!params) return undefined;
    return Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined)
    );
};

export const logAnalyticsEvent = async (name: string, params?: AnalyticsParams) => {
    try {
        await FirebaseAnalytics.logEvent({
            name,
            params: toSerializableParams(params),
        });
    } catch {
        // Analytics should never block app flows.
    }
};

export const setAnalyticsUserId = async (userId: string | null) => {
    try {
        await FirebaseAnalytics.setUserId({ userId });
    } catch {
        // no-op
    }
};
