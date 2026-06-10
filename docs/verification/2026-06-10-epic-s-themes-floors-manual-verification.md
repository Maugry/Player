# Epic S — Manual Verification (Themes, Floors, Free-input Resolution)

**Date:** 2026-06-10
**Covers:** #228 free-input screen resolution · #260 Themes collection + live re-theming · #261 Floors + Guide-App floor filter
**Repos touched:** `prototype/cms`, `prototype/guide-app`, `prototype/player`
**Goal:** Build the latest images, run the stack, seed the demo museum, then verify each acceptance criterion end-to-end — including live re-theming and the stale-variable edge case.

All commands are copy-paste ready and run from `prototype/` unless noted. Default creds: `admin@umka.local` / `admin123`.

---

## Before you start

- [ ] **VPN is up.** The dev build pulls `@umka/protocol` from the GitLab npm registry (`gitlab.maugry.ru:2224`). Without VPN the `cms`/`guide-app` builds fail. Quick check:
  ```bash
  getent hosts gitlab.maugry.ru && bash -c "</dev/tcp/gitlab.maugry.ru/2224" && echo "VPN OK"
  ```
- [ ] `GITLAB_NPM_TOKEN` is set in `prototype/.env` (BuildKit secret for the build).
- [ ] Docker is running.

---

## Part 1 — Build & run the latest stack

The dev override (`docker-compose.dev.yml`) builds `cms` and `guide-app` **from local source** instead of pulling registry images, so your uncommitted/just-committed changes are what runs.

- [ ] **Build + start everything from source:**
  ```bash
  cd prototype
  make dev
  ```
  `make dev` resolves the GitLab VPN-internal IP and runs `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`. The slow step is the `cms` image (`pnpm install` + `pnpm build`).

- [ ] **Migrations apply automatically on `cms` boot.** The entrypoint runs `pnpm payload migrate` before starting. Confirm the new Epic S migrations ran:
  ```bash
  docker logs umka-cms 2>&1 | grep -iE "migrat|themes|floors" | head -20
  ```
  Expect to see the migration batch complete with no errors (incl. `…_add_themes_collection`, `…_kiosk_theme_to_relationship`, `…_add_floors_collection`, `…_add_hall_floor`, `…_themes_branding_fields`).

- [ ] **All containers healthy:**
  ```bash
  docker ps --format '{{.Names}}\t{{.Status}}' | grep umka
  ```
  `umka-postgres` and `umka-mosquitto` should read `(healthy)`; `umka-cms`, `umka-guide-app`, `umka-nginx` `Up`.

- [ ] **CMS admin reachable:** open <http://localhost:40000/admin> and log in.

### Seed the demo museum (4 themes, 2 floors)

- [ ] **Reset + seed** (idempotent; `--reset` wipes prior demo data first):
  ```bash
  cd prototype
  CMS_URL=http://localhost:40000 ./scripts/seed-demo.sh --reset
  ```

- [ ] **Confirm exactly 4 themes** were created for the demo museum:
  ```bash
  curl -s "http://localhost:40000/api/themes?limit=20&depth=0" | python3 -c "import sys,json; d=json.load(sys.stdin); print([t['slug'] for t in d['docs']])"
  ```
  Expect: `['light', 'dark', 'museum-gold', 'midnight']`.

- [ ] **Confirm 2 floors + halls.** Floors are **admin-read** (not public like themes), so this query needs a login token:
  ```bash
  TOKEN=$(curl -s -X POST http://localhost:40000/api/users/login -H "Content-Type: application/json" \
    -d '{"email":"admin@umka.local","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
  curl -s "http://localhost:40000/api/floors?depth=0" -H "Authorization: JWT $TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print([(f['name'],f['level']) for f in d['docs']])"
  ```
  Expect two floors (level 1 and 2). Or just open CMS → **Floors** and confirm two rows.

### Create a demo kiosk (the seed omits kiosks by design)

The demo seed creates the museum, floors, halls, media, IoT, and content packages — but **no kiosks**, because a kiosk maps to a physical device wired to a package per deployment. Create one so the Player has a config to fetch.

