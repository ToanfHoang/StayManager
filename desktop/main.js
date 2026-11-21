'use strict';
/**
 * StayManager – ứng dụng máy tính (Electron).
 * Chạy máy chủ StayManager ngay trong app (chỉ nghe 127.0.0.1) + mở cửa sổ giao diện.
 * Dữ liệu (SQLite, ảnh, sao lưu) nằm trong thư mục người dùng: %APPDATA%\StayManager
 */
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');

const PREFERRED_PORT = 47100; // cố định để phiên đăng nhập được giữ giữa các lần mở app
let mainWindow = null;
let server = null; // module máy chủ (dist/server.js)
let appUrl = '';
let quitting = false;

// Chạy thử với thư mục dữ liệu riêng (không đụng dữ liệu thật): STAYMANAGER_USER_DATA=<thư mục>
if (process.env.STAYMANAGER_USER_DATA) app.setPath('userData', process.env.STAYMANAGER_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(main);
}

const serverRoot = () => (app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, 'server'));

/** Nhật ký chạy app: %APPDATA%\StayManager\logs\app.log (giúp tìm lỗi khi cần) */
function setupLogging(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'app.log');
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) fs.renameSync(file, path.join(dir, 'app.old.log'));
  } catch { /* bỏ qua */ }
  const write = (level, args) => {
    const line = `[${new Date().toISOString()}] ${level} ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
    try { fs.appendFileSync(file, line); } catch { /* bỏ qua */ }
  };
  for (const level of ['log', 'info', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => { write(level.toUpperCase(), args); orig(...args); };
  }
  process.on('uncaughtException', (e) => console.error('uncaughtException', e));
  process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
}

/** Khóa bí mật riêng của máy này – tạo 1 lần, lưu trong config.json */
function loadSecrets(dir) {
  const file = path.join(dir, 'config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* lần đầu */ }
  let changed = false;
  if (!cfg.jwtSecret) { cfg.jwtSecret = crypto.randomBytes(48).toString('base64'); changed = true; }
  if (!cfg.encryptionKey) { cfg.encryptionKey = crypto.randomBytes(32).toString('base64'); changed = true; }
  if (changed) fs.writeFileSync(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfg;
}

const portFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });

const isAppUrl = (url) => url === appUrl || url.startsWith(appUrl + '/');

function openExternal(url) {
  if (/^(https?:|mailto:|tel:|zalo:)/i.test(url)) shell.openExternal(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'StayManager – Quản lý nhà trọ',
    backgroundColor: '#f9fafb',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  const wc = mainWindow.webContents;
  // Trang in hóa đơn / hợp đồng mở cửa sổ mới trong app; liên kết ngoài (Zalo…) mở bằng trình duyệt
  wc.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1000, height: 860, autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png') } };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      openExternal(url);
    }
  });
  // Phím tắt hữu ích: F5 tải lại, Ctrl +/- phóng to thu nhỏ, F12 công cụ kiểm tra lỗi
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5') { wc.reload(); e.preventDefault(); }
    else if (input.key === 'F12') { wc.toggleDevTools(); e.preventDefault(); }
    else if (input.control && (input.key === '=' || input.key === '+')) { wc.setZoomLevel(wc.getZoomLevel() + 0.5); e.preventDefault(); }
    else if (input.control && input.key === '-') { wc.setZoomLevel(wc.getZoomLevel() - 0.5); e.preventDefault(); }
    else if (input.control && input.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => (mainWindow = null));
  mainWindow.loadURL(appUrl);
}

async function shutdown() {
  if (server) {
    try { await server.stopServer(); } catch (e) { console.error('Lỗi khi tắt máy chủ', e); }
    server = null;
  }
}

async function main() {
  Menu.setApplicationMenu(null);
  const userData = app.getPath('userData');
  setupLogging(path.join(userData, 'logs'));
  console.log(`StayManager ${app.getVersion()} khởi động – dữ liệu: ${userData}`);

  const secrets = loadSecrets(userData);
  const root = serverRoot();
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Cấu hình máy chủ – PHẢI đặt trước khi nạp module máy chủ
  Object.assign(process.env, {
    NODE_ENV: 'production',
    DATABASE_URL: 'file:' + path.join(dataDir, 'staymanager.db').replace(/\\/g, '/'),
    DATA_DIR: dataDir,
    UPLOAD_DIR: path.join(userData, 'uploads'),
    MIGRATIONS_DIR: path.join(root, 'backend', 'prisma', 'migrations'),
    FRONTEND_DIST: path.join(root, 'frontend'),
    JWT_SECRET: secrets.jwtSecret,
    JWT_EXPIRES_IN: '30d',
    APP_ENCRYPTION_KEY: secrets.encryptionKey,
    HOST: '127.0.0.1',
    SCHEDULER_ENABLED: 'true',
  });

  try {
    const port = (await portFree(PREFERRED_PORT)) ? PREFERRED_PORT : 0;
    process.env.CORS_ORIGIN = `http://127.0.0.1:${port || PREFERRED_PORT}`;
    server = require(path.join(root, 'backend', 'dist', 'server.js'));
    server.setRestartHandler(async () => {
      // Khôi phục dữ liệu: tắt máy chủ rồi mở lại app để áp dụng bản sao lưu
      quitting = true;
      await shutdown();
      app.relaunch();
      app.exit(0);
    });
    const started = await server.startServer({ port, host: '127.0.0.1' });
    appUrl = `http://127.0.0.1:${started.port}`;
    createWindow();
  } catch (e) {
    console.error('Không khởi động được StayManager', e);
    dialog.showErrorBox(
      'StayManager không khởi động được',
      `${e && e.message ? e.message : e}\n\nNhật ký lỗi: ${path.join(userData, 'logs', 'app.log')}`,
    );
    app.exit(1);
  }
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  shutdown().finally(() => app.exit(0));
});
