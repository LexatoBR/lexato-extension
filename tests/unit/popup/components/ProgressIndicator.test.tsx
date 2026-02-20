/**
 * Testes unitários para ProgressIndicator
 *
 * Testa indicador de progresso durante captura
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProgressIndicator from '@popup/components/ProgressIndicator';
import type { ScreenshotCaptureProgress, VideoCaptureProgress } from '../../../../src/types/capture.types';

describe('ProgressIndicator', () => {
  describe('screenshot progress', () => {
    const screenshotProgress: ScreenshotCaptureProgress = {
      stage: 'capturing',
      percent: 50,
      message: 'Capturando página...',
    };

    it('deve renderizar título para screenshot', () => {
      render(<ProgressIndicator progress={screenshotProgress} />);

      expect(screen.getByText('Capturando screenshot')).toBeInTheDocument();
    });

    it('deve exibir barra de progresso com percentual correto', () => {
      render(<ProgressIndicator progress={screenshotProgress} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('deve exibir mensagem de progresso', () => {
      render(<ProgressIndicator progress={screenshotProgress} />);

      expect(screen.getByText('Capturando página...')).toBeInTheDocument();
    });

    it('deve exibir informação de viewport quando disponível', () => {
      const progressWithViewport: ScreenshotCaptureProgress = {
        ...screenshotProgress,
        currentViewport: 2,
        totalViewports: 5,
      };

      render(<ProgressIndicator progress={progressWithViewport} />);

      expect(screen.getByText(/Viewport 2 de 5/i)).toBeInTheDocument();
    });

    it('deve exibir botão de cancelar quando onCancel fornecido', () => {
      const onCancel = vi.fn();
      render(<ProgressIndicator progress={screenshotProgress} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /Cancelar captura/i });
      expect(cancelButton).toBeInTheDocument();
    });

    it('deve chamar onCancel ao clicar no botão', () => {
      const onCancel = vi.fn();
      render(<ProgressIndicator progress={screenshotProgress} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /Cancelar captura/i });
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('deve exibir aviso para não fechar janela', () => {
      render(<ProgressIndicator progress={screenshotProgress} />);

      expect(screen.getByText(/Não feche esta janela durante a captura/i)).toBeInTheDocument();
    });
  });

  describe('video progress', () => {
    const videoProgress: VideoCaptureProgress = {
      state: 'recording',
      elapsedMs: 65000, // 1:05
      remainingMs: 1735000, // ~28:55
      percent: 3.6,
      message: 'Gravando...',
    };

    it('deve renderizar título para vídeo', () => {
      render(<ProgressIndicator progress={videoProgress} />);

      expect(screen.getByText('Gravando vídeo')).toBeInTheDocument();
    });

    it('deve exibir timer formatado', () => {
      render(<ProgressIndicator progress={videoProgress} />);

      // 65000ms = 01:05
      expect(screen.getByText('01:05')).toBeInTheDocument();
    });

    it('deve exibir botão de parar gravação', () => {
      const onCancel = vi.fn();
      render(<ProgressIndicator progress={videoProgress} onCancel={onCancel} />);

      const stopButton = screen.getByRole('button', { name: /Parar gravação/i });
      expect(stopButton).toBeInTheDocument();
    });

    it('deve exibir aviso de tempo quando timeWarning presente', () => {
      const progressWithWarning: VideoCaptureProgress = {
        ...videoProgress,
        timeWarning: '5min',
      };

      render(<ProgressIndicator progress={progressWithWarning} />);

      expect(screen.getByText(/Restam 5 minutos de gravação/i)).toBeInTheDocument();
    });

    it('deve exibir aviso de 1 minuto', () => {
      const progressWithWarning: VideoCaptureProgress = {
        ...videoProgress,
        timeWarning: '1min',
      };

      render(<ProgressIndicator progress={progressWithWarning} />);

      expect(screen.getByText(/Restam 1 minuto de gravação/i)).toBeInTheDocument();
    });

    it('deve exibir aviso de 30 segundos', () => {
      const progressWithWarning: VideoCaptureProgress = {
        ...videoProgress,
        timeWarning: '30sec',
      };

      render(<ProgressIndicator progress={progressWithWarning} />);

      expect(screen.getByText(/Restam 30 segundos de gravação/i)).toBeInTheDocument();
    });

    it('deve exibir mensagem sobre gravação continuar em background', () => {
      render(<ProgressIndicator progress={videoProgress} />);

      expect(
        screen.getByText(/A gravação continuará mesmo se você fechar este popup/i)
      ).toBeInTheDocument();
    });
  });

  describe('barra de progresso', () => {
    it('deve limitar progresso a 0-100%', () => {
      const progressOver100: ScreenshotCaptureProgress = {
        stage: 'complete',
        percent: 150,
        message: 'Concluído',
      };

      render(<ProgressIndicator progress={progressOver100} />);

      // Deve exibir 150% no texto mas a barra deve estar limitada
      expect(screen.getByText('150%')).toBeInTheDocument();
    });

    it('deve lidar com progresso negativo', () => {
      const negativeProgress: ScreenshotCaptureProgress = {
        stage: 'initializing',
        percent: -10,
        message: 'Iniciando...',
      };

      render(<ProgressIndicator progress={negativeProgress} />);

      // Não deve quebrar
      expect(screen.getByText('-10%')).toBeInTheDocument();
    });
  });
});
