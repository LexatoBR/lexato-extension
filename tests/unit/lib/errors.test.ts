/**
 * Testes unitários para sistema de erros
 *
 * Testa códigos de erro, mensagens em português e categorização
 */

import { describe, it, expect } from 'vitest';
import {
  LexatoError,
  ErrorCodes,
  ErrorMessages,
  RecoverySuggestions,
  fromError,
  isNetworkError,
  isAuthError,
  isRetryableError,
} from '@lib/errors';

describe('ErrorCodes', () => {
  it('deve ter códigos de rede começando com 1', () => {
    expect(ErrorCodes.NETWORK_OFFLINE).toMatch(/^ERR_1/);
    expect(ErrorCodes.NETWORK_TIMEOUT).toMatch(/^ERR_1/);
  });

  it('deve ter códigos de autenticação começando com 2', () => {
    expect(ErrorCodes.AUTH_INVALID_CREDENTIALS).toMatch(/^ERR_2/);
    expect(ErrorCodes.AUTH_TOKEN_EXPIRED).toMatch(/^ERR_2/);
  });

  it('deve ter códigos de permissão começando com 3', () => {
    expect(ErrorCodes.PERMISSION_DENIED).toMatch(/^ERR_3/);
  });

  it('deve ter códigos de captura começando com 4', () => {
    expect(ErrorCodes.CAPTURE_FAILED).toMatch(/^ERR_4/);
  });

  it('deve ter códigos de validação começando com 5', () => {
    expect(ErrorCodes.VALIDATION_INVALID_INPUT).toMatch(/^ERR_5/);
  });

  it('deve ter códigos de criptografia começando com 6', () => {
    expect(ErrorCodes.CRYPTO_HASH_FAILED).toMatch(/^ERR_6/);
  });

  it('deve ter códigos de armazenamento começando com 7', () => {
    expect(ErrorCodes.STORAGE_UPLOAD_FAILED).toMatch(/^ERR_7/);
  });
});

describe('ErrorMessages', () => {
  it('deve ter mensagens em português para todos os códigos', () => {
    Object.values(ErrorCodes).forEach((code) => {
      expect(ErrorMessages[code]).toBeDefined();
      expect(typeof ErrorMessages[code]).toBe('string');
      expect(ErrorMessages[code].length).toBeGreaterThan(0);
    });
  });

  it('deve ter mensagens amigáveis para erros de rede', () => {
    expect(ErrorMessages[ErrorCodes.NETWORK_OFFLINE]).toContain('conexão');
    expect(ErrorMessages[ErrorCodes.NETWORK_TIMEOUT]).toContain('demorou');
  });

  it('deve ter mensagens amigáveis para erros de autenticação', () => {
    expect(ErrorMessages[ErrorCodes.AUTH_INVALID_CREDENTIALS]).toContain('incorretos');
    expect(ErrorMessages[ErrorCodes.AUTH_TOKEN_EXPIRED]).toContain('expirou');
  });

  it('deve ter mensagens amigáveis para erros de captura', () => {
    expect(ErrorMessages[ErrorCodes.CAPTURE_DEVTOOLS_DETECTED]).toContain('DevTools');
  });
});

describe('RecoverySuggestions', () => {
  it('deve ter sugestões para erros de rede', () => {
    expect(RecoverySuggestions[ErrorCodes.NETWORK_OFFLINE]).toBeDefined();
    expect(RecoverySuggestions[ErrorCodes.NETWORK_OFFLINE]).toContain('conexão');
  });

  it('deve ter sugestões para erros de autenticação', () => {
    expect(RecoverySuggestions[ErrorCodes.AUTH_TOKEN_EXPIRED]).toBeDefined();
    expect(RecoverySuggestions[ErrorCodes.AUTH_TOKEN_EXPIRED]).toContain('login');
  });
});

