import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, cx, Modal } from '../components/ui';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const TOAST_TONES: Record<ToastTone, string> = {
  success: 'bg-emerald-800 text-white',
  error: 'bg-red-700 text-white',
  info: 'bg-slate-800 text-white',
};
const TOAST_PREFIX: Record<ToastTone, string> = { success: '✓', error: '⛔', info: 'ℹ' };

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 print:hidden">
        {toasts.map((item) => (
          <div key={item.id} className={cx('pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg', TOAST_TONES[item.tone])}>
            <span aria-hidden="true">{TOAST_PREFIX[item.tone]} </span>
            {item.message}
          </div>
        ))}
      </div>
      {pending && (
        <Modal
          title={pending.title}
          onClose={() => settle(false)}
          footer={
            <>
              <Button onClick={() => settle(false)}>Huỷ</Button>
              <Button variant={pending.danger ? 'danger' : 'primary'} data-autofocus onClick={() => settle(true)}>
                {pending.confirmLabel ?? 'Xác nhận'}
              </Button>
            </>
          }
        >
          <p className="whitespace-pre-line text-sm text-slate-700">{pending.message}</p>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback phải được dùng bên trong FeedbackProvider.');
  return context;
}
