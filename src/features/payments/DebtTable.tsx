import { Check } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, cx, EmptyState } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { useFeedback } from '../../hooks/useFeedback';
import { calculateMemberDebts, settleCombinedRow, type CombinedRow } from '../../services/ledgerService';
import { formatVND } from '../../utils/format';

/** Công nợ theo từng người trên toàn bộ các buổi đã lưu. */
export function DebtTable() {
  const { sessions, settings, updateSession } = useAppData();
  const { toast, confirm } = useFeedback();
  const [onlyOwing, setOnlyOwing] = useState(true);

  const { columns, rows, totals } = calculateMemberDebts(sessions, settings);
  const labelOf = new Map(columns.map((column) => [column.sessionId, column.label]));
  const owing = rows.filter((row) => row.outstanding > 0);
  const visible = onlyOwing ? owing : rows;

  const settle = async (row: CombinedRow) => {
    const ok = await confirm({
      title: 'Thu đủ công nợ',
      message: `Đánh dấu ${row.name} đã đóng đủ ${formatVND(row.outstanding)} cho ${row.unpaidSessions} buổi còn thiếu?`,
      confirmLabel: 'Đã thu đủ',
    });
    if (!ok) return;
    const { updated, skippedLocked } = settleCombinedRow(row, sessions, settings);
    updated.forEach(updateSession);
    if (skippedLocked > 0) toast(`Đã cập nhật ${updated.length} buổi. ${skippedLocked} buổi đang khoá thu tiền nên được giữ nguyên.`, 'info');
    else toast(`${row.name} đã đóng đủ.`);
  };

  if (rows.length === 0) return <EmptyState title="Chưa có dữ liệu công nợ" description="Công nợ được tổng hợp từ phần tính tiền của các buổi chơi." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Tổng còn nợ', value: formatVND(totals.outstanding), tone: totals.outstanding > 0 ? 'text-red-700' : 'text-emerald-800' },
          { label: 'Số người còn nợ', value: `${owing.length} người`, tone: 'text-slate-900' },
          { label: 'Đã thu', value: formatVND(totals.advancePayment + totals.paidAmount), tone: 'text-slate-900' },
          { label: 'Thu dư (cần trả lại)', value: formatVND(totals.overpaid), tone: 'text-slate-900' },
        ].map((item) => (
          <div key={item.label} className="animate-rise rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-600">{item.label}</p>
            <p className={cx('mt-1 text-lg font-bold tabular-nums', item.tone)}>{item.value}</p>
          </div>
        ))}
      </div>

      <Card
        title={`Công nợ theo thành viên (${sessions.length} buổi)`}
        actions={
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-emerald-700" checked={onlyOwing} onChange={(event) => setOnlyOwing(event.target.checked)} />
            Chỉ hiện người còn nợ
          </label>
        }
      >
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm font-medium text-emerald-800">✓ Không ai còn nợ.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                  <th scope="col" className="py-2 pr-2">Tên</th>
                  <th scope="col" className="py-2 pr-2 text-right">Số buổi</th>
                  <th scope="col" className="py-2 pr-2 text-right">Phải đóng</th>
                  <th scope="col" className="py-2 pr-2 text-right">Đã thu</th>
                  <th scope="col" className="py-2 pr-2 text-right">Còn nợ</th>
                  <th scope="col" className="py-2 pr-2">Buổi còn thiếu</th>
                  <th scope="col" className="w-28 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {visible.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-2 font-semibold text-slate-900">{row.name}</td>
                    <td className="py-2 pr-2 text-right">{row.sessionCount}</td>
                    <td className="py-2 pr-2 text-right">{formatVND(row.roundedPayable)}</td>
                    <td className="py-2 pr-2 text-right">{formatVND(row.advancePayment + row.paidAmount)}</td>
                    <td className="py-2 pr-2 text-right">
                      {row.overpaid > 0 ? (
                        <span className="font-semibold text-sky-800">Dư: {formatVND(row.overpaid)}</span>
                      ) : row.outstanding > 0 ? (
                        <span className="font-semibold text-red-700">{formatVND(row.outstanding)}</span>
                      ) : (
                        <span className="font-semibold text-emerald-800">✓ Đủ</span>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <span className="flex flex-wrap gap-1">
                        {row.cells
                          .filter((cell) => cell.row.outstanding > 0)
                          .map((cell) => (
                            <Badge key={cell.sessionId} tone="red">
                              {labelOf.get(cell.sessionId)} • {formatVND(cell.row.outstanding)}
                            </Badge>
                          ))}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      {row.unpaidSessions > 0 && (
                        <Button size="sm" icon={<Check size={14} aria-hidden="true" />} onClick={() => void settle(row)}>
                          Thu đủ
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Khách được gộp vào người giới thiệu theo cài đặt của từng buổi. Phần đóng dư ở buổi này được bù cho phần thiếu ở buổi khác.
        </p>
      </Card>
    </div>
  );
}
