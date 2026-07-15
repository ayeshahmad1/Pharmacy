# Build the Pharmacy POS Desktop App (Electron + Windows Installer)

This packages your existing app (Express backend + React frontend + MongoDB Atlas)
into a real Windows desktop application with its own window and an `.exe` installer.
Your source code is bundled inside the app (in `app.asar`), so you are **not** shipping
the raw project folder.

> Build this on a **Windows PC**. electron-builder produces the most reliable
> Windows NSIS installer when run on Windows. Cross-building from Linux/Mac is not
> recommended.

---

## How it works

- `electron-main.js` (project root) sets the bundled Atlas connection string, then
  starts your existing `pharmacy-backend/server.js` on `localhost:5000` and opens a
  desktop window pointing at it.
- The backend serves the already-built frontend from `pharmacy-backend/public` and
  talks to MongoDB Atlas over the internet — exactly like it does today.
- `package.json` (project root) defines the Electron + electron-builder setup.

You changed **none** of your application logic — this is just a wrapper.

---

## Prerequisites

- **Node.js v18+** installed.
- **Internet connection** (the app reads/writes data on Atlas; it will not work offline).
- Backend dependencies installed (`pharmacy-backend/node_modules` already present).

---

## One-time setup

1. Make sure the frontend is built and copied into the backend's `public` folder.
   (Your `public` folder already contains a build. Only redo this if you changed the
   frontend.)

   ```bash
   cd pharmacy-frontend1
   npm run build
   xcopy /E /I /Y "dist\*" "..\pharmacy-backend\public\"
   cd ..
   ```

2. From the **project root**, install the Electron tooling:

   ```bash
   npm install
   ```

---

## Build the installer

From the project root:

```bash
npm run dist
```

When it finishes, the installer is in the new **`dist/`** folder at the project root:

```
dist/Pharmacy POS Setup 1.0.0.exe
```

That single `.exe` is what you give to end users. They double-click it, choose an
install location, and get a Start Menu entry and desktop shortcut for **Pharmacy POS**.

---

## Test before building (optional but recommended)

To run the desktop app without building the installer:

```bash
npm start
```

This opens the app window and confirms the backend boots and connects to Atlas.

---

## Updating the Atlas credentials later

The connection string is bundled in `electron-main.js` (the `process.env.MONGO_URI`
line near the top). To change it, edit that line and run `npm run dist` again.

---

## Notes / tradeoffs

- **Internet required.** Data lives on Atlas, so no connection means the app cannot
  load or save. If you ever need offline operation, that requires a local database
  with sync — a separate change.
- **Bundled credentials.** The Atlas string ships inside the app. A technical user
  who unpacks the installer could read it. Fine for your own pharmacy's machines; if
  you distribute outside, put a small hosted API between the app and Atlas instead.
- **Add an app icon (optional).** Place an `icon.ico` in a `build/` folder at the
  project root, then add `"icon": "build/icon.ico"` under `build.win` in
  `package.json`. Without it, Electron's default icon is used.
- **File size.** The installer will be ~80–150 MB because it includes the Chromium +
  Node runtime. This is normal for Electron apps.
