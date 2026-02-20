
import React, { useMemo } from 'react';

// =============================================================================
// ÍCONES (Reutilizados de CaptureProgressModal)
// =============================================================================

function ShieldIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function CloudUploadIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
    </svg>
  );
}

function CheckCircleIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function XCircleIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function GearIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" />
    </svg>
  );
}

function VideoIcon(): React.ReactElement {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
         <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
      </svg>
    )
}


function CentralSpinner({ color }: { color: string }): React.ReactElement {
  return (
    <div className={`relative ${color}`}>
      <div className="absolute inset-0 animate-ping opacity-20">
        <svg viewBox="0 0 100 100" className="w-24 h-24">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <svg viewBox="0 0 100 100" className="w-24 h-24 animate-spin" style={{ animationDuration: '2s' }}>
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="200"
          strokeDashoffset="150"
          className="opacity-30"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="70"
          strokeDashoffset="0"
        />
      </svg>
    </div>
  );
}

// =============================================================================
// COMPONENTE
// =============================================================================

export interface UnifiedProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  subSteps?: { id: string; label: string; status: 'pending' | 'active' | 'completed' }[];
}

interface UnifiedCaptureProgressProps {
  title: string;
  description: string;
  /** Ícone principal (opcional, defaults based on state) */
  icon?: React.ReactNode;
  /** Porcentagem (0-100). Se undefined, modo indeterminado ou oculto dependendo do contexto */
  percent?: number | undefined;
  /** Passos detalhados */
  steps?: UnifiedProgressStep[];
  /** Fase atual (para cores/ícones default) */
  phase: 'initializing' | 'preparing' | 'recording' | 'finalizing' | 'success' | 'error';
  onCancel?: (() => void) | undefined;
  cancelLabel?: string;
}

export function UnifiedCaptureProgress({
  title,
  description,
  icon,
  percent,
  steps,
  phase,
  onCancel,
  cancelLabel = 'Cancelar'
}: UnifiedCaptureProgressProps): React.ReactElement {
  
  const theme = useMemo(() => {
    switch (phase) {
      case 'initializing':
      case 'preparing':
         return { color: 'text-emerald-400', hex: '#34d399', icon: <ShieldIcon /> };
      case 'recording':
         return { color: 'text-emerald-500', hex: '#10b981', icon: <VideoIcon /> };
      case 'finalizing':
         return { color: 'text-emerald-500', hex: '#10b981', icon: <CloudUploadIcon /> };
      case 'success':
         return { color: 'text-[#00DEA5]', hex: '#00DEA5', icon: <CheckCircleIcon /> };
      case 'error':
         return { color: 'text-red-500', hex: '#ef4444', icon: <XCircleIcon /> };
      default:
         return { color: 'text-emerald-500', hex: '#10b981', icon: <GearIcon /> };
    }
  }, [phase]);

  const displayIcon = icon || theme.icon;

  return (
    <div
      className="flex flex-col"
      style={{
        zIndex: 99999,
        backgroundColor: '#0a0a0b',
        width: '100%',
        height: '100%',
        minWidth: '360px',
        position: 'absolute',
        inset: 0,
      }}
    >
      {/* Background Gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, #0a0a0b, #111113 50%, #0a0a0b)',
        }}
      />

      {/* Conteúdo Principal */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pb-4 overflow-y-auto">
        {/* Área central */}
        <div className="flex flex-col items-center text-center w-full max-w-xs">
          {/* Spinner Central */}
          <div className="relative mb-6">
            {phase === 'success' || phase === 'error' ? (
                // Ícone estático para sucesso/erro
                <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
                    phase === 'success' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                }`}>
                    <div className={theme.color}>
                        {displayIcon}
                    </div>
                </div>
            ) : (
                <>
                    <CentralSpinner color={theme.color} />
                    <div className={`absolute inset-0 flex items-center justify-center ${theme.color}`}>
                        {displayIcon}
                    </div>
                </>
            )}
          </div>

          <h2 className={`text-xl font-bold mb-2 ${theme.color}`}>
            {title}
          </h2>
          <p className="text-dark-300 text-sm mb-6">
            {description}
          </p>

          {/* Barra de Progresso (se aplicável) */}
          {percent !== undefined && (
            <div className="w-full max-w-[200px] mb-6">
              <div className="h-2 rounded-full overflow-hidden bg-[#1f1f23]">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: theme.hex,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-zinc-500">Progresso</span>
                <span className="text-[10px] font-mono text-zinc-400">{Math.round(percent)}%</span>
              </div>
            </div>
          )}

          {/* Lista de Passos */}
          {steps && steps.length > 0 && (
            <div className="w-full space-y-2 text-left">
              {steps.map((step) => {
                const isCompleted = step.status === 'completed';
                const isActive = step.status === 'active';
                const isPending = step.status === 'pending';

                return (
                  <div
                    key={step.id}
                    className={`rounded-xl p-3 border transition-all ${
                      isCompleted
                        ? 'bg-emerald-900/10 border-emerald-500/20'
                        : isActive
                          ? 'bg-zinc-800/50 border-emerald-500/20'
                          : 'bg-zinc-800/20 border-zinc-700/30 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                         isCompleted
                           ? 'bg-emerald-500 text-white'
                           : isActive
                             ? 'bg-emerald-500/20 text-emerald-400'
                             : 'bg-zinc-700/50 text-zinc-500'
                      }`}>
                         {isCompleted ? (
                           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                         ) : isActive ? (
                           <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                         ) : (
                           <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                         )}
                      </div>
                      <span className={`text-sm font-medium ${
                        isCompleted ? 'text-emerald-400' : isActive ? 'text-white' : 'text-zinc-500'
                      }`}>
                        {step.label}
                      </span>
                    </div>

                    {/* Sub-steps */}
                    {step.subSteps && isActive && (
                        <div className="ml-8 mt-2 space-y-1">
                            {step.subSteps.map(sub => (
                                <p key={sub.id} className="text-xs text-zinc-400 flex items-center gap-2">
                                    <span className={`w-1 h-1 rounded-full ${
                                        sub.status === 'completed' ? 'bg-emerald-500' : 
                                        sub.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                                    }`} />
                                    <span className={sub.status === 'active' ? 'text-emerald-300' : ''}>
                                        {sub.label}
                                    </span>
                                </p>
                            ))}
                        </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Fixo */}
      <div className="relative px-6 pb-6 space-y-3">
        {phase !== 'success' && phase !== 'error' && (
             <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2">
                <p className="text-amber-400 text-xs text-center font-medium">
                    Não feche este painel
                </p>
            </div>
        )}

        {onCancel && phase !== 'success' && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white text-sm transition-all"
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
