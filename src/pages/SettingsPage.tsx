import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Card, Field, Modal, MoneyInput, PageHeader, Select, TextInput, Toggle } from '../components/ui';
import { useAppData } from '../hooks/useAppData';
import { useFeedback } from '../hooks/useFeedback';
import { IS_LOCAL_STORAGE } from '../services/api';
import { exportAllJSON } from '../services/exportService';
import { countLevelUsage, removeLevelWithMigration } from '../services/memberService';
import { sortLevels } from '../services/pairingService';
import { parseBackupText } from '../services/validationService';
import type { HalfPlayCourtMode, Level, Settings } from '../types';
import { downloadTextFile, readFileAsText } from '../utils/browser';
import { formatVND, todayISO } from '../utils/format';

function GeneralSettings() {
  const { settings, updateSettings } = useAppData();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<Settings>(settings);
  const dirty = JSON.stringify({ ...draft, levels: null }) !== JSON.stringify({ ...settings, levels: null });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const next: Settings = {
      ...settings,
      clubName: draft.clubName.trim() || settings.clubName,
      defaultTime: draft.defaultTime.trim() || settings.defaultTime,
      defaultCourtCount: Math.min(20, Math.max(1, Math.floor(draft.defaultCourtCount) || 1)),
      shuttleBoxPrice: Math.max(0, Math.round(draft.shuttleBoxPrice) || 0),
      shuttlesPerBox: Math.min(100, Math.max(1, Math.floor(draft.shuttlesPerBox) || 12)),
      halfPlayCourtMode: draft.halfPlayCourtMode,
      mergeGuestsByDefault: draft.mergeGuestsByDefault,
    };
    if (await updateSettings(next)) {
      setDraft(next);
      toast('Đã lưu cài đặt.');
    }
  };

  return (
    <Card title="Mặc định cho buổi chơi" collapsible storageKey="settings.general">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tên câu lạc bộ">
            <TextInput value={draft.clubName} onChange={(event) => setDraft({ ...draft, clubName: event.target.value })} />
          </Field>
          <Field label="Giờ chơi mặc định">
            <TextInput value={draft.defaultTime} placeholder="08:00-10:00" onChange={(event) => setDraft({ ...draft, defaultTime: event.target.value })} />
          </Field>
          <Field label="Số sân mặc định">
            <TextInput type="number" min={1} max={20} value={draft.defaultCourtCount} onChange={(event) => setDraft({ ...draft, defaultCourtCount: Number(event.target.value) })} />
          </Field>
          <Field label="Giá 1 hộp cầu" hint="Tự điền cho buổi mới; mỗi buổi vẫn sửa riêng được.">
            <MoneyInput label="Giá một hộp cầu" value={draft.shuttleBoxPrice} onChange={(shuttleBoxPrice) => setDraft({ ...draft, shuttleBoxPrice })} />
          </Field>
          <Field
            label="Số quả cầu trong 1 hộp"
            hint={draft.shuttleBoxPrice > 0 && draft.shuttlesPerBox > 0 ? `${formatVND(draft.shuttleBoxPrice / draft.shuttlesPerBox)} / quả` : undefined}
          >
            <TextInput type="number" min={1} max={100} value={draft.shuttlesPerBox} onChange={(event) => setDraft({ ...draft, shuttlesPerBox: Number(event.target.value) })} />
          </Field>
        </div>
        <Field label="Tiền sân của người chơi nửa buổi" hint="Tiền cầu của người chơi nửa buổi luôn là 50% suất; phần còn lại chia đều cho người chơi cả buổi.">
          <Select value={draft.halfPlayCourtMode} onChange={(event) => setDraft({ ...draft, halfPlayCourtMode: event.target.value as HalfPlayCourtMode })} className="sm:!w-80">
            <option value="full">Tính đủ suất sân (mặc định)</option>
            <option value="half">Tính 50% suất sân</option>
          </Select>
        </Field>
        <Toggle label="Buổi mới tự bật “Gộp khách vào người giới thiệu”" checked={draft.mergeGuestsByDefault} onChange={(mergeGuestsByDefault) => setDraft({ ...draft, mergeGuestsByDefault })} />
        <div>
          <Button variant="primary" type="submit" disabled={!dirty}>
            Lưu cài đặt
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LevelSettings() {
  const data = useAppData();
  const { settings, members, sessions, updateSettings, replaceAll } = data;
  const { toast, confirm } = useFeedback();
  const [name, setName] = useState('');
  const [score, setScore] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Level | null>(null);
  const [replacement, setReplacement] = useState('');
  const levels = sortLevels(settings.levels);

  const saveLevels = (next: Level[]) => updateSettings({ ...settings, levels: next });

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const value = Number(score);
    if (!trimmed) return setError('Vui lòng nhập tên trình độ.');
    if (settings.levels.some((level) => level.name.toLowerCase() === trimmed.toLowerCase())) return setError('Trình độ này đã tồn tại.');
    if (!Number.isFinite(value) || value <= 0) return setError('Điểm phải là số lớn hơn 0.');
    setError('');
    if (await saveLevels([...settings.levels, { name: trimmed, score: value }])) {
      setName('');
      setScore('');
      toast(`Đã thêm trình độ ${trimmed}.`);
    }
  };

  const changeScore = async (level: Level, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || value === level.score) return;
    if (await saveLevels(settings.levels.map((item) => (item.name === level.name ? { ...item, score: value } : item)))) {
      toast(`Đã đổi điểm ${level.name} thành ${value}.`);
    }
  };

  const askRemove = async (level: Level) => {
    if (settings.levels.length <= 1) return toast('Phải có ít nhất một trình độ.', 'error');
    if (countLevelUsage(level.name, members, sessions) > 0) {
      setReplacement('');
      setRemoving(level);
      return;
    }
    const ok = await confirm({ title: 'Xoá trình độ', message: `Xoá trình độ "${level.name}"?`, confirmLabel: 'Xoá', danger: true });
    if (ok && (await saveLevels(settings.levels.filter((item) => item.name !== level.name)))) toast(`Đã xoá trình độ ${level.name}.`);
  };

  const migrateAndRemove = async () => {
    if (!removing || !replacement) return;
    const next = removeLevelWithMigration({ members, sessions, settings }, removing.name, replacement);
    if (await replaceAll(next)) {
      toast(`Đã chuyển sang ${replacement} và xoá ${removing.name}.`);
      setRemoving(null);
    }
  };

  return (
    <Card title="Trình độ & điểm" collapsible storageKey="settings.levels">
      <p className="mb-3 text-sm text-slate-600">Điểm dùng để xếp cặp cân bằng. Thành viên chỉ chọn tên trình độ, điểm được tra tự động từ bảng này.</p>
      <table className="w-full max-w-lg text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
            <th scope="col" className="py-2">Trình độ</th>
            <th scope="col" className="w-24 py-2">Điểm</th>
            <th scope="col" className="w-28 py-2">Đang dùng</th>
            <th scope="col" className="w-10 py-2"><span className="sr-only">Xoá</span></th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level) => (
            <tr key={level.name} className="border-b border-slate-100">
              <td className="py-1.5 font-medium text-slate-900">{level.name}</td>
              <td className="py-1.5 pr-3">
                <TextInput
                  key={level.score}
                  type="number"
                  min={1}
                  step="any"
                  aria-label={`Điểm của ${level.name}`}
                  defaultValue={level.score}
                  onBlur={(event) => void changeScore(level, event.target.value)}
                  className="!py-1"
                />
              </td>
              <td className="py-1.5 text-slate-600">{countLevelUsage(level.name, members, sessions)} lượt</td>
              <td className="py-1.5">
                <button type="button" onClick={() => void askRemove(level)} aria-label={`Xoá trình độ ${level.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={add} className="mt-4 flex max-w-lg flex-wrap items-end gap-2">
        <Field label="Tên trình độ mới" className="flex-1 basis-40">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Điểm" className="w-24">
          <TextInput type="number" min={1} step="any" value={score} onChange={(event) => setScore(event.target.value)} />
        </Field>
        <Button type="submit" icon={<Plus size={16} aria-hidden="true" />}>
          Thêm
        </Button>
        {error && (
          <p role="alert" className="basis-full text-sm text-red-700">
            {error}
          </p>
        )}
      </form>

      {removing && (
        <Modal
          title={`Xoá trình độ "${removing.name}"`}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>Huỷ</Button>
              <Button variant="danger" disabled={!replacement} onClick={() => void migrateAndRemove()}>
                Chuyển và xoá
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-slate-700">
            Trình độ này đang được dùng {countLevelUsage(removing.name, members, sessions)} lượt (thành viên và người chơi trong các buổi). Hãy chọn trình độ
            thay thế trước khi xoá.
          </p>
          <Field label="Chuyển sang trình độ">
            <Select value={replacement} onChange={(event) => setReplacement(event.target.value)}>
              <option value="">Chọn trình độ…</option>
              {levels
                .filter((level) => level.name !== removing.name)
                .map((level) => (
                  <option key={level.name} value={level.name}>
                    {level.name} ({level.score})
                  </option>
                ))}
            </Select>
          </Field>
        </Modal>
      )}
    </Card>
  );
}

function BackupSettings() {
  const { members, sessions, settings, replaceAll, setActiveSessionId } = useAppData();
  const { toast, confirm } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const exportAll = () => {
    downloadTextFile(`wwcm_backup_${todayISO()}.json`, exportAllJSON({ members, sessions, settings }), 'application/json;charset=utf-8');
    toast('Đã xuất toàn bộ dữ liệu.');
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      setImportErrors(['Không đọc được file.']);
      return;
    }
    const { data, errors } = parseBackupText(text);
    setImportErrors(errors);
    if (!data) return;
    const ok = await confirm({
      title: 'Ghi đè dữ liệu hiện tại?',
      message:
        `File chứa ${data.members.length} thành viên và ${data.sessions.length} buổi chơi.\n` +
        `Dữ liệu hiện tại (${members.length} thành viên, ${sessions.length} buổi chơi) sẽ bị THAY THẾ hoàn toàn.\n\n` +
        'Nên bấm “Export toàn bộ dữ liệu” để sao lưu trước khi import.',
      confirmLabel: 'Ghi đè và import',
      danger: true,
    });
    if (ok && (await replaceAll(data))) {
      setActiveSessionId(null);
      toast('Đã import dữ liệu.');
    }
  };

  return (
    <Card title="Sao lưu & khôi phục" collapsible storageKey="settings.backup">
      {IS_LOCAL_STORAGE ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ Bản web này lưu dữ liệu <strong>ngay trong trình duyệt bạn đang dùng</strong>. Máy khác hoặc trình duyệt khác sẽ không thấy dữ liệu này, và xoá
          dữ liệu trình duyệt là mất. Hãy Export thường xuyên để sao lưu, và dùng Import để chuyển dữ liệu sang máy khác.
        </p>
      ) : (
        <p className="mb-3 text-sm text-slate-600">
          Dữ liệu được lưu thành file JSON trong thư mục <code className="rounded bg-slate-100 px-1">data/</code> của ứng dụng (members.json, sessions.json,
          settings.json). Bạn có thể sao lưu bằng cách copy thư mục đó, hoặc dùng hai nút dưới đây.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Download size={16} aria-hidden="true" />} onClick={exportAll}>
          Export toàn bộ dữ liệu
        </Button>
        <Button icon={<Upload size={16} aria-hidden="true" />} onClick={() => fileRef.current?.click()}>
          Import dữ liệu
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Chọn file JSON để import" tabIndex={-1} onChange={(event) => void importFile(event)} />
      </div>
      {importErrors.length > 0 && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-semibold">⛔ Không import được – dữ liệu hiện tại được giữ nguyên:</p>
          <ul className="mt-1 list-disc pl-5">
            {importErrors.slice(0, 8).map((message) => (
              <li key={message}>{message}</li>
            ))}
            {importErrors.length > 8 && <li>… và {importErrors.length - 8} lỗi khác.</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="⚙️ Cài đặt" description="Trình độ, giá trị mặc định và sao lưu dữ liệu." />
      <div className="space-y-4">
        <GeneralSettings />
        <LevelSettings />
        <BackupSettings />
      </div>
    </>
  );
}
