/**
 * Componente de Botões de Controle
 *
 * Exibe os botões de ação para controle da gravação de vídeo:
 * Concluir e Cancelar. Implementa confirmação para
 * ações destrutivas e desabilitação durante processamento.
 *
 * Este componente é reutilizável e pode ser usado independentemente
 * do VideoRecordingPanel.
 *
 * @module ControlButtons
 * @requirements 6.1, 6.3, 6.4, 6.5

 */
import React, { useCallback, useState } from 'react';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Props do componente ControlButtons
 *
 * Seção de botões de controle conforme design.md
 */
export interface ControlButtonsProps {
  /** Callback para concluir gravação (Requisito 6.1) */
  onFinalize: () => void;
  /** Callback para cancelar gravação (Requisito 6.3) */
  onCancel: () => void;
  /** Se está processando uma ação (Requisito 6.5) */
  isProcessing?: boolean;
  /** Classes CSS adicionais */
  className?: string;
}

/**
 * Configuração de um botão de controle
 */
interface ControlButton {
  /** Identificador único */
  id: 'finalize' | 'cancel';
  /** Ícone/emoji representativo */
  icon: string;
  /** Rótulo do botão */
  label: string;
  /** Descrição para acessibilidade */
  ariaLabel: string;
  /** Classes CSS para estilização */
  colorClasses: string;
  /** Classes CSS para hover */
  hoverClasses: string;
  /** Classes CSS para active */
  activeClasses: string;
  /** Se requer confirmação */
  requiresConfirmation: boolean;
  /** Mensagem de confirmação */
  confirmationMessage?: string;
}

/**
 * Estado do diálogo de confirmação
 */
