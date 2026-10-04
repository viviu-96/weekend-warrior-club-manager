import { describe, expect, it } from 'vitest';
import type { Match, Member, Session } from '../../types';
import { generateZaloPairingText } from '../exportService';
import {
  calculateCombinedPayments,
  calculateMemberDebts,
  generateZaloCombinedText,
  settleCombinedRow,
} from '../ledgerService';
import {
  buildRoundHistory,
  createSeededRng,
  generateMatches,
  getPlayCounts,
  getRoundMatches,
  getRounds,
  getWaitCounts,
  getWaitingPlayers,
  pairKey,
  reassignCourts,
  removeRound,
  setRoundMatches,
  swapPlayers,
} from '../pairingService';
import { calculateMemberStats, sortMembersByStats } from '../statsService';
import { parseAppData } from '../validationService';
import { LEVELS, makePlayer, makePlayers, makeSession, patchPayment, SETTINGS } from './testHelpers';

/** Xếp liên tiếp `count` lượt như trang Xếp cặp làm khi bấm "Thêm lượt". */
function playRounds(session: Session, count: number): Session {
  let current = session;
  for (let round = 1; round <= count; round += 1) {
    const result = generateMatches(current.players, {
      levels: LEVELS,
      courtCount: current.courtCount,
      round,
      history: buildRoundHistory([], current, round),
      waitCounts: getWaitCounts(current.players, current.pairings, round),
      rng: createSeededRng(round),
    });
    current = { ...current, pairings: setRoundMatches(current.pairings, round, result.matches) };
  }
  return current;
}

