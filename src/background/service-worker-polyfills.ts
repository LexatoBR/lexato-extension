/**
 * Polyfills para Service Worker da Extensão Chrome
 *
 * Este arquivo DEVE ser importado PRIMEIRO no service-worker.ts
 * para garantir que os polyfills sejam aplicados antes de qualquer
 * outro módulo que possa acessar APIs do DOM.
 *
 * A implementação real está em ../lib/service-worker-polyfills.ts
 * Este arquivo apenas re-exporta para manter compatibilidade com imports existentes.
 *
 * @see ../lib/service-worker-polyfills.ts - Implementação completa
 * @module ServiceWorkerPolyfills
 */

// Re-exportar do módulo canônico em lib/
// A importação já aplica os polyfills como side effect
export {
  aplicarDocumentStub,
  isDocumentStubActive,
  removerDocumentStub,
  POLYFILL_MARKER,
} from '../lib/service-worker-polyfills';
