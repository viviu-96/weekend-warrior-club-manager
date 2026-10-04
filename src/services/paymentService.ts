import type { PaymentEntry, PlayerType, PlayFraction, Session, Settings } from '../types';
import { formatVND } from '../utils/format';
import { roundPayment } from './roundingService';

type PaymentSettings = Pick<Settings, 'halfPlayCourtMode'>;

export function createDefaultPayment(playerId: string): PaymentEntry {
  return {
    playerId,
    playFraction: 1,
    payCourt: true,
    payShuttle: true,
    advancePayment: 0,
    shuttleContribution: 0,
    paidAmount: 0,
    referrerPlayerId: null,
    note: '',
  };
}

export function getPaymentEntry(session: Session, playerId: string): PaymentEntry {
  return session.payments.find((entry) => entry.playerId === playerId) ?? createDefaultPayment(playerId);
}

// ---------------------------------------------------------------------------
// Chia tiền
// ---------------------------------------------------------------------------

/**
 * Chia `total` cho danh sách người, mỗi người có hệ số 0, 0.5 hoặc 1.
 * - Suất chuẩn = total / số người có hệ số > 0.
 * - Người hệ số < 1 trả (suất chuẩn × hệ số).
 * - Phần còn lại chia đều cho những người hệ số 1.
 * - Nếu không ai hệ số 1 thì chia theo tỉ lệ hệ số.
 */
export function splitCost(total: number, fractions: number[]): number[] {
  const payers = fractions.filter((f) => f > 0);
  if (payers.length === 0 || total <= 0) return fractions.map(() => 0);

  const fullCount = payers.filter((f) => f >= 1).length;
  if (fullCount === 0) {
    const sum = payers.reduce((s, f) => s + f, 0);
    return fractions.map((f) => (f > 0 ? (total * f) / sum : 0));
  }
  const base = total / payers.length;
  const partialTotal = payers.filter((f) => f < 1).reduce((s, f) => s + base * f, 0);
  const fullShare = (total - partialTotal) / fullCount;
  return fractions.map((f) => (f <= 0 ? 0 : f >= 1 ? fullShare : base * f));
}

/** Hệ số chịu tiền sân: người có tên trong danh sách vẫn chịu sân dù không chơi. */
export function getCourtFraction(entry: PaymentEntry, settings: PaymentSettings): number {
  if (!entry.payCourt) return 0;
  return settings.halfPlayCourtMode === 'half' && entry.playFraction === 0.5 ? 0.5 : 1;
}

/** Hệ số chịu tiền cầu: chỉ người thực sự chơi mới chịu tiền cầu. */
export function getShuttleFraction(entry: PaymentEntry): number {
  if (!entry.payShuttle || entry.playFraction <= 0) return 0;
  return entry.playFraction;
}

function sharesByPlayer(session: Session, total: number, fractionOf: (entry: PaymentEntry) => number) {
  const entries = session.players.map((player) => getPaymentEntry(session, player.id));
  const shares = splitCost(total, entries.map(fractionOf));
  return new Map(entries.map((entry, index) => [entry.playerId, shares[index] ?? 0]));
}

export function calculateCourtShares(session: Session, settings: PaymentSettings): Map<string, number> {
  return sharesByPlayer(session, session.courtCost, (entry) => getCourtFraction(entry, settings));
}

export function calculateShuttleShares(session: Session): Map<string, number> {
  return sharesByPlayer(session, session.shuttleCost, getShuttleFraction);
}

export function calculateCourtShare(playerId: string, session: Session, settings: PaymentSettings): number {
  return calculateCourtShares(session, settings).get(playerId) ?? 0;
}

export function calculateShuttleShare(playerId: string, session: Session): number {
  return calculateShuttleShares(session).get(playerId) ?? 0;
}

// ---------------------------------------------------------------------------
// Tiền từng người
// ---------------------------------------------------------------------------

export interface Outstanding {
  /** roundedPayable - advancePayment - paidAmount (có thể âm). */
  remaining: number;
  /** Còn thiếu (>= 0). */
  outstanding: number;
  /** Dư (>= 0). */
  overpaid: number;
}

