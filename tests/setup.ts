/**
 * Setup de testes para a Extensão Chrome Lexato
 *
 * Configura mocks globais e ambiente de teste.
 * Os mocks são tipados como 'unknown as typeof chrome' para evitar
 * erros de tipagem enquanto mantém a funcionalidade de mock.
 *
 * @module TestSetup
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Definir NODE_ENV como test
process.env['NODE_ENV'] = 'test';

// ============================================================================
// Mock da API do Chrome
// ============================================================================

/**
 * Mock completo da API chrome para testes.
 * Tipado como unknown para permitir mocks parciais sem erros de tipo.
 */
const chromeMock = {
  runtime: {
    id: 'test-extension-id',
    getManifest: vi.fn(() => ({
      version: '1.0.0',
      name: 'Lexato - Provas Digitais',
    })),
    sendMessage: vi.fn().mockResolvedValue({}),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onMessageExternal: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
  },

  storage: {
    session: {
      get: vi.fn((_keys?: string | string[] | Record<string, unknown> | null) => 
        Promise.resolve({} as Record<string, unknown>)
      ),
      set: vi.fn((_items: Record<string, unknown>) => Promise.resolve()),
      remove: vi.fn((_keys: string | string[]) => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
      getBytesInUse: vi.fn(() => Promise.resolve(0)),
      setAccessLevel: vi.fn(() => Promise.resolve()),
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
        hasListeners: vi.fn(() => false),
        getRules: vi.fn(),
        removeRules: vi.fn(),
        addRules: vi.fn(),
      },
      QUOTA_BYTES: 10485760,
    },
    local: {
      get: vi.fn((_keys?: string | string[] | Record<string, unknown> | null) => 
        Promise.resolve({} as Record<string, unknown>)
      ),
      set: vi.fn((_items: Record<string, unknown>) => Promise.resolve()),
      remove: vi.fn((_keys: string | string[]) => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
      getBytesInUse: vi.fn(() => Promise.resolve(0)),
      setAccessLevel: vi.fn(() => Promise.resolve()),
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
        hasListeners: vi.fn(() => false),
        getRules: vi.fn(),
        removeRules: vi.fn(),
        addRules: vi.fn(),
      },
      QUOTA_BYTES: 10485760,
    },
    sync: {
      get: vi.fn((_keys?: string | string[] | Record<string, unknown> | null) => 
        Promise.resolve({} as Record<string, unknown>)
      ),
      set: vi.fn((_items: Record<string, unknown>) => Promise.resolve()),
      remove: vi.fn((_keys: string | string[]) => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
      getBytesInUse: vi.fn(() => Promise.resolve(0)),
      setAccessLevel: vi.fn(() => Promise.resolve()),
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
        hasListeners: vi.fn(() => false),
        getRules: vi.fn(),
        removeRules: vi.fn(),
        addRules: vi.fn(),
      },
      QUOTA_BYTES: 102400,
      QUOTA_BYTES_PER_ITEM: 8192,
      MAX_ITEMS: 512,
      MAX_WRITE_OPERATIONS_PER_HOUR: 1800,
      MAX_WRITE_OPERATIONS_PER_MINUTE: 120,
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },

  tabs: {
    query: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    reload: vi.fn((_tabId?: number, _reloadProperties?: { bypassCache?: boolean }, callback?: () => void) => {
      // Simula reload bem-sucedido
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }),
    sendMessage: vi.fn().mockResolvedValue({}),
    captureVisibleTab: vi.fn().mockResolvedValue(''),
    create: vi.fn().mockResolvedValue({}),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onActivated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onCreated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },

  scripting: {
    executeScript: vi.fn().mockResolvedValue([]),
    insertCSS: vi.fn().mockResolvedValue(undefined),
    removeCSS: vi.fn().mockResolvedValue(undefined),
  },

  notifications: {
    create: vi.fn().mockResolvedValue(''),
    clear: vi.fn().mockResolvedValue(true),
    onClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },

  alarms: {
    create: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },

  permissions: {
    contains: vi.fn().mockResolvedValue(true),
    request: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    getAll: vi.fn().mockResolvedValue({ permissions: [], origins: [] }),
    onAdded: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },

  management: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    getSelf: vi.fn().mockResolvedValue({
      id: 'test-extension-id',
      name: 'Lexato - Provas Digitais',
      version: '1.0.0',
      enabled: true,
      type: 'extension',
    }),
    onEnabled: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onDisabled: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },

  action: {
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setBadgeTextColor: vi.fn().mockResolvedValue(undefined),
    getBadgeText: vi.fn().mockResolvedValue(''),
    getBadgeBackgroundColor: vi.fn().mockResolvedValue([0, 0, 0, 0]),
    setIcon: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
    getTitle: vi.fn().mockResolvedValue(''),
    setPopup: vi.fn().mockResolvedValue(undefined),
    getPopup: vi.fn().mockResolvedValue(''),
    enable: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockResolvedValue(true),
    onClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },

  sidePanel: {
    setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(undefined),
    setOptions: vi.fn().mockResolvedValue(undefined),
    getOptions: vi.fn().mockResolvedValue({}),
    getPanelBehavior: vi.fn().mockResolvedValue({ openPanelOnActionClick: false }),
  },

  windows: {
    get: vi.fn().mockResolvedValue({}),
    getAll: vi.fn().mockResolvedValue([]),
    getCurrent: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    onCreated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },

  commands: {
    getAll: vi.fn().mockResolvedValue([]),
    onCommand: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
      hasListeners: vi.fn(() => false),
      getRules: vi.fn(),
      removeRules: vi.fn(),
      addRules: vi.fn(),
    },
  },
} as unknown as typeof chrome;

