/**
 * Gerenciador de Progresso Suave
 *
 * Garante que o progresso SEMPRE avança de forma contínua,
 * nunca "travando" em um valor por muito tempo.
 *
 * Responsabilidades:
 * - Interpolar entre valores de progresso
 * - Adicionar "progresso falso" quando não há atualizações
 * - Garantir feedback visual contínuo
 * - Nunca regredir o progresso
 *
 * @module SmoothProgressManager
 */

import { progressTracker } from './progress-tracker';
import type { EvidenceStatus, PipelineProgressCallback, PipelineProgress } from './types';

/**
 * Configuração do gerenciador
 */
interface SmoothProgressConfig {
  /** ID da evidência */
  evidenceId: string;
  /** Callback para atualizações de progresso */
  onProgress?: PipelineProgressCallback;
  /** Intervalo de atualização em ms (padrão: 100ms) */
  updateInterval?: number;
  /** Velocidade do progresso automático (% por segundo) */
  autoProgressSpeed?: number;
}

/**
 * Configuração de velocidade por status
 */
const STATUS_SPEED_CONFIG: Partial<Record<EvidenceStatus, number>> = {
  // Rápidos - operações locais
  INITIALIZING: 8,      // 8% por segundo

  // Médios - operações de rede rápidas
  TIMESTAMPING: 4,      // 4% por segundo

  // Lentos - operações pesadas
  CAPTURING: 3,         // 3% por segundo
  UPLOADING: 2,         // 2% por segundo

  // Muito lentos - aguardando usuário
  PENDING_REVIEW: 1,    // 1% por segundo
};

/**
 * Limites máximos por status
 */
const STATUS_MAX_PERCENT: Partial<Record<EvidenceStatus, number>> = {
  INITIALIZING: 5,
  CAPTURING: 28,
  CAPTURED: 30,
  TIMESTAMPING: 38,
  TIMESTAMPED: 40,
  UPLOADING: 83,
  UPLOADED: 85,
  PENDING_REVIEW: 95,
};

/**
 * Gerenciador de progresso suave
 *
 * @example
 * ```typescript
 * const manager = new SmoothProgressManager({
 *   evidenceId: 'evidence-123',
 *   onProgress: (progress) => console.log(progress.percent),
 * });
 *
 * // Iniciar progresso contínuo
 * manager.start();
 *
 * // Atualizar status (progresso continua automaticamente)
 * manager.updateStatus('CAPTURING');
 *
 * // Definir progresso específico (útil para upload)
 * manager.setProgress(45);
 *
 * // Parar quando concluído
 * manager.stop();
 * ```
 */
export class SmoothProgressManager {
  private readonly config: Required<SmoothProgressConfig>;
  private intervalId: NodeJS.Timeout | null = null;
  private currentPercent = 0;
  private targetPercent = 0;
  private currentStatus: EvidenceStatus = 'INITIALIZING';
  private lastUpdateTime = Date.now();
  private isRunning = false;

  constructor(config: SmoothProgressConfig) {
    this.config = {
      evidenceId: config.evidenceId,
      onProgress: config.onProgress ?? (() => {}), // No-op se não fornecido
      updateInterval: config.updateInterval ?? 100, // 100ms = 10 fps
      autoProgressSpeed: config.autoProgressSpeed ?? 3, // 3% por segundo padrão
    };
  }

  /**
   * Inicia o progresso contínuo
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastUpdateTime = Date.now();

    // Iniciar loop de atualização
    this.intervalId = setInterval(() => {
      this.tick();
    }, this.config.updateInterval);

    // Atualização inicial
    this.updateProgress('Iniciando...', 0);
  }

  /**
   * Para o progresso contínuo
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Atualiza o status (ajusta velocidade automaticamente)
   */
  updateStatus(status: EvidenceStatus, message?: string): void {
    this.currentStatus = status;

    // Ajustar alvo baseado no status
    const statusTarget = STATUS_MAX_PERCENT[status];
    if (statusTarget !== undefined && statusTarget > this.targetPercent) {
      this.targetPercent = statusTarget;
    }

    // Atualizar no tracker principal
    const updateData: Partial<PipelineProgress> = {
      status,
      percent: Math.round(this.currentPercent),
    };

    if (message) {
      updateData.message = message;
    }

    progressTracker.update(this.config.evidenceId, updateData);
  }

  /**
   * Define progresso específico (útil para upload)
   */
  setProgress(percent: number, message?: string): void {
    // Nunca regredir
    if (percent > this.currentPercent) {
      this.targetPercent = Math.max(this.targetPercent, percent);
    }

    if (message) {
      this.updateProgress(message, this.currentPercent);
    }
  }

  /**
   * Incrementa o progresso
   */
  incrementProgress(increment: number, message?: string): void {
    this.targetPercent = Math.min(100, this.targetPercent + increment);

    if (message) {
      this.updateProgress(message, this.currentPercent);
    }
  }

  /**
   * Tick do loop de atualização
   */
  private tick(): void {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000; // em segundos
    this.lastUpdateTime = now;

    // Obter velocidade baseada no status atual
    const speed = STATUS_SPEED_CONFIG[this.currentStatus] ?? this.config.autoProgressSpeed;

    // Calcular incremento
    const increment = speed * deltaTime;

    // Atualizar progresso atual
    if (this.currentPercent < this.targetPercent) {
      // Avançar em direção ao alvo
      this.currentPercent = Math.min(
        this.targetPercent,
        this.currentPercent + increment * 2 // 2x para alcançar mais rápido
      );
    } else {
      // Progresso automático (falso) quando não há alvo
      const maxAllowed = STATUS_MAX_PERCENT[this.currentStatus] ?? 95;
      if (this.currentPercent < maxAllowed) {
        this.currentPercent = Math.min(
          maxAllowed,
          this.currentPercent + increment
        );
      }
    }

    // Arredondar para evitar decimais excessivas
    const roundedPercent = Math.round(this.currentPercent * 10) / 10;

    // Emitir atualização
    this.updateProgress(undefined, roundedPercent);
  }

  /**
   * Atualiza o progresso no tracker e callback
   */
  private updateProgress(message?: string, percent?: number): void {
    const finalPercent = Math.round(percent ?? this.currentPercent);

    // Atualizar tracker principal
    progressTracker.incrementProgress(
      this.config.evidenceId,
      0, // Não incrementar, definir diretamente
      finalPercent,
      message
    );

    // Chamar callback se fornecido
    if (this.config.onProgress) {
      const progress = progressTracker.get(this.config.evidenceId);
      if (progress) {
        this.config.onProgress({
          ...progress,
          percent: finalPercent,
        });
      }
    }
  }

  /**
   * Obtém o progresso atual
   */
  getProgress(): number {
    return Math.round(this.currentPercent);
  }
}

/**
 * Factory para criar gerenciador de progresso
 *
 * @param evidenceId - ID da evidência
 * @param onProgress - Callback de progresso
 * @returns Instância do gerenciador
 */
export function createSmoothProgressManager(
  evidenceId: string,
  onProgress?: PipelineProgressCallback
): SmoothProgressManager {
  const config: SmoothProgressConfig = {
    evidenceId,
  };

  if (onProgress) {
    config.onProgress = onProgress;
  }

  return new SmoothProgressManager(config);
}