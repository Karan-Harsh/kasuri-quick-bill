# Kasuri Quick Bill

Restaurant billing for the Kasuri counter — a Windows desktop app that works with no internet.

- **Tables** — 8 tables on one board, showing free / occupied / ready to serve, plus parcel bills.
- **Orders** — tap dishes by category, adjust quantities, send new items to the kitchen as a KOT.
- **Kitchen** — live kitchen screen and printed KOTs; marks orders ready to serve.
- **Billing** — discounts, optional GST, cash / UPI / card, printed bill.
- **Menu** — categories, prices, GST rate per dish, turn dishes on or off.
- **Reports** — sales by day / week / month, dine-in vs parcel, payment methods, item-wise.
- **Inventory** — stock of kitchen staples with used / received / counted updates.
- **Waiter phones** — waiters take orders on their phones over the restaurant Wi-Fi.
- **Backups** — automatic daily copy of all data on this computer.

## How it runs

Kasuri Quick Bill is a **Windows desktop app** (Tauri). Everything stays on the counter computer — no internet, no cloud account, no login.

```
Tauri window (React screens)  ──►  local server (Bun + TypeScript, port 8787)  ──►  SQLite file
                                        ▲
              waiter phones over the restaurant Wi-Fi (when turned on in Settings)
```

- `server/` — the local server. Owns the database and every business rule (bill/KOT numbering, send to kitchen,
  ready-to-serve, settling bills, inventory). Pushes live updates to every open screen over a WebSocket.
  It is compiled into a single `.exe` and started automatically by the desktop app.
- `src/` — the React screens (TanStack Router, React Query, Tailwind/shadcn). They call the server through `src/lib/api.ts`.
- `waiter/` — the waiter phone app (React). Built into `dist-waiter/` and served by the local server at `/waiter`.
- `src-tauri/` — the desktop shell: opens the window, starts/stops the local server.

## Waiter phones

1. On the counter: **Settings → Waiter phones → Let waiter phones connect**. The first time, Windows asks
   whether to allow Kasuri on the network — click **Allow** (private networks).
2. Click **Add a phone** and scan the QR code with the waiter's phone camera (phone on the same Wi-Fi).
   Enter the waiter's name. The phone stays paired; remove it from the same screen if it's lost.
3. Waiters pick a table, tap dishes and **Send to kitchen**. The counter chimes, shows who sent it, and
   (optionally) prints the KOT. When the kitchen marks it ready, the table turns green on the phones.

Phones can only take and send orders. Settling, discounts, menu, reports, inventory and settings are counter-only,
enforced by the server. Tip: give the counter PC a fixed address in the Wi-Fi router so phones always find it.

**Data location** (shown in Settings): `C:\Users\<name>\AppData\Roaming\in.kasuri.quickbill\kasuri.db`.
A backup copy is written to the `backups` folder next to it once a day; the last 30 are kept.

## Building the Windows installer

One-time setup on the Windows PC:

1. Install [Bun](https://bun.sh) (`powershell -c "irm bun.sh/install.ps1 | iex"`).
2. Install [Rust](https://rustup.rs) (accept the defaults).
3. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++**.
4. Install [Node.js](https://nodejs.org) 22 or newer (the screens are built with Vite, which runs on Node).

Or, in an Administrator PowerShell:

```powershell
winget install --id Oven-sh.Bun -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Rustlang.Rustup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then open a new terminal so the new tools are on PATH.

Then in the project folder:

```sh
bun install
bun run package
```

The installer is created at `src-tauri\target\release\bundle\nsis\Kasuri Quick Bill_1.0.0_x64-setup.exe`.
Windows may warn that the installer isn't signed: **More info → Run anyway**.

## Development

Works on macOS, Windows or Linux with [Bun](https://bun.sh) and [Node.js](https://nodejs.org) 20.19+ (22 recommended).
Node must be on PATH: Vite runs on it, and crashes if Bun stands in for it (`bun run dev` checks this first).

```sh
bun install
bun run dev        # local server on :8787 + screens on http://localhost:3000
```

| Command | Purpose |
|---------|---------|
| `bun run dev` | Server (auto-restarts) + counter screens on http://localhost:3000 + waiter app at http://<this computer's IP>:8787/waiter (once waiter phones are on), data in `./data` |
| `bun run app` | The real desktop window (needs Rust) |
| `bun run test` | Business-rule tests for the server |
| `bun run typecheck` | TypeScript checks for screens and server |
| `bun run build:server` | Compile the server for this computer (`... windows` for a Windows `.exe`) |
| `bun run package` | Build the desktop installer |
| `bun run lint` | ESLint |
