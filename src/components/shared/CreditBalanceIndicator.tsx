/**
 * Componente CreditBalanceIndicator do Design System Lexato
 *
 * Indicador de saldo de créditos com atualização em tempo real.
 * Exibe quantidade de créditos disponíveis e link para compra.
 *
 * @see Requirements 4.2: Exibir saldo de créditos do usuário autenticado
 */

import React from 'react';
import { useCredits } from '../../hooks/useCredits';

/**
 * Props do componente CreditBalanceIndicator
 */
export interface CreditBalanceIndicatorProps {
  /** Classe CSS adicional */
  className?: string;
  /** Tamanho do indicador */
  size?: 'sm' | 'md' | 'lg';
  /** Se deve mostrar o label de texto */
  showLabel?: boolean;
  /** Se deve mostrar o link para comprar créditos */
  showBuyLink?: boolean;
  /** URL base do app para compra de créditos */
  appUrl?: string;
  /** Callback quando créditos estão baixos (< threshold) */
  onLowCredits?: () => void;
  /** Limite para considerar créditos baixos */
  lowCreditsThreshold?: number;
}

/**
 * Configuração de tamanhos
 */
const sizeConfig = {
  sm: {
    container: 'px-2 py-1 gap-1',
    icon: 'w-3 h-3',
    text: 'text-[10px]',
    badge: 'text-[10px] px-1.5 py-0.5',
  },
  md: {
    container: 'px-2.5 py-1.5 gap-1.5',
    icon: 'w-3.5 h-3.5',
    text: 'text-[11px]',
    badge: 'text-[11px] px-2 py-0.5',
  },
  lg: {
    container: 'px-3 py-2 gap-2',
    icon: 'w-4 h-4',
    text: 'text-xs',
    badge: 'text-xs px-2.5 py-1',
  },
};

/**
 * Ícone de moedas/créditos
 */
const CoinsIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
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
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4" />
    <path d="m16.71 13.88.7.71-2.82 2.82" />
  </svg>
);

/**
 * Ícone de alerta para créditos baixos
 */
const AlertIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
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
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

/**
 * Ícone de link externo
 */
const ExternalLinkIcon: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
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
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

/**
 * Componente CreditBalanceIndicator
 *
 * Exibe o saldo de créditos do usuário em tempo real.
 *
 * Características:
 * - Atualização automática via chrome.storage.onChanged
 * - Alerta visual quando créditos estão baixos
 * - Link opcional para comprar mais créditos
 * - Integração com useCredits hook
 *
 * @example
 * ```tsx
 * <CreditBalanceIndicator />
 * <CreditBalanceIndicator size="lg" showBuyLink />
 * <CreditBalanceIndicator onLowCredits={handleLowCredits} lowCreditsThreshold={5} />
 * ```
 */
export const CreditBalanceIndicator: React.FC<CreditBalanceIndicatorProps> = ({
  className = '',
  size = 'md',
  showLabel = true,
  showBuyLink = false,
  appUrl = 'https://app.lexato.com.br',
  onLowCredits,
  lowCreditsThreshold = 3,
}) => {
  const { credits, isLoading, refreshCredits } = useCredits();
  const sizeClasses = sizeConfig[size];

  const isLowCredits = credits <= lowCreditsThreshold && credits > 0;
  const isNoCredits = credits === 0;

  // Callback quando créditos estão baixos
  React.useEffect(() => {
    if ((isLowCredits || isNoCredits) && onLowCredits) {
      onLowCredits();
    }
  }, [isLowCredits, isNoCredits, onLowCredits]);

  // Refresh ao montar o componente
  React.useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  /**
   * Abre a página de compra de créditos
   */
  const handleBuyCredits = () => {
    chrome.tabs.create({ url: `${appUrl}/creditos` });
  };

  /**
   * Determina a cor baseado no saldo
   */
  const getStatusColor = () => {
    if (isNoCredits) {
      return 'text-red-400 bg-red-500/10';
    }
    if (isLowCredits) {
      return 'text-yellow-400 bg-yellow-500/10';
    }
    return 'text-primary bg-[rgba(0,222,165,0.1)]';
  };

  /**
   * Classes do container
   */
  const containerClasses = [
    'inline-flex items-center rounded-md font-medium transition-colors',
    sizeClasses.container,
    getStatusColor(),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * Renderiza o ícone apropriado
   */
  const renderIcon = () => {
    if (isLoading) {
      return (
        <div className={`${sizeClasses.icon} animate-pulse bg-current opacity-30 rounded`} />
      );
    }
    if (isNoCredits || isLowCredits) {
      return <AlertIcon className={sizeClasses.icon} />;
    }
    return <CoinsIcon className={sizeClasses.icon} />;
  };

  /**
   * Renderiza o label de créditos
   */
  const renderLabel = () => {
    if (isLoading) {
      return <span className={sizeClasses.text}>...</span>;
    }
    return (
      <span className={sizeClasses.text}>
        {credits} {showLabel && (credits === 1 ? 'crédito' : 'créditos')}
      </span>
    );
  };

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={containerClasses}
        role="status"
        aria-live="polite"
        aria-label={`Saldo: ${credits} créditos`}
        data-testid="credit-balance-indicator"
      >
        {renderIcon()}
        {renderLabel()}
      </div>

      {showBuyLink && (
        <button
          onClick={handleBuyCredits}
          className={`
            inline-flex items-center gap-1 rounded-md font-medium
            ${sizeClasses.badge}
            bg-primary/10 text-primary hover:bg-primary/20
            transition-colors cursor-pointer
          `}
          aria-label="Comprar créditos"
          data-testid="buy-credits-button"
        >
          <span>Comprar</span>
          <ExternalLinkIcon className="w-2.5 h-2.5" />
        </button>
      )}

      {isNoCredits && !showBuyLink && (
        <button
          onClick={handleBuyCredits}
          className={`
            inline-flex items-center gap-1 rounded-md font-medium
            ${sizeClasses.badge}
            bg-red-500/20 text-red-400 hover:bg-red-500/30
            transition-colors cursor-pointer animate-pulse
          `}
          aria-label="Comprar créditos - Saldo zerado"
          data-testid="buy-credits-urgent-button"
        >
          <span>Comprar agora</span>
          <ExternalLinkIcon className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
};

CreditBalanceIndicator.displayName = 'CreditBalanceIndicator';

export default CreditBalanceIndicator;
