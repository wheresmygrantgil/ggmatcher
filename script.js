let matchesData = [];
let grantsData = [];
let affiliationData = {};
let rerankedLoaded = false;
let grantsMap;
let researcherNames = [];
let providerChart;
let deadlineChart;
let grantsTable;

// Library loading state
let dataTablesLoaded = false;
let dataTablesLoading = false;
let chartJsLoaded = false;
let chartJsLoading = false;

// Debounce helper for smoother search input
function debounce(fn, delay = 150) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// HTML escape helper to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper to load scripts dynamically
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Load DataTables and dependencies on demand
async function loadDataTablesIfNeeded() {
  if (dataTablesLoaded) return;
  if (dataTablesLoading) {
    // Wait for loading to complete
    while (dataTablesLoading) await new Promise(r => setTimeout(r, 50));
    return;
  }
  dataTablesLoading = true;

  try {
    // jQuery first (required by DataTables)
    await loadScript('https://code.jquery.com/jquery-3.7.0.min.js');
    // DataTables core
    await loadScript('https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js');
    // DataTables plugins in parallel
    await Promise.all([
      loadScript('https://cdn.datatables.net/buttons/2.4.1/js/dataTables.buttons.min.js'),
      loadScript('https://cdn.datatables.net/colreorder/1.6.2/js/dataTables.colReorder.min.js'),
      loadScript('https://cdn.datatables.net/responsive/2.5.0/js/dataTables.responsive.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'),
    ]);
    // These depend on previous ones
    await Promise.all([
      loadScript('https://cdn.datatables.net/buttons/2.4.1/js/buttons.html5.min.js'),
      loadScript('https://cdn.datatables.net/buttons/2.4.1/js/buttons.colVis.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/mark.js/8.11.1/jquery.mark.min.js'),
    ]);
    await loadScript('https://cdn.datatables.net/plug-ins/1.13.6/features/mark.js/datatables.mark.js');

    dataTablesLoaded = true;
  } finally {
    dataTablesLoading = false;
  }
}

// Load Chart.js on demand
async function loadChartJsIfNeeded() {
  if (chartJsLoaded) return;
  if (chartJsLoading) {
    while (chartJsLoading) await new Promise(r => setTimeout(r, 50));
    return;
  }
  chartJsLoading = true;

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js');
    chartJsLoaded = true;
  } finally {
    chartJsLoading = false;
  }
}

// Collaborations data
let collaborationsData = [];
let collabResearcherNames = [];
let collaborationsLoaded = false;
let collaborationsLoading = false;

// --- Voting identity helpers ----------------------------------------------
let currentUser = localStorage.getItem('researcher_id') || null;

function setCurrentUser(id) {
  currentUser = id;
  localStorage.setItem('researcher_id', id);
}

function getCurrentUser() {
  return currentUser;
}

// ---------- Google Analytics event helper ----------
function track(eventName, params = {}) {
  try {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
    }
  } catch (err) {
    /* no-op */
  }
}

function showLandingState() {
  const container = document.getElementById('grants');
  container.innerHTML = `
    <div class="landing-welcome">
      <div class="welcome-card">
        <img src="assets/wizardoc.jpg" alt="Grant Matching Wizard" class="welcome-wizard">
        <h2>Your Grant-Finding Wizard</h2>
        <p>Type your name above to see grants matched to your publications using AI.</p>
        <p class="welcome-features">
          <span>✓ Personalized recommendations</span>
          <span>✓ AI explains why each grant fits</span>
          <span>✓ Covers EU Horizon, NIH, NSF & more</span>
        </p>
      </div>
    </div>`;
}

async function loadData() {
  try {
    // Note: collaborations.json is loaded lazily when user visits Collaborations tab
    const [matchesResp, grantsResp, affiliationResp] = await Promise.all([
      fetch('data/reranked_matches.json').catch(() => null),
      fetch('data/grants.json'),
      fetch('data/affiliation_dict.json').catch(() => null),
    ]);

    let matchesText;
    if (matchesResp && matchesResp.ok) {
      rerankedLoaded = true;
      matchesText = await matchesResp.text();
      track('data_load', { status: 'success', dataset: 'reranked_matches' });
    } else {
      const fallback = await fetch('data/matches.json');
      matchesText = await fallback.text();
      track('data_load', { status: 'success', dataset: 'matches_fallback' });
    }

    const grantsText = await grantsResp.text();
    track('data_load', { status: 'success', dataset: 'grants' });

    if (affiliationResp && affiliationResp.ok) {
      affiliationData = await affiliationResp.json();
      track('data_load', { status: 'success', dataset: 'affiliation_dict' });
    }

    matchesData = JSON.parse(matchesText);
    grantsData = JSON.parse(grantsText);
    grantsMap = new Map(grantsData.map(g => [String(g.grant_id), g]));

    researcherNames = matchesData.map((m) => m.name);
  } catch (err) {
    track('data_load', { status: 'error', error_message: err.message });
    throw err;
  }
}

// Lazy load collaborations data only when needed
async function loadCollaborationsIfNeeded() {
  if (collaborationsLoaded || collaborationsLoading) return;
  collaborationsLoading = true;

  const container = document.getElementById('collaborators-list');
  container.innerHTML = '<div class="loading-spinner">Loading collaborations...</div>';

  try {
    const resp = await fetch('data/collaborations.json');
    if (resp.ok) {
      collaborationsData = await resp.json();
      collabResearcherNames = collaborationsData.map(r => r.name);
      collaborationsLoaded = true;
      track('data_load', { status: 'success', dataset: 'collaborations' });
    }
  } catch (err) {
    track('data_load', { status: 'error', dataset: 'collaborations', error_message: err.message });
  } finally {
    collaborationsLoading = false;
  }
}

function createSuggestion(name) {
  const div = document.createElement('div');
  div.className = 'suggestion-item';
  div.tabIndex = 0;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'suggestion-name';
  nameSpan.textContent = name;
  div.appendChild(nameSpan);

  const affiliation = affiliationData[name];
  if (affiliation) {
    const affSpan = document.createElement('span');
    affSpan.className = 'suggestion-affiliation';
    affSpan.textContent = affiliation;
    div.appendChild(affSpan);
  }

  div.addEventListener('click', () => {
    selectResearcher(name);
  });
  return div;
}

