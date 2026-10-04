import { ArrowRight, Lock, LockOpen, Pencil, Plus, Printer, RefreshCw, Shuffle, Trash2 } from 'lucide-react';
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
  buildRoundHistory,
  calculateBalanceScore,
  generateMatches,
  getEligiblePlayers,
  getPairingSignature,
  getRoundMatches,
  getRounds,
  getWaitCounts,
  hasScores,
  reassignCourts,
  removeRound,
  setMatchScore,
  setRoundMatches,
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
  // Lượt đang xem; null = lượt mới nhất.
  const [roundChoice, setRoundChoice] = useState<number | null>(null);
  // Các phương án đã hiển thị cho từng lượt của từng buổi, để "Xếp lại" không lặp lại.
  const seenSignatures = useRef(new Map<string, string[]>());
  // Sau khi xếp cặp, cuộn tới kết quả để admin thấy có phương án mới.
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
  const rounds = getRounds(session.pairings);
  const hasResult = rounds.length > 0;
  const lastRound = rounds[rounds.length - 1] ?? 1;
  const round = roundChoice !== null && rounds.includes(roundChoice) ? roundChoice : lastRound;
  const roundMatches = getRoundMatches(session.pairings, round);
  const balanceScore = calculateBalanceScore(roundMatches, session.players, levels);
  const matchCount = Math.floor(eligible.length / 4);
  const leftover = eligible.length - matchCount * 4;

  const change = (next: Session) => updateSession(next);

  const stopEditing = () => {
    setEditing(false);
    setSelectedId(null);
  };

  /** Xếp (hoặc xếp lại) một lượt. Các lượt khác được giữ nguyên và dùng để xoay vòng người chờ, tránh lặp partner. */
  const generate = async (targetRound: number, reroll: boolean) => {
    if (errors.length > 0) {
      toast(errors[0]!.message, 'error');
      return;
    }
    // Xếp lại sẽ tạo trận mới nên tỉ số đã ghi của lượt này bị mất – hỏi lại trước khi làm.
    if (reroll && hasScores(getRoundMatches(session.pairings, targetRound))) {
      const ok = await confirm({
        title: `Xếp lại lượt ${targetRound}`,
        message: 'Lượt này đã có tỉ số. Xếp lại sẽ xoá các tỉ số đã ghi của lượt.',
        confirmLabel: 'Xếp lại và xoá tỉ số',
        danger: true,
      });
      if (!ok) return;
    }
    const seenKey = `${session.id}#${targetRound}`;
    const current = getRoundMatches(session.pairings, targetRound);
    const seen = reroll ? (seenSignatures.current.get(seenKey) ?? [getPairingSignature(current)]) : [];
    const result = generateMatches(eligible, {
      levels,
      courtCount: session.courtCount,
      round: targetRound,
      history: buildRoundHistory(
        sessions.filter((item) => item.id !== session.id),
        session,
        targetRound,
      ),
      waitCounts: getWaitCounts(session.players, session.pairings, targetRound),
      excludeSignatures: seen,
    });
    seenSignatures.current.set(seenKey, result.cycled ? [result.signature] : [...seen, result.signature]);
    stopEditing();
    setRoundChoice(targetRound);
    change({ ...session, pairings: setRoundMatches(session.pairings, targetRound, result.matches) });
    setGeneration((value) => value + 1);
    const prefix = rounds.length > 1 || targetRound > 1 ? `Lượt ${targetRound}: ` : '';
    if (result.cycled) toast('Đã xem hết các phương án cân bằng – quay lại từ đầu.', 'info');
    else toast(`${prefix}đã xếp ${result.matches.length} trận • Balance Score ${result.balanceScore}/100`);
  };

  const deleteRound = async () => {
    const ok = await confirm({
      title: `Xoá lượt ${round}`,
      message: rounds.length > 1 ? `Xoá kết quả lượt ${round}? Các lượt phía sau sẽ được đánh số lại.` : 'Xoá kết quả xếp cặp của buổi này?',
      confirmLabel: 'Xoá lượt',
      danger: true,
    });
    if (!ok) return;
    stopEditing();
    seenSignatures.current.clear();
    setRoundChoice(null);
    change({ ...session, pairings: removeRound(session.pairings, round) });
  };

  const pick = (playerId: string) => {
    if (selectedId === null) return setSelectedId(playerId);
    if (selectedId !== playerId) change({ ...session, pairings: swapPlayers(session.pairings, selectedId, playerId, round) });
    setSelectedId(null);
  };

  const setScore = (matchId: string, scoreA: number | null, scoreB: number | null) =>
    change({ ...session, pairings: setMatchScore(session.pairings, matchId, scoreA, scoreB) });

  const lock = () => {
    stopEditing();
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
            <Field label="Ngày" hint={getDayOfWeek(session.date)} className="col-span-2 md:col-span-1">
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
                  change({ ...session, courtCount, pairings: reassignCourts(session.pairings, courtCount) });
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
            <Button
              variant="primary"
              icon={<Shuffle size={16} aria-hidden="true" />}
              onClick={() => void generate(1, false)}
              disabled={locked || errors.length > 0}
              className="px-7 py-3 text-base shadow-md shadow-emerald-900/25"
            >
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
              key={`${generation}-${round}`}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  Kết quả xếp cặp
                  <Badge tone={balanceTone(balanceScore)}>
                    <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-10 overflow-hidden rounded-full bg-black/10 align-middle">
                      <span className="block h-full rounded-full bg-current" style={{ width: `${balanceScore}%` }} />
                    </span>
                    Balance Score: {balanceScore}/100
                  </Badge>
                  {locked && <Badge tone="blue">🔒 Đã khoá</Badge>}
                </span>
              }
              actions={
                <div className="flex flex-wrap gap-2 print:hidden">
                  <Button size="sm" icon={<RefreshCw size={14} aria-hidden="true" />} onClick={() => void generate(round, true)} disabled={locked}>
                    Xếp lại{rounds.length > 1 && ` lượt ${round}`}
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
              {/* Thanh chọn lượt */}
              <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden" role="tablist" aria-label="Lượt đấu">
                {rounds.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={item === round}
                    onClick={() => {
                      setRoundChoice(item);
                      stopEditing();
                    }}
                    className={cx(
                      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition active:scale-95',
                      item === round ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    Lượt {item}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => void generate(lastRound + 1, false)}
                  title="Xếp thêm một lượt mới: ưu tiên người vừa chờ, tránh lặp lại partner"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-emerald-600 px-3.5 py-1.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={14} aria-hidden="true" /> Thêm lượt
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => void deleteRound()}
                  aria-label={`Xoá lượt ${round}`}
                  title={`Xoá lượt ${round}`}
                  className="ml-auto rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>

              {editing && (
                <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 print:hidden">
                  ✏️ Bấm vào hai người chơi để đổi chỗ cho nhau.{selectedId && ' Đã chọn 1 người – bấm người thứ hai.'}
                </p>
              )}

              <div className="print:hidden">
                <PairingResultView session={session} round={round} levels={levels} showStrength={showStrength} editing={editing && !locked} selectedId={selectedId} onPick={pick} onScoreChange={setScore} />
                <p className="mt-3 text-xs text-slate-500">Nhập tỉ số vào hai ô cạnh chữ VS sau khi đánh xong – dùng cho thống kê thắng/thua ở trang Thành viên. Tỉ số vẫn nhập được khi kết quả đã khoá.</p>
              </div>

              {/* Bản in: tất cả các lượt */}
              <div className="hidden space-y-6 print:block">
                <p className="text-base font-bold">
                  🏸 Xếp cặp cầu lông – {formatSessionDate(session.date)} • {session.time}
                </p>
                {rounds.map((item) => (
                  <div key={item}>
                    {rounds.length > 1 && <p className="mb-2 text-sm font-bold">Lượt {item}</p>}
                    <PairingResultView session={session} round={item} levels={levels} showStrength={showStrength} />
                  </div>
                ))}
              </div>

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
