/**
 * Property Test: Geolocation Preference Controls Capture Flow
 *
 * **Property 6: Geolocation Preference Controls Capture Flow**
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 *
 * Para qualquer preferência de geolocalização salva, o fluxo de captura
 * DEVE se comportar de acordo:
 * - 'always-allow' → solicitar geolocalização do navegador sem mostrar prompt
 * - 'always-deny' → pular geolocalização do navegador sem mostrar prompt
 * - 'ask-every-time' ou undefined → mostrar PreCaptureScreen
 *
 * @module PropertyTest/useGeolocationConsent
 */

import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ============================================================================
// Tipos
// ============================================================================

import type { GeolocationChoice } from '../../../../src/store/geolocation-preferences';

// ============================================================================
// Mocks
// ============================================================================

// Mock do chrome.runtime.sendMessage
const mockSendMessage = vi.fn();

// Mock do store de preferências
const mockChoice = { current: 'ask-every-time' as GeolocationChoice };
const mockSetChoice = vi.fn();
const mockIsHydrated = { current: true };

vi.mock('../../../../src/store/geolocation-preferences', () => ({
  useGeolocationPreferences: () => ({
    choice: mockChoice.current,
    setChoice: mockSetChoice,
    isHydrated: mockIsHydrated.current,
  }),
}));

// Mock do store de consentimento
const mockSetConfig = vi.fn();
const mockConsentConfig = {
  collectBrowserGeolocation: true,
  collectNetworkInfo: true,
  collectDeviceInfo: true,
  collectScreenInfo: true,
};

vi.mock('../../../../src/store/consent-store', () => ({
  useConsentStore: () => ({
    setConfig: mockSetConfig,
    config: mockConsentConfig,
  }),
}));

// Setup do chrome global
beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: mockSendMessage,
    },
  };
});

// ============================================================================
// Arbitraries
// ============================================================================

/**
 * Arbitrary para GeolocationChoice
 */
const geolocationChoiceArb = fc.constantFrom<GeolocationChoice>(
  'always-allow',
  'always-deny',
  'ask-every-time'
);

/**
 * Arbitrary para resultado de geolocalização (sucesso ou falha)
 */
const geolocationResultArb = fc.boolean();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Configura o mock de preferência
 */
function setMockPreference(choice: GeolocationChoice): void {
  mockChoice.current = choice;
}

/**
 * Configura o mock de resposta de geolocalização
 */
function setMockGeolocationResponse(success: boolean): void {
  mockSendMessage.mockResolvedValue({
    success,
    data: success
      ? {
          latitude: -23.5505,
          longitude: -46.6333,
          accuracy: 10,
        }
      : undefined,
    error: success ? undefined : 'Geolocalização não disponível',
  });
}

/**
 * Verifica se o prompt deve ser mostrado baseado na preferência
 */
function shouldShowPromptForChoice(choice: GeolocationChoice): boolean {
  return choice === 'ask-every-time';
}

// ============================================================================
// Testes
// ============================================================================

