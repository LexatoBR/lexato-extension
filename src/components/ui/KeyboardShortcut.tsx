/**
 * Componente KeyboardShortcut - Exibe atalhos de teclado
 *
 * Detecta automaticamente o sistema operacional e exibe
 * o atalho apropriado (Ctrl para Windows/Linux, Cmd para Mac).
 *
 * @see Requirements 25.1-25.5
 */

import React, { useMemo } from 'react';
import { useOS } from '../../lib/hooks/useOS';

/** Props do componente KeyboardShortcut */
export interface KeyboardShortcutProps {
  /** Atalho para Windows/Linux (ex: "Ctrl+K") */
  windows: string;
  /** Atalho para Mac (ex: "⌘K" ou "Cmd+K") */
  mac: string;
  /** Classes CSS adicionais */
  className?: string;
  /** Tamanho do atalho */
  size?: 'sm' | 'md' | 'lg';
  /** Mostrar apenas o atalho sem estilo kbd */
  plain?: boolean;
}

/** Mapeamento de teclas especiais para símbolos */
const KEY_SYMBOLS: Record<string, string> = {
  Cmd: '⌘',
  Command: '⌘',
  Ctrl: 'Ctrl',
  Control: 'Ctrl',
  Alt: 'Alt',
  Option: '⌥',
  Shift: '⇧',
  Enter: '↵',
  Return: '↵',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: 'Esc',
  Esc: 'Esc',
  Tab: '⇥',
  Space: '␣',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Estilos por tamanho */
const SIZE_STYLES = {
  sm: 'min-w-[18px] h-[18px] px-1 text-[10px]',
  md: 'min-w-[24px] h-[24px] px-2 text-[11px]',
  lg: 'min-w-[28px] h-[28px] px-2 text-xs',
};

/**
 * Formata uma tecla para exibição
 *
 * @param key - Tecla a ser formatada
 * @returns Tecla formatada com símbolo se disponível
 */
function formatKey(key: string): string {
  const trimmed = key.trim();
  return KEY_SYMBOLS[trimmed] ?? trimmed;
}

/**
 * Componente para exibir atalhos de teclado
 *
 * Detecta automaticamente o SO e mostra o atalho apropriado.
 * Usa estilo kbd com background glass para visual consistente.
 *
 * @example
 * ```tsx
 * // Atalho simples
 * <KeyboardShortcut windows="Ctrl+K" mac="⌘K" />
 *
 * // Com tamanho pequeno
 * <KeyboardShortcut windows="Ctrl+S" mac="⌘S" size="sm" />
 *
 * // Texto plano sem estilo kbd
 * <KeyboardShortcut windows="Ctrl+K" mac="⌘K" plain />
 * ```
 */
export const KeyboardShortcut: React.FC<KeyboardShortcutProps> = ({
  windows,
  mac,
  className = '',
  size = 'md',
  plain = false,
}) => {
  const { isMac } = useOS();

  // Seleciona o atalho baseado no SO
  const shortcut = isMac ? mac : windows;

  // Divide o atalho em teclas individuais
  const keys = useMemo(() => {
    // Suporta separadores: +, espaço, ou nenhum para símbolos
    return shortcut
      .split(/[+\s]/)
      .filter(Boolean)
      .map(formatKey);
  }, [shortcut]);

  // Modo texto plano
  if (plain) {
    return (
      <span className={`text-white/60 ${className}`}>
        {keys.join('+')}
      </span>
    );
  }

  const sizeClass = SIZE_STYLES[size];

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`Atalho de teclado: ${keys.join(' + ')}`}
    >
      {keys.map((key, index) => (
        <React.Fragment key={`${key}-${index}`}>
          <kbd
            className={`
              kbd-key
              inline-flex items-center justify-content
              font-semibold text-white/90
              bg-white/5 border border-white/10 rounded
              backdrop-blur-sm
              shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]
              ${sizeClass}
            `}
          >
            {key}
          </kbd>
          {index < keys.length - 1 && (
            <span className="text-white/30 text-[10px] mx-0.5">+</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
};

export default KeyboardShortcut;
