/**
 * Componente Command Palette do Design System Lexato
 *
 * Paleta de comandos acessível via Ctrl+K (Windows) ou Cmd+K (Mac).
 * Permite busca e execução rápida de ações.
 *
 * @see Requirements 24.1-24.7
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useOS } from '@/lib/hooks/useOS';
import { commandPaletteLabels } from '@/lib/i18n/labels';
import type { Command, CommandCategory } from '@/lib/hooks/useCommandPalette';

/** Props do componente CommandPalette */
export interface CommandPaletteProps {
  /** Se a palette está aberta */
  isOpen: boolean;
  /** Termo de busca atual */
  searchTerm: string;
  /** Índice do comando selecionado */
  selectedIndex: number;
  /** Comandos filtrados */
  filteredCommands: Command[];
  /** Callback para fechar a palette */
  onClose: () => void;
  /** Callback para atualizar o termo de busca */
  onSearchChange: (term: string) => void;
  /** Callback para executar um comando */
  onExecute: (command: Command) => void;
  /** Callback para selecionar próximo */
  onSelectNext: () => void;
  /** Callback para selecionar anterior */
  onSelectPrevious: () => void;
  /** Callback para executar selecionado */
  onExecuteSelected: () => void;
}

/** Labels de categoria em português */
const categoryLabels: Record<CommandCategory, string> = {
  capture: commandPaletteLabels.categories.capture,
  navigation: commandPaletteLabels.categories.navigation,
  settings: commandPaletteLabels.categories.settings,
  help: commandPaletteLabels.categories.help,
};

/** Indicadores de categoria */
const categoryIcons: Record<CommandCategory, string> = {
  capture: '\u25CB',
  navigation: '\u2192',
  settings: '\u2699',
  help: '?',
};

/**
 * Componente de item de comando
 */
const CommandItem: React.FC<{
  command: Command;
  isSelected: boolean;
  onClick: () => void;
  isMac: boolean;
}> = ({ command, isSelected, onClick, isMac }) => {
  const shortcut = isMac ? command.shortcutMac : command.shortcutWindows;
  const itemRef = useRef<HTMLButtonElement>(null);

  // Scroll into view quando selecionado
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isSelected]);

  return (
    <button
      ref={itemRef}
      type="button"
      onClick={onClick}
      disabled={command.disabled}
      className={`
        w-full flex items-center gap-3 px-4 py-3
        text-left transition-all duration-fast
        ${isSelected
          ? 'bg-primary/15 text-text-primary'
          : 'text-text-secondary hover:bg-glass-bgLight'
        }
        ${command.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset
      `}
      role="option"
      aria-selected={isSelected}
      aria-disabled={command.disabled}
    >
      {/* Ícone do comando */}
      <span className="shrink-0 w-6 h-6 flex items-center justify-center text-lg">
        {command.icon ?? categoryIcons[command.category]}
      </span>

      {/* Título e descrição */}
      <div className="flex-1 min-w-0">
        <div className="text-md font-medium truncate">{command.title}</div>
        {command.description && (
          <div className="text-xs text-text-tertiary truncate">
            {command.description}
          </div>
        )}
      </div>

      {/* Atalho de teclado */}
      {shortcut && (
        <div className="shrink-0 flex items-center gap-1">
          {shortcut.split('+').map((key, index) => (
            <React.Fragment key={index}>
              <kbd className="kbd-key text-xs">{key}</kbd>
              {index < shortcut.split('+').length - 1 && (
                <span className="text-text-muted text-xs">+</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </button>
  );
};

/**
 * Agrupa comandos por categoria
 */
function groupByCategory(commands: Command[]): Map<CommandCategory, Command[]> {
  const groups = new Map<CommandCategory, Command[]>();

  for (const command of commands) {
    const existing = groups.get(command.category) ?? [];
    groups.set(command.category, [...existing, command]);
  }

  return groups;
}

/**
 * Command Palette do Design System Lexato
 *
 * @example
 * ```tsx
 * const { state, close, setSearchTerm, executeCommand } = useCommandPalette({
 *   initialCommands: [...],
 * });
 *
 * <CommandPalette
 *   isOpen={state.isOpen}
 *   searchTerm={state.searchTerm}
 *   selectedIndex={state.selectedIndex}
 *   filteredCommands={state.filteredCommands}
 *   onClose={close}
 *   onSearchChange={setSearchTerm}
 *   onExecute={executeCommand}
 *   onSelectNext={selectNext}
 *   onSelectPrevious={selectPrevious}
 *   onExecuteSelected={executeSelected}
 * />
 * ```
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  searchTerm,
  selectedIndex,
  filteredCommands,
  onClose,
  onSearchChange,
  onExecute,
  onSelectNext,
  onSelectPrevious,
  onExecuteSelected,
}) => {
  const { isMac, modKeySymbol } = useOS();
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Foco automático no input quando abre
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Pequeno delay para garantir que o elemento está visível
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen]);

  // Handler para click no backdrop
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  // Handler para teclas no input
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          onSelectPrevious();
          break;
        case 'ArrowDown':
          event.preventDefault();
          onSelectNext();
          break;
        case 'Enter':
          event.preventDefault();
          onExecuteSelected();
          break;
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
      }
    },
    [onSelectPrevious, onSelectNext, onExecuteSelected, onClose]
  );

  // Não renderizar se fechado
  if (!isOpen) {
    return null;
  }

  // Agrupar comandos por categoria
  const groupedCommands = groupByCategory(filteredCommands);

  // Calcular índice global para seleção
  let globalIndex = 0;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="
        fixed inset-0 z-50
        flex items-start justify-center pt-24
        bg-black/60 backdrop-blur-sm
        animate-fade-in-scale
      "
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
    >
      <div
        className="
          w-full max-w-lg mx-4
          bg-background-elevated/95 backdrop-blur-xl
          border border-glass-border
          rounded-xl shadow-lg
          overflow-hidden
          animate-slide-up
        "
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
      >
        {/* Input de busca */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-glass-border">
          <svg
            className="w-5 h-5 text-text-tertiary shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={commandPaletteLabels.placeholder}
            className="
              flex-1 bg-transparent border-none outline-none
              text-md text-text-primary
              placeholder:text-text-placeholder
            "
            aria-label="Buscar comandos"
            aria-autocomplete="list"
            aria-controls="command-list"
          />
          <kbd className="kbd-key text-xs">{modKeySymbol}K</kbd>
        </div>

        {/* Lista de comandos */}
        <div
          id="command-list"
          className="max-h-80 overflow-y-auto"
          role="listbox"
          aria-label="Comandos disponíveis"
        >
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-tertiary">
              {commandPaletteLabels.noResults}
            </div>
          ) : (
            Array.from(groupedCommands.entries()).map(([category, commands]) => (
              <div key={category}>
                {/* Header da categoria */}
                <div className="px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider bg-background-tertiary/50">
                  {categoryLabels[category]}
                </div>

                {/* Comandos da categoria */}
                {commands.map((command) => {
                  const isSelected = globalIndex === selectedIndex;
                  globalIndex++;

                  return (
                    <CommandItem
                      key={command.id}
                      command={command}
                      isSelected={isSelected}
                      onClick={() => onExecute(command)}
                      isMac={isMac}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer com dicas */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-glass-border bg-background-tertiary/30">
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <kbd className="kbd-key text-[10px]">↑</kbd>
              <kbd className="kbd-key text-[10px]">↓</kbd>
              <span>navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd-key text-[10px]">Enter</kbd>
              <span>executar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd-key text-[10px]">Esc</kbd>
              <span>fechar</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
