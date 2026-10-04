import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar, cx, Select } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { calculateMemberStats, sortMembersByStats, type StatsSortKey } from '../../services/statsService';
import type { Member } from '../../types';
import { WinLossChart } from './WinLossChart';
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

  const SORT_OPTIONS: { key: StatsSortKey; label: string }[] = [
    { key: 'sessionsPlayed', label: 'Số buổi' },
    { key: 'matchesPlayed', label: 'Số trận' },
    { key: 'wins', label: 'Số trận thắng' },
    { key: 'winRate', label: 'Tỉ lệ thắng' },
    { key: 'totalPaid', label: 'Đã đóng' },
    { key: 'outstanding', label: 'Còn nợ' },
    { key: 'name', label: 'Tên' },
  ];

  return (
    <div>
      <div className="mb-4">
        <WinLossChart members={members} stats={stats} />
      </div>

      {/* Mobile: mỗi thành viên một thẻ */}
      <div className="md:hidden">
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <span className="shrink-0">Sắp xếp theo</span>
          <Select
            value={sort.key}
            onChange={(event) => {
              const key = event.target.value as StatsSortKey;
              setSort({ key, direction: key === 'name' ? 'asc' : 'desc' });
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <ul className="space-y-3">
          {visible.map((member) => {
            const item = stats.get(member.id);
            return (
              <li key={member.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={member.name} gender={member.gender} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{member.name}</p>
                    <p className="text-xs text-slate-500">{item?.lastPlayedDate ? `Chơi gần nhất ${formatDate(item.lastPlayedDate)}` : 'Chưa tham gia buổi nào'}</p>
                  </div>
                  {item && item.winRate !== null && (
                    <span className="shrink-0 text-right text-xs text-slate-600">
                      Tỉ lệ thắng
                      <span className="block text-base font-bold tabular-nums text-slate-900">{item.winRate}%</span>
                    </span>
                  )}
                </div>
                <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center tabular-nums">
                  <div className="rounded-lg bg-slate-50 px-1 py-1.5">
                    <dt className="text-[11px] text-slate-600">Số buổi</dt>
                    <dd className="text-sm font-semibold text-slate-900">{item?.sessionsPlayed ?? 0}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-1 py-1.5">
                    <dt className="text-[11px] text-slate-600">Số trận</dt>
                    <dd className="text-sm font-semibold text-slate-900">{item?.matchesPlayed ?? 0}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-1 py-1.5">
                    <dt className="text-[11px] text-slate-600">Thắng – Thua</dt>
                    <dd className="text-sm font-semibold text-slate-900">
                      {item && item.matchesScored > 0 ? `${item.wins} – ${item.losses}` : '–'}
                    </dd>
                  </div>
                </dl>
                {item && item.topPartners.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-600">
                    Hay ghép:
                    {item.topPartners.map((partner) => (
                      <span key={`${partner.memberId ?? 'walkin'}-${partner.name}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                        {partner.name} <span className="font-semibold text-slate-900">×{partner.count}</span>
                      </span>
                    ))}
                  </p>
                )}
                <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-100 pt-2 text-sm tabular-nums">
                  <span className="text-slate-600">
                    Đã đóng <span className="font-semibold text-slate-900">{formatVND(item?.totalPaid ?? 0)}</span>
                  </span>
                  {item && item.outstanding > 0 ? (
                    <span className="font-semibold text-red-700">Còn nợ {formatVND(item.outstanding)}</span>
                  ) : (
                    <span className="font-medium text-emerald-800">✓ Không nợ</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="hidden overflow-x-auto md:block">
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
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Số buổi chỉ tính buổi có tham gia chơi. Thắng – Thua và tỉ lệ thắng chỉ tính các trận đã ghi tỉ số đúng luật. Tiền gồm cả phần của khách đi cùng; “Đã đóng” gồm cả tiền ứng trước.
      </p>
    </div>
  );
}
