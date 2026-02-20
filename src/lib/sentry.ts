/**
 * Configuração do Sentry para extensões Chrome MV3
 *
 * IMPORTANTE: Extensões de navegador NÃO devem usar Sentry.init()
 * pois isso polui o estado global. Em vez disso, usamos BrowserClient
 * com Scope isolado conforme documentação oficial:
 * https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/
 *
 * @module sentry
 */

// @ts-nocheck - Tipos do Sentry SDK v10 incompatíveis com moduleResolution: bundler
// O código segue a documentação oficial e funciona em runtime
import {
  BrowserClient,
  defaultStackParser,
  getDefaultIntegrations,
  makeFetchTransport,
  Scope,
} from '@sentry/browser';
import type { TransportMakeRequestResponse } from '@sentry/types';
import { getEnvironment, getSentryEnvironment, isDebugEnabled } from '../config/environment';

/**
 * Flag para debug de transport (avaliada em runtime)
 * @see src/config/environment.ts - Configuração centralizada
 */
function isTransportDebugEnabled(): boolean {
  return isDebugEnabled();
}

/**
 * Transport wrapper com debug para diagnóstico de envio
 * NOTA: Logs desabilitados em produção para performance
 */
function makeDebugFetchTransport(options: Parameters<typeof makeFetchTransport>[0]) {
  const transport = makeFetchTransport(options);

  return {
    ...transport,
    send: async (request: Parameters<typeof transport.send>[0]): Promise<TransportMakeRequestResponse> => {
      if (isTransportDebugEnabled()) {
        console.info('[Sentry Transport] Enviando evento para:', options.url);
        console.info('[Sentry Transport] Payload:', {
          bodyLength: JSON.stringify(request).length,
          hasBody: !!request,
        });
      }

      try {
        const result = await transport.send(request);
        if (isTransportDebugEnabled()) {
          console.info('[Sentry Transport] Resposta recebida:', {
            statusCode: result.statusCode,
            headers: result.headers,
            success: result.statusCode === 200,
          });
          if (result.statusCode !== 200) {
            console.warn('[Sentry Transport] Status não-200:', result.statusCode);
          }
        }
        return result;
      } catch (error) {
        console.error('[Sentry Transport] Erro ao enviar:', error);
        throw error;
      }
    },
  };
}

/**
 * Tipos de contexto da extensão
 */
export type ExtensionContext =
  | 'service-worker'
  | 'popup'
  | 'sidepanel'
  | 'content-script'
  | 'offscreen'
  | 'preview';

/**
 * Configuração do Sentry
 */
interface SentryConfig {
  context: ExtensionContext;
  userId?: string;
  additionalTags?: Record<string, string>;
}

/**
 * Cliente e escopo do Sentry (isolados para extensão)
 */
let sentryClient: BrowserClient | null = null;
let sentryScope: Scope | null = null;

/**
 * Obtém o DSN do Sentry
 */
function getSentryDsn(): string | undefined {
  if (import.meta.env.DEV && !import.meta.env.VITE_SENTRY_DSN) {
    return undefined;
  }
  return import.meta.env.VITE_SENTRY_DSN;
}

/**
 * Obtém o ambiente atual para Sentry
 * @see src/config/environment.ts - Configuração centralizada
 */
function getSentryEnv(): string {
  return getSentryEnvironment();
}

/**
 * Taxa de amostragem baseada no ambiente
 * NOTA: Temporariamente 1.0 em staging para debug
 */
function getSampleRate(): number {
  const env = getSentryEnv();
  if (env === 'production') {
    return 0.1;
  }
  // Staging: 1.0 para garantir que todos os eventos sejam capturados durante debug
  if (env === 'staging') {
    return 1.0;
  }
  return 1.0;
}

/**
 * Flag para habilitar logs de debug do Sentry
 * Desabilitado em produção para melhorar performance
 * @see src/config/environment.ts - Configuração centralizada
 */
const SENTRY_DEBUG = isDebugEnabled();

/**
 * Log condicional do Sentry (apenas em desenvolvimento)
 */
function sentryLog(message: string, ...args: unknown[]): void {
  if (SENTRY_DEBUG) {
    console.info(message, ...args);
  }
}

