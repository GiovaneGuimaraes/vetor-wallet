// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BackToInvestimentosLink } from './BackLink';
import { CriptoPage } from '../routes/CriptoPage';

afterEach(cleanup);

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/investimentos" element={<p>HUB</p>} />
        <Route path="/home" element={<p>HOME</p>} />
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Voltar das subpages de Investimentos', () => {
  it('BackToInvestimentosLink leva ao hub /investimentos, não à Home', () => {
    renderAt('/investimentos/x', <BackToInvestimentosLink />);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Investimentos' }));
    expect(screen.getByText('HUB')).toBeTruthy();
    expect(screen.queryByText('HOME')).toBeNull();
  });

  it('CriptoPage usa o voltar para /investimentos', () => {
    renderAt('/investimentos/cripto', <CriptoPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Investimentos' }));
    expect(screen.getByText('HUB')).toBeTruthy();
  });
});
