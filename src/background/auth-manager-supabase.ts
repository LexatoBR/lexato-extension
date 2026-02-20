/**
 * Gerenciador de autenticação para a extensão Lexato usando Supabase
 *
 * Substitui o AuthManager original que usava AWS Cognito.
 * Mantém a mesma interface pública para não quebrar compatibilidade.
 *
 * Requisitos atendidos:
 * - Login com email e senha via Supabase Auth
 * - Armazenar tokens em chrome.storage.local
 * - Logout com limpeza de tokens
 * - Verificar validade do token ao abrir popup
 * - Refresh automático de token
 * - Suportar MFA (TOTP) quando configurado
 *
 * @module AuthManagerSupabase
 */

import { createClient } from '../lib/supabase/client';
import { AuditLogger } from '../lib/audit-logger';
import { LexatoError, ErrorCodes } from '../lib/errors';
import type {
  AuthTokens,
  AuthUser,
  AuthState,
  LoginCredentials,
  LoginResult,
  RefreshResult,
  AuthConfig
} from '../types/auth.types';
import type { SupabaseClient, Session, User } from '@supabase/supabase-js';

// ============================================================================
// Constantes
// ============================================================================

/**
 * Chaves para armazenamento no chrome.storage.local
 * Mantidas idênticas ao AuthManager original para compatibilidade
 */
const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: 'lexato_access_token',
  REFRESH_TOKEN: 'lexato_refresh_token',
  ID_TOKEN: 'lexato_id_token',
  EXPIRES_AT: 'lexato_expires_at', // Corrigido: era 'lexato_token_expires_at' - deve ser igual ao constants.ts
  OBTAINED_AT: 'lexato_obtained_at', // Corrigido: era 'lexato_token_obtained_at' - deve ser igual ao constants.ts
  USER: 'lexato_user',
  MFA_SESSION: 'lexato_mfa_session',
} as const;

/**
 * Nome do alarme para verificação de refresh
 */
const REFRESH_ALARM_NAME = 'lexato_auth_refresh_check';

/**
 * Configuração padrão de refresh
 */
const DEFAULT_AUTH_CONFIG: AuthConfig = {
  checkIntervalMs: 5 * 60 * 1000, // 5 minutos
  refreshBeforeExpiryMs: 10 * 60 * 1000, // 10 minutos antes de expirar
  maxRefreshAttempts: 3, // Máximo de tentativas de refresh
};

// ============================================================================
// Tipos e Interfaces
// ============================================================================

/**
 * Configuração do AuthManager
 */
export interface AuthManagerConfig {
  /** Logger para auditoria */
  logger?: AuditLogger;
  /** Configuração de refresh */
  refreshConfig?: Partial<AuthConfig>;
}

// ============================================================================
// Classe AuthManagerSupabase
// ============================================================================

/**
 * Gerenciador de autenticação usando Supabase
 *
 * @example
 * ```typescript
 * const authManager = new AuthManagerSupabase({
 *   logger: new AuditLogger()
 * });
 *
 * // Login
 * const result = await authManager.login({
 *   email: 'user@example.com',
 *   password: 'senha123'
 * });
 *
 * // Verificar estado
 * const state = await authManager.getAuthState();
 * ```
 */
export class AuthManagerSupabase {
  private readonly supabase: SupabaseClient;
  private readonly logger: AuditLogger;
  private readonly authConfig: AuthConfig;

  constructor(config?: AuthManagerConfig) {
    this.supabase = createClient();
    this.logger = config?.logger ?? new AuditLogger();
    this.authConfig = {
      ...DEFAULT_AUTH_CONFIG,
      ...config?.refreshConfig,
    };

    this.logger.info('AUTH', 'AUTH_MANAGER_INITIALIZED', {
      provider: 'supabase',
      checkInterval: this.authConfig.checkIntervalMs,
      refreshBefore: this.authConfig.refreshBeforeExpiryMs,
    });
  }

  // ==========================================================================
  // Métodos Públicos Principais
  // ==========================================================================

  /**
   * Realiza login com email e senha
   *
   * @param credentials - Credenciais de login
   * @returns Resultado do login
   */
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    this.logger.info('AUTH', 'LOGIN_ATTEMPT', { email: credentials.email });

