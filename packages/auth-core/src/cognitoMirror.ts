import { db } from '@vetor-wallet/db';
import { getOrCreateDefaultWallet } from '@vetor-wallet/portfolio-core';
import type { User } from '@vetor-wallet/shared';
import { parseRoles } from './service';

/**
 * Espelho local da identidade do AWS Cognito (T-106).
 *
 * Desde a T-106 o Cognito é a **única fonte de identidade**: quem valida senha é
 * ele, e o `users.password_hash` deixou de participar do login. Mas o resto do
 * app é todo `user_id INTEGER` — carteira, operações, despesas, poupança,
 * assinatura. Então continua existindo uma linha em `users` por pessoa; ela só
 * não é mais dona da credencial. É isso que estas funções mantêm: o vínculo
 * `cognito_sub` ↔ `users.id`.
 *
 * ## Por que aqui, e num arquivo separado
 *
 * `auth-core` é o dono da tabela `users` (regra 1 de `docs/PACKAGES.md`), então
 * o vínculo é dele — o `cognito-core` **nunca toca o banco**. O arquivo é
 * separado do `service.ts` para deixar visível o que é "identidade espelhada" e
 * o que é resquício de credencial local. Ele **não** segue o formato-alvo de uma
 * função por arquivo com `db` injetado: o package inteiro ainda usa o singleton
 * `db` (migração de formato é a T-104x), e misturar os dois estilos aqui
 * deixaria metade do package testável de um jeito e metade de outro.
 */

/**
 * Valor gravado em `password_hash` quando o espelho nasce pelo Cognito.
 *
 * A coluna é `NOT NULL` e **não foi dropada** na T-106 (migração destrutiva é
 * tarefa própria, com confirmação do humano) — então precisa de algum valor. O
 * sentinela é escolhido para ser **impossível de casar**: não é um hash bcrypt
 * válido, logo `verifyPassword` devolve `false` para qualquer senha. Se algum
 * caminho de código antigo tentar autenticar contra o banco, ele falha fechado
 * em vez de aceitar qualquer coisa.
 */
export const COGNITO_MANAGED_PASSWORD_HASH = 'cognito-managed:no-local-password';

const SELECT_USER =
  'SELECT id, email, name, phone, created_at, roles, cognito_sub FROM users WHERE ';

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  roles: unknown;
}

function toUser(row: Record<string, unknown>): User {
  const typed = row as unknown as UserRow;
  return {
    id: typed.id,
    email: typed.email,
    name: typed.name ?? null,
    phone: typed.phone ?? null,
    created_at: typed.created_at,
    roles: parseRoles(typed.roles),
  };
}

/** Acha o espelho pelo `sub` do pool. É a leitura do caminho felizes do login. */
export async function findUserByCognitoSub(cognitoSub: string): Promise<User | null> {
  const result = await db.execute({
    sql: `${SELECT_USER}cognito_sub = ?`,
    args: [cognitoSub.trim()],
  });
  if (result.rows.length === 0) return null;
  return toUser(result.rows[0] as unknown as Record<string, unknown>);
}

/**
 * Grava o `sub` num usuário que já existe.
 *
 * É o que preserva os dados de quem usava o app antes do Cognito: a conta
 * antiga não é recriada, só passa a apontar para a identidade do pool.
 *
 * Sobrescreve um `sub` diferente de propósito. Como o Cognito garante e-mail
 * único no pool, "mesmo e-mail com outro `sub`" só acontece quando a conta foi
 * apagada e recriada lá — a mesma pessoa, com identidade nova. Recusar
 * deixaria o dono trancado fora dos próprios dados sem caminho de volta pela UI.
 */
export async function linkCognitoSub(userId: number, cognitoSub: string): Promise<void> {
  await db.execute({
    sql: 'UPDATE users SET cognito_sub = ? WHERE id = ?',
    args: [cognitoSub.trim(), userId],
  });
}

/**
 * Cria o espelho de um usuário que só existe no Cognito.
 *
 * E-mail normalizado (invariante do package) e `password_hash` sentinela. Cria a
 * carteira padrão como o `createUser` faz, e **falhar ali não derruba o login**
 * (T-050a): o lazy-create do `GET /api/wallets` segue como rede de segurança —
 * derrubar o login por causa da carteira seria trocar um problema cosmético por
 * "não consigo entrar".
 */
export async function createCognitoUser(email: string, cognitoSub: string): Promise<User> {
  const normalizedEmail = email.toLowerCase().trim();
  const insert = await db.execute({
    sql: 'INSERT INTO users (email, password_hash, cognito_sub) VALUES (?, ?, ?)',
    args: [normalizedEmail, COGNITO_MANAGED_PASSWORD_HASH, cognitoSub.trim()],
  });
  const id = Number(insert.lastInsertRowid ?? 0);

  try {
    await getOrCreateDefaultWallet(id);
  } catch (err) {
    console.error('Falha ao criar a carteira padrao do usuario', id, err);
  }

  const result = await db.execute({ sql: `${SELECT_USER}id = ?`, args: [id] });
  return toUser(result.rows[0] as unknown as Record<string, unknown>);
}

