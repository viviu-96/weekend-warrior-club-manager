import { Printer } from 'lucide-react';
import { useState } from 'react';
import { CopyButton } from '../../components/CopyButton';
import { Badge, Button, Card, cx, EmptyState, percentOf, ProgressBar } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { calculateCombinedPayments, generateZaloCombinedText, type CombinedRow } from '../../services/ledgerService';
import { sortSessionsByDate } from '../../services/sessionService';
import type { Session } from '../../types';
import { addDays, formatDate, formatVND, getDayShort, parseISODate } from '../../utils/format';

/** Ngày thứ Hai của tuần chứa `iso` – các buổi cùng tuần được chọn sẵn. */
function weekStart(iso: string): string {
  const date = parseISODate(iso);
  if (!date) return iso;
  return addDays(iso, -((date.getDay() + 6) % 7));
}

function defaultSelection(sessions: Session[], anchor: Session | null): string[] {
  if (!anchor) return [];
  const week = weekStart(anchor.date);
  return sessions.filter((session) => weekStart(session.date) === week).map((session) => session.id);
}

function Remaining({ row }: { row: Pick<CombinedRow, 'overpaid' | 'outstanding'> }) {
  if (row.overpaid > 0) return <span className="font-semibold text-sky-800">Dư: {formatVND(row.overpaid)}</span>;
  if (row.outstanding === 0) return <span className="font-semibold text-emerald-800">0 ₫</span>;
  return <span className="font-semibold text-red-700">{formatVND(row.outstanding)}</span>;
}

