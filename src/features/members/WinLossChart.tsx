import { Avatar } from '../../components/ui';
import { buildWinLossChart, type MemberStats } from '../../services/statsService';
import type { Member } from '../../types';

// Cặp màu phân kỳ (xanh dương ↔ đỏ) đã kiểm tra phân biệt được với người mù màu trên nền trắng.
// Chữ luôn dùng màu chữ, không dùng màu của thanh.
const COLOR = { win: '#2a78d6', loss: '#e34948' };
// Chừa chỗ cho con số ở đầu thanh để thanh dài nhất không đẩy số ra ngoài.
const LABEL_SPACE = '1.75rem';

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/**
 * Biểu đồ thắng / thua theo thành viên: thua mọc sang trái, thắng mọc sang phải từ trục giữa.
 * Chỉ tính các trận đã ghi tỉ số đúng luật.
 */
export function WinLossChart({ members, stats }: { members: Member[]; stats: Map<string, MemberStats> }) {
  const { rows, max } = buildWinLossChart(members, stats);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
        Chưa có trận nào được ghi tỉ số. Nhập tỉ số ở trang Xếp cặp để xem biểu đồ thắng / thua.
      </p>
    );
  }

  const width = (value: number) => `calc((100% - ${LABEL_SPACE}) * ${max > 0 ? value / max : 0})`;

  return (
    <figure className="rounded-xl border border-slate-200 p-3 sm:p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold text-slate-900">Thắng / thua theo thành viên</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          <Swatch color={COLOR.loss} label="Thua" />
          <Swatch color={COLOR.win} label="Thắng" />
        </span>
      </figcaption>

      <div className="mb-1 grid grid-cols-[4.5rem_1fr_2.75rem] items-end gap-2 text-[11px] font-medium text-slate-500 sm:grid-cols-[9rem_1fr_3.5rem]" aria-hidden="true">
        <span />
        <span className="grid grid-cols-2">
          <span className="pr-2 text-right">← Thua</span>
          <span className="pl-2">Thắng →</span>
        </span>
        <span className="text-right">Tỉ lệ</span>
      </div>

      <ul>
        {rows.map(({ member, wins, losses, winRate, matchesScored }) => {
          const summary = `${member.name}: ${wins} thắng, ${losses} thua trên ${matchesScored} trận – tỉ lệ thắng ${winRate}%`;
          return (
            <li
              key={member.id}
              tabIndex={0}
              aria-label={summary}
              className="group relative grid grid-cols-[4.5rem_1fr_2.75rem] items-center gap-2 rounded-lg py-1.5 outline-none hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600 sm:grid-cols-[9rem_1fr_3.5rem]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="hidden sm:inline-flex">
                  <Avatar name={member.name} gender={member.gender} size="sm" />
                </span>
                <span className="truncate text-sm font-medium text-slate-900">{member.name}</span>
              </span>

              <span className="relative grid grid-cols-2" aria-hidden="true">
                {/* Trục giữa */}
                <span className="pointer-events-none absolute inset-y-[-6px] left-1/2 w-px bg-slate-300" />
                {/* Nửa trái: thua */}
                <span className="flex items-center justify-end gap-0.5 pr-px">
                  <span className="w-6 shrink-0 pr-1 text-right text-xs tabular-nums text-slate-700">{losses > 0 ? losses : ''}</span>
                  {losses > 0 && <span className="h-4 rounded-l-[4px]" style={{ width: width(losses), backgroundColor: COLOR.loss }} />}
                </span>
                {/* Nửa phải: thắng */}
                <span className="flex items-center gap-0.5 pl-px">
                  {wins > 0 && <span className="h-4 rounded-r-[4px]" style={{ width: width(wins), backgroundColor: COLOR.win }} />}
                  <span className="w-6 shrink-0 pl-1 text-xs tabular-nums text-slate-700">{wins > 0 ? wins : ''}</span>
                </span>
              </span>

              <span className="text-right text-sm font-semibold tabular-nums text-slate-900" aria-hidden="true">
                {winRate}%
              </span>

              {/* Chú giải khi rê chuột / chạm / focus */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-10 hidden w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus-visible:block"
              >
                <span className="block font-semibold">{member.name}</span>
                {wins} thắng • {losses} thua
                <span className="block text-slate-300">
                  {matchesScored} trận đã ghi tỉ số • tỉ lệ thắng {winRate}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Xếp theo tỉ lệ thắng. Chỉ tính các trận đã ghi tỉ số; số liệu đầy đủ có trong bảng bên dưới.</p>
    </figure>
  );
}
