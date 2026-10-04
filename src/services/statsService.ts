import type { Member, Session, Settings } from '../types';
import { getMatchWinner } from './pairingService';
import { calculateSessionPlayerPayments } from './paymentService';

type PaymentSettings = Pick<Settings, 'halfPlayCourtMode'>;

export interface PartnerCount {
  /** memberId của partner, hoặc null nếu là người vãng lai. */
  memberId: string | null;
  name: string;
  count: number;
}

export interface MemberStats {
  memberId: string;
  /** Số buổi có tham gia chơi (không tính buổi chỉ có tên nhưng không chơi). */
  sessionsPlayed: number;
  /** Số buổi có tên trong danh sách. */
  sessionsListed: number;
  matchesPlayed: number;
  /** Số trận đã ghi tỉ số hợp lệ theo luật. */
  matchesScored: number;
  wins: number;
  losses: number;
  /** Tỉ lệ thắng trên các trận đã ghi tỉ số (0–100); null khi chưa có trận nào được ghi. */
  winRate: number | null;
  /** Partner ghép nhiều nhất, tối đa 3 người. */
  topPartners: PartnerCount[];
  /** Tổng tiền phải đóng (đã làm tròn theo từng buổi), gồm cả phần của khách đi cùng. */
  totalPayable: number;
  /** Tổng tiền đã đóng = đã ứng + đã thu, gồm cả phần đóng cho khách đi cùng. */
  totalPaid: number;
  /** Còn nợ (>= 0). */
  outstanding: number;
  lastPlayedDate: string | null;
}

function emptyStats(memberId: string): MemberStats {
  return {
    memberId,
    sessionsPlayed: 0,
    sessionsListed: 0,
    matchesPlayed: 0,
    matchesScored: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    topPartners: [],
    totalPayable: 0,
    totalPaid: 0,
    outstanding: 0,
    lastPlayedDate: null,
  };
}

/** Thống kê theo thành viên trên toàn bộ các buổi đã lưu. */
export function calculateMemberStats(members: Member[], sessions: Session[], settings: PaymentSettings): Map<string, MemberStats> {
  const stats = new Map(members.map((member) => [member.id, emptyStats(member.id)]));
  const partners = new Map<string, Map<string, PartnerCount>>();

  for (const session of sessions) {
    const playerById = new Map(session.players.map((player) => [player.id, player]));
    const payments = calculateSessionPlayerPayments(session, settings);

    for (const payment of payments) {
      const memberId = playerById.get(payment.playerId)?.memberId;
      const entry = memberId ? stats.get(memberId) : undefined;
      if (!entry) continue;
      entry.sessionsListed += 1;
      if (payment.playFraction > 0) {
        entry.sessionsPlayed += 1;
        if (!entry.lastPlayedDate || session.date > entry.lastPlayedDate) entry.lastPlayedDate = session.date;
      }
    }

    // Tiền: khách có người giới thiệu được tính vào người giới thiệu, bất kể buổi đó có bật gộp hay không.
    for (const payment of payments) {
      const payerId = playerById.get(payment.referrerPlayerId ?? payment.playerId)?.memberId;
      const payer = payerId ? stats.get(payerId) : undefined;
      if (!payer) continue;
      payer.totalPayable += payment.roundedPayable;
      payer.totalPaid += payment.advancePayment + payment.paidAmount;
    }

    for (const match of session.pairings) {
      const winner = getMatchWinner(match);
      for (const [side, team] of [
        ['A', match.teamA],
        ['B', match.teamB],
      ] as const) {
        const [first, second] = team.map((id) => playerById.get(id));
        if (!first || !second) continue;
        for (const [self, partner] of [
          [first, second],
          [second, first],
        ] as const) {
          const entry = self.memberId ? stats.get(self.memberId) : undefined;
          if (!entry || !self.memberId) continue;
          entry.matchesPlayed += 1;
          if (winner !== null) {
            entry.matchesScored += 1;
            if (winner === side) entry.wins += 1;
            else entry.losses += 1;
          }
          const key = partner.memberId ?? `walkin:${partner.name}`;
          const own = partners.get(self.memberId) ?? new Map<string, PartnerCount>();
          const current = own.get(key) ?? { memberId: partner.memberId, name: partner.name, count: 0 };
          own.set(key, { ...current, name: partner.name, count: current.count + 1 });
          partners.set(self.memberId, own);
        }
      }
    }
  }

  const memberName = new Map(members.map((member) => [member.id, member.name]));
  for (const [memberId, entry] of stats) {
    entry.outstanding = Math.max(entry.totalPayable - entry.totalPaid, 0);
    entry.winRate = entry.matchesScored > 0 ? Math.round((entry.wins / entry.matchesScored) * 100) : null;
    entry.topPartners = [...(partners.get(memberId)?.values() ?? [])]
      // Tên hiện tại của thành viên, phòng khi đã đổi tên sau buổi chơi.
      .map((partner) => ({ ...partner, name: (partner.memberId && memberName.get(partner.memberId)) || partner.name }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'))
      .slice(0, 3);
  }
  return stats;
}

export type StatsSortKey = 'name' | 'sessionsPlayed' | 'matchesPlayed' | 'wins' | 'winRate' | 'totalPaid' | 'outstanding';

export function sortMembersByStats(
  members: Member[],
  stats: Map<string, MemberStats>,
  key: StatsSortKey,
  direction: 'asc' | 'desc',
): Member[] {
  const sign = direction === 'asc' ? 1 : -1;
  const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, 'vi');
  return [...members].sort((a, b) => {
    if (key === 'name') return sign * byName(a, b);
    // Người chưa có trận nào được ghi tỉ số (winRate = null) luôn xếp sau người đã có.
    const value = (member: Member) => stats.get(member.id)?.[key] ?? (key === 'winRate' ? -1 : 0);
    return sign * (value(a) - value(b)) || byName(a, b);
  });
}

export interface WinLossRow {
  member: Member;
  wins: number;
  losses: number;
  matchesScored: number;
  winRate: number;
}

export interface WinLossChart {
  rows: WinLossRow[];
  /** Số trận thắng hoặc thua lớn nhất của một người – dùng làm thang đo chung cho hai nửa biểu đồ. */
  max: number;
}

/** Dữ liệu biểu đồ thắng / thua: chỉ gồm người đã có trận được ghi tỉ số, xếp theo tỉ lệ thắng. */
export function buildWinLossChart(members: Member[], stats: Map<string, MemberStats>): WinLossChart {
  const rows = members
    .flatMap<WinLossRow>((member) => {
      const item = stats.get(member.id);
      if (!item || item.matchesScored === 0 || item.winRate === null) return [];
      return [{ member, wins: item.wins, losses: item.losses, matchesScored: item.matchesScored, winRate: item.winRate }];
    })
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.losses - b.losses || a.member.name.localeCompare(b.member.name, 'vi'));
  const max = rows.reduce((value, row) => Math.max(value, row.wins, row.losses), 0);
  return { rows, max };
}
