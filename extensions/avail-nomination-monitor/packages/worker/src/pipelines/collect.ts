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

async function getBondedAmount(api: ApiPromise, stash: string, logger: Logger): Promise<string> {
  try {
    const activeEra = await getActiveEra(api, logger);
    if ((api.query as any)?.staking?.erasStakersOverview) {
      const overview = await (api.query as any).staking.erasStakersOverview(activeEra, stash);
      const total = overview?.total ?? overview?.own ?? overview;
      const s = asStr(total);
      if (s && s !== '0') return s;
    }
  } catch {}

  try {
    if ((api.query as any)?.staking?.bonded && (api.query as any)?.staking?.ledger) {
      const controller = await (api.query as any).staking.bonded(stash);
      const ledger = controller ? await (api.query as any).staking.ledger(controller) : null;
      const active = ledger?.active;
      const s = asStr(active);
      if (s && s !== '0') return s;
    }
  } catch {}

  try {
    const locks = await (api.query as any).balances?.locks?.(stash);
    const arr = (locks as any)?.toArray?.() ?? [];
    let max = bn0;
    for (const l of arr) {
      const val = new BN(asStr(l?.amount ?? l?.value ?? '0'));
      if (val.gt(max)) max = val;
    }
    if (max.gt(bn0)) return max.toString();
  } catch {}

  return '0';
}

type UpsertResult = { scanned: number; upserted: number };

export async function collectValidatorsSnapshot(logger: Logger = console): Promise<UpsertResult> {
  const api = await ensureApi(logger);
  const era = await getActiveEra(api, logger);
  const validators = await getValidators(api, logger);

  let upserted = 0;
  const bondedMap = new Map<string, string>();
  for (const addr of validators) {
    const bonded = await getBondedAmount(api, addr, logger);
    bondedMap.set(addr, bonded);
  }
  const safeBN = (v: string) => {
  try {
    if (!v) return new BN(0);
    const s = v.toString().replace(/[^0-9]/g, ''); // buang karakter non-angka
    if (!s) return new BN(0);
    return new BN(s);
  } catch {
    return new BN(0);
  }
};

const ranked = [...bondedMap.entries()]
  .sort((a, b) => safeBN(b[1]).cmp(safeBN(a[1])))
  .map(([addr]) => addr);


  for (const addr of validators) {
    const bondedAmount = bondedMap.get(addr) ?? '0';
    const rankInPool = ranked.indexOf(addr) >= 0 ? ranked.indexOf(addr) + 1 : 0;

    const now = new Date();
    const setOnInsert = { address: addr, firstSeenAt: now };

    const res = await ValidatorModel.updateOne(
      { address: addr },
      {
        $setOnInsert: setOnInsert as any,
        $set: {
          'current.era': era,
          'current.inActiveSet': true,
          'current.bondedAmount': bondedAmount,
          'current.rankInPool': rankInPool,
          'current.faults': 0,
          'current.offlineSeconds': 0,
          'current.unclaimedEras': 0,
          'current.discoveryTenureDays': 0,
          'current.recentNominations': 0,
        },
      },
      { upsert: true }
    );

    if ((res as any)?.upsertedCount || (res as any)?.modifiedCount) upserted++;
  }

  logger.info(`[collect] scanned=${validators.length} upserted=${upserted} era=${era}`);
  return { scanned: validators.length, upserted };
}

// Alias agar kompatibel dengan index.ts lama
export const collectBatch = collectValidatorsSnapshot;
