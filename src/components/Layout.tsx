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
  idle: '',
  saving: 'Đang lưu…',
  saved: '✓ Đã lưu',
  error: '⛔ Lưu lỗi',
};

function SaveIndicator() {
  const { saveState } = useAppData();
  return (
    <span aria-live="polite" className={cx('text-xs font-medium', saveState === 'error' ? 'text-red-200' : 'text-emerald-100')}>
      {SAVE_LABELS[saveState]}
    </span>
  );
}

export function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar – desktop */}
      <aside className="hidden w-60 shrink-0 flex-col bg-emerald-900 text-white md:flex print:hidden">
        <div className="px-5 py-5">
          <p className="text-lg font-bold leading-tight">🏸 Weekend Warrior</p>
          <p className="text-xs text-emerald-200">Badminton Club Manager</p>
        </div>
        <nav aria-label="Điều hướng chính" className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-white text-emerald-900' : 'text-emerald-50 hover:bg-emerald-800',
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
      <header className="sticky top-0 z-30 flex items-center justify-between bg-emerald-900 px-4 py-3 text-white md:hidden print:hidden">
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
      <nav aria-label="Điều hướng chính" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white md:hidden print:hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cx(
                'flex flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] font-medium leading-tight',
                isActive ? 'border-t-2 border-emerald-700 text-emerald-800' : 'border-t-2 border-transparent text-slate-600',
              )
            }
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