describe('LexatoError', () => {
  describe('constructor', () => {
    it('deve criar erro com código e mensagem padrão', () => {
      const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE);
      expect(error.code).toBe(ErrorCodes.NETWORK_OFFLINE);
      expect(error.message).toBe(ErrorMessages[ErrorCodes.NETWORK_OFFLINE]);
      expect(error.userMessage).toBe(ErrorMessages[ErrorCodes.NETWORK_OFFLINE]);
    });

    it('deve aceitar mensagem customizada', () => {
      const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE, {
        customMessage: 'Mensagem customizada',
      });
      expect(error.userMessage).toBe('Mensagem customizada');
    });

    it('deve incluir erro original', () => {
      const originalError = new Error('Original');
      const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE, { originalError });
      expect(error.originalError).toBe(originalError);
    });

    it('deve incluir correlationId', () => {
      const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE, {
        correlationId: 'test-correlation-id',
      });
      expect(error.correlationId).toBe('test-correlation-id');
    });

    it('deve incluir timestamp', () => {
      const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE);
      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('deve incluir sugestão de recuperação quando disponível', () => {
      const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE);
      expect(error.recoverySuggestion).toBeDefined();
    });
  });

  describe('getCategory', () => {
    it('deve retornar NETWORK para códigos 1xxx', () => {
      expect(LexatoError.getCategory(ErrorCodes.NETWORK_OFFLINE)).toBe('NETWORK');
    });

    it('deve retornar AUTH para códigos 2xxx', () => {
      expect(LexatoError.getCategory(ErrorCodes.AUTH_TOKEN_EXPIRED)).toBe('AUTH');
    });

    it('deve retornar PERMISSION para códigos 3xxx', () => {
      expect(LexatoError.getCategory(ErrorCodes.PERMISSION_DENIED)).toBe('PERMISSION');
    });

    it('deve retornar CAPTURE para códigos 4xxx', () => {
      expect(LexatoError.getCategory(ErrorCodes.CAPTURE_FAILED)).toBe('CAPTURE');
    });

    it('deve retornar VALIDATION para códigos 5xxx', () => {
      expect(LexatoError.getCategory(ErrorCodes.VALIDATION_INVALID_INPUT)).toBe('VALIDATION');
    });

    it('deve retornar CRYPTO para códigos 6xxx', () => {
      expect(LexatoError.getCategory(ErrorCodes.CRYPTO_HASH_FAILED)).toBe('CRYPTO');
    });

    it('deve retornar STORAGE para códigos 7xxx', () => {
      expect(LexatoError.getCategory(ErrorCodes.STORAGE_UPLOAD_FAILED)).toBe('STORAGE');
    });

    it('deve retornar UNKNOWN para códigos 9xxx', () => {
      expect(LexatoError.getCategory(ErrorCodes.UNKNOWN_ERROR)).toBe('UNKNOWN');
    });
  });

  describe('toJSON', () => {
    it('deve serializar erro para JSON', () => {
      const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE, {
        correlationId: 'test-id',
      });
      const json = error.toJSON();

      expect(json['code']).toBe(ErrorCodes.NETWORK_OFFLINE);
      expect(json['category']).toBe('NETWORK');
      expect(json['correlationId']).toBe('test-id');
      expect(json['timestamp']).toBeDefined();
    });

    it('deve incluir erro original quando presente', () => {
      const originalError = new Error('Original');
      const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE, { originalError });
      const json = error.toJSON();

      expect(json['originalError']).toBeDefined();
      expect((json['originalError'] as Record<string, unknown>)['message']).toBe('Original');
    });
  });
});

