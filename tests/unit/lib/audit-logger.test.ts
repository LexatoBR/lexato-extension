/**
 * Testes unitários para AuditLogger
 *
 * Testa geração de logs estruturados, correlationId e sanitização
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger, MASK_PATTERN, type LogEntry } from '@lib/audit-logger';

/**
 * Helper para obter primeira entrada de log com validação
 * Evita non-null assertions repetidas nos testes
 */
function getFirstEntry(logger: AuditLogger): LogEntry {
  const entries = logger.getEntries();
  expect(entries).toHaveLength(1);
  return entries[0]!;
}

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
  });

  describe('constructor', () => {
    it('deve gerar correlationId automaticamente', () => {
      const correlationId = logger.getCorrelationId();
      expect(correlationId).toBeDefined();
      expect(correlationId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('deve aceitar correlationId customizado', () => {
      const customId = 'custom-correlation-id';
      const customLogger = new AuditLogger(customId);
      expect(customLogger.getCorrelationId()).toBe(customId);
    });

    it('deve gerar traceId compatível com X-Ray', () => {
      const traceId = logger.getTraceId();
      expect(traceId).toBeDefined();
      expect(traceId).toMatch(/^1-[0-9a-f]+-[0-9a-f]+$/);
    });
  });

  describe('generateCorrelationId', () => {
    it('deve gerar UUIDs únicos', () => {
      const id1 = AuditLogger.generateCorrelationId();
      const id2 = AuditLogger.generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateTraceId', () => {
    it('deve gerar traceIds únicos', () => {
      const id1 = AuditLogger.generateTraceId();
      const id2 = AuditLogger.generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('logging methods', () => {
    it('deve registrar log INFO', () => {
      logger.info('PISA', 'TEST_ACTION', { key: 'value' });
      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.level).toBe('INFO');
      expect(entries[0]!.process).toBe('PISA');
      expect(entries[0]!.action).toBe('TEST_ACTION');
    });

    it('deve registrar log WARN', () => {
      logger.warn('LOCKDOWN', 'WARNING_ACTION');
      const entries = logger.getEntries();
      expect(entries[0]!.level).toBe('WARN');
    });

    it('deve registrar log ERROR com erro', () => {
      const error = new Error('Test error');
      logger.error('CAPTURE', 'ERROR_ACTION', {}, error);
      const entries = logger.getEntries();
      expect(entries[0]!.level).toBe('ERROR');
      expect(entries[0]!.error).toBeDefined();
      expect(entries[0]!.error?.message).toBe('Test error');
    });

    it('deve registrar log CRITICAL', () => {
      logger.critical('PCC', 'CRITICAL_ACTION');
      const entries = logger.getEntries();
      expect(entries[0]!.level).toBe('CRITICAL');
    });

    it('deve incluir timestamp ISO 8601', () => {
      logger.info('GENERAL', 'TEST');
      const entries = logger.getEntries();
      expect(entries[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('deve incluir elapsedMs', () => {
      logger.info('GENERAL', 'TEST');
      const entries = logger.getEntries();
      expect(typeof entries[0]!.elapsedMs).toBe('number');
      expect(entries[0]!.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('deve incluir correlationId em todas as entradas', () => {
      logger.info('GENERAL', 'TEST1');
      logger.warn('GENERAL', 'TEST2');
      const entries = logger.getEntries();
      const correlationId = logger.getCorrelationId();
      expect(entries[0]!.correlationId).toBe(correlationId);
      expect(entries[1]!.correlationId).toBe(correlationId);
    });
  });

  describe('sanitização de dados', () => {
    /**
     * Casos de teste parametrizados para sanitização de campos sensíveis
     * Usa MASK_PATTERN exportado do módulo para garantir sincronização
     */
    const sanitizationCases = [
      { field: 'password', value: 'secret123', process: 'AUTH', action: 'LOGIN' },
      { field: 'accessToken', value: 'abc123', process: 'AUTH', action: 'TOKEN' },
      { field: 'refreshToken', value: 'xyz789', process: 'AUTH', action: 'TOKEN' },
      { field: 'email', value: 'user@example.com', process: 'AUTH', action: 'USER' },
      { field: 'cpf', value: '123.456.789-00', process: 'AUTH', action: 'USER' },
    ] as const;

    it.each(sanitizationCases)(
      'deve sanitizar campo $field',
      ({ field, value, process, action }) => {
        logger.info(process, action, { [field]: value });
        const entry = getFirstEntry(logger);
        expect(entry.data?.[field]).toBe(MASK_PATTERN);
      }
    );

    it('deve sanitizar campos aninhados', () => {
      logger.info('AUTH', 'USER', { user: { password: 'secret' } });
      const entry = getFirstEntry(logger);
      expect((entry.data?.['user'] as Record<string, unknown>)?.['password']).toBe(MASK_PATTERN);
    });

    it('deve manter campos não sensíveis', () => {
      logger.info('GENERAL', 'TEST', { name: 'John', age: 30 });
      const entry = getFirstEntry(logger);
      expect(entry.data?.['name']).toBe('John');
      expect(entry.data?.['age']).toBe(30);
    });
  });

  describe('getAuditTrail', () => {
    it('deve retornar todas as entradas', () => {
      logger.info('PISA', 'STEP1');
      logger.info('PISA', 'STEP2');
      logger.info('PISA', 'STEP3');
      const trail = logger.getAuditTrail();
      expect(trail).toHaveLength(3);
    });
  });

  describe('getSummary', () => {
    it('deve retornar resumo correto', () => {
      logger.info('PISA', 'STEP1');
      logger.warn('LOCKDOWN', 'WARNING');
      logger.error('CAPTURE', 'ERROR');
      logger.critical('PCC', 'CRITICAL');

      const summary = logger.getSummary();
      expect(summary.correlationId).toBe(logger.getCorrelationId());
      expect(summary.entriesCount).toBe(4);
      expect(summary.countByLevel.INFO).toBe(1);
      expect(summary.countByLevel.WARN).toBe(1);
      expect(summary.countByLevel.ERROR).toBe(1);
      expect(summary.countByLevel.CRITICAL).toBe(1);
      expect(summary.countByProcess.PISA).toBe(1);
      expect(summary.countByProcess.LOCKDOWN).toBe(1);
      expect(summary.countByProcess.CAPTURE).toBe(1);
      expect(summary.countByProcess.PCC).toBe(1);
    });

    it('deve incluir totalDurationMs', () => {
      logger.info('GENERAL', 'TEST');
      const summary = logger.getSummary();
      expect(typeof summary.totalDurationMs).toBe('number');
    });
  });

  describe('clear', () => {
    it('deve limpar todas as entradas', () => {
      logger.info('GENERAL', 'TEST1');
      logger.info('GENERAL', 'TEST2');
      expect(logger.getEntries()).toHaveLength(2);
      logger.clear();
      expect(logger.getEntries()).toHaveLength(0);
    });
  });

  describe('createChild', () => {
    it('deve criar logger filho com mesmo correlationId', () => {
      const child = logger.createChild();
      expect(child.getCorrelationId()).toBe(logger.getCorrelationId());
    });

    it('deve preservar traceId do pai (padrão Pino child logger)', () => {
      const child = logger.createChild();
      // Child loggers devem preservar traceId para rastreabilidade completa
      // Seguindo padrão do Pino Logger: https://github.com/pinojs/pino
      expect(child.getTraceId()).toBe(logger.getTraceId());
    });

    it('deve preservar contexto persistente no filho', () => {
      const loggerWithContext = new AuditLogger(undefined, { captureId: 'cap-123', tabId: 42 });
      const child = loggerWithContext.createChild();
      expect(child.getContext()).toEqual({ captureId: 'cap-123', tabId: 42 });
    });

    it('deve preservar opções do pai no filho', () => {
      const loggerWithOptions = new AuditLogger(undefined, {}, undefined, { 
        enableInfoLogs: true, 
        maxEntries: 5000 
      });
      const child = loggerWithOptions.createChild();
      expect(child.getOptions().enableInfoLogs).toBe(true);
      expect(child.getOptions().maxEntries).toBe(5000);
    });
  });

  describe('startTimer', () => {
    it('deve retornar função que mede tempo decorrido', async () => {
      const stopTimer = logger.startTimer('operacaoTeste');
      
      // Aguardar um pequeno intervalo
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const duration = stopTimer();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(40); // Pelo menos 40ms (margem de erro)
      expect(duration).toBeLessThan(200); // Não deve demorar muito
    });

    it('deve retornar 0 ou valor baixo quando chamado imediatamente', () => {
      const stopTimer = logger.startTimer('operacaoRapida');
      const duration = stopTimer();
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(10);
    });

    it('deve permitir múltiplos timers independentes', async () => {
      const stopTimer1 = logger.startTimer('operacao1');
      
      await new Promise(resolve => setTimeout(resolve, 30));
      
      const stopTimer2 = logger.startTimer('operacao2');
      
      await new Promise(resolve => setTimeout(resolve, 30));
      
      const duration1 = stopTimer1();
      const duration2 = stopTimer2();
      
      // Timer1 deve ter medido mais tempo que timer2
      expect(duration1).toBeGreaterThan(duration2);
    });

    it('deve retornar valor arredondado em milissegundos', () => {
      const stopTimer = logger.startTimer('operacao');
      const duration = stopTimer();
      expect(Number.isInteger(duration)).toBe(true);
    });
  });

  describe('withContext', () => {
    it('deve criar nova instância com contexto mesclado', () => {
      const contextLogger = logger.withContext({ captureId: 'cap-123', tabId: 42 });
      expect(contextLogger).toBeInstanceOf(AuditLogger);
      expect(contextLogger).not.toBe(logger);
    });

    it('deve preservar correlationId na nova instância', () => {
      const contextLogger = logger.withContext({ captureId: 'cap-123' });
      expect(contextLogger.getCorrelationId()).toBe(logger.getCorrelationId());
    });

    it('deve preservar traceId na nova instância', () => {
      const contextLogger = logger.withContext({ captureId: 'cap-123' });
      expect(contextLogger.getTraceId()).toBe(logger.getTraceId());
    });

    it('deve incluir contexto em todos os logs', () => {
      const contextLogger = logger.withContext({ captureId: 'cap-123', tabId: 42 });
      contextLogger.info('CAPTURE', 'TESTE');
      
      const entries = contextLogger.getEntries();
      expect(entries[0]!.data).toEqual({ captureId: 'cap-123', tabId: 42 });
    });

    it('deve mesclar contexto com dados do log', () => {
      const contextLogger = logger.withContext({ captureId: 'cap-123' });
      contextLogger.info('CAPTURE', 'TESTE', { chunkIndex: 5 });
      
      const entries = contextLogger.getEntries();
      expect(entries[0]!.data).toEqual({ captureId: 'cap-123', chunkIndex: 5 });
    });

    it('deve permitir sobrescrever contexto com dados do log', () => {
      const contextLogger = logger.withContext({ phase: 'COLLECTING' });
      contextLogger.info('CAPTURE', 'TESTE', { phase: 'PROCESSING' });
      
      const entries = contextLogger.getEntries();
      expect(entries[0]!.data?.['phase']).toBe('PROCESSING');
    });

    it('deve permitir encadeamento de withContext', () => {
      const logger1 = logger.withContext({ captureId: 'cap-123' });
      const logger2 = logger1.withContext({ tabId: 42 });
      const logger3 = logger2.withContext({ phase: 'COLLECTING' });
      
      logger3.info('CAPTURE', 'TESTE');
      
      const entries = logger3.getEntries();
      expect(entries[0]!.data).toEqual({ 
        captureId: 'cap-123', 
        tabId: 42, 
        phase: 'COLLECTING' 
      });
    });

    it('deve manter logger original inalterado', () => {
      logger.withContext({ captureId: 'cap-123' });
      logger.info('GENERAL', 'TESTE');
      
      const entries = logger.getEntries();
      expect(entries[0]!.data).toBeUndefined();
    });
  });

  describe('getContext', () => {
    it('deve retornar contexto vazio por padrão', () => {
      expect(logger.getContext()).toEqual({});
    });

    it('deve retornar contexto definido no construtor', () => {
      const loggerWithContext = new AuditLogger(undefined, { captureId: 'cap-123', tabId: 42 });
      expect(loggerWithContext.getContext()).toEqual({ captureId: 'cap-123', tabId: 42 });
    });

    it('deve retornar cópia do contexto (não referência)', () => {
      const loggerWithContext = new AuditLogger(undefined, { captureId: 'cap-123' });
      const context1 = loggerWithContext.getContext();
      const context2 = loggerWithContext.getContext();
      
      expect(context1).not.toBe(context2);
      expect(context1).toEqual(context2);
    });

    it('deve retornar contexto após withContext', () => {
      const contextLogger = logger.withContext({ captureId: 'cap-123', phase: 'COLLECTING' });
      expect(contextLogger.getContext()).toEqual({ captureId: 'cap-123', phase: 'COLLECTING' });
    });
  });

  describe('formato de log padronizado', () => {
    it('deve emitir log no formato [Module] Operation - {data}', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      logger.warn('CAPTURE', 'CHUNK_PROCESSED', { chunkIndex: 5, size: 1024 });
      
      expect(warnSpy).toHaveBeenCalledWith(
        '[CAPTURE] CHUNK_PROCESSED - {"chunkIndex":5,"size":1024}'
      );
      
      warnSpy.mockRestore();
    });

    it('deve emitir log com objeto vazio quando sem dados', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      logger.warn('CAPTURE', 'STARTED');
      
      expect(warnSpy).toHaveBeenCalledWith('[CAPTURE] STARTED - {}');
      
      warnSpy.mockRestore();
    });

    it('deve incluir prefixo [CRITICAL] para logs críticos', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      logger.critical('CAPTURE', 'FATAL_ERROR', { reason: 'timeout' });
      
      expect(errorSpy).toHaveBeenCalledWith(
        '[CRITICAL] [CAPTURE] FATAL_ERROR - {"reason":"timeout"}'
      );
      
      errorSpy.mockRestore();
    });
  });

  describe('categoria ISOLATION', () => {
    it('deve registrar logs com processo ISOLATION', () => {
      logger.info('ISOLATION', 'ACTIVATION_START', { correlationId: 'test-123' });
      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.process).toBe('ISOLATION');
      expect(entries[0]!.action).toBe('ACTIVATION_START');
    });

    it('deve contar logs ISOLATION no resumo', () => {
      logger.info('ISOLATION', 'ACTIVATION_START');
      logger.info('ISOLATION', 'EXTENSION_DISABLED', { extensionId: 'ext-1' });
      logger.info('ISOLATION', 'ACTIVATION_COMPLETE');
      logger.warn('ISOLATION', 'NON_DISABLEABLE_EXTENSIONS');
      logger.error('ISOLATION', 'ACTIVATION_FAILED');

      const summary = logger.getSummary();
      expect(summary.countByProcess.ISOLATION).toBe(5);
      expect(summary.countByLevel.INFO).toBe(3);
      expect(summary.countByLevel.WARN).toBe(1);
      expect(summary.countByLevel.ERROR).toBe(1);
    });

    it('deve registrar logs estruturados de isolamento com dados', () => {
      logger.info('ISOLATION', 'SNAPSHOT_CREATED', {
        snapshotId: 'snap_123',
        extensionsCount: 5,
        hash: 'abc123...',
      });

      const entries = logger.getEntries();
      expect(entries[0]!.data).toEqual({
        snapshotId: 'snap_123',
        extensionsCount: 5,
        hash: 'abc123...',
      });
    });
  });

  describe('opções de configuração', () => {
    it('deve aceitar opções no construtor', () => {
      const loggerWithOptions = new AuditLogger(undefined, {}, undefined, {
        enableInfoLogs: true,
        maxEntries: 500,
        additionalSensitiveKeys: ['customSecret'],
      });
      
      const options = loggerWithOptions.getOptions();
      expect(options.enableInfoLogs).toBe(true);
      expect(options.maxEntries).toBe(500);
      expect(options.additionalSensitiveKeys).toContain('customSecret');
    });

    it('deve usar valores padrão quando opções não fornecidas', () => {
      const options = logger.getOptions();
      expect(options.enableInfoLogs).toBe(false);
      expect(options.maxEntries).toBe(10000);
      expect(options.additionalSensitiveKeys).toEqual([]);
    });

    it('deve sanitizar chaves sensíveis adicionais', () => {
      const loggerWithCustomKeys = new AuditLogger(undefined, {}, undefined, {
        additionalSensitiveKeys: ['customSecret', 'myApiKey'],
      });
      
      loggerWithCustomKeys.info('GENERAL', 'TEST', {
        customSecret: 'valor-secreto',
        myApiKey: 'chave-api',
        publicData: 'visível',
      });
      
      const entries = loggerWithCustomKeys.getEntries();
      expect(entries[0]!.data).toEqual({
        customSecret: MASK_PATTERN,
        myApiKey: MASK_PATTERN,
        publicData: 'visível',
      });
    });
  });

  describe('limite de entradas (maxEntries)', () => {
    it('deve respeitar limite máximo de entradas', () => {
      const loggerWithLimit = new AuditLogger(undefined, {}, undefined, {
        maxEntries: 5,
      });
      
      // Adiciona 7 entradas
      for (let i = 0; i < 7; i++) {
        loggerWithLimit.info('GENERAL', `ACTION_${i}`);
      }
      
      const entries = loggerWithLimit.getEntries();
      expect(entries).toHaveLength(5);
      // Deve manter as 5 mais recentes (FIFO)
      expect(entries[0]!.action).toBe('ACTION_2');
      expect(entries[4]!.action).toBe('ACTION_6');
    });
  });

  describe('validação de entrada', () => {
    it('deve ignorar log com action vazia', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      logger.info('GENERAL', '');
      logger.info('GENERAL', '   ');
      
      const entries = logger.getEntries();
      expect(entries).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith('[AuditLogger] Action não pode ser vazia');
      
      warnSpy.mockRestore();
    });
  });

  describe('métodos de exportação', () => {
    it('deve exportar entradas em formato JSON', () => {
      logger.info('GENERAL', 'TEST_1');
      logger.warn('CAPTURE', 'TEST_2');
      
      const json = logger.toJSON();
      const parsed = JSON.parse(json);
      
      expect(parsed).toHaveLength(2);
      expect(parsed[0].action).toBe('TEST_1');
      expect(parsed[1].action).toBe('TEST_2');
    });

    it('deve exportar entradas em formato NDJSON', () => {
      logger.info('GENERAL', 'TEST_1');
      logger.warn('CAPTURE', 'TEST_2');
      
      const ndjson = logger.toNDJSON();
      const lines = ndjson.split('\n');
      
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).action).toBe('TEST_1');
      expect(JSON.parse(lines[1]!).action).toBe('TEST_2');
    });
  });

  describe('enableInfoLogs', () => {
    it('deve emitir INFO logs quando enableInfoLogs é true', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const loggerWithInfo = new AuditLogger(undefined, {}, undefined, {
        enableInfoLogs: true,
      });
      
      loggerWithInfo.info('GENERAL', 'INFO_TEST');
      
      expect(warnSpy).toHaveBeenCalledWith('[INFO] [GENERAL] INFO_TEST - {}');
      
      warnSpy.mockRestore();
    });

    it('não deve emitir INFO logs quando enableInfoLogs é false', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      logger.info('GENERAL', 'INFO_TEST');
      
      // Não deve ter chamado console.warn para INFO
      expect(warnSpy).not.toHaveBeenCalled();
      
      // Mas a entrada deve estar registrada
      expect(logger.getEntries()).toHaveLength(1);
      
      warnSpy.mockRestore();
    });
  });

  describe('startTimer com logging', () => {
    it('deve emitir log de debug quando enableInfoLogs é true', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const loggerWithDebug = new AuditLogger(undefined, {}, undefined, {
        enableInfoLogs: true,
      });
      
      const stopTimer = loggerWithDebug.startTimer('operacaoTeste');
      stopTimer();
      
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/\[DEBUG\]\[Timer\] operacaoTeste: \d+ms/));
      
      warnSpy.mockRestore();
    });

    it('não deve emitir log de debug quando enableInfoLogs é false', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const stopTimer = logger.startTimer('operacaoTeste');
      stopTimer();
      
      expect(warnSpy).not.toHaveBeenCalled();
      
      warnSpy.mockRestore();
    });
  });

  describe('withContext preserva opções', () => {
    it('deve preservar opções ao criar logger com contexto', () => {
      const loggerWithOptions = new AuditLogger(undefined, {}, undefined, {
        enableInfoLogs: true,
        maxEntries: 100,
      });
      
      const contextLogger = loggerWithOptions.withContext({ captureId: 'test' });
      
      expect(contextLogger.getOptions().enableInfoLogs).toBe(true);
      expect(contextLogger.getOptions().maxEntries).toBe(100);
    });
  });
});
