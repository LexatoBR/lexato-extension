/**
 * Componente OfflineBanner do Design System Lexato
 *
 * Banner de estado offline com ícone wifi-off, mensagem,
 * contador de ações pendentes e estado "Reconectado".
 *
 * @see Requirements 18.1-18.6
 */

import React, { useEffect, useState } from 'react';

/**
 * Props do componente OfflineBanner
 */
export interface OfflineBannerProps {
  /** Se está offline */
  isOffline: boolean;
  /** Número de ações pendentes */
  pendingActions?: number;
  /** Callback quando reconectar */
  onReconnect?: () => void;
  /** Classe CSS adicional */
  className?: string;
}

/**
 * Ícone de WiFi desconectado
 */
const WifiOffIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M22.99 9C19.15 5.16 13.8 3.76 8.84 4.78l2.52 2.52c3.47-.17 6.99 1.05 9.63 3.7l2-2zm-4 4c-1.29-1.29-2.84-2.13-4.49-2.56l3.53 3.53.96-.97zM2 3.05L5.07 6.1C3.6 6.82 2.22 7.78 1 9l2 2c1.02-1.02 2.17-1.85 3.41-2.5l2.52 2.52C7.14 11.98 5.63 13.07 4.41 14.3l2 2c1.23-1.23 2.65-2.16 4.17-2.78l2.24 2.24c-1.35.37-2.63 1.02-3.74 1.98L12 20.5l2.58-2.58c-.11-.08-.21-.17-.33-.25L19.95 23l1.41-1.41L3.41 1.64 2 3.05z" />
  </svg>
);

/**
 * Ícone de WiFi conectado (checkmark)
 */
const WifiOnIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" />
  </svg>
);

/**
 * Componente OfflineBanner
 *
 * Exibe um banner quando o usuário está offline, com:
 * - Ícone de wifi-off
 * - Mensagem "Sem conexão com a internet"
 * - Contador de ações pendentes (opcional)
 * - Estado "Reconectado" por 3 segundos ao reconectar
 *
 * @example
 * ```tsx
 * <OfflineBanner
 *   isOffline={!navigator.onLine}
 *   pendingActions={3}
 *   onReconnect={() => syncPendingActions()}
 * />
 * ```
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOffline,
  pendingActions = 0,
  onReconnect,
  className = '',
}) => {
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  /**
   * Detecta transição de offline para online
   * e mostra mensagem "Reconectado" por 3 segundos
   */
  useEffect(() => {
    if (wasOffline && !isOffline) {
      setShowReconnected(true);
      onReconnect?.();

      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 3000);

      return () => clearTimeout(timer);
    }

    setWasOffline(isOffline);
    return undefined;
  }, [isOffline, wasOffline, onReconnect]);

  // Não renderiza se online e não mostrando "Reconectado"
  if (!isOffline && !showReconnected) {
    return null;
  }

  // Estado "Reconectado"
  if (showReconnected) {
    return (
      <div
        className={`
          flex items-center gap-3 px-4 py-3
          bg-[rgba(0,222,165,0.15)]
          border border-[rgba(0,222,165,0.3)]
          rounded-lg
          animate-fade-in-scale
          ${className}
        `}
        role="status"
        aria-live="polite"
        data-testid="offline-banner-reconnected"
      >
        <div className="shrink-0 p-1.5 rounded-md bg-[rgba(0,222,165,0.15)]">
          <WifiOnIcon className="w-4 h-4 text-status-success" />
        </div>
        <span className="text-sm font-medium text-status-success">
          Reconectado
        </span>
      </div>
    );
  }

  // Estado offline
  return (
    <div
      className={`
        flex items-center justify-between gap-3 px-4 py-3
        bg-[rgba(255,167,38,0.15)]
        border border-[rgba(255,167,38,0.3)]
        rounded-lg
        animate-fade-in-scale
        ${className}
      `}
      role="alert"
      aria-live="assertive"
      data-testid="offline-banner"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 p-1.5 rounded-md bg-[rgba(255,167,38,0.15)]">
          <WifiOffIcon className="w-4 h-4 text-status-warning" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-primary">
            Sem conexão com a internet
          </span>
          {pendingActions > 0 && (
            <span className="text-xs text-text-secondary">
              {pendingActions} {pendingActions === 1 ? 'ação pendente' : 'ações pendentes'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

OfflineBanner.displayName = 'OfflineBanner';

export default OfflineBanner;
