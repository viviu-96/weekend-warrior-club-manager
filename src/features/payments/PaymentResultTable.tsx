import { Check, Undo2 } from 'lucide-react';
import { Badge, cx, MoneyInput } from '../../components/ui';
import type { PaymentRow, PaymentStatus, Reconciliation } from '../../services/paymentService';
import { formatVND, getDayShort } from '../../utils/format';

interface Props {
  rows: PaymentRow[];
  reconciliation: Reconciliation;
  /** Ngày của buổi – dùng cho tiêu đề cột "Tiền sân T7". */
  date: string;
  /** Không truyền -> bảng chỉ đọc (trang lịch sử, khi đã khoá). */
  onPaidChange?: (row: PaymentRow, amount: number) => void;
}

const STATUS: Record<PaymentStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'blue' }> = {
  paid: { label: '✓ Đã đủ', tone: 'green' },
  partial: { label: '◐ Thu một phần', tone: 'amber' },
  unpaid: { label: '○ Chưa thu', tone: 'red' },
  overpaid: { label: '↺ Dư', tone: 'blue' },
};

function Remaining({ row }: { row: PaymentRow }) {
  if (row.overpaid > 0) return <span className="font-semibold text-sky-800">Dư: {formatVND(row.overpaid)}</span>;
  if (row.outstanding === 0) return <span className="font-semibold text-emerald-800">0 ₫</span>;
  return <span className="font-semibold text-red-700">{formatVND(row.outstanding)}</span>;
}

