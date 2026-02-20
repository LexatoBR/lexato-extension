/**
 * Componente EvidenceCard do Design System Lexato
 *
 * Card de evidência com QuickActions integrado no hover.
 * Exibe informações resumidas da evidência com ações rápidas.
 *
 * @see Requirements 26.1-26.5
 */

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { QuickActions } from './QuickActions';

/**
 * Status possíveis de uma evidência
 */
export type EvidenceStatus = 'pending' | 'processing' | 'success' | 'error';

/**
 * Props do componente EvidenceCard
 */
export interface EvidenceCardProps {
  /** ID da evidência */
  id: string;
  /** Título/descrição da evidência */
  title: string;
  /** Hash SHA-256 */
  hash: string;
  /** Status atual */
  status: EvidenceStatus;
  /** Data de criação */
  createdAt: Date;
  /** Tipo de captura */
  type: 'screenshot' | 'video';
  /** Callback ao abrir detalhes */
  onOpenDetails?: (id: string) => void;
  /** Callback ao baixar */
  onDownload?: (id: string) => void;
  /** Classe CSS adicional */
  className?: string;
}

/**
 * Mapeia status para variante do Card
 */
const statusToVariant: Record<EvidenceStatus, 'pending' | 'highlight' | 'success' | 'error'> = {
  pending: 'pending',
  processing: 'highlight',
  success: 'success',
  error: 'error',
};

/**
 * Formata data relativa
 */
const formatDate = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {return 'Agora';}
  if (minutes < 60) {return `${minutes}min atrás`;}
  if (hours < 24) {return `${hours}h atrás`;}
  if (days < 7) {return `${days}d atrás`;}
  return date.toLocaleDateString('pt-BR');
};

/**
 * Trunca hash para exibição
 */
const truncateHash = (hash: string): string => {
  if (hash.length <= 16) {return hash;}
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
};

/**
 * Card de evidência com QuickActions no hover
 *
 * @example
 * ```tsx
 * <EvidenceCard
 *   id="ev-123"
 *   title="Captura de tela"
 *   hash="0x1234...abcd"
 *   status="success"
 *   createdAt={new Date()}
 *   type="screenshot"
 *   onOpenDetails={(id) => navigate(`/evidence/${id}`)}
 * />
 * ```
 */
export const EvidenceCard: React.FC<EvidenceCardProps> = ({
  id,
  title,
  hash,
  status,
  createdAt,
  type,
  onOpenDetails,
  onDownload,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`relative group ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid="evidence-card"
    >
      <Card
        variant={statusToVariant[status]}
        className="h-[88px]"
        onClick={() => onOpenDetails?.(id)}
      >
        <div className="flex items-center justify-between h-full">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-text-primary truncate">
                {title}
              </span>
              <Badge status={status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-text-tertiary">
              <span className="font-mono">{truncateHash(hash)}</span>
              <span>•</span>
              <span>{type === 'screenshot' ? 'Screenshot' : 'Vídeo'}</span>
              <span>•</span>
              <span>{formatDate(createdAt)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* QuickActions no canto superior direito */}
      <div className="absolute top-2 right-2">
        <QuickActions
          hash={hash}
          onOpenDetails={() => onOpenDetails?.(id)}
          onDownload={() => onDownload?.(id)}
          visible={isHovered}
        />
      </div>
    </div>
  );
};

EvidenceCard.displayName = 'EvidenceCard';

export default EvidenceCard;
