/**
 * Componente BlockchainSyncIndicator do Design System Lexato
 *
 * Indicador de sincronização com blockchain em tempo real.
 * Exibe status de registro com animações visuais apropriadas.
 *
 * @see Requirements 21.1-21.5
 */

import React from 'react';

/**
 * Status possíveis de sincronização blockchain
 */
export type BlockchainSyncStatus = 'registering' | 'confirming' | 'verified';

/**
 * Props do componente BlockchainSyncIndicator
 */
export interface BlockchainSyncIndicatorProps {
  /** Status atual da sincronização */
  status: BlockchainSyncStatus;
  /** Classe CSS adicional */
  className?: string;
  /** Tamanho do indicador */
  size?: 'sm' | 'md' | 'lg';
  /** Se deve mostrar o label de texto */
  showLabel?: boolean;
  /** Callback quando verificação completa (após animação de glow) */
  onVerified?: () => void;
}

/**
 * Labels em português para cada status
 */
const statusLabels: Record<BlockchainSyncStatus, string> = {
  registering: 'Registrando...',
  confirming: 'Confirmando...',
  verified: 'Verificado ✓',
};

/**
 * Configuração de tamanhos
 */
const sizeConfig = {
  sm: {
    container: 'px-2 py-1 gap-1',
    icon: 'w-3 h-3',
    text: 'text-[10px]',
  },
  md: {
    container: 'px-2.5 py-1 gap-1.5',
    icon: 'w-3.5 h-3.5',
    text: 'text-[11px]',
  },
  lg: {
    container: 'px-3 py-1.5 gap-2',
    icon: 'w-4 h-4',
    text: 'text-xs',
  },
};

/**
 * Ícone de blockchain/chain-link
 */
const BlockchainIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
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
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

/**
 * Ícone de checkmark para status verificado
 */
const CheckmarkIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
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
 * Ícone de loading spinner
 */
const SpinnerIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
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
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

/**
 * Componente BlockchainSyncIndicator
 *
 * Exibe o status de sincronização com blockchain em tempo real.
 *
 * Características:
 * - Status: registering, confirming, verified
 * - Animação pulse-glow durante registro/confirmação
 * - Checkmark com glow ao verificar (3 segundos)
 * - Ícone de blockchain/chain-link
 *
 * @example
 * ```tsx
 * <BlockchainSyncIndicator status="registering" />
 * <BlockchainSyncIndicator status="confirming" showLabel />
 * <BlockchainSyncIndicator status="verified" size="lg" />
 * ```
 */
export const BlockchainSyncIndicator: React.FC<BlockchainSyncIndicatorProps> = ({
  status,
  className = '',
  size = 'md',
  showLabel = true,
  onVerified,
}) => {
  const sizeClasses = sizeConfig[size];
  const isProcessing = status === 'registering' || status === 'confirming';
  const isVerified = status === 'verified';

  // Callback quando verificação completa (após animação)
  React.useEffect(() => {
    if (isVerified && onVerified) {
      const timer = setTimeout(() => {
        onVerified();
      }, 3000); // Duração da animação de glow
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isVerified, onVerified]);

  /**
   * Classes do container baseadas no status
   */
  const containerClasses = [
    'inline-flex items-center rounded-md font-medium',
    sizeClasses.container,
    // Background e cor
    isProcessing && 'bg-[rgba(0,222,165,0.1)] text-primary',
    isVerified && 'bg-[rgba(0,222,165,0.15)] text-primary',
    // Animações
    isProcessing && 'animate-pulse-glow',
    isVerified && 'animate-verified-glow',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * Classes do ícone baseadas no status
   */
  const iconClasses = [
    sizeClasses.icon,
    isProcessing && 'animate-spin',
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * Renderiza o ícone apropriado para o status
   */
  const renderIcon = () => {
    if (isVerified) {
      return <CheckmarkIcon className={sizeClasses.icon} />;
    }
    if (isProcessing) {
      return <SpinnerIcon className={iconClasses} />;
    }
    return <BlockchainIcon className={sizeClasses.icon} />;
  };

  return (
    <div
      className={containerClasses}
      role="status"
      aria-live="polite"
      aria-label={statusLabels[status]}
      data-testid="blockchain-sync-indicator"
      data-status={status}
    >
      {renderIcon()}
      {showLabel && (
        <span className={sizeClasses.text}>{statusLabels[status]}</span>
      )}
    </div>
  );
};

BlockchainSyncIndicator.displayName = 'BlockchainSyncIndicator';

export default BlockchainSyncIndicator;
