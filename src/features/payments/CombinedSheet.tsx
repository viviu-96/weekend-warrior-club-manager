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

          {/* Desktop & bản in */}
          <div className="hidden overflow-x-auto md:block print:block">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="text-xs font-semibold text-slate-600">
                <tr className="text-left">
                  <th scope="col" rowSpan={2} className="w-10 border-b border-slate-200 py-2 pr-3 align-bottom">STT</th>
                  <th scope="col" rowSpan={2} className="border-b border-slate-200 py-2 pr-4 align-bottom">Tên</th>
                  {columns.map((column) => (
                    <th key={column.sessionId} scope="colgroup" colSpan={2} className="border-l border-slate-200 px-3 pt-2 text-center text-slate-900">
                      {column.label}
                    </th>
                  ))}
                  <th scope="col" rowSpan={2} className="border-b border-l border-slate-200 py-2 pl-3 pr-3 text-right align-bottom">Thành tiền</th>
                  <th scope="col" rowSpan={2} className="border-b border-slate-200 py-2 pr-3 text-right align-bottom">Đã ứng</th>
                  <th scope="col" rowSpan={2} className="border-b border-slate-200 py-2 pr-3 text-right align-bottom">Đã thu</th>
                  <th scope="col" rowSpan={2} className="border-b border-slate-200 py-2 pr-3 text-right align-bottom">Còn thiếu</th>
                  <th scope="col" rowSpan={2} className="border-b border-slate-200 py-2 align-bottom">Ghi chú</th>
                </tr>
                <tr>
                  {columns.flatMap((column) => [
                    <th key={`${column.sessionId}-court`} scope="col" className="border-b border-l border-slate-200 px-3 pb-2 pt-1 text-right font-medium">
                      Tiền sân
                    </th>,
                    <th key={`${column.sessionId}-shuttle`} scope="col" className="border-b border-slate-200 px-3 pb-2 pt-1 text-right font-medium">
                      Tiền cầu
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody className="tabular-nums [&_td:not(:last-child)]:whitespace-nowrap">
                {rows.map((row, index) => (
                  <tr key={row.key} className={cx('border-b border-slate-100', row.status === 'paid' ? 'bg-emerald-50 print:bg-transparent' : 'hover:bg-slate-50')}>
                    <td className="py-2 pr-3 text-slate-500">{index + 1}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-900">{row.name}</td>
                    {columns.flatMap((column) => {
                      const cell = row.cells.find((item) => item.sessionId === column.sessionId);
                      return [
                        <td key={`${column.sessionId}-court`} className="border-l border-slate-100 px-3 py-2 text-right">
                          {cell ? formatVND(cell.row.courtShare) : <span className="text-slate-400">–</span>}
                        </td>,
                        <td key={`${column.sessionId}-shuttle`} className="px-3 py-2 text-right">
                          {cell ? formatVND(cell.row.shuttleShare) : <span className="text-slate-400">–</span>}
                        </td>,
                      ];
                    })}
                    <td className="border-l border-slate-100 py-2 pl-3 pr-3 text-right font-semibold">{formatVND(row.roundedPayable)}</td>
                    <td className="py-2 pr-3 text-right">{row.advancePayment > 0 ? formatVND(row.advancePayment) : '–'}</td>
                    <td className="py-2 pr-3 text-right">{row.paidAmount > 0 ? formatVND(row.paidAmount) : '–'}</td>
                    <td className="py-2 pr-3 text-right">
                      <Remaining row={row} />
                    </td>
                    <td className="min-w-48 max-w-xs py-2 text-xs text-slate-600">{row.notes.join(' • ')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="whitespace-nowrap tabular-nums">
                <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                  <td className="py-2 pr-3" />
                  <td className="py-2 pr-4">Tổng ({rows.length} người)</td>
                  {columns.map((column) => (
                    <td key={column.sessionId} colSpan={2} className="border-l border-slate-100" />
                  ))}
                  <td className="border-l border-slate-100 py-2 pl-3 pr-3 text-right">{formatVND(totals.roundedPayable)}</td>
                  <td className="py-2 pr-3 text-right">{formatVND(totals.advancePayment)}</td>
                  <td className="py-2 pr-3 text-right">{formatVND(totals.paidAmount)}</td>
                  <td className="py-2 pr-3 text-right">{formatVND(totals.outstanding)}</td>
                  <td className="py-2">{totals.overpaid > 0 && <Badge tone="blue">Dư {formatVND(totals.overpaid)}</Badge>}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile: mỗi người một thẻ, không cần cuộn ngang */}
          <ul className="space-y-3 md:hidden print:hidden">
            {rows.map((row) => (
              <li key={row.key} className={cx('rounded-xl border p-3', row.status === 'paid' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold text-slate-900">{row.name}</span>
                  <Remaining row={row} />
                </div>
                <dl className="mt-2 space-y-1.5 text-sm tabular-nums">
                  {columns.map((column) => {
                    const cell = row.cells.find((item) => item.sessionId === column.sessionId);
                    return (
                      <div key={column.sessionId} className="flex items-baseline justify-between gap-3">
                        <dt className="shrink-0 font-medium text-slate-700">{column.label}</dt>
                        <dd className="text-right text-slate-700">
                          {cell ? (
                            <>
                              Sân {formatVND(cell.row.courtShare)} <span className="text-slate-400">•</span> Cầu {formatVND(cell.row.shuttleShare)}
                            </>
                          ) : (
                            <span className="text-slate-400">Không tham gia</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                  <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-1.5">
                    <dt className="font-semibold text-slate-900">Thành tiền</dt>
                    <dd className="font-semibold text-slate-900">{formatVND(row.roundedPayable)}</dd>
                  </div>
                  {row.advancePayment > 0 && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-slate-600">Đã ứng</dt>
                      <dd>{formatVND(row.advancePayment)}</dd>
                    </div>
                  )}
                  {row.paidAmount > 0 && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-slate-600">Đã thu</dt>
                      <dd>{formatVND(row.paidAmount)}</dd>
                    </div>
                  )}
                </dl>
                {row.notes.length > 0 && <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">{row.notes.join(' • ')}</p>}
              </li>
            ))}
            <li className="rounded-xl bg-slate-100 p-3 text-sm tabular-nums">
              <div className="flex items-baseline justify-between gap-3 font-semibold text-slate-900">
                <span>Tổng ({rows.length} người)</span>
                <span>{formatVND(totals.roundedPayable)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3 text-slate-700">
                <span>Còn thiếu</span>
                <span className="font-semibold">{formatVND(totals.outstanding)}</span>
              </div>
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}
