/**
 * Testes unitários para useCredits hook
 *
 * Testa gerenciamento de saldo de créditos
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCredits } from '@popup/hooks/useCredits';

// Mock do chrome.storage.local
const mockStorageData: Record<string, unknown> = {};

describe('useCredits', () => {
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
  });

  describe('estado inicial', () => {
    it('deve iniciar com isLoading true', () => {
      const { result } = renderHook(() => useCredits());
      expect(result.current.isLoading).toBe(true);
    });

    it('deve iniciar com 0 créditos quando storage vazio', async () => {
      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.credits).toBe(0);
    });

    it('deve carregar créditos do usuário no storage', async () => {
      mockStorageData['lexato_user'] = { id: 'user-1', credits: 50 };

      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.credits).toBe(50);
    });
  });

  describe('getStorageCost', () => {
    it('deve retornar 1 para standard', async () => {
      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getStorageCost('standard')).toBe(1);
    });

    it('deve retornar 5 para premium_5y', async () => {
      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getStorageCost('premium_5y')).toBe(5);
    });

    it('deve retornar 10 para premium_10y', async () => {
      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getStorageCost('premium_10y')).toBe(10);
    });

    it('deve retornar 20 para premium_20y', async () => {
      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.getStorageCost('premium_20y')).toBe(20);
    });
  });

  describe('hasEnoughCredits', () => {
    it('deve retornar true quando tem créditos suficientes', async () => {
      mockStorageData['lexato_user'] = { credits: 10 };

      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasEnoughCredits('standard')).toBe(true);
      expect(result.current.hasEnoughCredits('premium_5y')).toBe(true);
      expect(result.current.hasEnoughCredits('premium_10y')).toBe(true);
    });

    it('deve retornar false quando não tem créditos suficientes', async () => {
      mockStorageData['lexato_user'] = { credits: 3 };

      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasEnoughCredits('standard')).toBe(true);
      expect(result.current.hasEnoughCredits('premium_5y')).toBe(false);
      expect(result.current.hasEnoughCredits('premium_10y')).toBe(false);
    });
  });

  describe('canUsePremium', () => {
    it('deve sempre retornar true para standard', async () => {
      mockStorageData['lexato_user'] = { credits: 0 };

      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canUsePremium('standard')).toBe(true);
    });

    it('deve retornar true para premium quando tem créditos', async () => {
      mockStorageData['lexato_user'] = { credits: 20 };

      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canUsePremium('premium_5y')).toBe(true);
      expect(result.current.canUsePremium('premium_10y')).toBe(true);
      expect(result.current.canUsePremium('premium_20y')).toBe(true);
    });

    it('deve retornar false para premium quando não tem créditos', async () => {
      mockStorageData['lexato_user'] = { credits: 4 };

      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canUsePremium('premium_5y')).toBe(false);
      expect(result.current.canUsePremium('premium_10y')).toBe(false);
    });
  });

  describe('refreshCredits', () => {
    it('deve atualizar créditos do servidor', async () => {
      mockStorageData['lexato_user'] = { credits: 10 };

      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        credits: 25,
      });

      const { result } = renderHook(() => useCredits());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.credits).toBe(10);

      await act(async () => {
        await result.current.refreshCredits();
      });

      expect(result.current.credits).toBe(25);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CREDITS_REFRESH' });
    });
  });
});
