/**
 * Property Tests: ForensicCollector Consent Integration
 *
 * **Property 5: Consent Configuration Controls Collector Execution**
 * **Validates: Requirements 4.4, 4.5, 12.3, 12.4, 12.5, 12.6**
 *
 * **Property 8: ForensicMetadata Includes Consent**
 * **Validates: Requirements 12.7**
 *
 * Para qualquer configuração de consentimento:
 * - Coletores opcionais SÓ executam se consentimento foi dado
 * - Metadata SEMPRE inclui informações de consentimento
 * - Campos sempre coletados NÃO são afetados pelo consentimento
 *
 * @module PropertyTest/ForensicCollectorConsent
 */

import fc from 'fast-check';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ForensicCollector,
  type ForensicCollectParams,
} from '../../../../src/lib/forensic/forensic-collector';
import { AuditLogger } from '../../../../src/lib/audit-logger';
import {
  type ForensicConsentConfig,
  DEFAULT_CONSENT_CONFIG,
} from '../../../../src/types/forensic-metadata.types';

// ============================================================================
// Mocks
// ============================================================================

// Mock dos coletores para rastrear execução
const mockCollectorResults = {
  geolocation: { success: true, data: { latitude: -23.5, longitude: -46.6, accuracy: 100, timestamp: Date.now(), source: 'network' as const } },
  network: { success: true, data: { connectionType: 'wifi' as const } },
  device: { success: true, data: { platform: 'MacIntel', hardwareConcurrency: 8, screenResolution: '1920x1080', colorDepth: 24, devicePixelRatio: 2, timezone: 'America/Sao_Paulo', timezoneOffset: 180, language: 'pt-BR', languages: ['pt-BR'], touchSupport: false, maxTouchPoints: 0, onLine: true, vendor: 'Google Inc.', browserVersion: '120.0', browserName: 'Chrome', cookieEnabled: true } },
  canvas: { success: true, data: { available: true, hash: 'abc123' } },
  webgl: { success: true, data: { available: true, hash: 'def456', version: 'WebGL 2.0' } },
  fonts: { success: true, data: { available: true, installedFonts: ['Arial', 'Helvetica'], totalTested: 100 } },
};

// Rastreadores de execução
let geolocationCollectorCalled = false;
let canvasCollectorCalled = false;
let webglCollectorCalled = false;
let fontsCollectorCalled = false;

// Mock do GeolocationCollector
vi.mock('../../../../src/lib/forensic/collectors/geolocation-collector', () => ({
  GeolocationCollector: class {
    async collect() {
      geolocationCollectorCalled = true;
      return mockCollectorResults.geolocation;
    }
  },
}));

// Mock do CanvasFingerprintCollector
vi.mock('../../../../src/lib/forensic/collectors/canvas-fingerprint-collector', () => ({
  CanvasFingerprintCollector: class {
    async collect() {
      canvasCollectorCalled = true;
      return mockCollectorResults.canvas;
    }
  },
}));

// Mock do WebGLFingerprintCollector
vi.mock('../../../../src/lib/forensic/collectors/webgl-fingerprint-collector', () => ({
  WebGLFingerprintCollector: class {
    async collect() {
      webglCollectorCalled = true;
      return mockCollectorResults.webgl;
    }
  },
}));

// Mock do FontsCollector
vi.mock('../../../../src/lib/forensic/collectors/fonts-collector', () => ({
  FontsCollector: class {
    async collect() {
      fontsCollectorCalled = true;
      return mockCollectorResults.fonts;
    }
  },
}));

