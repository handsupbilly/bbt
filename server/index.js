import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const distPath = join(__dirname, '../client/dist');
const isProd = existsSync(distPath);

app.use(express.json());

// Serve built client in production only
if (isProd) {
  app.use(express.static(distPath));
}

// ── In-memory leaderboard ────────────────────────────────────────────────────
const store = new Map();

function getBoard(scenarioId) {
  if (!store.has(scenarioId)) store.set(scenarioId, []);
  return store.get(scenarioId);
}

app.get('/api/leaderboard/:scenarioId', (req, res) => {
  const top20 = [...getBoard(req.params.scenarioId)]
    .sort((a, b) => b.probability - a.probability || a.diceCount - b.diceCount)
    .slice(0, 20);
  res.json(top20);
});

app.post('/api/leaderboard/:scenarioId', (req, res) => {
  const { name, probability, diceCount } = req.body;
  if (!name || probability == null || diceCount == null)
    return res.status(400).json({ error: 'name, probability and diceCount are required' });
  const entry = {
    id: randomUUID(),
    scenarioId: req.params.scenarioId,
    name: String(name).slice(0, 32),
    probability: Number(probability),
    diceCount: Number(diceCount),
    date: new Date().toISOString(),
  };
  getBoard(req.params.scenarioId).push(entry);
  res.status(201).json(entry);
});

// SPA fallback — production only
if (isProd) {
  app.get('*', (_req, res) =>
    res.sendFile(join(distPath, 'index.html'))
  );
}

app.listen(PORT, () =>
  console.log(`Server on http://localhost:${PORT} (${isProd ? 'production' : 'dev API only'})`)
);
