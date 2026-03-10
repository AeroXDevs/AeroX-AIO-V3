# AeroX AIO V3 — Bug Fix Changelog

This document lists every bug that was found and fixed in the source code.

---

## 🔴 Critical Fixes

### 1. `AntiAbuse.js` — Violation data wiped on every restart
**File:** `src/utils/AntiAbuse.js`

**Problem:** `initTable()` was calling `DROP TABLE IF EXISTS` on both the `cooldowns` and `mention_limits` tables every time the bot started. This meant all cooldown violation history was deleted on every restart, allowing abusive users to simply wait for a bot restart to reset their violation count and avoid being blacklisted.

**Fix:** Removed both `DROP TABLE` statements. Tables now use `CREATE TABLE IF NOT EXISTS` only, so data persists across restarts as intended.

---

### 2. `MusicManager.js` — `is247ModeEnabled()` returned `undefined`
**File:** `src/managers/MusicManager.js`

**Problem:** The `is247ModeEnabled()` function had a bare `return` with no value in its else/catch branch. This meant it returned `undefined` instead of `false`, causing boolean checks like `if (is247Enabled)` to behave incorrectly.

**Fix:** Changed to explicitly `return false` in all non-true branches.

---

### 3. `PlayerManager.js` — `guildId` always `undefined`
**File:** `src/managers/PlayerManager.js`

**Problem:** The class had both a class field `guildId = player.guildId` AND a `get guildId()` getter. In JavaScript, the getter silently shadows the field, but the field itself is set to `undefined` at class instantiation time (before `player` is assigned). This caused `this.guildId` to always return `undefined`.

**Fix:** Removed the class field declaration. Only the getter remains, which correctly reads from `this.player.guildId` at call time.

---

### 4. `DatabaseManager.js` — 4 ticket methods missing, crashing on ticket close
**File:** `src/database/DatabaseManager.js`

**Problem:** `ticketInteraction.js` called `db.isTranscriptSent()`, `db.markTranscriptSent()`, `db.isReviewSent()`, and `db.markReviewSent()` during the ticket close flow. These methods existed in `Ticket.js` but were never exposed through `DatabaseManager`, causing a `TypeError: db.isTranscriptSent is not a function` crash every single time a ticket was closed.

**Fix:** Added all 4 missing method delegations to `DatabaseManager.js`.

---

## 🟠 High Severity Fixes

### 5. `config.js` — Hardcoded Lavalink credentials
**File:** `src/config/config.js`

**Problem:** The Lavalink node config had hardcoded defaults: host `140.238.179.182` and password `"kirito"`. These were public in the repository, exposing a live server to abuse.

**Fix:** Removed all hardcoded credential fallbacks. `LAVALINK_HOST` and `LAVALINK_PASSWORD` are now required environment variables. The bot logs a clear warning if they are missing.

---

### 6. `slashcmd.js` — Hardcoded support server URL
**File:** `src/events/discord/guild/slashcmd.js`

**Problem:** Error responses in slash commands had `"https://discord.gg/aerox"` hardcoded directly in the file, completely ignoring the `config.links.supportServer` value.

**Fix:** Replaced all hardcoded URLs with `config.links.supportServer`.

---

### 7. `PlayerManager.js` — `is247ModeEnabled()` returned `undefined`
**File:** `src/managers/PlayerManager.js`

**Problem:** Same issue as in `MusicManager.js` — bare `return` with no value in the else branch.

**Fix:** Changed to explicitly `return false`.

---

### 8. `guildMemberAdd.js` — Invite tracking ran for all guilds regardless of setting
**File:** `src/events/discord/guild/guildMemberAdd.js`

**Problem:** The `guildMemberAdd` event processed invite tracking for every guild unconditionally, even if invite tracking was disabled for that guild.

**Fix:** Added an `isInviteTrackingEnabled(guildId)` guard at the top of the handler. Processing is skipped entirely if tracking is off for that guild.

---

## 🟡 Medium Severity Fixes

### 9. `guildDelete.js` — Memory leak on guild leave (new file)
**File:** `src/events/discord/guild/guildDelete.js` *(new)*

