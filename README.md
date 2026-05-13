# Find Your Feet — Performance Dashboard

A live, browser-based performance dashboard for the **Find Your Feet (FYF)** programme. It pulls data directly from a shared Google Sheets workbook and gives field officers, district managers, and programme team members a clear picture of school-level activity, officer performance, and weekly trends — no backend required.

---

## Features

- **Live Google Sheets integration** — data is fetched on every page load via the Google Visualization API; no manual exports or uploads needed.
- **Four dashboard tabs:**
  - **Overview** — programme-wide KPI cards, officer performance bar chart, school band distribution (donut + colour strip), and quick top-5 / needs-attention school lists.
  - **Officer performance** — ranked bar chart, sortable/searchable officer table, and a per-officer school drill-down.
  - **School performance** — full ranked horizontal bar chart of every school, filterable by district, officer, performance band, and free-text search.
  - **Weekly trends** — reporting-rate line chart by officer across all weeks, week-on-week change table, and a grouped bar chart of average minutes per child by week.
- **Colour-coded performance bands** applied consistently across every chart and table:

  | Band | Range | Meaning |
  |------|-------|---------|
  | 🟢 Excellent | ≥ 100 min | On or above target |
  | 🟩 Good | 90–99 min | Near target |
  | 🟡 Moderate | 70–89 min | Below target |
  | 🟥 At risk | 60–69 min | Needs support |
  | 🔴 Critical | < 60 min | Urgent attention |
  | ⬜ No data | 0 | No sessions recorded |

- **User identification modal** — on first visit the user enters their FYF email and selects a role (Field officer / District manager / Programme team). The value is stored in `localStorage` so subsequent visits skip the modal.
- **Session usage tracking** — a batched event log records tab views, filter interactions, and officer drill-downs, then sends a single summary row to a Google Apps Script endpoint when the tab is closed (or every 2 minutes as a safety net). No individual keystrokes or personal data beyond email/role are captured.

---

## Data sources

The dashboard reads three types of sheet from a single Google Spreadsheet:

| Sheet | Purpose |
|-------|---------|
| **Summary** (`GID_SUMMARY`) | One row per school. Columns include `field_officer`, `school`, a per-week average (`wk1`–`wk13`), and an overall average column. |
| **Allocations** (`GID_ALLOCATIONS`) | Maps `School_Name` → `District`, used for district filtering on the Schools tab. |
| **Weekly sheets** (`wk1`–`wk13`) | One sheet per programme week. Each row contains `field_officer`, a `reporting_perc` column, and an `avg_weekly_minutes_per_child` column. Weeks that have not yet been created are skipped automatically. |

The spreadsheet must be shared as **"Anyone with the link → Viewer"** for the fetch to succeed.

To point the dashboard at a different spreadsheet, update the constants near the top of `main.js`:

```js
const SPREADSHEET_ID = '<your-spreadsheet-id>';
const GID_SUMMARY     = <summary-sheet-gid>;
const GID_ALLOCATIONS = <allocations-sheet-gid>;
```

Each entry in the `WEEKS` array maps a week key and display label to a sheet GID. Set `gid: null` for weeks not yet created — they are skipped silently.

---

## Project structure

```
├── index.html      # Single-page shell — layout, nav tabs, canvas placeholders
├── src/
│   ├── main.js     # All data fetching, processing, chart rendering, and event logic
│   └── style.css   # Dashboard styles (imported by main.js)
```

The project is a standard Vite (or equivalent) single-page app with no server-side code. All chart rendering uses [Chart.js](https://www.chartjs.org/) (imported via `chart.js/auto`).

---

## Getting started

### Prerequisites

- Node.js ≥ 16
- The Google Spreadsheet shared publicly (Viewer access)

### Install and run locally

```bash
npm install
npm run dev
```

### Build for production

```bash
npm run build
```

The output in `dist/` is a set of static files that can be hosted on any static host (GitHub Pages, Netlify, Vercel, etc.).

---

## Usage tracking

Session data is sent to a Google Apps Script web app endpoint (`ENDPOINT` in `main.js`). Each session produces one row containing:

| Field | Description |
|-------|-------------|
| `user` | FYF email address |
| `role` | Selected role |
| `sessionId` | Random ID for the session |
| `duration_s` | Seconds from page load to close |
| `tabs_visited` | Comma-separated list of tabs opened |
| `filters_used` | Count of filter interactions |
| `drilldowns` | Officers whose school breakdown was viewed |
| `event_count` | Total number of tracked interactions |
| `timestamp` | ISO 8601 timestamp |

To disable tracking, remove the `track()` calls and the `flushSession` / `beforeunload` listener from `main.js`.

---

## Customisation notes

- **Performance thresholds** — edit the `BANDS` array in `main.js` to change the minute ranges or colours.
- **Number of weeks** — add or remove entries in the `WEEKS` array; the charts and tables adapt automatically.
- **Officer colours** — edit the `OFFICER_COLORS` array to change the palette used in line and grouped bar charts.
- **District label** — the Overview KPI card currently hard-codes "Across 5 districts". Update the string in `buildOverview()` if the number of districts changes.