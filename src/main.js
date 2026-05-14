import Chart from 'chart.js/auto';

import './style.css';

/* ============================================================
   RANKING SYSTEM
   ============================================================ */
const BANDS = [
  { key: 'dkgreen', min: 100,  max: Infinity, label: '≥ 100',   bg: '#E8F5E9', color: '#1B5E20', barColor: '#1B5E20' },
  { key: 'ltgreen', min: 90,   max: 100,      label: '90–99',   bg: '#C8E6C9', color: '#388E3C', barColor: '#4CAF50' },
  { key: 'yellow',  min: 70,   max: 90,       label: '70–89',   bg: '#FFF8E1', color: '#F57F17', barColor: '#FFD54F' },
  { key: 'ltred',   min: 60,   max: 70,       label: '60–69',   bg: '#FFEBEE', color: '#C62828', barColor: '#FF8A80' },
  { key: 'dkred',   min: 0.01, max: 60,       label: '< 60',    bg: '#FCE4EC', color: '#B71C1C', barColor: '#B71C1C' },
  { key: 'grey',    min: 0,    max: 0.01,     label: 'No data', bg: '#F5F5F5', color: '#757575', barColor: '#BDBDBD' },
];

function getBand(val) {
  if (val === null || val === undefined || isNaN(val)) return BANDS[5];
  if (val === 0) return BANDS[5];
  for (const b of BANDS) {
    if (val >= b.min && val < b.max) return b;
  }
  return BANDS[4];
}

function bandBadge(val) {
  const b = getBand(val);
  return `<span class="rbadge" style="background:${b.bg};color:${b.color};">${val > 0 ? val.toFixed(1) : 'N/A'}</span>`;
}

/* ============================================================
   GOOGLE SHEETS FETCH
   ============================================================ */
// const SPREADSHEET_ID = '1i9keM9OSk0NDecfH95vyIaBdmKNyxIHI';
const SPREADSHEET_ID = '1N4OBwHlxLrBOL9FQBfB0RTlEVXp-37QhMBl0npxSXc4';
const GID_SUMMARY     = 1133081492;
const GID_ALLOCATIONS = 309108333;

// All 13 weeks. Set gid: null for weeks not yet created — they are skipped automatically.
const WEEKS = [
  { key: 'wk1',  label: '20 Apr', gid: 1852410889 },
  { key: 'wk2',  label: '27 Apr', gid: 251846674  },
  { key: 'wk3',  label: '4 May',  gid: 372090322  },
  { key: 'wk4',  label: '11 May', gid: 1027220559 },
  { key: 'wk5',  label: '18 May', gid: 1266847429 },
  { key: 'wk6',  label: '25 May', gid: 1927347071 },
  { key: 'wk7',  label: '1 Jun',  gid: 984748771  },
  { key: 'wk8',  label: '8 Jun',  gid: 1662313423 },
  { key: 'wk9',  label: '15 Jun', gid: 2095134889 },
  { key: 'wk10', label: '22 Jun', gid: 112232220  },
  { key: 'wk11', label: '29 Jun', gid: 49633578   },
  { key: 'wk12', label: '6 Jul',  gid: 1322648186 },
  { key: 'wk13', label: '13 Jul', gid: 1949096562 },
];

