/**
 * Testes do componente Skeleton
 *
 * Verifica que os skeletons têm dimensões idênticas aos componentes reais.
 *
 * @see Requirements 14.1-14.8
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  SkeletonEvidenceCard,
  SkeletonList,
} from '../../../../src/components/ui/Skeleton';

describe('Skeleton', () => {
  describe('Skeleton base', () => {
    it('deve renderizar com classes de animação pulse', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');

      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton).toHaveClass('bg-[rgba(255,255,255,0.05)]');
    });

    it('deve aceitar largura e altura customizadas em pixels', () => {
      render(<Skeleton width={100} height={50} data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');

      expect(skeleton).toHaveStyle({ width: '100px', height: '50px' });
    });

    it('deve aceitar largura e altura como string', () => {
      render(<Skeleton width="50%" height="2rem" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');

      expect(skeleton).toHaveStyle({ width: '50%', height: '2rem' });
    });

    it('deve ter aria-hidden para acessibilidade', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');

      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
      expect(skeleton).toHaveAttribute('role', 'presentation');
    });
  });

  describe('SkeletonText', () => {
    it('deve renderizar variante title com altura h-5 (20px)', () => {
      render(<SkeletonText variant="title" data-testid="skeleton-text" />);
      const skeleton = screen.getByTestId('skeleton-text');

      expect(skeleton).toHaveClass('h-5');
    });

    it('deve renderizar variante body com altura h-4 (16px)', () => {
      render(<SkeletonText variant="body" data-testid="skeleton-text" />);
      const skeleton = screen.getByTestId('skeleton-text');

      expect(skeleton).toHaveClass('h-4');
    });

    it('deve renderizar variante caption com altura h-3 (12px)', () => {
      render(<SkeletonText variant="caption" data-testid="skeleton-text" />);
      const skeleton = screen.getByTestId('skeleton-text');

      expect(skeleton).toHaveClass('h-3');
    });

    it('deve renderizar múltiplas linhas', () => {
      render(<SkeletonText lines={3} data-testid="skeleton-text" />);
      const container = screen.getByTestId('skeleton-text');
      const lines = container.querySelectorAll('div');

      expect(lines).toHaveLength(3);
    });

    it('deve ter última linha mais curta (75%)', () => {
      render(<SkeletonText lines={3} data-testid="skeleton-text" />);
      const container = screen.getByTestId('skeleton-text');
      const lines = container.querySelectorAll('div');
      const lastLine = lines[lines.length - 1];

      expect(lastLine).toHaveStyle({ width: '75%' });
    });
  });

  describe('SkeletonAvatar', () => {
    it('deve renderizar tamanho sm com 32px (w-8 h-8)', () => {
      render(<SkeletonAvatar size="sm" data-testid="skeleton-avatar" />);
      const skeleton = screen.getByTestId('skeleton-avatar');

      expect(skeleton).toHaveClass('w-8', 'h-8');
      expect(skeleton).toHaveClass('rounded-full');
    });

    it('deve renderizar tamanho md com 40px (w-10 h-10)', () => {
      render(<SkeletonAvatar size="md" data-testid="skeleton-avatar" />);
      const skeleton = screen.getByTestId('skeleton-avatar');

      expect(skeleton).toHaveClass('w-10', 'h-10');
    });

    it('deve renderizar tamanho lg com 48px (w-12 h-12)', () => {
      render(<SkeletonAvatar size="lg" data-testid="skeleton-avatar" />);
      const skeleton = screen.getByTestId('skeleton-avatar');

      expect(skeleton).toHaveClass('w-12', 'h-12');
    });

    it('deve ser circular (rounded-full)', () => {
      render(<SkeletonAvatar data-testid="skeleton-avatar" />);
      const skeleton = screen.getByTestId('skeleton-avatar');

      expect(skeleton).toHaveClass('rounded-full');
    });
  });

  describe('SkeletonButton', () => {
    it('deve renderizar tamanho sm com altura 32px (h-8)', () => {
      render(<SkeletonButton size="sm" data-testid="skeleton-button" />);
      const skeleton = screen.getByTestId('skeleton-button');

      expect(skeleton).toHaveClass('h-8');
    });

    it('deve renderizar tamanho md com altura 40px (h-10)', () => {
      render(<SkeletonButton size="md" data-testid="skeleton-button" />);
      const skeleton = screen.getByTestId('skeleton-button');

      expect(skeleton).toHaveClass('h-10');
    });

    it('deve renderizar tamanho lg com altura 48px (h-12)', () => {
      render(<SkeletonButton size="lg" data-testid="skeleton-button" />);
      const skeleton = screen.getByTestId('skeleton-button');

      expect(skeleton).toHaveClass('h-12');
    });

    it('deve renderizar tamanho xl com altura 56px (h-14)', () => {
      render(<SkeletonButton size="xl" data-testid="skeleton-button" />);
      const skeleton = screen.getByTestId('skeleton-button');

      expect(skeleton).toHaveClass('h-14');
    });

    it('deve aceitar largura customizada', () => {
      render(<SkeletonButton width={200} data-testid="skeleton-button" />);
      const skeleton = screen.getByTestId('skeleton-button');

      expect(skeleton).toHaveStyle({ width: '200px' });
    });
  });

  describe('SkeletonCard', () => {
    it('deve renderizar com padding p-4 e rounded-lg', () => {
      render(<SkeletonCard data-testid="skeleton-card" />);
      const skeleton = screen.getByTestId('skeleton-card');

      expect(skeleton).toHaveClass('p-4', 'rounded-lg');
    });

    it('deve renderizar com indicador lateral quando showIndicator=true', () => {
      render(<SkeletonCard showIndicator data-testid="skeleton-card" />);
      const skeleton = screen.getByTestId('skeleton-card');

      expect(skeleton).toHaveClass('border-l-[3px]');
    });

    it('deve aceitar altura customizada', () => {
      render(<SkeletonCard height={120} data-testid="skeleton-card" />);
      const skeleton = screen.getByTestId('skeleton-card');

      expect(skeleton).toHaveStyle({ height: '120px' });
    });

    it('deve conter elementos internos (título, texto, botões)', () => {
      render(<SkeletonCard data-testid="skeleton-card" />);
      const skeleton = screen.getByTestId('skeleton-card');

      // Deve ter elementos filhos para simular conteúdo
      expect(skeleton.querySelector('.space-y-3')).toBeInTheDocument();
    });
  });

  describe('SkeletonEvidenceCard', () => {
    it('deve ter altura fixa de 88px', () => {
      render(<SkeletonEvidenceCard data-testid="skeleton-evidence" />);
      const skeleton = screen.getByTestId('skeleton-evidence');

      expect(skeleton).toHaveClass('h-[88px]');
    });

    it('deve ter indicador lateral', () => {
      render(<SkeletonEvidenceCard data-testid="skeleton-evidence" />);
      const skeleton = screen.getByTestId('skeleton-evidence');

      expect(skeleton).toHaveClass('border-l-[3px]');
    });

    it('deve conter thumbnail, conteúdo e badge', () => {
      render(<SkeletonEvidenceCard data-testid="skeleton-evidence" />);
      const skeleton = screen.getByTestId('skeleton-evidence');

      // Thumbnail (w-14 h-14)
      expect(skeleton.querySelector('.w-14.h-14')).toBeInTheDocument();
      // Badge (w-16 h-5)
      expect(skeleton.querySelector('.w-16.h-5')).toBeInTheDocument();
    });
  });

  describe('SkeletonList', () => {
    it('deve renderizar número correto de itens', () => {
      render(<SkeletonList count={5} data-testid="skeleton-list" />);
      const container = screen.getByTestId('skeleton-list');
      const items = container.children;

      expect(items).toHaveLength(5);
    });

    it('deve renderizar cards por padrão', () => {
      render(<SkeletonList count={2} data-testid="skeleton-list" />);
      const container = screen.getByTestId('skeleton-list');
      const cards = container.querySelectorAll('.p-4.rounded-lg');

      expect(cards).toHaveLength(2);
    });

    it('deve renderizar evidence cards quando itemType="evidence"', () => {
      render(<SkeletonList count={2} itemType="evidence" data-testid="skeleton-list" />);
      const container = screen.getByTestId('skeleton-list');
      const evidenceCards = container.querySelectorAll('.h-\\[88px\\]');

      expect(evidenceCards).toHaveLength(2);
    });

    it('deve renderizar texto quando itemType="text"', () => {
      render(<SkeletonList count={3} itemType="text" data-testid="skeleton-list" />);
      const container = screen.getByTestId('skeleton-list');
      const textItems = container.querySelectorAll('.h-4');

      expect(textItems).toHaveLength(3);
    });

    it('deve ter espaçamento entre itens (space-y-3)', () => {
      render(<SkeletonList data-testid="skeleton-list" />);
      const container = screen.getByTestId('skeleton-list');

      expect(container).toHaveClass('space-y-3');
    });
  });
});
