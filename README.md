# 🎬 Watchparty Livestream Platform

A private, minimalist livestreaming platform built for watchparties with zero unnecessary friction and strict troll prevention.

---

## ✨ Features

- **Role-Based Passcode Gate:**
  - **Viewer Passcode (`watchparty`):** Instant access to full Cinema Mode. Viewers have zero access to stream settings, feeds, or passcodes.
  - **Host Passcode (`party-host`):** Unlocks the Host Control Room drawer (⚙️) to reconfigure stream links, change passcodes, or test feeds on the fly.
- **Direct HLS Playback (`.m3u8`):** Native low-latency streaming powered by `hls.js` with auto-reconnect and resolution detection.
- **Backup Embed Switcher:** 1-click toggle to a YouTube or Twitch embed if your direct HLS/iWant stream drops.
- **Cinema Mode & Ambient Lighting:** Warm projection glow behind the player with keyboard shortcuts (`F` for fullscreen, `Space` for play/pause, `M` for mute).
- **Discord Chat Button:** Direct shortcut pill to your Discord server so friends can voice/text chat while watching.

---

## 🚀 Quick Start

### 1. Run Locally
```bash
cd watchparty
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

- **Viewer Passcode:** `watchparty`
- **Host Passcode:** `party-host`

### 2. Configure Your Stream
You can either:
- **Option A (In-Browser):** Log in with `party-host`, then click the **⚙️ (Sliders)** icon in the top right to paste your HLS `.m3u8` link, YouTube embed, or change passcodes.
- **Option B (Environment File):** Copy `.env.example` to `.env.local` and set your variables:
  ```env
  VITE_STREAM_TITLE="My Watchparty"
  VITE_VIEWER_PASSCODE="friends2026"
  VITE_HOST_PASSCODE="my-secret-admin-pass"
  VITE_PRIMARY_HLS_URL="https://your-stream.com/live/index.m3u8"
  VITE_BACKUP_EMBED_URL="https://www.youtube-nocookie.com/embed/VIDEO_ID"
  VITE_DISCORD_URL="https://discord.gg/yourserver"
  ```

### 3. Build for Production
```bash
npm run build
```
The output will be in `dist/`, ready to drop onto Vercel, Netlify, or Cloudflare Pages for free.
