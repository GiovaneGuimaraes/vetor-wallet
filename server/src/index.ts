import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initDb } from './db';
import operationsRouter from './routes/operations';
import portfolioRouter from './routes/portfolio';
import importRouter from './routes/import';
import alertsRouter from './routes/alerts';
import benchmarksRouter from './routes/benchmarks';
import authRouter from './auth/router';
import tickersRouter from './routes/tickers';
import { errorHandler } from './middleware/errorHandler';

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(
  session({
    name: 'sid',
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use('/api/auth', authRouter);
app.use('/api/tickers', tickersRouter);
app.use('/api/operations', operationsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/import', importRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/benchmarks', benchmarksRouter);

app.use(errorHandler);

const PORT = process.env.PORT ?? 3001;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Vetor Wallet API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
