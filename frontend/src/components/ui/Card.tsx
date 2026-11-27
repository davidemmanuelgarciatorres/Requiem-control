import type { ElementType, ReactNode } from 'react';
import { DemoBadge } from './Badge';

type CardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Marca el contenido como datos de demostración (insignia visible). */
  demo?: boolean;
  variant?: 'default' | 'strong' | 'subtle';
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
  id?: string;
};

export function Card({ title, subtitle, actions, demo, variant = 'default', as: Tag = 'section', className = '', children, ...rest }: CardProps) {
  const variantClass = variant === 'default' ? '' : ` rc-glass--${variant}`;
  const hasHeader = title || subtitle || actions || demo;
  return (
    <Tag className={`rc-card rc-glass${variantClass} ${className}`.trim()} {...rest}>
      {hasHeader && (
        <header className="rc-card__header">
          <div className="rc-card__titles">
            {title && <h2 className="rc-card__title">{title}</h2>}
            {subtitle && <p className="rc-card__subtitle">{subtitle}</p>}
          </div>
          {(actions || demo) && (
            <div className="rc-card__actions">
              {demo && <DemoBadge />}
              {actions}
            </div>
          )}
        </header>
      )}
      {children}
    </Tag>
  );
}
