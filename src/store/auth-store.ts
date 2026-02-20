/**
 * Store de Autenticação Zustand
 *
 * Gerencia estado global de autenticação da extensão.
 *
 * Requisitos atendidos:
 * - 14.1: Utilizar Zustand para gerenciamento de estado global
 * - 14.4: Manter estado de usuário autenticado
 * - 14.5: Notificar componentes sobre mudanças de estado
 *
 * @module AuthStore
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { captureException } from '../lib/sentry';
import type { AuthUser, AuthTokens, LoginResult } from '../types/auth.types';

/**
 * Chaves de armazenamento no chrome.storage.local
 */
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'lexato_access_token',
  REFRESH_TOKEN: 'lexato_refresh_token',
  ID_TOKEN: 'lexato_id_token',
  EXPIRES_AT: 'lexato_expires_at',
  OBTAINED_AT: 'lexato_obtained_at',
  USER: 'lexato_user',
} as const;

/**
 * Estado do store de autenticação
 */
interface AuthStoreState {
  /** Se usuário está autenticado */
  isAuthenticated: boolean;
  /** Se está carregando estado inicial */
  isLoading: boolean;
  /** Dados do usuário autenticado */
  user: AuthUser | null;
  /** Tokens de autenticação */
  tokens: AuthTokens | null;
  /** Mensagem de erro */
  error: string | null;
  /** Se está em processo de login */
  isLoggingIn: boolean;
  /** Se está em processo de logout */
  isLoggingOut: boolean;
}

/**
 * Ações do store de autenticação
 */
interface AuthStoreActions {
  /** Carrega estado de autenticação do storage */
  loadAuthState: () => Promise<void>;
  /** Realiza login com email e senha */
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Completa login com código MFA */
  completeMfa: (code: string, session: string) => Promise<LoginResult>;
  /** Realiza logout */
  logout: () => Promise<void>;
  /** Limpa erro */
  clearError: () => void;
  /** Atualiza dados do usuário */
  refreshUser: () => Promise<void>;
  /** Define estado de autenticação (para sincronização) */
  setAuthState: (state: Partial<AuthStoreState>) => void;
  /** Atualiza créditos do usuário */
  updateCredits: (credits: number) => void;
}

/**
 * Tipo completo do store
 */
type AuthStore = AuthStoreState & AuthStoreActions;

/**
 * Estado inicial
 */
const initialState: AuthStoreState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  tokens: null,
  error: null,
  isLoggingIn: false,
  isLoggingOut: false,
};

/**
 * Store de autenticação Zustand
 *
 * Funcionalidades:
 * - Gerencia estado de autenticação global
 * - Sincroniza com chrome.storage.local
 * - Suporta MFA
 * - Notifica componentes sobre mudanças
 */
