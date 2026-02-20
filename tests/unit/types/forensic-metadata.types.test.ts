/**
 * Testes unitários para tipos de metadados forenses v3.0.0
 *
 * Valida a criação e estrutura das novas interfaces:
 * - ForensicGeolocation (3 níveis)
 * - ForensicConsentConfig
 * - ForensicMetadataV3
 *
 * @requirements 4.3, 11.1, 11.3, 11.4
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONSENT_CONFIG,
  createEmptyForensicGeolocation,
  createForensicConsentInfo,
  isForensicMetadataV3,
  isForensicMetadataLegacy,
  type ForensicGeolocation,
  type ForensicConsentConfig,
  type ForensicMetadataV3,
  type ForensicMetadataLegacy,
  type CloudFrontGeolocation,
  type BrowserGeolocation,
  type EnrichedGeolocation,
} from '../../../src/types/forensic-metadata.types';

describe('ForensicGeolocation (3 níveis)', () => {
  describe('Criação com diferentes níveis', () => {
    it('deve criar ForensicGeolocation apenas com CloudFront (Nível 1)', () => {
      const cloudfront: CloudFrontGeolocation = {
        country: 'BR',
        countryName: 'Brazil',
        region: 'SP',
        regionName: 'São Paulo',
        city: 'São Paulo',
        latitude: -23.5505,
        longitude: -46.6333,
        timezone: 'America/Sao_Paulo',
        accuracy: 'city',
      };

      const geolocation: ForensicGeolocation = {
        cloudfront,
        sources: ['cloudfront'],
        consentGranted: false,
        collectionTimestamp: new Date().toISOString(),
      };

      expect(geolocation.cloudfront).toBeDefined();
      expect(geolocation.browser).toBeUndefined();
      expect(geolocation.enriched).toBeUndefined();
      expect(geolocation.sources).toEqual(['cloudfront']);
      expect(geolocation.consentGranted).toBe(false);
    });

    it('deve criar ForensicGeolocation com CloudFront + Browser (Níveis 1 e 2)', () => {
      const cloudfront: CloudFrontGeolocation = {
        country: 'BR',
        accuracy: 'city',
      };

      const browser: BrowserGeolocation = {
        latitude: -23.5505199,
        longitude: -46.6333094,
        accuracy: 10,
        altitude: 760,
        timestamp: Date.now(),
        source: 'gps',
      };

      const geolocation: ForensicGeolocation = {
        cloudfront,
        browser,
        sources: ['cloudfront', 'browser'],
        consentGranted: true,
        collectionTimestamp: new Date().toISOString(),
      };

      expect(geolocation.cloudfront).toBeDefined();
      expect(geolocation.browser).toBeDefined();
      expect(geolocation.browser?.source).toBe('gps');
      expect(geolocation.enriched).toBeUndefined();
      expect(geolocation.sources).toContain('browser');
      expect(geolocation.consentGranted).toBe(true);
    });

    it('deve criar ForensicGeolocation completo com todos os 3 níveis', () => {
      const cloudfront: CloudFrontGeolocation = {
        country: 'BR',
        countryName: 'Brazil',
        city: 'São Paulo',
        accuracy: 'city',
      };

      const browser: BrowserGeolocation = {
        latitude: -23.5505199,
        longitude: -46.6333094,
        accuracy: 5,
        timestamp: Date.now(),
        source: 'gps',
      };

      const enriched: EnrichedGeolocation = {
        address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01310-100',
        country: 'Brazil',
        timezone: 'America/Sao_Paulo',
        pricingBucket: 'standard',
      };

      const geolocation: ForensicGeolocation = {
        cloudfront,
        browser,
        enriched,
        sources: ['cloudfront', 'browser', 'location-service'],
        consentGranted: true,
        collectionTimestamp: new Date().toISOString(),
      };

      expect(geolocation.cloudfront).toBeDefined();
      expect(geolocation.browser).toBeDefined();
      expect(geolocation.enriched).toBeDefined();
      expect(geolocation.sources).toHaveLength(3);
      expect(geolocation.enriched?.address).toContain('Av. Paulista');
    });

    it('deve criar ForensicGeolocation vazio com createEmptyForensicGeolocation', () => {
      const geolocation = createEmptyForensicGeolocation(false);

      expect(geolocation.cloudfront).toBeUndefined();
      expect(geolocation.browser).toBeUndefined();
      expect(geolocation.enriched).toBeUndefined();
      expect(geolocation.sources).toEqual([]);
      expect(geolocation.consentGranted).toBe(false);
      expect(geolocation.collectionTimestamp).toBeDefined();
    });

    it('deve criar ForensicGeolocation vazio com consentimento', () => {
      const geolocation = createEmptyForensicGeolocation(true);

      expect(geolocation.consentGranted).toBe(true);
    });
  });

  describe('Validação de campos obrigatórios', () => {
    it('deve ter sources como array', () => {
      const geolocation: ForensicGeolocation = {
        sources: [],
        consentGranted: false,
        collectionTimestamp: new Date().toISOString(),
      };

      expect(Array.isArray(geolocation.sources)).toBe(true);
    });

    it('deve ter collectionTimestamp em formato ISO 8601', () => {
      const timestamp = new Date().toISOString();
      const geolocation: ForensicGeolocation = {
        sources: [],
        consentGranted: false,
        collectionTimestamp: timestamp,
      };

      // Verifica formato ISO 8601
      expect(geolocation.collectionTimestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
    });
  });
});

describe('ForensicConsentConfig', () => {
  describe('DEFAULT_CONSENT_CONFIG', () => {
    it('deve ter campos sempre coletados como true', () => {
      expect(DEFAULT_CONSENT_CONFIG.collectBasicMetadata).toBe(true);
      expect(DEFAULT_CONSENT_CONFIG.collectCloudFrontGeo).toBe(true);
      expect(DEFAULT_CONSENT_CONFIG.collectNetworkInfo).toBe(true);
      expect(DEFAULT_CONSENT_CONFIG.collectDeviceBasic).toBe(true);
    });

    it('deve ter campos opcionais como false por padrão', () => {
      expect(DEFAULT_CONSENT_CONFIG.collectBrowserGeolocation).toBe(false);
      expect(DEFAULT_CONSENT_CONFIG.collectCanvasFingerprint).toBe(false);
      expect(DEFAULT_CONSENT_CONFIG.collectWebGLFingerprint).toBe(false);
      expect(DEFAULT_CONSENT_CONFIG.collectFontsFingerprint).toBe(false);
    });

    it('deve ter exatamente 8 campos', () => {
      const keys = Object.keys(DEFAULT_CONSENT_CONFIG);
      expect(keys).toHaveLength(8);
    });
  });

  describe('Criação de configuração customizada', () => {
    it('deve permitir habilitar todos os campos opcionais', () => {
      const config: ForensicConsentConfig = {
        collectBasicMetadata: true,
        collectCloudFrontGeo: true,
        collectNetworkInfo: true,
        collectDeviceBasic: true,
        collectBrowserGeolocation: true,
        collectCanvasFingerprint: true,
        collectWebGLFingerprint: true,
        collectFontsFingerprint: true,
      };

      expect(config.collectBrowserGeolocation).toBe(true);
      expect(config.collectCanvasFingerprint).toBe(true);
      expect(config.collectWebGLFingerprint).toBe(true);
      expect(config.collectFontsFingerprint).toBe(true);
    });

    it('deve permitir configuração parcial de opcionais', () => {
      const config: ForensicConsentConfig = {
        ...DEFAULT_CONSENT_CONFIG,
        collectBrowserGeolocation: true,
        collectCanvasFingerprint: true,
      };

      expect(config.collectBrowserGeolocation).toBe(true);
      expect(config.collectCanvasFingerprint).toBe(true);
      expect(config.collectWebGLFingerprint).toBe(false);
      expect(config.collectFontsFingerprint).toBe(false);
    });
  });

  describe('createForensicConsentInfo', () => {
    it('deve criar ForensicConsentInfo com config padrão', () => {
      const consentInfo = createForensicConsentInfo();

      expect(consentInfo.config).toEqual(DEFAULT_CONSENT_CONFIG);
      expect(consentInfo.timestamp).toBeDefined();
      expect(consentInfo.version).toBe('1.0');
    });

    it('deve criar ForensicConsentInfo com config customizada', () => {
      const customConfig: ForensicConsentConfig = {
        ...DEFAULT_CONSENT_CONFIG,
        collectBrowserGeolocation: true,
      };

      const consentInfo = createForensicConsentInfo(customConfig);

      expect(consentInfo.config.collectBrowserGeolocation).toBe(true);
      expect(consentInfo.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
    });
  });
});

describe('ForensicMetadata Type Guards', () => {
  const createV3Metadata = (): ForensicMetadataV3 => ({
    schemaVersion: '3.0.0',
    captureId: 'test-123',
    collectionTimestamp: new Date().toISOString(),
    collectionDurationMs: 1000,
    url: 'https://example.com',
    title: 'Test Page',
    userAgent: 'Test UA',
    extensionVersion: '1.0.0',
    viewport: { width: 1920, height: 1080 },
    pageSize: { width: 1920, height: 3000 },
    viewportsCaptured: 3,
    geolocation: createEmptyForensicGeolocation(false),
    hashes: {},
    consent: createForensicConsentInfo(),
  });

  const createLegacyMetadata = (): ForensicMetadataLegacy => ({
    schemaVersion: '2.0.0',
    captureId: 'test-123',
    collectionTimestamp: new Date().toISOString(),
    collectionDurationMs: 1000,
    url: 'https://example.com',
    title: 'Test Page',
    userAgent: 'Test UA',
    extensionVersion: '1.0.0',
    viewport: { width: 1920, height: 1080 },
    pageSize: { width: 1920, height: 3000 },
    viewportsCaptured: 3,
    hashes: {},
  });

  describe('isForensicMetadataV3', () => {
    it('deve retornar true para metadados v3.0.0', () => {
      const metadata = createV3Metadata();
      expect(isForensicMetadataV3(metadata)).toBe(true);
    });

    it('deve retornar false para metadados legado', () => {
      const metadata = createLegacyMetadata();
      expect(isForensicMetadataV3(metadata)).toBe(false);
    });
  });

  describe('isForensicMetadataLegacy', () => {
    it('deve retornar true para metadados legado', () => {
      const metadata = createLegacyMetadata();
      expect(isForensicMetadataLegacy(metadata)).toBe(true);
    });

    it('deve retornar false para metadados v3.0.0', () => {
      const metadata = createV3Metadata();
      expect(isForensicMetadataLegacy(metadata)).toBe(false);
    });
  });
});

describe('ForensicMetadataV3 Structure', () => {
  it('deve ter schemaVersion como literal "3.0.0"', () => {
    const metadata: ForensicMetadataV3 = {
      schemaVersion: '3.0.0',
      captureId: 'test',
      collectionTimestamp: new Date().toISOString(),
      collectionDurationMs: 100,
      url: 'https://example.com',
      title: 'Test',
      userAgent: 'Test',
      extensionVersion: '1.0.0',
      viewport: { width: 1920, height: 1080 },
      pageSize: { width: 1920, height: 1080 },
      viewportsCaptured: 1,
      geolocation: createEmptyForensicGeolocation(false),
      hashes: {},
      consent: createForensicConsentInfo(),
    };

    expect(metadata.schemaVersion).toBe('3.0.0');
  });

  it('deve ter geolocation como campo obrigatório', () => {
    const metadata: ForensicMetadataV3 = {
      schemaVersion: '3.0.0',
      captureId: 'test',
      collectionTimestamp: new Date().toISOString(),
      collectionDurationMs: 100,
      url: 'https://example.com',
      title: 'Test',
      userAgent: 'Test',
      extensionVersion: '1.0.0',
      viewport: { width: 1920, height: 1080 },
      pageSize: { width: 1920, height: 1080 },
      viewportsCaptured: 1,
      geolocation: {
        cloudfront: {
          country: 'BR',
          accuracy: 'country',
        },
        sources: ['cloudfront'],
        consentGranted: false,
        collectionTimestamp: new Date().toISOString(),
      },
      hashes: {},
      consent: createForensicConsentInfo(),
    };

    expect(metadata.geolocation).toBeDefined();
    expect(metadata.geolocation.sources).toContain('cloudfront');
  });

  it('deve ter consent como campo obrigatório', () => {
    const metadata: ForensicMetadataV3 = {
      schemaVersion: '3.0.0',
      captureId: 'test',
      collectionTimestamp: new Date().toISOString(),
      collectionDurationMs: 100,
      url: 'https://example.com',
      title: 'Test',
      userAgent: 'Test',
      extensionVersion: '1.0.0',
      viewport: { width: 1920, height: 1080 },
      pageSize: { width: 1920, height: 1080 },
      viewportsCaptured: 1,
      geolocation: createEmptyForensicGeolocation(false),
      hashes: {},
      consent: {
        config: DEFAULT_CONSENT_CONFIG,
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };

    expect(metadata.consent).toBeDefined();
    expect(metadata.consent.config).toEqual(DEFAULT_CONSENT_CONFIG);
    expect(metadata.consent.version).toBe('1.0');
  });

  it('deve suportar fingerprints agrupados', () => {
    const metadata: ForensicMetadataV3 = {
      schemaVersion: '3.0.0',
      captureId: 'test',
      collectionTimestamp: new Date().toISOString(),
      collectionDurationMs: 100,
      url: 'https://example.com',
      title: 'Test',
      userAgent: 'Test',
      extensionVersion: '1.0.0',
      viewport: { width: 1920, height: 1080 },
      pageSize: { width: 1920, height: 1080 },
      viewportsCaptured: 1,
      geolocation: createEmptyForensicGeolocation(true),
      fingerprints: {
        canvas: {
          available: true,
          hash: 'abc123',
          width: 200,
          height: 50,
        },
        webgl: {
          available: true,
          hash: 'def456',
          version: 'WebGL 2.0',
        },
        fonts: {
          available: true,
          installedFonts: ['Arial', 'Helvetica'],
          totalTested: 100,
          installedCount: 2,
        },
      },
      hashes: {},
      consent: createForensicConsentInfo({
        ...DEFAULT_CONSENT_CONFIG,
        collectCanvasFingerprint: true,
        collectWebGLFingerprint: true,
        collectFontsFingerprint: true,
      }),
    };

    expect(metadata.fingerprints).toBeDefined();
    expect(metadata.fingerprints?.canvas?.hash).toBe('abc123');
    expect(metadata.fingerprints?.webgl?.version).toBe('WebGL 2.0');
    expect(metadata.fingerprints?.fonts?.installedFonts).toContain('Arial');
  });
});
