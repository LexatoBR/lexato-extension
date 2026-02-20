/**
 * @fileoverview Exportação do AuthManager usando Supabase
 * @description Este arquivo exporta o novo AuthManager com Supabase mantendo compatibilidade
 *
 * Durante a migração, este arquivo pode ser renomeado para auth-manager.ts
 * substituindo o arquivo original após validação completa.
 *
 * @author Equipe Lexato
 * @created 2026-02-02
 */

import { AuthManagerSupabase } from './auth-manager-supabase';
import type { AuthManagerConfig } from './auth-manager-supabase';

// Re-exportar tipos necessários
export type { AuthManagerConfig };

// Re-exportar a classe com o nome original
export { AuthManagerSupabase as AuthManager };

// ============================================================================
// Singleton Pattern - Mantém compatibilidade com código existente
// ============================================================================

/**
 * Instância singleton do AuthManager
 */
let authManagerInstance: AuthManagerSupabase | null = null;

/**
 * Obtém instância singleton do AuthManager
 *
 * @param config - Configuração do AuthManager (obrigatório na primeira chamada)
 * @returns Instância do AuthManager
 */
export function getAuthManager(config?: AuthManagerConfig): AuthManagerSupabase {
  if (!authManagerInstance && !config) {
    // Criar com configuracao padrao se nao foi inicializado
    authManagerInstance = new AuthManagerSupabase();
  }

  if (config) {
    // Recriar instância se nova configuração foi fornecida
    authManagerInstance = new AuthManagerSupabase(config);
  }

  if (!authManagerInstance) {
    throw new Error('AuthManager não inicializado.');
  }

  return authManagerInstance;
}

/**
 * Reseta instância singleton (útil para testes)
 */
export function resetAuthManager(): void {
  authManagerInstance = null;
}

/**
 * Verifica se o AuthManager está inicializado
 *
 * @returns True se inicializado
 */
export function isAuthManagerInitialized(): boolean {
  return authManagerInstance !== null;
}

// Export default para compatibilidade
export default AuthManagerSupabase;