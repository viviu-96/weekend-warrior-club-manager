import type { AppData, Member, Session, Settings } from '../types';
import { ApiError, DATA_READ_ERROR } from './apiError';
import { localApi } from './localApi';

export { ApiError, DATA_READ_ERROR };

/**
 * true ở bản web tĩnh (GitHub Pages): không có server, dữ liệu lưu trong localStorage của trình duyệt.
 * Bật bằng VITE_STORAGE=local (xem .env.static).
 */
export const IS_LOCAL_STORAGE = import.meta.env.VITE_STORAGE === 'local';

interface RequestOptions {
  method?: string;
  body?: unknown;
  keepalive?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      keepalive: options.keepalive,
    });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Hãy kiểm tra ứng dụng còn đang chạy không.', 0, 'NETWORK');
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(DATA_READ_ERROR, response.status, 'BAD_RESPONSE');
    }
  }
  if (!response.ok) {
    const info = (payload ?? {}) as { message?: unknown; code?: unknown };
    throw new ApiError(
      typeof info.message === 'string' ? info.message : `Lỗi máy chủ (${response.status}).`,
      response.status,
      typeof info.code === 'string' ? info.code : undefined,
    );
  }
  return payload as T;
}

const httpApi = {
  getAll: () => request<unknown>('/data'),
  replaceAll: (data: AppData) => request<AppData>('/data', { method: 'PUT', body: data }),

  getMembers: () => request<Member[]>('/members'),
  createMember: (member: Member) => request<Member>('/members', { method: 'POST', body: member }),
  updateMember: (member: Member) =>
    request<Member>(`/members/${encodeURIComponent(member.id)}`, { method: 'PUT', body: member }),
  deleteMember: (id: string) => request<null>(`/members/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getSessions: () => request<Session[]>('/sessions'),
  getSession: (id: string) => request<Session>(`/sessions/${encodeURIComponent(id)}`),
  createSession: (session: Session) => request<Session>('/sessions', { method: 'POST', body: session }),
  updateSession: (session: Session, keepalive = false) =>
    request<Session>(`/sessions/${encodeURIComponent(session.id)}`, { method: 'PUT', body: session, keepalive }),
  deleteSession: (id: string) => request<null>(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getSettings: () => request<Settings>('/settings'),
  updateSettings: (settings: Settings) => request<Settings>('/settings', { method: 'PUT', body: settings }),
};

export type Api = typeof httpApi;

export const api: Api = IS_LOCAL_STORAGE ? localApi : httpApi;
