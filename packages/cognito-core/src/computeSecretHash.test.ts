import { describe, it, expect } from 'vitest';
import { computeSecretHash } from './computeSecretHash';

// Vetor FIXO, e não um HMAC recalculado no teste: recalcular provaria só que a
// função chama o `crypto` (o mesmo erro de ordem passaria nos dois lados). Os
// dois valores errados abaixo são os enganos plausíveis — chave/mensagem
// trocadas e `clientId + username` em vez de `username + clientId` — e o
// Cognito responde `NotAuthorizedException` para os dois, que a tela mostra
// como "senha inválida".
const USERNAME = 'alice@example.com';
const CLIENT_ID = 'client-abc';
const CLIENT_SECRET = 'super-secret';

const CORRECT = 'oBxDuvdLbnU0Kd5QaDKEKEJiNbWewosBkNcXUVlU+/w=';
const CLIENT_ID_FIRST = 'tNrQScTJ0lI/OfRqjEVv65tN28w13f9xmypHxBFnL/8=';
const KEY_AND_MESSAGE_SWAPPED = 'V6fc4sJjVYGaIY+OxyNCicL/VgaaLvAwzTaG8z8uq9k=';

describe('computeSecretHash (T-106)', () => {
  it('é base64(HMAC-SHA256(username + clientId, clientSecret))', () => {
    expect(
      computeSecretHash({
        username: USERNAME,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      })
    ).toBe(CORRECT);
  });

  it('não é o hash com clientId na frente nem com chave/mensagem trocadas', () => {
    const hash = computeSecretHash({
      username: USERNAME,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
    expect(hash).not.toBe(CLIENT_ID_FIRST);
    expect(hash).not.toBe(KEY_AND_MESSAGE_SWAPPED);
  });

  it('muda com o username (é por isso que ele precisa bater com o campo Username)', () => {
    const other = computeSecretHash({
      username: 'bob@example.com',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
    expect(other).not.toBe(CORRECT);
  });
});
