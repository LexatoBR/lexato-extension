/**
 * Testes unitários para o AuthManager da Extensão Chrome Lexato
 *
 * Testa login, logout, refresh de tokens e MFA
 *
 * @module AuthManagerTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chromeMock } from '../../setup';

// Mock do AuditLogger
vi.mock('../../../src/lib/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    getCorrelationId: vi.fn(() => 'test-correlation-id'),
  })),
}));

// Mock do fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  AuthManager,
  getAuthManager,
  resetAuthManager,
  AUTH_STORAGE_KEYS,
  type AuthManagerConfig,
} from '../../../src/background/auth-manager';
import type { AuthTokens, AuthUser } from '../../../src/types/auth.types';

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockStorage: Record<string, unknown>;

  const mockConfig: AuthManagerConfig = {
    authApiUrl: 'https://api.lexato.com.br',
    cognitoClientId: 'test-client-id',
    cognitoRegion: 'us-east-1',
  };

  const mockTokens: AuthTokens = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    idToken: 'test-id-token',
    expiresAt: Date.now() + 3600000, // 1 hora no futuro
    obtainedAt: Date.now(),
  };

  const mockUser: AuthUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    accountType: 'individual',
    credits: 100,
    mfaEnabled: false,
  };

  const mockCognitoResponse = {
    AuthenticationResult: {
      AccessToken: mockTokens.accessToken,
      RefreshToken: mockTokens.refreshToken,
      IdToken: mockTokens.idToken,
      ExpiresIn: 3600,
      TokenType: 'Bearer',
    },
  };

  beforeEach(() => {
    mockStorage = {};
    resetAuthManager();

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

    // Configurar mock do chrome.alarms
    vi.mocked(chromeMock.alarms.create).mockResolvedValue(undefined);
    // @ts-expect-error - Mock retorna boolean mas tipo espera void
    vi.mocked(chromeMock.alarms.clear).mockResolvedValue(true);

    // Reset fetch mock
    mockFetch.mockReset();

    authManager = new AuthManager(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockStorage = {};
  });

  describe('Construtor', () => {
    it('deve criar instância com configuração', () => {
      expect(authManager).toBeDefined();
      expect(authManager.getConfig().authApiUrl).toBe(mockConfig.authApiUrl);
    });
  });

  describe('Login (Requisito 13.1)', () => {
    it('deve realizar login com sucesso', async () => {
      // Mock das chamadas de API
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCognitoResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUser),
        });

      const result = await authManager.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe(mockUser.email);
      expect(result.tokens).toBeDefined();
    });

    it('deve retornar erro para credenciais inválidas', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid credentials' }),
      });

      const result = await authManager.login({
        email: 'test@example.com',
        password: 'wrong-password',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('deve retornar mfaRequired quando MFA é necessário (Requisito 13.6)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ChallengeName: 'SOFTWARE_TOKEN_MFA',
            Session: 'mfa-session-token',
            ChallengeParameters: {},
          }),
      });

      const result = await authManager.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.mfaRequired).toBe(true);
      expect(result.mfaSession).toBe('mfa-session-token');
    });

    it('deve armazenar tokens após login bem-sucedido (Requisito 13.2)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCognitoResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUser),
        });

      await authManager.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(chromeMock.storage.local.set).toHaveBeenCalled();
      expect(mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN]).toBe(mockTokens.accessToken);
      expect(mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN]).toBe(mockTokens.refreshToken);
    });

    it('deve iniciar verificação de refresh após login (Requisito 13.5)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCognitoResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUser),
        });

      await authManager.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(chromeMock.alarms.create).toHaveBeenCalled();
    });
  });

  describe('MFA (Requisito 13.6)', () => {
    it('deve completar login com código MFA válido', async () => {
      // Armazenar sessão MFA
      mockStorage[AUTH_STORAGE_KEYS.MFA_SESSION] = 'mfa-session-token';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCognitoResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUser),
        });

      const result = await authManager.completeMfaLogin('123456');

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
    });

    it('deve retornar erro para código MFA inválido', async () => {
      mockStorage[AUTH_STORAGE_KEYS.MFA_SESSION] = 'mfa-session-token';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid MFA code' }),
      });

      const result = await authManager.completeMfaLogin('000000');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('deve retornar erro se sessão MFA expirou', async () => {
      // Sem sessão MFA armazenada
      const result = await authManager.completeMfaLogin('123456');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Logout (Requisito 13.3)', () => {
    it('deve limpar todos os dados de autenticação', async () => {
      // Configurar dados de autenticação
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.USER] = mockUser;

      await authManager.logout();

      expect(chromeMock.storage.local.remove).toHaveBeenCalled();
      expect(chromeMock.alarms.clear).toHaveBeenCalled();
    });

    it('deve parar verificação de refresh', async () => {
      await authManager.logout();

      expect(chromeMock.alarms.clear).toHaveBeenCalledWith('lexato-token-refresh-check');
    });
  });

  describe('Verificação de Estado (Requisito 13.4)', () => {
    it('deve retornar não autenticado quando não há tokens', async () => {
      const state = await authManager.getAuthState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
    });

    it('deve retornar autenticado quando há tokens válidos', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.ID_TOKEN] = mockTokens.idToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = mockTokens.expiresAt;
      mockStorage[AUTH_STORAGE_KEYS.OBTAINED_AT] = mockTokens.obtainedAt;
      mockStorage[AUTH_STORAGE_KEYS.USER] = mockUser;

      const state = await authManager.getAuthState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
    });

    it('deve tentar refresh quando token expirou', async () => {
      const expiredTokens = {
        ...mockTokens,
        expiresAt: Date.now() - 1000, // Expirado
      };

      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = expiredTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = expiredTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = expiredTokens.expiresAt;
      mockStorage[AUTH_STORAGE_KEYS.USER] = mockUser;

      // Mock do refresh bem-sucedido
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCognitoResponse),
      });

      const state = await authManager.getAuthState();

      expect(mockFetch).toHaveBeenCalled();
      expect(state.isAuthenticated).toBe(true);
    });

    it('deve retornar não autenticado se refresh falhar', async () => {
      const expiredTokens = {
        ...mockTokens,
        expiresAt: Date.now() - 1000, // Expirado
      };

      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = expiredTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = expiredTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = expiredTokens.expiresAt;
      mockStorage[AUTH_STORAGE_KEYS.USER] = mockUser;

      // Mock do refresh falho
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Token expired' }),
      });

      const state = await authManager.getAuthState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeDefined();
    });
  });

  describe('isAuthenticated', () => {
    it('deve retornar true quando autenticado', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = mockTokens.expiresAt;
      mockStorage[AUTH_STORAGE_KEYS.USER] = mockUser;

      const result = await authManager.isAuthenticated();

      expect(result).toBe(true);
    });

    it('deve retornar false quando não autenticado', async () => {
      const result = await authManager.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('checkTokenValidity (Requisito 13.4)', () => {
    it('deve retornar true para token válido', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = Date.now() + 3600000; // 1 hora

      const result = await authManager.checkTokenValidity();

      expect(result).toBe(true);
    });

    it('deve retornar false para token expirado', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = Date.now() - 1000; // Expirado

      // Mock do refresh falho
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      });

      const result = await authManager.checkTokenValidity();

      expect(result).toBe(false);
    });

    it('deve tentar refresh quando token expira em breve', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = Date.now() + 2 * 60 * 1000; // 2 minutos

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCognitoResponse),
      });

      const result = await authManager.checkTokenValidity();

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('deve retornar false quando não há tokens', async () => {
      const result = await authManager.checkTokenValidity();

      expect(result).toBe(false);
    });
  });

  describe('Refresh de Token (Requisito 13.5)', () => {
    it('deve realizar refresh com sucesso', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCognitoResponse),
      });

      const result = await authManager.refreshTokens();

      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
    });

    it('deve retornar erro quando refresh falha', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Token expired' }),
      });

      const result = await authManager.refreshTokens();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('deve retornar erro quando não há refresh token', async () => {
      const result = await authManager.refreshTokens();

      expect(result.success).toBe(false);
    });

    it('deve evitar múltiplos refreshes simultâneos', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCognitoResponse),
      });

      // Iniciar múltiplos refreshes simultaneamente
      const [result1, result2, result3] = await Promise.all([
        authManager.refreshTokens(),
        authManager.refreshTokens(),
        authManager.refreshTokens(),
      ]);

      // Todos devem ter sucesso
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // Mas apenas uma chamada de API deve ter sido feita
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleRefreshAlarm', () => {
    it('deve fazer refresh quando token expira em breve', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = Date.now() + 2 * 60 * 1000; // 2 minutos

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCognitoResponse),
      });

      await authManager.handleRefreshAlarm();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('deve parar verificação quando não há tokens', async () => {
      await authManager.handleRefreshAlarm();

      expect(chromeMock.alarms.clear).toHaveBeenCalled();
    });

    it('não deve fazer refresh quando token ainda é válido', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = Date.now() + 30 * 60 * 1000; // 30 minutos

      await authManager.handleRefreshAlarm();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getStoredTokens', () => {
    it('deve retornar tokens armazenados', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;
      mockStorage[AUTH_STORAGE_KEYS.ID_TOKEN] = mockTokens.idToken;
      mockStorage[AUTH_STORAGE_KEYS.EXPIRES_AT] = mockTokens.expiresAt;
      mockStorage[AUTH_STORAGE_KEYS.OBTAINED_AT] = mockTokens.obtainedAt;

      const result = await authManager.getStoredTokens();

      expect(result).toEqual(mockTokens);
    });

    it('deve retornar null se não houver tokens', async () => {
      const result = await authManager.getStoredTokens();

      expect(result).toBeNull();
    });

    it('deve retornar null se faltar accessToken', async () => {
      mockStorage[AUTH_STORAGE_KEYS.REFRESH_TOKEN] = mockTokens.refreshToken;

      const result = await authManager.getStoredTokens();

      expect(result).toBeNull();
    });

    it('deve retornar null se faltar refreshToken', async () => {
      mockStorage[AUTH_STORAGE_KEYS.ACCESS_TOKEN] = mockTokens.accessToken;

      const result = await authManager.getStoredTokens();

      expect(result).toBeNull();
    });
  });

  describe('getStoredUser', () => {
    it('deve retornar usuário armazenado', async () => {
      mockStorage[AUTH_STORAGE_KEYS.USER] = mockUser;

      const result = await authManager.getStoredUser();

      expect(result).toEqual(mockUser);
    });

    it('deve retornar null se não houver usuário', async () => {
      const result = await authManager.getStoredUser();

      expect(result).toBeNull();
    });
  });

  describe('getRefreshAlarmName', () => {
    it('deve retornar nome do alarme', () => {
      const name = AuthManager.getRefreshAlarmName();

      expect(name).toBe('lexato-token-refresh-check');
    });
  });
});

describe('Singleton', () => {
  beforeEach(() => {
    resetAuthManager();
  });

  afterEach(() => {
    resetAuthManager();
  });

  const mockConfig: AuthManagerConfig = {
    authApiUrl: 'https://api.lexato.com.br',
    cognitoClientId: 'test-client-id',
    cognitoRegion: 'us-east-1',
  };

  it('deve criar instância com configuração', () => {
    const manager = getAuthManager(mockConfig);

    expect(manager).toBeDefined();
    expect(manager.getConfig().authApiUrl).toBe(mockConfig.authApiUrl);
  });

  it('deve retornar mesma instância em chamadas subsequentes', () => {
    const manager1 = getAuthManager(mockConfig);
    const manager2 = getAuthManager();

    expect(manager1).toBe(manager2);
  });

  it('deve lançar erro se não inicializado', () => {
    expect(() => getAuthManager()).toThrow('AuthManager não inicializado');
  });

  it('deve permitir reset da instância', () => {
    const manager1 = getAuthManager(mockConfig);
    resetAuthManager();
    const manager2 = getAuthManager(mockConfig);

    expect(manager1).not.toBe(manager2);
  });
});
