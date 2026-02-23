import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount) {
  const numAmount = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numAmount);
}

export function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

export function getCountdownTime(createdAt: string | null | undefined): { expired: boolean; text: string; mins?: number; secs?: number } | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  const deadline = new Date(created.getTime() + 60 * 60 * 1000); // 1 hour
  const now = new Date();
  const remaining = deadline.getTime() - now.getTime();
  
  if (remaining <= 0) return { expired: true, text: 'Overdue' };
  
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  
  return {
    expired: false,
    text: `${mins}:${secs.toString().padStart(2, '0')}`,
    urgent: mins < 15
  };
}

export function getStatusColor(status) {
  const colors = {
    new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    interested: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    not_interested: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    followup: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    won: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    lost: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return colors[status] || colors.new;
}

export function getStatusLabel(status) {
  const labels = {
    new: 'New',
    interested: 'Interested',
    not_interested: 'Not Interested',
    followup: 'Follow-up',
    won: 'Won',
    lost: 'Lost',
  };
  return labels[status] || status;
}

export function getPaymentStatusColor(status) {
  const colors = {
    unpaid: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  };
  return colors[status] || colors.unpaid;
}

export function getRoleLabel(role) {
  const labels = {
    admin: 'Admin',
    manager: 'Manager',
    team_lead: 'Team Lead',
    sales_rep: 'Sales Rep',
  };
  return labels[role] || role;
}

export function getRoleBadgeColor(role) {
  const colors = {
    admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    team_lead: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
    sales_rep: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  };
  return colors[role] || colors.sales_rep;
}

export function truncateText(text, maxLength = 50) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function generateInitials(name) {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export const LEAD_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

export const ACTIVE_PIPELINE_STATUSES = [
  { value: 'new', label: 'New', color: 'blue', icon: 'inbox' },
  { value: 'interested', label: 'Interested', color: 'emerald', icon: 'thumbs-up' },
  { value: 'not_interested', label: 'Not Interested', color: 'slate', icon: 'thumbs-down' },
  { value: 'followup', label: 'Follow-up', color: 'amber', icon: 'clock' },
];

export const CALL_OUTCOMES = [
  { value: 'connected', label: 'Connected' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'callback_requested', label: 'Callback Requested' },
];

export const LEAD_SOURCES = [
  'Website',
  'Referral',
  'Google Ads',
  'Facebook',
  'LinkedIn',
  'Cold Call',
  'Trade Show',
  'Partner',
];
