import { Copy, FileJson, FileSpreadsheet, Lock, LockOpen, Printer } from 'lucide-react';
import { Badge, Button, Card, Field, IssueList, MoneyInput, PageHeader, Toggle } from '../components/ui';
import { PaymentConfigList } from '../features/payments/PaymentConfigList';
import { PaymentResultTable } from '../features/payments/PaymentResultTable';
import { ReconcilePanel } from '../features/payments/ReconcilePanel';
import { downloadSessionCSV, downloadSessionJSON } from '../features/sessions/sessionExports';
import { NoSessionState, SessionPicker } from '../features/sessions/SessionPicker';
import { useAppData } from '../hooks/useAppData';
import { useFeedback } from '../hooks/useFeedback';
import { generateZaloPaymentText } from '../services/exportService';
import { applyPaidToRow, calculateSessionPayments, type PaymentRow } from '../services/paymentService';
import { validatePayments } from '../services/validationService';
import { copyToClipboard } from '../utils/browser';
import { formatSessionDate, formatVND } from '../utils/format';

export function PaymentsPage() {
  const { activeSession: session, settings, updateSession } = useAppData();
  const { toast, confirm } = useFeedback();

  if (!session) {
    return (
      <>
        <PageHeader title="💰 Tính tiền" description="Chia tiền sân, tiền cầu cho từng người." />
        <NoSessionState />
      </>
    );
  }

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

  const copyZalo = async () => {
    const ok = await copyToClipboard(generateZaloPaymentText(session, settings));
    toast(ok ? 'Đã copy nội dung gửi Zalo.' : 'Không copy được, hãy thử lại.', ok ? 'success' : 'error');
  };

  return (
    <>
      <PageHeader title="💰 Tính tiền" description="Chia tiền sân, tiền cầu cho từng người." />
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
            <Field label="Tiền sân">
              <MoneyInput label="Tiền sân" disabled={locked} value={session.courtCost} onChange={(courtCost) => updateSession({ ...session, courtCost })} />
            </Field>
            <Field label="Tiền cầu" hint="Gồm cả cầu do thành viên đóng góp">
              <MoneyInput label="Tiền cầu" disabled={locked} value={session.shuttleCost} onChange={(shuttleCost) => updateSession({ ...session, shuttleCost })} />
            </Field>
            <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 md:col-span-1 md:mt-4">
              <p className="text-xs font-medium text-slate-600">Tổng chi</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{formatVND(reconciliation.totalCost)}</p>
            </div>
            <div className="col-span-2 md:col-span-1 md:pt-6">
              <Toggle label="Gộp khách vào người giới thiệu" disabled={locked} checked={session.mergeGuests} onChange={(mergeGuests) => updateSession({ ...session, mergeGuests })} />
            </div>
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
                  <Button size="sm" variant="primary" icon={<Copy size={14} aria-hidden="true" />} onClick={() => void copyZalo()}>
                    Copy gửi Zalo
                  </Button>
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