describe('nhiều lượt đấu', () => {
  it('mỗi lượt là một bộ trận riêng, mỗi người một lần trong một lượt', () => {
    const session = playRounds(makeSession(makePlayers(['TBK', 'TBK', 'TB', 'TB', 'TB', 'TB', 'Y', 'Y'])), 3);
    expect(getRounds(session.pairings)).toEqual([1, 2, 3]);
    for (const round of [1, 2, 3]) {
      const matches = getRoundMatches(session.pairings, round);
      expect(matches).toHaveLength(2);
      expect(matches.every((m) => m.round === round)).toBe(true);
      expect(new Set(matches.flatMap((m) => [...m.teamA, ...m.teamB])).size).toBe(8);
    }
    expect(new Set(session.pairings.map((m) => m.id)).size).toBe(6);
  });

  it('xoay vòng người chờ: 6 người, 3 lượt -> mỗi người chờ đúng 1 lần', () => {
    const session = playRounds(makeSession(makePlayers(['TB', 'TB', 'TB', 'TB', 'TB', 'TB']), { courtCount: 1 }), 3);
    const waits = getWaitCounts(session.players, session.pairings);
    expect(Object.keys(waits)).toHaveLength(6);
    expect(Object.values(waits).every((count) => count === 1)).toBe(true);
    expect(Object.values(getPlayCounts(session.pairings)).every((count) => count === 2)).toBe(true);
  });

  it('người vừa chờ được chơi ở lượt sau dù phương án kém cân bằng hơn', () => {
    // Hai người New là "người lẻ" hợp lý nhất để cho chờ; sau lượt 1 họ vẫn phải được vào sân.
    const players = makePlayers(['TBK', 'TBK', 'TBK', 'TBK', 'New', 'New']);
    const session = playRounds(makeSession(players, { courtCount: 1 }), 2);
    const firstWaiting = getWaitingPlayers(players, session.pairings, 1).map((p) => p.id);
    const secondPlaying = getRoundMatches(session.pairings, 2).flatMap((m) => [...m.teamA, ...m.teamB]);
    expect(firstWaiting).toHaveLength(2);
    for (const id of firstWaiting) expect(secondPlaying).toContain(id);
  });

  it('lượt sau tránh lặp lại partner của lượt trước khi có phương án tương đương', () => {
    const players = makePlayers(['TB', 'TB', 'TB', 'TB', 'TB', 'TB', 'TB', 'TB']).map((p) => ({ ...p, gender: 'male' as const }));
    const session = playRounds(makeSession(players), 2);
    const partners = (round: number) => getRoundMatches(session.pairings, round).flatMap((m) => [pairKey(...m.teamA), pairKey(...m.teamB)]);
    const first = new Set(partners(1));
    expect(partners(2).filter((key) => first.has(key))).toEqual([]);
  });

  it('xếp lại một lượt không đụng tới các lượt khác; xoá lượt đánh số lại', () => {
    const session = playRounds(makeSession(makePlayers(['TB', 'TB', 'TB', 'TB', 'Y', 'Y', 'Y', 'Y'])), 3);
    const round1 = getRoundMatches(session.pairings, 1);
    const round3 = getRoundMatches(session.pairings, 3);
    const replaced = setRoundMatches(session.pairings, 2, []);
    expect(getRoundMatches(replaced, 1)).toEqual(round1);
    expect(getRounds(replaced)).toEqual([1, 3]);

    const removed = removeRound(session.pairings, 2);
    expect(getRounds(removed)).toEqual([1, 2]);
    expect(getRoundMatches(removed, 2).map((m) => [m.teamA, m.teamB])).toEqual(round3.map((m) => [m.teamA, m.teamB]));
  });

  it('đổi chỗ chỉ trong lượt được chọn và chia lại sân theo từng lượt', () => {
    const match = (round: number, matchNumber: number): Match => ({ id: `r${round}_${matchNumber}`, round, matchNumber, court: 1, teamA: ['a', 'b'], teamB: ['c', 'd'] });
    const swapped = swapPlayers([match(1, 1), match(2, 1)], 'a', 'c', 2);
    expect(swapped[0]!.teamA).toEqual(['a', 'b']);
    expect(swapped[1]!.teamA).toEqual(['c', 'b']);

    const courts = reassignCourts([match(1, 1), match(1, 2), match(2, 1), match(2, 2)], 2);
    expect(courts.map((m) => [m.round, m.court])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]);
  });

  it('nội dung Zalo có tiêu đề lượt khi buổi có nhiều lượt', () => {
    const session = playRounds(makeSession(makePlayers(['TB', 'TB', 'TB', 'TB', 'TB', 'TB']), { courtCount: 1 }), 2);
    const text = generateZaloPairingText(session, { levels: LEVELS });
    expect(text).toContain('🔁 LƯỢT 1');
    expect(text).toContain('🔁 LƯỢT 2');
    expect(text.match(/Chờ lượt này/g)).toHaveLength(2);
  });

  it('dữ liệu cũ không có round được hiểu là lượt 1; trùng người chỉ bị cấm trong cùng một lượt', () => {
    const players = makePlayers(['TB', 'TB', 'TB', 'TB']);
    const raw = (round?: number) => ({ id: `m${round ?? 0}`, matchNumber: 1, court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], ...(round ? { round } : {}) });
    const session = { ...makeSession(players), pairings: [raw(), raw(1), raw(2)] };
    const { data } = parseAppData({ members: [], sessions: [session], settings: SETTINGS });
    expect(data!.sessions[0]!.pairings.map((m) => m.round)).toEqual([1, 2]);
  });
});

/** Hai buổi cùng tuần: T7 26/09 và CN 27/09. An chơi cả hai, Bình chỉ T7, Chi chỉ CN. */
function buildWeekend(): Session[] {
  const an = makePlayer('An', 'TB');
  const binh = makePlayer('Bình', 'TB');
  const chi = makePlayer('Chi', 'TB', 'female');
  const guest = makePlayer('Bạn An', 'TBY', 'male', true);
  let saturday = makeSession([an, binh, guest], { id: 'sat', date: '2026-09-26', courtCost: 90000, shuttleCost: 30000 });
  saturday = patchPayment(saturday, 'Bạn An', { referrerPlayerId: 'An' });
  saturday = patchPayment(saturday, 'Bình', { paidAmount: 40000 });
  let sunday = makeSession([an, chi], { id: 'sun', date: '2026-09-27', dayOfWeek: 'Chủ nhật', courtCost: 60000, shuttleCost: 20000 });
  sunday = patchPayment(sunday, 'An', { advancePayment: 10000 });
  return [sunday, saturday];
}

