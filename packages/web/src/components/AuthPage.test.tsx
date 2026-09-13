// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RegisterResult, User } from '@vetor-wallet/shared';

/**
 * Render do `AuthPage` (T-092, cobrindo o que a T-106b entregou).
 *
 * `authConfirm.ts`, `authRegister.ts` e `passwordPolicy.ts` têm teste de função
 * pura. O que não tinha prova nenhuma é a **costura**: que o 202 do cadastro
 * vira a tela de código, que o código digitado vai para o `/confirm` com o
 * e-mail certo, e que o 403 `USER_NOT_CONFIRMED` do login cai na mesma tela em
 * vez de acusar a senha. Tudo isso é decisão de fluxo dentro do componente.
 *
 * Padrão e armadilha do spy: ver o cabeçalho de `PluggyImportModal.test.tsx`.
 */

const login = vi.fn();
const register = vi.fn();
const confirmSignUp = vi.fn();
const resendConfirmationCode = vi.fn();
const forgotPassword = vi.fn();
const resetPassword = vi.fn();

let loginImpl: () => Promise<User> = () => Promise.reject(new Error('não definido'));
let registerImpl: () => Promise<RegisterResult> = () => Promise.reject(new Error('não definido'));
let confirmImpl: () => Promise<void> = () => Promise.resolve();
let resendImpl: () => Promise<void> = () => Promise.resolve();
let forgotImpl: () => Promise<void> = () => Promise.resolve();
let resetImpl: () => Promise<void> = () => Promise.resolve();

vi.mock('../api', async () => {
  // A classe de erro vem da REAL: `interpretAuthError` faz `instanceof`, e uma
  // cópia declarada aqui seria outro tipo — o teste passaria a exercitar um
  // caminho que não existe em produção.
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    AuthApiError: actual.AuthApiError,
    login: (...args: unknown[]) => {
      login(...args);
      return loginImpl();
    },
    register: (...args: unknown[]) => {
      register(...args);
      return registerImpl();
    },
    confirmSignUp: (...args: unknown[]) => {
      confirmSignUp(...args);
      return confirmImpl();
    },
    resendConfirmationCode: (...args: unknown[]) => {
      resendConfirmationCode(...args);
      return resendImpl();
    },
    forgotPassword: (...args: unknown[]) => {
      forgotPassword(...args);
      return forgotImpl();
    },
    resetPassword: (...args: unknown[]) => {
      resetPassword(...args);
      return resetImpl();
    },
  };
});

const { AuthApiError } = await import('../api');
const { AuthPage } = await import('./AuthPage');

const USER: User = {
  id: 1,
  email: 'alice@example.com',
  name: null,
  phone: null,
  created_at: '2026-09-01 10:00:00',
  roles: [],
};

const SENHA_OK = 'Senha123!';

function renderPage(onAuth = vi.fn()) {
  render(<AuthPage onAuth={onAuth} theme="dark" onToggle={vi.fn()} />);
  return onAuth;
}

const campo = (rotulo: RegExp) => screen.getByLabelText(rotulo) as HTMLInputElement;
/** O título do card e o botão de enviar têm o MESMO texto — o papel separa. */
const tituloConfirmacao = () => screen.getByRole('heading', { name: 'Confirmar cadastro' });
const botao = (nome: string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement;

async function irParaCadastro(user: ReturnType<typeof userEvent.setup>) {
  await user.click(botao('Criar conta'));
}

/** Cadastro completo até a tela de código — o ponto de partida de vários casos. */
async function cadastrarAtePendente(user: ReturnType<typeof userEvent.setup>) {
  await irParaCadastro(user);
  await user.type(campo(/E-mail/), 'alice@example.com');
  await user.type(campo(/^Senha$/), SENHA_OK);
  await user.type(campo(/Confirmar senha/), SENHA_OK);
  await user.click(botao('Criar conta'));
  await waitFor(() => expect(tituloConfirmacao()).toBeTruthy());
}

beforeEach(() => {
  [login, register, confirmSignUp, resendConfirmationCode, forgotPassword, resetPassword].forEach(
    (m) => m.mockReset()
  );
  loginImpl = () => Promise.resolve(USER);
  registerImpl = () => Promise.resolve({ pendingConfirmation: true, email: 'alice@example.com' });
  confirmImpl = () => Promise.resolve();
  resendImpl = () => Promise.resolve();
  forgotImpl = () => Promise.resolve();
  resetImpl = () => Promise.resolve();
});
afterEach(() => cleanup());

describe('AuthPage — política de senha (T-106b)', () => {
  it('a lista de requisitos reage enquanto digita', async () => {
    const user = userEvent.setup();
    renderPage();
    await irParaCadastro(user);

    expect(screen.getByText('Pelo menos 8 caracteres').textContent).toContain('○');

    await user.type(campo(/^Senha$/), SENHA_OK);

    for (const regra of [
      'Pelo menos 8 caracteres',
      'Uma letra minúscula',
      'Uma letra maiúscula',
      'Um número',
    ]) {
      expect(screen.getByText(regra).textContent).toContain('✓');
    }
  });

  it('senha fora da política não chega a sair do navegador', async () => {
    const user = userEvent.setup();
    renderPage();
    await irParaCadastro(user);

    await user.type(campo(/E-mail/), 'alice@example.com');
    await user.type(campo(/^Senha$/), '123123123');
    await user.type(campo(/Confirmar senha/), '123123123');
    await user.click(botao('Criar conta'));

    // O ponto do módulo: a recusa do Cognito é genérica, então a regra quebrada
    // tem de aparecer ANTES do POST — e o POST não acontece.
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText(/não atende aos requisitos/)).toBeTruthy();
  });
});

