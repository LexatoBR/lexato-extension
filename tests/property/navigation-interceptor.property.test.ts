/**
 * Property tests para NavigationInterceptor
 *
 * Valida as propriedades de interceptação de navegação durante gravação de vídeo:
 * - Property 12: Normal Link Navigation Allowed
 * - Property 13: Blank Target Conversion
 *
 * @module navigation-interceptor.property.test
 * @requirements 4.1, 4.2

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  NavigationInterceptor,
  resetGlobalInterceptor,
  type NavigationInterceptorConfig,
  type NavigationEvent,
} from '../../src/content/navigation-interceptor';

// ============================================================================
// Mocks
// ============================================================================

// Mock do chrome.runtime
const mockSendMessage = vi.fn().mockResolvedValue(undefined);

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
  },
});

// ============================================================================
// Tipos para Testes
// ============================================================================

/**
 * Configuração de link para testes
 */
interface LinkConfig {
  /** URL do link */
  href: string;
  /** Atributo target (undefined = sem target) */
  target: string | undefined;
  /** Texto do link */
  text: string;
}

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera URLs válidas para testes
 * Inclui URLs absolutas e relativas
 */
const urlArbitrary = fc.oneof(
  // URLs absolutas com diferentes protocolos
  fc.webUrl(),
  // URLs relativas simples
  fc.stringMatching(/^\/[a-z0-9\-_]{1,30}$/).map((path) => path || '/page'),
  // URLs com query strings
  fc.tuple(
    fc.webUrl(),
    fc.stringMatching(/^[a-z0-9]{1,10}$/)
  ).map(([url, query]) => `${url}?q=${query || 'test'}`),
  // URLs com fragmentos
  fc.tuple(
    fc.webUrl(),
    fc.stringMatching(/^[a-z0-9]{1,10}$/)
  ).map(([url, fragment]) => `${url}#${fragment || 'section'}`)
);

/**
 * Gera configurações de links normais (sem target ou com target="_self")
 * Estes são os links que devem navegar normalmente na mesma aba
 */
const normalLinkConfigArbitrary: fc.Arbitrary<LinkConfig> = fc.record({
  href: urlArbitrary,
  target: fc.constantFrom(undefined, '_self'),
  text: fc.string({ minLength: 1, maxLength: 50 }),
});

/**
 * Gera texto aleatório para links
 */
const linkTextArbitrary = fc.string({ minLength: 1, maxLength: 100 });

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Cria um NavigationInterceptor para testes
 *
 * @param config - Configuração parcial do interceptador
 * @returns Instância do NavigationInterceptor
 */
function createTestInterceptor(
  config?: Partial<NavigationInterceptorConfig>
): NavigationInterceptor {
  return new NavigationInterceptor({
    config: {
      allowNormalNavigation: true,
      interceptBlankTarget: true,
      blockWindowOpen: true,
      allowHistoryNavigation: true,
      ...config,
    },
    sendToServiceWorker: false, // Desabilita envio para SW em testes
  });
}

/**
 * Cria um elemento <a> com as configurações especificadas
 *
 * @param config - Configuração do link
 * @returns Elemento anchor criado
 */
function createAnchorElement(config: LinkConfig): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = config.href;
  anchor.textContent = config.text;

  if (config.target !== undefined) {
    anchor.setAttribute('target', config.target);
  }

  return anchor;
}

/**
 * Simula um clique em um elemento anchor
 *
 * @param anchor - Elemento anchor para clicar
 * @returns Objeto com informações sobre o evento
 */
function simulateClick(anchor: HTMLAnchorElement): {
  event: MouseEvent;
  defaultPrevented: boolean;
  propagationStopped: boolean;
} {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });

  // Rastreia se preventDefault foi chamado
  let defaultPrevented = false;
  const originalPreventDefault = event.preventDefault.bind(event);
  event.preventDefault = () => {
    defaultPrevented = true;
    originalPreventDefault();
  };

  // Rastreia se stopPropagation foi chamado
  let propagationStopped = false;
  const originalStopPropagation = event.stopPropagation.bind(event);
  event.stopPropagation = () => {
    propagationStopped = true;
    originalStopPropagation();
  };

  anchor.dispatchEvent(event);

  return {
    event,
    defaultPrevented,
    propagationStopped,
  };
}

