/**
 * Instruções de Segurança em Área Scrollável
 *
 * Exibe as instruções de segurança em uma área com scroll vertical
 * que ocupa todo o espaço disponível entre o seletor de tipo e o rodapé.
 *
 * O checkbox de termos e o botão de iniciar só são habilitados quando
 * o usuário rola até o final das instruções.
 *
 * @module InstructionsScrollable
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { CaptureType, StorageType } from '../../../../types/capture.types';
import type { IsolationPreview } from '../../../../types/isolation.types';

interface InstructionsScrollableProps {
  /** Tipo de captura selecionado */
  captureType: CaptureType;
  /** Tipo de armazenamento */
  storageType: StorageType;
  /** Preview de isolamento de extensões */
  isolationPreview: IsolationPreview | null;
  /** Se está carregando preview */
  isLoadingPreview: boolean;
  /** Callback quando o usuário leu todas as instruções */
  onReadComplete: (read: boolean) => void;
  /** Se já foi marcado como lido */
  hasRead: boolean;
}

/** Margem de tolerância em pixels para considerar "final do scroll" */
const SCROLL_BOTTOM_THRESHOLD = 30;

/**
 * Área scrollável de instruções de segurança
 */
export function InstructionsScrollable({
  captureType,
  storageType,
  isolationPreview,
  isLoadingPreview,
  onReadComplete,
  hasRead,
}: InstructionsScrollableProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const isPremium = storageType !== 'standard';
  const instructions = getInstructions(captureType);

  /** Verifica se o usuário rolou até o final */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || hasRead) {
      return;
    }
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
    if (isAtBottom) {
      onReadComplete(true);
      setShowScrollHint(false);
    }
  }, [hasRead, onReadComplete]);

  /** Se o conteúdo cabe sem scroll, marca como lido automaticamente */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    // Pequeno delay para garantir que o layout foi calculado
    const timer = setTimeout(() => {
      if (el.scrollHeight <= el.clientHeight + 5) {
        onReadComplete(true);
        setShowScrollHint(false);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [captureType, onReadComplete]);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Título da seção */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
          flexShrink: 0,
        }}
      >
        <ShieldIcon />
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Instruções de Segurança
        </h3>
        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {instructions.length} regras
        </span>
      </div>

      {/* Área scrollável com altura mínima e máxima */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          minHeight: '180px',
          maxHeight: '340px',
          overflowY: 'auto',
          borderRadius: '10px',
          backgroundColor: 'rgba(0, 222, 165, 0.04)',
          border: `1px solid ${hasRead ? 'rgba(0, 222, 165, 0.25)' : 'rgba(0, 222, 165, 0.1)'}`,
          transition: 'border-color 0.3s ease',
        }}
      >
        {/* Lista de instruções */}
        {instructions.map((instruction, index) => (
          <InstructionItem
            key={index}
            instruction={instruction}
            index={index + 1}
            total={instructions.length}
            isLast={index === instructions.length - 1}
          />
        ))}

        {/* Badges e avisos dentro da área scrollável */}
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {isPremium && (
            <BadgeInfo
              color="var(--green-bright)"
              bgColor="rgba(0, 222, 165, 0.12)"
              borderColor="rgba(0, 222, 165, 0.2)"
              icon={<BlockchainIcon />}
              text="Prova registrada em Blockchain (Polygon + Arbitrum + Optimism)"
            />
          )}

          {!isLoadingPreview && isolationPreview && isolationPreview.toDisableCount > 0 && (
            <BadgeInfo
              color="var(--color-warning)"
              bgColor="rgba(255, 167, 38, 0.1)"
              borderColor="rgba(255, 167, 38, 0.2)"
              icon={<ShieldWarningIcon />}
              text={
                isolationPreview.toDisableCount === 1
                  ? '1 extensão conflitante será desativada durante a captura.'
                  : `${isolationPreview.toDisableCount} extensões conflitantes serão desativadas.`
              }
            />
          )}

          {captureType === 'video' && (
            <>
              <BadgeInfo
                color="#EF5350"
                bgColor="rgba(239, 83, 80, 0.08)"
                borderColor="rgba(239, 83, 80, 0.2)"
                icon={<TabsWarningIcon />}
                text="Isolamento de Guias: outras abas serão fechadas para integridade forense."
              />
              <BadgeInfo
                color="#FFA726"
                bgColor="rgba(255, 167, 38, 0.08)"
                borderColor="rgba(255, 167, 38, 0.2)"
                icon={<RefreshWarningIcon />}
                text="Autenticidade: a página será recarregada para validar conexão segura."
              />
            </>
          )}

          {/* Marcador de final - confirma que o usuário chegou aqui */}
          {hasRead && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px',
                fontSize: '11px',
                color: 'var(--green-bright)',
                fontWeight: 500,
              }}
            >
              <CheckIcon />
              Todas as instruções foram lidas
            </div>
          )}
        </div>
      </div>

      {/* Indicador de "role para baixo" sobreposto ao fundo da área */}
      {showScrollHint && !hasRead && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '44px',
            background: 'linear-gradient(transparent, rgba(15, 14, 16, 0.9))',
            borderRadius: '0 0 10px 10px',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: '8px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              animation: 'fadeInOut 2s ease-in-out infinite',
            }}
          >
            <ScrollDownIcon />
            Role para ler todas as instruções
          </div>
          <style>{`@keyframes fadeInOut { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Badge informativo reutilizável
// ============================================================================

interface BadgeInfoProps {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  text: string;
}

function BadgeInfo({ bgColor, borderColor, icon, text }: BadgeInfoProps): React.ReactElement {
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: '8px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '11px',
        lineHeight: 1.4,
      }}
    >
      {icon}
      <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  );
}

// ============================================================================
// Item de instrução
// ============================================================================

interface InstructionItemProps {
  instruction: InstructionData;
  index: number;
  total: number;
  isLast: boolean;
}

function InstructionItem({
  instruction,
  index,
  total,
  isLast,
}: InstructionItemProps): React.ReactElement {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderBottom: !isLast ? '1px solid rgba(0, 222, 165, 0.06)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div
          style={{
            width: '24px',
            height: '24px',
            minWidth: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 222, 165, 0.15)',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--green-bright)',
          }}
        >
          {index}
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {instruction.title}
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 400 }}>
              {index}/{total}
            </span>
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              lineHeight: 1.6,
            }}
          >
            {instruction.description}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Instruções por tipo de captura
// ============================================================================

interface InstructionData {
  title: string;
  description: string;
}

function getInstructions(type: CaptureType): InstructionData[] {
  if (type === 'screenshot') {
    return [
      {
        title: 'Recarregamento Automático',
        description:
          'A página será recarregada automaticamente antes da captura para garantir ' +
          'autenticidade. O conteúdo capturado será exatamente o publicado no momento.',
      },
      {
        title: 'Não Troque de Aba',
        description:
          'Mantenha-se na aba atual durante todo o processo. Trocar de aba ou minimizar ' +
          'o navegador cancela a captura automaticamente.',
      },
      {
        title: 'Bloqueio Temporário de Inputs',
        description:
          'Teclado e mouse serão bloqueados durante a rolagem automática para evitar ' +
          'alterações acidentais no conteúdo capturado.',
      },
      {
        title: 'Revisão Antes do Registro',
        description:
          'Uma nova aba será aberta para revisão detalhada da captura antes do registro ' +
          'definitivo em blockchain.',
      },
      {
        title: 'Registro em Blockchain',
        description:
          'O registro em blockchain (Polygon + Arbitrum) só ocorre após sua aprovação explícita. ' +
          'O hash fica imutável e verificável, garantindo validade jurídica permanente.',
      },
    ];
  }

  return [
    {
      title: 'Fechamento de Outras Abas',
      description:
        'Todas as outras abas serão fechadas automaticamente para garantir ' +
        'um ambiente controlado e seguro durante a gravação.',
    },
    {
      title: 'Não Minimize o Navegador',
      description:
        'A captura de vídeo requer visibilidade total da tela. Não minimize ' +
        'o navegador nem sobreponha outras janelas durante a gravação.',
    },
    {
      title: 'Navegue Naturalmente',
      description:
        'Navegue pela página para demonstrar o fato que deseja registrar. Cliques, URLs e metadados ' +
        'são auditados em tempo real e incluídos no relatório forense.',
    },
    {
      title: 'Sala de Revisão Segura',
      description:
        'Ao parar a gravação, uma sala de revisão será aberta para verificar ' +
        'qualidade e metadados antes da certificação em blockchain.',
    },
    {
      title: 'Limite de 30 Minutos',
      description:
        'Cada sessão de gravação tem limite de 30 minutos. Para gravações mais longas, ' +
        'inicie uma nova sessão após a conclusão.',
    },
  ];
}

// ============================================================================
// Ícones
// ============================================================================

function ShieldIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--green-bright)', flexShrink: 0 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function BlockchainIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--green-bright)', flexShrink: 0 }}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function ShieldWarningIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-warning)', flexShrink: 0 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function TabsWarningIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#EF5350', flexShrink: 0 }}>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
      <path d="M3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4" />
    </svg>
  );
}

function RefreshWarningIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#FFA726', flexShrink: 0 }}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ScrollDownIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--green-bright)' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default InstructionsScrollable;