export function calculateOutstanding(roundedPayable: number, advancePayment: number, paidAmount: number): Outstanding {
  const remaining = roundedPayable - advancePayment - paidAmount;
  return { remaining, outstanding: Math.max(remaining, 0), overpaid: Math.max(-remaining, 0) };
}

export interface PlayerPayment extends Outstanding {
  playerId: string;
  name: string;
  playerType: PlayerType;
  playFraction: PlayFraction;
  courtShare: number;
  shuttleShare: number;
  /** courtShare + shuttleShare, chưa làm tròn. */
  grossAmount: number;
  shuttleContribution: number;
  /** grossAmount - shuttleContribution, chưa làm tròn. */
  netAmount: number;
  /** Số tiền phải đóng sau khi làm tròn. */
  roundedPayable: number;
  advancePayment: number;
  paidAmount: number;
  /** Người giới thiệu gốc (đã kiểm tra hợp lệ), null nếu không có. */
  referrerPlayerId: string | null;
  note: string;
}

/** Tìm người giới thiệu gốc; bỏ qua tham chiếu không tồn tại, tự giới thiệu hoặc vòng lặp. */
export function resolveReferrers(session: Session): Map<string, string | null> {
  const playerIds = new Set(session.players.map((p) => p.id));
  const direct = new Map(session.payments.map((entry) => [entry.playerId, entry.referrerPlayerId]));
  const result = new Map<string, string | null>();
  for (const player of session.players) {
    const visited = new Set([player.id]);
    let current = direct.get(player.id) ?? null;
    let root: string | null = null;
    while (current && playerIds.has(current)) {
      if (visited.has(current)) {
        root = null;
        break;
      }
      visited.add(current);
      root = current;
      current = direct.get(current) ?? null;
    }
    result.set(player.id, root);
  }
  return result;
}

/**
 * Tính tiền một người: sân + cầu -> trừ đóng góp cầu -> làm tròn -> còn thiếu / dư.
 * Việc làm tròn luôn thực hiện trên số tiền của từng người, không làm tròn tổng trước.
 */
export function calculatePlayerPayment(playerId: string, session: Session, settings: PaymentSettings): PlayerPayment {
  const payment = calculateSessionPlayerPayments(session, settings).find((item) => item.playerId === playerId);
  if (!payment) throw new Error(`Không tìm thấy người chơi ${playerId} trong buổi chơi.`);
  return payment;
}

export function calculateSessionPlayerPayments(session: Session, settings: PaymentSettings): PlayerPayment[] {
  const courtShares = calculateCourtShares(session, settings);
  const shuttleShares = calculateShuttleShares(session);
  const referrers = resolveReferrers(session);

  return session.players.map((player) => {
    const entry = getPaymentEntry(session, player.id);
    const courtShare = courtShares.get(player.id) ?? 0;
    const shuttleShare = shuttleShares.get(player.id) ?? 0;
    const grossAmount = courtShare + shuttleShare;
    const netAmount = grossAmount - entry.shuttleContribution;
    const roundedPayable = roundPayment(netAmount);
    return {
      playerId: player.id,
      name: player.name,
      playerType: player.playerType,
      playFraction: entry.playFraction,
      courtShare,
      shuttleShare,
      grossAmount,
      shuttleContribution: entry.shuttleContribution,
      netAmount,
      roundedPayable,
      advancePayment: entry.advancePayment,
      paidAmount: entry.paidAmount,
      referrerPlayerId: referrers.get(player.id) ?? null,
      note: entry.note,
      ...calculateOutstanding(roundedPayable, entry.advancePayment, entry.paidAmount),
    };
  });
}

// ---------------------------------------------------------------------------
// Bảng thu (gộp khách vào người giới thiệu)
// ---------------------------------------------------------------------------

export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'overpaid';