/**
 * Inicializa o Sentry para extensões Chrome (abordagem isolada)
 *
 * Usa BrowserClient em vez de Sentry.init() para evitar
 * poluição do estado global conforme documentação oficial.
 */
export function initSentry(config: SentryConfig): boolean {
  try {
    const dsn = getSentryDsn();

    if (!dsn) {
      console.warn('[Sentry] DSN não configurado, monitoramento desabilitado');
      return false;
    }

    // Filtra integrações que usam variáveis globais
    // (necessário para extensões de navegador)
    const integrations = getDefaultIntegrations({}).filter(
      (defaultIntegration) => {
        return !['BrowserApiErrors', 'Breadcrumbs', 'GlobalHandlers'].includes(
          defaultIntegration.name
        );
      }
    );

    // Cria cliente isolado com transport debug
    sentryClient = new BrowserClient({
      dsn,
      transport: makeDebugFetchTransport,
      stackParser: defaultStackParser,
      integrations,
      environment: getSentryEnv(),
      release: chrome?.runtime?.getManifest?.()?.version || 'unknown',
      sampleRate: 1.0, // 100% dos erros capturados
      tracesSampleRate: 0.5,
      sendDefaultPii: false, // Não capturar PII automaticamente
      beforeSend: (event) => {
        // Debug: Log de evento sendo enviado (apenas em desenvolvimento)
        sentryLog('[Sentry] beforeSend - Evento capturado:', {
          eventId: event.event_id,
          type: event.type,
          message: event.message,
          exception: event.exception?.values?.[0]?.type,
          level: event.level,
        });

        // Remove informações sensíveis
        if (event.request?.cookies) {
          delete event.request.cookies;
        }
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['x-api-key'];
        }
        return event;
      },
    });

    // Cria escopo isolado
    sentryScope = new Scope();
    sentryScope.setClient(sentryClient);

    // Inicializa após configurar o escopo
    sentryClient.init();

    // Configura tags
    sentryScope.setTag('context', config.context);
    sentryScope.setTag('extension_id', chrome?.runtime?.id || 'unknown');

    if (config.additionalTags) {
      Object.entries(config.additionalTags).forEach(([key, value]) => {
        sentryScope?.setTag(key, value);
      });
    }

    // Configura usuário se fornecido
    if (config.userId) {
      sentryScope.setUser({ id: config.userId });
    }

    // Adiciona contexto da extensão
    sentryScope.setContext('extension', {
      manifest_version: chrome?.runtime?.getManifest?.()?.manifest_version || 'unknown',
      context: config.context,
    });

    return true;
  } catch (error) {
    console.error('[Sentry] Falha ao inicializar:', error);
    return false;
  }
}

/**
 * Captura uma exceção usando o cliente diretamente
 * Abordagem mais explícita para garantir envio em extensões Chrome
 */
export function captureException(
  error: Error | unknown,
  context?: Record<string, unknown>
): void {
  if (!sentryClient || !sentryScope) {
    return;
  }

  try {
    // Criar um scope clone para não poluir o scope global
    const eventScope = sentryScope.clone();

    if (context) {
      eventScope.setContext('additional', context);
    }

    // Usar o cliente diretamente para capturar a exceção
    sentryClient.captureException(error, {}, eventScope);
  } catch {
    // Falha silenciosa - não interromper fluxo da aplicação
  }
}

/**
 * Captura uma mensagem
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug' = 'info',
  context?: Record<string, unknown>
): void {
  if (!sentryScope) {
    console.log(`[Sentry] Não inicializado. ${level}: ${message}`);
    return;
  }

  try {
    if (context) {
      sentryScope.setContext('additional', context);
    }
    sentryScope.captureMessage(message, level);
  } catch (e) {
    console.log(`[Sentry] Falha ao capturar mensagem. ${level}: ${message}`, e);
  }
}

/**
 * Adiciona um breadcrumb
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message?: string;
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
  data?: Record<string, unknown>;
}): void {
  if (!sentryScope) {
    return;
  }

  try {
    sentryScope.addBreadcrumb(breadcrumb);
  } catch {
    // Falha silenciosa
  }
}

/**
 * Define o usuário atual
 */
