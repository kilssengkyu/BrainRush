import { createElement } from 'react';
import type { ComponentType } from 'react';


export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';

export const getTierFromMMR = (mmr: number): Tier => {
    if (mmr >= 2500) return 'Diamond';
    if (mmr >= 2000) return 'Platinum';
    if (mmr >= 1500) return 'Gold';
    if (mmr >= 1200) return 'Silver';
    return 'Bronze';
};

export const getTierColor = (tier: string): string => {
    switch (tier) {
        case 'Diamond': return 'from-cyan-400 to-blue-600';
        case 'Platinum': return 'from-emerald-400 to-teal-600';
        case 'Gold': return 'from-yellow-300 to-amber-500';
        case 'Silver': return 'from-gray-300 to-gray-500';
        default: return 'from-orange-700 to-orange-900'; // Bronze
    }
};

export const getTierBorderColor = (tier: string): string => {
    switch (tier) {
        case 'Diamond': return 'border-cyan-400';
        case 'Platinum': return 'border-emerald-400';
        case 'Gold': return 'border-yellow-400';
        case 'Silver': return 'border-gray-400';
        default: return 'border-orange-700';
    }
};

const TIER_BADGE_SRC: Record<Tier, string> = {
    Bronze: '/images/icon/tier/Badge%20-%20Gray%202.png',
    Silver: '/images/icon/tier/Badge%20-%20Yellow.png',
    Gold: '/images/icon/tier/Badge%20-%20Pink.png',
    Platinum: '/images/icon/tier/Badge%20-Blue.png',
    Diamond: '/images/icon/tier/Badge%20-%20Yellow%202.png'
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
