/**
 * Polyfills para compatibilidade de bibliotecas em Service Worker
 *
 * Algumas bibliotecas acessam APIs DOM em tempo de carregamento do módulo,
 * antes que qualquer configuração seja aplicada. Este módulo fornece
 * stubs mínimos para prevenir erros sem afetar funcionalidade.
 *
 * IMPORTANTE: Este módulo deve ser importado ANTES de qualquer biblioteca
 * que possa acessar APIs DOM em tempo de carregamento.
 *
 * Bibliotecas/código que requerem este polyfill:
 * - axios v1.7+ (acessa document.cookie para XSRF)
 * - @aws-sdk/xml-builder (acessa document.getElementsByTagName para parsing XML)
 * - Collectors forenses (acessam window.AudioContext, window.RTCPeerConnection, etc.)
 *
 * @module ServiceWorkerPolyfills
 * @see https://github.com/axios/axios/pull/5146 - Fetch adapter PR
 * @see CONTEXT_PATTERNS.md para padrões de contexto de execução
 *
 * ATENÇÃO: Este polyfill foi testado com axios@1.7.x ate axios@1.13.x
 * Verificar compatibilidade ao atualizar essas bibliotecas.
 */

// ============================================================================
// Debug Logging - Logs extensivos para diagnóstico (apenas em desenvolvimento)
// ============================================================================

const DEBUG_PREFIX = '[SW-Polyfill]';
const DEBUG_ENABLED = import.meta.env.DEV || import.meta.env['VITE_DEBUG'] === 'true';
let logCounter = 0;

/**
 * Log de debug com contador sequencial para rastrear ordem de execução
 * NOTA: Desabilitado em produção para melhorar performance de startup
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
  if (!DEBUG_ENABLED) {
    return;
  }

  logCounter++;
  const timestamp = new Date().toISOString();
  console.warn(
    `${DEBUG_PREFIX} [${logCounter}] [${timestamp}] ${message}`,
    data ? JSON.stringify(data) : ''
  );
}

// Log inicial - módulo sendo carregado
debugLog('POLYFILL_MODULE_LOADING', {
  hasGlobalThis: typeof globalThis !== 'undefined',
  hasSelf: typeof self !== 'undefined',
  typeofDocument: typeof document,
  typeofWindow: typeof window,
  typeofNavigator: typeof navigator,
  typeofServiceWorkerGlobalScope: typeof ServiceWorkerGlobalScope,
});

// ============================================================================
// Declarações de Tipo para Service Worker
// ============================================================================

/**
 * Declaração de tipo para ServiceWorkerGlobalScope
 * Necessário porque o TypeScript não inclui automaticamente os tipos de Service Worker
 */
interface ServiceWorkerGlobalScopeType {}
declare const ServiceWorkerGlobalScope: (new () => ServiceWorkerGlobalScopeType) | undefined;

debugLog('TYPES_DECLARED', {
  ServiceWorkerGlobalScopeAfterDeclare: typeof ServiceWorkerGlobalScope,
});

// ============================================================================
// Constantes e Tipos
// ============================================================================

/**
 * Symbol para marcar objetos como stubs de polyfill
 * Permite identificar se um objeto é um stub real ou o objeto nativo
 */
export const POLYFILL_MARKER = Symbol.for('lexato-service-worker-polyfill');

/**
 * Cria um elemento stub vazio para retorno de métodos DOM
 * Implementa interface mínima para evitar erros em bibliotecas
 */
function createElementStub(): Record<string, unknown> {
  return {
    tagName: '',
    textContent: '',
    innerHTML: '',
    getAttribute: () => null,
    setAttribute: () => undefined,
    appendChild: () => undefined,
    removeChild: () => undefined,
    children: [],
    childNodes: [],
    parentNode: null,
    style: {},
  };
}

/**
 * Cria uma NodeList stub vazia
 * Usado para retorno de getElementsByTagName, querySelectorAll, etc.
 */
function createNodeListStub(): unknown[] & { item: (index: number) => null; length: number } {
  const list: unknown[] = [];
  return Object.assign(list, {
    item: () => null,
    length: 0,
  });
}

/**
 * Interface para o stub de document usado em Service Workers
 * Inclui métodos DOM comuns que bibliotecas podem acessar
 */
