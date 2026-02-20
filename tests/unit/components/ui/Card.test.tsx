/**
 * Testes unitários para o componente Card
 *
 * Valida renderização de variantes, estados e interações.
 *
 * @see Requirements 6.1-6.5
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from '@/components/ui/Card';

describe('Card', () => {
  describe('Renderização de variantes', () => {
    it('deve renderizar variante default com efeito glass', () => {
      render(<Card>Conteúdo</Card>);

      const card = screen.getByText('Conteúdo');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('bg-glass-bgLight');
      expect(card).toHaveClass('backdrop-blur-sm');
      expect(card).toHaveClass('border');
    });

    it('deve renderizar variante highlight com indicador verde', () => {
      render(<Card variant="highlight">Destaque</Card>);

      const card = screen.getByText('Destaque');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('border-l-primary');
      expect(card).toHaveClass('border-l-[3px]');
    });

    it('deve renderizar variante pending com indicador amarelo', () => {
      render(<Card variant="pending">Pendente</Card>);

      const card = screen.getByText('Pendente');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('border-l-status-pending');
      expect(card).toHaveClass('border-l-[3px]');
    });

    it('deve renderizar variante success com indicador verde', () => {
      render(<Card variant="success">Sucesso</Card>);

      const card = screen.getByText('Sucesso');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('border-l-status-success');
      expect(card).toHaveClass('border-l-[3px]');
    });

    it('deve renderizar variante error com indicador vermelho', () => {
      render(<Card variant="error">Erro</Card>);

      const card = screen.getByText('Erro');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('border-l-status-error');
      expect(card).toHaveClass('border-l-[3px]');
    });

    it('deve usar variante default como padrão', () => {
      render(<Card>Padrão</Card>);

      const card = screen.getByText('Padrão');
      expect(card).toHaveClass('bg-glass-bgLight');
      expect(card).not.toHaveClass('border-l-[3px]');
    });
  });

  describe('Estado hover', () => {
    it('deve ter classes de hover quando interativo', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Interativo</Card>);

      const card = screen.getByText('Interativo');
      expect(card).toHaveClass('hover:scale-[1.02]');
      expect(card).toHaveClass('hover:border-glass-borderActive');
      expect(card).toHaveClass('hover:shadow-card-hover');
      expect(card).toHaveClass('cursor-pointer');
    });

    it('não deve ter classes de hover quando não interativo', () => {
      render(<Card>Não Interativo</Card>);

      const card = screen.getByText('Não Interativo');
      expect(card).not.toHaveClass('hover:scale-[1.02]');
      expect(card).not.toHaveClass('cursor-pointer');
    });
  });

  describe('Estado selected', () => {
    it('deve aplicar borda verde e glow quando selecionado', () => {
      render(<Card selected>Selecionado</Card>);

      const card = screen.getByText('Selecionado');
      expect(card).toHaveClass('border-glass-borderActive');
      expect(card).toHaveClass('shadow-card-selected');
    });

    it('não deve aplicar classes de seleção quando não selecionado', () => {
      render(<Card>Não Selecionado</Card>);

      const card = screen.getByText('Não Selecionado');
      expect(card).not.toHaveClass('shadow-card-selected');
    });

    it('deve ter aria-pressed quando interativo e selecionado', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick} selected>Selecionado</Card>);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-pressed', 'true');
    });

    it('deve ter aria-pressed false quando interativo e não selecionado', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Não Selecionado</Card>);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Interação onClick', () => {
    it('deve chamar onClick quando clicado', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Clicável</Card>);

      const card = screen.getByText('Clicável');
      fireEvent.click(card);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onClick ao pressionar Enter', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Clicável</Card>);

      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onClick ao pressionar Space', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Clicável</Card>);

      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: ' ' });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('não deve ter role button quando não interativo', () => {
      render(<Card>Não Interativo</Card>);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Classes customizadas', () => {
    it('deve aceitar className adicional', () => {
      render(<Card className="custom-class">Custom</Card>);

      const card = screen.getByText('Custom');
      expect(card).toHaveClass('custom-class');
    });

    it('deve manter classes base com className adicional', () => {
      render(<Card className="custom-class" variant="highlight">Custom</Card>);

      const card = screen.getByText('Custom');
      expect(card).toHaveClass('custom-class');
      expect(card).toHaveClass('backdrop-blur-sm');
      expect(card).toHaveClass('border-l-primary');
    });
  });

  describe('Acessibilidade', () => {
    it('deve ter role button quando interativo', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Acessível</Card>);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('deve ser focável quando interativo', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Focável</Card>);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('não deve ser focável quando não interativo', () => {
      render(<Card>Não Focável</Card>);

      const card = screen.getByText('Não Focável');
      expect(card).not.toHaveAttribute('tabIndex');
    });

    it('deve ter classes de focus-visible para navegação por teclado', () => {
      render(<Card>Focável</Card>);

      const card = screen.getByText('Focável');
      expect(card).toHaveClass('focus-visible:ring-2');
      expect(card).toHaveClass('focus-visible:ring-primary');
    });
  });

  describe('Ref forwarding', () => {
    it('deve encaminhar ref para o elemento div', () => {
      const ref = vi.fn();
      render(<Card ref={ref}>Com Ref</Card>);

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    });
  });

  describe('Glassmorphism', () => {
    it('deve ter backdrop-filter blur', () => {
      render(<Card>Glass</Card>);

      const card = screen.getByText('Glass');
      expect(card).toHaveClass('backdrop-blur-sm');
    });

    it('deve ter border-radius correto', () => {
      render(<Card>Rounded</Card>);

      const card = screen.getByText('Rounded');
      expect(card).toHaveClass('rounded-lg');
    });

    it('deve ter padding correto', () => {
      render(<Card>Padded</Card>);

      const card = screen.getByText('Padded');
      expect(card).toHaveClass('p-4');
    });
  });
});
