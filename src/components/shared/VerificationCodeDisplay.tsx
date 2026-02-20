/**
 * Componente para exibição do código de verificação de 8 caracteres
 *
 * Exibido após a confirmação de uma captura, permite ao usuário copiar
 * o código que será necessário para acessar arquivos completos no verificador.
 *
 * @module VerificationCodeDisplay
 */

import React, { useState, useCallback } from 'react';

export interface VerificationCodeDisplayProps {
  /** Código de verificação de 8 caracteres */
  code: string;
  /** ID da evidência (para link do verificador) */
  evidenceId: string;
}

/**
 * Ícone de cópia
 */
function CopyIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/**
 * Ícone de check
 */
function CheckIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Ícone de alerta
 */
function AlertIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * Ícone de link externo
 */
function ExternalLinkIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/**
 * Componente de exibição do código de verificação
 *
 * Funcionalidades:
 * - Exibe código de 8 caracteres em destaque
 * - Botão para copiar código
 * - Aviso sobre a importância de guardar o código
 * - Link para o verificador público
 */
export function VerificationCodeDisplay({
  code,
  evidenceId,
}: VerificationCodeDisplayProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar código:', err);
    }
  }, [code]);

  const verificadorUrl = `https://verificador.lexato.com.br/${evidenceId}?code=${code}`;

  const handleOpenVerificador = useCallback(() => {
    chrome.tabs.create({ url: verificadorUrl });
  }, [verificadorUrl]);

  return (
    <div className="rounded-xl bg-linear-to-br from-lexato-500/20 to-lexato-600/10 border border-lexato-500/30 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">#</span>
        <h3 className="text-sm font-semibold text-dark-100">
          Código de Verificação
        </h3>
      </div>

      {/* Código */}
      <div className="flex items-center justify-between bg-dark-800 rounded-lg px-4 py-3 mb-3">
        <code className="text-xl font-mono font-bold tracking-[0.2em] text-lexato-400">
          {code}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className={`p-2 rounded-md transition-colors ${
            copied
              ? 'bg-success/20 text-success'
              : 'bg-dark-700 text-dark-300 hover:bg-dark-600 hover:text-dark-100'
          }`}
          title={copied ? 'Copiado!' : 'Copiar código'}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-2 mb-3 p-2 bg-warning/10 border border-warning/20 rounded-lg">
        <span className="text-warning mt-0.5">
          <AlertIcon />
        </span>
        <div className="text-xs text-dark-200">
          <p className="font-medium text-warning">Guarde este código!</p>
          <p className="mt-0.5 text-dark-400">
            Ele é necessário para acessar os arquivos completos no verificador público e{' '}
            <strong className="text-dark-200">não poderá ser recuperado</strong> posteriormente.
          </p>
        </div>
      </div>

      {/* Link para verificador */}
      <button
        type="button"
        onClick={handleOpenVerificador}
        className="w-full flex items-center justify-center gap-2 bg-lexato-500 hover:bg-lexato-400 text-white rounded-lg py-2 px-4 text-sm font-medium transition-colors"
      >
        Verificar Evidência
        <ExternalLinkIcon />
      </button>
    </div>
  );
}

export default VerificationCodeDisplay;
