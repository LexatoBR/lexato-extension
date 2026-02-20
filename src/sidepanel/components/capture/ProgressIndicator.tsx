/**
 * Indicador de progresso do Side Panel Lexato
 *
 * Exibe progresso durante captura ativa.
 *
 * Migrado de popup/components/ProgressIndicator.tsx para sidepanel
 * com layout responsivo (sem dimensões fixas do popup).
 *
 * Requisitos atendidos:
 * - 4.6: Exibir progresso durante captura ativa
 *
 * @module ProgressIndicator
 */

import React from 'react';
import type { ScreenshotCaptureProgress, VideoCaptureProgress } from '../../../types/capture.types';
import { useAnimatedProgress } from '../../../hooks/useAnimatedProgress';

/**
 * Tipo de progresso unificado
 */
type CaptureProgress = ScreenshotCaptureProgress | VideoCaptureProgress;

/**
 * Props do componente ProgressIndicator
 */
interface ProgressIndicatorProps {
  /** Dados de progresso da captura */
  progress: CaptureProgress;
  /** Callback para cancelar captura */
  onCancel?: () => void;
}

/**
 * Verifica se é progresso de vídeo
 */
function isVideoProgress(progress: CaptureProgress): progress is VideoCaptureProgress {
  return 'state' in progress && 'elapsedMs' in progress;
}

/**
 * Formata tempo em milissegundos para exibição
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Ícone de spinner animado
 */
function SpinnerIcon(): React.ReactElement {
  return (
    <svg
      className="h-5 w-5 animate-spin text-lexato-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Ícone de câmera
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
      className="h-5 w-5"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/**
 * Ícone de vídeo gravando
 */
function RecordingIcon(): React.ReactElement {
  return (
    <div className="relative">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
      {/* Indicador de gravação pulsante */}
      <span className="absolute -right-1 -top-1 flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-error" />
      </span>
    </div>
  );
}

/**
 * Componente de indicador de progresso (Side Panel)
 *
 * Adaptado para layout responsivo do Side Panel:
 * - Usa width: 100% em vez de dimensões fixas
 * - Aviso atualizado para contexto do Side Panel
 */
export default function ProgressIndicator({
  progress,
  onCancel,
}: ProgressIndicatorProps): React.ReactElement {
  const isVideo = isVideoProgress(progress);
  const percent = progress.percent;

  // Usar progresso animado para transição suave
  const animatedPercent = useAnimatedProgress(percent);

  return (
    <div className="card space-y-3">
      {/* Header com ícone e título */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isVideo ? <RecordingIcon /> : <SpinnerIcon />}
          <span className="font-medium text-dark-100">
            {isVideo ? 'Gravando vídeo' : 'Capturando screenshot'}
          </span>
        </div>

        {/* Timer para vídeo */}
        {isVideo && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg text-lexato-400">
              {formatTime(progress.elapsedMs)}
            </span>
            <span className="text-xs text-dark-500">
              / {formatTime(progress.elapsedMs + progress.remainingMs)}
            </span>
          </div>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-dark-700">
          <div
            className="h-full rounded-full bg-lexato-500 transition-all duration-300"
            style={{ width: `${animatedPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-400">{progress.message}</span>
          <span className="text-dark-500">{animatedPercent}%</span>
        </div>
      </div>

      {/* Informações adicionais para screenshot */}
      {!isVideo && 'currentViewport' in progress && progress.totalViewports && (
        <div className="flex items-center justify-center gap-1 text-xs text-dark-400">
          <CameraIcon />
          <span>
            Viewport {progress.currentViewport} de {progress.totalViewports}
          </span>
        </div>
      )}

      {/* Aviso de tempo para vídeo */}
      {isVideo && progress.timeWarning && (
        <div className="rounded-lg bg-warning/10 p-2 text-center text-sm text-warning">
          {progress.timeWarning === '5min' && 'Restam 5 minutos de gravação'}
          {progress.timeWarning === '1min' && 'Resta 1 minuto de gravação'}
          {progress.timeWarning === '30sec' && 'Restam 30 segundos de gravação'}
        </div>
      )}

      {/* Botão de cancelar */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary w-full text-sm"
        >
          {isVideo ? 'Parar gravação' : 'Cancelar captura'}
        </button>
      )}

      {/* Aviso de não fechar - adaptado para Side Panel */}
      <p className="text-center text-xs text-dark-500">
        {isVideo
          ? 'A gravação continuará mesmo se você fechar este painel'
          : 'Não feche este painel durante a captura'}
      </p>
    </div>
  );
}