async function getSheetByGid(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}&_cb=${Date.now()}`;
  const res  = await fetch(url);
  const text = await res.text();
  if (!text.includes('google.visualization.Query.setResponse')) {
    throw new Error('Spreadsheet not publicly accessible. Share it as "Anyone with the link → Viewer".');
  }
  // const json = JSON.parse(text.substring(47).slice(0, -2));
  const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
  const cols = json.table.cols;
  const rows = json.table.rows;
  return rows.map(row => {
    const obj = {};
    cols.forEach((col, i) => {
      obj[col.label || `column_${i}`] = row.c[i] ? row.c[i].v : null;
    });
    return obj;
  });
}

/* ── Loading log helpers ──────────────────────────────────────── */
let _loadStart = 0;

function logStep(msg, status = 'running') {
  const log = document.getElementById('load-log');
  if (!log) return;
  const elapsed = ((Date.now() - _loadStart) / 1000).toFixed(1);

  // Complete the previous running item
  log.querySelectorAll('.log-row.running').forEach(row => {
    row.classList.remove('running');
    row.classList.add('done');
    const icon = row.querySelector('.log-icon');
    if (icon) icon.textContent = '✓';
    const t = row.querySelector('.log-time');
    if (t) t.textContent = elapsed + 's';
  });

  if (status === 'final') return; // Just close the last item

  const row = document.createElement('div');
  row.className = 'log-row ' + status;
  row.innerHTML = `<span class="log-icon">${status === 'error' ? '✕' : '◌'}</span><span class="log-msg">${msg}</span><span class="log-time"></span>`;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

async function getAllSheets() {
  _loadStart = Date.now();
  const result = { weeks: [] };

  logStep('Initialising connection to Google Sheets');
  result.summary = await getSheetByGid(GID_SUMMARY);

  logStep('Loading allocations sheet');
  result.allocations = await getSheetByGid(GID_ALLOCATIONS);

  const activeWeeks = WEEKS.filter(w => w.gid);
  logStep(`Loading ${activeWeeks.length} weekly data sheets`);

  for (const wk of activeWeeks) {
    try {
      logStep(`Fetching week: ${wk.label}`);
      const rows = await getSheetByGid(wk.gid);
      if (rows.length > 0) result.weeks.push({ ...wk, rows });
    } catch (_) {
      // Sheet exists in list but not yet populated — skip silently
    }
  }

  logStep('', 'final'); // Close last row
  return result;
}

// ── Tracking setup ──────────────────────────────
const SESSION_ID = Math.random().toString(36).slice(2);
const ENDPOINT   = 'https://script.google.com/macros/s/AKfycbx_Rl9Ltzcwr7x9Wo_ijCm8oQLdEHVZz9-Z7xL4c3Qm3cGUrdwLmh_27623IlLpsT3cQw/exec';
const SESSION_START = Date.now();

function showUserModal(onConfirm) {
  const overlay  = document.getElementById('user-overlay');
  const nameInput = document.getElementById('modal-name');
  const submitBtn = document.getElementById('modal-submit');
  let selectedRole = '';

  document.querySelectorAll('.role-opt').forEach(btn => {
    btn.style.cssText = 'flex:1;padding:7px 4px;font-size:12px;border:1px solid #ddd;border-radius:8px;background:#f5f5f5;cursor:pointer;';
    btn.addEventListener('click', () => {
      document.querySelectorAll('.role-opt').forEach(b => {
        b.style.background = '#f5f5f5'; b.style.borderColor = '#ddd'; b.style.color = '#333';
      });
      btn.style.background = '#E8F5E9'; btn.style.borderColor = '#1B5E20'; btn.style.color = '#1B5E20';
      selectedRole = btn.dataset.role;
      checkValid();
    });
  });

  function checkValid() {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nameInput.value.trim());
    const ok = emailOk && selectedRole;
    submitBtn.disabled = !ok;
    submitBtn.style.opacity = ok ? '1' : '0.4';
    submitBtn.style.cursor  = ok ? 'pointer' : 'default';
  }

  nameInput.addEventListener('input', checkValid);

  submitBtn.addEventListener('click', () => {
    const email = nameInput.value.trim().toLowerCase();
    localStorage.setItem('tot_user',      email);
    localStorage.setItem('tot_user_role', selectedRole);
    overlay.style.display = 'none';
    onConfirm(email, selectedRole);
  });
}

// In your init(), replace the prompt() block with:
let CURRENT_USER = localStorage.getItem('tot_user');
let CURRENT_ROLE = localStorage.getItem('tot_user_role');

// Clear stale value if it's not a valid email (e.g. a name stored previously)
if (CURRENT_USER && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CURRENT_USER)) {
  localStorage.removeItem('tot_user');
  localStorage.removeItem('tot_user_role');
  CURRENT_USER = null;
  CURRENT_ROLE = null;
}

// ── Batched tracking ─────────────────────────────────────────
// Accumulates events in memory and flushes a single summary row
// when the session ends (or every 2 min as a safety net).
// This keeps the sheet clean and avoids Apps Script quota issues.

const EVENT_LOG = [];
let   flushTimer = null;

function track(event, detail = '') {
  // Deduplicate rapid identical events (e.g. fast tab clicks)
  const last = EVENT_LOG[EVENT_LOG.length - 1];
  if (last && last.event === event && last.detail === detail) return;

  EVENT_LOG.push({ event, detail, t: Date.now() });

  // Safety flush every 2 minutes in case tab is never closed
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushSession, 2 * 60 * 1000);
}

function flushSession() {
  if (!EVENT_LOG.length) return;
  clearTimeout(flushTimer);

  const duration    = Math.round((Date.now() - SESSION_START) / 1000);
  const tabsVisited = [...new Set(EVENT_LOG.filter(e => e.event === 'tab_view').map(e => e.detail))];
  const filtersUsed = EVENT_LOG.filter(e => e.event === 'filter_used').length;
  const drilldowns  = [...new Set(EVENT_LOG.filter(e => e.event === 'officer_drilldown').map(e => e.detail))];

  navigator.sendBeacon(ENDPOINT, JSON.stringify({
    user:         CURRENT_USER,
    role:         CURRENT_ROLE,
    sessionId:    SESSION_ID,
    event:        'session_summary',
    duration_s:   duration,
    tabs_visited: tabsVisited.join(', '),
    filters_used: filtersUsed,
    drilldowns:   drilldowns.join(', '),
    event_count:  EVENT_LOG.length,
    timestamp:    new Date().toISOString(),
  }));
}

// Flush on tab close / navigate away
window.addEventListener('beforeunload', flushSession);

/* ============================================================
   DATA PROCESSING
   ============================================================ */
let OFFICERS      = [];
let SCHOOLS       = [];
let WEEKLY_DATA   = {};
let SCHOOL_WEEKLY = {}; // { schoolName: { wkKey: avgMinPerChild } }
let RAW           = {};
let offSortKey  = 'perf';
let offSchoolChart  = null;
let schoolRankChart = null;

function processData(raw) {
  RAW = raw;
  WEEKLY_DATA   = {};
  SCHOOL_WEEKLY = {};

  const summaryRaw = raw.summary.filter(r => r.field_officer && r.school);

  if (!summaryRaw.length) throw new Error('Summary sheet returned no data.');
  const wkCols = Object.keys(summaryRaw[0] || {}).filter(k => /^wk\d+$/i.test(k));
  const avgCol = Object.keys(summaryRaw[0] || {}).find(k => /time.on.task/i.test(k));

  SCHOOLS = summaryRaw.map(r => {
    let avg = r[avgCol] !== null ? parseFloat(r[avgCol]) : null;
    if (avg === null || isNaN(avg)) avg = 0;
    return {
      name:    r.school,
      officer: r.field_officer,
      avg:     parseFloat(avg.toFixed(2)),
      weeks:   wkCols.map(c => r[c] !== null ? parseFloat(r[c]) : null),
    };
  });

  const offMap = {};
  SCHOOLS.forEach(s => {
    if (!offMap[s.officer]) offMap[s.officer] = { name: s.officer, schools: [] };
    offMap[s.officer].schools.push(s.name);
  });
  // Build OFFICERS with placeholder avg=0; recalculated below after weekly data is loaded
  OFFICERS = Object.values(offMap).map(o => ({
    name:        o.name,
    schoolCount: o.schools.length,
    avg:         0,
  }));

  raw.weeks.forEach(ws => {
    const rows      = ws.rows.filter(r => r.field_officer);
    const repCol    = Object.keys(rows[0] || {}).find(k => /reporting_perc|reporting/i.test(k));
    const minCol    = Object.keys(rows[0] || {}).find(k => /session.duration/i.test(k));
    const avgMinCol = Object.keys(rows[0] || {}).find(k => /avg_weekly_minutes_per_child/i.test(k));
    rows.forEach(r => {
      const off    = r.field_officer;
      const school = r.school;
      if (!WEEKLY_DATA[off])         WEEKLY_DATA[off] = {};
      if (!WEEKLY_DATA[off][ws.key]) WEEKLY_DATA[off][ws.key] = { repPcts: [], mins: [], avgMins: [] };
      if (repCol    && r[repCol]    !== null) WEEKLY_DATA[off][ws.key].repPcts.push(parseFloat(r[repCol]));
      if (minCol    && r[minCol]    !== null) WEEKLY_DATA[off][ws.key].mins.push(parseFloat(r[minCol]));
      if (avgMinCol && r[avgMinCol] !== null) WEEKLY_DATA[off][ws.key].avgMins.push(parseFloat(r[avgMinCol]));
      // Per-school weekly TOT (avg_weekly_minutes_per_child)
      if (school && avgMinCol && r[avgMinCol] !== null) {
        if (!SCHOOL_WEEKLY[school]) SCHOOL_WEEKLY[school] = {};
        SCHOOL_WEEKLY[school][ws.key] = parseFloat(r[avgMinCol]);
      }
    });
  });

  // Recalculate officer avg from weekly avgMins (avg_weekly_minutes_per_child)
  // This is reliable — cross-sheet VLOOKUPs in the summary sheet resolve to null via GViz
  OFFICERS = OFFICERS.map(o => {
    const allVals = Object.values(WEEKLY_DATA[o.name] || {})
      .flatMap(wk => wk.avgMins);
    const avg = allVals.length
      ? parseFloat((allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(2))
      : 0;
    return { ...o, avg };
  });

  // Recalculate SCHOOLS avg from weekly avgMins per school name
  SCHOOLS = SCHOOLS.map(s => {
    const schoolWeeklyAvgs = raw.weeks.map(ws => {
      const row = ws.rows.find(r => r.field_officer && r.school === s.name);
      if (!row) return null;
      const avgMinCol = Object.keys(row).find(k => /avg_weekly_minutes_per_child/i.test(k));
      return (avgMinCol && row[avgMinCol] !== null) ? parseFloat(row[avgMinCol]) : null;
    }).filter(v => v !== null);
    const avg = schoolWeeklyAvgs.length
      ? parseFloat((schoolWeeklyAvgs.reduce((a, b) => a + b, 0) / schoolWeeklyAvgs.length).toFixed(2))
      : 0;
    return { ...s, avg };
  });
}

/* ============================================================
   UTILITIES
   ============================================================ */
const OFFICER_COLORS = [
  '#1B5E20', '#1565C0', '#6A1B9A', '#E65100', '#37474F',
  '#880E4F', '#0277BD', '#2E7D32', '#4A148C', '#BF360C',
];

function offColor(name) {
  // const idx = OFFICERS.findIndex(o => o.name === name);
  const idx = Math.max(0, OFFICERS.findIndex(o => o.name === name));
  return OFFICER_COLORS[idx % OFFICER_COLORS.length];
}

function bandCounts() {
  const counts = {};
  BANDS.forEach(b => (counts[b.key] = 0));
  SCHOOLS.forEach(s => { const b = getBand(s.avg); counts[b.key]++; });
  return counts;
}

function destroyChart(id) {
  const existing = Chart.getChart(id);
  if (existing) existing.destroy();
}

function shortSchoolName(name) {
  return name.replace(' Primary School', '').replace(' LEA School', '').replace(' School', '');
}

/* ============================================================
   OVERVIEW TAB
   ============================================================ */
function buildOverview() {
  const topOff  = [...OFFICERS].sort((a, b) => b.avg - a.avg)[0];
  const atRisk  = SCHOOLS.filter(s => s.avg > 0 && s.avg < 60).length;
  const noData  = SCHOOLS.filter(s => s.avg === 0).length;
  const allAvg  = SCHOOLS.filter(s => s.avg > 0);
  const grandAvg = allAvg.length
    ? (allAvg.reduce((a, s) => a + s.avg, 0) / allAvg.length).toFixed(1)
    : '—';

  document.getElementById('ov-metrics').innerHTML = `
    <div class="metric-card accent"><div class="metric-label">Total schools</div><div class="metric-value">${SCHOOLS.length}</div><div class="metric-sub">Across 5 districts</div></div>
    <div class="metric-card"><div class="metric-label">Field officers</div><div class="metric-value">${OFFICERS.length}</div><div class="metric-sub">Active this period</div></div>
    <div class="metric-card"><div class="metric-label">Programme avg</div><div class="metric-value">${grandAvg}</div><div class="metric-sub">avg weekly min/child</div></div>
    <div class="metric-card"><div class="metric-label">Top officer</div><div class="metric-value" style="font-size:14px;line-height:1.4;">${topOff?.name.split(' ')[0] || '—'}</div><div class="metric-sub">${topOff?.avg.toFixed(1)} min/child/week avg</div></div>
    <div class="metric-card"><div class="metric-label">Critical schools</div><div class="metric-value" style="color:#B71C1C;">${atRisk}</div><div class="metric-sub" style="color:#B71C1C;">&lt; 60 min/child</div></div>
    <div class="metric-card"><div class="metric-label">No data</div><div class="metric-value" style="color:#757575;">${noData}</div><div class="metric-sub">0 recorded sessions</div></div>`;

  const bc    = bandCounts();
  const strip = document.getElementById('ov-band-strip');
  strip.innerHTML = BANDS.map(b =>
    `<div class="band-seg" style="background:${b.bg};color:${b.color};" data-band-filter="${b.key}">
       <span class="band-count">${bc[b.key]}</span>${b.label}
     </div>`
  ).join('');

  // Band-strip click: switch to Schools tab filtered by band
  strip.querySelectorAll('.band-seg').forEach(seg => {
    seg.addEventListener('click', () => {
      switchTab('schools');
      setTimeout(() => {
        document.getElementById('school-band-sel').value = seg.dataset.bandFilter;
        renderSchoolChart();
      }, 100);
    });
  });

  destroyChart('ov-donut');
  new Chart(document.getElementById('ov-donut'), {
    type: 'doughnut',
    data: {
      labels:   BANDS.map(b => b.label),
      datasets: [{ data: BANDS.map(b => bc[b.key]), backgroundColor: BANDS.map(b => b.barColor), borderWidth: 0, hoverOffset: 4 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' },
  });

  const sortedOff = [...OFFICERS].sort((a, b) => b.avg - a.avg);
  destroyChart('ov-officer-chart');
  new Chart(document.getElementById('ov-officer-chart'), {
    type: 'bar',
    data: {
      labels:   sortedOff.map(o => o.name.split(' ')[0]),
      datasets: [{ label: 'Avg weekly min/child', data: sortedOff.map(o => o.avg), backgroundColor: sortedOff.map(o => getBand(o.avg).barColor), borderRadius: 4 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f0ede7' }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } },
  });

  const sortedSchools = [...SCHOOLS].sort((a, b) => b.avg - a.avg);
  const top5 = sortedSchools.filter(s => s.avg > 0).slice(0, 5);
  const bot5 = [...SCHOOLS].filter(s => s.avg >= 0 && s.avg < 60).sort((a, b) => a.avg - b.avg).slice(0, 5);

  document.getElementById('ov-top-schools').innerHTML = top5.map((s, i) => `
    <li class="school-item">
      <div class="rank-num ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''}">${i + 1}</div>
      <span class="school-name">${s.name}</span>
      <span class="school-off">${s.officer.split(' ')[0]}</span>
      ${bandBadge(s.avg)}
    </li>`).join('');

  document.getElementById('ov-bottom-schools').innerHTML = bot5.map(s => `
    <li class="school-item">
      <div class="rank-num"></div>
      <span class="school-name">${s.name}</span>
      <span class="school-off">${s.officer.split(' ')[0]}</span>
      ${bandBadge(s.avg)}
    </li>`).join('');
}

/* ============================================================
   OFFICERS TAB
   ============================================================ */
function buildOfficers() {
  const sorted = [...OFFICERS].sort((a, b) => b.avg - a.avg);
  destroyChart('off-rank-chart');
  new Chart(document.getElementById('off-rank-chart'), {
    type: 'bar',
    data: {
      labels:   sorted.map(o => o.name),
      datasets: [{ label: 'Avg weekly min/child', data: sorted.map(o => o.avg), backgroundColor: sorted.map(o => getBand(o.avg).barColor), borderRadius: 4 }],
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#f0ede7' }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } } },
  });

  renderOfficerTable('');

  const pills = document.getElementById('off-pills');
  pills.innerHTML = OFFICERS.map(o =>
    `<div class="officer-pill" data-officer="${o.name}">${o.name.split(' ')[0]}</div>`
  ).join('');

  pills.querySelectorAll('.officer-pill').forEach(pill => {
    pill.addEventListener('click', () => selectOfficer(pill, pill.dataset.officer));
  });
}

function renderOfficerTable(search = '') {
  let data = [...OFFICERS];
  if (search) data = data.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
  if (offSortKey === 'perf')   data.sort((a, b) => b.avg - a.avg);
  else if (offSortKey === 'schools') data.sort((a, b) => b.schoolCount - a.schoolCount);
  else data.sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById('off-tbody').innerHTML = data.map((o, i) => `
    <tr>
      <td style="color:var(--muted);font-size:11px;">${i + 1}</td>
      <td><div style="font-weight:500;font-size:12px;">${o.name}</div></td>
      <td style="color:var(--muted);">${o.schoolCount}</td>
      <td><div class="prog-wrap">
        <div class="prog-bar"><div class="prog-fill" style="width:${Math.min(100, o.avg / 140 * 100).toFixed(1)}%;background:${getBand(o.avg).barColor};"></div></div>
        <span class="prog-val" style="color:${getBand(o.avg).color};">${o.avg.toFixed(1)}</span>
      </div></td>
      <td>${bandBadge(o.avg)}</td>
    </tr>`).join('');
}

function selectOfficer(el, name) {
  document.querySelectorAll('.officer-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const schools = SCHOOLS.filter(s => s.officer === name).sort((a, b) => b.avg - a.avg);
  destroyChart('off-school-chart');
  offSchoolChart = new Chart(document.getElementById('off-school-chart'), {
    type: 'bar',
    data: {
      labels:   schools.map(s => shortSchoolName(s.name)),
      datasets: [{ label: 'Avg weekly min/child', data: schools.map(s => s.avg), backgroundColor: schools.map(s => getBand(s.avg).barColor), borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: true, text: name + ' — school breakdown', font: { size: 11 }, color: '#7a756d' } },
      scales: { y: { beginAtZero: true, grid: { color: '#f0ede7' }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 35 } } },
    },
  });
  track('officer_drilldown', name);
}

/* ============================================================
   SCHOOLS TAB
   ============================================================ */
function buildSchoolFilters() {
  const osel = document.getElementById('school-officer-sel');
  [...new Set(SCHOOLS.map(s => s.officer))].sort().forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    osel.appendChild(opt);
  });

  osel.addEventListener('change', renderSchoolChart);
  document.getElementById('school-band-sel').addEventListener('change', renderSchoolChart);
  document.getElementById('school-search').addEventListener('input',   renderSchoolChart);
}

function renderSchoolChart() {
  const officer  = document.getElementById('school-officer-sel').value;
  const band     = document.getElementById('school-band-sel').value;
  const search   = (document.getElementById('school-search')?.value || '').toLowerCase();

  let data = [...SCHOOLS];
  if (officer)  data = data.filter(s => s.officer === officer);
  if (band)     data = data.filter(s => getBand(s.avg).key === band);
  if (search)   data = data.filter(s => s.name.toLowerCase().includes(search));

  data.sort((a, b) => b.avg - a.avg);
  document.getElementById('school-count-lbl').textContent = data.length + ' schools';

  const h = Math.max(400, data.length * 28 + 80);
  document.getElementById('school-chart-wrap').style.height = h + 'px';

  destroyChart('school-rank-chart');
  schoolRankChart = new Chart(document.getElementById('school-rank-chart'), {
    type: 'bar',
    data: {
      labels:   data.map(s => shortSchoolName(s.name)),
      datasets: [{ label: 'Avg weekly min/child', data: data.map(s => s.avg), backgroundColor: data.map(s => getBand(s.avg).barColor), borderRadius: 3 }],
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#f0ede7' }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } } },
  });

  track('filter_used', `officer:${officer} band:${band}`);
}

/* ============================================================
   WEEKLY TAB
   ============================================================ */
function buildWeekly() {
  const loadedWeeks = RAW.weeks;
  const wkKeys      = loadedWeeks.map(w => w.key);
  const wkLabels    = loadedWeeks.map(w => w.label);
  const offNames    = OFFICERS.map(o => o.name);

  // Reporting rate trend — repPcts (reporting_perc)
  const datasets = offNames.map((name, i) => {
    const color = OFFICER_COLORS[i % OFFICER_COLORS.length];
    const vals  = wkKeys.map(wk => {
      const d = WEEKLY_DATA[name]?.[wk];
      if (!d || !d.repPcts.length) return null;
      return parseFloat((d.repPcts.reduce((a, b) => a + b, 0) / d.repPcts.length).toFixed(1));
    });
    return {
      label: name.split(' ')[0], data: vals,
      borderColor: color, backgroundColor: 'transparent',
      pointBackgroundColor: color, tension: 0.3, borderWidth: 2, pointRadius: 4,
      borderDash: i >= 5 ? [4, 3] : [],
    };
  });

  destroyChart('wk-line-chart');
  new Chart(document.getElementById('wk-line-chart'), {
    type: 'line',
    data: { labels: wkLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } } },
      scales: {
        y: { beginAtZero: false, min: 30, max: 105, grid: { color: '#f0ede7' }, ticks: { font: { size: 10 }, callback: v => v + '%' } },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });

  document.getElementById('wk-thead').innerHTML = '<tr><th>Officer</th>' +
    wkLabels.map(l => `<th>${l}</th>`).join('') + '<th>Change</th><th>Band (avg)</th></tr>';

  // Week-on-week change table — avgMins (avg_weekly_minutes_per_child)
  document.getElementById('wk-tbody').innerHTML = offNames.map(name => {
    const vals = wkKeys.map(wk => {
      const d = WEEKLY_DATA[name]?.[wk];
      if (!d || !d.avgMins.length) return null;
      return parseFloat((d.avgMins.reduce((a, b) => a + b, 0) / d.avgMins.length).toFixed(1));
    });
    const nonNull = vals.filter(v => v !== null);
    const v1    = nonNull[0]    ?? null;
    const vLast = nonNull[nonNull.length - 1] ?? null;
    const change = (v1 !== null && vLast !== null && v1 !== vLast) ? (vLast - v1).toFixed(1) : null;
    const changeHtml = change === null
      ? '<span class="wow-flat">—</span>'
      : parseFloat(change) > 1
        ? `<span class="wow-up">↑ ${Math.abs(change)}</span>`
        : parseFloat(change) < -1
          ? `<span class="wow-dn">↓ ${Math.abs(change)}</span>`
          : `<span class="wow-flat">~ ${Math.abs(change)}</span>`;
    // Band uses the mean of all loaded weekly avgMins values — same data as the table cells
    const bandVal = nonNull.length
      ? parseFloat((nonNull.reduce((a, b) => a + b, 0) / nonNull.length).toFixed(1))
      : 0;
    return `<tr>
      <td style="font-weight:500;">${name.split(' ')[0]}</td>
      ${vals.map(v => `<td>${v !== null ? v : '—'}</td>`).join('')}
      <td>${changeHtml}</td>
      <td>${bandBadge(bandVal)}</td>
    </tr>`;
  }).join('');

  // Avg min per child by week — mins (session duration)
  const wkMinDatasets = offNames.map((name, i) => {
    const color = OFFICER_COLORS[i % OFFICER_COLORS.length];
    const vals  = wkKeys.map(wk => {
      const d = WEEKLY_DATA[name]?.[wk];
      if (!d || !d.mins.length) return 0;
      return parseFloat((d.mins.reduce((a, b) => a + b, 0) / d.mins.length).toFixed(1));
    });
    return {
      label: name.split(' ')[0], data: vals,
      backgroundColor: color + '99', borderColor: color, borderWidth: 1, borderRadius: 2,
    };
  });

  destroyChart('wk-min-chart');
  new Chart(document.getElementById('wk-min-chart'), {
    type: 'bar',
    data: { labels: wkLabels, datasets: wkMinDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 6 } } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f0ede7' }, ticks: { font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      },
    },
  });
}

/* ============================================================
   W.O.W SCHOOL CHANGES TAB
   ============================================================ */
function buildSchoolWow() {
  const loadedWeeks = RAW.weeks;
  const wkKeys      = loadedWeeks.map(w => w.key);
  const wkLabels    = loadedWeeks.map(w => w.label);

  // Build officer filter options
  const owFilter = document.getElementById('wow-officer-sel');
  if (owFilter.options.length === 1) {
    [...new Set(SCHOOLS.map(s => s.officer))].sort().forEach(o => {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      owFilter.appendChild(opt);
    });
    owFilter.addEventListener('change', () => renderSchoolWowTable(wkKeys, wkLabels));
    document.getElementById('wow-search').addEventListener('input', () => renderSchoolWowTable(wkKeys, wkLabels));
    document.getElementById('wow-band-sel').addEventListener('change', () => renderSchoolWowTable(wkKeys, wkLabels));
  }

  renderSchoolWowTable(wkKeys, wkLabels);
}

function renderSchoolWowTable(wkKeys, wkLabels) {
  const officer = document.getElementById('wow-officer-sel').value;
  const band    = document.getElementById('wow-band-sel').value;
  const search  = (document.getElementById('wow-search').value || '').toLowerCase();

  let schools = [...SCHOOLS];
  if (officer) schools = schools.filter(s => s.officer === officer);
  if (band)    schools = schools.filter(s => getBand(s.avg).key === band);
  if (search)  schools = schools.filter(s => s.name.toLowerCase().includes(search));

  // Sort by change (biggest drop first so attention goes to declining schools)
  schools = schools.map(s => {
    const vals = wkKeys.map(wk => SCHOOL_WEEKLY[s.name]?.[wk] ?? null);
    const nonNull = vals.filter(v => v !== null);
    const v1    = nonNull[0]    ?? null;
    const vLast = nonNull[nonNull.length - 1] ?? null;
    const change = (v1 !== null && vLast !== null && v1 !== vLast)
      ? parseFloat((vLast - v1).toFixed(1)) : null;
    return { ...s, vals, change };
  }).sort((a, b) => {
    // null changes go last; otherwise biggest drop first
    if (a.change === null && b.change === null) return 0;
    if (a.change === null) return 1;
    if (b.change === null) return -1;
    return a.change - b.change;
  });

  // Thead
  document.getElementById('wow-school-thead').innerHTML =
    '<tr><th>School</th><th>Officer</th>' +
    wkLabels.map(l => `<th>${l}</th>`).join('') +
    '<th>Change</th><th>Band (avg)</th></tr>';

  // Tbody
  document.getElementById('wow-school-tbody').innerHTML = schools.map(s => {
    const changeHtml = s.change === null
      ? '<span class="wow-flat">—</span>'
      : s.change > 1
        ? `<span class="wow-up">↑ ${s.change}</span>`
        : s.change < -1
          ? `<span class="wow-dn">↓ ${Math.abs(s.change)}</span>`
          : `<span class="wow-flat">~ ${Math.abs(s.change)}</span>`;
    const nonNull = s.vals.filter(v => v !== null);
    const bandVal = nonNull.length
      ? parseFloat((nonNull.reduce((a, b) => a + b, 0) / nonNull.length).toFixed(1)) : 0;
    return `<tr>
      <td style="font-weight:500;">${shortSchoolName(s.name)}</td>
      <td style="color:var(--muted);font-size:11px;">${s.officer.split(' ')[0]}</td>
      ${s.vals.map(v => `<td>${v !== null ? v : '—'}</td>`).join('')}
      <td>${changeHtml}</td>
      <td>${bandBadge(bandVal)}</td>
    </tr>`;
  }).join('');

  document.getElementById('wow-school-count').textContent = schools.length + ' schools';
}

/* ============================================================
   TAB SWITCHING
   ============================================================ */
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`.nav-tab[data-tab="${tab}"]`)?.classList.add('active');
  track('tab_view', tab);
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  try {
    const raw = await getAllSheets();
    processData(raw);
    // console.log(raw)

    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    const badge = document.getElementById('status-badge');
    badge.className   = 'badge badge-live';
    badge.textContent = 'Live — Google Sheets';
    document.getElementById('data-date').textContent =
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    buildOverview();
    buildOfficers();
    buildSchoolFilters();
    renderSchoolChart();
    buildWeekly();
    buildSchoolWow();

    // Tab nav
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // "All schools →" links in overview
    document.querySelectorAll('[data-switch-tab]').forEach(el => {
      el.addEventListener('click', () => switchTab(el.dataset.switchTab));
    });

    // Officer sort buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        offSortKey = btn.dataset.sort;
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderOfficerTable(document.getElementById('officer-search')?.value || '');
      });
    });

    // Officer search input
    document.getElementById('officer-search').addEventListener('input', e => {
      renderOfficerTable(e.target.value);
    });

  } catch (err) {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('error-screen').style.display   = 'block';
    document.getElementById('error-msg').textContent        = err.message;
    const badge = document.getElementById('status-badge');
    badge.className   = 'badge badge-err';
    badge.textContent = 'Connection error';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!CURRENT_USER) {
    showUserModal((email, role) => {
      CURRENT_USER = email;
      CURRENT_ROLE = role;
      track('session_start', role);
      init();
    });
  } else {
    document.getElementById('user-overlay').style.display = 'none';
    track('session_start', CURRENT_ROLE);
    init();
  }
});