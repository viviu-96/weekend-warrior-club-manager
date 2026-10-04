import { useState } from 'react';
import { Button, cx, Modal, TextInput } from '../../components/ui';
import { filterMembers, GENDER_LABELS, sortMembers } from '../../services/memberService';
import type { Level, Member } from '../../types';

interface Props {
  members: Member[];
  levels: Level[];
  existingMemberIds: Set<string>;
  onAdd: (members: Member[]) => void;
  onClose: () => void;
}

/** Chọn nhiều thành viên cùng lúc bằng cách bấm vào tên. */
export function QuickPickModal({ members, levels, existingMemberIds, onAdd, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = sortMembers(filterMembers(members, { query, gender: 'all', level: 'all' }), levels);
  const available = visible.filter((member) => !existingMemberIds.has(member.id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () => {
    onAdd(members.filter((member) => selected.has(member.id)));
    onClose();
  };

  return (
    <Modal
      title="Chọn thành viên"
      wide
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => setSelected(new Set(available.map((member) => member.id)))} disabled={available.length === 0}>
            Chọn tất cả ({available.length})
          </Button>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={confirm} disabled={selected.size === 0}>
            Thêm {selected.size} người
          </Button>
        </>
      }
    >
      <TextInput aria-label="Tìm thành viên" placeholder="Tìm theo tên…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((member) => {
          const added = existingMemberIds.has(member.id);
          const checked = selected.has(member.id);
          return (
            <button
              key={member.id}
              type="button"
              disabled={added}
              aria-pressed={checked}
              onClick={() => toggle(member.id)}
              className={cx(
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                added && 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400',
                !added && checked && 'border-emerald-700 bg-emerald-50 text-emerald-900',
                !added && !checked && 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
              )}
            >
              <span className="block font-medium">
                {checked && <span aria-hidden="true">✓ </span>}
                {member.name}
              </span>
              <span className="block text-xs opacity-80">
                {GENDER_LABELS[member.gender]} • {member.level}
                {added && ' • đã thêm'}
              </span>
            </button>
          );
        })}
      </div>
      {visible.length === 0 && <p className="mt-3 text-sm text-slate-500">Không tìm thấy thành viên.</p>}
    </Modal>
  );
}
