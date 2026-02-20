/**
 * Testes unitários para CapturePanel
 *
 * Testa painel de captura com seleção de tipo e armazenamento
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CapturePanel from '@popup/components/CapturePanel';
import * as useAuthModule from '@popup/hooks/useAuth';
import * as useCaptureModule from '@popup/hooks/useCapture';
import * as useCreditsModule from '@popup/hooks/useCredits';

// Mock dos hooks
vi.mock('@popup/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@popup/hooks/useCapture', () => ({
  useCapture: vi.fn(),
}));

vi.mock('@popup/hooks/useCredits', () => ({
  useCredits: vi.fn(),
}));

describe('CapturePanel', () => {
  const mockUseAuth = vi.mocked(useAuthModule.useAuth);
  const mockUseCapture = vi.mocked(useCaptureModule.useCapture);
  const mockUseCredits = vi.mocked(useCreditsModule.useCredits);
  const mockStartCapture = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-1', email: 'test@example.com', accountType: 'individual', credits: 50, mfaEnabled: false },
      tokens: null,
      error: null,
      login: vi.fn(),
      completeMfa: vi.fn(),
      setupMfa: vi.fn(),
      verifyMfaSetup: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      refreshUser: vi.fn(),
      startWebAuthnRegistration: vi.fn(),
      completeWebAuthnRegistration: vi.fn(),
      startWebAuthnAuth: vi.fn(),
      completeWebAuthnAuth: vi.fn(),
      listWebAuthnCredentials: vi.fn(),
    });

    mockUseCapture.mockReturnValue({
      isCapturing: false,
      captureProgress: null,
      recentCaptures: [],
      isLoadingRecent: false,
      error: null,
      startCapture: mockStartCapture,
      cancelCapture: vi.fn(),
      stopVideoRecording: vi.fn(),
      refreshRecentCaptures: vi.fn(),
      clearError: vi.fn(),
    });

    mockUseCredits.mockReturnValue({
      credits: 50,
      isLoading: false,
      error: null,
      canUsePremium: vi.fn(() => true),
      getStorageCost: vi.fn((type: string) => {
        const costs: Record<string, number> = { standard: 1, premium_5y: 5, premium_10y: 10, premium_20y: 20 };
        return costs[type] ?? 1;
      }),
      refreshCredits: vi.fn(),
      hasEnoughCredits: vi.fn(() => true),
    });
  });

  describe('exibição de créditos (Requisito 4.2)', () => {
    it('deve exibir saldo de créditos', () => {
      render(<CapturePanel />);

      expect(screen.getByText('Saldo disponível')).toBeInTheDocument();
      expect(screen.getByText('50 créditos')).toBeInTheDocument();
    });

    it('deve exibir badge de conta empresarial', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', email: 'test@example.com', accountType: 'enterprise', credits: 50, mfaEnabled: false },
        tokens: null,
        error: null,
        login: vi.fn(),
        completeMfa: vi.fn(),
        setupMfa: vi.fn(),
        verifyMfaSetup: vi.fn(),
        logout: vi.fn(),
        clearError: vi.fn(),
        refreshUser: vi.fn(),
        startWebAuthnRegistration: vi.fn(),
        completeWebAuthnRegistration: vi.fn(),
        startWebAuthnAuth: vi.fn(),
        completeWebAuthnAuth: vi.fn(),
        listWebAuthnCredentials: vi.fn(),
      });

      render(<CapturePanel />);

      expect(screen.getByText('Conta empresarial')).toBeInTheDocument();
    });
  });

  describe('seleção de tipo de captura (Requisito 4.3)', () => {
    it('deve exibir opções de screenshot e vídeo', () => {
      render(<CapturePanel />);

      expect(screen.getByText('Screenshot')).toBeInTheDocument();
      expect(screen.getByText('Vídeo')).toBeInTheDocument();
    });

    it('deve selecionar screenshot por padrão', () => {
      render(<CapturePanel />);

      // Buscar pelo texto exato "Screenshot" dentro do botão de tipo
      const screenshotButtons = screen.getAllByRole('button', { name: /Screenshot/i });
      // O primeiro é o botão de tipo, o segundo é o botão de captura
      const typeButton = screenshotButtons[0];
      expect(typeButton).toHaveClass('border-lexato-500');
    });

    it('deve permitir selecionar vídeo', () => {
      render(<CapturePanel />);

      const videoButton = screen.getByRole('button', { name: /Vídeo/i });
      fireEvent.click(videoButton);

      expect(videoButton).toHaveClass('border-lexato-500');
    });

    it('deve exibir descrições dos tipos', () => {
      render(<CapturePanel />);

      expect(screen.getByText('Página inteira')).toBeInTheDocument();
      expect(screen.getByText('Até 30 min')).toBeInTheDocument();
    });
  });

  describe('seleção de armazenamento (Requisito 4.4)', () => {
    it('deve renderizar StorageSelector', () => {
      render(<CapturePanel />);

      expect(screen.getByText('Tipo de armazenamento')).toBeInTheDocument();
    });
  });

  describe('iniciar captura', () => {
    it('deve chamar startCapture com tipo e storage selecionados', async () => {
      mockStartCapture.mockResolvedValueOnce(undefined);

      render(<CapturePanel />);

      const captureButton = screen.getByRole('button', { name: /Capturar Screenshot/i });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(mockStartCapture).toHaveBeenCalledWith('screenshot', 'standard');
      });
    });

    it('deve chamar startCapture com vídeo quando selecionado', async () => {
      mockStartCapture.mockResolvedValueOnce(undefined);

      render(<CapturePanel />);

      // Selecionar vídeo
      const videoButton = screen.getByRole('button', { name: /Vídeo/i });
      fireEvent.click(videoButton);

      const captureButton = screen.getByRole('button', { name: /Capturar Vídeo/i });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(mockStartCapture).toHaveBeenCalledWith('video', 'standard');
      });
    });

    it('deve exibir "Iniciando..." durante início de captura', async () => {
      mockStartCapture.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<CapturePanel />);

      const captureButton = screen.getByRole('button', { name: /Capturar Screenshot/i });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(screen.getByText('Iniciando...')).toBeInTheDocument();
      });
    });

    it('deve desabilitar botões durante captura', () => {
      mockUseCapture.mockReturnValue({
        isCapturing: true,
        captureProgress: null,
        recentCaptures: [],
        isLoadingRecent: false,
        error: null,
        startCapture: mockStartCapture,
        cancelCapture: vi.fn(),
        stopVideoRecording: vi.fn(),
        refreshRecentCaptures: vi.fn(),
        clearError: vi.fn(),
      });

      render(<CapturePanel />);

      const captureButton = screen.getByRole('button', { name: /Capturar/i });
      expect(captureButton).toBeDisabled();
    });
  });

  describe('validação de créditos', () => {
    it('deve permitir captura com créditos suficientes', async () => {
      mockStartCapture.mockResolvedValueOnce(undefined);

      render(<CapturePanel />);

      const captureButton = screen.getByRole('button', { name: /Capturar Screenshot/i });
      fireEvent.click(captureButton);

      await waitFor(() => {
        expect(mockStartCapture).toHaveBeenCalledWith('screenshot', 'standard');
      });
    });
  });

  describe('exibição de erros', () => {
    it('deve exibir erro do hook useCapture', () => {
      mockUseCapture.mockReturnValue({
        isCapturing: false,
        captureProgress: null,
        recentCaptures: [],
        isLoadingRecent: false,
        error: 'Erro ao iniciar captura',
        errorDetails: null,
        isRetryable: false,
        retryCount: 0,
        isRetrying: false,
        startCapture: mockStartCapture,
        cancelCapture: vi.fn(),
        stopVideoRecording: vi.fn(),
        refreshRecentCaptures: vi.fn(),
        clearError: vi.fn(),
        retryCapture: vi.fn(),
        clearErrorState: vi.fn(),
        clearCaptureCache: vi.fn(),
      });

      render(<CapturePanel />);

      expect(screen.getByText('Erro ao iniciar captura')).toBeInTheDocument();
    });
  });

  describe('aviso de armazenamento irreversível', () => {
    it('deve exibir aviso sobre armazenamento irreversível', () => {
      render(<CapturePanel />);

      expect(
        screen.getByText('O tipo de armazenamento não pode ser alterado após a captura')
      ).toBeInTheDocument();
    });
  });
});
