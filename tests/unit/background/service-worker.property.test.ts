/**
 * Testes de Propriedade (Property-Based Tests) para Token Refresh
 *
 * Feature: token-refresh-implementation
 * Valida propriedades de corretude do sistema de refresh de tokens
 *
 * @module ServiceWorkerPropertyTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { chromeMock } from '../../setup';

// Mock do AuditLogger
vi.mock('../../../src/lib/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    getCorrelationId: vi.fn(() => 'test-correlation-id'),
    getTraceId: vi.fn(() => '1-test-trace-id'),
    getEntries: vi.fn(() => []),
    getSummary: vi.fn(() => ({
      correlationId: 'test-correlation-id',
      traceId: '1-test-trace-id',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      totalDurationMs: 0,
      entriesCount: 0,
      countByLevel: { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 },
      countByProcess: {},
    })),
  })),
}));

// Mock do RetryHandler
vi.mock('../../../src/lib/retry-handler', () => ({
  RetryHandler: vi.fn().mockImplementation(() => ({
    execute: vi.fn((fn) => fn()),
    executeWithResult: vi.fn(async (fn) => {
      try {
        const result = await fn();
        return { success: true, result, attempts: 1, totalDelayMs: 0 };
      } catch (error) {
        return { success: false, error, attempts: 1, totalDelayMs: 0 };
      }
    }),
    calculateDelay: vi.fn(() => 1000),
    getConfig: vi.fn(() => ({
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffFactor: 2,
      jitterFactor: 0.3,
    })),
  })),
}));

// Mock do ExtensionIsolationManager
vi.mock('../../../src/background/extension-isolation-manager', () => ({
  ExtensionIsolationManager: vi.fn().mockImplementation(() => ({
    getIsolationStatus: vi.fn(() => ({
      isActive: false,
      disabledCount: 0,
      disabledExtensions: [],
      activatedAt: null,
      correlationId: null,
    })),
    previewIsolation: vi.fn(async () => ({
      extensionsToDisable: [],
      nonDisableableExtensions: [],
      totalExtensions: 0,
    })),
    activateIsolation: vi.fn(async () => ({
      success: true,
      disabledExtensions: [],
      nonDisableableExtensions: [],
      snapshot: { hash: 'test-hash', extensions: [] },
    })),
    deactivateIsolation: vi.fn(async () => ({
      success: true,
      restoredExtensions: [],
      failedExtensions: [],
    })),
    forceRestore: vi.fn(async () => ({
      success: true,
      restoredExtensions: [],
      failedExtensions: [],
    })),
    checkForViolations: vi.fn(async () => []),
    checkPendingSnapshots: vi.fn(async () => {}),
  })),
}));

// Mock do NotificationManager
vi.mock('../../../src/background/notification-manager', () => ({
  getNotificationManager: vi.fn(() => ({
    notifyExtensionsRestored: vi.fn(async () => {}),
    notifyExtensionsRestoreFailed: vi.fn(async () => {}),
    notifyWarning: vi.fn(async () => {}),
  })),
}));

// Mock do CognitoService
vi.mock('../../../src/lib/cognito.service', () => ({
  authenticateUser: vi.fn(async () => ({
    success: true,
    tokens: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      idToken: 'mock-id-token',
      expiresAt: Date.now() + 3600000,
      obtainedAt: Date.now(),
    },
    user: {
      id: 'user-123',
      email: 'teste@lexato.com.br',
      name: 'Usuário Teste',
      accountType: 'individual',
      credits: 50,
      mfaEnabled: false,
    },
  })),
  signOutUser: vi.fn(async () => {}),
  refreshSession: vi.fn(async () => ({
    success: true,
    tokens: {
      accessToken: 'refreshed-access-token',
      refreshToken: 'mock-refresh-token',
      idToken: 'refreshed-id-token',
      expiresAt: Date.now() + 3600000,
      obtainedAt: Date.now(),
    },
  })),
}));

// Importar funções após os mocks
import {
  isRefreshTokenValid,
  refreshAccessToken,
  handleSessionExpired,
  STORAGE_KEYS,
  AUTH_CONFIG,
} from '../../../src/background/service-worker';
import { refreshState } from '../../../src/background/state/service-worker-state';
import { AuditLogger } from '../../../src/lib/audit-logger';
import { refreshSession } from '../../../src/lib/cognito.service';

// =============================================================================
// HELPERS DE TESTE - Extraídos para evitar duplicação (DRY)
// =============================================================================

/**
 * Configura tokens válidos no storage para testes
 * @param storage - Objeto de storage mock
 * @param tokenAgeMs - Idade do token em milissegundos (padrão: 0)
 */
