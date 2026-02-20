/**
 * Tipos para autenticação e gerenciamento de tokens
 *
 * Define interfaces para tokens, usuário e estado de autenticação
 *
 * @module AuthTypes
 */

/**
 * Tokens de autenticação armazenados
 */
export interface AuthTokens {
  /** Token de acesso JWT */
  accessToken: string;
  /** Token de refresh para renovação */
  refreshToken: string;
  /** ID token do Cognito */
  idToken?: string;
  /** Timestamp de expiração do access token (ms) */
  expiresAt: number;
  /** Timestamp de quando os tokens foram obtidos */
  obtainedAt: number;
}

/**
 * Dados do usuário autenticado
 */
export interface AuthUser {
  /** ID único do usuário (sub do Cognito) */
  id: string;
  /** Email do usuário */
  email: string;
  /** Nome do usuário */
  name?: string | undefined;
  /** URL do avatar do usuário */
  avatarUrl?: string | undefined;
  /** Tipo de conta */
  accountType: 'individual' | 'enterprise';
  /** Saldo de créditos */
  credits: number;
  /** Se MFA está habilitado */
  mfaEnabled: boolean;
  /** ID da empresa (se enterprise) */
  enterpriseId?: string | undefined;
  /** Nome do plano atual (ex: "Gratuito", "Profissional") */
  planName?: string | undefined;
  /** Créditos utilizados no mês atual */
  usedThisMonth?: number | undefined;
}

/**
 * Estado de autenticação
 */
export interface AuthState {
  /** Se usuário está autenticado */
  isAuthenticated: boolean;
  /** Dados do usuário (se autenticado) */
  user: AuthUser | null;
  /** Tokens de autenticação (se autenticado) */
  tokens: AuthTokens | null;
  /** Se está carregando estado de autenticação */
  isLoading: boolean;
  /** Erro de autenticação (se houver) */
  error: string | null;
}

/**
 * Credenciais de login
 */
export interface LoginCredentials {
  /** Email do usuário */
  email: string;
  /** Senha do usuário */
  password: string;
  /** Código MFA (se necessário) */
  mfaCode?: string;
}

/**
 * Resultado do login
 */
export interface LoginResult {
  /** Se login foi bem-sucedido */
  success: boolean;
  /** Dados do usuário (se sucesso) */
  user?: AuthUser;
  /** Tokens (se sucesso) */
  tokens?: AuthTokens;
  /** Se MFA é necessário (usuário já tem MFA configurado) */
  mfaRequired?: boolean;
  /** Se configuração de MFA é necessária (primeiro login, MFA obrigatório) */
  mfaSetupRequired?: boolean;
  /** Sessão MFA (para continuar autenticação) */
  mfaSession?: string;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Resultado da configuração de MFA
 */
export interface MFASetupResult {
  /** Se setup foi bem-sucedido */
  success: boolean;
  /** Secret code para configuração manual */
  secretCode?: string;
  /** URI para QR Code (formato otpauth://) */
  qrCodeUri?: string;
  /** Nova session para verificação */
  session?: string;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Resultado da verificação de MFA setup
 */
export interface MFAVerifySetupResult {
  /** Se verificação foi bem-sucedida */
  success: boolean;
  /** Dados do usuário (se sucesso) */
  user?: AuthUser;
  /** Tokens (se sucesso) */
  tokens?: AuthTokens;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Resultado do refresh de token
 */
export interface RefreshResult {
  /** Se refresh foi bem-sucedido */
  success: boolean;
  /** Novos tokens (se sucesso) */
  tokens?: AuthTokens;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Configuração de autenticação
 */
export interface AuthConfig {
  /** Tempo antes da expiração para fazer refresh (ms) */
  refreshBeforeExpiryMs: number;
  /** Intervalo de verificação de expiração (ms) */
  checkIntervalMs: number;
  /** Número máximo de tentativas de refresh */
  maxRefreshAttempts: number;
}

/**
 * Chaves de armazenamento para autenticação
 * 
 * IMPORTANTE: Usar prefixo 'lexato_' para evitar conflitos com outras extensões
 * e manter consistência com constants.ts e handlers de captura.
 */
export const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: 'lexato_access_token',
  REFRESH_TOKEN: 'lexato_refresh_token',
  ID_TOKEN: 'lexato_id_token',
  EXPIRES_AT: 'lexato_expires_at',
  OBTAINED_AT: 'lexato_obtained_at',
  USER: 'lexato_user',
} as const;

/**
 * Configuração padrão de autenticação
 */
export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  refreshBeforeExpiryMs: 5 * 60 * 1000, // 5 minutos antes de expirar
  checkIntervalMs: 60 * 1000, // Verificar a cada 1 minuto
  maxRefreshAttempts: 3,
};

// ==================== WebAuthn/Passkey Types ====================

/**
 * Resultado do início de registro WebAuthn
 */
export interface WebAuthnRegisterStartResult {
  /** Se operação foi bem-sucedida */
  success: boolean;
  /** Opções de criação de credencial (PublicKeyCredentialCreationOptions) */
  credentialCreationOptions?: PublicKeyCredentialCreationOptions;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Resultado do registro WebAuthn completo
 */
export interface WebAuthnRegisterCompleteResult {
  /** Se registro foi bem-sucedido */
  success: boolean;
  /** Mensagem de sucesso */
  message?: string;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Resultado do início de autenticação WebAuthn
 */
export interface WebAuthnAuthStartResult {
  /** Se operação foi bem-sucedida */
  success: boolean;
  /** Session para completar autenticação */
  session?: string;
  /** Opções de autenticação (PublicKeyCredentialRequestOptions) */
  credentialRequestOptions?: PublicKeyCredentialRequestOptions;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Resultado da autenticação WebAuthn completa
 */
export interface WebAuthnAuthCompleteResult {
  /** Se autenticação foi bem-sucedida */
  success: boolean;
  /** Dados do usuário (se sucesso) */
  user?: AuthUser;
  /** Tokens (se sucesso) */
  tokens?: AuthTokens;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Credencial WebAuthn registrada
 */
export interface WebAuthnCredential {
  /** ID da credencial */
  credentialId: string;
  /** Nome amigável da credencial */
  friendlyCredentialName?: string;
  /** ID do Relying Party */
  relyingPartyId?: string;
  /** Data de criação */
  createdAt?: string;
}

/**
 * Resultado da listagem de credenciais WebAuthn
 */
export interface WebAuthnCredentialsListResult {
  /** Se operação foi bem-sucedida */
  success: boolean;
  /** Lista de credenciais */
  credentials?: WebAuthnCredential[];
  /** Mensagem de erro (se falha) */
  error?: string;
}
