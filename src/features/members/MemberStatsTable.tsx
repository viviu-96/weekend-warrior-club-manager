import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, cx } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { calculateMemberStats, sortMembersByStats, type StatsSortKey } from '../../services/statsService';
import type { Member } from '../../types';
import { formatDate, formatVND } from '../../utils/format';

/** Thống kê theo thành viên: số buổi, số trận, partner hay ghép, tiền đã đóng, còn nợ. */
export function MemberStatsTable({ members }: { members: Member[] }) {
  const { members: allMembers, sessions, settings } = useAppData();
  const [sort, setSort] = useState<{ key: StatsSortKey; direction: 'asc' | 'desc' }>({ key: 'sessionsPlayed', direction: 'desc' });

  const stats = useMemo(() => calculateMemberStats(allMembers, sessions, settings), [allMembers, sessions, settings]);
  const visible = sortMembersByStats(members, stats, sort.key, sort.direction);

  const header = (key: StatsSortKey, label: string, align: 'left' | 'right' = 'right') => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={cx('py-2 pr-2', align === 'right' && 'text-right')}>
        <button
          type="button"
          // Cột số: bấm lần đầu xếp từ cao xuống thấp.
          onClick={() => setSort({ key, direction: active ? (sort.direction === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc' })}
          title={`Sắp xếp theo ${label.toLowerCase()}`}
          className={cx('-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold hover:bg-slate-100', active && 'text-emerald-800')}
        >
          {label}
          <Icon size={13} aria-hidden="true" className={active ? '' : 'text-slate-400'} />
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
            {header('name', 'Tên', 'left')}
            {header('sessionsPlayed', 'Số buổi')}
            {header('matchesPlayed', 'Số trận')}
            {header('wins', 'Thắng – Thua')}
            {header('winRate', 'Tỉ lệ thắng')}
            <th scope="col" className="py-2 pr-2">Partner hay ghép</th>
            {header('totalPaid', 'Đã đóng')}
            {header('outstanding', 'Còn nợ')}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {visible.map((member) => {
            const item = stats.get(member.id);
            return (
              <tr key={member.id} className="border-b border-slate-100 transition-colors hover:bg-emerald-50/50">
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={member.name} gender={member.gender} />
                    <span>
                      <span className="font-semibold text-slate-900">{member.name}</span>
                      <span className="block text-xs text-slate-500">
                        {item?.lastPlayedDate ? `Chơi gần nhất ${formatDate(item.lastPlayedDate)}` : 'Chưa tham gia buổi nào'}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-2 text-right font-semibold">{item?.sessionsPlayed ?? 0}</td>
                <td className="py-2 pr-2 text-right">{item?.matchesPlayed ?? 0}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {item && item.matchesScored > 0 ? (
                    <>
                      <span className="font-semibold text-slate-900">{item.wins}</span> – {item.losses}
                      {item.draws > 0 && <span className="text-slate-500"> ({item.draws} hoà)</span>}
                    </>
                  ) : (
                    <span className="text-slate-400">–</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right">{item && item.winRate !== null ? <span className="font-semibold text-slate-900">{item.winRate}%</span> : <span className="text-slate-400">–</span>}</td>
                <td className="py-2 pr-2">
                  {item && item.topPartners.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {item.topPartners.map((partner) => (
                        <span key={`${partner.memberId ?? 'walkin'}-${partner.name}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {partner.name} <span className="font-semibold text-slate-900">×{partner.count}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-slate-400">–</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{formatVND(item?.totalPaid ?? 0)}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {item && item.outstanding > 0 ? <span className="font-semibold text-red-700">{formatVND(item.outstanding)}</span> : <span className="text-emerald-800">✓</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        Số buổi chỉ tính buổi có tham gia chơi. Thắng – Thua và tỉ lệ thắng chỉ tính các trận đã ghi tỉ số. Tiền gồm cả phần của khách đi cùng; “Đã đóng” gồm cả tiền ứng trước.
      </p>
    </div>
  );
}
