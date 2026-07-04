import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db';
import operationsRouter from './routes/operations';
import portfolioRouter from './routes/portfolio';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/operations', operationsRouter);
app.use('/api/portfolio', portfolioRouter);

const PORT = process.env.PORT ?? 3001;

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Vetor Wallet API running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

