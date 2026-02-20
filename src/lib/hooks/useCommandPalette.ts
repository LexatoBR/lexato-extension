/**
 * Hook para gerenciar estado da Command Palette
 *
 * Gerencia abertura/fechamento, busca, navegação por teclado
 * e execução de comandos.
 *
 * @see Requirements 24.1-24.7
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useOS } from './useOS';

/** Categoria de comando */
export type CommandCategory = 'capture' | 'navigation' | 'settings' | 'help';

/** Definição de um comando */
export interface Command {
  /** ID único do comando */
  id: string;
  /** Título do comando em português */
  title: string;
  /** Descrição opcional */
  description?: string;
  /** Categoria do comando */
  category: CommandCategory;
  /** Atalho de teclado para Windows */
  shortcutWindows?: string;
  /** Atalho de teclado para Mac */
  shortcutMac?: string;
  /** Ícone do comando (nome do ícone ou componente) */
  icon?: string;
  /** Função executada ao selecionar o comando */
  action: () => void;
  /** Se o comando está desabilitado */
  disabled?: boolean;
}

/** Estado da Command Palette */
export interface CommandPaletteState {
  /** Se a palette está aberta */
  isOpen: boolean;
  /** Termo de busca atual */
  searchTerm: string;
  /** Índice do comando selecionado */
  selectedIndex: number;
  /** Comandos filtrados pela busca */
  filteredCommands: Command[];
}

/** Resultado do hook useCommandPalette */
export interface UseCommandPaletteResult {
  /** Estado atual da palette */
  state: CommandPaletteState;
  /** Abre a palette */
  open: () => void;
  /** Fecha a palette */
  close: () => void;
  /** Alterna estado aberto/fechado */
  toggle: () => void;
  /** Atualiza o termo de busca */
  setSearchTerm: (term: string) => void;
  /** Move seleção para cima */
  selectPrevious: () => void;
  /** Move seleção para baixo */
  selectNext: () => void;
  /** Executa o comando selecionado */
  executeSelected: () => void;
  /** Executa um comando específico */
  executeCommand: (command: Command) => void;
  /** Todos os comandos disponíveis */
  commands: Command[];
  /** Registra um novo comando */
  registerCommand: (command: Command) => void;
  /** Remove um comando */
  unregisterCommand: (commandId: string) => void;
}

/** Opções do hook */
export interface UseCommandPaletteOptions {
  /** Comandos iniciais */
  initialCommands?: Command[];
  /** Callback quando a palette abre */
  onOpen?: () => void;
  /** Callback quando a palette fecha */
  onClose?: () => void;
  /** Callback quando um comando é executado */
  onExecute?: (command: Command) => void;
}

/**
 * Filtra comandos baseado no termo de busca
 *
 * @param commands - Lista de comandos
 * @param searchTerm - Termo de busca
 * @returns Comandos filtrados
 */
function filterCommands(commands: Command[], searchTerm: string): Command[] {
  if (!searchTerm.trim()) {
    return commands;
  }

  const term = searchTerm.toLowerCase().trim();

  return commands.filter((command) => {
    const titleMatch = command.title.toLowerCase().includes(term);
    const descriptionMatch = command.description?.toLowerCase().includes(term);
    const categoryMatch = command.category.toLowerCase().includes(term);

    return titleMatch ?? descriptionMatch ?? categoryMatch;
  });
}

/**
 * Hook para gerenciar estado da Command Palette
 *
 * @example
 * ```tsx
 * const {
 *   state,
 *   open,
 *   close,
 *   setSearchTerm,
 *   selectPrevious,
 *   selectNext,
 *   executeSelected,
 * } = useCommandPalette({
 *   initialCommands: [
 *     {
 *       id: 'new-capture',
 *       title: 'Nova Captura',
 *       category: 'capture',
 *       shortcutWindows: 'Ctrl+Shift+C',
 *       shortcutMac: 'Cmd+Shift+C',
 *       action: () => navigate('/capture'),
 *     },
 *   ],
 * });
 * ```
 *
 * @param options - Opções do hook
 * @returns Estado e funções para controlar a palette
 */
export function useCommandPalette(
  options: UseCommandPaletteOptions = {}
): UseCommandPaletteResult {
  const { initialCommands = [], onOpen, onClose, onExecute } = options;
  const { isMac } = useOS();

  // Estado dos comandos registrados
  const [commands, setCommands] = useState<Command[]>(initialCommands);

  // Estado da palette
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTermState] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Comandos filtrados
  const filteredCommands = useMemo(
    () => filterCommands(commands, searchTerm),
    [commands, searchTerm]
  );

  // Reset seleção quando filtro muda
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // Abrir palette
  const open = useCallback(() => {
    setIsOpen(true);
    setSearchTermState('');
    setSelectedIndex(0);
    onOpen?.();
  }, [onOpen]);

  // Fechar palette
  const close = useCallback(() => {
    setIsOpen(false);
    setSearchTermState('');
    setSelectedIndex(0);
    onClose?.();
  }, [onClose]);

  // Toggle
  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  // Atualizar termo de busca
  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);
  }, []);

  // Selecionar anterior
  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev <= 0) {
        return filteredCommands.length - 1;
      }
      return prev - 1;
    });
  }, [filteredCommands.length]);

  // Selecionar próximo
  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev >= filteredCommands.length - 1) {
        return 0;
      }
      return prev + 1;
    });
  }, [filteredCommands.length]);

  // Executar comando
  const executeCommand = useCallback(
    (command: Command) => {
      if (command.disabled) {
        return;
      }

      command.action();
      onExecute?.(command);
      close();
    },
    [close, onExecute]
  );

  // Executar comando selecionado
  const executeSelected = useCallback(() => {
    const command = filteredCommands[selectedIndex];
    if (command) {
      executeCommand(command);
    }
  }, [filteredCommands, selectedIndex, executeCommand]);

  // Registrar comando
  const registerCommand = useCallback((command: Command) => {
    setCommands((prev) => {
      // Evitar duplicatas
      const exists = prev.some((c) => c.id === command.id);
      if (exists) {
        return prev.map((c) => (c.id === command.id ? command : c));
      }
      return [...prev, command];
    });
  }, []);

  // Remover comando
  const unregisterCommand = useCallback((commandId: string) => {
    setCommands((prev) => prev.filter((c) => c.id !== commandId));
  }, []);

  // Listener de teclado global para Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      // Ctrl+K ou Cmd+K para abrir/fechar
      if (modifierKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
        return;
      }

      // Escape para fechar
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        close();
        return;
      }

      // Navegação quando aberto
      if (isOpen) {
        switch (event.key) {
          case 'ArrowUp':
            event.preventDefault();
            selectPrevious();
            break;
          case 'ArrowDown':
            event.preventDefault();
            selectNext();
            break;
          case 'Enter':
            event.preventDefault();
            executeSelected();
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMac, isOpen, toggle, close, selectPrevious, selectNext, executeSelected]);

  // Estado consolidado
  const state: CommandPaletteState = {
    isOpen,
    searchTerm,
    selectedIndex,
    filteredCommands,
  };

  return {
    state,
    open,
    close,
    toggle,
    setSearchTerm,
    selectPrevious,
    selectNext,
    executeSelected,
    executeCommand,
    commands,
    registerCommand,
    unregisterCommand,
  };
}

export default useCommandPalette;