export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    /**
     * Carrega estado de autenticação do storage
     */
    loadAuthState: async (): Promise<void> => {
      try {
        const result = await chrome.storage.local.get([
          STORAGE_KEYS.ACCESS_TOKEN,
          STORAGE_KEYS.REFRESH_TOKEN,
          STORAGE_KEYS.ID_TOKEN,
          STORAGE_KEYS.EXPIRES_AT,
          STORAGE_KEYS.OBTAINED_AT,
          STORAGE_KEYS.USER,
        ]);

        const accessToken = result[STORAGE_KEYS.ACCESS_TOKEN] as string | undefined;
        const refreshToken = result[STORAGE_KEYS.REFRESH_TOKEN] as string | undefined;
        const user = result[STORAGE_KEYS.USER] as AuthUser | undefined;

        if (accessToken && refreshToken && user) {
          const expiresAt = result[STORAGE_KEYS.EXPIRES_AT] as number;

          // Verificar se token expirou
          if (Date.now() >= expiresAt) {
            // Token expirado - tentar refresh via service worker
            const refreshResult = await chrome.runtime.sendMessage({
              type: 'AUTH_REFRESH_TOKEN',
            });

            if (!refreshResult?.success) {
              // Refresh falhou - limpar dados
              await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
              set({
                isAuthenticated: false,
                isLoading: false,
                user: null,
                tokens: null,
                error: 'Sua sessão expirou. Faça login novamente.',
              });
              return;
            }
          }

          const tokens: AuthTokens = {
            accessToken,
            refreshToken,
            expiresAt: result[STORAGE_KEYS.EXPIRES_AT] as number,
            obtainedAt: result[STORAGE_KEYS.OBTAINED_AT] as number,
          };

          const idToken = result[STORAGE_KEYS.ID_TOKEN] as string | undefined;
          if (idToken) {
            tokens.idToken = idToken;
          }

          set({
            isAuthenticated: true,
            isLoading: false,
            user,
            tokens,
            error: null,
          });
        } else {
          set({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            tokens: null,
            error: null,
          });
        }
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { component: 'AuthStore', operation: 'loadAuthState' },
        });
        set({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          tokens: null,
          error: 'Erro ao verificar autenticação',
        });
      }
    },

    /**
     * Realiza login com email e senha
     */
    login: async (email: string, password: string): Promise<LoginResult> => {
      set({ error: null, isLoggingIn: true });

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'AUTH_LOGIN',
          payload: { email, password },
        });

        if (result?.success) {
          await get().loadAuthState();
          set({ isLoggingIn: false });
          return { success: true, user: result.user, tokens: result.tokens };
        }

        if (result?.mfaRequired) {
          set({ isLoggingIn: false });
          return {
            success: false,
            mfaRequired: true,
            mfaSession: result.mfaSession,
          };
        }

        const errorMessage = result?.error ?? 'Falha ao realizar login';
        set({ error: errorMessage, isLoggingIn: false });
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao conectar com o servidor';
        set({ error: errorMessage, isLoggingIn: false });
        return { success: false, error: errorMessage };
      }
    },

    /**
     * Completa login com código MFA
     */
    completeMfa: async (code: string, session: string): Promise<LoginResult> => {
      set({ error: null, isLoggingIn: true });

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'AUTH_MFA_VERIFY',
          payload: { code, session },
        });

        if (result?.success) {
          await get().loadAuthState();
          set({ isLoggingIn: false });
          return { success: true, user: result.user, tokens: result.tokens };
        }

        const errorMessage = result?.error ?? 'Código inválido';
        set({ error: errorMessage, isLoggingIn: false });
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao verificar código';
        set({ error: errorMessage, isLoggingIn: false });
        return { success: false, error: errorMessage };
      }
    },

    /**
     * Realiza logout
     */
    logout: async (): Promise<void> => {
      set({ isLoggingOut: true });

      try {
        await chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' });
        await chrome.storage.local.remove(Object.values(STORAGE_KEYS));

        set({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          tokens: null,
          error: null,
          isLoggingOut: false,
        });
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { component: 'AuthStore', operation: 'logout' },
        });
        set({ isLoggingOut: false });
      }
    },

    /**
     * Limpa erro
     */
    clearError: (): void => {
      set({ error: null });
    },

    /**
     * Atualiza dados do usuário
     */
    refreshUser: async (): Promise<void> => {
      try {
        const result = await chrome.runtime.sendMessage({ type: 'AUTH_GET_USER' });

        if (result?.user) {
          set({ user: result.user });
        }
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { component: 'AuthStore', operation: 'refreshUser' },
        });
      }
    },

    /**
     * Define estado de autenticação (para sincronização externa)
     */
    setAuthState: (state: Partial<AuthStoreState>): void => {
      set(state);
    },

    /**
     * Atualiza créditos do usuário
     */
    updateCredits: (credits: number): void => {
      const { user } = get();
      if (user) {
        set({ user: { ...user, credits } });
      }
    },
  }))
);

/**
 * Inicializa listener de mudanças no storage
 */
export function initAuthStorageListener(): () => void {
  const handleStorageChange = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ): void => {
    if (areaName !== 'local') {
      return;
    }

    // Verificar se alguma chave de auth mudou
    const authKeys = Object.values(STORAGE_KEYS);
    const hasAuthChange = Object.keys(changes).some((key) =>
      authKeys.includes(key as (typeof authKeys)[number])
    );

    if (hasAuthChange) {
      useAuthStore.getState().loadAuthState();
    }
  };

  chrome.storage.onChanged.addListener(handleStorageChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  };
}

export default useAuthStore;
