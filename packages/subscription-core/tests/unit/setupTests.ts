/**
 * Setup comum da suíte unitária.
 *
 * Não há `jest.mock` de package aqui de propósito — o `subscription-core` não
 * tem dependência de I/O implícita para mockar: o banco chega **injetado**
 * (`db: Db`) e o único acesso à rede é o `fetch` global, que cada teste do
 * provider troca por conta própria. Se um dia entrar um workspace package com
 * efeito colateral no import, o mock global dele vem para cá.
 */

// Env de billing não vaza entre casos: cada teste que depende dela seta o que
// precisa. Começar de um estado conhecido evita que a env da máquina de quem
// roda (ou um `.env` carregado por outro processo) mude o resultado.
beforeEach(() => {
  delete process.env.BILLING_ENABLED;
  delete process.env.ABACATEPAY_API_KEY;
  delete process.env.ABACATEPAY_API_URL;
});
