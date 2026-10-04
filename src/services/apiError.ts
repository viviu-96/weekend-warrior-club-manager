export const DATA_READ_ERROR = 'Không thể đọc dữ liệu. Vui lòng kiểm tra file dữ liệu.';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
