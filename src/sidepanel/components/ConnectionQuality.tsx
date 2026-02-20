/**
 * Componente de Indicador de Qualidade de Conexão
 *
 * Exibe visualmente a qualidade da conexão e da gravação em tempo real,
 * permitindo ao usuário monitorar se a captura está ocorrendo de forma
 * estável e confiável.
 *
 * Conformidade ISO 27037:
 * - Monitoramento contínuo da qualidade da evidência
 * - Alertas visuais para problemas de conexão
 * - Registro de condições de captura
 *
 * @module ConnectionQuality
 */
import React, { useMemo } from 'react';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Nível de qualidade da conexão
 */
export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

/**
 * Tipo de conexão de rede
 */
export type ConnectionType = 'wifi' | '4g' | '3g' | '2g' | 'ethernet' | 'unknown';

/**
 * Estado da qualidade de conexão
 */
export interface ConnectionQualityState {
  /** Nível de qualidade atual */
  level: QualityLevel;
  /** Tipo de conexão */
  type: ConnectionType;
  /** Latência em ms (se disponível) */
  latencyMs?: number;
  /** Velocidade de upload em Mbps (se disponível) */
  uploadSpeedMbps?: number;
  /** Se há perda de pacotes */
  hasPacketLoss?: boolean;
  /** Timestamp da última verificação */
  lastChecked: number;
}

/**
 * Props do componente ConnectionQuality
 */
export interface ConnectionQualityProps {
  /** Estado da qualidade de conexão */
  quality: ConnectionQualityState;
  /** Se deve exibir detalhes expandidos */
  showDetails?: boolean;
  /** Classes CSS adicionais */
  className?: string;
}

// ============================================================================
// Configurações de Qualidade
// ============================================================================

/**
 * Configuração visual para cada nível de qualidade
 */
const qualityConfig: Record<
  QualityLevel,
  {
    label: string;
    color: string;
    bgColor: string;
    bars: number;
    description: string;
  }
> = {
  excellent: {
    label: 'Excelente',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400',
    bars: 4,
    description: 'Conexão estável e rápida',
  },
  good: {
    label: 'Boa',
    color: 'text-emerald-300',
    bgColor: 'bg-emerald-300',
    bars: 3,
    description: 'Conexão estável',
  },
  fair: {
    label: 'Regular',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400',
    bars: 2,
    description: 'Conexão instável',
  },
  poor: {
    label: 'Fraca',
    color: 'text-red-400',
    bgColor: 'bg-red-400',
    bars: 1,
    description: 'Conexão muito lenta',
  },
  offline: {
    label: 'Offline',
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-500',
    bars: 0,
    description: 'Sem conexão',
  },
};

/**
 * Labels para tipos de conexão
 */
const connectionTypeLabels: Record<ConnectionType, string> = {
  wifi: 'Wi-Fi',
  ethernet: 'Ethernet',
  '4g': '4G',
  '3g': '3G',
  '2g': '2G',
  unknown: 'Desconhecido',
};

// ============================================================================
// Componentes Internos
// ============================================================================

/**
 * Barras de sinal de qualidade
 */
function SignalBars({
  level,
  activeBars,
}: {
  level: QualityLevel;
  activeBars: number;
}): React.ReactElement {
  const config = qualityConfig[level];
  const totalBars = 4;

  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
      {Array.from({ length: totalBars }).map((_, index) => {
        const isActive = index < activeBars;
        const height = `${((index + 1) / totalBars) * 100}%`;

        return (
          <div
            key={index}
            className={`w-1 rounded-sm transition-all duration-300 ${
              isActive ? config.bgColor : 'bg-zinc-700'
            }`}
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

/**
 * Ícone de Wi-Fi
 */
function WifiIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Indicador de Qualidade de Conexão
 *
 * Exibe barras de sinal e informações sobre a qualidade da conexão
 * durante a gravação de vídeo.
 *
 * @example
 * ```tsx
 * <ConnectionQuality
 *   quality={{
 *     level: 'good',
 *     type: 'wifi',
 *     latencyMs: 45,
 *     uploadSpeedMbps: 10.5,
 *     lastChecked: Date.now(),
 *   }}
 *   showDetails={true}
 * />
 * ```
 */
export default function ConnectionQuality({
  quality,
  showDetails = false,
  className = '',
}: ConnectionQualityProps): React.ReactElement {
  const config = qualityConfig[quality.level];

  /**
   * Texto de status formatado
   */
  const statusText = useMemo(() => {
    const parts = [connectionTypeLabels[quality.type]];

    if (quality.level !== 'offline') {
      parts.push('•');
      parts.push(config.label);
    }

    return parts.join(' ');
  }, [quality.type, quality.level, config.label]);

  return (
    <div
      className={`flex items-center gap-2 ${className}`.trim()}
      role="status"
      aria-label={`Conexão: ${statusText}`}
    >
      {/* Ícone de conexão */}
      <span className={config.color}>
        <WifiIcon />
      </span>

      {/* Barras de sinal */}
      <SignalBars level={quality.level} activeBars={config.bars} />

      {/* Texto de status */}
      {showDetails && (
        <div className="flex flex-col">
          <span className={`text-xs font-medium ${config.color}`}>{statusText}</span>
          {quality.latencyMs !== undefined && (
            <span className="text-[10px] text-zinc-500">{quality.latencyMs}ms</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Versão compacta do indicador (apenas barras)
 */
export function ConnectionQualityCompact({
  quality,
  className = '',
}: Omit<ConnectionQualityProps, 'showDetails'>): React.ReactElement {
  const config = qualityConfig[quality.level];

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`.trim()}
      role="status"
      aria-label={`Conexão ${config.label}`}
      title={`${connectionTypeLabels[quality.type]} • ${config.description}`}
    >
      <SignalBars level={quality.level} activeBars={config.bars} />
    </div>
  );
}