describe('Property 6: Geolocation Preference Controls Capture Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChoice.current = 'ask-every-time';
    mockIsHydrated.current = true;
    mockSendMessage.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property test: Para qualquer preferência, o fluxo deve se comportar de acordo
   *
   * Requirement 6.1: Verificar preferência salva antes de iniciar captura
   * Requirement 6.2: Se 'always-allow', solicitar geolocalização e prosseguir
   * Requirement 6.3: Se 'always-deny', prosseguir apenas com CloudFront
   * Requirement 6.4: Se 'ask-every-time', mostrar PreCaptureScreen
   */
  it('should behave according to saved preference for any preference value', async () => {
    // Importar hook dinamicamente para aplicar mocks
    const { useGeolocationConsent } = await import(
      '../../../../src/popup/hooks/useGeolocationConsent'
    );

    await fc.assert(
      fc.asyncProperty(
        geolocationChoiceArb,
        geolocationResultArb,
        async (choice, geoSuccess) => {
          // Configurar mocks
          setMockPreference(choice);
          setMockGeolocationResponse(geoSuccess);
          vi.clearAllMocks();

          // Renderizar hook
          const { result } = renderHook(() => useGeolocationConsent());

          // Executar checkConsent
          await act(async () => {
            await result.current.checkConsent();
          });

          // Aguardar estabilização do estado
          await waitFor(() => {
            const state = result.current.flowState;
            return state !== 'checking' && state !== 'requesting-geolocation';
          }, { timeout: 2000 });

          // Verificar comportamento baseado na preferência
          const expectedShowPrompt = shouldShowPromptForChoice(choice);
          const actualShowPrompt = result.current.shouldShowPreCapture;

          // Property: shouldShowPreCapture deve corresponder à preferência
          if (actualShowPrompt !== expectedShowPrompt) {
            return false;
          }

          // Property: Para 'always-allow', deve ter chamado sendMessage
          if (choice === 'always-allow') {
            if (mockSendMessage.mock.calls.length === 0) {
              return false;
            }
          }

          // Property: Para 'always-deny', não deve ter chamado sendMessage
          if (choice === 'always-deny') {
            if (mockSendMessage.mock.calls.length > 0) {
              return false;
            }
          }

          // Property: Para 'ask-every-time', não deve ter chamado sendMessage ainda
          if (choice === 'ask-every-time') {
            if (mockSendMessage.mock.calls.length > 0) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property test: 'always-allow' sempre solicita geolocalização sem prompt
   *
   * Requirement 6.2: Se 'always-allow', solicitar geolocalização e prosseguir
   */
  it('should request geolocation without prompt for always-allow preference', async () => {
    const { useGeolocationConsent } = await import(
      '../../../../src/popup/hooks/useGeolocationConsent'
    );

    await fc.assert(
      fc.asyncProperty(geolocationResultArb, async (geoSuccess) => {
        // Configurar mocks
        setMockPreference('always-allow');
        setMockGeolocationResponse(geoSuccess);
        vi.clearAllMocks();

        // Renderizar hook
        const { result } = renderHook(() => useGeolocationConsent());

        // Executar checkConsent
        await act(async () => {
          await result.current.checkConsent();
        });

        // Aguardar estabilização
        await waitFor(() => {
          const state = result.current.flowState;
          return state !== 'checking' && state !== 'requesting-geolocation';
        }, { timeout: 2000 });

        // Verificações
        // 1. Não deve mostrar prompt
        if (result.current.shouldShowPreCapture) {
          return false;
        }

        // 2. Deve ter chamado sendMessage para solicitar geolocalização
        if (mockSendMessage.mock.calls.length === 0) {
          return false;
        }

        // 3. Estado final deve ser ready-with ou ready-without baseado no sucesso
        const expectedState = geoSuccess
          ? 'ready-with-geolocation'
          : 'ready-without-geolocation';
        if (result.current.flowState !== expectedState) {
          return false;
        }

        // 4. isGeolocationEnabled deve corresponder ao sucesso
        if (result.current.isGeolocationEnabled !== geoSuccess) {
          return false;
        }

        return true;
      }),
      { numRuns: 30 }
    );
  });

  /**
   * Property test: 'always-deny' sempre pula geolocalização sem prompt
   *
   * Requirement 6.3: Se 'always-deny', prosseguir apenas com CloudFront
   */
  it('should skip geolocation without prompt for always-deny preference', async () => {
    const { useGeolocationConsent } = await import(
      '../../../../src/popup/hooks/useGeolocationConsent'
    );

    // Não precisa de arbitrary - comportamento é determinístico
    setMockPreference('always-deny');
    vi.clearAllMocks();

    // Renderizar hook
    const { result } = renderHook(() => useGeolocationConsent());

    // Executar checkConsent
    await act(async () => {
      await result.current.checkConsent();
    });

    // Aguardar estabilização
    await waitFor(() => {
      return result.current.flowState !== 'checking';
    }, { timeout: 2000 });

    // Verificações
    // 1. Não deve mostrar prompt
    expect(result.current.shouldShowPreCapture).toBe(false);

    // 2. Não deve ter chamado sendMessage
    expect(mockSendMessage).not.toHaveBeenCalled();

    // 3. Estado final deve ser ready-without-geolocation
    expect(result.current.flowState).toBe('ready-without-geolocation');

    // 4. isGeolocationEnabled deve ser false
    expect(result.current.isGeolocationEnabled).toBe(false);
  });

  /**
   * Property test: 'ask-every-time' sempre mostra prompt
   *
   * Requirement 6.4: Se 'ask-every-time', mostrar PreCaptureScreen
   */
  it('should show prompt for ask-every-time preference', async () => {
    const { useGeolocationConsent } = await import(
      '../../../../src/popup/hooks/useGeolocationConsent'
    );

    // Não precisa de arbitrary - comportamento é determinístico
    setMockPreference('ask-every-time');
    vi.clearAllMocks();

    // Renderizar hook
    const { result } = renderHook(() => useGeolocationConsent());

    // Executar checkConsent
    await act(async () => {
      await result.current.checkConsent();
    });

    // Aguardar estabilização
    await waitFor(() => {
      return result.current.flowState !== 'checking';
    }, { timeout: 2000 });

    // Verificações
    // 1. Deve mostrar prompt
    expect(result.current.shouldShowPreCapture).toBe(true);

    // 2. Não deve ter chamado sendMessage ainda
    expect(mockSendMessage).not.toHaveBeenCalled();

    // 3. Estado deve ser show-prompt
    expect(result.current.flowState).toBe('show-prompt');
  });

  /**
   * Property test: handleAllow com remember=true salva preferência 'always-allow'
   *
   * Requirement 6.7: Salvar preferência 'always-allow' quando "Lembrar" marcado
   */
  it('should save always-allow preference when handleAllow called with remember=true', async () => {
    const { useGeolocationConsent } = await import(
      '../../../../src/popup/hooks/useGeolocationConsent'
    );

    await fc.assert(
      fc.asyncProperty(geolocationResultArb, async (geoSuccess) => {
        // Configurar mocks
        setMockPreference('ask-every-time');
        setMockGeolocationResponse(geoSuccess);
        vi.clearAllMocks();

        // Renderizar hook
        const { result } = renderHook(() => useGeolocationConsent());

        // Executar handleAllow com remember=true
        await act(async () => {
          await result.current.handleAllow(true);
        });

        // Aguardar estabilização
        await waitFor(() => {
          const state = result.current.flowState;
          return state !== 'checking' && state !== 'requesting-geolocation';
        }, { timeout: 2000 });

        // Verificar que setChoice foi chamado com 'always-allow'
        if (mockSetChoice.mock.calls.length === 0) {
          return false;
        }

        const lastCall = mockSetChoice.mock.calls[mockSetChoice.mock.calls.length - 1];
        if (lastCall?.[0] !== 'always-allow') {
          return false;
        }

        return true;
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: handleDeny com remember=true salva preferência 'always-deny'
   *
   * Requirement 6.8: Salvar preferência 'always-deny' quando "Lembrar" marcado
   */
  it('should save always-deny preference when handleDeny called with remember=true', async () => {
    const { useGeolocationConsent } = await import(
      '../../../../src/popup/hooks/useGeolocationConsent'
    );

    // Configurar mocks
    setMockPreference('ask-every-time');
    vi.clearAllMocks();

    // Renderizar hook
    const { result } = renderHook(() => useGeolocationConsent());

    // Executar handleDeny com remember=true
    act(() => {
      result.current.handleDeny(true);
    });

    // Verificar que setChoice foi chamado com 'always-deny'
    expect(mockSetChoice).toHaveBeenCalledWith('always-deny');

    // Verificar estado final
    expect(result.current.flowState).toBe('ready-without-geolocation');
    expect(result.current.isGeolocationEnabled).toBe(false);
  });

  /**
   * Property test: handleAllow/handleDeny com remember=false não salva preferência
   *
   * Requirement 6.9: Não salvar preferência quando "Lembrar" não marcado
   */
  it('should not save preference when remember=false', async () => {
    const { useGeolocationConsent } = await import(
      '../../../../src/popup/hooks/useGeolocationConsent'
    );

    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // allowOrDeny: true = allow, false = deny
        geolocationResultArb,
        async (allowOrDeny, geoSuccess) => {
          // Configurar mocks
          setMockPreference('ask-every-time');
          setMockGeolocationResponse(geoSuccess);
          vi.clearAllMocks();

          // Renderizar hook
          const { result } = renderHook(() => useGeolocationConsent());

          // Executar handleAllow ou handleDeny com remember=false
          if (allowOrDeny) {
            await act(async () => {
              await result.current.handleAllow(false);
            });
          } else {
            act(() => {
              result.current.handleDeny(false);
            });
          }

          // Aguardar estabilização
          await waitFor(() => {
            const state = result.current.flowState;
            return state !== 'checking' && state !== 'requesting-geolocation';
          }, { timeout: 2000 });

          // Verificar que setChoice NÃO foi chamado
          if (mockSetChoice.mock.calls.length > 0) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property test: resetFlow restaura estado inicial
   */
  it('should reset flow state correctly', async () => {
    const { useGeolocationConsent } = await import(
      '../../../../src/popup/hooks/useGeolocationConsent'
    );

    // Configurar mocks
    setMockPreference('always-allow');
    setMockGeolocationResponse(true);

    // Renderizar hook
    const { result } = renderHook(() => useGeolocationConsent());

    // Executar checkConsent para mudar estado
    await act(async () => {
      await result.current.checkConsent();
    });

    // Aguardar estabilização
    await waitFor(() => {
      return result.current.flowState !== 'checking';
    }, { timeout: 2000 });

    // Resetar fluxo
    act(() => {
      result.current.resetFlow();
    });

    // Verificar estado resetado
    expect(result.current.flowState).toBe('checking');
    expect(result.current.isGeolocationEnabled).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
