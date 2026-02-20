/**
 * Wizard de configuração de MFA para primeiro login
 *
 * Fluxo em 3 etapas:
 * 1. Informações sobre segurança e início da configuração
 * 2. Exibição do QR Code e código secreto (TOTP)
 * 3. Verificação do código TOTP
 * 4. Tela de sucesso com dicas de segurança
 *
 * NOTA: Passkey/WebAuthn só pode ser registrado APÓS o primeiro login completo.
 * Conforme documentação AWS Cognito: "Each user can register up to 20 passkeys.
 * They can only register a passkey after they have signed in to your user pool
 * at least once." - StartWebAuthnRegistration requer AccessToken válido.
 *
 * Migrado de popup/components/MFASetupWizard.tsx para sidepanel
 * com layout responsivo (sem dimensões fixas do popup).
 *
 * @module MFASetupWizard
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';

/**
 * Etapas do wizard de configuração de MFA
 */
type MFASetupStep = 'info' | 'qrcode' | 'verify' | 'success';

/**
 * Props do componente MFASetupWizard
 */
interface MFASetupWizardProps {
  /** Session do challenge MFA_SETUP */
  session: string;
  /** Callback quando setup é concluído com sucesso */
  onSuccess: () => void;
  /** Callback para voltar ao login */
  onBack: () => void;
}

/**
 * Componente de wizard para configuração de MFA
 *
 * Funcionalidades:
 * - Informações sobre segurança e importância do MFA
 * - Exibição de QR Code para configuração do Authenticator
 * - Opção de inserir código manualmente
 * - Verificação do código TOTP
 * - Tela de sucesso com dicas de segurança
 * - Informação sobre Passkey (disponível após primeiro login)
 */
