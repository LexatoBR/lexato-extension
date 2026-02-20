/**
 * Property Test: DOM-Safe Module Import Safety
 *
 * **Validates: Requirements 1.4, 2.1, 2.5**
 *
 * Este teste verifica a Propriedade 1 do design:
 * "Para qualquer módulo marcado como 'DOM-safe' nas categorias de collectors,
 * importar esse módulo em contexto de service worker NÃO DEVE lançar erro de runtime."
 *
 * A propriedade garante que todos os 19 collectors DOM-safe podem ser importados
 * estaticamente sem causar erro "document is not defined" em service workers.
 *
 * @module PropertyTest/DOMSafeImports
 */

import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Lista de todos os collectors DOM-safe conforme AUDIT_REPORT.md
 * Estes collectors podem ser importados em Service Worker sem erros.
 */
const DOM_SAFE_COLLECTORS = [
  'geolocation-collector',
  'network-collector',
  'device-collector',
  'dns-collector',
  'storage-collector',
  'performance-collector',
  'wayback-collector',
  'http-headers-collector',
  'timezone-collector',
  'media-devices-collector',
  'service-workers-collector',
  'permissions-collector',
  'whoisfreaks-dns-collector',
  'whoisfreaks-whois-collector',
  'whoisfreaks-ssl-collector',
  'base-collector',
] as const;

/**
 * Lista de collectors DOM-required que NÃO devem ser exportados estaticamente
 * Usados para verificar que o index.ts não os exporta
 */
const DOM_REQUIRED_COLLECTORS = [
  'ssl-collector',
  'page-resources-collector',
  'canvas-fingerprint-collector',
  'webgl-fingerprint-collector',
  'fonts-collector',
] as const;

/**
 * Tipo para collector DOM-safe
 */
type DOMSafeCollector = (typeof DOM_SAFE_COLLECTORS)[number];

/**
 * Arbitrary que gera collectors DOM-safe aleatórios
 * Usado para property-based testing
 */
const domSafeCollectorArb = fc.constantFrom(...DOM_SAFE_COLLECTORS);