/** Bảng thu gộp nhiều buổi (ví dụ T7 + CN cùng tuần): mỗi người một dòng, mỗi buổi một cặp cột sân / cầu. */
export function CombinedSheet() {
  const { sessions, settings, activeSession } = useAppData();
  const sorted = sortSessionsByDate(sessions);
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(sessions, activeSession));

  const chosen = sorted.filter((session) => selected.includes(session.id));
  const { columns, rows, totals } = calculateCombinedPayments(chosen, settings);
  const collected = totals.advancePayment + totals.paidAmount;

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  if (sorted.length === 0) return <EmptyState title="Chưa có buổi chơi" description="Tạo buổi chơi trước khi lập bảng thu gộp." />;

  return (
    <div className="space-y-4">
      <Card title="Chọn các buổi cần gộp" className="print:hidden">
        <div className="flex flex-wrap gap-2">
          {sorted.map((session) => {
            const active = selected.includes(session.id);
            return (
              <button
                key={session.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(session.id)}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95',
                  active ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {active && <span aria-hidden="true">✓ </span>}
                {getDayShort(session.date)} {formatDate(session.date)}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Mặc định chọn các buổi cùng tuần với buổi đang mở. Tiền từng buổi được tính và làm tròn riêng rồi mới cộng lại; nhập “Đã thu” ở tab Buổi chơi.
        </p>
      </Card>

      {chosen.length === 0 ? (
        <EmptyState title="Chưa chọn buổi nào" description="Bấm vào các buổi ở trên để gộp vào một bảng thu." />
      ) : (
        <Card
          title={`Bảng thu gộp – ${columns.map((column) => column.label).join(' + ')}`}
          actions={
            <div className="flex flex-wrap gap-2 print:hidden">
              <CopyButton variant="primary" label="Copy gửi Zalo" successMessage="Đã copy nội dung gửi Zalo." getText={() => generateZaloCombinedText(chosen, settings)} />
              <Button size="sm" icon={<Printer size={14} aria-hidden="true" />} onClick={() => window.print()}>
                In
              </Button>
            </div>
          }
        >
          <div className="mb-4 rounded-xl bg-slate-50 p-3 print:hidden">
            <p className="mb-1.5 text-sm text-slate-700">
              Đã thu <span className="font-bold tabular-nums text-slate-900">{formatVND(collected)}</span> /{' '}
              <span className="tabular-nums">{formatVND(totals.roundedPayable)}</span>
              <span className="ml-1.5 font-semibold text-slate-900">({percentOf(collected, totals.roundedPayable)}%)</span>
              <span className="ml-3 text-xs text-slate-600">Tổng chi {chosen.length} buổi: {formatVND(totals.totalCost)}</span>
            </p>
            <ProgressBar label="Tiến độ thu tiền" value={collected} max={totals.roundedPayable} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                  <th scope="col" className="w-10 py-2 pr-2">STT</th>
                  <th scope="col" className="sticky left-0 bg-white py-2 pr-3">Tên</th>
                  {columns.map((column) => (
                    <th key={column.sessionId} scope="colgroup" colSpan={2} className="border-l border-slate-100 px-2 py-2 text-center">
                      {column.label}
                      <span className="mt-0.5 grid grid-cols-2 gap-2 font-medium text-slate-500">
                        <span className="text-right">Tiền sân</span>
                        <span className="text-right">Tiền cầu</span>
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="border-l border-slate-100 py-2 pl-2 pr-2 text-right">Thành tiền</th>
                  <th scope="col" className="py-2 pr-2 text-right">Đã ứng</th>
                  <th scope="col" className="py-2 pr-2 text-right">Đã thu</th>
                  <th scope="col" className="py-2 pr-2 text-right">Còn thiếu</th>
                  <th scope="col" className="py-2">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="tabular-nums [&_td:not(:last-child)]:whitespace-nowrap">
                {rows.map((row, index) => (
                  <tr key={row.key} className={cx('border-b border-slate-100', row.status === 'paid' ? 'bg-emerald-50/60 print:bg-transparent' : 'hover:bg-slate-50')}>
                    <td className="py-2 pr-2 text-slate-500">{index + 1}</td>
                    <td className="sticky left-0 bg-inherit py-2 pr-3 font-semibold text-slate-900">{row.name}</td>
                    {columns.map((column) => {
                      const cell = row.cells.find((item) => item.sessionId === column.sessionId);
                      return cell ? (
                        <td key={column.sessionId} colSpan={2} className="border-l border-slate-100 px-2 py-2">
                          <span className="grid grid-cols-2 gap-2">
                            <span className="text-right">{formatVND(cell.row.courtShare)}</span>
                            <span className="text-right">{formatVND(cell.row.shuttleShare)}</span>
                          </span>
                        </td>
                      ) : (
                        <td key={column.sessionId} colSpan={2} className="border-l border-slate-100 px-2 py-2 text-center text-slate-400">
                          –
                        </td>
                      );
                    })}
                    <td className="border-l border-slate-100 py-2 pl-2 pr-2 text-right font-semibold">{formatVND(row.roundedPayable)}</td>
                    <td className="py-2 pr-2 text-right">{row.advancePayment > 0 ? formatVND(row.advancePayment) : '–'}</td>
                    <td className="py-2 pr-2 text-right">{row.paidAmount > 0 ? formatVND(row.paidAmount) : '–'}</td>
                    <td className="py-2 pr-2 text-right">
                      <Remaining row={row} />
                    </td>
                    <td className="min-w-40 py-2 text-xs text-slate-600">{row.notes.join(' • ')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="whitespace-nowrap tabular-nums">
                <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                  <td className="py-2 pr-2" />
                  <td className="sticky left-0 bg-white py-2 pr-3">Tổng ({rows.length} người)</td>
                  {columns.map((column) => (
                    <td key={column.sessionId} colSpan={2} className="border-l border-slate-100" />
                  ))}
                  <td className="border-l border-slate-100 py-2 pl-2 pr-2 text-right">{formatVND(totals.roundedPayable)}</td>
                  <td className="py-2 pr-2 text-right">{formatVND(totals.advancePayment)}</td>
                  <td className="py-2 pr-2 text-right">{formatVND(totals.paidAmount)}</td>
                  <td className="py-2 pr-2 text-right">{formatVND(totals.outstanding)}</td>
                  <td className="py-2">{totals.overpaid > 0 && <Badge tone="blue">Dư {formatVND(totals.overpaid)}</Badge>}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
