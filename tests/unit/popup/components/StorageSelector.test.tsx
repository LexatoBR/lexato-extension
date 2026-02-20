/**
 * Testes unitários para StorageSelector
 *
 * Testa seleção de tipo de armazenamento
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StorageSelector from '@popup/components/StorageSelector';

describe('StorageSelector', () => {
  const defaultProps = {
    value: 'standard' as const,
    onChange: vi.fn(),
    canUsePremium: vi.fn(() => true),
    credits: 100,
    disabled: false,
  };

  describe('renderização', () => {
    it('deve renderizar todas as opções de armazenamento', () => {
      render(<StorageSelector {...defaultProps} />);

      expect(screen.getByText('Standard')).toBeInTheDocument();
      expect(screen.getByText('Premium 5 anos')).toBeInTheDocument();
      expect(screen.getByText('Premium 10 anos')).toBeInTheDocument();
      expect(screen.getByText('Premium 20 anos')).toBeInTheDocument();
    });

    it('deve exibir custos em créditos', () => {
      render(<StorageSelector {...defaultProps} />);

      expect(screen.getByText('1 crédito')).toBeInTheDocument();
      expect(screen.getByText('5 créditos')).toBeInTheDocument();
      expect(screen.getByText('10 créditos')).toBeInTheDocument();
      expect(screen.getByText('20 créditos')).toBeInTheDocument();
    });

    it('deve marcar opção selecionada', () => {
      render(<StorageSelector {...defaultProps} value="premium_5y" />);

      const premium5yButton = screen.getByRole('button', { name: /Premium 5 anos/i });
      expect(premium5yButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('interação', () => {
    it('deve chamar onChange ao selecionar opção', () => {
      const onChange = vi.fn();
      render(<StorageSelector {...defaultProps} onChange={onChange} />);

      const premium5yButton = screen.getByRole('button', { name: /Premium 5 anos/i });
      fireEvent.click(premium5yButton);

      expect(onChange).toHaveBeenCalledWith('premium_5y');
    });

    it('não deve chamar onChange quando desabilitado', () => {
      const onChange = vi.fn();
      render(<StorageSelector {...defaultProps} onChange={onChange} disabled={true} />);

      const premium5yButton = screen.getByRole('button', { name: /Premium 5 anos/i });
      fireEvent.click(premium5yButton);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('créditos insuficientes (Requisito 4.9)', () => {
    it('deve desabilitar opções premium quando canUsePremium retorna false', () => {
      const canUsePremium = vi.fn((type) => type === 'standard');

      render(
        <StorageSelector
          {...defaultProps}
          canUsePremium={canUsePremium}
          credits={3}
        />
      );

      const premium5yButton = screen.getByRole('button', { name: /Premium 5 anos/i });
      expect(premium5yButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('deve exibir mensagem de créditos insuficientes quando credits < 5', () => {
      render(<StorageSelector {...defaultProps} credits={3} />);

      expect(screen.getByText(/Créditos insuficientes para opções premium/i)).toBeInTheDocument();
    });

    it('não deve exibir mensagem quando tem créditos suficientes', () => {
      render(<StorageSelector {...defaultProps} credits={10} />);

      expect(screen.queryByText(/Créditos insuficientes/i)).not.toBeInTheDocument();
    });

    it('deve exibir link para comprar créditos', () => {
      render(<StorageSelector {...defaultProps} credits={3} />);

      const link = screen.getByRole('link', { name: /Comprar créditos/i });
      expect(link).toHaveAttribute('href', 'https://lexato.com.br/creditos');
    });
  });

  describe('badges premium', () => {
    it('deve exibir badge Premium nas opções premium', () => {
      render(<StorageSelector {...defaultProps} />);

      const premiumBadges = screen.getAllByText('Premium');
      // 3 opções premium (5y, 10y, 20y)
      expect(premiumBadges.length).toBe(3);
    });
  });
});
