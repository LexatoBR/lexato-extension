/**
 * Testes unitários para Sidebar
 *
 * Valida navegação entre abas, estados visuais dos ícones, tooltips,
 * avatar do usuário e menu de opções.
 *
 * @see Requirements 8.1-8.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar, type TabId } from '@popup/components/Sidebar';

describe('Sidebar', () => {
  const mockOnTabChange = vi.fn();
  const mockOnHelpClick = vi.fn();
  const mockOnLogout = vi.fn();
  const mockOnSettingsClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderização', () => {
    it('deve renderizar todos os 4 botões de navegação', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      expect(screen.getByRole('button', { name: 'Nova Captura' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Diagnóstico' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Design System' })).toBeInTheDocument();
    });

    it('deve renderizar navegação', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('deve renderizar logo Lexato', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      expect(screen.getByAltText('Lexato')).toBeInTheDocument();
    });

    it('deve renderizar avatar do usuário', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      // Avatar padrão mostra 'U' quando não há userName
      expect(screen.getByText('U')).toBeInTheDocument();
    });

    it('deve renderizar avatar com inicial do nome quando userName é fornecido', () => {
      render(
        <Sidebar
          activeTab="capture"
          onTabChange={mockOnTabChange}
          userName="João Silva"
        />
      );

      expect(screen.getByText('J')).toBeInTheDocument();
    });

    it('deve renderizar imagem do avatar quando avatarUrl é fornecido', () => {
      render(
        <Sidebar
          activeTab="capture"
          onTabChange={mockOnTabChange}
          avatarUrl="https://example.com/avatar.jpg"
          userName="João Silva"
        />
      );

      const avatar = screen.getByAltText('João Silva');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('deve ter largura de 60px', () => {
      const { container } = render(
        <Sidebar activeTab="capture" onTabChange={mockOnTabChange} />
      );

      const sidebar = container.querySelector('aside');
      expect(sidebar).toHaveStyle({ width: '60px' });
    });
  });

  describe('navegação entre abas', () => {
    it('deve chamar onTabChange ao clicar em Nova Captura', () => {
      render(<Sidebar activeTab="history" onTabChange={mockOnTabChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Nova Captura' }));

      expect(mockOnTabChange).toHaveBeenCalledWith('capture');
    });

    it('deve chamar onTabChange ao clicar em Histórico', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));

      expect(mockOnTabChange).toHaveBeenCalledWith('history');
    });

    it('deve chamar onTabChange ao clicar em Design System', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Design System' }));

      expect(mockOnTabChange).toHaveBeenCalledWith('showcase');
    });

    it('deve chamar onTabChange ao clicar em Diagnóstico', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Diagnóstico' }));

      expect(mockOnTabChange).toHaveBeenCalledWith('diagnostic');
    });
  });

  describe('estados visuais', () => {
    it('deve marcar aba Nova Captura como ativa com aria-current', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      const captureButton = screen.getByRole('button', { name: 'Nova Captura' });
      const historyButton = screen.getByRole('button', { name: 'Histórico' });

      expect(captureButton).toHaveAttribute('aria-current', 'page');
      expect(historyButton).not.toHaveAttribute('aria-current');
    });

    it('deve marcar aba Histórico como ativa com aria-current', () => {
      render(<Sidebar activeTab="history" onTabChange={mockOnTabChange} />);

      const captureButton = screen.getByRole('button', { name: 'Nova Captura' });
      const historyButton = screen.getByRole('button', { name: 'Histórico' });

      expect(captureButton).not.toHaveAttribute('aria-current');
      expect(historyButton).toHaveAttribute('aria-current', 'page');
    });

    it('deve exibir badge de contagem quando pendingCount é fornecido', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} pendingCount={5} />);

      // Badge deve mostrar o número
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('não deve exibir badge quando pendingCount é 0', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} pendingCount={0} />);

      // Não deve haver badge visível
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('deve exibir "9+" quando pendingCount é maior que 9', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} pendingCount={15} />);

      expect(screen.getByText('9+')).toBeInTheDocument();
    });
  });

  describe('tooltips', () => {
    it('deve exibir tooltip ao passar mouse sobre Nova Captura', () => {
      render(<Sidebar activeTab="history" onTabChange={mockOnTabChange} />);

      const captureButton = screen.getByRole('button', { name: 'Nova Captura' });
      fireEvent.mouseEnter(captureButton);

      expect(screen.getByRole('tooltip')).toHaveTextContent('Nova Captura');
    });

    it('deve exibir tooltip ao passar mouse sobre Histórico', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      const historyButton = screen.getByRole('button', { name: 'Histórico' });
      fireEvent.mouseEnter(historyButton);

      expect(screen.getByRole('tooltip')).toHaveTextContent('Histórico');
    });

    it('deve ocultar tooltip ao remover mouse', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      const historyButton = screen.getByRole('button', { name: 'Histórico' });

      fireEvent.mouseEnter(historyButton);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.mouseLeave(historyButton);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('menu do avatar', () => {
    it('deve abrir menu ao clicar no avatar', () => {
      render(
        <Sidebar
          activeTab="capture"
          onTabChange={mockOnTabChange}
          userName="João Silva"
          userEmail="joao@example.com"
          onHelpClick={mockOnHelpClick}
          onLogout={mockOnLogout}
          onSettingsClick={mockOnSettingsClick}
        />
      );

      // Clicar no avatar (inicial J)
      const avatar = screen.getByText('J');
      fireEvent.click(avatar);

      // Menu deve aparecer com opções
      expect(screen.getByText('Minha Conta')).toBeInTheDocument();
      expect(screen.getByText('Configurações')).toBeInTheDocument();
      expect(screen.getByText('Ajuda e Suporte')).toBeInTheDocument();
      expect(screen.getByText('Sair da Conta')).toBeInTheDocument();
    });

    it('deve exibir nome e email do usuário no menu', () => {
      render(
        <Sidebar
          activeTab="capture"
          onTabChange={mockOnTabChange}
          userName="João Silva"
          userEmail="joao@example.com"
        />
      );

      const avatar = screen.getByText('J');
      fireEvent.click(avatar);

      expect(screen.getByText('João Silva')).toBeInTheDocument();
      expect(screen.getByText('joao@example.com')).toBeInTheDocument();
    });

    it('deve chamar onHelpClick ao clicar em Ajuda e Suporte', () => {
      render(
        <Sidebar
          activeTab="capture"
          onTabChange={mockOnTabChange}
          userName="João"
          onHelpClick={mockOnHelpClick}
        />
      );

      const avatar = screen.getByText('J');
      fireEvent.click(avatar);

      const helpButton = screen.getByText('Ajuda e Suporte');
      fireEvent.click(helpButton);

      expect(mockOnHelpClick).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onLogout ao clicar em Sair da Conta', () => {
      render(
        <Sidebar
          activeTab="capture"
          onTabChange={mockOnTabChange}
          userName="João"
          onLogout={mockOnLogout}
        />
      );

      const avatar = screen.getByText('J');
      fireEvent.click(avatar);

      const logoutButton = screen.getByText('Sair da Conta');
      fireEvent.click(logoutButton);

      expect(mockOnLogout).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onSettingsClick ao clicar em Configurações', () => {
      render(
        <Sidebar
          activeTab="capture"
          onTabChange={mockOnTabChange}
          userName="João"
          onSettingsClick={mockOnSettingsClick}
        />
      );

      const avatar = screen.getByText('J');
      fireEvent.click(avatar);

      const settingsButton = screen.getByText('Configurações');
      fireEvent.click(settingsButton);

      expect(mockOnSettingsClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('acessibilidade', () => {
    it('deve ter botões de navegação acessíveis por teclado', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      // Todos os botões de navegação devem ser focáveis
      const navButtons = [
        screen.getByRole('button', { name: 'Nova Captura' }),
        screen.getByRole('button', { name: 'Histórico' }),
        screen.getByRole('button', { name: 'Diagnóstico' }),
        screen.getByRole('button', { name: 'Design System' }),
      ];

      navButtons.forEach((button) => {
        expect(button).not.toHaveAttribute('tabindex', '-1');
      });
    });

    it('deve ter aria-label em todos os botões de navegação', () => {
      render(<Sidebar activeTab="capture" onTabChange={mockOnTabChange} />);

      expect(screen.getByRole('button', { name: 'Nova Captura' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Diagnóstico' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Design System' })).toBeInTheDocument();
    });

    it('deve permitir abrir menu do avatar com teclado', () => {
      render(
        <Sidebar
          activeTab="capture"
          onTabChange={mockOnTabChange}
          userName="João"
        />
      );

      const avatar = screen.getByText('J');
      fireEvent.keyDown(avatar, { key: 'Enter' });

      expect(screen.getByText('Minha Conta')).toBeInTheDocument();
    });
  });

  describe('navegação por todas as abas', () => {
    const tabs: TabId[] = ['capture', 'history', 'diagnostic', 'settings', 'showcase'];

    tabs.forEach((tab) => {
      it(`deve renderizar corretamente com aba ${tab} ativa`, () => {
        render(
          <Sidebar
            activeTab={tab}
            onTabChange={mockOnTabChange}
          />
        );

        // Verifica que a navegação está presente
        expect(screen.getByRole('navigation')).toBeInTheDocument();
      });
    });
  });
});
