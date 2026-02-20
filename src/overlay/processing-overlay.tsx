/**
 * Overlay de Processamento Pós-Captura
 *
 * Exibe o progresso do processamento após a captura de evidência.
 * Mostra etapas de processamento com indicadores de status e barra de progresso.
 *
 * Fluxo de etapas:
 * 1. Captura finalizada (✓)
 * 2. Aplicando carimbo de tempo ICP-Brasil...
 * 3. Criptografando dados...
 * 4. Enviando para armazenamento seguro...
 * 5. Reativando extensões do navegador...
 *
 * @module ProcessingOverlay
 * @see Requirements 1: Processing Overlay Post-Capture
 * @see design.md: Processing Overlay (Extensão Chrome)
 */

import React, { useCallback, useEffect, useState } from 'react';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Status de uma etapa de processamento
 *
 * - pending: Aguardando execução (○)
 * - in_progress: Em execução (⟳)
 * - completed: Concluída com sucesso (✓)
 * - error: Falha na execução (✗)
 */
export type ProcessingStepStatus = 'pending' | 'in_progress' | 'completed' | 'error';

/**
 * Etapa de processamento
 */
export interface ProcessingStep {
  /** Identificador único da etapa */
  id: string;
  /** Texto exibido para o usuário (PT-BR) */
  label: string;
  /** Status atual da etapa */
  status: ProcessingStepStatus;
  /** Mensagem de erro (se status === 'error') */
  errorMessage?: string;
}

/**
 * Erro de processamento
 */
export interface ProcessingError {
  /** Etapa onde ocorreu o erro */
  stepId: string;
  /** Mensagem de erro */
  message: string;
  /** Se o erro permite retry */
  retryable: boolean;
  /** Código do erro (para logging) */
  code?: string;
}

/**
 * Props do componente ProcessingOverlay
 */
export interface ProcessingOverlayProps {
  /** ID da evidência sendo processada */
  evidenceId: string;
  /** Etapas de processamento com status */
  steps: ProcessingStep[];
  /** Progresso geral (0-100) */
  progress: number;
  /** Callback quando processamento completa */
  onComplete?: (previewUrl: string) => void;
  /** Callback em caso de erro */
  onError?: (error: ProcessingError) => void;
  /** Callback para retry após erro */
  onRetry?: () => void;
  /** Erro atual (se houver) */
  error?: ProcessingError | null;
  /** Se o overlay está visível */
  visible?: boolean;
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * Z-index máximo para garantir que o overlay fique acima de tudo
 */
export const PROCESSING_OVERLAY_Z_INDEX = 2147483647;

/**
 * Etapas padrão de processamento pós-captura
 *
 * @see Requirements 1.4: Processing steps in order
 */
export const DEFAULT_PROCESSING_STEPS: ProcessingStep[] = [
  { id: 'capture', label: 'Captura finalizada', status: 'completed' },
  { id: 'timestamp', label: 'Aplicando carimbo de tempo ICP-Brasil...', status: 'pending' },
  { id: 'encrypt', label: 'Criptografando dados...', status: 'pending' },
  { id: 'upload', label: 'Enviando para armazenamento seguro...', status: 'pending' },
  { id: 'extensions', label: 'Reativando extensões do navegador...', status: 'pending' },
];

/**
 * Cores da paleta Lexato
 * NUNCA usar azul - sempre verde
 */
const COLORS = {
  greenBright: '#00DEA5',   // Caribbean Green - destaques, CTAs
  greenMid: '#009978',      // Paolo Veronese - links, hover
  greenDeep: '#064033',     // Sherwood - botões primários
  bgPrimary: '#0F0E10',     // Onyx - background principal
  bgSecondary: '#161519',   // Vulcan - cards
  bgTertiary: '#1E1D21',    // Eerie Black - elementos terciários
  textPrimary: '#F7F9FB',   // White Lilac
  textSecondary: 'rgba(247, 249, 251, 0.7)',
  textTertiary: 'rgba(247, 249, 251, 0.5)',
  error: '#EF5350',         // Vermelho para erros
  warning: '#FFA726',       // Laranja para avisos
} as const;

// ============================================================================
// Ícones SVG
// ============================================================================

/**
 * Ícone de check (✓) para etapas concluídas
 */
function CheckIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Ícone de spinner (⟳) para etapas em progresso
 */
function SpinnerIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="1s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

/**
 * Ícone de círculo vazio (○) para etapas pendentes
 */
function PendingIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" strokeOpacity="0.4" />
    </svg>
  );
}

/**
 * Ícone de erro (✗) para etapas com falha
 */
function ErrorIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.error} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

/**
 * Ícone de escudo para o header
 */
function ShieldIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/**
 * Ícone de retry
 */
function RetryIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

// ============================================================================
// Componentes Internos
// ============================================================================

