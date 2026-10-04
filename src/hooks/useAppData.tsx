import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../data/defaultSettings';
import { api, ApiError, DATA_READ_ERROR } from '../services/api';
import { sortSessionsByDate } from '../services/sessionService';
import { parseAppData } from '../services/validationService';
import type { AppData, Member, Session, Settings } from '../types';
import { useFeedback } from './useFeedback';

type LoadStatus = 'loading' | 'ready' | 'error';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface AppDataContextValue extends AppData {
  status: LoadStatus;
  loadError: string | null;
  loadErrorDetails: string[];
  saveState: SaveState;
  reload: () => void;

  addMember: (member: Member) => Promise<boolean>;
  updateMember: (member: Member) => Promise<boolean>;
  deleteMember: (id: string) => Promise<boolean>;

  addSession: (session: Session) => Promise<boolean>;
  /** Cập nhật ngay trên màn hình và tự lưu xuống file sau một nhịp ngắn. */
  updateSession: (session: Session) => void;
  deleteSession: (id: string) => Promise<boolean>;

  updateSettings: (settings: Settings) => Promise<boolean>;
  replaceAll: (data: AppData) => Promise<boolean>;

  /** Buổi đang thao tác ở trang Xếp cặp / Tính tiền. */
  activeSession: Session | null;
  setActiveSessionId: (id: string | null) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

const ACTIVE_SESSION_KEY = 'wwcm.activeSessionId';
const SAVE_DELAY_MS = 400;

function readStoredActiveId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã có lỗi xảy ra.';
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { toast } = useFeedback();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string[]>([]);
  const [data, setData] = useState<AppData>({ members: [], sessions: [], settings: DEFAULT_SETTINGS });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [activeSessionId, setActiveId] = useState<string | null>(readStoredActiveId);
  const [reloadToken, setReloadToken] = useState(0);

  // Hàng đợi lưu buổi chơi: gom các thay đổi liên tiếp, ghi tuần tự để không ghi đè lẫn nhau.
  const pendingSessions = useRef(new Map<string, Session>());
  const saveTimer = useRef<number | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    api
      .getAll()
      .then((raw) => {
        if (cancelled) return;
        const parsed = parseAppData(raw);
        if (!parsed.data) {
          setLoadError(DATA_READ_ERROR);
          setLoadErrorDetails(parsed.errors);
          setStatus('error');
          return;
        }
        setData(parsed.data);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof ApiError && error.code === 'NETWORK' ? error.message : DATA_READ_ERROR);
        setLoadErrorDetails(error instanceof ApiError && error.code !== 'NETWORK' ? [error.message] : []);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const flushSessions = useCallback(
    (keepalive = false) => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const batch = [...pendingSessions.current.values()];
      pendingSessions.current.clear();
      if (batch.length === 0) return saveChain.current;
      saveChain.current = saveChain.current.then(async () => {
        try {
          for (const session of batch) await api.updateSession(session, keepalive);
          if (pendingSessions.current.size === 0) setSaveState('saved');
        } catch (error) {
          setSaveState('error');
          toast(`Không lưu được buổi chơi: ${errorMessage(error)}`, 'error');
        }
      });
      return saveChain.current;
    },
    [toast],
  );

  useEffect(() => {
    const onHide = () => void flushSessions(true);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flushSessions]);

  const run = useCallback(
    async (task: () => Promise<void>, failPrefix: string): Promise<boolean> => {
      try {
        await flushSessions();
        await task();
        return true;
      } catch (error) {
        toast(`${failPrefix}: ${errorMessage(error)}`, 'error');
        return false;
      }
    },
    [flushSessions, toast],
  );

  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveId(id);
    try {
      if (id) window.localStorage.setItem(ACTIVE_SESSION_KEY, id);
      else window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {
      // localStorage chỉ là tiện ích ghi nhớ, không bắt buộc.
    }
  }, []);

  const actions = useMemo(
    () => ({
      reload: () => setReloadToken((token) => token + 1),

      addMember: (member: Member) =>
        run(async () => {
          await api.createMember(member);
          setData((current) => ({ ...current, members: [...current.members, member] }));
        }, 'Không thêm được thành viên'),

      updateMember: (member: Member) =>
        run(async () => {
          await api.updateMember(member);
          setData((current) => ({ ...current, members: current.members.map((m) => (m.id === member.id ? member : m)) }));
        }, 'Không lưu được thành viên'),

      deleteMember: (id: string) =>
        run(async () => {
          await api.deleteMember(id);
          setData((current) => ({ ...current, members: current.members.filter((m) => m.id !== id) }));
        }, 'Không xoá được thành viên'),

      addSession: (session: Session) =>
        run(async () => {
          await api.createSession(session);
          setData((current) => ({ ...current, sessions: [...current.sessions, session] }));
        }, 'Không tạo được buổi chơi'),

      updateSession: (session: Session) => {
        const next = { ...session, updatedAt: new Date().toISOString() };
        setData((current) => ({ ...current, sessions: current.sessions.map((s) => (s.id === next.id ? next : s)) }));
        pendingSessions.current.set(next.id, next);
        setSaveState('saving');
        if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => void flushSessions(), SAVE_DELAY_MS);
      },

      deleteSession: (id: string) => {
        pendingSessions.current.delete(id);
        return run(async () => {
          await api.deleteSession(id);
          setData((current) => ({ ...current, sessions: current.sessions.filter((s) => s.id !== id) }));
        }, 'Không xoá được buổi chơi');
      },

      updateSettings: (settings: Settings) =>
        run(async () => {
          await api.updateSettings(settings);
          setData((current) => ({ ...current, settings }));
        }, 'Không lưu được cài đặt'),

      replaceAll: (next: AppData) =>
        run(async () => {
          await api.replaceAll(next);
          setData(next);
        }, 'Không ghi được dữ liệu'),
    }),
    [run, flushSessions],
  );

  const activeSession = useMemo(() => {
    const found = data.sessions.find((session) => session.id === activeSessionId);
    return found ?? sortSessionsByDate(data.sessions)[0] ?? null;
  }, [data.sessions, activeSessionId]);

  const value: AppDataContextValue = {
    ...data,
    ...actions,
    status,
    loadError,
    loadErrorDetails,
    saveState,
    activeSession,
    setActiveSessionId,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData phải được dùng bên trong AppDataProvider.');
  return context;
}
