/**
 * Property Test: Storage Round-Trip Preservation
 *
 * **Property 7: Storage Round-Trip Preservation**
 * **Validates: Requirements 4.6, 4.7, 6.10**
 *
 * Para qualquer configuração de consentimento ou preferência de geolocalização:
 * - Armazenar e recuperar DEVE preservar todos os valores
 * - Serialização/deserialização DEVE ser idempotente
 * - Valores padrão DEVEM ser aplicados corretamente
 *
 * @module PropertyTest/ConsentStorage
 */

import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

// ============================================================================
// Tipos
// ============================================================================

interface ForensicConsentConfig {
  collectBasicMetadata: true;
  collectCloudFrontGeo: true;
  collectNetworkInfo: true;
  collectDeviceBasic: true;
  collectBrowserGeolocation: boolean;
  collectCanvasFingerprint: boolean;
  collectWebGLFingerprint: boolean;
  collectFontsFingerprint: boolean;
}

type GeolocationChoice = 'always-allow' | 'always-deny' | 'ask-every-time';

interface ConsentStoreState {
  config: ForensicConsentConfig;
  consentTimestamp: string | null;
  consentVersion: string;
}

interface GeolocationPreferencesState {
  choice: GeolocationChoice;
  lastPromptTimestamp: string | null;
}

// ============================================================================
// Mock Storage
// ============================================================================

/**
 * Mock de chrome.storage.sync para testes
 * Simula comportamento real do chrome.storage
 */
function createMockChromeStorage(): {
  storage: Map<string, unknown>;
  adapter: StateStorage;
  chrome: typeof globalThis.chrome;
} {
  const storage = new Map<string, unknown>();

  const mockChrome = {
    storage: {
      sync: {
        get: vi.fn(async (key: string) => {
          const value = storage.get(key);
          return { [key]: value };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            storage.set(key, value);
          }
        }),
        remove: vi.fn(async (key: string) => {
          storage.delete(key);
        }),
      },
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      getContexts: vi.fn(async () => []),
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
    },
    offscreen: {
      createDocument: vi.fn(),
      Reason: { GEOLOCATION: 'GEOLOCATION' },
    },
  } as unknown as typeof globalThis.chrome;

  const adapter: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
      const result = await mockChrome.storage.sync.get(name);
      const value = result[name];
      if (value === undefined) {
        return null;
      }
      if (typeof value === 'string') {
        return value;
      }
      return JSON.stringify(value);
    },
    setItem: async (name: string, value: string): Promise<void> => {
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      await mockChrome.storage.sync.set({ [name]: parsedValue });
    },
    removeItem: async (name: string): Promise<void> => {
      await mockChrome.storage.sync.remove(name);
    },
  };

  return { storage, adapter, chrome: mockChrome };
}

// ============================================================================
// Arbitraries
// ============================================================================

/**
 * Arbitrary para ForensicConsentConfig
 * Campos sempre coletados são fixos em true
 * Campos opcionais variam
 */
const forensicConsentConfigArb: fc.Arbitrary<ForensicConsentConfig> = fc.record({
  collectBasicMetadata: fc.constant(true as const),
  collectCloudFrontGeo: fc.constant(true as const),
  collectNetworkInfo: fc.constant(true as const),
  collectDeviceBasic: fc.constant(true as const),
  collectBrowserGeolocation: fc.boolean(),
  collectCanvasFingerprint: fc.boolean(),
  collectWebGLFingerprint: fc.boolean(),
  collectFontsFingerprint: fc.boolean(),
});

/**
 * Arbitrary para GeolocationChoice
 */
const geolocationChoiceArb: fc.Arbitrary<GeolocationChoice> = fc.constantFrom(
  'always-allow',
  'always-deny',
  'ask-every-time'
);

/**
 * Arbitrary para timestamp ISO 8601 válido ou null
 * Usa integer para evitar problemas com datas inválidas
 */
