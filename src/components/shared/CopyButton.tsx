/**
 * Componente CopyButton do Design System Lexato
 *
 * Botão de cópia com feedback visual animado.
 * Exibe tooltip "Copiado!" e muda ícone para checkmark durante feedback.
 *
 * @see Requirements 19.1-19.6
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Props do componente CopyButton
 */
export interface CopyButtonProps {
  /** Texto a ser copiado para a área de transferência */
  textToCopy: string;
  /** Duração do feedback em ms (padrão: 2000ms) */
  feedbackDuration?: number;
  /** Tamanho do botão */
  size?: 'sm' | 'md' | 'lg';
  /** Label para acessibilidade */
  ariaLabel?: string;
  /** Classe CSS adicional */
  className?: string;
  /** Callback após cópia bem-sucedida */
  onCopy?: () => void;
  /** Callback em caso de erro */
  onError?: (error: Error) => void;
  /** Variante visual */
  variant?: 'default' | 'ghost' | 'glass';
}

/**
 * Classes Tailwind por tamanho
 */
const sizeClasses: Record<NonNullable<CopyButtonProps['size']>, string> = {
  sm: 'w-7 h-7 p-1.5',
  md: 'w-9 h-9 p-2',
  lg: 'w-11 h-11 p-2.5',
};

/**
 * Classes Tailwind por variante
 */
const variantClasses: Record<NonNullable<CopyButtonProps['variant']>, string> = {
  default: [
    'bg-glass-backgroundLight',
    'border border-glass-border',
    'hover:bg-[rgba(255,255,255,0.08)] hover:border-glass-borderHover',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'hover:bg-[rgba(255,255,255,0.05)]',
  ].join(' '),
  glass: [
    'bg-glass-background backdrop-blur-sm',
    'border border-glass-border',
    'hover:bg-glass-backgroundHover hover:border-glass-borderHover',
  ].join(' '),
};

/**
 * Ícone de cópia (clipboard)
 */
const CopyIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/**
 * Ícone de checkmark (sucesso)
 */
const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Botão de cópia com feedback visual animado
 *
 * Características:
 * - Tooltip animado "Copiado!" ao copiar
 * - Ícone muda para checkmark durante feedback
 * - Auto-dismiss após 2 segundos (configurável)
 * - Background verde durante feedback
 *
 * @example
 * ```tsx
 * <CopyButton
 *   textToCopy="0x1234...abcd"
 *   onCopy={() => console.log('Hash copiado!')}
 * />
 * ```
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
  textToCopy,
  feedbackDuration = 2000,
  size = 'md',
  ariaLabel = 'Copiar',
  className = '',
  onCopy,
  onError,
  variant = 'default',
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Limpa timeout ao desmontar
   */
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  /**
   * Copia texto para área de transferência e exibe feedback
   */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);

      setIsCopied(true);
      setShowTooltip(true);

      if (onCopy) {
        onCopy();
      }

      // Limpa timeout anterior se existir
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Auto-dismiss após duração configurada
      timeoutRef.current = setTimeout(() => {
        setIsCopied(false);
        setShowTooltip(false);
      }, feedbackDuration);
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error('Falha ao copiar'));
      }
    }
  }, [textToCopy, feedbackDuration, onCopy, onError]);

  const baseClasses = [
    'relative inline-flex items-center justify-center',
    'rounded-md',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary',
    'active:scale-95',
  ].join(' ');

  const stateClasses = isCopied
    ? 'bg-[rgba(0,222,165,0.9)] border-transparent text-background-primary hover:bg-[rgba(0,222,165,0.95)]'
    : `text-text-secondary hover:text-text-primary ${variantClasses[variant]}`;

  const buttonClasses = [
    baseClasses,
    sizeClasses[size],
    stateClasses,
    className,
  ].join(' ');

  const tooltipClasses = [
    'absolute -top-10 left-1/2 -translate-x-1/2',
    'px-2.5 py-1.5',
    'bg-[rgba(0,222,165,0.9)]',
    'text-background-primary text-xs font-medium',
    'rounded-md',
    'whitespace-nowrap',
    'shadow-lg',
    'transition-all duration-200',
    showTooltip
      ? 'opacity-100 scale-100 translate-y-0'
      : 'opacity-0 scale-95 translate-y-1 pointer-events-none',
  ].join(' ');

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={buttonClasses}
      aria-label={isCopied ? 'Copiado!' : ariaLabel}
      data-testid="copy-button"
    >
      {/* Tooltip animado */}
      <span
        className={tooltipClasses}
        role="status"
        aria-live="polite"
        data-testid="copy-tooltip"
      >
        Copiado!
      </span>

      {/* Seta do tooltip */}
      <span
        className={[
          'absolute -top-2 left-1/2 -translate-x-1/2',
          'w-0 h-0',
          'border-l-[6px] border-l-transparent',
          'border-r-[6px] border-r-transparent',
          'border-t-[6px] border-t-[rgba(0,222,165,0.9)]',
          'transition-all duration-200',
          showTooltip ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        aria-hidden="true"
      />

      {/* Ícone com transição */}
      <span className="relative">
        <span
          className={[
            'transition-all duration-200',
            isCopied ? 'opacity-0 scale-75' : 'opacity-100 scale-100',
          ].join(' ')}
        >
          <CopyIcon />
        </span>
        <span
          className={[
            'absolute inset-0 flex items-center justify-center',
            'transition-all duration-200',
            isCopied ? 'opacity-100 scale-100' : 'opacity-0 scale-75',
          ].join(' ')}
        >
          <CheckIcon />
        </span>
      </span>
    </button>
  );
};

CopyButton.displayName = 'CopyButton';

export default CopyButton;
