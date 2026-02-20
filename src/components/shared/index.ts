/**
 * Componentes compartilhados do Design System Lexato
 *
 * Exporta componentes reutilizáveis que podem ser usados
 * em diferentes partes da extensão.
 *
 * @module components/shared
 */

export { ActivityLog, formatRelativeTime } from './ActivityLog';
export type { ActivityLogProps, ActivityItem, ActivityType } from './ActivityLog';

export { BlockchainSyncIndicator } from './BlockchainSyncIndicator';
export type { BlockchainSyncIndicatorProps, BlockchainSyncStatus } from './BlockchainSyncIndicator';

export { CommandPalette } from './CommandPalette';
export type { CommandPaletteProps } from './CommandPalette';

export { CopyButton } from './CopyButton';
export type { CopyButtonProps } from './CopyButton';

export { CreditBalanceIndicator } from './CreditBalanceIndicator';
export type { CreditBalanceIndicatorProps } from './CreditBalanceIndicator';

export { EvidenceCard } from './EvidenceCard';
export type { EvidenceCardProps, EvidenceStatus } from './EvidenceCard';

export { PageTransition } from './PageTransition';
export type { PageTransitionProps } from './PageTransition';

export { QuickActions } from './QuickActions';
export type { QuickActionsProps } from './QuickActions';

export { ScrollIndicator } from './ScrollIndicator';
export type { ScrollIndicatorProps } from './ScrollIndicator';

export { Toast } from './Toast';
export type { ToastProps, ToastVariant } from './Toast';

export { ToastProvider, useToast } from './ToastProvider';
export type { ToastOptions } from './ToastProvider';

export { LastCaptureWidget } from './LastCaptureWidget';
export type { LastCaptureWidgetProps, LastCapture, CaptureStatus } from './LastCaptureWidget';

export { VerificationCodeDisplay } from './VerificationCodeDisplay';
export type { VerificationCodeDisplayProps } from './VerificationCodeDisplay';
