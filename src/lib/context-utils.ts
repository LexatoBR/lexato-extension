/**
 * Utilitários para detecção de contexto de execução na extensão Chrome
 *
 * Este módulo fornece funções para identificar em qual contexto o código está
 * sendo executado (service worker, content script, offscreen document, etc.).
 *
 * IMPORTANTE: Estas funções são essenciais para evitar erros de runtime como
 * "document is not defined" quando código que usa DOM é importado em contextos
 * que não têm acesso ao DOM (como service workers).
 *
 * Contextos de execução na extensão Chrome:
 * - Service Worker: Background script sem acesso ao DOM
 * - Content Script: Script injetado na página com acesso ao DOM
 * - Offscreen Document: Documento HTML invisível com acesso ao DOM
 * - Popup/Options: Páginas da extensão com acesso ao DOM
 *
 * @module ContextUtils
 * @see https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
 */

// Declaração de tipo para ServiceWorkerGlobalScope (disponível em contexto de Service Worker)
interface ServiceWorkerGlobalScopeType {}
declare const ServiceWorkerGlobalScope: (new () => ServiceWorkerGlobalScopeType) | undefined;

/**
 * Symbol usado pelo service-worker-polyfills.ts para marcar stubs
 * Importamos o mesmo symbol para verificar se document/window são stubs
 */
const POLYFILL_MARKER = Symbol.for('lexato-service-worker-polyfill');

/**
 * Tipo que representa os possíveis contextos de execução
 */
export type ExecutionContext =
  | 'service-worker'
  | 'content-script'
  | 'offscreen-document'
  | 'extension-page'
  | 'unknown';

/**
 * Verifica se o código está executando em contexto com acesso ao DOM
 *
 * Esta é a verificação mais importante para evitar erros de runtime.
 * Deve ser usada como guard antes de qualquer operação que use DOM APIs
 * como document.createElement, document.querySelector, etc.
 *
 * IMPORTANTE: Esta função verifica se document é REAL, não um stub.
 * O service-worker-polyfills.ts cria um stub de document para evitar
 * erros do Axios, mas esse stub não deve ser considerado como DOM real.
 *
 * @returns true se document está definido, é acessível E não é um stub, false caso contrário
 *
 * @example
 * ```typescript
 * if (hasDOMAccess()) {
 *   const element = document.createElement('div');
 *   // ... operações com DOM
 * } else {
 *   console.warn('[Context] Operação de DOM ignorada - contexto sem DOM');
 * }
 * ```
 */
export function hasDOMAccess(): boolean {
  // Verificar se document existe
  if (typeof document === 'undefined') {
    return false;
  }

  // Verificar se é um stub do service-worker-polyfills.ts
  // O stub tem a propriedade POLYFILL_MARKER = true
  const doc = document as unknown as { [key: symbol]: boolean | undefined };
  if (doc[POLYFILL_MARKER] === true) {
    return false;
  }

  return true;
}

/**
 * Verifica se o código está executando em um Service Worker
 *
 * Service Workers são o contexto de background em extensões Manifest V3.
 * Eles NÃO têm acesso ao DOM (document, window) e têm APIs limitadas.
 *
 * @returns true se está em contexto de Service Worker, false caso contrário
 *
 * @example
 * ```typescript
 * if (isServiceWorker()) {
 *   // Usar chrome.runtime.sendMessage para comunicar com content scripts
 *   // Usar dynamic imports para módulos que precisam de DOM
 * }
 * ```
 */
export function isServiceWorker(): boolean {
  return (
    typeof ServiceWorkerGlobalScope !== 'undefined' &&
    self instanceof ServiceWorkerGlobalScope
  );
}

/**
 * Verifica se o código está executando em um Content Script
 *
 * Content Scripts são injetados nas páginas web e têm acesso ao DOM da página,
 * mas executam em um contexto JavaScript isolado. Eles podem usar chrome.runtime
 * para comunicar com o service worker.
 *
 * @returns true se está em contexto de Content Script, false caso contrário
 *
 * @example
 * ```typescript
 * if (isContentScript()) {
 *   // Pode acessar document e window da página
 *   // Pode usar chrome.runtime.sendMessage
 *   const pageTitle = document.title;
 * }
 * ```
 */
export function isContentScript(): boolean {
  return (
    hasDOMAccess() &&
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime !== 'undefined' &&
    !!chrome.runtime.id &&
    // Content scripts não têm acesso a chrome.tabs
    typeof chrome.tabs === 'undefined'
  );
}

