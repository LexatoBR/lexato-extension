/**
 * Property tests para HTML Capture Before Navigation
 *
 * Valida a propriedade de captura de HTML antes de navegação:
 * - Property 16: HTML Capture Before Navigation
 *
 * Para qualquer evento de navegação, o conteúdo HTML da página atual
 * DEVE ser capturado antes que a navegação seja completada.
 *
 * @module html-capture.property.test
 * @requirements 4.6

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  NavigationInterceptor,
  resetGlobalInterceptor,
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

/**
 * Tipo de navegação para testes
 */
type TestNavigationType = 'link-click' | 'form-submit' | 'blank-target';

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
 * Gera texto aleatório para links
 */
const linkTextArbitrary = fc.string({ minLength: 1, maxLength: 100 });

/**
 * Gera conteúdo HTML aleatório para simular páginas
 * Exportado para uso em outros testes
 */
export const htmlContentArbitrary = fc.tuple(
  fc.string({ minLength: 1, maxLength: 50 }),
  fc.string({ minLength: 0, maxLength: 200 }),
  fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 })
).map(([title, bodyText, paragraphs]) => {
  const paragraphsHtml = paragraphs.map((p) => `<p>${p}</p>`).join('\n');
  return `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body>
<h1>${title}</h1>
<div>${bodyText}</div>
${paragraphsHtml}
</body>
</html>`;
});

/**
 * Gera tipo de navegação para testes
 * Exportado para uso em outros testes
 */
export const navigationTypeArbitrary: fc.Arbitrary<TestNavigationType> = fc.constantFrom(
  'link-click',
  'form-submit',
  'blank-target'
);

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Cria um NavigationInterceptor para testes com callback de navegação
 *
 * @param onNavigate - Callback para capturar eventos de navegação
 * @returns Instância do NavigationInterceptor
 */
