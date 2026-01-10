import React from 'react';

import { User, Trophy } from 'lucide-react';

interface PlayerProfile {
    name: string;
    score: number;
    avatar?: string; // URL or icon component
    isOpponent?: boolean;
}

interface GameLayoutProps {
    opponent: PlayerProfile;
    me: PlayerProfile;
    children: React.ReactNode;
}

const PlayerSection = ({ player }: { player: PlayerProfile }) => {
    return (
        <div className={`flex items-center gap-4 p-4 rounded-xl bg-gray-800/50 backdrop-blur-md border border-gray-700 w-full max-w-md ${player.isOpponent ? 'flex-row-reverse' : ''}`}>
            <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden border-2 border-white/20">
                    {/* Placeholder for Avatar */}
                    <User className="w-8 h-8 text-white" />
                </div>
            </div>
            <div className={`flex flex-col ${player.isOpponent ? 'items-end' : 'items-start'} flex-1`}>
                <span className="text-gray-300 text-sm font-bold uppercase tracking-wider">{player.isOpponent ? 'Opponent' : 'You'}</span>
                <h3 className="text-xl font-bold text-white">{player.name}</h3>
            </div>
            <div className="flex flex-col items-center justify-center px-4 py-2 bg-black/40 rounded-lg border border-white/10">
                <Trophy className="w-4 h-4 text-yellow-400 mb-1" />
                <span className="text-2xl font-black text-yellow-400 tabular-nums">{player.score}</span>
            </div>
        </div>
    );
};

const GameLayout: React.FC<GameLayoutProps> = ({ opponent, me, children }) => {
    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-between p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black pointer-events-none -z-10" />

            {/* Top: Opponent */}
            <div className="w-full flex justify-center pt-safe-top">
                <PlayerSection player={{ ...opponent, isOpponent: true }} />
            </div>

            {/* Center: Game Area */}
            <main className="flex-1 w-full flex flex-col items-center justify-center max-w-4xl relative z-10 w-full">
                {children}
            </main>

            {/* Bottom: Me */}
            <div className="w-full flex justify-center pb-safe-bottom">
                <PlayerSection player={{ ...me, isOpponent: false }} />
            </div>
        </div>
    );
};

export default GameLayout;
