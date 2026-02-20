/**
 * Testes unitários para CreditsBar
 *
 * Valida exibição de créditos, cores por nível e tooltips.
 *
 * @see Requirements 4.1-4.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreditsBar } from '@popup/components/CreditsBar';

describe('CreditsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderização', () => {
    it('deve renderizar com role meter e aria-label correto', () => {
      render(<CreditsBar credits={50} />);

      const meter = screen.getByRole('meter', { name: 'Créditos disponíveis' });
      expect(meter).toBeInTheDocument();
    });

    it('deve exibir número de créditos', () => {
      render(<CreditsBar credits={42} />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('deve ter aria-valuenow com valor correto', () => {
      render(<CreditsBar credits={75} />);

      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('aria-valuenow', '75');
    });

    it('deve ter aria-valuemin e aria-valuemax corretos', () => {
      render(<CreditsBar credits={50} maxCredits={200} />);

      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('aria-valuemin', '0');
      expect(meter).toHaveAttribute('aria-valuemax', '200');
    });
  });

  describe('cores por nível de créditos', () => {
    it('deve usar cor verde quando créditos > 10 (high)', () => {
      const { container } = render(<CreditsBar credits={50} />);

      const valueElement = container.querySelector('.credits-bar__value');
      expect(valueElement).toHaveStyle({ color: 'var(--green-bright)' });
    });

    it('deve usar cor amarela quando créditos entre 1-10 (medium)', () => {
      const { container } = render(<CreditsBar credits={5} />);

      const valueElement = container.querySelector('.credits-bar__value');
      expect(valueElement).toHaveStyle({ color: 'var(--color-warning)' });
    });

    it('deve usar cor vermelha quando créditos = 0 (low)', () => {
      const { container } = render(<CreditsBar credits={0} />);

      const valueElement = container.querySelector('.credits-bar__value');
      expect(valueElement).toHaveStyle({ color: 'var(--color-error)' });
    });

    it('deve usar cor amarela quando créditos = 10 (limite medium)', () => {
      const { container } = render(<CreditsBar credits={10} />);

      const valueElement = container.querySelector('.credits-bar__value');
      expect(valueElement).toHaveStyle({ color: 'var(--color-warning)' });
    });

    it('deve usar cor verde quando créditos = 11 (limite high)', () => {
      const { container } = render(<CreditsBar credits={11} />);

      const valueElement = container.querySelector('.credits-bar__value');
      expect(valueElement).toHaveStyle({ color: 'var(--green-bright)' });
    });

    it('deve usar cor amarela quando créditos = 1 (limite low/medium)', () => {
      const { container } = render(<CreditsBar credits={1} />);

      const valueElement = container.querySelector('.credits-bar__value');
      expect(valueElement).toHaveStyle({ color: 'var(--color-warning)' });
    });
  });

  describe('barra de preenchimento', () => {
    it('deve calcular porcentagem correta de preenchimento', () => {
      const { container } = render(<CreditsBar credits={50} maxCredits={100} />);

      const fillElement = container.querySelector('.credits-bar__fill');
      expect(fillElement).toHaveStyle({ height: '50%' });
    });

    it('deve limitar preenchimento a 100%', () => {
      const { container } = render(<CreditsBar credits={150} maxCredits={100} />);

      const fillElement = container.querySelector('.credits-bar__fill');
      expect(fillElement).toHaveStyle({ height: '100%' });
    });

    it('deve usar gradiente verde quando créditos > 10', () => {
      const { container } = render(<CreditsBar credits={50} />);

      const fillElement = container.querySelector('.credits-bar__fill');
      expect(fillElement).toHaveStyle({
        background: 'linear-gradient(to top, var(--green-mid), var(--green-bright))',
      });
    });

    it('deve usar cor amarela sólida quando créditos entre 1-10', () => {
      const { container } = render(<CreditsBar credits={5} />);

      const fillElement = container.querySelector('.credits-bar__fill');
      expect(fillElement).toHaveStyle({ background: 'var(--color-warning)' });
    });

    it('deve usar cor vermelha sólida quando créditos = 0', () => {
      const { container } = render(<CreditsBar credits={0} />);

      const fillElement = container.querySelector('.credits-bar__fill');
      expect(fillElement).toHaveStyle({ background: 'var(--color-error)' });
    });
  });

  describe('tooltip', () => {
    it('deve exibir tooltip ao passar mouse', () => {
      render(<CreditsBar credits={25} />);

      const meter = screen.getByRole('meter');
      fireEvent.mouseEnter(meter);

      expect(screen.getByRole('tooltip')).toHaveTextContent('25 créditos disponíveis');
    });

    it('deve ocultar tooltip ao remover mouse', () => {
      render(<CreditsBar credits={25} />);

      const meter = screen.getByRole('meter');
      
      fireEvent.mouseEnter(meter);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.mouseLeave(meter);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('deve exibir texto correto para 0 créditos', () => {
      render(<CreditsBar credits={0} />);

      const meter = screen.getByRole('meter');
      fireEvent.mouseEnter(meter);

      expect(screen.getByRole('tooltip')).toHaveTextContent('0 créditos disponíveis');
    });

    it('deve exibir texto correto para 1 crédito', () => {
      render(<CreditsBar credits={1} />);

      const meter = screen.getByRole('meter');
      fireEvent.mouseEnter(meter);

      expect(screen.getByRole('tooltip')).toHaveTextContent('1 créditos disponíveis');
    });
  });

  describe('maxCredits customizado', () => {
    it('deve usar maxCredits padrão de 100', () => {
      const { container } = render(<CreditsBar credits={25} />);

      const fillElement = container.querySelector('.credits-bar__fill');
      expect(fillElement).toHaveStyle({ height: '25%' });
    });

    it('deve calcular porcentagem com maxCredits customizado', () => {
      const { container } = render(<CreditsBar credits={50} maxCredits={200} />);

      const fillElement = container.querySelector('.credits-bar__fill');
      expect(fillElement).toHaveStyle({ height: '25%' });
    });
  });
});
