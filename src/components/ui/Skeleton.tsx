/**
 * Componente Skeleton do Design System Lexato
 *
 * Placeholders animados para estados de carregamento.
 * Dimensões EXATAS dos componentes reais para evitar layout shift.
 *
 * @see Requirements 14.1-14.8
 */

import React from 'react';

/**
 * Props base do Skeleton
 */
interface SkeletonBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Classes CSS adicionais */
  className?: string;
  /** Largura customizada */
  width?: string | number;
  /** Altura customizada */
  height?: string | number;
}

/**
 * Classes base do skeleton com animação pulse
 */
const baseClasses = [
  'bg-[rgba(255,255,255,0.05)]',
  'animate-pulse',
  'rounded-md',
].join(' ');

/**
 * Skeleton base - elemento genérico com animação pulse
 *
 * @example
 * ```tsx
 * <Skeleton width={100} height={20} />
 * <Skeleton className="w-full h-4" />
 * ```
 */
export const Skeleton: React.FC<SkeletonBaseProps> = ({
  className = '',
  width,
  height,
  ...props
}) => {
  const style: React.CSSProperties = {};
  if (width) {
    style.width = typeof width === 'number' ? `${width}px` : width;
  }
  if (height) {
    style.height = typeof height === 'number' ? `${height}px` : height;
  }

  return (
    <div
      className={`${baseClasses} ${className}`}
      style={style}
      aria-hidden="true"
      role="presentation"
      {...props}
    />
  );
};

// ============================================
// SKELETON TEXT - Variantes de texto
// ============================================

type TextVariant = 'title' | 'body' | 'caption';

interface SkeletonTextProps extends Omit<SkeletonBaseProps, 'height'> {
  /** Variante de texto */
  variant?: TextVariant;
  /** Número de linhas */
  lines?: number;
}

/**
 * Alturas por variante de texto (correspondem à tipografia real)
 * - title: 20px (h-5) - H1/H2
 * - body: 16px (h-4) - Body text
 * - caption: 12px (h-3) - Caption/labels
 */
const textHeights: Record<TextVariant, string> = {
  title: 'h-5',
  body: 'h-4',
  caption: 'h-3',
};

/**
 * Skeleton para texto com variantes
 *
 * @example
 * ```tsx
 * <SkeletonText variant="title" />
 * <SkeletonText variant="body" lines={3} />
 * <SkeletonText variant="caption" width="60%" />
 * ```
 */
export const SkeletonText: React.FC<SkeletonTextProps> = ({
  variant = 'body',
  lines = 1,
  className = '',
  width,
  ...props
}) => {
  const heightClass = textHeights[variant];
  const widthStyle = width
    ? typeof width === 'number'
      ? `${width}px`
      : width
    : undefined;

  if (lines === 1) {
    return (
      <div
        className={`${baseClasses} ${heightClass} ${className}`}
        style={{ width: widthStyle }}
        aria-hidden="true"
        role="presentation"
        {...props}
      />
    );
  }

  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true" role="presentation" {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`${baseClasses} ${heightClass}`}
          style={{
            width: i === lines - 1 ? '75%' : widthStyle ?? '100%',
          }}
        />
      ))}
    </div>
  );
};

// ============================================
// SKELETON AVATAR - Avatares circulares
// ============================================

type AvatarSize = 'sm' | 'md' | 'lg';

interface SkeletonAvatarProps extends Omit<SkeletonBaseProps, 'width' | 'height'> {
  /** Tamanho do avatar */
  size?: AvatarSize;
}

/**
 * Tamanhos de avatar (correspondem aos avatares reais)
 * - sm: 32px
 * - md: 40px
 * - lg: 48px
 */
const avatarSizes: Record<AvatarSize, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

/**
 * Skeleton para avatares circulares
 *
 * @example
 * ```tsx
 * <SkeletonAvatar size="sm" />
 * <SkeletonAvatar size="md" />
 * <SkeletonAvatar size="lg" />
 * ```
 */
export const SkeletonAvatar: React.FC<SkeletonAvatarProps> = ({
  size = 'md',
  className = '',
  ...props
}) => {
  return (
    <div
      className={`${baseClasses} rounded-full ${avatarSizes[size]} ${className}`}
      aria-hidden="true"
      role="presentation"
      {...props}
    />
  );
};

// ============================================
// SKELETON BUTTON - Botões
// ============================================

type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface SkeletonButtonProps extends Omit<SkeletonBaseProps, 'height'> {
  /** Tamanho do botão */
  size?: ButtonSize;
}

