/**
 * Testes unitários para useAuth hook
 *
 * Testa gerenciamento de estado de autenticação
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '@popup/hooks/useAuth';

// Mock do chrome.storage.local
const mockStorageData: Record<string, unknown> = {};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorageData).forEach((key) => delete mockStorageData[key]);

    // Configurar mock do chrome.storage.local.get
    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys) => {
      const result: Record<string, unknown> = {};
      const keyArray = Array.isArray(keys) ? keys : [keys];
      keyArray.forEach((key) => {
        if (mockStorageData[key as string] !== undefined) {
          result[key as string] = mockStorageData[key as string];
        }
      });
      return result;
    });

    // Configurar mock do chrome.storage.local.remove
    vi.mocked(chrome.storage.local.remove).mockImplementation(async (keys) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      keyArray.forEach((key) => delete mockStorageData[key as string]);
    });
  });

  describe('estado inicial', () => {
    it('deve iniciar com isLoading true', () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(true);
    });

    it('deve iniciar não autenticado quando storage vazio', async () => {
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('deve carregar usuário autenticado do storage', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', credits: 100 };
      const futureTime = Date.now() + 3600000; // 1 hora no futuro

      mockStorageData['lexato_access_token'] = 'access-token';
      mockStorageData['lexato_refresh_token'] = 'refresh-token';
      mockStorageData['lexato_expires_at'] = futureTime;
      mockStorageData['lexato_obtained_at'] = Date.now();
      mockStorageData['lexato_user'] = mockUser;

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
    });
  });

  describe('login', () => {
    it('deve chamar chrome.runtime.sendMessage com credenciais', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        success: true,
        user: { id: 'user-1', email: 'test@example.com' },
        tokens: { accessToken: 'token' },
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'LOGIN',
        payload: { email: 'test@example.com', password: 'password123' },
      });
    });

    it('deve retornar mfaRequired quando MFA necessário', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        success: false,
        mfaRequired: true,
        mfaSession: 'mfa-session-123',
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let loginResult;
      await act(async () => {
        loginResult = await result.current.login('test@example.com', 'password123');
      });

      expect(loginResult).toEqual({
        success: false,
        mfaRequired: true,
        mfaSession: 'mfa-session-123',
      });
    });

    it('deve definir erro quando login falha', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        success: false,
        error: 'Credenciais inválidas',
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.login('test@example.com', 'wrong-password');
      });

      expect(result.current.error).toBe('Credenciais inválidas');
    });
  });

  describe('completeMfa', () => {
    it('deve chamar chrome.runtime.sendMessage com código MFA', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        success: true,
        user: { id: 'user-1' },
        tokens: { accessToken: 'token' },
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.completeMfa('123456', 'mfa-session');
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'MFA_VERIFY',
        payload: { code: '123456', session: 'mfa-session' },
      });
    });
  });

  describe('logout', () => {
    it('deve limpar estado e storage ao fazer logout', async () => {
      mockStorageData['lexato_access_token'] = 'token';
      mockStorageData['lexato_user'] = { id: 'user-1' };

      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalled();
    });
  });

  describe('clearError', () => {
    it('deve limpar erro', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        success: false,
        error: 'Erro de teste',
      });

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password');
      });

      expect(result.current.error).toBe('Erro de teste');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
