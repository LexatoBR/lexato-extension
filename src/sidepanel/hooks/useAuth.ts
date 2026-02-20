/**
 * Hook de autenticação para o Side Panel Lexato
 *
 * Gerencia estado de autenticação e operações de login/logout.
 *
 * Requisitos atendidos:
 * - 14.1: Utilizar Zustand para gerenciamento de estado global
 * - 14.4: Manter estado de usuário autenticado
 * - 14.5: Notificar componentes sobre mudanças de estado
 * - 4.1: Inicializar useAuth e verificar estado de autenticação
 * - 4.2: Exibir LoginForm quando não autenticado
 * - 4.3: Exibir interface principal quando autenticado
 *
 * @module useAuth
 */

import { useState, useEffect, useCallback } from 'react';
import { loggers } from '../../lib/logger';
import type { AuthUser, AuthTokens, LoginResult, MFASetupResult, MFAVerifySetupResult, WebAuthnRegisterStartResult, WebAuthnRegisterCompleteResult, WebAuthnAuthStartResult, WebAuthnAuthCompleteResult, WebAuthnCredentialsListResult } from '../../types/auth.types';

const log = loggers.auth.withPrefix('[useAuth]');

/**
 * Estado de autenticação do hook
 */
interface UseAuthState {
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
}

/**
 * Retorno do hook useAuth
 */
interface UseAuthReturn extends UseAuthState {
  /** Realiza login com email e senha (e opcionalmente token Turnstile) */
  login: (email: string, password: string, turnstileToken?: string) => Promise<LoginResult>;
  /** Realiza login com Google OAuth via chrome.identity */
  loginWithGoogle: () => Promise<LoginResult>;
  /** Completa login com código MFA */
  completeMfa: (code: string, session: string) => Promise<LoginResult>;
  /** Inicia configuração de MFA (primeiro login) */
  setupMfa: (session: string) => Promise<MFASetupResult>;
  /** Verifica código e completa setup de MFA */
  verifyMfaSetup: (code: string, session: string) => Promise<MFAVerifySetupResult>;
  /** Realiza logout */
  logout: () => Promise<void>;
  /** Limpa erro */
  clearError: () => void;
  /** Atualiza dados do usuário */
  refreshUser: () => Promise<void>;
  /**
   * Valida sessão ativa antes de operações críticas (ex: captura).
   * Verifica tokens no storage e tenta refresh se necessário.
   * Retorna true se sessão válida, false se expirada (redireciona para login).
   */
  validateSession: () => Promise<boolean>;
  /** Inicia registro de Passkey/WebAuthn */
  startWebAuthnRegistration: () => Promise<WebAuthnRegisterStartResult>;
  /** Completa registro de Passkey/WebAuthn */
  completeWebAuthnRegistration: (credential: PublicKeyCredential) => Promise<WebAuthnRegisterCompleteResult>;
  /** Inicia autenticação com Passkey/WebAuthn */
  startWebAuthnAuth: (email: string) => Promise<WebAuthnAuthStartResult>;
  /** Completa autenticação com Passkey/WebAuthn */
  completeWebAuthnAuth: (email: string, session: string, credential: PublicKeyCredential) => Promise<WebAuthnAuthCompleteResult>;
  /** Lista credenciais WebAuthn/Passkey */
  listWebAuthnCredentials: () => Promise<WebAuthnCredentialsListResult>;
}

