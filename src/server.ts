import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { port } from './config.js';
import { answerRoutes } from './routes/answerRoutes.js';
import { errorHandler } from './routes/errorHandler.js';
import { followUpRoutes } from './routes/followUpRoutes.js';
import { questionRoutes } from './routes/questionRoutes.js';
import { sessionRoutes } from './routes/sessionRoutes.js';
import { ensureStateFile } from './services/stateService.js';

const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

app.use(express.json());
app.use(express.static(publicDir));
app.use('/api', sessionRoutes);
app.use('/api', questionRoutes);
app.use('/api', answerRoutes);
app.use('/api', followUpRoutes);
app.use(errorHandler);

await ensureStateFile();

app.listen(port, () => {
  console.log(`Communication coach running at http://localhost:${port}`);
});
