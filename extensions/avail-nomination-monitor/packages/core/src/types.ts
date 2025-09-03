export interface ValidatorMetrics {
  /** optional, dipakai saat persist/debug */
  address?: string;
  /** optional, era terakhir saat metrics dihitung */
  era?: number;

  /** metadata opsional dari collector */
  geoRegion?: string;        // e.g. "EU", "NA", "AS", dst
  ispASN?: number;           // e.g. 15169 (Google), 8075 (Microsoft), dst

  bondedAmount: string;      // bigint as string
  inActiveSet: boolean;
  unclaimedEras: number;
  discoveryTenureDays: number;
  faults: number;
  offlineSeconds: number;
  recentNominations: number;
  rankInPool: number;        // 1 = best

  /** nilai diversitas (kalau ada), kalau tidak ada biarkan undefined */
  geoDiversity?: number;     // 0..5
  ispDiversity?: number;     // 0..5

  /** opsional: skor performance pra-hitung (kalau ada) */
  performance?: number;      // 0..40
}

export interface ScoreContext {
  minBonded: bigint;
  maxBonded: bigint;
  poolSize: number;
}

export interface ScoreBreakdown {
  performance: number;
  bonded: number;            // mirrors bondedAmount
  other: number;             // geo + isp + poolRank
  faults: number;            // 15 - penalty
  offline: number;           // 10 - penalty by downtime
  unclaimed: number;         // 3 - penalty by eras
  activeSet: number;         // 7 or 0
  tenure: number;            // up to 10

  bondedAmount: number;
  recentNominations: number; // up to 2
  poolRank: number;          // 0..5
  geoDiversity: number;      // 0..5
  ispDiversity: number;      // 0..5
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown;
}
