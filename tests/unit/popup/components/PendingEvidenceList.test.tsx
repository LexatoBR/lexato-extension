/**
 * Testes unitários para PendingEvidenceList
 *
 * Testa lista de evidências pendentes de confirmação
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PendingEvidenceList from '@popup/components/PendingEvidenceList';
import * as usePendingEvidenceModule from '@popup/hooks/usePendingEvidence';
import type { PendingEvidenceItem } from '@popup/hooks/usePendingEvidence';

// Mock do hook usePendingEvidence
vi.mock('@popup/hooks/usePendingEvidence', () => ({
  usePendingEvidence: vi.fn(),
}));

describe('PendingEvidenceList', () => {
  const mockUsePendingEvidence = vi.mocked(usePendingEvidenceModule.usePendingEvidence);
  const mockOpenPreview = vi.fn();
  const mockRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('estado de carregamento', () => {
    it('deve exibir skeleton quando carregando', () => {
      mockUsePendingEvidence.mockReturnValue({
        evidences: [],
        total: 0,
        maxPending: 3,
        isLoading: true,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.getByText('Provas pendentes')).toBeInTheDocument();
      // Verifica se há elementos de loading (skeleton)
      const skeletons = document.querySelectorAll('.animate-loading');
      expect(skeletons.length).toBe(2);
    });
  });

  describe('estado vazio', () => {
    it('deve exibir mensagem quando não há evidências pendentes', () => {
      mockUsePendingEvidence.mockReturnValue({
        evidences: [],
        total: 0,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.getByText('Nenhuma prova pendente')).toBeInTheDocument();
      expect(screen.getByText('Suas capturas aguardando confirmação aparecerão aqui')).toBeInTheDocument();
    });
  });

  describe('estado de erro', () => {
    it('deve exibir mensagem de erro e botão de retry', () => {
      mockUsePendingEvidence.mockReturnValue({
        evidences: [],
        total: 0,
        maxPending: 3,
        isLoading: false,
        error: 'Falha ao buscar evidências pendentes',
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.getByText('Falha ao buscar evidências pendentes')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
    });

    it('deve chamar refresh ao clicar em "Tentar novamente"', () => {
      mockUsePendingEvidence.mockReturnValue({
        evidences: [],
        total: 0,
        maxPending: 3,
        isLoading: false,
        error: 'Erro de conexão',
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      const retryButton = screen.getByRole('button', { name: /Tentar novamente/i });
      fireEvent.click(retryButton);

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('lista com evidências', () => {
    const mockEvidences: PendingEvidenceItem[] = [
      {
        evidenceId: 'ev-1',
        originalUrl: 'https://example.com/page',
        pageTitle: 'Página de Exemplo',
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
        secondsRemaining: 30 * 60,
        captureType: 'SCREENSHOT',
        thumbnailUrl: 'https://cdn.lexato.com/thumb/ev-1.jpg',
      },
      {
        evidenceId: 'ev-2',
        originalUrl: 'https://test.com/video',
        pageTitle: 'Vídeo de Teste',
        capturedAt: new Date(Date.now() - 3600000).toISOString(),
        confirmationDeadline: new Date(Date.now() + 3 * 60 * 1000).toISOString(), // 3 min (urgente)
        secondsRemaining: 3 * 60,
        captureType: 'VIDEO',
        thumbnailUrl: '',
      },
    ];

    beforeEach(() => {
      mockUsePendingEvidence.mockReturnValue({
        evidences: mockEvidences,
        total: 2,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: true,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });
    });

    it('deve exibir título das evidências', () => {
      render(<PendingEvidenceList />);

      expect(screen.getByText('Página de Exemplo')).toBeInTheDocument();
      expect(screen.getByText('Vídeo de Teste')).toBeInTheDocument();
    });

    it('deve exibir contador de pendentes', () => {
      render(<PendingEvidenceList />);

      expect(screen.getByText('2/3')).toBeInTheDocument();
    });

    it('deve exibir tempo restante formatado', () => {
      render(<PendingEvidenceList />);

      // 30 minutos
      expect(screen.getByText('30 min')).toBeInTheDocument();
      // 3 minutos
      expect(screen.getByText('3 min')).toBeInTheDocument();
    });

    it('deve exibir botões "Revisar" para cada evidência', () => {
      render(<PendingEvidenceList />);

      const reviewButtons = screen.getAllByRole('button', { name: /Revisar/i });
      expect(reviewButtons.length).toBe(2);
    });

    it('deve chamar openPreview ao clicar em "Revisar"', () => {
      render(<PendingEvidenceList />);

      const reviewButtons = screen.getAllByRole('button', { name: /Revisar/i });
      const firstButton = reviewButtons[0];
      expect(firstButton).toBeDefined();
      fireEvent.click(firstButton!);

      expect(mockOpenPreview).toHaveBeenCalledWith('ev-1');
    });
  });

  describe('indicador de urgência', () => {
    it('deve exibir indicador URGENTE para evidências com menos de 5 minutos', () => {
      const urgentEvidence: PendingEvidenceItem = {
        evidenceId: 'ev-urgent',
        originalUrl: 'https://urgent.com',
        pageTitle: 'Prova Urgente',
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        secondsRemaining: 2 * 60, // 2 minutos
        captureType: 'SCREENSHOT',
        thumbnailUrl: '',
      };

      mockUsePendingEvidence.mockReturnValue({
        evidences: [urgentEvidence],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: true,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.getByText('URGENTE')).toBeInTheDocument();
    });

    it('não deve exibir indicador URGENTE para evidências com mais de 5 minutos', () => {
      const normalEvidence: PendingEvidenceItem = {
        evidenceId: 'ev-normal',
        originalUrl: 'https://normal.com',
        pageTitle: 'Prova Normal',
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        secondsRemaining: 30 * 60, // 30 minutos
        captureType: 'SCREENSHOT',
        thumbnailUrl: '',
      };

      mockUsePendingEvidence.mockReturnValue({
        evidences: [normalEvidence],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.queryByText('URGENTE')).not.toBeInTheDocument();
    });
  });

  describe('aviso de limite máximo', () => {
    it('deve exibir aviso quando limite de 3 pendentes atingido', () => {
      const threeEvidences: PendingEvidenceItem[] = [
        {
          evidenceId: 'ev-1',
          originalUrl: 'https://example1.com',
          pageTitle: 'Prova 1',
          capturedAt: new Date().toISOString(),
          confirmationDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          secondsRemaining: 30 * 60,
          captureType: 'SCREENSHOT',
          thumbnailUrl: '',
        },
        {
          evidenceId: 'ev-2',
          originalUrl: 'https://example2.com',
          pageTitle: 'Prova 2',
          capturedAt: new Date().toISOString(),
          confirmationDeadline: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
          secondsRemaining: 25 * 60,
          captureType: 'SCREENSHOT',
          thumbnailUrl: '',
        },
        {
          evidenceId: 'ev-3',
          originalUrl: 'https://example3.com',
          pageTitle: 'Prova 3',
          capturedAt: new Date().toISOString(),
          confirmationDeadline: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          secondsRemaining: 20 * 60,
          captureType: 'VIDEO',
          thumbnailUrl: '',
        },
      ];

      mockUsePendingEvidence.mockReturnValue({
        evidences: threeEvidences,
        total: 3,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: true,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.getByText('Limite de provas pendentes atingido')).toBeInTheDocument();
      expect(screen.getByText('Confirme ou descarte uma prova antes de fazer nova captura.')).toBeInTheDocument();
      expect(screen.getByText('3/3')).toBeInTheDocument();
    });

    it('não deve exibir aviso quando abaixo do limite', () => {
      mockUsePendingEvidence.mockReturnValue({
        evidences: [],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.queryByText('Limite de provas pendentes atingido')).not.toBeInTheDocument();
    });
  });

  describe('evidência expirada', () => {
    it('deve exibir "Expirado" para evidências com tempo zero', () => {
      const expiredEvidence: PendingEvidenceItem = {
        evidenceId: 'ev-expired',
        originalUrl: 'https://expired.com',
        pageTitle: 'Prova Expirada',
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() - 1000).toISOString(),
        secondsRemaining: 0,
        captureType: 'SCREENSHOT',
        thumbnailUrl: '',
      };

      mockUsePendingEvidence.mockReturnValue({
        evidences: [expiredEvidence],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.getByText('Expirado')).toBeInTheDocument();
    });

    it('deve desabilitar botão "Revisar" para evidências expiradas', () => {
      const expiredEvidence: PendingEvidenceItem = {
        evidenceId: 'ev-expired',
        originalUrl: 'https://expired.com',
        pageTitle: 'Prova Expirada',
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() - 1000).toISOString(),
        secondsRemaining: 0,
        captureType: 'SCREENSHOT',
        thumbnailUrl: '',
      };

      mockUsePendingEvidence.mockReturnValue({
        evidences: [expiredEvidence],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      const reviewButton = screen.getByRole('button', { name: /Revisar/i });
      expect(reviewButton).toBeDisabled();
    });
  });

  describe('formatação de tempo', () => {
    it('deve formatar minutos corretamente', () => {
      const evidence: PendingEvidenceItem = {
        evidenceId: 'ev-1',
        originalUrl: 'https://example.com',
        pageTitle: 'Teste',
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        secondsRemaining: 45 * 60, // 45 minutos
        captureType: 'SCREENSHOT',
        thumbnailUrl: '',
      };

      mockUsePendingEvidence.mockReturnValue({
        evidences: [evidence],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      expect(screen.getByText('45 min')).toBeInTheDocument();
    });

    it('deve formatar segundos em intervalos de 20 no último minuto', () => {
      const evidence: PendingEvidenceItem = {
        evidenceId: 'ev-1',
        originalUrl: 'https://example.com',
        pageTitle: 'Teste',
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() + 45 * 1000).toISOString(),
        secondsRemaining: 45, // 45 segundos
        captureType: 'SCREENSHOT',
        thumbnailUrl: '',
      };

      mockUsePendingEvidence.mockReturnValue({
        evidences: [evidence],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: true,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      // 45 segundos arredondado para cima em intervalos de 20 = 60 seg
      expect(screen.getByText('60 seg')).toBeInTheDocument();
    });
  });

  describe('truncamento de texto', () => {
    it('deve truncar títulos longos', () => {
      // Título com mais de 30 caracteres será truncado
      const longTitle = 'Este é um título muito longo que deve ser truncado para caber na interface';
      const evidence: PendingEvidenceItem = {
        evidenceId: 'ev-1',
        originalUrl: 'https://example.com',
        pageTitle: longTitle,
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        secondsRemaining: 30 * 60,
        captureType: 'SCREENSHOT',
        thumbnailUrl: '',
      };

      mockUsePendingEvidence.mockReturnValue({
        evidences: [evidence],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      // Título truncado: primeiros 27 caracteres + "..."
      // "Este é um título muito long" (27 chars) + "..." = 30 chars
      expect(screen.getByText('Este é um título muito long...')).toBeInTheDocument();
    });

    it('deve truncar URLs longas', () => {
      // URL com path longo será truncada para 35 caracteres
      const evidence: PendingEvidenceItem = {
        evidenceId: 'ev-1',
        originalUrl: 'https://example.com/very/long/path/that/should/be/truncated/for/display',
        pageTitle: 'Teste',
        capturedAt: new Date().toISOString(),
        confirmationDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        secondsRemaining: 30 * 60,
        captureType: 'SCREENSHOT',
        thumbnailUrl: '',
      };

      mockUsePendingEvidence.mockReturnValue({
        evidences: [evidence],
        total: 1,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      // URL truncada: hostname + path truncado para 35 chars
      // "example.com/very/long/path/that/..." (35 chars)
      expect(screen.getByText('example.com/very/long/path/that/...')).toBeInTheDocument();
    });
  });

  describe('acessibilidade', () => {
    it('deve ter role="alert" no aviso de limite máximo', () => {
      mockUsePendingEvidence.mockReturnValue({
        evidences: [],
        total: 3,
        maxPending: 3,
        isLoading: false,
        error: null,
        isAtMaxLimit: true,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('deve ter role="alert" no estado de erro', () => {
      mockUsePendingEvidence.mockReturnValue({
        evidences: [],
        total: 0,
        maxPending: 3,
        isLoading: false,
        error: 'Erro de conexão',
        isAtMaxLimit: false,
        hasUrgent: false,
        openPreview: mockOpenPreview,
        refresh: mockRefresh,
      });

      render(<PendingEvidenceList />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });
});
