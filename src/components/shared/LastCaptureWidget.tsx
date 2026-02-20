/**
 * Widget de Última Captura do Design System Lexato
 *
 * Exibe informações da última captura realizada com thumbnail,
 * status e ações rápidas. Mostra estado vazio quando não há capturas.
 *
 * @see Requirements 27.1-27.6
 */

import React from 'react';
import { Card } from '../ui/Card';
import { Badge, BadgeStatus } from '../ui/Badge';
import { Button } from '../ui/Button';

/** Status possíveis da captura */
export type CaptureStatus = 'pending' | 'processing' | 'success' | 'error';

/** Dados da última captura */
export interface LastCapture {
  /** ID da captura */
  id: string;
  /** Tipo de captura */
  type: 'screenshot' | 'video';
  /** URL do thumbnail (apenas para screenshots) */
  thumbnailUrl?: string;
  /** Data/hora da captura */
  capturedAt: Date;
  /** Status atual */
  status: CaptureStatus;
  /** Título/descrição opcional */
  title?: string;
}

/** Props do componente LastCaptureWidget */
export interface LastCaptureWidgetProps {
  /** Dados da última captura (null se não houver) */
  capture: LastCapture | null;
  /** Callback ao clicar em "Ver Detalhes" */
  onViewDetails?: (id: string) => void;
  /** Callback ao clicar em "Nova Captura" */
  onNewCapture?: () => void;
  /** Classe CSS adicional */
  className?: string;
}

/** Labels em PT-BR */
const labels = {
  title: 'Última Captura',
  viewDetails: 'Ver Detalhes',
  newCapture: 'Nova Captura',
  emptyTitle: 'Nenhuma captura ainda',
  emptyDescription: 'Capture sua primeira prova digital',
  startCapture: 'Iniciar Captura',
  screenshot: 'Screenshot',
  video: 'Vídeo',
} as const;

/** Mapeia status para BadgeStatus */
const statusToBadge: Record<CaptureStatus, BadgeStatus> = {
  pending: 'pending',
  processing: 'processing',
  success: 'success',
  error: 'error',
};

/**
 * Formata data relativa em PT-BR
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {return 'Agora mesmo';}
  if (diffMin < 60) {return `Há ${diffMin} min`;}
  if (diffHour < 24) {return `Há ${diffHour}h`;}
  if (diffDay === 1) {return 'Ontem';}
  if (diffDay < 7) {return `Há ${diffDay} dias`;}
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/**
 * Ícone de screenshot
 */
const ScreenshotIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

/**
 * Ícone de vídeo
 */
const VideoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

/**
 * Ícone de captura (para estado vazio)
 */
const CaptureIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

/**
 * Widget de Última Captura
 *
 * Exibe thumbnail, tipo, data/hora e status da última captura.
 * Quando não há capturas, mostra estado vazio com CTA.
 */
export const LastCaptureWidget: React.FC<LastCaptureWidgetProps> = ({
  capture,
  onViewDetails,
  onNewCapture,
  className = '',
}) => {
  // Estado vazio
  if (!capture) {
    return (
      <Card className={`p-4 ${className}`} data-testid="last-capture-widget-empty">
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-12 h-12 rounded-full bg-glass-background flex items-center justify-center mb-3">
            <CaptureIcon className="w-6 h-6 text-text-tertiary" />
          </div>
          <h3 className="text-sm font-medium text-text-primary mb-1">
            {labels.emptyTitle}
          </h3>
          <p className="text-xs text-text-tertiary mb-4">
            {labels.emptyDescription}
          </p>
          <Button variant="primary" size="sm" onClick={onNewCapture}>
            {labels.startCapture}
          </Button>
        </div>
      </Card>
    );
  }

  const TypeIcon = capture.type === 'screenshot' ? ScreenshotIcon : VideoIcon;
  const typeLabel = capture.type === 'screenshot' ? labels.screenshot : labels.video;

  return (
    <Card className={`p-4 ${className}`} data-testid="last-capture-widget">
      <div className="flex gap-3">
        {/* Thumbnail ou ícone */}
        <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-glass-background flex items-center justify-center">
          {capture.thumbnailUrl ? (
            <img
              src={capture.thumbnailUrl}
              alt={capture.title ?? labels.screenshot}
              className="w-full h-full object-cover"
            />
          ) : (
            <TypeIcon className="w-8 h-8 text-text-tertiary" />
          )}
        </div>

        {/* Informações */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-text-primary truncate">
              {capture.title ?? typeLabel}
            </span>
            <Badge status={statusToBadge[capture.status]} />
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <TypeIcon className="w-3.5 h-3.5" />
            <span>{typeLabel}</span>
            <span>•</span>
            <span>{formatRelativeDate(capture.capturedAt)}</span>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-2 mt-3">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => onViewDetails?.(capture.id)}
        >
          {labels.viewDetails}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={onNewCapture}
        >
          {labels.newCapture}
        </Button>
      </div>
    </Card>
  );
};

LastCaptureWidget.displayName = 'LastCaptureWidget';

export default LastCaptureWidget;
