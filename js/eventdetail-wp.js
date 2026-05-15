/* ═══════════════════════════════════════════════════════════
   eventdetail-wp.js
   Standalone event detail renderer for WordPress pages.

   HOW IT WORKS:
   1. Reads ?id= from the URL (slug generated from name+date)
   2. Fetches event data from the worker / Google Sheets CSV
   3. Finds the matching row
   4. Renders the full event detail into #event-detail-root
   5. Renders a "← Back to all events" link

   DEPENDENCIES (load before this script on the WP page):
     - css/style.css
     - js/config.js
     - js/utils.js
     - js/modal.js   (for buildICS, buildGCalURL, fmtICalDate, downloadBlob)

   USAGE IN WORDPRESS (HTML block):
     <div id="event-detail-root"></div>
     <link rel="stylesheet" href="URL/css/style.css">
     <script src="URL/js/config.js"></script>
     <script src="URL/js/utils.js"></script>
     <script src="URL/js/modal.js"></script>
     <script src="URL/js/eventdetail-wp.js"></script>

   LINKING FROM THE IFRAME:
     In list.js, replace openEventModal(row) with:
       window.parent.location.href =
         'https://acroinsiders.com/event/?id=' + rowID(row);
   ═══════════════════════════════════════════════════════════ */

/* ── URL of the events listing page (Back button target) ─── */
const EVENTS_PAGE_URL = 'https://www.acroinsiders.com/events/';
/* ── Generate a stable slug ID for a row ─────────────────── */
function rowID(row) {
  const name  = (row[CONFIG.COL_NAME]  || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const start = (row[CONFIG.COL_START] || '').trim().replace(/[^0-9]/g, '-');
  return encodeURIComponent(`${name}-${start}`);
}

/* ── Render helpers (reuse modal.js functions) ───────────── */
function renderEventDetail(row) {
  const root = document.getElementById('event-detail-root');
  if (!root) { console.error('[eventdetail-wp] #event-detail-root not found'); return; }

  /* These functions all live in modal.js */
  const n      = (row[CONFIG.COL_NAME]          || '').trim() || '(unnamed)';
  const rem    = (row[CONFIG.COL_REMARKS]        || '').trim();
  const cty    = (row[CONFIG.COL_CITY]           || '').trim();
  const ctr    = (row[CONFIG.COL_COUNTRY]        || '').trim();
  const prv    = (row[CONFIG.COL_PROVINCE]       || '').trim();
  const cnt    = (row[CONFIG.COL_CONTINENT]      || '').trim();
  const cat    = (row[CONFIG.COL_CATEGORY]       || '').trim();
  const deals  = (row[CONFIG.COL_INSIDER_DEALS]  || '').trim();
  const sl     = ['yes','1','true','x','✓'].includes(String(row[CONFIG.COL_SHORTLIST]||'').toLowerCase());
  const loc    = [cty, prv, ctr, cnt].filter(Boolean).join(', ');
  const dr     = fmtDateRange(row);
  const url    = (row[CONFIG.COL_URL] || '').trim();
  const c      = (typeof lColors !== 'undefined' ? lColors[row._layer] : null) || '#f19072';

  const startDate = parseDate(row[CONFIG.COL_START]);
  const endDate   = parseDate(row[CONFIG.COL_END]);
  const hasDate   = !!startDate;

  // Check if event has passed or already started.
  const effectiveEnd   = endDate || startDate;
  const todayNum       = dateOnly(new Date());
  const isPast         = effectiveEnd && dateOnly(effectiveEnd) < todayNum;
  const isOngoing      = !isPast && startDate && dateOnly(startDate) <= todayNum;

  const pastWarning = isPast
    ? `<div class="edwp-status edwp-status-past">
        ⚠️ This event has already taken place. The information below is kept for reference.
      </div>`
    : isOngoing
    ? `<div class="edwp-status edwp-status-ongoing">
        🎪 This event has already started! Check the website for last-minute tickets.
      </div>`
    : '';

  /* Google Maps link */
  const hasCoords = isFinite(row._lat) && isFinite(row._lon);
  const gmapsURL  = hasCoords
    ? `https://www.google.com/maps?q=${row._lat},${row._lon}`
    : loc ? `https://www.google.com/maps/search/${encodeURIComponent(loc)}` : '';
  const gmapsHtml = gmapsURL
    ? `<a class="tribe-gmaps-link" href="${gmapsURL}" target="_blank" rel="noopener noreferrer"
          title="Show on map — ⚠️ Location is an estimation (city-level, not exact venue)">
        <svg class="tribe-gmaps-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        Show on map
        <span class="tribe-gmaps-warn">⚠️ Estimated location</span>
      </a>`
    : '';

  /* WhatsApp share — deeplink replaces the event website URL */
  const waDr  = dr ? dr : '';
  const waCty2 = cty;
  const waCtr2 = ctr;
  const waDeepLink = typeof rowID === 'function' ? `https://acroinsiders.com/show-event/?id=${rowID(row)}` : (url || '');
  const waLines = [
    `Look at this event on acroinsiders.com!`,
    `${n},`,
    `${[waDr].filter(Boolean).join(' ')},`,
    waCty2 ? `at ${waCty2}` : '',
    waCtr2 ? `(${waCtr2})` : '',
    waDeepLink,
  ].filter(Boolean);
  // keep this in linew with the waLines in modal.js
  const waURL   = `https://wa.me/?text=${encodeURIComponent(waLines.join('\n'))}`;

  /* Google Calendar */
  const gcalURL = hasDate ? buildGCalURL(n, startDate, endDate, loc, rem, url) : '';

  /* ICS */
  const icsName = n.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.ics';
  window._downloadICS = function(filename) {
    const ics = buildICS(n, startDate, endDate, loc, rem, url);
    downloadBlob(ics, filename, 'text/calendar;charset=utf-8');
  };

  /* Description */
  const descHtml = rem
    ? rem.split(/\n{2,}/).filter(Boolean)
        .map(p => `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
    : '';

  /* Insider Deals */
  const dealsHtml = deals
    ? `<div class="tribe-single-deals">
        <div class="tribe-deals-label">🏷️ Insider Deal</div>
        <div class="tribe-deals-text">${escHtml(deals).replace(/\n/g, '<br>')}</div>
      </div>`
    : '';

  window._waTextDetail = waLines.join('\n');

  /* Copy link */
  const copyLinkURL = typeof rowID === 'function' ? `https://acroinsiders.com/show-event/?id=${rowID(row)}` : '';

  root.innerHTML = `
  <div class="tribe-modal-overlay" id="event-modal">
  <div class="tribe-modal">
    <div class="tribe-modal-body edwp-body">
      <div class="edwp-back">
        <a href="${escHtml(EVENTS_PAGE_URL)}" class="tribe-btn tribe-btn-outline">← All events</a>
      </div>
      <div class="tribe-single-cats">
        ${cnt ? `<span class="tribe-single-cat" style="background:${c}22;color:${c}">${escHtml(cnt)}</span>` : ''}
        ${cat ? `<span class="tribe-single-cat">${etIcon(cat)} ${escHtml(cat)}</span>` : ''}
      </div>
      <h1 class="tribe-single-title">${escHtml(n)}</h1>
      ${pastWarning}
      ${dr   ? `<div class="tribe-single-datetime">📅 ${escHtml(dr)}</div>` : ''}
      ${loc  ? `<div class="tribe-single-location"><span>📍</span>
                <span><span class="tribe-single-location-name">${escHtml(loc)}</span></span>
               </div>` : ''}
      ${gmapsHtml}
      ${sl   ? `<div class="tribe-single-shortlisted">⭐ Shortlisted by AcroInsiders</div>` : ''}
      ${dealsHtml}
      ${descHtml ? `<div class="tribe-single-desc">${descHtml}</div>` : ''}
      <div class="tribe-single-actions">
        ${url     ? `<a class="tribe-btn tribe-btn-primary" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">🔗 Visit website →</a>` : ''}
        ${hasDate ? `<a class="tribe-btn tribe-btn-outline tribe-btn-gcal" href="${escHtml(gcalURL)}" target="_blank" rel="noopener noreferrer">📅 Add to Google Calendar</a>` : ''}
        ${hasDate ? `<button class="tribe-btn tribe-btn-outline" onclick="window._downloadICS('${escHtml(icsName)}')">⬇ Download .ics</button>` : ''}
        <button class="tribe-btn tribe-btn-whatsapp" onclick="shareWhatsApp(window._waTextDetail)">💬 Share on WhatsApp</button>
        ${copyLinkURL ? `<button class="tribe-btn tribe-btn-outline" onclick="copyEventLink('${escHtml(copyLinkURL)}')">🔗 Copy link</button>` : ''}
        <a href="${escHtml(EVENTS_PAGE_URL)}" class="tribe-btn tribe-btn-outline">← Back to all events</a>
      </div>
    </div>
  </div>
  </div>
  `;
}

/* ── Not found state ─────────────────────────────────────── */
function renderNotFound(id) {
  hideOverlay();
  const root = document.getElementById('event-detail-root');
  if (!root) return;
  root.innerHTML = `
  <style>
#event-modal { opacity: 1; pointer-events: all; position: relative; inset: auto; background: none; padding: 2rem 1rem; }
body { overflow: auto !important; }
</style>
    <div class="tribe-modal-body edwp-body">
      <div class="edwp-back">
        <a href="${escHtml(EVENTS_PAGE_URL)}" class="tribe-btn tribe-btn-outline">← All events</a>
      </div>
      <div class="no-results">
        <div class="nr-icon">🤸</div>
        <h3>Event not found</h3>
        <p>The event <strong>${escHtml(decodeURIComponent(id))}</strong> could not be found.<br>
        It may have ended or been removed.</p>
        <a href="${escHtml(EVENTS_PAGE_URL)}" class="tribe-btn tribe-btn-primary" style="margin-top:1rem">← Back to all events</a>
      </div>
    </div>`;
}


/** Hide the loading overlay if present. */
function hideOverlay() {
  const el = document.getElementById('ov');
  if (el) { el.classList.add('gone'); setTimeout(() => el.remove(), 500); }
}

function renderNotID() {
  hideOverlay();
  const root = document.getElementById('event-detail-root');
  if (!root) return;
  root.innerHTML = `
    <div class="tribe-modal-body edwp-body">
      <div class="edwp-back">
        <a href="${escHtml(EVENTS_PAGE_URL)}" class="tribe-btn tribe-btn-outline">← All events</a>
      </div>
      <div class="no-results">
        <div class="nr-icon">🤸</div>
        <h3>No ID given</h3>
        <p>No event ID was provided in the URL.<br>
        Please access this page via the "View details" link on an event card.</p>
        <a href="${escHtml(EVENTS_PAGE_URL)}" class="tribe-btn tribe-btn-primary" style="margin-top:1rem">← Back to all events</a>
      </div>
    </div>`;
}

/* ── Loading state ───────────────────────────────────────── */
function renderLoading() {
  const root = document.getElementById('event-detail-root');
  if (!root) return;
  root.innerHTML = `<div style="padding:3rem;text-align:center;font-family:var(--font-body);color:var(--p5)">
    <div style="font-size:2rem;margin-bottom:1rem">🎪</div>
    Loading event…
  </div>`;
}

/* ── Find matching row by slug ID ────────────────────────── */
function findRow(data, targetID) {
  return data.find(row => rowID(row) === targetID) || null;
}

/* ── Data loading ────────────────────────────────────────── */
async function loadAndRender(targetID) {
  renderLoading();

  let data = null;

  // Primary: Cloudflare Worker
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    const res  = await fetch('https://tiny-recipe-c86a.be-nomadicated.workers.dev/events',
                             { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.rows || !json.rows.length) throw new Error('Empty response');
    data = json.rows;
  } catch (e) {
    console.warn('[eventdetail-wp] Worker failed, trying CSV:', e.message);
  }

  // Fallback: Google Sheets CSV
  if (!data) {
    try {
      const csvURL = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID_ENC}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.SHEET_TAB_ENC)}`;
      const res    = await fetch(csvURL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = parseCSV(await res.text());
      if (!data.length) throw new Error('No rows parsed');
      console.log(data.length, 'rows loaded from CSV');
    } catch (e) {
      console.error('[eventdetail-wp] CSV also failed:', e.message);
      renderNotFound(targetID);
      return;
    }
  }

  // Attach _layer / _lat / _lon
  const lSet = new Set();
  data.forEach(row => {
    row._layer = (row[CONFIG.COL_LAYER] || 'Other').trim() || 'Other';
    row._lat   = parseFloat((row[CONFIG.COL_LAT] || '').replace(',', '.'));
    row._lon   = parseFloat((row[CONFIG.COL_LON] || '').replace(',', '.'));
    lSet.add(row._layer);
  });
  if (typeof assignColors === 'function') {
    assignColors(Array.from(lSet).sort());
  }

  const row = findRow(data, targetID);
  if (!row) { renderNotFound(targetID); return; }
  hideOverlay();
  renderEventDetail(row);
}

/* ── Entry point ─────────────────────────────────────────── */
(function() {
  const params   = new URLSearchParams(window.location.search);
  const targetID = params.get('id');

  if (!targetID) {
    /* No ?id= — redirect to the events listing */
    // window.location.href = EVENTS_PAGE_URL;
    renderNotID();
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadAndRender(targetID));
  } else {
    loadAndRender(targetID);
  }
 
  
})();
