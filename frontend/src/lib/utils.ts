import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | undefined | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
  }).format(value);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function getPointsColor(points: number): string {
  if (points >= 5) {
    return 'bg-red-50 text-red-700 border border-red-200';
  } else if (points >= 3) {
    return 'bg-orange-50 text-orange-700 border border-orange-200';
  } else if (points >= 1) {
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  }
  return 'bg-stone-100 text-stone-600 border border-stone-200';
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'PENDING_UPLOAD':
    case 'PENDING_APPROVAL':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'PENDING_REVIEW':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'COMPLETED':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'REJECTED':
      return 'bg-red-50 text-red-700 border border-red-200';
    default:
      return 'bg-stone-100 text-stone-600 border border-stone-200';
  }
}

export function getLevelName(level: string | null): string {
  if (!level) return 'None';
  switch (level) {
    case 'LEVEL_1':
      return 'Stage 1';
    case 'LEVEL_2':
      return 'Stage 2';
    case 'LEVEL_3':
      return 'Stage 3';
    default:
      return level;
  }
}

export function getLevelColor(level: string | null): string {
  if (!level) return 'bg-stone-100 text-stone-600 border border-stone-200';
  switch (level) {
    case 'LEVEL_1':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'LEVEL_2':
      return 'bg-orange-50 text-orange-700 border border-orange-200';
    case 'LEVEL_3':
      return 'bg-red-50 text-red-700 border border-red-200';
    default:
      return 'bg-stone-100 text-stone-600 border border-stone-200';
  }
}