    try {
      // Tentar login com Supabase
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        this.logger.error('AUTH', 'LOGIN_FAILED', {
          error: error.message,
          code: error.status,
        });

        // Mapear erros do Supabase para erros Lexato
        if (error.message.includes('Invalid login credentials')) {
          throw new LexatoError(ErrorCodes.AUTH_INVALID_CREDENTIALS);
        }

        // MFA necessário
        if (error.message.includes('MFA') || error.message.includes('factor')) {
          return {
            success: false,
            mfaRequired: true,
            // TODO: Implementar suporte a MFA com Supabase
            // Por enquanto, retornamos erro genérico
            error: 'MFA ainda não suportado com Supabase Auth',
          };
        }

        throw new LexatoError(ErrorCodes.AUTH_INVALID_CREDENTIALS, {
          customMessage: error.message,
        });
      }

      if (!data.session || !data.user) {
        throw new LexatoError(ErrorCodes.AUTH_INVALID_CREDENTIALS);
      }

      // Converter dados do Supabase para formato Lexato
      const tokens = await this.convertSessionToTokens(data.session);
      const user = await this.convertSupabaseUser(data.user, data.session);

      // Armazenar tokens e usuário
      await this.storeTokens(tokens);
      await this.storeUser(user);

      // Iniciar verificação automática de refresh
      await this.startRefreshCheck();

      this.logger.info('AUTH', 'LOGIN_SUCCESS', { userId: user.id });

