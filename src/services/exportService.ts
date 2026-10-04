import type { AppData, Level, Session, Settings } from '../types';
import { formatDate, formatVNDCompact, getDayOfWeek } from '../utils/format';
import { genderLabel } from './memberService';
import { getLevelScore, getRoundMatches, getRounds, getWaitingPlayers } from './pairingService';
import { calculateSessionPayments, getPaymentEntry } from './paymentService';

type PaymentSettings = Pick<Settings, 'halfPlayCourtMode'>;

export const PLAYER_TYPE_LABELS = { default: 'Mặc định', walk_in: 'Vãng lai' } as const;

export function playFractionLabel(fraction: number): string {
  if (fraction === 0) return 'Không chơi';
  return fraction === 0.5 ? 'Nửa buổi' : 'Cả buổi';
}

function sessionDateLine(session: Session): string {
  return `📅 ${getDayOfWeek(session.date) || session.dayOfWeek} – ${formatDate(session.date)}`;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/** Export toàn bộ một buổi chơi. */
export function exportJSON(session: Session): string {
  return JSON.stringify(session, null, 2);
}

/** Backup toàn bộ dữ liệu ứng dụng. */
export function exportAllJSON(data: AppData): string {
  return JSON.stringify({ app: 'weekend-warrior-club-manager', exportedAt: new Date().toISOString(), ...data }, null, 2);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV bảng tính tiền từng người (có BOM UTF-8 để Excel hiển thị đúng tiếng Việt). */
export function exportCSV(session: Session, settings: PaymentSettings): string {
  const { players, reconciliation } = calculateSessionPayments(session, settings);
  const playerById = new Map(session.players.map((p) => [p.id, p]));
  const header = [
    'STT',
    'Tên',
    'Loại',
    'Giới tính',
    'Trình độ',
    'Tham gia',
    'Tiền sân',
    'Tiền cầu',
    'Đóng góp cầu',
    'Thành tiền',
    'Đã ứng',
    'Đã thu',
    'Còn thiếu',
    'Dư',
    'Người giới thiệu',
    'Ghi chú',
  ];
  const rows = players.map((payment, index) => {
    const player = playerById.get(payment.playerId);
    return [
      index + 1,
      payment.name,
      PLAYER_TYPE_LABELS[payment.playerType],
      genderLabel(player?.gender ?? null),
      player?.level ?? '',
      playFractionLabel(payment.playFraction),
      Math.round(payment.courtShare),
      Math.round(payment.shuttleShare),
      payment.shuttleContribution,
      payment.roundedPayable,
      payment.advancePayment,
      payment.paidAmount,
      payment.outstanding,
      payment.overpaid,
      payment.referrerPlayerId ? (playerById.get(payment.referrerPlayerId)?.name ?? '') : '',
      getPaymentEntry(session, payment.playerId).note,
    ];
  });
  const total = [
    '',
    'TỔNG',
    '',
    '',
    '',
    '',
    reconciliation.totalCourt,
    reconciliation.totalShuttle,
    reconciliation.totalContribution,
    reconciliation.totalPayable,
    reconciliation.totalAdvance,
    reconciliation.totalPaid,
    reconciliation.totalOutstanding,
    reconciliation.totalOverpaid,
    '',
    `${formatDate(session.date)} ${session.time}`,
  ];
  const lines = [header, ...rows, total].map((row) => row.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Nội dung gửi Zalo
// ---------------------------------------------------------------------------

/**
 * Nội dung thu tiền gửi nhóm Zalo. Mỗi dòng là số tiền người đó cần đóng
 * (đã trừ tiền ứng trước); không chứa thông tin kỹ thuật.
 */
export function generateZaloPaymentText(session: Session, settings: PaymentSettings): string {
  const { rows } = calculateSessionPayments(session, settings);
  let total = 0;
  const lines = rows.map((row) => {
    const due = Math.max(row.roundedPayable - row.advancePayment, 0);
    total += due;
    const extras: string[] = [];
    if (row.guestCount > 0) extras.push(`bao gồm ${row.guestCount} bạn`);
    if (row.overpaid > 0) extras.push(`dư ${formatVNDCompact(row.overpaid)}`);
    else if (due > 0 && row.outstanding === 0) extras.push('đã đóng ✅');
    else if (row.paidAmount > 0) extras.push(`đã đóng ${formatVNDCompact(row.paidAmount)}, còn ${formatVNDCompact(row.outstanding)}`);
    return `${row.name}: ${formatVNDCompact(due)}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`;
  });
  return ['💰 THU TIỀN CẦU LÔNG', sessionDateLine(session), '', ...lines, '', `Tổng: ${formatVNDCompact(total)}`].join('\n');
}

export interface PairingTextOptions {
  levels: Level[];
  showStrength?: boolean;
}

export function generateZaloPairingText(session: Session, options: PairingTextOptions): string {
  const byId = new Map(session.players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? '?';
  const strength = (ids: [string, string]) =>
    getLevelScore(byId.get(ids[0])?.level, options.levels) + getLevelScore(byId.get(ids[1])?.level, options.levels);

  const lines: string[] = ['🏸 XẾP CẶP CẦU LÔNG', sessionDateLine(session)];
  const rounds = getRounds(session.pairings);
  for (const round of rounds) {
    const matches = getRoundMatches(session.pairings, round);
    // Chỉ ghi tiêu đề lượt khi buổi có nhiều lượt.
    if (rounds.length > 1) lines.push('', `🔁 LƯỢT ${round}`);
    const courts = [...new Set(matches.map((m) => m.court))].sort((a, b) => a - b);
    for (const court of courts) {
      lines.push('', `🏟 SÂN ${court}`);
      for (const match of matches.filter((m) => m.court === court)) {
        lines.push('', `Trận ${match.matchNumber}`);
        lines.push(`${name(match.teamA[0])} + ${name(match.teamA[1])}`);
        lines.push('VS');
        lines.push(`${name(match.teamB[0])} + ${name(match.teamB[1])}`);
        if (options.showStrength) lines.push(`(${strength(match.teamA)} VS ${strength(match.teamB)})`);
      }
    }
    const waiting = getWaitingPlayers(session.players, session.pairings, round);
    if (waiting.length > 0) {
      lines.push('', `⚠ ${rounds.length > 1 ? 'Chờ lượt này' : 'Chưa được xếp'}: ${waiting.map((p) => p.name).join(', ')}`);
    }
  }
  return lines.join('\n');
}
