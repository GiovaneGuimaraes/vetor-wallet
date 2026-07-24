interface Props {
  title: string;
  subtitle: string;
}

/**
 * Placeholder mínimo para as rotas de layer (Renda, Despesas, Poupança,
 * Metas) — T-004 entrega só a rota/navegação; o conteúdo real de cada tela
 * é escopo das tarefas seguintes (T-008..T-013, ver BACKLOG.md).
 */
export function LayerPlaceholderPage({ title, subtitle }: Props) {
  return (
    <div>
      <div className="vw-page-header">
        <h1 className="vw-page-title">{title}</h1>
        <p className="vw-page-subtitle">{subtitle}</p>
      </div>
      <div className="vw-hero-card">
        <p className="vw-mock-text" style={{ margin: 0 }}>
          Conteúdo em construção — chegando em uma próxima etapa.
        </p>
      </div>
    </div>
  );
}
