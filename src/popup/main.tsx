/**
 * Entry point do Popup da extensão Lexato
 *
 * O popup é o ponto de entrada principal da extensão.
 * Gerencia login, seleção de tipo de captura e início de screenshot.
 * Para vídeo, obtém streamId via tabCapture e abre o Side Panel.
 *
 * @module PopupEntry
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import PopupApp from './PopupApp';
import '@assets/styles/globals.css';
import { initSentry } from '@lib/sentry';

// Inicializa Sentry para o Popup
initSentry({
  context: 'popup',
});

/**
 * Inicializa o Popup da extensão
 */
function initPopup(): void {
  const container = document.getElementById('root');

  if (!container) {
    console.error('[Popup] Elemento root não encontrado');
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <PopupApp />
    </React.StrictMode>
  );
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
