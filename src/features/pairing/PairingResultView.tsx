import { CircleCheck, Scale } from 'lucide-react';
import { Avatar, cx } from '../../components/ui';
import { calculateMatchBalance, getAssignedPlayerIds } from '../../services/pairingService';
import type { Level, Match, Session, SessionPlayer, TeamIds } from '../../types';
import { LevelBadge } from '../members/fields';

interface Props {
  session: Session;
  levels: Level[];
  showStrength: boolean;
  /** Bật chế độ chỉnh sửa: bấm 2 người để đổi chỗ. */
  editing?: boolean;
  selectedId?: string | null;
  onPick?: (playerId: string) => void;
}

export function PairingResultView({ session, levels, showStrength, editing = false, selectedId = null, onPick }: Props) {
  const byId = new Map(session.players.map((player) => [player.id, player]));
  const assigned = getAssignedPlayerIds(session.pairings);
  const waiting = session.players.filter((player) => !assigned.has(player.id) && !player.resting);
  const resting = session.players.filter((player) => player.resting);
  const courts = [...new Set(session.pairings.map((match) => match.court))].sort((a, b) => a - b);

  const chip = (player: SessionPlayer | undefined, key: string) => {
    if (!player) return <span key={key} className="text-sm text-red-700">(không tìm thấy)</span>;
    const content = (
      <>
        <Avatar name={player.name} gender={player.gender} size="sm" />
        <span className="font-semibold">{player.name}</span>
        {showStrength && <LevelBadge level={player.level} levels={levels} />}
      </>
    );
    if (!editing) {
      return (
        <span key={key} className="inline-flex items-center gap-1.5 text-sm text-slate-900">
          {content}
        </span>
      );
    }
    const selected = selectedId === player.id;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={selected}
        onClick={() => onPick?.(player.id)}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm transition active:scale-95',
          selected
            ? 'border-emerald-700 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600'
            : 'border-dashed border-slate-400 bg-white text-slate-900 hover:border-emerald-600 hover:bg-emerald-50',
        )}
      >
        {content}
      </button>
    );
  };

  const team = (ids: TeamIds, label: string, strength: number | null) => (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-lg bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200" aria-label={label}>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        {chip(byId.get(ids[0]), ids[0])}
        {chip(byId.get(ids[1]), ids[1])}
      </div>
      {showStrength && strength !== null && (
        <p className="text-xs text-slate-500">
          Strength <span className="text-base font-bold tabular-nums text-slate-900">{strength}</span>
        </p>
      )}
    </div>
  );

  const matchCard = (match: Match) => {
    const [a1, a2, b1, b2] = [...match.teamA, ...match.teamB].map((id) => byId.get(id));
    const balance = a1 && a2 && b1 && b2 ? calculateMatchBalance([a1, a2], [b1, b2], levels) : null;
    return (
      <div key={match.id} className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3 transition hover:border-emerald-300 hover:shadow-sm print:break-inside-avoid">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">Trận {match.matchNumber}</p>
          {showStrength &&
            balance &&
            (balance.difference === 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
                <CircleCheck size={13} aria-hidden="true" /> Cân bằng
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                <Scale size={13} aria-hidden="true" /> Lệch {balance.difference}
              </span>
            ))}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {team(match.teamA, 'Đội A', balance?.teamAStrength ?? null)}
          <span className="z-10 -my-3.5 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-slate-900 text-[11px] font-bold text-white shadow ring-2 ring-white sm:-mx-3.5 sm:my-0">
            VS
          </span>
          {team(match.teamB, 'Đội B', balance?.teamBStrength ?? null)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {courts.map((court) => (
        <section key={court} aria-label={`Sân ${court}`}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-900">
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-700 text-sm text-white shadow-sm">
              {court}
            </span>
            🏸 SÂN {court}
            <span className="h-px flex-1 bg-emerald-200" aria-hidden="true" />
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">{session.pairings.filter((match) => match.court === court).map(matchCard)}</div>
        </section>
      ))}

      {waiting.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <p className="font-semibold">⚠ {waiting.length} người chưa được xếp</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">{waiting.map((player) => chip(player, player.id))}</div>
          {editing && <p className="mt-2 text-xs">Bấm một người ở đây rồi bấm một người trong trận để đổi chỗ.</p>}
        </div>
      )}

      {resting.length > 0 && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">Nghỉ:</span> {resting.map((player) => player.name).join(', ')}
        </p>
      )}
    </div>
  );
}