// Definir chrome como global
vi.stubGlobal('chrome', chromeMock);

// ============================================================================
// Mock do crypto.subtle
// ============================================================================

/**
 * Mock do crypto para operações criptográficas em testes.
 * Implementa funções básicas necessárias para hash e geração de chaves.
 */
const cryptoMock = {
  subtle: {
    digest: vi.fn(async (_algorithm: string, data: ArrayBuffer) => {
      // Gera hash baseado no conteúdo real dos dados
      // Usa soma simples de todos os bytes para criar hash único por conteúdo
      const hashArray = new Uint8Array(32);
      const dataView = new Uint8Array(data);
      
      // Calcula checksum simples mas determinístico baseado no conteúdo
      let sum = 0;
      for (let i = 0; i < dataView.length; i++) {
        sum = (sum + (dataView[i] ?? 0) * (i + 1)) % 0xFFFFFFFF;
      }
      
      // Preenche o hash com valores derivados do checksum e tamanho
      for (let i = 0; i < 32; i++) {
        const seed = sum + dataView.length + i;
        hashArray[i] = (seed * 31 + i * 17) % 256;
      }
      
      return hashArray.buffer;
    }),
    generateKey: vi.fn(),
    exportKey: vi.fn(),
    importKey: vi.fn(),
    deriveBits: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
  },
  getRandomValues: vi.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }),
  /**
   * Gera UUID v4 fake para testes
   * Usado pelo AuditLogger para correlationId
   */
  randomUUID: vi.fn(() => {
    const hex = '0123456789abcdef';
    let uuid = '';
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        uuid += '-';
      } else if (i === 14) {
        uuid += '4'; // versão 4
      } else if (i === 19) {
        uuid += hex[Math.floor(Math.random() * 4) + 8]; // variante
      } else {
        uuid += hex[Math.floor(Math.random() * 16)];
      }
    }
    return uuid;
  }),
};

vi.stubGlobal('crypto', cryptoMock);

// ============================================================================
// Lifecycle Hooks
// ============================================================================

// ============================================================================
// Mock do ResizeObserver
// ============================================================================

/**
 * Mock do ResizeObserver para testes de componentes que usam observação de tamanho.
 * Necessário para componentes como ScrollIndicator.
 */
class MockResizeObserver implements ResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    // Mock implementation - não faz nada em testes
  }

  unobserve(): void {
    // Mock implementation
  }

  disconnect(): void {
    // Mock implementation
  }
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

// ============================================================================
// Mock do MutationObserver
// ============================================================================

/**
 * Mock do MutationObserver para testes de componentes que observam mutações DOM.
 * Necessário para componentes como ScrollIndicator.
 */
class MockMutationObserver implements MutationObserver {
  callback: MutationCallback;

  constructor(callback: MutationCallback) {
    this.callback = callback;
  }

  observe(): void {
    // Mock implementation - não faz nada em testes
  }

  disconnect(): void {
    // Mock implementation
  }

  takeRecords(): MutationRecord[] {
    return [];
  }
}

vi.stubGlobal('MutationObserver', MockMutationObserver);

// ============================================================================
// Lifecycle Hooks
// ============================================================================

// Limpar mocks após cada teste
afterEach(() => {
  vi.clearAllMocks();
});

// Reset de mocks após todos os testes
afterAll(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Exports
// ============================================================================

/**
 * Exporta mocks para uso direto nos testes quando necessário
 */
export { chromeMock, cryptoMock };