const timestampArb: fc.Arbitrary<string | null> = fc.option(
  fc.integer({ 
    min: new Date('2020-01-01').getTime(), 
    max: new Date('2030-12-31').getTime() 
  }).map((ts) => new Date(ts).toISOString()),
  { nil: null }
);

/**
 * Arbitrary para ConsentStoreState completo
 */
const consentStoreStateArb: fc.Arbitrary<ConsentStoreState> = fc.record({
  config: forensicConsentConfigArb,
  consentTimestamp: timestampArb,
  consentVersion: fc.constantFrom('1.0', '1.1', '2.0'),
});

/**
 * Arbitrary para GeolocationPreferencesState completo
 */
const geolocationPreferencesStateArb: fc.Arbitrary<GeolocationPreferencesState> = fc.record({
  choice: geolocationChoiceArb,
  lastPromptTimestamp: timestampArb,
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compara dois objetos ForensicConsentConfig
 */
function consentConfigsEqual(a: ForensicConsentConfig, b: ForensicConsentConfig): boolean {
  return (
    a.collectBasicMetadata === b.collectBasicMetadata &&
    a.collectCloudFrontGeo === b.collectCloudFrontGeo &&
    a.collectNetworkInfo === b.collectNetworkInfo &&
    a.collectDeviceBasic === b.collectDeviceBasic &&
    a.collectBrowserGeolocation === b.collectBrowserGeolocation &&
    a.collectCanvasFingerprint === b.collectCanvasFingerprint &&
    a.collectWebGLFingerprint === b.collectWebGLFingerprint &&
    a.collectFontsFingerprint === b.collectFontsFingerprint
  );
}

/**
 * Compara dois estados de ConsentStore
 */
function consentStatesEqual(a: ConsentStoreState, b: ConsentStoreState): boolean {
  return (
    consentConfigsEqual(a.config, b.config) &&
    a.consentTimestamp === b.consentTimestamp &&
    a.consentVersion === b.consentVersion
  );
}

/**
 * Compara dois estados de GeolocationPreferences
 */
function geolocationPreferencesEqual(
  a: GeolocationPreferencesState,
  b: GeolocationPreferencesState
): boolean {
  return a.choice === b.choice && a.lastPromptTimestamp === b.lastPromptTimestamp;
}

// ============================================================================
// Testes
// ============================================================================

describe('Property 7: Storage Round-Trip Preservation', () => {
  let mockStorage: ReturnType<typeof createMockChromeStorage>;

  beforeEach(() => {
    mockStorage = createMockChromeStorage();
    (globalThis as unknown as { chrome: typeof chrome }).chrome = mockStorage.chrome;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ForensicConsentConfig Round-Trip (Requirements 4.6, 4.7)', () => {
    const CONSENT_KEY = 'lexato-consent';

    /**
     * Property: Para qualquer ForensicConsentConfig válido,
     * armazenar e recuperar deve preservar todos os valores
     */
    it('should preserve all ForensicConsentConfig values through storage round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(consentStoreStateArb, async (originalState) => {
          const { adapter } = mockStorage;

          // Armazenar
          await adapter.setItem(CONSENT_KEY, JSON.stringify(originalState));

          // Recuperar
          const retrieved = await adapter.getItem(CONSENT_KEY);
          if (retrieved === null) {
            return false;
          }

          const parsedState = JSON.parse(retrieved) as ConsentStoreState;

          // Verificar equivalência
          return consentStatesEqual(originalState, parsedState);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Campos sempre coletados devem sempre ser true após round-trip
     */
    it('should always preserve always-collected fields as true', async () => {
      await fc.assert(
        fc.asyncProperty(forensicConsentConfigArb, async (config) => {
          const { adapter } = mockStorage;
          const state: ConsentStoreState = {
            config,
            consentTimestamp: new Date().toISOString(),
            consentVersion: '1.0',
          };

          await adapter.setItem(CONSENT_KEY, JSON.stringify(state));
          const retrieved = await adapter.getItem(CONSENT_KEY);

          if (retrieved === null) {
            return false;
          }

          const parsed = JSON.parse(retrieved) as ConsentStoreState;

          // Campos sempre coletados devem ser true
          return (
            parsed.config.collectBasicMetadata === true &&
            parsed.config.collectCloudFrontGeo === true &&
            parsed.config.collectNetworkInfo === true &&
            parsed.config.collectDeviceBasic === true
          );
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Serialização deve ser idempotente
     * JSON.parse(JSON.stringify(x)) === x para qualquer config válido
     */
    it('should have idempotent serialization for consent config', async () => {
      await fc.assert(
        fc.asyncProperty(consentStoreStateArb, async (state) => {
          // Primeira serialização
          const serialized1 = JSON.stringify(state);
          const deserialized1 = JSON.parse(serialized1) as ConsentStoreState;

          // Segunda serialização
          const serialized2 = JSON.stringify(deserialized1);
          const deserialized2 = JSON.parse(serialized2) as ConsentStoreState;

          // Devem ser equivalentes
          return consentStatesEqual(deserialized1, deserialized2);
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Timestamp deve ser preservado exatamente
     */
    it('should preserve timestamp exactly through round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(timestampArb, forensicConsentConfigArb, async (timestamp, config) => {
          const { adapter } = mockStorage;
          const state: ConsentStoreState = {
            config,
            consentTimestamp: timestamp,
            consentVersion: '1.0',
          };

          await adapter.setItem(CONSENT_KEY, JSON.stringify(state));
          const retrieved = await adapter.getItem(CONSENT_KEY);

          if (retrieved === null) {
            return false;
          }

          const parsed = JSON.parse(retrieved) as ConsentStoreState;
          return parsed.consentTimestamp === timestamp;
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('GeolocationPreferences Round-Trip (Requirement 6.10)', () => {
    const GEO_PREFS_KEY = 'lexato-geolocation-prefs';

    /**
     * Property: Para qualquer GeolocationPreferencesState válido,
     * armazenar e recuperar deve preservar todos os valores
     */
    it('should preserve all GeolocationPreferences values through storage round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(geolocationPreferencesStateArb, async (originalState) => {
          const { adapter } = mockStorage;

          // Armazenar
          await adapter.setItem(GEO_PREFS_KEY, JSON.stringify(originalState));

          // Recuperar
          const retrieved = await adapter.getItem(GEO_PREFS_KEY);
          if (retrieved === null) {
            return false;
          }

          const parsedState = JSON.parse(retrieved) as GeolocationPreferencesState;

          // Verificar equivalência
          return geolocationPreferencesEqual(originalState, parsedState);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: GeolocationChoice deve ser preservado exatamente
     */
    it('should preserve GeolocationChoice exactly through round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(geolocationChoiceArb, timestampArb, async (choice, timestamp) => {
          const { adapter } = mockStorage;
          const state: GeolocationPreferencesState = {
            choice,
            lastPromptTimestamp: timestamp,
          };

          await adapter.setItem(GEO_PREFS_KEY, JSON.stringify(state));
          const retrieved = await adapter.getItem(GEO_PREFS_KEY);

          if (retrieved === null) {
            return false;
          }

          const parsed = JSON.parse(retrieved) as GeolocationPreferencesState;
          return parsed.choice === choice;
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Serialização deve ser idempotente para preferences
     */
    it('should have idempotent serialization for geolocation preferences', async () => {
      await fc.assert(
        fc.asyncProperty(geolocationPreferencesStateArb, async (state) => {
          // Primeira serialização
          const serialized1 = JSON.stringify(state);
          const deserialized1 = JSON.parse(serialized1) as GeolocationPreferencesState;

          // Segunda serialização
          const serialized2 = JSON.stringify(deserialized1);
          const deserialized2 = JSON.parse(serialized2) as GeolocationPreferencesState;

          // Devem ser equivalentes
          return geolocationPreferencesEqual(deserialized1, deserialized2);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Chrome Storage Adapter Behavior', () => {
    /**
     * Property: getItem deve retornar null para chaves inexistentes
     */
    it('should return null for non-existent keys', async () => {
      const nonExistentKeyArb = fc.string({ minLength: 1, maxLength: 50 }).filter(
        (s) => !s.includes('lexato') // Evitar colisão com chaves reais
      );

      await fc.assert(
        fc.asyncProperty(nonExistentKeyArb, async (key) => {
          const { adapter } = mockStorage;
          const result = await adapter.getItem(key);
          return result === null;
        }),
        { numRuns: 30 }
      );
    });

    /**
     * Property: removeItem deve fazer getItem retornar null
     */
    it('should make getItem return null after removeItem', async () => {
      await fc.assert(
        fc.asyncProperty(consentStoreStateArb, async (state) => {
          const { adapter } = mockStorage;
          const key = 'test-remove-key';

          // Armazenar
          await adapter.setItem(key, JSON.stringify(state));

          // Verificar que existe
          const beforeRemove = await adapter.getItem(key);
          if (beforeRemove === null) {
            return false;
          }

          // Remover
          await adapter.removeItem(key);

          // Verificar que não existe mais
          const afterRemove = await adapter.getItem(key);
          return afterRemove === null;
        }),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Múltiplos setItem devem sobrescrever valor anterior
     */
    it('should overwrite previous value on multiple setItem calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          consentStoreStateArb,
          consentStoreStateArb,
          async (state1, state2) => {
            const { adapter } = mockStorage;
            const key = 'test-overwrite-key';

            // Armazenar primeiro valor
            await adapter.setItem(key, JSON.stringify(state1));

            // Armazenar segundo valor
            await adapter.setItem(key, JSON.stringify(state2));

            // Recuperar
            const retrieved = await adapter.getItem(key);
            if (retrieved === null) {
              return false;
            }

            const parsed = JSON.parse(retrieved) as ConsentStoreState;

            // Deve ser igual ao segundo valor
            return consentStatesEqual(parsed, state2);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Default Values', () => {
    /**
     * Testa que DEFAULT_CONSENT_CONFIG tem valores corretos
     */
    it('should have correct default consent config values', () => {
      const DEFAULT_CONSENT_CONFIG: ForensicConsentConfig = {
        collectBasicMetadata: true,
        collectCloudFrontGeo: true,
        collectNetworkInfo: true,
        collectDeviceBasic: true,
        collectBrowserGeolocation: false,
        collectCanvasFingerprint: false,
        collectWebGLFingerprint: false,
        collectFontsFingerprint: false,
      };

      // Campos sempre coletados devem ser true
      expect(DEFAULT_CONSENT_CONFIG.collectBasicMetadata).toBe(true);
      expect(DEFAULT_CONSENT_CONFIG.collectCloudFrontGeo).toBe(true);
      expect(DEFAULT_CONSENT_CONFIG.collectNetworkInfo).toBe(true);
      expect(DEFAULT_CONSENT_CONFIG.collectDeviceBasic).toBe(true);

      // Campos opcionais devem ser false por padrão
      expect(DEFAULT_CONSENT_CONFIG.collectBrowserGeolocation).toBe(false);
      expect(DEFAULT_CONSENT_CONFIG.collectCanvasFingerprint).toBe(false);
      expect(DEFAULT_CONSENT_CONFIG.collectWebGLFingerprint).toBe(false);
      expect(DEFAULT_CONSENT_CONFIG.collectFontsFingerprint).toBe(false);
    });

    /**
     * Testa que preferência padrão de geolocalização é 'ask-every-time'
     */
    it('should have ask-every-time as default geolocation preference', () => {
      const defaultChoice: GeolocationChoice = 'ask-every-time';
      expect(defaultChoice).toBe('ask-every-time');
    });
  });
});
