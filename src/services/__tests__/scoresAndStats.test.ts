import { describe, expect, it } from 'vitest';
import type { Match, Member } from '../../types';
import { generateZaloPairingText } from '../exportService';
import { getMatchWinner, hasScores, setMatchScore } from '../pairingService';
import { calculateMemberStats, sortMembersByStats } from '../statsService';
import { parseAppData } from '../validationService';
import { LEVELS, makePlayer, makeSession, patchPayment, SETTINGS } from './testHelpers';

const match = (id: string, teamA: [string, string], teamB: [string, string], scoreA?: number | null, scoreB?: number | null, round = 1): Match => ({
  id,
  round,
  matchNumber: 1,
  court: 1,
  teamA,
  teamB,
  scoreA,
  scoreB,
});

describe('tỉ số trận đấu', () => {
  it('đội thắng theo tỉ số; chưa đủ tỉ số thì chưa có kết quả', () => {
    expect(getMatchWinner({ scoreA: 21, scoreB: 15 })).toBe('A');
    expect(getMatchWinner({ scoreA: 18, scoreB: 21 })).toBe('B');
    expect(getMatchWinner({ scoreA: 20, scoreB: 20 })).toBe('draw');
    expect(getMatchWinner({ scoreA: 21, scoreB: null })).toBeNull();
    expect(getMatchWinner({})).toBeNull();
    expect(getMatchWinner({ scoreA: 0, scoreB: 0 })).toBe('draw');
  });

  it('setMatchScore chỉ đổi đúng trận và làm sạch giá trị không hợp lệ', () => {
    const matches = [match('m1', ['a', 'b'], ['c', 'd']), match('m2', ['e', 'f'], ['g', 'h'], 21, 10)];
    const next = setMatchScore(matches, 'm1', 21.7, -3);
    expect(next[0]).toMatchObject({ scoreA: 21, scoreB: null });
    expect(next[1]).toMatchObject({ scoreA: 21, scoreB: 10 });
    expect(setMatchScore(matches, 'm2', null, null)[1]).toMatchObject({ scoreA: null, scoreB: null });
    expect(hasScores(matches)).toBe(true);
    expect(hasScores([matches[0]!])).toBe(false);
  });

  it('tỉ số được giữ khi đọc lại dữ liệu và xuất hiện trong nội dung Zalo', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id, 'TB'));
    const session = makeSession(players, { pairings: [match('m1', ['a', 'b'], ['c', 'd'], 21, 17)] });
    const { data } = parseAppData({ members: [], sessions: [session], settings: SETTINGS });
    expect(data!.sessions[0]!.pairings[0]).toMatchObject({ scoreA: 21, scoreB: 17 });
    expect(generateZaloPairingText(session, { levels: LEVELS })).toContain('c + d\nTỉ số: 21 – 17');

    const noScore = makeSession(players, { pairings: [match('m1', ['a', 'b'], ['c', 'd'])] });
    expect(parseAppData({ members: [], sessions: [noScore], settings: SETTINGS }).data!.sessions[0]!.pairings[0]).toMatchObject({ scoreA: null, scoreB: null });
    expect(generateZaloPairingText(noScore, { levels: LEVELS })).not.toContain('Tỉ số');
  });
});

describe('thống kê thắng / thua', () => {
  const members: Member[] = ['An', 'Bình', 'Chi', 'Dũng', 'Em'].map((name) => ({ id: `member_${name}`, name, gender: 'male', level: 'TB', note: '' }));
  const players = members.slice(0, 4).map((m) => makePlayer(m.name, 'TB'));
  const session = makeSession(players, {
    pairings: [
      match('m1', ['An', 'Bình'], ['Chi', 'Dũng'], 21, 15, 1),
      match('m2', ['An', 'Chi'], ['Bình', 'Dũng'], 19, 21, 2),
      match('m3', ['An', 'Dũng'], ['Bình', 'Chi'], 20, 20, 3),
      match('m4', ['An', 'Bình'], ['Chi', 'Dũng'], null, null, 4), // chưa ghi tỉ số
    ],
  });
  const stats = calculateMemberStats(members, [session], SETTINGS);

  it('đếm thắng, thua, hoà và chỉ tính trận đã ghi tỉ số', () => {
    expect(stats.get('member_An')).toMatchObject({ matchesPlayed: 4, matchesScored: 3, wins: 1, losses: 1, draws: 1, winRate: 33 });
    expect(stats.get('member_Bình')).toMatchObject({ matchesScored: 3, wins: 2, losses: 0, draws: 1, winRate: 67 });
    expect(stats.get('member_Dũng')).toMatchObject({ wins: 1, losses: 1, draws: 1 });
    expect(stats.get('member_Chi')).toMatchObject({ wins: 0, losses: 2, draws: 1, winRate: 0 });
  });

  it('người chưa có trận nào được ghi tỉ số có tỉ lệ thắng trống và xếp sau cùng', () => {
    expect(stats.get('member_Em')).toMatchObject({ matchesScored: 0, winRate: null });
    expect(sortMembersByStats(members, stats, 'winRate', 'desc').map((m) => m.name)).toEqual(['Bình', 'An', 'Dũng', 'Chi', 'Em']);
    expect(sortMembersByStats(members, stats, 'wins', 'desc')[0]!.name).toBe('Bình');
  });
});

describe('thống kê tiền gồm cả khách đi cùng', () => {
  const members: Member[] = ['An', 'Bình'].map((name) => ({ id: `member_${name}`, name, gender: 'male', level: 'TB', note: '' }));
  const players = [makePlayer('An', 'TB'), makePlayer('Bình', 'TB'), makePlayer('Khách 1', 'TB', 'male', true), makePlayer('Khách 2', 'TB', 'male', true)];

  function build(mergeGuests: boolean) {
    let session = makeSession(players, { courtCost: 120000, shuttleCost: 40000, mergeGuests });
    session = patchPayment(session, 'Khách 1', { referrerPlayerId: 'An', paidAmount: 40000 });
    session = patchPayment(session, 'Khách 2', { referrerPlayerId: 'An' });
    session = patchPayment(session, 'An', { advancePayment: 10000 });
    return calculateMemberStats(members, [session], SETTINGS);
  }

  it('tiền của khách được cộng vào người giới thiệu', () => {
    const stats = build(true);
    // Mỗi người 40.000; An gánh thêm 2 khách.
    expect(stats.get('member_An')).toMatchObject({ totalPayable: 120000, totalPaid: 50000, outstanding: 70000, sessionsPlayed: 1 });
    expect(stats.get('member_Bình')).toMatchObject({ totalPayable: 40000, totalPaid: 0, outstanding: 40000 });
  });

  it('kết quả không phụ thuộc việc buổi đó có bật “gộp khách” hay không', () => {
    expect(build(false).get('member_An')).toMatchObject({ totalPayable: 120000, totalPaid: 50000, outstanding: 70000 });
  });
});
