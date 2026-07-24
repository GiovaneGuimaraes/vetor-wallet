/**
 * Mecânica de tema v4 (T-003): aplica/persiste a classe `.light`/`.dark`
 * no `<html>` e o `color-scheme` correspondente.
 *
 * Fonte de verdade dos tokens: web/src/index.css (`.light` é o padrão,
 * `.dark` sobrescreve). Persistência: localStorage['vw-theme'].
 *
 * O botão de toggle (UI) não é escopo desta tarefa — ver T-004. Este
 * módulo só expõe a mecânica para ser chamado de onde fizer sentido
 * (ex.: main.tsx na carga inicial, ou um futuro componente de toggle).
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vw-theme';
const DEFAULT_THEME: Theme = 'light';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Lê a preferência persistida, com fallback para o tema padrão (light). */
export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) {
      return stored;
    }
  } catch {
    // localStorage indisponível (modo privado, SSR, etc.) — usa o padrão.
  }
  return DEFAULT_THEME;
}

/** Aplica o tema no `<html>`: troca a classe e o color-scheme. Não persiste. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

/** Aplica e persiste o tema escolhido. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Falha silenciosa de persistência não deve quebrar a troca de tema.
  }
}

/** Alterna entre light/dark a partir da preferência atual e persiste. */
export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * Aplica a preferência persistida (ou o padrão) no `<html>` — chamar uma
 * vez na inicialização do app. Retorna o tema aplicado.
 */
export function initTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
