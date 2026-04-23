/**
 * Electron Main Process
 * 
 * Entry point for the Schmoozzer automation app.
 * Manages the dashboard window and automation lifecycle.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Orchestrator = require('./orchestrator');
const config = require('./schmoozzer.json');

require('dotenv').config();

// Override config with environment variables
config.supabaseUrl = process.env.SUPABASE_URL || config.supabaseUrl;
config.supabaseKey = process.env.SUPABASE_KEY || config.supabaseKey;
config.commentApiUrl = process.env.COMMENT_API_URL || config.commentApiUrl;
config.dryRun = ['1', 'true', 'yes'].includes(String(process.env.AUTOMATION_DRY_RUN || '').toLowerCase());
config.timing = config.timing || {};
if (process.env.AUTOMATION_ALWAYS_ON !== undefined) {
  config.timing.alwaysOn = ['1', 'true', 'yes'].includes(
    String(process.env.AUTOMATION_ALWAYS_ON || '').toLowerCase()
  );
}

let mainWindow;
let orchestrator;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('renderer/index.html');
}

// IPC handlers — renderer can control the automation
ipcMain.handle('automation:start', async () => {
  if (orchestrator && orchestrator.running) {
    return { status: 'already_running' };
  }

  orchestrator = new Orchestrator(config);
  await orchestrator.init();
  orchestrator.run(); // Don't await — runs in background
  return { status: 'started' };
});

ipcMain.handle('automation:stop', async () => {
  if (orchestrator) {
    await orchestrator.cleanup();
    orchestrator = null;
  }
  return { status: 'stopped' };
});

ipcMain.handle('automation:status', async () => {
  if (!orchestrator) {
    return { status: 'idle', running: false, dryRun: config.dryRun };
  }
  return {
    status: orchestrator.status,
    running: orchestrator.running,
    dryRun: orchestrator.dryRun,
    dailyPlan: orchestrator.timing.dailyPlan,
    currentSession: orchestrator.timing.currentSession,
  };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (orchestrator) await orchestrator.cleanup();
  app.quit();
});
