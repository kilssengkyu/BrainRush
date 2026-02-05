import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

const FULL_PENCILS_ID = 2001;
const REMINDER_24H_ID = 2002;
const MAX_PENCILS = 5;
const RECHARGE_MINUTES = 30;

const scheduleNotification = async (id: number, title: string, body: string, at: Date) => {
    await LocalNotifications.schedule({
        notifications: [
            {
                id,
                title,
                body,
                schedule: { at },
                smallIcon: 'ic_stat_notify',
            }
        ]
    });
};

const LocalNotificationScheduler = () => {
    const { profile } = useAuth();
    const { t } = useTranslation();

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const setup = async () => {
            const permission = await LocalNotifications.requestPermissions();
            if (permission.display !== 'granted') return;

            const now = Date.now();

            // Cancel existing schedules to avoid duplicates
            await LocalNotifications.cancel({
                notifications: [{ id: FULL_PENCILS_ID }, { id: REMINDER_24H_ID }],
            });

            // 24h reminder from now
            await scheduleNotification(
                REMINDER_24H_ID,
                t('notifications.reminderTitle', 'Time to use your brain'),
                t('notifications.reminderBody', 'It has been 24 hours. Come back and play!'),
                new Date(now + 24 * 60 * 60 * 1000)
            );

            // Pencil full notification
            const pencils = profile?.pencils ?? null;
            const lastRechargeAt = profile?.last_recharge_at ? new Date(profile.last_recharge_at).getTime() : null;
            if (pencils !== null && lastRechargeAt) {
                const missing = Math.max(0, MAX_PENCILS - pencils);
                if (missing > 0) {
                    const elapsed = now - lastRechargeAt;
                    const timeToFull = (missing * RECHARGE_MINUTES * 60 * 1000) - elapsed;
                    if (timeToFull > 60 * 1000) {
                        await scheduleNotification(
                            FULL_PENCILS_ID,
                            t('notifications.fullTitle', 'Pencils full'),
                            t('notifications.fullBody', 'Pencils are full. Time to use your brain!'),
                            new Date(now + timeToFull)
                        );
                    }
                }
            }
        };

        setup().catch((err) => console.error('Local notification setup failed:', err));
    }, [profile?.pencils, profile?.last_recharge_at, t]);

    return null;
};

export default LocalNotificationScheduler;
