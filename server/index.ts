import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataCorruptError, JsonFile } from './jsonStore';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.WWCM_DATA_DIR ? path.resolve(process.env.WWCM_DATA_DIR) : path.join(rootDir, 'data');
const seedDir = path.join(rootDir, 'src', 'data', 'seed');
const distDir = path.join(rootDir, 'dist');
const isProd = process.argv.includes('--prod');
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || 'localhost';

type Entity = { id: string } & Record<string, unknown>;
type SettingsData = { levels: unknown[] } & Record<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isEntity = (value: unknown): value is Entity => isObject(value) && typeof value.id === 'string' && value.id !== '';
const isEntityList = (value: unknown): value is Entity[] => Array.isArray(value) && value.every(isEntity);
const isSettings = (value: unknown): value is SettingsData => isObject(value) && Array.isArray(value.levels);

const stores = {
  members: new JsonFile<Entity[]>(path.join(dataDir, 'members.json'), path.join(seedDir, 'members.json'), [], isEntityList),
  sessions: new JsonFile<Entity[]>(path.join(dataDir, 'sessions.json'), path.join(seedDir, 'sessions.json'), [], isEntityList),
  settings: new JsonFile<SettingsData>(
    path.join(dataDir, 'settings.json'),
    path.join(seedDir, 'settings.json'),
    { levels: [] },
    isSettings,
  ),
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function requireEntity(body: unknown): Entity {
  if (!isEntity(body)) throw new HttpError(400, 'Dữ liệu gửi lên không hợp lệ (thiếu id).');
  return body;
}

function collectionRouter(store: JsonFile<Entity[]>, label: string): Router {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    res.json(await store.read());
  });

  router.get('/:id', async (req, res) => {
    const item = (await store.read()).find((entry) => entry.id === req.params.id);
    if (!item) throw new HttpError(404, `Không tìm thấy ${label}.`);
    res.json(item);
  });

  router.post('/', async (req, res) => {
    const item = requireEntity(req.body);
    await store.update((items) => {
      if (items.some((entry) => entry.id === item.id)) throw new HttpError(409, `${label} đã tồn tại.`);
      return [...items, item];
    });
    res.status(201).json(item);
  });

  router.put('/:id', async (req, res) => {
    const item = requireEntity(req.body);
    if (item.id !== req.params.id) throw new HttpError(400, 'Id không khớp.');
    await store.update((items) => {
      if (!items.some((entry) => entry.id === item.id)) throw new HttpError(404, `Không tìm thấy ${label}.`);
      return items.map((entry) => (entry.id === item.id ? item : entry));
    });
    res.json(item);
  });

  router.delete('/:id', async (req, res) => {
    await store.update((items) => items.filter((entry) => entry.id !== req.params.id));
    res.json(null);
  });

  return router;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

app.use('/api/members', collectionRouter(stores.members, 'thành viên'));
app.use('/api/sessions', collectionRouter(stores.sessions, 'buổi chơi'));

app.get('/api/settings', async (_req, res) => {
  res.json(await stores.settings.read());
});

app.put('/api/settings', async (req, res) => {
  if (!isSettings(req.body)) throw new HttpError(400, 'Cài đặt không hợp lệ.');
  res.json(await stores.settings.write(req.body));
});

// Toàn bộ dữ liệu – dùng khi mở ứng dụng, backup và restore.
app.get('/api/data', async (_req, res) => {
  const [members, sessions, settings] = await Promise.all([
    stores.members.read(),
    stores.sessions.read(),
    stores.settings.read(),
  ]);
  res.json({ members, sessions, settings });
});

app.put('/api/data', async (req, res) => {
  const body: unknown = req.body;
  if (!isObject(body) || !isEntityList(body.members) || !isEntityList(body.sessions) || !isSettings(body.settings)) {
    throw new HttpError(400, 'Dữ liệu import không hợp lệ.');
  }
  await stores.settings.write(body.settings);
  await stores.members.write(body.members);
  await stores.sessions.write(body.sessions);
  res.json({ members: body.members, sessions: body.sessions, settings: body.settings });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Không tìm thấy API.' });
});

if (isProd) {
  if (!existsSync(path.join(distDir, 'index.html'))) {
    console.error('Chưa có bản build. Hãy chạy "npm run build" trước khi "npm start".');
    process.exit(1);
  }
  app.use(express.static(distDir));
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: rootDir, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof DataCorruptError) {
    res.status(500).json({ code: 'DATA_CORRUPT', message: error.message });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ message: 'JSON gửi lên không hợp lệ.' });
    return;
  }
  console.error(error);
  res.status(500).json({ message: 'Lỗi máy chủ. Vui lòng thử lại.' });
});

app.listen(port, host, () => {
  console.log(`\n🏸 Weekend Warrior – Badminton Club Manager`);
  console.log(`   Đang chạy tại: http://${host}:${port} (${isProd ? 'production' : 'development'})`);
  console.log(`   Dữ liệu lưu tại: ${dataDir}\n`);
});