export interface PaymentRow extends Outstanding {
  /** playerId của người đứng tên dòng. */
  key: string;
  name: string;
  /** Người đứng tên + các khách được gộp. */
  playerIds: string[];
  guestCount: number;
  courtShare: number;
  shuttleShare: number;
  shuttleContribution: number;
  roundedPayable: number;
  advancePayment: number;
  paidAmount: number;
  status: PaymentStatus;
  notes: string[];
}

function statusOf(row: Outstanding, collected: number): PaymentStatus {
  if (row.overpaid > 0) return 'overpaid';
  if (row.outstanding === 0) return 'paid';
  return collected > 0 ? 'partial' : 'unpaid';
}

function describePlayer(payment: PlayerPayment, nameById: Map<string, string>, merged: boolean): string[] {
  const notes: string[] = [];
  if (payment.playFraction === 0) notes.push(payment.courtShare > 0 ? 'Không chơi – chỉ tính sân' : 'Không chơi');
  if (payment.playFraction === 0.5) notes.push('Chơi nửa buổi');
  if (payment.shuttleContribution > 0) notes.push(`Đã đóng góp cầu – ${formatVND(payment.shuttleContribution)}`);
  if (!merged && payment.referrerPlayerId) {
    notes.push(`Khách của ${nameById.get(payment.referrerPlayerId) ?? '?'}`);
  }
  if (payment.note.trim()) notes.push(payment.note.trim());
  return notes;
}

/**
 * Tạo bảng thu. Gộp khách vào người giới thiệu SAU KHI từng người đã được làm tròn:
 * dòng của người giới thiệu = tiền của họ + tiền của tất cả khách.
 */
export function mergeGuestPayment(payments: PlayerPayment[], merge: boolean): PaymentRow[] {
  const nameById = new Map(payments.map((p) => [p.playerId, p.name]));
  const groups = new Map<string, PlayerPayment[]>();
  for (const payment of payments) {
    const owner = merge && payment.referrerPlayerId ? payment.referrerPlayerId : payment.playerId;
    const group = groups.get(owner) ?? [];
    group.push(payment);
    groups.set(owner, group);
  }

  const rows: PaymentRow[] = [];
  for (const payment of payments) {
    const group = groups.get(payment.playerId);
    if (!group) continue; // đã gộp vào người giới thiệu
    // Người đứng tên luôn ở đầu nhóm.
    const members = [payment, ...group.filter((item) => item.playerId !== payment.playerId)];
    const sum = (pick: (item: PlayerPayment) => number) => members.reduce((s, item) => s + pick(item), 0);
    const roundedPayable = sum((item) => item.roundedPayable);
    const advancePayment = sum((item) => item.advancePayment);
    const paidAmount = sum((item) => item.paidAmount);
    const outstanding = calculateOutstanding(roundedPayable, advancePayment, paidAmount);
    const guestCount = members.length - 1;

    const notes: string[] = [];
    if (guestCount > 0) notes.push(`Bao gồm ${guestCount} bạn`);
    for (const member of members) {
      const own = describePlayer(member, nameById, merge);
      notes.push(...(member === payment ? own : own.map((note) => `${member.name}: ${note}`)));
    }

    rows.push({
      key: payment.playerId,
      name: payment.name,
      playerIds: members.map((item) => item.playerId),
      guestCount,
      courtShare: sum((item) => item.courtShare),
      shuttleShare: sum((item) => item.shuttleShare),
      shuttleContribution: sum((item) => item.shuttleContribution),
      roundedPayable,
      advancePayment,
      paidAmount,
      ...outstanding,
      status: statusOf(outstanding, advancePayment + paidAmount),
      notes,
    });
  }
  return rows;
}

/**
 * Ghi nhận "Đã thu" cho một dòng của bảng thu. Với dòng gộp, tiền được phân bổ lần lượt
 * cho từng người trong nhóm theo số còn phải đóng; phần dư ghi cho người đứng tên.
 */
