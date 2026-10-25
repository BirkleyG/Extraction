# Putting Mineshaft Capital online for you and your friends

> **Extraction Tycoon development:** this guide describes the legacy browser prototype. It does not deploy the v1.2 trusted simulation or satisfy competitive multiplayer acceptance. See the [current rulebook](docs/rulebook/Extraction-Rulebook-v1.2.md), [Buildout Plan](docs/development/Buildout-Plan.md), and [Questions for the Boss](docs/development/Questions-for-the-Boss.md).

The game is a static website (just HTML/CSS/JS, no build step), so it needs two free things:

1. **A place to host the files**: GitHub Pages (comes with this repo).
2. **A place to keep the shared world** (everyone's colonies, the leaderboard, the planet): Firebase Firestore, free tier.

Total time: about 10 minutes. You only do this once.

> Want to try it first? Open `index.html` (or run `python3 -m http.server` in this folder and visit
> http://localhost:8000). With no Firebase settings it runs as a **single-player** game saved in your browser.

---

## Step 1: Create a Firebase project

1. Go to https://console.firebase.google.com and click **Add project**. Name it anything (e.g. `mineshaft-capital`). You can turn Google Analytics off.
2. In the left menu: **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save**.
   (Players never create accounts; each browser gets an anonymous ID.)
3. **Build → Firestore Database → Create database**. Pick a region near you and choose **Production mode**.
4. In Firestore, open the **Rules** tab, delete what's there, paste the entire contents of [`firestore.rules`](firestore.rules) from this repo, and click **Publish**.

## Step 2: Get your web config

1. Project Overview (gear icon) → **Project settings → General**.
2. Under **Your apps**, click the **`</>` (Web)** icon, give it a nickname, skip Firebase Hosting, and click **Register app**.
3. Copy the `firebaseConfig` values it shows you.
4. Open [`js/config.js`](js/config.js) and fill them in:

```js
window.MSC_CONFIG = {
  firebase: {
    apiKey: "AIza...",
    authDomain: "mineshaft-capital.firebaseapp.com",
    projectId: "mineshaft-capital",
    appId: "1:1234567890:web:abcdef"
  }
};
```

These values are **not secrets**. They only say which project to talk to; `firestore.rules` is what protects the data. Commit the file.

## Step 3: Turn on GitHub Pages

1. On GitHub: repo **Settings → Pages**.
2. **Source: Deploy from a branch**, branch **`main`**, folder **`/ (root)`**, Save.
3. After a minute your game is live at `https://<your-username>.github.io/<repo-name>/`.

(The code needs to be on `main` for this. If it's on a feature branch, merge it first.)

## Step 4: Invite friends

1. Open your game URL. Enter your name when asked.
2. Open **⚙ Settings → Playing with friends → Copy invite link** and send it to your friends.

The invite link looks like `https://…github.io/…/?room=main`. **Everyone with the same `room` lands on the same planet.**
Want a separate game for another friend group? Share a link with a different room, e.g. `?room=work-friends`.
Same Firebase project, totally separate worlds.

---

## Bring your own AI key (optional)

AI powers three things: tribe conversations and deals, species descriptions, and the next planet's design.
It is **optional**. With AI off the game still works (procedural planets, tribes just don't talk).

Each player decides for themselves: **⚙ Settings → AI engine**, then choose **My Claude API key** or **My OpenAI API key**, paste a key, and press **Test connection**.

- Keys are stored **only in that player's browser** (localStorage). They are never written to the shared database and never seen by other players or by you.
- Calls go **directly from the player's browser to Anthropic/OpenAI**. There is no server of yours in between.
- Anyone who has a key pays for their own usage. Only a month's winner needs one (to dream up the next planet), so most friends can skip it.
- Anyone using a shared or public computer should clear the key afterwards (set the engine to Off and save).

Get a key at https://console.anthropic.com or https://platform.openai.com.

---

## How it works / limits

- **Identity**: anonymous sign-in. The colony belongs to that browser. Clearing site data or switching devices starts a fresh colony.
  If you want cross-device saves, the simplest upgrade is adding Google sign-in in `js/backend.js`.
- **Security**: you can only write your own colony. The world doc (current planet) and event feed are writable by anyone in the room. That's fine for friends, but it isn't cheat-proof. A friend with browser dev tools can edit their own colony.
- **Free tier**: Firebase's free Spark plan allows 50,000 reads and 20,000 writes per day. Each active player saves about every 20 s and every player's browser receives everyone's saves, so a handful of friends playing a few hours a day is well within limits. A big group playing all day might hit them; the game then just stops syncing until the daily reset.
- **Host tools**: add `#admin` to the URL (e.g. `…/?room=main#admin`) to get testing buttons ("End the month now", "Improvise a new planet now").
- **Optional hardening**: in Google Cloud Console → APIs & Services → Credentials, restrict your Firebase API key to HTTP referrers `https://<your-username>.github.io/*`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Single-player mode" in Settings | `js/config.js` is empty or has a typo; check `apiKey` and `projectId`. |
| "Could not reach the online server" toast | Anonymous sign-in not enabled (Step 1.2), or Firestore not created (Step 1.3). Open the browser console for the exact Firebase error. |
| Colony won't save / "Could not save" toast | Rules not published (Step 1.4), or the page is offline. |
| Sign-in error mentioning domain | Firebase Console → Authentication → Settings → Authorized domains → add `<your-username>.github.io`. |
| Friends see a different planet | They used a different `?room=`. Send the invite link again. |

## Developing locally against the Firebase emulator

```bash
npm i -g firebase-tools
firebase emulators:start --only auth,firestore --project demo-msc   # uses firebase.json
```

and temporarily add `emulator: { host: '127.0.0.1', auth: 9099, firestore: 8080 }` next to `firebase` in `js/config.js`
(with dummy `apiKey`/`projectId`/`appId` values).