// Mock dos outros coletores (sempre retornam sucesso)
vi.mock('../../../../src/lib/forensic/collectors/network-collector', () => ({
  NetworkCollector: class {
    async collect() {
      return mockCollectorResults.network;
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/device-collector', () => ({
  DeviceCollector: class {
    async collect() {
      return mockCollectorResults.device;
    }
  },
}));

// Mock dos coletores que não precisamos rastrear
vi.mock('../../../../src/lib/forensic/collectors/dns-collector', () => ({
  DNSCollector: class {
    async collect() {
      return { success: true, data: { domain: 'example.com', queryTimestamp: new Date().toISOString() } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/ssl-collector', () => ({
  SSLCollector: class {
    async collect() {
      return { success: true, data: { isSecure: true } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/storage-collector', () => ({
  StorageCollector: class {
    async collect() {
      return { success: true, data: { localStorageKeys: [], localStorageSize: 0, sessionStorageKeys: [], sessionStorageSize: 0, indexedDBAvailable: true } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/page-resources-collector', () => ({
  PageResourcesCollector: class {
    async collect() {
      return { success: true, data: { scriptsCount: 0, stylesheetsCount: 0, imagesCount: 0, fontsCount: 0, mediaCount: 0, totalSizeBytes: 0, thirdPartyCount: 0 } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/performance-collector', () => ({
  PerformanceCollector: class {
    async collect() {
      return { success: true, data: {} };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/wayback-collector', () => ({
  WaybackCollector: class {
    async collect() {
      return { success: true, data: { url: 'https://example.com', archived: false, queryTimestamp: new Date().toISOString() } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/http-headers-collector', () => ({
  HTTPHeadersCollector: class {
    async collect() {
      return { success: true, data: {} };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/timezone-collector', () => ({
  TimezoneCollector: class {
    async collect() {
      return { success: true, data: { sources: [], consistent: true } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/media-devices-collector', () => ({
  MediaDevicesCollector: class {
    async collect() {
      return { success: true, data: { available: true, devices: [], audioInputCount: 0, audioOutputCount: 0, videoInputCount: 0 } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/service-workers-collector', () => ({
  ServiceWorkersCollector: class {
    async collect() {
      return { success: true, data: { available: true, workers: [] } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/permissions-collector', () => ({
  PermissionsCollector: class {
    async collect() {
      return { success: true, data: { available: true, permissions: [] } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/whoisfreaks-dns-collector', () => ({
  WhoisFreaksDNSCollector: class {
    async collect() {
      return { success: true, data: { domain: 'example.com', queryTimestamp: new Date().toISOString() } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/whoisfreaks-whois-collector', () => ({
  WhoisFreaksWHOISCollector: class {
    async collect() {
      return { success: true, data: { domain: 'example.com' } };
    }
  },
}));

vi.mock('../../../../src/lib/forensic/collectors/whoisfreaks-ssl-collector', () => ({
  WhoisFreaksSSLCollector: class {
    async collect() {
      return { success: true, data: { isSecure: true } };
    }
  },
}));

// Mock do context-utils
vi.mock('../../../../src/lib/context-utils', () => ({
  hasDOMAccess: () => true,
  detectExecutionContext: () => 'content-script',
}));

// Mock do chrome runtime
vi.stubGlobal('chrome', {
  runtime: {
    getManifest: () => ({ version: '1.0.0' }),
  },
});

// Mock do navigator
vi.stubGlobal('navigator', {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
});

// ============================================================================
// Arbitraries
// ============================================================================

/**
 * Arbitrary para ForensicConsentConfig
 * Gera configurações de consentimento aleatórias
 */
const consentConfigArb = fc.record({
  collectBasicMetadata: fc.constant(true as const),
  collectCloudFrontGeo: fc.constant(true as const),
  collectNetworkInfo: fc.constant(true as const),
  collectDeviceBasic: fc.constant(true as const),
  collectBrowserGeolocation: fc.boolean(),
  collectCanvasFingerprint: fc.boolean(),
  collectWebGLFingerprint: fc.boolean(),
  collectFontsFingerprint: fc.boolean(),
}) as fc.Arbitrary<ForensicConsentConfig>;

/**
 * Arbitrary para parâmetros de coleta
 */
const collectParamsArb: fc.Arbitrary<ForensicCollectParams> = fc
  .record({
    captureId: fc.uuid(),
    url: fc.webUrl(),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    viewport: fc.record({
      width: fc.integer({ min: 320, max: 3840 }),
      height: fc.integer({ min: 240, max: 2160 }),
    }),
    pageSize: fc.record({
      width: fc.integer({ min: 320, max: 10000 }),
      height: fc.integer({ min: 240, max: 50000 }),
    }),
    viewportsCaptured: fc.integer({ min: 1, max: 20 }),
    hasImageHash: fc.boolean(),
    hasHtmlHash: fc.boolean(),
    imageHashValue: fc.stringMatching(/^[0-9a-f]{64}$/),
    htmlHashValue: fc.stringMatching(/^[0-9a-f]{64}$/),
  })
  .map(({ hasImageHash, hasHtmlHash, imageHashValue, htmlHashValue, ...rest }) => ({
    ...rest,
    ...(hasImageHash && { imageHash: imageHashValue }),
    ...(hasHtmlHash && { htmlHash: htmlHashValue }),
  }));

// ============================================================================
// Helpers
// ============================================================================

/**
 * Cria um AuditLogger mockado
 */
function createMockLogger(): AuditLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startTimer: vi.fn(() => vi.fn(() => 100)),
    withContext: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      startTimer: vi.fn(() => vi.fn(() => 100)),
    })),
  } as unknown as AuditLogger;
}

/**
 * Reseta os rastreadores de execução
 */
function resetTrackers(): void {
  geolocationCollectorCalled = false;
  canvasCollectorCalled = false;
  webglCollectorCalled = false;
  fontsCollectorCalled = false;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 5: Consent Configuration Controls Collector Execution', () => {
  beforeEach(() => {
    resetTrackers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('coletores opcionais SÓ executam quando consentimento é true', async () => {
    await fc.assert(
      fc.asyncProperty(
        consentConfigArb,
        collectParamsArb,
        async (consentConfig, params) => {
          resetTrackers();
          const logger = createMockLogger();
          const collector = new ForensicCollector(logger, undefined, consentConfig);

          await collector.collect(params);

          // Verifica que geolocation só foi chamado se consentimento foi dado
          expect(geolocationCollectorCalled).toBe(consentConfig.collectBrowserGeolocation);

          // Verifica que canvas só foi chamado se consentimento foi dado
          expect(canvasCollectorCalled).toBe(consentConfig.collectCanvasFingerprint);

          // Verifica que webgl só foi chamado se consentimento foi dado
          expect(webglCollectorCalled).toBe(consentConfig.collectWebGLFingerprint);

          // Verifica que fonts só foi chamado se consentimento foi dado
          expect(fontsCollectorCalled).toBe(consentConfig.collectFontsFingerprint);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('DEFAULT_CONSENT_CONFIG não executa coletores opcionais', async () => {
    await fc.assert(
      fc.asyncProperty(collectParamsArb, async (params) => {
        resetTrackers();
        const logger = createMockLogger();
        const collector = new ForensicCollector(logger, undefined, DEFAULT_CONSENT_CONFIG);

        await collector.collect(params);

        // Com config padrão, nenhum coletor opcional deve executar
        expect(geolocationCollectorCalled).toBe(false);
        expect(canvasCollectorCalled).toBe(false);
        expect(webglCollectorCalled).toBe(false);
        expect(fontsCollectorCalled).toBe(false);
      }),
      { numRuns: 10 }
    );
  });

  it('consentimento total executa todos os coletores opcionais', async () => {
    await fc.assert(
      fc.asyncProperty(collectParamsArb, async (params) => {
        resetTrackers();
        const logger = createMockLogger();
        const fullConsent: ForensicConsentConfig = {
          ...DEFAULT_CONSENT_CONFIG,
          collectBrowserGeolocation: true,
          collectCanvasFingerprint: true,
          collectWebGLFingerprint: true,
          collectFontsFingerprint: true,
        };
        const collector = new ForensicCollector(logger, undefined, fullConsent);

        await collector.collect(params);

        // Com consentimento total, todos os coletores opcionais devem executar
        expect(geolocationCollectorCalled).toBe(true);
        expect(canvasCollectorCalled).toBe(true);
        expect(webglCollectorCalled).toBe(true);
        expect(fontsCollectorCalled).toBe(true);
      }),
      { numRuns: 10 }
    );
  });
});

describe('Property 8: ForensicMetadata Includes Consent', () => {
  beforeEach(() => {
    resetTrackers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('metadata SEMPRE inclui campo consent com config, timestamp e version', async () => {
    await fc.assert(
      fc.asyncProperty(
        consentConfigArb,
        collectParamsArb,
        async (consentConfig, params) => {
          resetTrackers();
          const logger = createMockLogger();
          const collector = new ForensicCollector(logger, undefined, consentConfig);

          const metadata = await collector.collect(params);

          // Verifica que consent existe
          expect(metadata.consent).toBeDefined();

          // Verifica estrutura do consent
          expect(metadata.consent.config).toBeDefined();
          expect(metadata.consent.timestamp).toBeDefined();
          expect(metadata.consent.version).toBeDefined();

          // Verifica que config no consent corresponde ao fornecido
          expect(metadata.consent.config.collectBrowserGeolocation).toBe(
            consentConfig.collectBrowserGeolocation
          );
          expect(metadata.consent.config.collectCanvasFingerprint).toBe(
            consentConfig.collectCanvasFingerprint
          );
          expect(metadata.consent.config.collectWebGLFingerprint).toBe(
            consentConfig.collectWebGLFingerprint
          );
          expect(metadata.consent.config.collectFontsFingerprint).toBe(
            consentConfig.collectFontsFingerprint
          );

          // Verifica que timestamp é ISO 8601 válido
          expect(() => new Date(metadata.consent.timestamp)).not.toThrow();
          expect(new Date(metadata.consent.timestamp).toISOString()).toBe(
            metadata.consent.timestamp
          );

          // Verifica que version é string não vazia
          expect(typeof metadata.consent.version).toBe('string');
          expect(metadata.consent.version.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('metadata inclui dados de fingerprints apenas quando consentimento foi dado', async () => {
    await fc.assert(
      fc.asyncProperty(
        consentConfigArb,
        collectParamsArb,
        async (consentConfig, params) => {
          resetTrackers();
          const logger = createMockLogger();
          const collector = new ForensicCollector(logger, undefined, consentConfig);

          const metadata = await collector.collect(params);

          // Se consentimento para canvas foi dado, deve ter dados
          if (consentConfig.collectCanvasFingerprint) {
            expect(metadata.canvasFingerprint).toBeDefined();
          } else {
            expect(metadata.canvasFingerprint).toBeUndefined();
          }

          // Se consentimento para webgl foi dado, deve ter dados
          if (consentConfig.collectWebGLFingerprint) {
            expect(metadata.webglFingerprint).toBeDefined();
          } else {
            expect(metadata.webglFingerprint).toBeUndefined();
          }

          // Se consentimento para fonts foi dado, deve ter dados
          if (consentConfig.collectFontsFingerprint) {
            expect(metadata.fonts).toBeDefined();
          } else {
            expect(metadata.fonts).toBeUndefined();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('campos sempre coletados NÃO são afetados pelo consentimento', async () => {
    await fc.assert(
      fc.asyncProperty(
        consentConfigArb,
        collectParamsArb,
        async (consentConfig, params) => {
          resetTrackers();
          const logger = createMockLogger();
          const collector = new ForensicCollector(logger, undefined, consentConfig);

          const metadata = await collector.collect(params);

          // Campos básicos sempre presentes
          expect(metadata.schemaVersion).toBeDefined();
          expect(metadata.captureId).toBe(params.captureId);
          expect(metadata.url).toBe(params.url);
          expect(metadata.title).toBe(params.title);
          expect(metadata.userAgent).toBeDefined();
          expect(metadata.extensionVersion).toBeDefined();
          expect(metadata.viewport).toEqual(params.viewport);
          expect(metadata.pageSize).toEqual(params.pageSize);
          expect(metadata.viewportsCaptured).toBe(params.viewportsCaptured);
          expect(metadata.collectionTimestamp).toBeDefined();
          expect(metadata.collectionDurationMs).toBeGreaterThanOrEqual(0);

          // Network e device sempre coletados (não dependem de consentimento)
          expect(metadata.network).toBeDefined();
          expect(metadata.device).toBeDefined();
        }
      ),
      { numRuns: 30 }
    );
  });
});
