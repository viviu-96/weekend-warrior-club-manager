import { DEFAULT_SETTINGS } from '../../data/defaultSettings';
import type { Gender, PaymentEntry, Session, SessionPlayer } from '../../types';
import { createDefaultPayment } from '../paymentService';

export const LEVELS = DEFAULT_SETTINGS.levels;
export const SETTINGS = DEFAULT_SETTINGS;

export function makePlayer(id: string, level: string, gender: Gender = 'male', walkIn = false): SessionPlayer {
  return {
    id,
    memberId: walkIn ? null : `member_${id}`,
    name: id,
    gender,
    level,
    playerType: walkIn ? 'walk_in' : 'default',
    resting: false,
  };
}

/** Tạo danh sách người chơi từ dãy trình độ, giới tính xen kẽ nam/nữ. */
export function makePlayers(levels: string[]): SessionPlayer[] {
  return levels.map((level, index) => makePlayer(`p${index + 1}`, level, index % 3 === 2 ? 'female' : 'male'));
}

export function makeSession(players: SessionPlayer[], overrides: Partial<Session> = {}): Session {
  return {
    id: 'session_test',
    date: '2026-09-26',
    dayOfWeek: 'Thứ 7',
    time: '08:00-10:00',
    courtCount: 2,
    courtCost: 280000,
    shuttleCost: 189000,
    players,
    pairings: [],
    payments: players.map((p) => createDefaultPayment(p.id)),
    notes: '',
    pairingLocked: false,
    paymentLocked: false,
    mergeGuests: true,
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
    ...overrides,
  };
}

export function patchPayment(session: Session, playerId: string, patch: Partial<PaymentEntry>): Session {
  return {
    ...session,
    payments: session.payments.map((entry) => (entry.playerId === playerId ? { ...entry, ...patch } : entry)),
  };
}
