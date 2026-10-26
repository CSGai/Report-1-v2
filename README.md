# Report-1-v2

![Node.js](https://img.shields.io/badge/Node.js%20%3E%3D22-339933?style=flat&logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat)
![Created](https://img.shields.io/badge/Created-March%202026-lightgrey?style=flat)

Made in March 2026.

Submits your weekly דוח 1 (Report 1) attendance on one.prat.idf.il from a JSON plan, with no browser.

Filling in דוח 1 by hand, every day or every week depending on the situation, was a pain, so
this bot does it instead :). It signs in to the site the way the browser does, reconstructed using requests (Microsoft Entra, password, SMS code, OAuth token), then posts a report for today and each of the next seven days
from a weekly plan in [config/weeklyCalendarPlan.json](config/weeklyCalendarPlan.json).


## 📑 Table of Contents

- [Build](#-build)
- [Usage](#-usage)
- [Architecture](#-architecture)
- [Outputs](#-calls)
- [License](#-license)

## 🔨 Build

### Node

Requires Node.js 22 or newer (the project relies on `--env-file` and `import ... with { type: "json" }`).

```bash
npm install
```

### Dependencies

| dependency | version | how it is obtained |
|---|---|---|
| `fetch-cookie` | ^3.2.0 | `npm install` |
| `tough-cookie` | ^6.0.1 | `npm install` |

Both wrap Node's built-in `fetch` so cookies persist across the login redirects.

## 🚀 Usage

1. Copy `.env.example` to `.env` and fill it in (see [Configuration](#configuration)).
2. Set your weekly plan, either by editing
   [config/weeklyCalendarPlan.json](config/weeklyCalendarPlan.json) directly or with the menu:

   ```bash
   npm run plan
   ```

   The script walks through Sunday to Saturday, offers the main and secondary attendance codes
   from [config/calendarCodes.json](config/calendarCodes.json) (shown in Hebrew), asks for an
   optional note, and writes the plan back out. Press Enter at any prompt to keep the current
   value. It runs in PowerShell, so this step is Windows only; on other platforms edit the JSON.
3. Run the bot:

   ```bash
   npm start
   ```

   or double-click [scripts/run_bot.bat](scripts/run_bot.bat). The bot signs in, asks you to
   type the SMS code it triggered, then submits the eight reports (today plus the next seven days) and prints a
   table of the API responses.

Each day's report uses the `MainCode`, `SecondaryCode` and `Note` of its weekday from the plan.
The `FutureReportDate` field in the plan file is a placeholder (`dd.mm.20YY`); the bot fills in
the real date for today and each of the next seven days at run time.

### Configuration

Environment variables, read from `.env` via `node --env-file`:

| variable | meaning |
|---|---|
| `USER_ID` | Your personal number. The bot signs in as `<USER_ID>@idf.il`. |
| `USER_PASSWORD` | Your Microsoft account password. |

Config files:

| file | purpose |
|---|---|
| [config/weeklyCalendarPlan.json](config/weeklyCalendarPlan.json) | One entry per weekday with `MainCode`, `SecondaryCode`, `Note` and `FutureReportDate`. |
| [config/calendarCodes.json](config/calendarCodes.json) | The attendance categories the site accepts: each primary code and its secondary codes, keyed by Hebrew label. Used only by the plan editor. |

`.env` and other secrets are ignored by git (see [.gitignore](.gitignore)); only `.env.example`
is tracked.

## 📂 Architecture

```
src/
  main.js                  entry point: login, דוח 1 session, submit the week
  microsoftLogin.js        Microsoft Entra sign-in, SMS MFA, PKCE token exchange
  calendarHandler.js       report-days helper (today plus seven) and the InsertFutureReport call
config/
  weeklyCalendarPlan.json  what to report on each weekday
  calendarCodes.json       attendance code catalogue for the plan editor
scripts/
  calendarSetup.ps1        interactive plan editor (npm run plan)
  run_bot.bat              double-click launcher (npm start)
examples/                  sanitised captures of the login pages and API payloads
```

## 📤 Calls

| endpoint | purpose |
|---|---|
| `POST https://login.microsoftonline.com/<tenant>/login` | password sign-in |
| `POST https://login.microsoftonline.com/common/SAS/{BeginAuth,EndAuth,ProcessAuth}` | SMS MFA |
| `GET https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize` | PKCE authorization code |
| `POST https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token` | code to `id_token` exchange |
| `GET https://one.prat.idf.il/api/account/login` | דוח 1 session |
| `POST https://one.prat.idf.il/api/Attendance/InsertFutureReport` | one multipart form per day: `MainCode`, `SecondaryCode`, `Note`, `FutureReportDate` (`dd.mm.yyyy`) |


## 📄 License

MIT © 2026 CSGai