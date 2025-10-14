// packages/api/src/index.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectMongo, ValidatorModel } from '@avail-np/db';
import { router as candidatesRouter } from './routes/candidates';

const PORT_ENV = process.env.PORT;
const MONGO_URI = process.env.MONGO_URI;

// Validasi ENV lebih awal (tanpa default hardcode)
if (!PORT_ENV) {
  throw new Error('ENV PORT is required');
}
if (!MONGO_URI) {
  throw new Error('ENV MONGO_URI is required');
}

const PORT = Number(PORT_ENV);

async function main() {
  // konek Mongo dari ENV
  await connectMongo(MONGO_URI as string);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // health
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // candidates endpoint (router terpisah)
  app.use('/candidates', candidatesRouter);

  // list validators
  app.get('/validators', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      // sort param: field:dir (contoh: score.total:desc)
      const sortParam = String(req.query.sort || 'score.total:desc');
      const [field, dir] = sortParam.split(':');
      const sort: Record<string, 1 | -1> = {};
      sort[field] = dir === 'asc' ? 1 : -1;

      const items = await ValidatorModel.find(
        {},
        { address: 1, 'score.total': 1, 'score.breakdown': 1, current: 1 }
      )
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .lean();

      res.json({ items, limit, offset });
    } catch (e: any) {
      console.error('[api] /validators error:', e);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // detail by address
  app.get('/validators/:address', async (req, res) => {
    try {
      const v = await ValidatorModel.findOne({ address: req.params.address }).lean();
      if (!v) return res.status(404).json({ error: 'not_found' });
      res.json(v);
    } catch (e: any) {
      console.error('[api] /validators/:address error:', e);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // simple recommendations (top-N by score.total)
  app.get('/recommendations', async (req, res) => {
    try {
      const n = Math.min(Number(req.query.n) || 100, 500);
      const items = await ValidatorModel.find(
        {},
        { address: 1, 'score.total': 1 }
      )
        .sort({ 'score.total': -1 })
        .limit(n)
        .lean();
      res.json({ items, n });
    } catch (e: any) {
      console.error('[api] /recommendations error:', e);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
}

main().catch(err => {
  console.error('[api] boot failed', err);
  process.exit(1);
});
