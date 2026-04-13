import React from 'react';
import { cn } from '@/lib/utils';

const COLORS = [
  'bg-primary/20 text-primary',
  'bg-accent/20 text-accent',
  'bg-chart-3/20 text-chart-3',
  'bg-chart-4/20 text-chart-4',
  'bg-chart-5/20 text-chart-5',
];

export default function PlayerAvatar({ name, index = 0, isAlive = true, size = 'md' }) {
  const colorClass = COLORS[index % COLORS.length];
  const sizeClass = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm';

  return (
    <div className={cn(
      'rounded-full flex items-center justify-center font-bold shrink-0',
      sizeClass,
      colorClass,
      !isAlive && 'opacity-30 grayscale'
    )}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}