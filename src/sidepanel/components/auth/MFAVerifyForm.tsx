/**
 * Formulário de verificação MFA com inputs OTP modernos
 *
 * Usado quando o usuário já tem MFA configurado e precisa
 * digitar o código do aplicativo autenticador.
 *
 * Funcionalidades:
 * - Logo Lexato no topo com frase de efeito
 * - 6 inputs separados para cada dígito
 * - Auto-avança ao digitar
 * - Suporte a paste do código completo
 * - Navegação por teclado (setas, backspace)
 *
 * Migrado de popup/components/MFAVerifyForm.tsx para sidepanel
 * com layout responsivo (sem dimensões fixas do popup).
 *
 * @module MFAVerifyForm
 */

import React, { useState, useCallback, useRef } from 'react';
import type { LoginResult } from '../../../types/auth.types';

/**
 * Props do componente MFAVerifyForm
 */
interface MFAVerifyFormProps {
  /** Sessão do challenge MFA */
  session: string | null;
  /** Callback quando verificação é bem-sucedida */
  onSuccess: () => void;
  /** Callback para voltar */
  onBack: () => void;
  /** Função para completar MFA */
  completeMfa: (code: string, session: string) => Promise<LoginResult>;
}

/**
 * Formulário de verificação MFA com inputs OTP modernos
 */
export default function MFAVerifyForm({
  session,
  onSuccess,
  onBack,
  completeMfa,
}: MFAVerifyFormProps): React.ReactElement {
  // Estado do formulário
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs para os inputs OTP
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Código completo para verificação
  const verifyCode = otpDigits.join('');

  /**
   * Handler para input OTP individual
   */
  const handleOtpInput = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    setError(null);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }, [otpDigits]);

  /**
   * Handler para teclas especiais no OTP
   */
  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
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
    setError(null);
    
    let focusIndex = 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      if (digits[i] !== '') {
        focusIndex = i < 5 ? i + 1 : 5;
        break;
      }
    }
    otpInputRefs.current[focusIndex]?.focus();
  }, []);

  /**
   * Submete código MFA
   */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (verifyCode.length !== 6) {
      setError('Digite o código de 6 dígitos');
      return;
    }

    if (!session) {
      setError('Sessão expirada. Faça login novamente.');
      onBack();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await completeMfa(verifyCode, session);

      if (result.success) {
        onSuccess();
      } else {
        let errorMsg = result.error ?? 'Código inválido';
        if (errorMsg.includes('expired') || errorMsg.includes('expirada')) {
          errorMsg = 'Sessão expirada. Faça login novamente.';
        } else if (errorMsg.includes('invalid') || errorMsg.includes('inválido')) {
          errorMsg = 'Código incorreto. Verifique o código no seu aplicativo.';
        }
        setError(errorMsg);
        setOtpDigits(['', '', '', '', '', '']);
        otpInputRefs.current[0]?.focus();
      }
    } catch {
      setError('Erro ao verificar código. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [verifyCode, session, completeMfa, onSuccess, onBack]);

  return (
    <div className="glass-card p-6 animate-fade-slide-in flex flex-col h-full">
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

      {/* Header com botão voltar */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Verificação em duas etapas
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Digite o código do seu aplicativo autenticador
          </p>
        </div>
      </div>

      {/* Conteúdo central - cresce para preencher espaço */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Erro */}
        {error && (
          <div 
            className="rounded-lg p-3 text-sm font-medium mb-4"
            style={{ 
              backgroundColor: 'rgba(239, 83, 80, 0.15)', 
              color: '#ff6b6b',
              border: '1px solid rgba(239, 83, 80, 0.5)',
            }}
          >
            {error}
          </div>
        )}

        {/* Ícone de segurança */}
        <div className="flex justify-center mb-4">
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ 
              background: 'rgba(0, 222, 165, 0.1)',
              boxShadow: '0 0 30px rgba(0, 222, 165, 0.2)',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--green-bright)" strokeWidth="1.5">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
              <path d="M9 9h6M9 13h6" />
            </svg>
          </div>
        </div>

        {/* Inputs OTP */}
        <form onSubmit={handleSubmit}>
          <div className="flex justify-center gap-2 mb-6" onPaste={handleOtpPaste}>
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
                disabled={isLoading}
                className="w-11 h-14 text-center text-xl font-bold rounded-xl transition-all focus:outline-none"
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
        </form>
      </div>

      {/* Botão fixo na parte inferior */}
      <div className="pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || verifyCode.length !== 6}
          className="btn-primary w-full"
        >
          {isLoading ? 'Verificando...' : 'Verificar'}
        </button>
      </div>
    </div>
  );
}