function updateSuggestions(value) {
  const suggBox = document.getElementById('suggestions');
  const requestAddSection = document.querySelector('.request-to-add');
  suggBox.innerHTML = '';

  if (!value) {
    suggBox.style.display = 'none';
    if (requestAddSection) requestAddSection.classList.remove('highlighted');
    return;
  }

  const filtered = researcherNames
    .filter((n) => n.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);

  if (filtered.length === 0) {
    // Show empty state with clear CTA
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'suggestion-empty';
    emptyDiv.innerHTML = `
      <p><strong>No matches found</strong></p>
      <p class="empty-hint">Not in our database yet? Click below to request access.</p>
    `;
    suggBox.appendChild(emptyDiv);
    suggBox.style.display = 'block';

    // Highlight the request button
    if (requestAddSection) requestAddSection.classList.add('highlighted');
    return;
  }

  if (requestAddSection) requestAddSection.classList.remove('highlighted');
  filtered.forEach((name) => suggBox.appendChild(createSuggestion(name)));
  suggBox.style.display = 'block';
}

function selectResearcher(name) {
  document.getElementById('researcher-input').value = name;
  document.getElementById('suggestions').style.display = 'none';
  setCurrentUser(name);             // <-- STORE researcher ID

  // Set User ID in GA4 for cohort analysis
  if (typeof gtag === 'function') {
    gtag('config', 'G-FKE4HL7881', { user_id: name });
  }

  // Show subscribe button and check status
  updateSubscribeButton(name);

  // Hide "Request to be added" button since researcher was found
  const requestAddSection = document.querySelector('.request-to-add');
  if (requestAddSection) requestAddSection.classList.add('hidden');

  showGrants(name);
  track('select_researcher', { researcher_name: name });
}

// ========== Collaborations Tab Functions ==========

function showCollabLandingState() {
  const container = document.getElementById('collaborators-list');
  container.innerHTML = `
    <div class="landing-welcome">
      <div class="welcome-card">
        <img src="assets/wizardscolab.jpg" alt="Collaboration Wizards" class="welcome-wizard">
        <h2>Find Research Collaborators</h2>
        <p>Type your name above to discover researchers who match your grant opportunities.</p>
        <p class="welcome-features">
          <span>✓ Cross-disciplinary matches</span>
          <span>✓ Shared grant opportunities</span>
          <span>✓ Build stronger proposals</span>
        </p>
      </div>
    </div>`;
}

function createCollabSuggestion(name) {
  const div = document.createElement('div');
  div.className = 'suggestion-item';
  div.tabIndex = 0;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'suggestion-name';
  nameSpan.textContent = name;
  div.appendChild(nameSpan);

  const affiliation = affiliationData[name];
  if (affiliation) {
    const affSpan = document.createElement('span');
    affSpan.className = 'suggestion-affiliation';
    affSpan.textContent = affiliation;
    div.appendChild(affSpan);
  }

  div.addEventListener('click', () => {
    selectCollabResearcher(name);
  });
  return div;
}

function updateCollabSuggestions(value) {
  const suggBox = document.getElementById('collab-suggestions');
  suggBox.innerHTML = '';

  if (!value) {
    suggBox.style.display = 'none';
    return;
  }

  const filtered = collabResearcherNames
    .filter((n) => n.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);

  if (filtered.length === 0) {
    suggBox.style.display = 'none';
    return;
  }

  filtered.forEach((name) => suggBox.appendChild(createCollabSuggestion(name)));
  suggBox.style.display = 'block';
}

function selectCollabResearcher(name) {
  document.getElementById('collab-researcher-input').value = name;
  document.getElementById('collab-suggestions').style.display = 'none';

  showCollaborators(name);
  track('select_collab_researcher', { researcher_name: name });
}

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function createCollaboratorCard(collaborator) {
  const card = document.createElement('div');
  card.className = 'collaborator-card';

  // Header with name and affiliation
  const header = document.createElement('div');
  header.className = 'collaborator-header';

  const nameEl = document.createElement('h3');
  nameEl.className = 'collaborator-name';
  nameEl.textContent = truncateText(collaborator.name, 40);
  nameEl.title = collaborator.name; // Full name on hover
  header.appendChild(nameEl);

  // Add affiliation
  const affiliation = affiliationData[collaborator.name];
  if (affiliation) {
    const affEl = document.createElement('p');
    affEl.className = 'collaborator-affiliation';
    affEl.textContent = affiliation;
    affEl.title = affiliation;
    header.appendChild(affEl);
  }

  card.appendChild(header);

  // Shared grants section
  if (collaborator.shared_grants && collaborator.shared_grants.length > 0) {
    const grantsSection = document.createElement('div');
    grantsSection.className = 'shared-grants-section';

    const grantsTitle = document.createElement('h4');
    grantsTitle.textContent = 'Shared Grants:';
    grantsSection.appendChild(grantsTitle);

    const grantsList = document.createElement('ul');
    grantsList.className = 'shared-grants-list';

    collaborator.shared_grants.forEach((grantId) => {
      const grant = grantsMap.get(String(grantId));
      if (!grant) return;

      const grantItem = document.createElement('li');
      grantItem.className = 'shared-grant-item';

      // Grant title link
      const titleLink = document.createElement('a');
      titleLink.className = 'grant-title-link';
      titleLink.href = grant.submission_link;
      titleLink.target = '_blank';
      titleLink.rel = 'noopener';
      titleLink.textContent = grant.title;
      titleLink.addEventListener('click', () => {
        track('click_collab_submission_link', {
          grant_id: grant.grant_id,
          collaborator_name: collaborator.name
        });
      });
      grantItem.appendChild(titleLink);

      // Details toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'collab-summary-toggle';
      toggleBtn.textContent = '▶ Details';

      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'grant-details';
      detailsDiv.hidden = true;
      detailsDiv.innerHTML = `
        <p><span class="detail-label">Provider:</span> ${grant.provider}</p>
        <p><span class="detail-label">Due Date:</span> ${formatDate(grant.due_date)}</p>
        <p><span class="detail-label">Proposed Money:</span> ${moneyFmt(grant.proposed_money)}</p>
        <p><span class="detail-label">Summary:</span> ${grant.summary_text || 'N/A'}</p>
      `;

      toggleBtn.addEventListener('click', () => {
        const isOpen = !detailsDiv.hidden;
        detailsDiv.hidden = isOpen;
        toggleBtn.textContent = isOpen ? '▶ Details' : '▼ Details';
        track(isOpen ? 'collapse_collab_grant' : 'expand_collab_grant', {
          grant_id: grant.grant_id,
          collaborator_name: collaborator.name
        });
      });

      grantItem.appendChild(toggleBtn);
      grantItem.appendChild(detailsDiv);
      grantsList.appendChild(grantItem);
    });

    grantsSection.appendChild(grantsList);
    card.appendChild(grantsSection);
  }

  return card;
}

