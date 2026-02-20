/**
 * Componente Toast do Design System Lexato
 *
 * Toast notifications empilháveis com variantes, auto-dismiss,
 * progress bar e botão de ação opcional.
 *
 * @see Requirements 17.1-17.7
 */

import React, { useEffect, useState, useCallback } from 'react';

/**
 * Variantes disponíveis para o toast
 */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/**
 * Props do componente Toast
 */
export interface ToastProps {
  /** ID único do toast */
  id: string;
  /** Variante visual do toast */
  variant: ToastVariant;
  /** Mensagem principal do toast */
  message: string;
  /** Título opcional do toast */
  title?: string;
  /** Tempo em ms para auto-dismiss (padrão: 5000ms) */
  duration?: number;
  /** Callback quando o toast é fechado */
  onDismiss: (id: string) => void;
  /** Texto do botão de ação opcional */
  actionLabel?: string;
  /** Callback do botão de ação */
  onAction?: () => void;
  /** Se deve mostrar progress bar */
  showProgress?: boolean;
}

/**
 * Configuração de cores e ícones por variante
 */
const variantConfig: Record<
  ToastVariant,
  {
    bg: string;
    border: string;
    icon: string;
    iconBg: string;
    progressBg: string;
  }
> = {
  success: {
    bg: 'bg-[rgba(0,222,165,0.1)]',
    border: 'border-[rgba(0,222,165,0.3)]',
    icon: 'text-status-success',
    iconBg: 'bg-[rgba(0,222,165,0.15)]',
    progressBg: 'bg-status-success',
  },
  error: {
    bg: 'bg-[rgba(239,83,80,0.1)]',
    border: 'border-[rgba(239,83,80,0.3)]',
    icon: 'text-status-error',
    iconBg: 'bg-[rgba(239,83,80,0.15)]',
    progressBg: 'bg-status-error',
  },
  warning: {
    bg: 'bg-[rgba(255,167,38,0.1)]',
    border: 'border-[rgba(255,167,38,0.3)]',
    icon: 'text-status-warning',
    iconBg: 'bg-[rgba(255,167,38,0.15)]',
    progressBg: 'bg-status-warning',
  },
  info: {
    bg: 'bg-[rgba(0,153,120,0.1)]',
    border: 'border-[rgba(0,153,120,0.3)]',
    icon: 'text-status-info',
    iconBg: 'bg-[rgba(0,153,120,0.15)]',
    progressBg: 'bg-status-info',
  },
};

/**
 * Ícones SVG por variante
 */
const ToastIcon: React.FC<{ variant: ToastVariant; className?: string }> = ({
  variant,
  className = 'w-5 h-5',
}) => {
  const icons: Record<ToastVariant, React.ReactNode> = {
    success: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
      </svg>
    ),
    error: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
    ),
    warning: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg>
    ),
    info: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
      </svg>
    ),
  };

  return <>{icons[variant]}</>;
};

/**
 * Ícone de fechar (X)
 */
const CloseIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
  </svg>
);

/**
 * Componente Toast individual
 *
 * Características:
 * - Variantes: success, error, warning, info
 * - Auto-dismiss configurável (padrão 5s)
 * - Progress bar indicando tempo restante
 * - Botão de ação opcional
 * - Animação de entrada/saída
 *
 * @example
 * ```tsx
 * <Toast
 *   id="toast-1"
 *   variant="success"
 *   message="Captura realizada com sucesso!"
 *   onDismiss={(id) => removeToast(id)}
 *   actionLabel="Desfazer"
 *   onAction={() => undoCapture()}
 * />
 * ```
 */
export const Toast: React.FC<ToastProps> = ({
  id,
  variant,
  message,
  title,
  duration = 5000,
  onDismiss,
  actionLabel,
  onAction,
  showProgress = true,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  const config = variantConfig[variant];

  /**
   * Inicia animação de saída e depois remove o toast
   */
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(id);
    }, 200); // Duração da animação de saída
  }, [id, onDismiss]);

  /**
   * Executa ação e fecha o toast
   */
  const handleAction = useCallback(() => {
    if (onAction) {
      onAction();
    }
    handleDismiss();
  }, [onAction, handleDismiss]);

  /**
   * Timer de auto-dismiss com progress bar
   */
  useEffect(() => {
    if (duration <= 0 || isPaused) {
      return;
    }

    const startTime = Date.now();
    const endTime = startTime + duration;

    const updateProgress = () => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const newProgress = (remaining / duration) * 100;
      setProgress(newProgress);

      if (remaining <= 0) {
        handleDismiss();
      }
    };

    // Atualiza progress a cada 50ms para animação suave
    const interval = setInterval(updateProgress, 50);

    return () => clearInterval(interval);
  }, [duration, isPaused, handleDismiss]);

  const containerClasses = [
    'relative',
    'flex flex-col',
    'w-[320px]',
    'rounded-lg',
    'border',
    'backdrop-blur-md',
    'shadow-lg',
    'overflow-hidden',
    'transition-all duration-200',
    config.bg,
    config.border,
    isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0',
    'animate-slide-in-right',
  ].join(' ');

  return (
    <div
      className={containerClasses}
      role="alert"
      aria-live="polite"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-testid={`toast-${id}`}
    >
      {/* Conteúdo principal */}
      <div className="flex items-start gap-3 p-4">
        {/* Ícone */}
        <div className={`shrink-0 p-1.5 rounded-md ${config.iconBg}`}>
          <ToastIcon variant={variant} className={`w-4 h-4 ${config.icon}`} />
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          {title && (
            <p className="text-sm font-semibold text-text-primary mb-0.5">{title}</p>
          )}
          <p className="text-sm text-text-secondary">{message}</p>

          {/* Botão de ação */}
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={handleAction}
              className="mt-2 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
            >
              {actionLabel}
            </button>
          )}
        </div>

        {/* Botão fechar */}
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-glass-backgroundLight transition-colors"
          aria-label="Fechar notificação"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Progress bar */}
      {showProgress && duration > 0 && (
        <div className="h-1 bg-glass-backgroundLight">
          <div
            className={`h-full transition-all duration-50 ${config.progressBg}`}
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
    </div>
  );
};

Toast.displayName = 'Toast';

export default Toast;
