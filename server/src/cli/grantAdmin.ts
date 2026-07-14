import 'dotenv/config';
import { initDb } from '../db';
import { grantRole } from '../auth/service';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || !email.trim()) {
    console.error('[grantAdmin] Uso: tsx src/cli/grantAdmin.ts <email>');
    process.exit(1);
  }

  await initDb();

  try {
    const { granted } = await grantRole(email.trim(), 'admin');
    if (granted) {
      console.log(`[grantAdmin] Role "admin" concedida para ${email}`);
    } else {
      console.log(`[grantAdmin] ${email} já possui a role "admin"`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`[grantAdmin] Erro: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
