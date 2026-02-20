/**
 * Sistema de toasts para a extensão Chrome do Lexato.
 * Usa Sonner com visual glassmorphismo consistente com a identidade visual.
 */

import { Toaster as Sonner, toast } from 'sonner';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

/**
 * Componente Toaster configurado para o tema Lexato.
 * Deve ser incluído no layout principal da aplicação.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      duration={4000}
      visibleToasts={3}
      expand={true}
      closeButton={true}
      toastOptions={{
        style: {
          background: 'rgba(15, 14, 16, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: 'white',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          borderRadius: '12px',
        },
        classNames: {
          toast: 'lexato-toast',
          description: 'text-gray-400',
          actionButton: 'bg-[#00DEA5] text-black hover:bg-[#00DEA5]/90',
          cancelButton: 'bg-white/10 text-gray-300 hover:bg-white/20',
          closeButton: 'bg-transparent text-gray-500 hover:text-white border-0',
        },
      }}
    />
  );
}

/**
 * Funções utilitárias para exibir notificações com ícones customizados.
 */
export const showToast = {
  /**
   * Exibe notificação de sucesso
   */
  success: (message: string, options?: Parameters<typeof toast.success>[1]) => {
    return toast.success(message, {
      ...options,
      icon: <CheckCircle className="h-5 w-5 text-[#00DEA5]" />,
      style: {
        ...options?.style,
        background: 'linear-gradient(135deg, rgba(0, 222, 165, 0.15) 0%, rgba(15, 14, 16, 0.95) 50%)',
        borderLeft: '4px solid rgb(0, 222, 165)',
      },
    });
  },

  /**
   * Exibe notificação de erro
   */
  error: (message: string, options?: Parameters<typeof toast.error>[1]) => {
    return toast.error(message, {
      ...options,
      icon: <XCircle className="h-5 w-5 text-red-400" />,
      style: {
        ...options?.style,
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 14, 16, 0.95) 50%)',
        borderLeft: '4px solid rgb(239, 68, 68)',
      },
    });
  },

  /**
   * Exibe notificação de aviso
   */
  warning: (message: string, options?: Parameters<typeof toast>[1]) => {
    return toast(message, {
      ...options,
      icon: <AlertTriangle className="h-5 w-5 text-yellow-400" />,
      style: {
        ...options?.style,
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 14, 16, 0.95) 50%)',
        borderLeft: '4px solid rgb(245, 158, 11)',
      },
    });
  },

  /**
   * Exibe notificação informativa
   */
  info: (message: string, options?: Parameters<typeof toast>[1]) => {
    return toast(message, {
      ...options,
      icon: <Info className="h-5 w-5 text-blue-400" />,
      style: {
        ...options?.style,
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(15, 14, 16, 0.95) 50%)',
        borderLeft: '4px solid rgb(59, 130, 246)',
      },
    });
  },

  /**
   * Remove uma notificação específica
   */
  dismiss: (id?: string | number) => {
    return toast.dismiss(id);
  },

  /**
   * Remove todas as notificações
   */
  dismissAll: () => {
    return toast.dismiss();
  },
};

// CSS com animações elegantes de deslizamento
const styles = `
/* Transições suaves para todos os toasts */
[data-sonner-toast] {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* Animação de entrada - deslizamento elegante da direita */
[data-sonner-toast][data-mounted="true"] {
  animation: lexato-chrome-slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
}

/* Animação de saída */
[data-sonner-toast][data-removed="true"] {
  animation: lexato-chrome-slide-out 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
}

@keyframes lexato-chrome-slide-in {
  0% {
    opacity: 0;
    transform: translateY(100%) scale(0.9);
    filter: blur(4px);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

@keyframes lexato-chrome-slide-out {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-20px) scale(0.9);
    filter: blur(4px);
  }
}

/* Hover sutil */
[data-sonner-toast]:hover {
  transform: scale(1.02) !important;
  box-shadow: 0 32px 64px -16px rgba(0, 0, 0, 0.5) !important;
}

/* Botão de fechar elegante */
[data-sonner-toast] [data-close-button] {
  transition: all 0.2s ease-out !important;
  opacity: 0.5 !important;
}

[data-sonner-toast]:hover [data-close-button] {
  opacity: 1 !important;
}

[data-sonner-toast] [data-close-button]:hover {
  background: rgba(255, 255, 255, 0.15) !important;
  transform: scale(1.1) !important;
}
`;

// Injeta estilos apenas uma vez
if (typeof document !== 'undefined') {
  const existingStyle = document.getElementById('lexato-toast-styles');
  if (!existingStyle) {
    const styleElement = document.createElement('style');
    styleElement.id = 'lexato-toast-styles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }
}
