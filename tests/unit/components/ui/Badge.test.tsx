/**
 * Testes unitários para o componente Badge
 *
 * Valida renderização de variantes, status e cores.
 *
 * @see Requirements 10.1-10.4
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

describe('Badge', () => {
  describe('Variante status', () => {
    it('deve renderizar badge de status pending com cor amarela', () => {
      render(<Badge variant="status" status="pending">Pendente</Badge>);

      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Pendente');
      expect(badge).toHaveClass('text-status-pending');
      expect(badge).toHaveClass('bg-[rgba(255,202,40,0.15)]');
    });

    it('deve renderizar badge de status processing com cor azul', () => {
      render(<Badge variant="status" status="processing">Processando</Badge>);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Processando');
      expect(badge).toHaveClass('text-status-processing');
      expect(badge).toHaveClass('bg-[rgba(66,165,245,0.15)]');
    });

    it('deve renderizar badge de status success com cor verde', () => {
      render(<Badge variant="status" status="success">Concluído</Badge>);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Concluído');
      expect(badge).toHaveClass('text-status-success');
      expect(badge).toHaveClass('bg-[rgba(0,222,165,0.15)]');
    });

    it('deve renderizar badge de status error com cor vermelha', () => {
      render(<Badge variant="status" status="error">Erro</Badge>);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Erro');
      expect(badge).toHaveClass('text-status-error');
      expect(badge).toHaveClass('bg-[rgba(239,83,80,0.15)]');
    });

    it('deve renderizar badge de status warning com cor âmbar', () => {
      render(<Badge variant="status" status="warning">Atenção</Badge>);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Atenção');
      expect(badge).toHaveClass('text-status-warning');
      expect(badge).toHaveClass('bg-[rgba(255,167,38,0.15)]');
    });

    it('deve usar status pending como padrão', () => {
      render(<Badge variant="status">Padrão</Badge>);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('text-status-pending');
    });

    it('deve exibir ícone padrão por status', () => {
      render(<Badge variant="status" status="success">Sucesso</Badge>);

      const badge = screen.getByRole('status');
      const icon = badge.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('deve aceitar ícone customizado', () => {
      const CustomIcon = () => <span data-testid="custom-icon">★</span>;
      render(
        <Badge variant="status" status="success" icon={<CustomIcon />}>
          Custom
        </Badge>
      );

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    it('deve ter estilo uppercase e tracking', () => {
      render(<Badge variant="status" status="success">Texto</Badge>);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('uppercase');
      expect(badge).toHaveClass('tracking-wider');
    });
  });

  describe('Variante count', () => {
    it('deve renderizar badge de contagem', () => {
      render(<Badge variant="count" count={5} />);

      const badge = screen.getByText('5');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-status-error');
      expect(badge).toHaveClass('rounded-full');
    });

    it('deve exibir 99+ para contagens maiores que 99', () => {
      render(<Badge variant="count" count={150} />);

      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('deve exibir contagem exata até 99', () => {
      render(<Badge variant="count" count={99} />);

      expect(screen.getByText('99')).toBeInTheDocument();
    });

    it('deve ter aria-label com número de notificações', () => {
      render(<Badge variant="count" count={5} />);

      const badge = screen.getByLabelText('5 notificações');
      expect(badge).toBeInTheDocument();
    });

    it('deve ter tamanho mínimo de 18px', () => {
      render(<Badge variant="count" count={1} />);

      const badge = screen.getByText('1');
      expect(badge).toHaveClass('min-w-[18px]');
      expect(badge).toHaveClass('h-[18px]');
    });
  });

  describe('Variante chip', () => {
    it('deve renderizar badge chip com estilo verde', () => {
      render(<Badge variant="chip">Tag</Badge>);

      const badge = screen.getByText('Tag');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('text-primary');
      expect(badge).toHaveClass('bg-[rgba(0,222,165,0.1)]');
    });

    it('deve ter borda verde sutil', () => {
      render(<Badge variant="chip">Tag</Badge>);

      const badge = screen.getByText('Tag');
      expect(badge).toHaveClass('border');
      expect(badge).toHaveClass('border-[rgba(0,222,165,0.2)]');
    });

    it('deve aceitar ícone no chip', () => {
      const ChipIcon = () => <span data-testid="chip-icon">🏷️</span>;
      render(
        <Badge variant="chip" icon={<ChipIcon />}>
          Com Ícone
        </Badge>
      );

      expect(screen.getByTestId('chip-icon')).toBeInTheDocument();
      expect(screen.getByText('Com Ícone')).toBeInTheDocument();
    });
  });

  describe('Classes customizadas', () => {
    it('deve aceitar className adicional na variante status', () => {
      render(
        <Badge variant="status" status="success" className="custom-class">
          Custom
        </Badge>
      );

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('custom-class');
    });

    it('deve aceitar className adicional na variante count', () => {
      render(<Badge variant="count" count={5} className="custom-count" />);

      const badge = screen.getByText('5');
      expect(badge).toHaveClass('custom-count');
    });

    it('deve aceitar className adicional na variante chip', () => {
      render(<Badge variant="chip" className="custom-chip">Chip</Badge>);

      const badge = screen.getByText('Chip');
      expect(badge).toHaveClass('custom-chip');
    });
  });

  describe('Ref forwarding', () => {
    it('deve encaminhar ref para o elemento span', () => {
      const ref = vi.fn();
      render(<Badge ref={ref} variant="status" status="success">Com Ref</Badge>);

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLSpanElement));
    });
  });

  describe('Variante padrão', () => {
    it('deve usar variante status como padrão', () => {
      render(<Badge status="success">Padrão</Badge>);

      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
    });
  });
});
