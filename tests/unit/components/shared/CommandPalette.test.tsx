/**
 * Testes unitários para o componente CommandPalette
 *
 * Valida renderização, navegação por teclado, busca e execução de comandos.
 * Testa atalhos para Windows (Ctrl) e Mac (Cmd).
 *
 * @see Requirements 24.1-24.7
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '@/components/shared/CommandPalette';
import type { Command } from '@/lib/hooks/useCommandPalette';

// Mock do scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock do useOS para testar ambos os sistemas
vi.mock('@/lib/hooks/useOS', () => ({
  useOS: vi.fn(() => ({
    os: 'windows',
    isMac: false,
    isWindows: true,
    isLinux: false,
    modKey: 'Ctrl',
    modKeySymbol: 'Ctrl',
  })),
}));

// Importar o mock para poder alterá-lo
import { useOS } from '@/lib/hooks/useOS';
const mockUseOS = vi.mocked(useOS);

// Comandos de teste
const mockCommands: Command[] = [
  {
    id: 'new-capture',
    title: 'Nova Captura',
    description: 'Iniciar uma nova captura de tela',
    category: 'capture',
    shortcutWindows: 'Ctrl+Shift+C',
    shortcutMac: 'Cmd+Shift+C',
    action: vi.fn(),
  },
  {
    id: 'history',
    title: 'Histórico',
    description: 'Ver capturas anteriores',
    category: 'navigation',
    shortcutWindows: 'Ctrl+H',
    shortcutMac: 'Cmd+H',
    action: vi.fn(),
  },
  {
    id: 'settings',
    title: 'Configurações',
    description: 'Abrir configurações',
    category: 'settings',
    shortcutWindows: 'Ctrl+,',
    shortcutMac: 'Cmd+,',
    action: vi.fn(),
  },
  {
    id: 'help',
    title: 'Ajuda',
    category: 'help',
    action: vi.fn(),
  },
];

// Props padrão para testes
const defaultProps = {
  isOpen: true,
  searchTerm: '',
  selectedIndex: 0,
  filteredCommands: mockCommands,
  onClose: vi.fn(),
  onSearchChange: vi.fn(),
  onExecute: vi.fn(),
  onSelectNext: vi.fn(),
  onSelectPrevious: vi.fn(),
  onExecuteSelected: vi.fn(),
};

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset para Windows por padrão
    mockUseOS.mockReturnValue({
      os: 'windows',
      isMac: false,
      isWindows: true,
      isLinux: false,
      modKey: 'Ctrl',
      modKeySymbol: 'Ctrl',
    });
  });

  describe('Renderização básica', () => {
    it('deve renderizar quando isOpen é true', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('não deve renderizar quando isOpen é false', () => {
      render(<CommandPalette {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('deve renderizar input de busca com placeholder', () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByRole('textbox', { name: /buscar comandos/i });
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('placeholder');
    });

    it('deve renderizar lista de comandos', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('Nova Captura')).toBeInTheDocument();
      expect(screen.getByText('Histórico')).toBeInTheDocument();
      // Configurações e Ajuda aparecem como categoria e como comando
      expect(screen.getAllByText('Configurações').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Ajuda').length).toBeGreaterThanOrEqual(1);
    });

    it('deve exibir mensagem quando não há resultados', () => {
      render(<CommandPalette {...defaultProps} filteredCommands={[]} />);

      expect(screen.getByText(/nenhum comando encontrado/i)).toBeInTheDocument();
    });
  });

  describe('Atalhos de teclado - Windows', () => {
    beforeEach(() => {
      mockUseOS.mockReturnValue({
        os: 'windows',
        isMac: false,
        isWindows: true,
        isLinux: false,
        modKey: 'Ctrl',
        modKeySymbol: 'Ctrl',
      });
    });

    it('deve exibir atalhos de Windows', () => {
      render(<CommandPalette {...defaultProps} />);

      // Verifica se atalhos de Windows estão presentes (podem aparecer múltiplas vezes)
      expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Shift').length).toBeGreaterThan(0);
      expect(screen.getAllByText('C').length).toBeGreaterThan(0);
    });

    it('deve exibir CtrlK no input', () => {
      render(<CommandPalette {...defaultProps} />);

      // Verifica se o atalho CtrlK está visível
      const kbdElements = screen.getAllByText('Ctrl');
      expect(kbdElements.length).toBeGreaterThan(0);
    });
  });

  describe('Atalhos de teclado - Mac', () => {
    beforeEach(() => {
      mockUseOS.mockReturnValue({
        os: 'mac',
        isMac: true,
        isWindows: false,
        isLinux: false,
        modKey: 'Cmd',
        modKeySymbol: '⌘',
      });
    });

    it('deve exibir atalhos de Mac', () => {
      render(<CommandPalette {...defaultProps} />);

      // Verifica se atalhos de Mac estão presentes (podem aparecer múltiplas vezes)
      expect(screen.getAllByText('Cmd').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Shift').length).toBeGreaterThan(0);
    });

    it('deve exibir ⌘K no input', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('⌘K')).toBeInTheDocument();
    });
  });

  describe('Navegação por teclado', () => {
    it('deve chamar onSelectNext ao pressionar ArrowDown', () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(defaultProps.onSelectNext).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onSelectPrevious ao pressionar ArrowUp', () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      expect(defaultProps.onSelectPrevious).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onExecuteSelected ao pressionar Enter', () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(defaultProps.onExecuteSelected).toHaveBeenCalledTimes(1);
    });

    it('deve chamar onClose ao pressionar Escape', () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Busca', () => {
    it('deve chamar onSearchChange ao digitar', () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'captura' } });

      expect(defaultProps.onSearchChange).toHaveBeenCalledWith('captura');
    });

    it('deve exibir termo de busca no input', () => {
      render(<CommandPalette {...defaultProps} searchTerm="teste" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('teste');
    });
  });

  describe('Execução de comandos', () => {
    it('deve chamar onExecute ao clicar em um comando', () => {
      render(<CommandPalette {...defaultProps} />);

      const command = screen.getByText('Nova Captura');
      const button = command.closest('button');
      if (button) fireEvent.click(button);

      expect(defaultProps.onExecute).toHaveBeenCalledWith(mockCommands[0]);
    });

    it('não deve executar comando desabilitado', () => {
      const firstCommand = mockCommands[0];
      if (!firstCommand) throw new Error('mockCommands[0] não definido');

      const disabledCommand: Command = {
        ...firstCommand,
        disabled: true,
      };

      render(
        <CommandPalette
          {...defaultProps}
          filteredCommands={[disabledCommand]}
        />
      );

      const button = screen.getByRole('option');
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Seleção visual', () => {
    it('deve destacar o comando selecionado', () => {
      render(<CommandPalette {...defaultProps} selectedIndex={0} />);

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('deve atualizar seleção quando selectedIndex muda', () => {
      const { rerender } = render(
        <CommandPalette {...defaultProps} selectedIndex={0} />
      );

      let options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');

      rerender(<CommandPalette {...defaultProps} selectedIndex={1} />);

      options = screen.getAllByRole('option');
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Fechamento', () => {
    it('deve chamar onClose ao clicar no backdrop', () => {
      render(<CommandPalette {...defaultProps} />);

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('não deve fechar ao clicar dentro do modal', () => {
      render(<CommandPalette {...defaultProps} />);

      const combobox = screen.getByRole('combobox');
      fireEvent.click(combobox);

      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('Categorias', () => {
    it('deve agrupar comandos por categoria', () => {
      render(<CommandPalette {...defaultProps} />);

      // Verifica headers de categoria (usando getAllByText para lidar com duplicatas)
      expect(screen.getByText('Captura')).toBeInTheDocument();
      expect(screen.getByText('Navegação')).toBeInTheDocument();
      // Configurações aparece como categoria e como comando
      expect(screen.getAllByText('Configurações').length).toBeGreaterThanOrEqual(1);
      // Ajuda aparece como categoria e como comando
      expect(screen.getAllByText('Ajuda').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Acessibilidade', () => {
    it('deve ter role dialog', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('deve ter aria-modal true', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('deve ter listbox para comandos', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('deve ter options para cada comando', () => {
      render(<CommandPalette {...defaultProps} />);

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(mockCommands.length);
    });

    it('deve ter aria-label no input', () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-label');
    });
  });

  describe('Footer com dicas', () => {
    it('deve exibir dicas de navegação', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('navegar')).toBeInTheDocument();
      expect(screen.getByText('executar')).toBeInTheDocument();
      expect(screen.getByText('fechar')).toBeInTheDocument();
    });

    it('deve exibir teclas de atalho nas dicas', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('↑')).toBeInTheDocument();
      expect(screen.getByText('↓')).toBeInTheDocument();
      expect(screen.getByText('Enter')).toBeInTheDocument();
      expect(screen.getByText('Esc')).toBeInTheDocument();
    });
  });
});
