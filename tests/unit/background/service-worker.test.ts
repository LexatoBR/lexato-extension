/**
 * Testes unitários para o Service Worker da Extensão Chrome Lexato
 *
 * Testa gerenciamento de tokens, comunicação e orquestração de captura
 *
 * @module ServiceWorkerTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chromeMock } from '../../setup';

// Mock do AuditLogger antes de importar o service worker
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
  })),
}));

// Mock do CognitoService
vi.mock('../../../src/lib/cognito.service', () => ({
  authenticateUser: vi.fn(async (email: string, password: string) => {
    // Simular autenticação bem-sucedida para credenciais específicas
    if (email === 'teste@lexato.com.br' && password === 'Teste@123') {
      return {
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
      };
    }
    // Credenciais inválidas
    return {
      success: false,
      error: 'Email ou senha incorretos',
    };
  }),
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

// Importar funções do service worker após os mocks
import {
  generateCorrelationId,
  handleMessage,
  storeTokens,
  getStoredTokens,
  storeUser,
  getStoredUser,
  clearAuthData,
  isTokenExpiringSoon,
  isTokenExpired,
  isRefreshTokenValid,
  refreshAccessToken,
  handleSessionExpired,
  persistCaptureState,
  recoverCaptureState,
  clearCaptureState,
  STORAGE_KEYS,
  AUTH_CONFIG,
} from '../../../src/background/service-worker';
import type { AuthTokens, AuthUser } from '../../../src/types/auth.types';
import type { CaptureState, MessageType } from '../../../src/types/api.types';
import { AuditLogger } from '../../../src/lib/audit-logger';

describe('Service Worker', () => {
  let mockStorage: Record<string, unknown>;

  beforeEach(() => {
    mockStorage = {};

    // Configurar mock do chrome.storage.local
    // @ts-expect-error - Mock simplificado para testes
    vi.mocked(chromeMock.storage.local.get).mockImplementation(async (keys: string | string[]) => {
      const result: Record<string, unknown> = {};
      const keyArray = Array.isArray(keys) ? keys : [keys];
      for (const key of keyArray) {
        if (mockStorage[key] !== undefined) {
          result[key] = mockStorage[key];
        }
      }
      return result;
    });

    vi.mocked(chromeMock.storage.local.set).mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(mockStorage, items);
    });

    vi.mocked(chromeMock.storage.local.remove).mockImplementation(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      for (const key of keyArray) {
        delete mockStorage[key];
      }
    });

    vi.mocked(chromeMock.storage.local.clear).mockImplementation(async () => {
      mockStorage = {};
    });

    // Configurar mock do chrome.tabs
    vi.mocked(chromeMock.tabs.query).mockResolvedValue([
      { id: 1, url: 'https://example.com', title: 'Example Page' } as chrome.tabs.Tab,
    ]);

    vi.mocked(chromeMock.tabs.sendMessage).mockResolvedValue({ success: true });

    // Configurar mock do chrome.tabs.reload para simular reload com sucesso
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chromeMock.tabs.reload as any).mockImplementation(
      (tabId: number, _props: unknown, callback?: () => void) => {
        // Chamar callback imediatamente se fornecido
        if (callback) { callback(); }
        // Simular evento onUpdated após reload com pequeno delay
        setTimeout(() => {
          const listeners = vi.mocked(chromeMock.tabs.onUpdated.addListener).mock.calls;
          if (listeners.length > 0) {
            const lastListener = listeners[listeners.length - 1]?.[0];
            if (lastListener) {
              lastListener(tabId, { status: 'complete' }, {} as chrome.tabs.Tab);
            }
          }
        }, 5);
        return Promise.resolve();
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockStorage = {};
  });

  describe('generateCorrelationId', () => {
    it('deve gerar UUID válido', () => {
      const id = generateCorrelationId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      // UUID v4 tem 36 caracteres (incluindo hífens)
      expect(id.length).toBe(36);
    });

    it('deve gerar IDs únicos', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('Gerenciamento de Tokens', () => {
    const mockTokens: AuthTokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      idToken: 'test-id-token',
      expiresAt: Date.now() + 3600000, // 1 hora no futuro
      obtainedAt: Date.now(),
    };

    describe('storeTokens', () => {
      it('deve armazenar tokens corretamente', async () => {
        await storeTokens(mockTokens);

        expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
          [STORAGE_KEYS.ACCESS_TOKEN]: mockTokens.accessToken,
          [STORAGE_KEYS.REFRESH_TOKEN]: mockTokens.refreshToken,
          [STORAGE_KEYS.ID_TOKEN]: mockTokens.idToken,
          [STORAGE_KEYS.EXPIRES_AT]: mockTokens.expiresAt,
          [STORAGE_KEYS.OBTAINED_AT]: mockTokens.obtainedAt,
        });
      });
    });

    describe('getStoredTokens', () => {
      it('deve retornar tokens armazenados', async () => {
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
        mockStorage[STORAGE_KEYS.ID_TOKEN] = mockTokens.idToken;
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = mockTokens.expiresAt;
        mockStorage[STORAGE_KEYS.OBTAINED_AT] = mockTokens.obtainedAt;

        const result = await getStoredTokens();

        expect(result).toEqual(mockTokens);
      });

      it('deve retornar null se não houver tokens', async () => {
        const result = await getStoredTokens();
        expect(result).toBeNull();
      });

      it('deve retornar null se faltar accessToken', async () => {
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;

        const result = await getStoredTokens();
        expect(result).toBeNull();
      });

      it('deve retornar null se faltar refreshToken', async () => {
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;

        const result = await getStoredTokens();
        expect(result).toBeNull();
      });
    });

    describe('isTokenExpiringSoon', () => {
      it('deve retornar true se token expira em menos de 5 minutos', () => {
        const expiresAt = Date.now() + 4 * 60 * 1000; // 4 minutos
        expect(isTokenExpiringSoon(expiresAt)).toBe(true);
      });

      it('deve retornar false se token expira em mais de 5 minutos', () => {
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutos
        expect(isTokenExpiringSoon(expiresAt)).toBe(false);
      });

      it('deve retornar true se token já expirou', () => {
        const expiresAt = Date.now() - 1000; // 1 segundo atrás
        expect(isTokenExpiringSoon(expiresAt)).toBe(true);
      });
    });

    describe('isTokenExpired', () => {
      it('deve retornar true se token expirou', () => {
        const expiresAt = Date.now() - 1000;
        expect(isTokenExpired(expiresAt)).toBe(true);
      });

      it('deve retornar false se token não expirou', () => {
        const expiresAt = Date.now() + 1000;
        expect(isTokenExpired(expiresAt)).toBe(false);
      });
    });
  });

  describe('Gerenciamento de Usuário', () => {
    const mockUser: AuthUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      accountType: 'individual',
      credits: 100,
      mfaEnabled: false,
    };

    describe('storeUser', () => {
      it('deve armazenar usuário corretamente', async () => {
        await storeUser(mockUser);

        expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
          [STORAGE_KEYS.USER]: mockUser,
        });
      });
    });

    describe('getStoredUser', () => {
      it('deve retornar usuário armazenado', async () => {
        mockStorage[STORAGE_KEYS.USER] = mockUser;

        const result = await getStoredUser();
        expect(result).toEqual(mockUser);
      });

      it('deve retornar null se não houver usuário', async () => {
        const result = await getStoredUser();
        expect(result).toBeNull();
      });
    });

    describe('clearAuthData', () => {
      it('deve limpar todos os dados de autenticação', async () => {
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'token';
        mockStorage[STORAGE_KEYS.USER] = mockUser;

        await clearAuthData();

        expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
          STORAGE_KEYS.ACCESS_TOKEN,
          STORAGE_KEYS.REFRESH_TOKEN,
          STORAGE_KEYS.ID_TOKEN,
          STORAGE_KEYS.EXPIRES_AT,
          STORAGE_KEYS.OBTAINED_AT,
          STORAGE_KEYS.USER,
        ]);
      });
    });
  });

  describe('Persistência de Estado de Captura', () => {
    const mockCaptureState: CaptureState = {
      id: 'test-capture-id',
      type: 'screenshot',
      storageType: 'standard',
      status: 'capturing',
      tabId: 1,
      url: 'https://example.com',
      title: 'Example Page',
      startedAt: Date.now(),
      progress: 50,
      progressMessage: 'Capturando...',
    };

    describe('persistCaptureState', () => {
      it('deve persistir estado de captura', async () => {
        await persistCaptureState(mockCaptureState);

        expect(chromeMock.storage.local.set).toHaveBeenCalled();
        const setCall = vi.mocked(chromeMock.storage.local.set).mock.calls[0];
        expect(setCall).toBeDefined();
        const setData = setCall?.[0] as Record<string, unknown> | undefined;
        expect(setData?.[STORAGE_KEYS.CAPTURE_STATE]).toBeDefined();
        const captureState = setData?.[STORAGE_KEYS.CAPTURE_STATE] as { id: string; lastUpdatedAt: number } | undefined;
        expect(captureState?.id).toBe(mockCaptureState.id);
        expect(captureState?.lastUpdatedAt).toBeDefined();
      });
    });

    describe('recoverCaptureState', () => {
      it('deve recuperar estado de captura persistido', async () => {
        mockStorage[STORAGE_KEYS.CAPTURE_STATE] = {
          ...mockCaptureState,
          lastUpdatedAt: Date.now(),
        };

        const result = await recoverCaptureState();

        expect(result).toBeDefined();
        expect(result?.id).toBe(mockCaptureState.id);
      });

      it('deve retornar null se não houver estado persistido', async () => {
        const result = await recoverCaptureState();
        expect(result).toBeNull();
      });
    });

    describe('clearCaptureState', () => {
      it('deve limpar estado de captura', async () => {
        mockStorage[STORAGE_KEYS.CAPTURE_STATE] = mockCaptureState;

        await clearCaptureState();

        expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([STORAGE_KEYS.CAPTURE_STATE]);
      });
    });
  });

  describe('handleMessage', () => {
    const mockSender: chrome.runtime.MessageSender = {
      id: 'test-extension-id',
      tab: {
        id: 1,
        index: 0,
        windowId: 1,
        highlighted: true,
        active: true,
        pinned: false,
        incognito: false,
        selected: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      },
    };

    const mockLogger = new AuditLogger();

    describe('PING', () => {
      it('deve responder PONG', async () => {
        const response = await handleMessage(
          { type: 'PING' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toBe('PONG');
      });
    });

    describe('GET_VERSION', () => {
      it('deve retornar versão da extensão', async () => {
        const response = await handleMessage(
          { type: 'GET_VERSION' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toEqual({
          version: '1.0.0',
          name: 'Lexato - Provas Digitais',
        });
      });
    });

    describe('GET_AUTH_STATUS', () => {
      it('deve retornar não autenticado quando não há tokens', async () => {
        const response = await handleMessage(
          { type: 'GET_AUTH_STATUS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toEqual({
          isAuthenticated: false,
          user: undefined,
        });
      });

      it('deve retornar autenticado quando há tokens válidos', async () => {
        const mockUser: AuthUser = {
          id: 'test-user-id',
          email: 'test@example.com',
          accountType: 'individual',
          credits: 100,
          mfaEnabled: false,
        };

        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'test-token';
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'test-refresh';
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
        mockStorage[STORAGE_KEYS.USER] = mockUser;

        const response = await handleMessage(
          { type: 'GET_AUTH_STATUS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toEqual({
          isAuthenticated: true,
          user: mockUser,
        });
      });

      it('deve retornar não autenticado quando token expirou', async () => {
        const mockUser: AuthUser = {
          id: 'test-user-id',
          email: 'test@example.com',
          accountType: 'individual',
          credits: 100,
          mfaEnabled: false,
        };

        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'test-token';
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'test-refresh';
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() - 1000; // Expirado
        mockStorage[STORAGE_KEYS.USER] = mockUser;

        const response = await handleMessage(
          { type: 'GET_AUTH_STATUS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toEqual({
          isAuthenticated: false,
          user: undefined,
        });
      });
    });

    describe('GET_CAPTURE_STATUS', () => {
      it('deve retornar null quando não há captura em andamento', async () => {
        const response = await handleMessage(
          { type: 'GET_CAPTURE_STATUS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toBeNull();
      });
    });

    describe('Mensagem desconhecida', () => {
      it('deve retornar erro para tipo desconhecido', async () => {
        const response = await handleMessage(
          { type: 'UNKNOWN_TYPE' as MessageType },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('desconhecido');
      });
    });
  });

  describe('Constantes de Configuração', () => {
    it('deve ter STORAGE_KEYS definidas', () => {
      expect(STORAGE_KEYS.ACCESS_TOKEN).toBe('accessToken');
      expect(STORAGE_KEYS.REFRESH_TOKEN).toBe('refreshToken');
      expect(STORAGE_KEYS.USER).toBe('user');
      expect(STORAGE_KEYS.CAPTURE_STATE).toBe('captureState');
    });

    it('deve ter AUTH_CONFIG com valores corretos', () => {
      expect(AUTH_CONFIG.REFRESH_BEFORE_EXPIRY_MS).toBe(5 * 60 * 1000);
      expect(AUTH_CONFIG.CHECK_INTERVAL_MS).toBe(60 * 1000);
      expect(AUTH_CONFIG.MAX_REFRESH_ATTEMPTS).toBe(3);
      expect(AUTH_CONFIG.REFRESH_ALARM_NAME).toBe('token-refresh-check');
    });
  });

  describe('handleMessage - Autenticação', () => {
    const mockSender: chrome.runtime.MessageSender = {
      id: 'test-extension-id',
      tab: {
        id: 1,
        index: 0,
        windowId: 1,
        highlighted: true,
        active: true,
        pinned: false,
        incognito: false,
        selected: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      },
    };

    const mockLogger = new AuditLogger();

    describe('LOGIN', () => {
      it('deve fazer login com sucesso', async () => {
        const response = await handleMessage(
          { type: 'LOGIN', payload: { email: 'teste@lexato.com.br', password: 'Teste@123' } },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect((response.data as { user: { email: string } }).user).toBeDefined();
        expect((response.data as { user: { email: string } }).user.email).toBe('teste@lexato.com.br');
      });

      it('deve rejeitar credenciais inválidas', async () => {
        const response = await handleMessage(
          { type: 'LOGIN', payload: { email: 'wrong@example.com', password: 'wrongpass' } },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toBe('Email ou senha incorretos');
      });
    });

    describe('LOGOUT', () => {
      it('deve fazer logout com sucesso', async () => {
        // Primeiro fazer login
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'test-token';
        mockStorage[STORAGE_KEYS.USER] = { id: 'user-1', email: 'test@example.com' };

        const response = await handleMessage(
          { type: 'LOGOUT' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(chromeMock.storage.local.remove).toHaveBeenCalled();
      });
    });

    describe('REFRESH_TOKEN', () => {
      it('deve renovar token com sucesso quando há refresh token', async () => {
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-token';
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'refresh-token';
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
        // Requisito 4.1: obtainedAt deve estar dentro do limite de 2 horas
        mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now();

        const response = await handleMessage(
          { type: 'REFRESH_TOKEN' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
      });

      it('deve falhar quando não há refresh token', async () => {
        // Sem tokens armazenados
        const response = await handleMessage(
          { type: 'REFRESH_TOKEN' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('Falha ao renovar token');
      });
    });
  });

  describe('handleMessage - Captura', () => {
    const mockSender: chrome.runtime.MessageSender = {
      id: 'test-extension-id',
      tab: {
        id: 1,
        index: 0,
        windowId: 1,
        highlighted: true,
        active: true,
        pinned: false,
        incognito: false,
        selected: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      },
    };

    const mockLogger = new AuditLogger();

    describe('START_CAPTURE', () => {
      it('deve falhar quando usuário não está autenticado', async () => {
        const response = await handleMessage(
          { type: 'START_CAPTURE', payload: { type: 'screenshot', storageType: 'standard' } },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('não autenticado');
      });
    });

    describe('STOP_CAPTURE', () => {
      it('deve falhar quando não há captura em andamento', async () => {
        const response = await handleMessage(
          { type: 'STOP_CAPTURE' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('Nenhuma captura');
      });
    });

    describe('CANCEL_CAPTURE', () => {
      it('deve falhar quando não há captura em andamento', async () => {
        const response = await handleMessage(
          { type: 'CANCEL_CAPTURE' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('Nenhuma captura');
      });
    });

    describe('GET_RECENT_CAPTURES', () => {
      it('deve retornar lista vazia de capturas', async () => {
        const response = await handleMessage(
          { type: 'GET_RECENT_CAPTURES' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toEqual({ captures: [], total: 0, hasMore: false });
      });
    });

    describe('GET_CREDITS', () => {
      it('deve retornar créditos do usuário', async () => {
        mockStorage[STORAGE_KEYS.USER] = { id: 'user-1', credits: 50 };

        const response = await handleMessage(
          { type: 'GET_CREDITS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect((response.data as { balance: number }).balance).toBe(50);
      });

      it('deve retornar 0 créditos quando não há usuário', async () => {
        const response = await handleMessage(
          { type: 'GET_CREDITS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect((response.data as { balance: number }).balance).toBe(0);
      });
    });
  });

  describe('handleMessage - Upload e Certificação', () => {
    const mockSender: chrome.runtime.MessageSender = {
      id: 'test-extension-id',
      tab: { id: 1, index: 0, windowId: 1, highlighted: true, active: true, pinned: false, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 },
    };

    const mockLogger = new AuditLogger();

    describe('GET_PRESIGNED_URL', () => {
      it('deve retornar erro quando parâmetros obrigatórios não são fornecidos', async () => {
        const response = await handleMessage(
          { type: 'GET_PRESIGNED_URL' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('Parâmetros obrigatórios');
      });

      it('deve retornar erro quando fileType não é fornecido', async () => {
        const response = await handleMessage(
          { 
            type: 'GET_PRESIGNED_URL',
            payload: { captureId: 'test-capture-id' }
          },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('Parâmetros obrigatórios');
      });
    });

    describe('NOTIFY_UPLOAD_COMPLETE', () => {
      it('deve retornar erro quando parâmetros obrigatórios não são fornecidos', async () => {
        const response = await handleMessage(
          { type: 'NOTIFY_UPLOAD_COMPLETE' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('Parâmetros obrigatórios');
      });

      it('deve retornar erro quando files não é fornecido', async () => {
        const response = await handleMessage(
          { 
            type: 'NOTIFY_UPLOAD_COMPLETE',
            payload: { captureId: 'test-capture-id' }
          },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('Parâmetros obrigatórios');
      });
    });

    describe('GET_CERTIFICATION_STATUS', () => {
      it('deve retornar erro - funcionalidade não implementada', async () => {
        const response = await handleMessage(
          { type: 'GET_CERTIFICATION_STATUS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(false);
        expect(response.error).toContain('não implementada');
      });
    });
  });

  describe('handleMessage - Isolamento de Extensões', () => {
    const mockSender: chrome.runtime.MessageSender = {
      id: 'test-extension-id',
      tab: { id: 1, index: 0, windowId: 1, highlighted: true, active: true, pinned: false, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 },
    };

    const mockLogger = new AuditLogger();

    describe('GET_ISOLATION_STATUS', () => {
      it('deve retornar status de isolamento', async () => {
        const response = await handleMessage(
          { type: 'GET_ISOLATION_STATUS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
      });
    });

    describe('PREVIEW_ISOLATION', () => {
      it('deve retornar preview de isolamento', async () => {
        const response = await handleMessage(
          { type: 'PREVIEW_ISOLATION' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
      });
    });

    describe('ACTIVATE_ISOLATION', () => {
      it('deve ativar isolamento', async () => {
        const response = await handleMessage(
          { type: 'ACTIVATE_ISOLATION', correlationId: 'test-correlation-id' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBeDefined();
        expect(response.data).toBeDefined();
      });
    });

    describe('DEACTIVATE_ISOLATION', () => {
      it('deve desativar isolamento', async () => {
        const response = await handleMessage(
          { type: 'DEACTIVATE_ISOLATION' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBeDefined();
        expect(response.data).toBeDefined();
      });
    });

    describe('FORCE_RESTORE_EXTENSIONS', () => {
      it('deve forçar restauração de extensões', async () => {
        const response = await handleMessage(
          { type: 'FORCE_RESTORE_EXTENSIONS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBeDefined();
        expect(response.data).toBeDefined();
      });
    });

    describe('CHECK_ISOLATION_VIOLATIONS', () => {
      it('deve verificar violações de isolamento', async () => {
        const response = await handleMessage(
          { type: 'CHECK_ISOLATION_VIOLATIONS' },
          mockSender,
          mockLogger,
          'test-correlation-id'
        );

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect((response.data as { violations: unknown[] }).violations).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Testes de Refresh de Token (Task 7.1, 7.2, 7.3)
  // ==========================================================================

  describe('Refresh de Token - refreshAccessToken', () => {
    let mockStorage: Record<string, unknown>;
    const mockLogger = new AuditLogger();

    beforeEach(() => {
      mockStorage = {};
      vi.clearAllMocks();

      // Configurar mock do chrome.storage.local
      // @ts-expect-error - Mock simplificado para testes
      vi.mocked(chromeMock.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        }
        return result;
      });

      vi.mocked(chromeMock.storage.local.set).mockImplementation(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      });

      vi.mocked(chromeMock.storage.local.remove).mockImplementation(async (keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
          delete mockStorage[key];
        }
      });
    });

    describe('refreshAccessToken - Integração com Cognito Service', () => {
      it('deve chamar refreshSession do Cognito Service com refresh token válido', async () => {
        // Configurar tokens válidos (obtidos há menos de 2 horas)
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-access-token';
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'valid-refresh-token';
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
        mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now(); // Token recém-obtido

        const { refreshSession } = await import('../../../src/lib/cognito.service');
        
        const result = await refreshAccessToken(mockLogger);

        expect(result).toBe(true);
        expect(refreshSession).toHaveBeenCalledWith('valid-refresh-token', '');
      });

      it('deve armazenar novos tokens após refresh bem-sucedido', async () => {
        // Configurar tokens válidos
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-access-token';
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'valid-refresh-token';
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
        mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now();

        await refreshAccessToken(mockLogger);

        // Verificar que novos tokens foram armazenados
        expect(chromeMock.storage.local.set).toHaveBeenCalled();
        const setCall = vi.mocked(chromeMock.storage.local.set).mock.calls.find(
          (call) => call[0] != null && typeof call[0] === 'object' && 'accessToken' in call[0]
        );
        expect(setCall).toBeDefined();
        const setData = setCall?.[0] as Record<string, unknown> | undefined;
        expect(setData?.['accessToken']).toBe('refreshed-access-token');
      });

      it('deve retornar false quando não há refresh token', async () => {
        // Sem tokens armazenados
        const result = await refreshAccessToken(mockLogger);

        expect(result).toBe(false);
      });

      it('deve retornar false quando Cognito Service retorna erro', async () => {
        // Configurar tokens válidos
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-access-token';
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'invalid-refresh-token';
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
        mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now();

        // Mock para retornar erro
        const { refreshSession } = await import('../../../src/lib/cognito.service');
        vi.mocked(refreshSession).mockResolvedValueOnce({
          success: false,
          error: 'Token inválido',
        });

        const result = await refreshAccessToken(mockLogger);

        expect(result).toBe(false);
      });
    });

    describe('refreshAccessToken - Tratamento de Erros', () => {
      it('deve incrementar contador de falhas em caso de erro', async () => {
        // Configurar tokens válidos
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-access-token';
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'invalid-refresh-token';
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
        mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now();

        // Mock para retornar erro
        const { refreshSession } = await import('../../../src/lib/cognito.service');
        vi.mocked(refreshSession).mockResolvedValueOnce({
          success: false,
          error: 'Token inválido',
        });

        // Importar refreshState para verificar contador
        const { refreshState } = await import('../../../src/background/state/service-worker-state');
        refreshState.resetFailures(); // Garantir estado limpo

        await refreshAccessToken(mockLogger);

        expect(refreshState.failureCount).toBeGreaterThan(0);
        
        // Limpar estado
        refreshState.resetFailures();
      });

      it('deve resetar contador de falhas após sucesso', async () => {
        // Configurar tokens válidos
        mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-access-token';
        mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'valid-refresh-token';
        mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
        mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now();

        // Importar refreshState e simular falhas anteriores
        const { refreshState } = await import('../../../src/background/state/service-worker-state');
        refreshState.failureCount = 2;

        await refreshAccessToken(mockLogger);

        expect(refreshState.failureCount).toBe(0);
      });
    });
  });

  describe('handleSessionExpired - Limpeza e Notificação', () => {
    let mockStorage: Record<string, unknown>;
    const mockLogger = new AuditLogger();

    beforeEach(() => {
      mockStorage = {};
      vi.clearAllMocks();

      // Configurar mock do chrome.storage.local
      vi.mocked(chromeMock.storage.local.remove).mockImplementation(async (keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
          delete mockStorage[key];
        }
      });
    });

    it('deve limpar dados de autenticação quando sessão expira', async () => {
      // Configurar dados de autenticação
      mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'test-token';
      mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'test-refresh';
      mockStorage[STORAGE_KEYS.USER] = { id: 'user-1' };

      await handleSessionExpired(mockLogger, 'test-correlation-id');

      // Verificar que clearAuthData foi chamado (via chrome.storage.local.remove)
      expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.ID_TOKEN,
        STORAGE_KEYS.EXPIRES_AT,
        STORAGE_KEYS.OBTAINED_AT,
        STORAGE_KEYS.USER,
      ]);
    });

    it('deve resetar contador de falhas', async () => {
      // Importar refreshState e simular falhas
      const { refreshState } = await import('../../../src/background/state/service-worker-state');
      refreshState.failureCount = 3;

      await handleSessionExpired(mockLogger, 'test-correlation-id');

      expect(refreshState.failureCount).toBe(0);
    });

    it('deve enviar mensagem AUTH_SESSION_EXPIRED ao popup', async () => {
      await handleSessionExpired(mockLogger, 'test-correlation-id');

      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTH_SESSION_EXPIRED',
        payload: {
          correlationId: 'test-correlation-id',
          message: 'Sua sessão expirou. Faça login novamente.',
        },
      });
    });
  });

  describe('isRefreshTokenValid - Validação de Idade do Token', () => {
    it('deve retornar true para tokens dentro do limite de 2 horas', () => {
      // Token obtido há 1 hora (dentro do limite)
      const obtainedAt = Date.now() - (1 * 60 * 60 * 1000);
      
      expect(isRefreshTokenValid(obtainedAt)).toBe(true);
    });

    it('deve retornar true para tokens recém-obtidos', () => {
      // Token obtido agora
      const obtainedAt = Date.now();
      
      expect(isRefreshTokenValid(obtainedAt)).toBe(true);
    });

    it('deve retornar true para tokens no limite exato de 2 horas', () => {
      // Token obtido exatamente há 2 horas
      const obtainedAt = Date.now() - AUTH_CONFIG.REFRESH_TOKEN_MAX_AGE_MS;
      
      expect(isRefreshTokenValid(obtainedAt)).toBe(true);
    });

    it('deve retornar false para tokens com mais de 2 horas', () => {
      // Token obtido há 2 horas e 1 minuto
      const obtainedAt = Date.now() - (2 * 60 * 60 * 1000 + 60 * 1000);
      
      expect(isRefreshTokenValid(obtainedAt)).toBe(false);
    });

    it('deve retornar false para tokens muito antigos', () => {
      // Token obtido há 24 horas
      const obtainedAt = Date.now() - (24 * 60 * 60 * 1000);
      
      expect(isRefreshTokenValid(obtainedAt)).toBe(false);
    });
  });

  describe('refreshAccessToken - Validação de Idade do Refresh Token', () => {
    let mockStorage: Record<string, unknown>;
    const mockLogger = new AuditLogger();

    beforeEach(() => {
      mockStorage = {};
      vi.clearAllMocks();

      // Configurar mock do chrome.storage.local
      // @ts-expect-error - Mock simplificado para testes
      vi.mocked(chromeMock.storage.local.get).mockImplementation(async (keys: string | string[]) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        }
        return result;
      });

      vi.mocked(chromeMock.storage.local.remove).mockImplementation(async (keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
          delete mockStorage[key];
        }
      });
    });

    it('deve fazer refresh quando token tem menos de 2 horas', async () => {
      // Token obtido há 1 hora (válido)
      mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-access-token';
      mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'valid-refresh-token';
      mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
      mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now() - (1 * 60 * 60 * 1000);

      const result = await refreshAccessToken(mockLogger);

      expect(result).toBe(true);
    });

    it('deve forçar re-autenticação quando token tem mais de 2 horas', async () => {
      // Token obtido há 3 horas (expirado)
      mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-access-token';
      mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'expired-refresh-token';
      mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
      mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now() - (3 * 60 * 60 * 1000);

      const result = await refreshAccessToken(mockLogger);

      expect(result).toBe(false);
      // Deve ter chamado clearAuthData (via handleSessionExpired)
      expect(chromeMock.storage.local.remove).toHaveBeenCalled();
    });

    it('deve limpar sessão quando refresh token expirou por idade', async () => {
      // Token obtido há 2.5 horas (expirado)
      mockStorage[STORAGE_KEYS.ACCESS_TOKEN] = 'old-access-token';
      mockStorage[STORAGE_KEYS.REFRESH_TOKEN] = 'expired-refresh-token';
      mockStorage[STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000;
      mockStorage[STORAGE_KEYS.OBTAINED_AT] = Date.now() - (2.5 * 60 * 60 * 1000);

      await refreshAccessToken(mockLogger);

      // Verificar que sessão foi limpa
      expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.ID_TOKEN,
        STORAGE_KEYS.EXPIRES_AT,
        STORAGE_KEYS.OBTAINED_AT,
        STORAGE_KEYS.USER,
      ]);
    });
  });

  // ==========================================================================
  // Testes de Captura com Content Script
  // ==========================================================================

  describe('Captura com Content Script', () => {
    const mockSender: chrome.runtime.MessageSender = {
      id: 'test-extension-id',
      tab: { id: 1, index: 0, windowId: 1, highlighted: true, active: true, pinned: false, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 },
    };
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      critical: vi.fn(),
    };

    describe('START_CAPTURE', () => {
      it('deve falhar graciosamente quando content script não está disponível', async () => {
        // Simular usuário autenticado
        // @ts-expect-error - Mock simplificado para testes
        vi.mocked(chromeMock.storage.local.get).mockResolvedValue({
          accessToken: 'valid_token',
          refreshToken: 'refresh_token',
          expiresAt: Date.now() + 3600000,
          obtainedAt: Date.now(),
          user: { id: 'user_1', email: 'test@test.com', name: 'Test' },
        });

        // Simular aba ativa
        vi.mocked(chromeMock.tabs.query).mockResolvedValue([
          { id: 123, url: 'https://example.com', title: 'Example' } as chrome.tabs.Tab,
        ]);

        // Simular tabs.get para retornar informações da aba
        vi.mocked(chromeMock.tabs.get).mockResolvedValue({
          id: 123,
          url: 'https://example.com',
          title: 'Example',
        } as chrome.tabs.Tab);

        // Simular content script não disponível (PING falha)
        vi.mocked(chromeMock.tabs.sendMessage).mockRejectedValue(
          new Error('Could not establish connection. Receiving end does not exist.')
        );

        // Simular falha na injeção do script usando o mock global
        vi.mocked(chromeMock.scripting.executeScript).mockRejectedValue(new Error('Cannot access page'));

        const response = await handleMessage(
          {
            type: 'START_CAPTURE',
            payload: { type: 'screenshot', storageType: 'standard' },
          },
          mockSender,
          mockLogger as unknown as Parameters<typeof handleMessage>[2],
          'test-correlation-id'
        );

        // Deve retornar erro amigável
        expect(response.success).toBe(false);
        expect(response.error).toContain('Não foi possível inicializar');
      });

      it('deve injetar content script quando não está carregado', async () => {
        // Simular usuário autenticado
        // @ts-expect-error - Mock simplificado para testes
        vi.mocked(chromeMock.storage.local.get).mockResolvedValue({
          accessToken: 'valid_token',
          refreshToken: 'refresh_token',
          expiresAt: Date.now() + 3600000,
          obtainedAt: Date.now(),
          user: { id: 'user_1', email: 'test@test.com', name: 'Test' },
        });

        // Simular aba ativa
        vi.mocked(chromeMock.tabs.query).mockResolvedValue([
          { id: 123, url: 'https://example.com', title: 'Example' } as chrome.tabs.Tab,
        ]);

        // Simular tabs.get para retornar informações da aba
        vi.mocked(chromeMock.tabs.get).mockResolvedValue({
          id: 123,
          url: 'https://example.com',
          title: 'Example',
        } as chrome.tabs.Tab);

        // Simular manifest com content_scripts
        vi.mocked(chromeMock.runtime.getManifest).mockReturnValue({
          version: '1.0.0',
          name: 'Lexato - Provas Digitais',
          content_scripts: [
            {
              js: ['src/content/content-script.js'],
              matches: ['<all_urls>'],
            },
          ],
        } as chrome.runtime.Manifest);

        // Primeira chamada falha (content script não carregado)
        // Segunda chamada sucede (após injeção)
        let callCount = 0;
        vi.mocked(chromeMock.tabs.sendMessage).mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('Receiving end does not exist'));
          }
          // Após injeção, retorna sucesso
          return Promise.resolve({ success: true, data: 'PONG' });
        });

        // Simular injeção bem-sucedida usando o mock global
        // @ts-expect-error - Mock simplificado para testes
        vi.mocked(chromeMock.scripting.executeScript).mockResolvedValue([{ result: true }]);

        await handleMessage(
          {
            type: 'START_CAPTURE',
            payload: { type: 'screenshot', storageType: 'standard' },
          },
          mockSender,
          mockLogger as unknown as Parameters<typeof handleMessage>[2],
          'test-correlation-id'
        );

        // Deve ter chamado reload com bypassCache
        expect(chromeMock.tabs.reload).toHaveBeenCalledWith(
          123,
          { bypassCache: true },
          expect.any(Function)
        );

        // Deve ter tentado injetar o script
        expect(chromeMock.scripting.executeScript).toHaveBeenCalled();
      });

      it('deve recarregar página com bypassCache antes da captura', async () => {
        // Resetar mocks e estado de captura para garantir estado limpo
        vi.clearAllMocks();
        await clearCaptureState();
        
        // Reconfigurar mock do reload
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (chromeMock.tabs.reload as any).mockImplementation(
          (tabId: number, _props: unknown, callback?: () => void) => {
            if (callback) { callback(); }
            setTimeout(() => {
              const listeners = vi.mocked(chromeMock.tabs.onUpdated.addListener).mock.calls;
              if (listeners.length > 0) {
                const lastListener = listeners[listeners.length - 1]?.[0];
                if (lastListener) {
                  lastListener(tabId, { status: 'complete' }, {} as chrome.tabs.Tab);
                }
              }
            }, 5);
            return Promise.resolve();
          }
        );

        // Simular usuário autenticado
        // @ts-expect-error - Mock simplificado para testes
        vi.mocked(chromeMock.storage.local.get).mockResolvedValue({
          accessToken: 'valid_token',
          refreshToken: 'refresh_token',
          expiresAt: Date.now() + 3600000,
          obtainedAt: Date.now(),
          user: { id: 'user_1', email: 'test@test.com', name: 'Test' },
        });

        // Simular aba ativa
        vi.mocked(chromeMock.tabs.query).mockResolvedValue([
          { id: 456, url: 'https://test-page.com', title: 'Test Page' } as chrome.tabs.Tab,
        ]);

        // Simular tabs.get
        vi.mocked(chromeMock.tabs.get).mockResolvedValue({
          id: 456,
          url: 'https://test-page.com',
          title: 'Test Page',
        } as chrome.tabs.Tab);

        // Simular content script disponível
        vi.mocked(chromeMock.tabs.sendMessage).mockResolvedValue({ success: true, data: { status: 'completed' } });

        await handleMessage(
          {
            type: 'START_CAPTURE',
            payload: { type: 'screenshot', storageType: 'standard' },
          },
          mockSender,
          mockLogger as unknown as Parameters<typeof handleMessage>[2],
          'test-correlation-id'
        );

        // Verificar que reload foi chamado com bypassCache: true
        expect(chromeMock.tabs.reload).toHaveBeenCalledWith(
          456,
          { bypassCache: true },
          expect.any(Function)
        );

        // Verificar que onUpdated listener foi registrado
        expect(chromeMock.tabs.onUpdated.addListener).toHaveBeenCalled();
      });
    });
  });
});
