/**
 * Classe Base para Estratégias de Captura
 *
 * Fornece implementação comum para controle de estado
 * (isCapturing, cancel) que pode ser reutilizada pelas
 * estratégias concretas (ScreenshotStrategy, VideoStrategy).
 *
 * Este arquivo existe separado para evitar dependências circulares
 * entre capture-strategy.ts e as estratégias concretas.
 *
 * @module BaseCaptureStrategy
 */

import type {
  CaptureType,
  CaptureConfig,
  CaptureResult,
  CaptureStrategy,
  PipelineProgressCallback,
} from './types';

/**
 * Classe base abstrata para estratégias de captura
 *
 * Fornece implementação comum para controle de estado
 * (isCapturing, cancel) que pode ser reutilizada pelas
 * estratégias concretas.
 */
export abstract class BaseCaptureStrategy implements CaptureStrategy {
  abstract readonly type: CaptureType;

  /** Flag indicando se há captura em andamento */
  protected _isCapturing = false;

  /** Controller para cancelamento de operações assíncronas */
  protected abortController: AbortController | null = null;

  /**
   * Executa a captura de evidência
   *
   * @param config - Configuração da captura
   * @param onProgress - Callback opcional de progresso
   * @returns Resultado da captura com hashes e Merkle Root
   */
  abstract execute(
    config: CaptureConfig,
    onProgress?: PipelineProgressCallback
  ): Promise<CaptureResult>;

  /**
   * Cancela captura em andamento
   *
   * Aborta operações assíncronas pendentes e reseta o estado.
   */
  async cancel(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._isCapturing = false;
  }

  /**
   * Verifica se há captura em andamento
   *
   * @returns true se há captura ativa, false caso contrário
   */
  isCapturing(): boolean {
    return this._isCapturing;
  }

  /**
   * Inicia uma nova captura
   *
   * Configura o estado interno e cria um novo AbortController.
   * Deve ser chamado no início do método execute() das subclasses.
   *
   * @throws Error se já houver captura em andamento
   */
  protected iniciarCaptura(): void {
    if (this._isCapturing) {
      throw new Error('Já existe uma captura em andamento');
    }
    this._isCapturing = true;
    this.abortController = new AbortController();
  }

  /**
   * Finaliza a captura atual
   *
   * Reseta o estado interno. Deve ser chamado ao final
   * do método execute() das subclasses (sucesso ou erro).
   */
  protected finalizarCaptura(): void {
    this._isCapturing = false;
    this.abortController = null;
  }

  /**
   * Verifica se a captura foi cancelada
   *
   * @returns true se a captura foi abortada
   */
  protected foiCancelada(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }
}
