/**
 * Testes unitários para schemas de validação da API
 *
 * @module api-schemas.test
 */

import { describe, it, expect } from 'vitest';
import {
  // Schemas
  loginSchema,
  refreshTokenSchema,
  mfaChallengeSchema,
  mfaSetupSessionSchema,
  mfaVerifySetupSchema,
  webauthnRegisterCompleteSchema,
  webauthnAuthStartSchema,
  webauthnAuthCompleteSchema,
  evidenceIdSchema,
  approveEvidenceSchema,
  blockchainRegisterSchema,
  timestampSchema,
  presignUrlSchema,
  videoCancelSchema,
  // Funções
  validate,
  validateOrThrow,
  // Tipos
  type LoginInput,
  type ValidationResult,
} from '../../../src/background/api-schemas';

/**
 * Obtém a mensagem do primeiro erro de validação de forma segura
 * @param issues - Array de issues do Zod
 * @returns Mensagem do primeiro erro ou string vazia
 */
function getFirstIssueMessage(issues: { message: string }[]): string {
  const firstIssue = issues[0];
  return firstIssue?.message ?? '';
}

describe('api-schemas', () => {
  // ==========================================================================
  // Schemas de Autenticação
  // ==========================================================================

  describe('loginSchema', () => {
    it('deve aceitar credenciais válidas', () => {
      const input = { email: 'usuario@exemplo.com', senha: 'minhasenha123' };
      const result = loginSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('usuario@exemplo.com');
      }
    });

    it('deve rejeitar email inválido', () => {
      const input = { email: 'email-invalido', senha: 'senha123' };
      const result = loginSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Email inválido');
      }
    });

    it('deve rejeitar senha vazia', () => {
      const input = { email: 'usuario@exemplo.com', senha: '' };
      const result = loginSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Senha é obrigatória');
      }
    });

    it('deve rejeitar campos ausentes', () => {
      const result = loginSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('refreshTokenSchema', () => {
    it('deve aceitar refresh token válido', () => {
      const input = { refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' };
      const result = refreshTokenSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar refresh token vazio', () => {
      const input = { refreshToken: '' };
      const result = refreshTokenSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Refresh token é obrigatório');
      }
    });
  });

  describe('mfaChallengeSchema', () => {
    it('deve aceitar código MFA válido', () => {
      const input = { codigo: '123456', session: 'session-token-abc' };
      const result = mfaChallengeSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar código com menos de 6 dígitos', () => {
      const input = { codigo: '12345', session: 'session-token' };
      const result = mfaChallengeSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Código MFA deve ter 6 dígitos');
      }
    });

    it('deve rejeitar código com letras', () => {
      const input = { codigo: '12345a', session: 'session-token' };
      const result = mfaChallengeSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Código MFA deve conter apenas números');
      }
    });

    it('deve rejeitar sessão vazia', () => {
      const input = { codigo: '123456', session: '' };
      const result = mfaChallengeSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Sessão MFA é obrigatória');
      }
    });
  });

  describe('mfaSetupSessionSchema', () => {
    it('deve aceitar token de sessão válido', () => {
      const input = { sessionToken: 'setup-session-token' };
      const result = mfaSetupSessionSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar token vazio', () => {
      const input = { sessionToken: '' };
      const result = mfaSetupSessionSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('mfaVerifySetupSchema', () => {
    it('deve aceitar dados válidos', () => {
      const input = { codigo: '654321', sessionToken: 'verify-session' };
      const result = mfaVerifySetupSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Schemas de WebAuthn
  // ==========================================================================

  describe('webauthnRegisterCompleteSchema', () => {
    const validCredential = {
      id: 'credential-id-base64',
      rawId: 'raw-id-base64',
      type: 'public-key' as const,
      response: {
        clientDataJSON: 'client-data-json-base64',
        attestationObject: 'attestation-object-base64',
      },
    };

    it('deve aceitar credencial válida', () => {
      const input = {
        credential: validCredential,
        friendlyName: 'Minha Chave de Segurança',
      };
      const result = webauthnRegisterCompleteSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar nome muito longo', () => {
      const input = {
        credential: validCredential,
        friendlyName: 'a'.repeat(101),
      };
      const result = webauthnRegisterCompleteSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Nome muito longo');
      }
    });

    it('deve rejeitar tipo de credencial inválido', () => {
      const input = {
        credential: { ...validCredential, type: 'invalid-type' },
        friendlyName: 'Chave',
      };
      const result = webauthnRegisterCompleteSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('webauthnAuthStartSchema', () => {
    it('deve aceitar username válido', () => {
      const input = { username: 'usuario@exemplo.com' };
      const result = webauthnAuthStartSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar username vazio', () => {
      const input = { username: '' };
      const result = webauthnAuthStartSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('webauthnAuthCompleteSchema', () => {
    it('deve aceitar credencial de autenticação válida', () => {
      const input = {
        credential: {
          id: 'credential-id',
          rawId: 'raw-id',
          type: 'public-key' as const,
          response: {
            clientDataJSON: 'client-data',
            authenticatorData: 'auth-data',
            signature: 'signature-data',
          },
        },
        session: 'auth-session',
      };
      const result = webauthnAuthCompleteSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve aceitar userHandle opcional', () => {
      const input = {
        credential: {
          id: 'credential-id',
          rawId: 'raw-id',
          type: 'public-key' as const,
          response: {
            clientDataJSON: 'client-data',
            authenticatorData: 'auth-data',
            signature: 'signature-data',
            userHandle: 'user-handle-optional',
          },
        },
        session: 'auth-session',
      };
      const result = webauthnAuthCompleteSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Schemas de Evidência
  // ==========================================================================

  describe('evidenceIdSchema', () => {
    it('deve aceitar UUID v4 válido', () => {
      const input = { evidenceId: '550e8400-e29b-41d4-a716-446655440000' };
      const result = evidenceIdSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar UUID inválido', () => {
      const input = { evidenceId: 'not-a-uuid' };
      const result = evidenceIdSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('ID inválido - deve ser um UUID válido');
      }
    });

    it('deve rejeitar UUID v1', () => {
      // UUID v1 tem formato diferente no terceiro grupo (começa com 1, não 4)
      const input = { evidenceId: '550e8400-e29b-11d4-a716-446655440000' };
      const result = evidenceIdSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('approveEvidenceSchema', () => {
    it('deve aceitar confirmação true', () => {
      const input = { confirm: true };
      const result = approveEvidenceSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar confirmação false', () => {
      const input = { confirm: false };
      const result = approveEvidenceSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Confirmação deve ser true para aprovar');
      }
    });
  });

  describe('blockchainRegisterSchema', () => {
    it('deve aceitar merkle root válido', () => {
      const input = { merkleRoot: '0x1234567890abcdef' };
      const result = blockchainRegisterSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve aceitar com metadata completo', () => {
      const input = {
        merkleRoot: '0xabcdef',
        metadata: {
          captureType: 'screenshot' as const,
          pageUrl: 'https://exemplo.com/pagina',
          pageTitle: 'Título da Página',
          timestamp: '2026-01-19T10:30:00.000Z',
        },
      };
      const result = blockchainRegisterSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar tipo de captura inválido', () => {
      const input = {
        merkleRoot: '0xabcdef',
        metadata: {
          captureType: 'audio',
          pageUrl: 'https://exemplo.com',
          timestamp: '2026-01-19T10:30:00.000Z',
        },
      };
      const result = blockchainRegisterSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Tipo de captura deve ser screenshot ou video');
      }
    });

    it('deve rejeitar URL inválida', () => {
      const input = {
        merkleRoot: '0xabcdef',
        metadata: {
          captureType: 'screenshot',
          pageUrl: 'not-a-url',
          timestamp: '2026-01-19T10:30:00.000Z',
        },
      };
      const result = blockchainRegisterSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('timestampSchema', () => {
    it('deve aceitar merkle root válido', () => {
      const input = { merkleRoot: '0xdeadbeef' };
      const result = timestampSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar merkle root vazio', () => {
      const input = { merkleRoot: '' };
      const result = timestampSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Schemas de Upload
  // ==========================================================================

  describe('presignUrlSchema', () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000';

    it('deve aceitar dados válidos para imagem', () => {
      const input = {
        evidenceId: validUUID,
        key: 'evidences/screenshot.png',
        contentType: 'image/png' as const,
        contentLength: 1024 * 1024, // 1MB
      };
      const result = presignUrlSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve aceitar dados válidos para vídeo', () => {
      const input = {
        evidenceId: validUUID,
        key: 'evidences/video.webm',
        contentType: 'video/webm' as const,
        contentLength: 50 * 1024 * 1024, // 50MB
      };
      const result = presignUrlSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar content type não permitido', () => {
      const input = {
        evidenceId: validUUID,
        key: 'evidences/file.exe',
        contentType: 'application/x-msdownload',
        contentLength: 1024,
      };
      const result = presignUrlSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toContain('Tipo de conteúdo inválido');
      }
    });

    it('deve rejeitar arquivo muito grande', () => {
      const input = {
        evidenceId: validUUID,
        key: 'evidences/huge.webm',
        contentType: 'video/webm' as const,
        contentLength: 600 * 1024 * 1024, // 600MB
      };
      const result = presignUrlSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Arquivo muito grande (máximo 500MB)');
      }
    });

    it('deve rejeitar tamanho negativo', () => {
      const input = {
        evidenceId: validUUID,
        key: 'evidences/file.png',
        contentType: 'image/png' as const,
        contentLength: -100,
      };
      const result = presignUrlSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Tamanho deve ser positivo');
      }
    });

    it('deve rejeitar tamanho decimal', () => {
      const input = {
        evidenceId: validUUID,
        key: 'evidences/file.png',
        contentType: 'image/png' as const,
        contentLength: 1024.5,
      };
      const result = presignUrlSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstIssueMessage(result.error.issues)).toBe('Tamanho deve ser um número inteiro');
      }
    });
  });

  // ==========================================================================
  // Schemas de Vídeo
  // ==========================================================================

  describe('videoCancelSchema', () => {
    it('deve aceitar dados válidos', () => {
      const input = {
        captureId: '550e8400-e29b-41d4-a716-446655440000',
        uploadId: 'upload-id-from-s3',
      };
      const result = videoCancelSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar captureId inválido', () => {
      const input = {
        captureId: 'invalid-uuid',
        uploadId: 'upload-id',
      };
      const result = videoCancelSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('deve rejeitar uploadId vazio', () => {
      const input = {
        captureId: '550e8400-e29b-41d4-a716-446655440000',
        uploadId: '',
      };
      const result = videoCancelSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Funções de Validação
  // ==========================================================================

  describe('validate()', () => {
    it('deve retornar success true para dados válidos', () => {
      const result = validate(loginSchema, {
        email: 'teste@exemplo.com',
        senha: 'senha123',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('deve retornar success false com erros para dados inválidos', () => {
      const result = validate(loginSchema, {
        email: 'email-invalido',
        senha: '',
      });

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('deve incluir path nos erros de campos aninhados', () => {
      const result = validate(blockchainRegisterSchema, {
        merkleRoot: '0x123',
        metadata: {
          captureType: 'invalid',
          pageUrl: 'not-url',
          timestamp: 'not-datetime',
        },
      });

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes('metadata'))).toBe(true);
    });

    it('deve tipar corretamente os dados de retorno', () => {
      const result: ValidationResult<LoginInput> = validate(loginSchema, {
        email: 'teste@exemplo.com',
        senha: 'senha123',
      });

      if (result.success && result.data) {
        // TypeScript deve inferir corretamente o tipo
        const email: string = result.data.email;
        const senha: string = result.data.senha;
        expect(email).toBe('teste@exemplo.com');
        expect(senha).toBe('senha123');
      }
    });
  });

  describe('validateOrThrow()', () => {
    it('deve retornar dados para entrada válida', () => {
      const data = validateOrThrow(loginSchema, {
        email: 'teste@exemplo.com',
        senha: 'senha123',
      });

      expect(data.email).toBe('teste@exemplo.com');
      expect(data.senha).toBe('senha123');
    });

    it('deve lançar erro para entrada inválida', () => {
      expect(() =>
        validateOrThrow(loginSchema, {
          email: 'invalido',
          senha: '',
        })
      ).toThrow('Erro de validação');
    });

    it('deve incluir mensagens de erro no throw', () => {
      try {
        validateOrThrow(loginSchema, { email: 'invalido', senha: '' });
        expect.fail('Deveria ter lançado erro');
      } catch (error) {
        expect((error as Error).message).toContain('Email inválido');
      }
    });
  });
});
