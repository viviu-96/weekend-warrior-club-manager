import { DEFAULT_SETTINGS } from '../data/defaultSettings';
import type {
  AppData,
  Gender,
  Level,
  Match,
  Member,
  PaymentEntry,
  PlayFraction,
  Session,
  SessionPlayer,
  Settings,
  ValidationIssue,
} from '../types';
import { getDayOfWeek, parseISODate } from '../utils/format';
import { normalizeText } from '../utils/text';
import { getEligiblePlayers, getLevelScore } from './pairingService';
import { getPaymentEntry } from './paymentService';
import { syncPayments } from './sessionService';

// ---------------------------------------------------------------------------
// Kiểm tra nghiệp vụ (hiển thị cảnh báo trên UI)
// ---------------------------------------------------------------------------

export function validateMemberInput(input: { name: string; gender: string; level: string }, levels: Level[]): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push('Vui lòng nhập tên.');
  if (input.gender !== 'male' && input.gender !== 'female') errors.push('Vui lòng chọn giới tính.');
  if (!levels.some((level) => level.name === input.level)) errors.push('Vui lòng chọn trình độ.');
  return errors;
}

/** Kiểm tra danh sách người chơi của buổi. */
export function validatePlayers(session: Session, members: Member[], levels: Level[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const memberIds = new Set(members.map((m) => m.id));
  const seenMembers = new Map<string, string>();
  const seenWalkIns = new Map<string, string>();

  for (const player of session.players) {
    const label = player.name.trim() || '(chưa có tên)';
    const error = (code: string, message: string) =>
      issues.push({ severity: 'error', code, message, playerId: player.id });
    const warning = (code: string, message: string) =>
      issues.push({ severity: 'warning', code, message, playerId: player.id });

    if (!player.name.trim()) error('NAME_EMPTY', 'Có người chơi chưa nhập tên.');
    if (!player.gender) error('GENDER_EMPTY', `${label}: chưa chọn giới tính.`);
    if (!player.level) error('LEVEL_EMPTY', `${label}: chưa chọn trình độ.`);
    else if (getLevelScore(player.level, levels) <= 0) {
      error('LEVEL_UNKNOWN', `${label}: trình độ "${player.level}" không có trong cài đặt.`);
    }

    if (player.memberId) {
      if (!memberIds.has(player.memberId)) {
        warning('MEMBER_MISSING', `${label}: thành viên gốc không còn trong danh sách thành viên.`);
      }
      if (seenMembers.has(player.memberId)) error('DUPLICATE_PLAYER', `${label}: bị thêm trùng trong danh sách.`);
      seenMembers.set(player.memberId, player.id);
    } else if (player.name.trim()) {
      const key = `${normalizeText(player.name)}|${player.gender ?? ''}|${player.level ?? ''}`;
      if (seenWalkIns.has(key)) warning('DUPLICATE_WALK_IN', `${label}: có vẻ bị nhập trùng (cùng tên, giới tính, trình độ).`);
      seenWalkIns.set(key, player.id);
    }
  }
  return issues;
}

/** Kiểm tra trước khi xếp cặp. */
export function validateForPairing(session: Session, members: Member[], levels: Level[]): ValidationIssue[] {
  const issues = validatePlayers(session, members, levels);
  if (session.players.length === 0) {
    issues.unshift({ severity: 'error', code: 'NO_PLAYERS', message: 'Chưa có người chơi nào trong buổi.' });
    return issues;
  }
  const eligible = getEligiblePlayers(session.players, levels);
  if (eligible.length < 4) {
    issues.push({
      severity: 'error',
      code: 'NOT_ENOUGH_PLAYERS',
      message: `Cần ít nhất 4 người để tạo trận (hiện có ${eligible.length} người sẵn sàng).`,
    });
  }
  return issues;
}

/** Kiểm tra dữ liệu tính tiền. */
export function validatePayments(session: Session): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (session.players.length === 0) {
    issues.push({ severity: 'error', code: 'NO_PLAYERS', message: 'Chưa có người chơi nào trong buổi.' });
    return issues;
  }
  if (session.courtCost < 0) issues.push({ severity: 'error', code: 'COURT_NEGATIVE', message: 'Tiền sân không được âm.' });
  if (session.shuttleCost < 0) issues.push({ severity: 'error', code: 'SHUTTLE_NEGATIVE', message: 'Tiền cầu không được âm.' });

  const playerIds = new Set(session.players.map((p) => p.id));
  const entries = session.players.map((player) => ({ player, entry: getPaymentEntry(session, player.id) }));
  for (const { player, entry } of entries) {
    const push = (severity: ValidationIssue['severity'], code: string, message: string) =>
      issues.push({ severity, code, message, playerId: player.id });
    if (entry.referrerPlayerId !== null) {
      if (entry.referrerPlayerId === player.id) push('error', 'REFERRER_SELF', `${player.name}: người giới thiệu không thể là chính mình.`);
      else if (!playerIds.has(entry.referrerPlayerId)) push('error', 'REFERRER_MISSING', `${player.name}: người giới thiệu không tồn tại trong buổi.`);
    }
    if (entry.playFraction === 0 && entry.payShuttle) {
      push('warning', 'SHUTTLE_NOT_PLAYING', `${player.name}: không chơi nên sẽ không bị tính tiền cầu.`);
    }
    if (entry.advancePayment < 0 || entry.paidAmount < 0 || entry.shuttleContribution < 0) {
      push('error', 'AMOUNT_NEGATIVE', `${player.name}: số tiền không được âm.`);
    }
  }

  if (session.courtCost > 0 && !entries.some(({ entry }) => entry.payCourt)) {
    issues.push({ severity: 'warning', code: 'NO_COURT_PAYER', message: 'Không có ai chịu tiền sân.' });
  }
  if (session.shuttleCost > 0 && !entries.some(({ entry }) => entry.payShuttle && entry.playFraction > 0)) {
    issues.push({ severity: 'warning', code: 'NO_SHUTTLE_PAYER', message: 'Không có ai chịu tiền cầu.' });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Đọc & chuẩn hoá dữ liệu JSON (khi tải từ file hoặc import backup)
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const asBoolean = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const asGender = (value: unknown): Gender | null => (value === 'male' || value === 'female' ? value : null);

function parseSettings(raw: unknown, errors: string[]): Settings {
  if (!isRecord(raw)) {
    errors.push('Cài đặt (settings) không hợp lệ.');
    return DEFAULT_SETTINGS;
  }
  const levels: Level[] = [];
  if (Array.isArray(raw.levels)) {
    for (const item of raw.levels) {
      if (isRecord(item) && typeof item.name === 'string' && item.name.trim() && typeof item.score === 'number') {
        if (!levels.some((level) => level.name === item.name)) levels.push({ name: item.name.trim(), score: item.score });
      }
    }
  }
  if (levels.length === 0) errors.push('Cài đặt không có danh sách trình độ (levels) hợp lệ.');
  return {
    clubName: asString(raw.clubName, DEFAULT_SETTINGS.clubName),
    levels: levels.length > 0 ? levels : DEFAULT_SETTINGS.levels,
    halfPlayCourtMode: raw.halfPlayCourtMode === 'half' ? 'half' : 'full',
    defaultCourtCount: Math.max(1, Math.floor(asNumber(raw.defaultCourtCount, DEFAULT_SETTINGS.defaultCourtCount))),
    defaultTime: asString(raw.defaultTime, DEFAULT_SETTINGS.defaultTime),
    mergeGuestsByDefault: asBoolean(raw.mergeGuestsByDefault, DEFAULT_SETTINGS.mergeGuestsByDefault),
  };
}

function parseMembers(raw: unknown, errors: string[]): Member[] {
  if (!Array.isArray(raw)) {
    errors.push('Danh sách thành viên (members) phải là một mảng.');
    return [];
  }
  const members: Member[] = [];
  const ids = new Set<string>();
  raw.forEach((item, index) => {
    const position = `Thành viên #${index + 1}`;
    if (!isRecord(item)) return void errors.push(`${position}: dữ liệu không hợp lệ.`);
    const id = asString(item.id);
    const name = asString(item.name).trim();
    const gender = asGender(item.gender);
    const level = asString(item.level);
    if (!id) return void errors.push(`${position}: thiếu id.`);
    if (ids.has(id)) return void errors.push(`${position}: id "${id}" bị trùng.`);
    if (!name) return void errors.push(`${position}: thiếu tên.`);
    if (!gender) return void errors.push(`${position} (${name}): giới tính không hợp lệ.`);
    if (!level) return void errors.push(`${position} (${name}): thiếu trình độ.`);
    ids.add(id);
    members.push({ id, name, gender, level, note: asString(item.note) });
  });
  return members;
}

function parsePlayers(raw: unknown, label: string, errors: string[]): SessionPlayer[] {
  if (!Array.isArray(raw)) return [];
  const players: SessionPlayer[] = [];
  const ids = new Set<string>();
  raw.forEach((item, index) => {
    if (!isRecord(item)) return void errors.push(`${label}: người chơi #${index + 1} không hợp lệ.`);
    const id = asString(item.id);
    if (!id || ids.has(id)) return void errors.push(`${label}: người chơi #${index + 1} thiếu id hoặc trùng id.`);
    ids.add(id);
    const memberId = asString(item.memberId) || null;
    players.push({
      id,
      memberId,
      name: asString(item.name).trim(),
      gender: asGender(item.gender),
      level: asString(item.level) || null,
      playerType: item.playerType === 'walk_in' || memberId === null ? 'walk_in' : 'default',
      resting: asBoolean(item.resting, false),
    });
  });
  return players;
}

function parsePairings(raw: unknown, playerIds: Set<string>): Match[] {
  if (!Array.isArray(raw)) return [];
  const matches: Match[] = [];
  const used = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const teams = [item.teamA, item.teamB].map((team) =>
      Array.isArray(team) && team.length === 2 && team.every((id) => typeof id === 'string' && playerIds.has(id))
        ? (team as [string, string])
        : null,
    );
    const [teamA, teamB] = teams;
    if (!teamA || !teamB) continue;
    const all = [...teamA, ...teamB];
    // Mỗi người chỉ xuất hiện một lần trong một lượt.
    if (new Set(all).size !== 4 || all.some((id) => used.has(id))) continue;
    all.forEach((id) => used.add(id));
    matches.push({
      id: asString(item.id, `match_${matches.length + 1}`),
      matchNumber: Math.max(1, Math.floor(asNumber(item.matchNumber, matches.length + 1))),
      court: Math.max(1, Math.floor(asNumber(item.court, 1))),
      teamA,
      teamB,
    });
  }
  return matches;
}

function parsePayments(raw: unknown, playerIds: Set<string>): PaymentEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: PaymentEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const playerId = asString(item.playerId);
    if (!playerIds.has(playerId) || entries.some((entry) => entry.playerId === playerId)) continue;
    const playFraction: PlayFraction = item.playFraction === 0 ? 0 : item.playFraction === 0.5 ? 0.5 : 1;
    const money = (value: unknown) => Math.max(0, Math.round(asNumber(value)));
    entries.push({
      playerId,
      playFraction,
      payCourt: asBoolean(item.payCourt, true),
      payShuttle: asBoolean(item.payShuttle, playFraction > 0),
      advancePayment: money(item.advancePayment),
      shuttleContribution: money(item.shuttleContribution),
      paidAmount: money(item.paidAmount),
      referrerPlayerId: asString(item.referrerPlayerId) || null,
      note: asString(item.note),
    });
  }
  return entries;
}

