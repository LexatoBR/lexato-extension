/**
 * Painel completo de gravação de vídeo
 *
 * Exibe todas as seções durante a gravação:
 * - Timer com tempo decorrido e barra de progresso
 * - Indicador de qualidade de conexão
 * - Visualizador de hashes de integridade (ISO 27037)
 * - Histórico de navegação com timestamps e hashes
 * - Contexto forense aprimorado (URL, data/hora, resolução)
 * - Guia de ajuda para o usuário
 * - Alertas ativos
 * - Botões de controle (Concluir, Cancelar)
 *
 * O componente atualiza a cada 1 segundo durante a gravação (Requisito 1.7).
 * Implementa confirmação ao fechar durante gravação (Requisitos 1.4, 1.6).
 *
 * @module VideoRecordingPanel
 * @requirements 1.2, 1.3, 1.4, 1.6, 1.7, 3.2, 3.3, 3.5, 6.1-6.5, 7.8, 8.1-8.5, 9.1-9.3

 */
import React, { useEffect, useRef, useCallback } from 'react';
import type {
  RecordingState,
  NavigationEntry,
  Alert,
  VideoChunk,
  ConnectionQualityState,
  EnhancedForensicContext,
} from './types';

// Componentes
import IntegrityHashViewer from './components/IntegrityHashViewer';
import ConnectionQuality from './components/ConnectionQuality';
import ForensicContextEnhanced from './components/ForensicContextEnhanced';
import HelpGuide from './components/HelpGuide';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Props do componente VideoRecordingPanel
 */
export interface VideoRecordingPanelProps {
  /** Estado da gravação */
  recordingState: RecordingState;
  /** Histórico de navegação */
  navigationHistory: NavigationEntry[];
  /** Contexto forense aprimorado */
  forensicContext: EnhancedForensicContext | null;
  /** Alertas ativos */
  alerts: Alert[];
  /** Chunks de vídeo com hashes */
  videoChunks: VideoChunk[];
  /** Hash raiz da Merkle Tree */
  merkleRoot?: string | null;
  /** Estado da qualidade de conexão */
  connectionQuality: ConnectionQualityState;
  /** Callback para finalizar gravação */
  onFinalize: () => void;
  /** Callback para cancelar gravação */
  onCancel: () => void;
}

// ============================================================================
// Funções Utilitárias
// ============================================================================

/**
 * Formata tempo em milissegundos para formato MM:SS
 *
 * @param ms - Tempo em milissegundos
 * @returns String formatada no padrão MM:SS
 * @example formatTime(65000) // "01:05"
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calcula porcentagem de progresso
 *
 * @param elapsed - Tempo decorrido em ms
 * @param max - Tempo máximo em ms
 * @returns Porcentagem (0-100)
 * @example calculateProgress(900000, 1800000) // 50
 */
export function calculateProgress(elapsed: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(100, Math.floor((elapsed / max) * 100));
}

/**
 * Trunca URL longa para exibição
 *
 * @param url - URL completa
 * @param maxLength - Comprimento máximo (padrão: 50)
 * @returns URL truncada com ellipsis se necessário
 */
export function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) {
    return url;
  }
  return `${url.substring(0, maxLength - 3)}...`;
}

// ============================================================================
// Componentes Internos
// ============================================================================

/**
 * Seção de Timer e Progresso
 * Requisitos 1.2, 1.3
 */
interface TimerSectionProps {
  elapsedMs: number;
  maxDurationMs: number;
}

function TimerSection({ elapsedMs, maxDurationMs }: TimerSectionProps): React.ReactElement {
  const progress = calculateProgress(elapsedMs, maxDurationMs);

  return (
    <div className="bg-zinc-800 rounded-lg p-4 mb-4">
      <div className="text-center mb-3">
        <span className="text-4xl font-mono font-bold">{formatTime(elapsedMs)}</span>
        <span className="text-zinc-500 text-sm ml-2">/ {formatTime(maxDurationMs)}</span>
      </div>
      <div className="w-full bg-zinc-700 rounded-full h-2">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className="text-center mt-1">
        <span className="text-xs text-zinc-500">{progress}% do tempo máximo</span>
      </div>
    </div>
  );
}