- [ ] **In CMS → Kiosks → Create:** set **Name** = `Demo Kiosk 1-1`, **Slug** = `kiosk-1-1`, **Hall** = a demo hall, **Theme** = `Museum Gold`, **Content Package** = `Demo Browse (portrait)`, **Display → Resolution** = `1080x1920`, **Mode** = `browse`. Save.

  Or via API (matches what this verification used):
  ```bash
  TOKEN=$(curl -s -X POST http://localhost:40000/api/users/login -H "Content-Type: application/json" \
    -d '{"email":"admin@umka.local","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
  HALL=$(curl -s "http://localhost:40000/api/halls?limit=1&depth=0" -H "Authorization: JWT $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['docs'][0]['id'])")
  THEME=$(curl -s "http://localhost:40000/api/themes?where\[slug\]\[equals\]=museum-gold" -H "Authorization: JWT $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['docs'][0]['id'])")
  PKG=$(curl -s "http://localhost:40000/api/content-packages?limit=20&depth=0" -H "Authorization: JWT $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((p['id'] for p in d['docs'] if 'portrait' in p.get('name','').lower()), d['docs'][0]['id']))")
  curl -s -X POST "http://localhost:40000/api/kiosks" -H "Authorization: JWT $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"Demo Kiosk 1-1\",\"slug\":\"kiosk-1-1\",\"hall\":$HALL,\"theme\":$THEME,\"contentPackage\":$PKG,\"mode\":\"browse\",\"display\":{\"resolution\":\"1080x1920\"}}"
  ```
  > **Note:** `resolution` lives under the **Display** group (`display.resolution`), not at the top level.

- [ ] **Confirm the Player-facing query returns the populated theme** (this is exactly what the Player fetches — anonymous, `depth=2`):
  ```bash
  curl -s "http://localhost:40000/api/kiosks?where\[slug\]\[equals\]=kiosk-1-1&depth=2" \
    | python3 -c "import sys,json; t=json.load(sys.stdin)['docs'][0]['theme']; print('theme:',t['slug'],'| primary:',t['colors']['primary'],'| gradient:',t.get('gradient'))"
  ```
  Expect `theme: museum-gold | primary: #C9A227 | gradient: {...}`.

---

## Part 2 — Build & run the kiosk (Player)

The Player reads `kiosk-settings.json` to find its CMS. **Watch out for a leftover settings file** silently pointing the Player at the wrong server — always confirm the active `serverUrl` in the Player logs on boot.

- [ ] **Create local kiosk settings** pointing at the dockerized CMS. Match `kioskSlug` to a seeded kiosk (the demo seeds `kiosk-1-1`):
  ```bash
  cd prototype/player
  cat > kiosk-settings.json <<'JSON'
  {
    "kioskId": "kiosk-demo",
    "kioskSlug": "kiosk-1-1",
    "serverUrl": "http://localhost:40000",
    "mqttUrl": "ws://localhost:49001",
    "museumId": "demo",
    "mode": "browse",
    "display": { "fullscreen": false, "cursor": true },
    "debug": { "showDevTools": true, "logLevel": "info" }
  }
  JSON
  ```
  > `showDevTools: true` + `fullscreen: false` make verification easier — you can inspect the computed CSS variables in DevTools.

- [ ] **Run the Player in Electron dev mode:**
  ```bash
  cd prototype/player
  pnpm install   # first run only
  pnpm dev
  ```
  In the Player console, confirm it loaded **your** settings (`Loading settings from: …/kiosk-settings.json`, `serverUrl: http://localhost:40000`) — not a stale staging URL.

  > **Closer-to-production option (Linux):** `pnpm build:linux` produces a packaged app under `release/`; drop the same `kiosk-settings.json` next to the executable. For a real Windows kiosk image, `pnpm build:win` (needs Wine) — but dev is Linux, kiosks are Windows, so a Linux dev run is the right loop for this verification.

---

## Part 3 — Acceptance criteria

### #228 — Free-input screen resolution

- [ ] In CMS → **Kiosks → kiosk-1-1 → Display group**, set **Resolution** to `1080x1920`. Save → **accepted**.
- [ ] Change it to `1920x1080`. Save → **accepted**.
- [ ] Try an invalid value `1080*1920` or `foo`. Save → **rejected** with a validation message (Russian).
- [ ] Try `12345678x1` (>9 chars) → **rejected** (maxLength 9).