function showCollaborators(name) {
  const container = document.getElementById('collaborators-list');
  container.innerHTML = '';

  const researcher = collaborationsData.find((r) => r.name === name);
  if (!researcher || !researcher.collaborators || researcher.collaborators.length === 0) {
    container.innerHTML = '<p class="no-results">No collaborators found for this researcher.</p>';
    return;
  }

  researcher.collaborators.forEach((collaborator) => {
    container.appendChild(createCollaboratorCard(collaborator));
  });
}

// ========== End Collaborations Tab Functions ==========

function formatDate(raw) {
  if (!raw) return '';
  let arr;
  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    try {
      // Python-style string "['…','…']" -> JSON parse
      arr = JSON.parse(raw.replace(/'/g, '"'));
    } catch {
      // simple "YYYY-MM-DD HH:MM:SS" string
      arr = [raw];
    }
  }
  const MONTHS = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];

  const pretty = (ts) => {
    const [datePart, timePart] = ts.split(' ');
    let dd, mm, yyyy;
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      // got YYYY-MM-DD -> flip order
      [yyyy, mm, dd] = datePart.split('-');
    } else {
      [dd, mm, yyyy] = datePart.split('-');
    }
    const [hh, min] = timePart.split(':');
    return `${dd} ${MONTHS[Number(mm) - 1]} ${yyyy} ${hh}:${min}`;
  };

  /* 3 ▸ format one or many dates */
  return arr.map(pretty).join(' / ');
}

function moneyFmt(m) {
  if (m === null || m === undefined || Number.isNaN(m)) return '';
  return m.toLocaleString();
}

function createGrantCard(grant, matchReason = null) {
  const card = document.createElement('div');
  card.className = 'grant';

  card.innerHTML = `
      <h3>${grant.title}</h3>
      <p><strong>Provider:</strong> ${grant.provider}</p>
      <p><strong>Due Date:</strong> ${formatDate(grant.due_date)}</p>
      <p><strong>Proposed Money:</strong> ${moneyFmt(grant.proposed_money)}</p>
      <p><a href="${grant.submission_link}" target="_blank" rel="noopener">Submission Link ↗</a></p>
    `;

  renderVoteBar(card, grant.grant_id);

  // Track outbound submission link clicks
  card.querySelector('a').addEventListener('click', () =>
    track('click_submission_link', {
      grant_id: grant.grant_id,
      provider: grant.provider
    })
  );

  // Summary toggle
  const btn = document.createElement('button');
  btn.className = 'summary-toggle';
  btn.textContent = '▶ Summary';

  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.textContent = grant.summary_text;
  summary.hidden = true;

  btn.addEventListener('click', () => {
    const open = !summary.hidden;
    summary.hidden = open; // toggle visibility
    btn.textContent = open ? '▶ Summary' : '▼ Summary';
    track(open ? 'collapse_summary' : 'expand_summary', { grant_id: grant.grant_id });
  });

  if (matchReason) {
    const whyBtn = document.createElement('button');
    whyBtn.className = 'summary-toggle';
    whyBtn.textContent = '▶ Ask AI Why';
    const reason = document.createElement('div');
    reason.className = 'ai-reason';
    reason.textContent = matchReason;
    reason.hidden = true;
    whyBtn.addEventListener('click', () => {
      const open = !reason.hidden;
      reason.hidden = open;
      whyBtn.textContent = open ? '▶ Ask AI Why' : '▼ Ask AI Why';
      // Track AI explanation views
      if (!open) {
        track('view_ai_explanation', { grant_id: grant.grant_id, provider: grant.provider });
      }
    });
    card.appendChild(whyBtn);
    card.appendChild(reason);
  }

  card.appendChild(btn);
  card.appendChild(summary);

  return card;
}

