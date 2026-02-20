/**
 * Modal Imersivo de Progresso de Captura
 *
 * Exibe um overlay fullscreen durante a captura de screenshot,
 * mostrando cada etapa do processo de forma detalhada para o usuário.
 *
 * Migrado de popup/components/CaptureProgressModal.tsx para sidepanel
 * com layout responsivo (sem dimensões fixas do popup).
 *
 * Requisitos atendidos:
 * - 2.6: Exibir modal de progresso dentro do Side Panel
 * - 4.6: Exibir progresso durante captura ativa
 *
 * @module CaptureProgressModal
 */

import React, { useMemo } from 'react';
import type { ScreenshotCaptureProgress, ScreenshotCaptureStage } from '../../../types/capture.types';
import { useSmoothProgress } from '../../../hooks/useSmoothProgress';

// =============================================================================
// TIPOS
// =============================================================================

interface CaptureProgressModalProps {
  /** Dados de progresso da captura */
  progress: ScreenshotCaptureProgress;
  /** Callback para cancelar captura */
  onCancel?: () => void;
}

interface StageInfo {
  /** Título do estágio */
  title: string;
  /** Descrição detalhada */
  description: string;
  /** Ícone SVG */
  icon: React.ReactNode;
  /** Cor do ícone (classe Tailwind) */
  color: string;
}

// =============================================================================
// ÍCONES SVG
// =============================================================================

function ShieldIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function RefreshIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function ClockIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CameraIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}

function PuzzleIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
    </svg>
  );
}

function HashIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
    </svg>
  );
}

function StampIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
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

function ExternalLinkIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
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

function GearIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" />
    </svg>
  );
}

// =============================================================================
// CONFIGURAÇÃO DOS ESTÁGIOS
// =============================================================================

const STAGE_INFO: Record<ScreenshotCaptureStage, StageInfo> = {
  initializing: {
    title: 'Iniciando',
    description: 'Preparando ambiente para captura...',
    icon: <GearIcon />,
    color: 'text-emerald-300',
  },
  lockdown: {
    title: 'Isolando ambiente',
    description: 'Garantindo integridade da captura...',
    icon: <ShieldIcon />,
    color: 'text-emerald-400',
  },
  reload: {
    title: 'Sincronizando conteúdo',
    description: 'Obtendo estado atual da página...',
    icon: <RefreshIcon />,
    color: 'text-emerald-400',
  },
  waiting_resources: {
    title: 'Carregando recursos',
    description: 'Aguardando elementos da página...',
    icon: <ClockIcon />,
    color: 'text-emerald-500',
  },
  capturing: {
    title: 'Capturando',
    description: 'Registrando conteúdo da página...',
    icon: <CameraIcon />,
    color: 'text-[#00DEA5]',
  },
  stitching: {
    title: 'Processando imagem',
    description: 'Montando captura completa...',
    icon: <PuzzleIcon />,
    color: 'text-emerald-500',
  },
  hashing: {
    title: 'Gerando hash SHA-256',
    description: 'Criando assinatura digital única...',
    icon: <HashIcon />,
    color: 'text-[#009978]',
  },
  timestamp: {
    title: 'Selo temporal ICP-Brasil',
    description: 'Certificando data e hora...',
    icon: <StampIcon />,
    color: 'text-[#009978]',
  },
  uploading: {
    title: 'Enviando',
    description: 'Transferindo para servidor seguro...',
    icon: <CloudUploadIcon />,
    color: 'text-emerald-600',
  },
  opening_preview: {
    title: 'Finalizando',
    description: 'Preparando visualização...',
    icon: <ExternalLinkIcon />,
    color: 'text-emerald-600',
  },
  complete: {
    title: 'Concluído',
    description: 'Captura realizada com sucesso.',
    icon: <CheckCircleIcon />,
    color: 'text-[#00DEA5]',
  },
};

// Mapeamento de cores CSS (Tailwind não gera classes dinâmicas em runtime)
const STAGE_COLORS: Record<ScreenshotCaptureStage, string> = {
  initializing: '#6ee7b7',
  lockdown: '#34d399',
  reload: '#34d399',
  waiting_resources: '#10b981',
  capturing: '#00DEA5',
  stitching: '#10b981',
  hashing: '#009978',
  timestamp: '#009978',
  uploading: '#059669',
  opening_preview: '#059669',
  complete: '#00DEA5',
};

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================

/**
 * Spinner animado central
 */
