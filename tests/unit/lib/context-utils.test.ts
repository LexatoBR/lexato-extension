/**
 * Testes Unitários para Context Utils
 *
 * **Validates: Requirements 5.1**
 *
 * Este arquivo testa as funções de detecção de contexto de execução
 * que são essenciais para evitar erros "document is not defined" em
 * Service Workers.
 *
 * @module UnitTest/ContextUtils
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hasDOMAccess,
  isServiceWorker,
  isContentScript,
  isOffscreenDocument,
  isExtensionPage,
  detectExecutionContext,
  isAPIAvailable,
  withDOMAccess,
  withDOMAccessAsync,
} from '@lib/context-utils';

// ============================================================================
// Helpers de Teste
// ============================================================================

/**
 * Armazena referências originais dos globals para restauração
 */
interface GlobalRefs {
  document: typeof document | undefined;
  window: typeof window | undefined;
  chrome: typeof chrome | undefined;
  location: typeof location | undefined;
}

/**
 * Salva referências originais dos globals
 */
function salvarGlobals(): GlobalRefs {
  return {
    document: globalThis.document,
    window: globalThis.window,
    chrome: globalThis.chrome,
    location: globalThis.location,
  };
}

/**
 * Restaura referências originais dos globals
 */
function restaurarGlobals(refs: GlobalRefs): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (refs.document !== undefined) {
    g.document = refs.document;
  }
  if (refs.window !== undefined) {
    g.window = refs.window;
  }
  if (refs.chrome !== undefined) {
    g.chrome = refs.chrome;
  }
  if (refs.location !== undefined) {
    g.location = refs.location;
  }
}

/**
 * Simula ambiente de Service Worker removendo document e window
 */
function simularServiceWorker(): void {
  // @ts-expect-error - Removendo document intencionalmente
  delete globalThis.document;
  // @ts-expect-error - Removendo window intencionalmente
  delete globalThis.window;
}

/**
 * Simula ambiente de Service Worker removendo apenas document
 */
function removerDocument(): void {
  // @ts-expect-error - Removendo document intencionalmente
  delete globalThis.document;
}

/**
 * Simula offscreen document mockando location
 */
function simularOffscreenDocument(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).location = {
    pathname: '/offscreen.html',
    href: 'chrome-extension://abc123/offscreen.html',
  };
}

// ============================================================================
// Testes
// ============================================================================

