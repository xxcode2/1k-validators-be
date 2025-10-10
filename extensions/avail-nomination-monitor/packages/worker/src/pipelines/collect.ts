// packages/worker/src/pipelines/collect.ts
import { ApiPromise } from '@polkadot/api';
import type { Vec } from '@polkadot/types';
import { BN } from '@polkadot/util';
import { ValidatorModel } from '@avail-np/db/dist/models/Validator';
import type { Logger } from '../types';
import { ensureApi } from './events';

const asStr = (v: any) => {
  try {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v?.toString === 'function') return v.toString();
    return String(v);
  } catch {
    return String(v);
  }
};

const bn0 = new BN(0);

function bnFromHex(hex?: string): BN {
  try {
    if (!hex) return bn0;
    const s = String(hex);
    if (s.startsWith('0x')) return new BN(s.slice(2), 16);
    if (/^\d+$/.test(s)) return new BN(s, 10);
    return bn0;
  } catch {
    return bn0;
  }
}

async function getActiveEra(api: ApiPromise, logger: Logger): Promise<number> {
  try {
    const activeEraOpt = await (api.query as any)?.staking?.activeEra?.();
    const era = (activeEraOpt?.unwrap?.()?.index ?? activeEraOpt?.index ?? 0) as any;
    const n = Number(asStr(era));
    return Number.isFinite(n) ? n : 0;
  } catch {
    logger.warn('[collect] staking.activeEra not available, fallback era=0');
    return 0;
  }
}

async function getValidators(api: ApiPromise, logger: Logger): Promise<string[]> {
  try {
    const v: Vec<any> = await (api.query as any).session.validators();
    return (v as any)?.toArray?.()?.map((x: any) => asStr(x)) ?? [];
  } catch (e) {
    logger.warn('[collect] session.validators unavailable:', e);
    return [];
  }
}

// normalized bonded extractor
async function getBondedNormalized(
  api: ApiPromise,
  stash: string,
  logger: Logger
): Promise<{ bondedAmount: string; nominatorCount?: number }> {
  try {
    const activeEraOpt = await (api.query as any)?.staking?.activeEra?.();
    const era = activeEraOpt?.unwrap?.()?.index ?? activeEraOpt?.index ?? 0;

    if ((api.query as any)?.staking?.erasStakersOverview) {
      const ov = await (api.query as any).staking.erasStakersOverview(era, stash);
      const j = ov?.toJSON?.() ?? null;
      if (j && (j.total || j.own)) {
        const totalBn = bnFromHex(j.total || j.own);
        const bondedAmount = totalBn.gt(bn0) ? totalBn.toString(10) : '0';
        return { bondedAmount, nominatorCount: Number(j.nominatorCount ?? 0) };
      }

      const total = (ov as any)?.total ?? (ov as any)?.own ?? ov;
      const bondedAmount = bnFromHex(String(total)).toString(10);
      return { bondedAmount, nominatorCount: Number((ov as any)?.nominatorCount ?? 0) };
    }
  } catch (e) {
    logger.warn('[collect] overview fallback:', e);
  }

  try {
    if ((api.query as any)?.staking?.bonded && (api.query as any)?.staking?.ledger) {
      const controller = await (api.query as any).staking.bonded(stash);
      const ledger = controller ? await (api.query as any).staking.ledger(controller) : null;
      const active = ledger?.active;
      const bondedAmount = bnFromHex(String(active)).toString(10);
      if (bondedAmount !== '0') return { bondedAmount };
    }
  } catch {}

  try {
    const locks = await (api.query as any).balances?.locks?.(stash);
    const arr = (locks as any)?.toArray?.() ?? [];
    let max = bn0;
    for (const l of arr) {
      const val = bnFromHex(String(l?.amount ?? l?.value ?? '0'));
      if (val.gt(max)) max = val;
    }
    if (max.gt(bn0)) return { bondedAmount: max.toString(10) };
  } catch {}

  return { bondedAmount: '0' };
}

type UpsertResult = { scanned: number; upserted: number };

export async function collectValidatorsSnapshot(logger: Logger = console): Promise<UpsertResult> {
  const api = await ensureApi(logger);
  const era = await getActiveEra(api, logger);
  const validators = await getValidators(api, logger);

  let upserted = 0;
  const bondedMap = new Map<string, { bondedAmount: string; nominatorCount?: number }>();

  for (const addr of validators) {
    const info = await getBondedNormalized(api, addr, logger);
    bondedMap.set(addr, info);
  }

  const ranked = [...bondedMap.entries()]
    .sort((a, b) => new BN(a[1].bondedAmount).cmp(new BN(b[1].bondedAmount)) * -1)
    .map(([addr]) => addr);

  for (const addr of validators) {
    const { bondedAmount, nominatorCount } = bondedMap.get(addr) ?? { bondedAmount: '0' };
    const rankInPool = ranked.indexOf(addr) >= 0 ? ranked.indexOf(addr) + 1 : 0;
    const now = new Date();
    const setOnInsert = { address: addr, firstSeenAt: now };

    const $set: any = {
      'current.era': era,
      'current.inActiveSet': true,
      'current.bondedAmount': bondedAmount,
      'current.rankInPool': rankInPool,
      'current.faults': 0,
      'current.offlineSeconds': 0,
      'current.unclaimedEras': 0,
      'current.discoveryTenureDays': 0,
      'current.recentNominations': 0,
    };
    if (typeof nominatorCount === 'number') {
      $set['current.nominatorCount'] = nominatorCount;
    }

    const res = await ValidatorModel.updateOne(
      { address: addr },
      { $setOnInsert: setOnInsert, $set },
      { upsert: true }
    );
    if ((res as any)?.upsertedCount || (res as any)?.modifiedCount) upserted++;
  }

  logger.info(`[collect] scanned=${validators.length} upserted=${upserted} era=${era}`);
  return { scanned: validators.length, upserted };
}

// alias for backward compatibility
export const collectBatch = collectValidatorsSnapshot;
