#!/usr/bin/env node

/**
 * 🎬 Watchparty Local Automated Stream Runner
 * 
 * Automates playback for scheduled streams (including DRM platforms like iWantTFC)
 * using your local Chrome or Microsoft Edge browser.
 * 
 * Usage:
 *   node tools/autoStream.js --test               # Test immediately with a sample stream (no iWant account needed!)
 *   node tools/autoStream.js --test --time 20:30  # Test the scheduler (starts test stream at 20:30)
 *   node tools/autoStream.js --login              # 1-time login for your friend to save iWant credentials
 *   node tools/autoStream.js --url <URL> --time 20:00 # Schedules iWant stream for 8:00 PM
 *   node tools/autoStream.js --url <URL> --now    # Plays stream immediately
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dedicated profile directory to persist login session & Widevine DRM licenses
const PROFILE_DIR = path.join(__dirname, 'streamer_profile');
if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

// Common Windows paths for Chrome and Edge (both support Widevine DRM)
const BROWSER_PATHS = [
  // Google Chrome
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  // Microsoft Edge
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

function findBrowserPath() {
  for (const bPath of BROWSER_PATHS) {
    if (bPath && fs.existsSync(bPath)) {
      return bPath;
    }
  }
  return null;
}

// Parse command line arguments
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const isLogin = args.includes('--login');
const isNow = args.includes('--now');
const timeArgIndex = args.indexOf('--time');
const scheduledTimeStr = timeArgIndex !== -1 ? args[timeArgIndex + 1] : null;
const urlArgIndex = args.indexOf('--url');
const customUrl = urlArgIndex !== -1 ? args[urlArgIndex + 1] : null;

// Default URLs
const TEST_STREAM_URL = 'https://www.youtube.com/watch?v=5qap5aO4i9A&autoplay=1'; // Live Lo-Fi / Test Stream
const IWANT_LOGIN_URL = 'https://www.iwanttfc.com';

function calculateDelayMs(targetTimeStr) {
  if (!targetTimeStr) return 0;
  const [hours, minutes] = targetTimeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    console.error('❌ Invalid time format! Use HH:MM in 24-hour format, e.g. --time 20:30');
    process.exit(1);
  }

  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  // If the target time already passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
}

function launchBrowser(targetUrl, autoPlay = true) {
  const browserExe = findBrowserPath();
  if (!browserExe) {
    console.error('❌ Could not find Chrome or Edge installed on this machine.');
    console.error('Please ensure Google Chrome or Microsoft Edge is installed.');
    process.exit(1);
  }

  const isEdge = browserExe.toLowerCase().includes('edge');
  const browserName = isEdge ? 'Microsoft Edge' : 'Google Chrome';
  console.log(`\n🚀 Launching ${browserName}...`);
  console.log(`📺 Target URL: ${targetUrl}`);
  console.log(`📁 User Data Profile: ${PROFILE_DIR}\n`);

  const browserArgs = [
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `--app=${targetUrl}`,
  ];

  const browserProcess = spawn(browserExe, browserArgs, {
    detached: true,
    stdio: 'ignore',
  });

  browserProcess.unref();

  console.log('✅ Automated stream runner launched successfully!');
  console.log('💡 Tip: In your Watchparty room, click "Relay Tab" to stream this window directly to all viewers.\n');
}

// -------------------------------------------------------------
// EXECUTION FLOW
// -------------------------------------------------------------

console.log('========================================================');
console.log('🎬 WATCHPARTY LOCAL AUTOMATED STREAM RUNNER');
console.log('========================================================');

if (isLogin) {
  console.log('\n🔑 1-TIME SESSION LOGIN MODE');
  console.log('A browser window will open to iWantTFC.');
  console.log('Please log into your friend\'s iWant account.');
  console.log('All login cookies and credentials will be saved in tools/streamer_profile');
  console.log('Once logged in, you can close the browser window.\n');
  launchBrowser(IWANT_LOGIN_URL, false);
} else if (isTest && !scheduledTimeStr) {
  console.log('\n🧪 INSTANT TEST MODE');
  console.log('Launching test video stream immediately (no iWant account required)...');
  launchBrowser(customUrl || TEST_STREAM_URL, true);
} else if (scheduledTimeStr && !isNow) {
  const targetUrl = customUrl || (isTest ? TEST_STREAM_URL : null);
  if (!targetUrl) {
    console.error('❌ Please specify a stream URL using --url "<stream-link>" or add --test for a sample stream.');
    process.exit(1);
  }

  const delayMs = calculateDelayMs(scheduledTimeStr);
  const targetDate = new Date(Date.now() + delayMs);

  console.log(`\n⏰ STREAM SCHEDULED`);
  console.log(`Target Showtime: ${targetDate.toLocaleTimeString()} (${targetDate.toLocaleDateString()})`);
  console.log(`Stream URL:      ${targetUrl}`);
  console.log(`Waiting for scheduled time...\n`);

  let remaining = delayMs;
  const interval = setInterval(() => {
    remaining -= 1000;
    process.stdout.write(`\r⏳ Showtime countdown: [ ${formatCountdown(remaining)} ] `);

    if (remaining <= 0) {
      clearInterval(interval);
      console.log('\n\n🔔 SHOWTIME REACHED! Launching automated stream now...');
      launchBrowser(targetUrl, true);
    }
  }, 1000);
} else {
  const targetUrl = customUrl || TEST_STREAM_URL;
  console.log('\n▶️ INSTANT PLAYBACK');
  launchBrowser(targetUrl, true);
}
