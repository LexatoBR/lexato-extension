/**
 * @fileoverview Cliente Supabase para a extensão Chrome Lexato
 * @description Cliente Supabase configurado para funcionar no contexto da extensão (service worker e popup)
 *
 * Este cliente substitui o AWS Cognito e fornece:
 * - Autenticação via email/senha
 * - Refresh automático de tokens
 * - Armazenamento seguro em chrome.storage.local
 * - Compatibilidade com MFA/TOTP
 *
 * @author Equipe Lexato
 * @created 2026-02-02
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encrypt, decrypt, isEncrypted } from '../crypto/storage-encryption';

/**
 * Cliente Supabase singleton para a extensão
 */
let supabaseClient: SupabaseClient | null = null;

/**
 * Configuração do cliente Supabase
 */
interface SupabaseConfig {
  /** URL do projeto Supabase */
  url: string;
  /** Chave pública (anon key) */
  anonKey: string;
}

/**
 * Obtém configuração do Supabase das variáveis de ambiente
 *
 * @returns Configuração do Supabase
 * @throws {Error} Se as variáveis de ambiente não estiverem configuradas
 */
function getSupabaseConfig(): SupabaseConfig {
  const url = import.meta.env['VITE_SUPABASE_URL'];
  const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    throw new Error(
      'Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias. ' +
      'Configure no arquivo .env seguindo o .env.example'
    );
  }

  return { url, anonKey };
}

/**
 * Adapter personalizado para armazenamento no chrome.storage.local
 *
 * O Supabase por padrão usa localStorage, mas no contexto de service worker
 * não temos acesso a localStorage. Este adapter usa chrome.storage.local
 * com criptografia AES-256-GCM para proteger tokens JWT em repouso.
 *
 * Migração transparente: valores antigos (não criptografados) são lidos
 * normalmente e re-criptografados na próxima escrita.
 */
const chromeStorageAdapter = {
  /**
   * Obtém item do storage, descriptografando se necessário
   *
   * @param key - Chave do item
   * @returns Valor armazenado (descriptografado) ou null
   */
  getItem: async (key: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.local.get([key]);
      const value = result[key] as string | undefined;
      if (!value) return null;

      // Migração transparente: valores antigos não criptografados
      if (!isEncrypted(value)) {
        return value;
      }

      return await decrypt(value);
    } catch (error) {
      console.error('[supabase-client] Erro ao ler chrome.storage:', error);
      return null;
    }
  },

  /**
   * Armazena item no storage com criptografia AES-256-GCM
   *
   * @param key - Chave do item
   * @param value - Valor a armazenar (será criptografado)
   */
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const encrypted = await encrypt(value);
      await chrome.storage.local.set({ [key]: encrypted });
    } catch (error) {
      console.error('[supabase-client] Erro ao gravar chrome.storage:', error);
    }
  },

  /**
   * Remove item do storage
   *
   * @param key - Chave do item
   */
  removeItem: async (key: string): Promise<void> => {
    try {
      await chrome.storage.local.remove([key]);
    } catch (error) {
      console.error('[supabase-client] Erro ao remover do chrome.storage:', error);
    }
  }
};

/**
 * Cria ou retorna o cliente Supabase singleton
 *
 * @returns Cliente Supabase configurado
 *
 * @example
 * ```typescript
 * const supabase = createClient();
 *
 * // Login
 * const { data, error } = await supabase.auth.signInWithPassword({
 *   email: 'user@example.com',
 *   password: 'senha123'
 * });
 *
 * // Obter sessão atual
 * const { data: { session } } = await supabase.auth.getSession();
 *
 * // Logout
 * await supabase.auth.signOut();
 * ```
 */
export function createClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = getSupabaseConfig();

  // Criar cliente com storage adapter personalizado
  supabaseClient = createSupabaseClient(config.url, config.anonKey, {
    auth: {
      // Usar chrome.storage.local em vez de localStorage
      storage: chromeStorageAdapter,
      // Chave para armazenar a sessão
      storageKey: 'lexato-supabase-auth',
      // Auto refresh de tokens
      autoRefreshToken: true,
      // Persistir sessão
      persistSession: true,
      // Detectar mudanças de sessão
      detectSessionInUrl: false, // Não aplicável em extensões
      // Flow type - padrão para extensões
      flowType: 'implicit'
    },
    // Headers personalizados
    global: {
      headers: {
        'x-lexato-client': 'chrome-extension',
        'x-lexato-version': chrome.runtime.getManifest().version
      }
    }
  });

  // Listener para mudanças de autenticação
  supabaseClient.auth.onAuthStateChange((event, session) => {

    // Notificar outras partes da extensão sobre mudanças na autenticação
    chrome.runtime.sendMessage({
      type: 'AUTH_STATE_CHANGED',
      payload: {
        event,
        user: session?.user || null,
        accessToken: session?.access_token || null
      }
    }).catch(() => {
      // Ignorar erro se não houver listeners
    });
  });

  return supabaseClient;
}

/**
 * Alias para createClient (compatibilidade)
 */
export const getSupabaseClient = createClient;

/**
 * Obtém o cliente Supabase atual (sem criar um novo)
 *
 * @returns Cliente Supabase ou null se não foi criado ainda
 */
export function getClient(): SupabaseClient | null {
  return supabaseClient;
}

/**
 * Limpa o cliente Supabase (útil para testes)
 */
export function clearClient(): void {
  supabaseClient = null;
}