const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const DAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** 1250000 -> "1.250.000" */
export function groupThousands(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return value < 0 && rounded !== 0 ? `-${grouped}` : grouped;
}

/** 35000 -> "35.000 ₫" */
export function formatVND(amount: number): string {
  return `${groupThousands(amount)} ₫`;
}

/** 35000 -> "35.000đ" (dùng cho nội dung gửi Zalo) */
export function formatVNDCompact(amount: number): string {
  return `${groupThousands(amount)}đ`;
}

/** Chỉ giữ chữ số: "1.250.000 ₫" -> 1250000 */
export function parseMoneyInput(text: string): number {
  const digits = text.replace(/\D/g, '');
  if (!digits) return 0;
  return Math.min(Number(digits), 999_999_999_999);
}

export function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return date;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso) ?? new Date();
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** "2026-09-26" -> "26/09/2026" */
export function formatDate(iso: string): string {
  const date = parseISODate(iso);
  if (!date) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "2026-09-26" -> "Thứ 7" */
export function getDayOfWeek(iso: string): string {
  const date = parseISODate(iso);
  return date ? (DAY_NAMES[date.getDay()] ?? '') : '';
}

/** "2026-09-26" -> "T7" */
export function getDayShort(iso: string): string {
  const date = parseISODate(iso);
  return date ? (DAY_SHORT[date.getDay()] ?? '') : '';
}

/** "Thứ 7 – 26/09/2026" */
export function formatSessionDate(iso: string): string {
  const day = getDayOfWeek(iso);
  return day ? `${day} – ${formatDate(iso)}` : formatDate(iso);
}
