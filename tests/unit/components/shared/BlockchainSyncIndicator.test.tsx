/**
 * Testes unitários para BlockchainSyncIndicator
 *
 * Verifica:
 * - Renderização de status (registering, confirming, verified)
 * - Animação pulse-glow durante registro
 * - Checkmark com glow ao verificar
 * - Ícone de blockchain/chain-link
 * - Tamanhos (sm, md, lg)
 * - Callback onVerified
 *
 * @see Requirements 21.1-21.5
 */

// @ts-expect-error React é necessário para JSX mesmo que não seja usado diretamente
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  BlockchainSyncIndicator,
  BlockchainSyncStatus,
} from '../../../../src/components/shared/BlockchainSyncIndicator';

describe('BlockchainSyncIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Renderização de status', () => {
    const statuses: BlockchainSyncStatus[] = ['registering', 'confirming', 'verified'];

    statuses.forEach((status) => {
      it(`deve renderizar status ${status}`, () => {
        render(<BlockchainSyncIndicator status={status} />);

        const indicator = screen.getByTestId('blockchain-sync-indicator');
        expect(indicator).toBeInTheDocument();
        expect(indicator).toHaveAttribute('data-status', status);
        expect(indicator).toHaveAttribute('role', 'status');
      });
    });

    it('deve exibir label "Registrando..." para status registering', () => {
      render(<BlockchainSyncIndicator status="registering" />);
      expect(screen.getByText('Registrando...')).toBeInTheDocument();
    });

    it('deve exibir label "Confirmando..." para status confirming', () => {
      render(<BlockchainSyncIndicator status="confirming" />);
      expect(screen.getByText('Confirmando...')).toBeInTheDocument();
    });

    it('deve exibir label "Verificado ✓" para status verified', () => {
      render(<BlockchainSyncIndicator status="verified" />);
      expect(screen.getByText('Verificado ✓')).toBeInTheDocument();
    });
  });

  describe('Animações', () => {
    it('deve aplicar animação pulse-glow durante registering', () => {
      render(<BlockchainSyncIndicator status="registering" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('animate-pulse-glow');
    });

    it('deve aplicar animação pulse-glow durante confirming', () => {
      render(<BlockchainSyncIndicator status="confirming" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('animate-pulse-glow');
    });

    it('deve aplicar animação verified-glow quando verified', () => {
      render(<BlockchainSyncIndicator status="verified" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('animate-verified-glow');
    });

    it('deve aplicar animação spin no ícone durante registering', () => {
      render(<BlockchainSyncIndicator status="registering" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      const svg = indicator.querySelector('svg');
      expect(svg?.className.baseVal || svg?.getAttribute('class')).toContain('animate-spin');
    });

    it('deve aplicar animação spin no ícone durante confirming', () => {
      render(<BlockchainSyncIndicator status="confirming" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      const svg = indicator.querySelector('svg');
      expect(svg?.className.baseVal || svg?.getAttribute('class')).toContain('animate-spin');
    });
  });

  describe('Ícones', () => {
    it('deve renderizar ícone de spinner durante registering', () => {
      render(<BlockchainSyncIndicator status="registering" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      const svg = indicator.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // Spinner tem path com arco
      expect(svg?.querySelector('path')).toBeInTheDocument();
    });

    it('deve renderizar ícone de checkmark quando verified', () => {
      render(<BlockchainSyncIndicator status="verified" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      const svg = indicator.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // Checkmark tem polyline
      expect(svg?.querySelector('polyline')).toBeInTheDocument();
    });
  });

  describe('Tamanhos', () => {
    it('deve renderizar tamanho sm', () => {
      render(<BlockchainSyncIndicator status="registering" size="sm" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('px-2');
      expect(indicator.className).toContain('py-1');
    });

    it('deve renderizar tamanho md (padrão)', () => {
      render(<BlockchainSyncIndicator status="registering" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('px-2.5');
    });

    it('deve renderizar tamanho lg', () => {
      render(<BlockchainSyncIndicator status="registering" size="lg" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('px-3');
      expect(indicator.className).toContain('py-1.5');
    });
  });

  describe('showLabel', () => {
    it('deve mostrar label por padrão', () => {
      render(<BlockchainSyncIndicator status="registering" />);
      expect(screen.getByText('Registrando...')).toBeInTheDocument();
    });

    it('deve ocultar label quando showLabel=false', () => {
      render(<BlockchainSyncIndicator status="registering" showLabel={false} />);
      expect(screen.queryByText('Registrando...')).not.toBeInTheDocument();
    });
  });

  describe('Callback onVerified', () => {
    it('deve chamar onVerified após 3 segundos quando status é verified', () => {
      const onVerified = vi.fn();
      render(<BlockchainSyncIndicator status="verified" onVerified={onVerified} />);

      expect(onVerified).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(onVerified).toHaveBeenCalledTimes(1);
    });

    it('não deve chamar onVerified para status registering', () => {
      const onVerified = vi.fn();
      render(<BlockchainSyncIndicator status="registering" onVerified={onVerified} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(onVerified).not.toHaveBeenCalled();
    });

    it('não deve chamar onVerified para status confirming', () => {
      const onVerified = vi.fn();
      render(<BlockchainSyncIndicator status="confirming" onVerified={onVerified} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(onVerified).not.toHaveBeenCalled();
    });
  });

  describe('Acessibilidade', () => {
    it('deve ter role="status"', () => {
      render(<BlockchainSyncIndicator status="registering" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator).toHaveAttribute('role', 'status');
    });

    it('deve ter aria-live="polite"', () => {
      render(<BlockchainSyncIndicator status="registering" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator).toHaveAttribute('aria-live', 'polite');
    });

    it('deve ter aria-label com texto do status', () => {
      render(<BlockchainSyncIndicator status="verified" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator).toHaveAttribute('aria-label', 'Verificado ✓');
    });
  });

  describe('Classes CSS', () => {
    it('deve aplicar className customizada', () => {
      render(<BlockchainSyncIndicator status="registering" className="custom-class" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('custom-class');
    });

    it('deve ter cor primária (verde Lexato)', () => {
      render(<BlockchainSyncIndicator status="registering" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('text-primary');
    });

    it('deve ter background com opacidade', () => {
      render(<BlockchainSyncIndicator status="registering" />);

      const indicator = screen.getByTestId('blockchain-sync-indicator');
      expect(indicator.className).toContain('bg-[rgba(0,222,165,0.1)]');
    });
  });

  describe('DisplayName', () => {
    it('deve ter displayName correto', () => {
      expect(BlockchainSyncIndicator.displayName).toBe('BlockchainSyncIndicator');
    });
  });
});
