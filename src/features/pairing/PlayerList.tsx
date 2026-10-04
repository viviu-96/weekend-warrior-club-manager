import { Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { cx, TextInput } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { useFeedback } from '../../hooks/useFeedback';
import { createMember, genderLabel } from '../../services/memberService';
import { linkPlayerToMember, removePlayer, setPlayerResting, updatePlayer } from '../../services/sessionService';
import type { Session, SessionPlayer } from '../../types';
import { GenderSelect, LevelBadge, LevelSelect, PlayerTypeBadge } from '../members/fields';
import { MemberFormModal } from '../members/MemberFormModal';

interface Props {
  session: Session;
  disabled: boolean;
  onChange: (session: Session) => void;
}

export function PlayerList({ session, disabled, onChange }: Props) {
  const { members, settings, addMember } = useAppData();
  const { toast, confirm } = useFeedback();
  const [promoting, setPromoting] = useState<SessionPlayer | null>(null);
  const levels = settings.levels;

  const remove = async (player: SessionPlayer) => {
    const paired = session.pairings.some((match) => [...match.teamA, ...match.teamB].includes(player.id));
    if (paired) {
      const ok = await confirm({
        title: 'Xoá người chơi',
        message: `${player.name || 'Người này'} đang có trong kết quả xếp cặp. Xoá sẽ huỷ kết quả xếp cặp hiện tại.`,
        confirmLabel: 'Xoá và huỷ kết quả',
        danger: true,
      });
      if (!ok) return;
    }
    onChange(removePlayer(session, player.id));
  };

  if (session.players.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">Chưa có người chơi. Hãy thêm thành viên hoặc người vãng lai ở trên.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {session.players.map((player, index) => {
          const isWalkIn = player.playerType === 'walk_in';
          const incomplete = !player.name.trim() || !player.gender || !player.level;
          return (
            <li key={player.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 py-2', player.resting && 'opacity-60')}>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">{index + 1}</span>

              <div className="min-w-0 flex-1 basis-32">
                {isWalkIn && !disabled ? (
                  <TextInput aria-label="Tên người chơi" value={player.name} onChange={(event) => onChange(updatePlayer(session, player.id, { name: event.target.value }))} />
                ) : (
                  <span className="text-sm font-medium text-slate-900">{player.name || '(chưa có tên)'}</span>
                )}
              </div>

              <span className="w-20 shrink-0">
                <PlayerTypeBadge type={player.playerType} />
              </span>

              {(isWalkIn || incomplete) && !disabled ? (
                <>
                  <GenderSelect className="!w-28" value={player.gender} onChange={(gender) => onChange(updatePlayer(session, player.id, { gender }))} label={`Giới tính của ${player.name}`} />
                  <LevelSelect className="!w-36" value={player.level} onChange={(level) => onChange(updatePlayer(session, player.id, { level }))} levels={levels} label={`Trình độ của ${player.name}`} />
                </>
              ) : (
                <>
                  <span className="w-28 shrink-0 text-sm text-slate-700">{genderLabel(player.gender)}</span>
                  <span className="w-36 shrink-0">
                    <LevelBadge level={player.level} levels={levels} />
                  </span>
                </>
              )}

              <div className="ml-auto flex w-32 shrink-0 items-center justify-end gap-1">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-700"
                    checked={player.resting}
                    disabled={disabled}
                    onChange={(event) => onChange(setPlayerResting(session, player.id, event.target.checked))}
                  />
                  Nghỉ
                </label>
                {isWalkIn && !disabled && (
                  <button
                    type="button"
                    onClick={() => setPromoting(player)}
                    title="Thêm vào danh sách thành viên"
                    aria-label={`Thêm ${player.name} vào danh sách thành viên`}
                    className="rounded-lg p-2 text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    <UserPlus size={16} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove(player)}
                  disabled={disabled}
                  aria-label={`Xoá ${player.name || 'người chơi'} khỏi buổi`}
                  className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {promoting && (
        <MemberFormModal
          title="Thêm vào danh sách thành viên"
          submitLabel="Thêm thành viên"
          levels={levels}
          members={members}
          initial={{ name: promoting.name, gender: promoting.gender ?? undefined, level: promoting.level ?? undefined }}
          onClose={() => setPromoting(null)}
          onSubmit={async (input) => {
            const member = createMember(input);
            if (!(await addMember(member))) return false;
            onChange(
              linkPlayerToMember(
                updatePlayer(session, promoting.id, { name: member.name, gender: member.gender, level: member.level }),
                promoting.id,
                member,
              ),
            );
            toast(`${member.name} đã là thành viên CLB.`);
            return true;
          }}
        />
      )}
    </>
  );
}
