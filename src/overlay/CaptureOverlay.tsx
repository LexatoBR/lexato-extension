/**
 * Overlay de Captura da Extensão Lexato
 * 
 * Requisitos atendidos:
 * - 1.1-1.10: Paleta de cores verde (NUNCA azul)
 * - 6.1-6.9: Glassmorfismo com backdrop-filter
 * - 7.3: Indicar que extensões estão temporariamente desativadas
 * - 7.4: Exibir progresso da desativação/restauração
 * 
 * NOTA: VideoControls foi removido como parte do redesign.
 * Os controles de vídeo agora ficam no Side Panel (fora da área capturada).
 * 
 * @module CaptureOverlay
 */

import React from 'react';
import ProgressBar from './ProgressBar';

export const OVERLAY_Z_INDEX = 2147483647;

/** Status do isolamento de extensões */
export type IsolationPhase = 'idle' | 'disabling' | 'active' | 'restoring' | 'restored';

export interface CaptureOverlayProps {
  captureType: 'screenshot' | 'video';
  progress?: number;
  elapsedTime?: number;
  maxTime?: number;
  statusMessage?: string;
  timeWarning?: '5min' | '1min' | '30sec';
  onCancel?: () => void;
  onStop?: () => void;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Fase atual do isolamento de extensões (Requisito 7.3, 7.4) */
  isolationPhase?: IsolationPhase;
  /** Quantidade de extensões desativadas (Requisito 7.3) */
  disabledExtensionsCount?: number;
  /** Contagem regressiva (se > 0, exibe overlay de countdown) */
  countdown?: number;
  /** Estado de gravação (true = gravando, false = idle/preparando) */
  isRecording?: boolean;
  /** Callback para iniciar gravação (do estado idle) */
  onStart?: (() => void) | undefined;
}

/**
 * Estilos base do overlay com glassmorfismo
 * Paleta: Dark Mode + Verde (Caribbean #00DEA5, Paolo Veronese #009978, Sherwood #064033)
 * NUNCA usar azul como cor de destaque
 */
const OVERLAY_BASE_STYLES: React.CSSProperties = {
  position: 'fixed',
  zIndex: OVERLAY_Z_INDEX,
  // Glassmorfismo (Requisito 6.1-6.9)
  background: 'rgba(45, 52, 54, 0.2)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderRadius: '13px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 222, 165, 0.15)',
  border: '1px solid rgba(255, 255, 255, 0.33)',
  padding: '1rem',
  minWidth: '220px',
  maxWidth: '280px',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
};

const POSITION_STYLES: Record<NonNullable<CaptureOverlayProps['position']>, React.CSSProperties> = {
  'bottom-right': { bottom: '1.5rem', right: '1.5rem' },
  'bottom-left': { bottom: '1.5rem', left: '1.5rem' },
  'top-right': { top: '1.5rem', right: '1.5rem' },
  'top-left': { top: '1.5rem', left: '1.5rem' },
};

function CameraIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}



/** Ícone de escudo para isolamento */
function ShieldIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/** Ícone de check para restauração completa */
function CheckIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Obtém mensagem de status do isolamento
 */
function getIsolationStatusMessage(phase: IsolationPhase, count: number): string {
  switch (phase) {
    case 'disabling':
      return 'Desativando extensões...';
    case 'active':
      return `${count} extensão(ões) desativada(s)`;
    case 'restoring':
      return 'Restaurando extensões...';
    case 'restored':
      return 'Extensões restauradas';
    default:
      return '';
  }
}

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
  textPrimary: '#F7F9FB',   // White Lilac
  textSecondary: 'rgba(247, 249, 251, 0.7)',
  textTertiary: 'rgba(247, 249, 251, 0.5)',
  error: '#EF5350',
  warning: '#FFA726',
} as const;