/**
 * Limpa o DOM após cada teste
 */
function cleanupDOM(): void {
  // Remove todos os elementos anchor criados durante o teste
  document.querySelectorAll('a[data-test]').forEach((el) => el.remove());
}

// ============================================================================
// Property Tests
// ============================================================================

describe('NavigationInterceptor Properties', () => {
  let interceptor: NavigationInterceptor;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGlobalInterceptor();
    interceptor = createTestInterceptor();
  });

  afterEach(() => {
    interceptor.deactivate();
    cleanupDOM();
  });

  // ==========================================================================
  // Property 12: Normal Link Navigation Allowed
  // Feature: video-capture-redesign
  // Validates: Requirements 4.1
  // ==========================================================================

  describe('Property 12: Normal Link Navigation Allowed', () => {
    /**
     * **Validates: Requirements 4.1**
     *
     * Para qualquer clique em um link sem atributo target enquanto o
     * Navigation Interceptor está ativo, a navegação DEVE prosseguir
     * na mesma aba (evento NÃO é prevenido).
     */
    it('deve permitir navegação normal para links sem target', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Cria link sem target
            const anchor = createAnchorElement({
              href: url,
              target: undefined,
              text,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação NÃO foi prevenida
            // Links normais devem navegar livremente
            expect(defaultPrevented).toBe(false);
            expect(propagationStopped).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * Links com target="_self" devem ser tratados como links normais
     * e a navegação deve prosseguir na mesma aba.
     */
    it('deve permitir navegação normal para links com target="_self"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Cria link com target="_self"
            const anchor = createAnchorElement({
              href: url,
              target: '_self',
              text,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);
            expect(propagationStopped).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * Usando o gerador de configurações de links normais,
     * verifica que qualquer link normal permite navegação.
     */
    it('deve permitir navegação para qualquer configuração de link normal', () => {
      fc.assert(
        fc.property(
          normalLinkConfigArbitrary,
          (linkConfig) => {
            // Cria link com configuração gerada
            const anchor = createAnchorElement(linkConfig);
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);
            expect(propagationStopped).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * Quando o interceptador está desativado, links normais
     * também devem navegar normalmente (comportamento padrão).
     */
    it('deve permitir navegação quando interceptador está desativado', () => {
      fc.assert(
        fc.property(
          normalLinkConfigArbitrary,
          (linkConfig) => {
            // Cria link
            const anchor = createAnchorElement(linkConfig);
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // NÃO ativa o interceptador

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);
            expect(propagationStopped).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * Após ativar e desativar o interceptador, links normais
     * devem continuar navegando normalmente.
     */
    it('deve permitir navegação após desativar interceptador', () => {
      fc.assert(
        fc.property(
          normalLinkConfigArbitrary,
          (linkConfig) => {
            // Cria link
            const anchor = createAnchorElement(linkConfig);
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa e depois desativa o interceptador
            interceptor.activate();
            interceptor.deactivate();

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);
            expect(propagationStopped).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * Links normais em elementos aninhados (ex: span dentro de <a>)
     * também devem permitir navegação.
     */
    it('deve permitir navegação para cliques em elementos aninhados dentro de links', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Cria link com elemento aninhado
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.setAttribute('data-test', 'true');

            const span = document.createElement('span');
            span.textContent = text;
            anchor.appendChild(span);

            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique no span (elemento aninhado)
            const event = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
            });

            let defaultPrevented = false;
            const originalPreventDefault = event.preventDefault.bind(event);
            event.preventDefault = () => {
              defaultPrevented = true;
              originalPreventDefault();
            };

            span.dispatchEvent(event);

            // Limpa
            anchor.remove();

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * Múltiplos cliques consecutivos em links normais devem
     * todos permitir navegação.
     */
    it('deve permitir navegação para múltiplos cliques consecutivos', () => {
      fc.assert(
        fc.property(
          fc.array(normalLinkConfigArbitrary, { minLength: 2, maxLength: 5 }),
          (linkConfigs) => {
            // Ativa o interceptador
            interceptor.activate();

            // Testa cada link
            for (const linkConfig of linkConfigs) {
              const anchor = createAnchorElement(linkConfig);
              anchor.setAttribute('data-test', 'true');
              document.body.appendChild(anchor);

              const { defaultPrevented, propagationStopped } = simulateClick(anchor);

              anchor.remove();

              // Verifica que a navegação NÃO foi prevenida
              expect(defaultPrevented).toBe(false);
              expect(propagationStopped).toBe(false);
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * Links com URLs especiais (javascript:, #) devem ser ignorados
     * pelo interceptador (não são navegações reais).
     */
    it('deve ignorar links com URLs especiais (javascript:, #)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('javascript:void(0)', 'javascript:alert(1)', '#', '#section'),
          linkTextArbitrary,
          (href, text) => {
            // Cria link com URL especial
            const anchor = createAnchorElement({
              href,
              target: undefined,
              text,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Links especiais não devem ser interceptados
            expect(defaultPrevented).toBe(false);
            expect(propagationStopped).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 13: Blank Target Conversion
  // Feature: video-capture-redesign
  // Validates: Requirements 4.2
  // ==========================================================================

  describe('Property 13: Blank Target Conversion', () => {
    /**
     * **Validates: Requirements 4.2**
     *
     * Para qualquer clique em um link com target="_blank" enquanto o
     * Navigation Interceptor está ativo, a navegação DEVE ser convertida
     * para navegação na mesma aba (evento É prevenido e navegação ocorre via window.location).
     */
    it('deve converter target="_blank" para navegação na mesma aba', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Cria link com target="_blank"
            const anchor = createAnchorElement({
              href: url,
              target: '_blank',
              text,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação FOI prevenida (para evitar nova aba)
            // e que stopPropagation foi chamado
            expect(defaultPrevented).toBe(true);
            expect(propagationStopped).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * Links com target="_blank" devem emitir evento de navegação
     * com os dados corretos antes de redirecionar.
     */
    it('deve emitir evento de navegação com dados corretos para target="_blank"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // Cria link com target="_blank"
            const anchor = createAnchorElement({
              href: url,
              target: '_blank',
              text,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa o interceptador
            testInterceptor.activate();

            // Simula clique
            simulateClick(anchor);

            // Limpa
            anchor.remove();
            testInterceptor.deactivate();

            // Verifica que evento de navegação foi emitido
            expect(navigationEvents.length).toBe(1);

            const navEvent = navigationEvents[0];
            expect(navEvent).toBeDefined();
            expect(navEvent!.type).toBe('link-click');
            expect(navEvent!.fromUrl).toBe(window.location.href);
            // URL de destino deve ser uma URL válida (pode ser normalizada pelo browser)
            expect(navEvent!.toUrl).toBeTruthy();
            expect(typeof navEvent!.toUrl).toBe('string');
            expect(navEvent!.timestamp).toBeGreaterThan(0);
            expect(typeof navEvent!.htmlContent).toBe('string');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * Múltiplos cliques em links com target="_blank" devem
     * todos ser convertidos para navegação na mesma aba.
     */
    it('deve converter múltiplos cliques em target="_blank" consecutivamente', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              href: urlArbitrary,
              target: fc.constant('_blank' as const),
              text: linkTextArbitrary,
            }),
            { minLength: 2, maxLength: 5 }
          ),
          (linkConfigs) => {
            // Ativa o interceptador
            interceptor.activate();

            // Testa cada link
            for (const linkConfig of linkConfigs) {
              const anchor = createAnchorElement({
                href: linkConfig.href,
                target: linkConfig.target,
                text: linkConfig.text,
              });
              anchor.setAttribute('data-test', 'true');
              document.body.appendChild(anchor);

              const { defaultPrevented, propagationStopped } = simulateClick(anchor);

              anchor.remove();

              // Verifica que a navegação FOI prevenida
              expect(defaultPrevented).toBe(true);
              expect(propagationStopped).toBe(true);
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * Links com target="_blank" em elementos aninhados (ex: span dentro de <a>)
     * também devem ser convertidos para navegação na mesma aba.
     */
    it('deve converter target="_blank" para cliques em elementos aninhados', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Cria link com target="_blank" e elemento aninhado
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.setAttribute('target', '_blank');
            anchor.setAttribute('data-test', 'true');

            const span = document.createElement('span');
            span.textContent = text;
            anchor.appendChild(span);

            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique no span (elemento aninhado)
            const event = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
            });

            let defaultPrevented = false;
            const originalPreventDefault = event.preventDefault.bind(event);
            event.preventDefault = () => {
              defaultPrevented = true;
              originalPreventDefault();
            };

            let propagationStopped = false;
            const originalStopPropagation = event.stopPropagation.bind(event);
            event.stopPropagation = () => {
              propagationStopped = true;
              originalStopPropagation();
            };

            span.dispatchEvent(event);

            // Limpa
            anchor.remove();

            // Verifica que a navegação FOI prevenida
            expect(defaultPrevented).toBe(true);
            expect(propagationStopped).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * Quando o interceptador está desativado, links com target="_blank"
     * devem abrir em nova aba normalmente (comportamento padrão).
     */
    it('deve permitir target="_blank" quando interceptador está desativado', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Cria link com target="_blank"
            const anchor = createAnchorElement({
              href: url,
              target: '_blank',
              text,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // NÃO ativa o interceptador

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação NÃO foi prevenida (comportamento padrão)
            expect(defaultPrevented).toBe(false);
            expect(propagationStopped).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * Após desativar o interceptador, links com target="_blank"
     * devem voltar ao comportamento padrão (abrir nova aba).
     */
    it('deve permitir target="_blank" após desativar interceptador', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Cria link com target="_blank"
            const anchor = createAnchorElement({
              href: url,
              target: '_blank',
              text,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa e depois desativa o interceptador
            interceptor.activate();
            interceptor.deactivate();

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);
            expect(propagationStopped).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * Links com outros targets (_parent, _top) também devem ser
     * convertidos para navegação na mesma aba.
     */
    it('deve converter outros targets (_parent, _top) para navegação na mesma aba', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          fc.constantFrom('_parent', '_top'),
          (url, text, target) => {
            // Cria link com target especial
            const anchor = createAnchorElement({
              href: url,
              target,
              text,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique
            const { defaultPrevented, propagationStopped } = simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que a navegação FOI prevenida
            expect(defaultPrevented).toBe(true);
            expect(propagationStopped).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 14: Window.open Blocking
  // Feature: video-capture-redesign
  // Validates: Requirements 4.3
  // ==========================================================================

  describe('Property 14: Window.open Blocking', () => {
    /**
     * **Validates: Requirements 4.3**
     *
     * Para qualquer chamada a window.open() enquanto o Navigation Interceptor
     * está ativo, a chamada DEVE ser bloqueada e retornar null.
     */
    it('deve bloquear window.open() e retornar null para qualquer URL', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          (url) => {
            // Ativa o interceptador
            interceptor.activate();

            // Chama window.open com URL aleatória
            const result = window.open(url);

            // Verifica que retornou null (bloqueado)
            expect(result).toBeNull();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Para qualquer chamada a window.open() enquanto o Navigation Interceptor
     * está ativo, uma mensagem de notificação DEVE ser enviada ao Service Worker.
     */
    it('deve enviar notificação ao Service Worker quando window.open() é bloqueado', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          (url) => {
            // Limpa mocks anteriores
            mockSendMessage.mockClear();

            // Cria interceptador com envio para Service Worker habilitado
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
              },
              sendToServiceWorker: true,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Chama window.open com URL aleatória
            window.open(url);

            // Verifica que sendMessage foi chamado
            expect(mockSendMessage).toHaveBeenCalled();

            // Verifica o conteúdo da mensagem
            const lastCall = mockSendMessage.mock.calls[mockSendMessage.mock.calls.length - 1];
            expect(lastCall).toBeDefined();

            // TypeScript não infere que lastCall não é undefined após expect
            if (!lastCall) {
              throw new Error('lastCall deveria estar definido');
            }

            const message = lastCall[0];
            expect(message.type).toBe('WINDOW_OPEN_BLOCKED');
            expect(message.payload).toBeDefined();
            expect(typeof message.payload.url).toBe('string');
            expect(message.payload.timestamp).toBeGreaterThan(0);
            expect(message.payload.pageUrl).toBe(window.location.href);

            // Limpa
            testInterceptor.deactivate();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Para qualquer chamada a window.open() com diferentes parâmetros
     * (target, features), a chamada DEVE ser bloqueada.
     */
    it('deve bloquear window.open() independente dos parâmetros target e features', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          fc.constantFrom('_blank', '_self', '_parent', '_top', 'customWindow', undefined),
          fc.constantFrom(
            'width=800,height=600',
            'menubar=yes,toolbar=yes',
            'resizable=yes,scrollbars=yes',
            '',
            undefined
          ),
          (url, target, features) => {
            // Ativa o interceptador
            interceptor.activate();

            // Chama window.open com diferentes combinações de parâmetros
            const result = window.open(url, target, features);

            // Verifica que retornou null (bloqueado)
            expect(result).toBeNull();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * O callback onWindowOpenBlocked DEVE ser chamado quando window.open() é bloqueado.
     */
    it('deve chamar callback onWindowOpenBlocked quando window.open() é bloqueado', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          (url) => {
            // Rastreia chamadas ao callback
            const blockedUrls: string[] = [];

            // Cria interceptador com callback
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onWindowOpenBlocked: (blockedUrl) => blockedUrls.push(blockedUrl),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Chama window.open
            window.open(url);

            // Verifica que callback foi chamado
            expect(blockedUrls.length).toBe(1);
            expect(typeof blockedUrls[0]).toBe('string');

            // Limpa
            testInterceptor.deactivate();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Múltiplas chamadas consecutivas a window.open() DEVEM todas ser bloqueadas.
     */
    it('deve bloquear múltiplas chamadas consecutivas a window.open()', () => {
      fc.assert(
        fc.property(
          fc.array(urlArbitrary, { minLength: 2, maxLength: 10 }),
          (urls) => {
            // Rastreia chamadas ao callback
            const blockedUrls: string[] = [];

            // Cria interceptador com callback
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onWindowOpenBlocked: (blockedUrl) => blockedUrls.push(blockedUrl),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Chama window.open múltiplas vezes
            for (const url of urls) {
              const result = window.open(url);
              expect(result).toBeNull();
            }

            // Verifica que todas as chamadas foram bloqueadas
            expect(blockedUrls.length).toBe(urls.length);

            // Limpa
            testInterceptor.deactivate();

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Quando o interceptador está desativado, window.open() DEVE funcionar normalmente.
     * Nota: Em ambiente de teste (jsdom), window.open retorna null por padrão,
     * mas verificamos que o callback NÃO é chamado.
     */
    it('deve permitir window.open() quando interceptador está desativado', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          (url) => {
            // Rastreia chamadas ao callback
            const blockedUrls: string[] = [];

            // Cria interceptador com callback (não ativado intencionalmente para testar comportamento inativo)
            // @ts-expect-error Interceptador criado mas não ativado intencionalmente
            const _testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onWindowOpenBlocked: (blockedUrl) => blockedUrls.push(blockedUrl),
              },
              sendToServiceWorker: false,
            });

            // NÃO ativa o interceptador

            // Chama window.open
            window.open(url);

            // Verifica que callback NÃO foi chamado (não foi bloqueado pelo interceptador)
            expect(blockedUrls.length).toBe(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Após desativar o interceptador, window.open() DEVE voltar ao comportamento normal.
     */
    it('deve restaurar window.open() após desativar interceptador', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          (url) => {
            // Rastreia chamadas ao callback
            const blockedUrls: string[] = [];

            // Cria interceptador com callback
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onWindowOpenBlocked: (blockedUrl) => blockedUrls.push(blockedUrl),
              },
              sendToServiceWorker: false,
            });

            // Ativa e depois desativa o interceptador
            testInterceptor.activate();
            testInterceptor.deactivate();

            // Limpa contagem de bloqueios durante ativação
            blockedUrls.length = 0;

            // Chama window.open após desativação
            window.open(url);

            // Verifica que callback NÃO foi chamado (window.open restaurado)
            expect(blockedUrls.length).toBe(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * window.open() com URL vazia ou undefined também DEVE ser bloqueado.
     */
    it('deve bloquear window.open() com URL vazia ou undefined', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', undefined as unknown as string),
          (url) => {
            // Rastreia chamadas ao callback
            const blockedUrls: string[] = [];

            // Cria interceptador com callback
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onWindowOpenBlocked: (blockedUrl) => blockedUrls.push(blockedUrl),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Chama window.open com URL vazia/undefined
            const result = window.open(url);

            // Verifica que retornou null (bloqueado)
            expect(result).toBeNull();

            // Verifica que callback foi chamado
            expect(blockedUrls.length).toBe(1);

            // Limpa
            testInterceptor.deactivate();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * A URL bloqueada deve ser resolvida para URL absoluta na notificação.
     */
    it('deve resolver URLs relativas para absolutas na notificação de bloqueio', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^\/[a-z0-9\-_]{1,30}$/).map((path) => path || '/page'),
          (relativeUrl) => {
            // Rastreia chamadas ao callback
            const blockedUrls: string[] = [];

            // Cria interceptador com callback
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onWindowOpenBlocked: (blockedUrl) => blockedUrls.push(blockedUrl),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Chama window.open com URL relativa
            window.open(relativeUrl);

            // Verifica que callback foi chamado com URL absoluta
            expect(blockedUrls.length).toBe(1);
            const blockedUrl = blockedUrls[0];

            // URL deve ser absoluta (começar com http:// ou https://)
            expect(blockedUrl).toMatch(/^https?:\/\//);

            // Limpa
            testInterceptor.deactivate();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Quando blockWindowOpen está desabilitado na configuração,
     * window.open() NÃO deve ser bloqueado.
     */
    it('deve permitir window.open() quando blockWindowOpen está desabilitado', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          (url) => {
            // Rastreia chamadas ao callback
            const blockedUrls: string[] = [];

            // Cria interceptador com blockWindowOpen desabilitado
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: false, // Desabilitado
                allowHistoryNavigation: true,
                onWindowOpenBlocked: (blockedUrl) => blockedUrls.push(blockedUrl),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Chama window.open
            window.open(url);

            // Verifica que callback NÃO foi chamado (não está bloqueando)
            expect(blockedUrls.length).toBe(0);

            // Limpa
            testInterceptor.deactivate();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 15: History Navigation Allowed
  // Feature: video-capture-redesign
  // Validates: Requirements 4.4
  // ==========================================================================

  describe('Property 15: History Navigation Allowed', () => {
    /**
     * **Validates: Requirements 4.4**
     *
     * Para qualquer navegação back/forward do histórico enquanto o
     * Navigation Interceptor está ativo, a navegação DEVE ser permitida.
     */
    it('deve permitir navegação back/forward do histórico', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // true = simula back, false = simula forward
          (isBack) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Simula evento popstate (navegação do histórico)
            const popstateEvent = new PopStateEvent('popstate', {
              state: { page: isBack ? 'previous' : 'next' },
            });

            // Rastreia se preventDefault foi chamado
            let defaultPrevented = false;
            const originalPreventDefault = popstateEvent.preventDefault.bind(popstateEvent);
            Object.defineProperty(popstateEvent, 'preventDefault', {
              value: () => {
                defaultPrevented = true;
                originalPreventDefault();
              },
              writable: true,
            });

            // Dispara o evento
            window.dispatchEvent(popstateEvent);

            // Limpa
            testInterceptor.deactivate();

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);

            // Verifica que evento de navegação foi emitido com tipo correto
            expect(navigationEvents.length).toBe(1);
            const navEvent = navigationEvents[0];
            expect(navEvent).toBeDefined();
            expect(['history-back', 'history-forward']).toContain(navEvent!.type);
            expect(navEvent!.timestamp).toBeGreaterThan(0);
            expect(navEvent!.toUrl).toBe(window.location.href);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Múltiplas navegações back/forward consecutivas devem todas ser permitidas.
     */
    it('deve permitir múltiplas navegações back/forward consecutivas', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 2, maxLength: 10 }),
          (navigations) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Simula múltiplas navegações do histórico
            for (const isBack of navigations) {
              const popstateEvent = new PopStateEvent('popstate', {
                state: { page: isBack ? 'previous' : 'next' },
              });

              // Rastreia se preventDefault foi chamado
              let defaultPrevented = false;
              const originalPreventDefault = popstateEvent.preventDefault.bind(popstateEvent);
              Object.defineProperty(popstateEvent, 'preventDefault', {
                value: () => {
                  defaultPrevented = true;
                  originalPreventDefault();
                },
                writable: true,
              });

              window.dispatchEvent(popstateEvent);

              // Verifica que a navegação NÃO foi prevenida
              expect(defaultPrevented).toBe(false);
            }

            // Limpa
            testInterceptor.deactivate();

            // Verifica que todos os eventos de navegação foram emitidos
            expect(navigationEvents.length).toBe(navigations.length);

            // Verifica que todos os eventos têm tipo de histórico
            for (const navEvent of navigationEvents) {
              expect(['history-back', 'history-forward']).toContain(navEvent.type);
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Navegação do histórico deve emitir evento com dados corretos.
     */
    it('deve emitir evento de navegação com dados corretos para histórico', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.record({
            page: fc.string({ minLength: 1, maxLength: 20 }),
            index: fc.integer({ min: 0, max: 100 }),
          }),
          (_isBack, stateData) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Simula evento popstate com state customizado
            const popstateEvent = new PopStateEvent('popstate', {
              state: stateData,
            });

            window.dispatchEvent(popstateEvent);

            // Limpa
            testInterceptor.deactivate();

            // Verifica que evento foi emitido
            expect(navigationEvents.length).toBe(1);

            const navEvent = navigationEvents[0];
            expect(navEvent).toBeDefined();

            // Verifica estrutura do evento
            expect(navEvent!.toUrl).toBe(window.location.href);
            expect(navEvent!.timestamp).toBeGreaterThan(0);
            expect(typeof navEvent!.htmlContent).toBe('string');
            expect(['history-back', 'history-forward']).toContain(navEvent!.type);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Quando o interceptador está desativado, navegação do histórico
     * deve funcionar normalmente (comportamento padrão do browser).
     */
    it('deve permitir navegação do histórico quando interceptador está desativado', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isBack) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback (não ativado intencionalmente para testar comportamento inativo)
            // @ts-expect-error Interceptador criado mas não ativado intencionalmente
            const _testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // NÃO ativa o interceptador

            // Simula evento popstate
            const popstateEvent = new PopStateEvent('popstate', {
              state: { page: isBack ? 'previous' : 'next' },
            });

            // Rastreia se preventDefault foi chamado
            let defaultPrevented = false;
            const originalPreventDefault = popstateEvent.preventDefault.bind(popstateEvent);
            Object.defineProperty(popstateEvent, 'preventDefault', {
              value: () => {
                defaultPrevented = true;
                originalPreventDefault();
              },
              writable: true,
            });

            window.dispatchEvent(popstateEvent);

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);

            // Verifica que nenhum evento foi capturado (interceptador inativo)
            expect(navigationEvents.length).toBe(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Após desativar o interceptador, navegação do histórico
     * deve voltar ao comportamento padrão.
     */
    it('deve permitir navegação do histórico após desativar interceptador', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isBack) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // Ativa e depois desativa o interceptador
            testInterceptor.activate();
            testInterceptor.deactivate();

            // Limpa eventos capturados durante ativação
            navigationEvents.length = 0;

            // Simula evento popstate após desativação
            const popstateEvent = new PopStateEvent('popstate', {
              state: { page: isBack ? 'previous' : 'next' },
            });

            // Rastreia se preventDefault foi chamado
            let defaultPrevented = false;
            const originalPreventDefault = popstateEvent.preventDefault.bind(popstateEvent);
            Object.defineProperty(popstateEvent, 'preventDefault', {
              value: () => {
                defaultPrevented = true;
                originalPreventDefault();
              },
              writable: true,
            });

            window.dispatchEvent(popstateEvent);

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);

            // Verifica que nenhum evento foi capturado (interceptador inativo)
            expect(navigationEvents.length).toBe(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Navegação do histórico deve capturar HTML da página atual.
     */
    it('deve capturar HTML da página ao navegar pelo histórico', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isBack) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Simula evento popstate
            const popstateEvent = new PopStateEvent('popstate', {
              state: { page: isBack ? 'previous' : 'next' },
            });

            window.dispatchEvent(popstateEvent);

            // Limpa
            testInterceptor.deactivate();

            // Verifica que evento foi emitido com HTML
            expect(navigationEvents.length).toBe(1);

            const navEvent = navigationEvents[0];
            expect(navEvent).toBeDefined();
            expect(typeof navEvent!.htmlContent).toBe('string');
            // HTML deve conter pelo menos a tag html
            expect(navEvent!.htmlContent.length).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Quando allowHistoryNavigation está desabilitado na configuração,
     * eventos de histórico não devem emitir eventos de navegação.
     */
    it('deve ignorar navegação do histórico quando allowHistoryNavigation está desabilitado', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isBack) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com allowHistoryNavigation desabilitado
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: false, // Desabilitado
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Simula evento popstate
            const popstateEvent = new PopStateEvent('popstate', {
              state: { page: isBack ? 'previous' : 'next' },
            });

            window.dispatchEvent(popstateEvent);

            // Limpa
            testInterceptor.deactivate();

            // Verifica que nenhum evento foi emitido (configuração desabilitada)
            expect(navigationEvents.length).toBe(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Navegação do histórico com state null deve ser tratada corretamente.
     */
    it('deve tratar navegação do histórico com state null', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback
            const testInterceptor = new NavigationInterceptor({
              config: {
                allowNormalNavigation: true,
                interceptBlankTarget: true,
                blockWindowOpen: true,
                allowHistoryNavigation: true,
                onNavigate: (event) => navigationEvents.push(event),
              },
              sendToServiceWorker: false,
            });

            // Ativa o interceptador
            testInterceptor.activate();

            // Simula evento popstate com state null
            const popstateEvent = new PopStateEvent('popstate', {
              state: null,
            });

            // Rastreia se preventDefault foi chamado
            let defaultPrevented = false;
            const originalPreventDefault = popstateEvent.preventDefault.bind(popstateEvent);
            Object.defineProperty(popstateEvent, 'preventDefault', {
              value: () => {
                defaultPrevented = true;
                originalPreventDefault();
              },
              writable: true,
            });

            window.dispatchEvent(popstateEvent);

            // Limpa
            testInterceptor.deactivate();

            // Verifica que a navegação NÃO foi prevenida
            expect(defaultPrevented).toBe(false);

            // Verifica que evento foi emitido
            expect(navigationEvents.length).toBe(1);
            expect(['history-back', 'history-forward']).toContain(navigationEvents[0]!.type);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Testes de Comportamento Complementares
  // ==========================================================================

  describe('Comportamento do Interceptador', () => {
    /**
     * Verifica que activate() pode ser chamado múltiplas vezes sem efeito.
     */
    it('deve ignorar chamadas duplicadas de activate()', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          normalLinkConfigArbitrary,
          (numActivates, linkConfig) => {
            // Chama activate múltiplas vezes
            for (let i = 0; i < numActivates; i++) {
              interceptor.activate();
            }

            expect(interceptor.isActive()).toBe(true);

            // Cria e testa link
            const anchor = createAnchorElement(linkConfig);
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            const { defaultPrevented } = simulateClick(anchor);

            anchor.remove();

            // Deve funcionar normalmente (sem listeners duplicados)
            expect(defaultPrevented).toBe(false);

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Verifica que deactivate() pode ser chamado múltiplas vezes sem erro.
     */
    it('deve ignorar chamadas duplicadas de deactivate()', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          (numDeactivates) => {
            interceptor.activate();

            // Chama deactivate múltiplas vezes
            for (let i = 0; i < numDeactivates; i++) {
              interceptor.deactivate();
            }

            expect(interceptor.isActive()).toBe(false);

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Verifica que getConfig() retorna cópia, não referência.
     */
    it('deve retornar cópia da configuração, não referência', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const config1 = interceptor.getConfig();
          const config2 = interceptor.getConfig();

          // Devem ser objetos diferentes
          expect(config1).not.toBe(config2);

          // Mas com mesmos valores
          expect(config1).toEqual(config2);

          // Modificar um não deve afetar o outro
          config1.allowNormalNavigation = false;
          expect(config2.allowNormalNavigation).toBe(true);

          return true;
        }),
        { numRuns: 50 }
      );
    });
  });
});
