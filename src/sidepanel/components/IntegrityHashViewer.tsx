/**
 * Componente de Visualização de Hashes de Integridade
 *
 * Exibe os hashes SHA-256 sendo gerados em tempo real para cada
 * chunk/trecho do vídeo, demonstrando visualmente que a integridade
 * forense está sendo garantida durante toda a gravação.
 *
 * Conformidade ISO 27037:
 * - Demonstra integridade contínua da evidência digital
 * - Cada chunk possui hash único e verificável
 * - Cadeia de custódia digital visível ao usuário
 *
 * @module IntegrityHashViewer
 * @see ISO/IEC 27037:2012 - Guidelines for identification, collection, acquisition and preservation of digital evidence
 */
import React, { useMemo } from 'react';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Representa um chunk de vídeo com seu hash de integridade
 */
export interface VideoChunk {
  /** Número sequencial do chunk */
  index: number;
  /** Hash SHA-256 do chunk (null se ainda calculando) */
  hash: string | null;
  /** Tamanho do chunk em bytes */
  sizeBytes: number;
  /** Timestamp de criação do chunk */
  timestamp: number;
  /** Status do chunk */
  status: 'pending' | 'hashing' | 'completed' | 'error';
}

/**
 * Props do componente IntegrityHashViewer
 */
export interface IntegrityHashViewerProps {
  /** Lista de chunks com seus hashes */
  chunks: VideoChunk[];
  /** Hash raiz da Merkle Tree (se disponível) */
  merkleRoot?: string | null | undefined;
  /** Se a integridade está ativa */
  isActive: boolean;
  /** Classes CSS adicionais */
  className?: string;
  /** Número máximo de chunks a exibir (padrão: 5) */
  maxVisible?: number;
}

// ============================================================================
// Ícones SVG
// ============================================================================

/**
 * Ícone de cadeado (integridade ativa)
 */
function LockIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/**
 * Ícone de check (hash verificado)
 */
function CheckIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Ícone de loading (calculando hash)
 */
function LoadingIcon(): React.ReactElement {
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
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ============================================================================
// Funções Utilitárias
// ============================================================================

/**
 * Trunca hash para exibição
 *
 * @param hash - Hash completo SHA-256
 * @param length - Comprimento visível (padrão: 12)
 * @returns Hash truncado com ellipsis
 */
function truncateHash(hash: string, length: number = 12): string {
  if (hash.length <= length) {
    return hash;
  }
  const half = Math.floor(length / 2);
  return `${hash.substring(0, half)}...${hash.substring(hash.length - half)}`;
}

/**
 * Formata tamanho em bytes para exibição legível
 *
 * @param bytes - Tamanho em bytes
 * @returns String formatada (ex: "1.5 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ============================================================================
// Componente de Item de Chunk
// ============================================================================

/**
 * Item individual de chunk na lista
 */
function ChunkItem({ chunk }: { chunk: VideoChunk }): React.ReactElement {
  const statusConfig = {
    pending: {
      icon: <span className="text-zinc-500">○</span>,
      color: 'text-zinc-500',
      label: 'Aguardando',
    },
    hashing: {
      icon: <LoadingIcon />,
      color: 'text-amber-400',
      label: 'Calculando',
    },
    completed: {
      icon: <CheckIcon />,
      color: 'text-emerald-400',
      label: 'Verificado',
    },
    error: {
      icon: <span className="text-red-400">✕</span>,
      color: 'text-red-400',
      label: 'Erro',
    },
  };

  const config = statusConfig[chunk.status];

  return (
    <div
      className="flex items-center justify-between py-1.5 px-2 bg-zinc-800/50 rounded text-xs"
      role="listitem"
      aria-label={`Chunk ${chunk.index + 1}: ${config.label}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 font-mono w-6">#{chunk.index + 1}</span>
        <code className={`font-mono ${config.color}`}>
          {chunk.hash ? truncateHash(chunk.hash) : '...'}
        </code>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-zinc-600 text-[10px]">{formatBytes(chunk.sizeBytes)}</span>
        <span className={config.color}>{config.icon}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Visualizador de Hashes de Integridade
 *
 * Exibe em tempo real os hashes SHA-256 sendo gerados para cada
 * chunk do vídeo, demonstrando a integridade forense da captura.
 *
 * @example
 * ```tsx
 * <IntegrityHashViewer
 *   chunks={[
 *     { index: 0, hash: '7f3a2b4c...', sizeBytes: 1048576, timestamp: Date.now(), status: 'completed' },
 *     { index: 1, hash: null, sizeBytes: 524288, timestamp: Date.now(), status: 'hashing' },
 *   ]}
 *   merkleRoot="abc123..."
 *   isActive={true}
 * />
 * ```
 */
export default function IntegrityHashViewer({
  chunks,
  merkleRoot,
  isActive,
  className = '',
  maxVisible = 5,
}: IntegrityHashViewerProps): React.ReactElement {
  /**
   * Chunks visíveis (últimos N)
   */
  const visibleChunks = useMemo(() => {
    if (chunks.length <= maxVisible) {
      return chunks;
    }
    return chunks.slice(-maxVisible);
  }, [chunks, maxVisible]);

  /**
   * Contadores de status
   */
  const stats = useMemo(() => {
    return {
      total: chunks.length,
      completed: chunks.filter((c) => c.status === 'completed').length,
      hashing: chunks.filter((c) => c.status === 'hashing').length,
    };
  }, [chunks]);

  return (
    <div
      className={`bg-zinc-900/80 rounded-lg border border-zinc-700/50 overflow-hidden ${className}`.trim()}
      role="region"
      aria-label="Integridade da gravação"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <span className={isActive ? 'text-emerald-400' : 'text-zinc-500'}>
            <LockIcon />
          </span>
          <span className="text-xs font-medium text-zinc-300">Integridade Ativa</span>
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          )}
          <span className="text-[10px] text-zinc-500">
            {stats.completed}/{stats.total} chunks
          </span>
        </div>
      </div>

      {/* Lista de Chunks */}
      <div className="p-2 space-y-1 max-h-32 overflow-y-auto" role="list" aria-label="Lista de hashes">
        {chunks.length === 0 ? (
          <div className="text-center py-3 text-zinc-500 text-xs">
            Aguardando primeiro chunk...
          </div>
        ) : (
          <>
            {chunks.length > maxVisible && (
              <div className="text-center text-[10px] text-zinc-600 py-1">
                ... {chunks.length - maxVisible} chunks anteriores
              </div>
            )}
            {visibleChunks.map((chunk) => (
              <ChunkItem key={chunk.index} chunk={chunk} />
            ))}
          </>
        )}
      </div>

      {/* Merkle Root (se disponível) */}
      {merkleRoot && (
        <div className="px-3 py-2 bg-emerald-900/20 border-t border-emerald-700/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-emerald-400/80">Merkle Root</span>
            <code className="text-[10px] font-mono text-emerald-300">{truncateHash(merkleRoot, 16)}</code>
          </div>
        </div>
      )}
    </div>
  );
}
