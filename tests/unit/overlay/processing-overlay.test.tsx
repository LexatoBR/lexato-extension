/**
 * Testes unitários para ProcessingOverlay
 *
 * Testa componente de overlay de processamento pós-captura.
 *
 * Requisitos testados:
 * - 1.1: Overlay aparece quando captura finaliza
 * - 1.2: Lista de etapas com indicadores de status (✓ completed, ○ pending, ⟳ in progress)
 * - 1.3: Barra de progresso com percentual
 * - 1.4: Etapas na ordem correta
 * - 1.5: Atualização de status das etapas
 * - 1.7: Bloqueio de interação durante processamento
 * - 1.8: Mensagem de erro com opção de retry
 *
 * @see Requirements 1: Processing Overlay Post-Capture
 * @see design.md: Processing Overlay (Extensão Chrome)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProcessingOverlay, {
  PROCESSING_OVERLAY_Z_INDEX,
  DEFAULT_PROCESSING_STEPS,
  type ProcessingStep,
  type ProcessingError,
} from '@overlay/processing-overlay';

describe('ProcessingOverlay', () => {
  // Limpar event listeners após cada teste
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('renderização básica', () => {
    it('deve renderizar overlay quando visível', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
    });

    it('não deve renderizar overlay quando não visível', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={false}
        />
      );

      expect(screen.queryByTestId('processing-overlay')).not.toBeInTheDocument();
    });

    it('deve exibir título "Processando Evidência"', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      expect(screen.getByText('Processando Evidência')).toBeInTheDocument();
    });

    it('deve exibir ID da evidência truncado', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123-full-id"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      expect(screen.getByText(/ID: test-evi\.\.\./)).toBeInTheDocument();
    });

    it('deve exibir footer com mensagem de segurança', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      expect(screen.getByText(/Lexato • Processamento Seguro de Evidências/)).toBeInTheDocument();
    });
  });

  describe('lista de etapas (Requisito 1.2, 1.4)', () => {
    it('deve renderizar todas as etapas padrão na ordem correta', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      // Verificar que todas as etapas estão presentes
      expect(screen.getByText('Captura finalizada')).toBeInTheDocument();
      expect(screen.getByText('Aplicando carimbo de tempo ICP-Brasil...')).toBeInTheDocument();
      expect(screen.getByText('Criptografando dados...')).toBeInTheDocument();
      expect(screen.getByText('Enviando para armazenamento seguro...')).toBeInTheDocument();
      expect(screen.getByText('Reativando extensões do navegador...')).toBeInTheDocument();
    });

    it('deve exibir etapa com status completed (✓)', () => {
      const steps: ProcessingStep[] = [
        { id: 'step1', label: 'Etapa Concluída', status: 'completed' },
      ];

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={steps}
          progress={100}
          visible={true}
        />
      );

      const stepElement = screen.getByTestId('step-step1');
      expect(stepElement).toHaveAttribute('data-status', 'completed');
    });

    it('deve exibir etapa com status in_progress (⟳)', () => {
      const steps: ProcessingStep[] = [
        { id: 'step1', label: 'Etapa em Progresso', status: 'in_progress' },
      ];

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={steps}
          progress={50}
          visible={true}
        />
      );

      const stepElement = screen.getByTestId('step-step1');
      expect(stepElement).toHaveAttribute('data-status', 'in_progress');
    });

    it('deve exibir etapa com status pending (○)', () => {
      const steps: ProcessingStep[] = [
        { id: 'step1', label: 'Etapa Pendente', status: 'pending' },
      ];

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={steps}
          progress={0}
          visible={true}
        />
      );

      const stepElement = screen.getByTestId('step-step1');
      expect(stepElement).toHaveAttribute('data-status', 'pending');
    });

    it('deve exibir etapa com status error (✗)', () => {
      const steps: ProcessingStep[] = [
        { id: 'step1', label: 'Etapa com Erro', status: 'error', errorMessage: 'Falha na conexão' },
      ];

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={steps}
          progress={25}
          visible={true}
        />
      );

      const stepElement = screen.getByTestId('step-step1');
      expect(stepElement).toHaveAttribute('data-status', 'error');
      expect(screen.getByText('Falha na conexão')).toBeInTheDocument();
    });
  });

  describe('barra de progresso (Requisito 1.3)', () => {
    it('deve renderizar barra de progresso', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={50}
          visible={true}
        />
      );

      expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    });

    it('deve exibir percentual correto', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={75}
          visible={true}
        />
      );

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('deve ter atributos ARIA corretos', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={60}
          visible={true}
        />
      );

      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar).toHaveAttribute('role', 'progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '60');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('deve limitar progresso entre 0 e 100', () => {
      const { rerender } = render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={-10}
          visible={true}
        />
      );

      expect(screen.getByText('0%')).toBeInTheDocument();

      rerender(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={150}
          visible={true}
        />
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('tratamento de erros com retry (Requisito 1.8)', () => {
    it('deve exibir título de erro quando há erro', () => {
      const error: ProcessingError = {
        stepId: 'upload',
        message: 'Falha ao enviar para o servidor',
        retryable: true,
      };

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={50}
          visible={true}
          error={error}
        />
      );

      expect(screen.getByText('Erro no Processamento')).toBeInTheDocument();
    });

    it('deve exibir mensagem de erro', () => {
      const error: ProcessingError = {
        stepId: 'upload',
        message: 'Falha ao enviar para o servidor',
        retryable: true,
      };

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={50}
          visible={true}
          error={error}
        />
      );

      expect(screen.getByText('Falha ao enviar para o servidor')).toBeInTheDocument();
    });

    it('deve exibir botão de retry quando erro é retryable', () => {
      const error: ProcessingError = {
        stepId: 'upload',
        message: 'Falha ao enviar para o servidor',
        retryable: true,
      };

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={50}
          visible={true}
          error={error}
        />
      );

      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
      expect(screen.getByText('Tentar Novamente')).toBeInTheDocument();
    });

    it('não deve exibir botão de retry quando erro não é retryable', () => {
      const error: ProcessingError = {
        stepId: 'upload',
        message: 'Erro fatal',
        retryable: false,
      };

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={50}
          visible={true}
          error={error}
        />
      );

      expect(screen.queryByTestId('retry-button')).not.toBeInTheDocument();
    });

    it('deve chamar onRetry ao clicar no botão de retry', () => {
      const onRetry = vi.fn();
      const error: ProcessingError = {
        stepId: 'upload',
        message: 'Falha ao enviar para o servidor',
        retryable: true,
      };

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={50}
          visible={true}
          error={error}
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByTestId('retry-button');
      fireEvent.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('deve exibir container de erro com estilo correto', () => {
      const error: ProcessingError = {
        stepId: 'upload',
        message: 'Falha ao enviar para o servidor',
        retryable: true,
      };

      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={50}
          visible={true}
          error={error}
        />
      );

      expect(screen.getByTestId('error-container')).toBeInTheDocument();
    });
  });

  describe('z-index e posicionamento', () => {
    it('deve ter z-index máximo', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      const overlay = screen.getByTestId('processing-overlay');
      expect(overlay).toHaveStyle({ zIndex: PROCESSING_OVERLAY_Z_INDEX });
    });

    it('deve exportar constante PROCESSING_OVERLAY_Z_INDEX correta', () => {
      expect(PROCESSING_OVERLAY_Z_INDEX).toBe(2147483647);
    });

    it('deve ter posição fixed cobrindo toda a tela', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      const overlay = screen.getByTestId('processing-overlay');
      expect(overlay).toHaveStyle({ position: 'fixed' });
    });
  });

  describe('acessibilidade', () => {
    it('deve ter role dialog', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      const overlay = screen.getByTestId('processing-overlay');
      expect(overlay).toHaveAttribute('role', 'dialog');
    });

    it('deve ter aria-modal true', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      const overlay = screen.getByTestId('processing-overlay');
      expect(overlay).toHaveAttribute('aria-modal', 'true');
    });

    it('deve ter aria-labelledby apontando para o título', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      const overlay = screen.getByTestId('processing-overlay');
      expect(overlay).toHaveAttribute('aria-labelledby', 'processing-title');
      expect(screen.getByText('Processando Evidência')).toHaveAttribute('id', 'processing-title');
    });

    it('deve ter aria-describedby apontando para a descrição', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      const overlay = screen.getByTestId('processing-overlay');
      expect(overlay).toHaveAttribute('aria-describedby', 'processing-description');
    });
  });

  describe('DEFAULT_PROCESSING_STEPS', () => {
    it('deve ter 5 etapas padrão', () => {
      expect(DEFAULT_PROCESSING_STEPS).toHaveLength(5);
    });

    it('deve ter primeira etapa como "Captura finalizada" com status completed', () => {
      expect(DEFAULT_PROCESSING_STEPS[0]).toEqual({
        id: 'capture',
        label: 'Captura finalizada',
        status: 'completed',
      });
    });

    it('deve ter etapas na ordem correta conforme requisito 1.4', () => {
      const expectedOrder = [
        'capture',
        'timestamp',
        'encrypt',
        'upload',
        'extensions',
      ];

      const actualOrder = DEFAULT_PROCESSING_STEPS.map((step) => step.id);
      expect(actualOrder).toEqual(expectedOrder);
    });

    it('deve ter todas as etapas exceto a primeira como pending', () => {
      const pendingSteps = DEFAULT_PROCESSING_STEPS.slice(1);
      pendingSteps.forEach((step) => {
        expect(step.status).toBe('pending');
      });
    });
  });

  describe('bloqueio de interação (Requisito 1.7)', () => {
    beforeEach(() => {
      // Capturar os handlers adicionados
      const originalAddEventListener = document.addEventListener;
      vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, options) => {
        return originalAddEventListener.call(document, type, handler, options);
      });
    });

    it('deve adicionar event listeners quando visível', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
      expect(document.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);
    });

    it('não deve adicionar event listeners quando não visível', () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={false}
        />
      );

      // Não deve ter chamado addEventListener para keydown/click
      const keydownCalls = (document.addEventListener as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === 'keydown'
      );
      expect(keydownCalls).toHaveLength(0);
    });

    it('deve remover event listeners ao desmontar', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function), true);
    });
  });

  describe('animação de entrada', () => {
    it('deve iniciar com opacidade 0 e transicionar para 1', async () => {
      render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={DEFAULT_PROCESSING_STEPS}
          progress={0}
          visible={true}
        />
      );

      const overlay = screen.getByTestId('processing-overlay');
      
      // Aguardar a animação
      await waitFor(() => {
        expect(overlay).toHaveStyle({ opacity: '1' });
      }, { timeout: 500 });
    });
  });

  describe('atualização de etapas (Requisito 1.5)', () => {
    it('deve atualizar status das etapas quando props mudam', () => {
      const initialSteps: ProcessingStep[] = [
        { id: 'step1', label: 'Etapa 1', status: 'in_progress' },
        { id: 'step2', label: 'Etapa 2', status: 'pending' },
      ];

      const { rerender } = render(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={initialSteps}
          progress={25}
          visible={true}
        />
      );

      expect(screen.getByTestId('step-step1')).toHaveAttribute('data-status', 'in_progress');
      expect(screen.getByTestId('step-step2')).toHaveAttribute('data-status', 'pending');

      const updatedSteps: ProcessingStep[] = [
        { id: 'step1', label: 'Etapa 1', status: 'completed' },
        { id: 'step2', label: 'Etapa 2', status: 'in_progress' },
      ];

      rerender(
        <ProcessingOverlay
          evidenceId="test-evidence-123"
          steps={updatedSteps}
          progress={50}
          visible={true}
        />
      );

      expect(screen.getByTestId('step-step1')).toHaveAttribute('data-status', 'completed');
      expect(screen.getByTestId('step-step2')).toHaveAttribute('data-status', 'in_progress');
    });
  });
});
