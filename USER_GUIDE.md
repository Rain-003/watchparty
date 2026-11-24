# Watchparty User Guide (Host & Viewer Manual)

A comprehensive guide on how to join as a viewer, broadcast as a host, and configure streaming sources without showing sensitive passcodes.

---

## 1. Viewer Guide (How to Watch)

### Joining the Stream:
1. Open the watchparty website link provided by your host.
2. Enter the **Viewer Passcode** in the box (e.g. `<YOUR_VIEWER_PASSCODE>`).
3. Click **Enter Watchparty** — you will immediately enter Cinema Mode.
4. *Tip:* Your device remembers your session, so refreshing or reopening the tab keeps you in the stream.

### Cinema Controls & Hotkeys:
* **Play / Pause:** Press <kbd>Space</kbd> or click the video screen.
* **Fullscreen:** Press <kbd>F</kbd> or click the maximize button in the control bar.
* **Mute / Unmute:** Press <kbd>M</kbd> or click the speaker icon.
* **Ambient Theater Lighting:** Click the **Sparkles (✨)** icon in the top header to toggle the warm projection glow behind the screen.
* **Discord Community Chat:** Click the **Discord** button in the top bar to open the watchparty voice/text chat in a new tab.
* **Switching Feed:** If the direct HLS feed is buffering, click the **Feed** button in the top bar to toggle between `HLS` and `EMBED` backup.

---

## 2. Host Guide (Broadcasting & Admin Controls)

### Entering as Host:
1. Go to the watchparty website.
2. Enter your private **Host Passcode** (e.g. `<YOUR_HOST_PASSCODE>`).
3. You will enter the Cinema Room with a distinct amber **`[HOST]`** badge in the top bar.

### Accessing the Host Control Room:
Click the **⚙️ (Sliders)** icon in the top right header to open the Host Control Drawer. Here you can:
* **Change Party Title:** Set the title of the event or movie being screened.
* **Update Passcodes:** Change both the Viewer Passcode and Host Passcode anytime.
* **Primary Stream URL (HLS):** Paste any direct `.m3u8` stream link.
* **Backup Embed URL (Auto-Formatted):** Paste **any regular YouTube link** (e.g. `https://www.youtube.com/watch?v=...`, `youtu.be/...`, or `youtube.com/live/...`) or Twitch channel link. The system automatically converts it into a working embed with autoplay enabled.
* **Discord URL:** Update your community Discord invite link.
* Click **Save Configuration** to apply changes instantly.

---

## 3. How to Stream Protected Content (e.g. iWant) via OBS

Because services like iWant use DRM encryption and domain restrictions, direct `.m3u8` playback in external browsers is blocked. Restreaming via OBS is the industry-standard way to broadcast:

### Step 1: Prepare Browser
1. Open iWant in Chrome, Brave, or Edge.
2. If OBS shows a black screen during window capture, turn off Hardware Acceleration:
   * Chrome/Brave: `Settings` &rarr; `System` &rarr; toggle off **"Use graphics acceleration when available"** &rarr; relaunch browser.

### Step 2: Configure OBS Studio
1. In OBS, click `+` under **Sources** &rarr; select **Window Capture**.
2. Select your browser window showing iWant.
3. Ensure **Desktop Audio** is capturing the stream audio.

### Step 3: Broadcast to YouTube (Unlisted)
1. Go to [studio.youtube.com](https://studio.youtube.com) &rarr; click **Go Live**.
2. Set visibility to **Unlisted** (only people on your website can watch; not public on YouTube).
3. Copy your Stream Key and paste it into OBS (`Settings` &rarr; `Stream`).
4. Click **Start Streaming** in OBS.
5. Copy your YouTube live watch URL &rarr; log in to your Watchparty as Host &rarr; paste the link in the **Backup Embed URL** field &rarr; switch the top bar to **`FEED: EMBED`**.

Your viewers will now enjoy a 1080p, ultra-low latency, 100% stable watchparty with zero server cost!
