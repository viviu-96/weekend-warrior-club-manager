import { describe, expect, it } from 'vitest';
import type { Match, Member } from '../../types';
import { generateZaloPairingText } from '../exportService';
import { getMatchWinner, hasScores, SCORE_RULES, setMatchScore, validateMatchScore } from '../pairingService';
import { buildWinLossChart, calculateMemberStats, sortMembersByStats } from '../statsService';
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

const score = (scoreA: number | null, scoreB: number | null) => ({ scoreA, scoreB });

describe('luật tính điểm: BO1 – 21 điểm – deuce 2 điểm – tối đa 25', () => {
  it('cấu hình luật', () => {
    expect(SCORE_RULES).toEqual({ target: 21, deuceMargin: 2, cap: 25 });
  });

  it.each([
    [21, 0],
    [21, 15],
    [21, 19],
    [22, 20],
    [23, 21],
    [24, 22],
    [25, 23],
    [25, 24],
  ])('%i–%i là tỉ số hợp lệ', (high, low) => {
    expect(validateMatchScore(score(high, low))).toBeNull();
    expect(validateMatchScore(score(low, high))).toBeNull();
    expect(getMatchWinner(score(high, low))).toBe('A');
    expect(getMatchWinner(score(low, high))).toBe('B');
  });

  it.each([
    [20, 18, 'Chưa đội nào đạt 21 điểm.'],
    [15, 15, 'Chưa đội nào đạt 21 điểm.'],
    [21, 20, '20–20 phải đánh tiếp tới khi cách 2 điểm (ví dụ 22–20).'],
    [21, 21, 'Hai đội không thể bằng điểm khi kết thúc trận.'],
    [22, 21, 'Sau deuce phải thắng cách 2 điểm (ví dụ 22–20).'],
    [22, 15, 'Sau deuce phải thắng cách 2 điểm (ví dụ 22–20).'],
    [24, 23, 'Sau deuce phải thắng cách 2 điểm (ví dụ 24–22).'],
    [25, 20, '25 điểm chỉ xảy ra sau deuce, đội thua phải có 23 hoặc 24 điểm.'],
    [25, 25, 'Hai đội không thể bằng điểm khi kết thúc trận.'],
    [26, 24, 'Điểm tối đa là 25.'],
    [30, 28, 'Điểm tối đa là 25.'],
  ])('%i–%i không hợp lệ', (a, b, message) => {
    expect(validateMatchScore(score(a, b))).toBe(message);
    expect(validateMatchScore(score(b, a))).toBe(message);
    expect(getMatchWinner(score(a, b))).toBeNull();
  });

  it('chưa nhập đủ hai ô thì chưa báo lỗi và chưa có kết quả', () => {
    expect(validateMatchScore(score(21, null))).toBeNull();
    expect(validateMatchScore({})).toBeNull();
    expect(getMatchWinner(score(21, null))).toBeNull();
    expect(getMatchWinner({})).toBeNull();
  });

  it('luật lấy từ cấu hình, không hard-code', () => {
    const short = { target: 11, deuceMargin: 2, cap: 15 };
    expect(validateMatchScore(score(11, 7), short)).toBeNull();
    expect(validateMatchScore(score(15, 14), short)).toBeNull();
    expect(validateMatchScore(score(21, 15), short)).toBe('Điểm tối đa là 15.');
    expect(getMatchWinner(score(9, 11), short)).toBe('B');
  });
});

describe('ghi tỉ số', () => {
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

  it('tỉ số sai luật không được đưa vào nội dung Zalo', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id, 'TB'));
    const session = makeSession(players, { pairings: [match('m1', ['a', 'b'], ['c', 'd'], 21, 20)] });
    expect(generateZaloPairingText(session, { levels: LEVELS })).not.toContain('Tỉ số');
  });
});

const MEMBERS: Member[] = ['An', 'Bình', 'Chi', 'Dũng', 'Em'].map((name) => ({ id: `member_${name}`, name, gender: 'male', level: 'TB', note: '' }));
const PLAYERS = MEMBERS.slice(0, 4).map((m) => makePlayer(m.name, 'TB'));
const SESSION = makeSession(PLAYERS, {
  pairings: [
    match('m1', ['An', 'Bình'], ['Chi', 'Dũng'], 21, 15, 1),
    match('m2', ['An', 'Chi'], ['Bình', 'Dũng'], 23, 25, 2),
    match('m3', ['An', 'Dũng'], ['Bình', 'Chi'], 22, 20, 3),
    match('m4', ['An', 'Bình'], ['Chi', 'Dũng'], null, null, 4), // chưa ghi tỉ số
    match('m5', ['An', 'Bình'], ['Chi', 'Dũng'], 21, 20, 5), // sai luật -> không tính
  ],
});

describe('thống kê thắng / thua', () => {
  const stats = calculateMemberStats(MEMBERS, [SESSION], SETTINGS);

  it('chỉ tính các trận có tỉ số đúng luật', () => {
    expect(stats.get('member_An')).toMatchObject({ matchesPlayed: 5, matchesScored: 3, wins: 2, losses: 1, winRate: 67 });
    expect(stats.get('member_Bình')).toMatchObject({ matchesScored: 3, wins: 2, losses: 1, winRate: 67 });
    expect(stats.get('member_Dũng')).toMatchObject({ wins: 2, losses: 1, winRate: 67 });
    expect(stats.get('member_Chi')).toMatchObject({ wins: 0, losses: 3, winRate: 0 });
  });

  it('người chưa có trận nào được ghi tỉ số có tỉ lệ thắng trống và xếp sau cùng', () => {
    expect(stats.get('member_Em')).toMatchObject({ matchesScored: 0, winRate: null });
    expect(sortMembersByStats(MEMBERS, stats, 'winRate', 'desc').map((m) => m.name)).toEqual(['An', 'Bình', 'Dũng', 'Chi', 'Em']);
    expect(sortMembersByStats(MEMBERS, stats, 'wins', 'asc')[0]!.name).toBe('Chi');
  });
});

describe('dữ liệu biểu đồ thắng / thua', () => {
  const chart = buildWinLossChart(MEMBERS, calculateMemberStats(MEMBERS, [SESSION], SETTINGS));

  it('chỉ gồm người đã có trận được ghi tỉ số, xếp theo tỉ lệ thắng', () => {
    expect(chart.rows.map((row) => [row.member.name, row.wins, row.losses, row.winRate])).toEqual([
      ['An', 2, 1, 67],
      ['Bình', 2, 1, 67],
      ['Dũng', 2, 1, 67],
      ['Chi', 0, 3, 0],
    ]);
  });

  it('thang đo chung lấy số trận thắng hoặc thua lớn nhất', () => {
    expect(chart.max).toBe(3);
    expect(buildWinLossChart(MEMBERS, calculateMemberStats(MEMBERS, [], SETTINGS))).toEqual({ rows: [], max: 0 });
  });
});

describe('thống kê tiền gồm cả khách đi cùng', () => {
  const members = MEMBERS.slice(0, 2);
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
