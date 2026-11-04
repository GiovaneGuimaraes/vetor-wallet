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
