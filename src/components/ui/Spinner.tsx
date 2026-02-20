/**
 * Componente Spinner do Design System Lexato
 *
 * Indicador de carregamento circular com animação.
 * Baseado nos protótipos Google Stitch com paleta Lexato.
 *
 * @see Requirements 11.5
 */

import React from 'react';

/**
 * Props do componente Spinner
 */
export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tamanho do spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Cor do spinner (usa cor primária por padrão) */
  color?: 'primary' | 'white' | 'current';
  /** Label para acessibilidade */
  label?: string;
}

/**
 * Classes Tailwind por tamanho
 *
 * - sm: 16px (w-4 h-4)
 * - md: 24px (w-6 h-6)
 * - lg: 32px (w-8 h-8)
 */
const sizeClasses: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

/**
 * Classes de cor para o spinner
 */
const colorClasses: Record<NonNullable<SpinnerProps['color']>, string> = {
  primary: 'text-primary',
  white: 'text-white',
  current: 'text-current',
};

/**
 * Componente Spinner do Design System Lexato
 *
 * Características:
 * - Animação de rotação suave (spin)
 * - Três tamanhos: sm (16px), md (24px), lg (32px)
 * - Cores: primary (verde Lexato), white, current
 * - Acessível com role="status" e aria-label
 *
 * @example
 * ```tsx
 * // Spinner padrão (md, primary)
 * <Spinner />
 *
 * // Spinner pequeno
 * <Spinner size="sm" />
 *
 * // Spinner grande branco
 * <Spinner size="lg" color="white" />
 *
 * // Spinner com label customizado
 * <Spinner label="Processando captura..." />
 * ```
 */
export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  (
    {
      size = 'md',
      color = 'primary',
      label = 'Carregando...',
      className = '',
      ...props
    },
    ref
  ) => {
    const wrapperClasses = [
      'inline-flex items-center justify-center',
      className,
    ].join(' ');

    const svgClasses = [
      'animate-spin',
      sizeClasses[size],
      colorClasses[color],
    ].join(' ');

    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={wrapperClasses}
        {...props}
      >
        <svg
          className={svgClasses}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {/* Círculo de fundo com opacidade reduzida */}
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          {/* Arco animado */}
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        {/* Texto visualmente oculto para leitores de tela */}
        <span className="sr-only">{label}</span>
      </div>
    );
  }
);

Spinner.displayName = 'Spinner';

export default Spinner;