/**
 * Seção de Histórico de Navegação
 * Requisitos 3.2, 3.3, 3.5
 */
interface NavigationSectionProps {
  entries: NavigationEntry[];
}

function NavigationSection({ entries }: NavigationSectionProps): React.ReactElement | null {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para última entrada quando nova navegação é adicionada
  useEffect(() => {
    if (scrollRef.current && entries.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="bg-zinc-800 rounded-lg p-4 mb-4 flex-1 min-h-0">
      <h2 className="text-sm font-medium mb-3 text-zinc-300">
        Navegação ({entries.length} páginas)
      </h2>
      <div ref={scrollRef} className="overflow-y-auto max-h-32 space-y-2">
        {entries.map((entry, index) => {
          const truncatedHash = entry.htmlHash ? `${entry.htmlHash.substring(0, 8)}...` : null;
          
          return (
            <div key={`${entry.videoTimestamp}-${index}`} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 font-mono">{entry.formattedTime}</span>
                <span className="text-zinc-400 truncate flex-1" title={entry.fullUrl}>
                  {truncateUrl(entry.url)}
                </span>
              </div>
              {/* Hash SHA-256 (ISO 27037) */}
              {truncatedHash && (
                <div
                  className="flex items-center gap-1 ml-[52px] text-[10px] text-zinc-600"
                  title={`SHA-256: ${entry.htmlHash}`}
                >
                  <span>#</span>
                  <code className="font-mono">{truncatedHash}</code>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Seção de Alertas
 * Requisitos 9.1-9.3
 */
interface AlertsSectionProps {
  alerts: Alert[];
}

function AlertsSection({ alerts }: AlertsSectionProps): React.ReactElement | null {
  if (alerts.length === 0) {
    return null;
  }

  // Exibe apenas os 3 alertas mais recentes
  const recentAlerts = alerts.slice(-3);

  return (
    <div className="space-y-2 mb-4">
      {recentAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-3 rounded-lg text-sm ${
            alert.type === 'error'
              ? 'bg-red-900/50 text-red-200'
              : alert.type === 'warning'
                ? 'bg-amber-900/50 text-amber-200'
                : 'bg-blue-900/50 text-blue-200'
          }`}
          role="alert"
        >
          {alert.message}
        </div>
      ))}
    </div>
  );
}

/**
 * Seção de Progresso de Upload
 * Requisito 7.8
 */
interface UploadSectionProps {
  chunksUploaded: number;
  chunksTotal: number;
  status: string;
}

function UploadSection({
  chunksUploaded,
  chunksTotal,
  status,
}: UploadSectionProps): React.ReactElement | null {
  if (status === 'idle') {
    return null;
  }

  return (
    <div className="bg-zinc-800 rounded-lg p-4 mb-4">
      <h2 className="text-sm font-medium mb-2 text-zinc-300">Upload</h2>
      <div className="text-xs text-zinc-400">
        {chunksUploaded} / {chunksTotal || '?'} chunks
      </div>
    </div>
  );
}

/**
 * Seção de Botões de Controle
 * Requisitos 6.1-6.5
 */
interface ControlButtonsProps {
  isProcessing: boolean;
  onFinalize: () => void;
  onCancel: () => void;
}

function ControlButtons({
  isProcessing,
  onFinalize,
  onCancel,
}: ControlButtonsProps): React.ReactElement {
  /**
   * Handler para cancelar com confirmação
   * Requisito 6.3
   */
  const handleCancel = useCallback(() => {
    // eslint-disable-next-line no-alert -- Confirmação necessária para ação destrutiva
    if (window.confirm('Deseja cancelar a gravação? Os dados serão descartados.')) {
      onCancel();
    }
  }, [onCancel]);

  return (
    <div className="mt-auto space-y-2">
      <button
        onClick={onFinalize}
        disabled={isProcessing}
        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
        aria-label="Concluir gravação"
      >
        {isProcessing ? 'Finalizando...' : 'Concluir'}
      </button>
      <button
        onClick={handleCancel}
        disabled={isProcessing}
        className="w-full py-2 px-3 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
        aria-label="Cancelar gravação"
      >
        Cancelar
      </button>
    </div>
  );
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Painel completo de gravação de vídeo
 *
 * Exibe todas as informações e controles durante a gravação de vídeo.
 * O componente é atualizado a cada 1 segundo pelo componente pai (SidePanel).
 *
 * @param props - Props do componente
 * @returns Elemento React com o painel de gravação
 *
 * @example
 * ```tsx
 * <VideoRecordingPanel
 *   recordingState={state}
 *   navigationHistory={state.navigationHistory}
 *   forensicContext={state.forensicContext}
 *   alerts={state.alerts}
 *   onFinalize={handleFinalize}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export default function VideoRecordingPanel({
  recordingState,
  navigationHistory,
  forensicContext,
  alerts,
  videoChunks,
  merkleRoot,
  connectionQuality,
  onFinalize,
  onCancel,
}: VideoRecordingPanelProps): React.ReactElement {
  const isProcessing = recordingState.status === 'stopping';

  /**
   * Intercepta tentativa de fechar o Side Panel durante gravação
   * 
   * Requisito 1.4: Mostrar diálogo de confirmação se gravação ativa
   * Requisito 1.6: Permitir fechamento normal se não gravando
   * 
   * O evento beforeunload é disparado quando o usuário tenta fechar
   * a janela/aba do Side Panel. Se a gravação estiver ativa, o navegador
   * exibirá um diálogo de confirmação padrão.
   */
  useEffect(() => {
    /**
     * Handler para evento beforeunload
     * 
     * @param event - Evento de beforeunload do navegador
     * @returns Mensagem de confirmação se gravação ativa, undefined caso contrário
     */
    const handleBeforeUnload = (event: BeforeUnloadEvent): string | undefined => {
      // Requisito 1.4: Confirmação se gravação ativa
      if (recordingState.status === 'recording') {
        // Previne fechamento imediato
        event.preventDefault();
        // Mensagem padrão do navegador será exibida
        // Nota: Navegadores modernos ignoram mensagens customizadas por segurança
        const mensagemConfirmacao = 'Gravação em andamento. Deseja realmente sair?';
        event.returnValue = mensagemConfirmacao;
        return mensagemConfirmacao;
      }
      // Requisito 1.6: Permitir fechamento normal se não gravando
      return undefined;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [recordingState.status]);

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-4 flex flex-col">
      {/* Header com status de gravação e qualidade de conexão */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          <span className="text-sm font-medium">Gravando</span>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionQuality quality={connectionQuality} showDetails={false} />
          <span className="text-xs text-zinc-500">{isProcessing ? 'Finalizando...' : 'Ativo'}</span>
        </div>
      </div>

      {/* Timer e Progresso - Requisitos 1.2, 1.3 */}
      <TimerSection
        elapsedMs={recordingState.elapsedMs}
        maxDurationMs={recordingState.maxDurationMs}
      />

      {/* Contexto Forense Aprimorado - Requisitos 8.1-8.5 */}
      <ForensicContextEnhanced context={forensicContext} className="mb-4" />

      {/* Visualizador de Hashes de Integridade (ISO 27037) */}
      <IntegrityHashViewer
        chunks={videoChunks}
        merkleRoot={merkleRoot}
        isActive={recordingState.status === 'recording'}
        className="mb-4"
        maxVisible={4}
      />

      {/* Navegação - Requisitos 3.2, 3.3, 3.5 */}
      <NavigationSection entries={navigationHistory} />

      {/* Alertas - Requisitos 9.1-9.3 */}
      <AlertsSection alerts={alerts} />

      {/* Guia de Ajuda */}
      <HelpGuide
        currentStep={isProcessing ? 'finalizing' : 'recording'}
        collapsible={true}
        defaultCollapsed={true}
        className="mb-4"
      />

      {/* Progresso de Upload - Requisito 7.8 */}
      <UploadSection
        chunksUploaded={recordingState.uploadProgress.chunksUploaded}
        chunksTotal={recordingState.uploadProgress.chunksTotal}
        status={recordingState.uploadProgress.status}
      />

      {/* Botões de Controle - Requisitos 6.1-6.5 */}
      <ControlButtons
        isProcessing={isProcessing}
        onFinalize={onFinalize}
        onCancel={onCancel}
      />
    </div>
  );
}
