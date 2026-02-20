// Servico de catalogacao de evidencias para a extensao Chrome
// Encapsula chamadas ao Supabase para autocomplete de tags e CRUD de colecoes
// Requisitos: 3.6, 8.1, 8.2, 8.3

import { supabase } from './supabase';

// ============================================================================
// Tipos
// ============================================================================

export interface TagSuggestion {
  tag: string;
  count: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_shared: boolean;
  organization_id: string | null;
  user_id: string;
  evidence_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCollectionParams {
  name: string;
  description?: string | undefined;
  isShared?: boolean;
}

// Formato de resposta das Edge Functions
interface EdgeFunctionResponse<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

// ============================================================================
// Erro tipado para respostas HTTP
// ============================================================================

export class CatalogServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CatalogServiceError';
  }
}

// ============================================================================
// Retry com backoff exponencial para erros 5xx (max 3 tentativas)
// ============================================================================

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 500;
const BACKOFF_FACTOR = 2;

/** Verifica se o erro e retentavel (apenas 5xx) */
function isRetryableError(error: unknown): boolean {
  if (error instanceof CatalogServiceError) {
    return error.status >= 500;
  }
  // Erros de rede sao retentaveis
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') || msg.includes('fetch') || msg.includes('timeout');
  }
  return false;
}

/** Executa funcao com retry e backoff exponencial para erros 5xx */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Nao retentar erros 4xx ou ultima tentativa
      if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
        throw error;
      }

      // Backoff exponencial: 500ms, 1000ms, 2000ms...
      const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// Debounce para searchTags (300ms)
// ============================================================================

const DEBOUNCE_MS = 300;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let debounceReject: ((reason: Error) => void) | null = null;

/** Cancela busca de tags pendente */
function cancelPendingSearch(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (debounceReject) {
    debounceReject(new Error('cancelled'));
    debounceReject = null;
  }
}

// ============================================================================
// Helper para invocar Edge Functions
// ============================================================================

/** Tipos de método HTTP aceitos pelo Supabase invoke */
type HttpMethod = 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';

/** Invoca Edge Function e extrai dados da resposta padrão */
async function invokeFunction<T>(
  functionPath: string,
  options: { method?: HttpMethod; body?: Record<string, unknown> } = {}
): Promise<T> {
  const invokeOptions: { method: HttpMethod; body?: Record<string, unknown> } = {
    method: options.method ?? 'POST',
  };
  if (options.body) {
    invokeOptions.body = options.body;
  }

  const { data, error } = await supabase.functions.invoke(functionPath, invokeOptions);

  // Erro de transporte (rede, timeout)
  if (error) {
    throw new CatalogServiceError(
      error.message ?? 'Erro de comunicação com o servidor',
      500,
      'TRANSPORT_ERROR'
    );
  }

  // Resposta no formato EdgeFunctionResponse
  const response = data as EdgeFunctionResponse<T>;
  if (response?.error) {
    const status = response.error.code === 'UNAUTHORIZED' ? 401
      : response.error.code === 'VALIDATION_ERROR' ? 400
      : response.error.code === 'NOT_FOUND' ? 404
      : response.error.code === 'CONFLICT' ? 409
      : 500;
    throw new CatalogServiceError(response.error.message, status, response.error.code);
  }

  return (response?.data ?? data) as T;
}

// ============================================================================
// CatalogService
// ============================================================================

export class CatalogService {
  /**
   * Busca sugestões de tags via Edge Function tag-autocomplete.
   * Implementa debounce de 300ms - chamadas consecutivas cancelam a anterior.
   */
  searchTags(query: string): Promise<TagSuggestion[]> {
    cancelPendingSearch();

    return new Promise<TagSuggestion[]>((resolve, reject) => {
      debounceReject = reject;

      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        debounceReject = null;

        try {
          const params = new URLSearchParams({ q: query, limit: '10' });
          const result = await withRetry(() =>
            invokeFunction<{ tags: TagSuggestion[] }>(
              `tag-autocomplete?${params.toString()}`,
              { method: 'GET' }
            )
          );
          resolve(result.tags ?? []);
        } catch (error) {
          // Chamada cancelada pelo debounce não é erro real
          if (error instanceof Error && error.message === 'cancelled') {
            resolve([]);
            return;
          }
          reject(error);
        }
      }, DEBOUNCE_MS);
    });
  }

  /** Lista coleções do usuário (pessoais + compartilhadas da organização) */
  async listCollections(query?: string): Promise<Collection[]> {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    return withRetry(() =>
      invokeFunction<Collection[]>(`collection-manage${params}`, { method: 'GET' })
    );
  }

  /** Alias para listCollections - compatibilidade com CatalogModal existente */
  async getCollections(): Promise<Collection[]> {
    return this.listCollections();
  }

  /** Cria nova coleção. Aceita objeto CreateCollectionParams ou string (nome) para compatibilidade. */
  async createCollection(params: CreateCollectionParams | string): Promise<Collection> {
    const body = typeof params === 'string' ? { name: params } : { ...params };
    return withRetry(() =>
      invokeFunction<Collection>('collection-manage', {
        method: 'POST',
        body,
      })
    );
  }

  /** Atualiza nome/descrição de uma coleção */
  async updateCollection(
    id: string,
    params: Partial<CreateCollectionParams>
  ): Promise<Collection> {
    return withRetry(() =>
      invokeFunction<Collection>(`collection-manage/${id}`, {
        method: 'PATCH',
        body: { ...params },
      })
    );
  }

  /** Exclui uma coleção (CASCADE remove associações) */
  async deleteCollection(id: string): Promise<void> {
    await withRetry(() =>
      invokeFunction<unknown>(`collection-manage/${id}`, { method: 'DELETE' })
    );
  }

  /** Associa evidência a uma coleção */
  async addEvidenceToCollection(
    collectionId: string,
    evidenceId: string
  ): Promise<void> {
    await withRetry(() =>
      invokeFunction<unknown>(`collection-manage/${collectionId}/add`, {
        method: 'POST',
        body: { evidenceId },
      })
    );
  }

  /** Remove evidência de uma coleção */
  async removeEvidenceFromCollection(
    collectionId: string,
    evidenceId: string
  ): Promise<void> {
    await withRetry(() =>
      invokeFunction<unknown>(
        `collection-manage/${collectionId}/remove/${evidenceId}`,
        { method: 'DELETE' }
      )
    );
  }
}

// Instância singleton
export const catalogService = new CatalogService();