interface DocumentStub {
  /** Cookie vazio - axios verifica isso para XSRF */
  cookie: string;
  /** Marcador para identificar como stub */
  [POLYFILL_MARKER]: true;
  /** getElementsByTagName - AWS SDK xml-builder usa para parsing */
  getElementsByTagName: (tagName: string) => ReturnType<typeof createNodeListStub>;
  /** createElement - algumas bibliotecas usam para criar elementos temporários */
  createElement: (tagName: string) => ReturnType<typeof createElementStub>;
  /** createElementNS - para elementos com namespace (SVG, etc.) */
  createElementNS: (ns: string, tagName: string) => ReturnType<typeof createElementStub>;
  /** querySelector - seletor CSS */
  querySelector: (selector: string) => null;
  /** querySelectorAll - seletor CSS múltiplo */
  querySelectorAll: (selector: string) => ReturnType<typeof createNodeListStub>;
  /** getElementById - busca por ID */
  getElementById: (id: string) => null;
  /** getElementsByClassName - busca por classe */
  getElementsByClassName: (className: string) => ReturnType<typeof createNodeListStub>;
  /** documentElement - elemento raiz */
  documentElement: ReturnType<typeof createElementStub>;
  /** body - elemento body */
  body: ReturnType<typeof createElementStub>;
  /** head - elemento head */
  head: ReturnType<typeof createElementStub>;
  /** addEventListener - para Sentry e outras bibliotecas */
  addEventListener: (type: string, listener: unknown, options?: unknown) => void;
  /** removeEventListener - para Sentry e outras bibliotecas */
  removeEventListener: (type: string, listener: unknown, options?: unknown) => void;
  /** dispatchEvent - para compatibilidade */
  dispatchEvent: (event: unknown) => boolean;
}

/**
 * Interface para o stub de window usado em Service Workers
 * Inclui APIs que collectors forenses e outras bibliotecas podem acessar
 *
 * NOTA: Algumas bibliotecas (Zustand, React, etc.) podem chamar métodos de eventos
 * como dispatchEvent, CustomEvent, etc. mesmo em contextos sem DOM.
 * Esses stubs previnem erros "window.dispatchEvent is not a function".
 */
interface WindowStub {
  /** Marcador para identificar como stub */
  [POLYFILL_MARKER]: true;
  /** AudioContext - usado por AudioFingerprintCollector */
  AudioContext: undefined;
  /** webkitAudioContext - fallback para Safari */
  webkitAudioContext: undefined;
  /** RTCPeerConnection - usado por WebRTCCollector */
  RTCPeerConnection: undefined;
  /** devicePixelRatio - usado por DeviceCollector */
  devicePixelRatio: number;
  /** navigator - referência ao navigator global */
  navigator: typeof navigator;
  /** location - stub de location */
  location: {
    href: string;
    hostname: string;
    origin: string;
    protocol: string;
    pathname: string;
    search: string;
    hash: string;
  };
  /** innerWidth/innerHeight - dimensões da viewport */
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  /** scrollX/scrollY - posição de scroll */
  scrollX: number;
  scrollY: number;
  /** screen - informações de tela (stub) */
  screen: {
    width: number;
    height: number;
    colorDepth: number;
    pixelDepth: number;
    availWidth: number;
    availHeight: number;
  };
  /** addEventListener/removeEventListener - stubs para event listeners */
  addEventListener: (type: string, listener: unknown, options?: unknown) => void;
  removeEventListener: (type: string, listener: unknown, options?: unknown) => void;
  /** dispatchEvent - stub para dispatch de eventos (usado por bibliotecas como Zustand) */
  dispatchEvent: (event: unknown) => boolean;
  /** postMessage - stub para comunicação entre contextos */
  postMessage: (message: unknown, targetOrigin?: string) => void;
  /** setTimeout/setInterval - referências aos globais */
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  /** requestAnimationFrame - stub (não disponível em SW) */
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  /** getComputedStyle - stub (requer DOM) */
  getComputedStyle: (element: unknown) => Record<string, string>;
  /** matchMedia - stub para media queries */
  matchMedia: (query: string) => {
    matches: boolean;
    media: string;
    addEventListener: () => void;
    removeEventListener: () => void;
  };
  /** localStorage/sessionStorage - stubs (não disponíveis em SW) */
  localStorage: undefined;
  sessionStorage: undefined;
  /** performance - referência ao global */
  performance: typeof performance;
  /** crypto - referência ao global */
  crypto: typeof crypto;
  /** fetch - referência ao global */
  fetch: typeof fetch;
  /** atob/btoa - referências aos globais */
  atob: typeof atob;
  btoa: typeof btoa;
  /** URL/URLSearchParams - referências aos globais */
  URL: typeof URL;
  URLSearchParams: typeof URLSearchParams;
}

// ============================================================================
// Detecção de Contexto
// ============================================================================

