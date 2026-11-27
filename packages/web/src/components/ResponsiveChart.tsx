import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_CHART_WIDTH, computeChartBox, type ChartBox } from '../routes/chartBox';

/**
 * Mede a largura do container e entrega ao gráfico um viewBox em pixels reais
 * (ver `chartBox.ts`). Sem `ResizeObserver` (jsdom) fica no tamanho padrão.
 */
export function ResponsiveChart({
  ratio = 0.3,
  minHeight = 150,
  maxHeight = 230,
  children,
}: {
  ratio?: number;
  minHeight?: number;
  maxHeight?: number;
  children: (box: ChartBox) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="vw-chart-box">
      {children(computeChartBox(width, { ratio, minHeight, maxHeight }))}
    </div>
  );
}
