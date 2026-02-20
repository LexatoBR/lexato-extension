/**
 * BaseCollector - Classe base para coletores de dados forenses
 *
 * @module BaseCollector
 */

import { AuditLogger } from '../../audit-logger';

export interface CollectorResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

/**
 * Classe base abstrata para coletores de dados forenses
 */
export abstract class BaseCollector<T> {
  protected logger: AuditLogger;
  protected timeout: number;
  protected name: string;

  constructor(logger: AuditLogger, name: string, timeout = 5000) {
    this.logger = logger;
    this.name = name;
    this.timeout = timeout;
  }

  /**
   * Coleta dados com tratamento de erro e timeout
   * @returns Resultado da coleta com dados ou erro
   */
  async collect(): Promise<CollectorResult<T>> {
    const startTime = Date.now();

    try {
      const data = await Promise.race([
        this.doCollect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        ),
      ]);

      return {
        success: true,
        data,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.warn('FORENSIC', `COLLECTOR_ERROR_${this.name.toUpperCase()}`, {
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Implementação específica da coleta - deve ser sobrescrita
   */
  protected abstract doCollect(): Promise<T>;
}

export default BaseCollector;
