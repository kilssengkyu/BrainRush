import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;
type GameAnalyticsModule = typeof import('gameanalytics');
type GameAnalyticsApi = GameAnalyticsModule['GameAnalytics'];

const GAMEANALYTICS_GAME_KEY = import.meta.env.VITE_GAMEANALYTICS_GAME_KEY?.trim();
const GAMEANALYTICS_SECRET_KEY = import.meta.env.VITE_GAMEANALYTICS_SECRET_KEY?.trim();
const GAMEANALYTICS_BUILD = import.meta.env.VITE_APP_VERSION?.trim() || '18.00.10';

let gameAnalyticsApi: GameAnalyticsApi | null = null;
let gameAnalyticsInitPromise: Promise<GameAnalyticsApi | null> | null = null;
let gameAnalyticsUserId: string | null = null;
let gameAnalyticsLifecycleRegistered = false;

const toSerializableParams = (params?: AnalyticsParams) => {
    if (!params) return undefined;
    return Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined)
    );
};

const sanitizeGameAnalyticsPart = (value: string) => {
    const sanitized = value
        .trim()
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return (sanitized || 'event').slice(0, 32);
};

const toGameAnalyticsEventId = (name: string) => {
    const parts = name
        .split(/[:_]+/)
        .filter(Boolean)
        .slice(0, 5)
        .map(sanitizeGameAnalyticsPart);
    return parts.length > 0 ? parts.join(':') : 'event';
};

const toGameAnalyticsFields = (params?: AnalyticsParams) => {
    if (!params) return undefined;

    const fields = Object.entries(params).reduce<Record<string, string | number>>((acc, [key, value]) => {
        if (value === null || value === undefined) return acc;

        const fieldKey = sanitizeGameAnalyticsPart(key);
        if (typeof value === 'string') {
            acc[fieldKey] = value.slice(0, 128);
            return acc;
        }

        if (typeof value === 'boolean') {
            acc[fieldKey] = value ? 1 : 0;
            return acc;
        }

        acc[fieldKey] = value;
        return acc;
    }, {});

    return Object.keys(fields).length > 0 ? fields : undefined;
};

const getGameAnalyticsValue = (params?: AnalyticsParams) => {
    if (!params) return undefined;

    const preferredValue = params.value ?? params.score ?? params.amount ?? params.duration;
    return typeof preferredValue === 'number' && Number.isFinite(preferredValue) ? preferredValue : undefined;
};

const resolveGameAnalyticsApi = (module: GameAnalyticsModule) => {
    const moduleWithDefault = module as GameAnalyticsModule & {
        default?: GameAnalyticsApi | { GameAnalytics?: GameAnalyticsApi };
    };
    const defaultExport = moduleWithDefault.default;

    if (module.GameAnalytics) return module.GameAnalytics;
    if (defaultExport && typeof defaultExport === 'object' && 'GameAnalytics' in defaultExport) {
        return defaultExport.GameAnalytics ?? null;
    }
    return typeof defaultExport === 'function' ? defaultExport : null;
};

const registerGameAnalyticsLifecycle = (api: GameAnalyticsApi) => {
    if (gameAnalyticsLifecycleRegistered || !Capacitor.isNativePlatform()) return;
    gameAnalyticsLifecycleRegistered = true;

    void App.addListener('appStateChange', ({ isActive }) => {
        try {
            if (isActive) {
                api.onResume();
            } else {
                api.onStop();
            }
        } catch {
            // no-op
        }
    });
};

const getGameAnalytics = async () => {
    if (!GAMEANALYTICS_GAME_KEY || !GAMEANALYTICS_SECRET_KEY || typeof navigator === 'undefined') {
        return null;
    }

    if (gameAnalyticsApi) return gameAnalyticsApi;
    if (gameAnalyticsInitPromise) return gameAnalyticsInitPromise;

    gameAnalyticsInitPromise = import('gameanalytics')
        .then((module) => {
            const api = resolveGameAnalyticsApi(module);
            if (!api) return null;

            api.setEnabledInfoLog(import.meta.env.DEV);
            api.setEnabledVerboseLog(false);
            api.configureBuild(`${Capacitor.getPlatform()} ${GAMEANALYTICS_BUILD}`);
            api.configureAvailableResourceCurrencies(['gold', 'pencil']);
            api.configureAvailableResourceItemTypes(['item', 'pencil', 'reward', 'purchase']);
            if (gameAnalyticsUserId) {
                api.configureUserId(gameAnalyticsUserId);
                api.setGlobalCustomEventFields({ user_id: gameAnalyticsUserId });
            }
            api.initialize(GAMEANALYTICS_GAME_KEY, GAMEANALYTICS_SECRET_KEY);
            registerGameAnalyticsLifecycle(api);

            gameAnalyticsApi = api;
            return api;
        })
        .catch((error) => {
            console.warn('GameAnalytics initialization failed:', error);
            gameAnalyticsInitPromise = null;
            return null;
        });

    return gameAnalyticsInitPromise;
};

const logGameAnalyticsEvent = async (name: string, params?: AnalyticsParams) => {
    const api = await getGameAnalytics();
    if (!api) return;

    api.addDesignEvent(
        toGameAnalyticsEventId(name),
        getGameAnalyticsValue(params),
        toGameAnalyticsFields(params)
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

    try {
        await logGameAnalyticsEvent(name, params);
    } catch {
        // Analytics should never block app flows.
    }
};

export const setAnalyticsUserId = async (userId: string | null) => {
    gameAnalyticsUserId = userId;

    try {
        await FirebaseAnalytics.setUserId({ userId });
    } catch {
        // no-op
    }

    try {
        const api = await getGameAnalytics();
        if (!api) return;
        api.setGlobalCustomEventFields(userId ? { user_id: userId } : {});
    } catch {
        // no-op
    }
};
