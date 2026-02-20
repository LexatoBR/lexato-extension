/**
 * Testes unitários para AuthStore
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore, initAuthStorageListener } from '@store/auth-store';
import type { AuthUser, AuthTokens } from '@/types/auth.types';

const mockUser: AuthUser = {
  id: 'user-123',
  email: 'teste@lexato.com.br',
  name: 'Usuário Teste',
  accountType: 'individual',
  credits: 100,
  mfaEnabled: false,
};

const mockTokens: AuthTokens = {
  accessToken: 'access-token-123',
  refreshToken: 'refresh-token-456',
  expiresAt: Date.now() + 3600000,
  obtainedAt: Date.now(),
};

describe('AuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      tokens: null,
      error: null,
      isLoggingIn: false,
      isLoggingOut: false,
    });
  });

  afterEach(() => vi.clearAllMocks());

  describe('estado inicial', () => {
    it('deve ter estado inicial correto', () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(true);
      expect(state.user).toBeNull();
    });
  });

  describe('loadAuthState', () => {
    it('deve carregar estado autenticado do storage', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() => 
        Promise.resolve({
          lexato_access_token: mockTokens.accessToken,
          lexato_refresh_token: mockTokens.refreshToken,
          lexato_expires_at: mockTokens.expiresAt,
          lexato_obtained_at: mockTokens.obtainedAt,
          lexato_user: mockUser,
        })
      );

      await useAuthStore.getState().loadAuthState();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual(mockUser);
    });

    it('deve definir não autenticado quando não há tokens', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() => Promise.resolve({}));

      await useAuthStore.getState().loadAuthState();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('deve tentar refresh quando token expirou', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() => 
        Promise.resolve({
          lexato_access_token: mockTokens.accessToken,
          lexato_refresh_token: mockTokens.refreshToken,
          lexato_expires_at: Date.now() - 1000, // Expirado
          lexato_obtained_at: mockTokens.obtainedAt,
          lexato_user: mockUser,
        })
      );
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: false });

      await useAuthStore.getState().loadAuthState();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'AUTH_REFRESH_TOKEN' });
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('deve tratar erro ao carregar estado', async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error('Storage error'));

      await useAuthStore.getState().loadAuthState();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Erro ao verificar autenticação');
    });
  });

  describe('login', () => {
    it('deve realizar login com sucesso', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: true,
        user: mockUser,
        tokens: mockTokens,
      });
      vi.mocked(chrome.storage.local.get).mockImplementation(() => 
        Promise.resolve({
          lexato_access_token: mockTokens.accessToken,
          lexato_refresh_token: mockTokens.refreshToken,
          lexato_expires_at: mockTokens.expiresAt,
          lexato_obtained_at: mockTokens.obtainedAt,
          lexato_user: mockUser,
        })
      );

      const result = await useAuthStore.getState().login('teste@lexato.com.br', 'senha123');

      expect(result.success).toBe(true);
      expect(useAuthStore.getState().isLoggingIn).toBe(false);
    });

    it('deve retornar mfaRequired quando MFA é necessário', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: false,
        mfaRequired: true,
        mfaSession: 'session-123',
      });

      const result = await useAuthStore.getState().login('teste@lexato.com.br', 'senha123');

      expect(result.success).toBe(false);
      expect(result.mfaRequired).toBe(true);
      expect(result.mfaSession).toBe('session-123');
    });

    it('deve tratar erro de login', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: false,
        error: 'Credenciais inválidas',
      });

      const result = await useAuthStore.getState().login('teste@lexato.com.br', 'senha-errada');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credenciais inválidas');
      expect(useAuthStore.getState().error).toBe('Credenciais inválidas');
    });

    it('deve tratar exceção durante login', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Network error'));

      const result = await useAuthStore.getState().login('teste@lexato.com.br', 'senha123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro ao conectar com o servidor');
    });
  });

  describe('completeMfa', () => {
    it('deve completar MFA com sucesso', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: true,
        user: mockUser,
        tokens: mockTokens,
      });
      vi.mocked(chrome.storage.local.get).mockImplementation(() =>
        Promise.resolve({
          lexato_access_token: mockTokens.accessToken,
          lexato_refresh_token: mockTokens.refreshToken,
          lexato_expires_at: mockTokens.expiresAt,
          lexato_obtained_at: mockTokens.obtainedAt,
          lexato_user: mockUser,
        })
      );

      const result = await useAuthStore.getState().completeMfa('123456', 'session-123');

      expect(result.success).toBe(true);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTH_MFA_VERIFY',
        payload: { code: '123456', session: 'session-123' },
      });
    });

    it('deve tratar código MFA inválido', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: false,
        error: 'Código inválido',
      });

      const result = await useAuthStore.getState().completeMfa('000000', 'session-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Código inválido');
    });

    it('deve tratar exceção durante verificação MFA', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Network error'));

      const result = await useAuthStore.getState().completeMfa('123456', 'session-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro ao verificar código');
    });
  });

  describe('logout', () => {
    it('deve realizar logout com sucesso', async () => {
      useAuthStore.setState({ isAuthenticated: true, user: mockUser, tokens: mockTokens });
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalled();
    });

    it('deve tratar erro durante logout', async () => {
      useAuthStore.setState({ isAuthenticated: true, user: mockUser });
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Logout error'));

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().isLoggingOut).toBe(false);
    });
  });

  describe('refreshUser', () => {
    it('deve atualizar dados do usuário', async () => {
      const updatedUser = { ...mockUser, credits: 200 };
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ user: updatedUser });

      await useAuthStore.getState().refreshUser();

      expect(useAuthStore.getState().user).toEqual(updatedUser);
    });

    it('deve tratar erro ao atualizar usuário', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Error'));

      await useAuthStore.getState().refreshUser();
      // Não deve lançar exceção
    });
  });

  describe('setAuthState', () => {
    it('deve definir estado parcial', () => {
      useAuthStore.getState().setAuthState({ isAuthenticated: true, user: mockUser });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
    });
  });

  describe('clearError', () => {
    it('deve limpar erro', () => {
      useAuthStore.setState({ error: 'Erro de teste' });
      useAuthStore.getState().clearError();
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('updateCredits', () => {
    it('deve atualizar créditos do usuário', () => {
      useAuthStore.setState({ user: mockUser });
      useAuthStore.getState().updateCredits(50);
      expect(useAuthStore.getState().user?.credits).toBe(50);
    });

    it('não deve fazer nada se não há usuário', () => {
      useAuthStore.getState().updateCredits(50);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('initAuthStorageListener', () => {
    it('deve adicionar e remover listener', () => {
      const cleanup = initAuthStorageListener();
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
      cleanup();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('deve recarregar estado quando chave de auth muda', () => {
      const loadAuthStateSpy = vi.spyOn(useAuthStore.getState(), 'loadAuthState');
      initAuthStorageListener();

      // Simular mudança de storage
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];
      listener(
        { lexato_access_token: { newValue: 'new-token', oldValue: 'old-token' } },
        'local'
      );

      expect(loadAuthStateSpy).toHaveBeenCalled();
    });

    it('deve ignorar mudanças em outras áreas de storage', () => {
      const loadAuthStateSpy = vi.spyOn(useAuthStore.getState(), 'loadAuthState');
      initAuthStorageListener();

      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];
      listener(
        { lexato_access_token: { newValue: 'new-token', oldValue: 'old-token' } },
        'sync'
      );

      expect(loadAuthStateSpy).not.toHaveBeenCalled();
    });

    it('deve ignorar mudanças em chaves não relacionadas a auth', () => {
      const loadAuthStateSpy = vi.spyOn(useAuthStore.getState(), 'loadAuthState');
      initAuthStorageListener();

      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];
      listener(
        { other_key: { newValue: 'value', oldValue: 'old' } },
        'local'
      );

      expect(loadAuthStateSpy).not.toHaveBeenCalled();
    });
  });

  describe('loadAuthState com idToken', () => {
    it('deve carregar idToken quando presente', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() =>
        Promise.resolve({
          lexato_access_token: mockTokens.accessToken,
          lexato_refresh_token: mockTokens.refreshToken,
          lexato_id_token: 'id-token-789',
          lexato_expires_at: mockTokens.expiresAt,
          lexato_obtained_at: mockTokens.obtainedAt,
          lexato_user: mockUser,
        })
      );

      await useAuthStore.getState().loadAuthState();

      const state = useAuthStore.getState();
      expect(state.tokens?.idToken).toBe('id-token-789');
    });
  });

  describe('loadAuthState com refresh bem-sucedido', () => {
    it('deve manter autenticação após refresh bem-sucedido', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() =>
        Promise.resolve({
          lexato_access_token: mockTokens.accessToken,
          lexato_refresh_token: mockTokens.refreshToken,
          lexato_expires_at: Date.now() - 1000, // Expirado
          lexato_obtained_at: mockTokens.obtainedAt,
          lexato_user: mockUser,
        })
      );
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      await useAuthStore.getState().loadAuthState();

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });
});
