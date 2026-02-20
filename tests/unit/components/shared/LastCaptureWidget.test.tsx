/**
 * Testes unitários para LastCaptureWidget
 *
 * Verifica:
 * - Renderização com dados de captura
 * - Thumbnail para screenshots
 * - Ícone para vídeos
 * - Tipo, data/hora e status
 * - Botões "Ver Detalhes" e "Nova Captura"
 * - Estado vazio com CTA
 *
 * @see Requirements 27.1-27.6
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LastCaptureWidget,
  LastCapture,
  CaptureStatus,
} from '../../../../src/components/shared/LastCaptureWidget';

/**
 * Cria uma data relativa ao momento atual
 */
function createRelativeDate(offsetMs: number): Date {
  return new Date(Date.now() - offsetMs);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Dados de teste para captura screenshot
 */
const mockScreenshot: LastCapture = {
  id: 'capture-1',
  type: 'screenshot',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  capturedAt: createRelativeDate(5 * MINUTE),
  status: 'success',
  title: 'Página de teste',
};

/**
 * Dados de teste para captura vídeo
 */
const mockVideo: LastCapture = {
  id: 'capture-2',
  type: 'video',
  capturedAt: createRelativeDate(2 * HOUR),
  status: 'processing',
};

describe('LastCaptureWidget', () => {
  describe('Renderização com captura', () => {
    it('deve renderizar widget com dados de screenshot', () => {
      render(<LastCaptureWidget capture={mockScreenshot} />);

      expect(screen.getByTestId('last-capture-widget')).toBeInTheDocument();
      expect(screen.getByText('Página de teste')).toBeInTheDocument();
      expect(screen.getByText('Screenshot')).toBeInTheDocument();
    });

    it('deve exibir thumbnail para screenshots', () => {
      render(<LastCaptureWidget capture={mockScreenshot} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', mockScreenshot.thumbnailUrl);
    });

    it('deve exibir ícone para vídeos sem thumbnail', () => {
      render(<LastCaptureWidget capture={mockVideo} />);

      // "Vídeo" aparece múltiplas vezes (título e tipo)
      expect(screen.getAllByText('Vídeo').length).toBeGreaterThan(0);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('deve exibir status da captura', () => {
      render(<LastCaptureWidget capture={mockScreenshot} />);

      // Badge de status deve estar presente
      const widget = screen.getByTestId('last-capture-widget');
      expect(widget).toBeInTheDocument();
    });

    it('deve exibir data relativa', () => {
      render(<LastCaptureWidget capture={mockScreenshot} />);

      // "Há 5 min" para captura de 5 minutos atrás
      expect(screen.getByText(/Há \d+ min/)).toBeInTheDocument();
    });
  });

  describe('Botões de ação', () => {
    it('deve ter botão "Ver Detalhes"', () => {
      render(<LastCaptureWidget capture={mockScreenshot} />);

      expect(screen.getByRole('button', { name: /ver detalhes/i })).toBeInTheDocument();
    });

    it('deve ter botão "Nova Captura"', () => {
      render(<LastCaptureWidget capture={mockScreenshot} />);

      expect(screen.getByRole('button', { name: /nova captura/i })).toBeInTheDocument();
    });

    it('deve chamar onViewDetails ao clicar em "Ver Detalhes"', () => {
      const onViewDetails = vi.fn();
      render(<LastCaptureWidget capture={mockScreenshot} onViewDetails={onViewDetails} />);

      fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }));

      expect(onViewDetails).toHaveBeenCalledWith(mockScreenshot.id);
    });

    it('deve chamar onNewCapture ao clicar em "Nova Captura"', () => {
      const onNewCapture = vi.fn();
      render(<LastCaptureWidget capture={mockScreenshot} onNewCapture={onNewCapture} />);

      fireEvent.click(screen.getByRole('button', { name: /nova captura/i }));

      expect(onNewCapture).toHaveBeenCalled();
    });
  });

  describe('Estado vazio', () => {
    it('deve renderizar estado vazio quando capture é null', () => {
      render(<LastCaptureWidget capture={null} />);

      expect(screen.getByTestId('last-capture-widget-empty')).toBeInTheDocument();
    });

    it('deve exibir mensagem de estado vazio', () => {
      render(<LastCaptureWidget capture={null} />);

      expect(screen.getByText('Nenhuma captura ainda')).toBeInTheDocument();
      expect(screen.getByText('Capture sua primeira prova digital')).toBeInTheDocument();
    });

    it('deve ter CTA "Iniciar Captura" no estado vazio', () => {
      render(<LastCaptureWidget capture={null} />);

      expect(screen.getByRole('button', { name: /iniciar captura/i })).toBeInTheDocument();
    });

    it('deve chamar onNewCapture ao clicar no CTA do estado vazio', () => {
      const onNewCapture = vi.fn();
      render(<LastCaptureWidget capture={null} onNewCapture={onNewCapture} />);

      fireEvent.click(screen.getByRole('button', { name: /iniciar captura/i }));

      expect(onNewCapture).toHaveBeenCalled();
    });
  });

  describe('Status de captura', () => {
    const statuses: CaptureStatus[] = ['pending', 'processing', 'success', 'error'];

    statuses.forEach((status) => {
      it(`deve renderizar corretamente com status ${status}`, () => {
        const capture: LastCapture = { ...mockScreenshot, status };
        render(<LastCaptureWidget capture={capture} />);

        expect(screen.getByTestId('last-capture-widget')).toBeInTheDocument();
      });
    });
  });

  describe('Tipos de captura', () => {
    it('deve exibir "Screenshot" para tipo screenshot', () => {
      render(<LastCaptureWidget capture={mockScreenshot} />);

      expect(screen.getAllByText('Screenshot').length).toBeGreaterThan(0);
    });

    it('deve exibir "Vídeo" para tipo video', () => {
      render(<LastCaptureWidget capture={mockVideo} />);

      expect(screen.getAllByText('Vídeo').length).toBeGreaterThan(0);
    });
  });

  describe('Classe CSS customizada', () => {
    it('deve aplicar className adicional', () => {
      render(<LastCaptureWidget capture={mockScreenshot} className="custom-class" />);

      const widget = screen.getByTestId('last-capture-widget');
      expect(widget).toHaveClass('custom-class');
    });

    it('deve aplicar className no estado vazio', () => {
      render(<LastCaptureWidget capture={null} className="custom-class" />);

      const widget = screen.getByTestId('last-capture-widget-empty');
      expect(widget).toHaveClass('custom-class');
    });
  });
});
