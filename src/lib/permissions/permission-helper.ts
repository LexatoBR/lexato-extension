/**
 * PermissionHelper - Módulo centralizado para gerenciamento de permissões opcionais
 *
 * Gerencia solicitação, verificação e cache de permissões opcionais da extensão.
 * Usa chrome.storage.session para persistir cache entre reinícios do Service Worker.
 *
 * IMPORTANTE: chrome.permissions.request() requer user gesture (clique do usuário).
 * O requestPermission() deve ser chamado APENAS a partir de popup, sidepanel ou
 * options page, dentro de um handler de clique. NÃO funciona no Service Worker.
 *
 * O Service Worker deve usar apenas hasPermission() (que usa chrome.permissions.contains())
 * e withPermission() para verificar e reagir ao estado das permissões.
 *
 * @module PermissionHelper
 */

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------

/**
 * Permissões opcionais suportadas pela extensão Lexato.
 * Estas permissões são declaradas em optional_permissions no manifest
 * e solicitadas sob demanda durante o uso.
 */
export type OptionalPermission =
  | 'management'
  | 'notifications'
  | 'tabCapture';

/**
 * Estrutura de cache persistida em chrome.storage.session.
 * Sobrevive a reinícios do Service Worker dentro da mesma sessão do browser.
 */
export interface PermissionCacheData {
  /** Mapa de permissão para estado (true = concedida, false = recusada) */
  state: Record<string, boolean>;
  /** Timestamp da última verificação por permissão (ms desde epoch) */
  lastChecked: Record<string, number>;
  /** TTL do cache em ms (padrão: 5 minutos = 300000ms) */
  ttl: number;
}

/**
 * Interface pública do PermissionHelper.
 */
export interface PermissionHelper {
  /**
   * Verifica se uma permissão opcional está concedida.
   * Usa chrome.storage.session como cache para sobreviver a reinícios do SW.
   * Pode ser chamado de qualquer contexto (SW, popup, sidepanel).
   */
  hasPermission(permission: OptionalPermission): Promise<boolean>;

  /**
   * Solicita uma permissão opcional ao usuário.
   * DEVE ser chamado APENAS a partir de popup, sidepanel ou options page,
   * dentro de um handler de clique (user gesture obrigatório).
   * NÃO funciona no Service Worker.
   * Retorna true se concedida, false se recusada.
   */
  requestPermission(permission: OptionalPermission): Promise<boolean>;

  /**
   * Verifica permissão e executa callback apropriado.
   * Se concedida, executa onGranted. Se recusada, executa onDenied (ou retorna undefined).
   * Pode ser chamado do Service Worker (apenas verifica, não solicita).
   */
  withPermission<T>(
    permission: OptionalPermission,
    onGranted: () => Promise<T>,
    onDenied?: () => Promise<T>,
  ): Promise<T | undefined>;

