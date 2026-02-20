/**
 * Componente de Contexto Forense
 *
 * Exibe informações de contexto forense durante a gravação de vídeo:
 * localização do usuário, tipo de conexão, dispositivo/browser e
 * timestamp de início da gravação.
 *
 * Este componente é reutilizável e pode ser usado independentemente
 * do VideoRecordingPanel.
 *
 * @module ForensicContext
 * @requirements 8.1, 8.2, 8.3, 8.4, 8.5

 */
import React from 'react';
import type { ForensicContext } from '../types';

// ============================================================================
// Funções Utilitárias
// ============================================================================

/**
 * Formata timestamp ISO 8601 para exibição em PT-BR
 *
 * @param isoString - Timestamp no formato ISO 8601
 * @returns Data e hora formatados em PT-BR
 *
 * @example formatTimestamp('2024-01-15T10:30:00.000Z') // '15/01/2024 às 07:30'
 */
export function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return isoString;
    }

    const dateFormatted = date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const timeFormatted = date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${dateFormatted} às ${timeFormatted}`;
  } catch {
    return isoString;
  }
}

// ============================================================================
// Tipos
// ============================================================================

/**
 * Props do componente ForensicContextDisplay
 */
export interface ForensicContextProps {
  /** Contexto forense da gravação (null se não disponível) */
  context: ForensicContext | null;
  /** Classes CSS adicionais para o container */
  className?: string;
}

/**
 * Configuração de um item de contexto forense
 */
interface ContextItem {
  /** Identificador único */
  id: string;
  /** Ícone/emoji representativo */
  icon: string;
  /** Rótulo descritivo */
  label: string;
  /** Valor a ser exibido */
  value: string;
  /** Descrição para acessibilidade */
  ariaLabel: string;
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Componente de Contexto Forense
 *
 * Exibe informações de contexto forense capturadas durante a gravação,
 * incluindo localização, tipo de conexão, dispositivo e timestamp.
 * Quando a localização não está disponível, exibe mensagem apropriada.
 *
 * Requisitos implementados:
 * - 8.1: Exibir localização do usuário (se disponível)
 * - 8.2: Exibir tipo de conexão (Wi-Fi, 4G, etc.)
 * - 8.3: Exibir informações do dispositivo/browser
 * - 8.4: Exibir timestamp de início da gravação
 * - 8.5: Exibir "Localização não disponível" quando location é undefined
 *
 * @param props - Props do componente
 * @returns Elemento React com informações de contexto forense
 *
 * @example
 * ```tsx
 * // Uso com contexto completo
 * <ForensicContextDisplay
 *   context={{
 *     location: 'São Paulo, SP, Brasil',
 *     connectionType: 'Wi-Fi',
 *     device: 'Chrome 120 / Windows 11',
 *     startedAt: '2024-01-15T10:30:00.000Z'
 *   }}
 * />
 *
 * // Uso sem localização
 * <ForensicContextDisplay
 *   context={{
 *     connectionType: '4G',
 *     device: 'Chrome 120 / macOS',
 *     startedAt: '2024-01-15T10:30:00.000Z'
 *   }}
 * />
 *
 * // Uso sem contexto (null)
 * <ForensicContextDisplay context={null} />
 * ```
 */
export default function ForensicContextDisplay({
  context,
  className = '',
}: ForensicContextProps): React.ReactElement {
  /**
   * Monta a lista de itens de contexto a serem exibidos
   * Requisito 8.5: Exibir "Localização não disponível" quando location é undefined
   */
  const getContextItems = (): ContextItem[] => {
    if (!context) {
      return [];
    }

    const items: ContextItem[] = [
      // Requisito 8.1: Localização (com fallback para 8.5)
      {
        id: 'location',
        icon: '\u2316',
        label: 'Localização',
        value: context.location ?? 'Localização não disponível',
        ariaLabel: context.location
          ? `Localização: ${context.location}`
          : 'Localização não disponível',
      },
      // Requisito 8.2: Tipo de conexão
      {
        id: 'connection',
        icon: '\u2261',
        label: 'Conexão',
        value: context.connectionType ?? 'Não identificada',
        ariaLabel: context.connectionType
          ? `Tipo de conexão: ${context.connectionType}`
          : 'Tipo de conexão não identificada',
      },
      // Requisito 8.3: Dispositivo/browser
      {
        id: 'device',
        icon: '\u25A3',
        label: 'Dispositivo',
        value: context.device ?? 'Não identificado',
        ariaLabel: context.device
          ? `Dispositivo: ${context.device}`
          : 'Dispositivo não identificado',
      },
      // Requisito 8.4: Timestamp de início
      {
        id: 'timestamp',
        icon: '\u25F7',
        label: 'Início',
        value: formatTimestamp(context.startedAt),
        ariaLabel: `Gravação iniciada em: ${formatTimestamp(context.startedAt)}`,
      },
    ];

    return items;
  };

  const contextItems = getContextItems();

  return (
    <div
      className={`bg-zinc-800 rounded-lg p-4 ${className}`.trim()}
      role="region"
      aria-label="Contexto forense da gravação"
    >
      {/* Título da seção */}
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Contexto Forense</h3>

      {/* Conteúdo */}
      {!context ? (
        <div className="text-center py-4 text-zinc-500 text-sm">
          Contexto forense não disponível
        </div>
      ) : (
        <div className="space-y-2" role="list" aria-label="Informações de contexto forense">
          {contextItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-2 bg-zinc-700/50 rounded-md"
              role="listitem"
              aria-label={item.ariaLabel}
            >
              {/* Ícone */}
              <span className="text-base shrink-0" role="img" aria-hidden="true">
                {item.icon}
              </span>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                {/* Rótulo */}
                <span className="text-xs text-zinc-400 block">{item.label}</span>

                {/* Valor */}
                <span
                  className={`text-sm break-all ${
                    item.id === 'location' && !context.location
                      ? 'text-zinc-500 italic'
                      : 'text-zinc-200'
                  }`}
                >
                  {item.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
