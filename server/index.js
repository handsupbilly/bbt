import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Serve built client
app.use(express.static(join(__dirname, '../client/dist')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
