import seedMembers from '../data/seed/members.json';
import seedSessions from '../data/seed/sessions.json';
import seedSettings from '../data/seed/settings.json';
import type { AppData, Member, Session, Settings } from '../types';
import type { Api } from './api';
import { ApiError, DATA_READ_ERROR } from './apiError';

const KEYS = {
  members: 'wwcm.data.members',
  sessions: 'wwcm.data.sessions',
  settings: 'wwcm.data.settings',
} as const;

// Dữ liệu mẫu được kiểm tra lại bằng parseAppData khi ứng dụng tải, nên ở đây chỉ cần ép kiểu.
const SEEDS = {
  members: seedMembers as unknown as Member[],
  sessions: seedSessions as unknown as Session[],
  settings: seedSettings as unknown as Settings,
};

function write<T>(key: string, value: T): T {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new ApiError('Trình duyệt không lưu được dữ liệu (hết dung lượng hoặc đang chặn lưu trữ).', 507, 'STORAGE');
  }
  return value;
}

/** Đọc một khoá; chưa có thì khởi tạo từ dữ liệu mẫu. Dữ liệu hỏng không bị ghi đè. */
function read<T>(key: string, seed: T): T {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    throw new ApiError('Trình duyệt đang chặn lưu trữ nên không đọc được dữ liệu.', 500, 'STORAGE');
  }
  if (raw === null) return write(key, seed);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(DATA_READ_ERROR, 500, 'DATA_CORRUPT');
  }
}

const members = () => read(KEYS.members, SEEDS.members);
const sessions = () => read(KEYS.sessions, SEEDS.sessions);
const settings = () => read(KEYS.settings, SEEDS.settings);

function find<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new ApiError(`Không tìm thấy ${label}.`, 404);
  return item;
}

function insert<T extends { id: string }>(key: string, items: T[], item: T, label: string): T {
  if (items.some((entry) => entry.id === item.id)) throw new ApiError(`${label} đã tồn tại.`, 409);
  write(key, [...items, item]);
  return item;
}

function replace<T extends { id: string }>(key: string, items: T[], item: T, label: string): T {
  find(items, item.id, label);
  write(
    key,
    items.map((entry) => (entry.id === item.id ? item : entry)),
  );
  return item;
}

function remove<T extends { id: string }>(key: string, items: T[], id: string): null {
  write(
    key,
    items.filter((entry) => entry.id !== id),
  );
  return null;
}

/** Xoá toàn bộ dữ liệu trong trình duyệt; lần tải sau sẽ nạp lại dữ liệu mẫu. */
export function resetLocalData(): void {
  for (const key of Object.values(KEYS)) window.localStorage.removeItem(key);
}

/** Cùng giao diện với API của server nhưng lưu trong localStorage – dùng cho bản web tĩnh. */
export const localApi: Api = {
  getAll: async () => ({ members: members(), sessions: sessions(), settings: settings() }),
  replaceAll: async (data: AppData) => {
    write(KEYS.settings, data.settings);
    write(KEYS.members, data.members);
    write(KEYS.sessions, data.sessions);
    return data;
  },

  getMembers: async () => members(),
  createMember: async (member) => insert(KEYS.members, members(), member, 'Thành viên'),
  updateMember: async (member) => replace(KEYS.members, members(), member, 'thành viên'),
  deleteMember: async (id) => remove(KEYS.members, members(), id),

  getSessions: async () => sessions(),
  getSession: async (id) => find(sessions(), id, 'buổi chơi'),
  createSession: async (session) => insert(KEYS.sessions, sessions(), session, 'Buổi chơi'),
  updateSession: async (session) => replace(KEYS.sessions, sessions(), session, 'buổi chơi'),
  deleteSession: async (id) => remove(KEYS.sessions, sessions(), id),

  getSettings: async () => settings(),
  updateSettings: async (next) => write(KEYS.settings, next),
};
