import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Button } from './components/ui';
import { useAppData } from './hooks/useAppData';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { MembersPage } from './pages/MembersPage';
import { PairingPage } from './pages/PairingPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { SettingsPage } from './pages/SettingsPage';

function LoadErrorScreen() {
  const { loadError, loadErrorDetails, reload } = useAppData();
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-sm" role="alert">
      <p className="text-lg font-semibold text-slate-900">⛔ {loadError}</p>
      {loadErrorDetails.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 rounded-lg bg-slate-100 py-2 pl-7 pr-3 text-sm text-slate-700">
          {loadErrorDetails.slice(0, 10).map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-slate-600">
        Dữ liệu nằm trong thư mục <code className="rounded bg-slate-100 px-1">data/</code> (members.json, sessions.json,
        settings.json). Mỗi file có bản sao lưu gần nhất với đuôi <code className="rounded bg-slate-100 px-1">.bak</code>{' '}
        – bạn có thể dùng nó để khôi phục. Ứng dụng không tự ghi đè lên file đang lỗi.
      </p>
      <div className="mt-4">
        <Button variant="primary" onClick={reload}>
          Thử tải lại
        </Button>
      </div>
    </div>
  );
}

export function App() {
  const { status } = useAppData();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600" role="status">
        Đang tải dữ liệu…
      </div>
    );
  }
  if (status === 'error') return <LoadErrorScreen />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="xep-cap" element={<PairingPage />} />
        <Route path="tinh-tien" element={<PaymentsPage />} />
        <Route path="thanh-vien" element={<MembersPage />} />
        <Route path="lich-su" element={<HistoryPage />} />
        <Route path="lich-su/:sessionId" element={<SessionDetailPage />} />
        <Route path="cai-dat" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
