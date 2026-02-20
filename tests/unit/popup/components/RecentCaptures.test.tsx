/**
 * Testes unitários para RecentCaptures
 *
 * Testa lista de capturas recentes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RecentCaptures from '@popup/components/RecentCaptures';
import * as useCaptureModule from '@popup/hooks/useCapture';
import type { CaptureData } from '../../../../src/types/capture.types';

// Mock do hook useCapture
vi.mock('@popup/hooks/useCapture', () => ({
  useCapture: vi.fn(),
}));

describe('RecentCaptures', () => {
  const mockUseCapture = vi.mocked(useCaptureModule.useCapture);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('estado de carregamento', () => {
    it('deve exibir skeleton quando carregando', () => {
      mockUseCapture.mockReturnValue({
        recentCaptures: [],
        isLoadingRecent: true,
        isCapturing: false,
        captureProgress: null,
        error: null,
        errorDetails: null,
        isRetryable: false,
        retryCount: 0,
        isRetrying: false,
        startCapture: vi.fn(),
        cancelCapture: vi.fn(),
        stopVideoRecording: vi.fn(),
        refreshRecentCaptures: vi.fn(),
        clearError: vi.fn(),
        retryCapture: vi.fn(),
        clearErrorState: vi.fn(),
        clearCaptureCache: vi.fn(),
      });

      render(<RecentCaptures />);

      expect(screen.getByText('Capturas recentes')).toBeInTheDocument();
      // Verifica se há elementos de loading (skeleton)
      const skeletons = document.querySelectorAll('.animate-loading');
      expect(skeletons.length).toBe(3);
    });
  });

  describe('lista vazia', () => {
    it('deve exibir mensagem quando não há capturas', () => {
      mockUseCapture.mockReturnValue({
        recentCaptures: [],
        isLoadingRecent: false,
        isCapturing: false,
        captureProgress: null,
        error: null,
        errorDetails: null,
        isRetryable: false,
        retryCount: 0,
        isRetrying: false,
        startCapture: vi.fn(),
        cancelCapture: vi.fn(),
        stopVideoRecording: vi.fn(),
        refreshRecentCaptures: vi.fn(),
        clearError: vi.fn(),
        retryCapture: vi.fn(),
        clearErrorState: vi.fn(),
        clearCaptureCache: vi.fn(),
      });

      render(<RecentCaptures />);

      expect(screen.getByText('Nenhuma captura recente')).toBeInTheDocument();
      expect(screen.getByText('Suas capturas aparecerão aqui')).toBeInTheDocument();
    });
  });

  describe('lista com capturas', () => {
    const mockCaptures: CaptureData[] = [
      {
        id: 'cap-1',
        type: 'screenshot',
        storageType: 'standard',
        status: 'completed',
        url: 'https://example.com/page',
        title: 'Página de Exemplo',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'cap-2',
        type: 'video',
        storageType: 'premium_5y',
        status: 'processing',
        url: 'https://test.com/video',
        title: 'Vídeo de Teste',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hora atrás
      },
      {
        id: 'cap-3',
        type: 'screenshot',
        storageType: 'standard',
        status: 'failed',
        url: 'https://failed.com',
        title: 'Captura Falhou',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 dia atrás
        error: 'Erro de conexão',
      },
    ];

    beforeEach(() => {
      mockUseCapture.mockReturnValue({
        recentCaptures: mockCaptures,
        isLoadingRecent: false,
        isCapturing: false,
        captureProgress: null,
        error: null,
        errorDetails: null,
        isRetryable: false,
        retryCount: 0,
        isRetrying: false,
        startCapture: vi.fn(),
        cancelCapture: vi.fn(),
        stopVideoRecording: vi.fn(),
        refreshRecentCaptures: vi.fn(),
        clearError: vi.fn(),
        retryCapture: vi.fn(),
        clearErrorState: vi.fn(),
        clearCaptureCache: vi.fn(),
      });
    });

    it('deve exibir título das capturas', () => {
      render(<RecentCaptures />);

      expect(screen.getByText('Página de Exemplo')).toBeInTheDocument();
      expect(screen.getByText('Vídeo de Teste')).toBeInTheDocument();
    });

    it('deve exibir status das capturas', () => {
      render(<RecentCaptures />);

      expect(screen.getByText(/Concluído/i)).toBeInTheDocument();
      expect(screen.getByText(/Processando/i)).toBeInTheDocument();
      // Usar getAllByText para "Falhou" pois aparece no título e no badge
      const falhouElements = screen.getAllByText(/Falhou/i);
      expect(falhouElements.length).toBeGreaterThan(0);
    });

    it('deve exibir link "Ver todas" para dashboard', () => {
      render(<RecentCaptures />);

      const verTodasLink = screen.getByRole('link', { name: /Ver todas/i });
      expect(verTodasLink).toHaveAttribute('href', 'https://lexato.com.br/dashboard/evidencias');
    });

    it('deve exibir botão "Ver detalhes" para capturas concluídas', () => {
      render(<RecentCaptures />);

      const verDetalhesButton = screen.getByRole('button', { name: /Ver detalhes/i });
      expect(verDetalhesButton).toBeInTheDocument();
    });

    it('deve abrir dashboard ao clicar em "Ver detalhes"', () => {
      render(<RecentCaptures />);

      const verDetalhesButton = screen.getByRole('button', { name: /Ver detalhes/i });
      fireEvent.click(verDetalhesButton);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://lexato.com.br/dashboard/evidencias/cap-1',
      });
    });

    it('deve exibir mensagem de erro para capturas falhas', () => {
      render(<RecentCaptures />);

      expect(screen.getByText(/Erro de conexão/i)).toBeInTheDocument();
    });

    it('deve limitar a 5 capturas exibidas', () => {
      const manyCaptures: CaptureData[] = Array.from({ length: 10 }, (_, i) => ({
        id: `cap-${i}`,
        type: 'screenshot' as const,
        storageType: 'standard' as const,
        status: 'completed' as const,
        url: `https://example.com/${i}`,
        title: `Captura ${i}`,
        timestamp: new Date().toISOString(),
      }));

      mockUseCapture.mockReturnValue({
        recentCaptures: manyCaptures,
        isLoadingRecent: false,
        isCapturing: false,
        captureProgress: null,
        error: null,
        startCapture: vi.fn(),
        cancelCapture: vi.fn(),
        stopVideoRecording: vi.fn(),
        refreshRecentCaptures: vi.fn(),
        clearError: vi.fn(),
      });

      render(<RecentCaptures />);

      // Deve exibir apenas 5 capturas
      const captureItems = screen.getAllByText(/Captura \d/);
      expect(captureItems.length).toBe(5);
    });
  });

  describe('formatação de timestamp', () => {
    it('deve exibir "Agora" para capturas recentes', () => {
      const recentCapture: CaptureData = {
        id: 'cap-now',
        type: 'screenshot',
        storageType: 'standard',
        status: 'completed',
        url: 'https://example.com',
        title: 'Captura Agora',
        timestamp: new Date().toISOString(),
      };

      mockUseCapture.mockReturnValue({
        recentCaptures: [recentCapture],
        isLoadingRecent: false,
        isCapturing: false,
        captureProgress: null,
        error: null,
        startCapture: vi.fn(),
        cancelCapture: vi.fn(),
        stopVideoRecording: vi.fn(),
        refreshRecentCaptures: vi.fn(),
        clearError: vi.fn(),
      });

      render(<RecentCaptures />);

      expect(screen.getByText('Agora')).toBeInTheDocument();
    });
  });
});
