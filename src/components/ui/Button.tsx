/**
 * Componente Button do Design System Lexato
 *
 * Botão reutilizável com variantes, tamanhos e estados.
 * Baseado nos protótipos Google Stitch com paleta Lexato.
 *
 * @see Requirements 4.1-4.7
 */

import React from 'react';

/**
 * Props do componente Button
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Variante visual do botão */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Tamanho do botão */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Estado de carregamento */
  loading?: boolean;
  /** Conteúdo do botão */
  children: React.ReactNode;
}

/**
 * Classes Tailwind por variante
 *
 * - primary: Gradiente verde Lexato (#00DEA5 → #009978)
 * - secondary: Efeito glass com borda sutil
 * - ghost: Transparente com hover sutil
 */
const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: [
    'bg-gradient-to-br from-primary to-primary-dark',
    'text-background-primary font-semibold',
    'hover:shadow-button-primary-hover hover:-translate-y-0.5',
    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary',
  ].join(' '),
  secondary: [
    'bg-glass-bgLight backdrop-blur-sm',
    'border border-glass-border',
    'text-text-primary',
    'hover:bg-[rgba(255,255,255,0.08)] hover:border-glass-borderActive',
    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'text-text-secondary',
    'hover:bg-[rgba(255,255,255,0.05)] hover:text-text-primary',
    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary',
  ].join(' '),
};

/**
 * Classes Tailwind por tamanho
 *
 * - sm: 32px altura
 * - md: 40px altura
 * - lg: 48px altura
 * - xl: 56px altura
 */
const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-sm rounded-md',
  md: 'h-10 px-4 text-md rounded-md',
  lg: 'h-12 px-5 text-md rounded-lg',
  xl: 'h-14 px-6 text-lg rounded-lg',
};

/**
 * Componente Spinner para estado de loading
 */
const Spinner: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    className={`animate-spin ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

/**
 * Botão reutilizável do Design System Lexato
 *
 * @example
 * ```tsx
 * // Botão primário
 * <Button variant="primary" size="lg">
 *   Iniciar Captura
 * </Button>
 *
 * // Botão secundário com loading
 * <Button variant="secondary" loading>
 *   Processando...
 * </Button>
 *
 * // Botão ghost desabilitado
 * <Button variant="ghost" disabled>
 *   Cancelar
 * </Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const baseClasses = [
      'inline-flex items-center justify-center gap-2',
      'font-medium',
      'transition-all duration-base ease-out',
      'active:scale-95',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
      'outline-none',
    ].join(' ');

    const classes = [
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      className,
    ].join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled}
        {...props}
      >
        {loading && (
          <Spinner className="w-4 h-4" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
