/**
 * Page Description Header
 *
 * Header padrão da extensão combinando:
 * - Ícone lateral (estilo PageHeader04)
 * - Linha separadora vertical (estilo PageHeader11)
 * - Título e Subtítulo
 */

import React from 'react';
import './PageDescriptionHeader.css';

interface PageDescriptionHeaderProps {
    title: string;
    subtitle?: React.ReactNode;
    icon: React.ReactNode;
}

export function PageDescriptionHeader({ title, subtitle, icon }: PageDescriptionHeaderProps): React.ReactElement {
    return (
        <div className="page-header page-description-header">
            <div className="header-icon-container">
                {icon}
            </div>

            <div className="header-separator-vertical" />

            <div className="header-text-content">
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
            </div>
        </div>
    );
}
