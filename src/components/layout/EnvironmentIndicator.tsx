/**
 * Componente EnvironmentIndicator do Design System Lexato
 *
 * Indicador de integridade do ambiente exibido no Header.
 * Mostra status do ambiente com ícones de escudo coloridos.
 *
 * @see Requirements 23.1-23.6
 */

import React, { useState, useRef, useEffect } from 'react';

/**
 * Status possíveis do ambiente
 */
export type EnvironmentStatus = 'healthy' | 'warning' | 'critical';

/**
 * Detalhes de uma verificação do ambiente
 */
export interface EnvironmentCheck {
  /** Nome da verificação */
  name: string;
  /** Status da verificação */
  status: EnvironmentStatus;
  /** Mensagem descritiva */
  message: string;
}

/**
 * Props do componente EnvironmentIndicator
 */
export interface EnvironmentIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Status geral do ambiente */
  status?: EnvironmentStatus;
  /** Lista de verificações detalhadas */
  checks?: EnvironmentCheck[];
  /** Callback ao clicar no indicador (navegar para diagnóstico) */
  onNavigateToDiagnostic?: () => void;
}

/**
 * Ícone de escudo com check (ambiente íntegro)
 */
const ShieldCheckIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
  </svg>
);

/**
 * Ícone de escudo com alerta (avisos detectados)
 */
const ShieldAlertIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c.55 0 1 .45 1 1v4c0 .55-.45 1-1 1s-1-.45-1-1V8c0-.55.45-1 1-1zm0 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
  </svg>
);

/**
 * Ícone de escudo com X (problemas críticos)
 */
const ShieldXIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm3.54 12.12l-1.42 1.42L12 12.41l-2.12 2.13-1.42-1.42L10.59 11 8.46 8.88l1.42-1.42L12 9.59l2.12-2.13 1.42 1.42L13.41 11l2.13 2.12z" />
  </svg>
);

/**
 * Configuração de estilos por status
 */
const statusConfig: Record<
  EnvironmentStatus,
  {
    icon: React.FC<{ className?: string }>;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
    description: string;
  }
> = {
  healthy: {
    icon: ShieldCheckIcon,
    color: 'text-status-success',
    bgColor: 'bg-[rgba(0,222,165,0.1)]',
    borderColor: 'border-[rgba(0,222,165,0.3)]',
    label: 'Ambiente Íntegro',
    description: 'Todas as verificações passaram',
  },
  warning: {
    icon: ShieldAlertIcon,
    color: 'text-status-warning',
    bgColor: 'bg-[rgba(255,167,38,0.1)]',
    borderColor: 'border-[rgba(255,167,38,0.3)]',
    label: 'Avisos Detectados',
    description: 'Alguns avisos precisam de atenção',
  },
  critical: {
    icon: ShieldXIcon,
    color: 'text-status-error',
    bgColor: 'bg-[rgba(239,83,80,0.1)]',
    borderColor: 'border-[rgba(239,83,80,0.3)]',
    label: 'Problemas Críticos',
    description: 'Ação necessária para continuar',
  },
};

/**
 * Subcomponente: Tooltip com detalhes do ambiente
 */
