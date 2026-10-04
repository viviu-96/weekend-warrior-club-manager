import { ClipboardList, ListChecks, UserPlus, UserRoundPlus } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, cx, TextInput } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { useFeedback } from '../../hooks/useFeedback';
import { addPlayers, createMemberPlayer, createWalkInPlayer } from '../../services/sessionService';
import type { Gender, Member, Session, SessionPlayer } from '../../types';
import { GenderSelect, LevelSelect } from '../members/fields';
import { MemberAutocomplete } from '../members/MemberAutocomplete';
import { ImportPlayersModal } from './ImportPlayersModal';
import { QuickPickModal } from './QuickPickModal';

type Mode = 'member' | 'walk_in';

interface Props {
  session: Session;
  disabled: boolean;
  onChange: (session: Session) => void;
}

export function AddPlayerPanel({ session, disabled, onChange }: Props) {
  const { members, settings } = useAppData();
  const { toast } = useFeedback();
  const [mode, setMode] = useState<Mode>('member');
  const [dialog, setDialog] = useState<'import' | 'pick' | null>(null);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const existingMemberIds = new Set(session.players.flatMap((player) => (player.memberId ? [player.memberId] : [])));

  const add = (players: SessionPlayer[]) => {
    if (players.length > 0) onChange(addPlayers(session, players));
  };

  const addMember = (member: Member) => {
    if (existingMemberIds.has(member.id)) {
      toast(`${member.name} đã có trong danh sách.`, 'info');
      return;
    }
    add([createMemberPlayer(member)]);
  };

  const submitWalkIn = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Vui lòng nhập tên người vãng lai.');
    if (!gender) return setError('Vui lòng chọn giới tính.');
    if (!level) return setError('Vui lòng chọn trình độ.');
    setError('');
    add([createWalkInPlayer(name, gender, level)]);
    setName('');
    nameRef.current?.focus();
  };

  const tab = (value: Mode, label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
        mode === value ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
      )}
    >
      {icon}
      {label}
    </button>
  );

  if (disabled) return null;

  return (
    <div className="mb-4 space-y-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        {tab('member', 'Thêm thành viên', <UserPlus size={16} aria-hidden="true" />)}
        {tab('walk_in', 'Thêm vãng lai', <UserRoundPlus size={16} aria-hidden="true" />)}
        <Button icon={<ListChecks size={16} aria-hidden="true" />} onClick={() => setDialog('pick')}>
          Chọn nhiều
        </Button>
        <Button icon={<ClipboardList size={16} aria-hidden="true" />} onClick={() => setDialog('import')}>
          Import danh sách
        </Button>
      </div>

      {mode === 'member' ? (
        <div>
          <MemberAutocomplete members={members} levels={settings.levels} excludedIds={existingMemberIds} onSelect={addMember} />
          <p className="mt-1 text-xs text-slate-500">Chọn thành viên là tự điền giới tính và trình độ. Dùng ↑ ↓ và Enter để thêm liên tục.</p>
        </div>
      ) : (
        <form onSubmit={submitWalkIn} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_8rem_10rem_auto]">
          <TextInput
            ref={nameRef}
            aria-label="Tên người vãng lai"
            placeholder="Tên người vãng lai"
            className="col-span-2 sm:col-span-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
          <GenderSelect value={gender} onChange={setGender} />
          <LevelSelect value={level} onChange={setLevel} levels={settings.levels} />
          <Button variant="primary" type="submit" className="col-span-2 sm:col-span-1">
            Thêm
          </Button>
          {error && (
            <p role="alert" className="col-span-full text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
      )}

      {dialog === 'import' && (
        <ImportPlayersModal
          members={members}
          levels={settings.levels}
          existingMemberIds={existingMemberIds}
          onClose={() => setDialog(null)}
          onImport={(players) => {
            add(players);
            toast(`Đã thêm ${players.length} người.`);
          }}
        />
      )}
      {dialog === 'pick' && (
        <QuickPickModal
          members={members}
          levels={settings.levels}
          existingMemberIds={existingMemberIds}
          onClose={() => setDialog(null)}
          onAdd={(picked) => add(picked.map(createMemberPlayer))}
        />
      )}
    </div>
  );
}
