import type { Level, Match, Session, SessionPlayer, TeamIds } from '../types';
import { normalizeText } from '../utils/text';

// ---------------------------------------------------------------------------
// Trình độ & sức mạnh
// ---------------------------------------------------------------------------

/** Điểm trình độ lấy từ cấu hình (settings.levels). Trình độ không tồn tại -> 0. */
export function getLevelScore(level: string | null | undefined, levels: Level[]): number {
  if (!level) return 0;
  return levels.find((item) => item.name === level)?.score ?? 0;
}

export function sortLevels(levels: Level[]): Level[] {
  return [...levels].sort((a, b) => a.score - b.score);
}

type LevelHolder = Pick<SessionPlayer, 'level'>;

/** pairStrength = score(A) + score(B) */
export function calculatePairStrength(a: LevelHolder, b: LevelHolder, levels: Level[]): number {
  return getLevelScore(a.level, levels) + getLevelScore(b.level, levels);
}

export interface MatchBalance {
  teamAStrength: number;
  teamBStrength: number;
  difference: number;
}

export function calculateMatchBalance(
  teamA: [LevelHolder, LevelHolder],
  teamB: [LevelHolder, LevelHolder],
  levels: Level[],
): MatchBalance {
  const teamAStrength = calculatePairStrength(teamA[0], teamA[1], levels);
  const teamBStrength = calculatePairStrength(teamB[0], teamB[1], levels);
  return { teamAStrength, teamBStrength, difference: Math.abs(teamAStrength - teamBStrength) };
}

// ---------------------------------------------------------------------------
// Lịch sử partner / opponent
// ---------------------------------------------------------------------------

export interface PairingHistory {
  partners: Record<string, number>;
  opponents: Record<string, number>;
}

/** Khoá định danh người chơi xuyên suốt các buổi: thành viên theo memberId, vãng lai theo tên. */
export function getPlayerKey(player: Pick<SessionPlayer, 'memberId' | 'name'>): string {
  return player.memberId ?? `walkin:${normalizeText(player.name)}`;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildPairingHistory(sessions: Session[]): PairingHistory {
  const history: PairingHistory = { partners: {}, opponents: {} };
  const bump = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };
  for (const session of sessions) {
    const keyById = new Map(session.players.map((p) => [p.id, getPlayerKey(p)]));
    for (const match of session.pairings) {
      const [a, b] = match.teamA.map((id) => keyById.get(id));
      const [c, d] = match.teamB.map((id) => keyById.get(id));
      if (!a || !b || !c || !d) continue;
      bump(history.partners, pairKey(a, b));
      bump(history.partners, pairKey(c, d));
      for (const x of [a, b]) for (const y of [c, d]) bump(history.opponents, pairKey(x, y));
    }
  }
  return history;
}

// ---------------------------------------------------------------------------
// Hàm chi phí
// ---------------------------------------------------------------------------

export interface PairingWeights {
  /** Chênh lệch tổng strength giữa hai team (bình phương). */
  teamBalance: number;
  /** Chênh lệch trình độ giữa hai partner (bình phương). */
  partnerGap: number;
  /** Chênh lệch strength giữa các trận (phương sai). */
  crossMatch: number;
  /** Hai team lệch số nữ. */
  genderImbalance: number;
  /** Team cùng giới khi có thể ghép nam-nữ. */
  sameGenderTeam: number;
  partnerRepeat: number;
  opponentRepeat: number;
  /** Cho ngồi chờ một người đã từng chờ ở lượt trước (mỗi lần đã chờ). */
  benchRepeat: number;
}

// Thứ tự ưu tiên: cân bằng trình độ >> partner phù hợp > giới tính, lịch sử.
// Lệch 1 điểm giữa hai team (10) luôn nặng hơn mọi yếu tố giới tính (tối đa 7).
export const DEFAULT_PAIRING_WEIGHTS: PairingWeights = {
  teamBalance: 10,
  partnerGap: 1.5,
  crossMatch: 0.5,
  genderImbalance: 3,
  sameGenderTeam: 0.5,
  partnerRepeat: 4,
  opponentRepeat: 1.5,
  // Lớn hơn mọi lợi ích cân bằng: ai đã chờ thì lượt sau phải được chơi nếu còn người chưa chờ.
  benchRepeat: 500,
};

