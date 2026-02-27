const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';

export const getNotificationsEnabled = (): boolean => {
    const saved = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (saved === null) return true;
    return saved === 'true';
};

export const setNotificationsEnabled = (enabled: boolean) => {
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
};