export default function CaptureOverlay({
  captureType, progress = 0,
  statusMessage, onCancel, position = 'bottom-right',
  isolationPhase = 'idle', disabledExtensionsCount = 0,
  countdown = 0,
}: CaptureOverlayProps & { countdown?: number; isRecording?: boolean; onStart?: () => void }): React.ReactElement | null {
  const isVideo = captureType === 'video';
  const containerStyles = { ...OVERLAY_BASE_STYLES, ...POSITION_STYLES[position] };
  const showIsolationStatus = isolationPhase !== 'idle';
  const isolationMessage = getIsolationStatusMessage(isolationPhase, disabledExtensionsCount);

  // Se houver countdown, exibir overlay centralizado
  if (countdown > 0) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: OVERLAY_Z_INDEX + 10,
        fontFamily: "'Fira Code', monospace",
      }}>
        <div style={{
          fontSize: '8rem',
          fontWeight: 700,
          color: COLORS.greenBright,
          textShadow: `0 0 40px ${COLORS.greenBright}`,
          animation: 'countdownPulse 1s ease-in-out infinite',
        }}>
          {countdown}
        </div>
        <div style={{
          position: 'absolute',
          bottom: '30%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <p style={{
            color: COLORS.textPrimary,
            fontSize: '1.25rem',
            fontWeight: 500,
            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
          }}>Preparando ambiente seguro...</p>
          <div style={{
            display: 'flex',
            gap: '1rem',
            color: COLORS.greenBright,
            background: 'rgba(0,0,0,0.3)',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: `1px solid ${COLORS.greenMid}`
          }}>
            <span>✓ Abas fechadas</span>
            <span>✓ Cache limpo</span>
          </div>
        </div>
        <style>{`
          @keyframes countdownPulse {
            0% { transform: scale(0.8); opacity: 0; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // Se for vídeo, não renderizar overlay - os controles agora ficam no Side Panel
  
  if (isVideo) {
    return null;
  }

  return (
    <div style={containerStyles} role="status" aria-live="polite"
      aria-label={'Captura de screenshot em andamento'}
      data-testid="capture-overlay">
      {/* Header com ícone e título */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem',
          borderRadius: '0.5rem',
          backgroundColor: 'rgba(0, 222, 165, 0.15)',
          color: COLORS.greenBright,
          boxShadow: '0 0 12px rgba(0, 222, 165, 0.3)',
        }}>
          <CameraIcon />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: COLORS.textPrimary, margin: 0 }}>
            Capturando página
          </h3>
          {statusMessage && <p style={{ fontSize: '0.75rem', color: COLORS.textSecondary, margin: 0 }}>{statusMessage}</p>}
        </div>
      </div>

      {/* Status de isolamento de extensões (Requisitos 7.3, 7.4) */}
      {showIsolationStatus && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
          padding: '0.5rem', borderRadius: '0.5rem',
          background: isolationPhase === 'restored'
            ? 'rgba(0, 222, 165, 0.1)'
            : 'rgba(0, 222, 165, 0.08)',
          border: `1px solid ${isolationPhase === 'restored'
            ? 'rgba(0, 222, 165, 0.4)'
            : 'rgba(0, 222, 165, 0.25)'}`,
          boxShadow: isolationPhase === 'restored'
            ? '0 0 12px rgba(0, 222, 165, 0.2)'
            : 'none',
        }} data-testid="isolation-status">
          <div style={{
            color: COLORS.greenBright,
            display: 'flex', alignItems: 'center',
          }}>
            {isolationPhase === 'restored' ? <CheckIcon /> : <ShieldIcon />}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{
              fontSize: '0.6875rem', margin: 0,
              color: COLORS.greenBright,
              fontWeight: 500,
            }}>
              {isolationMessage}
            </p>
            {(isolationPhase === 'disabling' || isolationPhase === 'restoring') && (
              <div style={{
                marginTop: '0.25rem', height: '2px',
                background: 'rgba(0, 222, 165, 0.2)',
                borderRadius: '1px', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  background: `linear-gradient(90deg, ${COLORS.greenBright}, ${COLORS.greenMid})`,
                  animation: 'isolationProgress 1.5s ease-in-out infinite',
                  width: '30%',
                  boxShadow: '0 0 8px rgba(0, 222, 165, 0.5)',
                }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Renderização apenas para screenshot - vídeo usa Side Panel */}
      <>
        <div style={{ marginBottom: '0.75rem' }}>
          <ProgressBar percent={progress} showLabel={true} color="green" size="md" />
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label="Cancelar captura"
            style={{
              width: '100%',
              padding: '0.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(4px)',
              color: COLORS.textSecondary,
              fontSize: '0.875rem',
              fontWeight: 500,
              borderRadius: '0.5rem',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
              transition: 'all 200ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.color = COLORS.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = COLORS.textSecondary;
            }}>
            Cancelar
          </button>
        )}
      </>
      <p style={{
        fontSize: '0.6875rem',
        color: COLORS.textTertiary,
        marginTop: '0.75rem',
        marginBottom: 0,
        textAlign: 'center'
      }}>
        [SEGURO] Modo seguro ativo • Pressione <kbd style={{
          backgroundColor: COLORS.bgSecondary,
          padding: '0.125rem 0.25rem',
          borderRadius: '0.25rem',
          fontSize: '0.625rem',
          fontFamily: "'Fira Code', monospace",
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>ESC</kbd> para cancelar
      </p>
      {/* Estilos de animação para progresso de isolamento */}
      <style>{`
        @keyframes isolationProgress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}