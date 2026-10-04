import { Search } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { cx, inputClass } from '../../components/ui';
import { GENDER_LABELS, searchMembers } from '../../services/memberService';
import type { Level, Member } from '../../types';
import { LevelBadge } from './fields';

interface Props {
  members: Member[];
  levels: Level[];
  /** memberId đã có trong buổi – hiển thị mờ và không cho chọn lại. */
  excludedIds: Set<string>;
  onSelect: (member: Member) => void;
  disabled?: boolean;
}

/**
 * Ô tìm thành viên. Gõ vài ký tự -> gợi ý kèm giới tính và trình độ.
 * Enter chỉ tự chọn khi có đúng một kết quả hoặc admin đã dùng phím mũi tên,
 * nên các thành viên trùng tên không bao giờ bị chọn nhầm.
 */
export function MemberAutocomplete({ members, levels, excludedIds, onSelect, disabled }: Props) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const results = useMemo(() => searchMembers(members, query), [members, query]);
  const selectable = results.filter((member) => !excludedIds.has(member.id));

  const choose = (member: Member) => {
    if (excludedIds.has(member.id)) return;
    onSelect(member);
    setQuery('');
    setHighlight(-1);
  };

  const move = (step: number) => {
    if (results.length === 0) return;
    let next = highlight;
    for (let i = 0; i < results.length; i += 1) {
      next = (next + step + results.length) % results.length;
      if (!excludedIds.has(results[next]!.id)) break;
    }
    setHighlight(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const picked = highlight >= 0 ? results[highlight] : selectable.length === 1 ? selectable[0] : undefined;
      if (picked) choose(picked);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && query.trim() !== '';

  return (
    <div className="relative">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        role="combobox"
        aria-label="Tìm thành viên theo tên"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder="Gõ tên thành viên, ví dụ: Qu…"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className={cx(inputClass, 'pl-9')}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Không tìm thấy thành viên. Dùng “Thêm vãng lai” nếu là người ngoài CLB.</li>}
          {results.map((member, index) => {
            const added = excludedIds.has(member.id);
            return (
              <li
                key={member.id}
                role="option"
                aria-selected={index === highlight}
                aria-disabled={added}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(member);
                }}
                onMouseEnter={() => !added && setHighlight(index)}
                className={cx(
                  'flex items-center justify-between gap-3 px-3 py-2 text-sm',
                  added ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-900',
                  index === highlight && !added && 'bg-emerald-50',
                )}
              >
                <span>
                  <span className="font-medium">{member.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{GENDER_LABELS[member.gender]}</span>
                  {member.note && <span className="ml-2 text-xs text-slate-400">– {member.note}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {added && <span className="text-xs">Đã thêm</span>}
                  <LevelBadge level={member.level} levels={levels} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