function CentralSpinner({ color }: { color: string }): React.ReactElement {
  return (
    <div className={`relative ${color}`}>
      {/* Círculo externo pulsante */}
      <div className="absolute inset-0 animate-ping opacity-20">
        <svg viewBox="0 0 100 100" className="w-24 h-24">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      {/* Círculo rotativo */}
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
// COMPONENTE PRINCIPAL
// =============================================================================

/**
 * Modal Imersivo de Progresso de Captura (Side Panel)
 *
 * Adaptado para funcionar dentro do Side Panel:
 * - Usa layout responsivo (width: 100%, sem dimensões fixas)
 * - Ocupa toda a área disponível do painel
 * - Aviso atualizado para contexto do Side Panel
 */
export default function CaptureProgressModal({
  progress,
  onCancel,
}: CaptureProgressModalProps): React.ReactElement {
  const { stage, percent, message, currentViewport, totalViewports, disabledExtensions, uploadedBytes, totalBytes } = progress;
  const stageInfo = STAGE_INFO[stage];

  // Configuração específica por estágio para progresso automático
  const autoProgressConfig = useMemo(() => {
    const slowStages: ScreenshotCaptureStage[] = ['timestamp', 'opening_preview'];
    const mediumStages: ScreenshotCaptureStage[] = ['waiting_resources', 'stitching', 'hashing'];
    const fastStages: ScreenshotCaptureStage[] = ['initializing', 'lockdown', 'reload'];

    if (slowStages.includes(stage)) {
      return {
        autoProgressSpeed: 2,
        autoProgressMax: Math.min(percent + 20, 95),
        enableAutoProgress: true,
        minAnimationDuration: 200,
        maxAnimationDuration: 1500,
      };
    } else if (mediumStages.includes(stage)) {
      return {
        autoProgressSpeed: 4,
        autoProgressMax: Math.min(percent + 25, 95),
        enableAutoProgress: true,
        minAnimationDuration: 200,
        maxAnimationDuration: 1500,
      };
    } else if (fastStages.includes(stage)) {
      return {
        autoProgressSpeed: 6,
        autoProgressMax: Math.min(percent + 30, 95),
        enableAutoProgress: true,
        minAnimationDuration: 150,
        maxAnimationDuration: 1000,
      };
    } else if (stage === 'uploading') {
      return {
        autoProgressSpeed: 1.5,
        autoProgressMax: Math.min(percent + 40, 85),
        enableAutoProgress: true,
        minAnimationDuration: 300,
        maxAnimationDuration: 2000,
      };
    } else if (stage === 'capturing') {
      const calculatedPercent = currentViewport && totalViewports
        ? Math.round((currentViewport / totalViewports) * 100)
        : percent;
      return {
        autoProgressSpeed: 3,
        autoProgressMax: Math.min(calculatedPercent + 15, 30),
        enableAutoProgress: true,
        minAnimationDuration: 200,
        maxAnimationDuration: 1500,
      };
    }

    return {
      autoProgressSpeed: 3,
      autoProgressMax: 90,
      enableAutoProgress: stage !== 'complete',
      minAnimationDuration: 200,
      maxAnimationDuration: 1500,
    };
  }, [stage, percent, currentViewport, totalViewports]);

  // Usar progresso suave com incremento automático
  const smoothProgress = useSmoothProgress(percent, autoProgressConfig);
  const animatedPercent = smoothProgress.percent;

  // Informações extras contextuais
  const extraInfo = useMemo(() => {
    if (stage === 'lockdown' && disabledExtensions !== undefined) {
      return `${disabledExtensions} extensões isoladas`;
    }
    if (stage === 'capturing' && currentViewport && totalViewports) {
      return `Viewport ${currentViewport} de ${totalViewports}`;
    }
    if (stage === 'stitching' && currentViewport && totalViewports) {
      return `Processando ${currentViewport} de ${totalViewports}`;
    }
    if (stage === 'uploading' && uploadedBytes !== undefined && totalBytes) {
      const uploadedMB = (uploadedBytes / 1024 / 1024).toFixed(1);
      const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
      return `${uploadedMB} MB / ${totalMB} MB`;
    }
    return null;
  }, [stage, disabledExtensions, currentViewport, totalViewports, uploadedBytes, totalBytes]);

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
      {/* Gradiente de fundo sutil */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, #0a0a0b, #111113 50%, #0a0a0b)',
        }}
      />

      {/* Conteúdo Principal */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pb-4">
        {/* Área central */}
        <div className="flex flex-col items-center text-center max-w-xs">
          {/* Spinner com ícone */}
          <div className="relative mb-6">
            <CentralSpinner color={stageInfo.color} />
            {/* Ícone do estágio centralizado */}
            <div className={`absolute inset-0 flex items-center justify-center ${stageInfo.color}`}>
              {stageInfo.icon}
            </div>
          </div>

          {/* Título do estágio */}
          <h2 className={`text-xl font-bold mb-2 ${stageInfo.color}`}>
            {stageInfo.title}
          </h2>

          {/* Descrição */}
          <p className="text-dark-300 text-sm mb-2">
            {stageInfo.description}
          </p>

          {/* Mensagem dinâmica */}
          {message && message !== stageInfo.description && (
            <p className="text-dark-400 text-xs mb-2">
              {message}
            </p>
          )}

          {/* Info extra contextual */}
          {extraInfo && (
            <div className="flex items-center gap-2 text-xs mb-4" style={{ color: '#9ca3af' }}>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: STAGE_COLORS[stage] }}
              />
              {extraInfo}
            </div>
          )}

          {/* Barra de progresso */}
          <div className="w-full max-w-[200px] mb-4">
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: '#1f1f23' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${animatedPercent}%`,
                  backgroundColor: STAGE_COLORS[stage],
                  transition: 'width 0.3s ease-out',
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px]" style={{ color: '#6b7280' }}>Progresso</span>
              <span className="text-[10px] font-mono" style={{ color: '#9ca3af' }}>{animatedPercent}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer fixo */}
      <div className="relative px-6 pb-6 space-y-3">
        {/* Aviso importante - adaptado para Side Panel */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2">
          <p className="text-amber-400 text-xs text-center font-medium">
            Não feche este painel durante a captura
          </p>
          <p className="text-amber-400/70 text-[10px] text-center mt-0.5">
            Fechar interromperá o processo e você precisará recomeçar
          </p>
        </div>

        {/* Botão cancelar */}
        {onCancel && stage !== 'complete' && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 px-4 rounded-lg bg-dark-700/50 hover:bg-dark-700 border border-dark-600 text-dark-300 hover:text-white text-sm transition-all"
          >
            Cancelar Captura
          </button>
        )}
      </div>
    </div>
  );
}