describe('fromError', () => {
  it('deve retornar LexatoError se já for LexatoError', () => {
    const original = new LexatoError(ErrorCodes.NETWORK_OFFLINE);
    const result = fromError(original);
    expect(result).toBe(original);
  });

  it('deve converter Error genérico para LexatoError', () => {
    const original = new Error('Generic error');
    const result = fromError(original);
    expect(result).toBeInstanceOf(LexatoError);
    expect(result.originalError).toBe(original);
  });

  it('deve detectar erro de rede', () => {
    const original = new Error('network error');
    const result = fromError(original);
    expect(result.code).toBe(ErrorCodes.NETWORK_OFFLINE);
  });

  it('deve detectar erro de timeout', () => {
    const original = new Error('request timeout');
    const result = fromError(original);
    expect(result.code).toBe(ErrorCodes.NETWORK_TIMEOUT);
  });

  it('deve detectar erro 401', () => {
    const original = new Error('401 Unauthorized');
    const result = fromError(original);
    expect(result.code).toBe(ErrorCodes.AUTH_TOKEN_INVALID);
  });

  it('deve detectar erro 402 (créditos)', () => {
    const original = new Error('402 Payment Required');
    const result = fromError(original);
    expect(result.code).toBe(ErrorCodes.AUTH_INSUFFICIENT_CREDITS);
  });

  it('deve detectar erro 403', () => {
    const original = new Error('403 Forbidden');
    const result = fromError(original);
    expect(result.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  it('deve detectar erro 429', () => {
    const original = new Error('429 Too Many Requests');
    const result = fromError(original);
    expect(result.code).toBe(ErrorCodes.NETWORK_RATE_LIMITED);
  });

  it('deve detectar erro 500', () => {
    const original = new Error('500 Internal Server Error');
    const result = fromError(original);
    expect(result.code).toBe(ErrorCodes.NETWORK_SERVER_ERROR);
  });

  it('deve incluir correlationId quando fornecido', () => {
    const original = new Error('test');
    const result = fromError(original, 'correlation-123');
    expect(result.correlationId).toBe('correlation-123');
  });

  it('deve converter string para LexatoError', () => {
    const result = fromError('string error');
    expect(result).toBeInstanceOf(LexatoError);
  });
});

describe('isNetworkError', () => {
  it('deve retornar true para erros de rede', () => {
    const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE);
    expect(isNetworkError(error)).toBe(true);
  });

  it('deve retornar false para outros erros', () => {
    const error = new LexatoError(ErrorCodes.AUTH_TOKEN_EXPIRED);
    expect(isNetworkError(error)).toBe(false);
  });

  it('deve retornar false para erros não-Lexato', () => {
    const error = new Error('test');
    expect(isNetworkError(error)).toBe(false);
  });
});

describe('isAuthError', () => {
  it('deve retornar true para erros de autenticação', () => {
    const error = new LexatoError(ErrorCodes.AUTH_TOKEN_EXPIRED);
    expect(isAuthError(error)).toBe(true);
  });

  it('deve retornar false para outros erros', () => {
    const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE);
    expect(isAuthError(error)).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('deve retornar true para erros de rede', () => {
    const error = new LexatoError(ErrorCodes.NETWORK_OFFLINE);
    expect(isRetryableError(error)).toBe(true);
  });

  it('deve retornar true para erro de timeout', () => {
    const error = new LexatoError(ErrorCodes.NETWORK_TIMEOUT);
    expect(isRetryableError(error)).toBe(true);
  });

  it('deve retornar true para erro de rate limit', () => {
    const error = new LexatoError(ErrorCodes.NETWORK_RATE_LIMITED);
    expect(isRetryableError(error)).toBe(true);
  });

  it('deve retornar true para erro de upload', () => {
    const error = new LexatoError(ErrorCodes.STORAGE_UPLOAD_FAILED);
    expect(isRetryableError(error)).toBe(true);
  });

  it('deve retornar false para erros de validação', () => {
    const error = new LexatoError(ErrorCodes.VALIDATION_INVALID_INPUT);
    expect(isRetryableError(error)).toBe(false);
  });

  it('deve retornar false para erros de autenticação', () => {
    const error = new LexatoError(ErrorCodes.AUTH_INVALID_CREDENTIALS);
    expect(isRetryableError(error)).toBe(false);
  });
});
