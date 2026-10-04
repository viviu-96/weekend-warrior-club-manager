import type { Member, Session, Settings } from '../types';
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
  /** Partner ghép nhiều nhất, tối đa 3 người. */
  topPartners: PartnerCount[];
  /** Tổng tiền phải đóng (đã làm tròn theo từng buổi), chỉ tính phần của riêng người này. */
  totalPayable: number;
  /** Tổng tiền đã đóng = đã ứng + đã thu. */
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
      entry.totalPayable += payment.roundedPayable;
      entry.totalPaid += payment.advancePayment + payment.paidAmount;
    }

    for (const match of session.pairings) {
      for (const team of [match.teamA, match.teamB]) {
        const [first, second] = team.map((id) => playerById.get(id));
        if (!first || !second) continue;
        for (const [self, partner] of [
          [first, second],
          [second, first],
        ] as const) {
          const entry = self.memberId ? stats.get(self.memberId) : undefined;
          if (!entry || !self.memberId) continue;
          entry.matchesPlayed += 1;
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
    entry.topPartners = [...(partners.get(memberId)?.values() ?? [])]
      // Tên hiện tại của thành viên, phòng khi đã đổi tên sau buổi chơi.
      .map((partner) => ({ ...partner, name: (partner.memberId && memberName.get(partner.memberId)) || partner.name }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'))
      .slice(0, 3);
  }
  return stats;
}

export type StatsSortKey = 'name' | 'sessionsPlayed' | 'matchesPlayed' | 'totalPaid' | 'outstanding';

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
    return sign * ((stats.get(a.id)?.[key] ?? 0) - (stats.get(b.id)?.[key] ?? 0)) || byName(a, b);
  });
}
