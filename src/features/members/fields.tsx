import { Badge, Select } from '../../components/ui';
import { GENDER_LABELS } from '../../services/memberService';
import { getLevelScore, sortLevels } from '../../services/pairingService';
import type { Gender, Level, PlayerType } from '../../types';

interface GenderSelectProps {
  value: Gender | null;
  onChange: (gender: Gender | null) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function GenderSelect({ value, onChange, label = 'Giới tính', disabled, className }: GenderSelectProps) {
  return (
    <Select
      aria-label={label}
      disabled={disabled}
      className={className}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === 'male' || event.target.value === 'female' ? event.target.value : null)}
    >
      <option value="">Giới tính…</option>
      <option value="male">{GENDER_LABELS.male}</option>
      <option value="female">{GENDER_LABELS.female}</option>
    </Select>
  );
}

interface LevelSelectProps {
  value: string | null;
  onChange: (level: string | null) => void;
  levels: Level[];
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** Chọn trình độ theo tên; điểm được tra từ cài đặt, không nhập tay. */
export function LevelSelect({ value, onChange, levels, label = 'Trình độ', disabled, className }: LevelSelectProps) {
  const known = value === null || levels.some((level) => level.name === value);
  return (
    <Select aria-label={label} disabled={disabled} className={className} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Trình độ…</option>
      {!known && value && <option value={value}>{value} (không còn dùng)</option>}
      {sortLevels(levels).map((level) => (
        <option key={level.name} value={level.name}>
          {level.name} ({level.score})
        </option>
      ))}
    </Select>
  );
}

// Dải màu từ trình độ thấp nhất tới cao nhất. Tên trình độ luôn hiển thị kèm, màu chỉ để nhận nhanh.
const LEVEL_COLORS = [
  'bg-slate-100 text-slate-700 ring-slate-300',
  'bg-lime-100 text-lime-900 ring-lime-300',
  'bg-green-100 text-green-900 ring-green-300',
  'bg-teal-100 text-teal-900 ring-teal-300',
  'bg-cyan-100 text-cyan-900 ring-cyan-300',
  'bg-blue-100 text-blue-900 ring-blue-300',
  'bg-indigo-100 text-indigo-900 ring-indigo-300',
  'bg-purple-100 text-purple-900 ring-purple-300',
  'bg-orange-100 text-orange-900 ring-orange-300',
  'bg-red-100 text-red-900 ring-red-300',
];

/** Màu của một trình độ theo thứ hạng của nó trong danh sách trình độ ở Cài đặt. */
function levelColorClass(level: string, levels: Level[]): string | undefined {
  const sorted = sortLevels(levels);
  const rank = sorted.findIndex((item) => item.name === level);
  if (rank < 0) return undefined;
  const position = sorted.length > 1 ? rank / (sorted.length - 1) : 0;
  return LEVEL_COLORS[Math.round(position * (LEVEL_COLORS.length - 1))];
}

export function LevelBadge({ level, levels, showScore = true }: { level: string | null; levels: Level[]; showScore?: boolean }) {
  if (!level) return <Badge tone="red">Chưa có trình độ</Badge>;
  const score = getLevelScore(level, levels);
  return (
    <Badge tone="red" colorClass={levelColorClass(level, levels)}>
      {level}
      {showScore && score > 0 && <span className="ml-1 opacity-70">· {score}</span>}
    </Badge>
  );
}

export function PlayerTypeBadge({ type }: { type: PlayerType }) {
  return type === 'default' ? <Badge tone="green">Mặc định</Badge> : <Badge tone="amber">Vãng lai</Badge>;
}