function parseDueDate(raw) {
  if (!raw) return null;
  let str = '';
  if (Array.isArray(raw)) {
    str = raw[0];
  } else {
    try {
      const arr = JSON.parse(raw.replace(/'/g, '"'));
      str = Array.isArray(arr) ? arr[0] : arr;
    } catch {
      str = raw;
    }
  }
  const [datePart, timePart = '00:00:00'] = str.split(' ');
  let dd, mm, yyyy;
  if (/^\d{4}-\d{2}-\d{2}/.test(datePart)) {
    [yyyy, mm, dd] = datePart.split('-');
  } else {
    [dd, mm, yyyy] = datePart.split('-');
  }
  return new Date(`${yyyy}-${mm}-${dd}T${timePart}Z`);
}

function animateNumber(el, value, duration = 800) {
  if (!el) return;
  const start = performance.now();
  const nf = new Intl.NumberFormat();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = nf.format(Math.floor(progress * value));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

let dashboardInitialized = false;

async function showDashboard() {
  const grantTotal = grantsData.length;
  const researcherTotal = matchesData.length;
  const matchTotal = matchesData.reduce((s, r) => s + (r.grants ? r.grants.length : 0), 0);

  const avgMatchesPerResearcher = researcherTotal > 0 ? (matchTotal / researcherTotal).toFixed(1) : 0;

  // Animate numbers only on first visit
  if (!dashboardInitialized) {
    animateNumber(document.getElementById('grant-count'), grantTotal);
    animateNumber(document.getElementById('researcher-count'), researcherTotal);
    animateNumber(document.getElementById('match-count'), matchTotal);
  } else {
    document.getElementById('grant-count').textContent = grantTotal.toLocaleString();
    document.getElementById('researcher-count').textContent = researcherTotal.toLocaleString();
    document.getElementById('match-count').textContent = matchTotal.toLocaleString();
  }
  document.getElementById('avg-match-count').textContent = avgMatchesPerResearcher;

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim();

  const providerCounts = {};
  grantsData.forEach(g => {
    const label = g.provider.startsWith('HORIZON') ? 'EU Horizon' : g.provider;
    providerCounts[label] = (providerCounts[label] || 0) + 1;
  });
  const sortedProviders = Object.entries(providerCounts).sort((a, b) => b[1] - a[1]);
  const providerLabels = sortedProviders.map(([label]) => label);
  const providerValues = sortedProviders.map(([, count]) => count);
  const chartColors = [
    '#00bcd4', '#ff6384', '#36a2eb', '#ffce56',
    '#4bc0c0', '#9966ff', '#ff9f40', '#c9cbcf',
    '#e7e9ed', '#7cb342', '#d32f2f', '#1976d2'
  ];

  const now = new Date();
  const baseIndex = now.getFullYear() * 12 + now.getMonth();
  const months = [];
  const monthCounts = new Array(6).fill(0);

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(d.toLocaleString('en-US', { month: 'short' }));
  }

  grantsData.forEach(g => {
    const d = parseDueDate(g.due_date);
    if (!d || isNaN(d)) return;
    const idx = d.getFullYear() * 12 + d.getMonth() - baseIndex;
    if (idx >= 0 && idx < 6) monthCounts[idx]++;
  });

  // Load Chart.js on demand (first visit only)
  if (!chartJsLoaded) {
    const dashEl = document.getElementById('dashboard');
    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-spinner';
    loadingEl.textContent = 'Loading charts...';
    dashEl.insertBefore(loadingEl, dashEl.firstChild);
    await loadChartJsIfNeeded();
    loadingEl.remove();
  }

  // Memoize charts - create once, update data on subsequent visits
  if (!providerChart) {
    providerChart = new Chart(document.getElementById('providerChart'), {
      type: 'bar',
      data: {
        labels: providerLabels,
        datasets: [{
          data: providerValues,
          backgroundColor: chartColors[0],
          borderColor: chartColors[0],
          borderWidth: 1
        }]
      },
      plugins: [ChartDataLabels],
      options: {
        indexAxis: 'y',
        plugins: {
            legend: { display: false },
            datalabels: {
              anchor: 'end',
              align: 'end',
              color: '#213646',
              font: { weight: 'bold' }
            },
            title: {
              display: true,
              text: 'Grants by Provider',
              color: '#213646',
              font: { size: 18, weight: 'bold' },
              padding: { top: 10, bottom: 10 }
            }
          },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eeeeee' } },
          y: { grid: { display: false } }
        },
        animation: { duration: 800 }
      }
    });
  } else {
    // Update existing chart data without recreating
    providerChart.data.labels = providerLabels;
    providerChart.data.datasets[0].data = providerValues;
    providerChart.update('none'); // Skip animation on repeat views
  }

  if (!deadlineChart) {
    deadlineChart = new Chart(document.getElementById('deadlineChart'), {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          data: monthCounts,
          backgroundColor: accent
        }]
      },
      options: {
        plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Upcoming Deadlines (Next 6 Months)',
              color: '#213646',
              font: { size: 18, weight: 'bold' },
              padding: { top: 10, bottom: 10 }
            }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eeeeee' } },
          x: { grid: { display: false } }
        },
        animation: { duration: 800 },
        aspectRatio: 2
      }
    });
  } else {
    deadlineChart.data.labels = months;
    deadlineChart.data.datasets[0].data = monthCounts;
    deadlineChart.update('none');
  }

  // Calculate and render most matched grants
  const grantMatchCounts = {};
  matchesData.forEach(researcher => {
    researcher.grants?.forEach(g => {
      grantMatchCounts[g.grant_id] = (grantMatchCounts[g.grant_id] || 0) + 1;
    });
  });
  const topGrants = Object.entries(grantMatchCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const grant = grantsData.find(g => g.grant_id == id);
      return { ...grant, matchCount: count };
    });

  const listEl = document.getElementById('most-matched-list');
  listEl.innerHTML = topGrants.map(g => `
    <li class="most-matched-item">
      <span class="match-count-badge">${g.matchCount} researchers</span>
      <a href="${g.submission_link}" target="_blank">${g.title}</a>
      <span class="provider-tag">${g.provider}</span>
    </li>
  `).join('');

  dashboardInitialized = true;
}

async function showTab(name) {
  const rec = document.getElementById('recommendations');
  const dash = document.getElementById('dashboard');
  const grantsSec = document.getElementById('tab-grants');
  const collabSec = document.getElementById('collaborations');
  const recTab = document.getElementById('tab-recommendations');
  const grantsTab = document.getElementById('tab-grants-btn');
  const statTab = document.getElementById('tab-stats');
  const collabTab = document.getElementById('tab-collaborations');

  const allSecs = [rec, dash, grantsSec, collabSec];
  const allTabs = [recTab, grantsTab, statTab, collabTab];
  allSecs.forEach(sec => sec.classList.add('hidden'));
  allTabs.forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  if (name === 'stats') {
    dash.classList.remove('hidden');
    statTab.classList.add('active');
    statTab.setAttribute('aria-selected', 'true');
    await showDashboard();
    track('view_stats_tab');
  } else if (name === 'grants') {
    grantsSec.classList.remove('hidden');
    grantsTab.classList.add('active');
    grantsTab.setAttribute('aria-selected', 'true');
    if (!grantsTable) await initGrantsTable();
    track('view_grants_tab');
  } else if (name === 'collaborations') {
    collabSec.classList.remove('hidden');
    collabTab.classList.add('active');
    collabTab.setAttribute('aria-selected', 'true');
    // Lazy load collaborations data on first visit
    await loadCollaborationsIfNeeded();
    showCollabLandingState();
    track('view_collaborations_tab');
  } else {
    rec.classList.remove('hidden');
    recTab.classList.add('active');
    recTab.setAttribute('aria-selected', 'true');
    track('view_recommendations_tab');
  }
}

