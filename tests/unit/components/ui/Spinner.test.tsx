/**
 * Testes unitários para o componente Spinner
 *
 * Valida renderização de tamanhos, cores e acessibilidade.
 *
 * @see Requirements 11.5
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from '@/components/ui/Spinner';

describe('Spinner', () => {
  describe('Renderização básica', () => {
    it('deve renderizar spinner com role status', () => {
      render(<Spinner />);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
    });

    it('deve ter aria-label padrão "Carregando..."', () => {
      render(<Spinner />);

      const spinner = screen.getByLabelText('Carregando...');
      expect(spinner).toBeInTheDocument();
    });

    it('deve renderizar SVG com animação spin', () => {
      render(<Spinner />);

      const spinner = screen.getByRole('status');
      const svg = spinner.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('animate-spin');
    });

    it('deve ter texto sr-only para leitores de tela', () => {
      render(<Spinner />);

      const srText = screen.getByText('Carregando...');
      expect(srText).toHaveClass('sr-only');
    });
  });

  describe('Tamanhos', () => {
    it('deve renderizar tamanho sm (16px)', () => {
      render(<Spinner size="sm" />);

      const spinner = screen.getByRole('status');
      const svg = spinner.querySelector('svg');
      expect(svg).toHaveClass('w-4');
      expect(svg).toHaveClass('h-4');
    });

    it('deve renderizar tamanho md (24px) como padrão', () => {
      render(<Spinner />);

      const spinner = screen.getByRole('status');
      const svg = spinner.querySelector('svg');
      expect(svg).toHaveClass('w-6');
      expect(svg).toHaveClass('h-6');
    });

    it('deve renderizar tamanho lg (32px)', () => {
      render(<Spinner size="lg" />);

      const spinner = screen.getByRole('status');
      const svg = spinner.querySelector('svg');
      expect(svg).toHaveClass('w-8');
      expect(svg).toHaveClass('h-8');
    });
  });

  describe('Cores', () => {
    it('deve usar cor primary como padrão', () => {
      render(<Spinner />);

      const spinner = screen.getByRole('status');
      const svg = spinner.querySelector('svg');
      expect(svg).toHaveClass('text-primary');
    });

    it('deve renderizar cor white', () => {
      render(<Spinner color="white" />);

      const spinner = screen.getByRole('status');
      const svg = spinner.querySelector('svg');
      expect(svg).toHaveClass('text-white');
    });

    it('deve renderizar cor current', () => {
      render(<Spinner color="current" />);

      const spinner = screen.getByRole('status');
      const svg = spinner.querySelector('svg');
      expect(svg).toHaveClass('text-current');
    });
  });

  describe('Label customizado', () => {
    it('deve aceitar label customizado', () => {
      render(<Spinner label="Processando captura..." />);

      const spinner = screen.getByLabelText('Processando captura...');
      expect(spinner).toBeInTheDocument();
    });

    it('deve exibir label customizado no sr-only', () => {
      render(<Spinner label="Enviando dados..." />);

      const srText = screen.getByText('Enviando dados...');
      expect(srText).toHaveClass('sr-only');
    });
  });

  describe('Classes customizadas', () => {
    it('deve aceitar className adicional', () => {
      render(<Spinner className="custom-spinner" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveClass('custom-spinner');
    });

    it('deve manter classes base com className adicional', () => {
      render(<Spinner className="my-class" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveClass('inline-flex');
      expect(spinner).toHaveClass('my-class');
    });
  });

  describe('Ref forwarding', () => {
    it('deve encaminhar ref para o elemento div', () => {
      const ref = vi.fn();
      render(<Spinner ref={ref} />);

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    });
  });

  describe('Estrutura SVG', () => {
    it('deve ter círculo de fundo com opacidade 25%', () => {
      render(<Spinner />);

      const spinner = screen.getByRole('status');
      const circle = spinner.querySelector('circle');
      expect(circle).toBeInTheDocument();
      expect(circle).toHaveClass('opacity-25');
    });

    it('deve ter path animado com opacidade 75%', () => {
      render(<Spinner />);

      const spinner = screen.getByRole('status');
      const path = spinner.querySelector('path');
      expect(path).toBeInTheDocument();
      expect(path).toHaveClass('opacity-75');
    });

    it('deve ter SVG com aria-hidden true', () => {
      render(<Spinner />);

      const spinner = screen.getByRole('status');
      const svg = spinner.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
