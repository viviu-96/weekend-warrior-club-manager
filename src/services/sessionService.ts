import type { Gender, Member, PaymentEntry, Session, SessionPlayer, Settings } from '../types';
import { getDayOfWeek, todayISO } from '../utils/format';
import { createId } from '../utils/id';
import { cleanName } from '../utils/text';
import { api } from './api';
import { getAssignedPlayerIds } from './pairingService';
import { calculateShuttleCost, createDefaultPayment } from './paymentService';

type SessionDefaults = Pick<Settings, 'defaultCourtCount' | 'defaultTime' | 'mergeGuestsByDefault' | 'shuttleBoxPrice'>;

/** Giá hộp cầu cho buổi mới: lấy từ Cài đặt, nếu chưa đặt thì lấy của buổi gần nhất có giá. */
export function getDefaultShuttleBoxPrice(settings: Pick<Settings, 'shuttleBoxPrice'>, existing: Session[]): number | null {
  if (settings.shuttleBoxPrice > 0) return settings.shuttleBoxPrice;
  const latest = sortSessionsByDate(existing).find((session) => (session.shuttleBoxPrice ?? 0) > 0);
  return latest?.shuttleBoxPrice ?? null;
}

/** Tiền cầu đang được tự tính khi buổi có cả giá hộp lẫn số quả đã dùng. */
export function isShuttleCostAuto(session: Pick<Session, 'shuttleBoxPrice' | 'shuttleCount'>): boolean {
  return session.shuttleCount !== null && (session.shuttleBoxPrice ?? 0) > 0;
}

/**
 * Cập nhật giá hộp cầu / số quả đã dùng và tự tính lại tiền cầu.
 * - Đủ cả hai số: tiền cầu = giá hộp ÷ số quả trong hộp × số quả đã dùng.
 * - Tiền cầu đang được tự tính mà một trong hai ô bị xoá: tiền cầu về 0, vì con số cũ không còn căn cứ.
 * - Tiền cầu đang nhập tay và vẫn chưa đủ hai số: giữ nguyên số đã nhập.
 */
export function updateShuttleUsage(
  session: Session,
  patch: { shuttleBoxPrice?: number | null; shuttleCount?: number | null },
  shuttlesPerBox: number,
): Session {
  const next = { ...session, ...patch };
  if (isShuttleCostAuto(next)) {
    return { ...next, shuttleCost: calculateShuttleCost(next.shuttleBoxPrice ?? 0, next.shuttleCount ?? 0, shuttlesPerBox) };
  }
  return isShuttleCostAuto(session) ? { ...next, shuttleCost: 0 } : next;
}

/** Nhập tay tiền cầu: bỏ số quả để tiền cầu không bị tự tính đè lên. */
export function setManualShuttleCost(session: Session, shuttleCost: number): Session {
  return { ...session, shuttleCost, shuttleCount: null };
}

