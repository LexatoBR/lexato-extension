/**
 * Schemas de validação Zod para endpoints da API Lexato
 *
 * Este módulo define schemas de validação para todos os parâmetros
 * de entrada dos endpoints da API, garantindo fail-fast e mensagens
 * de erro em português.
 *
 * @module api-schemas
 */

import { z } from 'zod';

// ============================================================================
// Utilitários de Validação
// ============================================================================

/**
 * Regex para validação de UUID v4
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Schema base para UUID
 */
export const uuidSchema = z.string().regex(UUID_REGEX, 'ID inválido - deve ser um UUID válido');

/**
 * Schema base para email
 */
export const emailSchema = z.string().email('Email inválido');

/**
 * Schema base para senha
 * Mínimo 8 caracteres, pelo menos uma letra maiúscula, uma minúscula e um número
 */
export const senhaSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número');

// ============================================================================
// Schemas de Autenticação (/auth/*)
// ============================================================================

/**
 * Schema para login
 * POST /auth/login
 */
export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1, 'Senha é obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Schema para refresh de token
 * POST /auth/refresh
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/**
 * Schema para desafio MFA
 * POST /auth/mfa/challenge
 */
export const mfaChallengeSchema = z.object({
  codigo: z
    .string()
    .length(6, 'Código MFA deve ter 6 dígitos')
    .regex(/^\d{6}$/, 'Código MFA deve conter apenas números'),
  session: z.string().min(1, 'Sessão MFA é obrigatória'),
});

export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>;

/**
 * Schema para setup de sessão MFA
 * POST /auth/mfa/setup-session
 */
export const mfaSetupSessionSchema = z.object({
  sessionToken: z.string().min(1, 'Token de sessão é obrigatório'),
});

export type MfaSetupSessionInput = z.infer<typeof mfaSetupSessionSchema>;

/**
 * Schema para verificação de setup MFA
 * POST /auth/mfa/verify-setup
 */
export const mfaVerifySetupSchema = z.object({
  codigo: z
    .string()
    .length(6, 'Código MFA deve ter 6 dígitos')
    .regex(/^\d{6}$/, 'Código MFA deve conter apenas números'),
  sessionToken: z.string().min(1, 'Token de sessão é obrigatório'),
});

export type MfaVerifySetupInput = z.infer<typeof mfaVerifySetupSchema>;

// ============================================================================
// Schemas de WebAuthn (/auth/webauthn/*)
// ============================================================================

/**
 * Schema para completar registro WebAuthn
 * POST /auth/webauthn/register/complete
 */
export const webauthnRegisterCompleteSchema = z.object({
  credential: z.object({
    id: z.string().min(1, 'ID da credencial é obrigatório'),
    rawId: z.string().min(1, 'Raw ID é obrigatório'),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string().min(1, 'clientDataJSON é obrigatório'),
      attestationObject: z.string().min(1, 'attestationObject é obrigatório'),
    }),
  }),
  friendlyName: z.string().min(1, 'Nome da chave é obrigatório').max(100, 'Nome muito longo'),
});

export type WebauthnRegisterCompleteInput = z.infer<typeof webauthnRegisterCompleteSchema>;

/**
 * Schema para iniciar autenticação WebAuthn
 * POST /auth/webauthn/auth/start
 */
export const webauthnAuthStartSchema = z.object({
  username: z.string().min(1, 'Nome de usuário é obrigatório'),
});

export type WebauthnAuthStartInput = z.infer<typeof webauthnAuthStartSchema>;

/**
 * Schema para completar autenticação WebAuthn
 * POST /auth/webauthn/auth/complete
 */
export const webauthnAuthCompleteSchema = z.object({
  credential: z.object({
    id: z.string().min(1, 'ID da credencial é obrigatório'),
    rawId: z.string().min(1, 'Raw ID é obrigatório'),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string().min(1, 'clientDataJSON é obrigatório'),
      authenticatorData: z.string().min(1, 'authenticatorData é obrigatório'),
      signature: z.string().min(1, 'signature é obrigatório'),
      userHandle: z.string().optional(),
    }),
  }),
  session: z.string().min(1, 'Sessão é obrigatória'),
});

export type WebauthnAuthCompleteInput = z.infer<typeof webauthnAuthCompleteSchema>;

// ============================================================================
// Schemas de Evidência (/evidence/*)
// ============================================================================

/**
 * Schema para ID de evidência em path params
 */
export const evidenceIdSchema = z.object({
  evidenceId: uuidSchema,
});

export type EvidenceIdInput = z.infer<typeof evidenceIdSchema>;

/**
 * Schema para aprovar evidência
 * POST /evidence/{id}/approve
 */
export const approveEvidenceSchema = z.object({
  confirm: z.literal(true, {
    error: 'Confirmação deve ser true para aprovar',
  }),
});

export type ApproveEvidenceInput = z.infer<typeof approveEvidenceSchema>;

