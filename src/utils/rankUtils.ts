import { Trophy, Medal, Crown } from 'lucide-react';


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

// Returns a Lucide Icon or we can use custom SVGs later
export const getTierIcon = (tier: string) => {
    switch (tier) {
        case 'Diamond': return Crown;
        case 'Platinum': return Trophy;
        case 'Gold': return Medal;
        case 'Silver': return Medal; // Different color handled by prop
        default: return Medal;
    }
};
