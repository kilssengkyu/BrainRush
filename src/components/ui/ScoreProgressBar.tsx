import React from 'react';
import { motion } from 'framer-motion';

interface ScoreProgressBarProps {
    myScore: number;
    opScore: number;
}

const ScoreProgressBar: React.FC<ScoreProgressBarProps> = ({ myScore, opScore }) => {
    const total = myScore + opScore;
    // Default to 50% if no score yet
    const myPercentage = total === 0 ? 50 : Math.min(100, Math.max(0, (myScore / total) * 100));

    return (
        <div className="w-full h-full bg-gray-700/50 overflow-hidden flex relative backdrop-blur-sm">
            {/* Blue Bar (Me) */}
            <motion.div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 relative"
                initial={{ width: "50%" }}
                animate={{ width: `${myPercentage}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 15 }}
            >
                {/* Shine effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
            </motion.div>

            {/* Red Bar (Opponent) - fills the rest intrinsically */}
            <div className="flex-1 h-full bg-gradient-to-l from-red-600 to-red-400 relative">
                {/* Shine effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
            </div>

            {/* Center Marker */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30 -translate-x-1/2 z-10" />

            {/* Percentage Text (Optional, maybe on hover or always?) 
                Let's keep it clean for now as requested "bar showing how much is winning"
            */}
        </div>
    );
};

export default ScoreProgressBar;
