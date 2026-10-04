import { useState } from 'react';
import { Button, Field, Modal, TextInput } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { useFeedback } from '../../hooks/useFeedback';
import { duplicateSession } from '../../services/sessionService';
import type { Session } from '../../types';
import { addDays, formatSessionDate, parseISODate } from '../../utils/format';

interface Props {
  source: Session;
  onClose: () => void;
  onCreated?: (session: Session) => void;
}

export function DuplicateSessionModal({ source, onClose, onCreated }: Props) {
  const { sessions, addSession, setActiveSessionId } = useAppData();
  const { toast } = useFeedback();
  const [date, setDate] = useState(addDays(source.date, 7));
  const [keepGuests, setKeepGuests] = useState(false);
  const [saving, setSaving] = useState(false);

  const guestCount = source.players.filter((player) => player.playerType === 'walk_in').length;
  const validDate = parseISODate(date) !== null;

  const handleCreate = async () => {
    if (!validDate) return;
    setSaving(true);
    const copy = duplicateSession(source, { date, keepGuests }, sessions);
    const ok = await addSession(copy);
    setSaving(false);
    if (!ok) return;
    setActiveSessionId(copy.id);
    toast(`Đã tạo buổi ${formatSessionDate(copy.date)} với ${copy.players.length} người.`);
    onCreated?.(copy);
    onClose();
  };

  return (
    <Modal
      title="Nhân bản buổi chơi"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={handleCreate} disabled={!validDate || saving}>
            {saving ? 'Đang tạo…' : 'Tạo buổi mới'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Sao chép từ buổi <strong>{formatSessionDate(source.date)}</strong> ({source.players.length} người, {source.courtCount} sân).
        </p>
        <Field label="Ngày của buổi mới" hint={validDate ? formatSessionDate(date) : 'Vui lòng chọn ngày hợp lệ.'}>
          <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-700" checked={keepGuests} onChange={(event) => setKeepGuests(event.target.checked)} />
          <span>
            Giữ cả người vãng lai <span className="text-slate-500">({guestCount} người)</span>
          </span>
        </label>
        <ul className="list-disc space-y-0.5 rounded-lg bg-slate-50 py-2 pl-7 pr-3 text-xs text-slate-600">
          <li>Giữ: danh sách người chơi, giờ chơi, số sân.</li>
          <li>Đặt lại: tiền sân, tiền cầu, đã ứng, đã thu, kết quả xếp cặp và các khoá.</li>
        </ul>
      </div>
    </Modal>
  );
}
