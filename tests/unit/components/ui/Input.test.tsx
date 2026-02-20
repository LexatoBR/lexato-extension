/**
 * Testes unitários para o componente Input
 *
 * Valida renderização, estados focus/error e ícone.
 *
 * @see Requirements 5.1-5.5
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '@/components/ui/Input';

describe('Input', () => {
  describe('Renderização básica', () => {
    it('deve renderizar input com placeholder', () => {
      render(<Input placeholder="Digite aqui" />);

      const input = screen.getByPlaceholderText('Digite aqui');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
    });

    it('deve usar type text como padrão', () => {
      render(<Input placeholder="Texto" />);

      const input = screen.getByPlaceholderText('Texto');
      expect(input).toHaveAttribute('type', 'text');
    });

    it('deve aceitar diferentes tipos de input', () => {
      const { rerender } = render(<Input type="email" placeholder="E-mail" />);
      expect(screen.getByPlaceholderText('E-mail')).toHaveAttribute('type', 'email');

      rerender(<Input type="password" placeholder="Senha" />);
      expect(screen.getByPlaceholderText('Senha')).toHaveAttribute('type', 'password');

      rerender(<Input type="search" placeholder="Buscar" />);
      expect(screen.getByPlaceholderText('Buscar')).toHaveAttribute('type', 'search');
    });
  });

  describe('Efeito glassmorphism', () => {
    it('deve ter background glass com backdrop-blur', () => {
      render(<Input placeholder="Glass" />);

      const wrapper = screen.getByPlaceholderText('Glass').parentElement;
      expect(wrapper).toHaveClass('bg-glass-bgLight');
      expect(wrapper).toHaveClass('backdrop-blur-[10px]');
    });

    it('deve ter borda sutil', () => {
      render(<Input placeholder="Borda" />);

      const wrapper = screen.getByPlaceholderText('Borda').parentElement;
      expect(wrapper).toHaveClass('border');
      expect(wrapper).toHaveClass('border-glass-border');
    });

    it('deve ter border-radius arredondado', () => {
      render(<Input placeholder="Radius" />);

      const wrapper = screen.getByPlaceholderText('Radius').parentElement;
      expect(wrapper).toHaveClass('rounded-lg');
    });
  });

  describe('Estado focus', () => {
    it('deve ter classes de focus-within para borda verde e glow', () => {
      render(<Input placeholder="Focus" />);

      const wrapper = screen.getByPlaceholderText('Focus').parentElement;
      expect(wrapper).toHaveClass('focus-within:border-glass-borderActive');
      expect(wrapper).toHaveClass('focus-within:shadow-[0_0_25px_rgba(0,222,165,0.1)]');
    });

    it('deve mudar background no focus', () => {
      render(<Input placeholder="Focus BG" />);

      const wrapper = screen.getByPlaceholderText('Focus BG').parentElement;
      expect(wrapper).toHaveClass('focus-within:bg-[rgba(255,255,255,0.06)]');
    });
  });

  describe('Estado error', () => {
    it('deve aplicar borda vermelha quando error', () => {
      render(<Input error="Campo obrigatório" placeholder="Erro" />);

      const wrapper = screen.getByPlaceholderText('Erro').parentElement;
      expect(wrapper).toHaveClass('border-status-error');
    });

    it('deve aplicar shadow de erro', () => {
      render(<Input error="Inválido" placeholder="Shadow erro" />);

      const wrapper = screen.getByPlaceholderText('Shadow erro').parentElement;
      expect(wrapper).toHaveClass('shadow-[0_0_15px_rgba(239,83,80,0.1)]');
    });

    it('deve exibir mensagem de erro', () => {
      render(<Input error="E-mail inválido" placeholder="E-mail" />);

      expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido');
    });

    it('deve ter aria-invalid quando error', () => {
      render(<Input error="Erro" placeholder="Invalid" />);

      const input = screen.getByPlaceholderText('Invalid');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('deve associar mensagem de erro via aria-describedby', () => {
      render(<Input error="Erro de validação" placeholder="Descrito" />);

      const input = screen.getByPlaceholderText('Descrito');
      const errorId = input.getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();
      expect(screen.getByRole('alert')).toHaveAttribute('id', errorId);
    });
  });

  describe('Renderização com ícone', () => {
    it('deve renderizar ícone à esquerda', () => {
      const TestIcon = () => <svg data-testid="test-icon" />;
      render(<Input icon={<TestIcon />} placeholder="Com ícone" />);

      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('deve posicionar ícone antes do input', () => {
      const TestIcon = () => <svg data-testid="test-icon" />;
      render(<Input icon={<TestIcon />} placeholder="Ícone esquerda" />);

      const wrapper = screen.getByPlaceholderText('Ícone esquerda').parentElement;
      const icon = screen.getByTestId('test-icon').parentElement;
      const input = screen.getByPlaceholderText('Ícone esquerda');

      // Ícone deve vir antes do input no DOM
      const children = Array.from(wrapper?.children ?? []);
      const iconIndex = icon ? children.indexOf(icon) : -1;
      const inputIndex = children.indexOf(input);
      expect(iconIndex).toBeLessThan(inputIndex);
    });

    it('deve ter ícone com cor muted por padrão', () => {
      const TestIcon = () => <svg data-testid="test-icon" />;
      render(<Input icon={<TestIcon />} placeholder="Ícone cor" />);

      const iconWrapper = screen.getByTestId('test-icon').parentElement;
      expect(iconWrapper).toHaveClass('text-text-muted');
    });

    it('deve mudar cor do ícone no focus', () => {
      const TestIcon = () => <svg data-testid="test-icon" />;
      render(<Input icon={<TestIcon />} placeholder="Ícone focus" />);

      const iconWrapper = screen.getByTestId('test-icon').parentElement;
      expect(iconWrapper).toHaveClass('group-focus-within:text-primary');
    });

    it('deve ter ícone vermelho quando error', () => {
      const TestIcon = () => <svg data-testid="test-icon" />;
      render(<Input icon={<TestIcon />} error="Erro" placeholder="Ícone erro" />);

      const iconWrapper = screen.getByTestId('test-icon').parentElement;
      expect(iconWrapper).toHaveClass('text-status-error');
    });

    it('deve ter aria-hidden no wrapper do ícone', () => {
      const TestIcon = () => <svg data-testid="test-icon" />;
      render(<Input icon={<TestIcon />} placeholder="Ícone hidden" />);

      const iconWrapper = screen.getByTestId('test-icon').parentElement;
      expect(iconWrapper).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Estado disabled', () => {
    it('deve desabilitar input quando disabled', () => {
      render(<Input disabled placeholder="Desabilitado" />);

      const input = screen.getByPlaceholderText('Desabilitado');
      expect(input).toBeDisabled();
    });

    it('deve aplicar opacidade reduzida quando disabled', () => {
      render(<Input disabled placeholder="Opacidade" />);

      const wrapper = screen.getByPlaceholderText('Opacidade').parentElement;
      expect(wrapper).toHaveClass('opacity-50');
    });

    it('deve ter cursor not-allowed quando disabled', () => {
      render(<Input disabled placeholder="Cursor" />);

      const wrapper = screen.getByPlaceholderText('Cursor').parentElement;
      expect(wrapper).toHaveClass('cursor-not-allowed');
    });
  });

  describe('Label e helper text', () => {
    it('deve renderizar label quando fornecido', () => {
      render(<Input label="E-mail" placeholder="seu@email.com" />);

      expect(screen.getByText('E-mail')).toBeInTheDocument();
    });

    it('deve associar label ao input via htmlFor', () => {
      render(<Input label="Nome" placeholder="Seu nome" />);

      const label = screen.getByText('Nome');
      const input = screen.getByPlaceholderText('Seu nome');
      expect(label).toHaveAttribute('for', input.id);
    });

    it('deve renderizar helper text quando fornecido', () => {
      render(<Input helperText="Texto de ajuda" placeholder="Input" />);

      expect(screen.getByText('Texto de ajuda')).toBeInTheDocument();
    });

    it('deve ocultar helper text quando há erro', () => {
      render(
        <Input
          helperText="Texto de ajuda"
          error="Erro de validação"
          placeholder="Input"
        />
      );

      expect(screen.queryByText('Texto de ajuda')).not.toBeInTheDocument();
      expect(screen.getByText('Erro de validação')).toBeInTheDocument();
    });
  });

  describe('Interação onChange', () => {
    it('deve chamar onChange quando valor muda', () => {
      const handleChange = vi.fn();
      render(<Input onChange={handleChange} placeholder="Mudança" />);

      const input = screen.getByPlaceholderText('Mudança');
      fireEvent.change(input, { target: { value: 'novo valor' } });

      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it('deve atualizar valor do input', () => {
      render(<Input placeholder="Valor" />);

      const input = screen.getByPlaceholderText('Valor') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'teste' } });

      expect(input.value).toBe('teste');
    });
  });

  describe('Classes customizadas', () => {
    it('deve aceitar className adicional no input', () => {
      render(<Input className="custom-class" placeholder="Custom" />);

      const input = screen.getByPlaceholderText('Custom');
      expect(input).toHaveClass('custom-class');
    });
  });

  describe('Acessibilidade', () => {
    it('deve ter role textbox implícito', () => {
      render(<Input placeholder="Acessível" />);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('deve aceitar id customizado', () => {
      render(<Input id="custom-id" placeholder="ID" />);

      const input = screen.getByPlaceholderText('ID');
      expect(input).toHaveAttribute('id', 'custom-id');
    });

    it('deve gerar id único quando não fornecido', () => {
      render(<Input placeholder="Auto ID" />);

      const input = screen.getByPlaceholderText('Auto ID');
      expect(input.id).toBeTruthy();
    });
  });

  describe('Ref forwarding', () => {
    it('deve encaminhar ref para o elemento input', () => {
      const ref = vi.fn();
      render(<Input ref={ref} placeholder="Com Ref" />);

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
    });
  });
});
