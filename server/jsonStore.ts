import { promises as fs } from 'node:fs';
import path from 'node:path';

export class DataCorruptError extends Error {
  constructor(public fileName: string) {
    super(`Không thể đọc dữ liệu. Vui lòng kiểm tra file dữ liệu. (${fileName})`);
    this.name = 'DataCorruptError';
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Một file JSON trên đĩa. Mọi thao tác đọc/ghi được xếp hàng tuần tự; ghi theo kiểu
 * atomic (ghi file tạm rồi đổi tên) và giữ bản trước đó ở file .bak để không mất dữ liệu.
 */
export class JsonFile<T> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly seedPath: string,
    private readonly fallback: T,
    private readonly isValid: (value: unknown) => boolean,
  ) {}

  private run<R>(task: () => Promise<R>): Promise<R> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  read(): Promise<T> {
    return this.run(() => this.readNow());
  }

  write(value: T): Promise<T> {
    return this.run(() => this.writeNow(value));
  }

  update(change: (current: T) => T): Promise<T> {
    return this.run(async () => this.writeNow(change(await this.readNow())));
  }

  private parse(text: string, fileName: string): T {
    let value: unknown;
    try {
      value = JSON.parse(text.replace(/^﻿/, ''));
    } catch {
      throw new DataCorruptError(fileName);
    }
    if (!this.isValid(value)) throw new DataCorruptError(fileName);
    return value as T;
  }

  private async readNow(): Promise<T> {
    const fileName = path.basename(this.filePath);
    if (!(await exists(this.filePath))) {
      // File chưa tồn tại -> tạo dữ liệu mặc định từ seed.
      const seed = (await exists(this.seedPath))
        ? this.parse(await fs.readFile(this.seedPath, 'utf8'), path.basename(this.seedPath))
        : this.fallback;
      return this.writeNow(seed);
    }
    return this.parse(await fs.readFile(this.filePath, 'utf8'), fileName);
  }

  private async writeNow(value: T): Promise<T> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    if (await exists(this.filePath)) await fs.copyFile(this.filePath, `${this.filePath}.bak`);
    await fs.rename(tempPath, this.filePath);
    return value;
  }
}
