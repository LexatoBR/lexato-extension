/**
 * Safe Loader - Utilitário para carregamento seguro de collectors DOM-required
 *
 * Este módulo fornece funções para carregar collectors que requerem acesso ao DOM
 * de forma segura, usando dynamic imports e guards de contexto.
 *
 * O problema que este módulo resolve:
 * - Service workers NÃO têm acesso ao DOM (document, window)
 * - Collectors como SSLCollector, CanvasFingerprintCollector usam document.*
 * - Se importados estaticamente, causam erro "document is not defined"
 * - A solução é usar dynamic imports com guard hasDOMAccess()
 *
 * Uso típico:
 * ```typescript
 * const result = await loadDOMCollector<SSLData>(
 *   './collectors/ssl-collector',
 *   logger,
 *   url
 * );
 *
 * if (result) {
 *   // Collector executou com sucesso
 *   console.log(result.data);
 * } else {
 *   // Collector foi pulado (sem DOM) ou falhou
 * }
 * ```
 *
 * @module SafeLoader
 * @see https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
 */

import type { CollectorResult } from './collectors/base-collector';
import type { AuditLogger } from '../audit-logger';
import { hasDOMAccess, detectExecutionContext } from '../context-utils';

/**
 * Opções para carregamento de collector DOM-required
 */
export interface LoadDOMCollectorOptions {
  /**
   * Timeout em milissegundos para carregamento do módulo
   * @default 10000
   */
  timeout?: number;

  /**
   * Se deve logar quando o collector é pulado por falta de DOM
   * @default true
   */
  logSkipped?: boolean;
}

/**
 * Resultado do carregamento de collector com metadados adicionais
 */
export interface SafeLoaderResult<T> extends CollectorResult<T> {
  /**
   * Indica se o collector foi pulado por falta de acesso ao DOM
   */
  skippedNoDom?: boolean;

  /**
   * Contexto de execução onde o collector foi chamado
   */
  executionContext?: string;
}

/**
 * Carrega collector DOM-required de forma segura usando dynamic import
 *
 * Esta função implementa o padrão de guard com hasDOMAccess() antes do dynamic import,
 * garantindo que collectors que requerem DOM não sejam carregados em service worker.
 *
 * O fluxo de execução é:
 * 1. Verifica se há acesso ao DOM via hasDOMAccess()
 * 2. Se não há DOM, loga warning e retorna null
 * 3. Se há DOM, faz dynamic import do módulo
 * 4. Instancia o collector com os argumentos fornecidos
 * 5. Executa collect() e retorna o resultado
 *
 * @param collectorPath - Caminho do módulo do collector (relativo ou absoluto)
 * @param logger - Instância do AuditLogger para logging estruturado
 * @param args - Argumentos adicionais para o construtor do collector
 * @returns Resultado da coleta ou null se não executado (sem DOM ou erro)
 *
 * @example
 * ```typescript
 * // Carregar SSLCollector que requer DOM
 * const sslResult = await loadDOMCollector<SSLData>(
 *   './collectors/ssl-collector',
 *   logger,
 *   'https://example.com'
 * );
 *
 * if (sslResult?.success) {
 *   console.log('SSL data:', sslResult.data);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Carregar CanvasFingerprintCollector sem argumentos extras
 * const canvasResult = await loadDOMCollector<CanvasFingerprint>(
 *   './collectors/canvas-fingerprint-collector',
 *   logger
 * );
 * ```
 */
