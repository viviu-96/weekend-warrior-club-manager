import {
  CalendarDays,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Clock,
  Copy,
  LandPlot,
  Plus,
  Swords,
  Users,
  Volleyball,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, cx, PageHeader, percentOf, ProgressBar } from '../components/ui';
import { DuplicateSessionModal } from '../features/sessions/DuplicateSessionModal';
import { NoSessionState, useCreateSession } from '../features/sessions/SessionPicker';
import { useAppData } from '../hooks/useAppData';
import { reconcileSession } from '../services/paymentService';
import { sortSessionsByDate } from '../services/sessionService';
import { formatSessionDate, formatVND } from '../utils/format';

interface StatProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  /** Màu nền + màu biểu tượng của ô tròn. */
  iconClass: string;
  to: string;
  note?: string;
}

function Stat({ label, value, icon: Icon, iconClass, to, note }: StatProps) {
  return (
    <Link
      to={to}
      className="animate-rise group flex flex-col items-start gap-2 rounded-xl sm:flex-row sm:items-center sm:gap-3 border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
    >
      <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconClass)}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-600">{label}</span>
        <span className="block text-lg font-bold tabular-nums text-slate-900">{value}</span>
        {note && <span className="block text-xs text-slate-500">{note}</span>}
      </span>
    </Link>
  );
}

function HeroChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/20">
      <Icon size={13} aria-hidden="true" />
      {children}
    </span>
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
  const totalOutstanding = total((r) => r.totalOutstanding);
  const unpaidSessions = reconciliations.filter((r) => r.totalOutstanding > 0).length;

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
          <section
            aria-label="Buổi gần nhất"
            className="animate-rise relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 p-5 text-white shadow-lg shadow-emerald-900/20 sm:p-6"
          >
            <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-10 select-none text-[9rem] leading-none opacity-10">
              🏸
            </span>
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">Buổi gần nhất</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight">{formatSessionDate(latest.date)}</p>
                </div>
                <Link
                  to={`/lich-su/${encodeURIComponent(latest.id)}`}
                  className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-white/20 transition hover:bg-white/25"
                >
                  Chi tiết <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <HeroChip icon={Clock}>{latest.time}</HeroChip>
                <HeroChip icon={Users}>{latest.players.length} người</HeroChip>
                <HeroChip icon={LandPlot}>{latest.courtCount} sân</HeroChip>
                <HeroChip icon={Swords}>{latest.pairings.length > 0 ? `${latest.pairings.length} trận` : 'Chưa xếp cặp'}</HeroChip>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-xs text-emerald-100">💰 Tổng chi</dt>
                  <dd className="text-lg font-bold tabular-nums sm:text-xl">{formatVND(latestReconciliation.totalCost)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-emerald-100">💵 Đã thu</dt>
                  <dd className="text-lg font-bold tabular-nums sm:text-xl">{formatVND(latestReconciliation.totalCollected)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-emerald-100">⚠️ Còn thiếu</dt>
                  <dd className="text-lg font-bold tabular-nums sm:text-xl">{formatVND(latestReconciliation.totalOutstanding)}</dd>
                </div>
              </dl>

              {latestReconciliation.totalPayable > 0 && (
                <div className="mt-3">
                  <ProgressBar onDark label="Tiến độ thu tiền" value={latestReconciliation.totalCollected} max={latestReconciliation.totalPayable} />
                  <p className="mt-1.5 text-xs text-emerald-100">
                    Đã thu {percentOf(latestReconciliation.totalCollected, latestReconciliation.totalPayable)}% trên tổng phải thu{' '}
                    {formatVND(latestReconciliation.totalPayable)}
                  </p>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => open('/xep-cap')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50 active:scale-[0.97]"
                >
                  <Swords size={16} aria-hidden="true" /> Xếp cặp
                </button>
                <button
                  type="button"
                  onClick={() => open('/tinh-tien')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-white/30 transition hover:bg-white/25 active:scale-[0.97]"
                >
                  <CircleDollarSign size={16} aria-hidden="true" /> Tính tiền
                </button>
              </div>
            </div>
          </section>
        ) : (
          <NoSessionState />
        )}

        <section aria-label="Thống kê" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <Stat label="Tổng thành viên" value={members.length} icon={Users} iconClass="bg-sky-100 text-sky-800" to="/thanh-vien" />
          <Stat label="Tổng số buổi" value={sessions.length} icon={CalendarDays} iconClass="bg-violet-100 text-violet-800" to="/lich-su" />
          <Stat label="Tổng tiền sân" value={formatVND(total((r) => r.totalCourt))} icon={LandPlot} iconClass="bg-emerald-100 text-emerald-800" to="/lich-su" />
          <Stat label="Tổng tiền cầu" value={formatVND(total((r) => r.totalShuttle))} icon={Volleyball} iconClass="bg-amber-100 text-amber-800" to="/lich-su" />
          <Stat
            label="Tổng tiền còn thiếu"
            value={formatVND(totalOutstanding)}
            icon={CircleAlert}
            iconClass={totalOutstanding > 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}
            to="/lich-su"
            note={totalOutstanding > 0 ? `⚠ ${unpaidSessions} buổi chưa thu đủ` : '✓ Đã thu đủ tất cả'}
          />
        </section>
      </div>

      {duplicating && latest && <DuplicateSessionModal source={latest} onClose={() => setDuplicating(false)} onCreated={() => navigate('/xep-cap')} />}
    </>
  );
}
