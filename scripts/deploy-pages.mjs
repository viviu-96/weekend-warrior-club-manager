// Build bản web tĩnh và đăng lên nhánh gh-pages (GitHub Pages phục vụ nhánh này).
// Chạy: npm run deploy
import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm' });
const read = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const remote = read(['remote', 'get-url', 'origin']);
const source = `${read(['branch', '--show-current'])}@${read(['rev-parse', '--short', 'HEAD'])}`;

run('npm', ['run', 'build:static']);

// GitHub Pages trả 404.html cho đường dẫn không có file thật -> ứng dụng vẫn mở đúng trang khi tải lại.
copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
writeFileSync(path.join(dist, '.nojekyll'), '');

// dist/ là thư mục build, không nằm trong git: tạo một repo tạm chỉ chứa bản build rồi đẩy lên gh-pages.
rmSync(path.join(dist, '.git'), { recursive: true, force: true });
run('git', ['init', '-q', '-b', 'gh-pages'], dist);
run('git', ['add', '-A'], dist);
run('git', ['commit', '-q', '-m', `Deploy ${source}`], dist);
run('git', ['push', '--force', remote, 'gh-pages'], dist);
rmSync(path.join(dist, '.git'), { recursive: true, force: true });

console.log(`\nĐã đăng bản build của ${source} lên nhánh gh-pages.`);