/**
 * Recusa do vínculo por e-mail quando o provedor de identidade **não** confirmou
 * a posse do e-mail (T-106, achado da revisão).
 *
 * ## O ataque que este erro fecha
 *
 * Uma conta anterior ao Cognito tem `cognito_sub` NULL — a vítima nunca esteve no
 * pool. Um atacante se cadastra no pool **com o e-mail da vítima**: nada colide,
 * nem no nosso banco (o `userExists` do registro saiu de propósito, para a conta
 * antiga poder ganhar identidade) nem no pool (o `Username` é inédito lá). Se o
 * pool não exigir verificação de e-mail, o `SignUp` volta `UserConfirmed: true`,
 * o login funciona, e o vínculo por e-mail entregaria a linha da vítima —
 * carteira, despesas, poupança e assinatura — para o `sub` do atacante.
 *
 * "Vincular só o primeiro `sub` e recusar o segundo" **não** resolve: o ataque
 * *é* a primeira vinculação, porque a vítima nunca logou pelo Cognito.
 *
 * O que resolve é exigir prova de posse do e-mail (`email_verified`), que é a
 * única evidência de que quem está logando é dono da caixa que dá nome à conta.
 * Erro tipado (e não `boolean` de retorno) porque este é um caminho que a rota
 * **não pode** confundir com sucesso: quem esquecer de tratá-lo recebe um 500, não
 * uma sessão da vítima.
 */
export class CognitoLinkRequiresVerifiedEmailError extends Error {
  readonly email: string;

  constructor(email: string) {
    super(`Vinculo por e-mail recusado: e-mail nao verificado no provedor (${email})`);
    this.name = 'CognitoLinkRequiresVerifiedEmailError';
    this.email = email;
  }
}

export type CognitoMirrorOutcome = 'found-by-sub' | 'linked-by-email' | 'created';

export interface CognitoMirrorResult {
  user: User;
  /** Qual dos três caminhos aconteceu — o chamador loga/testa, não decide nada com isso. */
  outcome: CognitoMirrorOutcome;
}

/**
 * A porta ÚNICA do login pelo Cognito para o nosso banco (T-106).
 *
 * Três caminhos, nesta ordem — e a ordem é a regra, não detalhe:
 *
 * 1. **`cognito_sub` conhecido** → é este usuário. O `sub` nunca muda, nem se o
 *    e-mail mudar no pool; por isso ele vem primeiro.
 * 2. **`sub` novo, e-mail já existe** → é a conta que já estava no app: grava o
 *    `sub` nela. **É o passo que preserva os dados do dono do app** (decisão do
 *    humano, 2026-08-18: "a conta que já existe é vinculada por e-mail"). O
 *    casamento usa o e-mail **normalizado** nos dois lados — sem isso,
 *    `Giovane@X.com` no pool criaria uma conta vazia paralela à
 *    `giovane@x.com` do banco, e a carteira, as despesas e o histórico
 *    "desapareceriam" sem nada ter sido apagado.
 *    **Este caminho exige `emailVerified: true`** — ver a invariante abaixo.
 * 3. **`sub` novo, e-mail novo** → cadastro novo: cria o espelho. **Não** exige
 *    e-mail verificado: aqui não há nada de ninguém para assumir; a conta nasce
 *    vazia e pertence a quem acabou de se cadastrar.
 *
 * ## INVARIANTE: vínculo por e-mail exige e-mail verificado no provedor
 *
 * Assumir uma linha de `users` que já existe é uma decisão de **autorização**, e
 * o e-mail só serve como chave dela quando o provedor provou a posse da caixa
 * (`email_verified`). Sem isso, qualquer um que saiba o e-mail da vítima se
 * cadastra com aquele e-mail e recebe a conta dela — ver
 * `CognitoLinkRequiresVerifiedEmailError` para o passo a passo do ataque. A regra
 * vale para **qualquer** provedor de identidade que venha depois do Cognito: não
 * é detalhe da AWS, é o que separa "mesmo e-mail" de "mesma pessoa".
 *
 * Note que `emailVerified` **não** é `UserConfirmed`: um pool pode auto-confirmar
 * o cadastro (login liberado) sem nunca verificar o e-mail. Depender da
 * configuração do pool seria terceirizar a nossa autorização para uma checkbox no
 * console da AWS.
 *
 * Corrida entre dois logins simultâneos do mesmo `sub` novo: o índice único
 * parcial `idx_users_cognito_sub` faz o segundo INSERT falhar em vez de criar
 * duas contas. O desfecho é um erro 5xx num login que o usuário repete, não
 * dado duplicado — o lado certo para errar.
 */
export async function findOrCreateUserByCognitoSub(params: {
  cognitoSub: string;
  email: string;
  /**
   * O provedor confirmou a posse deste e-mail? Obrigatório de propósito: um
   * default (`= true`, ou o campo opcional) reabriria o buraco em silêncio no
   * próximo chamador que esquecesse de passá-lo.
   */
  emailVerified: boolean;
}): Promise<CognitoMirrorResult> {
  const cognitoSub = params.cognitoSub.trim();
  const email = params.email.toLowerCase().trim();

  const bySub = await findUserByCognitoSub(cognitoSub);
  if (bySub) return { user: bySub, outcome: 'found-by-sub' };

  const byEmail = await db.execute({
    sql: `${SELECT_USER}email = ?`,
    args: [email],
  });
  if (byEmail.rows.length > 0) {
    // Checado ANTES de qualquer escrita: um vínculo recusado não deixa rastro
    // nenhum — nem `cognito_sub` na vítima, nem conta nova para o atacante.
    if (!params.emailVerified) throw new CognitoLinkRequiresVerifiedEmailError(email);

    const user = toUser(byEmail.rows[0] as unknown as Record<string, unknown>);
    await linkCognitoSub(user.id, cognitoSub);
    return { user, outcome: 'linked-by-email' };
  }

  return { user: await createCognitoUser(email, cognitoSub), outcome: 'created' };
}
