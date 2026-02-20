/**
 * Testes unitários para QuickActions
 *
 * @see Requirements 26.1-26.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickActions } from '../../../src/components/shared/QuickActions';

describe('QuickActions', () => {
  const defaultProps = {
    hash: '0x1234567890abcdef1234567890abcdef12345678',
    onOpenDetails: vi.fn(),
    onDownload: vi.fn(),
    visible: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renderiza quando visible=true', () => {
    render(<QuickActions {...defaultProps} />);
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
  });

  it('fica oculto quando visible=false', () => {
    render(<QuickActions {...defaultProps} visible={false} />);
    const container = screen.getByTestId('quick-actions');
    expect(container).toHaveClass('opacity-0');
    expect(container).toHaveClass('pointer-events-none');
  });

  it('renderiza 3 botões de ação', () => {
    render(<QuickActions {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('chama onOpenDetails ao clicar no botão de detalhes', () => {
    render(<QuickActions {...defaultProps} />);
    const detailsButton = screen.getByLabelText('Abrir detalhes da evidência');
    fireEvent.click(detailsButton);
    expect(defaultProps.onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it('chama onDownload ao clicar no botão de download', () => {
    render(<QuickActions {...defaultProps} />);
    const downloadButton = screen.getByLabelText('Baixar arquivo original');
    fireEvent.click(downloadButton);
    expect(defaultProps.onDownload).toHaveBeenCalledTimes(1);
  });

  it('copia hash ao clicar no botão de cópia', async () => {
    render(<QuickActions {...defaultProps} />);
    const copyButton = screen.getByTestId('copy-button');
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(defaultProps.hash);
  });

  it('tem role="toolbar" para acessibilidade', () => {
    render(<QuickActions {...defaultProps} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('aplica classes CSS adicionais', () => {
    render(<QuickActions {...defaultProps} className="custom-class" />);
    expect(screen.getByTestId('quick-actions')).toHaveClass('custom-class');
  });

  it('tem background glass', () => {
    render(<QuickActions {...defaultProps} />);
    const container = screen.getByTestId('quick-actions');
    expect(container).toHaveClass('bg-glass-background');
    expect(container).toHaveClass('backdrop-blur-md');
  });

  it('tem transição de 150ms', () => {
    render(<QuickActions {...defaultProps} />);
    const container = screen.getByTestId('quick-actions');
    expect(container).toHaveClass('duration-150');
  });
});
