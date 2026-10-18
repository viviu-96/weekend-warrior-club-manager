import type { AppData, Level, Session, Settings } from '../types';
import { formatDate, getDayOfWeek, getDayShort } from '../utils/format';
import { genderLabel } from './memberService';
import { getLevelScore, getMatchWinner, getRoundMatches, getRounds, getWaitingPlayers } from './pairingService';
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
    'Giảm cầu (%)',
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
      payment.shuttleDiscount,
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
// Copy vào Excel (TSV: cột cách nhau bằng tab, Excel tự tách khi dán)
// ---------------------------------------------------------------------------

/** Ghép bảng thành TSV; bỏ tab/xuống dòng trong ô để không làm lệch cột. */
export function toTSV(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((cell) => String(cell).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}

/** Bảng thu tiền của một buổi, cùng các cột với bảng trên màn hình; số tiền để dạng số. */
export function generatePaymentSheetTSV(session: Session, settings: PaymentSettings): string {
  const { rows } = calculateSessionPayments(session, settings);
  const day = getDayShort(session.date);
  const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((s, row) => s + pick(row), 0);
  return toTSV([
    ['STT', 'Tên', `Tiền sân ${day}`, `Tiền cầu ${day}`, 'Góp cầu', 'Thành tiền', 'Đã ứng', 'Đã thu', 'Còn thiếu', 'Dư', 'Ghi chú'],
    ...rows.map((row, index) => [
      index + 1,
      row.name,
      Math.round(row.courtShare),
      Math.round(row.shuttleShare),
      row.shuttleContribution,
      row.roundedPayable,
      row.advancePayment,
      row.paidAmount,
      row.outstanding,
      row.overpaid,
      row.notes.join(' • '),
    ]),
    [
      '',
      `Tổng (${rows.length} người)`,
      session.courtCost,
      session.shuttleCost,
      sum((row) => row.shuttleContribution),
      sum((row) => row.roundedPayable),
      sum((row) => row.advancePayment),
      sum((row) => row.paidAmount),
      sum((row) => row.outstanding),
      sum((row) => row.overpaid),
      '',
    ],
  ]);
}

// ---------------------------------------------------------------------------
// Nội dung kết quả xếp cặp
// ---------------------------------------------------------------------------

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
        if (getMatchWinner(match) !== null) lines.push(`Tỉ số: ${match.scoreA} – ${match.scoreB}`);
      }
    }
    const waiting = getWaitingPlayers(session.players, session.pairings, round);
    if (waiting.length > 0) {
      lines.push('', `⚠ ${rounds.length > 1 ? 'Chờ lượt này' : 'Chưa được xếp'}: ${waiting.map((p) => p.name).join(', ')}`);
    }
  }
  return lines.join('\n');
}
