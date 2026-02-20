import React from 'react';
import ReactDOM from 'react-dom/client';
import { PreviewApp } from './PreviewApp';
import '@assets/styles/globals.css';
import { initSentry } from '@lib/sentry';

// Inicializa Sentry para o preview
initSentry({
  context: 'preview',
});

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <PreviewApp />
    </React.StrictMode>
  );
}
