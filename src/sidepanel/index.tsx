/**
 * Entry point do Side Panel da extensão Lexato
 *
 * Renderiza o componente App unificado que integra autenticação,
 * captura, histórico, diagnóstico e gravação de vídeo no Side Panel.
 *
 * @module SidePanelEntry

 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@assets/styles/globals.css';
import { initSentry } from '@lib/sentry';

// Inicializa Sentry para o Side Panel
initSentry({
  context: 'sidepanel',
});

/**
 * Inicializa o Side Panel da extensão
 */
function initSidePanel(): void {
  const container = document.getElementById('root');

  if (!container) {
    console.error('[SidePanel] Elemento root não encontrado');
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidePanel);
} else {
  initSidePanel();
}