/**
 * Verifica se o código está executando em um Offscreen Document
 *
 * Offscreen Documents são documentos HTML invisíveis criados pela extensão
 * para operações que requerem DOM mas não precisam de UI visível.
 * São usados para MediaRecorder, Canvas, etc.
 *
 * @returns true se está em contexto de Offscreen Document, false caso contrário
 *
 * @example
 * ```typescript
 * if (isOffscreenDocument()) {
 *   // Pode usar MediaRecorder, Canvas, etc.
 *   const mediaRecorder = new MediaRecorder(stream);
 * }
 * ```
 */
export function isOffscreenDocument(): boolean {
  return (
    hasDOMAccess() &&
    typeof location !== 'undefined' &&
    location.pathname.includes('offscreen')
  );
}

/**
 * Verifica se o código está executando em uma página da extensão (popup, options, etc.)
 *
 * Páginas da extensão têm acesso completo ao DOM e às APIs do Chrome.
 *
 * @returns true se está em página da extensão, false caso contrário
 *
 * @example
 * ```typescript
 * if (isExtensionPage()) {
 *   // Pode usar todas as APIs do Chrome
 *   // Pode manipular DOM normalmente
 *   chrome.tabs.query({ active: true }, (tabs) => { ... });
 * }
 * ```
 */
export function isExtensionPage(): boolean {
  return (
    hasDOMAccess() &&
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime !== 'undefined' &&
    !!chrome.runtime.id &&
    typeof chrome.tabs !== 'undefined' &&
    !isOffscreenDocument()
  );
}

/**
 * Detecta o contexto de execução atual
 *
 * Retorna uma string identificando o contexto atual de execução.
 * Útil para logging e debugging.
 *
 * @returns Identificador do contexto de execução atual
 *
 * @example
 * ```typescript
 * const context = detectExecutionContext();
 * console.log(`[${context}] Iniciando operação...`);
 * // Output: "[service-worker] Iniciando operação..."
 * ```
 */
export function detectExecutionContext(): ExecutionContext {
  if (isServiceWorker()) {
    return 'service-worker';
  }

  if (isOffscreenDocument()) {
    return 'offscreen-document';
  }

  if (isContentScript()) {
    return 'content-script';
  }

  if (isExtensionPage()) {
    return 'extension-page';
  }

  return 'unknown';
}

/**
 * Verifica se uma API específica está disponível no contexto atual
 *
 * Útil para verificar disponibilidade de APIs antes de usá-las,
 * evitando erros de runtime.
 *
 * @param apiPath - Caminho da API a verificar (ex: 'chrome.tabs', 'navigator.mediaDevices')
 * @returns true se a API está disponível, false caso contrário
 *
 * @example
 * ```typescript
 * if (isAPIAvailable('navigator.mediaDevices')) {
 *   const stream = await navigator.mediaDevices.getDisplayMedia();
 * }
 *
 * if (isAPIAvailable('chrome.tabs')) {
 *   const tabs = await chrome.tabs.query({ active: true });
 * }
 * ```
 */
export function isAPIAvailable(apiPath: string): boolean {
  const parts = apiPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = globalThis;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return false;
    }
    current = current[part];
  }

  return current !== undefined && current !== null;
}

/**
 * Executa uma função apenas se houver acesso ao DOM
 *
 * Wrapper de conveniência que executa a função fornecida apenas
 * se o contexto atual tiver acesso ao DOM.
 *
 * @param fn - Função a ser executada se houver DOM
 * @param fallback - Valor de retorno caso não haja DOM (opcional)
 * @returns Resultado da função ou fallback
 *
 * @example
 * ```typescript
 * const pageTitle = withDOMAccess(
 *   () => document.title,
 *   'Título não disponível'
 * );
 * ```
 */
export function withDOMAccess<T>(fn: () => T, fallback?: T): T | undefined {
  if (hasDOMAccess()) {
    return fn();
  }
  return fallback;
}

/**
 * Executa uma função assíncrona apenas se houver acesso ao DOM
 *
 * Versão assíncrona do withDOMAccess para operações que retornam Promise.
 *
 * @param fn - Função assíncrona a ser executada se houver DOM
 * @param fallback - Valor de retorno caso não haja DOM (opcional)
 * @returns Promise com resultado da função ou fallback
 *
 * @example
 * ```typescript
 * const screenshot = await withDOMAccessAsync(
 *   async () => {
 *     const canvas = document.createElement('canvas');
 *     // ... captura screenshot
 *     return canvas.toDataURL();
 *   },
 *   null
 * );
 * ```
 */
export async function withDOMAccessAsync<T>(
  fn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  if (hasDOMAccess()) {
    return fn();
  }
  return fallback;
}

export default {
  hasDOMAccess,
  isServiceWorker,
  isContentScript,
  isOffscreenDocument,
  isExtensionPage,
  detectExecutionContext,
  isAPIAvailable,
  withDOMAccess,
  withDOMAccessAsync,
};
