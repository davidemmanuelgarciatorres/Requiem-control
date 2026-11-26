import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'glass' | 'ghost' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
};

export function Button({ variant = 'glass', size = 'md', loading = false, icon, iconEnd, children, disabled, className = '', type = 'button', ...rest }: ButtonProps) {
  const sizeClass = size === 'md' ? '' : ` rc-btn--${size}`;
  return (
    <button
      type={type}
      className={`rc-btn rc-btn--${variant}${sizeClass} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="rc-btn__spinner" aria-hidden="true" /> : icon}
      {children}
      {!loading && iconEnd}
    </button>
  );
}
