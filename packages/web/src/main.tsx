import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './App.css';
import App from './App';
import { initTheme } from './theme';

// Reaplica a preferência de tema persistida (o script inline em index.html
// já evita o flash antes do primeiro paint; isto mantém `theme.ts` como
// única fonte da mecânica de tema para os módulos React).
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