/**
 * Tamanhos de botão (correspondem ao Button real)
 * - sm: 32px altura
 * - md: 40px altura
 * - lg: 48px altura
 * - xl: 56px altura
 */
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 w-20',
  md: 'h-10 w-24',
  lg: 'h-12 w-28',
  xl: 'h-14 w-32',
};

/**
 * Skeleton para botões
 *
 * @example
 * ```tsx
 * <SkeletonButton size="md" />
 * <SkeletonButton size="lg" width={200} />
 * ```
 */
export const SkeletonButton: React.FC<SkeletonButtonProps> = ({
  size = 'md',
  className = '',
  width,
  ...props
}) => {
  const sizeClass = buttonSizes[size];
  const widthStyle = width
    ? typeof width === 'number'
      ? `${width}px`
      : width
    : undefined;

  return (
    <div
      className={`${baseClasses} ${sizeClass} ${className}`}
      style={widthStyle ? { width: widthStyle } : undefined}
      aria-hidden="true"
      role="presentation"
      {...props}
    />
  );
};

// ============================================
// SKELETON CARD - Cards
// ============================================

interface SkeletonCardProps extends Omit<SkeletonBaseProps, 'width'> {
  /** Mostrar indicador lateral (como variantes de status) */
  showIndicator?: boolean;
}

/**
 * Skeleton para cards (corresponde ao Card real)
 * - Padding: 16px (p-4)
 * - Border-radius: 12px (rounded-lg)
 * - Altura padrão: auto (baseado no conteúdo)
 *
 * @example
 * ```tsx
 * <SkeletonCard />
 * <SkeletonCard showIndicator />
 * <SkeletonCard height={120} />
 * ```
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  className = '',
  showIndicator = false,
  height,
  ...props
}) => {
  const heightStyle = height
    ? typeof height === 'number'
      ? `${height}px`
      : height
    : undefined;

  return (
    <div
      className={`
        ${baseClasses}
        rounded-lg
        p-4
        ${showIndicator ? 'border-l-[3px] border-l-[rgba(255,255,255,0.1)]' : ''}
        ${className}
      `}
      style={heightStyle ? { height: heightStyle } : undefined}
      aria-hidden="true"
      role="presentation"
      {...props}
    >
      <div className="space-y-3">
        <SkeletonText variant="title" width="60%" />
        <SkeletonText variant="body" lines={2} />
        <div className="flex gap-2 pt-2">
          <SkeletonButton size="sm" />
          <SkeletonButton size="sm" />
        </div>
      </div>
    </div>
  );
};

// ============================================
// SKELETON EVIDENCE CARD - Card de evidência
// ============================================

/**
 * Skeleton específico para cards de evidência
 * Altura: 88px (igual ao EvidenceCard real)
 *
 * @example
 * ```tsx
 * <SkeletonEvidenceCard />
 * ```
 */
export const SkeletonEvidenceCard: React.FC<Omit<SkeletonBaseProps, 'width' | 'height'>> = ({
  className = '',
  ...props
}) => {
  return (
    <div
      className={`
        ${baseClasses}
        rounded-lg
        p-4
        h-[88px]
        border-l-[3px] border-l-[rgba(255,255,255,0.1)]
        ${className}
      `}
      aria-hidden="true"
      role="presentation"
      {...props}
    >
      <div className="flex items-center gap-3 h-full">
        {/* Thumbnail */}
        <Skeleton className="w-14 h-14 rounded-md shrink-0" />

        {/* Conteúdo */}
        <div className="flex-1 space-y-2">
          <SkeletonText variant="body" width="70%" />
          <SkeletonText variant="caption" width="40%" />
        </div>

        {/* Badge de status */}
        <Skeleton className="w-16 h-5 rounded-sm shrink-0" />
      </div>
    </div>
  );
};

// ============================================
// SKELETON LIST - Lista de itens
// ============================================

interface SkeletonListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Número de itens */
  count?: number;
  /** Tipo de item */
  itemType?: 'card' | 'evidence' | 'text';
}

/**
 * Skeleton para listas de itens
 *
 * @example
 * ```tsx
 * <SkeletonList count={3} itemType="evidence" />
 * <SkeletonList count={5} itemType="text" />
 * ```
 */
export const SkeletonList: React.FC<SkeletonListProps> = ({
  count = 3,
  itemType = 'card',
  className = '',
  ...props
}) => {
  const renderItem = (index: number) => {
    switch (itemType) {
      case 'evidence':
        return <SkeletonEvidenceCard key={index} />;
      case 'text':
        return <SkeletonText key={index} variant="body" />;
      case 'card':
      default:
        return <SkeletonCard key={index} />;
    }
  };

  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true" role="presentation" {...props}>
      {Array.from({ length: count }).map((_, i) => renderItem(i))}
    </div>
  );
};

export default Skeleton;
