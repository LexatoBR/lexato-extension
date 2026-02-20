/**
 * Testes unitários para StorageModal
 *
 * Testa o modal de seleção de armazenamento com glassmorfismo
 * Requisitos: 7.1-7.14
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StorageModal from '@popup/components/StorageModal';

describe('StorageModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    value: 'standard' as const,
    onChange: vi.fn(),
    onConfirm: vi.fn(),
    canUsePremium: vi.fn(() => true),
    credits: 100,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderização', () => {
    it('deve renderizar o modal quando isOpen é true', () => {
      render(<StorageModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Tipo de Armazenamento')).toBeInTheDocument();
    });

    it('não deve renderizar quando isOpen é false', () => {
      render(<StorageModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('deve renderizar todas as opções de armazenamento', () => {
      render(<StorageModal {...defaultProps} />);

      expect(screen.getByText('Padrão')).toBeInTheDocument();
      expect(screen.getByText('Premium 5 anos')).toBeInTheDocument();
      expect(screen.getByText('Premium 10 anos')).toBeInTheDocument();
      expect(screen.getByText('Premium 20 anos')).toBeInTheDocument();
    });

    it('deve exibir custos em créditos', () => {
      render(<StorageModal {...defaultProps} />);

      expect(screen.getByText('1 crédito')).toBeInTheDocument();
      expect(screen.getByText('5 créditos')).toBeInTheDocument();
      expect(screen.getByText('10 créditos')).toBeInTheDocument();
      expect(screen.getByText('20 créditos')).toBeInTheDocument();
    });
  });

  describe('badge RECOMENDADO (Requisito 7.14)', () => {
    it('deve exibir badge RECOMENDADO no Premium 10 anos', () => {
      render(<StorageModal {...defaultProps} />);

      expect(screen.getByText('RECOMENDADO')).toBeInTheDocument();
    });
  });

  describe('interação', () => {
    it('deve chamar onChange ao selecionar opção', () => {
      const onChange = vi.fn();
      render(<StorageModal {...defaultProps} onChange={onChange} />);

      const premium5yButton = screen.getByText('Premium 5 anos').closest('button');
      fireEvent.click(premium5yButton!);

      expect(onChange).toHaveBeenCalledWith('premium_5y');
    });

    it('deve chamar onClose ao clicar no botão fechar', () => {
      const onClose = vi.fn();
      render(<StorageModal {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByLabelText('Fechar modal');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('deve chamar onClose ao clicar no botão Cancelar', () => {
      const onClose = vi.fn();
      render(<StorageModal {...defaultProps} onClose={onClose} />);

      const cancelButton = screen.getByText('Cancelar');
      fireEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('deve chamar onConfirm ao clicar no botão Confirmar', () => {
      const onConfirm = vi.fn();
      render(<StorageModal {...defaultProps} onConfirm={onConfirm} />);

      const confirmButton = screen.getByText('Confirmar');
      fireEvent.click(confirmButton);

      expect(onConfirm).toHaveBeenCalled();
    });

    it('deve chamar onClose ao clicar no overlay', () => {
      const onClose = vi.fn();
      render(<StorageModal {...defaultProps} onClose={onClose} />);

      // O overlay é o próprio elemento com role="dialog" que tem a classe storage-modal-overlay
      const overlay = document.querySelector('.storage-modal-overlay');
      // Simula clique diretamente no overlay (não no modal interno)
      fireEvent.click(overlay!);

      expect(onClose).toHaveBeenCalled();
    });

    it('não deve chamar onClose ao clicar dentro do modal', () => {
      const onClose = vi.fn();
      render(<StorageModal {...defaultProps} onClose={onClose} />);

      const modal = screen.getByText('Tipo de Armazenamento').closest('.storage-modal');
      fireEvent.click(modal!);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('estados visuais', () => {
    it('deve marcar opção selecionada como active', () => {
      render(<StorageModal {...defaultProps} value="premium_10y" />);

      const premium10yButton = screen.getByText('Premium 10 anos').closest('button');
      expect(premium10yButton).toHaveClass('active');
    });

    it('deve desabilitar opções premium quando canUsePremium retorna false', () => {
      const canUsePremium = vi.fn((type) => type === 'standard');

      render(
        <StorageModal
          {...defaultProps}
          canUsePremium={canUsePremium}
          credits={3}
        />
      );

      const premium5yButton = screen.getByText('Premium 5 anos').closest('button');
      expect(premium5yButton).toHaveClass('disabled');
    });

    it('deve exibir mensagem de créditos insuficientes', () => {
      const canUsePremium = vi.fn((type) => type === 'standard');

      render(
        <StorageModal
          {...defaultProps}
          canUsePremium={canUsePremium}
          credits={3}
        />
      );

      expect(screen.getAllByText(/insuficiente/i).length).toBeGreaterThan(0);
    });
  });

  describe('acessibilidade', () => {
    it('deve ter role dialog', () => {
      render(<StorageModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('deve ter aria-modal true', () => {
      render(<StorageModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('deve ter aria-labelledby apontando para o título', () => {
      render(<StorageModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'storage-modal-title');
    });

    it('deve fechar ao pressionar Escape', () => {
      const onClose = vi.fn();
      render(<StorageModal {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });
  });
});