  /**
   * Limpa o cache de permissões no chrome.storage.session.
   * Útil quando o usuário revoga permissões via chrome://extensions.
   */
  clearCache(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Chave usada no chrome.storage.session para armazenar o cache */
const CACHE_STORAGE_KEY = 'permissionCache';

/** TTL padrão do cache: 5 minutos em milissegundos */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 300000ms

/** Lista de permissões opcionais válidas para validação */
const VALID_PERMISSIONS: readonly OptionalPermission[] = [
  'management',
  'notifications',
  'tabCapture',
] as const;

// ---------------------------------------------------------------------------
// Implementação interna
// ---------------------------------------------------------------------------

/**
 * Verifica se uma string é uma permissão opcional válida.
 */
function isValidPermission(permission: string): permission is OptionalPermission {
  return VALID_PERMISSIONS.includes(permission as OptionalPermission);
}

/**
 * Lê o cache de permissões do chrome.storage.session.
 * Retorna null se o cache não existir ou estiver corrompido.
 */
async function readCache(): Promise<PermissionCacheData | null> {
  try {
    const result = await chrome.storage.session.get(CACHE_STORAGE_KEY);
    const data = result[CACHE_STORAGE_KEY] as PermissionCacheData | undefined;

    if (!data || typeof data.ttl !== 'number' || !data.state || !data.lastChecked) {
      return null;
    }

    return data;
  } catch {
    // chrome.storage.session pode não estar disponível em todos os contextos
    return null;
  }
}

/**
 * Persiste o cache de permissões no chrome.storage.session.
 */
async function writeCache(data: PermissionCacheData): Promise<void> {
  try {
    await chrome.storage.session.set({ [CACHE_STORAGE_KEY]: data });
  } catch {
    // Falha silenciosa - o cache é uma otimização, não um requisito
  }
}

/**
 * Retorna o cache existente ou cria um novo com valores padrão.
 */
async function getOrCreateCache(): Promise<PermissionCacheData> {
  const existing = await readCache();
  if (existing) {
    return existing;
  }

  return {
    state: {},
    lastChecked: {},
    ttl: DEFAULT_CACHE_TTL_MS,
  };
}

/**
 * Verifica se a entrada de cache para uma permissão ainda é válida (dentro do TTL).
 */
function isCacheValid(cache: PermissionCacheData, permission: OptionalPermission): boolean {
  const lastChecked = cache.lastChecked[permission];
  if (lastChecked === undefined) {
    return false;
  }

  const elapsed = Date.now() - lastChecked;
  return elapsed < cache.ttl;
}

/**
 * Atualiza o cache com o estado de uma permissão e persiste.
 */
async function updateCacheEntry(
  permission: OptionalPermission,
  granted: boolean,
): Promise<void> {
  const cache = await getOrCreateCache();
  cache.state[permission] = granted;
  cache.lastChecked[permission] = Date.now();
  await writeCache(cache);
}

// ---------------------------------------------------------------------------
// Implementação do PermissionHelper
// ---------------------------------------------------------------------------

/**
 * Cria uma instância do PermissionHelper.
 * Separado em factory para facilitar testes.
 */
export function createPermissionHelper(): PermissionHelper {
  return {
    async hasPermission(permission: OptionalPermission): Promise<boolean> {
      if (!isValidPermission(permission)) {
        return false;
      }

      // Verificar cache primeiro
      const cache = await getOrCreateCache();
      if (isCacheValid(cache, permission)) {
        return cache.state[permission] ?? false;
      }

      // Cache expirado ou inexistente - consultar API do Chrome
      try {
        const granted = await chrome.permissions.contains({
          permissions: [permission],
        });

        // Atualizar cache com resultado
        await updateCacheEntry(permission, granted);

        return granted;
      } catch {
        // Em caso de erro na API, retornar false (permissão não confirmada)
        return false;
      }
    },

    async requestPermission(permission: OptionalPermission): Promise<boolean> {
      if (!isValidPermission(permission)) {
        return false;
      }

      // Verificar cache - se já concedida, não solicitar novamente
      const cache = await getOrCreateCache();
      if (isCacheValid(cache, permission) && cache.state[permission] === true) {
        return true;
      }

      // Solicitar permissão ao usuário
      // IMPORTANTE: esta chamada REQUER user gesture (clique do usuário)
      try {
        const granted = await chrome.permissions.request({
          permissions: [permission],
        });

        // Atualizar cache com resultado
        await updateCacheEntry(permission, granted);

        return granted;
      } catch {
        // Erro na solicitação (ex: chamado fora de user gesture)
        // Tratar como recusa
        await updateCacheEntry(permission, false);
        return false;
      }
    },

    async withPermission<T>(
      permission: OptionalPermission,
      onGranted: () => Promise<T>,
      onDenied?: () => Promise<T>,
    ): Promise<T | undefined> {
      const granted = await this.hasPermission(permission);

      if (granted) {
        return onGranted();
      }

      if (onDenied) {
        return onDenied();
      }

      return undefined;
    },

    async clearCache(): Promise<void> {
      try {
        await chrome.storage.session.remove(CACHE_STORAGE_KEY);
      } catch {
        // Falha silenciosa - o cache pode não existir
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton exportado
// ---------------------------------------------------------------------------

/**
 * Instância singleton do PermissionHelper.
 * Usar esta instância em todo o código da extensão para garantir
 * consistência do cache de permissões.
 */
export const permissionHelper = createPermissionHelper();
