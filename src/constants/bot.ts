export const BOT_ID_PREFIX = 'bot_';

export const isBotId = (playerId?: string | null) => Boolean(playerId && playerId.startsWith(BOT_ID_PREFIX));
