import type { AppData, Gender, Level, Member, Session } from '../types';
import { createId } from '../utils/id';
import { cleanName, normalizeText } from '../utils/text';
import { getLevelScore } from './pairingService';

export const GENDER_LABELS: Record<Gender, string> = { male: 'Nam', female: 'Nữ' };

export function genderLabel(gender: Gender | null): string {
  return gender ? GENDER_LABELS[gender] : 'Chưa xác định';
}

export interface MemberInput {
  name: string;
  gender: Gender;
  level: string;
  note: string;
}

export function createMember(input: MemberInput): Member {
  return { id: createId('member'), ...input, name: cleanName(input.name), note: input.note.trim() };
}

export interface MemberFilter {
  query: string;
  gender: Gender | 'all';
  level: string | 'all';
}

export function filterMembers(members: Member[], filter: MemberFilter): Member[] {
  const query = normalizeText(filter.query);
  return members.filter(
    (member) =>
      (filter.gender === 'all' || member.gender === filter.gender) &&
      (filter.level === 'all' || member.level === filter.level) &&
      (query === '' || normalizeText(member.name).includes(query)),
  );
}

/** Gợi ý autocomplete: tên bắt đầu bằng từ khoá xếp trước, sau đó tới tên chứa từ khoá. */
export function searchMembers(members: Member[], query: string, limit = 8): Member[] {
  const q = normalizeText(query);
  if (!q) return [];
  const scored = members
    .map((member) => {
      const name = normalizeText(member.name);
      const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : -1;
      return { member, rank };
    })
    .filter((item) => item.rank >= 0);
  scored.sort((a, b) => a.rank - b.rank || a.member.name.localeCompare(b.member.name, 'vi'));
  return scored.slice(0, limit).map((item) => item.member);
}

/** Các thành viên trùng khớp chính xác tên (không phân biệt dấu/hoa thường). */
export function findMembersByName(members: Member[], name: string): Member[] {
  const target = normalizeText(name);
  return target ? members.filter((member) => normalizeText(member.name) === target) : [];
}

export function sortMembers(members: Member[], levels: Level[]): Member[] {
  return [...members].sort(
    (a, b) =>
      getLevelScore(b.level, levels) - getLevelScore(a.level, levels) || a.name.localeCompare(b.name, 'vi'),
  );
}

export type MemberSortKey = 'name' | 'gender' | 'level' | 'note';

export interface MemberSort {
  key: MemberSortKey;
  direction: 'asc' | 'desc';
}

/** Sắp xếp theo một cột; các dòng bằng nhau luôn xếp tiếp theo tên. Trình độ so theo điểm. */
export function sortMembersBy(members: Member[], sort: MemberSort, levels: Level[]): Member[] {
  const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, 'vi');
  const compare: Record<MemberSortKey, (a: Member, b: Member) => number> = {
    name: byName,
    gender: (a, b) => GENDER_LABELS[a.gender].localeCompare(GENDER_LABELS[b.gender], 'vi'),
    level: (a, b) => getLevelScore(a.level, levels) - getLevelScore(b.level, levels),
    note: (a, b) => a.note.localeCompare(b.note, 'vi'),
  };
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...members].sort((a, b) => sign * compare[sort.key](a, b) || byName(a, b));
}

/** Số lần một trình độ đang được dùng bởi thành viên và người chơi trong các buổi. */
export function countLevelUsage(level: string, members: Member[], sessions: Session[]): number {
  const inMembers = members.filter((m) => m.level === level).length;
  const inSessions = sessions.reduce((sum, s) => sum + s.players.filter((p) => p.level === level).length, 0);
  return inMembers + inSessions;
}

/** Xoá một trình độ và chuyển mọi thành viên / người chơi đang dùng nó sang trình độ thay thế. */
export function removeLevelWithMigration(data: AppData, level: string, replacement: string): AppData {
  const swap = <T extends { level: string | null }>(item: T): T => (item.level === level ? { ...item, level: replacement } : item);
  return {
    settings: { ...data.settings, levels: data.settings.levels.filter((item) => item.name !== level) },
    members: data.members.map(swap),
    sessions: data.sessions.map((session) => ({ ...session, players: session.players.map(swap) })),
  };
}

/** Tách danh sách tên dán vào (mỗi dòng một tên, bỏ số thứ tự / gạch đầu dòng). */
export function parseNameList(text: string): string[] {
  return text
    .split(/\r?\n|,|;/)
    .map((line) => cleanName(line.replace(/^\s*(?:\d+[.)\-:]?|[-*•+])\s*/, '')))
    .filter((name) => name !== '');
}
