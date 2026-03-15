import { createElement } from 'react';
import type { ComponentType } from 'react';


export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master';

export const getTierFromMMR = (mmr: number): Tier => {
    if (mmr >= 2400) return 'Master';
    if (mmr >= 2000) return 'Diamond';
    if (mmr >= 1600) return 'Platinum';
    if (mmr >= 1200) return 'Gold';
    if (mmr >= 800) return 'Silver';
    return 'Bronze';
};

export const getTierColor = (tier: string): string => {
    switch (tier) {
        case 'Master': return 'from-red-400 to-orange-500';
        case 'Diamond': return 'from-fuchsia-300 to-pink-500';
        case 'Platinum': return 'from-sky-300 to-blue-500';
        case 'Gold': return 'from-amber-300 to-orange-500';
        case 'Silver': return 'from-slate-300 to-slate-500';
        default: return 'from-amber-600 to-amber-800'; // Bronze
    }
};

export const getTierBorderColor = (tier: string): string => {
    switch (tier) {
        case 'Master': return 'border-red-400';
        case 'Diamond': return 'border-fuchsia-400';
        case 'Platinum': return 'border-blue-400';
        case 'Gold': return 'border-amber-400';
        case 'Silver': return 'border-slate-400';
        default: return 'border-amber-700';
    }
};

const TIER_BADGE_SRC: Record<Tier, string> = {
    Bronze: '/images/icon/tier/1_Bronze.png',
    Silver: '/images/icon/tier/2_Silver.png',
    Gold: '/images/icon/tier/3_Gold.png',
    Platinum: '/images/icon/tier/4_Platinum.png',
    Diamond: '/images/icon/tier/5_Diamond.png',
    Master: '/images/icon/tier/6_Master.png'
};

export const getTierIcon = (tier: string): ComponentType<{ className?: string }> => {
    const source = TIER_BADGE_SRC[(tier as Tier)] ?? TIER_BADGE_SRC.Bronze;
    const iconComponent: ComponentType<{ className?: string }> = ({ className }) =>
        createElement('img', {
            src: source,
            alt: `${tier} badge`,
            className
        });

    switch (tier) {
        case 'Master':
        case 'Diamond':
        case 'Platinum':
        case 'Gold':
        case 'Silver':
        case 'Bronze':
            return iconComponent;
        default:
            return iconComponent;
    }
};
