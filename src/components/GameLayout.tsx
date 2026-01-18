import React from 'react';

import { User, Trophy } from 'lucide-react';

interface PlayerProfile {
    name: string;
    score: number;
    avatar?: string;
    isOpponent?: boolean;
    mmr?: number;
    wins?: number;
    losses?: number;
    isGuest?: boolean;
}

interface GameLayoutProps {
    opponent: PlayerProfile;
    me: PlayerProfile;
    children: React.ReactNode;
}

const PlayerSection = ({ player }: { player: PlayerProfile }) => {
    // Calculate Win Rate
    const totalGames = (player.wins || 0) + (player.losses || 0);
    const winRate = totalGames > 0 ? Math.round(((player.wins || 0) / totalGames) * 100) : 0;

    return (
        <div className={`flex items-center gap-4 p-4 rounded-xl bg-gray-800/50 backdrop-blur-md border border-gray-700 w-full max-w-md ${player.isOpponent ? 'flex-row-reverse text-right' : 'text-left'}`}>
            <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden border-2 border-white/20 shadow-lg">
                    {player.avatar ? (
                        <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                    ) : (
                        <User className="w-8 h-8 text-white" />
                    )}
                </div>
                {/* Level Badge (Optional Placeholder) */}
                {!player.isGuest && (
                    <div className="absolute -bottom-1 -right-1 bg-gray-900 text-xs font-bold px-2 py-0.5 rounded-full border border-gray-600">
                        {Math.floor((player.mmr || 1000) / 100)}
                    </div>
                )}
            </div>

            <div className={`flex flex-col ${player.isOpponent ? 'items-end' : 'items-start'} flex-1`}>
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">
                        {player.isOpponent ? 'Opponent' : 'You'}
                    </span>
                    <h3 className="text-xl font-bold text-white leading-none mb-2 hidden sm:block">{player.name}</h3>

                    {/* Stats Display */}
                    {!player.isGuest && (
                        <div className="flex flex-col gap-0.5 text-xs text-gray-300 font-mono">
                            <span className="text-yellow-400 font-bold">MMR {player.mmr || 1000}</span>
                            <span>
                                {player.wins}W {player.losses}L <span className="text-blue-400">({winRate}%)</span>
                            </span>
                        </div>
                    )}
                    {player.isGuest && (
                        <span className="text-xs text-gray-500 font-mono">Guest Player</span>
                    )}
                </div>
            </div>

            <div className="flex flex-col items-center justify-center px-4 py-3 bg-black/40 rounded-xl border border-white/10 shadow-inner">
                <Trophy className={`w-5 h-5 mb-1 ${player.score >= 3 ? 'text-yellow-400 animate-bounce' : 'text-gray-600'}`} />
                <span className={`text-3xl font-black tabular-nums leading-none ${player.score >= 3 ? 'text-yellow-400' : 'text-white'}`}>
                    {player.score}
                </span>
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
