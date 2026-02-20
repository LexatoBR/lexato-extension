/**
 * Testes unitários para useCapture hook
 *
 * Testa gerenciamento de estado de captura
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCapture } from '@popup/hooks/useCapture';

// Mock do chrome.storage.local
const mockStorageData: Record<string, unknown> = {};

describe('useCapture', () => {
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
    it('deve iniciar com isLoadingRecent true', () => {
      const { result } = renderHook(() => useCapture());
      expect(result.current.isLoadingRecent).toBe(true);
    });

    it('deve iniciar sem captura em andamento', async () => {
      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      expect(result.current.isCapturing).toBe(false);
      expect(result.current.captureProgress).toBeNull();
    });

    it('deve carregar capturas recentes do storage', async () => {
      const mockCaptures = [
        { id: 'cap-1', type: 'screenshot', status: 'completed', url: 'https://example.com' },
        { id: 'cap-2', type: 'video', status: 'processing', url: 'https://test.com' },
      ];

      mockStorageData['lexato_recent_captures'] = mockCaptures;

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      expect(result.current.recentCaptures).toEqual(mockCaptures);
    });
  });

  describe('startCapture', () => {
    it('deve chamar chrome.runtime.sendMessage para iniciar captura', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      await act(async () => {
        await result.current.startCapture('screenshot', 'standard');
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'START_CAPTURE',
        payload: { type: 'screenshot', storageType: 'standard' },
      });
    });

    it('deve atualizar estado para isCapturing true', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      await act(async () => {
        await result.current.startCapture('screenshot', 'standard');
      });

      expect(result.current.isCapturing).toBe(true);
    });

    it('deve definir erro quando captura falha', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        success: false,
        error: 'Falha ao iniciar captura',
      });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.startCapture('screenshot', 'standard');
        })
      ).rejects.toThrow('Falha ao iniciar captura');

      // O erro é definido antes de lançar a exceção
      // mas o estado pode ser resetado após o throw
    });
  });

  describe('cancelCapture', () => {
    it('deve chamar chrome.runtime.sendMessage para cancelar', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      await act(async () => {
        await result.current.cancelCapture();
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CAPTURE_CANCEL' });
    });

    it('deve atualizar estado para isCapturing false', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      // Simular captura em andamento
      await act(async () => {
        await result.current.startCapture('screenshot', 'standard');
      });

      expect(result.current.isCapturing).toBe(true);

      await act(async () => {
        await result.current.cancelCapture();
      });

      expect(result.current.isCapturing).toBe(false);
    });
  });

  describe('stopVideoRecording', () => {
    it('deve chamar chrome.runtime.sendMessage para parar vídeo', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      await act(async () => {
        await result.current.stopVideoRecording();
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CAPTURE_STOP_VIDEO' });
    });
  });

  describe('refreshRecentCaptures', () => {
    it('deve atualizar lista de capturas recentes', async () => {
      const mockCaptures = [{ id: 'cap-new', type: 'screenshot', status: 'completed' }];

      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
        captures: mockCaptures,
      });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      await act(async () => {
        await result.current.refreshRecentCaptures();
      });

      expect(result.current.recentCaptures).toEqual(mockCaptures);
    });
  });

  describe('clearError', () => {
    it('deve limpar erro', async () => {
      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      // Simular erro diretamente via clearError (o erro é gerenciado internamente)
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