describe('AuthPage — etapa de confirmação (T-106b)', () => {
  it('cadastro pendente leva à tela de código, com o e-mail na tela', async () => {
    const user = userEvent.setup();
    renderPage();

    await cadastrarAtePendente(user);

    expect(screen.getByText(/Enviamos um código de 6 dígitos/)).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
  });

  it('o código só aceita dígitos e o botão trava antes dos 6', async () => {
    const user = userEvent.setup();
    renderPage();
    await cadastrarAtePendente(user);

    const codigo = campo(/Código de confirmação/);
    await user.type(codigo, ' 12a3 ');
    expect(codigo.value).toBe('123');
    expect(botao('Confirmar cadastro').disabled).toBe(true);

    await user.type(codigo, '456');
    expect(codigo.value).toBe('123456');
    expect(botao('Confirmar cadastro').disabled).toBe(false);
  });

  it('confirmar usa o e-mail do cadastro e entra direto, sem redigitar a senha', async () => {
    const user = userEvent.setup();
    const onAuth = renderPage();
    await cadastrarAtePendente(user);

    await user.type(campo(/Código de confirmação/), '123456');
    await user.click(botao('Confirmar cadastro'));

    await waitFor(() => expect(onAuth).toHaveBeenCalledWith(USER));
    expect(confirmSignUp).toHaveBeenCalledWith('alice@example.com', '123456');
    expect(login).toHaveBeenCalledWith('alice@example.com', SENHA_OK);
  });

  it('login recusado por cadastro pendente cai na tela de código, não em erro', async () => {
    const user = userEvent.setup();
    renderPage();

    loginImpl = () =>
      Promise.reject(new AuthApiError('Cadastro ainda nao confirmado', 'USER_NOT_CONFIRMED'));

    await user.type(campo(/E-mail/), 'alice@example.com');
    await user.type(campo(/^Senha$/), SENHA_OK);
    await user.click(botao('Entrar'));

    // Sem este desvio a conta ficaria presa: o app não tem credencial IAM para
    // as operações `Admin*` do Cognito.
    await waitFor(() => expect(tituloConfirmacao()).toBeTruthy());
    expect(screen.getByText(/ainda não foi confirmado/)).toBeTruthy();
  });

  it('erro de credencial de verdade continua sendo mensagem de erro', async () => {
    const user = userEvent.setup();
    renderPage();

    loginImpl = () => Promise.reject(new AuthApiError('E-mail ou senha invalidos', null));

    await user.type(campo(/E-mail/), 'alice@example.com');
    await user.type(campo(/^Senha$/), SENHA_OK);
    await user.click(botao('Entrar'));

    await waitFor(() => expect(screen.getByText('E-mail ou senha invalidos')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Confirmar cadastro' })).toBeNull();
  });

  it('reenviar pede um código novo para o mesmo e-mail', async () => {
    const user = userEvent.setup();
    renderPage();
    await cadastrarAtePendente(user);

    await user.click(botao('Reenviar'));

    await waitFor(() => expect(resendConfirmationCode).toHaveBeenCalledWith('alice@example.com'));
    expect(screen.getByText(/Enviamos um novo código/)).toBeTruthy();
  });
});

describe('AuthPage — recuperação de senha (T-108b)', () => {
  const SENHA_NOVA = 'NovaSenha123!';

  /** Vai do login até a tela de código+senha nova (ponto de partida comum). */
  async function irAteTrocarSenha(user: ReturnType<typeof userEvent.setup>) {
    await user.click(botao('Esqueci minha senha'));
    await user.type(campo(/E-mail/), 'alice@example.com');
    await user.click(botao('Enviar código'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nova senha' })).toBeTruthy());
  }

  it('"Esqueci minha senha" só aparece no login, e leva à etapa de e-mail', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('button', { name: 'Esqueci minha senha' })).toBeTruthy();
    await user.click(botao('Esqueci minha senha'));

    expect(screen.getByRole('heading', { name: 'Recuperar senha' })).toBeTruthy();
    // register também não deve ter o link, para não confundir a etapa errada
    await user.click(botao('Voltar'));
    await irParaCadastro(user);
    expect(screen.queryByRole('button', { name: 'Esqueci minha senha' })).toBeNull();
  });

  it('enviar o e-mail nunca diz se a conta existe — texto é sempre condicional', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(botao('Esqueci minha senha'));
    await user.type(campo(/E-mail/), 'alice@example.com');
    await user.click(botao('Enviar código'));

    await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith('alice@example.com'));
    expect(screen.getByRole('heading', { name: 'Nova senha' })).toBeTruthy();
    expect(screen.getByText(/tiver uma conta, um código/)).toBeTruthy();
  });

  it('botão de enviar código trava sem e-mail', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(botao('Esqueci minha senha'));

    expect(botao('Enviar código').disabled).toBe(true);
    await user.type(campo(/E-mail/), 'a');
    expect(botao('Enviar código').disabled).toBe(false);
  });

  it('botão de trocar senha trava até código completo e senha nova válida', async () => {
    const user = userEvent.setup();
    renderPage();
    await irAteTrocarSenha(user);

    expect(botao('Trocar senha').disabled).toBe(true);

    await user.type(campo(/Código de confirmação/), '123456');
    expect(botao('Trocar senha').disabled).toBe(true); // senha nova ainda vazia

    await user.type(campo(/Senha nova/), SENHA_NOVA);
    expect(botao('Trocar senha').disabled).toBe(false);
  });

  it('trocar a senha sempre volta ao login com aviso condicional — nunca confirma o resultado', async () => {
    const user = userEvent.setup();
    renderPage();
    await irAteTrocarSenha(user);

    await user.type(campo(/Código de confirmação/), '123456');
    await user.type(campo(/Senha nova/), SENHA_NOVA);
    await user.type(campo(/Confirmar senha nova/), SENHA_NOVA);
    await user.click(botao('Trocar senha'));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({
        email: 'alice@example.com',
        code: '123456',
        newPassword: SENHA_NOVA,
      })
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Entrar' })).toBeTruthy());
    expect(screen.getByText(/se o código estava certo/i)).toBeTruthy();
  });

  it('senhas diferentes na troca não chegam a sair do navegador', async () => {
    const user = userEvent.setup();
    renderPage();
    await irAteTrocarSenha(user);

    await user.type(campo(/Código de confirmação/), '123456');
    await user.type(campo(/Senha nova/), SENHA_NOVA);
    await user.type(campo(/Confirmar senha nova/), 'OutraSenha123!');
    await user.click(botao('Trocar senha'));

    expect(resetPassword).not.toHaveBeenCalled();
    expect(screen.getByText('As senhas não coincidem')).toBeTruthy();
  });

  it('reenviar na etapa de troca de senha chama o forgot-password de novo, não o resend do cadastro', async () => {
    const user = userEvent.setup();
    renderPage();
    await irAteTrocarSenha(user);

    await user.click(botao('Reenviar'));

    await waitFor(() => expect(forgotPassword).toHaveBeenCalledTimes(2));
    expect(resendConfirmationCode).not.toHaveBeenCalled();
    expect(screen.getByText(/Se houver uma conta com esse e-mail, um novo código/)).toBeTruthy();
  });

  it('falha real (rede/config) na recuperação vira mensagem de erro, não silêncio', async () => {
    const user = userEvent.setup();
    renderPage();

    forgotImpl = () => Promise.reject(new AuthApiError('Autenticacao indisponivel', null));

    await user.click(botao('Esqueci minha senha'));
    await user.type(campo(/E-mail/), 'alice@example.com');
    await user.click(botao('Enviar código'));

    await waitFor(() => expect(screen.getByText('Autenticacao indisponivel')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Nova senha' })).toBeNull();
  });
});
