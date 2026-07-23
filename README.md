# Paris Air Parts Picker

A desktop application for managing parts requests and logistics, built with Electron, React, and TypeScript.

## 🚀 Getting Started

If you have received this source code and want to run it or build the application yourself, follow these steps:

### 1. Prerequisites
You must have **Node.js** installed on your computer.
- [Download Node.js](https://nodejs.org/) (Recommended: LTS version — Node.js 22 or later)

### 2. Installation
Open a terminal in this project folder and run:
```bash
npm run install:full
```

This single command handles the full three-step setup:
1. `npm install --ignore-scripts` — installs packages without triggering native build scripts
2. `node node_modules/electron/install.js` — downloads the Electron binary (skipped by `--ignore-scripts`)
3. `electron-rebuild -f -w better-sqlite3` — compiles the SQLite native module against Electron's Node.js runtime

> **Why not just `npm install`?**
> `better-sqlite3` is a native Node.js module. A plain `npm install` tries to compile it against your system Node.js, which can fail if the compiler doesn't meet version requirements. The steps above compile it specifically for the Electron runtime instead. You will need to repeat `npm run rebuild` any time you upgrade Electron or do a fresh install.

### 3. Development
To run the application in development mode:
```bash
npm run dev
```

### 4. Building the Installer
To generate the standalone Windows installer and portable executable:
```bash
npm run build
```
The output files will be created in the `release/` folder.

### Rebuilding the Native Module
If you upgrade Electron or reinstall dependencies, rebuild the SQLite native module:
```bash
npm run rebuild
```

## 🛠 Tech Stack
- **Frontend:** React 19, Vite 7, Tailwind CSS 4
- **Desktop Wrapper:** Electron 40
- **Data Persistence:** SQLite (via better-sqlite3), stored at `~/Documents/parts_requests.db`
- **Icons:** Lucide React
- **Routing:** React Router v7
- **Linting:** ESLint 9 (flat config) + typescript-eslint
- **Excel Export:** ExcelJS 4

## 📁 Database Location
| Platform | Path |
|---|---|
| macOS | `~/Documents/parts_requests.db` |
| Windows | `C:\Users\<username>\Documents\parts_requests.db` |
| Linux | `~/Documents/parts_requests.db` |

The database path can be changed at runtime from the Parts Dashboard. The app will create the file automatically on first launch if it does not exist.