**Problem:** `client.inviteCache` is a Map that stores invite data per guild. When the bot left a guild, the cache entry was never removed, causing the Map to grow indefinitely over time.

**Fix:** Created a new `guildDelete` event handler that removes the guild's entry from `inviteCache` when the bot leaves.

---

### 10. `AntiAbuse.js` — `sendCooldownNotification()` called wrong method
**File:** `src/utils/AntiAbuse.js`

**Problem:** In the cooldown notification function, the branch intended to call `followUp()` was actually calling `reply()` instead, which would throw an error if the interaction had already been replied to.

**Fix:** Corrected to call `.followUp()` in the followUp branch.

---

### 11. `MusicManager.js` — No null check before Lavalink node search
**File:** `src/managers/MusicManager.js`

**Problem:** `search()` called `leastUsedNodes('memory')[0]` without checking if any nodes were available. If no Lavalink nodes were connected, this would throw a `TypeError: Cannot read properties of undefined`.

**Fix:** Added a null/length check — returns `null` with a warning log if no nodes are available.

---

### 12. `shard.js` — Shard count hardcoded to 4
**File:** `src/shard.js`

**Problem:** `totalShards: 4` and `shardsPerCluster: 1` were hardcoded. Changing shard count required editing source code.

**Fix:** Both values now read from `TOTAL_SHARDS` and `SHARDS_PER_CLUSTER` environment variables, with sensible defaults.

---

### 13. `ticketInteraction.js` — XSS vulnerability in HTML transcripts
**File:** `src/events/discord/ticket/ticketInteraction.js`

**Problem:** `msg.content` was inserted directly into the generated HTML transcript without any sanitization. A user could send a message containing `<script>` tags or other HTML that would execute when the transcript file was opened in a browser.

**Fix:** Added an `escapeHtml()` helper function that escapes `&`, `<`, `>`, `"`, `'` before inserting any user content into the HTML.

---

### 14. `MusicCard.js` — Fragile font path resolution
**File:** `src/structures/classes/MusicCard.js`

**Problem:** Font paths were resolved using `process.cwd()/../..` which breaks depending on where the bot process is started from.

**Fix:** Added `__dirname` via `import.meta.url` + `fileURLToPath` for reliable path resolution relative to the file itself.

---

### 15. `Playerbuttons.js` — Wrong `stop()` call signature
**File:** `src/events/discord/music/Playerbuttons.js`

**Problem:** The stop button called `pm.stop(true, false)` but `PlayerManager.stop()` takes no parameters.

**Fix:** Changed to `pm.stop()`.

---

## 🟢 Low Severity Fixes

### 16. `commands/Music/music/extra/searfh.js` — Filename typo
**Problem:** File was named `searfh.js` instead of `search.js`.

**Fix:** Renamed to `search.js`.

---

### 17. `package.json` — Setup script typo
**Problem:** Setup script contained `"yaour"` instead of `"your"`.

**Fix:** Corrected the typo.

---

### 18. `CommandHandler.js` — Leftover debug comment
**Problem:** A stray `//demn` comment artifact was left in the command handler.

**Fix:** Removed.

---

### 19. `ready.js` — `antiAbuse.cleanupOldData()` never scheduled
**File:** `src/events/discord/ready.js`

**Problem:** `AntiAbuse` has a `cleanupOldData()` method to purge old DB entries but it was never called anywhere, causing the database to grow indefinitely.

**Fix:** Added a `setInterval` in `ready.js` to run cleanup every 24 hours.

---

### 20. `config.js` — Version mismatch
**Problem:** `config.version` was `'2.0.0'` while the project is V3.

**Fix:** Updated to `'3.0.0'`.

---

### 21. `example.env` — Missing required variables
**Problem:** `example.env` was missing entries for `LAVALINK_HOST`, `LAVALINK_PASSWORD`, `TOTAL_SHARDS`, `SHARDS_PER_CLUSTER`, and several other variables, making initial setup confusing.

**Fix:** Fully rewrote `example.env` with all required and optional variables documented with comments.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟠 High | 4 |
| 🟡 Medium | 7 |
| 🟢 Low | 6 |
| **Total** | **21** |