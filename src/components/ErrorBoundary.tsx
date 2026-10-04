import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Lỗi giao diện:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Đã có lỗi xảy ra</p>
        <p className="mt-2 text-sm text-slate-600">
          Ứng dụng gặp sự cố khi hiển thị trang này. Dữ liệu đã lưu của bạn không bị ảnh hưởng.
        </p>
        <p className="mt-3 break-words rounded-lg bg-slate-100 px-3 py-2 text-left font-mono text-xs text-slate-700">
          {this.state.error.message}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Thử lại
          </button>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Về trang Tổng quan
          </button>
        </div>
      </div>
    );
  }
}