export function setUser(user: { id: string; email?: string; name?: string } | null): void {
  if (!sentryScope) {
    return;
  }

  try {
    sentryScope.setUser(user);
  } catch {
    // Falha silenciosa
  }
}

/**
 * Define tags adicionais
 */
export function setTags(tags: Record<string, string>): void {
  if (!sentryScope) {
    return;
  }

  try {
    Object.entries(tags).forEach(([key, value]) => {
      sentryScope?.setTag(key, value);
    });
  } catch {
    // Falha silenciosa
  }
}

/**
 * Wrapper para funções assíncronas com captura de erros
 */
export async function withSentry<T>(
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    captureException(error, context);
    throw error;
  }
}

/**
 * Limpa o contexto do Sentry
 */
export function clearSentryContext(): void {
  if (!sentryScope) {
    return;
  }

  try {
    sentryScope.setUser(null);
  } catch {
    // Falha silenciosa
  }
}

/**
 * Verifica se o Sentry está inicializado
 */
export function isSentryInitialized(): boolean {
  return sentryClient !== null && sentryScope !== null;
}

/**
 * Testa o envio de erro ao Sentry (apenas para debug)
 * Pode ser chamado via console do DevTools: testSentryConnection()
 */
export function testSentryConnection(): void {
  console.info('[Sentry] Iniciando teste de conexão...');
  console.info('[Sentry] Estado:', {
    clientInitialized: !!sentryClient,
    scopeInitialized: !!sentryScope,
    dsn: getSentryDsn()?.substring(0, 30) + '...',
    environment: getEnvironment(),
    sampleRate: getSampleRate(),
  });

  if (!sentryScope || !sentryClient) {
    console.error('[Sentry] Teste falhou: Sentry não inicializado');
    return;
  }

  try {
    const testError = new Error('[TESTE] Erro de teste do Sentry - pode ignorar');
    const eventId = sentryScope.captureException(testError);
    console.info('[Sentry] Teste enviado! EventId:', eventId);
    console.info('[Sentry] Verifique o dashboard do Sentry em alguns segundos');
  } catch (e) {
    console.error('[Sentry] Teste falhou:', e);
  }
}

// Expõe função de teste globalmente para debug via console (apenas em desenvolvimento)
if (import.meta.env.DEV && typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).testSentryConnection = testSentryConnection;
  (globalThis as Record<string, unknown>).testSentryDirect = testSentryDirect;
}

/**
 * Envia um evento de teste diretamente via fetch, sem usar o SDK
 * Isso ajuda a identificar se o problema é com o SDK ou com o projeto Sentry
 */
export async function testSentryDirect(): Promise<void> {
  const dsn = getSentryDsn();
  if (!dsn) {
    console.error('[Sentry Direct] DSN não configurado');
    return;
  }

  // Parse DSN: https://<key>@<org>.ingest.us.sentry.io/<project>
  const match = dsn.match(/https:\/\/([^@]+)@([^/]+)\/(\d+)/);
  if (!match) {
    console.error('[Sentry Direct] DSN inválido');
    return;
  }

  const [, publicKey, host, projectId] = match;
  const url = `https://${host}/api/${projectId}/store/?sentry_version=7&sentry_key=${publicKey}`;

  console.info('[Sentry Direct] Enviando evento de teste para:', url);

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    logger: 'test',
    message: {
      formatted: '[TESTE DIRETO] Erro de teste enviado diretamente via fetch - ' + new Date().toISOString(),
    },
    tags: {
      test: 'direct',
      context: 'service-worker',
    },
    extra: {
      source: 'testSentryDirect',
      timestamp: Date.now(),
    },
    sdk: {
      name: 'sentry.javascript.browser',
      version: '10.35.0',
    },
  };

  console.info('[Sentry Direct] Payload:', event);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    const responseText = await response.text();
    console.info('[Sentry Direct] Resposta:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (response.ok) {
      console.info('[Sentry Direct] Evento enviado com sucesso! Verifique o dashboard em alguns segundos.');
    } else {
      console.error('[Sentry Direct] Falha ao enviar evento:', response.status, responseText);
    }
  } catch (error) {
    console.error('[Sentry Direct] Erro na requisição:', error);
  }
}