/** Bảng thu tiền: bảng trên desktop, thẻ trên mobile. */
export function PaymentResultTable({ rows, reconciliation, date, onPaidChange }: Props) {
  const day = getDayShort(date);
  const showContribution = reconciliation.totalContribution > 0;
  // Số tiền mặt cần thu để dòng này đủ (sau khi trừ tiền ứng).
  const fullAmount = (row: PaymentRow) => Math.max(row.roundedPayable - row.advancePayment, 0);

  const paidCell = (row: PaymentRow) =>
    onPaidChange ? (
      <div className="flex items-center justify-end gap-1">
        <MoneyInput className="w-28" label={`Đã thu của ${row.name}`} value={row.paidAmount} onChange={(amount) => onPaidChange(row, amount)} />
        {row.outstanding === 0 && row.paidAmount > 0 ? (
          <button
            type="button"
            title="Bỏ đánh dấu đã thu"
            aria-label={`Bỏ đánh dấu đã thu của ${row.name}`}
            onClick={() => onPaidChange(row, 0)}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:bg-slate-100 active:scale-90 print:hidden"
          >
            <Undo2 size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            title="Đánh dấu đã thu đủ"
            aria-label={`Đánh dấu ${row.name} đã đóng đủ`}
            disabled={row.outstanding === 0}
            onClick={() => onPaidChange(row, fullAmount(row))}
            className="rounded-lg border border-emerald-600 bg-emerald-50 p-2 text-emerald-800 transition hover:bg-emerald-100 active:scale-90 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-white disabled:opacity-30 print:hidden"
          >
            <Check size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    ) : (
      formatVND(row.paidAmount)
    );

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block print:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
              <th scope="col" className="w-10 py-2 pr-2">STT</th>
              <th scope="col" className="py-2 pr-2">Tên</th>
              <th scope="col" className="py-2 pr-2 text-right">Tiền sân {day}</th>
              <th scope="col" className="py-2 pr-2 text-right">Tiền cầu {day}</th>
              {showContribution && <th scope="col" className="py-2 pr-2 text-right">Góp cầu</th>}
              <th scope="col" className="py-2 pr-2 text-right">Thành tiền</th>
              <th scope="col" className="py-2 pr-2 text-right">Đã ứng</th>
              <th scope="col" className="py-2 pr-2 text-right">Đã thu</th>
              <th scope="col" className="py-2 pr-2 text-right">Còn thiếu</th>
              <th scope="col" className="py-2">Ghi chú</th>
            </tr>
          </thead>
          <tbody className="tabular-nums [&_td:not(:last-child)]:whitespace-nowrap">
            {rows.map((row, index) => (
              <tr key={row.key} className={cx('border-b border-slate-100 align-middle transition-colors', row.status === 'paid' ? 'bg-emerald-50/60 print:bg-transparent' : 'hover:bg-slate-50')}>
                <td className="py-2 pr-2 text-slate-500">{index + 1}</td>
                <td className="py-2 pr-2">
                  <span className="font-semibold text-slate-900">{row.name}</span>
                  <span className="ml-2 print:hidden">
                    <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                  </span>
                </td>
                <td className="py-2 pr-2 text-right">{formatVND(row.courtShare)}</td>
                <td className="py-2 pr-2 text-right">{formatVND(row.shuttleShare)}</td>
                {showContribution && <td className="py-2 pr-2 text-right">{row.shuttleContribution > 0 ? `-${formatVND(row.shuttleContribution)}` : '–'}</td>}
                <td className="py-2 pr-2 text-right font-semibold">{formatVND(row.roundedPayable)}</td>
                <td className="py-2 pr-2 text-right">{row.advancePayment > 0 ? formatVND(row.advancePayment) : '–'}</td>
                <td className="py-2 pr-2 text-right">{paidCell(row)}</td>
                <td className="py-2 pr-2 text-right">
                  <Remaining row={row} />
                </td>
                <td className="py-2 text-xs text-slate-600">{row.notes.join(' • ')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="whitespace-nowrap tabular-nums">
            <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
              <td className="py-2 pr-2" />
              <td className="py-2 pr-2">Tổng</td>
              <td className="py-2 pr-2 text-right">{formatVND(reconciliation.totalCourt - reconciliation.unallocatedCourt)}</td>
              <td className="py-2 pr-2 text-right">{formatVND(reconciliation.totalShuttle - reconciliation.unallocatedShuttle)}</td>
              {showContribution && <td className="py-2 pr-2 text-right">-{formatVND(reconciliation.totalContribution)}</td>}
              <td className="py-2 pr-2 text-right">{formatVND(reconciliation.totalPayable)}</td>
              <td className="py-2 pr-2 text-right">{formatVND(reconciliation.totalAdvance)}</td>
              <td className="py-2 pr-2 text-right">{formatVND(reconciliation.totalPaid)}</td>
              <td className="py-2 pr-2 text-right">{formatVND(reconciliation.totalOutstanding)}</td>
              <td className="py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile */}
      <ul className="space-y-3 md:hidden print:hidden">
        {rows.map((row) => (
          <li key={row.key} className={cx('rounded-xl border p-3 transition-colors', row.status === 'paid' ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold text-slate-900">{row.name}</span>
              <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-slate-600">Tiền sân {day}</dt>
              <dd className="text-right">{formatVND(row.courtShare)}</dd>
              <dt className="text-slate-600">Tiền cầu {day}</dt>
              <dd className="text-right">{formatVND(row.shuttleShare)}</dd>
              {row.shuttleContribution > 0 && (
                <>
                  <dt className="text-slate-600">Đóng góp cầu</dt>
                  <dd className="text-right">-{formatVND(row.shuttleContribution)}</dd>
                </>
              )}
              <dt className="font-semibold text-slate-900">Thành tiền</dt>
              <dd className="text-right font-semibold">{formatVND(row.roundedPayable)}</dd>
              {row.advancePayment > 0 && (
                <>
                  <dt className="text-slate-600">Đã ứng</dt>
                  <dd className="text-right">{formatVND(row.advancePayment)}</dd>
                </>
              )}
              <dt className="self-center text-slate-600">Đã thu</dt>
              <dd className="text-right">{paidCell(row)}</dd>
              <dt className="text-slate-600">Còn thiếu</dt>
              <dd className="text-right">
                <Remaining row={row} />
              </dd>
            </dl>
            {row.notes.length > 0 && <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">Ghi chú: {row.notes.join(' • ')}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