function showGrants(name) {
  const grantsContainer = document.getElementById('grants');
  grantsContainer.innerHTML = '';

  const match = matchesData.find((m) => m.name === name);
  if (!match) return;

  // Add researcher header with affiliation
  const header = document.createElement('div');
  header.className = 'researcher-header';
  header.innerHTML = `<h2 class="researcher-name">${name}</h2>`;
  const affiliation = affiliationData[name];
  if (affiliation) {
    header.innerHTML += `<p class="researcher-affiliation">${affiliation}</p>`;
  }
  grantsContainer.appendChild(header);

  match.grants.forEach((g, index) => {
    const id = typeof g === 'object' ? g.grant_id : g;
    const reason = typeof g === 'object' ? g.match_reason : null;
    const grant = grantsMap.get(String(id));
    if (!grant) return;
    grantsContainer.appendChild(createGrantCard(grant, reason));

    // Track grant impression with position
    track('view_grant', {
      grant_id: grant.grant_id,
      provider: grant.provider,
      position: index + 1
    });
  });

  grantsContainer.dispatchEvent(
    new CustomEvent('grantsUpdated', { detail: { name } })
  );
}

async function initGrantsTable() {
  // Show loading indicator
  const tableContainer = document.getElementById('tab-grants');
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-spinner';
  loadingEl.textContent = 'Loading table...';
  tableContainer.insertBefore(loadingEl, tableContainer.firstChild);

  // Load DataTables libraries on demand
  await loadDataTablesIfNeeded();
  loadingEl.remove();

  const idToNames = {};
  matchesData.forEach(m => {
    if (!Array.isArray(m.grants)) return;
    if (rerankedLoaded) {
      m.grants.forEach(g => {
        const id = typeof g === 'object' ? g.grant_id : g;
        if (!idToNames[id]) idToNames[id] = [];
        idToNames[id].push(m.name);
      });
    } else {
      m.grants.forEach(id => {
        if (!idToNames[id]) idToNames[id] = [];
        idToNames[id].push(m.name);
      });
    }
  });

  const rows = grantsData.map(g => ({
    grant_id: g.grant_id,
    provider: g.provider,
    title: g.title,
    due_date: formatDate(g.due_date),
    money: g.proposed_money,
    suggested_collaborators: idToNames[g.grant_id]
      ? idToNames[g.grant_id]
          .slice(0, 10)
          .map(name => `<span class="collab-link" data-researcher="${escapeHtml(name)}">${escapeHtml(name)}</span>`)
          .join(' <strong>·</strong> ')
      : '',
    link: g.submission_link,
  }));

  grantsTable = $('#grants-table').DataTable({
    data: rows,
    responsive: true,
    colReorder: true,
    dom: 'Bfrtip',
    searchHighlight: true,
    buttons: [
      { extend: 'csvHtml5', text: 'Export CSV', exportOptions: { columns: ':visible' }, title: 'grants', filename: 'grants',
        action: function(e, dt, button, config) {
          track('export_grants_csv');
          $.fn.dataTable.ext.buttons.csvHtml5.action.call(this, e, dt, button, config);
        }
      },
      'colvis'
    ],
    columns: [
      { data: 'grant_id', title: 'ID' },
      { data: 'provider', title: 'Provider' },
      { data: 'title', title: 'Title' },
      { data: 'due_date', title: 'Due Date' },
      { data: 'money', title: 'Money' },
      { data: 'suggested_collaborators', title: 'Suggested Collaborators' },
      { data: 'link', title: 'Link', orderable: false, render: d => `<a href="${d}" target="_blank" rel="noopener">Open</a>` },
    ]
  });

  $('#grant-global-search').on('input', function(){
    grantsTable.search(this.value).draw();
    const resultsCount = grantsTable.rows({ search: 'applied' }).count();
    track('search_grants', {
      query: this.value,
      results_count: resultsCount,
      has_results: resultsCount > 0
    });
  });

  // Handle clicks on collaborator names in the table
  $('#grants-table').on('click', '.collab-link', function(e) {
    e.preventDefault();
    const researcherName = this.dataset.researcher;

    track('click_suggested_collaborator', {
      researcher_name: researcherName,
      source: 'grants_table'
    });

    showTab('recommendations');
    selectResearcher(researcherName);
  });

}

async function init() {
  // Track session start with returning user context
  track('session_start', {
    is_returning_user: !!localStorage.getItem('researcher_id'),
    entry_point: document.referrer ? 'referral' : 'direct'
  });

  await loadData();

  // Update landing stats with real data
  const researcherCountEl = document.getElementById('landing-researcher-count');
  const grantCountEl = document.getElementById('landing-grant-count');
  if (researcherCountEl) researcherCountEl.textContent = matchesData.length.toLocaleString();
  if (grantCountEl) grantCountEl.textContent = grantsData.length.toLocaleString();

  showLandingState();

  document.getElementById('tab-recommendations').addEventListener('click', () => showTab('recommendations'));
  document.getElementById('tab-grants-btn').addEventListener('click', () => showTab('grants'));
  document.getElementById('tab-stats').addEventListener('click', () => showTab('stats'));
  document.getElementById('tab-collaborations').addEventListener('click', () => showTab('collaborations'));

  const linkedInLink = document.querySelector('footer .linkedin');
  if (linkedInLink) {
    linkedInLink.addEventListener('click', () => track('click_linkedin'));
  }

  const gmailLink = document.querySelector('footer .gmail');
  if (gmailLink) {
    gmailLink.addEventListener('click', () => track('click_gmail'));
  }

  const githubLink = document.querySelector('footer .github');
  if (githubLink) {
    githubLink.addEventListener('click', () => track('click_github'));
  }

  // Recommendations tab search input (debounced for smoother typing)
  const input = document.getElementById('researcher-input');
  const debouncedUpdateSuggestions = debounce((value) => updateSuggestions(value), 100);
  input.addEventListener('input', (e) => debouncedUpdateSuggestions(e.target.value));
  input.addEventListener('focus', (e) => updateSuggestions(e.target.value));

  // Collaborations tab search input (debounced)
  const collabInput = document.getElementById('collab-researcher-input');
  const debouncedCollabSuggestions = debounce((value) => updateCollabSuggestions(value), 100);
  collabInput.addEventListener('input', (e) => debouncedCollabSuggestions(e.target.value));
  collabInput.addEventListener('focus', (e) => updateCollabSuggestions(e.target.value));

  // Close suggestions when clicking outside
  document.addEventListener('click', (e) => {
    const recSelector = document.querySelector('#recommendations .selector');
    const collabSelector = document.querySelector('#collaborations .selector');

    if (recSelector && !recSelector.contains(e.target)) {
      document.getElementById('suggestions').style.display = 'none';
    }
    if (collabSelector && !collabSelector.contains(e.target)) {
      document.getElementById('collab-suggestions').style.display = 'none';
    }
  });

  showTab('recommendations');
}