function setupValidTokens(storage: Record<string, unknown>, tokenAgeMs = 0): void {
  storage[STORAGE_KEYS.ACCESS_TOKEN] = 'valid-access-token';
  storage[STORAGE_KEYS.REFRESH_TOKEN] = 'valid-refresh-token';
  storage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
  storage[STORAGE_KEYS.OBTAINED_AT] = Date.now() - tokenAgeMs;
}

/**
 * Configura mock do chrome.storage.local
 * @param storage - Referência ao objeto de storage mock
 */
function setupStorageMock(storage: Record<string, unknown>): void {
  vi.mocked(chromeMock.storage.local.get).mockImplementation(
    async (keys?: string | string[] | Record<string, unknown> | null) => {
      const result: Record<string, unknown> = {};
      if (keys == null) return result;
      const keyArray = Array.isArray(keys) 
        ? keys 
        : typeof keys === 'string' 
          ? [keys] 
          : Object.keys(keys);
      for (const key of keyArray) {
        if (storage[key] !== undefined) {
          result[key] = storage[key];
        }
      }
      return result;
    }
  );

  vi.mocked(chromeMock.storage.local.set).mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(storage, items);
  });

  vi.mocked(chromeMock.storage.local.remove).mockImplementation(async (keys: string | string[]) => {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArray) {
      delete storage[key];
    }
  });
}

// =============================================================================
// TESTES DE PROPRIEDADE
// =============================================================================

