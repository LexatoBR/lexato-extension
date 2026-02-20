/**
 * Testes unitários para o componente Header
 *
 * Valida renderização de contextos, badges e widgets.
 *
 * @see Requirements 9.1-9.5
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/layout/Header';

describe('Header', () => {
  describe('Seletor de contexto', () => {
    it('deve renderizar contexto pessoal por padrão', () => {
      render(<Header />);

      const contextButton = screen.getByRole('button', { name: /contexto atual/i });
      expect(contextButton).toBeInTheDocument();
      expect(contextButton).toHaveTextContent('Conta Pessoal');
    });

    it('deve renderizar contexto enterprise com nome da empresa', () => {
      render(<Header context="enterprise" enterpriseName="Lexato Corp" />);

      const contextButton = screen.getByRole('button', { name: /contexto atual/i });
      expect(contextButton).toHaveTextContent('Lexato Corp');
    });

    it('deve exibir badge ENTERPRISE quando contexto enterprise', () => {
      render(<Header context="enterprise" enterpriseName="Empresa Teste" />);

      expect(screen.getByText('Enterprise')).toBeInTheDocument();
    });

    it('não deve exibir badge ENTERPRISE quando contexto pessoal', () => {
      render(<Header context="personal" />);

      expect(screen.queryByText('Enterprise')).not.toBeInTheDocument();
    });

    it('deve chamar onContextClick ao clicar no seletor', () => {
      const handleClick = vi.fn();
      render(<Header onContextClick={handleClick} />);

      fireEvent.click(screen.getByRole('button', { name: /contexto atual/i }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Widget de créditos', () => {
    it('deve exibir quantidade de créditos', () => {
      render(<Header credits={50} maxCredits={100} />);

      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('deve ter aria-label com informação de créditos', () => {
      render(<Header credits={75} maxCredits={100} />);

      const creditsButton = screen.getByLabelText(/75 créditos disponíveis/i);
      expect(creditsButton).toBeInTheDocument();
    });

    it('deve chamar onCreditsClick ao clicar no widget', () => {
      const handleClick = vi.fn();
      render(<Header credits={50} onCreditsClick={handleClick} />);

      fireEvent.click(screen.getByLabelText(/créditos disponíveis/i));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Botão de notificações', () => {
    it('deve exibir badge de contagem quando há notificações', () => {
      render(<Header notificationCount={5} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('não deve exibir badge quando não há notificações', () => {
      render(<Header notificationCount={0} />);

      const notificationButton = screen.getByLabelText(/sem notificações/i);
      expect(notificationButton).toBeInTheDocument();
      // Badge de contagem não deve existir
      expect(screen.queryByLabelText(/notificações não lidas/i)).not.toBeInTheDocument();
    });

    it('deve chamar onNotificationsClick ao clicar', () => {
      const handleClick = vi.fn();
      render(<Header notificationCount={3} onNotificationsClick={handleClick} />);

      fireEvent.click(screen.getByLabelText(/notificações não lidas/i));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Estilos e layout', () => {
    it('deve ter altura de 64px (h-16)', () => {
      render(<Header />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('h-16');
    });

    it('deve ter backdrop-blur para efeito glass', () => {
      render(<Header />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('backdrop-blur-lg');
    });

    it('deve aceitar className adicional', () => {
      render(<Header className="custom-header" />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('custom-header');
    });
  });
});
