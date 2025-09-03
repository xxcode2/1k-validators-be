import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectMongo, ValidatorModel } from '@avail-np/db';

const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/avail_np';

async function main() {
  await connectMongo(MONGO_URI);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // list validators
  app.get('/validators', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const sortParam = String(req.query.sort || 'score.total:desc');
    const [field, dir] = sortParam.split(':');
    const sort: any = {};
    sort[field] = dir === 'asc' ? 1 : -1;

    const items = await ValidatorModel.find({}, {
      address: 1, 'score.total': 1, 'score.breakdown': 1, current: 1
    }).sort(sort).skip(offset).limit(limit).lean();

    res.json({ items, limit, offset });
  });

  // detail
  app.get('/validators/:address', async (req, res) => {
    const v = await ValidatorModel.findOne({ address: req.params.address }).lean();
    if (!v) return res.status(404).json({ error: 'Not found' });
    res.json(v);
  });

  // simple recommendations (top-N)
  app.get('/recommendations', async (req, res) => {
    const n = Math.min(Number(req.query.n) || 100, 500);
    const items = await ValidatorModel.find({}, { address: 1, 'score.total': 1 })
      .sort({ 'score.total': -1 }).limit(n).lean();
    res.json({ items, n });
  });

  app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