document.addEventListener('DOMContentLoaded', init);

// ===== Scroll depth tracking =====
(function() {
  const trackedDepths = new Set();

  function trackScrollDepth() {
    const container = document.getElementById('grants');
    if (!container || container.children.length === 0) return;

    const containerRect = container.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const containerTop = containerRect.top + scrollTop;
    const containerHeight = container.scrollHeight;

    if (containerHeight === 0) return;

    const scrolledIntoContainer = Math.max(0, scrollTop + viewportHeight - containerTop);
    const depthPercent = Math.min(100, Math.round((scrolledIntoContainer / containerHeight) * 100));

    [25, 50, 75, 100].forEach(milestone => {
      if (depthPercent >= milestone && !trackedDepths.has(milestone)) {
        trackedDepths.add(milestone);
        track('scroll_depth', {
          depth_percent: milestone,
          tab: 'recommendations',
          grants_visible: container.children.length
        });
      }
    });
  }

  // Reset tracked depths when grants are updated
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('grants');
    if (container) {
      container.addEventListener('grantsUpdated', () => {
        trackedDepths.clear();
      });
    }
    window.addEventListener('scroll', trackScrollDepth, { passive: true });
  });
})();

// ===== Voting module =====
const API_BASE = 'https://ggm-backend.onrender.com';

// -------------------- API wrapper ------------------------------------------
const api = {
  async fetch(path, options = {}) {
    const opts = { ...options };
    if (opts.body && !opts.headers) {
      opts.headers = { 'Content-Type': 'application/json' };
    }
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Network error');
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },
  userVote(id, user) {                            // always encode path parts
    return this.fetch(`/vote/${id}/${encodeURIComponent(user)}`);
  },
  post(id, type) {
    return this.fetch('/vote', {
      method: 'POST',
      body: JSON.stringify({
        grant_id: id,
        researcher_id: getCurrentUser(),
        action: type
      })
    });
  },
  remove(id) {
    return this.fetch(`/vote/${id}/${encodeURIComponent(getCurrentUser())}`,
                      { method: 'DELETE' });
  }
};

function setState(bar, vote) {
  const likeBtn = bar.querySelector('.like-btn');
  const dislikeBtn = bar.querySelector('.dislike-btn');
  likeBtn.classList.toggle('liked', vote === 'like');
  dislikeBtn.classList.toggle('disliked', vote === 'dislike');
  likeBtn.setAttribute('aria-pressed', vote === 'like');
  dislikeBtn.setAttribute('aria-pressed', vote === 'dislike');
  bar.dataset.vote = vote || '';
}

function renderVoteBar(cardEl, grantId) {
  const bar = document.createElement('div');
  bar.className = 'vote-bar';

  const likeBtn = document.createElement('button');
  likeBtn.className = 'vote-btn like-btn';
  likeBtn.setAttribute('data-id', grantId);
  likeBtn.setAttribute('role', 'button');
  likeBtn.setAttribute('aria-label', 'Like');
  likeBtn.setAttribute('aria-pressed', 'false');
  likeBtn.tabIndex = 0;
  likeBtn.textContent = '👍';


  const dislikeBtn = document.createElement('button');
  dislikeBtn.className = 'vote-btn dislike-btn';
  dislikeBtn.setAttribute('data-id', grantId);
  dislikeBtn.setAttribute('role', 'button');
  dislikeBtn.setAttribute('aria-label', 'Dislike');
  dislikeBtn.setAttribute('aria-pressed', 'false');
  dislikeBtn.tabIndex = 0;
  dislikeBtn.textContent = '👎';


  bar.appendChild(likeBtn);
  bar.appendChild(dislikeBtn);

  const heading = cardEl.querySelector('h3');
  if (heading) heading.after(bar); else cardEl.prepend(bar);

  likeBtn.addEventListener('click', handleVoteClick);
  dislikeBtn.addEventListener('click', handleVoteClick);

  const keyHandler = (ev) => {
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      ev.currentTarget.click();
    }
  };
  likeBtn.addEventListener('keydown', keyHandler);
  dislikeBtn.addEventListener('keydown', keyHandler);

  if (getCurrentUser()) {            // only query once researcher is chosen
    api.userVote(grantId, getCurrentUser())
      .then(d => setState(bar, d ? d.action : null))
      .catch(() => {});
  }
}

async function handleVoteClick(e) {
  const btn = e.currentTarget;
  const bar = btn.parentElement;
  if (bar.dataset.busy) return;
  bar.dataset.busy = '1';
  setTimeout(() => delete bar.dataset.busy, 300);

  const isLike = btn.classList.contains('like-btn');
  const grantId = btn.dataset.id;

  let likes = parseInt(bar.dataset.likes || '0', 10);
  let dislikes = parseInt(bar.dataset.dislikes || '0', 10);
  const prevVote = bar.dataset.vote || null;
  let newVote = null;

  if (isLike) {
    newVote = prevVote === 'like' ? null : 'like';
  } else {
    newVote = prevVote === 'dislike' ? null : 'dislike';
  }

  const prev = { likes, dislikes, vote: prevVote };

  if (prevVote === 'like') likes--;
  if (prevVote === 'dislike') dislikes--;
  if (newVote === 'like') likes++;
  if (newVote === 'dislike') dislikes++;

  bar.dataset.likes = likes;
  bar.dataset.dislikes = dislikes;
  setState(bar, newVote);

  try {
    if (!newVote) {
      await api.remove(grantId);
      track('vote_remove', { grant_id: grantId });
    } else {
      await api.post(grantId, newVote);
      track(newVote === 'like' ? 'vote_like' : 'vote_dislike', { grant_id: grantId });
    }
  } catch (err) {
    bar.dataset.likes = prev.likes;
    bar.dataset.dislikes = prev.dislikes;
    setState(bar, prev.vote);
    alert("Couldn't register vote – please try again.");
  }
}

