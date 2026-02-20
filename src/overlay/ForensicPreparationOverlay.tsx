/**
 * Overlay de Preparação Forense
 *
 * Exibe as etapas de preparação do ambiente forense antes de iniciar
 * a gravação de vídeo. Transmite seriedade e credibilidade através
 * de termos técnicos forenses.
 *
 * Fluxo:
 * 1. Exibe fases de preparação com animações
 * 2. Cada fase mostra etapas sendo executadas
 * 3. Ao completar todas as fases, inicia countdown 3-2-1
 * 4. Gravação inicia automaticamente
 *
 * @module ForensicPreparationOverlay
 */

import React from 'react';

// ============================================================================
// Tipos
// ============================================================================

export interface ForensicStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  errorMessage?: string;
}

export interface ForensicPhase {
  id: string;
  title: string;
  icon: string;
  steps: ForensicStep[];
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface ForensicPreparationOverlayProps {
  /** Fases de preparação com status */
  phases: ForensicPhase[];
  /** Fase atual sendo executada (0-indexed) */
  currentPhaseIndex: number;
  /** Etapa atual dentro da fase */
  currentStepIndex: number;
  /** Countdown final (3, 2, 1, 0) - 0 significa não mostrar */
  countdown: number;
  /** Se a preparação foi concluída */
  isComplete: boolean;
  /** Callback para cancelar */
  onCancel?: () => void;
  /** Mensagem de erro (se houver) */
  errorMessage?: string | undefined;
}

// ============================================================================
// Constantes de Cores (Paleta Lexato - NUNCA azul)
// ============================================================================

const COLORS = {
  greenBright: '#00DEA5',
  greenMid: '#009978',
  greenDeep: '#064033',
  bgPrimary: '#0F0E10',
  bgSecondary: '#161519',
  bgTertiary: '#1E1D21',
  textPrimary: '#F7F9FB',
  textSecondary: 'rgba(247, 249, 251, 0.7)',
  textTertiary: 'rgba(247, 249, 251, 0.5)',
  error: '#EF5350',
  warning: '#FFA726',
} as const;

// ============================================================================
// Ícones SVG
// ============================================================================

function ShieldIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function DocumentIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function NetworkIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function LockIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function VideoIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function ClockIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SpinnerIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function ErrorIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.error} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

// ============================================================================
// Mapeamento de Ícones por Fase
// ============================================================================

const PHASE_ICONS: Record<string, () => React.ReactElement> = {
  isolation: ShieldIcon,
  preservation: DocumentIcon,
  metadata: NetworkIcon,
  integrity: LockIcon,
  recorder: VideoIcon,
  timestamp: ClockIcon,
};

// ============================================================================
// Componentes Internos
// ============================================================================

interface StepItemProps {
  step: ForensicStep;
  /** Indica se esta etapa está ativa (reservado para uso futuro) */
  isActive?: boolean;
}

function StepItem({ step, isActive: _isActive }: StepItemProps): React.ReactElement {
  const getStatusIcon = () => {
    switch (step.status) {
      case 'completed':
        return <CheckIcon />;
      case 'running':
        return <SpinnerIcon />;
      case 'error':
        return <ErrorIcon />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (step.status) {
      case 'completed':
        return COLORS.greenBright;
      case 'running':
        return COLORS.greenBright;
      case 'error':
        return COLORS.error;
      default:
        return COLORS.textTertiary;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0',
        opacity: step.status === 'pending' ? 0.4 : 1,
        transition: 'opacity 300ms ease',
      }}
    >
      <div
        style={{
          width: '14px',
          height: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: getStatusColor(),
          flexShrink: 0,
        }}
      >
        {getStatusIcon()}
      </div>
      <span
        style={{
          fontSize: '0.6875rem',
          color: step.status === 'running' ? COLORS.textPrimary : COLORS.textSecondary,
          fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
          fontWeight: step.status === 'running' ? 500 : 400,
          lineHeight: 1.3,
        }}
      >
        {step.label}
      </span>
    </div>
  );
}

interface PhaseCardProps {
  phase: ForensicPhase;
  isActive: boolean;
  isCompleted: boolean;
  currentStepIndex: number;
}

