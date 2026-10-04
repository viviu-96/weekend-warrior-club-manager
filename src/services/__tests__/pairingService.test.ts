import { describe, expect, it } from 'vitest';
import type { Match, SessionPlayer } from '../../types';
import {
  assignCourts,
  buildPairingHistory,
  calculateBalanceScore,
  calculateMatchBalance,
  calculatePairStrength,
  createSeededRng,
  generateMatches,
  generatePairs,
  getEligiblePlayers,
  getLevelScore,
  getPlayerKey,
  pairKey,
  swapPlayers,
} from '../pairingService';
import { LEVELS, makePlayer, makePlayers, makeSession } from './testHelpers';

const options = (courtCount = 2, seed = 1) => ({ levels: LEVELS, courtCount, rng: createSeededRng(seed) });

function expectEveryoneOnce(matches: Match[], unassigned: string[], players: SessionPlayer[]) {
  const ids = [...matches.flatMap((m) => [...m.teamA, ...m.teamB]), ...unassigned];
  expect(ids).toHaveLength(players.length);
  expect(new Set(ids).size).toBe(players.length);
}

describe('getLevelScore', () => {
  it.each([
    ['New', 1],
    ['Y', 2],
    ['Y+', 3],
    ['TBY', 4],
    ['TB-', 5],
    ['TB', 6],
    ['TB+', 7],
    ['TBK', 8],
    ['Khá', 9],
    ['Bán chuyên', 10],
  ])('%s = %i', (level, score) => {
    expect(getLevelScore(level, LEVELS)).toBe(score);
  });

  it('giữ đúng thứ tự New < Y < Y+ < ... < Bán chuyên', () => {
    const order = ['New', 'Y', 'Y+', 'TBY', 'TB-', 'TB', 'TB+', 'TBK', 'Khá', 'Bán chuyên'];
    const scores = order.map((level) => getLevelScore(level, LEVELS));
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(new Set(scores).size).toBe(10);
  });

  it('trả về 0 cho trình độ không tồn tại hoặc trống', () => {
    expect(getLevelScore('Siêu sao', LEVELS)).toBe(0);
    expect(getLevelScore(null, LEVELS)).toBe(0);
  });

  it('lấy điểm từ cấu hình, không hard-code', () => {
    expect(getLevelScore('TB', [{ name: 'TB', score: 42 }])).toBe(42);
  });
});

describe('pair strength & match balance', () => {
  const quang = makePlayer('Quang', 'TBK');
  const sang = makePlayer('Sáng', 'TB');
  const hung = makePlayer('Hùng', 'TBK');
  const ha = makePlayer('Hà', 'TB', 'female');
  const luan = makePlayer('Luân', 'Y');

  it('pairStrength = score(A) + score(B)', () => {
    expect(calculatePairStrength(quang, sang, LEVELS)).toBe(14);
  });

  it('match balance = chênh lệch strength hai team', () => {
    expect(calculateMatchBalance([quang, sang], [hung, ha], LEVELS)).toEqual({
      teamAStrength: 14,
      teamBStrength: 14,
      difference: 0,
    });
    expect(calculateMatchBalance([quang, hung], [sang, luan], LEVELS).difference).toBe(8);
  });
});

