/**
 * Testes unitários para ProgressBar
 *
 * Testa componente de barra de progresso do overlay
 *
 * Requisitos testados:
 * - 15.2: Exibir progresso percentual
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressBar from '@overlay/ProgressBar';

describe('ProgressBar', () => {
  describe('renderização básica', () => {
    it('deve renderizar a barra de progresso', () => {
      render(<ProgressBar percent={50} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();
    });

    it('deve exibir o percentual correto', () => {
      render(<ProgressBar percent={75} />);

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('deve ter atributos ARIA corretos', () => {
      render(<ProgressBar percent={30} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '30');
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    });
  });

  describe('limites de progresso', () => {
    it('deve limitar progresso a 100% quando maior', () => {
      render(<ProgressBar percent={150} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '100');
    });

    it('deve limitar progresso a 0% quando negativo', () => {
      render(<ProgressBar percent={-20} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    });

    it('deve arredondar percentual no label', () => {
      render(<ProgressBar percent={33.7} />);

      expect(screen.getByText('34%')).toBeInTheDocument();
    });
  });

  describe('opções de exibição', () => {
    it('deve ocultar label quando showLabel é false', () => {
      render(<ProgressBar percent={50} showLabel={false} />);

      expect(screen.queryByText('50%')).not.toBeInTheDocument();
    });

    it('deve exibir label por padrão', () => {
      render(<ProgressBar percent={50} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  describe('valores extremos', () => {
    it('deve renderizar com 0%', () => {
      render(<ProgressBar percent={0} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('deve renderizar com 100%', () => {
      render(<ProgressBar percent={100} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });
});
