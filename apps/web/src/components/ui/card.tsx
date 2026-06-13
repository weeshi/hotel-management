import { clsx } from 'clsx';

interface CardProps {
  title?: string;
  icon?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function Card({ title, icon, children, className, action }: CardProps) {
  return (
    <div className={clsx('bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 transition-all duration-300 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-gold)]', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="flex items-center gap-2 text-lg font-bold">
              {icon && <span>{icon}</span>} {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
