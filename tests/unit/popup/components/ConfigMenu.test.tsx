/**
 * Testes unitários para ConfigMenu
 *
 * Valida renderização, estilos, items e interações do menu de configurações.
 *
 * @see Requirements 9.1-9.12
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigMenu } from '@popup/components/ConfigMenu';

describe('ConfigMenu', () => {
  const mockOnClose = vi.fn();
  const mockOnLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderização', () => {
    it('não deve renderizar quando isOpen é false', () => {
      render(
        <ConfigMenu
          isOpen={false}
          onClose={mockOnClose}
          onLogout={mockOnLogout}
        />
      );

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('deve renderizar menu quando isOpen é true', () => {
      render(
        <ConfigMenu
          isOpen={true}
          onClose={mockOnClose}
          onLogout={mockOnLogout}
        />
      );

      expect(screen.getByRole('menu', { name: 'Menu de configurações' })).toBeInTheDocument();
    });

    it('deve renderizar todos os items do menu', () => {
      render(
        <ConfigMenu
          isOpen={true}
          onClose={mockOnClose}
          onLogout={mockOnLogout}
        />
      );

      expect(screen.getByRole('menuitem', { name: /Minha Conta/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Histórico Capturas/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Comprar Créditos/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /Sair da Conta/i })).toBeInTheDocument();
    });

    it('deve renderizar separador entre items e logout', () => {
      render(
        <ConfigMenu
          isOpen={true}
          onClose={mockOnClose}
          onLogout={mockOnLogout}
        />
      );

      expect(screen.getByRole('separator')).toBeInTheDocument();
    });
  });

  describe('interações', () => {
    it('deve fechar menu ao clicar no overlay', () => {
      const { container } = render(
        <ConfigMenu
          isOpen={true}
          onClose={mockOnClose}
          onLogout={mockOnLogout}
        />
      );

      // O overlay é o primeiro div com position fixed
      const overlay = container.querySelector('[aria-hidden="true"]');
      expect(overlay).toBeInTheDocument();
      fireEvent.click(overlay!);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onLogout e onClose ao clicar em Sair da Conta', () => {
      render(
        <ConfigMenu
          isOpen={true}
          onClose={mockOnClose}
          onLogout={mockOnLogout}
        />
      );

      fireEvent.click(screen.getByRole('menuitem', { name: /Sair da Conta/i }));

      expect(mockOnLogout).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('deve abrir link externo e fechar menu ao clicar em Minha Conta', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(
        <ConfigMenu
          isOpen={true}
          onClose={mockOnClose}
          onLogout={mockOnLogout}
        />
      );

      fireEvent.click(screen.getByRole('menuitem', { name: /Minha Conta/i }));

      expect(windowOpenSpy).toHaveBeenCalledWith('https://app.lexato.com.br/conta', '_blank');
      expect(mockOnClose).toHaveBeenCalledTimes(1);

      windowOpenSpy.mockRestore();
    });
  });
});