// ========== Subscription Functions ==========

async function checkSubscriptionStatus(researcherName) {
  try {
    const resp = await fetch(`${API_BASE}/subscriptions/${encodeURIComponent(researcherName)}`);
    if (!resp.ok) return { subscribed: false };
    return await resp.json();
  } catch (err) {
    return { subscribed: false };
  }
}

async function subscribe(researcherName, email) {
  const resp = await fetch(`${API_BASE}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ researcher_name: researcherName, email: email })
  });
  if (!resp.ok) throw new Error('Subscription failed');
  return resp.json();
}

async function unsubscribe(researcherName, email) {
  const resp = await fetch(
    `${API_BASE}/unsubscribe?email=${encodeURIComponent(email)}&researcher=${encodeURIComponent(researcherName)}`
  );
  if (!resp.ok) throw new Error('Unsubscribe failed');
  return { status: 'success' };
}

// Track current subscription status
let currentSubscriptionStatus = { subscribed: false, email_hint: null };

async function updateSubscribeButton(researcherName) {
  const btn = document.getElementById('subscribe-btn');
  if (!btn) return;

  // Show the button
  btn.classList.remove('hidden');

  const status = await checkSubscriptionStatus(researcherName);
  currentSubscriptionStatus = status;

  if (status.subscribed) {
    btn.classList.add('subscribed');
    btn.title = `Subscribed (${status.email_hint})`;
  } else {
    btn.classList.remove('subscribed');
    btn.title = 'Subscribe for email updates';
  }
}

function openSubscribeModal() {
  const modal = document.getElementById('subscribe-modal');
  const statusEl = document.getElementById('subscribe-status');
  const formEl = document.getElementById('subscribe-form');
  const titleEl = document.getElementById('subscribe-modal-title');
  const subtitleEl = document.getElementById('subscribe-modal-subtitle');
  const submitBtn = document.getElementById('submit-subscribe-btn');
  const emailInput = document.getElementById('subscribe-email');

  if (!modal) return;

  // Reset modal state
  statusEl.textContent = '';
  statusEl.className = 'subscribe-status';
  emailInput.value = '';
  formEl.classList.remove('hidden');

  // Configure modal based on subscription status
  if (currentSubscriptionStatus.subscribed) {
    titleEl.textContent = 'Unsubscribe';
    subtitleEl.textContent = `You are subscribed as ${currentSubscriptionStatus.email_hint}. Enter your email to confirm unsubscribe.`;
    submitBtn.textContent = 'Unsubscribe';
    submitBtn.classList.add('unsubscribe-mode');
  } else {
    titleEl.textContent = 'Subscribe for Updates';
    subtitleEl.textContent = 'Get notified when new grants match your research';
    submitBtn.textContent = 'Subscribe';
    submitBtn.classList.remove('unsubscribe-mode');
  }

  modal.classList.remove('hidden');
  emailInput.focus();
}

function closeSubscribeModal() {
  const modal = document.getElementById('subscribe-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleSubscribeSubmit() {
  const email = document.getElementById('subscribe-email').value;
  const researcher = getCurrentUser();
  const btn = document.getElementById('submit-subscribe-btn');
  const statusEl = document.getElementById('subscribe-status');
  const formEl = document.getElementById('subscribe-form');
  const isUnsubscribeMode = currentSubscriptionStatus.subscribed;

  if (!email || !researcher) {
    statusEl.textContent = 'Please enter a valid email address';
    statusEl.className = 'subscribe-status error';
    return;
  }

  btn.disabled = true;
  btn.textContent = isUnsubscribeMode ? 'Unsubscribing...' : 'Subscribing...';

  try {
    if (isUnsubscribeMode) {
      await unsubscribe(researcher, email);
      statusEl.textContent = 'Unsubscribed successfully!';
      statusEl.className = 'subscribe-status success';
      formEl.classList.add('hidden');

      // Update button appearance
      const subscribeBtn = document.getElementById('subscribe-btn');
      subscribeBtn.classList.remove('subscribed');
      subscribeBtn.title = 'Subscribe for email updates';

      // Update local status
      currentSubscriptionStatus = { subscribed: false, email_hint: null };

      track('unsubscribe', { researcher_name: researcher });
    } else {
      await subscribe(researcher, email);
      statusEl.textContent = 'Subscribed successfully!';
      statusEl.className = 'subscribe-status success';
      formEl.classList.add('hidden');

      // Update button appearance
      const subscribeBtn = document.getElementById('subscribe-btn');
      subscribeBtn.classList.add('subscribed');
      subscribeBtn.title = 'Subscribed';

      track('subscribe', { researcher_name: researcher });
    }

    // Close modal after delay
    setTimeout(closeSubscribeModal, 1500);
  } catch (err) {
    if (isUnsubscribeMode) {
      statusEl.textContent = 'Email not found. Please enter the exact email you subscribed with.';
    } else {
      statusEl.textContent = 'Failed to subscribe. Please try again.';
    }
    statusEl.className = 'subscribe-status error';
  } finally {
    btn.disabled = false;
    btn.textContent = isUnsubscribeMode ? 'Unsubscribe' : 'Subscribe';
  }
}

// ========== OpenAlex Search for Add Researcher ==========

let selectedOpenAlexAuthor = null;
let openalexSearchTimeout = null;

async function searchOpenAlex(query) {
  if (!query || query.length < 2) return [];

  const url = `https://api.openalex.org/authors?search=${encodeURIComponent(query)}&per_page=10`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.results || [];
  } catch (err) {
    return [];
  }
}

