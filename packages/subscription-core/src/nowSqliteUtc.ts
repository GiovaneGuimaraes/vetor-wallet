import { toSqliteUtc } from './toSqliteUtc';

/** Instante "agora" no formato do banco — ponto único de leitura do relógio. */
export const nowSqliteUtc = (): string => {
  return toSqliteUtc(new Date());
};
