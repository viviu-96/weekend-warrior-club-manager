import { CircleDollarSign, History, LayoutDashboard, Settings as SettingsIcon, Swords, Users, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppData, type SaveState } from '../hooks/useAppData';
import { ErrorBoundary } from './ErrorBoundary';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/xep-cap', label: 'Xếp cặp', icon: Swords },
  { to: '/tinh-tien', label: 'Tính tiền', icon: CircleDollarSign },
  { to: '/thanh-vien', label: 'Thành viên', icon: Users },
  { to: '/lich-su', label: 'Lịch sử', icon: History },
  { to: '/cai-dat', label: 'Cài đặt', icon: SettingsIcon },
];

const SAVE_LABELS: Record<SaveState, string> = {
  idle: 'Tự động lưu',
  saving: 'Đang lưu…',
  saved: '✓ Đã lưu',
  error: '⛔ Lưu lỗi',
};

function SaveIndicator() {
  const { saveState } = useAppData();
  return (
    <span aria-live="polite" className={cx('inline-flex items-center gap-1.5 text-xs font-medium', saveState === 'error' ? 'text-red-200' : 'text-emerald-100')}>
      <span
        aria-hidden="true"
        className={cx(
          'h-1.5 w-1.5 rounded-full',
          saveState === 'error' ? 'bg-red-300' : saveState === 'saving' ? 'animate-pulse bg-amber-300' : 'bg-emerald-300',
        )}
      />
      {SAVE_LABELS[saveState]}
    </span>
  );
}

export function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar – desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-gradient-to-b from-emerald-800 via-emerald-900 to-emerald-950 text-white md:flex print:hidden">
        <div className="flex items-center gap-3 px-5 py-5">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-xl shadow-inner ring-1 ring-white/20">
            🏸
          </span>
          <div>
            <p className="text-base font-bold leading-tight">Weekend Warrior</p>
            <p className="text-xs text-emerald-200">Badminton Club Manager</p>
          </div>
        </div>
        <nav aria-label="Điều hướng chính" className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive ? 'bg-white text-emerald-900 shadow-md shadow-emerald-950/30' : 'text-emerald-50 hover:translate-x-0.5 hover:bg-white/10',
                )
              }
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4">
          <SaveIndicator />
        </div>
      </aside>

      {/* Thanh tiêu đề – mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-gradient-to-r from-emerald-800 to-emerald-900 px-4 py-3 text-white shadow-md md:hidden print:hidden">
        <p className="text-sm font-bold">🏸 Weekend Warrior</p>
        <SaveIndicator />
      </header>

      <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-5 md:px-8 md:pb-10 md:pt-6 print:p-0">
        <div className="mx-auto max-w-6xl">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Thanh điều hướng dưới – mobile */}
      <nav aria-label="Điều hướng chính" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgb(15_23_42/0.06)] backdrop-blur md:hidden print:hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cx(
                'flex flex-col items-center gap-0.5 px-0.5 py-1.5 text-[10px] font-medium leading-tight transition-colors',
                isActive ? 'text-emerald-800' : 'text-slate-600',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-emerald-100')}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
