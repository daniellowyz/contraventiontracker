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

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'LOW':
      return 'bg-green-100 text-green-800';
    case 'MEDIUM':
      return 'bg-yellow-100 text-yellow-800';
    case 'HIGH':
      return 'bg-orange-100 text-orange-800';
    case 'CRITICAL':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'ACKNOWLEDGED':
      return 'bg-blue-100 text-blue-800';
    case 'DISPUTED':
      return 'bg-purple-100 text-purple-800';
    case 'CONFIRMED':
      return 'bg-orange-100 text-orange-800';
    case 'RESOLVED':
      return 'bg-green-100 text-green-800';
    case 'ESCALATED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getLevelName(level: string | null): string {
  if (!level) return 'None';
  switch (level) {
    case 'LEVEL_1':
      return 'Verbal Reminder';
    case 'LEVEL_2':
      return 'Written Warning';
    case 'LEVEL_3':
      return 'Mandatory Training';
    case 'LEVEL_4':
      return 'Performance Impact';
    case 'LEVEL_5':
      return 'Severe Consequences';
    default:
      return level;
  }
}

export function getLevelColor(level: string | null): string {
  if (!level) return 'bg-gray-100 text-gray-800';
  switch (level) {
    case 'LEVEL_1':
      return 'bg-blue-100 text-blue-800';
    case 'LEVEL_2':
      return 'bg-yellow-100 text-yellow-800';
    case 'LEVEL_3':
      return 'bg-orange-100 text-orange-800';
    case 'LEVEL_4':
      return 'bg-red-100 text-red-800';
    case 'LEVEL_5':
      return 'bg-red-200 text-red-900';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
