/**
 * Testes unitários para CaptureOverlay
 *
 * Testa componente principal de overlay de captura
 *
 * Requisitos testados:
 * - 15.1: Indicador visual de captura em andamento
 * - 15.6: Posicionamento não obstrutivo (canto da tela)
 * - 15.7: Z-index alto para ficar acima do conteúdo
 * - 15.8: Tema escuro consistente
 * 
 * NOTA: Testes de vídeo foram atualizados como parte do redesign.
 * O CaptureOverlay agora retorna null para vídeo - os controles
 * de vídeo ficam no Side Panel (fora da área capturada).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CaptureOverlay, { OVERLAY_Z_INDEX } from '@overlay/CaptureOverlay';

describe('CaptureOverlay', () => {
  describe('renderização para screenshot', () => {
    it('deve renderizar overlay para screenshot', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      expect(screen.getByTestId('capture-overlay')).toBeInTheDocument();
    });

    it('deve exibir título correto para screenshot', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      expect(screen.getByText('Capturando página')).toBeInTheDocument();
    });

    it('deve exibir barra de progresso para screenshot', () => {
      render(<CaptureOverlay captureType="screenshot" progress={50} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('deve exibir mensagem de status quando fornecida', () => {
      render(
        <CaptureOverlay
          captureType="screenshot"
          statusMessage="Processando viewport 2 de 5"
        />
      );

      expect(screen.getByText('Processando viewport 2 de 5')).toBeInTheDocument();
    });
  });

  describe('renderização para vídeo', () => {
    // NOTA: CaptureOverlay agora retorna null para vídeo
    // Os controles de vídeo ficam no Side Panel (fora da área capturada)
    
    it('deve retornar null para vídeo (controles no Side Panel)', () => {
      const { container } = render(<CaptureOverlay captureType="video" />);

      // CaptureOverlay retorna null para vídeo - controles ficam no Side Panel
      expect(container.firstChild).toBeNull();
    });

    it('deve retornar null para vídeo mesmo com props adicionais', () => {
      const { container } = render(
        <CaptureOverlay 
          captureType="video" 
          elapsedTime={125}
          timeWarning="5min"
          onStop={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // CaptureOverlay retorna null para vídeo - controles ficam no Side Panel
      expect(container.firstChild).toBeNull();
    });
  });

  describe('botões de controle', () => {
    it('deve exibir botão de cancelar para screenshot', () => {
      const onCancel = vi.fn();
      render(
        <CaptureOverlay captureType="screenshot" onCancel={onCancel} />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancelar captura/i });
      expect(cancelButton).toBeInTheDocument();
    });

    it('deve chamar onCancel ao clicar no botão de cancelar', () => {
      const onCancel = vi.fn();
      render(
        <CaptureOverlay captureType="screenshot" onCancel={onCancel} />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancelar captura/i });
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    // NOTA: Testes de botões de vídeo removidos - controles ficam no Side Panel
  });

  describe('posicionamento', () => {
    it('deve usar posição bottom-right por padrão', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveStyle({ bottom: '1.5rem', right: '1.5rem' });
    });

    it('deve aceitar posição bottom-left', () => {
      render(<CaptureOverlay captureType="screenshot" position="bottom-left" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveStyle({ bottom: '1.5rem', left: '1.5rem' });
    });

    it('deve aceitar posição top-right', () => {
      render(<CaptureOverlay captureType="screenshot" position="top-right" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveStyle({ top: '1.5rem', right: '1.5rem' });
    });

    it('deve aceitar posição top-left', () => {
      render(<CaptureOverlay captureType="screenshot" position="top-left" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveStyle({ top: '1.5rem', left: '1.5rem' });
    });
  });

  describe('z-index e tema', () => {
    it('deve ter z-index máximo', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveStyle({ zIndex: OVERLAY_Z_INDEX });
    });

    it('deve exportar constante OVERLAY_Z_INDEX correta', () => {
      expect(OVERLAY_Z_INDEX).toBe(2147483647);
    });

    it('deve ter posição fixed', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveStyle({ position: 'fixed' });
    });
  });

  describe('acessibilidade', () => {
    it('deve ter role status', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveAttribute('role', 'status');
    });

    it('deve ter aria-live polite', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveAttribute('aria-live', 'polite');
    });

    it('deve ter aria-label descritivo para screenshot', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      const overlay = screen.getByTestId('capture-overlay');
      expect(overlay).toHaveAttribute(
        'aria-label',
        'Captura de screenshot em andamento'
      );
    });

    // NOTA: Teste de aria-label para vídeo removido - CaptureOverlay retorna null para vídeo
    // Os controles de vídeo ficam no Side Panel (fora da área capturada)
  });

  describe('aviso de modo seguro', () => {
    it('deve exibir aviso de modo seguro', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      expect(screen.getByText(/Modo seguro ativo/i)).toBeInTheDocument();
    });

    it('deve exibir instrução para pressionar ESC', () => {
      render(<CaptureOverlay captureType="screenshot" />);

      // O texto ESC está dentro de um elemento kbd
      const kbdElement = screen.getByText('ESC');
      expect(kbdElement.tagName).toBe('KBD');
    });
  });
});