### #260 — Themes applied on the kiosk

- [ ] In CMS → **Kiosks → kiosk-1-1**, set **Theme = Museum Gold**. Save.
- [ ] The running Player should **re-theme within a second or two without a restart** (the kiosk `afterChange` hook publishes a `sync`; the Player re-fetches its config and calls `applyTheme`). Expect: gold accent palette, brand gradient on headers, serif font, tighter corner radius.
- [ ] In DevTools console on the Player, verify the variables were set:
  ```js
  const s = getComputedStyle(document.documentElement)
  s.getPropertyValue('--primary'); s.getPropertyValue('--radius'); s.getPropertyValue('--brand-gradient')
  ```

- [ ] Set **Theme = Midnight**. Save → Player re-themes: dark base, **background image** visible behind content, dimming **overlay**, larger radius.

#### Live theme-token edit (Themes afterChange → sync)

- [ ] In CMS → **Themes → Museum Gold**, change `colors.primary` to a vivid value (e.g. `#FF0066`). Save.
- [ ] **Every kiosk currently using Museum Gold re-syncs live** and the new primary appears without reassigning the theme. (This is the gap the new `Themes.afterChange` hook closes — editing the theme, not just reassigning it, now propagates.)

#### Stale-variable edge case (the bug we fixed in review)

- [ ] With the kiosk on **Midnight** (has a background image), switch its **Theme back to Light** (no background image). Save.
- [ ] Confirm the **background image disappears** — it must not remain stuck from Midnight. In DevTools:
  ```js
  getComputedStyle(document.documentElement).getPropertyValue('--kiosk-bg-image')  // expect: none / empty
  ```
  > Before the fix, `applyTheme` only ever *set* variables, so a theme that omitted the image left the old one on screen. The fix clears managed vars before each apply.

#### Theme museum-scoping

- [ ] In the **Kiosk → Theme** picker, only the demo museum's themes appear (no cross-museum themes). The picker is scoped via the kiosk's hall → museum.

### #261 — Floors filter in the Guide App

- [ ] Open the Guide App: <http://localhost:40001>.
- [ ] Because the demo has **2 floors**, a **floor selector** is visible. (With a single floor it is hidden.)
- [ ] Select **Floor 2**. The dashboard's kiosk + IoT counts and lists **cascade to only that floor's halls** — kiosks/lights belonging to Floor 1 halls drop out.
- [ ] Switch back to **Floor 1** (or "all") and confirm the set changes accordingly.

---

## Part 4 — Round-trip & edge cases

- [ ] **Kiosk restart picks up current theme:** stop the Player (`Ctrl+C`), restart `pnpm dev`. It fetches the kiosk config fresh and applies the currently-assigned theme at startup (no reliance on cached CSS).
- [ ] **Invalid hex rejected in CMS:** in any theme, set a color field to `red` (not hex) → save **rejected**.
- [ ] **Custom CSS escape hatch:** in a theme, set **Custom CSS** to `:root { --radius: 2rem; }`, assign that theme → kiosk applies it; clear it and re-sync → the injected `<style id="kiosk-theme-custom">` is removed (not duplicated).
- [ ] **Bad overlay color is ignored, not broken:** an overlay color that isn't a valid hex leaves the overlay unset (no `rgba(NaN…)`), so the background still renders.

---

## Teardown

```bash
cd prototype
make dev-down          # stop the dev stack
# (optional) remove the local Player settings so a later run doesn't inherit them:
rm -f player/kiosk-settings.json
```

---

## Notes / known scope

- Theme delivery rides in the REST kiosk-config response (`GET /api/kiosks?where[slug]=…&depth=2`); live propagation reuses the existing `{action:'sync'}` app-command. **No `@umka/protocol`/SDK change** was required. A typed `KioskConfig`/`Theme` protocol shape remains a deferred #205 follow-on.
- Automated coverage backing this guide: `cms` 89/89 and `player` 16/16 green at time of writing.
