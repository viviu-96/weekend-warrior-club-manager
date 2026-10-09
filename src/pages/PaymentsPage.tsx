import {
  CheckCheck,
  FileJson,
  FileSpreadsheet,
  HandCoins,
  Lock,
  LockOpen,
  Printer,
  Receipt,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { CopyButton } from '../components/CopyButton';
import { Badge, Button, Card, cx, Field, IssueList, MoneyInput, PageHeader, percentOf, ProgressBar, TextInput, Toggle } from '../components/ui';
import { CombinedSheet } from '../features/payments/CombinedSheet';
import { DebtTable } from '../features/payments/DebtTable';
import { PaymentConfigList } from '../features/payments/PaymentConfigList';
import { PaymentResultTable } from '../features/payments/PaymentResultTable';
import { ReconcilePanel } from '../features/payments/ReconcilePanel';
import { downloadSessionCSV, downloadSessionJSON } from '../features/sessions/sessionExports';
import { NoSessionState, SessionPicker } from '../features/sessions/SessionPicker';
import { useAppData } from '../hooks/useAppData';
import { useFeedback } from '../hooks/useFeedback';
import { generateZaloPaymentText } from '../services/exportService';
import { applyPaidToRow, calculateSessionPayments, calculateShuttleUnitPrice, markAllPaid, type PaymentRow } from '../services/paymentService';
import { isShuttleCostAuto, setManualShuttleCost, updateShuttleUsage } from '../services/sessionService';
import { validatePayments } from '../services/validationService';
import { formatSessionDate, formatVND } from '../utils/format';

type PaymentTab = 'session' | 'combined' | 'debts';

const TABS: { id: PaymentTab; label: string; icon: LucideIcon }[] = [
  { id: 'session', label: 'Buổi chơi', icon: Receipt },
  { id: 'combined', label: 'Bảng thu gộp', icon: Table2 },
  { id: 'debts', label: 'Công nợ', icon: HandCoins },
];

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((item) => item.id === params.get('tab'))?.id ?? 'session';

  return (
    <>
      <PageHeader title="💰 Tính tiền" description="Chia tiền từng buổi, gộp nhiều buổi và theo dõi công nợ." />
      <div role="tablist" aria-label="Các phần của trang Tính tiền" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm print:hidden">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setParams(id === 'session' ? {} : { tab: id }, { replace: true })}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition',
              tab === id ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {tab === 'session' && <SessionPayments />}
      {tab === 'combined' && <CombinedSheet />}
      {tab === 'debts' && <DebtTable />}
    </>
  );
}

