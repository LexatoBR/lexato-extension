/**
 * Componente Badge do Design System Lexato
 *
 * Badge reutilizável para indicadores de status, contagem e chips.
 * Baseado nos protótipos Google Stitch com paleta Lexato.
 *
 * @see Requirements 10.1-10.4
 */

import React from 'react';

/**
 * Tipos de status disponíveis para o badge
 */
export type BadgeStatus = 'pending' | 'processing' | 'success' | 'error' | 'warning';

/**
 * Props do componente Badge
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Variante visual do badge */
  variant?: 'status' | 'count' | 'chip';
  /** Status para variante 'status' */
  status?: BadgeStatus;
  /** Número para variante 'count' */
  count?: number;
  /** Ícone opcional para exibir antes do texto */
  icon?: React.ReactNode;
  /** Conteúdo do badge (para variantes status e chip) */
  children?: React.ReactNode;
}

/**
 * Configuração de cores por status
 *
 * Cada status tem cores específicas para background, texto e borda
 * seguindo a paleta de cores do Design System Lexato.
 */
const statusColors: Record<BadgeStatus, { bg: string; text: string; border: string }> = {
  pending: {
    bg: 'bg-[rgba(255,202,40,0.15)]',
    text: 'text-status-pending',
    border: 'border-[rgba(255,202,40,0.3)]',
  },
  processing: {
    bg: 'bg-[rgba(66,165,245,0.15)]',
    text: 'text-status-processing',
    border: 'border-[rgba(66,165,245,0.3)]',
  },
  success: {
    bg: 'bg-[rgba(0,222,165,0.15)]',
    text: 'text-status-success',
    border: 'border-[rgba(0,222,165,0.3)]',
  },
  error: {
    bg: 'bg-[rgba(239,83,80,0.15)]',
    text: 'text-status-error',
    border: 'border-[rgba(239,83,80,0.3)]',
  },
  warning: {
    bg: 'bg-[rgba(255,167,38,0.15)]',
    text: 'text-status-warning',
    border: 'border-[rgba(255,167,38,0.3)]',
  },
};

/**
 * Ícones padrão por status (SVG inline)
 */
const StatusIcon: React.FC<{ status: BadgeStatus; className?: string }> = ({
  status,
  className = 'w-3 h-3',
}) => {
  const icons: Record<BadgeStatus, React.ReactNode> = {
    pending: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
      </svg>
    ),
    processing: (
      <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    ),
    success: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
      </svg>
    ),
    error: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
      </svg>
    ),
    warning: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg>
    ),
  };

  return <>{icons[status]}</>;
};

/**
 * Badge de status com ícone e texto
 */
const StatusBadge: React.FC<{
  status: BadgeStatus;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ status, icon, children, className = '' }) => {
  const colors = statusColors[status];

  const classes = [
    'inline-flex items-center gap-1.5',
    'px-2.5 py-1',
    'rounded-sm',
    'text-xs font-medium',
    'uppercase tracking-wider',
    'border',
    colors.bg,
    colors.text,
    colors.border,
    className,
  ].join(' ');

  return (
    <span className={classes} role="status">
      {icon !== undefined ? icon : <StatusIcon status={status} />}
      {children}
    </span>
  );
};

/**
 * Badge de contagem para notificações
 */
const CountBadge: React.FC<{
  count: number;
  className?: string;
}> = ({ count, className = '' }) => {
  // Limita a exibição a 99+
  const displayCount = count > 99 ? '99+' : count.toString();

  const classes = [
    'inline-flex items-center justify-center',
    'min-w-[18px] h-[18px]',
    'px-1',
    'rounded-full',
    'bg-status-error',
    'text-white',
    'text-[10px] font-semibold',
    className,
  ].join(' ');

  return (
    <span className={classes} aria-label={`${count} notificações`}>
      {displayCount}
    </span>
  );
};

/**
 * Badge chip para tags e categorias
 */
const ChipBadge: React.FC<{
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ icon, children, className = '' }) => {
  const classes = [
    'inline-flex items-center gap-1',
    'px-2 py-1',
    'rounded-sm',
    'bg-[rgba(0,222,165,0.1)]',
    'border border-[rgba(0,222,165,0.2)]',
    'text-primary',
    'text-xs font-medium',
    className,
  ].join(' ');

  return (
    <span className={classes}>
      {icon}
      {children}
    </span>
  );
};

/**
 * Componente Badge do Design System Lexato
 *
 * Características:
 * - Variante status: Indicadores de estado com ícone + texto
 * - Variante count: Badge numérico para notificações
 * - Variante chip: Tags e categorias
 * - Cores e ícones apropriados por tipo de status
 *
 * @example
 * ```tsx
 * // Badge de status
 * <Badge variant="status" status="success">
 *   Concluído
 * </Badge>
 *
 * // Badge de contagem
 * <Badge variant="count" count={5} />
 *
 * // Badge chip
 * <Badge variant="chip">
 *   Tag
 * </Badge>
 *
 * // Badge de status com ícone customizado
 * <Badge variant="status" status="pending" icon={<CustomIcon />}>
 *   Aguardando
 * </Badge>
 * ```
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'status',
      status = 'pending',
      count = 0,
      icon,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    // Renderiza o badge apropriado baseado na variante
    if (variant === 'count') {
      return (
        <span ref={ref} {...props}>
          <CountBadge count={count} className={className} />
        </span>
      );
    }

    if (variant === 'chip') {
      return (
        <span ref={ref} {...props}>
          <ChipBadge icon={icon} className={className}>
            {children}
          </ChipBadge>
        </span>
      );
    }

    // Variante status (padrão)
    return (
      <span ref={ref} {...props}>
        <StatusBadge status={status} icon={icon} className={className}>
          {children}
        </StatusBadge>
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;
