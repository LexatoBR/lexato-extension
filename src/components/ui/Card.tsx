/**
 * Componente Card do Design System Lexato
 *
 * Card reutilizável com efeito glassmorphism, variantes de status
 * e estados interativos (hover, selected).
 *
 * @see Requirements 6.1-6.5
 */

import React from 'react';

/**
 * Props do componente Card
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Variante visual do card */
  variant?: 'default' | 'highlight' | 'pending' | 'success' | 'error';
  /** Estado de seleção */
  selected?: boolean;
  /** Conteúdo do card */
  children: React.ReactNode;
}

/**
 * Classes Tailwind por variante
 *
 * - default: Glass básico com borda sutil
 * - highlight: Destaque verde com indicador lateral
 * - pending: Amarelo para itens pendentes
 * - success: Verde para itens concluídos
 * - error: Vermelho para itens com erro
 */
const variantClasses: Record<NonNullable<CardProps['variant']>, string> = {
  default: [
    'bg-glass-bgLight',
    'border border-glass-border',
  ].join(' '),
  highlight: [
    'bg-[rgba(0,222,165,0.05)]',
    'border border-[rgba(0,222,165,0.2)]',
    'border-l-[3px] border-l-primary',
  ].join(' '),
  pending: [
    'bg-[rgba(255,202,40,0.05)]',
    'border border-[rgba(255,202,40,0.2)]',
    'border-l-[3px] border-l-status-pending',
  ].join(' '),
  success: [
    'bg-[rgba(0,222,165,0.05)]',
    'border border-[rgba(0,222,165,0.2)]',
    'border-l-[3px] border-l-status-success',
  ].join(' '),
  error: [
    'bg-[rgba(239,83,80,0.05)]',
    'border border-[rgba(239,83,80,0.2)]',
    'border-l-[3px] border-l-status-error',
  ].join(' '),
};

/**
 * Card com efeito glassmorphism do Design System Lexato
 *
 * Características:
 * - Efeito glassmorphism com backdrop-filter blur
 * - Variantes: default, highlight, pending, success, error
 * - Estados: hover (scale 1.02, borda verde), selected (borda verde, glow)
 * - Indicador lateral colorido (border-left) nas variantes de status
 *
 * @example
 * ```tsx
 * // Card básico
 * <Card>
 *   <p>Conteúdo do card</p>
 * </Card>
 *
 * // Card com destaque
 * <Card variant="highlight">
 *   <p>Card em destaque</p>
 * </Card>
 *
 * // Card selecionado
 * <Card selected onClick={() => setSelected(true)}>
 *   <p>Card selecionado</p>
 * </Card>
 *
 * // Card de erro
 * <Card variant="error">
 *   <p>Erro na operação</p>
 * </Card>
 * ```
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      selected = false,
      children,
      className = '',
      onClick,
      ...props
    },
    ref
  ) => {
    const isInteractive = Boolean(onClick);

    // Classes base do card
    const baseClasses = [
      // Glassmorphism
      'backdrop-blur-sm',
      'rounded-lg',
      'p-4',
      // Transições
      'transition-all duration-slow ease-out',
      // Focus visible para acessibilidade
      'outline-none',
      'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary',
    ].join(' ');

    // Classes de hover (apenas se interativo)
    const hoverClasses = isInteractive
      ? [
          'cursor-pointer',
          'hover:scale-[1.02]',
          'hover:border-glass-borderActive',
          'hover:shadow-card-hover',
        ].join(' ')
      : '';

    // Classes de seleção
    const selectedClasses = selected
      ? [
          'border-glass-borderActive',
          'shadow-card-selected',
        ].join(' ')
      : '';

    const classes = [
      baseClasses,
      variantClasses[variant],
      hoverClasses,
      selectedClasses,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={ref}
        className={classes}
        onClick={onClick}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-pressed={isInteractive ? selected : undefined}
        onKeyDown={
          isInteractive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
                }
              }
            : undefined
        }
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
