/**
 * Política de senha do user pool, verificada **no cliente** (T-106b).
 *
 * ## Por que duplicar a regra aqui
 *
 * Quem valida senha de verdade é o Cognito, no `SignUp`. Só que a recusa dele é
 * cega para quem está cadastrando: `InvalidPasswordException` → `weakPassword`
 * (`mapCognitoError`) → **400 com mensagem genérica** ("Senha nao atende a
 * politica de seguranca do cadastro"). A pessoa descobre que a senha não serve,
 * mas não *qual* regra quebrou, e tenta de novo no escuro. A checagem local
 * existe para transformar esse round-trip cego numa lista visível enquanto
 * digita — não para substituir o Cognito, que continua sendo a autoridade.
 *
 * ## Esta cópia e o pool mudam JUNTOS
 *
 * As regras abaixo são o *Cognito defaults* do pool (`Password policy mode`).
 * Afrouxar aqui (tirar a exigência de caractere especial, por exemplo) sem
 * afrouxar no console produz o pior dos mundos: o front aprova e o Cognito
 * recusa com a mensagem genérica de novo. Mudou uma ponta, mude a outra — é a
 * mesma convenção dos helpers duplicados de propósito no `CLAUDE.md` da raiz.
 *
 * ## O `trim` não é preciosismo
 *
 * O Cognito recusa senha com espaço nas pontas **antes** de olhar a política,
 * com um erro de formato (`InvalidParameterException`, regex `^[\S]+.*[\S]+$`)
 * que a rota traduz como 502 — comportamento observado contra o pool real, não
 * deduzido da documentação. Uma senha colada de um gerenciador vem com espaço
 * mais vezes do que parece, e o 502 não diz nada sobre isso.
 */

/**
 * Caracteres que o pool conta como "especial".
 *
 * É a lista publicada pela AWS para o `Cognito defaults`, incluindo o espaço.
 * Um caractere fora dela não é recusado — só **não conta** como especial.
 */
export const PASSWORD_SPECIAL_CHARS = '^$*.[]{}()?"!@#%&/\,><\':;|_~`+= ';

export interface PasswordRule {
  key: 'length' | 'lowercase' | 'uppercase' | 'number' | 'special' | 'edges';
  label: string;
  ok: boolean;
}

/** O estado de cada regra para a senha digitada, na ordem em que a tela mostra. */
export function passwordRules(password: string): PasswordRule[] {
  return [
    { key: 'length', label: 'Pelo menos 8 caracteres', ok: password.length >= 8 },
    { key: 'lowercase', label: 'Uma letra minúscula', ok: /[a-z]/.test(password) },
    { key: 'uppercase', label: 'Uma letra maiúscula', ok: /[A-Z]/.test(password) },
    { key: 'number', label: 'Um número', ok: /[0-9]/.test(password) },
    {
      key: 'special',
      label: 'Um caractere especial (! @ # $ % …)',
      ok: [...password].some((c) => PASSWORD_SPECIAL_CHARS.includes(c)),
    },
    {
      key: 'edges',
      label: 'Sem espaço no início ou no fim',
      ok: password === password.trim(),
    },
  ];
}

/** `true` quando todas as regras passam — o que o botão de cadastrar exige. */
export function passwordPolicyMet(password: string): boolean {
  return passwordRules(password).every((rule) => rule.ok);
}
