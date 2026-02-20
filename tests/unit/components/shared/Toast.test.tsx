/**
 * Testes unitários para Toast e ToastProvider
 *
 * Verifica:
 * - Renderização de variantes
 * - Auto-dismiss
 * - Progress bar
 * - Botão de ação
 * - Empilhamento de toasts
 *
 * @see Requirements 17.1-17.7
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Toast, ToastVariant } from '../../../../src/components/shared/Toast';
import { ToastProvider, useToast } from '../../../../src/components/shared/ToastProvider';

describe('Toast', () => {
  const defaultProps = {
    id: 'test-toast',
    variant: 'success' as ToastVariant,
    message: 'Mensagem de teste',
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    defaultProps.onDismiss.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Renderização de variantes', () => {
    const variants: ToastVariant[] = ['success', 'error', 'warning', 'info'];

    variants.forEach((variant) => {
      it(`deve renderizar variante ${variant}`, () => {
        render(<Toast {...defaultProps} variant={variant} />);

        const toast = screen.getByTestId(`toast-${defaultProps.id}`);
        expect(toast).toBeInTheDocument();
        expect(toast).toHaveAttribute('role', 'alert');
      });
    });

    it('deve renderizar mensagem corretamente', () => {
      render(<Toast {...defaultProps} />);
      expect(screen.getByText('Mensagem de teste')).toBeInTheDocument();
    });

    it('deve renderizar título quando fornecido', () => {
      render(<Toast {...defaultProps} title="Título do Toast" />);
      expect(screen.getByText('Título do Toast')).toBeInTheDocument();
    });
  });

  describe('Auto-dismiss', () => {
    it('deve chamar onDismiss após duração padrão (5000ms)', async () => {
      render(<Toast {...defaultProps} />);

      // Avança o tempo para além da duração + animação de saída
      act(() => {
        vi.advanceTimersByTime(5200);
      });

      expect(defaultProps.onDismiss).toHaveBeenCalledWith(defaultProps.id);
    });

    it('deve respeitar duração customizada', async () => {
      render(<Toast {...defaultProps} duration={2000} />);

      // Não deve ter chamado ainda
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(defaultProps.onDismiss).not.toHaveBeenCalled();

      // Agora deve chamar
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(defaultProps.onDismiss).toHaveBeenCalledWith(defaultProps.id);
    });
  });

  describe('Progress bar', () => {
    it('deve renderizar progress bar por padrão', () => {
      render(<Toast {...defaultProps} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('deve ocultar progress bar quando showProgress=false', () => {
      render(<Toast {...defaultProps} showProgress={false} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('deve ter aria-valuenow no progress bar', () => {
      render(<Toast {...defaultProps} />);
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow');
    });
  });

  describe('Botão de ação', () => {
    it('deve renderizar botão de ação quando fornecido', () => {
      const onAction = vi.fn();
      render(
        <Toast {...defaultProps} actionLabel="Desfazer" onAction={onAction} />
      );

      expect(screen.getByText('Desfazer')).toBeInTheDocument();
    });

    it('deve chamar onAction e onDismiss ao clicar no botão de ação', () => {
      const onAction = vi.fn();
      render(
        <Toast {...defaultProps} actionLabel="Desfazer" onAction={onAction} />
      );

      fireEvent.click(screen.getByText('Desfazer'));

      expect(onAction).toHaveBeenCalled();
      // Aguarda animação de saída
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(defaultProps.onDismiss).toHaveBeenCalledWith(defaultProps.id);
    });

    it('não deve renderizar botão de ação sem actionLabel', () => {
      render(<Toast {...defaultProps} />);
      expect(screen.queryByRole('button', { name: /desfazer/i })).not.toBeInTheDocument();
    });
  });

  describe('Botão de fechar', () => {
    it('deve renderizar botão de fechar', () => {
      render(<Toast {...defaultProps} />);
      expect(screen.getByLabelText('Fechar notificação')).toBeInTheDocument();
    });

    it('deve chamar onDismiss ao clicar no botão de fechar', () => {
      render(<Toast {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Fechar notificação'));

      // Aguarda animação de saída
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(defaultProps.onDismiss).toHaveBeenCalledWith(defaultProps.id);
    });
  });

  describe('DisplayName', () => {
    it('deve ter displayName correto', () => {
      expect(Toast.displayName).toBe('Toast');
    });
  });
});

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Componente auxiliar para testar o hook useToast */
  const TestComponent: React.FC<{ onMount?: (api: ReturnType<typeof useToast>) => void }> = ({
    onMount,
  }) => {
    const toastApi = useToast();

    React.useEffect(() => {
      if (onMount) {
        onMount(toastApi);
      }
    }, [onMount, toastApi]);

    return (
      <div>
        <button
          onClick={() =>
            toastApi.showToast({ variant: 'success', message: 'Toast de sucesso' })
          }
        >
          Mostrar Toast
        </button>
        <button onClick={() => toastApi.dismissAll()}>Limpar Todos</button>
      </div>
    );
  };

  describe('Renderização', () => {
    it('deve renderizar children', () => {
      render(
        <ToastProvider>
          <div data-testid="child">Conteúdo</div>
        </ToastProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('deve renderizar container de toasts', () => {
      render(
        <ToastProvider>
          <div>Conteúdo</div>
        </ToastProvider>
      );

      expect(screen.getByLabelText('Notificações')).toBeInTheDocument();
    });
  });

  describe('showToast', () => {
    it('deve exibir toast ao chamar showToast', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Mostrar Toast'));

      expect(screen.getByText('Toast de sucesso')).toBeInTheDocument();
    });

    it('deve retornar ID do toast criado', () => {
      let toastId: string | undefined;

      render(
        <ToastProvider>
          <TestComponent
            onMount={(api) => {
              toastId = api.showToast({ variant: 'info', message: 'Teste' });
            }}
          />
        </ToastProvider>
      );

      expect(toastId).toBeDefined();
      expect(toastId).toMatch(/^toast-/);
    });
  });

  describe('Empilhamento', () => {
    it('deve empilhar múltiplos toasts', () => {
      let api: ReturnType<typeof useToast>;

      render(
        <ToastProvider>
          <TestComponent onMount={(toastApi) => { api = toastApi; }} />
        </ToastProvider>
      );

      act(() => {
        api.showToast({ variant: 'success', message: 'Toast 1' });
        api.showToast({ variant: 'info', message: 'Toast 2' });
      });

      expect(screen.getByText('Toast 1')).toBeInTheDocument();
      expect(screen.getByText('Toast 2')).toBeInTheDocument();
    });

    it('deve limitar a 3 toasts visíveis', () => {
      let api: ReturnType<typeof useToast>;

      render(
        <ToastProvider>
          <TestComponent onMount={(toastApi) => { api = toastApi; }} />
        </ToastProvider>
      );

      act(() => {
        api.showToast({ variant: 'success', message: 'Toast 1' });
        api.showToast({ variant: 'info', message: 'Toast 2' });
        api.showToast({ variant: 'warning', message: 'Toast 3' });
        api.showToast({ variant: 'error', message: 'Toast 4' });
      });

      // Apenas 3 devem estar visíveis
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBe(3);
    });
  });

  describe('dismissToast', () => {
    it('deve remover toast específico', () => {
      let api: ReturnType<typeof useToast>;
      let toastId: string;

      render(
        <ToastProvider>
          <TestComponent
            onMount={(toastApi) => {
              api = toastApi;
              toastId = api.showToast({ variant: 'success', message: 'Toast para remover' });
            }}
          />
        </ToastProvider>
      );

      expect(screen.getByText('Toast para remover')).toBeInTheDocument();

      act(() => {
        api.dismissToast(toastId);
      });

      expect(screen.queryByText('Toast para remover')).not.toBeInTheDocument();
    });
  });

  describe('dismissAll', () => {
    it('deve remover todos os toasts', () => {
      let api: ReturnType<typeof useToast>;

      render(
        <ToastProvider>
          <TestComponent onMount={(toastApi) => { api = toastApi; }} />
        </ToastProvider>
      );

      act(() => {
        api.showToast({ variant: 'success', message: 'Toast 1' });
        api.showToast({ variant: 'info', message: 'Toast 2' });
      });

      expect(screen.getByText('Toast 1')).toBeInTheDocument();
      expect(screen.getByText('Toast 2')).toBeInTheDocument();

      act(() => {
        api.dismissAll();
      });

      expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Toast 2')).not.toBeInTheDocument();
    });
  });

  describe('useToast fora do Provider', () => {
    it('deve lançar erro quando usado fora do ToastProvider', () => {
      // Suprime erro do console para este teste
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('[ToastProvider] useToast deve ser usado dentro de um ToastProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('DisplayName', () => {
    it('deve ter displayName correto', () => {
      expect(ToastProvider.displayName).toBe('ToastProvider');
    });
  });
});
