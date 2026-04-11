export type NormalizedRoundWinner = 'p1' | 'p2' | 'draw' | null;

const normalizeToken = (value: unknown): string => String(value ?? '').trim().toLowerCase();
const toNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const normalizeRoundWinner = (
  winner: unknown,
  player1Id?: string | null,
  player2Id?: string | null
): NormalizedRoundWinner => {
  const token = normalizeToken(winner);
  if (!token) return null;

  if (token === 'draw' || token === 'tie') return 'draw';
  if (token === 'p1' || token === 'player1' || token === 'left' || token === '1') return 'p1';
  if (token === 'p2' || token === 'player2' || token === 'right' || token === '2') return 'p2';

  const p1 = normalizeToken(player1Id);
  const p2 = normalizeToken(player2Id);
  if (p1 && token === p1) return 'p1';
  if (p2 && token === p2) return 'p2';

  return null;
};

export const resolveRoundWinner = (
  round: { winner?: unknown; p1_score?: unknown; p2_score?: unknown } | null | undefined,
  player1Id?: string | null,
  player2Id?: string | null
): NormalizedRoundWinner => {
  if (!round) return null;

  const normalized = normalizeRoundWinner(round.winner, player1Id, player2Id);
  if (normalized) return normalized;

  const p1 = toNumber(round.p1_score);
  const p2 = toNumber(round.p2_score);
  if (p1 === null || p2 === null) return null;
  if (p1 > p2) return 'p1';
  if (p2 > p1) return 'p2';
  return 'draw';
};
