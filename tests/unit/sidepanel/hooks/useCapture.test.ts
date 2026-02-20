/**
 * Testes unitários para useCapture simplificado (Side Panel)
 *
 * Valida que o hook funciona corretamente no contexto do Side Panel,
 * sem lógica de abertura programática do Side Panel.
 *
 * Requisitos validados:
 * - 4.5: useCapture sem lógica de abertura programática do Side Panel
 *
 * @module useCapture.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';

// Mock do módulo useAnimatedProgress antes de importar o hook
vi.mock('../../../../src/hooks/useAnimatedProgress', () => ({
  resetGlobalMaxProgress: vi.fn(),
}));

// Mock do módulo logger
vi.mock('../../../../src/lib/logger', () => ({
  loggers: {
    sidePanel: {
      withPrefix: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    },
  },
}));

import { useCapture } from '../../../../src/sidepanel/hooks/useCapture';

// Dados de mock para o storage
const mockStorageData: Record<string, unknown> = {};

describe('useCapture (Side Panel - simplificado)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorageData).forEach((key) => delete mockStorageData[key]);

    // Configurar mock do chrome.storage.local.get
    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys) => {
      const result: Record<string, unknown> = {};
      if (keys === null || keys === undefined) {
        return { ...mockStorageData };
      }
      const keyArray = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
      keyArray.forEach((key) => {
        if (mockStorageData[key as string] !== undefined) {
          result[key as string] = mockStorageData[key as string];
        }
      });
      return result;
    });

    // Configurar mock do chrome.tabs.query para retornar aba ativa
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      { id: 42, windowId: 1, url: 'https://example.com' } as chrome.tabs.Tab,
    ]);
  });

  // ==========================================================================
  // Teste estático: código fonte não contém chrome.sidePanel.open
  // ==========================================================================

  describe('análise estática do código fonte', () => {
    it('NÃO deve conter chamadas a chrome.sidePanel.open no código executável', () => {
      const hookPath = path.resolve(__dirname, '../../../../src/sidepanel/hooks/useCapture.ts');
      const sourceCode = fs.readFileSync(hookPath, 'utf-8');

      // Remover comentários de linha e bloco para analisar apenas código executável
      const codeWithoutComments = sourceCode
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comentários de bloco
        .replace(/\/\/.*$/gm, '');         // Remove comentários de linha

      // Verificar que não há chamadas a chrome.sidePanel.open no código executável
      expect(codeWithoutComments).not.toMatch(/chrome\.sidePanel\.open/);
    });

    it('NÃO deve conter chamadas a window.close no código executável', () => {
      const hookPath = path.resolve(__dirname, '../../../../src/sidepanel/hooks/useCapture.ts');
      const sourceCode = fs.readFileSync(hookPath, 'utf-8');

      const codeWithoutComments = sourceCode
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      // Verificar que não há chamadas a window.close (lógica do popup)
      expect(codeWithoutComments).not.toMatch(/window\.close\s*\(/);
    });
  });

  // ==========================================================================
  // Comunicação com Service Worker: startCapture
  // ==========================================================================

  describe('startCapture - comunicação com Service Worker', () => {
    it('deve enviar mensagem START_CAPTURE ao service worker via chrome.runtime.sendMessage', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      await act(async () => {
        await result.current.startCapture('screenshot', 'standard');
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'START_CAPTURE',
          payload: expect.objectContaining({
            type: 'screenshot',
            storageType: 'standard',
          }),
        })
      );
    });

    it('deve incluir tabId na mensagem START_CAPTURE quando aba ativa está disponível', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      await act(async () => {
        await result.current.startCapture('video', 'premium_5y');
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'START_CAPTURE',
          payload: expect.objectContaining({
            type: 'video',
            storageType: 'premium_5y',
            tabId: 42,
          }),
        })
      );
    });

    it('deve atualizar isCapturing para true após sucesso', async () => {
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

    it('deve lançar erro quando service worker retorna falha', async () => {
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
    });
  });

  // ==========================================================================
  // Comunicação com Service Worker: cancelCapture
  // ==========================================================================

  describe('cancelCapture - comunicação com Service Worker', () => {
    it('deve enviar mensagem CAPTURE_CANCEL ao service worker', async () => {
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

    it('deve resetar isCapturing para false após cancelamento', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      // Iniciar captura primeiro
      await act(async () => {
        await result.current.startCapture('screenshot', 'standard');
      });
      expect(result.current.isCapturing).toBe(true);

      // Cancelar
      await act(async () => {
        await result.current.cancelCapture();
      });
      expect(result.current.isCapturing).toBe(false);
      expect(result.current.captureProgress).toBeNull();
    });
  });

  // ==========================================================================
  // Escuta de mensagens do Service Worker via chrome.runtime.onMessage
  // ==========================================================================

  describe('escuta de mensagens do Service Worker', () => {
    it('deve registrar listener em chrome.runtime.onMessage.addListener', () => {
      renderHook(() => useCapture());

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('deve remover listener ao desmontar o hook', () => {
      const { unmount } = renderHook(() => useCapture());

      unmount();

      expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled();
    });

    it('deve processar mensagem CAPTURE_PROGRESS e atualizar progresso', async () => {
      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      // Obter o handler registrado no addListener
      const addListenerCalls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
      // Pegar o último listener registrado (o do useEffect de mensagens)
      const messageHandler = addListenerCalls[addListenerCalls.length - 1]?.[0] as (
        message: { type: string; payload?: unknown },
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => void;

      expect(messageHandler).toBeDefined();

      // Simular mensagem de progresso
      act(() => {
        messageHandler(
          {
            type: 'CAPTURE_PROGRESS',
            payload: { stage: 'capturing', percent: 50, message: 'Capturando...' },
          },
          {} as chrome.runtime.MessageSender,
          vi.fn()
        );
      });

      expect(result.current.captureProgress).toEqual({
        stage: 'capturing',
        percent: 50,
        message: 'Capturando...',
      });
    });

    it('deve processar mensagem CAPTURE_COMPLETE e resetar estado', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      // Iniciar captura
      await act(async () => {
        await result.current.startCapture('screenshot', 'standard');
      });
      expect(result.current.isCapturing).toBe(true);

      // Obter handler de mensagens
      const addListenerCalls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
      const messageHandler = addListenerCalls[addListenerCalls.length - 1]?.[0] as (
        message: { type: string; payload?: unknown },
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => void;

      // Simular mensagem de captura completa
      act(() => {
        messageHandler(
          { type: 'CAPTURE_COMPLETE' },
          {} as chrome.runtime.MessageSender,
          vi.fn()
        );
      });

      expect(result.current.isCapturing).toBe(false);
      expect(result.current.captureProgress).toBeNull();
    });

    it('deve processar mensagem CAPTURE_ERROR e definir erro', async () => {
      const { result } = renderHook(() => useCapture());

      await waitFor(() => {
        expect(result.current.isLoadingRecent).toBe(false);
      });

      // Obter handler de mensagens
      const addListenerCalls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
      const messageHandler = addListenerCalls[addListenerCalls.length - 1]?.[0] as (
        message: { type: string; payload?: unknown },
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => void;

      // Simular mensagem de erro
      act(() => {
        messageHandler(
          {
            type: 'CAPTURE_ERROR',
            payload: { error: 'Erro ao capturar tela' },
          },
          {} as chrome.runtime.MessageSender,
          vi.fn()
        );
      });

      expect(result.current.isCapturing).toBe(false);
      expect(result.current.error).toBe('Erro ao capturar tela');
    });
  });
});
