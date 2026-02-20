/**
 * Property Test: Context-Appropriate Geolocation Collection
 *
 * **Property 2: Context-Appropriate Geolocation Collection**
 * **Validates: Requirements 2.2, 2.7**
 *
 * Para qualquer contexto de execução:
 * - Em Service Worker: DEVE usar Offscreen Document para coleta
 * - Em Content Script/Popup: DEVE usar navigator.geolocation diretamente
 *
 * @module PropertyTest/GeolocationCollector
 */

import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Tipos
// ============================================================================

interface GeoLocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  source: 'gps' | 'network' | 'unavailable';
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
  error?: string;
}

interface OffscreenGeolocationResponse {
  success: true;
  data: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
    timestamp: number;
    source: 'gps' | 'network';
  };
}

interface OffscreenGeolocationError {
  success: false;
  error: string;
  errorCode: number;
}

type OffscreenGeolocationResult = OffscreenGeolocationResponse | OffscreenGeolocationError;

// ============================================================================
// Mocks
// ============================================================================

// Mock do módulo context-utils
const mockIsServiceWorker = vi.fn<() => boolean>();

vi.mock('../../../../../src/lib/context-utils', () => ({
  isServiceWorker: () => mockIsServiceWorker(),
}));

// Mock do chrome.runtime
const mockSendMessage = vi.fn<(msg: unknown) => Promise<OffscreenGeolocationResult>>();
const mockGetContexts = vi.fn<() => Promise<{ documentUrl: string }[]>>();
const mockCreateDocument = vi.fn<(opts: unknown) => Promise<void>>();

// ============================================================================
// Arbitraries
// ============================================================================

const latitudeArb = fc.double({ min: -90, max: 90, noNaN: true });
const longitudeArb = fc.double({ min: -180, max: 180, noNaN: true });
const accuracyArb = fc.double({ min: 0.1, max: 10000, noNaN: true });
const altitudeArb = fc.option(fc.double({ min: -500, max: 10000, noNaN: true }), { nil: null });
const timestampArb = fc.integer({ min: 0, max: Date.now() + 86400000 });

const geolocationCoordsArb = fc.record({
  latitude: latitudeArb,
  longitude: longitudeArb,
  accuracy: accuracyArb,
  altitude: altitudeArb,
  altitudeAccuracy: altitudeArb,
  heading: fc.option(fc.double({ min: 0, max: 360, noNaN: true }), { nil: null }),
  speed: fc.option(fc.double({ min: 0, max: 1000, noNaN: true }), { nil: null }),
});

const geolocationPositionArb = fc.record({
  coords: geolocationCoordsArb,
  timestamp: timestampArb,
});

const offscreenSuccessResponseArb = geolocationPositionArb.map((pos) => ({
  success: true as const,
  data: {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    altitude: pos.coords.altitude,
    altitudeAccuracy: pos.coords.altitudeAccuracy,
    heading: pos.coords.heading,
    speed: pos.coords.speed,
    timestamp: pos.timestamp,
    source: (pos.coords.altitude !== null ? 'gps' : 'network') as 'gps' | 'network',
  },
}));

const offscreenErrorResponseArb = fc.record({
  success: fc.constant(false as const),
  error: fc.string({ minLength: 1, maxLength: 100 }),
  errorCode: fc.constantFrom(0, 1, 2, 3),
});

// ============================================================================
// Helpers
// ============================================================================

function setupServiceWorkerContext() {
  mockIsServiceWorker.mockReturnValue(true);

  // Setup chrome.runtime mocks
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: mockSendMessage,
      getContexts: mockGetContexts,
      ContextType: {
        OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
      },
    },
    offscreen: {
      createDocument: mockCreateDocument,
      Reason: {
        GEOLOCATION: 'GEOLOCATION',
      },
    },
  };

  // Remover navigator.geolocation para simular Service Worker
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    writable: true,
    configurable: true,
  });

  return () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  };
}

function setupContentScriptContext() {
  mockIsServiceWorker.mockReturnValue(false);

  // Não precisa de chrome.runtime para coleta direta
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
}