/**
 * Props do componente StepItem
 */
interface StepItemProps {
  step: ProcessingStep;
  isLast: boolean;
}

/**
 * Componente de item de etapa
 * Exibe uma etapa com seu indicador de status
 */
function StepItem({ step, isLast }: StepItemProps): React.ReactElement {
  /**
   * Retorna o ícone apropriado para o status da etapa
   */
  const getStatusIcon = (): React.ReactElement => {
    switch (step.status) {
      case 'completed':
        return <CheckIcon />;
      case 'in_progress':
        return <SpinnerIcon />;
      case 'error':
        return <ErrorIcon />;
      default:
        return <PendingIcon />;
    }
  };

  /**
   * Retorna a cor do ícone baseado no status
   */
  const getStatusColor = (): string => {
    switch (step.status) {
      case 'completed':
        return COLORS.greenBright;
      case 'in_progress':
        return COLORS.greenBright;
      case 'error':
        return COLORS.error;
      default:
        return COLORS.textTertiary;
    }
  };

  /**
   * Retorna a opacidade do texto baseado no status
   */
  const getTextOpacity = (): number => {
    switch (step.status) {
      case 'completed':
      case 'in_progress':
        return 1;
      case 'error':
        return 1;
      default:
        return 0.5;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        paddingBottom: isLast ? 0 : '0.75rem',
      }}
      data-testid={`step-${step.id}`}
      data-status={step.status}
    >
      {/* Indicador de status */}
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            step.status === 'completed'
              ? 'rgba(0, 222, 165, 0.15)'
              : step.status === 'in_progress'
                ? 'rgba(0, 222, 165, 0.1)'
                : step.status === 'error'
                  ? 'rgba(239, 83, 80, 0.15)'
                  : 'rgba(255, 255, 255, 0.05)',
          color: getStatusColor(),
          flexShrink: 0,
          transition: 'all 300ms ease',
          boxShadow:
            step.status === 'completed' || step.status === 'in_progress'
              ? `0 0 8px rgba(0, 222, 165, 0.3)`
              : 'none',
        }}
      >
        {getStatusIcon()}
      </div>

      {/* Texto da etapa */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: step.status === 'in_progress' ? 600 : 400,
            color:
              step.status === 'error'
                ? COLORS.error
                : step.status === 'in_progress'
                  ? COLORS.textPrimary
                  : COLORS.textSecondary,
            opacity: getTextOpacity(),
            transition: 'all 300ms ease',
            lineHeight: 1.5,
          }}
        >
          {step.label}
        </p>

        {/* Mensagem de erro (se houver) */}
        {step.status === 'error' && step.errorMessage && (
          <p
            style={{
              margin: '0.25rem 0 0 0',
              fontSize: '0.75rem',
              color: COLORS.error,
              opacity: 0.9,
            }}
          >
            {step.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Props do componente ProgressBar
 */
interface ProgressBarProps {
  percent: number;
  hasError: boolean;
}

/**
 * Componente de barra de progresso
 */
function ProgressBar({ percent, hasError }: ProgressBarProps): React.ReactElement {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div
      style={{
        width: '100%',
        marginBottom: '1.5rem',
      }}
      role="progressbar"
      aria-valuenow={clampedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progresso: ${Math.round(clampedPercent)}%`}
      data-testid="progress-bar"
    >
      {/* Label de progresso */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            color: COLORS.textTertiary,
          }}
        >
          Progresso geral
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: hasError ? COLORS.error : COLORS.greenBright,
            fontWeight: 600,
            fontFamily: "'Fira Code', monospace",
          }}
        >
          {Math.round(clampedPercent)}%
        </span>
      </div>

      {/* Barra de progresso */}
      <div
        style={{
          height: '6px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${clampedPercent}%`,
            background: hasError
              ? `linear-gradient(90deg, ${COLORS.error}, #dc2626)`
              : `linear-gradient(90deg, ${COLORS.greenMid}, ${COLORS.greenBright})`,
            borderRadius: '3px',
            transition: 'width 300ms ease-out',
            boxShadow: hasError
              ? `0 0 10px rgba(239, 83, 80, 0.5)`
              : `0 0 10px rgba(0, 222, 165, 0.5)`,
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Overlay de Processamento Pós-Captura
 *
 * Exibe o progresso do processamento após a captura de evidência.
 * Bloqueia interação com a página durante o processamento.
 *
 * @see Requirements 1: Processing Overlay Post-Capture
 * @see Requirements 1.7: Prevent user interaction during processing
 * @see Requirements 1.8: Display error message with retry option
 */
export default function ProcessingOverlay({
  evidenceId,
  steps,
  progress,
  onRetry,
  error,
  visible = true,
}: ProcessingOverlayProps): React.ReactElement | null {
  // Estado para animação de entrada
  const [isAnimating, setIsAnimating] = useState(false);

  // Efeito para animação de entrada
  useEffect(() => {
    if (visible) {
      // Pequeno delay para trigger da animação
      const timer = setTimeout(() => setIsAnimating(true), 50);
      return () => clearTimeout(timer);
    }
    setIsAnimating(false);
    return undefined;
  }, [visible]);

  /**
   * Handler para o botão de retry
   */
  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
    }
  }, [onRetry]);

  /**
   * Bloqueia eventos de teclado durante processamento
   * @see Requirements 1.7: Prevent user interaction during processing
   */
  useEffect(() => {
    if (!visible) {
      return;
    }

    const blockKeyboard = (e: KeyboardEvent) => {
      // Permite apenas ESC para acessibilidade
      if (e.key !== 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const blockMouse = (e: MouseEvent) => {
      // Bloqueia cliques fora do overlay
      const target = e.target as HTMLElement;
      if (!target.closest('[data-processing-overlay]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', blockKeyboard, true);
    document.addEventListener('click', blockMouse, true);
    document.addEventListener('contextmenu', blockMouse, true);

    return () => {
      document.removeEventListener('keydown', blockKeyboard, true);
      document.removeEventListener('click', blockMouse, true);
      document.removeEventListener('contextmenu', blockMouse, true);
    };
  }, [visible]);

  // Não renderiza se não estiver visível
  if (!visible) {
    return null;
  }

  const hasError = error !== null && error !== undefined;

  return (
    <div
      data-processing-overlay
      data-testid="processing-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 14, 16, 0.95)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: PROCESSING_OVERLAY_Z_INDEX,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        opacity: isAnimating ? 1 : 0,
        transition: 'opacity 300ms ease',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="processing-title"
      aria-describedby="processing-description"
    >
      {/* Container principal */}
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '2rem',
          background: 'rgba(22, 21, 25, 0.8)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 222, 165, 0.1)',
          transform: isAnimating ? 'scale(1)' : 'scale(0.95)',
          transition: 'transform 300ms ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: hasError
                ? 'rgba(239, 83, 80, 0.15)'
                : `linear-gradient(135deg, ${COLORS.greenDeep}, ${COLORS.greenMid})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: hasError ? COLORS.error : COLORS.greenBright,
              boxShadow: hasError
                ? '0 0 15px rgba(239, 83, 80, 0.3)'
                : '0 0 15px rgba(0, 222, 165, 0.3)',
              flexShrink: 0,
            }}
          >
            <ShieldIcon />
          </div>
          <div>
            <h2
              id="processing-title"
              style={{
                margin: 0,
                fontSize: '1.125rem',
                fontWeight: 700,
                color: COLORS.textPrimary,
              }}
            >
              {hasError ? 'Erro no Processamento' : 'Processando Evidência'}
            </h2>
            <p
              id="processing-description"
              style={{
                margin: '0.25rem 0 0 0',
                fontSize: '0.75rem',
                color: COLORS.textTertiary,
                fontFamily: "'Fira Code', monospace",
              }}
            >
              ID: {evidenceId.substring(0, 8)}...
            </p>
          </div>
        </div>

        {/* Barra de progresso */}
        <ProgressBar percent={progress} hasError={hasError} />

        {/* Lista de etapas */}
        <div
          style={{
            marginBottom: hasError && error?.retryable ? '1.5rem' : 0,
          }}
        >
          {steps.map((step, index) => (
            <StepItem key={step.id} step={step} isLast={index === steps.length - 1} />
          ))}
        </div>

        {/* Mensagem de erro e botão de retry */}
        {hasError && error?.retryable && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: 'rgba(239, 83, 80, 0.1)',
              border: `1px solid ${COLORS.error}`,
              borderRadius: '8px',
            }}
            data-testid="error-container"
          >
            <p
              style={{
                margin: '0 0 0.75rem 0',
                fontSize: '0.875rem',
                color: COLORS.error,
              }}
            >
              {error.message}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              data-testid="retry-button"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.75rem',
                background: `linear-gradient(135deg, ${COLORS.greenDeep}, ${COLORS.greenMid})`,
                color: COLORS.textPrimary,
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 200ms ease',
                boxShadow: '0 0 10px rgba(0, 222, 165, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 222, 165, 0.5)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 222, 165, 0.3)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <RetryIcon />
              Tentar Novamente
            </button>
          </div>
        )}

        {/* Footer */}
        <p
          style={{
            textAlign: 'center',
            fontSize: '0.6875rem',
            color: COLORS.textTertiary,
            marginTop: '1.5rem',
            marginBottom: 0,
          }}
        >
          Lexato - Processamento Seguro de Evidencias
        </p>
      </div>

      {/* Estilos de animação */}
      <style>{`
        @keyframes processingPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { COLORS as PROCESSING_OVERLAY_COLORS };