/**
 * Verifica se estamos em um contexto de Service Worker
 *
 * NOTA: Esta função é duplicada de context-utils.ts intencionalmente.
 * Este módulo deve ser importado ANTES de qualquer outro para aplicar
 * o polyfill, evitando dependências circulares e garantindo que o stub
 * seja aplicado o mais cedo possível no ciclo de vida do Service Worker.
 *
 * @returns true se estamos em Service Worker, false caso contrário
 */
function isServiceWorkerContext(): boolean {
  debugLog('IS_SERVICE_WORKER_CONTEXT_CHECK_START', {
    typeofServiceWorkerGlobalScope: typeof ServiceWorkerGlobalScope,
  });

  // Verificar se ServiceWorkerGlobalScope existe e se self é uma instância dele
  if (typeof ServiceWorkerGlobalScope === 'undefined') {
    debugLog('IS_SERVICE_WORKER_CONTEXT_NO_SWGS', {
      result: false,
    });
    return false;
  }

  const isInstance = self instanceof ServiceWorkerGlobalScope;
  debugLog('IS_SERVICE_WORKER_CONTEXT_RESULT', {
    selfInstanceOfSWGS: isInstance,
    result: isInstance,
  });

  return isInstance;
}

/**
 * Verifica se document já está definido (não é um stub)
 *
 * @returns true se document existe e não é um stub
 */
function hasRealDocument(): boolean {
  debugLog('HAS_REAL_DOCUMENT_CHECK_START', {
    typeofDocument: typeof document,
  });

  if (typeof document === 'undefined') {
    debugLog('HAS_REAL_DOCUMENT_UNDEFINED', { result: false });
    return false;
  }

  // Verificar se é um stub nosso
  const doc = document as unknown as { [POLYFILL_MARKER]?: boolean };
  const isStub = doc[POLYFILL_MARKER] === true;
  const result = !isStub;

  debugLog('HAS_REAL_DOCUMENT_RESULT', {
    hasPolyfillMarker: isStub,
    result,
  });

  return result;
}

/**
 * Verifica se window já está definido (não é um stub)
 *
 * @returns true se window existe e não é um stub
 */
function hasRealWindow(): boolean {
  debugLog('HAS_REAL_WINDOW_CHECK_START', {
    typeofWindow: typeof window,
  });

  if (typeof window === 'undefined') {
    debugLog('HAS_REAL_WINDOW_UNDEFINED', { result: false });
    return false;
  }

  // Verificar se é um stub nosso
  const win = window as unknown as { [POLYFILL_MARKER]?: boolean };
  const isStub = win[POLYFILL_MARKER] === true;
  const result = !isStub;

  debugLog('HAS_REAL_WINDOW_RESULT', {
    hasPolyfillMarker: isStub,
    result,
  });

  return result;
}

// ============================================================================
// Polyfills
// ============================================================================

/**
 * Aplica stub de document para bibliotecas que acessam APIs DOM
 *
 * O Axios v1.7+ avalia `platform.hasStandardBrowserEnv` em tempo de carregamento
 * do módulo, o que pode causar acesso a `document` antes que a configuração
 * do adapter seja aplicada.
 *
 * O AWS SDK (@aws-sdk/xml-builder) usa `document.getElementsByTagName` para
 * parsing de XML, o que também falha em Service Workers.
 *
 * Este stub previne erros "document is not defined" sem afetar funcionalidade,
 * pois configuramos o axios com:
 * - adapter: 'fetch' (não usa DOM)
 * - withXSRFToken: false (não precisa de document.cookie)
 *
 * @returns true se o stub foi aplicado, false se não foi necessário
 */
