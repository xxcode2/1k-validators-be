import type {
  ValidatorMetrics,
  ScoreContext,
  ScoreResult,
  ScoreBreakdown,
} from './types';
import { DEFAULT_CONTEXT } from './config';

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function score(m: ValidatorMetrics, ctx: ScoreContext = DEFAULT_CONTEXT): ScoreResult {
  const minB = BigInt(ctx.minBonded ?? 0n);
  const maxB = BigInt(ctx.maxBonded ?? 1n);
  const amt = (() => {
    try { return BigInt(m.bondedAmount || '0'); } catch { return 0n; }
  })();

  // Bonded normalization 0..40
  let bondedAmount = 0;
  if (maxB > minB) {
    const num = Number(amt - minB);
    const den = Number(maxB - minB) || 1;
    bondedAmount = clamp((num / den) * 40, 0, 40);
  }

  // Performance (legacy default 32)
  const performance = typeof m.performance === 'number' ? m.performance : 32;

  // Active set
  const activeSet = m.inActiveSet ? 7 : 0;

  // Tenure up to +10 over a year
  const tenure = clamp((m.discoveryTenureDays / 365) * 10, 0, 10);

  // Unclaimed: 0 eras → 3 pts, 1 → 2, 2 → 1, >=3 → 0
  const unclaimed = clamp(3 - Math.min(m.unclaimedEras, 3), 0, 3);

  // Faults: 15 - (1.5 per fault)
  const faults = clamp(15 - (m.faults * 1.5), 0, 15);

  // Offline: 10 - (seconds / 86400 * 10)
  const offline = clamp(10 - (m.offlineSeconds / 86400) * 10, 0, 10);

  // Pool rank: 0..5 (better rank ⇒ higher)
  const poolSize = Math.max(1, ctx.poolSize || 100);
  const pos = Math.min(Math.max(1, m.rankInPool || poolSize), poolSize);
  const poolRank = clamp(5 * (1 - (pos - 1) / poolSize), 0, 5);

  // Diversity placeholders (default 5, as in samples)
  const geoDiversity = clamp(m.geoDiversity ?? 5, 0, 5);
  const ispDiversity = clamp(m.ispDiversity ?? 5, 0, 5);

  // Recent nominations booster up to +2
  const recentNominations = clamp(m.recentNominations * 0.5, 0, 2);

  const bonded = bondedAmount;
  const other = geoDiversity + ispDiversity + poolRank;

  const breakdown: ScoreBreakdown = {
    performance,
    bonded,
    other,
    faults,
    offline,
    unclaimed,
    activeSet,
    tenure,

    bondedAmount,
    recentNominations,
    poolRank,
    geoDiversity,
    ispDiversity,
  };

  const total =
    performance +
    bonded +
    other +
    faults +
    offline +
    unclaimed +
    activeSet +
    tenure;

  return {
    total: Math.round(total * 100) / 100,
    breakdown,
  };
}
