/**
 * Componente de Contexto Forense Aprimorado
 *
 * Exibe informações detalhadas de contexto forense durante a gravação,
 * incluindo URL atual, data/hora com timezone, resolução da captura,
 * tipo de conexão e localização.
 *
 * Conformidade ISO 27037:
 * - Registro completo de metadados da evidência
 * - Timestamp com timezone para rastreabilidade
 * - Identificação precisa do recurso capturado
 *
 * @module ForensicContextEnhanced
 * @see ISO/IEC 27037:2012
 */
import React, { useMemo } from 'react';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Contexto forense completo da gravação
 */
export interface EnhancedForensicContext {
  /** URL atual sendo capturada */
  currentUrl: string;
  /** Título da página atual */
  pageTitle?: string;
  /** Timestamp de início (ISO 8601) */
  startedAt: string;
  /** Timezone do usuário (ex: "America/Sao_Paulo") */
  timezone: string;
  /** Offset do timezone (ex: "-03:00") */
  timezoneOffset: string;
  /** Resolução da captura */
  resolution: {
    width: number;
    height: number;
  };
  /** Frame rate da gravação */
  frameRate?: number;
  /** Tipo de conexão */
  connectionType?: string;
  /** Localização (se disponível) */
  location?: string;
  /** User Agent do navegador */
  userAgent?: string;
}

/**
 * Props do componente ForensicContextEnhanced
 */
export interface ForensicContextEnhancedProps {
  /** Contexto forense da gravação */
  context: EnhancedForensicContext | null;
  /** Se deve exibir versão compacta */
  compact?: boolean;
  /** Classes CSS adicionais */
  className?: string;
}

// ============================================================================
// Ícones SVG
// ============================================================================

const Icons = {
  globe: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  calendar: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  monitor: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  wifi: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  ),
  mapPin: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
};

// ============================================================================
// Funções Utilitárias
// ============================================================================

/**
 * Trunca URL para exibição
 */
function truncateUrl(url: string, maxLength: number = 40): string {
  if (url.length <= maxLength) {
    return url;
  }
  
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const path = urlObj.pathname;
    
    if (domain.length + 3 >= maxLength) {
      return domain.substring(0, maxLength - 3) + '...';
    }
    
    const remainingLength = maxLength - domain.length - 3;
    if (path.length > remainingLength) {
      return `${domain}${path.substring(0, remainingLength)}...`;
    }
    
    return `${domain}${path}`;
  } catch {
    return url.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Formata data/hora com timezone
 */
function formatDateTime(isoString: string, timezoneOffset: string): string {
  try {
    const date = new Date(isoString);
    
    const dateFormatted = date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    
    const timeFormatted = date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    
    return `${dateFormatted} ${timeFormatted} (GMT${timezoneOffset})`;
  } catch {
    return isoString;
  }
}

/**
 * Formata resolução
 */
function formatResolution(width: number, height: number, frameRate?: number): string {
  const resolution = `${width}×${height}`;
  if (frameRate) {
    return `${resolution} @ ${frameRate}fps`;
  }
  return resolution;
}

// ============================================================================
// Componente de Item de Contexto
// ============================================================================

interface ContextItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  fullValue?: string | undefined;
  highlight?: boolean | undefined;
}

function ContextItem({ icon, label, value, fullValue, highlight = false }: ContextItemProps): React.ReactElement {
  return (
    <div
      className="flex items-start gap-2 py-1.5"
      title={fullValue ?? value}
    >
      <span className={`shrink-0 mt-0.5 ${highlight ? 'text-emerald-400' : 'text-zinc-500'}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-zinc-500 block">{label}</span>
        <span className={`text-xs break-all ${highlight ? 'text-emerald-300' : 'text-zinc-300'}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Contexto Forense Aprimorado
 *
 * Exibe informações detalhadas de contexto forense durante a gravação,
 * seguindo as diretrizes da ISO 27037 para preservação de evidências digitais.
 *
 * @example
 * ```tsx
 * <ForensicContextEnhanced
 *   context={{
 *     currentUrl: 'https://exemplo.com/pagina',
 *     startedAt: '2026-02-07T14:32:45.000Z',
 *     timezone: 'America/Sao_Paulo',
 *     timezoneOffset: '-03:00',
 *     resolution: { width: 1920, height: 1080 },
 *     frameRate: 30,
 *     connectionType: 'Wi-Fi',
 *     location: 'São Paulo, SP',
 *   }}
 * />
 * ```
 */
export default function ForensicContextEnhanced({
  context,
  compact = false,
  className = '',
}: ForensicContextEnhancedProps): React.ReactElement {
  /**
   * Itens de contexto a serem exibidos
   */
  const contextItems = useMemo(() => {
    if (!context) {
      return [];
    }

    const items: Array<{
      id: string;
      icon: React.ReactNode;
      label: string;
      value: string;
      fullValue: string | undefined;
      highlight: boolean | undefined;
    }> = [
      {
        id: 'url',
        icon: Icons.globe,
        label: 'URL Atual',
        value: truncateUrl(context.currentUrl),
        fullValue: context.currentUrl,
        highlight: true,
      },
      {
        id: 'datetime',
        icon: Icons.calendar,
        label: 'Data/Hora',
        value: formatDateTime(context.startedAt, context.timezoneOffset),
        fullValue: undefined,
        highlight: undefined,
      },
      {
        id: 'resolution',
        icon: Icons.monitor,
        label: 'Resolução',
        value: formatResolution(context.resolution.width, context.resolution.height, context.frameRate),
        fullValue: undefined,
        highlight: undefined,
      },
    ];

    if (context.connectionType) {
      items.push({
        id: 'connection',
        icon: Icons.wifi,
        label: 'Conexão',
        value: context.connectionType,
        fullValue: undefined,
        highlight: undefined,
      });
    }

    if (context.location) {
      items.push({
        id: 'location',
        icon: Icons.mapPin,
        label: 'Localização',
        value: context.location,
        fullValue: undefined,
        highlight: undefined,
      });
    }

    return items;
  }, [context]);

  if (!context) {
    return (
      <div className={`bg-zinc-900/60 rounded-lg p-3 ${className}`.trim()}>
        <div className="text-center text-zinc-500 text-xs py-2">
          Contexto forense não disponível
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-3 text-xs ${className}`.trim()}>
        <span className="text-emerald-400">{Icons.globe}</span>
        <span className="text-zinc-400 truncate" title={context.currentUrl}>
          {truncateUrl(context.currentUrl, 30)}
        </span>
        <span className="text-zinc-600">•</span>
        <span className="text-zinc-500">
          {formatResolution(context.resolution.width, context.resolution.height)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`bg-zinc-900/60 rounded-lg border border-zinc-700/30 overflow-hidden ${className}`.trim()}
      role="region"
      aria-label="Contexto forense da gravação"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/30 border-b border-zinc-700/30">
        <span className="text-emerald-400">{Icons.globe}</span>
        <span className="text-xs font-medium text-zinc-400">Contexto Forense</span>
      </div>

      {/* Conteúdo */}
      <div className="px-3 py-1 divide-y divide-zinc-800/50">
        {contextItems.map((item) => (
          <ContextItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            value={item.value}
            fullValue={item.fullValue}
            highlight={item.highlight}
          />
        ))}
      </div>
    </div>
  );
}