describe('bảng thu gộp nhiều buổi', () => {
  const sessions = buildWeekend();
  const combined = calculateCombinedPayments(sessions, SETTINGS);
  const byName = new Map(combined.rows.map((row) => [row.name, row]));

  it('cột theo thứ tự ngày với nhãn T7 / CN', () => {
    expect(combined.columns.map((c) => c.label)).toEqual(['T7', 'CN']);
  });

  it('mỗi người một dòng, cộng tiền đã làm tròn của từng buổi', () => {
    expect(combined.rows.map((r) => r.name)).toEqual(['An', 'Bình', 'Chi']);
    const an = byName.get('An')!;
    // T7: 2 suất × 40.000 (gộp khách) + CN: 40.000.
    expect(an.sessionCount).toBe(2);
    expect(an.roundedPayable).toBe(120000);
    expect(an.advancePayment).toBe(10000);
    expect(an.outstanding).toBe(110000);
    expect(an.notes).toContain('T7: Bao gồm 1 bạn');
    expect(byName.get('Chi')!.cells.map((c) => c.sessionId)).toEqual(['sun']);
  });

  it('tổng khớp với tổng từng buổi', () => {
    expect(combined.totals.totalCost).toBe(200000);
    expect(combined.totals.roundedPayable).toBe(200000);
    expect(combined.totals.paidAmount).toBe(40000);
    expect(combined.totals.outstanding).toBe(150000);
    expect(byName.get('Bình')!.status).toBe('paid');
  });

  it('nhãn có thêm ngày khi nhiều buổi cùng thứ', () => {
    const next = { ...sessions[1]!, id: 'sat2', date: '2026-10-03' };
    expect(calculateCombinedPayments([...sessions, next], SETTINGS).columns.map((c) => c.label)).toEqual(['T7 26/09', 'CN', 'T7 03/10']);
  });

  it('nội dung Zalo gộp', () => {
    expect(generateZaloCombinedText(sessions, SETTINGS)).toBe(
      ['💰 THU TIỀN CẦU LÔNG', '📅 T7 26/09/2026 + CN 27/09/2026', '', 'An: 110.000đ (bao gồm 1 bạn)', 'Bình: 40.000đ (đã đóng ✅)', 'Chi: 40.000đ', '', 'Tổng: 190.000đ'].join('\n'),
    );
  });
});

describe('công nợ theo thành viên', () => {
  const sessions = buildWeekend();

  it('người nợ nhiều nhất xếp trước, đếm số buổi còn thiếu', () => {
    const debts = calculateMemberDebts(sessions, SETTINGS);
    expect(debts.rows.map((r) => [r.name, r.outstanding, r.unpaidSessions])).toEqual([
      ['An', 110000, 2],
      ['Chi', 40000, 1],
      ['Bình', 0, 0],
    ]);
  });

  it('thu đủ công nợ cập nhật mọi buổi chưa khoá, bỏ qua buổi đã khoá', () => {
    const an = calculateMemberDebts(sessions, SETTINGS).rows[0]!;
    const { updated, skippedLocked } = settleCombinedRow(an, sessions, SETTINGS);
    expect(skippedLocked).toBe(0);
    expect(updated.map((s) => s.id).sort()).toEqual(['sat', 'sun']);
    const after = calculateMemberDebts(
      sessions.map((s) => updated.find((u) => u.id === s.id) ?? s),
      SETTINGS,
    );
    expect(after.rows.find((r) => r.name === 'An')!.outstanding).toBe(0);

    const locked = sessions.map((s) => (s.id === 'sat' ? { ...s, paymentLocked: true } : s));
    const partial = settleCombinedRow(calculateMemberDebts(locked, SETTINGS).rows[0]!, locked, SETTINGS);
    expect(partial.updated.map((s) => s.id)).toEqual(['sun']);
    expect(partial.skippedLocked).toBe(1);
  });
});

