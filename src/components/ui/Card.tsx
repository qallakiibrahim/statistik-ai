import React from 'react';
import { cn } from '@/src/lib/utils';

interface CardProps {
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
  onClick?: () => void;
  id?: string;
}

export const Card = ({ className, padding = 'md', children, ...props }: CardProps) => {
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-2xl border border-border shadow-sm overflow-hidden',
        paddings[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
