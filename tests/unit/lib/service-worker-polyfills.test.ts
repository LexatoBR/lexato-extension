/**
 * Testes unitários para service-worker-polyfills.ts
 *
 * Verifica que os polyfills são aplicados corretamente em contexto de Service Worker
 * e não interferem em contextos com DOM real.
 *
 * @module ServiceWorkerPolyfillsTest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Salvar referências originais
const originalDocument = globalThis.document;
const originalServiceWorkerGlobalScope = (globalThis as unknown as { ServiceWorkerGlobalScope?: unknown }).ServiceWorkerGlobalScope;

describe('ServiceWorkerPolyfills', () => {
  beforeEach(() => {
    // Limpar módulo do cache para re-importar
    vi.resetModules();
  });

  afterEach(() => {
    // Restaurar estado original
    if (originalDocument !== undefined) {
      (globalThis as unknown as { document: unknown }).document = originalDocument;
    } else {
      delete (globalThis as unknown as { document?: unknown }).document;
    }

    if (originalServiceWorkerGlobalScope !== undefined) {
      (globalThis as unknown as { ServiceWorkerGlobalScope: unknown }).ServiceWorkerGlobalScope = originalServiceWorkerGlobalScope;
    } else {
      delete (globalThis as unknown as { ServiceWorkerGlobalScope?: unknown }).ServiceWorkerGlobalScope;
    }
  });

  describe('aplicarDocumentStub', () => {
    it('deve aplicar stub quando document não existe e está em Service Worker', async () => {
      // Simular ambiente de Service Worker
      delete (globalThis as unknown as { document?: unknown }).document;
      
      // Mock ServiceWorkerGlobalScope
      const mockSWGS = class ServiceWorkerGlobalScope {};
      (globalThis as unknown as { ServiceWorkerGlobalScope: unknown }).ServiceWorkerGlobalScope = mockSWGS;
      (globalThis as unknown as { self: unknown }).self = new mockSWGS();

      // Importar módulo (aplica polyfill automaticamente)
      const { aplicarDocumentStub, isDocumentStubActive, POLYFILL_MARKER } = await import(
        '../../../src/lib/service-worker-polyfills'
      );

      // Chamar explicitamente para garantir aplicação
      aplicarDocumentStub();

      // Verificar que o stub foi aplicado
      expect(isDocumentStubActive()).toBe(true);
      expect((globalThis as unknown as { document: { cookie: string } }).document.cookie).toBe('');
      
      // Verificar marcador
      const doc = (globalThis as unknown as { document: { [key: symbol]: boolean } }).document;
      expect(doc[POLYFILL_MARKER]).toBe(true);
    });

    it('não deve aplicar stub quando document já existe', async () => {
      // Garantir que document existe (ambiente de teste normal)
      const mockDocument = { cookie: 'test=value', title: 'Test' };
      (globalThis as unknown as { document: unknown }).document = mockDocument;

      // Importar módulo
      const { isDocumentStubActive } = await import(
        '../../../src/lib/service-worker-polyfills'
      );

      // Verificar que o stub NÃO foi aplicado
      expect(isDocumentStubActive()).toBe(false);
      expect((globalThis as unknown as { document: { cookie: string } }).document.cookie).toBe('test=value');
    });

    it('não deve aplicar stub fora de contexto Service Worker', async () => {
      // Remover document mas não simular Service Worker
      delete (globalThis as unknown as { document?: unknown }).document;
      delete (globalThis as unknown as { ServiceWorkerGlobalScope?: unknown }).ServiceWorkerGlobalScope;

      // Importar módulo
      const { isDocumentStubActive } = await import(
        '../../../src/lib/service-worker-polyfills'
      );

      // Verificar que o stub NÃO foi aplicado
      expect(isDocumentStubActive()).toBe(false);
    });
  });

  describe('removerDocumentStub', () => {
    it('deve remover stub quando ativo', async () => {
      // Simular ambiente de Service Worker
      delete (globalThis as unknown as { document?: unknown }).document;
      
      const mockSWGS = class ServiceWorkerGlobalScope {};
      (globalThis as unknown as { ServiceWorkerGlobalScope: unknown }).ServiceWorkerGlobalScope = mockSWGS;
      (globalThis as unknown as { self: unknown }).self = new mockSWGS();

      // Importar módulo
      const { removerDocumentStub, isDocumentStubActive } = await import(
        '../../../src/lib/service-worker-polyfills'
      );

      // Verificar que stub está ativo
      expect(isDocumentStubActive()).toBe(true);

      // Remover stub
      const removed = removerDocumentStub();
      expect(removed).toBe(true);
      expect(isDocumentStubActive()).toBe(false);
    });

    it('deve retornar false quando stub não está ativo', async () => {
      // Garantir que document existe
      (globalThis as unknown as { document: unknown }).document = { cookie: 'test' };

      // Importar módulo
      const { removerDocumentStub } = await import(
        '../../../src/lib/service-worker-polyfills'
      );

      // Tentar remover stub inexistente
      const removed = removerDocumentStub();
      expect(removed).toBe(false);
    });
  });

  describe('POLYFILL_MARKER', () => {
    it('deve ser um Symbol único', async () => {
      const { POLYFILL_MARKER } = await import(
        '../../../src/lib/service-worker-polyfills'
      );

      expect(typeof POLYFILL_MARKER).toBe('symbol');
      expect(POLYFILL_MARKER.toString()).toContain('lexato-service-worker-polyfill');
    });

    it('deve ser consistente entre imports', async () => {
      const mod1 = await import('../../../src/lib/service-worker-polyfills');
      
      // Re-importar
      vi.resetModules();
      const mod2 = await import('../../../src/lib/service-worker-polyfills');

      // Symbol.for garante que é o mesmo símbolo
      expect(mod1.POLYFILL_MARKER).toBe(mod2.POLYFILL_MARKER);
    });
  });

  describe('Integração com Axios', () => {
    it('stub deve fornecer document.cookie vazio para Axios', async () => {
      // Simular ambiente de Service Worker
      delete (globalThis as unknown as { document?: unknown }).document;
      
      const mockSWGS = class ServiceWorkerGlobalScope {};
      (globalThis as unknown as { ServiceWorkerGlobalScope: unknown }).ServiceWorkerGlobalScope = mockSWGS;
      (globalThis as unknown as { self: unknown }).self = new mockSWGS();

      // Importar polyfill
      await import('../../../src/lib/service-worker-polyfills');

      // Simular o que o Axios faz internamente
      const doc = (globalThis as unknown as { document: { cookie: string } }).document;
      const cookies = doc.cookie;

      // Axios espera uma string (pode ser vazia)
      expect(typeof cookies).toBe('string');
      expect(cookies).toBe('');
    });
  });

  describe('Integração com AWS SDK', () => {
    it('stub deve fornecer getElementsByTagName para AWS SDK xml-builder', async () => {
      // Simular ambiente de Service Worker
      delete (globalThis as unknown as { document?: unknown }).document;
      
      const mockSWGS = class ServiceWorkerGlobalScope {};
      (globalThis as unknown as { ServiceWorkerGlobalScope: unknown }).ServiceWorkerGlobalScope = mockSWGS;
      (globalThis as unknown as { self: unknown }).self = new mockSWGS();

      // Importar polyfill
      await import('../../../src/lib/service-worker-polyfills');

      // Simular o que o AWS SDK xml-builder faz internamente
      const doc = (globalThis as unknown as { document: { getElementsByTagName: (tag: string) => unknown[] } }).document;
      
      // Verificar que getElementsByTagName existe e retorna array-like
      expect(typeof doc.getElementsByTagName).toBe('function');
      
      const result = doc.getElementsByTagName('parsererror');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('stub deve fornecer createElement para bibliotecas que criam elementos temporários', async () => {
      // Simular ambiente de Service Worker
      delete (globalThis as unknown as { document?: unknown }).document;
      
      const mockSWGS = class ServiceWorkerGlobalScope {};
      (globalThis as unknown as { ServiceWorkerGlobalScope: unknown }).ServiceWorkerGlobalScope = mockSWGS;
      (globalThis as unknown as { self: unknown }).self = new mockSWGS();

      // Importar polyfill
      await import('../../../src/lib/service-worker-polyfills');

      // Verificar createElement
      const doc = (globalThis as unknown as { document: { createElement: (tag: string) => Record<string, unknown> } }).document;
      
      expect(typeof doc.createElement).toBe('function');
      
      const element = doc.createElement('div');
      expect(element).toBeDefined();
      expect(typeof element['getAttribute']).toBe('function');
      expect(typeof element['setAttribute']).toBe('function');
    });

    it('stub deve fornecer querySelectorAll para bibliotecas que buscam elementos', async () => {
      // Simular ambiente de Service Worker
      delete (globalThis as unknown as { document?: unknown }).document;
      
      const mockSWGS = class ServiceWorkerGlobalScope {};
      (globalThis as unknown as { ServiceWorkerGlobalScope: unknown }).ServiceWorkerGlobalScope = mockSWGS;
      (globalThis as unknown as { self: unknown }).self = new mockSWGS();

      // Importar polyfill
      await import('../../../src/lib/service-worker-polyfills');

      // Verificar querySelectorAll
      const doc = (globalThis as unknown as { document: { querySelectorAll: (selector: string) => unknown[] } }).document;
      
      expect(typeof doc.querySelectorAll).toBe('function');
      
      const result = doc.querySelectorAll('.some-class');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

});