function parseSessions(raw: unknown, settings: Settings, errors: string[]): Session[] {
  if (!Array.isArray(raw)) {
    errors.push('Danh sách buổi chơi (sessions) phải là một mảng.');
    return [];
  }
  const sessions: Session[] = [];
  const ids = new Set<string>();
  raw.forEach((item, index) => {
    const position = `Buổi chơi #${index + 1}`;
    if (!isRecord(item)) return void errors.push(`${position}: dữ liệu không hợp lệ.`);
    const id = asString(item.id);
    const date = asString(item.date);
    if (!id) return void errors.push(`${position}: thiếu id.`);
    if (ids.has(id)) return void errors.push(`${position}: id "${id}" bị trùng.`);
    if (!parseISODate(date)) return void errors.push(`${position}: ngày "${date}" không hợp lệ (cần dạng YYYY-MM-DD).`);
    const courtCost = asNumber(item.courtCost);
    const shuttleCost = asNumber(item.shuttleCost);
    if (courtCost < 0) return void errors.push(`${position}: tiền sân không được âm.`);
    if (shuttleCost < 0) return void errors.push(`${position}: tiền cầu không được âm.`);
    ids.add(id);

    const players = parsePlayers(item.players, position, errors);
    const playerIds = new Set(players.map((p) => p.id));
    const now = new Date().toISOString();
    sessions.push(
      syncPayments({
        id,
        date,
        dayOfWeek: getDayOfWeek(date),
        time: asString(item.time, settings.defaultTime),
        courtCount: Math.max(1, Math.floor(asNumber(item.courtCount, settings.defaultCourtCount))),
        courtCost: Math.round(courtCost),
        shuttleCost: Math.round(shuttleCost),
        players,
        pairings: parsePairings(item.pairings, playerIds),
        payments: parsePayments(item.payments, playerIds),
        notes: asString(item.notes),
        pairingLocked: asBoolean(item.pairingLocked, false),
        paymentLocked: asBoolean(item.paymentLocked, false),
        mergeGuests: asBoolean(item.mergeGuests, settings.mergeGuestsByDefault),
        createdAt: asString(item.createdAt, now),
        updatedAt: asString(item.updatedAt, now),
      }),
    );
  });
  return sessions;
}

export interface ParseResult {
  data: AppData | null;
  errors: string[];
}

/**
 * Kiểm tra và chuẩn hoá toàn bộ dữ liệu. Chỉ đọc các trường đã biết, mọi thứ khác bị bỏ qua –
 * nội dung JSON không bao giờ được thực thi.
 */
export function parseAppData(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { data: null, errors: ['File không đúng định dạng dữ liệu của ứng dụng.'] };
  const settings = parseSettings(raw.settings, errors);
  const members = parseMembers(raw.members, errors);
  const sessions = parseSessions(raw.sessions, settings, errors);
  return { data: errors.length === 0 ? { members, sessions, settings } : null, errors };
}

export function parseBackupText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { data: null, errors: ['File không phải JSON hợp lệ.'] };
  }
  return parseAppData(raw);
}
