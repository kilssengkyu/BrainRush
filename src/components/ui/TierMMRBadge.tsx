import React from 'react';
import { getTierColor, getTierFromMMR, getTierIcon } from '../../utils/rankUtils';

interface TierMMRBadgeProps {
    mmr?: number | null;
    className?: string;
    showTierName?: boolean;
    compact?: boolean;
}

const TierMMRBadge: React.FC<TierMMRBadgeProps> = ({
    mmr,
    className = '',
    showTierName = true,
    compact = false
}) => {
    const resolvedMMR = typeof mmr === 'number' ? mmr : 1000;
    const tier = getTierFromMMR(resolvedMMR);
    const tierColor = getTierColor(tier);
    const TierIcon = getTierIcon(tier);

    if (compact) {
        return (
            <div className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${tierColor} text-black shadow-md px-2 py-0.5 ${className}`}>
                <TierIcon className="w-3 h-3" />
                {showTierName && (
                    <span className="text-[10px] font-black uppercase tracking-wide">
                        {tier}
                    </span>
                )}
                <span className="text-[10px] font-mono font-black">
                    {resolvedMMR.toLocaleString()}
                </span>
                <span className="text-[9px] font-bold opacity-85">
                    MMR
                </span>
            </div>
        );
    }

    return (
        <div className={`inline-flex items-center gap-2.5 rounded-lg bg-gradient-to-r ${tierColor} text-black shadow-md px-2.5 py-1.5 ${className}`}>
            <div className="w-5 h-5 rounded-md bg-black/10 flex items-center justify-center shrink-0">
                <TierIcon className="w-[18px] h-[18px]" />
            </div>
            <div className="flex flex-col leading-tight">
                {showTierName && (
                    <span className="text-[10px] font-black uppercase tracking-wide opacity-90">
                        {tier}
                    </span>
                )}
                <span className="text-[12px] font-mono font-black">
                    {resolvedMMR.toLocaleString()} MMR
                </span>
            </div>
        </div>
    );
};

export default TierMMRBadge;
