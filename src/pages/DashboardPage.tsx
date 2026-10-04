import { CircleDollarSign, Copy, Plus, Swords } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, cx, PageHeader } from '../components/ui';
import { DuplicateSessionModal } from '../features/sessions/DuplicateSessionModal';
import { NoSessionState, useCreateSession } from '../features/sessions/SessionPicker';
import { useAppData } from '../hooks/useAppData';
import { reconcileSession } from '../services/paymentService';
import { sortSessionsByDate } from '../services/sessionService';
import { formatSessionDate, formatVND } from '../utils/format';

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className={cx('mt-1 text-xl font-bold tabular-nums text-slate-900', tone)}>{value}</p>
    </div>
  );
}

export function DashboardPage() {
  const { members, sessions, settings, setActiveSessionId } = useAppData();
  const navigate = useNavigate();
  const createNew = useCreateSession();
  const [duplicating, setDuplicating] = useState(false);

  const latest = sortSessionsByDate(sessions)[0];
  const reconciliations = sessions.map((session) => reconcileSession(session, settings));
  const total = (pick: (r: (typeof reconciliations)[number]) => number) => reconciliations.reduce((sum, r) => sum + pick(r), 0);
  const latestReconciliation = latest ? reconcileSession(latest, settings) : null;

  const open = (path: string) => {
    if (latest) setActiveSessionId(latest.id);
    navigate(path);
  };

  const startNew = async () => {
    if (await createNew()) navigate('/xep-cap');
  };

  return (
    <>
      <PageHeader
        title="🏠 Tổng quan"
        description={settings.clubName}
        actions={
          <>
            <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => void startNew()}>
              Buổi mới
            </Button>
            {latest && (
              <Button icon={<Copy size={16} aria-hidden="true" />} onClick={() => setDuplicating(true)}>
                Nhân bản buổi trước
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {latest && latestReconciliation ? (
          <Card
            title="🏸 Buổi gần nhất"
            actions={
              <Link to={`/lich-su/${encodeURIComponent(latest.id)}`} className="text-sm font-medium text-emerald-800 hover:underline">
                Chi tiết
              </Link>
            }
          >
            <p className="text-lg font-bold text-slate-900">{formatSessionDate(latest.date)}</p>
            <p className="text-sm text-slate-600">
              {latest.time} • {latest.players.length} người • {latest.courtCount} sân • {latest.pairings.length > 0 ? `${latest.pairings.length} trận` : 'chưa xếp cặp'}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-slate-600">💰 Tổng chi</dt>
                <dd className="text-base font-bold tabular-nums">{formatVND(latestReconciliation.totalCost)}</dd>
              </div>
              <div>
                <dt className="text-slate-600">💵 Đã thu</dt>
                <dd className="text-base font-bold tabular-nums text-emerald-800">{formatVND(latestReconciliation.totalCollected)}</dd>
              </div>
              <div>
                <dt className="text-slate-600">⚠️ Còn thiếu</dt>
                <dd className={cx('text-base font-bold tabular-nums', latestReconciliation.totalOutstanding > 0 ? 'text-red-700' : 'text-emerald-800')}>
                  {formatVND(latestReconciliation.totalOutstanding)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={<Swords size={16} aria-hidden="true" />} onClick={() => open('/xep-cap')}>
                Xếp cặp
              </Button>
              <Button icon={<CircleDollarSign size={16} aria-hidden="true" />} onClick={() => open('/tinh-tien')}>
                Tính tiền
              </Button>
            </div>
          </Card>
        ) : (
          <NoSessionState />
        )}

        <section aria-label="Thống kê" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Tổng thành viên" value={members.length} />
          <Stat label="Tổng số buổi" value={sessions.length} />
          <Stat label="Tổng tiền sân" value={formatVND(total((r) => r.totalCourt))} />
          <Stat label="Tổng tiền cầu" value={formatVND(total((r) => r.totalShuttle))} />
          <Stat label="Tổng tiền còn thiếu" value={formatVND(total((r) => r.totalOutstanding))} tone={total((r) => r.totalOutstanding) > 0 ? 'text-red-700' : 'text-emerald-800'} />
        </section>
      </div>

      {duplicating && latest && <DuplicateSessionModal source={latest} onClose={() => setDuplicating(false)} onCreated={() => navigate('/xep-cap')} />}
    </>
  );
}