/** Tính tiền cho một buổi chơi. */
function SessionPayments() {
  const { activeSession: session, settings, updateSession } = useAppData();
  const { toast, confirm } = useFeedback();

  if (!session) return <NoSessionState />;

  const locked = session.paymentLocked;
  const issues = validatePayments(session);
  const { rows, reconciliation } = calculateSessionPayments(session, settings);
  const hasPlayers = session.players.length > 0;

  const setPaid = (row: PaymentRow, amount: number) =>
    updateSession({ ...session, payments: applyPaidToRow(session, settings, row, amount) });

  const toggleLock = async () => {
    if (!locked) {
      updateSession({ ...session, paymentLocked: true });
      toast('Đã khoá thu tiền.');
      return;
    }
    const ok = await confirm({ title: 'Mở khoá thu tiền', message: 'Bạn có chắc muốn mở khoá để chỉnh sửa phần thu tiền?', confirmLabel: 'Mở khoá' });
    if (ok) updateSession({ ...session, paymentLocked: false });
  };

  const collectAll = async () => {
    const ok = await confirm({
      title: 'Thu đủ tất cả',
      message: `Đánh dấu tất cả ${rows.length} dòng là đã đóng đủ?\nCòn thiếu hiện tại: ${formatVND(reconciliation.totalOutstanding)}.`,
      confirmLabel: 'Đánh dấu đã thu đủ',
    });
    if (!ok) return;
    updateSession({ ...session, payments: markAllPaid(session, settings) });
    toast('Đã đánh dấu tất cả đã đóng đủ.');
  };

  const paidRows = rows.filter((row) => row.outstanding === 0).length;

  const perBox = settings.shuttlesPerBox;
  const unitPrice = calculateShuttleUnitPrice(session.shuttleBoxPrice ?? 0, perBox);
  const autoShuttle = isShuttleCostAuto(session);

  return (
    <>
      <SessionPicker />

      <div className="space-y-4">
        {locked && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 print:hidden">
            <span>🔒 Phần thu tiền đang khoá. Mở khoá để chỉnh sửa.</span>
            <Button size="sm" icon={<LockOpen size={14} aria-hidden="true" />} onClick={() => void toggleLock()}>
              Mở khoá
            </Button>
          </div>
        )}

        <Card title="Chi phí buổi chơi" className="print:hidden" collapsible storageKey="payments.costs">
          <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-4">
            <Field label="Tiền sân" className="col-span-2 md:col-span-1">
              <MoneyInput label="Tiền sân" disabled={locked} value={session.courtCost} onChange={(courtCost) => updateSession({ ...session, courtCost })} />
            </Field>
            <Field label={`Giá 1 hộp cầu (${perBox} quả)`} hint={unitPrice > 0 ? `${formatVND(unitPrice)} / quả` : 'Nhập giá hộp để tự tính tiền cầu'}>
              <MoneyInput
                label="Giá một hộp cầu"
                disabled={locked}
                value={session.shuttleBoxPrice ?? 0}
                onChange={(price) => updateSession(updateShuttleUsage(session, { shuttleBoxPrice: price > 0 ? price : null }, perBox))}
              />
            </Field>
            <Field label="Số quả cầu đã dùng" hint={session.shuttleCount === null ? 'Để trống nếu nhập tay tiền cầu' : undefined}>
              <TextInput
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                placeholder="0"
                disabled={locked}
                value={session.shuttleCount ?? ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  const count = raw === '' ? null : Math.min(999, Math.max(0, Math.floor(Number(raw) || 0)));
                  updateSession(updateShuttleUsage(session, { shuttleCount: count }, perBox));
                }}
              />
            </Field>
            <Field
              label="Tiền cầu"
              className="col-span-2 md:col-span-1"
              hint={
                autoShuttle
                  ? `Tự tính: ${session.shuttleCount} quả × ${formatVND(unitPrice)}`
                  : session.shuttleCount !== null
                    ? 'Chưa có giá hộp cầu nên chưa tự tính được'
                    : 'Đang nhập tay • gồm cả cầu do thành viên đóng góp'
              }
            >
              <MoneyInput label="Tiền cầu" disabled={locked} value={session.shuttleCost} onChange={(shuttleCost) => updateSession(setManualShuttleCost(session, shuttleCost))} />
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-600">Tổng chi</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{formatVND(reconciliation.totalCost)}</p>
            </div>
            <Toggle label="Gộp khách vào người giới thiệu" disabled={locked} checked={session.mergeGuests} onChange={(mergeGuests) => updateSession({ ...session, mergeGuests })} />
          </div>
        </Card>

        <IssueList issues={issues} />

        {hasPlayers && (
          <>
            <Card title="Thiết lập từng người" className="print:hidden" collapsible storageKey="payments.config">
              <PaymentConfigList session={session} disabled={locked} onChange={updateSession} />
              <p className="mt-3 text-xs text-slate-500">
                Người không chơi vẫn chịu tiền sân nhưng không chịu tiền cầu. Người chơi nửa buổi trả 50% suất cầu
                {settings.halfPlayCourtMode === 'half' ? ' và 50% suất sân' : ', tiền sân vẫn tính đủ'} (đổi trong Cài đặt).
              </p>
            </Card>

            <Card
              collapsible
              storageKey="payments.table"
              title={
                <span className="flex flex-wrap items-center gap-2">
                  Bảng thu tiền – {formatSessionDate(session.date)}
                  {locked && <Badge tone="blue">🔒 Đã khoá</Badge>}
                </span>
              }
              actions={
                <div className="flex flex-wrap gap-2 print:hidden">
                  <CopyButton variant="primary" label="Copy gửi Zalo" successMessage="Đã copy nội dung gửi Zalo." getText={() => generateZaloPaymentText(session, settings)} />
                  {!locked && reconciliation.totalOutstanding > 0 && (
                    <Button size="sm" icon={<CheckCheck size={14} aria-hidden="true" />} onClick={() => void collectAll()}>
                      Thu đủ tất cả
                    </Button>
                  )}
                  <Button size="sm" icon={<FileSpreadsheet size={14} aria-hidden="true" />} onClick={() => downloadSessionCSV(session, settings)}>
                    CSV
                  </Button>
                  <Button size="sm" icon={<FileJson size={14} aria-hidden="true" />} onClick={() => downloadSessionJSON(session)}>
                    JSON
                  </Button>
                  <Button size="sm" icon={<Printer size={14} aria-hidden="true" />} onClick={() => window.print()}>
                    In
                  </Button>
                  <Button size="sm" icon={locked ? <LockOpen size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />} onClick={() => void toggleLock()}>
                    {locked ? 'Mở khoá' : 'Khoá thu tiền'}
                  </Button>
                </div>
              }
            >
              <div className="mb-4 rounded-xl bg-slate-50 p-3 print:hidden">
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                  <p className="text-slate-700">
                    Đã thu <span className="font-bold tabular-nums text-slate-900">{formatVND(reconciliation.totalCollected)}</span> /{' '}
                    <span className="tabular-nums">{formatVND(reconciliation.totalPayable)}</span>
                    <span className="ml-1.5 font-semibold text-slate-900">({percentOf(reconciliation.totalCollected, reconciliation.totalPayable)}%)</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    {paidRows}/{rows.length} dòng đã đủ
                    {reconciliation.totalOutstanding === 0 && reconciliation.totalPayable > 0 && ' • ✓ Đã thu đủ'}
                  </p>
                </div>
                <ProgressBar label="Tiến độ thu tiền" value={reconciliation.totalCollected} max={reconciliation.totalPayable} />
              </div>
              <PaymentResultTable rows={rows} reconciliation={reconciliation} date={session.date} onPaidChange={locked ? undefined : setPaid} />
            </Card>

            <Card title="Đối soát" collapsible storageKey="payments.reconcile">
              <ReconcilePanel reconciliation={reconciliation} />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