export function aplicarDocumentStub(): boolean {
  debugLog('APLICAR_DOCUMENT_STUB_START');

  // Só aplicar em Service Worker
  const isSW = isServiceWorkerContext();
  debugLog('APLICAR_DOCUMENT_STUB_IS_SW', { isSW });

  if (!isSW) {
    debugLog('APLICAR_DOCUMENT_STUB_NOT_SW_SKIP', { result: false });
    return false;
  }

  // Não sobrescrever document real
  const hasReal = hasRealDocument();
  debugLog('APLICAR_DOCUMENT_STUB_HAS_REAL', { hasReal });

  if (hasReal) {
    debugLog('APLICAR_DOCUMENT_STUB_HAS_REAL_SKIP', { result: false });
    return false;
  }

  debugLog('APLICAR_DOCUMENT_STUB_CREATING_STUB');

  // Criar stub completo com todos os métodos DOM que bibliotecas podem acessar
  const stub: DocumentStub = {
    cookie: '',
    [POLYFILL_MARKER]: true,
    getElementsByTagName: () => createNodeListStub(),
    createElement: () => createElementStub(),
    createElementNS: () => createElementStub(),
    querySelector: () => null,
    querySelectorAll: () => createNodeListStub(),
    getElementById: () => null,
    getElementsByClassName: () => createNodeListStub(),
    documentElement: createElementStub(),
    body: createElementStub(),
    head: createElementStub(),
    // Event listeners (para Sentry e outras bibliotecas)
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  };

  debugLog('APLICAR_DOCUMENT_STUB_STUB_CREATED', {
    stubKeys: Object.keys(stub).filter(k => typeof k === 'string'),
  });

  // Aplicar ao globalThis
  debugLog('APLICAR_DOCUMENT_STUB_APPLYING_TO_GLOBALTHIS');
  (globalThis as unknown as { document: DocumentStub }).document = stub;

  debugLog('APLICAR_DOCUMENT_STUB_APPLIED', {
    typeofDocumentAfter: typeof document,
    result: true,
  });

  return true;
}

/**
 * Verifica se o stub de document está ativo
 *
 * Útil para debugging e testes.
 *
 * @returns true se o stub está ativo, false caso contrário
 */
export function isDocumentStubActive(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const doc = document as unknown as { [POLYFILL_MARKER]?: boolean };
  return doc[POLYFILL_MARKER] === true;
}

/**
 * Remove o stub de document (útil para testes)
 *
 * ATENÇÃO: Não usar em produção - pode causar erros em bibliotecas
 * que já foram carregadas com o stub.
 *
 * @returns true se o stub foi removido, false se não estava ativo
 */
export function removerDocumentStub(): boolean {
  if (!isDocumentStubActive()) {
    return false;
  }

  // Remover do globalThis
  delete (globalThis as unknown as { document?: DocumentStub }).document;

  return true;
}

/**
 * Aplica stub de window para bibliotecas que acessam APIs de browser
 *
 * Alguns collectors forenses e bibliotecas acessam window.AudioContext,
 * window.RTCPeerConnection, etc. Este stub previne erros "window is not defined"
 * retornando undefined para APIs não disponíveis em Service Worker.
 *
 * @returns true se o stub foi aplicado, false se não foi necessário
 */
export function aplicarWindowStub(): boolean {
  debugLog('APLICAR_WINDOW_STUB_START');

  // Só aplicar em Service Worker
  const isSW = isServiceWorkerContext();
  debugLog('APLICAR_WINDOW_STUB_IS_SW', { isSW });

  if (!isSW) {
    debugLog('APLICAR_WINDOW_STUB_NOT_SW_SKIP', { result: false });
    return false;
  }

  // Não sobrescrever window real
  const hasReal = hasRealWindow();
  debugLog('APLICAR_WINDOW_STUB_HAS_REAL', { hasReal });

  if (hasReal) {
    debugLog('APLICAR_WINDOW_STUB_HAS_REAL_SKIP', { result: false });
    return false;
  }

  debugLog('APLICAR_WINDOW_STUB_CREATING_STUB');

  // Contador para requestAnimationFrame stub
  let rafCounter = 0;

  // Criar stub com APIs que bibliotecas podem acessar
  const stub: WindowStub = {
    [POLYFILL_MARKER]: true,
    // APIs de áudio/vídeo - não disponíveis em SW
    AudioContext: undefined,
    webkitAudioContext: undefined,
    RTCPeerConnection: undefined,
    // Propriedades de viewport
    devicePixelRatio: 1,
    innerWidth: 0,
    innerHeight: 0,
    outerWidth: 0,
    outerHeight: 0,
    scrollX: 0,
    scrollY: 0,
    // Navigator - usar o global
    navigator: navigator,
    // Location stub
    location: {
      href: '',
      hostname: '',
      origin: '',
      protocol: 'https:',
      pathname: '',
      search: '',
      hash: '',
    },
    // Screen stub
    screen: {
      width: 0,
      height: 0,
      colorDepth: 24,
      pixelDepth: 24,
      availWidth: 0,
      availHeight: 0,
    },
    // Event listeners - no-op com logging
    addEventListener: (type: string) => {
      debugLog('WINDOW_STUB_ADD_EVENT_LISTENER', { type });
    },
    removeEventListener: (type: string) => {
      debugLog('WINDOW_STUB_REMOVE_EVENT_LISTENER', { type });
    },
    // dispatchEvent - retorna true (evento não cancelado)
    dispatchEvent: (event: unknown) => {
      debugLog('WINDOW_STUB_DISPATCH_EVENT', { 
        eventType: event && typeof event === 'object' && 'type' in event 
          ? (event as { type: string }).type 
          : 'unknown' 
      });
      return true;
    },
    postMessage: (message: unknown) => {
      debugLog('WINDOW_STUB_POST_MESSAGE', { messageType: typeof message });
    },
    // Timers - usar os globais
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    // requestAnimationFrame - stub que usa setTimeout
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      debugLog('WINDOW_STUB_REQUEST_ANIMATION_FRAME');
      const id = ++rafCounter;
      globalThis.setTimeout(() => callback(performance.now()), 16);
      return id;
    },
    cancelAnimationFrame: (handle: number) => {
      debugLog('WINDOW_STUB_CANCEL_ANIMATION_FRAME', { handle });
    },
    // getComputedStyle - retorna objeto vazio
    getComputedStyle: () => {
      debugLog('WINDOW_STUB_GET_COMPUTED_STYLE');
      return {};
    },
    // matchMedia - stub que retorna não-match
    matchMedia: (query: string) => {
      debugLog('WINDOW_STUB_MATCH_MEDIA', { query });
      return {
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
    },
    // Storage - não disponível em SW
    localStorage: undefined,
    sessionStorage: undefined,
    // APIs globais disponíveis em SW
    performance: globalThis.performance,
    crypto: globalThis.crypto,
    fetch: globalThis.fetch.bind(globalThis),
    atob: globalThis.atob.bind(globalThis),
    btoa: globalThis.btoa.bind(globalThis),
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
  };

  debugLog('APLICAR_WINDOW_STUB_STUB_CREATED', {
    stubKeys: Object.keys(stub).filter(k => typeof k === 'string'),
  });

  // Aplicar ao globalThis
  debugLog('APLICAR_WINDOW_STUB_APPLYING_TO_GLOBALTHIS');
  (globalThis as unknown as { window: WindowStub }).window = stub;

  debugLog('APLICAR_WINDOW_STUB_APPLIED', {
    typeofWindowAfter: typeof window,
    result: true,
  });

  return true;
}

