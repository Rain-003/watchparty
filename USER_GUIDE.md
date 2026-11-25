# Watchparty User Guide (Host & Viewer Manual)

A comprehensive guide on how to join as a viewer, broadcast as a host, relay DRM-protected streams (like iWant), and multitask while streaming without adding extra view counts to external video platforms.

---

## 1. Viewer Guide (How to Watch)

### Joining the Stream:
1. Open the watchparty website link provided by your host.
2. Enter the **Viewer Passcode** in the gate box.
3. Click **Enter Watchparty** — you will immediately enter Cinema Mode.
4. *Tip:* Your device remembers your session, so refreshing or reopening the tab keeps you in the room without re-entering the passcode.

### Cinema Controls & Hotkeys:
* **Play / Pause:** Press <kbd>Space</kbd> or click the video screen.
* **Fullscreen:** Press <kbd>F</kbd> or click the maximize button in the control bar.
* **Mute / Unmute:** Press <kbd>M</kbd> or click the speaker icon.
* **Ambient Theater Lighting:** Click the **Sparkles (✨)** icon in the top header to toggle the warm projection glow behind the screen.
* **Discord Community Chat:** Click the **Discord** button in the top bar to open the watchparty voice/text chat in a new tab.
* **Feed Switcher:** Toggle between direct `HLS` and backup `EMBED` playback.
* **Private Relay Badge (`🟢 PRIVATE SCREEN RELAY`):** If the host activates Direct Screen/Tab Relay, your player will automatically switch to the peer-to-peer stream without refreshing. Zero external view counts are registered.

---

## 2. Host Guide (Broadcasting & Admin Controls)

### Entering as Host:
1. Go to the watchparty website.
2. Enter your private **Host Passcode**, your **1-Time Host Grant Link**, or the **Owner Master Key**.
3. You will enter the Cinema Room with a distinct amber **`[HOST]`** badge and access to host action buttons.

### 1-Time Host Device Authorization (Owner-Granted Permanent Access):
If the Owner wants to authorize a trusted co-host without sharing passwords:
1. The Owner opens the **Owner Command Center** (via Master Key).
2. Under **"1-Time Host Device Grants"**, click **"+ Generate 1-Time Link"**.
3. Copy the link (e.g. `https://your-site.com/?grant=HOST-XXXXXX`) and send it to the co-host.
4. When the co-host opens this link on their phone or laptop, their browser is stamped with a permanent Host Device Token.
5. They are immediately logged in as Host, and will **automatically stay a Host forever on that device** without needing to ask or enter passcodes again!
6. If the Owner ever wants to remove their access, simply click the **Trash/Revoke** button next to that host in the Owner Command Center.

### Owner 2FA Verification & Emergency Recovery Bypass:
1. Enter your Master Passcode on the screening gate.
2. The 2FA gate prompts for the 6-digit OTP sent to your registered email.
3. **Emergency Master Bypass:** If email delivery is ever delayed or blocked by spam filters, **simply type your Master Passcode directly into the 6-digit OTP verification box**. It acts as an immutable Master Recovery Key and unlocks elevated Owner access immediately!

### Accessing the Host Control Room:
Click the **⚙️ (Sliders)** icon in the top right header to open the Host Control Drawer. Here you can:
* **Change Party Title:** Set the title of the event or movie being screened.
* **Update Passcodes:** Change both the Viewer Passcode and Host Passcode anytime.
* **Primary Stream URL (HLS):** Paste any direct `.m3u8` stream link.
* **Backup Embed URL (Auto-Formatted):** Paste **any regular YouTube link** (e.g. `https://www.youtube.com/watch?v=...`, `youtu.be/...`, or `youtube.com/live/...`) or Twitch channel link. The system automatically converts it into a working embed with autoplay enabled.
* **Broadcast to Viewers:** Click **"Broadcast to Viewers"** to save your stream. A **Viewer Sync Link** (e.g. `https://your-site.vercel.app?v=...`) is generated.
* **Copy & Share:** Click **Copy** and paste the link into Discord. Viewers who click this link will automatically sync to your selected stream across any device or browser without touching any settings!
* **Discord URL:** Update your community Discord invite link.