describe('thống kê theo thành viên', () => {
  const members: Member[] = ['An', 'Bình', 'Chi', 'Dũng', 'Em'].map((name) => ({ id: `member_${name}`, name, gender: 'male', level: 'TB', note: '' }));
  const players = members.slice(0, 4).map((m) => makePlayer(m.name, 'TB'));
  const match = (id: string, teamA: [string, string], teamB: [string, string], round = 1): Match => ({ id, round, matchNumber: 1, court: 1, teamA, teamB });

  let first = makeSession(players, {
    id: 's1',
    date: '2026-09-19',
    courtCost: 80000,
    shuttleCost: 40000,
    pairings: [match('m1', ['An', 'Bình'], ['Chi', 'Dũng']), match('m2', ['An', 'Bình'], ['Chi', 'Dũng'], 2)],
  });
  first = patchPayment(first, 'An', { paidAmount: 30000 });
  first = patchPayment(first, 'Dũng', { playFraction: 0, payShuttle: false });
  let second = makeSession(players.slice(0, 3).concat(makePlayer('Khách', 'TB', 'male', true)), {
    id: 's2',
    date: '2026-09-26',
    courtCost: 80000,
    shuttleCost: 0,
    pairings: [match('m3', ['An', 'Chi'], ['Bình', 'Khách'])],
  });
  second = patchPayment(second, 'An', { advancePayment: 20000 });
  const stats = calculateMemberStats(members, [first, second], SETTINGS);

  it('đếm số buổi tham gia, không tính buổi không chơi', () => {
    expect(stats.get('member_An')).toMatchObject({ sessionsPlayed: 2, sessionsListed: 2, matchesPlayed: 3, lastPlayedDate: '2026-09-26' });
    expect(stats.get('member_Dũng')).toMatchObject({ sessionsPlayed: 0, sessionsListed: 1, lastPlayedDate: null });
    expect(stats.get('member_Em')).toMatchObject({ sessionsPlayed: 0, matchesPlayed: 0, totalPaid: 0 });
  });

  it('partner hay ghép xếp theo số lần, gồm cả người vãng lai', () => {
    expect(stats.get('member_An')!.topPartners).toEqual([
      { memberId: 'member_Bình', name: 'Bình', count: 2 },
      { memberId: 'member_Chi', name: 'Chi', count: 1 },
    ]);
    expect(stats.get('member_Bình')!.topPartners[1]).toEqual({ memberId: null, name: 'Khách', count: 1 });
  });

  it('tổng tiền đã đóng gồm cả tiền ứng; còn nợ = phải đóng − đã đóng', () => {
    // Buổi 1: sân 20.000 + cầu 40.000/3 = 33.333 -> 33.500. Buổi 2: 20.000.
    expect(stats.get('member_An')).toMatchObject({ totalPayable: 53500, totalPaid: 50000, outstanding: 3500 });
    expect(stats.get('member_Dũng')).toMatchObject({ totalPayable: 20000, totalPaid: 0, outstanding: 20000 });
  });

  it('sắp xếp theo chỉ số', () => {
    expect(sortMembersByStats(members, stats, 'matchesPlayed', 'desc').map((m) => m.name)).toEqual(['An', 'Bình', 'Chi', 'Dũng', 'Em']);
    expect(sortMembersByStats(members, stats, 'outstanding', 'desc')[0]!.name).toBe('Bình');
  });
});
