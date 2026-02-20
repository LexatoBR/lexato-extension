/**
 * Ponto de entrada da Pagina de Opcoes da Extensao Lexato
 *
 * Inicializa o React e renderiza o componente App.
 * Tema escuro exclusivo (Requisito 16.8)
 *
 * @module OptionsMain
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../lib/i18n';
import App from './App';
import '@assets/styles/globals.css';

/**
 * Inicializa a pagina de opcoes da extensao
 */
function initOptions(): void {
  const container = document.getElementById('root');

  if (!container) {
    console.error('[Options] Elemento root nao encontrado');
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </React.StrictMode>
  );
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOptions);
} else {
  initOptions();
}