describe('Property-Based Tests - Token Refresh', () => {
  let mockStorage: Record<string, unknown>;
  const mockLogger = new AuditLogger();

  beforeEach(() => {
    mockStorage = {};
    vi.clearAllMocks();
    setupStorageMock(mockStorage);
    refreshState.resetFailures();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockStorage = {};
    refreshState.resetFailures();
  });

  // ==========================================================================
  // Property 2: Refresh Token Age Validation
  // Feature: token-refresh-implementation
  // Validates: Requirements 4.1, 4.2, 4.3
  // ==========================================================================

  describe('Property 2: Refresh Token Age Validation', () => {
    it('deve validar corretamente a idade do refresh token para qualquer timestamp', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 24 * 60 * 60 * 1000 }),
          (tokenAgeMs) => {
            const obtainedAt = Date.now() - tokenAgeMs;
            const shouldBeValid = tokenAgeMs <= AUTH_CONFIG.REFRESH_TOKEN_MAX_AGE_MS;
            const isValid = isRefreshTokenValid(obtainedAt);
            return isValid === shouldBeValid;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deve sempre considerar tokens recém-obtidos como válidos', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: AUTH_CONFIG.REFRESH_TOKEN_MAX_AGE_MS }),
          (tokenAgeMs) => {
            const obtainedAt = Date.now() - tokenAgeMs;
            return isRefreshTokenValid(obtainedAt) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deve sempre considerar tokens antigos como inválidos', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: AUTH_CONFIG.REFRESH_TOKEN_MAX_AGE_MS + 1, max: 24 * 60 * 60 * 1000 }),
          (tokenAgeMs) => {
            const obtainedAt = Date.now() - tokenAgeMs;
            return isRefreshTokenValid(obtainedAt) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deve forçar re-autenticação quando token tem mais de 2 horas', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: AUTH_CONFIG.REFRESH_TOKEN_MAX_AGE_MS + 60000, max: 12 * 60 * 60 * 1000 }),
          async (tokenAgeMs) => {
            vi.clearAllMocks();
            mockStorage = {};
            setupStorageMock(mockStorage);
            refreshState.resetFailures();

            setupValidTokens(mockStorage, tokenAgeMs);

            const result = await refreshAccessToken(mockLogger);
            expect(result).toBe(false);
            expect(chromeMock.storage.local.remove).toHaveBeenCalled();
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ==========================================================================
  // Property 3: Consecutive Failure Handling
  // Feature: token-refresh-implementation
  // Validates: Requirements 3.1, 3.2, 3.3
  // ==========================================================================

  describe('Property 3: Consecutive Failure Handling', () => {
    it('deve invalidar sessão após exatamente MAX_REFRESH_ATTEMPTS falhas consecutivas', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(AUTH_CONFIG.MAX_REFRESH_ATTEMPTS),
          async (numFailures) => {
            vi.clearAllMocks();
            mockStorage = {};
            setupStorageMock(mockStorage);
            refreshState.resetFailures();

            // Mock para simular falhas do Cognito
            vi.mocked(refreshSession).mockResolvedValue({
              success: false,
              error: 'Token inválido',
            });

            // Simular falhas consecutivas até atingir o limite
            for (let i = 0; i < numFailures; i++) {
              setupValidTokens(mockStorage);
              await refreshAccessToken(mockLogger);
            }

            // Propriedade: sessão deve ser invalidada após MAX_REFRESH_ATTEMPTS
            expect(chromeMock.storage.local.remove).toHaveBeenCalled();

            // Propriedade: contador deve ser 0 após invalidação (resetado por handleSessionExpired)
            expect(refreshState.failureCount).toBe(0);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('deve manter sessão válida com menos de MAX_REFRESH_ATTEMPTS falhas', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: AUTH_CONFIG.MAX_REFRESH_ATTEMPTS - 1 }),
          async (numFailures) => {
            vi.clearAllMocks();
            mockStorage = {};
            setupStorageMock(mockStorage);
            refreshState.resetFailures();

            vi.mocked(refreshSession).mockResolvedValue({
              success: false,
              error: 'Token inválido',
            });

            for (let i = 0; i < numFailures; i++) {
              setupValidTokens(mockStorage);
              await refreshAccessToken(mockLogger);
            }

            // Propriedade: contador deve refletir número de falhas
            expect(refreshState.failureCount).toBe(numFailures);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('deve resetar contador de falhas após sucesso', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: AUTH_CONFIG.MAX_REFRESH_ATTEMPTS - 1 }),
          async (numFailures) => {
            vi.clearAllMocks();
            mockStorage = {};
            setupStorageMock(mockStorage);
            refreshState.resetFailures();

            // Simular falhas consecutivas
            vi.mocked(refreshSession).mockResolvedValue({
              success: false,
              error: 'Token inválido',
            });

            for (let i = 0; i < numFailures; i++) {
              setupValidTokens(mockStorage);
              await refreshAccessToken(mockLogger);
            }

            expect(refreshState.failureCount).toBe(numFailures);

            // Simular sucesso
            vi.mocked(refreshSession).mockResolvedValue({
              success: true,
              tokens: {
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token',
                idToken: 'new-id-token',
                expiresAt: Date.now() + 3600000,
                obtainedAt: Date.now(),
              },
            });

            setupValidTokens(mockStorage);
            await refreshAccessToken(mockLogger);

            // Propriedade: contador deve ser resetado após sucesso
            expect(refreshState.failureCount).toBe(0);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('deve notificar usuário quando sessão é invalidada', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Usar stringMatching ao invés de hexaString (que não existe no fast-check)
          fc.stringMatching(/^[0-9a-f]{8,16}$/),
          async (correlationId) => {
            vi.clearAllMocks();
            mockStorage = {};
            setupStorageMock(mockStorage);
            refreshState.resetFailures();

            mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'test-token';
            mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'test-refresh';
            mockStorage[STORAGE_KEYS.USER] = { id: 'user-1' };

            await handleSessionExpired(mockLogger, correlationId);

            // Propriedade: deve enviar mensagem AUTH_SESSION_EXPIRED
            expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
              type: 'AUTH_SESSION_EXPIRED',
              payload: {
                correlationId,
                message: 'Sua sessão expirou. Faça login novamente.',
              },
            });

            // Propriedade: dados de autenticação devem ser limpos
            expect(chromeMock.storage.local.remove).toHaveBeenCalled();
            expect(refreshState.failureCount).toBe(0);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