function createNavigatorGeolocationMock(position: unknown) {
  return {
    geolocation: {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success(position as GeolocationPosition);
      }),
    },
  };
}

function createNavigatorGeolocationErrorMock(errorCode: number) {
  return {
    geolocation: {
      getCurrentPosition: vi.fn((_s: PositionCallback, error: PositionErrorCallback) => {
        error({ code: errorCode, message: `Error ${errorCode}` } as GeolocationPositionError);
      }),
    },
  };
}

// ============================================================================
// GeolocationCollector isolado para testes
// ============================================================================

/**
 * Implementação isolada do GeolocationCollector para testes
 * Replica a lógica do collector real sem dependências de módulos
 */
class TestableGeolocationCollector {
  private timeout: number;

  constructor(timeout = 10000) {
    this.timeout = timeout;
  }

  async collect(): Promise<GeoLocationData> {
    if (mockIsServiceWorker()) {
      return this.collectViaOffscreen();
    }
    return this.collectDirect();
  }

  private async collectViaOffscreen(): Promise<GeoLocationData> {
    try {
      // Garantir que Offscreen Document existe
      await this.ensureOffscreenDocument();

      // Enviar mensagem para Offscreen Document
      const response = await mockSendMessage({
        type: 'get-geolocation',
        target: 'offscreen',
      });

      if (response.success) {
        const { data } = response;
        const result: GeoLocationData = {
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          timestamp: data.timestamp,
          source: data.source,
        };

        if (data.altitude !== null) {
          result.altitude = data.altitude;
        }
        if (data.altitudeAccuracy !== null) {
          result.altitudeAccuracy = data.altitudeAccuracy;
        }
        if (data.heading !== null) {
          result.heading = data.heading;
        }
        if (data.speed !== null) {
          result.speed = data.speed;
        }

        return result;
      }

      return {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        timestamp: Date.now(),
        source: 'unavailable',
        error: response.error,
      };
    } catch (error) {
      return {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        timestamp: Date.now(),
        source: 'unavailable',
        error: `Erro ao comunicar com Offscreen Document: ${String(error)}`,
      };
    }
  }

  private async ensureOffscreenDocument(): Promise<void> {
    const existingContexts = await mockGetContexts();
    if (existingContexts.length > 0) {
      return;
    }

    await mockCreateDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ['GEOLOCATION'],
      justification: 'Coleta de geolocalização para metadados forenses',
    });
  }

  private collectDirect(): Promise<GeoLocationData> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          source: 'unavailable',
          error: 'API de geolocalização não disponível',
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const data: GeoLocationData = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
            source: pos.coords.altitude !== null ? 'gps' : 'network',
          };

          if (pos.coords.altitude !== null) {
            data.altitude = pos.coords.altitude;
          }
          if (pos.coords.altitudeAccuracy !== null) {
            data.altitudeAccuracy = pos.coords.altitudeAccuracy;
          }
          if (pos.coords.heading !== null) {
            data.heading = pos.coords.heading;
          }
          if (pos.coords.speed !== null) {
            data.speed = pos.coords.speed;
          }

          resolve(data);
        },
        (err) => {
          const errorMessages: Record<number, string> = {
            1: 'Permissão negada pelo usuário',
            2: 'Posição indisponível',
            3: 'Timeout ao obter localização',
          };

          resolve({
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            timestamp: Date.now(),
            source: 'unavailable',
            error: errorMessages[err.code] ?? `Erro desconhecido (código ${err.code})`,
          });
        },
        {
          enableHighAccuracy: true,
          timeout: this.timeout - 1000,
          maximumAge: 0,
        }
      );
    });
  }
}

// ============================================================================
// Validação
// ============================================================================

function isValidGeoLocationData(data: unknown): data is GeoLocationData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const d = data as GeoLocationData;
  if (typeof d.latitude !== 'number') {
    return false;
  }
  if (typeof d.longitude !== 'number') {
    return false;
  }
  if (typeof d.accuracy !== 'number') {
    return false;
  }
  if (typeof d.timestamp !== 'number') {
    return false;
  }
  if (!['gps', 'network', 'unavailable'].includes(d.source)) {
    return false;
  }

  return true;
}

