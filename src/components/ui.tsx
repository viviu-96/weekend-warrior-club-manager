import { ChevronDown, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from 'react';
import type { ValidationIssue } from '../types';
import { groupThousands, parseMoneyInput } from '../utils/format';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:bg-slate-100 disabled:text-slate-500';

// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 border-transparent shadow-sm shadow-emerald-900/25',
  secondary: 'bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 border-slate-300',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 border-transparent',
  danger: 'bg-white text-red-700 hover:bg-red-50 border-red-300',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border font-medium transition active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

const COLLAPSE_PREFIX = 'wwcm.collapsed.';

/** Trạng thái thu gọn của một mục, ghi nhớ theo `storageKey` trên trình duyệt này. */
function useCollapse(storageKey: string | undefined, defaultOpen: boolean) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const stored = window.localStorage.getItem(COLLAPSE_PREFIX + storageKey);
      return stored === null ? defaultOpen : stored === 'open';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(COLLAPSE_PREFIX + storageKey, next ? 'open' : 'closed');
    } catch {
      // không ghi nhớ được cũng không sao
    }
  };
  return [open, toggle] as const;
}

interface CardProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Cho phép thu gọn / mở rộng bằng cách bấm vào tiêu đề. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Khoá ghi nhớ trạng thái thu gọn giữa các lần mở trang. */
  storageKey?: string;
}

export function Card({ title, actions, children, className, collapsible = false, defaultOpen = true, storageKey }: CardProps) {
  const bodyId = useId();
  const [open, toggle] = useCollapse(collapsible ? storageKey : undefined, defaultOpen);
  const expanded = !collapsible || open;
  return (
    <section className={cx('animate-rise rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/5', className)}>
      {(title || actions) && (
        <header className={cx('flex flex-wrap items-center justify-between gap-2 px-4 py-3', expanded && 'border-b border-slate-100')}>
          <h2 className="min-w-0 text-sm font-semibold text-slate-900">
            {collapsible ? (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-controls={bodyId}
                title={open ? 'Thu gọn' : 'Mở rộng'}
                className="-mx-1.5 -my-1 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-slate-100 print:hidden"
              >
                <ChevronDown size={16} aria-hidden="true" className={cx('shrink-0 text-slate-500 transition-transform', !open && '-rotate-90')} />
                <span>{title}</span>
              </button>
            ) : (
              title
            )}
            {collapsible && <span className="hidden print:inline">{title}</span>}
          </h2>
          {actions && expanded && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div id={bodyId} className={cx('p-4', !expanded && 'hidden print:block')}>
        {children}
      </div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="animate-rise rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">{icon}</div>}
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
};

/** `colorClass` thay cho bảng màu của `tone` (dùng cho badge trình độ). */
export function Badge({ tone = 'neutral', colorClass, children }: { tone?: Tone; colorClass?: string; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', colorClass ?? BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function TextInput(props: ComponentProps<'input'>) {
  return <input type="text" {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={cx(inputClass, 'pr-8', props.className)} />;
}

interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Ô nhập tiền: chỉ nhận chữ số, tự hiển thị dấu chấm phân cách (120.000). */
export function MoneyInput({ value, onChange, label, disabled, className }: MoneyInputProps) {
  return (
    <div className={cx('relative', className)}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        disabled={disabled}
        value={value > 0 ? groupThousands(value) : ''}
        placeholder="0"
        onChange={(event) => onChange(parseMoneyInput(event.target.value))}
        className={cx(inputClass, 'pr-7 text-right tabular-nums')}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-slate-500">₫</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-sm text-slate-800', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cx(
          'relative h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-600 peer-focus-visible:ring-offset-2',
          checked ? 'bg-emerald-700' : 'bg-slate-300',
        )}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span>
        {label}
        <span className="ml-1 text-xs font-medium text-slate-500">{checked ? '(Bật)' : '(Tắt)'}</span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ title, onClose, children, footer, wide }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input, select, textarea') ??
      panel?.querySelector<HTMLElement>('button');
    focusable?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 print:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('animate-pop flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const block = (items: ValidationIssue[], title: string, classes: string) =>
    items.length > 0 && (
      <div role="alert" className={cx('rounded-lg border px-3 py-2 text-sm', classes)}>
        <p className="font-semibold">{title}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {items.map((issue, index) => (
            <li key={`${issue.code}-${issue.playerId ?? ''}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="space-y-2 print:hidden">
      {block(errors, `⛔ Cần sửa (${errors.length})`, 'border-red-200 bg-red-50 text-red-900')}
      {block(warnings, `⚠ Lưu ý (${warnings.length})`, 'border-amber-200 bg-amber-50 text-amber-900')}
    </div>
  );
}

// ---------------------------------------------------------------------------

const AVATAR_TONES = {
  male: 'bg-sky-100 text-sky-900 ring-sky-200',
  female: 'bg-pink-100 text-pink-700 ring-pink-200',
  unknown: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** Hình tròn chữ cái đầu của tên; màu theo giới tính (giới tính luôn được ghi bằng chữ bên cạnh). */
export function Avatar({ name, gender, size = 'md' }: { name: string; gender: 'male' | 'female' | null; size?: 'sm' | 'md' }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initial = (words[words.length - 1]?.[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-inset',
        size === 'sm' ? 'h-6 w-6 text-[11px]' : 'h-8 w-8 text-sm',
        AVATAR_TONES[gender ?? 'unknown'],
      )}
    >
      {initial}
    </span>
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  /** Mô tả cho trình đọc màn hình, ví dụ "Đã thu". */
  label: string;
  /** Nền tối (thẻ nổi bật màu xanh) dùng thanh sáng. */
  onDark?: boolean;
  className?: string;
}

/** Thanh tiến độ một màu trên nền trung tính. Con số luôn được ghi bằng chữ bên cạnh. */
export function ProgressBar({ value, max, label, onDark = false, className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const percent = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cx('h-2 overflow-hidden rounded-full', onDark ? 'bg-white/25' : 'bg-slate-200', className)}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-500 ease-out', onDark ? 'bg-white' : 'bg-emerald-600')}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function percentOf(value: number, max: number): number {
  return max > 0 ? Math.round(Math.min(Math.max(value / max, 0), 1) * 100) : 0;
}