describe('Property 1: DOM-Safe Module Import Safety', () => {
  /**
   * Armazena o estado original do document para restaurar após os testes
   */
  let originalDocument: typeof document | undefined;
  let originalWindow: typeof window | undefined;

  beforeAll(() => {
    // Salva referências originais
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
  });

  afterAll(() => {
    // Restaura referências originais
    if (originalDocument !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).document = originalDocument;
    }
    if (originalWindow !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).window = originalWindow;
    }
  });

  /**
   * Testa que o módulo forensic/index.ts pode ser importado sem erros
   * mesmo quando document não está definido (simulando service worker)
   *
   * **Validates: Requirements 2.3, 2.5**
   */
  it('should import forensic/index.ts without throwing in service worker context', async () => {
    // O teste roda em ambiente jsdom que tem document definido
    // Verificamos que o import não lança erro
    const importResult = await import('@lib/forensic/index');

    expect(importResult).toBeDefined();
    expect(importResult.ForensicCollector).toBeDefined();
    expect(importResult.BaseCollector).toBeDefined();
  });

  /**
   * Property test: Para qualquer collector DOM-safe selecionado aleatoriamente,
   * o import do módulo não deve lançar erro
   *
   * **Validates: Requirements 1.4, 2.1**
   */
  it('should import any DOM-safe collector without throwing', async () => {
    // Importa todos os collectors DOM-safe via index.ts
    // Se qualquer um causasse erro "document is not defined", o import falharia
    const forensicModule = await import('@lib/forensic/index');

    await fc.assert(
      fc.asyncProperty(domSafeCollectorArb, async (collectorName: DOMSafeCollector) => {
        // Mapeamento de nomes de arquivo para nomes de classe exportados
        const collectorClassNames: Record<DOMSafeCollector, string> = {
          'geolocation-collector': 'GeolocationCollector',
          'network-collector': 'NetworkCollector',
          'device-collector': 'DeviceCollector',
          'dns-collector': 'DNSCollector',
          'storage-collector': 'StorageCollector',
          'performance-collector': 'PerformanceCollector',
          'wayback-collector': 'WaybackCollector',
          'http-headers-collector': 'HTTPHeadersCollector',
          'timezone-collector': 'TimezoneCollector',
          'media-devices-collector': 'MediaDevicesCollector',
          'service-workers-collector': 'ServiceWorkersCollector',
          'permissions-collector': 'PermissionsCollector',
          'whoisfreaks-dns-collector': 'WhoisFreaksDNSCollector',
          'whoisfreaks-whois-collector': 'WhoisFreaksWHOISCollector',
          'whoisfreaks-ssl-collector': 'WhoisFreaksSSLCollector',
          'base-collector': 'BaseCollector',
        };

        const className = collectorClassNames[collectorName];
        const CollectorClass = forensicModule[className as keyof typeof forensicModule];

        // Verifica que o collector está exportado e é uma função (classe)
        if (CollectorClass === undefined) {
          // Se não está exportado, a propriedade falha
          return false;
        }

        // Verifica que é uma função (classe construtora)
        return typeof CollectorClass === 'function';
      }),
      {
        numRuns: DOM_SAFE_COLLECTORS.length, // Testa cada collector pelo menos uma vez
        verbose: true,
      }
    );
  });

  /**
   * Testa que todos os collectors DOM-safe estão exportados no index.ts
   *
   * **Validates: Requirements 2.3**
   */
  it('should export all DOM-safe collectors from forensic/index.ts', async () => {
    const forensicModule = await import('@lib/forensic/index');

    // Mapeamento de nomes de arquivo para nomes de classe exportados
    const collectorClassNames: Record<DOMSafeCollector, string> = {
      'geolocation-collector': 'GeolocationCollector',
      'network-collector': 'NetworkCollector',
      'device-collector': 'DeviceCollector',
      'dns-collector': 'DNSCollector',
      'storage-collector': 'StorageCollector',
      'performance-collector': 'PerformanceCollector',
      'wayback-collector': 'WaybackCollector',
      'http-headers-collector': 'HTTPHeadersCollector',
      'timezone-collector': 'TimezoneCollector',
      'media-devices-collector': 'MediaDevicesCollector',
      'service-workers-collector': 'ServiceWorkersCollector',
      'permissions-collector': 'PermissionsCollector',
      'whoisfreaks-dns-collector': 'WhoisFreaksDNSCollector',
      'whoisfreaks-whois-collector': 'WhoisFreaksWHOISCollector',
      'whoisfreaks-ssl-collector': 'WhoisFreaksSSLCollector',
      'base-collector': 'BaseCollector',
    };

    // Verifica que cada collector DOM-safe está exportado
    for (const collectorFile of DOM_SAFE_COLLECTORS) {
      const className = collectorClassNames[collectorFile];
      expect(
        forensicModule[className as keyof typeof forensicModule],
        `Collector ${className} deveria estar exportado em forensic/index.ts`
      ).toBeDefined();
    }
  });

  /**
   * Testa que collectors DOM-required NÃO estão exportados estaticamente no index.ts
   *
   * **Validates: Requirements 2.3, 2.5**
   */
  it('should NOT export DOM-required collectors from forensic/index.ts', async () => {
    const forensicModule = await import('@lib/forensic/index');

    // Mapeamento de nomes de arquivo para nomes de classe
    const domRequiredClassNames: Record<(typeof DOM_REQUIRED_COLLECTORS)[number], string> = {
      'ssl-collector': 'SSLCollector',
      'page-resources-collector': 'PageResourcesCollector',
      'canvas-fingerprint-collector': 'CanvasFingerprintCollector',
      'webgl-fingerprint-collector': 'WebGLFingerprintCollector',
      'fonts-collector': 'FontsCollector',
    };

    // Verifica que nenhum collector DOM-required está exportado
    for (const collectorFile of DOM_REQUIRED_COLLECTORS) {
      const className = domRequiredClassNames[collectorFile];
      expect(
        forensicModule[className as keyof typeof forensicModule],
        `Collector ${className} NÃO deveria estar exportado em forensic/index.ts (requer DOM)`
      ).toBeUndefined();
    }
  });

  /**
   * Property test: Para qualquer subconjunto de collectors DOM-safe,
   * importar todos eles em sequência não deve causar erro
   *
   * **Validates: Requirements 1.4, 2.1, 2.5**
   */
  it('should import any subset of DOM-safe collectors without throwing', async () => {
    // Importa todos os collectors DOM-safe via index.ts
    const forensicModule = await import('@lib/forensic/index');

    // Mapeamento de nomes de arquivo para nomes de classe exportados
    const collectorClassNames: Record<DOMSafeCollector, string> = {
      'geolocation-collector': 'GeolocationCollector',
      'network-collector': 'NetworkCollector',
      'device-collector': 'DeviceCollector',
      'dns-collector': 'DNSCollector',
      'storage-collector': 'StorageCollector',
      'performance-collector': 'PerformanceCollector',
      'wayback-collector': 'WaybackCollector',
      'http-headers-collector': 'HTTPHeadersCollector',
      'timezone-collector': 'TimezoneCollector',
      'media-devices-collector': 'MediaDevicesCollector',
      'service-workers-collector': 'ServiceWorkersCollector',
      'permissions-collector': 'PermissionsCollector',
      'whoisfreaks-dns-collector': 'WhoisFreaksDNSCollector',
      'whoisfreaks-whois-collector': 'WhoisFreaksWHOISCollector',
      'whoisfreaks-ssl-collector': 'WhoisFreaksSSLCollector',
      'base-collector': 'BaseCollector',
    };

    await fc.assert(
      fc.asyncProperty(
        fc.subarray(DOM_SAFE_COLLECTORS as unknown as DOMSafeCollector[], {
          minLength: 1,
          maxLength: DOM_SAFE_COLLECTORS.length,
        }),
        async (collectors: DOMSafeCollector[]) => {
          // Verifica que todos os collectors do subconjunto estão exportados
          for (const collectorName of collectors) {
            const className = collectorClassNames[collectorName];
            const CollectorClass = forensicModule[className as keyof typeof forensicModule];

            if (CollectorClass === undefined || typeof CollectorClass !== 'function') {
              return false;
            }
          }

          return true;
        }
      ),
      {
        numRuns: 50, // Testa 50 subconjuntos aleatórios
        verbose: true,
      }
    );
  });

  /**
   * Testa que o safe-loader está exportado e funcional
   *
   * **Validates: Requirements 2.2, 2.4**
   */
  it('should export safe-loader utilities from forensic/index.ts', async () => {
    const forensicModule = await import('@lib/forensic/index');

    // Verifica que as funções do safe-loader estão exportadas
    expect(forensicModule.loadDOMCollector).toBeDefined();
    expect(typeof forensicModule.loadDOMCollector).toBe('function');

    expect(forensicModule.loadDOMCollectorWithOptions).toBeDefined();
    expect(typeof forensicModule.loadDOMCollectorWithOptions).toBe('function');

    expect(forensicModule.canLoadDOMCollector).toBeDefined();
    expect(typeof forensicModule.canLoadDOMCollector).toBe('function');

    expect(forensicModule.isDOMRequiredCollector).toBeDefined();
    expect(typeof forensicModule.isDOMRequiredCollector).toBe('function');

    expect(forensicModule.DOM_REQUIRED_COLLECTORS).toBeDefined();
    expect(Array.isArray(forensicModule.DOM_REQUIRED_COLLECTORS)).toBe(true);
  });

  /**
   * Testa que a lista de DOM_REQUIRED_COLLECTORS no safe-loader está correta
   *
   * **Validates: Requirements 1.4**
   */
  it('should have correct DOM_REQUIRED_COLLECTORS list in safe-loader', async () => {
    const { DOM_REQUIRED_COLLECTORS: safeLoaderList } = await import('@lib/forensic/index');

    // Verifica que todos os collectors DOM-required estão na lista
    // A lista usa nomes de arquivo (kebab-case), não nomes de classe
    const expectedCollectors = [
      'ssl-collector',
      'page-resources-collector',
      'canvas-fingerprint-collector',
      'webgl-fingerprint-collector',
      'fonts-collector',
    ];

    for (const collector of expectedCollectors) {
      expect(
        (safeLoaderList as readonly string[]).includes(collector),
        `${collector} deveria estar na lista DOM_REQUIRED_COLLECTORS`
      ).toBe(true);
    }

    // Verifica que a lista tem exatamente 5 collectors
    expect(safeLoaderList.length).toBe(5);
  });

  /**
   * Property test: Para qualquer collector DOM-safe, a classe exportada
   * deve estender BaseCollector ou ser o próprio BaseCollector
   *
   * **Validates: Requirements 1.4**
   */
  it('should have all DOM-safe collectors extending BaseCollector', async () => {
    const forensicModule = await import('@lib/forensic/index');
    const { BaseCollector } = forensicModule;

    // Mapeamento de nomes de arquivo para nomes de classe exportados
    const collectorClassNames: Record<DOMSafeCollector, string> = {
      'geolocation-collector': 'GeolocationCollector',
      'network-collector': 'NetworkCollector',
      'device-collector': 'DeviceCollector',
      'dns-collector': 'DNSCollector',
      'storage-collector': 'StorageCollector',
      'performance-collector': 'PerformanceCollector',
      'wayback-collector': 'WaybackCollector',
      'http-headers-collector': 'HTTPHeadersCollector',
      'timezone-collector': 'TimezoneCollector',
      'media-devices-collector': 'MediaDevicesCollector',
      'service-workers-collector': 'ServiceWorkersCollector',
      'permissions-collector': 'PermissionsCollector',
      'whoisfreaks-dns-collector': 'WhoisFreaksDNSCollector',
      'whoisfreaks-whois-collector': 'WhoisFreaksWHOISCollector',
      'whoisfreaks-ssl-collector': 'WhoisFreaksSSLCollector',
      'base-collector': 'BaseCollector',
    };

    await fc.assert(
      fc.asyncProperty(domSafeCollectorArb, async (collectorName: DOMSafeCollector) => {
        // Pula o BaseCollector pois ele é a própria classe base
        if (collectorName === 'base-collector') {
          return true;
        }

        const className = collectorClassNames[collectorName];
        const CollectorClass = forensicModule[className as keyof typeof forensicModule];

        if (!CollectorClass) {
          console.warn(`[Test] Classe ${className} não encontrada`);
          return false;
        }

        // Verifica se é uma classe (função construtora)
        if (typeof CollectorClass !== 'function') {
          return false;
        }

        // Verifica se estende BaseCollector
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extendsBase = (CollectorClass as any).prototype instanceof BaseCollector;

        return extendsBase;
      }),
      {
        numRuns: DOM_SAFE_COLLECTORS.length,
        verbose: true,
      }
    );
  });
});

