import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'green' | 'yellow' | 'red' | 'gray' | 'blue';
}

const variants = {
  green:  'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  red:    'bg-red-100 text-red-800',
  gray:   'bg-gray-100 text-gray-700',
  blue:   'bg-blue-100 text-blue-800',
};

export function Badge({ children, variant = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}

export function statusVariant(status: string): BadgeProps['variant'] {
  switch (status.toUpperCase()) {
    case 'APPROVED':   return 'green';
    case 'PENDING':    return 'yellow';
    case 'REJECTED':   return 'red';
    case 'CONFIRMED':  return 'green';
    case 'CANCELLED':  return 'red';
    case 'COMPLETED':  return 'blue';
    case 'SUSPENDED':  return 'red';
    default:           return 'gray';
  }
}
