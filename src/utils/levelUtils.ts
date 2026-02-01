export const LEVEL_XP_BASE = 25;
export const LEVEL_XP_STEP = 5;

export const getLevelFromXp = (xp: number) => {
    const safeXp = Math.max(0, Math.floor(xp));
    const base = LEVEL_XP_BASE;
    const step = LEVEL_XP_STEP;
    const linear = (2 * base) - step;
    const discriminant = (linear * linear) + (8 * step * safeXp);
    const n = Math.floor((-(linear) + Math.sqrt(discriminant)) / (2 * step));
    return Math.max(1, n + 1);
};
