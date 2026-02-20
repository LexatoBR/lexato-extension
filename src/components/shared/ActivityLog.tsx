/**
 * Componente ActivityLog do Design System Lexato
 *
 * Exibe histórico de atividades recentes da sessão com timestamps relativos.
 * Mostra últimas 5 atividades com ícones por tipo e link para histórico completo.
 *
 * @see Requirements 22.1-22.5
 */

import React from 'react';
import { activityLabels, statusLabels, timeLabels } from '../../lib/i18n/labels';

/**
 * Tipos de atividade suportados
 */
export type ActivityType = 'capture' | 'sync' | 'login' | 'upload' | 'verify' | 'logout' | 'error';

/**
 * Item de atividade
 */
export interface ActivityItem {
  /** ID único da atividade */
  id: string;
  /** Tipo da atividade */
  type: ActivityType;
  /** Mensagem descritiva */
  message: string;
  /** Data/hora da atividade */
  timestamp: Date;
}

/**
 * Props do componente ActivityLog
 */
export interface ActivityLogProps {
  /** Lista de atividades (máximo 5 serão exibidas) */
  activities: ActivityItem[];
  /** Data/hora da última sincronização */
  lastSyncTime?: Date;
  /** Callback ao clicar em "Ver histórico completo" */
  onViewFullHistory?: () => void;
  /** Classe CSS adicional */
  className?: string;
  /** Número máximo de atividades a exibir */
  maxItems?: number;
}

/**
 * Ícone de câmera para capturas
 */
const CameraIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

/**
 * Ícone de refresh para sincronização
 */
const RefreshIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

/**
 * Ícone de login
 */
const LoginIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

/**
 * Ícone de logout
 */
const LogoutIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

/**
 * Ícone de upload
 */
const UploadIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);

/**
 * Ícone de verificação/shield
 */
const VerifyIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

/**
 * Ícone de erro
 */
const ErrorIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/**
 * Mapeamento de tipos de atividade para ícones
 */
const activityIcons: Record<ActivityType, React.FC<{ className?: string }>> = {
  capture: CameraIcon,
  sync: RefreshIcon,
  login: LoginIcon,
  logout: LogoutIcon,
  upload: UploadIcon,
  verify: VerifyIcon,
  error: ErrorIcon,
};

/**
 * Cores por tipo de atividade
 */
const activityColors: Record<ActivityType, string> = {
  capture: 'text-primary',
  sync: 'text-[rgba(247,249,251,0.5)]',
  login: 'text-primary',
  logout: 'text-[rgba(247,249,251,0.5)]',
  upload: 'text-status-processing',
  verify: 'text-status-success',
  error: 'text-status-error',
};

/**
 * Formata timestamp relativo em português
 *
 * @param date - Data a ser formatada
 * @returns String com tempo relativo (ex: "há 5 minutos")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return timeLabels.relative.justNow;
  }

  if (diffMinutes < 60) {
    const unit = diffMinutes === 1 ? 'minuto' : timeLabels.units.minutes;
    return `há ${diffMinutes} ${unit}`;
  }

  if (diffHours < 24) {
    const unit = diffHours === 1 ? 'hora' : timeLabels.units.hours;
    return `há ${diffHours} ${unit}`;
  }

  if (diffDays < 7) {
    const unit = diffDays === 1 ? 'dia' : timeLabels.units.days;
    return `há ${diffDays} ${unit}`;
  }

  // Para datas mais antigas, mostrar data formatada
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * Componente ActivityLog
 *
 * Exibe histórico de atividades recentes da sessão.
 *
 * Características:
 * - Últimas 5 atividades com timestamp relativo
 * - Ícones por tipo de atividade
 * - "Última sincronização: há X minutos" no header
 * - Link "Ver histórico completo"
 *
 * @example
 * ```tsx
 * const activities = [
 *   { id: '1', type: 'capture', message: 'Screenshot capturado', timestamp: new Date() },
 *   { id: '2', type: 'sync', message: 'Dados sincronizados', timestamp: new Date() },
 * ];
 *
 * <ActivityLog
 *   activities={activities}
 *   lastSyncTime={new Date()}
 *   onViewFullHistory={() => navigate('/history')}
 * />
 * ```
 */
export const ActivityLog: React.FC<ActivityLogProps> = ({
  activities,
  lastSyncTime,
  onViewFullHistory,
  className = '',
  maxItems = 5,
}) => {
  // Limitar a quantidade de atividades exibidas
  const displayedActivities = activities.slice(0, maxItems);

  /**
   * Renderiza o ícone apropriado para o tipo de atividade
   */
  const renderActivityIcon = (type: ActivityType) => {
    const IconComponent = activityIcons[type];
    const colorClass = activityColors[type];
    return <IconComponent className={`w-4 h-4 ${colorClass}`} />;
  };

  /**
   * Formata a mensagem de última sincronização
   */
  const getLastSyncMessage = (): string => {
    if (!lastSyncTime) {
      return '';
    }
    return `${statusLabels.sync.lastSync}: ${formatRelativeTime(lastSyncTime)}`;
  };

  return (
    <div
      className={`
        bg-[rgba(255,255,255,0.03)]
        border border-[rgba(255,255,255,0.08)]
        rounded-lg
        p-3
        ${className}
      `}
      data-testid="activity-log"
      role="region"
      aria-label={activityLabels.header.title}
    >
      {/* Header */}
      <div
        className="
          flex items-center justify-between
          mb-3 pb-2
          border-b border-[rgba(255,255,255,0.08)]
        "
      >
        <h3
          className="text-xs font-medium text-[rgba(247,249,251,0.7)]"
          data-testid="activity-log-title"
        >
          {activityLabels.header.title}
        </h3>
        {lastSyncTime && (
          <span
            className="text-[11px] text-[rgba(247,249,251,0.5)]"
            data-testid="activity-log-sync"
          >
            {getLastSyncMessage()}
          </span>
        )}
      </div>

      {/* Lista de atividades */}
      <div className="space-y-1" data-testid="activity-list">
        {displayedActivities.length === 0 ? (
          <p
            className="text-xs text-[rgba(247,249,251,0.5)] text-center py-2"
            data-testid="activity-empty"
          >
            Nenhuma atividade recente
          </p>
        ) : (
          displayedActivities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center gap-2 py-1.5"
              data-testid={`activity-item-${activity.id}`}
            >
              {/* Ícone */}
              <div className="shrink-0">
                {renderActivityIcon(activity.type)}
              </div>

              {/* Mensagem */}
              <span
                className="flex-1 text-xs text-[rgba(247,249,251,0.7)] truncate"
                title={activity.message}
              >
                {activity.message}
              </span>

              {/* Timestamp */}
              <span
                className="shrink-0 text-[11px] text-[rgba(247,249,251,0.4)]"
                title={activity.timestamp.toLocaleString('pt-BR')}
              >
                {formatRelativeTime(activity.timestamp)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Link para histórico completo */}
      {onViewFullHistory && (
        <button
          type="button"
          onClick={onViewFullHistory}
          className="
            block w-full
            text-center
            mt-2 pt-2
            border-t border-[rgba(255,255,255,0.08)]
            text-xs text-primary
            hover:underline
            cursor-pointer
            transition-colors duration-150
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary
          "
          data-testid="activity-view-all"
        >
          {activityLabels.header.viewAll}
        </button>
      )}
    </div>
  );
};

ActivityLog.displayName = 'ActivityLog';

export default ActivityLog;