---

## 3. How to Stream iWant (and Other DRM-Protected Sites)

Services like **iWantTFC**, Netflix, and Disney+ use **DRM (Widevine copy protection)**. If you try to share them normally, your viewers will only see a **black screen with sound**.

Follow this 2-step setup to stream iWant with pristine 1080p video and crystal-clear audio:

### Step 1: Fix the DRM Black Screen (1-Minute Browser Tweak)
Browser hardware acceleration causes DRM streams to render directly on the GPU, which blocks screen capture APIs. Turning it off renders video in software so it can be relayed cleanly:

1. In **Chrome** (or **Edge** / **Brave**):
   * Click the 3 dots (top right) &rarr; **Settings**.
   * In the search bar at the top of Settings, search for **`acceleration`**.
   * Toggle **OFF**: *"Use graphics acceleration when available"* (or *"Use hardware acceleration"*).
   * Click **Relaunch**.
2. *Pro Tip:* You can also keep **Firefox** installed just for hosting watchparties with hardware acceleration disabled, leaving your main daily browser untouched.

### Step 2: Relay iWant to Your Viewers (Zero Added Views)
1. Open [iwanttfc.com](https://www.iwanttfc.com), log into your account, and start the show or live channel.
2. Go to your **Watchparty** tab (logged in as Host).
3. Click the green button in the top action bar:
   👉 **`Relay Tab/Screen`**
4. In the browser popup window:
   * Select the **"Chrome Tab"** tab.
   * Click on the **iWantTFC** tab.
   * ✅ **Crucial:** Ensure the **"Also share tab audio"** checkbox is checked at the bottom.
   * Click **Share**.
5. All viewers in your Watchparty will instantly see and hear the iWant stream without black screen issues.
6. **Zero Added Views:** To iWant, there is **only 1 viewer** (your account). The viewers in your room receive the feed directly from you via WebRTC without touching iWant's servers.

---

## 4. How to Multitask & Idle as Host (The Background Stream Trick)

You do **not** need to keep the video on your main screen while hosting. You can play games, work, or browse while the stream runs unattended in the background:

### Method A: The Virtual Desktop Trick (Windows & Mac)
1. Drag the video tab (e.g. iWant or YouTube) into its own **separate browser window**.
2. On Windows, press <kbd>Win</kbd> + <kbd>Tab</kbd> &rarr; click **"New Desktop"** (Desktop 2).
3. Drag the video window onto **Desktop 2** and leave it playing.
4. On **Desktop 1**, open your Watchparty and start the **`Relay Tab/Screen`** on that tab.
5. You can now freely use Desktop 1 to game, code, or watch other media. Your viewers will only see what is playing on Desktop 2!

### Method B: Prevent Browser Background Tab Sleeping
Browsers sometimes throttle inactive background tabs to save battery. To ensure high FPS and uninterrupted audio while you do other things:
1. In Chrome, go to `Settings` &rarr; `Performance`.
2. Under **"Always keep these sites active"**, click **Add** and enter `iwanttfc.com` (and your watchparty site).
3. The video will now play smoothly at full 30/60 FPS even when you minimize or switch away from the window.

---

## 5. Alternative: Streaming via OBS Studio (For Large Groups 50+)

If you have a large audience (50+ viewers) and prefer not to use your personal computer's upload bandwidth for peer-to-peer relay:

1. **In OBS Studio:**
   * Add a **Window Capture** source pointing to your browser window (with Hardware Acceleration turned off).
   * Confirm Desktop Audio captures the video sound.
2. **In YouTube Studio:**
   * Go to [studio.youtube.com](https://studio.youtube.com) &rarr; **Go Live**.
   * Set stream visibility to **Unlisted** (hidden from the public).
   * Copy the Stream Key into OBS (`Settings` &rarr; `Stream`) and click **Start Streaming**.
3. **In Watchparty:**
   * Copy your YouTube live watch URL.
   * Paste it into Watchparty's **Backup Embed URL** field in the Host Drawer (`⚙️`).
   * Switch the room feed to **`FEED: EMBED`** and click **Broadcast to Viewers**.
