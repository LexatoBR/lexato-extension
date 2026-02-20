/**
 * @fileoverview Verificacao de versao da extensao Chrome via Supabase
 *
 * Consulta a tabela `extension_versions` para verificar se a versao
 * atual da extensao esta ativa, depreciada ou revogada.
 *
 * - active: Extensao funciona normalmente
 * - deprecated: Exibe aviso ao usuario para atualizar
 * - revoked: Bloqueia capturas e exige atualizacao
 *
 * @module VersionCheckClient
 * @author Equipe Lexato
 */

import { getSupabaseClient } from '../supabase/client';
import { addBreadcrumb, captureException } from '../sentry';

// =============================================================================
// TIPOS
// =============================================================================

/**
 * Status possivel de uma versao da extensao
 */
export type ExtensionVersionStatus = 'active' | 'deprecated' | 'revoked';

/**
 * Registro da tabela extension_versions
 */
export interface ExtensionVersionRecord {
  id: string;
  version: string;
  platform: string;
  extension_id: string;
  status: ExtensionVersionStatus;
  revocation_reason: string | null;
  deprecated_at: string | null;
  revoked_at: string | null;
}

/**
 * Resultado da verificacao de versao
 */
export interface VersionCheckResult {
  /** Status da versao atual */
  status: ExtensionVersionStatus;
  /** Mensagem para exibir ao usuario (se deprecated ou revoked) */
  message?: string;
  /** Motivo da revogacao (se revoked) */
  revocationReason?: string;
}

/**
 * Chave de armazenamento para cache da verificacao de versao
 */
const STORAGE_KEY_VERSION_CHECK = 'lexato:version-check';

/**
 * TTL do cache de verificacao em milissegundos (30 minutos)
 * Evita consultas excessivas ao banco entre verificacoes periodicas
 */
const VERSION_CHECK_CACHE_TTL_MS = 30 * 60 * 1000;

// =============================================================================
// FUNCAO PRINCIPAL
// =============================================================================

/**
 * Verifica o status da versao atual da extensao
 *
 * Consulta a tabela `extension_versions` no Supabase para determinar
 * se a versao instalada esta ativa, depreciada ou revogada.
 *
 * Usa cache local para evitar consultas excessivas ao banco.
 *
 * @param forceRefresh - Se true, ignora o cache e consulta o banco
 * @returns Resultado da verificacao com status e mensagem opcional
 *
 * @example
 * ```typescript
 * const result = await checkExtensionVersionStatus();
 * if (result.status === 'revoked') {
 *   // Bloquear capturas
 * } else if (result.status === 'deprecated') {
 *   // Exibir aviso
 * }
 * ```
 */
export async function checkExtensionVersionStatus(
  forceRefresh = false
): Promise<VersionCheckResult> {
  try {
    // Verificar cache primeiro (se nao forcar refresh)
    if (!forceRefresh) {
      const cached = await getCachedVersionCheck();
      if (cached) {
        addBreadcrumb({
          category: 'version-check',
          message: 'Usando resultado em cache',
          level: 'info',
          data: { status: cached.status },
        });
        return cached;
      }
    }

    const currentVersion = chrome.runtime.getManifest().version;
    const extensionId = chrome.runtime.id;

    addBreadcrumb({
      category: 'version-check',
      message: `Verificando versao ${currentVersion}`,
      level: 'info',
      data: { currentVersion, extensionId },
    });

    const supabase = getSupabaseClient();

    // Consultar tabela extension_versions
    const { data, error } = await supabase
      .from('extension_versions')
      .select('id, version, platform, extension_id, status, revocation_reason, deprecated_at, revoked_at')
      .eq('version', currentVersion)
      .eq('platform', 'chrome')
      .limit(1)
      .maybeSingle();

    if (error) {
      addBreadcrumb({
        category: 'version-check',
        message: `Erro ao consultar extension_versions: ${error.message}`,
        level: 'error',
      });
      captureException(new Error(`[VersionCheck] Erro Supabase: ${error.message}`));

      // Em caso de erro, assumir ativa para nao bloquear o usuario
      return { status: 'active' };
    }

    // Se nao encontrou registro, versao nao esta cadastrada - assumir ativa
    if (!data) {
      addBreadcrumb({
        category: 'version-check',
        message: `Versao ${currentVersion} nao encontrada na tabela - assumindo ativa`,
        level: 'warning',
      });

      const result: VersionCheckResult = { status: 'active' };
      await cacheVersionCheck(result);
      return result;
    }

    const record = data as ExtensionVersionRecord;
    let result: VersionCheckResult;

    switch (record.status) {
      case 'deprecated':
        result = {
          status: 'deprecated',
          message: `A versao ${currentVersion} da extensao esta depreciada. Por favor, atualize para a versao mais recente.`,
        };
        break;

      case 'revoked':
        result = {
          status: 'revoked',
          message: `A versao ${currentVersion} da extensao foi revogada e nao pode mais realizar capturas. Atualize imediatamente.`,
          ...(record.revocation_reason ? { revocationReason: record.revocation_reason } : {}),
        };
        break;

      case 'active':
      default:
        result = { status: 'active' };
        break;
    }

    addBreadcrumb({
      category: 'version-check',
      message: `Verificacao concluida: status=${result.status}`,
      level: 'info',
      data: { version: currentVersion, status: result.status },
    });

    // Salvar em cache
    await cacheVersionCheck(result);

    return result;
  } catch (error) {
    addBreadcrumb({
      category: 'version-check',
      message: 'Erro inesperado na verificacao de versao',
      level: 'error',
    });
    captureException(error);

    // Em caso de erro inesperado, nao bloquear o usuario
    return { status: 'active' };
  }
}

// =============================================================================
// CACHE LOCAL
// =============================================================================

/**
 * Estrutura do cache de verificacao de versao
 */
interface VersionCheckCache {
  result: VersionCheckResult;
  timestamp: number;
}

/**
 * Obtem resultado em cache da verificacao de versao
 * Retorna null se o cache estiver expirado ou nao existir
 */
async function getCachedVersionCheck(): Promise<VersionCheckResult | null> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_VERSION_CHECK);
    const cache = stored[STORAGE_KEY_VERSION_CHECK] as VersionCheckCache | undefined;

    if (!cache) {
      return null;
    }

    // Verificar TTL
    const age = Date.now() - cache.timestamp;
    if (age > VERSION_CHECK_CACHE_TTL_MS) {
      return null;
    }

    return cache.result;
  } catch {
    return null;
  }
}

/**
 * Salva resultado da verificacao em cache local
 */
async function cacheVersionCheck(result: VersionCheckResult): Promise<void> {
  try {
    const cache: VersionCheckCache = {
      result,
      timestamp: Date.now(),
    };

    await chrome.storage.local.set({
      [STORAGE_KEY_VERSION_CHECK]: cache,
    });
  } catch {
    // Falha silenciosa - cache nao eh critico
  }
}

/**
 * Limpa o cache de verificacao de versao
 * Util para forcar nova verificacao
 */
export async function clearVersionCheckCache(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY_VERSION_CHECK);
  } catch {
    // Falha silenciosa
  }
}
