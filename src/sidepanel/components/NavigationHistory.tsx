/**
 * Componente de Histórico de Navegação
 *
 * Exibe uma lista scrollável de URLs visitadas durante a gravação de vídeo,
 * com timestamps relativos ao início da gravação. URLs longas são truncadas
 * com ellipsis e a URL completa é exibida em tooltip.
 *
 * Este componente é reutilizável e pode ser usado independentemente
 * do VideoRecordingPanel.
 *
 * @module NavigationHistory
 * @requirements 3.2, 3.3, 3.5

 */
import React, { useEffect, useRef } from 'react';
import type { NavigationEntry, NavigationType } from '../types';

// ============================================================================
// Funções Utilitárias
// ============================================================================

/**
 * Trunca URL para exibição
 *
 * Se a URL for maior que o comprimento máximo, trunca e adiciona ellipsis.
 * Preserva o início da URL para manter o domínio visível.
 *
 * @param url - URL completa
 * @param maxLength - Comprimento máximo (padrão: 50)
 * @returns URL truncada com ellipsis se necessário
 *
 * @example truncateUrl('https://example.com/path', 50) // 'https://example.com/path'
 * @example truncateUrl('https://example.com/very/long/path/to/page', 30) // 'https://example.com/very/lo...'
 */
export function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) {
    return url;
  }
  return url.substring(0, maxLength - 3) + '...';
}

/**
 * Retorna o ícone correspondente ao tipo de navegação
 *
 * @param type - Tipo de navegação
 * @returns Caractere indicador do tipo
 */
function getNavigationIcon(type: NavigationType): string {
  const icons: Record<NavigationType, string> = {
    initial: '\u2302',
    'link-click': '\u2197',
    'form-submit': '\u270E',
    'history-back': '\u2190',
    'history-forward': '\u2192',
    redirect: '\u21AA',
  };
  return icons[type] || '\u25CB';
}

/**
 * Retorna o rótulo em português para o tipo de navegação
 *
 * @param type - Tipo de navegação
 * @returns Rótulo descritivo em PT-BR
 */
function getNavigationLabel(type: NavigationType): string {
  const labels: Record<NavigationType, string> = {
    initial: 'Página inicial',
    'link-click': 'Clique em link',
    'form-submit': 'Envio de formulário',
    'history-back': 'Voltar no histórico',
    'history-forward': 'Avançar no histórico',
    redirect: 'Redirecionamento',
  };
  return labels[type] || 'Navegação';
}

// ============================================================================
// Tipos
// ============================================================================

/**
 * Props do componente NavigationHistory
 *
 * Lista de navegações com timestamps conforme design.md
 */