      return {
        success: true,
        user,
        tokens,
      };
    } catch (error) {
      this.logger.error('AUTH', 'LOGIN_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });

      if (error instanceof LexatoError) {
        return { success: false, error: error.userMessage };
      }

      return {
        success: false,
        error: 'Falha ao realizar login. Verifique suas credenciais.',
      };
    }
  }

  /**
   * Realiza logout e limpa dados de autenticação
   */
  async logout(): Promise<void> {
    this.logger.info('AUTH', 'LOGOUT_ATTEMPT');

    try {
      // Fazer logout no Supabase
      await this.supabase.auth.signOut();

      // Limpar dados locais
      await this.clearAllAuthData();

      // Parar verificação de refresh
      await this.stopRefreshCheck();

      this.logger.info('AUTH', 'LOGOUT_SUCCESS');
    } catch (error) {
      this.logger.error('AUTH', 'LOGOUT_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });

      // Mesmo com erro, limpar dados locais
      await this.clearAllAuthData();
      await this.stopRefreshCheck();
    }
  }

  /**
   * Verifica e atualiza tokens se necessário
   *
   * @returns Resultado do refresh
   */
  async refreshTokens(): Promise<RefreshResult> {
    this.logger.info('AUTH', 'REFRESH_ATTEMPT');

    try {
      // Obter sessão atual do Supabase
      const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();

      if (sessionError || !session) {
        this.logger.error('AUTH', 'NO_SESSION_FOR_REFRESH');
        return { success: false, error: 'Sessão não encontrada' };
      }

      // Tentar refresh com Supabase
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: session.refresh_token
      });

      if (error) {
        this.logger.error('AUTH', 'REFRESH_FAILED', {
          error: error.message,
        });

        if (error.message.includes('refresh_token_not_found')) {
          // Token expirado, precisa fazer login novamente
          await this.clearAllAuthData();
          return { success: false, error: 'Sessão expirada. Faça login novamente.' };
        }

        return { success: false, error: error.message };
      }

      if (!data.session) {
        return { success: false, error: 'Falha ao atualizar sessão' };
      }

      // Converter e armazenar novos tokens
      const tokens = await this.convertSessionToTokens(data.session);
      const user = await this.convertSupabaseUser(data.user!, data.session);

      await this.storeTokens(tokens);
      await this.storeUser(user);

      this.logger.info('AUTH', 'REFRESH_SUCCESS', {
        userId: user.id,
        expiresAt: tokens.expiresAt,
      });

      return {
        success: true,
        tokens,
      };
    } catch (error) {
      this.logger.error('AUTH', 'REFRESH_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });

      return {
        success: false,
        error: 'Falha ao atualizar tokens',
      };
    }
  }

  /**
   * Obtém estado atual da autenticação
   *
   * @returns Estado da autenticação
   */
  async getAuthState(): Promise<AuthState> {
    try {
      // Verificar sessão no Supabase
      const { data: { session } } = await this.supabase.auth.getSession();

      if (!session) {
        return {
          isAuthenticated: false,
          user: null,
          tokens: null,
          isLoading: false,
          error: null,
        };
      }

      // Obter dados armazenados localmente
      const tokens = await this.getStoredTokens();
      const user = await this.getStoredUser();

      if (!tokens || !user) {
        // Tentar recuperar da sessão Supabase
        if (session) {
          const recoveredTokens = await this.convertSessionToTokens(session);
          const recoveredUser = await this.convertSupabaseUser(session.user, session);

          await this.storeTokens(recoveredTokens);
          await this.storeUser(recoveredUser);

          return {
            isAuthenticated: true,
            user: recoveredUser,
            tokens: recoveredTokens,
            isLoading: false,
            error: null,
          };
        }

        return {
          isAuthenticated: false,
          user: null,
          tokens: null,
          isLoading: false,
          error: null,
        };
      }

      // Verificar se token está expirado
      if (this.isTokenExpired(tokens.expiresAt)) {
        // Tentar refresh automático
        const refreshResult = await this.refreshTokens();

        if (refreshResult.success && refreshResult.tokens) {
          return {
            isAuthenticated: true,
            user,
            tokens: refreshResult.tokens,
            isLoading: false,
            error: null,
          };
        }

        return {
          isAuthenticated: false,
          user: null,
          tokens: null,
          isLoading: false,
          error: null,
        };
      }

      return {
        isAuthenticated: true,
        user,
        tokens,
        isLoading: false,
        error: null,
      };
    } catch (error) {
      this.logger.error('AUTH', 'GET_STATE_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });

      return {
        isAuthenticated: false,
        user: null,
        tokens: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Obtém tokens armazenados
   *
   * @returns Tokens ou null
   */
  async getStoredTokens(): Promise<AuthTokens | null> {
    const result = await chrome.storage.local.get([
      AUTH_STORAGE_KEYS.ACCESS_TOKEN,
      AUTH_STORAGE_KEYS.REFRESH_TOKEN,
      AUTH_STORAGE_KEYS.ID_TOKEN,
      AUTH_STORAGE_KEYS.EXPIRES_AT,
      AUTH_STORAGE_KEYS.OBTAINED_AT,
    ]);

    const accessToken = result[AUTH_STORAGE_KEYS.ACCESS_TOKEN] as string | undefined;
    const refreshToken = result[AUTH_STORAGE_KEYS.REFRESH_TOKEN] as string | undefined;
    const expiresAt = result[AUTH_STORAGE_KEYS.EXPIRES_AT] as number | undefined;
    const obtainedAt = result[AUTH_STORAGE_KEYS.OBTAINED_AT] as number | undefined;

    if (!accessToken || !refreshToken || !expiresAt || !obtainedAt) {
      return null;
    }

    const tokens: AuthTokens = {
      accessToken,
      refreshToken,
      expiresAt,
      obtainedAt,
    };

    const idToken = result[AUTH_STORAGE_KEYS.ID_TOKEN] as string | undefined;
    if (idToken) {
      tokens.idToken = idToken;
    }

    return tokens;
  }

  /**
   * Obtém usuário armazenado
   *
   * @returns Usuário ou null
   */
  async getStoredUser(): Promise<AuthUser | null> {
    const result = await chrome.storage.local.get([AUTH_STORAGE_KEYS.USER]);
    return (result[AUTH_STORAGE_KEYS.USER] as AuthUser) ?? null;
  }

  // ==========================================================================
  // Métodos Privados - Conversão de Dados
  // ==========================================================================

  /**
   * Converte sessão do Supabase para formato de tokens Lexato
   *
   * @param session - Sessão do Supabase
   * @returns Tokens no formato Lexato
   */
  private async convertSessionToTokens(session: Session): Promise<AuthTokens> {
    const now = Date.now();

    // Supabase retorna expires_at em segundos Unix, converter para ms
    const expiresAt = (session.expires_at ?? 0) * 1000;

    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: expiresAt || now + 3600000, // Default 1 hora se não tiver
      obtainedAt: now,
      idToken: session.access_token, // Supabase não tem ID token separado
    };
  }

  /**
   * Converte usuário do Supabase para formato Lexato
   *
   * @param user - Usuário do Supabase
   * @param _session - Sessão atual (não utilizada atualmente)
   * @returns Usuário no formato Lexato
   */
  private async convertSupabaseUser(user: User, _session: Session): Promise<AuthUser> {
    // Buscar informacoes do perfil completo do banco
    let credits = 0;
    let accountType: 'individual' | 'enterprise' = 'individual';
    let userName: string | undefined;
    let avatarUrl: string | undefined;
    let planName: string | undefined;
    let usedThisMonth = 0;

    try {
      // Busca dados do perfil na tabela profiles (novo schema)
      // profiles.id = auth.users.id (mesmo UUID)
      const { data: profile, error } = await this.supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, team_id')
        .eq('id', user.id)
        .single();

      if (error) {
        this.logger.warn('AUTH', 'PROFILE_FETCH_FAILED', {
          userId: user.id,
          error: error.message,
        });
      } else if (profile) {
        userName = profile.full_name ?? undefined;
        avatarUrl = profile.avatar_url ?? undefined;

        // Buscar saldo de creditos via RPC
        const { data: creditBalance, error: creditError } = await this.supabase
          .rpc('get_user_credit_balance', { p_user_id: user.id });

        if (creditError) {
          this.logger.warn('AUTH', 'CREDITS_FETCH_FAILED', {
            userId: user.id,
            error: creditError.message,
          });
        } else {
          credits = creditBalance || 0;
        }

        // Buscar subscricao ativa para determinar plano
        const { data: subscription } = await this.supabase
          .from('subscriptions')
          .select('plan_id, plans(name, type)')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (subscription) {
          const plansData = subscription.plans as { name?: string; type?: string } | null;
          planName = plansData?.name ?? 'Gratuito';
          if (plansData?.type === 'enterprise') {
            accountType = 'enterprise';
          }
        } else {
          planName = 'Gratuito';
        }

        // Buscar uso mensal (evidencias criadas no mes atual)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count: monthlyUsage, error: usageError } = await this.supabase
          .from('evidences')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', startOfMonth.toISOString());

        if (usageError) {
          this.logger.warn('AUTH', 'USAGE_FETCH_FAILED', {
            userId: user.id,
            error: usageError.message,
          });
        } else {
          usedThisMonth = monthlyUsage ?? 0;
        }

        this.logger.info('AUTH', 'PROFILE_LOADED', {
          userId: user.id,
          credits,
          planName,
          usedThisMonth,
          name: userName,
          hasAvatar: !!avatarUrl,
        });
      }
    } catch (error) {
      this.logger.error('AUTH', 'PROFILE_FETCH_ERROR', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email!,
      accountType,
      credits,
      mfaEnabled: user.factors ? user.factors.length > 0 : false,
      planName,
      usedThisMonth,
    };

    // Priorizar nome do profile, depois metadata, depois email
    const finalName: string =
      userName ||
      (user.user_metadata?.['name'] as string | undefined) ||
      user.email!.split('@')[0] ||
      'Usuario';

    authUser.name = finalName;
    authUser.avatarUrl = avatarUrl || (user.user_metadata?.['avatar_url'] as string | undefined) || (user.user_metadata?.['picture'] as string | undefined);

    // Adicionar outros metadados
    if (user.user_metadata?.['enterprise_id']) {
      authUser.enterpriseId = user.user_metadata['enterprise_id'] as string;
    }

    return authUser;
  }

  // ==========================================================================
  // Métodos Privados - Storage
  // ==========================================================================

  /**
   * Armazena tokens no chrome.storage.local
   *
   * @param tokens - Tokens a armazenar
   */
  private async storeTokens(tokens: AuthTokens): Promise<void> {
    const data: Record<string, unknown> = {
      [AUTH_STORAGE_KEYS.ACCESS_TOKEN]: tokens.accessToken,
      [AUTH_STORAGE_KEYS.REFRESH_TOKEN]: tokens.refreshToken,
      [AUTH_STORAGE_KEYS.EXPIRES_AT]: tokens.expiresAt,
      [AUTH_STORAGE_KEYS.OBTAINED_AT]: tokens.obtainedAt,
    };

    if (tokens.idToken) {
      data[AUTH_STORAGE_KEYS.ID_TOKEN] = tokens.idToken;
    }

    await chrome.storage.local.set(data);
  }

  /**
   * Armazena dados do usuário
   *
   * @param user - Usuário a armazenar
   */
  private async storeUser(user: AuthUser): Promise<void> {
    await chrome.storage.local.set({
      [AUTH_STORAGE_KEYS.USER]: user,
    });
  }

  /**
   * Limpa todos os dados de autenticação
   */
  private async clearAllAuthData(): Promise<void> {
    await chrome.storage.local.remove([
      AUTH_STORAGE_KEYS.ACCESS_TOKEN,
      AUTH_STORAGE_KEYS.REFRESH_TOKEN,
      AUTH_STORAGE_KEYS.ID_TOKEN,
      AUTH_STORAGE_KEYS.EXPIRES_AT,
      AUTH_STORAGE_KEYS.OBTAINED_AT,
      AUTH_STORAGE_KEYS.USER,
      AUTH_STORAGE_KEYS.MFA_SESSION,
    ]);
  }

  // ==========================================================================
  // Verificação Automática de Refresh
  // ==========================================================================

  /**
   * Inicia verificação automática de refresh
   */
  private async startRefreshCheck(): Promise<void> {
    // Criar alarme para verificação periódica
    await chrome.alarms.create(REFRESH_ALARM_NAME, {
      periodInMinutes: this.authConfig.checkIntervalMs / 60000,
    });

    this.logger.info('AUTH', 'REFRESH_CHECK_STARTED');
  }

  /**
   * Para verificação automática de refresh
   */
  private async stopRefreshCheck(): Promise<void> {
    await chrome.alarms.clear(REFRESH_ALARM_NAME);
    this.logger.info('AUTH', 'REFRESH_CHECK_STOPPED');
  }

  /**
   * Handler para alarme de verificação de refresh
   * Deve ser chamado pelo service worker quando o alarme disparar
   */
  async handleRefreshAlarm(): Promise<void> {
    const tokens = await this.getStoredTokens();

    if (!tokens) {
      await this.stopRefreshCheck();
      return;
    }

    if (this.isTokenExpiringSoon(tokens.expiresAt)) {
      this.logger.info('AUTH', 'TOKEN_EXPIRING_SOON_REFRESH');
      await this.refreshTokens();
    }
  }

  // ==========================================================================
  // Utilitários
  // ==========================================================================

  /**
   * Verifica se token está expirando em breve
   *
   * @param expiresAt - Timestamp de expiração
   * @returns True se expirando em breve
   */
  private isTokenExpiringSoon(expiresAt: number): boolean {
    return Date.now() >= expiresAt - this.authConfig.refreshBeforeExpiryMs;
  }

  /**
   * Verifica se token expirou
   *
   * @param expiresAt - Timestamp de expiração
   * @returns True se expirado
   */
  private isTokenExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt;
  }

  /**
   * Obtém nome do alarme de refresh
   *
   * @returns Nome do alarme
   */
  static getRefreshAlarmName(): string {
    return REFRESH_ALARM_NAME;
  }

  // ==========================================================================
  // Metodos para OAuth (Google Login)
  // ==========================================================================

  /**
   * Retorna o cliente Supabase interno para uso em fluxos OAuth
   *
   * @returns Cliente Supabase
   */
  getSupabaseClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Configura sessao a partir de tokens OAuth (Google, etc.)
   * Converte usuario e armazena tokens no formato Lexato
   *
   * @param session - Sessao do Supabase obtida via setSession
   * @returns Resultado com usuario e tokens convertidos
   */
  async setSessionFromOAuth(session: Session): Promise<LoginResult> {
    try {
      const tokens = await this.convertSessionToTokens(session);
      const user = await this.convertSupabaseUser(session.user, session);

      await this.storeTokens(tokens);
      await this.storeUser(user);

      await this.startRefreshCheck();

      this.logger.info('AUTH', 'OAUTH_SESSION_SET', {
        userId: user.id,
        credits: user.credits,
      });

      return {
        success: true,
        user,
        tokens,
      };
    } catch (error) {
      this.logger.error('AUTH', 'OAUTH_SESSION_SET_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao configurar sessao OAuth',
      };
    }
  }
}

/**
 * Exporta classe com nome compatível com AuthManager original
 */
export { AuthManagerSupabase as AuthManager };