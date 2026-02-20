/**
 * Testes unitários para o componente EnvironmentIndicator
 *
 * Valida renderização de status, tooltips e navegação para diagnóstico.
 *
 * @see Requirements 23.1-23.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  EnvironmentIndicator,
  type EnvironmentCheck,
} from '@/components/layout/EnvironmentIndicator';

describe('EnvironmentIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Renderização de status', () => {
    it('deve renderizar ícone verde (shield-check) quando ambiente íntegro', () => {
      render(<EnvironmentIndicator status="healthy" />);

      const button = screen.getByRole('button', { name: /ambiente íntegro/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('text-status-success');
    });

    it('deve renderizar ícone amarelo (shield-alert) quando há avisos', () => {
      render(<EnvironmentIndicator status="warning" />);

      const button = screen.getByRole('button', { name: /avisos detectados/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('text-status-warning');
    });

    it('deve renderizar ícone vermelho (shield-x) quando há problemas críticos', () => {
      render(<EnvironmentIndicator status="critical" />);

      const button = screen.getByRole('button', { name: /problemas críticos/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('text-status-error');
    });

    it('deve exibir indicador de ponto colorido para status não-healthy', () => {
      const { container } = render(<EnvironmentIndicator status="warning" />);

      const indicator = container.querySelector('.bg-status-warning');
      expect(indicator).toBeInTheDocument();
    });

    it('deve exibir animação pulse para status crítico', () => {
      const { container } = render(<EnvironmentIndicator status="critical" />);

      const indicator = container.querySelector('.animate-pulse');
      expect(indicator).toBeInTheDocument();
    });

    it('não deve exibir indicador de ponto para status healthy', () => {
      const { container } = render(<EnvironmentIndicator status="healthy" />);

      const warningIndicator = container.querySelector('.bg-status-warning');
      const errorIndicator = container.querySelector('.bg-status-error');
      expect(warningIndicator).not.toBeInTheDocument();
      expect(errorIndicator).not.toBeInTheDocument();
    });
  });

  describe('Tooltip com detalhes', () => {
    it('deve exibir tooltip no hover após delay', async () => {
      render(<EnvironmentIndicator status="healthy" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      // Avança o timer do delay
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('deve esconder tooltip ao sair do hover', () => {
      render(<EnvironmentIndicator status="healthy" />);

      const button = screen.getByRole('button');

      // Mostra tooltip
      fireEvent.mouseEnter(button);
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      // Esconde tooltip
      fireEvent.mouseLeave(button);

      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('deve exibir label correto no tooltip para status healthy', () => {
      render(<EnvironmentIndicator status="healthy" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByText('Ambiente Íntegro')).toBeInTheDocument();
    });

    it('deve exibir label correto no tooltip para status warning', () => {
      render(<EnvironmentIndicator status="warning" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByText('Avisos Detectados')).toBeInTheDocument();
    });

    it('deve exibir label correto no tooltip para status critical', () => {
      render(<EnvironmentIndicator status="critical" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByText('Problemas Críticos')).toBeInTheDocument();
    });

    it('deve exibir lista de verificações no tooltip', () => {
      const checks: EnvironmentCheck[] = [
        { name: 'Conexão API', status: 'warning', message: 'Latência alta' },
        { name: 'Blockchain', status: 'healthy', message: 'Conectado' },
      ];

      render(<EnvironmentIndicator status="warning" checks={checks} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByText('Conexão API')).toBeInTheDocument();
      expect(screen.getByText('Latência alta')).toBeInTheDocument();
      expect(screen.getByText('Blockchain')).toBeInTheDocument();
      expect(screen.getByText('Conectado')).toBeInTheDocument();
    });

    it('deve exibir dica de ação no tooltip', () => {
      render(<EnvironmentIndicator status="healthy" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByText(/clique para ver diagnóstico/i)).toBeInTheDocument();
    });
  });

  describe('Navegação para diagnóstico', () => {
    it('deve chamar onNavigateToDiagnostic ao clicar', () => {
      const handleClick = vi.fn();
      render(<EnvironmentIndicator status="healthy" onNavigateToDiagnostic={handleClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onNavigateToDiagnostic ao pressionar Enter', () => {
      const handleClick = vi.fn();
      render(<EnvironmentIndicator status="healthy" onNavigateToDiagnostic={handleClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onNavigateToDiagnostic ao pressionar Space', () => {
      const handleClick = vi.fn();
      render(<EnvironmentIndicator status="healthy" onNavigateToDiagnostic={handleClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('deve esconder tooltip ao clicar', () => {
      render(<EnvironmentIndicator status="healthy" onNavigateToDiagnostic={vi.fn()} />);

      const button = screen.getByRole('button');

      // Mostra tooltip
      fireEvent.mouseEnter(button);
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      // Clica e esconde tooltip
      fireEvent.click(button);

      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('Acessibilidade', () => {
    it('deve ter aria-label descritivo para status healthy', () => {
      render(<EnvironmentIndicator status="healthy" />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Ambiente íntegro - Clique para ver diagnóstico');
    });

    it('deve ter aria-label descritivo para status warning', () => {
      render(<EnvironmentIndicator status="warning" />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Avisos detectados - Clique para ver detalhes');
    });

    it('deve ter aria-label descritivo para status critical', () => {
      render(<EnvironmentIndicator status="critical" />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Problemas críticos - Ação necessária');
    });

    it('deve ter aria-describedby quando tooltip visível', () => {
      render(<EnvironmentIndicator status="healthy" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(button).toHaveAttribute('aria-describedby', 'environment-tooltip');
    });

    it('deve aceitar className adicional', () => {
      const { container } = render(<EnvironmentIndicator className="custom-class" />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('Estados padrão', () => {
    it('deve usar status healthy por padrão', () => {
      render(<EnvironmentIndicator />);

      const button = screen.getByRole('button', { name: /ambiente íntegro/i });
      expect(button).toBeInTheDocument();
    });

    it('deve usar array vazio de checks por padrão', () => {
      render(<EnvironmentIndicator status="healthy" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      act(() => {
        vi.advanceTimersByTime(250);
      });

      // Deve mostrar descrição padrão, não lista de checks
      expect(screen.getByText('Todas as verificações passaram')).toBeInTheDocument();
    });
  });
});