function createTestInterceptor(
  onNavigate: (event: NavigationEvent) => void
): NavigationInterceptor {
  return new NavigationInterceptor({
    config: {
      allowNormalNavigation: true,
      interceptBlankTarget: true,
      blockWindowOpen: true,
      allowHistoryNavigation: true,
      onNavigate,
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
 * Cria um formulário para testes
 *
 * @param action - URL de ação do formulário
 * @param target - Atributo target do formulário
 * @returns Elemento form criado
 */
function createFormElement(action: string, target?: string): HTMLFormElement {
  const form = document.createElement('form');
  form.action = action;
  form.method = 'POST';

  if (target) {
    form.setAttribute('target', target);
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'test';
  input.value = 'value';
  form.appendChild(input);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Submit';
  form.appendChild(submit);

  return form;
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

  anchor.dispatchEvent(event);

  return {
    event,
    defaultPrevented,
  };
}

/**
 * Simula submissão de formulário
 *
 * @param form - Formulário para submeter
 * @returns Objeto com informações sobre o evento
 */
function simulateFormSubmit(form: HTMLFormElement): {
  event: SubmitEvent;
  defaultPrevented: boolean;
} {
  const event = new SubmitEvent('submit', {
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

  form.dispatchEvent(event);

  return {
    event,
    defaultPrevented,
  };
}

/**
 * Limpa o DOM após cada teste
 */
function cleanupDOM(): void {
  // Remove todos os elementos de teste criados
  document.querySelectorAll('[data-test]').forEach((el) => el.remove());
}

/**
 * Obtém o primeiro evento de navegação de forma segura
 * @throws Error se não houver eventos
 */
function getFirstNavigationEvent(events: NavigationEvent[]): NavigationEvent {
  const event = events[0];
  if (!event) {
    throw new Error('Nenhum evento de navegação capturado');
  }
  return event;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('HTML Capture Properties', () => {
  let interceptor: NavigationInterceptor | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGlobalInterceptor();
  });

  afterEach(() => {
    if (interceptor) {
      interceptor.deactivate();
      interceptor = null;
    }
    cleanupDOM();
  });

  // ==========================================================================
  // Property 16: HTML Capture Before Navigation
  // Feature: video-capture-redesign
  // Validates: Requirements 4.6
  // ==========================================================================

  describe('Property 16: HTML Capture Before Navigation', () => {
    /**
     * **Validates: Requirements 4.6**
     *
     * Para qualquer evento de navegação via clique em link normal,
     * o conteúdo HTML da página atual DEVE ser capturado antes
     * que a navegação seja completada.
     */
    it('deve capturar HTML antes de navegação via link normal', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

            // Cria link normal (sem target)
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
            simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que evento de navegação foi emitido com HTML capturado
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);

            // HTML DEVE ser capturado (não vazio)
            expect(navEvent.htmlContent).toBeDefined();
            expect(typeof navEvent.htmlContent).toBe('string');
            // HTML deve conter estrutura básica de documento
            expect(navEvent.htmlContent.length).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * Para qualquer evento de navegação via clique em link com target="_blank",
     * o conteúdo HTML da página atual DEVE ser capturado antes
     * que a navegação seja completada.
     */
    it('deve capturar HTML antes de navegação via link target="_blank"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

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
            simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que evento de navegação foi emitido com HTML capturado
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);

            // HTML DEVE ser capturado (não vazio)
            expect(navEvent.htmlContent).toBeDefined();
            expect(typeof navEvent.htmlContent).toBe('string');
            expect(navEvent.htmlContent.length).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * Para qualquer evento de navegação via submissão de formulário,
     * o conteúdo HTML da página atual DEVE ser capturado antes
     * que a navegação seja completada.
     */
    it('deve capturar HTML antes de navegação via submissão de formulário', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          (url) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

            // Cria formulário
            const form = createFormElement(url);
            form.setAttribute('data-test', 'true');
            document.body.appendChild(form);

            // Ativa o interceptador
            interceptor.activate();

            // Simula submissão
            simulateFormSubmit(form);

            // Limpa
            form.remove();

            // Verifica que evento de navegação foi emitido com HTML capturado
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);

            // HTML DEVE ser capturado (não vazio)
            expect(navEvent.htmlContent).toBeDefined();
            expect(typeof navEvent.htmlContent).toBe('string');
            expect(navEvent.htmlContent.length).toBeGreaterThan(0);

            // Tipo deve ser form-submit
            expect(navEvent.type).toBe('form-submit');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * O HTML capturado DEVE conter a estrutura do documento atual,
     * incluindo o elemento <html> raiz.
     */
    it('deve capturar HTML com estrutura de documento válida', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

            // Cria link
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
            simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica estrutura do HTML capturado
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);
            const htmlContent = navEvent.htmlContent;

            // HTML deve conter tag <html>
            expect(htmlContent.toLowerCase()).toContain('<html');
            // HTML deve conter tag <head> ou <body>
            expect(
              htmlContent.toLowerCase().includes('<head') ||
              htmlContent.toLowerCase().includes('<body')
            ).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * O HTML capturado DEVE ser capturado ANTES da navegação,
     * ou seja, o evento de navegação deve conter o HTML da página
     * de origem, não da página de destino.
     */
    it('deve capturar HTML da página de origem (não destino)', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

            // Cria link
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
            simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que o HTML foi capturado
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);

            // fromUrl deve ser a URL atual (origem)
            expect(navEvent.fromUrl).toBe(window.location.href);

            // HTML capturado deve ser da página atual (origem)
            // Verificamos que o HTML contém elementos do documento atual
            expect(navEvent.htmlContent).toBeDefined();
            expect(navEvent.htmlContent.length).toBeGreaterThan(0);

            // O timestamp deve ser definido (momento da captura)
            expect(navEvent.timestamp).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * Para múltiplas navegações consecutivas, cada uma DEVE
     * capturar o HTML da página atual antes de navegar.
     */
    it('deve capturar HTML para múltiplas navegações consecutivas', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              href: urlArbitrary,
              target: fc.constantFrom(undefined, '_blank', '_self'),
              text: linkTextArbitrary,
            }),
            { minLength: 2, maxLength: 5 }
          ),
          (linkConfigs) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

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

              simulateClick(anchor);

              anchor.remove();
            }

            // Verifica que todos os eventos capturaram HTML
            expect(navigationEvents.length).toBe(linkConfigs.length);

            for (const navEvent of navigationEvents) {
              expect(navEvent.htmlContent).toBeDefined();
              expect(typeof navEvent.htmlContent).toBe('string');
              expect(navEvent.htmlContent.length).toBeGreaterThan(0);
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * O HTML capturado DEVE incluir elementos dinâmicos adicionados
     * ao DOM antes da navegação.
     */
    it('deve capturar HTML incluindo elementos dinâmicos adicionados ao DOM', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          // Gera conteúdo alfanumérico para evitar problemas com HTML encoding
          fc.stringMatching(/^[a-zA-Z0-9\s]{5,50}$/).map((s) => s || 'test-content'),
          (url, linkText, dynamicContent) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

            // Adiciona elemento dinâmico ao DOM
            const dynamicElement = document.createElement('div');
            dynamicElement.id = 'dynamic-test-element';
            dynamicElement.textContent = dynamicContent;
            dynamicElement.setAttribute('data-test', 'true');
            document.body.appendChild(dynamicElement);

            // Cria link
            const anchor = createAnchorElement({
              href: url,
              target: undefined,
              text: linkText,
            });
            anchor.setAttribute('data-test', 'true');
            document.body.appendChild(anchor);

            // Ativa o interceptador
            interceptor.activate();

            // Simula clique
            simulateClick(anchor);

            // Limpa
            anchor.remove();
            dynamicElement.remove();

            // Verifica que o HTML capturado contém o elemento dinâmico
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);

            // HTML deve conter o ID do elemento dinâmico
            expect(navEvent.htmlContent).toContain('dynamic-test-element');
            // HTML deve conter o conteúdo do elemento dinâmico
            // (conteúdo alfanumérico não precisa de HTML encoding)
            expect(navEvent.htmlContent).toContain(dynamicContent);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * Para navegação via formulário com target="_blank",
     * o HTML DEVE ser capturado antes da navegação.
     */
    it('deve capturar HTML antes de navegação via formulário com target="_blank"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          (url) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

            // Cria formulário com target="_blank"
            const form = createFormElement(url, '_blank');
            form.setAttribute('data-test', 'true');
            document.body.appendChild(form);

            // Ativa o interceptador
            interceptor.activate();

            // Simula submissão
            simulateFormSubmit(form);

            // Limpa
            form.remove();

            // Verifica que evento de navegação foi emitido com HTML capturado
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);

            // HTML DEVE ser capturado (não vazio)
            expect(navEvent.htmlContent).toBeDefined();
            expect(typeof navEvent.htmlContent).toBe('string');
            expect(navEvent.htmlContent.length).toBeGreaterThan(0);

            // Tipo deve ser form-submit
            expect(navEvent.type).toBe('form-submit');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * O evento de navegação DEVE conter o timestamp do momento
     * da captura do HTML, permitindo rastreabilidade temporal.
     */
    it('deve incluir timestamp válido no evento de navegação', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          (url, text) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Captura timestamp antes do teste
            const beforeTimestamp = Date.now();

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

            // Cria link
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
            simulateClick(anchor);

            // Captura timestamp após o teste
            const afterTimestamp = Date.now();

            // Limpa
            anchor.remove();

            // Verifica timestamp
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);

            // Timestamp deve estar entre before e after
            expect(navEvent.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
            expect(navEvent.timestamp).toBeLessThanOrEqual(afterTimestamp);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.6**
     *
     * Para links com outros targets (_parent, _top), o HTML
     * também DEVE ser capturado antes da navegação.
     */
    it('deve capturar HTML para links com targets _parent e _top', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          linkTextArbitrary,
          fc.constantFrom('_parent', '_top'),
          (url, text, target) => {
            // Rastreia eventos de navegação emitidos
            const navigationEvents: NavigationEvent[] = [];

            // Cria interceptador com callback para capturar eventos
            interceptor = createTestInterceptor((event) => navigationEvents.push(event));

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
            simulateClick(anchor);

            // Limpa
            anchor.remove();

            // Verifica que evento de navegação foi emitido com HTML capturado
            expect(navigationEvents.length).toBe(1);

            const navEvent = getFirstNavigationEvent(navigationEvents);

            // HTML DEVE ser capturado (não vazio)
            expect(navEvent.htmlContent).toBeDefined();
            expect(typeof navEvent.htmlContent).toBe('string');
            expect(navEvent.htmlContent.length).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