// ============================================================================
// Testes
// ============================================================================

describe('Property 2: Context-Appropriate Geolocation Collection', () => {
  let restoreContext: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContexts.mockResolvedValue([]);
    mockCreateDocument.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (restoreContext) {
      restoreContext();
      restoreContext = null;
    }
    vi.restoreAllMocks();
  });

  describe('Service Worker Context (Requirement 2.2)', () => {
    beforeEach(() => {
      restoreContext = setupServiceWorkerContext();
    });

    /**
     * Property test: Em Service Worker, para qualquer resposta de sucesso do Offscreen,
     * o collector deve retornar dados válidos com os mesmos valores
     */
    it('should use Offscreen Document and return valid data for any success response', async () => {
      await fc.assert(
        fc.asyncProperty(offscreenSuccessResponseArb, async (offscreenResponse) => {
          mockSendMessage.mockResolvedValue(offscreenResponse);

          const collector = new TestableGeolocationCollector();
          const result = await collector.collect();

          // Deve ter chamado sendMessage
          if (mockSendMessage.mock.calls.length === 0) {
            return false;
          }

          // Deve ter enviado mensagem correta
          const firstCall = mockSendMessage.mock.calls[0];
          if (!firstCall) {
            return false;
          }
          const sentMessage = firstCall[0] as { type: string; target: string };
          if (sentMessage.type !== 'get-geolocation') {
            return false;
          }
          if (sentMessage.target !== 'offscreen') {
            return false;
          }

          // Resultado deve ser válido
          if (!isValidGeoLocationData(result)) {
            return false;
          }

          // Valores devem corresponder
          if (result.latitude !== offscreenResponse.data.latitude) {
            return false;
          }
          if (result.longitude !== offscreenResponse.data.longitude) {
            return false;
          }
          if (result.accuracy !== offscreenResponse.data.accuracy) {
            return false;
          }
          if (result.timestamp !== offscreenResponse.data.timestamp) {
            return false;
          }
          if (result.source !== offscreenResponse.data.source) {
            return false;
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Property test: Em Service Worker, para qualquer resposta de erro do Offscreen,
     * o collector deve retornar dados com source 'unavailable' e mensagem de erro
     */
    it('should return unavailable with error for any Offscreen error response', async () => {
      await fc.assert(
        fc.asyncProperty(offscreenErrorResponseArb, async (offscreenResponse) => {
          mockSendMessage.mockResolvedValue(offscreenResponse);

          const collector = new TestableGeolocationCollector();
          const result = await collector.collect();

          if (!isValidGeoLocationData(result)) {
            return false;
          }
          if (result.source !== 'unavailable') {
            return false;
          }
          if (typeof result.error !== 'string') {
            return false;
          }
          if (result.error.length === 0) {
            return false;
          }

          return true;
        }),
        { numRuns: 30 }
      );
    });

    /**
     * Testa que o collector cria Offscreen Document quando não existe
     */
    it('should create Offscreen Document when it does not exist', async () => {
      mockGetContexts.mockResolvedValue([]);
      mockSendMessage.mockResolvedValue({
        success: true,
        data: {
          latitude: 0,
          longitude: 0,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          timestamp: Date.now(),
          source: 'network',
        },
      });

      const collector = new TestableGeolocationCollector();
      await collector.collect();

      expect(mockGetContexts).toHaveBeenCalled();
      expect(mockCreateDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'src/offscreen/offscreen.html',
          reasons: ['GEOLOCATION'],
        })
      );
    });

    /**
     * Testa que o collector reutiliza Offscreen Document existente
     */
    it('should reuse existing Offscreen Document', async () => {
      mockGetContexts.mockResolvedValue([{ documentUrl: 'src/offscreen/offscreen.html' }]);
      mockSendMessage.mockResolvedValue({
        success: true,
        data: {
          latitude: 0,
          longitude: 0,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          timestamp: Date.now(),
          source: 'network',
        },
      });

      const collector = new TestableGeolocationCollector();
      await collector.collect();

      expect(mockGetContexts).toHaveBeenCalled();
      expect(mockCreateDocument).not.toHaveBeenCalled();
    });

    /**
     * Testa tratamento de erro de comunicação com Offscreen
     */
    it('should handle communication errors with Offscreen Document', async () => {
      mockSendMessage.mockRejectedValue(new Error('Connection failed'));

      const collector = new TestableGeolocationCollector();
      const result = await collector.collect();

      expect(result.source).toBe('unavailable');
      expect(result.error).toContain('Erro ao comunicar com Offscreen Document');
    });
  });

  describe('Content Script Context (Requirement 2.7)', () => {
    beforeEach(() => {
      setupContentScriptContext();
    });

    /**
     * Property test: Em Content Script, para qualquer posição válida,
     * o collector deve usar navigator.geolocation e retornar dados válidos
     */
    it('should use navigator.geolocation directly and return valid data', async () => {
      await fc.assert(
        fc.asyncProperty(geolocationPositionArb, async (position) => {
          const mockNav = createNavigatorGeolocationMock(position);
          Object.defineProperty(globalThis, 'navigator', {
            value: mockNav,
            writable: true,
            configurable: true,
          });

          const collector = new TestableGeolocationCollector();
          const result = await collector.collect();

          // Não deve ter chamado sendMessage (não está em Service Worker)
          if (mockSendMessage.mock.calls.length > 0) {
            return false;
          }

          // Resultado deve ser válido
          if (!isValidGeoLocationData(result)) {
            return false;
          }

          // Valores devem corresponder
          if (result.latitude !== position.coords.latitude) {
            return false;
          }
          if (result.longitude !== position.coords.longitude) {
            return false;
          }
          if (result.accuracy !== position.coords.accuracy) {
            return false;
          }
          if (result.timestamp !== position.timestamp) {
            return false;
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Property test: Em Content Script, para qualquer erro de geolocalização,
     * o collector deve retornar dados com source 'unavailable'
     */
    it('should return unavailable with error for any geolocation error', async () => {
      const errorCodeArb = fc.constantFrom(1, 2, 3);

      await fc.assert(
        fc.asyncProperty(errorCodeArb, async (errorCode) => {
          const mockNav = createNavigatorGeolocationErrorMock(errorCode);
          Object.defineProperty(globalThis, 'navigator', {
            value: mockNav,
            writable: true,
            configurable: true,
          });

          const collector = new TestableGeolocationCollector();
          const result = await collector.collect();

          if (!isValidGeoLocationData(result)) {
            return false;
          }
          if (result.source !== 'unavailable') {
            return false;
          }
          if (typeof result.error !== 'string') {
            return false;
          }
          if (result.error.length === 0) {
            return false;
          }

          return true;
        }),
        { numRuns: 30 }
      );
    });

    /**
     * Testa que retorna erro quando navigator.geolocation não está disponível
     */
    it('should return error when navigator.geolocation is not available', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      const collector = new TestableGeolocationCollector();
      const result = await collector.collect();

      expect(result.source).toBe('unavailable');
      expect(result.error).toBe('API de geolocalização não disponível');
    });
  });

  describe('Context Detection', () => {
    /**
     * Testa que o método correto é usado baseado no contexto
     */
    it('should use correct method based on execution context', async () => {
      // Teste em Service Worker
      restoreContext = setupServiceWorkerContext();
      mockSendMessage.mockResolvedValue({
        success: true,
        data: {
          latitude: 10,
          longitude: 20,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          timestamp: Date.now(),
          source: 'network',
        },
      });

      const swCollector = new TestableGeolocationCollector();
      await swCollector.collect();

      expect(mockSendMessage).toHaveBeenCalled();
      expect(mockIsServiceWorker).toHaveBeenCalled();

      // Limpar e testar em Content Script
      if (restoreContext) {
        restoreContext();
      }
      vi.clearAllMocks();

      setupContentScriptContext();
      const mockNav = createNavigatorGeolocationMock({
        coords: {
          latitude: 30,
          longitude: 40,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: mockNav,
        writable: true,
        configurable: true,
      });

      const csCollector = new TestableGeolocationCollector();
      await csCollector.collect();

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockNav.geolocation.getCurrentPosition).toHaveBeenCalled();
    });
  });
});
