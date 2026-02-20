/**
 * Modal de confirmação com glassmorphismo para a extensão Chrome.
 * Substitui window.confirm() por uma UI moderna e consistente.
 */

import { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, XCircle, Info, CheckCircle, X } from 'lucide-react';

type ConfirmationType = 'warning' | 'danger' | 'info' | 'success';

interface ConfirmationModalProps {
  /** Título do modal */
  title: string;
  /** Mensagem/descrição do modal */
  message: string;
  /** Tipo de confirmação (afeta cores e ícones) */
  type?: ConfirmationType;
  /** Texto do botão de confirmação */
  confirmText?: string;
  /** Texto do botão de cancelamento */
  cancelText?: string;
  /** Callback quando confirmado */
  onConfirm: () => void;
  /** Callback quando cancelado */
  onCancel: () => void;
  /** Se o modal está aberto */
  open: boolean;
}

const typeConfig: Record<ConfirmationType, {
  icon: typeof AlertTriangle;
  iconColor: string;
  confirmButtonBg: string;
  confirmButtonHover: string;
  confirmButtonText: string;
  borderColor: string;
  gradientFrom: string;
}> = {
  warning: {
    icon: AlertTriangle,
    iconColor: '#FBBF24',
    confirmButtonBg: '#EAB308',
    confirmButtonHover: '#CA8A04',
    confirmButtonText: '#000000',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    gradientFrom: 'rgba(245, 158, 11, 0.15)',
  },
  danger: {
    icon: XCircle,
    iconColor: '#F87171',
    confirmButtonBg: '#EF4444',
    confirmButtonHover: '#DC2626',
    confirmButtonText: '#FFFFFF',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    gradientFrom: 'rgba(239, 68, 68, 0.15)',
  },
  info: {
    icon: Info,
    iconColor: '#60A5FA',
    confirmButtonBg: '#3B82F6',
    confirmButtonHover: '#2563EB',
    confirmButtonText: '#FFFFFF',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    gradientFrom: 'rgba(59, 130, 246, 0.15)',
  },
  success: {
    icon: CheckCircle,
    iconColor: '#00DEA5',
    confirmButtonBg: '#00DEA5',
    confirmButtonHover: '#00C494',
    confirmButtonText: '#000000',
    borderColor: 'rgba(0, 222, 165, 0.3)',
    gradientFrom: 'rgba(0, 222, 165, 0.15)',
  },
};

/**
 * Modal de confirmação com glassmorphismo para o tema Lexato.
 */
export function ConfirmationModal({
  title,
  message,
  type = 'warning',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  open,
}: ConfirmationModalProps) {
  const config = typeConfig[type];
  const Icon = config.icon;
  const [isHoveringConfirm, setIsHoveringConfirm] = useState(false);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      onCancel();
    }
  }, [open, onCancel]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleEscape]);

  if (!open) {return null;}

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      {/* Backdrop com blur elegante */}
      <div
        onClick={onCancel}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'lexato-backdrop-fade 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      />

      {/* Modal com slide elegante */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '400px',
          borderRadius: '20px',
          border: `1px solid ${config.borderColor}`,
          background: `linear-gradient(135deg, ${config.gradientFrom} 0%, rgba(15, 14, 16, 0.92) 40%)`,
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 32px 64px -16px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04) inset',
          animation: 'lexato-modal-slide 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Botão fechar */}
        <button
          onClick={onCancel}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            padding: '6px',
            borderRadius: '8px',
            background: 'transparent',
            border: 'none',
            color: '#9CA3AF',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#FFFFFF';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#9CA3AF';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <X style={{ width: '20px', height: '20px' }} />
        </button>

        <div style={{ padding: '24px' }}>
          {/* Ícone e título */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
            <div
              style={{
                flexShrink: 0,
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <Icon style={{ width: '24px', height: '24px', color: config.iconColor }} />
            </div>
            <div style={{ flex: 1, paddingTop: '4px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>
                {title}
              </h3>
            </div>
          </div>

          {/* Mensagem */}
          <p
            style={{
              color: '#9CA3AF',
              fontSize: '14px',
              lineHeight: 1.6,
              marginBottom: '24px',
              paddingLeft: '64px',
              margin: '0 0 24px 0',
            }}
          >
            {message}
          </p>

          {/* Botões */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '12px 20px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#D1D5DB',
                fontWeight: 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                backdropFilter: 'blur(4px)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#FFFFFF';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = '#D1D5DB';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              onMouseEnter={() => setIsHoveringConfirm(true)}
              onMouseLeave={() => setIsHoveringConfirm(false)}
              style={{
                padding: '12px 20px',
                borderRadius: '12px',
                backgroundColor: isHoveringConfirm ? config.confirmButtonHover : config.confirmButtonBg,
                border: 'none',
                color: config.confirmButtonText,
                fontWeight: 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: isHoveringConfirm
                  ? '0 16px 32px -8px rgba(0, 0, 0, 0.4)'
                  : '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                transform: isHoveringConfirm ? 'translateY(-2px)' : 'translateY(0)',
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      {/* CSS Animations - Deslizamento elegante */}
      <style>{`
        @keyframes lexato-backdrop-fade {
          from {
            opacity: 0;
            backdrop-filter: blur(0);
          }
          to {
            opacity: 1;
            backdrop-filter: blur(8px);
          }
        }
        @keyframes lexato-modal-slide {
          0% {
            opacity: 0;
            transform: translateY(32px) scale(0.94);
            filter: blur(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Função utilitária para exibir modal de confirmação de forma imperativa.
 * Substitui window.confirm() com uma UI moderna.
 *
 * @example
 * ```tsx
 * const confirmed = await showConfirmation({
 *   title: 'Descartar gravação?',
 *   message: 'Os dados serão perdidos.',
 *   type: 'danger',
 *   confirmText: 'Descartar',
 * });
 *
 * if (confirmed) {
 *   // Usuário confirmou
 * }
 * ```
 */
export function showConfirmation(options: {
  title: string;
  message: string;
  type?: ConfirmationType;
  confirmText?: string;
  cancelText?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.id = `confirmation-modal-${Date.now()}`;
    document.body.appendChild(container);

    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      container.remove();
    };

    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    root.render(
      <ConfirmationModal
        {...options}
        open={true}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  });
}

/**
 * Funções pré-configuradas para tipos comuns de confirmação
 */
export const confirm = {
  /**
   * Confirmação de perigo/exclusão
   */
  danger: (title: string, message: string, confirmText = 'Excluir') =>
    showConfirmation({ title, message, type: 'danger', confirmText }),

  /**
   * Confirmação de aviso
   */
  warning: (title: string, message: string, confirmText = 'Continuar') =>
    showConfirmation({ title, message, type: 'warning', confirmText }),

  /**
   * Confirmação informativa
   */
  info: (title: string, message: string, confirmText = 'OK') =>
    showConfirmation({ title, message, type: 'info', confirmText }),

  /**
   * Confirmação de sucesso
   */
  success: (title: string, message: string, confirmText = 'Continuar') =>
    showConfirmation({ title, message, type: 'success', confirmText }),
};
