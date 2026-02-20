/**
 * Lista de capturas recentes do Side Panel Lexato
 *
 * Exibe histórico de capturas com status de cada uma.
 * Migrado de popup/components/RecentCaptures.tsx para o Side Panel.
 *
 * Requisitos atendidos:
 * - 2.3: Navegação interna entre seções (RecentCaptures)
 *
 * @module RecentCaptures
 */

import React from 'react';
import { useCapture } from '../../hooks/useCapture';
import type { CaptureData, CaptureStatus } from '../../../types/capture.types';
import { PageDescriptionHeader } from '../../../components/shared/PageDescriptionHeader';

/**
 * Configuração de status para exibição
 */
interface StatusConfig {
  /** Label do status */
  label: string;
  /** Classe CSS do badge */
  badgeClass: string;
  /** Ícone do status */
  icon: string;
}

/**
 * Mapeamento de status para configuração de exibição
 */
const STATUS_CONFIG: Record<CaptureStatus, StatusConfig> = {
  // Status iniciais
  initializing: {
    label: 'Iniciando',
    badgeClass: 'badge-info',
    icon: '',
  },
  lockdown_active: {
    label: 'Protegendo',
    badgeClass: 'badge-info',
    icon: '',
  },
  capturing: {
    label: 'Capturando',
    badgeClass: 'badge-info',
    icon: '',
  },
  // Status de timestamp (Pipeline Fase 2)
  timestamping: {
    label: 'Carimbando',
    badgeClass: 'badge-info',
    icon: '',
  },
  timestamp_fallback: {
    label: 'Carimbo Local',
    badgeClass: 'badge-warning',
    icon: '',
  },
  timestamp_failed: {
    label: 'Carimbo Falhou',
    badgeClass: 'badge-error',
    icon: '',
  },
  // Status de upload (Pipeline Fase 3)
  uploading: {
    label: 'Enviando',
    badgeClass: 'badge-info',
    icon: '',
  },
  // Status de preview (Pipeline Fase 4)
  pending_review: {
    label: 'Aguardando Revisão',
    badgeClass: 'badge-warning',
    icon: '',
  },
  approved: {
    label: 'Aprovado',
    badgeClass: 'badge-success',
    icon: '',
  },
  discarded: {
    label: 'Descartado',
    badgeClass: 'badge-neutral',
    icon: '',
  },
  expired: {
    label: 'Expirado',
    badgeClass: 'badge-error',
    icon: '',
  },
  // Status de blockchain (Pipeline Fase 5)
  registering_blockchain: {
    label: 'Registrando Blockchain',
    badgeClass: 'badge-info',
    icon: '',
  },
  blockchain_partial: {
    label: 'Blockchain Parcial',
    badgeClass: 'badge-warning',
    icon: '',
  },
  blockchain_complete: {
    label: 'Blockchain OK',
    badgeClass: 'badge-success',
    icon: '',
  },
  blockchain_failed: {
    label: 'Blockchain Falhou',
    badgeClass: 'badge-error',
    icon: '',
  },
  // Status de certificado (Pipeline Fase 6)
  generating_pdf: {
    label: 'Gerando PDF',
    badgeClass: 'badge-info',
    icon: '',
  },
  certified: {
    label: 'Certificado',
    badgeClass: 'badge-success',
    icon: '',
  },
  pdf_failed: {
    label: 'PDF Falhou',
    badgeClass: 'badge-error',
    icon: '',
  },
  // Status finais
  processing: {
    label: 'Processando',
    badgeClass: 'badge-warning',
    icon: '',
  },
  completed: {
    label: 'Concluído',
    badgeClass: 'badge-success',
    icon: '',
  },
  failed: {
    label: 'Falhou',
    badgeClass: 'badge-error',
    icon: '',
  },
};

/**
 * Ícone SVG de câmera para screenshot
 */
function CameraIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/**
 * Ícone SVG de vídeo
 */
function VideoIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

/**
 * Ícone SVG de link externo
 */
function ExternalLinkIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/**
 * Formata timestamp para exibição relativa
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Agora';
  }

  if (diffMins < 60) {
    return `${diffMins} min atrás`;
  }

  if (diffHours < 24) {
    return `${diffHours}h atrás`;
  }

  if (diffDays < 7) {
    return `${diffDays}d atrás`;
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * Trunca URL para exibição compacta
 */
function truncateUrl(url: string, maxLength = 40): string {
  try {
    const urlObj = new URL(url);
    const display = urlObj.hostname + urlObj.pathname;
    if (display.length <= maxLength) {
      return display;
    }
    return display.substring(0, maxLength - 3) + '...';
  } catch {
    if (url.length <= maxLength) {
      return url;
    }
    return url.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Item de captura individual
 */
interface CaptureItemProps {
  capture: CaptureData;
}

function CaptureItem({ capture }: CaptureItemProps): React.ReactElement {
  const statusConfig = STATUS_CONFIG[capture.status];

  /**
   * Abre o dashboard com a captura
   */
  const handleOpenDashboard = (): void => {
    const dashboardUrl = `https://app.lexato.com.br/dashboard/evidencias/${capture.id}`;
    chrome.tabs.create({ url: dashboardUrl });
  };

  return (
    <div className="flex items-start gap-3 rounded-lg bg-dark-800 p-3">
      {/* Ícone do tipo */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dark-700 text-dark-300">
        {capture.type === 'screenshot' ? <CameraIcon /> : <VideoIcon />}
      </div>

      {/* Informações */}
      <div className="min-w-0 flex-1">
        {/* Título e status */}
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-dark-100" title={capture.title}>
            {capture.title || 'Sem título'}
          </span>
          <span className={`badge shrink-0 ${statusConfig.badgeClass}`}>
            {statusConfig.label}
          </span>
        </div>

        {/* URL */}
        <p className="mt-0.5 truncate text-xs text-dark-400" title={capture.url}>
          {truncateUrl(capture.url)}
        </p>

        {/* Timestamp e ações */}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-dark-500">{formatTimestamp(capture.timestamp)}</span>

          {/* Botão para abrir no dashboard (apenas se concluído) */}
          {capture.status === 'completed' && (
            <button
              type="button"
              onClick={handleOpenDashboard}
              className="flex items-center gap-1 text-xs text-lexato-400 hover:text-lexato-300"
            >
              Ver detalhes
              <ExternalLinkIcon />
            </button>
          )}

          {/* Mensagem de erro */}
          {capture.status === 'failed' && capture.error && (
            <span className="text-xs text-error" title={capture.error}>
              {capture.error.length > 30 ? capture.error.substring(0, 30) + '...' : capture.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Componente de capturas recentes para o Side Panel
 *
 * Funcionalidades:
 * - Lista capturas recentes do usuário
 * - Exibe status de cada captura com ícones SVG
 * - Link para abrir no dashboard
 * - Layout responsivo (sem dimensões fixas do popup)
 */
export default function RecentCaptures(): React.ReactElement {
  const { recentCaptures, isLoadingRecent, refreshRecentCaptures } = useCapture();
  
  // Efeito para recarregar dados ao montar
  React.useEffect(() => {
    refreshRecentCaptures();
  }, [refreshRecentCaptures]);

  // Estado de carregamento
  if (isLoadingRecent) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-dark-200">Capturas recentes</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-loading h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Sem capturas
  if (recentCaptures.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-dark-200">Capturas recentes</h3>
        <div className="rounded-lg bg-dark-800 p-4 text-center">
          <p className="text-sm text-dark-400">Nenhuma captura recente</p>
          <p className="mt-1 text-xs text-dark-500">
            Suas capturas aparecerão aqui
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <PageDescriptionHeader
          title="Capturas Recentes"
          subtitle="Seu histórico de provas"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <a
          href="https://app.lexato.com.br/dashboard/evidencias"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-lexato-400 hover:text-lexato-300"
          style={{ marginTop: '-24px' }}
        >
          Ver todas
          <ExternalLinkIcon />
        </a>
      </div>

      <div className="space-y-2">
        {recentCaptures.slice(0, 10).map((capture) => (
          <CaptureItem key={capture.id} capture={capture} />
        ))}
      </div>
    </div>
  );
}
