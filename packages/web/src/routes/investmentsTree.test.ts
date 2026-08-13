import { describe, expect, it } from 'vitest';
import {
  INVESTMENTS_ROOT,
  INVESTMENT_NODES,
  LEGACY_INVESTMENT_REDIRECTS,
  investmentNodeByKey,
} from './investmentsTree';

describe('INVESTMENT_NODES', () => {
  it('tem a raiz em /investimentos e todo filho sob ela', () => {
    expect(INVESTMENTS_ROOT).toBe('/investimentos');
    for (const node of INVESTMENT_NODES) {
      expect(node.path.startsWith(`${INVESTMENTS_ROOT}/`)).toBe(true);
    }
  });

  it('não repete key nem path', () => {
    const keys = INVESTMENT_NODES.map((n) => n.key);
    const paths = INVESTMENT_NODES.map((n) => n.path);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('tem exatamente os três filhos, na ordem Ações → Cripto → Renda Fixa', () => {
    expect(INVESTMENT_NODES.map((n) => n.key)).toEqual(['acoes', 'cripto', 'renda-fixa']);
  });

  // Marcar Ações como "em breve" sumiria com a carteira B3 do hub sem quebrar
  // build, lint nem nenhum outro teste — daí a asserção explícita.
  it('só Ações NÃO é "em breve"', () => {
    expect(investmentNodeByKey('acoes')?.comingSoon).toBe(false);
    expect(investmentNodeByKey('cripto')?.comingSoon).toBe(true);
    expect(investmentNodeByKey('renda-fixa')?.comingSoon).toBe(true);
  });

  it('todo nó tem mascote, nome e descrição preenchidos', () => {
    for (const node of INVESTMENT_NODES) {
      expect(node.mascot).toMatch(/\.png$/);
      expect(node.name.length).toBeGreaterThan(0);
      expect(node.desc.length).toBeGreaterThan(0);
    }
  });
});

describe('LEGACY_INVESTMENT_REDIRECTS', () => {
  it('cobre os links antigos de ações e de cripto', () => {
    for (const legacy of ['/dash', '/dash/:id', '/carteiras', '/cripto']) {
      expect(LEGACY_INVESTMENT_REDIRECTS[legacy]).toBeDefined();
    }
  });

  // Asserção CRUZADA (não literal duplicada): o destino precisa ser um path
  // que a árvore realmente declara, senão o redirect cai no catch-all.
  it('todo destino é um path existente em INVESTMENT_NODES', () => {
    const paths = new Set(INVESTMENT_NODES.map((n) => n.path));
    for (const target of Object.values(LEGACY_INVESTMENT_REDIRECTS)) {
      expect(paths.has(target)).toBe(true);
    }
  });

  it('nenhum path de origem colide com um path da árvore nova', () => {
    const paths = new Set(INVESTMENT_NODES.map((n) => n.path));
    for (const legacy of Object.keys(LEGACY_INVESTMENT_REDIRECTS)) {
      expect(paths.has(legacy)).toBe(false);
    }
  });
});

describe('investmentNodeByKey', () => {
  it('devolve o nó da chave pedida', () => {
    expect(investmentNodeByKey('cripto')?.path).toBe('/investimentos/cripto');
    expect(investmentNodeByKey('renda-fixa')?.name).toBe('Renda Fixa');
  });

  it('devolve undefined para chave desconhecida', () => {
    expect(investmentNodeByKey('metas')).toBeUndefined();
    expect(investmentNodeByKey('')).toBeUndefined();
  });
});
