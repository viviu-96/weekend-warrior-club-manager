import { useState } from 'react';
import { Badge, Button, Modal, Select, inputClass } from '../../components/ui';
import { findMembersByName, GENDER_LABELS, parseNameList } from '../../services/memberService';
import { createMemberPlayer, createWalkInPlayer } from '../../services/sessionService';
import type { Gender, Level, Member, SessionPlayer } from '../../types';
import { GenderSelect, LevelSelect } from '../members/fields';

type Choice = 'walk_in' | 'skip' | '' | `member:${string}`;

interface Row {
  name: string;
  matches: Member[];
  choice: Choice;
  gender: Gender | null;
  level: string | null;
}

interface Props {
  members: Member[];
  levels: Level[];
  existingMemberIds: Set<string>;
  onImport: (players: SessionPlayer[]) => void;
  onClose: () => void;
}

export function ImportPlayersModal({ members, levels, existingMemberIds, onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);

  const analyse = () => {
    const taken = new Set(existingMemberIds);
    const parsed = parseNameList(text).map<Row>((name) => {
      const matches = findMembersByName(members, name);
      const available = matches.filter((member) => !taken.has(member.id));
      let choice: Choice = 'walk_in';
      if (matches.length > 0 && available.length === 0) choice = 'skip';
      else if (available.length === 1 && matches.length === 1) choice = `member:${available[0]!.id}`;
      else if (matches.length > 1) choice = ''; // trùng tên -> admin phải tự chọn
      if (choice.startsWith('member:')) taken.add(choice.slice(7));
      return { name, matches, choice, gender: null, level: null };
    });
    setRows(parsed);
  };

  const patchRow = (index: number, patch: Partial<Row>) =>
    setRows((current) => current?.map((row, i) => (i === index ? { ...row, ...patch } : row)) ?? null);

  const chosenMemberIds = (rows ?? []).flatMap((row) => (row.choice.startsWith('member:') ? [row.choice.slice(7)] : []));
  const hasDuplicateChoice = new Set(chosenMemberIds).size !== chosenMemberIds.length;
  const undecided = (rows ?? []).filter((row) => row.choice === '').length;
  const importable = (rows ?? []).filter((row) => row.choice !== 'skip' && row.choice !== '').length;

  const handleImport = () => {
    if (!rows) return;
    const players = rows.flatMap<SessionPlayer>((row) => {
      if (row.choice === 'walk_in') return [createWalkInPlayer(row.name, row.gender, row.level)];
      if (row.choice.startsWith('member:')) {
        const member = members.find((item) => item.id === row.choice.slice(7));
        return member ? [createMemberPlayer(member)] : [];
      }
      return [];
    });
    onImport(players);
    onClose();
  };

  return (
    <Modal
      title="Import danh sách người chơi"
      wide
      onClose={onClose}
      footer={
        rows ? (
          <>
            <Button onClick={() => setRows(null)}>Quay lại</Button>
            <Button variant="primary" onClick={handleImport} disabled={importable === 0 || undecided > 0 || hasDuplicateChoice}>
              Thêm {importable} người
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Huỷ</Button>
            <Button variant="primary" onClick={analyse} disabled={parseNameList(text).length === 0}>
              Kiểm tra danh sách
            </Button>
          </>
        )
      }
    >
      {!rows ? (
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Dán danh sách tên, mỗi dòng một người (ví dụ copy từ Zalo):</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            placeholder={'Quang\nHùng\nSáng\nViệt\nHà\nDuy'}
            className={inputClass}
          />
        </label>
      ) : (
        <div className="space-y-2">
          {undecided > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠ Còn {undecided} tên trùng với nhiều thành viên – hãy chọn đúng người.</p>}
          {hasDuplicateChoice && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">⛔ Một thành viên đang được chọn cho nhiều dòng.</p>}
          <ul className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <li key={`${row.name}-${index}`} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-28 shrink-0 text-sm font-medium text-slate-900">{row.name}</span>
                {row.matches.length === 0 ? (
                  <Badge tone="amber">Chưa xác định</Badge>
                ) : row.matches.length === 1 ? (
                  <Badge tone="green">Khớp thành viên</Badge>
                ) : (
                  <Badge tone="red">Trùng tên ({row.matches.length})</Badge>
                )}
                <Select
                  aria-label={`Cách thêm ${row.name}`}
                  className="!w-auto min-w-44 flex-1"
                  value={row.choice}
                  onChange={(event) => patchRow(index, { choice: event.target.value as Choice })}
                >
                  {row.choice === '' && <option value="">Chọn đúng người…</option>}
                  {row.matches.map((member) => (
                    <option key={member.id} value={`member:${member.id}`} disabled={existingMemberIds.has(member.id)}>
                      Mặc định: {member.name} – {GENDER_LABELS[member.gender]} • {member.level}
                      {existingMemberIds.has(member.id) ? ' (đã có trong buổi)' : ''}
                    </option>
                  ))}
                  <option value="walk_in">Vãng lai</option>
                  <option value="skip">Bỏ qua</option>
                </Select>
                {row.choice === 'walk_in' && (
                  <>
                    <GenderSelect className="!w-28" value={row.gender} onChange={(gender) => patchRow(index, { gender })} label={`Giới tính của ${row.name}`} />
                    <LevelSelect className="!w-36" value={row.level} onChange={(level) => patchRow(index, { level })} levels={levels} label={`Trình độ của ${row.name}`} />
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Người vãng lai chưa chọn giới tính/trình độ vẫn được thêm, bạn bổ sung sau trong danh sách.</p>
        </div>
      )}
    </Modal>
  );
}
