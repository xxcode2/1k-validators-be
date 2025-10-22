// extensions/avail-nomination-monitor/packages/api/src/routes/candidates.ts
import { Router } from 'express';
import { ValidatorModel } from '@avail-np/db';

export const router = Router();

/**
 * GET /candidates
 * Query params:
 *   - limit (default 50, max 200)
 *   - offset (default 0)
 *   - sort (default 'current.rankInPool:asc')
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const sortParam = String(req.query.sort || 'current.rankInPool:asc');
    const [field, dir] = sortParam.split(':');
    const sort: Record<string, 1 | -1> = {};
    sort[field] = dir === 'desc' ? -1 : 1;

    const [items, total] = await Promise.all([
      ValidatorModel.find(
        {},
        {
          address: 1,
          current: 1,
          score: 1,
          firstSeenAt: 1,
          lastSeenEra: 1,
          updatedAt: 1,
        }
      )
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .lean(),
      ValidatorModel.countDocuments({}),
    ]);

    res.json({ items, total, limit, offset });
  } catch (e: any) {
    res.status(500).json({ error: 'failed_to_fetch_candidates', detail: String(e?.message || e) });
  }
});