/**
 * Schema para registro blockchain
 * POST /evidence/{id}/blockchain
 */
export const blockchainRegisterSchema = z.object({
  merkleRoot: z.string().min(1, 'Merkle root é obrigatório'),
  metadata: z
    .object({
      captureType: z.enum(['screenshot', 'video'], {
        error: 'Tipo de captura deve ser screenshot ou video',
      }),
      pageUrl: z.string().url('URL da página inválida'),
      pageTitle: z.string().optional(),
      timestamp: z.string().datetime('Timestamp deve estar no formato ISO 8601'),
    })
    .optional(),
});

export type BlockchainRegisterInput = z.infer<typeof blockchainRegisterSchema>;

/**
 * Schema para timestamp de evidência
 * POST /evidence/timestamp
 */
export const timestampSchema = z.object({
  merkleRoot: z.string().min(1, 'Merkle root é obrigatório'),
});

export type TimestampInput = z.infer<typeof timestampSchema>;

// ============================================================================
// Schemas de Upload (/upload/*)
// ============================================================================

/**
 * Content types permitidos para upload
 */
export const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/webm',
  'video/mp4',
  'application/pdf',
  'text/html',
  'application/json',
] as const;

/**
 * Schema para presigned URL
 * POST /upload/presign
 */
export const presignUrlSchema = z.object({
  evidenceId: uuidSchema,
  key: z.string().min(1, 'Chave do arquivo é obrigatória'),
  contentType: z.enum(ALLOWED_CONTENT_TYPES, {
    error: `Tipo de conteúdo inválido. Permitidos: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
  }),
  contentLength: z
    .number()
    .int('Tamanho deve ser um número inteiro')
    .positive('Tamanho deve ser positivo')
    .max(500 * 1024 * 1024, 'Arquivo muito grande (máximo 500MB)'),
});

export type PresignUrlInput = z.infer<typeof presignUrlSchema>;

// ============================================================================
// Schemas de Vídeo (/video/*)
// ============================================================================

/**
 * Schema para cancelar upload de vídeo
 * POST /video/cancel
 */
export const videoCancelSchema = z.object({
  captureId: uuidSchema,
  uploadId: z.string().min(1, 'ID do upload é obrigatório'),
});

export type VideoCancelInput = z.infer<typeof videoCancelSchema>;

// ============================================================================
// Funções de Validação
// ============================================================================

/**
 * Resultado de validação
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Valida dados contra um schema Zod
 *
 * @param schema - Schema Zod para validação
 * @param data - Dados a validar
 * @returns Resultado da validação com dados tipados ou erros
 *
 * @example
 * ```typescript
 * const result = validate(loginSchema, { email: 'test@example.com', senha: '123' });
 * if (result.success) {
 *   // result.data é tipado como LoginInput
 *   console.log(result.data.email);
 * } else {
 *   // result.errors contém mensagens em PT-BR
 *   console.error(result.errors);
 * }
 * ```
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });

  return { success: false, errors };
}

/**
 * Valida dados e lança erro se inválido
 *
 * @param schema - Schema Zod para validação
 * @param data - Dados a validar
 * @returns Dados validados e tipados
 * @throws Error com mensagens de validação em PT-BR
 *
 * @example
 * ```typescript
 * try {
 *   const input = validateOrThrow(loginSchema, requestBody);
 *   // input é tipado como LoginInput
 * } catch (error) {
 *   // error.message contém erros formatados
 * }
 * ```
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = validate(schema, data);

  if (!result.success) {
    throw new Error(`Erro de validação: ${result.errors?.join('; ')}`);
  }

  return result.data as T;
}

// ============================================================================
// Mapa de Schemas por Endpoint
// ============================================================================

/**
 * Mapa de schemas por endpoint para validação automática
 * Facilita integração com middleware de validação
 */
export const ENDPOINT_SCHEMAS = {
  // Auth
  'POST /auth/login': loginSchema,
  'POST /auth/refresh': refreshTokenSchema,
  'POST /auth/mfa/challenge': mfaChallengeSchema,
  'POST /auth/mfa/setup-session': mfaSetupSessionSchema,
  'POST /auth/mfa/verify-setup': mfaVerifySetupSchema,

  // WebAuthn
  'POST /auth/webauthn/register/complete': webauthnRegisterCompleteSchema,
  'POST /auth/webauthn/auth/start': webauthnAuthStartSchema,
  'POST /auth/webauthn/auth/complete': webauthnAuthCompleteSchema,

  // Evidence
  'POST /evidence/:id/approve': approveEvidenceSchema,
  'POST /evidence/:id/blockchain': blockchainRegisterSchema,
  'POST /evidence/timestamp': timestampSchema,

  // Upload
  'POST /upload/presign': presignUrlSchema,

  // Video
  'POST /video/cancel': videoCancelSchema,
} as const;

export type EndpointKey = keyof typeof ENDPOINT_SCHEMAS;
