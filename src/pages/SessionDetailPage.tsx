import { ArrowLeft, CircleDollarSign, Copy, FileJson, FileSpreadsheet, Printer, Swords, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, PageHeader } from '../components/ui';
import { LevelBadge, PlayerTypeBadge } from '../features/members/fields';
import { PairingResultView } from '../features/pairing/PairingResultView';
import { PaymentResultTable } from '../features/payments/PaymentResultTable';
import { ReconcilePanel } from '../features/payments/ReconcilePanel';
import { DuplicateSessionModal } from '../features/sessions/DuplicateSessionModal';
import { downloadSessionCSV, downloadSessionJSON } from '../features/sessions/sessionExports';
import { useAppData } from '../hooks/useAppData';
import { useFeedback } from '../hooks/useFeedback';
import { genderLabel } from '../services/memberService';
import { calculateBalanceScore, getRoundMatches, getRounds } from '../services/pairingService';
import { calculateSessionPayments } from '../services/paymentService';
import { formatSessionDate, formatVND } from '../utils/format';

export function SessionDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { sessions, settings, deleteSession, setActiveSessionId } = useAppData();
  const { toast, confirm } = useFeedback();
  const [duplicating, setDuplicating] = useState(false);
  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    return (
      <EmptyState
        title="Không tìm thấy buổi chơi"
        description="Buổi chơi này có thể đã bị xoá."
        action={
          <Link to="/lich-su" className="text-sm font-medium text-emerald-800 underline">
            Về trang Lịch sử
          </Link>
        }
      />
    );
  }

  const levels = settings.levels;
  const { rows, reconciliation } = calculateSessionPayments(session, settings);
  const rounds = getRounds(session.pairings);

  const open = (path: string) => {
    setActiveSessionId(session.id);
    navigate(path);
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Xoá buổi chơi',
      message: `Xoá buổi ${formatSessionDate(session.date)}?\nToàn bộ danh sách, kết quả xếp cặp và thu tiền của buổi này sẽ mất.`,
      confirmLabel: 'Xoá buổi chơi',
      danger: true,
    });
    if (ok && (await deleteSession(session.id))) {
      toast('Đã xoá buổi chơi.');
      navigate('/lich-su');
    }
  };

  return (
    <>
      <Link to="/lich-su" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-emerald-800 hover:underline print:hidden">
        <ArrowLeft size={14} aria-hidden="true" /> Lịch sử
      </Link>
      <PageHeader
        title={formatSessionDate(session.date)}
        description={`${session.time} • ${session.players.length} người • ${session.courtCount} sân • ${formatVND(reconciliation.totalCost)}`}
        actions={
          <>
            <Button variant="primary" icon={<Swords size={16} aria-hidden="true" />} onClick={() => open('/xep-cap')}>
              Mở xếp cặp
            </Button>
            <Button variant="primary" icon={<CircleDollarSign size={16} aria-hidden="true" />} onClick={() => open('/tinh-tien')}>
              Mở tính tiền
            </Button>
            <Button icon={<Copy size={16} aria-hidden="true" />} onClick={() => setDuplicating(true)}>
              Nhân bản
            </Button>
            <Button icon={<FileJson size={16} aria-hidden="true" />} onClick={() => downloadSessionJSON(session)}>
              JSON
            </Button>
            <Button icon={<FileSpreadsheet size={16} aria-hidden="true" />} onClick={() => downloadSessionCSV(session, settings)}>
              CSV
            </Button>
            <Button icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>
              In
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => void remove()}>
              Xoá
            </Button>
          </>
        }
      />
      <h1 className="mb-3 hidden text-lg font-bold print:block">
        {formatSessionDate(session.date)} • {session.time}
      </h1>

      <div className="space-y-4">
        {session.notes && <p className="rounded-lg bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">📝 {session.notes}</p>}

        <Card title={`Người chơi (${session.players.length})`} collapsible storageKey="detail.players">
          {session.players.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có người chơi.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {session.players.map((player) => (
                <li key={player.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-900">{player.name}</span>
                  <span className="text-slate-500">{genderLabel(player.gender)}</span>
                  <LevelBadge level={player.level} levels={levels} showScore={false} />
                  {player.playerType === 'walk_in' && <PlayerTypeBadge type="walk_in" />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={
            rounds.length === 0
              ? 'Xếp cặp'
              : rounds.length === 1
                ? `Xếp cặp • Balance Score ${calculateBalanceScore(session.pairings, session.players, levels)}/100`
                : `Xếp cặp • ${rounds.length} lượt`
          }
          collapsible
          storageKey="detail.pairing"
        >
          {session.pairings.length === 0 ? (
            <p className="text-sm text-slate-500">Buổi này chưa xếp cặp.</p>
          ) : (
            <div className="space-y-6">
              {rounds.map((round) => (
                <div key={round}>
                  {rounds.length > 1 && (
                    <p className="mb-2 text-sm font-bold text-slate-900">
                      Lượt {round}{' '}
                      <span className="font-normal text-slate-500">
                        • Balance Score {calculateBalanceScore(getRoundMatches(session.pairings, round), session.players, levels)}/100
                      </span>
                    </p>
                  )}
                  <PairingResultView session={session} round={round} levels={levels} showStrength />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Tiền từng người" collapsible storageKey="detail.payments">
          {session.players.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>
          ) : (
            <PaymentResultTable rows={rows} reconciliation={reconciliation} date={session.date} />
          )}
        </Card>

        <Card title="Chi phí & đối soát" collapsible storageKey="detail.reconcile">
          <ReconcilePanel reconciliation={reconciliation} />
        </Card>
      </div>

      {duplicating && <DuplicateSessionModal source={session} onClose={() => setDuplicating(false)} onCreated={() => navigate('/xep-cap')} />}
    </>
  );
}