export function applyPaidToRow(session: Session, settings: PaymentSettings, row: PaymentRow, amount: number): PaymentEntry[] {
  const payments = calculateSessionPlayerPayments(session, settings);
  const byId = new Map(payments.map((p) => [p.playerId, p]));
  const allocation = new Map<string, number>();
  let left = Math.max(0, amount);
  for (const playerId of row.playerIds) {
    const payment = byId.get(playerId);
    const due = payment ? Math.max(payment.roundedPayable - payment.advancePayment, 0) : 0;
    const take = Math.min(due, left);
    allocation.set(playerId, take);
    left -= take;
  }
  allocation.set(row.key, (allocation.get(row.key) ?? 0) + left);
  return session.players.map((player) => {
    const entry = getPaymentEntry(session, player.id);
    const paid = allocation.get(player.id);
    return paid === undefined ? entry : { ...entry, paidAmount: paid };
  });
}

/** Đánh dấu mọi người đã đóng đủ: "Đã thu" = số còn phải đóng sau khi trừ tiền ứng. Người đã đóng dư được giữ nguyên. */
export function markAllPaid(session: Session, settings: PaymentSettings): PaymentEntry[] {
  const byId = new Map(calculateSessionPlayerPayments(session, settings).map((p) => [p.playerId, p]));
  return session.players.map((player) => {
    const entry = getPaymentEntry(session, player.id);
    const payment = byId.get(player.id);
    const due = payment ? Math.max(payment.roundedPayable - payment.advancePayment, 0) : 0;
    return { ...entry, paidAmount: Math.max(entry.paidAmount, due) };
  });
}

// ---------------------------------------------------------------------------
// Đối soát
// ---------------------------------------------------------------------------

export interface Reconciliation {
  totalCourt: number;
  totalShuttle: number;
  totalCost: number;
  /** Tổng phải thu bằng tiền (sau làm tròn, đã trừ đóng góp cầu). */
  totalPayable: number;
  totalContribution: number;
  totalAdvance: number;
  totalPaid: number;
  /** Đã thu = đã ứng + đã thu thêm. */
  totalCollected: number;
  totalOutstanding: number;
  totalOverpaid: number;
  /** Phần tăng thêm do làm tròn từng người. */
  roundingAdjustment: number;
  /** Chi phí chưa có ai chịu (không có người tính sân / tính cầu). */
  unallocatedCourt: number;
  unallocatedShuttle: number;
  /** Tổng phải thu + đóng góp cầu - tổng chi. */
  difference: number;
}

export function reconcileSession(session: Session, settings: PaymentSettings): Reconciliation {
  const payments = calculateSessionPlayerPayments(session, settings);
  const sum = (pick: (item: PlayerPayment) => number) => payments.reduce((s, item) => s + pick(item), 0);
  const totalCost = session.courtCost + session.shuttleCost;
  const totalPayable = sum((p) => p.roundedPayable);
  const totalContribution = sum((p) => p.shuttleContribution);
  const totalAdvance = sum((p) => p.advancePayment);
  const totalPaid = sum((p) => p.paidAmount);
  const clean = (value: number) => (Math.abs(value) < 0.005 ? 0 : Math.round(value * 100) / 100);
  return {
    totalCourt: session.courtCost,
    totalShuttle: session.shuttleCost,
    totalCost,
    totalPayable,
    totalContribution,
    totalAdvance,
    totalPaid,
    totalCollected: totalAdvance + totalPaid,
    totalOutstanding: sum((p) => p.outstanding),
    totalOverpaid: sum((p) => p.overpaid),
    roundingAdjustment: clean(sum((p) => p.roundedPayable - p.netAmount)),
    unallocatedCourt: clean(session.courtCost - sum((p) => p.courtShare)),
    unallocatedShuttle: clean(session.shuttleCost - sum((p) => p.shuttleShare)),
    difference: clean(totalPayable + totalContribution - totalCost),
  };
}

export interface SessionPayments {
  players: PlayerPayment[];
  rows: PaymentRow[];
  reconciliation: Reconciliation;
}

export function calculateSessionPayments(session: Session, settings: PaymentSettings): SessionPayments {
  const players = calculateSessionPlayerPayments(session, settings);
  return {
    players,
    rows: mergeGuestPayment(players, session.mergeGuests),
    reconciliation: reconcileSession(session, settings),
  };
}