export async function loadDOMCollector<T>(
  collectorPath: string,
  logger: AuditLogger,
  ...args: unknown[]
): Promise<CollectorResult<T> | null> {
  const executionContext = detectExecutionContext();

  // Guard: verificar se temos acesso ao DOM antes do dynamic import
  if (!hasDOMAccess()) {
    logger.warn('FORENSIC', 'COLLECTOR_SKIPPED_NO_DOM', {
      collector: collectorPath,
      reason: 'Executando em contexto sem DOM',
      executionContext,
    });
    return null;
  }

  try {
    logger.info('FORENSIC', 'COLLECTOR_DYNAMIC_IMPORT_START', {
      collector: collectorPath,
      executionContext,
      argsCount: args.length,
    });

    // Dynamic import do módulo
    const module = await import(collectorPath);

    // Obter a classe do collector (default export ou named export)
    const CollectorClass = module.default ?? Object.values(module)[0];

    if (!CollectorClass || typeof CollectorClass !== 'function') {
      throw new Error(`Módulo ${collectorPath} não exporta uma classe de collector válida`);
    }

    // Instanciar collector com logger e argumentos adicionais
    const collector = new CollectorClass(logger, ...args);

    // Verificar se o collector tem método collect
    if (typeof collector.collect !== 'function') {
      throw new Error(`Collector ${collectorPath} não implementa método collect()`);
    }

    // Executar coleta
    const result = await collector.collect();

    logger.info('FORENSIC', 'COLLECTOR_DYNAMIC_IMPORT_SUCCESS', {
      collector: collectorPath,
      success: result.success,
      durationMs: result.durationMs,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('FORENSIC', 'COLLECTOR_LOAD_FAILED', {
      collector: collectorPath,
      error: errorMessage,
      stack: errorStack,
      executionContext,
    });

    return null;
  }
}

/**
 * Carrega collector DOM-required com opções avançadas e metadados de resultado
 *
 * Versão estendida de loadDOMCollector que retorna metadados adicionais
 * sobre o carregamento, útil para debugging e auditoria.
 *
 * @param collectorPath - Caminho do módulo do collector
 * @param logger - Instância do AuditLogger
 * @param options - Opções de carregamento
 * @param args - Argumentos para o construtor do collector
 * @returns Resultado com metadados ou null se falhou
 *
 * @example
 * ```typescript
 * const result = await loadDOMCollectorWithOptions<SSLData>(
 *   './collectors/ssl-collector',
 *   logger,
 *   { timeout: 5000, logSkipped: true },
 *   'https://example.com'
 * );
 *
 * if (result?.skippedNoDom) {
 *   console.log('Collector pulado - executando em:', result.executionContext);
 * }
 * ```
 */
export async function loadDOMCollectorWithOptions<T>(
  collectorPath: string,
  logger: AuditLogger,
  options: LoadDOMCollectorOptions = {},
  ...args: unknown[]
): Promise<SafeLoaderResult<T> | null> {
  const { timeout = 10000, logSkipped = true } = options;
  const executionContext = detectExecutionContext();
  const startTime = Date.now();

  // Guard: verificar se temos acesso ao DOM
  if (!hasDOMAccess()) {
    if (logSkipped) {
      logger.warn('FORENSIC', 'COLLECTOR_SKIPPED_NO_DOM', {
        collector: collectorPath,
        reason: 'Executando em contexto sem DOM',
        executionContext,
      });
    }

    return {
      success: false,
      error: 'Contexto sem acesso ao DOM',
      durationMs: Date.now() - startTime,
      skippedNoDom: true,
      executionContext,
    };
  }

  try {
    // Criar promise com timeout
    const loadPromise = (async () => {
      const module = await import(collectorPath);
      const CollectorClass = module.default ?? Object.values(module)[0];

      if (!CollectorClass || typeof CollectorClass !== 'function') {
        throw new Error(`Módulo ${collectorPath} não exporta uma classe de collector válida`);
      }

      const collector = new CollectorClass(logger, ...args);

      if (typeof collector.collect !== 'function') {
        throw new Error(`Collector ${collectorPath} não implementa método collect()`);
      }

      return collector.collect();
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ao carregar collector: ${timeout}ms`)), timeout)
    );

    const result = await Promise.race([loadPromise, timeoutPromise]);

    return {
      ...result,
      skippedNoDom: false,
      executionContext,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    logger.error('FORENSIC', 'COLLECTOR_LOAD_FAILED', {
      collector: collectorPath,
      error: errorMessage,
      executionContext,
    });

    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
      skippedNoDom: false,
      executionContext,
    };
  }
}

/**
 * Verifica se um collector pode ser carregado no contexto atual
 *
 * Função utilitária para verificar antecipadamente se um collector
 * DOM-required pode ser executado, sem tentar carregá-lo.
 *
 * @param collectorName - Nome do collector para logging
 * @param logger - Instância do AuditLogger (opcional)
 * @returns true se o collector pode ser carregado, false caso contrário
 *
 * @example
 * ```typescript
 * if (canLoadDOMCollector('ssl-collector', logger)) {
 *   const result = await loadDOMCollector('./collectors/ssl-collector', logger);
 * } else {
 *   // Usar alternativa ou pular
 * }
 * ```
 */
export function canLoadDOMCollector(collectorName?: string, logger?: AuditLogger): boolean {
  const canLoad = hasDOMAccess();

  if (!canLoad && logger && collectorName) {
    logger.info('FORENSIC', 'COLLECTOR_CHECK_NO_DOM', {
      collector: collectorName,
      canLoad: false,
      executionContext: detectExecutionContext(),
    });
  }

  return canLoad;
}

/**
 * Lista de collectors conhecidos que requerem DOM
 *
 * Esta lista é usada para documentação e validação.
 * Collectors nesta lista usam APIs como:
 * - document.createElement
 * - document.querySelectorAll
 * - document.fonts
 * - canvas.getContext
 */
export const DOM_REQUIRED_COLLECTORS = [
  'ssl-collector',
  'page-resources-collector',
  'canvas-fingerprint-collector',
  'webgl-fingerprint-collector',
  'fonts-collector',
] as const;

/**
 * Tipo para nomes de collectors DOM-required
 */
export type DOMRequiredCollectorName = (typeof DOM_REQUIRED_COLLECTORS)[number];

/**
 * Verifica se um collector está na lista de DOM-required
 *
 * @param collectorName - Nome do collector a verificar
 * @returns true se o collector requer DOM
 */
export function isDOMRequiredCollector(collectorName: string): boolean {
  return DOM_REQUIRED_COLLECTORS.includes(collectorName as DOMRequiredCollectorName);
}

export default {
  loadDOMCollector,
  loadDOMCollectorWithOptions,
  canLoadDOMCollector,
  isDOMRequiredCollector,
  DOM_REQUIRED_COLLECTORS,
};
