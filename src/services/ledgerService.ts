import type { PaymentEntry, Session, Settings } from '../types';
import { formatDate, formatVNDCompact, getDayShort } from '../utils/format';
import { getPlayerKey } from './pairingService';
import {
  applyPaidToRow,
  calculateOutstanding,
  calculateSessionPayments,
  type Outstanding,
  type PaymentRow,
  type PaymentStatus,
} from './paymentService';

type PaymentSettings = Pick<Settings, 'halfPlayCourtMode'>;

// ---------------------------------------------------------------------------
// Bảng thu gộp nhiều buổi & công nợ theo người
// ---------------------------------------------------------------------------

export interface CombinedColumn {
  sessionId: string;
  date: string;
  /** "T7", hoặc "T7 26/09" khi có nhiều buổi cùng thứ. */
  label: string;
}

export interface CombinedCell {
  sessionId: string;
  row: PaymentRow;
}

export interface CombinedRow extends Outstanding {
  /** Định danh xuyên buổi: memberId, hoặc tên với người vãng lai. */
  key: string;
  name: string;
  cells: CombinedCell[];
  sessionCount: number;
  roundedPayable: number;
  advancePayment: number;
  paidAmount: number;
  shuttleContribution: number;
  /** Số buổi còn thiếu tiền. */
  unpaidSessions: number;
  status: PaymentStatus;
  notes: string[];
}

export interface CombinedTotals extends Outstanding {
  totalCost: number;
  roundedPayable: number;
  advancePayment: number;
  paidAmount: number;
  shuttleContribution: number;
}

export interface CombinedPayments {
  columns: CombinedColumn[];
  rows: CombinedRow[];
  totals: CombinedTotals;
}