/**
 * Chaves de armazenamento
 * 
 * IMPORTANTE: Usar prefixo 'lexato_' para evitar conflitos com outras extensões
 * e manter consistência com constants.ts e handlers de captura.
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
 * Hook de autenticação
 *
 * Funcionalidades:
 * - Verifica estado de autenticação ao montar
 * - Gerencia login/logout
 * - Suporta MFA
 * - Sincroniza com chrome.storage.local
 */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<UseAuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    tokens: null,
    error: null,
  });

  /**
   * Carrega estado de autenticação do storage
   */
  const loadAuthState = useCallback(async () => {
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
          // Token expirado - limpar dados e mostrar tela de login
          // Não tenta refresh para evitar loops de erro
          log.warn('Token expirado, limpando sessão');
          await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
          setState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            tokens: null,
            error: null, // Não mostra erro, apenas redireciona para login
          });
          return;
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

        setState({
          isAuthenticated: true,
          isLoading: false,
          user,
          tokens,
          error: null,
        });
      } else {
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          tokens: null,
          error: null,
        });
      }
    } catch (err) {
      log.error('Erro ao carregar estado', err);
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        tokens: null,
        error: 'Erro ao verificar autenticação',
      });
    }
  }, []);

  /**
   * Realiza login com email e senha
   * @param email - Email do usuário
   * @param password - Senha do usuário
   * @param turnstileToken - Token do Cloudflare Turnstile (opcional)
   */
  const login = useCallback(async (email: string, password: string, turnstileToken?: string): Promise<LoginResult> => {
    setState((prev) => ({ ...prev, error: null }));

    try {
      // Enviar para service worker
      const result = await chrome.runtime.sendMessage({
        type: 'LOGIN',
        payload: { email, password, turnstileToken },
      });

      if (result?.success) {
        // Usar tokens e user retornados diretamente (evita race condition com storage)
        const user = result.data?.user ?? null;
        const tokens = result.tokens ?? null;

        if (user && tokens) {
          setState({
            isAuthenticated: true,
            isLoading: false,
            user,
            tokens,
            error: null,
          });
        } else {
          // Fallback: recarregar do storage se dados não vieram na resposta
          await loadAuthState();
        }

        return { success: true, user, tokens };
      }

      // MFA já configurado - precisa do código
      if (result?.mfaRequired) {
        return {
          success: false,
          mfaRequired: true,
          mfaSession: result.mfaSession,
        };
      }

      // MFA não configurado - precisa configurar primeiro
      if (result?.mfaSetupRequired) {
        return {
          success: false,
          mfaSetupRequired: true,
          mfaSession: result.mfaSession,
        };
      }

      const errorMessage = result?.error ?? 'Falha ao realizar login';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    } catch {
      const errorMessage = 'Erro ao conectar com o servidor';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [loadAuthState]);

  /**
   * Realiza login com Google OAuth via chrome.identity
   */
  const loginWithGoogle = useCallback(async (): Promise<LoginResult> => {
    setState((prev) => ({ ...prev, error: null }));

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GOOGLE_LOGIN',
      });

      if (result?.success) {
        const user = result.data?.user ?? null;
        const tokens = result.tokens ?? null;

        if (user && tokens) {
          setState({
            isAuthenticated: true,
            isLoading: false,
            user,
            tokens,
            error: null,
          });
        } else {
          await loadAuthState();
        }

        return { success: true, user, tokens };
      }

      const errorMessage = result?.error ?? 'Falha ao entrar com Google';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    } catch {
      const errorMessage = 'Erro ao conectar com Google';
      setState((prev) => ({ ...prev, error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [loadAuthState]);

  /**
   * Completa login com código MFA
   */
  const completeMfa = useCallback(
    async (code: string, session: string): Promise<LoginResult> => {
      setState((prev) => ({ ...prev, error: null }));

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'MFA_VERIFY',
          payload: { code, session },
        });

        if (result?.success) {
          // Usar tokens e user retornados diretamente (evita race condition com storage)
          const user = result.data?.user ?? null;
          const tokens = result.tokens ?? null;

          if (user && tokens) {
            setState({
              isAuthenticated: true,
              isLoading: false,
              user,
              tokens,
              error: null,
            });
          } else {
            // Fallback: recarregar do storage se dados não vieram na resposta
            await loadAuthState();
          }

          return { success: true, user, tokens };
        }

        const errorMessage = result?.error ?? 'Código inválido';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao verificar código';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [loadAuthState]
  );

  /**
   * Inicia configuração de MFA (primeiro login)
   * @param session - Sessão do challenge MFA_SETUP
   */
  const setupMfa = useCallback(
    async (session: string): Promise<MFASetupResult> => {
      setState((prev) => ({ ...prev, error: null }));

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'MFA_SETUP',
          payload: { session },
        });

        if (result?.success) {
          return {
            success: true,
            secretCode: result.secretCode,
            qrCodeUri: result.qrCodeUri,
            session: result.session,
          };
        }

        const errorMessage = result?.error ?? 'Falha ao configurar MFA';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao conectar com o servidor';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  /**
   * Verifica código e completa setup de MFA (primeiro login)
   * @param code - Código TOTP de 6 dígitos
   * @param session - Sessão do setup
   */
  const verifyMfaSetup = useCallback(
    async (code: string, session: string): Promise<MFAVerifySetupResult> => {
      setState((prev) => ({ ...prev, error: null }));

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'MFA_VERIFY_SETUP',
          payload: { code, session },
        });

        if (result?.success) {
          // Usar tokens e user retornados diretamente (evita race condition com storage)
          const user = result.data?.user ?? null;
          const tokens = result.tokens ?? null;

          if (user && tokens) {
            setState({
              isAuthenticated: true,
              isLoading: false,
              user,
              tokens,
              error: null,
            });
          } else {
            // Fallback: recarregar do storage se dados não vieram na resposta
            await loadAuthState();
          }

          return { success: true, user, tokens };
        }

        const errorMessage = result?.error ?? 'Código inválido';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao verificar código';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [loadAuthState]
  );

  /**
   * Realiza logout
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      await chrome.runtime.sendMessage({ type: 'LOGOUT' });
      await chrome.storage.local.remove(Object.values(STORAGE_KEYS));

      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        tokens: null,
        error: null,
      });
    } catch (err) {
      log.error('[useAuth] Erro ao fazer logout:', err);
    }
  }, []);

  /**
   * Limpa erro
   */
  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Atualiza dados do usuário
   */
  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });

      if (result?.data?.user) {
        setState((prev) => ({ ...prev, user: result.data.user }));
      }
    } catch (err) {
      log.error('[useAuth] Erro ao atualizar usuário:', err);
    }
  }, []);

  // ==========================================================================
  // WebAuthn/Passkey
  // ==========================================================================

  /**
   * Inicia registro de Passkey/WebAuthn
   * Requer usuário já autenticado
   */
  const startWebAuthnRegistration = useCallback(
    async (): Promise<WebAuthnRegisterStartResult> => {
      setState((prev) => ({ ...prev, error: null }));

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'WEBAUTHN_REGISTER_START',
        });

        if (result?.success) {
          return {
            success: true,
            credentialCreationOptions: result.credentialCreationOptions,
          };
        }

        const errorMessage = result?.error ?? 'Falha ao iniciar registro de Passkey';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao conectar com o servidor';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  /**
   * Completa registro de Passkey/WebAuthn
   * @param credential - Credencial criada pelo navegador
   */
  const completeWebAuthnRegistration = useCallback(
    async (credential: PublicKeyCredential): Promise<WebAuthnRegisterCompleteResult> => {
      setState((prev) => ({ ...prev, error: null }));

      try {
        // Serializa a credencial para envio via mensagem
        const serializedCredential = serializeCredentialForMessage(credential);

        const result = await chrome.runtime.sendMessage({
          type: 'WEBAUTHN_REGISTER_COMPLETE',
          payload: { credential: serializedCredential },
        });

        if (result?.success) {
          return { success: true, message: result.message };
        }

        const errorMessage = result?.error ?? 'Falha ao registrar Passkey';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao registrar Passkey';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  /**
   * Inicia autenticação com Passkey/WebAuthn
   * @param email - Email do usuário
   */
  const startWebAuthnAuth = useCallback(
    async (email: string): Promise<WebAuthnAuthStartResult> => {
      setState((prev) => ({ ...prev, error: null }));

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'WEBAUTHN_AUTH_START',
          payload: { email },
        });

        if (result?.success) {
          return {
            success: true,
            session: result.session,
            credentialRequestOptions: result.credentialRequestOptions,
          };
        }

        const errorMessage = result?.error ?? 'Falha ao iniciar autenticação com Passkey';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao conectar com o servidor';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  /**
   * Completa autenticação com Passkey/WebAuthn
   * @param email - Email do usuário
   * @param session - Session do challenge
   * @param credential - Credencial assinada pelo navegador
   */
  const completeWebAuthnAuth = useCallback(
    async (
      email: string,
      session: string,
      credential: PublicKeyCredential
    ): Promise<WebAuthnAuthCompleteResult> => {
      setState((prev) => ({ ...prev, error: null }));

      try {
        const serializedCredential = serializeCredentialForMessage(credential);

        const result = await chrome.runtime.sendMessage({
          type: 'WEBAUTHN_AUTH_COMPLETE',
          payload: { email, session, credential: serializedCredential },
        });

        if (result?.success) {
          // Usar tokens e user retornados diretamente (evita race condition com storage)
          const user = result.data?.user ?? null;
          const tokens = result.tokens ?? null;

          if (user && tokens) {
            setState({
              isAuthenticated: true,
              isLoading: false,
              user,
              tokens,
              error: null,
            });
          } else {
            // Fallback: recarregar do storage se dados não vieram na resposta
            await loadAuthState();
          }

          return { success: true, user, tokens };
        }

        const errorMessage = result?.error ?? 'Falha na autenticação com Passkey';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      } catch {
        const errorMessage = 'Erro ao autenticar com Passkey';
        setState((prev) => ({ ...prev, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [loadAuthState]
  );

  /**
   * Lista credenciais WebAuthn/Passkey do usuário
   */
  const listWebAuthnCredentials = useCallback(
    async (): Promise<WebAuthnCredentialsListResult> => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'WEBAUTHN_LIST_CREDENTIALS',
        });

        if (result?.success) {
          return { success: true, credentials: result.credentials };
        }

        return { success: false, error: result?.error ?? 'Falha ao listar Passkeys' };
      } catch {
        return { success: false, error: 'Erro ao listar Passkeys' };
      }
    },
    []
  );

  /**
   * Valida sessão ativa antes de operações críticas
   *
   * Verifica se existem tokens no storage e se não estão expirados.
   * Se o token está expirado, tenta refresh via service worker.
   * Se o refresh falhar, limpa estado e redireciona para login.
   *
   * Deve ser chamado ANTES de iniciar operações como captura,
   * evitando que o erro de sessão expirada apareça no final do processo.
   *
   * @returns true se sessão válida, false se expirada (estado já limpo)
   */
  const validateSession = useCallback(async (): Promise<boolean> => {
    log.debug('Validando sessão antes de operação crítica');

    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.EXPIRES_AT,
      ]);

      const accessToken = result[STORAGE_KEYS.ACCESS_TOKEN] as string | undefined;
      const refreshToken = result[STORAGE_KEYS.REFRESH_TOKEN] as string | undefined;
      const expiresAt = result[STORAGE_KEYS.EXPIRES_AT] as number | undefined;

      // Sem tokens - não está logado
      if (!accessToken || !refreshToken) {
        log.warn('Validação de sessão: sem tokens no storage');
        await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          tokens: null,
          error: 'Sua sessão expirou. Faça login novamente.',
        });
        return false;
      }

      // Token ainda válido (com margem de 60s para evitar expirar durante a captura)
      const SAFETY_MARGIN_MS = 60 * 1000;
      if (expiresAt && Date.now() < expiresAt - SAFETY_MARGIN_MS) {
        log.debug('Sessão válida');
        return true;
      }

      // Token expirado ou expirando em breve - tentar refresh via service worker
      log.info('Token expirado ou expirando, tentando refresh');
      try {
        const refreshResult = await chrome.runtime.sendMessage({
          type: 'AUTH_REFRESH_TOKEN',
        });

        if (refreshResult?.success) {
          log.info('Refresh de token bem-sucedido');
          // Recarregar estado com novos tokens
          await loadAuthState();
          return true;
        }

        // Refresh falhou - sessão inválida
        log.warn('Refresh de token falhou', { error: refreshResult?.error });
      } catch (err) {
        log.error('Erro ao tentar refresh de token', err);
      }

      // Limpar estado e redirecionar para login
      await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        tokens: null,
        error: 'Sua sessão expirou. Faça login novamente.',
      });
      return false;
    } catch (err) {
      log.error('Erro na validação de sessão', err);
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        tokens: null,
        error: 'Erro ao verificar sessão. Faça login novamente.',
      });
      return false;
    }
  }, [loadAuthState]);

  /**
   * Limpa estado de autenticação local (usado quando sessão expira)
   */
  const clearLocalAuthState = useCallback(async (): Promise<void> => {
    try {
      await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        tokens: null,
        error: 'Sua sessão expirou. Faça login novamente.',
      });
    } catch (err) {
      log.error('[useAuth] Erro ao limpar estado local:', err);
    }
  }, []);

  // Carregar estado inicial
  useEffect(() => {
    loadAuthState();
  }, [loadAuthState]);

  // Atualizar dados do perfil (créditos, avatar) do Supabase quando o painel abre
  useEffect(() => {
    if (state.isAuthenticated && !state.isLoading) {
      // Busca dados frescos do Supabase em background
      chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' })
        .then((result: { data?: { user?: AuthUser } }) => {
          if (result?.data?.user) {
            setState((prev) => ({ ...prev, user: result.data!.user! }));
          }
        })
        .catch(() => {
          // Silencioso - dados do storage continuam válidos
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isAuthenticated, state.isLoading]);

  // Escutar mensagem AUTH_SESSION_EXPIRED do service worker
  useEffect(() => {
    /**
     * Handler para mensagens do service worker
     * Trata AUTH_SESSION_EXPIRED para limpar estado e redirecionar para login
     */
    const handleServiceWorkerMessage = (
      message: { type: string; payload?: { correlationId?: string; message?: string } }
    ): void => {
      if (message?.type === 'AUTH_SESSION_EXPIRED') {
        log.warn('Sessão expirada - limpando estado local', {
          correlationId: message.payload?.correlationId,
        });
        clearLocalAuthState();
      }
    };

    chrome.runtime.onMessage.addListener(handleServiceWorkerMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleServiceWorkerMessage);
    };
  }, [clearLocalAuthState]);

  // Escutar mudanças no storage
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ): void => {
      if (areaName !== 'local') {
        return;
      }

      // Verificar se alguma chave de auth mudou
      const authKeys = Object.values(STORAGE_KEYS);
      const hasAuthChange = Object.keys(changes).some((key) => authKeys.includes(key as typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]));

      if (hasAuthChange) {
        loadAuthState();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [loadAuthState]);

  return {
    ...state,
    login,
    loginWithGoogle,
    completeMfa,
    setupMfa,
    verifyMfaSetup,
    logout,
    clearError,
    refreshUser,
    validateSession,
    startWebAuthnRegistration,
    completeWebAuthnRegistration,
    startWebAuthnAuth,
    completeWebAuthnAuth,
    listWebAuthnCredentials,
  };
}

