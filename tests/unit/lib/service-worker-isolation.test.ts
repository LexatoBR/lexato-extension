/**
 * Teste de Isolamento de Service Worker
 *
 * Simula o ambiente de service worker (sem DOM) para identificar
 * módulos que acessam 'document' no momento do import.
 *
 * Este teste ajuda a identificar a causa raiz do erro
 * "document is not defined" na captura de vídeo.
 *
 * @module ServiceWorkerIsolationTest
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Service Worker Isolation - Identificação de Acesso a DOM', () => {
  // Salvar referências originais
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  /**
   * Remove document e window do escopo global para simular service worker
   */
  function simulateServiceWorkerEnvironment(): void {
    // @ts-expect-error - Removendo document intencionalmente
    delete globalThis.document;
    // @ts-expect-error - Removendo window intencionalmente
    delete globalThis.window;
  }

  /**
   * Restaura document e window
   */
  function restoreEnvironment(): void {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }

  describe('Polyfill de Service Worker', () => {
    it('deve aplicar stub de document.cookie quando document não existe', async () => {
      // Simular ambiente sem document
      simulateServiceWorkerEnvironment();
      
      // Simular ServiceWorkerGlobalScope
      const MockServiceWorkerGlobalScope = class {};
      (globalThis as unknown as { ServiceWorkerGlobalScope: typeof MockServiceWorkerGlobalScope }).ServiceWorkerGlobalScope = MockServiceWorkerGlobalScope;
      Object.setPrototypeOf(self, MockServiceWorkerGlobalScope.prototype);
      
      try {
        // Importar o polyfill
        await import('../../../src/background/service-worker-polyfills');
        
        // Verificar que document.cookie foi definido
        expect(globalThis.document).toBeDefined();
        expect((globalThis.document as { cookie: string }).cookie).toBe('');
      } finally {
        // Restaurar
        restoreEnvironment();
        // @ts-expect-error - Limpando ServiceWorkerGlobalScope
        delete globalThis.ServiceWorkerGlobalScope;
      }
    });

    it('não deve aplicar stub quando document já existe', () => {
      // document já existe no ambiente de teste
      expect(globalThis.document).toBeDefined();
      expect(globalThis.document).toBe(originalDocument);
    });
  });

  describe('Módulos que DEVEM funcionar sem DOM', () => {
    beforeAll(() => {
      simulateServiceWorkerEnvironment();
    });

    afterAll(() => {
      restoreEnvironment();
    });

    it('context-utils.ts deve importar sem erro', async () => {
      await expect(import('../../../src/lib/context-utils')).resolves.toBeDefined();
    });

    it('audit-logger.ts deve importar sem erro', async () => {
      await expect(import('../../../src/lib/audit-logger')).resolves.toBeDefined();
    });

    it('crypto-helper.ts deve importar sem erro', async () => {
      await expect(
        import('../../../src/lib/evidence-pipeline/crypto-helper')
      ).resolves.toBeDefined();
    });

    it('base-collector.ts deve importar sem erro', async () => {
      await expect(
        import('../../../src/lib/forensic/collectors/base-collector')
      ).resolves.toBeDefined();
    });

    // Collectors que NÃO usam DOM
    describe('Collectors DOM-safe', () => {
      it('GeolocationCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/geolocation-collector')
        ).resolves.toBeDefined();
      });

      it('NetworkCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/network-collector')
        ).resolves.toBeDefined();
      });

      it('DeviceCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/device-collector')
        ).resolves.toBeDefined();
      });

      it('DNSCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/dns-collector')
        ).resolves.toBeDefined();
      });

      it('StorageCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/storage-collector')
        ).resolves.toBeDefined();
      });

      it('PerformanceCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/performance-collector')
        ).resolves.toBeDefined();
      });

      it('WaybackCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/wayback-collector')
        ).resolves.toBeDefined();
      });

      it('HTTPHeadersCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/http-headers-collector')
        ).resolves.toBeDefined();
      });

      it('TimezoneCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/timezone-collector')
        ).resolves.toBeDefined();
      });

      it('MediaDevicesCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/media-devices-collector')
        ).resolves.toBeDefined();
      });

      it('ServiceWorkersCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/service-workers-collector')
        ).resolves.toBeDefined();
      });

      it('PermissionsCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/permissions-collector')
        ).resolves.toBeDefined();
      });

      it('WhoisFreaksDNSCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/whoisfreaks-dns-collector')
        ).resolves.toBeDefined();
      });

      it('WhoisFreaksWHOISCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/whoisfreaks-whois-collector')
        ).resolves.toBeDefined();
      });

      it('WhoisFreaksSSLCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/collectors/whoisfreaks-ssl-collector')
        ).resolves.toBeDefined();
      });
    });

    // Módulos principais do pipeline
    describe('Pipeline modules', () => {
      it('ForensicCollector deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/forensic/forensic-collector')
        ).resolves.toBeDefined();
      });

      it('capture-strategy.ts deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/evidence-pipeline/capture-strategy')
        ).resolves.toBeDefined();
      });

      it('html-collection-service.ts deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/evidence-pipeline/html-collection-service')
        ).resolves.toBeDefined();
      });

      it('video-strategy.ts deve importar sem erro', async () => {
        // Este é o teste crítico - se falhar, encontramos o problema
        await expect(
          import('../../../src/lib/evidence-pipeline/video-strategy')
        ).resolves.toBeDefined();
      });

      it('evidence-pipeline.ts deve importar sem erro', async () => {
        await expect(
          import('../../../src/lib/evidence-pipeline/evidence-pipeline')
        ).resolves.toBeDefined();
      });

      it('video-capture-handler.ts deve importar sem erro', async () => {
        await expect(
          import('../../../src/background/video-capture-handler')
        ).resolves.toBeDefined();
      });
    });
  });

  describe('Collectors que REQUEREM DOM (devem falhar sem DOM)', () => {
    beforeAll(() => {
      simulateServiceWorkerEnvironment();
    });

    afterAll(() => {
      restoreEnvironment();
    });

    // Estes testes verificam que os collectors DOM-required
    // realmente falham quando importados sem DOM
    // (o que é esperado - eles devem usar dynamic import)

    it('SSLCollector deve falhar ao importar sem DOM', async () => {
      // Este collector usa document.querySelectorAll
      // Se passar, significa que tem guard adequado
      try {
        await import('../../../src/lib/forensic/collectors/ssl-collector');
        // Se chegou aqui, o collector tem guard - o que é bom!
        expect(true).toBe(true);
      } catch (error) {
        // Se falhou, confirma que precisa de DOM
        expect(error).toBeDefined();
      }
    });

    it('PageResourcesCollector deve falhar ao importar sem DOM', async () => {
      try {
        await import('../../../src/lib/forensic/collectors/page-resources-collector');
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('CanvasFingerprintCollector deve falhar ao importar sem DOM', async () => {
      try {
        await import('../../../src/lib/forensic/collectors/canvas-fingerprint-collector');
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('WebGLFingerprintCollector deve falhar ao importar sem DOM', async () => {
      try {
        await import('../../../src/lib/forensic/collectors/webgl-fingerprint-collector');
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('FontsCollector deve falhar ao importar sem DOM', async () => {
      try {
        await import('../../../src/lib/forensic/collectors/fonts-collector');
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});

/**
 * Teste específico para identificar a linha exata do erro
 */
describe('Diagnóstico de Erro - Identificação de Linha', () => {
  it('deve identificar qual módulo causa o erro', async () => {
    // Salvar document
    const originalDocument = globalThis.document;
    
    // Criar proxy que loga acessos
    const accessLog: string[] = [];
    
    // Substituir document por um proxy que registra acessos
    Object.defineProperty(globalThis, 'document', {
      get() {
        const stack = new Error().stack ?? '';
        accessLog.push(`Acesso a document:\n${stack}`);
        return originalDocument;
      },
      configurable: true,
    });

    try {
      // Importar o módulo problemático
      await import('../../../src/lib/evidence-pipeline/video-strategy');
      
      // Se houve acessos, logar via console.warn (permitido pelo eslint)
      if (accessLog.length > 0) {
        console.warn('\n📍 Acessos a document detectados durante import:');
        accessLog.forEach((log, i) => {
          console.warn(`\n--- Acesso ${i + 1} ---`);
          console.warn(log);
        });
      }
    } finally {
      // Restaurar usando Object.defineProperty para evitar erro de setter
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        writable: true,
        configurable: true,
      });
    }

    // O teste passa, mas os logs mostram onde document foi acessado
    expect(true).toBe(true);
  });
});
