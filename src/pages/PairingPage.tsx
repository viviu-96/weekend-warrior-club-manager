import { ArrowRight, Lock, LockOpen, Pencil, Printer, RefreshCw, Shuffle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '../components/CopyButton';
import { Badge, Button, Card, cx, Field, IssueList, PageHeader, TextInput } from '../components/ui';
import { AddPlayerPanel } from '../features/pairing/AddPlayerPanel';
import { PairingResultView } from '../features/pairing/PairingResultView';
import { PlayerList } from '../features/pairing/PlayerList';
import { NoSessionState, SessionPicker } from '../features/sessions/SessionPicker';
import { useAppData } from '../hooks/useAppData';
import { useFeedback } from '../hooks/useFeedback';
import { generateZaloPairingText } from '../services/exportService';
import {
  assignCourts,
  buildPairingHistory,
  calculateBalanceScore,
  generateMatches,
  getEligiblePlayers,
  getPairingSignature,
  swapPlayers,
} from '../services/pairingService';
import { validateForPairing } from '../services/validationService';
import type { Session } from '../types';
import { formatSessionDate, getDayOfWeek, parseISODate } from '../utils/format';

function balanceTone(score: number): 'green' | 'amber' | 'red' {
  if (score >= 85) return 'green';
  return score >= 65 ? 'amber' : 'red';
}

export function PairingPage() {
  const { activeSession: session, sessions, members, settings, updateSession } = useAppData();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStrength, setShowStrength] = useState(true);
  // Các phương án đã hiển thị cho từng buổi, để "Xếp lại" không lặp lại.
  const seenSignatures = useRef(new Map<string, string[]>());
  // Sau khi xếp cặp, cuộn tới kết quả và nháy nhẹ để admin thấy có phương án mới.
  const resultRef = useRef<HTMLDivElement>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (generation > 0) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [generation]);

  if (!session) {
    return (
      <>
        <PageHeader title="🏸 Xếp cặp" description="Xếp cặp đánh đôi cân bằng theo trình độ." />
        <NoSessionState />
      </>
    );
  }

  const levels = settings.levels;
  const locked = session.pairingLocked;
  const issues = validateForPairing(session, members, levels);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const eligible = getEligiblePlayers(session.players, levels);
  const hasResult = session.pairings.length > 0;
  const balanceScore = calculateBalanceScore(session.pairings, session.players, levels);
  const matchCount = Math.floor(eligible.length / 4);
  const leftover = eligible.length - matchCount * 4;

  const change = (next: Session) => updateSession(next);

  const generate = (reroll: boolean) => {
    if (errors.length > 0) {
      toast(errors[0]!.message, 'error');
      return;
    }
    const seen = reroll ? (seenSignatures.current.get(session.id) ?? [getPairingSignature(session.pairings)]) : [];
    const result = generateMatches(eligible, {
      levels,
      courtCount: session.courtCount,
      history: buildPairingHistory(sessions.filter((item) => item.id !== session.id)),
      excludeSignatures: seen,
    });
    seenSignatures.current.set(session.id, result.cycled ? [result.signature] : [...seen, result.signature]);
    setEditing(false);
    setSelectedId(null);
    change({ ...session, pairings: result.matches });
    setGeneration((value) => value + 1);
    if (result.cycled) toast('Đã xem hết các phương án cân bằng – quay lại từ đầu.', 'info');
    else toast(`Đã xếp ${result.matches.length} trận • Balance Score ${result.balanceScore}/100`);
  };

  const pick = (playerId: string) => {
    if (selectedId === null) return setSelectedId(playerId);
    if (selectedId !== playerId) change({ ...session, pairings: swapPlayers(session.pairings, selectedId, playerId) });
    setSelectedId(null);
  };

  const lock = () => {
    setEditing(false);
    setSelectedId(null);
    change({ ...session, pairingLocked: true });
    toast('Đã khoá kết quả xếp cặp.');
  };

  const unlock = async () => {
    const ok = await confirm({ title: 'Mở khoá kết quả', message: 'Bạn có chắc muốn mở khóa kết quả xếp cặp?', confirmLabel: 'Mở khoá' });
    if (ok) change({ ...session, pairingLocked: false });
  };

  return (
    <>
      <PageHeader title="🏸 Xếp cặp" description="Xếp cặp đánh đôi cân bằng theo trình độ." />
      <SessionPicker />

      <div className="space-y-4">
        {locked && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 print:hidden">
            <span>🔒 Kết quả xếp cặp đang khoá. Mở khoá để sửa danh sách hoặc xếp lại.</span>
            <Button size="sm" icon={<LockOpen size={14} aria-hidden="true" />} onClick={() => void unlock()}>
              Mở khoá
            </Button>
          </div>
        )}

        <Card title="Thông tin buổi chơi" className="print:hidden" collapsible storageKey="pairing.info">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Ngày" hint={getDayOfWeek(session.date)}>
              <TextInput
                type="date"
                value={session.date}
                disabled={locked}
                onChange={(event) => {
                  const date = event.target.value;
                  if (parseISODate(date)) change({ ...session, date, dayOfWeek: getDayOfWeek(date) });
                }}
              />
            </Field>
            <Field label="Thời gian">
              <TextInput value={session.time} disabled={locked} placeholder="08:00-10:00" onChange={(event) => change({ ...session, time: event.target.value })} />
            </Field>
            <Field label="Số sân">
              <TextInput
                type="number"
                min={1}
                max={20}
                value={session.courtCount}
                disabled={locked}
                onChange={(event) => {
                  const courtCount = Math.min(20, Math.max(1, Math.floor(Number(event.target.value) || 1)));
                  change({ ...session, courtCount, pairings: assignCourts(session.pairings, courtCount) });
                }}
              />
            </Field>
            <Field label="Ghi chú" className="col-span-2 md:col-span-1">
              <TextInput value={session.notes} placeholder="Không bắt buộc" onChange={(event) => change({ ...session, notes: event.target.value })} />
            </Field>
          </div>
        </Card>

        <Card
          className="print:hidden"
          collapsible
          storageKey="pairing.players"
          title={
            <>
              Danh sách người chơi <span className="font-normal text-slate-500">({session.players.length} người • {eligible.length} sẵn sàng)</span>
            </>
          }
        >
          <AddPlayerPanel session={session} disabled={locked} onChange={change} />
          <PlayerList session={session} disabled={locked} onChange={change} />
        </Card>

        <IssueList issues={issues} />

        {!hasResult && (
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Button variant="primary" icon={<Shuffle size={16} aria-hidden="true" />} onClick={() => generate(false)} disabled={locked || errors.length > 0} className="px-7 py-3 text-base shadow-md shadow-emerald-900/25">
              Xếp cặp
            </Button>
            {eligible.length >= 4 && (
              <span className="text-sm text-slate-600">
                {eligible.length} người → {matchCount} trận{leftover > 0 && `, ${leftover} người chờ`}
              </span>
            )}
          </div>
        )}

        {hasResult && (
          <div ref={resultRef} className="scroll-mt-20">
          <Card
            key={generation}
            title={
              <span className="flex flex-wrap items-center gap-2">
                Kết quả xếp cặp
                <Badge tone={balanceTone(balanceScore)}>
                  <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-10 overflow-hidden rounded-full bg-black/10 align-middle">
                    <span className={cx('block h-full rounded-full bg-current')} style={{ width: `${balanceScore}%` }} />
                  </span>
                  Balance Score: {balanceScore}/100
                </Badge>
                {locked && <Badge tone="blue">🔒 Đã khoá</Badge>}
              </span>
            }
            actions={
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button size="sm" icon={<RefreshCw size={14} aria-hidden="true" />} onClick={() => generate(true)} disabled={locked}>
                  Xếp lại
                </Button>
                <Button
                  size="sm"
                  variant={editing ? 'primary' : 'secondary'}
                  aria-pressed={editing}
                  icon={<Pencil size={14} aria-hidden="true" />}
                  disabled={locked}
                  onClick={() => {
                    setEditing(!editing);
                    setSelectedId(null);
                  }}
                >
                  {editing ? 'Xong' : 'Chỉnh sửa'}
                </Button>
                {locked ? (
                  <Button size="sm" icon={<LockOpen size={14} aria-hidden="true" />} onClick={() => void unlock()}>
                    Mở khoá
                  </Button>
                ) : (
                  <Button size="sm" icon={<Lock size={14} aria-hidden="true" />} onClick={lock}>
                    Khoá kết quả
                  </Button>
                )}
                <CopyButton label="Copy kết quả" successMessage="Đã copy kết quả xếp cặp." getText={() => generateZaloPairingText(session, { levels, showStrength: false })} />
                <Button size="sm" icon={<Printer size={14} aria-hidden="true" />} onClick={() => window.print()}>
                  In
                </Button>
              </div>
            }
          >
            <p className="mb-3 hidden text-base font-bold print:block">
              🏸 Xếp cặp cầu lông – {formatSessionDate(session.date)} • {session.time}
            </p>
            {editing && (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 print:hidden">
                ✏️ Bấm vào hai người chơi để đổi chỗ cho nhau.{selectedId && ' Đã chọn 1 người – bấm người thứ hai.'}
              </p>
            )}
            <PairingResultView session={session} levels={levels} showStrength={showStrength} editing={editing && !locked} selectedId={selectedId} onPick={pick} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 print:hidden">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-emerald-700" checked={showStrength} onChange={(event) => setShowStrength(event.target.checked)} />
                Hiện trình độ và strength
              </label>
              <Link to="/tinh-tien" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-800">
                Sang tính tiền <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </Card>
          </div>
        )}
      </div>
    </>
  );
}
