import { clsx } from 'clsx';

interface BadgeProps {
  variant?: 'gold' | 'green' | 'red' | 'blue' | 'yellow' | 'purple';
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const variants = {
  gold: 'bg-[rgba(201,168,76,0.12)] text-[var(--gold)]',
  green: 'bg-[rgba(46,204,113,0.1)] text-[var(--green)]',
  red: 'bg-[rgba(231,76,60,0.1)] text-[var(--red)]',
  blue: 'bg-[rgba(52,152,219,0.1)] text-[var(--blue)]',
  yellow: 'bg-[rgba(241,196,15,0.1)] text-[var(--yellow)]',
  purple: 'bg-[rgba(155,89,182,0.1)] text-[var(--purple)]',
};

export function Badge({ variant = 'gold', children, className, 'data-testid': dataTestId }: BadgeProps) {
  return (
    <span
      data-testid={dataTestId}
      className={clsx('inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold', variants[variant], className)}
    >
      {children}
    </span>
  );
}
