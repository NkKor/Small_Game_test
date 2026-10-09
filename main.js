/* =========================================================================
 * PixelCraft — Electron main process
 * Оборачивает игру (index.html + game.js) в нативное окно.
 * Обеспечивает корректный захват мыши (Pointer Lock) в активном режиме.
 * ========================================================================= */
'use strict';

const { app, BrowserWindow, shell } = require('electron');

// Только один экземпляр приложения
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#87ceeb',
    title: 'PixelCraft',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // не «замораживать» игру при потере фокуса
      spellcheck: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.setMenu(null);
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());

  // Разрешаем Pointer Lock (и прочие запросы) без системных диалогов
  const ses = win.webContents.session;
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
  ses.setPermissionCheckHandler(() => true);

  // F11 — полный экран, F12 — DevTools, Ctrl+R — перезапуск
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    else if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
    else if (input.control && input.key.toLowerCase() === 'r') { win.webContents.reload(); event.preventDefault(); }
  });

  // Внешние ссылки — в системном браузере, всплывающие окна не открываем
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
