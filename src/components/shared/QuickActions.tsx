/**
 * Componente QuickActions do Design System Lexato
 *
 * Botões de ação rápida que aparecem no hover de cards de evidência.
 * Inclui: Copiar Hash, Abrir Detalhes, Baixar.
 *
 * @see Requirements 26.1-26.5
 */

import React from 'react';
import { CopyButton } from './CopyButton';
import { quickActionTooltips } from '../../lib/i18n/tooltips';

/**
 * Props do componente QuickActions
 */
export interface QuickActionsProps {
  /** Hash SHA-256 da evidência */
  hash: string;
  /** Callback ao abrir detalhes */
  onOpenDetails?: () => void;
  /** Callback ao baixar */
  onDownload?: () => void;
  /** Se está visível */
  visible?: boolean;
  /** Classe CSS adicional */
  className?: string;
}

/**
 * Ícone de detalhes (eye)
 */
const DetailsIcon: React.FC = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * Ícone de download
 */
const DownloadIcon: React.FC = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * Botão de ação individual
 */
const ActionButton: React.FC<{
  onClick?: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ onClick, ariaLabel, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-8 h-8 flex items-center justify-center rounded-md bg-glass-background backdrop-blur-sm border border-glass-border text-text-secondary hover:text-text-primary hover:bg-glass-backgroundHover hover:border-glass-borderHover transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    aria-label={ariaLabel}
  >
    {children}
  </button>
);

/**
 * Quick Actions para cards de evidência
 *
 * Aparece com fadeIn 150ms no hover do card pai.
 * Background glass para consistência visual.
 *
 * @example
 * ```tsx
 * <div className="group relative">
 *   <Card>...</Card>
 *   <QuickActions
 *     hash="0x1234..."
 *     onOpenDetails={() => navigate('/details')}
 *     onDownload={() => downloadFile()}
 *     visible={isHovered}
 *   />
 * </div>
 * ```
 */
export const QuickActions: React.FC<QuickActionsProps> = ({
  hash,
  onOpenDetails,
  onDownload,
  visible = false,
  className = '',
}) => {
  const containerClasses = [
    'flex items-center gap-1.5 p-1.5',
    'bg-glass-background backdrop-blur-md',
    'border border-glass-border rounded-lg',
    'shadow-lg',
    'transition-all duration-150',
    visible
      ? 'opacity-100 scale-100'
      : 'opacity-0 scale-95 pointer-events-none',
    className,
  ].join(' ');

  return (
    <div
      className={containerClasses}
      role="toolbar"
      aria-label="Ações rápidas"
      data-testid="quick-actions"
    >
      <CopyButton
        textToCopy={hash}
        size="sm"
        variant="ghost"
        ariaLabel={quickActionTooltips.copyHash}
      />
      <ActionButton {...(onOpenDetails && { onClick: onOpenDetails })} ariaLabel={quickActionTooltips.openDetails}>
        <DetailsIcon />
      </ActionButton>
      <ActionButton {...(onDownload && { onClick: onDownload })} ariaLabel={quickActionTooltips.download}>
        <DownloadIcon />
      </ActionButton>
    </div>
  );
};

QuickActions.displayName = 'QuickActions';

export default QuickActions;