function getAuthorInstitution(author) {
  const affiliations = author.affiliations || [];
  if (!affiliations.length) return 'Unknown institution';

  // Get most recent affiliation
  let bestAff = affiliations[0];
  let bestYear = 0;

  for (const aff of affiliations) {
    const years = aff.years || [];
    if (years.length && Math.max(...years) > bestYear) {
      bestYear = Math.max(...years);
      bestAff = aff;
    }
  }

  return bestAff?.institution?.display_name || 'Unknown institution';
}

function renderOpenAlexSuggestions(authors) {
  const container = document.getElementById('openalex-suggestions');
  container.innerHTML = '';

  if (!authors.length) {
    container.style.display = 'none';
    return;
  }

  for (const author of authors) {
    const div = document.createElement('div');
    div.className = 'openalex-suggestion-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'openalex-name';
    nameSpan.textContent = author.display_name;
    div.appendChild(nameSpan);

    const instSpan = document.createElement('span');
    instSpan.className = 'openalex-institution';
    instSpan.textContent = getAuthorInstitution(author);
    div.appendChild(instSpan);

    const worksSpan = document.createElement('span');
    worksSpan.className = 'openalex-works';
    worksSpan.textContent = `${(author.works_count || 0).toLocaleString()} works`;
    div.appendChild(worksSpan);

    div.addEventListener('click', () => selectOpenAlexAuthor(author));
    container.appendChild(div);
  }

  container.style.display = 'block';
}

function selectOpenAlexAuthor(author) {
  selectedOpenAlexAuthor = author;

  // Update UI
  document.getElementById('openalex-suggestions').style.display = 'none';
  document.getElementById('openalex-search-input').value = author.display_name;

  const profileSection = document.getElementById('selected-profile');
  profileSection.classList.remove('hidden');
  document.getElementById('profile-name').textContent = author.display_name;
  document.getElementById('profile-institution').textContent = getAuthorInstitution(author);
  document.getElementById('profile-works').textContent = `${(author.works_count || 0).toLocaleString()} works`;

  // Show email input and submit button
  document.getElementById('request-email-section').classList.remove('hidden');
  document.getElementById('submit-request-btn').classList.remove('hidden');
}

async function submitResearcherRequest() {
  if (!selectedOpenAlexAuthor) return;

  const btn = document.getElementById('submit-request-btn');
  const statusEl = document.getElementById('request-status');
  const email = document.getElementById('request-email').value || null;

  btn.disabled = true;
  btn.textContent = 'Submitting...';
  statusEl.className = 'request-status';
  statusEl.textContent = '';

  try {
    const resp = await fetch(`${API_BASE}/researcher-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openalex_id: selectedOpenAlexAuthor.id,
        display_name: selectedOpenAlexAuthor.display_name,
        institution: getAuthorInstitution(selectedOpenAlexAuthor),
        works_count: selectedOpenAlexAuthor.works_count || 0,
        requester_email: email
      })
    });

    const data = await resp.json();

    if (data.status === 'success') {
      statusEl.className = 'request-status success';
      statusEl.textContent = 'Request submitted! You will be added in the next update.';
      track('researcher_request_submitted', { openalex_id: selectedOpenAlexAuthor.id });

      // Reset form after delay
      setTimeout(() => {
        closeRequestModal();
      }, 3000);
    } else if (data.status === 'existing') {
      statusEl.className = 'request-status';
      statusEl.textContent = data.message;
    } else {
      throw new Error('Request failed');
    }
  } catch (err) {
    statusEl.className = 'request-status error';
    statusEl.textContent = 'Failed to submit request. Please try again.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
}

function openRequestModal() {
  document.getElementById('request-modal').classList.remove('hidden');
  document.getElementById('openalex-search-input').focus();
}

function closeRequestModal() {
  document.getElementById('request-modal').classList.add('hidden');
  // Reset state
  selectedOpenAlexAuthor = null;
  document.getElementById('openalex-search-input').value = '';
  document.getElementById('openalex-suggestions').style.display = 'none';
  document.getElementById('selected-profile').classList.add('hidden');
  document.getElementById('request-email-section').classList.add('hidden');
  document.getElementById('submit-request-btn').classList.add('hidden');
  document.getElementById('request-email').value = '';
  document.getElementById('request-status').textContent = '';
}

// Event listeners for modals - wrapped in DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // Request modal elements
  const requestAddBtn = document.getElementById('request-add-btn');
  const closeRequestBtn = document.getElementById('close-request-modal');
  const submitRequestBtn = document.getElementById('submit-request-btn');
  const openalexInput = document.getElementById('openalex-search-input');
  const requestModal = document.getElementById('request-modal');

  // Subscribe modal elements
  const subscribeBtn = document.getElementById('subscribe-btn');
  const closeSubscribeBtn = document.getElementById('close-subscribe-modal');
  const submitSubscribeBtn = document.getElementById('submit-subscribe-btn');
  const subscribeModal = document.getElementById('subscribe-modal');

  // Request modal event listeners
  if (requestAddBtn) {
    requestAddBtn.addEventListener('click', openRequestModal);
  }

  if (closeRequestBtn) {
    closeRequestBtn.addEventListener('click', closeRequestModal);
  }

  if (submitRequestBtn) {
    submitRequestBtn.addEventListener('click', submitResearcherRequest);
  }

  if (openalexInput) {
    openalexInput.addEventListener('input', (e) => {
      clearTimeout(openalexSearchTimeout);
      const query = e.target.value;

      openalexSearchTimeout = setTimeout(async () => {
        const results = await searchOpenAlex(query);
        renderOpenAlexSuggestions(results);
      }, 300);
    });
  }

  // Close request modal on overlay click
  if (requestModal) {
    requestModal.addEventListener('click', (e) => {
      if (e.target.id === 'request-modal') {
        closeRequestModal();
      }
    });
  }

  // Subscribe modal event listeners
  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', openSubscribeModal);
  }

  if (closeSubscribeBtn) {
    closeSubscribeBtn.addEventListener('click', closeSubscribeModal);
  }

  if (submitSubscribeBtn) {
    submitSubscribeBtn.addEventListener('click', handleSubscribeSubmit);
  }

  // Close subscribe modal on overlay click
  if (subscribeModal) {
    subscribeModal.addEventListener('click', (e) => {
      if (e.target.id === 'subscribe-modal') {
        closeSubscribeModal();
      }
    });
  }
});