export interface NavigationHistoryProps {
  /** Lista de entradas de navegação */
  entries: NavigationEntry[];
  /** URL atual (para destacar) */
  currentUrl: string;
  /** Classes CSS adicionais para o container */
  className?: string;
  /** Altura máxima da lista em pixels (padrão: 200) */
  maxHeight?: number;
  /** Se deve exibir hashes (ISO 27037) */
  showHashes?: boolean;
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Componente de Histórico de Navegação
 *
 * Exibe uma lista scrollável de URLs visitadas durante a gravação,
 * com timestamps relativos ao início do vídeo. Implementa auto-scroll
 * para a última entrada quando novas navegações são adicionadas.
 *
 * Requisitos implementados:
 * - 3.2: Exibir lista scrollável de URLs visitadas com timestamps
 * - 3.3: Auto-scroll para mostrar última entrada
 * - 3.5: Truncar URLs longas com ellipsis e mostrar URL completa em tooltip
 *
 * @param props - Props do componente
 * @returns Elemento React com lista de navegações
 *
 * @example
 * ```tsx
 * // Uso básico
 * <NavigationHistory
 *   entries={[
 *     {
 *       videoTimestamp: 0,
 *       formattedTime: '00:00',
 *       url: 'https://example.com',
 *       fullUrl: 'https://example.com',
 *       type: 'initial',
 *       htmlHash: 'abc123...'
 *     }
 *   ]}
 *   currentUrl="https://example.com"
 * />
 *
 * // Com altura customizada
 * <NavigationHistory
 *   entries={entries}
 *   currentUrl={currentUrl}
 *   maxHeight={300}
 * />
 * ```
 */
export default function NavigationHistory({
  entries,
  currentUrl,
  className = '',
  maxHeight = 200,
  showHashes = true,
}: NavigationHistoryProps): React.ReactElement {
  /**
   * Referência para o container da lista
   * Usado para implementar auto-scroll
   */
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Referência para o último item da lista
   * Usado para scroll suave até o item
   */
  const lastEntryRef = useRef<HTMLDivElement>(null);

  /**
   * Efeito para auto-scroll quando novas entradas são adicionadas
   * Requisito 3.3: Auto-scroll para última entrada
   */
  useEffect(() => {
    if (lastEntryRef.current) {
      lastEntryRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [entries.length]);

  /**
   * Verifica se uma entrada é a URL atual
   */
  const isCurrentEntry = (entry: NavigationEntry): boolean => {
    return entry.fullUrl === currentUrl;
  };

  return (
    <div
      className={`bg-zinc-800 rounded-lg p-4 ${className}`.trim()}
      role="region"
      aria-label="Histórico de navegação"
    >
      {/* Título da seção */}
      <h3 className="text-sm font-medium text-zinc-400 mb-3">
        Páginas Visitadas ({entries.length})
      </h3>

      {/* Lista de navegações */}
      {entries.length === 0 ? (
        <div className="text-center py-4 text-zinc-500 text-sm">
          Nenhuma navegação registrada
        </div>
      ) : (
        <div
          ref={listRef}
          className="overflow-y-auto space-y-2"
          style={{ maxHeight: `${maxHeight}px` }}
          role="list"
          aria-label="Lista de URLs visitadas"
        >
          {entries.map((entry, index) => {
            const isLast = index === entries.length - 1;
            const isCurrent = isCurrentEntry(entry);
            const truncatedUrl = truncateUrl(entry.url);
            const needsTruncation = entry.fullUrl.length > 50;
            const truncatedHash = entry.htmlHash ? `${entry.htmlHash.substring(0, 8)}...` : null;

            return (
              <div
                key={`${entry.videoTimestamp}-${index}`}
                ref={isLast ? lastEntryRef : null}
                className={`
                  flex flex-col gap-1 p-2 rounded-md transition-colors
                  ${isCurrent ? 'bg-emerald-900/30 border border-emerald-700/50' : 'bg-zinc-700/50 hover:bg-zinc-700'}
                `}
                role="listitem"
                aria-current={isCurrent ? 'page' : undefined}
              >
                {/* Linha principal: timestamp, ícone, URL */}
                <div className="flex items-start gap-2">
                  {/* Timestamp */}
                  <span
                    className="text-xs font-mono text-zinc-400 whitespace-nowrap pt-0.5"
                    aria-label={`Tempo: ${entry.formattedTime}`}
                  >
                    {entry.formattedTime}
                  </span>

                  {/* Ícone do tipo de navegação */}
                  <span
                    className="text-sm pt-0.5"
                    role="img"
                    aria-label={getNavigationLabel(entry.type)}
                    title={getNavigationLabel(entry.type)}
                  >
                    {getNavigationIcon(entry.type)}
                  </span>

                  {/* URL com truncamento e tooltip */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`
                        text-sm break-all
                        ${isCurrent ? 'text-emerald-300' : 'text-zinc-300'}
                      `}
                      title={needsTruncation ? entry.fullUrl : undefined}
                      aria-label={`URL: ${entry.fullUrl}`}
                    >
                      {truncatedUrl}
                    </span>

                    {/* Badge de tipo (apenas para tipos especiais) */}
                    {entry.type !== 'initial' && entry.type !== 'link-click' && (
                      <span
                        className="ml-2 text-xs px-1.5 py-0.5 rounded bg-zinc-600 text-zinc-300"
                        aria-hidden="true"
                      >
                        {getNavigationLabel(entry.type)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hash SHA-256 (ISO 27037 compliance) */}
                {showHashes && truncatedHash && (
                  <div
                    className="flex items-center gap-1.5 ml-[52px] text-[10px]"
                    title={`SHA-256: ${entry.htmlHash}`}
                  >
                    <span className="text-zinc-600">#</span>
                    <code className="font-mono text-zinc-500">{truncatedHash}</code>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
