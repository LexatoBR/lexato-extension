/**
 * Testes unitários para o componente ScrollIndicator
 *
 * Verifica:
 * - Renderização básica
 * - Gradientes aparecem/desaparecem corretamente
 * - Props customizáveis funcionam
 * - Callback onScroll é chamado
 *
 * @see Requirements 16.1-16.5
 */

// @ts-expect-error React é necessário para JSX mesmo que não seja usado diretamente
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScrollIndicator } from '../../../../src/components/shared/ScrollIndicator';

// Mock do ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    // Mock implementation
  }

  unobserve(): void {
    // Mock implementation
  }

  disconnect(): void {
    // Mock implementation
  }
}

// Mock do MutationObserver
class MockMutationObserver {
  callback: MutationCallback;

  constructor(callback: MutationCallback) {
    this.callback = callback;
  }

  observe(): void {
    // Mock implementation
  }

  disconnect(): void {
    // Mock implementation
  }

  takeRecords(): MutationRecord[] {
    return [];
  }
}

describe('ScrollIndicator', () => {
  beforeEach(() => {
    // Setup mocks
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('MutationObserver', MockMutationObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Renderização básica', () => {
    it('deve renderizar o container principal', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      expect(screen.getByTestId('scroll-indicator')).toBeInTheDocument();
    });

    it('deve renderizar o conteúdo filho', () => {
      render(
        <ScrollIndicator>
          <div data-testid="child-content">Conteúdo de teste</div>
        </ScrollIndicator>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Conteúdo de teste')).toBeInTheDocument();
    });

    it('deve renderizar os indicadores de gradiente', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      expect(screen.getByTestId('scroll-indicator-top')).toBeInTheDocument();
      expect(screen.getByTestId('scroll-indicator-bottom')).toBeInTheDocument();
    });

    it('deve renderizar a área de scroll', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      expect(screen.getByTestId('scroll-indicator-content')).toBeInTheDocument();
    });
  });

  describe('Visibilidade dos gradientes', () => {
    it('deve iniciar com gradiente do topo invisível', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      expect(topGradient).toHaveAttribute('data-visible', 'false');
    });

    it('deve ter aria-hidden nos gradientes', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      const bottomGradient = screen.getByTestId('scroll-indicator-bottom');

      expect(topGradient).toHaveAttribute('aria-hidden', 'true');
      expect(bottomGradient).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Props customizáveis', () => {
    it('deve aplicar className adicional', () => {
      render(
        <ScrollIndicator className="custom-class">
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const container = screen.getByTestId('scroll-indicator');
      expect(container).toHaveClass('custom-class');
    });

    it('deve usar altura de gradiente customizada', () => {
      const customHeight = 48;
      render(
        <ScrollIndicator gradientHeight={customHeight}>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      expect(topGradient).toHaveStyle({ height: `${customHeight}px` });
    });

    it('deve usar cor de gradiente customizada', () => {
      const customColor = '#161519';
      render(
        <ScrollIndicator gradientColor={customColor}>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      expect(topGradient).toHaveStyle({
        background: `linear-gradient(to bottom, ${customColor}, transparent)`,
      });
    });

    it('deve usar duração de transição customizada', () => {
      const customDuration = 300;
      render(
        <ScrollIndicator transitionDuration={customDuration}>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      expect(topGradient).toHaveStyle({
        transition: `opacity ${customDuration}ms ease`,
      });
    });
  });

  describe('Callback onScroll', () => {
    it('deve chamar onScroll quando o conteúdo é scrollado', () => {
      const handleScroll = vi.fn();
      render(
        <ScrollIndicator onScroll={handleScroll}>
          <div style={{ height: '1000px' }}>Conteúdo grande</div>
        </ScrollIndicator>
      );

      const scrollContent = screen.getByTestId('scroll-indicator-content');
      fireEvent.scroll(scrollContent);

      expect(handleScroll).toHaveBeenCalled();
    });

    it('deve passar o evento de scroll para o callback', () => {
      const handleScroll = vi.fn();
      render(
        <ScrollIndicator onScroll={handleScroll}>
          <div style={{ height: '1000px' }}>Conteúdo grande</div>
        </ScrollIndicator>
      );

      const scrollContent = screen.getByTestId('scroll-indicator-content');
      fireEvent.scroll(scrollContent);

      expect(handleScroll).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('Estilos do container', () => {
    it('deve ter position relative no container', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const container = screen.getByTestId('scroll-indicator');
      expect(container).toHaveStyle({ position: 'relative' });
    });

    it('deve ter overflow hidden no container', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const container = screen.getByTestId('scroll-indicator');
      expect(container).toHaveStyle({ overflow: 'hidden' });
    });

    it('deve ter height 100% no container', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const container = screen.getByTestId('scroll-indicator');
      expect(container).toHaveStyle({ height: '100%' });
    });
  });

  describe('Estilos dos gradientes', () => {
    it('deve ter pointer-events none nos gradientes', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      const bottomGradient = screen.getByTestId('scroll-indicator-bottom');

      expect(topGradient).toHaveStyle({ pointerEvents: 'none' });
      expect(bottomGradient).toHaveStyle({ pointerEvents: 'none' });
    });

    it('deve ter z-index 5 nos gradientes', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      const bottomGradient = screen.getByTestId('scroll-indicator-bottom');

      expect(topGradient).toHaveStyle({ zIndex: '5' });
      expect(bottomGradient).toHaveStyle({ zIndex: '5' });
    });

    it('deve ter position absolute nos gradientes', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      const bottomGradient = screen.getByTestId('scroll-indicator-bottom');

      expect(topGradient).toHaveStyle({ position: 'absolute' });
      expect(bottomGradient).toHaveStyle({ position: 'absolute' });
    });

    it('deve ter gradiente correto no topo (to bottom)', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      expect(topGradient).toHaveStyle({
        background: 'linear-gradient(to bottom, #0F0E10, transparent)',
      });
    });

    it('deve ter gradiente correto na base (to top)', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const bottomGradient = screen.getByTestId('scroll-indicator-bottom');
      expect(bottomGradient).toHaveStyle({
        background: 'linear-gradient(to top, #0F0E10, transparent)',
      });
    });
  });

  describe('Valores padrão', () => {
    it('deve usar altura de gradiente padrão de 32px', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      expect(topGradient).toHaveStyle({ height: '32px' });
    });

    it('deve usar cor de gradiente padrão #0F0E10', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      expect(topGradient).toHaveStyle({
        background: 'linear-gradient(to bottom, #0F0E10, transparent)',
      });
    });

    it('deve usar duração de transição padrão de 200ms', () => {
      render(
        <ScrollIndicator>
          <div>Conteúdo</div>
        </ScrollIndicator>
      );

      const topGradient = screen.getByTestId('scroll-indicator-top');
      expect(topGradient).toHaveStyle({
        transition: 'opacity 200ms ease',
      });
    });
  });

  describe('DisplayName', () => {
    it('deve ter displayName correto', () => {
      expect(ScrollIndicator.displayName).toBe('ScrollIndicator');
    });
  });
});