/** session_2026_09_26, thêm hậu tố _2, _3... nếu trong ngày đã có buổi khác. */
export function makeSessionId(date: string, existingIds: string[]): string {
  const base = `session_${date.replace(/-/g, '_')}`;
  if (!existingIds.includes(base)) return base;
  let suffix = 2;
  while (existingIds.includes(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function createSession(settings: SessionDefaults, existing: Session[], date: string = todayISO()): Session {
  const now = new Date().toISOString();
  return {
    id: makeSessionId(
      date,
      existing.map((s) => s.id),
    ),
    date,
    dayOfWeek: getDayOfWeek(date),
    time: settings.defaultTime,
    courtCount: settings.defaultCourtCount,
    courtCost: 0,
    shuttleCost: 0,
    shuttleBoxPrice: getDefaultShuttleBoxPrice(settings, existing),
    shuttleCount: null,
    players: [],
    pairings: [],
    payments: [],
    notes: '',
    pairingLocked: false,
    paymentLocked: false,
    mergeGuests: settings.mergeGuestsByDefault,
    createdAt: now,
    updatedAt: now,
  };
}

/** Đảm bảo mỗi người chơi có đúng một dòng thanh toán, theo thứ tự danh sách. */
export function syncPayments(session: Session): Session {
  const playerIds = new Set(session.players.map((p) => p.id));
  const byId = new Map(session.payments.map((entry) => [entry.playerId, entry]));
  const payments: PaymentEntry[] = session.players.map((player) => {
    const entry = byId.get(player.id) ?? createDefaultPayment(player.id);
    const referrerValid =
      entry.referrerPlayerId !== null && entry.referrerPlayerId !== player.id && playerIds.has(entry.referrerPlayerId);
    return referrerValid ? entry : { ...entry, referrerPlayerId: null };
  });
  return { ...session, payments };
}

export interface DuplicateOptions {
  date: string;
  keepGuests: boolean;
}

/**
 * Nhân bản buổi chơi: giữ danh sách người chơi và cấu trúc buổi,
 * reset toàn bộ chi phí, thanh toán và kết quả xếp cặp.
 */
export function duplicateSession(source: Session, options: DuplicateOptions, existing: Session[]): Session {
  const now = new Date().toISOString();
  const kept = source.players.filter((player) => options.keepGuests || player.playerType !== 'walk_in');
  const keptIds = new Set(kept.map((p) => p.id));
  const sourcePayments = new Map(source.payments.map((entry) => [entry.playerId, entry]));
  const players = kept.map((player) => ({ ...player, resting: false }));
  const payments = players.map((player) => {
    const referrer = sourcePayments.get(player.id)?.referrerPlayerId ?? null;
    return { ...createDefaultPayment(player.id), referrerPlayerId: referrer && keptIds.has(referrer) ? referrer : null };
  });
  return {
    ...source,
    id: makeSessionId(
      options.date,
      existing.map((s) => s.id),
    ),
    date: options.date,
    dayOfWeek: getDayOfWeek(options.date),
    courtCost: 0,
    shuttleCost: 0,
    // Giá hộp cầu được giữ lại; số quả đã dùng là của riêng từng buổi.
    shuttleCount: null,
    players,
    pairings: [],
    payments,
    notes: '',
    pairingLocked: false,
    paymentLocked: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Người chơi trong buổi
// ---------------------------------------------------------------------------

export function createMemberPlayer(member: Member): SessionPlayer {
  return {
    id: createId('player'),
    memberId: member.id,
    name: member.name,
    gender: member.gender,
    level: member.level,
    playerType: 'default',
    resting: false,
  };
}

export function createWalkInPlayer(name: string, gender: Gender | null, level: string | null): SessionPlayer {
  return {
    id: createId('player_guest'),
    memberId: null,
    name: cleanName(name),
    gender,
    level,
    playerType: 'walk_in',
    resting: false,
  };
}

export function addPlayers(session: Session, players: SessionPlayer[]): Session {
  return syncPayments({ ...session, players: [...session.players, ...players] });
}

export function updatePlayer(session: Session, playerId: string, patch: Partial<SessionPlayer>): Session {
  return {
    ...session,
    players: session.players.map((player) => (player.id === playerId ? { ...player, ...patch } : player)),
  };
}

/** Xoá người chơi. Nếu người đó đã nằm trong kết quả xếp cặp thì kết quả bị huỷ để tránh trận thiếu người. */
export function removePlayer(session: Session, playerId: string): Session {
  const wasPaired = getAssignedPlayerIds(session.pairings).has(playerId);
  return syncPayments({
    ...session,
    players: session.players.filter((player) => player.id !== playerId),
    pairings: wasPaired ? [] : session.pairings,
  });
}

/** Cho người chơi nghỉ / chơi lại. Người đang có trận mà chuyển sang nghỉ thì kết quả xếp cặp bị huỷ. */
export function setPlayerResting(session: Session, playerId: string, resting: boolean): Session {
  const wasPaired = resting && getAssignedPlayerIds(session.pairings).has(playerId);
  return { ...updatePlayer(session, playerId, { resting }), pairings: wasPaired ? [] : session.pairings };
}

/** Vãng lai trở thành thành viên: gắn memberId mới vào người chơi của buổi. */
export function linkPlayerToMember(session: Session, playerId: string, member: Member): Session {
  return updatePlayer(session, playerId, { memberId: member.id, playerType: 'default' });
}

export function updatePaymentEntry(session: Session, playerId: string, patch: Partial<PaymentEntry>): Session {
  const synced = syncPayments(session);
  return {
    ...synced,
    payments: synced.payments.map((entry) => {
      if (entry.playerId !== playerId) return entry;
      const next = { ...entry, ...patch };
      // Người không chơi thì không tính tiền cầu.
      if (next.playFraction === 0) next.payShuttle = false;
      else if (patch.playFraction !== undefined && entry.playFraction === 0) next.payShuttle = true;
      return next;
    }),
  };
}

export function sortSessionsByDate(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Lưu / tải
// ---------------------------------------------------------------------------

export function saveSession(session: Session): Promise<Session> {
  return api.updateSession({ ...session, updatedAt: new Date().toISOString() });
}

export function loadSession(id: string): Promise<Session> {
  return api.getSession(id);
}