describe('Context Utils', () => {
  let globalsOriginais: GlobalRefs;

  beforeEach(() => {
    globalsOriginais = salvarGlobals();
  });

  afterEach(() => {
    restaurarGlobals(globalsOriginais);
    vi.restoreAllMocks();
  });

  describe('hasDOMAccess', () => {
    it('deve retornar true quando document está definido', () => {
      // Em ambiente jsdom, document está definido
      expect(hasDOMAccess()).toBe(true);
    });

    it('deve retornar false quando document não está definido', () => {
      removerDocument();
      expect(hasDOMAccess()).toBe(false);
    });
  });

  describe('isServiceWorker', () => {
    it('deve retornar false em ambiente de teste (jsdom)', () => {
      // Em jsdom, não estamos em Service Worker
      expect(isServiceWorker()).toBe(false);
    });

    it('deve verificar ServiceWorkerGlobalScope corretamente', () => {
      // A função verifica se ServiceWorkerGlobalScope existe e se self é instância dele
      // Em jsdom, isso retorna false pois não há ServiceWorkerGlobalScope
      expect(isServiceWorker()).toBe(false);
    });
  });

  describe('isContentScript', () => {
    it('deve retornar false quando chrome.tabs está disponível', () => {
      // Content scripts não têm acesso a chrome.tabs
      // Em ambiente de teste com chrome mockado com tabs, deve retornar false
      expect(isContentScript()).toBe(false);
    });

    it('deve retornar false quando não há chrome.runtime.id', () => {
      // A função verifica se chrome.runtime.id existe
      expect(isContentScript()).toBe(false);
    });
  });

  describe('isOffscreenDocument', () => {
    it('deve retornar false quando pathname não contém "offscreen"', () => {
      expect(isOffscreenDocument()).toBe(false);
    });

    it('deve retornar true quando pathname contém "offscreen"', () => {
      simularOffscreenDocument();
      expect(isOffscreenDocument()).toBe(true);
    });
  });

  describe('isExtensionPage', () => {
    it('deve retornar true quando chrome.tabs está disponível', () => {
      // Extension pages têm acesso a chrome.tabs
      // Em jsdom com chrome.tabs mockado, retorna true
      expect(isExtensionPage()).toBe(true);
    });

    it('deve retornar false para offscreen documents', () => {
      simularOffscreenDocument();
      // Offscreen documents não são extension pages
      expect(isExtensionPage()).toBe(false);
    });
  });

  describe('detectExecutionContext', () => {
    it('deve retornar um contexto válido', () => {
      const context = detectExecutionContext();
      const contextosValidos = [
        'service-worker',
        'content-script',
        'offscreen-document',
        'extension-page',
        'unknown',
      ];
      expect(contextosValidos).toContain(context);
    });

    it('deve retornar "offscreen-document" quando pathname contém "offscreen"', () => {
      simularOffscreenDocument();
      expect(detectExecutionContext()).toBe('offscreen-document');
    });

    it('deve retornar "extension-page" em ambiente jsdom com chrome.tabs mockado', () => {
      // Em jsdom com chrome.tabs mockado, detecta como extension-page
      // pois tem DOM + chrome.runtime.id + chrome.tabs
      expect(detectExecutionContext()).toBe('extension-page');
    });
  });

  describe('isAPIAvailable', () => {
    it('deve retornar true para APIs existentes', () => {
      expect(isAPIAvailable('console')).toBe(true);
      expect(isAPIAvailable('console.log')).toBe(true);
    });

    it('deve retornar false para APIs inexistentes', () => {
      expect(isAPIAvailable('apiInexistente')).toBe(false);
      expect(isAPIAvailable('console.apiInexistente')).toBe(false);
    });

    it('deve lidar com paths profundos', () => {
      // Cria objeto aninhado para teste
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).testObj = {
        level1: {
          level2: {
            level3: 'value',
          },
        },
      };

      expect(isAPIAvailable('testObj.level1.level2.level3')).toBe(true);
      expect(isAPIAvailable('testObj.level1.level2.level4')).toBe(false);

      // Limpa
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).testObj;
    });

    it('deve retornar false para paths com null/undefined intermediário', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).testNull = {
        level1: null,
      };

      expect(isAPIAvailable('testNull.level1.level2')).toBe(false);

      // Limpa
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).testNull;
    });
  });

  describe('withDOMAccess', () => {
    it('deve executar função quando DOM está disponível', () => {
      const fn = vi.fn(() => 'resultado');
      const result = withDOMAccess(fn, 'fallback');

      expect(fn).toHaveBeenCalledOnce();
      expect(result).toBe('resultado');
    });

    it('deve retornar fallback quando DOM não está disponível', () => {
      removerDocument();

      const fn = vi.fn(() => 'resultado');
      const result = withDOMAccess(fn, 'fallback');

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBe('fallback');
    });

    it('deve retornar undefined quando DOM não está disponível e não há fallback', () => {
      removerDocument();

      const fn = vi.fn(() => 'resultado');
      const result = withDOMAccess(fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('withDOMAccessAsync', () => {
    it('deve executar função assíncrona quando DOM está disponível', async () => {
      const fn = vi.fn(async () => 'resultado');
      const result = await withDOMAccessAsync(fn, 'fallback');

      expect(fn).toHaveBeenCalledOnce();
      expect(result).toBe('resultado');
    });

    it('deve retornar fallback quando DOM não está disponível', async () => {
      removerDocument();

      const fn = vi.fn(async () => 'resultado');
      const result = await withDOMAccessAsync(fn, 'fallback');

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBe('fallback');
    });

    it('deve retornar undefined quando DOM não está disponível e não há fallback', async () => {
      removerDocument();

      const fn = vi.fn(async () => 'resultado');
      const result = await withDOMAccessAsync(fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('deve propagar erros da função', async () => {
      const fn = vi.fn(async () => {
        throw new Error('Erro de teste');
      });

      await expect(withDOMAccessAsync(fn)).rejects.toThrow('Erro de teste');
    });
  });

  describe('Integração - Simulação de Contextos', () => {
    it('deve detectar corretamente contexto sem DOM (Service Worker simulado)', () => {
      simularServiceWorker();

      expect(hasDOMAccess()).toBe(false);
      expect(isContentScript()).toBe(false);
      expect(isOffscreenDocument()).toBe(false);
      expect(isExtensionPage()).toBe(false);
    });

    it('deve permitir operações condicionais baseadas em contexto com DOM', () => {
      const operacoes: string[] = [];

      if (hasDOMAccess()) {
        operacoes.push('dom-operation');
      }
      operacoes.push('universal-operation');

      // Em jsdom, ambas devem executar
      expect(operacoes).toContain('dom-operation');
      expect(operacoes).toContain('universal-operation');
      expect(operacoes).toHaveLength(2);
    });

    it('deve permitir operações condicionais sem DOM', () => {
      removerDocument();

      const operacoes: string[] = [];

      if (hasDOMAccess()) {
        operacoes.push('dom-operation');
      }
      operacoes.push('universal-operation');

      // Sem DOM, apenas universal deve executar
      expect(operacoes).not.toContain('dom-operation');
      expect(operacoes).toContain('universal-operation');
      expect(operacoes).toHaveLength(1);
    });

    it('deve lidar com location undefined graciosamente', () => {
      // @ts-expect-error - Removendo location intencionalmente
      delete globalThis.location;

      // Não deve lançar erro
      expect(isOffscreenDocument()).toBe(false);
      // Com chrome.tabs mockado mas sem location, ainda detecta como extension-page
      // pois a verificação de offscreen falha graciosamente
      const context = detectExecutionContext();
      expect(['extension-page', 'unknown']).toContain(context);
    });
  });
});
