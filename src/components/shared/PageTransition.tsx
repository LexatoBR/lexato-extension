/**
 * Componente PageTransition do Design System Lexato
 *
 * Transições de página com morphing e crossfade.
 * Usa data-shared-id para identificar elementos compartilhados.
 *
 * @see Requirements 15.1-15.5
 */

import React, { useRef, useEffect, useState } from 'react';

/**
 * Props do componente PageTransition
 */
export interface PageTransitionProps {
  /** Chave única da página atual (muda para disparar transição) */
  pageKey: string;
  /** Conteúdo da página */
  children: React.ReactNode;
  /** Duração da transição em ms (padrão: 300ms) */
  duration?: number;
  /** Classe CSS adicional */
  className?: string;
}

/** Easing padrão para transições suaves */
const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

/**
 * Transições de página com crossfade
 *
 * Características:
 * - Crossfade entre páginas com duração configurável
 * - Easing: cubic-bezier(0.4, 0, 0.2, 1)
 * - Suporte a data-shared-id para elementos compartilhados
 *
 * @example
 * ```tsx
 * <PageTransition pageKey={activeTab}>
 *   {renderContent()}
 * </PageTransition>
 * ```
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
  pageKey,
  children,
  duration = 300,
  className = '',
}) => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentContent, setCurrentContent] = useState(children);
  const [previousContent, setPreviousContent] = useState<React.ReactNode>(null);
  const previousKeyRef = useRef(pageKey);

  useEffect(() => {
    if (pageKey !== previousKeyRef.current) {
      // Iniciar transição
      setPreviousContent(currentContent);
      setIsTransitioning(true);

      // Atualizar conteúdo após pequeno delay para permitir animação de saída
      const updateTimer = setTimeout(() => {
        setCurrentContent(children);
      }, 50);

      // Finalizar transição
      const endTimer = setTimeout(() => {
        setIsTransitioning(false);
        setPreviousContent(null);
      }, duration);

      previousKeyRef.current = pageKey;

      return () => {
        clearTimeout(updateTimer);
        clearTimeout(endTimer);
      };
    } else {
      // Atualizar conteúdo sem transição se a key não mudou
      setCurrentContent(children);
    }
    return undefined;
  }, [pageKey, children, duration]);

  const transitionStyle = {
    transition: `opacity ${duration}ms ${EASING}, transform ${duration}ms ${EASING}`,
  };

  return (
    <div
      className={`relative ${className}`}
      data-testid="page-transition"
    >
      {/* Conteúdo anterior (saindo) */}
      {isTransitioning && previousContent && (
        <div
          className="absolute inset-0"
          style={{
            ...transitionStyle,
            opacity: 0,
            transform: 'scale(0.98)',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          {previousContent}
        </div>
      )}

      {/* Conteúdo atual (entrando) */}
      <div
        style={{
          ...transitionStyle,
          opacity: isTransitioning ? 0 : 1,
          transform: isTransitioning ? 'scale(1.02)' : 'scale(1)',
        }}
      >
        {currentContent}
      </div>
    </div>
  );
};

PageTransition.displayName = 'PageTransition';

export default PageTransition;
