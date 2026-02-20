/**
 * Provider de Toast Notifications - Lexato Chrome Extension
 *
 * Gerencia toasts globalmente via React Context.
 * Empilhamento vertical com máximo de 3 toasts visíveis.
 *
 * @see Requirements 17.1-17.7
 */

import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';
import { Toast, ToastVariant } from './Toast';
import type { ToastProps as _ToastProps } from './Toast';

/** Opções para criar um novo toast */
export interface ToastOptions {
  /** Variante visual do toast */
  variant: ToastVariant;
  /** Mensagem principal */
  message: string;
  /** Título opcional */
  title?: string;
  /** Duração em ms (padrão: 5000) */
  duration?: number;
  /** Texto do botão de ação */
  actionLabel?: string;
  /** Callback do botão de ação */
  onAction?: () => void;
  /** Mostrar progress bar (padrão: true) */
  showProgress?: boolean;
}

/** Estado interno de um toast */
interface ToastState extends ToastOptions {
  id: string;
}

/** Contexto do ToastProvider */
interface ToastContextValue {
  /** Exibe um novo toast e retorna seu ID */
  showToast: (options: ToastOptions) => string;
  /** Remove um toast pelo ID */
  dismissToast: (id: string) => void;
  /** Remove todos os toasts */
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Máximo de toasts visíveis simultaneamente */
const MAX_VISIBLE_TOASTS = 3;

/** Contador para gerar IDs únicos */
let toastCounter = 0;

/**
 * Gera ID único para toast
 */
const generateToastId = (): string => {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
};

/**
 * Props do ToastProvider
 */
interface ToastProviderProps {
  children: React.ReactNode;
}

/**
 * Provider para gerenciamento global de toasts
 *
 * @example
 * ```tsx
 * // No App.tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 *
 * // Em qualquer componente
 * const { showToast } = useToast();
 * showToast({ variant: 'success', message: 'Captura realizada!' });
 * ```
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  /**
   * Exibe um novo toast
   */
  const showToast = useCallback((options: ToastOptions): string => {
    const id = generateToastId();
    const newToast: ToastState = { ...options, id };

    setToasts((prev) => {
      // Adiciona novo toast no início (mais recente no topo)
      const updated = [newToast, ...prev];
      // Mantém apenas os últimos toasts (remove os mais antigos se exceder limite)
      return updated.slice(0, MAX_VISIBLE_TOASTS + 2); // Buffer para animação de saída
    });

    return id;
  }, []);

  /**
   * Remove um toast pelo ID
   */
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  /**
   * Remove todos os toasts
   */
  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const contextValue = useMemo(
    () => ({ showToast, dismissToast, dismissAll }),
    [showToast, dismissToast, dismissAll]
  );

  // Toasts visíveis (máximo 3)
  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Container de toasts - posição fixa no canto inferior direito */}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-3 pointer-events-none"
        aria-live="polite"
        aria-label="Notificações"
      >
        {visibleToasts.map((toast, index) => (
          <div
            key={toast.id}
            className="pointer-events-auto"
            style={{
              // Escala e opacidade reduzidas para toasts mais antigos
              transform: `scale(${1 - index * 0.02})`,
              opacity: 1 - index * 0.1,
            }}
          >
            <Toast
              id={toast.id}
              variant={toast.variant}
              message={toast.message}
              {...(toast.title !== undefined && { title: toast.title })}
              {...(toast.duration !== undefined && { duration: toast.duration })}
              onDismiss={dismissToast}
              {...(toast.actionLabel !== undefined && { actionLabel: toast.actionLabel })}
              {...(toast.onAction !== undefined && { onAction: toast.onAction })}
              {...(toast.showProgress !== undefined && { showProgress: toast.showProgress })}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/**
 * Hook para acessar funções de toast
 *
 * @throws Error se usado fora do ToastProvider
 *
 * @example
 * ```tsx
 * const { showToast, dismissToast } = useToast();
 *
 * // Sucesso
 * showToast({ variant: 'success', message: 'Operação concluída!' });
 *
 * // Erro com ação
 * showToast({
 *   variant: 'error',
 *   message: 'Falha ao enviar',
 *   actionLabel: 'Tentar novamente',
 *   onAction: () => retry(),
 * });
 * ```
 */
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('[ToastProvider] useToast deve ser usado dentro de um ToastProvider');
  }

  return context;
};

ToastProvider.displayName = 'ToastProvider';

export default ToastProvider;
