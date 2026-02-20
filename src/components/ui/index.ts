/**
 * Componentes UI do Design System Lexato
 *
 * Exporta todos os componentes reutilizáveis da extensão.
 * Inclui Button, Input, Card, Badge, Spinner, Skeleton e KeyboardShortcut.
 *
 * @see Requirements 4-6, 10, 11, 14, 25
 */

export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Card } from './Card';
export type { CardProps } from './Card';

export { Badge } from './Badge';
export type { BadgeProps, BadgeStatus } from './Badge';

export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  SkeletonEvidenceCard,
  SkeletonList,
} from './Skeleton';

export { KeyboardShortcut } from './KeyboardShortcut';
export type { KeyboardShortcutProps } from './KeyboardShortcut';

export { TimestampBadge } from './TimestampBadge';
export type { TimestampBadgeProps } from './TimestampBadge';