function PhaseCard({ phase, isActive, isCompleted, currentStepIndex }: PhaseCardProps): React.ReactElement {
  const IconComponent = PHASE_ICONS[phase.id] ?? ShieldIcon;

  return (
    <div
      style={{
        background: isActive
          ? 'rgba(0, 222, 165, 0.08)'
          : isCompleted
            ? 'rgba(0, 222, 165, 0.04)'
            : 'rgba(255, 255, 255, 0.02)',
        border: isActive
          ? `1px solid ${COLORS.greenMid}`
          : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '10px',
        padding: '0.75rem',
        transition: 'all 300ms ease',
        boxShadow: isActive ? `0 0 15px rgba(0, 222, 165, 0.15)` : 'none',
        minHeight: isActive ? 'auto' : '60px',
      }}
    >
      {/* Header da Fase */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: isActive ? '0.5rem' : 0,
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: isCompleted
              ? `linear-gradient(135deg, ${COLORS.greenDeep}, ${COLORS.greenMid})`
              : isActive
                ? 'rgba(0, 222, 165, 0.15)'
                : 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isCompleted || isActive ? COLORS.greenBright : COLORS.textTertiary,
            boxShadow: isCompleted ? `0 0 8px rgba(0, 222, 165, 0.3)` : 'none',
            transition: 'all 300ms ease',
            flexShrink: 0,
          }}
        >
          {isCompleted ? <CheckIcon /> : <IconComponent />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: isActive ? COLORS.textPrimary : isCompleted ? COLORS.greenBright : COLORS.textSecondary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {phase.title}
          </h3>
        </div>
        {isCompleted && (
          <div
            style={{
              fontSize: '0.5625rem',
              color: COLORS.greenBright,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              flexShrink: 0,
            }}
          >
            ✓
          </div>
        )}
      </div>

      {/* Etapas (só mostra se fase ativa) */}
      {isActive && (
        <div style={{ marginLeft: '0.125rem' }}>
          {phase.steps.map((step, idx) => (
            <StepItem
              key={step.id}
              step={step}
              isActive={idx === currentStepIndex}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Componente Principal
// ============================================================================

export default function ForensicPreparationOverlay({
  phases,
  currentPhaseIndex,
  currentStepIndex,
  countdown,
  isComplete: _isComplete,
  onCancel,
  errorMessage,
}: ForensicPreparationOverlayProps): React.ReactElement {
  // Calcular progresso geral
  const totalSteps = phases.reduce((acc, p) => acc + p.steps.length, 0);
  const completedSteps = phases.reduce((acc, p, pIdx) => {
    if (pIdx < currentPhaseIndex) {
      return acc + p.steps.length;
    }
    if (pIdx === currentPhaseIndex) {
      return acc + currentStepIndex;
    }
    return acc;
  }, 0);
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Se countdown ativo, mostrar tela de countdown
  if (countdown > 0) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(15, 14, 16, 0.95)',
          backdropFilter: 'blur(8px)',
          zIndex: 2147483647,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {/* Ícone de sucesso */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${COLORS.greenDeep}, ${COLORS.greenMid})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '2rem',
            boxShadow: `0 0 40px rgba(0, 222, 165, 0.4)`,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.greenBright} strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Mensagem */}
        <p
          style={{
            color: COLORS.greenBright,
            fontSize: '1.25rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
            textShadow: `0 0 20px rgba(0, 222, 165, 0.5)`,
          }}
        >
          Ambiente forense preparado
        </p>
        <p
          style={{
            color: COLORS.textSecondary,
            fontSize: '1rem',
            marginBottom: '3rem',
          }}
        >
          Iniciando captura em...
        </p>

        {/* Número do countdown */}
        <div
          style={{
            fontSize: '10rem',
            fontWeight: 700,
            color: COLORS.greenBright,
            textShadow: `0 0 60px ${COLORS.greenBright}`,
            fontFamily: "'Fira Code', monospace",
            lineHeight: 1,
            animation: 'countdownPulse 1s ease-in-out',
          }}
          key={countdown}
        >
          {countdown}
        </div>

        <style>{`
          @keyframes countdownPulse {
            0% { transform: scale(0.5); opacity: 0; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // Tela principal de preparação - Layout compacto sem scroll
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 14, 16, 0.95)',
        backdropFilter: 'blur(8px)',
        zIndex: 2147483647,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: '1rem',
      }}
    >
      {/* Header compacto */}
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${COLORS.greenDeep}, ${COLORS.greenMid})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem',
            boxShadow: `0 0 20px rgba(0, 222, 165, 0.3)`,
          }}
        >
          <ShieldIcon />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 700,
            color: COLORS.textPrimary,
            marginBottom: '0.25rem',
          }}
        >
          Preparação Forense
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            color: COLORS.textSecondary,
          }}
        >
          Estabelecendo ambiente seguro para captura
        </p>
      </div>

      {/* Barra de progresso geral */}
      <div style={{ width: '100%', maxWidth: '520px', marginBottom: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '0.375rem',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: COLORS.textTertiary }}>
            Progresso geral
          </span>
          <span style={{ fontSize: '0.6875rem', color: COLORS.greenBright, fontWeight: 600 }}>
            {progressPercent}%
          </span>
        </div>
        <div
          style={{
            height: '3px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: `linear-gradient(90deg, ${COLORS.greenMid}, ${COLORS.greenBright})`,
              borderRadius: '2px',
              transition: 'width 300ms ease',
              boxShadow: `0 0 10px ${COLORS.greenBright}`,
            }}
          />
        </div>
      </div>

      {/* Grid de Fases - 2 colunas para caber na tela */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.5rem',
          width: '100%',
          maxWidth: '520px',
        }}
      >
        {phases.map((phase, idx) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            isActive={idx === currentPhaseIndex}
            isCompleted={idx < currentPhaseIndex}
            currentStepIndex={idx === currentPhaseIndex ? currentStepIndex : 0}
          />
        ))}
      </div>

      {/* Erro (se houver) */}
      {errorMessage && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            background: 'rgba(239, 83, 80, 0.1)',
            border: `1px solid ${COLORS.error}`,
            borderRadius: '8px',
            color: COLORS.error,
            fontSize: '0.8125rem',
            maxWidth: '520px',
            width: '100%',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Botão Cancelar */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{
            marginTop: '1rem',
            padding: '0.625rem 2rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: COLORS.textSecondary,
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          Cancelar
        </button>
      )}

      {/* Footer */}
      <p
        style={{
          textAlign: 'center',
          fontSize: '0.625rem',
          color: COLORS.textTertiary,
          marginTop: '0.75rem',
        }}
      >
        Lexato • Captura Forense com Validade Jurídica
      </p>
    </div>
  );
}
