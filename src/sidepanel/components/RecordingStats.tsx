/**
 * Componente de Estatísticas de Gravação
 *
 * Exibe contadores em tempo real das interações do usuário durante
 * a gravação de vídeo: páginas visitadas, cliques, teclas, scrolls
 * e formulários interagidos.
 *
 * Este componente é reutilizável e pode ser usado independentemente
 * do VideoRecordingPanel.
 *
 * @module RecordingStats
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5

 */
import React from 'react';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Props do componente RecordingStats
 *
 * Seção de estatísticas de interação conforme design.md
 */
export interface RecordingStatsProps {
  /** Número de páginas visitadas (Requisito 2.1) */
  pagesVisited: number;
  /** Número de cliques registrados (Requisito 2.2) */
  clickCount: number;
  /** Número de teclas pressionadas (Requisito 2.3) */
  keystrokeCount: number;
  /** Número de scrolls realizados (Requisito 2.4) */
  scrollCount: number;
  /** Número de formulários interagidos (Requisito 2.5) */
  formsInteracted: number;
  /** Classes CSS adicionais para o container */
  className?: string;
}

/**
 * Configuração de um item de estatística
 */
interface StatItem {
  /** Identificador único */
  id: string;
  /** Ícone/emoji representativo */
  icon: string;
  /** Rótulo descritivo */
  label: string;
  /** Valor numérico */
  value: number;
  /** Descrição para acessibilidade */
  ariaLabel: string;
}

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Componente de Estatísticas de Gravação
 *
 * Exibe estatísticas em tempo real das interações do usuário durante
 * a gravação de vídeo. Cada estatística é apresentada com um ícone
 * representativo e contador numérico.
 *
 * Requisitos implementados:
 * - 2.1: Exibir contador de páginas visitadas
 * - 2.2: Exibir contador de cliques
 * - 2.3: Exibir contador de teclas pressionadas
 * - 2.4: Exibir contador de scrolls
 * - 2.5: Exibir contador de formulários interagidos
 *
 * @param props - Props do componente
 * @returns Elemento React com grid de estatísticas
 *
 * @example
 * ```tsx
 * // Uso básico
 * <RecordingStats
 *   pagesVisited={3}
 *   clickCount={15}
 *   keystrokeCount={42}
 *   scrollCount={8}
 *   formsInteracted={1}
 * />
 *
 * // Com classes customizadas
 * <RecordingStats
 *   pagesVisited={0}
 *   clickCount={0}
 *   keystrokeCount={0}
 *   scrollCount={0}
 *   formsInteracted={0}
 *   className="my-custom-class"
 * />
 * ```
 */
export default function RecordingStats({
  pagesVisited,
  clickCount,
  keystrokeCount,
  scrollCount,
  formsInteracted,
  className = '',
}: RecordingStatsProps): React.ReactElement {
  /**
   * Lista de estatísticas a serem exibidas
   * Cada item contém ícone, rótulo, valor e descrição para acessibilidade
   */
  const stats: StatItem[] = [
    {
      id: 'pages',
      icon: '\u25A1',
      label: 'Páginas',
      value: pagesVisited,
      ariaLabel: `${pagesVisited} página${pagesVisited !== 1 ? 's' : ''} visitada${pagesVisited !== 1 ? 's' : ''}`,
    },
    {
      id: 'clicks',
      icon: '\u25CF',
      label: 'Cliques',
      value: clickCount,
      ariaLabel: `${clickCount} clique${clickCount !== 1 ? 's' : ''} registrado${clickCount !== 1 ? 's' : ''}`,
    },
    {
      id: 'keystrokes',
      icon: '\u2328',
      label: 'Teclas',
      value: keystrokeCount,
      ariaLabel: `${keystrokeCount} tecla${keystrokeCount !== 1 ? 's' : ''} pressionada${keystrokeCount !== 1 ? 's' : ''}`,
    },
    {
      id: 'scrolls',
      icon: '\u2195',
      label: 'Scrolls',
      value: scrollCount,
      ariaLabel: `${scrollCount} scroll${scrollCount !== 1 ? 's' : ''} realizado${scrollCount !== 1 ? 's' : ''}`,
    },
    {
      id: 'forms',
      icon: '\u270E',
      label: 'Formulários',
      value: formsInteracted,
      ariaLabel: `${formsInteracted} formulário${formsInteracted !== 1 ? 's' : ''} interagido${formsInteracted !== 1 ? 's' : ''}`,
    },
  ];

  return (
    <div
      className={`bg-zinc-800 rounded-lg p-4 ${className}`.trim()}
      role="region"
      aria-label="Estatísticas de interação"
    >
      {/* Título da seção */}
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Interações Capturadas</h3>

      {/* Grid de estatísticas */}
      <div className="grid grid-cols-5 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.id}
            className="flex flex-col items-center p-2 bg-zinc-700/50 rounded-md"
            role="group"
            aria-label={stat.ariaLabel}
          >
            {/* Ícone */}
            <span className="text-lg mb-1" role="img" aria-hidden="true">
              {stat.icon}
            </span>

            {/* Valor numérico */}
            <span
              className="text-xl font-bold text-white"
              aria-label={`Valor: ${stat.value}`}
            >
              {stat.value}
            </span>

            {/* Rótulo */}
            <span className="text-xs text-zinc-400 text-center mt-1">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
