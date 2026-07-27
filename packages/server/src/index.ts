import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initDb, db } from './db';
import { SqliteSessionStore } from './auth/sessionStore';
import operationsRouter from './routes/operations';
import portfolioRouter from './routes/portfolio';
import importRouter from './routes/import';
import alertsRouter from './routes/alerts';
import benchmarksRouter from './routes/benchmarks';
import authRouter from './auth/router';
import tickersRouter from './routes/tickers';
import snapshotsRouter from './routes/snapshots';
import walletsRouter from './routes/wallets';
import adminRouter from './routes/admin';
import incomeRouter from './routes/income';
import incomeEntriesRouter from './routes/incomeEntries';
import expensesRouter from './routes/expenses';
import expenseEntriesRouter from './routes/expenseEntries';
import recurringExpensesRouter from './routes/recurringExpenses';
import savingsRouter from './routes/savings';
import goalsRouter from './routes/goals';
import budgetsRouter from './routes/budgets';
import { errorHandler } from './middleware/errorHandler';
import { catchUpIfNeeded } from './services/snapshots';
import { startSnapshotScheduler } from './services/snapshotScheduler';

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
    store: new SqliteSessionStore(db),
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
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/wallets', walletsRouter);
app.use('/api/operations', operationsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/import', importRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/benchmarks', benchmarksRouter);
app.use('/api/admin', adminRouter);
app.use('/api/income', incomeRouter);
app.use('/api/income-entries', incomeEntriesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/expense-entries', expenseEntriesRouter);
app.use('/api/recurring-expenses', recurringExpensesRouter);
app.use('/api/savings', savingsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/budgets', budgetsRouter);

app.use(errorHandler);

const PORT = process.env.PORT ?? 3001;

// T-061: reexecuta o catch-up periodicamente, para além do boot — ver
// startSnapshotScheduler() e o comentário abaixo, junto do dispatch inicial.
const SNAPSHOT_SCHEDULER_INTERVAL_MS = 30 * 60 * 1000; // 30 min

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Vetor Wallet API running on http://localhost:${PORT}`);
    });

    // T-058a: liga a coleta diária de fechamentos. `catchUpIfNeeded` já traz a
    // própria guarda ("dia útil, depois das 18:15 BRT e ainda sem snapshot de
    // hoje") e o UNIQUE(ticker, date(captured_at)) garante a idempotência no
    // banco, então chamar a cada boot não duplica nada.
    //
    // NÃO bloqueia o listen e NUNCA derruba o processo: a brapi indisponível é
    // um erro logado, do mesmo espírito do `createUser` da T-050a. `runSnapshotJob`
    // já engole a falha de fetch; o `catch` aqui cobre o que sobra (erro de
    // banco na checagem, rejeição inesperada).
    catchUpIfNeeded().catch((err) => {
      console.error('[snapshots] Catch-up on startup failed (server continues):', err);
    });

    // T-061: o boot sozinho só cobre quem reinicia depois das 18:15 BRT — um
    // server que sobe de manhã e fica no ar o dia inteiro nunca reexecutava a
    // checagem. Este agendador in-process reexecuta `catchUpIfNeeded()` a
    // cada 30min; as guardas de dia útil/horário/snapshot-do-dia já existentes
    // dentro dela (mais o UNIQUE(ticker, date(captured_at)) no banco) seguem
    // sendo a única idempotência — nenhuma guarda nova foi criada aqui. O
    // timer é `.unref()`'d (não segura o processo) e morre com ele: não é
    // cron, não persiste, não substitui o Lambda + EventBridge do roadmap.
    startSnapshotScheduler(SNAPSHOT_SCHEDULER_INTERVAL_MS, catchUpIfNeeded);
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
