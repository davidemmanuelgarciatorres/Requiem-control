import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, lead, aside }: { eyebrow?: ReactNode; title: string; lead?: string; aside?: ReactNode }) {
  return (
    <header className="rc-page-header">
      {eyebrow && <p className="rc-eyebrow">{eyebrow}</p>}
      <div className="rc-page-header__row">
        <h1 className="rc-page-title">{title}</h1>
        {aside}
      </div>
      {lead && <p className="rc-page-lead">{lead}</p>}
    </header>
  );
}
