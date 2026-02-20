/**
 * Testes unitários para o componente Button
 *
 * Valida renderização de variantes, estados e interações.
 *
 * @see Requirements 4.1-4.7
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  describe('Renderização de variantes', () => {
    it('deve renderizar variante primary com gradiente verde', () => {
      render(<Button variant="primary">Primário</Button>);

      const button = screen.getByRole('button', { name: 'Primário' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-gradient-to-br');
      expect(button).toHaveClass('from-primary');
      expect(button).toHaveClass('to-primary-dark');
    });

    it('deve renderizar variante secondary com efeito glass', () => {
      render(<Button variant="secondary">Secundário</Button>);

      const button = screen.getByRole('button', { name: 'Secundário' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-glass-bgLight');
      expect(button).toHaveClass('backdrop-blur-sm');
      expect(button).toHaveClass('border');
    });

    it('deve renderizar variante ghost com background transparente', () => {
      render(<Button variant="ghost">Ghost</Button>);

      const button = screen.getByRole('button', { name: 'Ghost' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-transparent');
    });

    it('deve usar variante primary como padrão', () => {
      render(<Button>Padrão</Button>);

      const button = screen.getByRole('button', { name: 'Padrão' });
      expect(button).toHaveClass('bg-gradient-to-br');
    });
  });

  describe('Renderização de tamanhos', () => {
    it('deve renderizar tamanho sm com altura 32px', () => {
      render(<Button size="sm">Pequeno</Button>);

      const button = screen.getByRole('button', { name: 'Pequeno' });
      expect(button).toHaveClass('h-8');
      expect(button).toHaveClass('px-3');
      expect(button).toHaveClass('text-sm');
    });

    it('deve renderizar tamanho md com altura 40px', () => {
      render(<Button size="md">Médio</Button>);

      const button = screen.getByRole('button', { name: 'Médio' });
      expect(button).toHaveClass('h-10');
      expect(button).toHaveClass('px-4');
    });

    it('deve renderizar tamanho lg com altura 48px', () => {
      render(<Button size="lg">Grande</Button>);

      const button = screen.getByRole('button', { name: 'Grande' });
      expect(button).toHaveClass('h-12');
      expect(button).toHaveClass('px-5');
    });

    it('deve renderizar tamanho xl com altura 56px', () => {
      render(<Button size="xl">Extra Grande</Button>);

      const button = screen.getByRole('button', { name: 'Extra Grande' });
      expect(button).toHaveClass('h-14');
      expect(button).toHaveClass('px-6');
      expect(button).toHaveClass('text-lg');
    });

    it('deve usar tamanho md como padrão', () => {
      render(<Button>Padrão</Button>);

      const button = screen.getByRole('button', { name: 'Padrão' });
      expect(button).toHaveClass('h-10');
    });
  });

  describe('Estado disabled', () => {
    it('deve aplicar opacidade reduzida quando disabled', () => {
      render(<Button disabled>Desabilitado</Button>);

      const button = screen.getByRole('button', { name: 'Desabilitado' });
      expect(button).toBeDisabled();
      expect(button).toHaveClass('disabled:opacity-50');
      expect(button).toHaveClass('disabled:cursor-not-allowed');
    });

    it('deve ter aria-disabled quando disabled', () => {
      render(<Button disabled>Desabilitado</Button>);

      const button = screen.getByRole('button', { name: 'Desabilitado' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('não deve chamar onClick quando disabled', () => {
      const handleClick = vi.fn();
      render(<Button disabled onClick={handleClick}>Desabilitado</Button>);

      const button = screen.getByRole('button', { name: 'Desabilitado' });
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Estado loading', () => {
    it('deve exibir spinner quando loading', () => {
      render(<Button loading>Carregando</Button>);

      const button = screen.getByRole('button', { name: 'Carregando' });
      const spinner = button.querySelector('svg.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('deve desabilitar botão quando loading', () => {
      render(<Button loading>Carregando</Button>);

      const button = screen.getByRole('button', { name: 'Carregando' });
      expect(button).toBeDisabled();
    });

    it('deve ter aria-busy quando loading', () => {
      render(<Button loading>Carregando</Button>);

      const button = screen.getByRole('button', { name: 'Carregando' });
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('não deve chamar onClick quando loading', () => {
      const handleClick = vi.fn();
      render(<Button loading onClick={handleClick}>Carregando</Button>);

      const button = screen.getByRole('button', { name: 'Carregando' });
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Interação onClick', () => {
    it('deve chamar onClick quando clicado', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Clique</Button>);

      const button = screen.getByRole('button', { name: 'Clique' });
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('deve passar evento para onClick', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Clique</Button>);

      const button = screen.getByRole('button', { name: 'Clique' });
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('Classes customizadas', () => {
    it('deve aceitar className adicional', () => {
      render(<Button className="custom-class">Custom</Button>);

      const button = screen.getByRole('button', { name: 'Custom' });
      expect(button).toHaveClass('custom-class');
    });

    it('deve manter classes base com className adicional', () => {
      render(<Button className="custom-class" variant="primary">Custom</Button>);

      const button = screen.getByRole('button', { name: 'Custom' });
      expect(button).toHaveClass('custom-class');
      expect(button).toHaveClass('bg-gradient-to-br');
    });
  });

  describe('Acessibilidade', () => {
    it('deve ter role button', () => {
      render(<Button>Acessível</Button>);

      expect(screen.getByRole('button', { name: 'Acessível' })).toBeInTheDocument();
    });

    it('deve aceitar type button', () => {
      render(<Button type="button">Tipo Button</Button>);

      const button = screen.getByRole('button', { name: 'Tipo Button' });
      expect(button).toHaveAttribute('type', 'button');
    });

    it('deve aceitar type submit', () => {
      render(<Button type="submit">Tipo Submit</Button>);

      const button = screen.getByRole('button', { name: 'Tipo Submit' });
      expect(button).toHaveAttribute('type', 'submit');
    });

    it('deve ter classes de focus-visible para navegação por teclado', () => {
      render(<Button>Focável</Button>);

      const button = screen.getByRole('button', { name: 'Focável' });
      expect(button).toHaveClass('focus-visible:ring-2');
      expect(button).toHaveClass('focus-visible:ring-primary');
    });
  });

  describe('Ref forwarding', () => {
    it('deve encaminhar ref para o elemento button', () => {
      const ref = vi.fn();
      render(<Button ref={ref}>Com Ref</Button>);

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
    });
  });
});
