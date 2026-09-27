// Display formatting for values received from the API. Missing values render as an em dash;
// callers should also expose "not available" to screen readers.

export const MISSING_VALUE = '—';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const DAY_SHORT_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function formatCompactNumber(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${trimZero((value / size).toFixed(1))}${suffix}`;
  }
  return String(Math.round(value));
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return MISSING_VALUE;
  return `${trimZero(value.toFixed(digits))}%`;
}

export type ChangeDirection = 'up' | 'down' | 'flat';

export function describeChange(percent: number): { text: string; direction: ChangeDirection } {
  const direction: ChangeDirection = percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
  const sign = percent > 0 ? '+' : '';
  return { text: `${sign}${trimZero(percent.toFixed(1))}%`, direction };
}

export function formatHour(hour: number): string {
  const normalized = hour % 24;
  const suffix = normalized < 12 ? 'am' : 'pm';
  const twelveHour = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelveHour}${suffix}`;
}

export function formatHourRange(startHour: number, endHour: number): string {
  return `${formatHour(startHour)}–${formatHour(endHour)}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return MISSING_VALUE;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0] ?? ''];
  return letters.join('').toUpperCase();
}

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return MISSING_VALUE;

  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(isoString);
}

function trimZero(value: string): string {
  return value.replace(/\.0$/, '');
}

/** Shown wherever the platform did not provide a metric. Distinct from 0, which is a real value. */
export const NOT_AVAILABLE = 'Not available';

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "+312%" / "−45%" / "+18,960%" for differences from a baseline. */
export function formatSignedPercent(value: number): string {
  const abs = Math.abs(value);
  const text = abs >= 100 ? groupThousands(String(Math.round(abs))) : trimZero(abs.toFixed(1));
  return value > 0 ? `+${text}%` : value < 0 ? `−${text}%` : '0%';
}

/** How many times the average a post reached, from its percent difference (+18,960% → 190.6). */
function multipleOfAverage(percent: number): number {
  return 1 + percent / 100;
}

function formatMultiple(multiple: number): string {
  return multiple >= 100 ? groupThousands(String(Math.round(multiple))) : trimZero(multiple.toFixed(1));
}

/**
 * Short label for chips. Differences of +900% or more read as a multiple ("191× avg"), which stays
 * readable at any magnitude; smaller ones stay percentages ("+45% vs avg", "−98% vs avg").
 */
export function formatVsAverageCompact(percent: number): string {
  if (percent >= 900) return `${formatMultiple(multipleOfAverage(percent))}× avg`;
  return `${formatSignedPercent(percent)} vs avg`;
}

/** Full wording for detail screens and screen readers: "18,960% above average · 191× the account average". */
export function describeVsAverage(percent: number): string {
  const abs = formatSignedPercent(percent).replace(/^[+−]/, '');
  if (percent === 0) return 'Same as the account average';
  const direction = percent > 0 ? `${abs} above average` : `${abs} below average`;
  return percent >= 900 ? `${direction} · ${formatMultiple(multipleOfAverage(percent))}× the account average` : direction;
}

/** Compact number for accessibility labels: "1.2K likes" or "likes not available". */
export function describeMetric(value: number | null, label: string): string {
  return value === null ? `${label} not available` : `${formatCompactNumber(value)} ${label}`;
}