interface ConfirmationState {
  /** Se o diálogo está visível */
  isOpen: boolean;
  /** Botão que solicitou confirmação */
  button: ControlButton | null;
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * Configuração dos botões de controle
 * Requisito 6.4: Botões devem ter feedback visual (hover, active states)
 */
const CONTROL_BUTTONS: ControlButton[] = [
  {
    id: 'finalize',
    icon: '✓',
    label: 'Concluir',
    ariaLabel: 'Concluir gravação e salvar',
    colorClasses: 'bg-emerald-600 text-white',
    hoverClasses: 'hover:bg-emerald-500',
    activeClasses: 'active:bg-emerald-700',
    requiresConfirmation: false,
  },
  {
    id: 'cancel',
    icon: '✕',
    label: 'Cancelar',
    ariaLabel: 'Cancelar gravação e descartar',
    colorClasses: 'bg-red-600 text-white',
    hoverClasses: 'hover:bg-red-500',
    activeClasses: 'active:bg-red-700',
    requiresConfirmation: true,
    confirmationMessage:
      'Tem certeza que deseja cancelar a gravação? Todo o conteúdo capturado será descartado permanentemente.',
  },
];

// ============================================================================
// Componente Principal
// ============================================================================

/**
 * Componente de Botões de Controle
 *
 * Exibe os botões de ação para controle da gravação:
 * - Concluir (verde): Para a gravação e inicia pós-processamento
 * - Cancelar (vermelho): Cancela a gravação com confirmação
 *
 * Requisitos implementados:
 * - 6.1: Botão "Concluir" que chama VideoCapture.stop()
 * - 6.3: Botão "Cancelar" com confirmação antes de cancelar
 * - 6.4: Botões devem ter feedback visual (hover, active states)
 * - 6.5: Todos os botões desabilitados durante processamento
 *
 * @param props - Props do componente
 * @returns Elemento React com botões de controle
 *
 * @example
 * ```tsx
 * <ControlButtons
 *   onFinalize={() => handleFinalize()}
 *   onCancel={() => handleCancel()}
 * />
 * ```
 */
export default function ControlButtons({
  onFinalize,
  onCancel,
  isProcessing = false,
  className = '',
}: ControlButtonsProps): React.ReactElement {
  /**
   * Estado do diálogo de confirmação
   */
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    isOpen: false,
    button: null,
  });

  /**
   * Executa a ação do botão
   */
  const executeAction = useCallback(
    (buttonId: ControlButton['id']) => {
      switch (buttonId) {
        case 'finalize':
          onFinalize();
          break;
        case 'cancel':
          onCancel();
          break;
      }
    },
    [onFinalize, onCancel]
  );

  /**
   * Manipula clique em um botão de controle
   * Requisitos 6.2, 6.3: Confirmação para Recomeçar e Cancelar
   *
   * @param button - Configuração do botão clicado
   */
  const handleButtonClick = useCallback(
    (button: ControlButton) => {
      // Requisito 6.5: Não processar se já está processando
      if (isProcessing) {
        return;
      }

      // Se requer confirmação, mostrar diálogo inline
      if (button.requiresConfirmation && button.confirmationMessage) {
        setConfirmation({ isOpen: true, button });
        return;
      }

      // Executar ação diretamente
      executeAction(button.id);
    },
    [isProcessing, executeAction]
  );

  /**
   * Confirma a ação pendente
   */
  const handleConfirm = useCallback(() => {
    if (confirmation.button) {
      executeAction(confirmation.button.id);
    }
    setConfirmation({ isOpen: false, button: null });
  }, [confirmation.button, executeAction]);

  /**
   * Cancela a confirmação
   */
  const handleCancelConfirmation = useCallback(() => {
    setConfirmation({ isOpen: false, button: null });
  }, []);

  /**
   * Obtém classes CSS para um botão baseado no estado
   *
   * @param button - Configuração do botão
   * @returns String com classes CSS
   */
  const getButtonClasses = (button: ControlButton): string => {
    const baseClasses =
      'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-150';

    // Requisito 6.5: Desabilitado durante processamento ou confirmação
    if (isProcessing || confirmation.isOpen) {
      return `${baseClasses} bg-zinc-600 text-zinc-400 cursor-not-allowed opacity-50`;
    }

    // Requisito 6.4: Feedback visual (hover, active states)
    return `${baseClasses} ${button.colorClasses} ${button.hoverClasses} ${button.activeClasses} cursor-pointer`;
  };

  return (
    <div
      className={`bg-zinc-800 rounded-lg p-4 ${className}`.trim()}
      role="group"
      aria-label="Controles de gravação"
    >
      {/* Título da seção */}
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Ações</h3>

      {/* Grid de botões */}
      <div className="flex gap-2" role="toolbar" aria-label="Botões de controle da gravação">
        {CONTROL_BUTTONS.map((button) => (
          <button
            key={button.id}
            type="button"
            className={getButtonClasses(button)}
            onClick={() => handleButtonClick(button)}
            disabled={isProcessing || confirmation.isOpen}
            aria-label={button.ariaLabel}
            aria-disabled={isProcessing || confirmation.isOpen}
          >
            {/* Ícone */}
            <span className="text-lg" role="img" aria-hidden="true">
              {button.icon}
            </span>

            {/* Rótulo */}
            <span className="text-sm">{button.label}</span>
          </button>
        ))}
      </div>

      {/* Diálogo de confirmação inline */}
      {confirmation.isOpen && confirmation.button && (
        <div
          className="mt-3 p-3 bg-zinc-700 rounded-lg border border-zinc-600"
          role="alertdialog"
          aria-labelledby="confirmation-title"
          aria-describedby="confirmation-message"
        >
          <p id="confirmation-title" className="sr-only">
            Confirmação necessária
          </p>
          <p id="confirmation-message" className="text-sm text-zinc-200 mb-3">
            {confirmation.button.confirmationMessage}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="px-3 py-1.5 text-sm bg-zinc-600 text-zinc-200 rounded hover:bg-zinc-500 transition-colors"
              onClick={handleCancelConfirmation}
            >
              Não
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
              onClick={handleConfirm}
              autoFocus
            >
              Sim, confirmar
            </button>
          </div>
        </div>
      )}

      {/* Indicador de processamento */}
      {isProcessing && (
        <div
          className="mt-3 text-center text-sm text-zinc-400"
          role="status"
          aria-live="polite"
        >
          <span className="inline-block animate-pulse">Processando...</span>
        </div>
      )}
    </div>
  );
}
