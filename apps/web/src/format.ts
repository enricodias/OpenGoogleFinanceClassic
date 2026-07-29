export function formatCurrency(value: number | null, currency = 'USD'): string {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat(undefined, {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

export function formatCompactNumber(value: number | null): string {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    notation: 'compact',
  }).format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null) {
    return '—';
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatRelativeTime(timestamp: string): string {
  const minutes = Math.round((Date.now() - Date.parse(timestamp)) / 60000);

  if (minutes < 2) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}
