import React from 'react';
import { Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { TimestampResult } from '../../lib/evidence-pipeline/types';

export interface TimestampBadgeProps {
  timestamp?: TimestampResult | undefined;
  className?: string;
}

export const TimestampBadge: React.FC<TimestampBadgeProps> = ({ timestamp, className = '' }) => {
  if (!timestamp) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full text-sm font-medium ${className}`}>
        <Clock className="w-4 h-4" />
        <span>Aguardando Carimbo...</span>
      </div>
    );
  }

  const isIcpBrasil = timestamp.type === 'ICP_BRASIL';
  const isFallback = timestamp.type === 'NTP_LOCAL';
  
  // Formatar data
  let dateStr = 'Data inválida';
  try {
      dateStr = new Date(timestamp.appliedAt).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
  } catch (e) {
      console.error('Data inválida no timestamp', e);
  }

  if (isIcpBrasil) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-full text-sm font-medium ${className}`} title="Carimbo do Tempo ICP-Brasil Válido">
        <CheckCircle className="w-4 h-4" />
        <span>Carimbado em {dateStr} (ICP-Brasil)</span>
      </div>
    );
  }

  if (isFallback) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800 rounded-full text-sm font-medium ${className}`} title={timestamp.warning ?? 'Carimbo provisório'}>
        <AlertTriangle className="w-4 h-4" />
        <span>Carimbado em {dateStr} (Local - Fallback)</span>
      </div>
    );
  }
  
  return null;
};
