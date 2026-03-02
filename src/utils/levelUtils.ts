export const LEVEL_XP_BASE = 25;
export const LEVEL_XP_STEP = 5;

export const getXpForLevel = (level: number) => {
    const safeLevel = Math.max(1, Math.floor(level));
    const steps = safeLevel - 1;
    if (steps <= 0) return 0;
    return Math.floor((steps * ((2 * LEVEL_XP_BASE) + ((steps - 1) * LEVEL_XP_STEP))) / 2);
};

export const getXpRequiredForLevel = (level: number) => {
    const safeLevel = Math.max(1, Math.floor(level));
    return LEVEL_XP_BASE + ((safeLevel - 1) * LEVEL_XP_STEP);
};

export const getLevelFromXp = (xp: number) => {
    const safeXp = Math.max(0, Math.floor(xp));
    const base = LEVEL_XP_BASE;
    const step = LEVEL_XP_STEP;
    const linear = (2 * base) - step;
    const discriminant = (linear * linear) + (8 * step * safeXp);
    const n = Math.floor((-(linear) + Math.sqrt(discriminant)) / (2 * step));
    return Math.max(1, n + 1);
};

export const getXpIntoCurrentLevel = (xp: number) => {
    const safeXp = Math.max(0, Math.floor(xp));
    const level = getLevelFromXp(safeXp);
    return safeXp - getXpForLevel(level);
};

export const getLevelProgressRatio = (xp: number) => {
    const safeXp = Math.max(0, Math.floor(xp));
    const level = getLevelFromXp(safeXp);
    const levelStartXp = getXpForLevel(level);
    const requiredXp = getXpRequiredForLevel(level);
    const progressXp = safeXp - levelStartXp;
    return requiredXp <= 0 ? 0 : Math.max(0, Math.min(1, progressXp / requiredXp));
};

export const getLevelProgress = (xp: number) => {
    const safeXp = Math.max(0, Math.floor(xp));
    const level = getLevelFromXp(safeXp);
    const levelStartXp = getXpForLevel(level);
    const requiredXp = getXpRequiredForLevel(level);
    return {
        level,
        progressXp: safeXp - levelStartXp,
        requiredXp,
        ratio: getLevelProgressRatio(safeXp)
    };
};

export const getXpSnapshotStorageKey = (userId: string) => `brainrush_xp_snapshot:${userId}`;
