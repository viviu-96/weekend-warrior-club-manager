import { cx } from '../../components/ui';
import { calculateMatchBalance, getAssignedPlayerIds, getLevelScore } from '../../services/pairingService';
import type { Level, Match, Session, SessionPlayer, TeamIds } from '../../types';

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
        <span className="font-semibold">{player.name}</span>
        {showStrength && (
          <span className="ml-1.5 text-xs opacity-70">
            {player.level} · {getLevelScore(player.level, levels)}
          </span>
        )}
      </>
    );
    if (!editing) return <span key={key} className="text-sm text-slate-900">{content}</span>;
    const selected = selectedId === player.id;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={selected}
        onClick={() => onPick?.(player.id)}
        className={cx(
          'rounded-lg border px-2 py-1 text-sm transition-colors',
          selected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-dashed border-slate-400 bg-white text-slate-900 hover:bg-emerald-50',
        )}
      >
        {content}
      </button>
    );
  };

  const team = (ids: TeamIds, label: string) => (
    <div className="flex flex-1 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center" aria-label={label}>
      {chip(byId.get(ids[0]), ids[0])}
      <span className="text-slate-400" aria-hidden="true">+</span>
      {chip(byId.get(ids[1]), ids[1])}
    </div>
  );

  const matchCard = (match: Match) => {
    const players = [...match.teamA, ...match.teamB].map((id) => byId.get(id));
    const [a1, a2, b1, b2] = players;
    const balance = a1 && a2 && b1 && b2 ? calculateMatchBalance([a1, a2], [b1, b2], levels) : null;
    return (
      <div key={match.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 print:break-inside-avoid">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Trận {match.matchNumber}</p>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {team(match.teamA, 'Đội A')}
          <span className="self-center rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">VS</span>
          {team(match.teamB, 'Đội B')}
        </div>
        {showStrength && balance && (
          <p className="mt-2 text-center text-xs text-slate-600">
            Strength: <span className="font-semibold tabular-nums">{balance.teamAStrength} VS {balance.teamBStrength}</span>
            {balance.difference > 0 && <span className="ml-1 text-amber-700">(lệch {balance.difference})</span>}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {courts.map((court) => (
        <section key={court} aria-label={`Sân ${court}`}>
          <h3 className="mb-2 text-sm font-bold text-emerald-900">🏸 SÂN {court}</h3>
          <div className="grid gap-3 lg:grid-cols-2">{session.pairings.filter((match) => match.court === court).map(matchCard)}</div>
        </section>
      ))}

      {waiting.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">⚠ {waiting.length} người chưa được xếp</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">{waiting.map((player) => chip(player, player.id))}</div>
          {editing && <p className="mt-1.5 text-xs">Bấm một người ở đây rồi bấm một người trong trận để đổi chỗ.</p>}
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
