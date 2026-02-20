/**
 * Testes unitários para CaptureStore
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCaptureStore, initCaptureListeners } from '@store/capture-store';
import type { CaptureData, ScreenshotCaptureProgress } from '@/types/capture.types';

const mockCapture: CaptureData = {
  id: 'capture-123',
  type: 'screenshot',
  storageType: 'standard',
  status: 'completed',
  url: 'https://example.com',
  title: 'Página de Teste',
  timestamp: new Date().toISOString(),
};

const mockProgress: ScreenshotCaptureProgress = {
  stage: 'capturing',
  percent: 50,
  message: 'Capturando viewport 2 de 4',
};

describe('CaptureStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCaptureStore.setState({
      isCapturing: false,
      currentCaptureId: null,
      currentCaptureType: null,
      currentStorageType: null,
      captureProgress: null,
      recentCaptures: [],
      isLoadingRecent: true,
      error: null,
      isStarting: false,
      isCancelling: false,
    });
  });

  afterEach(() => vi.clearAllMocks());

  describe('estado inicial', () => {
    it('deve ter estado inicial correto', () => {
      const state = useCaptureStore.getState();
      expect(state.isCapturing).toBe(false);
      expect(state.currentCaptureId).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('loadCaptureState', () => {
    it('deve carregar estado de captura do storage', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() =>
        Promise.resolve({
          lexato_capture_state: {
            isCapturing: true,
            currentCaptureId: 'capture-456',
            currentCaptureType: 'screenshot',
            currentStorageType: 'standard',
            progress: mockProgress,
          },
          lexato_recent_captures: [mockCapture],
        })
      );

      await useCaptureStore.getState().loadCaptureState();

      const state = useCaptureStore.getState();
      expect(state.isCapturing).toBe(true);
      expect(state.currentCaptureId).toBe('capture-456');
      expect(state.recentCaptures).toHaveLength(1);
      expect(state.isLoadingRecent).toBe(false);
    });

    it('deve usar valores padrão quando storage está vazio', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() => Promise.resolve({}));

      await useCaptureStore.getState().loadCaptureState();

      const state = useCaptureStore.getState();
      expect(state.isCapturing).toBe(false);
      expect(state.recentCaptures).toEqual([]);
    });

    it('deve tratar erro ao carregar estado', async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error('Storage error'));

      await useCaptureStore.getState().loadCaptureState();

      expect(useCaptureStore.getState().error).toBe('Erro ao carregar capturas');
    });
  });

  describe('startCapture', () => {
    it('deve iniciar captura com sucesso', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: true,
        captureId: 'new-capture-123',
      });

      const captureId = await useCaptureStore.getState().startCapture('screenshot', 'standard');

      expect(captureId).toBe('new-capture-123');
      const state = useCaptureStore.getState();
      expect(state.isCapturing).toBe(true);
      expect(state.currentCaptureId).toBe('new-capture-123');
      expect(state.currentCaptureType).toBe('screenshot');
    });

    it('deve tratar falha ao iniciar captura', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: false,
        error: 'Sem permissão',
      });

      await expect(useCaptureStore.getState().startCapture('screenshot', 'standard'))
        .rejects.toThrow('Sem permissão');

      expect(useCaptureStore.getState().error).toBe('Sem permissão');
    });

    it('deve tratar exceção durante início de captura', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Network error'));

      await expect(useCaptureStore.getState().startCapture('video', 'premium_20y'))
        .rejects.toThrow();

      expect(useCaptureStore.getState().isStarting).toBe(false);
    });
  });

  describe('cancelCapture', () => {
    it('deve cancelar captura em andamento', async () => {
      useCaptureStore.setState({
        isCapturing: true,
        currentCaptureId: 'capture-123',
        currentCaptureType: 'screenshot',
      });
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      await useCaptureStore.getState().cancelCapture();

      const state = useCaptureStore.getState();
      expect(state.isCapturing).toBe(false);
      expect(state.currentCaptureId).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalled();
    });

    it('deve tratar erro ao cancelar', async () => {
      useCaptureStore.setState({ isCapturing: true });
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Error'));

      await useCaptureStore.getState().cancelCapture();

      expect(useCaptureStore.getState().isCancelling).toBe(false);
    });
  });

  describe('stopVideoRecording', () => {
    it('deve enviar mensagem para parar gravação', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      await useCaptureStore.getState().stopVideoRecording();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CAPTURE_STOP_VIDEO' });
    });

    it('deve tratar erro ao parar gravação', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Error'));

      await useCaptureStore.getState().stopVideoRecording();
      // Não deve lançar exceção
    });
  });

  describe('updateProgress', () => {
    it('deve atualizar progresso da captura', () => {
      useCaptureStore.getState().updateProgress(mockProgress);
      expect(useCaptureStore.getState().captureProgress).toEqual(mockProgress);
    });
  });

  describe('completeCapture', () => {
    it('deve marcar captura como completa', () => {
      useCaptureStore.setState({ isCapturing: true });
      useCaptureStore.getState().completeCapture(mockCapture);
      expect(useCaptureStore.getState().isCapturing).toBe(false);
      expect(useCaptureStore.getState().recentCaptures).toContainEqual(mockCapture);
    });

    it('deve limitar capturas recentes a 20', () => {
      const manyCaptures = Array.from({ length: 25 }, (_, i) => ({
        ...mockCapture,
        id: `capture-${i}`,
      }));
      useCaptureStore.setState({ recentCaptures: manyCaptures.slice(0, 19) });

      useCaptureStore.getState().completeCapture(mockCapture);
      useCaptureStore.getState().completeCapture({ ...mockCapture, id: 'new-capture' });

      expect(useCaptureStore.getState().recentCaptures.length).toBeLessThanOrEqual(20);
    });
  });

  describe('failCapture', () => {
    it('deve marcar captura como falha', () => {
      useCaptureStore.setState({ isCapturing: true });
      useCaptureStore.getState().failCapture('Erro de rede');
      expect(useCaptureStore.getState().error).toBe('Erro de rede');
      expect(useCaptureStore.getState().isCapturing).toBe(false);
    });
  });

  describe('refreshRecentCaptures', () => {
    it('deve atualizar capturas recentes do backend', async () => {
      const captures = [mockCapture, { ...mockCapture, id: 'capture-456' }];
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ captures });

      await useCaptureStore.getState().refreshRecentCaptures();

      expect(useCaptureStore.getState().recentCaptures).toEqual(captures);
    });

    it('deve tratar erro ao atualizar capturas', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Error'));

      await useCaptureStore.getState().refreshRecentCaptures();
      // Não deve lançar exceção
    });
  });

  describe('addRecentCapture', () => {
    it('deve adicionar captura no início da lista', () => {
      useCaptureStore.setState({ recentCaptures: [{ ...mockCapture, id: 'old-capture' }] });

      useCaptureStore.getState().addRecentCapture(mockCapture);

      const captures = useCaptureStore.getState().recentCaptures;
      expect(captures[0]!.id).toBe('capture-123');
    });
  });

  describe('updateRecentCapture', () => {
    it('deve atualizar captura existente', () => {
      useCaptureStore.setState({ recentCaptures: [mockCapture] });

      useCaptureStore.getState().updateRecentCapture('capture-123', { status: 'uploading' });

      expect(useCaptureStore.getState().recentCaptures[0]!.status).toBe('uploading');
    });
  });

  describe('clearError', () => {
    it('deve limpar erro', () => {
      useCaptureStore.setState({ error: 'Erro de teste' });
      useCaptureStore.getState().clearError();
      expect(useCaptureStore.getState().error).toBeNull();
    });
  });

  describe('setCaptureState', () => {
    it('deve definir estado parcial', () => {
      useCaptureStore.getState().setCaptureState({ isCapturing: true, currentCaptureId: 'test' });

      const state = useCaptureStore.getState();
      expect(state.isCapturing).toBe(true);
      expect(state.currentCaptureId).toBe('test');
    });
  });

  describe('resetCaptureState', () => {
    it('deve resetar estado de captura', () => {
      useCaptureStore.setState({
        isCapturing: true,
        currentCaptureId: 'capture-123',
        error: 'Erro',
      });

      useCaptureStore.getState().resetCaptureState();

      const state = useCaptureStore.getState();
      expect(state.isCapturing).toBe(false);
      expect(state.currentCaptureId).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('initCaptureListeners', () => {
    it('deve adicionar e remover listeners', () => {
      const cleanup = initCaptureListeners();
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      cleanup();
      expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled();
    });

    it('deve processar mensagem CAPTURE_PROGRESS', () => {
      initCaptureListeners();
      const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]![0];

      listener({ type: 'CAPTURE_PROGRESS', payload: mockProgress }, {}, () => {});

      expect(useCaptureStore.getState().captureProgress).toEqual(mockProgress);
    });

    it('deve processar mensagem CAPTURE_COMPLETE', () => {
      useCaptureStore.setState({ isCapturing: true });
      initCaptureListeners();
      const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]![0];

      listener({ type: 'CAPTURE_COMPLETE', payload: mockCapture }, {}, () => {});

      expect(useCaptureStore.getState().isCapturing).toBe(false);
      expect(useCaptureStore.getState().recentCaptures).toContainEqual(mockCapture);
    });

    it('deve processar mensagem CAPTURE_ERROR', () => {
      useCaptureStore.setState({ isCapturing: true });
      initCaptureListeners();
      const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]![0];

      listener({ type: 'CAPTURE_ERROR', payload: { error: 'Erro de teste' } }, {}, () => {});

      expect(useCaptureStore.getState().error).toBe('Erro de teste');
      expect(useCaptureStore.getState().isCapturing).toBe(false);
    });

    it('deve processar mensagem CAPTURE_ERROR sem payload', () => {
      useCaptureStore.setState({ isCapturing: true });
      initCaptureListeners();
      const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]![0];

      listener({ type: 'CAPTURE_ERROR' }, {}, () => {});

      expect(useCaptureStore.getState().error).toBe('Erro na captura');
    });

    it('deve processar mensagem CAPTURE_CANCELLED', () => {
      useCaptureStore.setState({ isCapturing: true, currentCaptureId: 'test-123' });
      initCaptureListeners();
      const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]![0];

      listener({ type: 'CAPTURE_CANCELLED' }, {}, () => {});

      expect(useCaptureStore.getState().isCapturing).toBe(false);
      expect(useCaptureStore.getState().currentCaptureId).toBeNull();
    });

    it('deve atualizar estado quando storage de captura muda', () => {
      initCaptureListeners();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_capture_state: {
            newValue: {
              isCapturing: true,
              currentCaptureId: 'new-capture',
              currentCaptureType: 'video',
              currentStorageType: 'premium_20y',
              progress: mockProgress,
            },
            oldValue: null,
          },
        },
        'local'
      );

      const state = useCaptureStore.getState();
      expect(state.isCapturing).toBe(true);
      expect(state.currentCaptureId).toBe('new-capture');
      expect(state.currentCaptureType).toBe('video');
    });

    it('deve atualizar capturas recentes quando storage muda', () => {
      initCaptureListeners();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_recent_captures: {
            newValue: [mockCapture],
            oldValue: [],
          },
        },
        'local'
      );

      expect(useCaptureStore.getState().recentCaptures).toEqual([mockCapture]);
    });

    it('deve ignorar mudanças em outras áreas de storage', () => {
      useCaptureStore.setState({ isCapturing: false });
      initCaptureListeners();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_capture_state: {
            newValue: { isCapturing: true },
            oldValue: null,
          },
        },
        'sync'
      );

      expect(useCaptureStore.getState().isCapturing).toBe(false);
    });

    it('deve usar valores padrão quando newValue é undefined', () => {
      useCaptureStore.setState({ isCapturing: true, currentCaptureId: 'test' });
      initCaptureListeners();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_capture_state: {
            newValue: undefined,
            oldValue: { isCapturing: true },
          },
        },
        'local'
      );

      expect(useCaptureStore.getState().isCapturing).toBe(false);
      expect(useCaptureStore.getState().currentCaptureId).toBeNull();
    });

    it('deve usar array vazio quando recentCaptures newValue é undefined', () => {
      useCaptureStore.setState({ recentCaptures: [mockCapture] });
      initCaptureListeners();
      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]![0];

      listener(
        {
          lexato_recent_captures: {
            newValue: undefined,
            oldValue: [mockCapture],
          },
        },
        'local'
      );

      expect(useCaptureStore.getState().recentCaptures).toEqual([]);
    });
  });
});
