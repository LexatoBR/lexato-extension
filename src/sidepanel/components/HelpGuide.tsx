/**
 * Componente de Guia de Ajuda
 *
 * Exibe instruções claras e concisas para o usuário durante a gravação,
 * orientando sobre o fluxo correto de captura de prova digital.
 *
 * @module HelpGuide
 */
import React, { useState } from 'react';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Etapa do guia
 */
export type GuideStep = 'recording' | 'navigating' | 'finalizing';

/**
 * Props do componente HelpGuide
 */
export interface HelpGuideProps {
  /** Etapa atual do processo */
  currentStep?: GuideStep;
  /** Se o guia pode ser minimizado */
  collapsible?: boolean;
  /** Se inicia minimizado */
  defaultCollapsed?: boolean;
  /** Classes CSS adicionais */
  className?: string;
}

// ============================================================================
// Ícones SVG
// ============================================================================

/**
 * Ícone de lâmpada (dica)
 */
function LightbulbIcon(): React.ReactElement {
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
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

/**
 * Ícone de chevron (expandir/colapsar)
 */
function ChevronIcon({ isExpanded }: { isExpanded: boolean }): React.ReactElement {
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
      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ============================================================================
// Conteúdo do Guia
// ============================================================================

/**
 * Conteúdo do guia por etapa
 */
const guideContent: Record<
  GuideStep,
  {
    title: string;
    description: string;
    tips: string[];
  }
> = {
  recording: {
    title: 'Gravação em Andamento',
    description:
      'Sua navegação está sendo capturada com integridade forense. Cada página visitada é registrada com hash SHA-256.',
    tips: [
      'Navegue normalmente entre as páginas',
      'Todas as URLs são registradas automaticamente',
      'O vídeo captura toda a sua interação',
    ],
  },
  navigating: {
    title: 'Navegando',
    description:
      'Continue navegando pelas páginas que deseja registrar como prova. Cada acesso é documentado com timestamp.',
    tips: [
      'Acesse todas as páginas relevantes',
      'Aguarde o carregamento completo',
      'Evite abas em segundo plano',
    ],
  },
  finalizing: {
    title: 'Finalizando',
    description:
      'Ao terminar a navegação, clique em "Finalizar Captura" para enviar a prova ao servidor.',
    tips: [
      'Revise as páginas capturadas',
      'Clique em "Finalizar Captura"',
      'Aguarde o upload completo',
    ],
  },
};

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Guia de Ajuda para o Usuário
 *
 * Exibe instruções contextuais durante a gravação de prova digital,
 * orientando o usuário sobre o processo correto de captura.
 *
 * @example
 * ```tsx
 * <HelpGuide
 *   currentStep="recording"
 *   collapsible={true}
 *   defaultCollapsed={false}
 * />
 * ```
 */
export default function HelpGuide({
  currentStep = 'recording',
  collapsible = true,
  defaultCollapsed = false,
  className = '',
}: HelpGuideProps): React.ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const content = guideContent[currentStep];

  /**
   * Toggle do estado colapsado
   */
  const handleToggle = (): void => {
    if (collapsible) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div
      className={`bg-zinc-900/60 rounded-lg border border-zinc-700/30 overflow-hidden ${className}`.trim()}
      role="complementary"
      aria-label="Guia de ajuda"
    >
      {/* Header */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={!collapsible}
        className={`
          w-full flex items-center justify-between px-3 py-2
          ${collapsible ? 'cursor-pointer hover:bg-zinc-800/30' : 'cursor-default'}
          transition-colors
        `}
        aria-expanded={!isCollapsed}
        aria-controls="help-guide-content"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-400/80">
            <LightbulbIcon />
          </span>
          <span className="text-xs font-medium text-zinc-400">Guia</span>
        </div>
        {collapsible && (
          <span className="text-zinc-500">
            <ChevronIcon isExpanded={!isCollapsed} />
          </span>
        )}
      </button>

      {/* Conteúdo */}
      {!isCollapsed && (
        <div id="help-guide-content" className="px-3 pb-3 space-y-2">
          {/* Descrição principal */}
          <p className="text-xs text-zinc-400 leading-relaxed">{content.description}</p>

          {/* Lista de dicas */}
          <ul className="space-y-1" role="list" aria-label="Dicas">
            {content.tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2 text-xs text-zinc-500">
                <span className="text-emerald-500/60 mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Versão inline do guia (apenas texto)
 */
export function HelpGuideInline({ className = '' }: { className?: string }): React.ReactElement {
  return (
    <div
      className={`flex items-start gap-2 p-2 bg-zinc-800/30 rounded text-xs text-zinc-500 ${className}`.trim()}
      role="note"
    >
      <span className="text-amber-400/60 shrink-0">
        <LightbulbIcon />
      </span>
      <span>
        Navegue normalmente. Ao finalizar, clique em{' '}
        <strong className="text-zinc-400">&ldquo;Finalizar Captura&rdquo;</strong> para enviar a prova ao
        servidor.
      </span>
    </div>
  );
}
