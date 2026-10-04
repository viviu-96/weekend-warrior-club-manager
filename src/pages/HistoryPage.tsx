import { ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, PageHeader } from '../components/ui';
import { DuplicateSessionModal } from '../features/sessions/DuplicateSessionModal';
import { NoSessionState, useCreateSession } from '../features/sessions/SessionPicker';
import { useAppData } from '../hooks/useAppData';
import { reconcileSession } from '../services/paymentService';
import { sortSessionsByDate } from '../services/sessionService';
import type { Session } from '../types';
import { formatDate, formatVND, getDayOfWeek } from '../utils/format';

export function HistoryPage() {
  const { sessions, settings } = useAppData();
  const createNew = useCreateSession();
  const [duplicating, setDuplicating] = useState<Session | null>(null);
  const sorted = sortSessionsByDate(sessions);

  return (
    <>
      <PageHeader
        title="📜 Lịch sử buổi chơi"
        description={`${sessions.length} buổi đã lưu.`}
        actions={
          <>
            <Button variant="primary" onClick={() => void createNew()}>
              + Buổi mới
            </Button>
            {sorted[0] && (
              <Button icon={<Copy size={16} aria-hidden="true" />} onClick={() => setDuplicating(sorted[0]!)}>
                Nhân bản buổi trước
              </Button>
            )}
          </>
        }
      />

      {sorted.length === 0 ? (
        <NoSessionState />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sorted.map((session) => {
            const r = reconcileSession(session, settings);
            return (
              // Cả thẻ bấm được: link tiêu đề phủ toàn bộ thẻ, nút Nhân bản nổi lên trên.
              <li
                key={session.id}
                className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-500 hover:shadow-md focus-within:border-emerald-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      to={`/lich-su/${encodeURIComponent(session.id)}`}
                      aria-label={`Xem chi tiết buổi ${formatDate(session.date)}`}
                      className="text-base font-bold text-slate-900 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
                    >
                      {formatDate(session.date)}
                    </Link>
                    <p className="text-sm text-slate-600">
                      {getDayOfWeek(session.date)} • {session.time}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {session.pairingLocked && <Badge tone="blue">🔒 Xếp cặp</Badge>}
                    {r.totalCost > 0 && (r.totalOutstanding === 0 ? <Badge tone="green">✓ Đã thu đủ</Badge> : <Badge tone="red">Còn thiếu {formatVND(r.totalOutstanding)}</Badge>)}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Người chơi</dt>
                    <dd className="font-semibold">{session.players.length} người</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Số sân</dt>
                    <dd className="font-semibold">{session.courtCount} sân</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Tổng chi</dt>
                    <dd className="font-semibold tabular-nums">{formatVND(r.totalCost)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <Button size="sm" className="relative z-10" icon={<Copy size={14} aria-hidden="true" />} onClick={() => setDuplicating(session)}>
                    Nhân bản
                  </Button>
                  <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-800">
                    Xem chi tiết <ChevronRight size={14} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {duplicating && <DuplicateSessionModal source={duplicating} onClose={() => setDuplicating(null)} />}
    </>
  );
}
