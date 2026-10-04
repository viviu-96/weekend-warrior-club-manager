import { CalendarPlus, Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, EmptyState, Select } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { useFeedback } from '../../hooks/useFeedback';
import { createSession, sortSessionsByDate } from '../../services/sessionService';
import { formatSessionDate } from '../../utils/format';
import { DuplicateSessionModal } from './DuplicateSessionModal';

/** Hook tạo nhanh buổi chơi mới với giá trị mặc định từ Cài đặt. */
export function useCreateSession() {
  const { settings, sessions, addSession, setActiveSessionId } = useAppData();
  const { toast } = useFeedback();
  return async () => {
    const session = createSession(settings, sessions);
    if (!(await addSession(session))) return null;
    setActiveSessionId(session.id);
    toast(`Đã tạo buổi ${formatSessionDate(session.date)}.`);
    return session;
  };
}

/** Thanh chọn buổi đang thao tác – dùng chung cho trang Xếp cặp và Tính tiền. */
export function SessionPicker() {
  const { sessions, activeSession, setActiveSessionId } = useAppData();
  const createNew = useCreateSession();
  const [duplicating, setDuplicating] = useState(false);
  const sorted = sortSessionsByDate(sessions);
  const latest = sorted[0];

  return (
    <div className="animate-rise mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-900/5 print:hidden">
      <label className="min-w-0 flex-1 basis-56">
        <span className="mb-1 block text-xs font-medium text-slate-700">Buổi chơi</span>
        <Select value={activeSession?.id ?? ''} onChange={(event) => setActiveSessionId(event.target.value || null)} disabled={sorted.length === 0}>
          {sorted.length === 0 && <option value="">Chưa có buổi chơi</option>}
          {sorted.map((session) => (
            <option key={session.id} value={session.id}>
              {formatSessionDate(session.date)} • {session.time} • {session.players.length} người
            </option>
          ))}
        </Select>
      </label>
      <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => void createNew()}>
        Buổi mới
      </Button>
      <Button icon={<Copy size={16} aria-hidden="true" />} onClick={() => setDuplicating(true)} disabled={!latest}>
        Nhân bản buổi trước
      </Button>
      {duplicating && (activeSession ?? latest) && (
        <DuplicateSessionModal source={(activeSession ?? latest)!} onClose={() => setDuplicating(false)} />
      )}
    </div>
  );
}

export function NoSessionState() {
  const createNew = useCreateSession();
  return (
    <EmptyState
      icon={<CalendarPlus size={22} aria-hidden="true" />}
      title="Chưa có buổi chơi nào"
      description="Tạo buổi chơi mới để bắt đầu thêm người chơi, xếp cặp và tính tiền."
      action={
        <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => void createNew()}>
          Tạo buổi chơi
        </Button>
      }
    />
  );
}
