import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, cx, EmptyState, PageHeader, Select, TextInput } from '../components/ui';
import { LevelBadge } from '../features/members/fields';
import { MemberFormModal } from '../features/members/MemberFormModal';
import { useAppData } from '../hooks/useAppData';
import { useFeedback } from '../hooks/useFeedback';
import {
  createMember,
  filterMembers,
  GENDER_LABELS,
  sortMembersBy,
  type MemberFilter,
  type MemberSort,
  type MemberSortKey,
} from '../services/memberService';
import { sortLevels } from '../services/pairingService';
import type { Member } from '../types';

export function MembersPage() {
  const { members, settings, addMember, updateMember, deleteMember } = useAppData();
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<MemberFilter>({ query: '', gender: 'all', level: 'all' });
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const levels = settings.levels;

  const [sort, setSort] = useState<MemberSort>({ key: 'level', direction: 'desc' });
  const visible = sortMembersBy(filterMembers(members, filter), sort, levels);

  const sortHeader = (key: MemberSortKey, label: string, className?: string) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={cx('py-2 pr-2', className)}>
        <button
          type="button"
          onClick={() => setSort({ key, direction: active && sort.direction === 'asc' ? 'desc' : 'asc' })}
          title={`Sắp xếp theo ${label.toLowerCase()}`}
          className={cx('-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold hover:bg-slate-100', active && 'text-emerald-800')}
        >
          {label}
          <Icon size={13} aria-hidden="true" className={active ? '' : 'text-slate-400'} />
        </button>
      </th>
    );
  };

  const remove = async (member: Member) => {
    const ok = await confirm({
      title: 'Xoá thành viên',
      message: `Xoá ${member.name} khỏi danh sách thành viên?\nCác buổi chơi cũ vẫn giữ nguyên thông tin của người này.`,
      confirmLabel: 'Xoá',
      danger: true,
    });
    if (ok && (await deleteMember(member.id))) toast(`Đã xoá ${member.name}.`);
  };

  return (
    <>
      <PageHeader
        title="👥 Thành viên"
        description={`${members.length} thành viên trong câu lạc bộ.`}
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setEditing('new')}>
            Thêm thành viên
          </Button>
        }
      />

      <Card>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_9rem_11rem]">
          <TextInput
            aria-label="Tìm thành viên theo tên"
            placeholder="Tìm theo tên…"
            className="col-span-2 sm:col-span-1"
            value={filter.query}
            onChange={(event) => setFilter({ ...filter, query: event.target.value })}
          />
          <Select aria-label="Lọc theo giới tính" value={filter.gender} onChange={(event) => setFilter({ ...filter, gender: event.target.value as MemberFilter['gender'] })}>
            <option value="all">Mọi giới tính</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
          </Select>
          <Select aria-label="Lọc theo trình độ" value={filter.level} onChange={(event) => setFilter({ ...filter, level: event.target.value })}>
            <option value="all">Mọi trình độ</option>
            {sortLevels(levels).map((level) => (
              <option key={level.name} value={level.name}>
                {level.name}
              </option>
            ))}
          </Select>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title={members.length === 0 ? 'Chưa có thành viên' : 'Không có thành viên phù hợp'}
            description={members.length === 0 ? 'Thêm thành viên để dùng tính năng tự điền khi xếp cặp.' : 'Thử đổi từ khoá hoặc bộ lọc.'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                <th scope="col" className="w-10 py-2 pr-2 font-semibold">STT</th>
                {sortHeader('name', 'Tên')}
                {sortHeader('gender', 'Giới tính')}
                {sortHeader('level', 'Trình độ')}
                {sortHeader('note', 'Ghi chú', 'hidden sm:table-cell')}
                <th scope="col" className="w-20 py-2 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((member, index) => (
                <tr key={member.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-2 tabular-nums text-slate-500">{index + 1}</td>
                  <td className="py-2 pr-2">
                    <span className="font-semibold text-slate-900">{member.name}</span>
                    {member.note && <span className="block text-xs text-slate-500 sm:hidden">{member.note}</span>}
                  </td>
                  <td className="py-2 pr-2 text-slate-700">{GENDER_LABELS[member.gender]}</td>
                  <td className="py-2 pr-2">
                    <LevelBadge level={member.level} levels={levels} />
                  </td>
                  <td className="hidden py-2 pr-2 text-slate-600 sm:table-cell">{member.note}</td>
                  <td className="py-1 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setEditing(member)} aria-label={`Sửa ${member.name}`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-200">
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => void remove(member)} aria-label={`Xoá ${member.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700">
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing === 'new' && (
        <MemberFormModal
          title="Thêm thành viên"
          levels={levels}
          members={members}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            const ok = await addMember(createMember(input));
            if (ok) toast(`Đã thêm ${input.name.trim()}.`);
            return ok;
          }}
        />
      )}
      {editing && editing !== 'new' && (
        <MemberFormModal
          title="Sửa thành viên"
          levels={levels}
          members={members}
          editingId={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            const ok = await updateMember({ ...editing, ...input, name: input.name.trim(), note: input.note.trim() });
            if (ok) toast('Đã lưu thay đổi.');
            return ok;
          }}
        />
      )}
    </>
  );
}
