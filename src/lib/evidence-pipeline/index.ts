/**
 * Pipeline Unificado de Evidências
 *
 * Ponto de entrada para a biblioteca do pipeline.
 * Exporta tipos, classes e factory para uso.
 *
 * IMPORTANTE: O pipeline depende do APIClient singleton estar inicializado.
 * Use ensureAPIClientInitialized() antes de criar o pipeline, ou
 * use createEvidencePipelineWithClient() passando o cliente explicitamente.
 *
 * @module EvidencePipeline
 */

export * from './types';
export * from './capture-strategy';
export * from './timestamp-service';
export { UploadService } from './upload-service';
export { HtmlCollectionService, createHtmlCollectionService } from './html-collection-service';
export * from './progress-tracker';
export * from './smooth-progress-manager';
export * from './error-handler';
export * from './evidence-pipeline';

import { EvidencePipelineImpl } from './evidence-pipeline';
import { TimestampService } from './timestamp-service';
import { UploadService } from './upload-service';
import { BlockchainService } from './blockchain-service';
import { getAPIClient, resetAPIClient, type APIClient, type APIClientConfig } from '../../background/api-client';
import type { EvidencePipeline } from './types';

/**
 * Flag para rastrear se o APIClient foi inicializado
 */
let apiClientInitialized = false;

/**
 * Garante que o APIClient singleton está inicializado
 * 
 * Esta função deve ser chamada antes de usar qualquer serviço que dependa do APIClient.
 * Se o APIClient já foi inicializado, retorna imediatamente.
 * 
 * @param config - Configuração do APIClient (obrigatória na primeira chamada)
 * @returns O APIClient inicializado
 * @throws Error se config não for fornecida e APIClient não estiver inicializado
 * 
 * @example
 * ```typescript
 * // No service-worker.ts, antes de iniciar captura:
 * ensureAPIClientInitialized({
 *   baseURL: getBaseURL(), // Usa ambiente correto (production por padrão)
 *   getTokens: getStoredTokens,
 *   refreshToken: async () => refreshAccessToken(logger),
 *   getCorrelationId: generateCorrelationId,
 *   logger: getLogger(),
 * });
 * 
 * // Agora é seguro criar o pipeline
 * const pipeline = createEvidencePipeline();
 * ```
 */
export function ensureAPIClientInitialized(config?: APIClientConfig): APIClient {
  if (apiClientInitialized) {
    // Já inicializado, retornar instância existente
    return getAPIClient();
  }

  if (!config) {
    throw new Error(
      '[EvidencePipeline] APIClient não inicializado. ' +
      'Chame ensureAPIClientInitialized(config) com a configuração antes de usar o pipeline.'
    );
  }

  // Inicializar o singleton
  const client = getAPIClient(config);
  apiClientInitialized = true;
  
  return client;
}

/**
 * Verifica se o APIClient está inicializado
 * 
 * @returns true se o APIClient foi inicializado, false caso contrário
 */
export function isAPIClientInitialized(): boolean {
  return apiClientInitialized;
}

/**
 * Reseta o estado de inicialização do APIClient
 * 
 * ATENÇÃO: Usar apenas em testes ou situações de recuperação de erro.
 * Isso também reseta o singleton do APIClient.
 */
export function resetAPIClientState(): void {
  apiClientInitialized = false;
  resetAPIClient();
}

/**
 * Cria uma nova instância do pipeline de evidências
 * 
 * IMPORTANTE: O APIClient singleton DEVE estar inicializado antes de chamar esta função.
 * Use ensureAPIClientInitialized(config) no service-worker.ts antes de criar o pipeline.
 *
 * @returns Instância do EvidencePipeline
 * @throws Error se o APIClient não estiver inicializado
 * 
 * @example
 * ```typescript
 * // Primeiro, garantir que APIClient está inicializado
 * ensureAPIClientInitialized(apiConfig);
 * 
 * // Depois, criar o pipeline
 * const pipeline = createEvidencePipeline();
 * ```
 */
export function createEvidencePipeline(): EvidencePipeline {
  // Verificar se APIClient está inicializado
  if (!apiClientInitialized) {
    // Tentar obter o cliente para verificar se foi inicializado externamente
    try {
      getAPIClient();
      apiClientInitialized = true;
    } catch {
      throw new Error(
        '[EvidencePipeline] APIClient não inicializado. ' +
        'Chame ensureAPIClientInitialized(config) antes de criar o pipeline. ' +
        'Isso geralmente deve ser feito no service-worker.ts durante o fluxo de autenticação.'
      );
    }
  }

  return new EvidencePipelineImpl();
}

/**
 * Cria uma nova instância do pipeline com APIClient explícito
 * 
 * Use esta função quando quiser passar o APIClient diretamente,
 * evitando dependência do singleton global.
 * 
 * @param client - Instância do APIClient já configurada
 * @returns Instância do EvidencePipeline
 * 
 * @example
 * ```typescript
 * const client = new APIClient(config);
 * const pipeline = createEvidencePipelineWithClient(client);
 * ```
 */
export function createEvidencePipelineWithClient(client: APIClient): EvidencePipeline {
  // Criar serviços com o cliente fornecido
  const timestampService = new TimestampService(client);
  const uploadService = new UploadService(client);
  const blockchainService = new BlockchainService();
  
  return new EvidencePipelineImpl(
    timestampService,
    uploadService,
    blockchainService
  );
}