const MAX_HISTORY_COUNT = 3;

interface SearchContext {
  scores: number[];
  female: number[];
  mixedPossible: boolean;
  partner: number[][];
  opponent: number[][];
  /** Chi phí nếu cho người này ngồi chờ ở lượt đang xếp. */
  benchPenalty: number[];
  weights: PairingWeights;
}

function matchCost(ctx: SearchContext, a: number, b: number, c: number, d: number): number {
  const { scores: s, female: f, weights: w } = ctx;
  const diff = s[a]! + s[b]! - s[c]! - s[d]!;
  const gapA = s[a]! - s[b]!;
  const gapB = s[c]! - s[d]!;
  let cost = w.teamBalance * diff * diff + w.partnerGap * (gapA * gapA + gapB * gapB);

  const femaleA = f[a]! + f[b]!;
  const femaleB = f[c]! + f[d]!;
  cost += w.genderImbalance * Math.abs(femaleA - femaleB);
  if (ctx.mixedPossible) {
    cost += w.sameGenderTeam * ((femaleA === 1 ? 0 : 1) + (femaleB === 1 ? 0 : 1));
  }

  cost += w.partnerRepeat * (ctx.partner[a]![b]! + ctx.partner[c]![d]!);
  cost +=
    w.opponentRepeat *
    (ctx.opponent[a]![c]! + ctx.opponent[a]![d]! + ctx.opponent[b]![c]! + ctx.opponent[b]![d]!);
  return cost;
}