/**
 * Verifica se o stub de window está ativo
 *
 * Útil para debugging e testes.
 *
 * @returns true se o stub está ativo, false caso contrário
 */
export function isWindowStubActive(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const win = window as unknown as { [POLYFILL_MARKER]?: boolean };
  return win[POLYFILL_MARKER] === true;
}

/**
 * Remove o stub de window (útil para testes)
 *
 * ATENÇÃO: Não usar em produção - pode causar erros em bibliotecas
 * que já foram carregadas com o stub.
 *
 * @returns true se o stub foi removido, false se não estava ativo
 */
export function removerWindowStub(): boolean {
  if (!isWindowStubActive()) {
    return false;
  }

  // Remover do globalThis
  delete (globalThis as unknown as { window?: WindowStub }).window;

  return true;
}

// ============================================================================
// Auto-execução
// ============================================================================

debugLog('AUTO_EXEC_START', {
  typeofDocument: typeof document,
  typeofWindow: typeof window,
});

/**
 * Aplicar polyfills automaticamente quando o módulo é importado
 *
 * Isso garante que os stubs sejam aplicados antes de qualquer biblioteca
 * problemática ser carregada.
 */
debugLog('AUTO_EXEC_APPLYING_DOCUMENT_STUB');
const documentStubAplicado = aplicarDocumentStub();
debugLog('AUTO_EXEC_DOCUMENT_STUB_RESULT', { documentStubAplicado });

debugLog('AUTO_EXEC_APPLYING_WINDOW_STUB');
const windowStubAplicado = aplicarWindowStub();
debugLog('AUTO_EXEC_WINDOW_STUB_RESULT', { windowStubAplicado });

debugLog('AUTO_EXEC_COMPLETE', {
  documentStubAplicado,
  windowStubAplicado,
  typeofDocumentAfter: typeof document,
  typeofWindowAfter: typeof window,
});

// Log final de status (apenas em desenvolvimento)
if (DEBUG_ENABLED) {
  console.warn(`${DEBUG_PREFIX} [FINAL] Stubs aplicados - document: ${documentStubAplicado}, window: ${windowStubAplicado}`);
}

// ============================================================================
// Exports
// ============================================================================

export default {
  aplicarDocumentStub,
  aplicarWindowStub,
  isDocumentStubActive,
  isWindowStubActive,
  removerDocumentStub,
  removerWindowStub,
  POLYFILL_MARKER,
};