function buildColumns(sessions: Session[]): CombinedColumn[] {
  const dayCounts = new Map<string, number>();
  for (const session of sessions) {
    const day = getDayShort(session.date);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  return sessions.map((session) => {
    const day = getDayShort(session.date);
    const label = (dayCounts.get(day) ?? 0) > 1 ? `${day} ${formatDate(session.date).slice(0, 5)}` : day;
    return { sessionId: session.id, date: session.date, label };
  });
}

/**
 * Gộp bảng thu của nhiều buổi thành một bảng: mỗi người một dòng, mỗi buổi một nhóm cột.
 * Tiền từng buổi vẫn được tính và làm tròn riêng theo từng buổi rồi mới cộng lại;
 * phần dư ở buổi này được bù cho phần thiếu ở buổi khác.
 */
export function calculateCombinedPayments(sessions: Session[], settings: PaymentSettings): CombinedPayments {
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const columns = buildColumns(ordered);
  const labelOf = new Map(columns.map((column) => [column.sessionId, column.label]));
  const groups = new Map<string, { name: string; cells: CombinedCell[] }>();

  for (const session of ordered) {
    const playerById = new Map(session.players.map((player) => [player.id, player]));
    for (const row of calculateSessionPayments(session, settings).rows) {
      const owner = playerById.get(row.key);
      if (!owner) continue;
      const key = getPlayerKey(owner);
      const group = groups.get(key) ?? { name: row.name, cells: [] };
      group.name = row.name; // tên ở buổi gần nhất
      group.cells.push({ sessionId: session.id, row });
      groups.set(key, group);
    }
  }

  const rows: CombinedRow[] = [...groups.entries()].map(([key, group]) => {
    const sum = (pick: (row: PaymentRow) => number) => group.cells.reduce((total, cell) => total + pick(cell.row), 0);
    const roundedPayable = sum((row) => row.roundedPayable);
    const advancePayment = sum((row) => row.advancePayment);
    const paidAmount = sum((row) => row.paidAmount);
    const outstanding = calculateOutstanding(roundedPayable, advancePayment, paidAmount);
    const collected = advancePayment + paidAmount;
    const status: PaymentStatus =
      outstanding.overpaid > 0 ? 'overpaid' : outstanding.outstanding === 0 ? 'paid' : collected > 0 ? 'partial' : 'unpaid';
    const notes = group.cells.flatMap((cell) =>
      cell.row.notes.map((note) => (ordered.length > 1 ? `${labelOf.get(cell.sessionId)}: ${note}` : note)),
    );
    return {
      key,
      name: group.name,
      cells: group.cells,
      sessionCount: group.cells.length,
      roundedPayable,
      advancePayment,
      paidAmount,
      shuttleContribution: sum((row) => row.shuttleContribution),
      unpaidSessions: group.cells.filter((cell) => cell.row.outstanding > 0).length,
      status,
      notes,
      ...outstanding,
    };
  });

  const total = (pick: (row: CombinedRow) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  return {
    columns,
    rows,
    totals: {
      totalCost: ordered.reduce((sum, session) => sum + session.courtCost + session.shuttleCost, 0),
      roundedPayable: total((row) => row.roundedPayable),
      advancePayment: total((row) => row.advancePayment),
      paidAmount: total((row) => row.paidAmount),
      shuttleContribution: total((row) => row.shuttleContribution),
      remaining: total((row) => row.remaining),
      outstanding: total((row) => row.outstanding),
      overpaid: total((row) => row.overpaid),
    },
  };
}

/** Công nợ theo người trên toàn bộ các buổi, người nợ nhiều nhất xếp trước. */
export function calculateMemberDebts(sessions: Session[], settings: PaymentSettings): CombinedPayments {
  const combined = calculateCombinedPayments(sessions, settings);
  const rows = [...combined.rows].sort(
    (a, b) => b.outstanding - a.outstanding || b.overpaid - a.overpaid || a.name.localeCompare(b.name, 'vi'),
  );
  return { ...combined, rows };
}

/**
 * Thu đủ toàn bộ khoản còn thiếu của một người ở mọi buổi chưa khoá.
 * Trả về các buổi đã thay đổi (để lưu) và số buổi bị bỏ qua vì đang khoá thu tiền.
 */
export function settleCombinedRow(
  row: CombinedRow,
  sessions: Session[],
  settings: PaymentSettings,
): { updated: Session[]; skippedLocked: number } {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const updated: Session[] = [];
  let skippedLocked = 0;
  for (const cell of row.cells) {
    const session = byId.get(cell.sessionId);
    if (!session || cell.row.outstanding <= 0) continue;
    if (session.paymentLocked) {
      skippedLocked += 1;
      continue;
    }
    const full = Math.max(cell.row.roundedPayable - cell.row.advancePayment, 0);
    const payments: PaymentEntry[] = applyPaidToRow(session, settings, cell.row, full);
    updated.push({ ...session, payments });
  }
  return { updated, skippedLocked };
}

/** Nội dung Zalo cho bảng thu gộp nhiều buổi. */
export function generateZaloCombinedText(sessions: Session[], settings: PaymentSettings): string {
  const { columns, rows } = calculateCombinedPayments(sessions, settings);
  let total = 0;
  const lines = rows.map((row) => {
    const due = Math.max(row.roundedPayable - row.advancePayment, 0);
    total += due;
    const extras: string[] = [];
    const guests = Math.max(...row.cells.map((cell) => cell.row.guestCount));
    if (guests > 0) extras.push(`bao gồm ${guests} bạn`);
    if (row.overpaid > 0) extras.push(`dư ${formatVNDCompact(row.overpaid)}`);
    else if (due > 0 && row.outstanding === 0) extras.push('đã đóng ✅');
    else if (row.paidAmount > 0) extras.push(`đã đóng ${formatVNDCompact(row.paidAmount)}, còn ${formatVNDCompact(row.outstanding)}`);
    return `${row.name}: ${formatVNDCompact(due)}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`;
  });
  const dates = columns.map((column) => `${getDayShort(column.date)} ${formatDate(column.date)}`).join(' + ');
  return ['💰 THU TIỀN CẦU LÔNG', `📅 ${dates}`, '', ...lines, '', `Tổng: ${formatVNDCompact(total)}`].join('\n');
}