/**
 * Serializa PublicKeyCredential para envio via chrome.runtime.sendMessage
 * Converte ArrayBuffer para base64url
 */
function serializeCredentialForMessage(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response;

  // Serializa dados base
  const serialized: Record<string, unknown> = {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
    },
  };

  // AuthenticatorAttestationResponse (registro)
  const attestationResponse = response as AuthenticatorAttestationResponse;
  if (typeof attestationResponse.attestationObject !== 'undefined') {
    (serialized['response'] as Record<string, unknown>)['attestationObject'] = 
      arrayBufferToBase64Url(attestationResponse.attestationObject);
  }

  // AuthenticatorAssertionResponse (autenticação)
  const assertionResponse = response as AuthenticatorAssertionResponse;
  if (typeof assertionResponse.authenticatorData !== 'undefined') {
    const respObj = serialized['response'] as Record<string, unknown>;
    respObj['authenticatorData'] = arrayBufferToBase64Url(assertionResponse.authenticatorData);
    respObj['signature'] = arrayBufferToBase64Url(assertionResponse.signature);
    if (assertionResponse.userHandle) {
      respObj['userHandle'] = arrayBufferToBase64Url(assertionResponse.userHandle);
    }
  }

  return serialized;
}

/**
 * Converte ArrayBuffer para base64url
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export default useAuth;