const EnvironmentTooltip: React.FC<{
  status: EnvironmentStatus;
  checks: EnvironmentCheck[];
  visible: boolean;
}> = ({ status, checks, visible }) => {
  const config = statusConfig[status];

  if (!visible) {return null;}

  const tooltipClasses = [
    'absolute top-full right-0 mt-2 z-50',
    'min-w-[240px] max-w-[300px]',
    'p-3 rounded-lg',
    'bg-background-elevated',
    'border border-[rgba(255,255,255,0.1)]',
    'shadow-lg',
    'animate-fade-in-scale',
  ].join(' ');

  return (
    <div role="tooltip" className={tooltipClasses}>
      {/* Cabeçalho do tooltip */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[rgba(255,255,255,0.08)]">
        <config.icon className={`w-4 h-4 ${config.color}`} />
        <span className="text-sm font-medium text-text-primary">{config.label}</span>
      </div>

      {/* Lista de verificações */}
      {checks.length > 0 ? (
        <ul className="space-y-1.5">
          {checks.map((check, index) => {
            const checkConfig = statusConfig[check.status];
            return (
              <li key={index} className="flex items-start gap-2">
                <span className={`w-1.5 h-1.5 mt-1.5 rounded-full ${checkConfig.bgColor}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-text-secondary block truncate">{check.name}</span>
                  <span className="text-[10px] text-text-tertiary block truncate">
                    {check.message}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-text-tertiary">{config.description}</p>
      )}

      {/* Dica de ação */}
      <p className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.08)] text-[10px] text-text-muted">
        Clique para ver diagnóstico completo
      </p>
    </div>
  );
};

/**
 * Componente EnvironmentIndicator
 *
 * Exibe um ícone de escudo no Header indicando o status do ambiente:
 * - Verde (shield-check): Ambiente íntegro
 * - Amarelo (shield-alert): Avisos detectados
 * - Vermelho (shield-x): Problemas críticos
 *
 * Características:
 * - Tooltip com detalhes no hover
 * - Navegação para Diagnóstico no click
 * - Cores e ícones por status
 * - Acessível via teclado
 *
 * @example
 * ```tsx
 * // Ambiente íntegro
 * <EnvironmentIndicator
 *   status="healthy"
 *   onNavigateToDiagnostic={() => navigate('/diagnostic')}
 * />
 *
 * // Com avisos
 * <EnvironmentIndicator
 *   status="warning"
 *   checks={[
 *     { name: 'Conexão API', status: 'warning', message: 'Latência alta' }
 *   ]}
 *   onNavigateToDiagnostic={() => navigate('/diagnostic')}
 * />
 *
 * // Problemas críticos
 * <EnvironmentIndicator
 *   status="critical"
 *   checks={[
 *     { name: 'Blockchain', status: 'critical', message: 'Sem conexão' }
 *   ]}
 *   onNavigateToDiagnostic={() => navigate('/diagnostic')}
 * />
 * ```
 */
export const EnvironmentIndicator = React.forwardRef<HTMLDivElement, EnvironmentIndicatorProps>(
  ({ status = 'healthy', checks = [], onNavigateToDiagnostic, className = '', ...props }, ref) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const config = statusConfig[status];
    const IconComponent = config.icon;

    /**
     * Mostra tooltip com delay para evitar flicker
     */
    const handleMouseEnter = () => {
      timeoutRef.current = setTimeout(() => {
        setShowTooltip(true);
      }, 200);
    };

    /**
     * Esconde tooltip e limpa timeout
     */
    const handleMouseLeave = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setShowTooltip(false);
    };

    /**
     * Navega para diagnóstico ao clicar
     */
    const handleClick = () => {
      setShowTooltip(false);
      onNavigateToDiagnostic?.();
    };

    /**
     * Suporte a teclado
     */
    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick();
      }
    };

    /**
     * Limpa timeout ao desmontar
     */
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const ariaLabel =
      status === 'healthy'
        ? 'Ambiente íntegro - Clique para ver diagnóstico'
        : status === 'warning'
          ? 'Avisos detectados - Clique para ver detalhes'
          : 'Problemas críticos - Ação necessária';

    return (
      <div ref={ref} className={`relative ${className}`} {...props}>
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleMouseEnter}
          onBlur={handleMouseLeave}
          className={[
            'relative w-9 h-9',
            'flex items-center justify-center',
            'rounded-md',
            'transition-all duration-200',
            'hover:bg-[rgba(255,255,255,0.05)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            config.color,
          ].join(' ')}
          aria-label={ariaLabel}
          aria-describedby={showTooltip ? 'environment-tooltip' : undefined}
        >
          <IconComponent className="w-5 h-5" />

          {/* Indicador de status (ponto colorido) para status não-healthy */}
          {status !== 'healthy' && (
            <span
              className={[
                'absolute -top-0.5 -right-0.5',
                'w-2 h-2 rounded-full',
                status === 'warning' ? 'bg-status-warning' : 'bg-status-error',
                status === 'critical' ? 'animate-pulse' : '',
              ].join(' ')}
              aria-hidden="true"
            />
          )}
        </button>

        {/* Tooltip com detalhes */}
        <EnvironmentTooltip status={status} checks={checks} visible={showTooltip} />
      </div>
    );
  }
);

EnvironmentIndicator.displayName = 'EnvironmentIndicator';

export default EnvironmentIndicator;