export default function MFASetupWizard({
  session,
  onSuccess,
  onBack,
}: MFASetupWizardProps): React.ReactElement {
  const { 
    setupMfa, 
    verifyMfaSetup, 
    error: authError, 
    clearError 
  } = useAuth();

  // Estado do wizard
  const [step, setStep] = useState<MFASetupStep>('info');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  
  // Dados do MFA setup (TOTP)
  const [secretCode, setSecretCode] = useState<string>('');
  const [qrCodeUri, setQrCodeUri] = useState<string>('');
  const [currentSession, setCurrentSession] = useState<string>(session);
  const [showSecret, setShowSecret] = useState(false);
  
  // Código de verificação - array de 6 dígitos
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Refs para os inputs OTP
  const otpInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Código completo para verificação
  const verifyCode = otpDigits.join('');

  // Erro a exibir
  const displayError = localError ?? authError;

  /**
   * Reseta o wizard quando recebe uma nova sessão
   * Isso garante que o QR code seja exibido corretamente após nova tentativa
   */
  useEffect(() => {
    if (session !== currentSession) {
      console.warn('[MFASetupWizard] Nova sessão detectada, resetando wizard');
      setCurrentSession(session);
      setStep('info');
      setSecretCode('');
      setQrCodeUri('');
      setOtpDigits(['', '', '', '', '', '']);
      setLocalError(null);
      setIsSessionExpired(false);
      clearError();
    }
  }, [session, currentSession, clearError]);

  /**
   * Verifica se o erro indica session expirada
   */
  const checkSessionExpired = useCallback((error: string): boolean => {
    const expiredPatterns = [
      'sessão expirada',
      'session expired',
      'faça login novamente',
      'login novamente',
    ];
    return expiredPatterns.some(pattern => 
      error.toLowerCase().includes(pattern.toLowerCase())
    );
  }, []);

  /**
   * Inicia configuração de MFA com Authenticator App
   */
  const handleStartSetup = useCallback(async () => {
    setLocalError(null);
    setIsSessionExpired(false);
    setIsLoading(true);

    try {
      const result = await setupMfa(currentSession);

      if (result.success && result.secretCode && result.qrCodeUri) {
        setSecretCode(result.secretCode);
        setQrCodeUri(result.qrCodeUri);
        if (result.session) {
          setCurrentSession(result.session);
        }
        setStep('qrcode');
      } else {
        const errorMsg = result.error ?? 'Falha ao configurar MFA';
        setLocalError(errorMsg);
        if (checkSessionExpired(errorMsg)) {
          setIsSessionExpired(true);
        }
      }
    } catch {
      setLocalError('Erro ao conectar com o servidor');
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, setupMfa, checkSessionExpired]);

  /**
   * Verifica código TOTP e completa setup
   */
  const handleVerifyCode = useCallback(async () => {
    if (!verifyCode.trim() || verifyCode.length !== 6) {
      setLocalError('Digite o código de 6 dígitos');
      return;
    }

    setLocalError(null);
    setIsSessionExpired(false);
    setIsLoading(true);

    try {
      const result = await verifyMfaSetup(verifyCode.trim(), currentSession);

      if (result.success) {
        setStep('success');
      } else {
        const errorMsg = result.error ?? 'Código inválido';
        setLocalError(errorMsg);
        if (checkSessionExpired(errorMsg)) {
          setIsSessionExpired(true);
        }
      }
    } catch {
      setLocalError('Erro ao verificar código');
    } finally {
      setIsLoading(false);
    }
  }, [verifyCode, currentSession, verifyMfaSetup, checkSessionExpired]);

  /**
   * Handler para input OTP individual
   */
  const handleOtpInput = useCallback((index: number, value: string) => {
    // Aceita apenas números
    const digit = value.replace(/\D/g, '').slice(-1);
    
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    setLocalError(null);
    clearError();

    // Auto-avança para próximo input
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }, [otpDigits, clearError]);

  /**
   * Handler para teclas especiais no OTP
   */
  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace volta para input anterior
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    // Seta esquerda
    if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    // Seta direita
    if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }, [otpDigits]);

  /**
   * Handler para paste no OTP
   */
  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const digits = pastedData.split('').concat(['', '', '', '', '', '']).slice(0, 6);
    setOtpDigits(digits);
    setLocalError(null);
    clearError();
    
    // Foca no último dígito preenchido ou no próximo vazio
    let focusIndex = 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      if (digits[i] !== '') {
        focusIndex = i < 5 ? i + 1 : 5;
        break;
      }
    }
    otpInputRefs.current[focusIndex]?.focus();
  }, [clearError]);

  /**
   * Copia código secreto para clipboard
   */
  const handleCopySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secretCode);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Fallback silencioso
    }
  }, [secretCode]);

  /**
   * Finaliza wizard e redireciona
   */
  const handleFinish = useCallback(() => {
    onSuccess();
  }, [onSuccess]);

  // Limpar erros ao mudar de etapa
  useEffect(() => {
    setLocalError(null);
    clearError();
  }, [step, clearError]);

  // ============================================================================
  // Renderização das etapas
  // ============================================================================

  // Etapa 1: Informações sobre MFA e segurança
  if (step === 'info') {
    return (
      <div className="glass-card p-6 animate-fade-slide-in flex flex-col" style={{ minHeight: '100%' }}>
        {/* Header: Logo + Frase descritiva */}
        <div className="text-center mb-4">
          <div className="flex justify-center">
            <div 
              className="relative flex items-center justify-center"
              style={{ padding: '12px 24px 4px' }}
            >
              <div 
                className="absolute inset-0 rounded-2xl opacity-50"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(0, 222, 165, 0.2) 0%, rgba(0, 222, 165, 0.05) 50%, transparent 70%)',
                }}
              />
              <img 
                src={new URL('../../../assets/branding/lexato-logo.webp', import.meta.url).href}
                alt="Lexato - Provas Digitais" 
                className="h-10 w-auto relative z-10"
                style={{ filter: 'drop-shadow(0 0 16px rgba(0, 222, 165, 0.3))' }}
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed px-2 mt-1" style={{ color: 'var(--text-secondary)' }}>
            Capture e autentique provas digitais com<br />
            validade reconhecida judicialmente.
          </p>
        </div>

        {/* Linha separadora */}
        <div className="h-px mb-4" style={{ background: 'linear-gradient(90deg, transparent, rgba(0, 222, 165, 0.3), transparent)' }} />

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col justify-center">
          {/* Header com ícone de segurança */}
          <div className="text-center mb-4">
            <div 
              className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{ 
                background: 'rgba(0, 222, 165, 0.1)',
                boxShadow: '0 0 30px rgba(0, 222, 165, 0.3)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green-bright)" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Proteja sua conta
              </h2>
              <a
                href="https://docs.lexato.com.br/seguranca/mfa-primeiro-acesso"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded-full transition-colors hover:bg-white/10"
                title="Saiba mais sobre MFA"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </a>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              A verificação em duas etapas é obrigatória para garantir a segurança das suas provas digitais
            </p>
          </div>

          {/* Erro */}
          {displayError && (
            <div 
              className="rounded-lg p-3 text-sm font-medium mb-4"
              style={{ 
                backgroundColor: 'rgba(239, 83, 80, 0.15)', 
                color: '#ff6b6b',
                border: '1px solid rgba(239, 83, 80, 0.5)',
              }}
            >
              {displayError}
            </div>
          )}

          {/* Card do Authenticator App */}
          <div 
            className="rounded-xl p-4 mb-4"
            style={{ 
              background: 'rgba(0, 222, 165, 0.08)',
              border: '1px solid rgba(0, 222, 165, 0.3)',
            }}
          >
            <div className="flex items-start gap-3 mb-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0, 222, 165, 0.2)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green-bright)" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  Aplicativo Autenticador
                </h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Google Authenticator, Authy, Microsoft Authenticator ou similar
                </p>
              </div>
            </div>

            {/* Benefícios de segurança */}
            <div className="space-y-2 ml-1">
              <div className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" className="shrink-0 mt-0.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Códigos gerados offline, sem depender de SMS
                </span>
              </div>
              <div className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" className="shrink-0 mt-0.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Funciona mesmo sem conexão com internet
                </span>
              </div>
            </div>
          </div>

          {/* Botão iniciar */}
          <button
            type="button"
            onClick={handleStartSetup}
            disabled={isLoading}
            className={`btn-primary w-full ${isLoading ? 'loading' : ''}`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'transparent' }}
                />
                Preparando...
              </span>
            ) : (
              'Configurar Autenticador'
            )}
          </button>

          {/* Botão voltar */}
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="w-full mt-3 py-2 text-sm font-medium transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  // Etapa 2: QR Code + Verificação (unificado)
  if (step === 'qrcode' || step === 'verify') {
    return (
      <div className="glass-card p-5 animate-fade-slide-in flex flex-col" style={{ minHeight: '100%' }}>
        {/* Header: Logo + Frase descritiva */}
        <div className="text-center mb-3">
          <div className="flex justify-center">
            <div 
              className="relative flex items-center justify-center"
              style={{ padding: '8px 20px 2px' }}
            >
              <div 
                className="absolute inset-0 rounded-2xl opacity-50"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(0, 222, 165, 0.2) 0%, rgba(0, 222, 165, 0.05) 50%, transparent 70%)',
                }}
              />
              <img 
                src={new URL('../../../assets/branding/lexato-logo.webp', import.meta.url).href}
                alt="Lexato - Provas Digitais" 
                className="h-8 w-auto relative z-10"
                style={{ filter: 'drop-shadow(0 0 16px rgba(0, 222, 165, 0.3))' }}
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed px-2 mt-1" style={{ color: 'var(--text-secondary)' }}>
            Capture e autentique provas digitais com<br />
            validade reconhecida judicialmente.
          </p>
        </div>

        {/* Linha separadora */}
        <div className="h-px mb-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(0, 222, 165, 0.3), transparent)' }} />

        {/* Header compacto */}
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => setStep('info')}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Configure seu autenticador
            </h2>
          </div>
        </div>

        {/* Apps compatíveis - texto simples */}
        <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          Utilize um destes aplicativos:{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            Google Authenticator, Microsoft Authenticator, Authy, 1Password ou Bitwarden
          </span>
        </p>

        {/* QR Code centralizado */}
        <div className="flex justify-center mb-3">
          <div 
            className="p-2 rounded-xl"
            style={{ 
              background: 'white',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            }}
          >
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrCodeUri)}&bgcolor=FFFFFF&color=000000&margin=0`}
              alt="QR Code para configuração de MFA"
              width={120}
              height={120}
              className="block"
            />
          </div>
        </div>

        {/* Código secreto colapsável */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="w-full flex items-center justify-center gap-2 py-1.5 text-xs transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>{showSecret ? 'Ocultar código manual' : 'Não consegue escanear?'}</span>
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              style={{ transform: showSecret ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {showSecret && (
            <div 
              className="mt-2 p-3 rounded-lg"
              style={{ background: 'rgba(0, 0, 0, 0.3)' }}
            >
              <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Insira este código manualmente no app:
              </p>
              <div className="flex items-center gap-2">
                <code 
                  className="flex-1 text-xs font-mono break-all select-all"
                  style={{ color: 'var(--green-bright)' }}
                >
                  {secretCode}
                </code>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="p-2 rounded-lg transition-all shrink-0"
                  style={{ 
                    background: copiedSecret ? 'rgba(0, 222, 165, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  }}
                  title={copiedSecret ? 'Copiado!' : 'Copiar código'}
                >
                  {copiedSecret ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green-bright)" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px" style={{ background: 'rgba(255, 255, 255, 0.1)' }} />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Digite o código de 6 dígitos
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255, 255, 255, 0.1)' }} />
        </div>

        {/* Erro */}
        {displayError && (
          <div 
            className="rounded-lg p-3 text-sm font-medium mb-3"
            style={{ 
              backgroundColor: 'rgba(239, 83, 80, 0.15)', 
              color: '#ff6b6b',
              border: '1px solid rgba(239, 83, 80, 0.5)',
            }}
          >
            <p className="text-xs">{displayError}</p>
            {isSessionExpired && (
              <button
                type="button"
                onClick={onBack}
                className="mt-2 w-full py-2 px-3 rounded-lg text-xs font-medium transition-colors"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-primary)',
                }}
              >
                Fazer login novamente
              </button>
            )}
          </div>
        )}

        {/* Inputs OTP modernos */}
        <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }}>
          <div className="flex justify-center gap-2 mb-4" onPaste={handleOtpPaste}>
            {otpDigits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { otpInputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpInput(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                disabled={isSessionExpired}
                className="w-10 h-12 text-center text-lg font-bold rounded-xl transition-all focus:outline-none"
                style={{ 
                  background: digit 
                    ? 'rgba(0, 222, 165, 0.15)' 
                    : 'rgba(255, 255, 255, 0.05)',
                  border: digit 
                    ? '2px solid rgba(0, 222, 165, 0.5)' 
                    : '2px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-primary)',
                  caretColor: 'var(--green-bright)',
                }}
                autoFocus={index === 0}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading || verifyCode.length !== 6 || isSessionExpired}
            className={`btn-primary w-full ${isLoading ? 'loading' : ''}`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'transparent' }}
                />
                Verificando...
              </span>
            ) : (
              'Ativar MFA'
            )}
          </button>
        </form>

        {/* Mensagem de sessão expirada apenas */}
        {isSessionExpired && (
          <p className="text-xs text-center mt-3" style={{ color: 'var(--text-tertiary)' }}>
            A sessão expirou. Faça login novamente.
          </p>
        )}
      </div>
    );
  }

  // Etapa 4: Sucesso
  return (
    <div className="glass-card p-6 animate-fade-slide-in flex flex-col" style={{ minHeight: '100%' }}>
      {/* Header: Logo + Frase descritiva */}
      <div className="text-center mb-4">
        <div className="flex justify-center">
          <div 
            className="relative flex items-center justify-center"
            style={{ padding: '12px 24px 4px' }}
          >
            <div 
              className="absolute inset-0 rounded-2xl opacity-50"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(0, 222, 165, 0.2) 0%, rgba(0, 222, 165, 0.05) 50%, transparent 70%)',
              }}
            />
            <img 
              src={new URL('../../../assets/branding/lexato-logo.webp', import.meta.url).href}
              alt="Lexato - Provas Digitais" 
              className="h-10 w-auto relative z-10"
              style={{ filter: 'drop-shadow(0 0 16px rgba(0, 222, 165, 0.3))' }}
            />
          </div>
        </div>
        <p className="text-xs leading-relaxed px-2 mt-1" style={{ color: 'var(--text-secondary)' }}>
          Capture e autentique provas digitais com<br />
          validade reconhecida judicialmente.
        </p>
      </div>

      {/* Linha separadora */}
      <div className="h-px mb-4" style={{ background: 'linear-gradient(90deg, transparent, rgba(0, 222, 165, 0.3), transparent)' }} />

      {/* Conteúdo de sucesso */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Ícone de sucesso */}
        <div className="text-center mb-5">
          <div 
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-3"
            style={{ 
              background: 'rgba(0, 222, 165, 0.15)',
              boxShadow: '0 0 40px rgba(0, 222, 165, 0.4)',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--green-bright)" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            MFA ativado com sucesso!
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Sua conta está protegida com verificação em duas etapas
          </p>
        </div>

        {/* Dicas de segurança */}
        <div 
          className="rounded-xl p-4 mb-4"
          style={{ 
            background: 'rgba(0, 222, 165, 0.05)',
            border: '1px solid rgba(0, 222, 165, 0.2)',
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--green-bright)' }}>
            Dicas de segurança
          </h3>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" className="shrink-0 mt-0.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mantenha seu aplicativo autenticador seguro
            </li>
            <li className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" className="shrink-0 mt-0.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Guarde os códigos de recuperação em local seguro
            </li>
            <li className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" className="shrink-0 mt-0.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Nunca compartilhe seus códigos de verificação
            </li>
          </ul>
        </div>

        {/* Botão continuar */}
        <button
          type="button"
          onClick={handleFinish}
          className="btn-primary w-full"
        >
          Continuar para o Lexato
        </button>
      </div>
    </div>
  );
}
