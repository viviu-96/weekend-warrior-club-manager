import { cx } from '../../components/ui';
import type { Reconciliation } from '../../services/paymentService';
import { formatVND } from '../../utils/format';

function signed(amount: number): string {
  return `${amount > 0 ? '+' : ''}${formatVND(amount)}`;
}

/** Đối soát buổi chơi: tổng chi, tổng phải thu, đã thu, còn thiếu, chênh lệch. */
export function ReconcilePanel({ reconciliation: r }: { reconciliation: Reconciliation }) {
  const unallocated = r.unallocatedCourt + r.unallocatedShuttle;
  const lines: { label: string; value: string; strong?: boolean; tone?: string }[] = [
    { label: 'Tổng tiền sân', value: formatVND(r.totalCourt) },
    { label: 'Tổng tiền cầu', value: formatVND(r.totalShuttle) },
    { label: 'Tổng chi', value: formatVND(r.totalCost), strong: true },
    { label: 'Tổng phải thu', value: formatVND(r.totalPayable), strong: true },
    ...(r.totalContribution > 0 ? [{ label: 'Đã đóng góp bằng cầu', value: formatVND(r.totalContribution) }] : []),
    { label: 'Đã thu (gồm tiền ứng)', value: formatVND(r.totalCollected), tone: 'text-emerald-800' },
    { label: 'Còn thiếu', value: formatVND(r.totalOutstanding), strong: true, tone: r.totalOutstanding > 0 ? 'text-red-700' : 'text-emerald-800' },
    ...(r.totalOverpaid > 0 ? [{ label: 'Thu dư (cần trả lại)', value: formatVND(r.totalOverpaid), tone: 'text-sky-800' }] : []),
    { label: 'Chênh lệch so với tổng chi', value: signed(r.difference), tone: r.difference < 0 ? 'text-red-700' : undefined },
  ];

  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums sm:grid-cols-[1fr_auto]">
        {lines.map((line) => (
          <div key={line.label} className="contents">
            <dt className={cx('text-slate-600', line.strong && 'font-semibold text-slate-900')}>{line.label}</dt>
            <dd className={cx('text-right', line.strong && 'font-semibold', line.tone)}>{line.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 print:hidden">
        <p>
          Rounding adjustment: <span className="font-semibold tabular-nums">{signed(r.roundingAdjustment)}</span> – phần tăng thêm do làm tròn từng
          người lên 500 ₫ (chỉ hiển thị nội bộ).
        </p>
        {unallocated > 0 && (
          <p className="text-red-700">
            ⚠ Còn {formatVND(unallocated)} chi phí chưa có ai chịu (
            {[r.unallocatedCourt > 0 && 'tiền sân', r.unallocatedShuttle > 0 && 'tiền cầu'].filter(Boolean).join(', ')}).
          </p>
        )}
      </div>
    </div>
  );
}
