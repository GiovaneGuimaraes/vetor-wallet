import type { Config } from 'jest';

import baseConfig from './jest.config';

/**
 * Jest config usada SÓ pelo Stryker (mutation testing).
 *
 * Espelha `jest.config.ts` mas desliga a coleta de cobertura e os thresholds de
 * 100%. O Stryker roda subconjuntos da suíte (um grupo de testes por mutante),
 * então cobertura parcial é esperada e não pode reprovar a rodada — a métrica
 * que importa aqui é o mutation score, não a cobertura de linha.
 */
const config: Config = {
  ...baseConfig,
  collectCoverage: false,
  coverageThreshold: undefined,
};

export default config;
