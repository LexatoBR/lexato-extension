/**
 * Componente ScrollIndicator do Design System Lexato
 *
 * Indicador visual de scroll com gradientes fade no topo e base.
 * Mostra quando há conteúdo acima ou abaixo da área visível.
 *
 * @see Requirements 16.1-16.5 (Indicador de Scroll com Gradiente)
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Props do componente ScrollIndicator
 */
export interface ScrollIndicatorProps {
  /** Conteúdo a ser renderizado dentro do container com scroll */
  children: React.ReactNode;
  /** Classe CSS adicional para o container */
  className?: string;
  /** Altura do gradiente em pixels (padrão: 32px) */
  gradientHeight?: number;
  /** Cor base do gradiente (padrão: #0F0E10) */
  gradientColor?: string;
  /** Duração da transição em ms (padrão: 200ms) */
  transitionDuration?: number;
  /** Callback quando o scroll muda */
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
}

/**
 * Componente ScrollIndicator
 *
 * Características:
 * - Gradiente fade no topo quando há conteúdo acima
 * - Gradiente fade na base quando há conteúdo abaixo
 * - Altura do gradiente: 32px (configurável)
 * - Transição suave de 200ms (configurável)
 * - Usa cores do background da extensão (#0F0E10)
 *
 * @example
 * ```tsx
 * <ScrollIndicator>
 *   <div>Conteúdo com scroll...</div>
 * </ScrollIndicator>
 * ```
 *
 * @example
 * ```tsx
 * // Com configurações customizadas
 * <ScrollIndicator
 *   gradientHeight={48}
 *   gradientColor="#161519"
 *   transitionDuration={300}
 * >
 *   <div>Conteúdo...</div>
 * </ScrollIndicator>
 * ```
 */
export const ScrollIndicator: React.FC<ScrollIndicatorProps> = ({
  children,
  className = '',
  gradientHeight = 32,
  gradientColor = '#0F0E10',
  transitionDuration = 200,
  onScroll,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showBottomGradient, setShowBottomGradient] = useState(false);

  /**
   * Verifica a posição do scroll e atualiza os indicadores
   */
  const checkScrollPosition = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = element;

    // Mostra gradiente do topo se há conteúdo acima (scrollTop > 0)
    setShowTopGradient(scrollTop > 0);

    // Mostra gradiente da base se há conteúdo abaixo
    // Usa margem de 1px para evitar problemas de arredondamento
    const hasContentBelow = scrollTop + clientHeight < scrollHeight - 1;
    setShowBottomGradient(hasContentBelow);
  }, []);

  /**
   * Handler do evento de scroll
   */
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      checkScrollPosition();
      onScroll?.(event);
    },
    [checkScrollPosition, onScroll]
  );

  /**
   * Verifica posição inicial e quando o conteúdo muda
   */
  useEffect(() => {
    checkScrollPosition();

    // Observer para detectar mudanças no conteúdo
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      checkScrollPosition();
    });

    resizeObserver.observe(element);

    // Também observa mudanças nos filhos
    const mutationObserver = new MutationObserver(() => {
      checkScrollPosition();
    });

    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [checkScrollPosition]);

  /**
   * Estilos inline para os gradientes
   */
  const gradientTopStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: `${gradientHeight}px`,
    background: `linear-gradient(to bottom, ${gradientColor}, transparent)`,
    pointerEvents: 'none',
    opacity: showTopGradient ? 1 : 0,
    transition: `opacity ${transitionDuration}ms ease`,
    zIndex: 5,
  };

  const gradientBottomStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: `${gradientHeight}px`,
    background: `linear-gradient(to top, ${gradientColor}, transparent)`,
    pointerEvents: 'none',
    opacity: showBottomGradient ? 1 : 0,
    transition: `opacity ${transitionDuration}ms ease`,
    zIndex: 5,
  };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    height: '100%',
  };

  const scrollContainerStyle: React.CSSProperties = {
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
  };

  return (
    <div
      className={`scroll-indicator-container ${className}`.trim()}
      style={containerStyle}
      data-testid="scroll-indicator"
    >
      {/* Gradiente do topo */}
      <div
        className="scroll-indicator-top"
        style={gradientTopStyle}
        aria-hidden="true"
        data-testid="scroll-indicator-top"
        data-visible={showTopGradient}
      />

      {/* Área de scroll */}
      <div
        ref={scrollRef}
        className="scroll-indicator-content"
        style={scrollContainerStyle}
        onScroll={handleScroll}
        data-testid="scroll-indicator-content"
      >
        {children}
      </div>

      {/* Gradiente da base */}
      <div
        className="scroll-indicator-bottom"
        style={gradientBottomStyle}
        aria-hidden="true"
        data-testid="scroll-indicator-bottom"
        data-visible={showBottomGradient}
      />
    </div>
  );
};

ScrollIndicator.displayName = 'ScrollIndicator';

export default ScrollIndicator;
