import { useState, type FormEvent } from 'react';
import { Button, Field, Modal, TextInput } from '../../components/ui';
import { findMembersByName, type MemberInput } from '../../services/memberService';
import { getLevelScore } from '../../services/pairingService';
import { validateMemberInput } from '../../services/validationService';
import type { Gender, Level, Member } from '../../types';
import { GenderSelect, LevelSelect } from './fields';

interface Props {
  title: string;
  levels: Level[];
  members: Member[];
  initial?: Partial<MemberInput>;
  /** Id của thành viên đang sửa (để không tự cảnh báo trùng tên với chính mình). */
  editingId?: string;
  submitLabel?: string;
  onSubmit: (input: MemberInput) => Promise<boolean>;
  onClose: () => void;
}

export function MemberFormModal({ title, levels, members, initial, editingId, submitLabel = 'Lưu', onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [gender, setGender] = useState<Gender | null>(initial?.gender ?? null);
  const [level, setLevel] = useState<string | null>(initial?.level ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const sameName = findMembersByName(members, name).filter((member) => member.id !== editingId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = validateMemberInput({ name, gender: gender ?? '', level: level ?? '' }, levels);
    setErrors(problems);
    if (problems.length > 0 || !gender || !level) return;
    setSaving(true);
    const ok = await onSubmit({ name, gender, level, note });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" type="submit" form="member-form" disabled={saving}>
            {saving ? 'Đang lưu…' : submitLabel}
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Tên">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Quang" autoComplete="off" />
        </Field>
        {sameName.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⚠ Đã có {sameName.length} thành viên cùng tên. Vẫn có thể lưu – khi xếp cặp bạn sẽ chọn theo giới tính và trình độ.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Giới tính">
            <GenderSelect value={gender} onChange={setGender} />
          </Field>
          <Field label="Trình độ" hint={level ? `Điểm tự động: ${getLevelScore(level, levels)}` : 'Điểm được tính tự động'}>
            <LevelSelect value={level} onChange={setLevel} levels={levels} />
          </Field>
        </div>
        <Field label="Ghi chú">
          <TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="Không bắt buộc" />
        </Field>
        {errors.length > 0 && (
          <ul role="alert" className="list-disc rounded-lg bg-red-50 py-2 pl-7 pr-3 text-sm text-red-800">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </form>
    </Modal>
  );
}
