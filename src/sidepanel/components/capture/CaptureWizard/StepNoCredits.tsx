/**
 * Tela de Créditos Insuficientes (Side Panel)
 *
 * Exibida quando o usuário tenta avançar no wizard mas não tem créditos.
 *
 * Migrado de popup/components/CaptureWizard/StepNoCredits.tsx para sidepanel.
 *
 * @module StepNoCredits
 */

import React from 'react';
import { PageDescriptionHeader } from '../../../../components/shared/PageDescriptionHeader';
import { PrimaryButton } from '../../../../components/shared/PrimaryButton';

/** URL da página de compra de créditos */
const CREDITS_PURCHASE_URL = 'https://app.lexato.com.br/comprar/creditos';

/** Props do componente StepNoCredits */
interface StepNoCreditsProps {
  credits: number;
  onBack: () => void;
}

/**
 * Tela exibida quando usuário não tem créditos suficientes
 */
export function StepNoCredits({ credits, onBack }: StepNoCreditsProps): React.ReactElement {
  const handleBuyCredits = (): void => {
    window.open(CREDITS_PURCHASE_URL, '_blank');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <PageDescriptionHeader
        title="Créditos Insuficientes"
        subtitle="Você precisa de créditos para capturar"
        icon={<CreditCardIcon />}
      />

      <div
        style={{
          margin: '0 4px',
          padding: '16px',
          borderRadius: '10px',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <WalletEmptyIcon />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
            Seu saldo atual
          </p>
          <p style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#ef4444',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {credits} <span style={{ fontSize: '14px', fontWeight: 400 }}>créditos</span>
          </p>
        </div>
      </div>

      <p style={{
        fontSize: '13px',
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
        margin: '0 4px',
        textAlign: 'center',
      }}>
        Cada captura de prova digital com <strong style={{ color: 'var(--text-primary)' }}>metadados forenses</strong> e{' '}
        <strong style={{ color: 'var(--text-primary)' }}>validade jurídica</strong> consome 1 crédito.
      </p>

      <div style={{
        margin: '0 4px',
        padding: '12px',
        borderRadius: '8px',
        backgroundColor: 'rgba(0, 222, 165, 0.06)',
        border: '1px solid rgba(0, 222, 165, 0.12)',
      }}>
        <p style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--green-bright)',
          marginBottom: '8px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          Incluído em cada captura:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
          <BenefitItem text="Metadados forenses" />
          <BenefitItem text="Triplo blockchain" />
          <BenefitItem text="Relatório em PDF" />
          <BenefitItem text="Certificado digital" />
          <BenefitItem text="Carimbo ICP-Brasil" />
          <BenefitItem text="5 anos de guarda" />
          <BenefitItem text="Hash SHA-256" />
          <BenefitItem text="Geolocalização" />
          <BenefitItem text="Validade jurídica" />
          <BenefitItem text="Suporte técnico" />
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        marginTop: 'var(--space-1)',
      }}>
        <PrimaryButton onClick={handleBuyCredits} fullWidth>
          <CartIcon />
          Comprar Créditos
        </PrimaryButton>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: 'var(--space-2)',
            background: 'none',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: '13px',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Voltar
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Componentes auxiliares
// ============================================================================

function BenefitItem({ text }: { text: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
      <CheckIcon />
      {text}
    </div>
  );
}

function CreditCardIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function WalletEmptyIcon(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ef4444' }}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
    </svg>
  );
}

function CartIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--green-bright)', flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default StepNoCredits;
