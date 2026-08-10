import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dashed';
type Size = 'sm' | 'md' | 'lg';

/**
 * Pill button. Shape is fixed (fully rounded) — in this design a rectangle is
 * never the right answer for an action, so the radius is not a prop.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className = '',
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${VARIANT[variant]} ${SIZE[size]} ${full ? 'w-full' : ''} ${BASE} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-pill font-semibold ' +
  'transition-[background-color,color,transform,box-shadow] duration-150 ' +
  'active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-cta hover:bg-accent-hover',
  secondary: 'bg-raised text-accent-text hover:bg-raised-hi',
  ghost: 'text-muted hover:text-fg hover:bg-raised',
  danger: 'bg-raised text-bad hover:bg-bad-tint',
  dashed: 'border-[1.5px] border-dashed border-faint-2 text-accent-text hover:bg-raised/60',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[11px]',
  md: 'px-4 py-2.5 text-xs',
  lg: 'px-5 py-4 text-[15px]',
};