describe('generateMatches', () => {
  it('4 người -> 1 trận cân bằng nhất', () => {
    const players = makePlayers(['TBK', 'TBK', 'TB', 'TB']);
    const result = generateMatches(players, options(1));
    expect(result.matches).toHaveLength(1);
    expect(result.unassignedPlayerIds).toEqual([]);
    expectEveryoneOnce(result.matches, result.unassignedPlayerIds, players);
    const byId = new Map(players.map((p) => [p.id, p]));
    const match = result.matches[0]!;
    const balance = calculateMatchBalance(
      [byId.get(match.teamA[0])!, byId.get(match.teamA[1])!],
      [byId.get(match.teamB[0])!, byId.get(match.teamB[1])!],
      LEVELS,
    );
    // TBK + TB vs TBK + TB, không phải TBK + TBK vs TB + TB.
    expect(balance).toEqual({ teamAStrength: 14, teamBStrength: 14, difference: 0 });
  });

  it('8 người -> 2 trận, mỗi người một lần', () => {
    const players = makePlayers(['TBK', 'TBK', 'TB', 'TB', 'Y', 'Y', 'New', 'New']);
    const result = generateMatches(players, options());
    expect(result.matches).toHaveLength(2);
    expectEveryoneOnce(result.matches, result.unassignedPlayerIds, players);
    expect(result.matches.map((m) => m.court)).toEqual([1, 2]);
    expect(result.balanceScore).toBeGreaterThanOrEqual(85);
  });

  it('12 người -> 3 trận', () => {
    const players = makePlayers(['Khá', 'TBK', 'TBK', 'TB+', 'TB', 'TB', 'TB-', 'TBY', 'Y+', 'Y', 'Y', 'New']);
    const result = generateMatches(players, options(3));
    expect(result.matches).toHaveLength(3);
    expectEveryoneOnce(result.matches, result.unassignedPlayerIds, players);
  });

  it('16 người -> 4 trận trên 2 sân, các trận cân bằng', () => {
    const players = makePlayers([
      'Bán chuyên', 'Khá', 'TBK', 'TBK', 'TB+', 'TB', 'TB', 'TB',
      'TB-', 'TB-', 'TBY', 'Y+', 'Y', 'Y', 'New', 'New',
    ]);
    const result = generateMatches(players, options());
    expect(result.matches).toHaveLength(4);
    expect(result.unassignedPlayerIds).toEqual([]);
    expectEveryoneOnce(result.matches, result.unassignedPlayerIds, players);
    expect(result.matches.map((m) => [m.court, m.matchNumber])).toEqual([
      [1, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ]);
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const match of result.matches) {
      const diff = calculateMatchBalance(
        [byId.get(match.teamA[0])!, byId.get(match.teamA[1])!],
        [byId.get(match.teamB[0])!, byId.get(match.teamB[1])!],
        LEVELS,
      ).difference;
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  it('18 người -> 4 trận và 2 người chưa được xếp, không bỏ sót ai', () => {
    const players = makePlayers([
      'Bán chuyên', 'Khá', 'TBK', 'TBK', 'TB+', 'TB', 'TB', 'TB', 'TB',
      'TB-', 'TB-', 'TBY', 'TBY', 'Y+', 'Y', 'Y', 'New', 'New',
    ]);
    const result = generateMatches(players, options());
    expect(result.matches).toHaveLength(4);
    expect(result.unassignedPlayerIds).toHaveLength(2);
    expectEveryoneOnce(result.matches, result.unassignedPlayerIds, players);
  });

  it('dưới 4 người -> không có trận, tất cả ở danh sách chờ', () => {
    const players = makePlayers(['TB', 'TB', 'Y']);
    const result = generateMatches(players, options());
    expect(result.matches).toEqual([]);
    expect(result.unassignedPlayerIds).toHaveLength(3);
  });

  it('không hy sinh cân bằng trình độ để ghép nam-nữ', () => {
    const players = [
      makePlayer('m1', 'TBK', 'male'),
      makePlayer('m2', 'TBK', 'male'),
      makePlayer('f1', 'Y', 'female'),
      makePlayer('f2', 'Y', 'female'),
    ];
    const match = generateMatches(players, options(1)).matches[0]!;
    // Phương án cân bằng duy nhất là mỗi team 1 nam TBK + 1 nữ Y.
    expect([...match.teamA].sort()).not.toEqual(['m1', 'm2']);
    expect(calculateBalanceScore([match], players, LEVELS)).toBeGreaterThan(80);
  });

  it('vãng lai được xếp như người chơi bình thường', () => {
    const members = makePlayers(['TBK', 'TB', 'TB', 'Y']);
    const withGuest = members.map((p, i) => (i === 0 ? { ...p, memberId: null, playerType: 'walk_in' as const } : p));
    const a = generateMatches(members, options(1));
    const b = generateMatches(withGuest, options(1));
    expect(b.matches).toEqual(a.matches);
  });

  it('"Xếp lại" đưa ra phương án khác nhưng vẫn cân bằng', () => {
    const players = makePlayers(['TBK', 'TBK', 'TB', 'TB', 'TB', 'TB', 'Y', 'Y']);
    const seen: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = generateMatches(players, { ...options(2, i + 1), excludeSignatures: seen });
      expect(seen).not.toContain(result.signature);
      seen.push(result.signature);
      scores.push(result.balanceScore);
    }
    expect(new Set(seen).size).toBe(4);
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(scores[0]! - 15);
  });

  it('tránh lặp lại partner cũ khi có lịch sử và phương án tương đương', () => {
    const players = makePlayers(['TB', 'TB', 'TB', 'TB']).map((p) => ({ ...p, gender: 'male' as const }));
    const first = generateMatches(players, options(1)).matches;
    const history = buildPairingHistory([makeSession(players, { pairings: first })]);
    const second = generateMatches(players, { ...options(1), history }).matches[0]!;
    const previousPartners = new Set(first.flatMap((m) => [pairKey(...m.teamA), pairKey(...m.teamB)]));
    const keyOf = (id: string) => getPlayerKey(players.find((p) => p.id === id)!);
    expect(history.partners[pairKey(keyOf(first[0]!.teamA[0]), keyOf(first[0]!.teamA[1]))]).toBe(1);
    expect(previousPartners.has(pairKey(...second.teamA))).toBe(false);
    expect(previousPartners.has(pairKey(...second.teamB))).toBe(false);
  });
});

describe('các hàm hỗ trợ xếp cặp', () => {
  it('generatePairs trả về các cặp kèm strength', () => {
    const pairs = generatePairs(makePlayers(['TBK', 'TBK', 'TB', 'TB']), options(1));
    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.strength)).toEqual([14, 14]);
  });

  it('assignCourts chia đều trận theo thứ tự sân', () => {
    const matches = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ court: 0, matchNumber: i + 1 }));
    expect(assignCourts(matches(4), 2).map((m) => m.court)).toEqual([1, 1, 2, 2]);
    expect(assignCourts(matches(6), 3).map((m) => m.court)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(assignCourts(matches(3), 2).map((m) => m.court)).toEqual([1, 1, 2]);
    expect(assignCourts(matches(1), 2).map((m) => m.court)).toEqual([1]);
  });

  it('getEligiblePlayers bỏ người nghỉ và người thiếu thông tin', () => {
    const players = [
      makePlayer('a', 'TB'),
      { ...makePlayer('b', 'TB'), resting: true },
      { ...makePlayer('c', 'TB'), gender: null },
      { ...makePlayer('d', 'TB'), level: null },
      makePlayer('e', 'Không có'),
    ];
    expect(getEligiblePlayers(players, LEVELS).map((p) => p.id)).toEqual(['a']);
  });

  it('balance score cao cho trận cân và thấp cho trận lệch', () => {
    const players = makePlayers(['TBK', 'TBK', 'TB', 'TB']);
    const balanced: Match = { id: 'm', round: 1, matchNumber: 1, court: 1, teamA: ['p1', 'p3'], teamB: ['p2', 'p4'] };
    const lopsided: Match = { ...balanced, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] };
    expect(calculateBalanceScore([balanced], players, LEVELS)).toBe(96);
    expect(calculateBalanceScore([lopsided], players, LEVELS)).toBeLessThan(60);
    expect(calculateBalanceScore([], players, LEVELS)).toBe(0);
  });

  it('swapPlayers đổi chỗ hai người, kể cả người chưa được xếp', () => {
    const match: Match = { id: 'm', round: 1, matchNumber: 1, court: 1, teamA: ['a', 'b'], teamB: ['c', 'd'] };
    expect(swapPlayers([match], 'a', 'c')[0]).toMatchObject({ teamA: ['c', 'b'], teamB: ['a', 'd'] });
    expect(swapPlayers([match], 'b', 'x')[0]).toMatchObject({ teamA: ['a', 'x'], teamB: ['c', 'd'] });
  });
});