/** slots: cứ 4 phần tử là một trận [A1, A2, B1, B2]; chỉ xét `count` phần tử đầu. */
function arrangementCost(ctx: SearchContext, slots: number[], count: number): number {
  const matchCount = count / 4;
  let cost = 0;
  let sum = 0;
  let sumSquares = 0;
  for (let i = 0; i < count; i += 4) {
    const a = slots[i]!;
    const b = slots[i + 1]!;
    const c = slots[i + 2]!;
    const d = slots[i + 3]!;
    cost += matchCost(ctx, a, b, c, d);
    const avg = (ctx.scores[a]! + ctx.scores[b]! + ctx.scores[c]! + ctx.scores[d]!) / 2;
    sum += avg;
    sumSquares += avg * avg;
  }
  if (matchCount > 1) {
    cost += ctx.weights.crossMatch * (sumSquares - (sum * sum) / matchCount);
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Tìm kiếm phương án
// ---------------------------------------------------------------------------

interface Candidate {
  cost: number;
  /** Chỉ số người chơi, 4 người một trận. */
  slots: number[];
  signature: string;
}

const EXHAUSTIVE_LIMIT = 400_000;
const TOP_CANDIDATES = 40;
const LOCAL_SEARCH_RESTARTS = 80;

function combinationCount(n: number, r: number): number {
  let result = 1;
  for (let i = 1; i <= r; i += 1) result = (result * (n - r + i)) / i;
  return Math.round(result);
}

/** Số cách chia 4m người thành m trận (mỗi trận 2 team). */
function arrangementCount(playing: number): number {
  let result = 1;
  for (let n = playing; n >= 4; n -= 4) result *= combinationCount(n - 1, 3) * 3;
  return result;
}

function forEachCombination(n: number, r: number, visit: (chosen: number[]) => void): void {
  const chosen: number[] = [];
  const rec = (start: number) => {
    if (chosen.length === r) {
      visit(chosen);
      return;
    }
    for (let i = start; i <= n - (r - chosen.length); i += 1) {
      chosen.push(i);
      rec(i + 1);
      chosen.pop();
    }
  };
  rec(0);
}

function forEachArrangement(items: number[], visit: (slots: number[]) => void): void {
  const slots: number[] = [];
  const rec = (remaining: number[]) => {
    if (remaining.length < 4) {
      visit(slots);
      return;
    }
    const first = remaining[0]!;
    const rest = remaining.slice(1);
    for (let i = 0; i < rest.length; i += 1) {
      for (let j = i + 1; j < rest.length; j += 1) {
        for (let k = j + 1; k < rest.length; k += 1) {
          const x = rest[i]!;
          const y = rest[j]!;
          const z = rest[k]!;
          const others = rest.filter((_, index) => index !== i && index !== j && index !== k);
          const splits: [number, number, number][] = [
            [x, y, z],
            [y, x, z],
            [z, x, y],
          ];
          for (const [partner, c, d] of splits) {
            slots.push(first, partner, c, d);
            rec(others);
            slots.length -= 4;
          }
        }
      }
    }
  };
  rec(items);
}

function signatureOf(slots: number[], ids: string[]): string {
  const matches: string[] = [];
  for (let i = 0; i < slots.length; i += 4) {
    const teamA = [ids[slots[i]!]!, ids[slots[i + 1]!]!].sort().join('+');
    const teamB = [ids[slots[i + 2]!]!, ids[slots[i + 3]!]!].sort().join('+');
    matches.push([teamA, teamB].sort().join(' v '));
  }
  return matches.sort().join(' | ');
}

function exhaustiveSearch(ctx: SearchContext, ids: string[], playing: number): Candidate[] {
  const n = ids.length;
  const top: { cost: number; slots: number[] }[] = [];
  let worst = Infinity;
  let benchCost = 0;
  const consider = (slots: number[]) => {
    const cost = arrangementCost(ctx, slots, playing) + benchCost;
    if (top.length >= TOP_CANDIDATES && cost >= worst) return;
    top.push({ cost, slots: slots.slice(0, playing) });
    top.sort((a, b) => a.cost - b.cost);
    if (top.length > TOP_CANDIDATES) top.pop();
    worst = top.length >= TOP_CANDIDATES ? top[top.length - 1]!.cost : Infinity;
  };
  forEachCombination(n, n - playing, (bench) => {
    const benched = new Set(bench);
    benchCost = bench.reduce((sum, i) => sum + ctx.benchPenalty[i]!, 0);
    const items: number[] = [];
    for (let i = 0; i < n; i += 1) if (!benched.has(i)) items.push(i);
    forEachArrangement(items, consider);
  });
  return top.map((item) => ({ ...item, signature: signatureOf(item.slots, ids) }));
}

function shuffle(items: number[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

/** Leo đồi bằng phép đổi chỗ 2 người, lặp lại từ nhiều điểm xuất phát ngẫu nhiên. */
function localSearch(ctx: SearchContext, ids: string[], playing: number, rng: () => number): Candidate[] {
  const n = ids.length;
  const found = new Map<string, Candidate>();
  const totalCost = (order: number[]) => {
    let cost = arrangementCost(ctx, order, playing);
    for (let i = playing; i < n; i += 1) cost += ctx.benchPenalty[order[i]!]!;
    return cost;
  };
  for (let restart = 0; restart < LOCAL_SEARCH_RESTARTS; restart += 1) {
    const order = Array.from({ length: n }, (_, i) => i);
    shuffle(order, rng);
    let current = totalCost(order);
    for (;;) {
      let bestCost = current;
      let bestI = -1;
      let bestJ = -1;
      for (let i = 0; i < playing; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          // Đổi chỗ trong cùng một team không tạo ra phương án mới.
          if (j < playing && Math.floor(i / 2) === Math.floor(j / 2)) continue;
          [order[i], order[j]] = [order[j]!, order[i]!];
          const cost = totalCost(order);
          [order[i], order[j]] = [order[j]!, order[i]!];
          if (cost < bestCost - 1e-9) {
            bestCost = cost;
            bestI = i;
            bestJ = j;
          }
        }
      }
      if (bestI < 0) break;
      [order[bestI], order[bestJ]] = [order[bestJ]!, order[bestI]!];
      current = bestCost;
    }
    const slots = order.slice(0, playing);
    const signature = signatureOf(slots, ids);
    if (!found.has(signature)) found.set(signature, { cost: current, slots, signature });
  }
  return [...found.values()].sort((a, b) => a.cost - b.cost);
}

/** Chọn phương án: lần đầu lấy tốt nhất; "Xếp lại" lấy ngẫu nhiên trong nhóm gần tốt nhất, tránh các phương án đã xem. */
function pickCandidate(
  sorted: Candidate[],
  exclude: string[],
  rng: () => number,
): { candidate: Candidate; cycled: boolean } {
  const best = sorted[0]!;
  if (exclude.length === 0) return { candidate: best, cycled: false };

  const tolerance = best.cost + Math.max(8, best.cost * 0.25);
  let near = sorted.filter((c) => c.cost <= tolerance).slice(0, 12);
  if (near.length < 3) near = sorted.slice(0, 3);

  const seen = new Set(exclude);
  let pool = near.filter((c) => !seen.has(c.signature));
  let cycled = false;
  if (pool.length === 0) {
    // Đã xem hết các phương án tốt -> quay vòng, chỉ tránh phương án vừa hiển thị.
    cycled = true;
    const last = exclude[exclude.length - 1];
    pool = near.filter((c) => c.signature !== last);
    if (pool.length === 0) pool = near;
  }
  return { candidate: pool[Math.floor(rng() * pool.length)] ?? best, cycled };
}

// ---------------------------------------------------------------------------
// API chính
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  levels: Level[];
  courtCount: number;
  history?: PairingHistory;
  /** Lượt đấu đang xếp (mặc định 1). */
  round?: number;
  /** Số lần mỗi người (theo player id) đã ngồi chờ ở các lượt khác – để xoay vòng người chờ. */
  waitCounts?: Record<string, number>;
  /** Chữ ký các phương án đã hiển thị, để "Xếp lại" không lặp lại. */
  excludeSignatures?: string[];
  rng?: () => number;
  weights?: Partial<PairingWeights>;
}

export interface PairingResult {
  matches: Match[];
  unassignedPlayerIds: string[];
  balanceScore: number;
  signature: string;
  /** true khi đã hết phương án mới và phải quay vòng. */
  cycled: boolean;
}

/** Người chơi đủ điều kiện xếp cặp: không nghỉ và đã có giới tính, trình độ hợp lệ. */
export function getEligiblePlayers(players: SessionPlayer[], levels: Level[]): SessionPlayer[] {
  return players.filter(
    (p) => !p.resting && p.name.trim() !== '' && p.gender !== null && getLevelScore(p.level, levels) > 0,
  );
}

/** Phân bổ trận vào sân theo thứ tự, chia đều: 4 trận/2 sân -> Sân 1: Trận 1-2, Sân 2: Trận 3-4. */
export function assignCourts<T extends { court: number; matchNumber: number }>(matches: T[], courtCount: number): T[] {
  const courts = Math.max(1, Math.min(Math.floor(courtCount) || 1, Math.max(matches.length, 1)));
  const base = Math.floor(matches.length / courts);
  const extra = matches.length % courts;
  const result: T[] = [];
  let index = 0;
  for (let court = 1; court <= courts; court += 1) {
    const size = base + (court <= extra ? 1 : 0);
    for (let i = 0; i < size; i += 1) {
      result.push({ ...matches[index]!, court, matchNumber: index + 1 });
      index += 1;
    }
  }
  return result;
}

/**
 * Xếp toàn bộ người chơi thành các trận đôi cân bằng.
 * Chỉ dùng giới tính + điểm trình độ; playerType không ảnh hưởng tới kết quả.
 */
export function generateMatches(players: SessionPlayer[], options: GenerateOptions): PairingResult {
  const { levels } = options;
  const rng = options.rng ?? Math.random;
  const n = players.length;
  const playing = Math.floor(n / 4) * 4;
  if (playing === 0) {
    return {
      matches: [],
      unassignedPlayerIds: players.map((p) => p.id),
      balanceScore: 0,
      signature: '',
      cycled: false,
    };
  }

  const ids = players.map((p) => p.id);
  const keys = players.map(getPlayerKey);
  const history = options.history;
  const historyMatrix = (bucket: Record<string, number> | undefined) =>
    keys.map((a) => keys.map((b) => Math.min(bucket?.[pairKey(a, b)] ?? 0, MAX_HISTORY_COUNT)));
  const female = players.map((p) => (p.gender === 'female' ? 1 : 0));
  const femaleCount = female.reduce<number>((sum, value) => sum + value, 0);

  const weights = { ...DEFAULT_PAIRING_WEIGHTS, ...options.weights };
  const round = options.round ?? 1;
  const ctx: SearchContext = {
    benchPenalty: players.map((p) => weights.benchRepeat * (options.waitCounts?.[p.id] ?? 0)),
    scores: players.map((p) => getLevelScore(p.level, levels)),
    female,
    mixedPossible: femaleCount > 0 && femaleCount < n,
    partner: historyMatrix(history?.partners),
    opponent: historyMatrix(history?.opponents),
    weights,
  };

  const searchSize = combinationCount(n, n - playing) * arrangementCount(playing);
  const candidates =
    searchSize <= EXHAUSTIVE_LIMIT ? exhaustiveSearch(ctx, ids, playing) : localSearch(ctx, ids, playing, rng);

  const { candidate, cycled } = pickCandidate(candidates, options.excludeSignatures ?? [], rng);

  // Trận mạnh xếp trước; trong mỗi trận, team và người chơi giữ thứ tự ổn định.
  const strength = (i: number) => ctx.scores[i]!;
  const groups: number[][] = [];
  for (let i = 0; i < candidate.slots.length; i += 4) groups.push(candidate.slots.slice(i, i + 4));
  groups.sort((x, y) => {
    const diff = y.reduce((s, i) => s + strength(i), 0) - x.reduce((s, i) => s + strength(i), 0);
    return diff !== 0 ? diff : Math.min(...x) - Math.min(...y);
  });

  const team = (a: number, b: number): TeamIds => {
    const [first, second] = strength(a) > strength(b) || (strength(a) === strength(b) && a < b) ? [a, b] : [b, a];
    return [ids[first]!, ids[second]!];
  };
  const rawMatches: Match[] = groups.map((group, index) => ({
    id: `r${round}_match_${index + 1}`,
    round,
    matchNumber: index + 1,
    court: 1,
    teamA: team(group[0]!, group[1]!),
    teamB: team(group[2]!, group[3]!),
  }));
  const matches = assignCourts(rawMatches, options.courtCount);

  const assigned = new Set(candidate.slots.map((i) => ids[i]!));
  return {
    matches,
    unassignedPlayerIds: ids.filter((id) => !assigned.has(id)),
    balanceScore: calculateBalanceScore(matches, players, levels),
    signature: candidate.signature,
    cycled,
  };
}

export interface GeneratedPair {
  playerIds: TeamIds;
  strength: number;
}

/** Danh sách các cặp (team) của phương án tốt nhất. */
export function generatePairs(players: SessionPlayer[], options: GenerateOptions): GeneratedPair[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const strengthOf = (ids: TeamIds) =>
    getLevelScore(byId.get(ids[0])?.level, options.levels) + getLevelScore(byId.get(ids[1])?.level, options.levels);
  return generateMatches(players, options).matches.flatMap((match) => [
    { playerIds: match.teamA, strength: strengthOf(match.teamA) },
    { playerIds: match.teamB, strength: strengthOf(match.teamB) },
  ]);
}

/**
 * Điểm cân bằng 0–100 của một phương án (100 = hai team mỗi trận ngang nhau,
 * partner cùng trình độ). Chỉ để hiển thị cho admin.
 */
export function calculateBalanceScore(matches: Match[], players: SessionPlayer[], levels: Level[]): number {
  if (matches.length === 0) return 0;
  const byId = new Map(players.map((p) => [p.id, p]));
  const score = (id: string) => getLevelScore(byId.get(id)?.level, levels);
  let totalDiff = 0;
  let totalGap = 0;
  const averages: number[] = [];
  for (const match of matches) {
    const [a, b] = match.teamA.map(score) as [number, number];
    const [c, d] = match.teamB.map(score) as [number, number];
    totalDiff += Math.abs(a + b - c - d);
    totalGap += (Math.abs(a - b) + Math.abs(c - d)) / 2;
    averages.push((a + b + c + d) / 2);
  }
  const avgDiff = totalDiff / matches.length;
  const avgGap = totalGap / matches.length;
  const mean = averages.reduce((s, v) => s + v, 0) / averages.length;
  const spread = Math.sqrt(averages.reduce((s, v) => s + (v - mean) ** 2, 0) / averages.length);
  const value = 100 - avgDiff * 12 - avgGap * 2 - spread;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Đổi chỗ hai người chơi (kể cả với người chưa được xếp). Truyền `round` để chỉ đổi trong một lượt. */
export function swapPlayers(matches: Match[], playerA: string, playerB: string, round?: number): Match[] {
  if (playerA === playerB) return matches;
  const swap = (id: string) => (id === playerA ? playerB : id === playerB ? playerA : id);
  return matches.map((match) =>
    round !== undefined && match.round !== round
      ? match
      : { ...match, teamA: [swap(match.teamA[0]), swap(match.teamA[1])], teamB: [swap(match.teamB[0]), swap(match.teamB[1])] },
  );
}

// ---------------------------------------------------------------------------
// Kết quả trận đấu
// ---------------------------------------------------------------------------

export interface ScoreRules {
  /** Số điểm để thắng ván. */
  target: number;
  /** Khi hai đội cùng chạm `target - 1` (deuce), phải hơn nhau từng này điểm mới thắng. */
  deuceMargin: number;
  /** Điểm tối đa: đội chạm mốc này trước thì thắng dù chỉ hơn 1 điểm. */
  cap: number;
}

/** Luật của CLB: mỗi trận 1 ván (BO1), 21 điểm, deuce cách 2 điểm, tối đa 25 điểm. */
export const SCORE_RULES: ScoreRules = { target: 21, deuceMargin: 2, cap: 25 };

export type MatchWinner = 'A' | 'B';

type ScorePair = Pick<Match, 'scoreA' | 'scoreB'>;

function bothScores(match: ScorePair): [number, number] | null {
  const { scoreA, scoreB } = match;
  if (scoreA === null || scoreA === undefined || scoreB === null || scoreB === undefined) return null;
  return [scoreA, scoreB];
}

/**
 * Kiểm tra tỉ số theo luật. Trả về null khi hợp lệ hoặc khi chưa nhập đủ hai ô;
 * ngược lại trả về lý do bằng tiếng Việt để hiển thị cho admin.
 */
export function validateMatchScore(match: ScorePair, rules: ScoreRules = SCORE_RULES): string | null {
  const scores = bothScores(match);
  if (!scores) return null;
  const high = Math.max(...scores);
  const low = Math.min(...scores);
  const deuce = rules.target - 1;
  if (high > rules.cap) return `Điểm tối đa là ${rules.cap}.`;
  if (high < rules.target) return `Chưa đội nào đạt ${rules.target} điểm.`;
  if (high === low) return 'Hai đội không thể bằng điểm khi kết thúc trận.';
  if (high === rules.cap) {
    // Chạm điểm tối đa: thắng dù chỉ hơn 1 điểm, nhưng phải đi qua deuce.
    return low >= rules.cap - rules.deuceMargin ? null : `${rules.cap} điểm chỉ xảy ra sau deuce, đội thua phải có ${rules.cap - rules.deuceMargin} hoặc ${rules.cap - 1} điểm.`;
  }
  if (high === rules.target) {
    return low < deuce ? null : `${deuce}–${deuce} phải đánh tiếp tới khi cách ${rules.deuceMargin} điểm (ví dụ ${rules.target + 1}–${deuce}).`;
  }
  // Trên 21 điểm: chỉ xảy ra sau deuce và phải cách đúng 2 điểm.
  return high - low === rules.deuceMargin ? null : `Sau deuce phải thắng cách ${rules.deuceMargin} điểm (ví dụ ${high}–${high - rules.deuceMargin}).`;
}

/** Đội thắng theo tỉ số đã ghi; null khi chưa nhập đủ hoặc tỉ số không đúng luật. */
export function getMatchWinner(match: ScorePair, rules: ScoreRules = SCORE_RULES): MatchWinner | null {
  const scores = bothScores(match);
  if (!scores || validateMatchScore(match, rules) !== null) return null;
  return scores[0] > scores[1] ? 'A' : 'B';
}

/** Ghi tỉ số cho một trận. Giá trị không hợp lệ (âm, không phải số) được coi là để trống. */
export function setMatchScore(matches: Match[], matchId: string, scoreA: number | null, scoreB: number | null): Match[] {
  const clean = (value: number | null) => (value === null || !Number.isFinite(value) || value < 0 ? null : Math.min(Math.floor(value), 99));
  return matches.map((match) => (match.id === matchId ? { ...match, scoreA: clean(scoreA), scoreB: clean(scoreB) } : match));
}

export function hasScores(matches: Match[]): boolean {
  return matches.some((match) => (match.scoreA ?? null) !== null || (match.scoreB ?? null) !== null);
}

// ---------------------------------------------------------------------------
// Nhiều lượt đấu trong một buổi
// ---------------------------------------------------------------------------

/** Danh sách số lượt đang có, tăng dần. */
export function getRounds(matches: Match[]): number[] {
  return [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b);
}

export function getRoundMatches(matches: Match[], round: number): Match[] {
  return matches.filter((match) => match.round === round);
}

/** Thay toàn bộ trận của một lượt, giữ nguyên các lượt khác và thứ tự lượt. */
export function setRoundMatches(matches: Match[], round: number, roundMatches: Match[]): Match[] {
  return [...matches.filter((match) => match.round !== round), ...roundMatches].sort(
    (a, b) => a.round - b.round || a.matchNumber - b.matchNumber,
  );
}

/** Xoá một lượt và đánh số lại các lượt phía sau. */
export function removeRound(matches: Match[], round: number): Match[] {
  return matches
    .filter((match) => match.round !== round)
    .map((match) =>
      match.round > round ? { ...match, round: match.round - 1, id: `r${match.round - 1}_match_${match.matchNumber}` } : match,
    );
}

/** Chia lại sân cho từng lượt khi số sân thay đổi. */
export function reassignCourts(matches: Match[], courtCount: number): Match[] {
  return getRounds(matches).flatMap((round) => assignCourts(getRoundMatches(matches, round), courtCount));
}

/** Người sẵn sàng chơi nhưng không có trận trong một lượt. */
export function getWaitingPlayers(players: SessionPlayer[], matches: Match[], round: number): SessionPlayer[] {
  const assigned = getAssignedPlayerIds(getRoundMatches(matches, round));
  return players.filter((player) => !player.resting && !assigned.has(player.id));
}

/** Số lần mỗi người đã ngồi chờ ở các lượt khác `excludeRound`. */
export function getWaitCounts(players: SessionPlayer[], matches: Match[], excludeRound?: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const round of getRounds(matches)) {
    if (round === excludeRound) continue;
    for (const player of getWaitingPlayers(players, matches, round)) counts[player.id] = (counts[player.id] ?? 0) + 1;
  }
  return counts;
}

/** Số lượt mỗi người đã được chơi trong buổi. */
export function getPlayCounts(matches: Match[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const match of matches) for (const id of [...match.teamA, ...match.teamB]) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/**
 * Lịch sử partner / đối thủ dùng khi xếp một lượt: các buổi trước + các lượt khác của chính buổi này.
 * Trùng cặp ngay trong buổi được tính nặng gấp 3 so với trùng ở buổi trước.
 */
export function buildRoundHistory(otherSessions: Session[], session: Session, excludeRound: number): PairingHistory {
  const sameSession = { ...session, pairings: session.pairings.filter((match) => match.round !== excludeRound) };
  return buildPairingHistory([...otherSessions, sameSession, sameSession, sameSession]);
}

/** Chữ ký của một kết quả xếp cặp, không phụ thuộc thứ tự trận / team / người. */
export function getPairingSignature(matches: Match[]): string {
  return matches
    .map((match) => [[...match.teamA].sort().join('+'), [...match.teamB].sort().join('+')].sort().join(' v '))
    .sort()
    .join(' | ');
}

export function getAssignedPlayerIds(matches: Match[]): Set<string> {
  return new Set(matches.flatMap((match) => [...match.teamA, ...match.teamB]));
}

/** Trình sinh số giả ngẫu nhiên có seed – dùng cho test để kết quả lặp lại được. */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
