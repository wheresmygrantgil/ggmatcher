let matchesData = [];
let grantsData = [];
let rerankedLoaded = false;
let grantsMap;
let researcherNames = [];
let providerChart;
let deadlineChart;
let grantsTable;

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

function showLandingWizard() {
  const container = document.getElementById('grants');
  container.innerHTML = `
    <div class="landing-wizard">
      <img src="assets/wizardoc.png" alt="Cartoon robot scanning grant proposals">
    </div>`;
}

async function loadData() {
  try {
    const [matchesResp, grantsResp] = await Promise.all([
      fetch('reranked_matches.json').catch(() => null),
      fetch('grants.json'),
    ]);

    let matchesText;
    if (matchesResp && matchesResp.ok) {
      rerankedLoaded = true;
      matchesText = await matchesResp.text();
      track('data_load', { status: 'success', dataset: 'reranked_matches' });
    } else {
      const fallback = await fetch('matches.json');
      matchesText = await fallback.text();
      track('data_load', { status: 'success', dataset: 'matches_fallback' });
    }

    const grantsText = await grantsResp.text();
    track('data_load', { status: 'success', dataset: 'grants' });

    matchesData = JSON.parse(matchesText);
    grantsData = JSON.parse(grantsText);
    grantsMap = new Map(grantsData.map(g => [String(g.grant_id), g]));

    researcherNames = matchesData.map((m) => m.name);
  } catch (err) {
    track('data_load', { status: 'error', error_message: err.message });
    throw err;
  }
}

function createSuggestion(name) {
  const div = document.createElement('div');
  div.className = 'suggestion-item';
  div.tabIndex = 0;
  div.textContent = name;
  div.addEventListener('click', () => {
    selectResearcher(name);
  });
  return div;
}

function updateSuggestions(value) {
  const suggBox = document.getElementById('suggestions');
  suggBox.innerHTML = '';

  if (!value) {
    suggBox.style.display = 'none';
    return;
  }

  const filtered = researcherNames
    .filter((n) => n.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);

  if (filtered.length === 0) {
    suggBox.style.display = 'none';
    return;
  }

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

  showGrants(name);
  track('select_researcher', { researcher_name: name });
}

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

function showDashboard() {
  const grantTotal = grantsData.length;
  const researcherTotal = matchesData.length;
  const matchTotal = matchesData.reduce((s, r) => s + (r.grants ? r.grants.length : 0), 0);

  const avgMatchesPerResearcher = researcherTotal > 0 ? (matchTotal / researcherTotal).toFixed(1) : 0;

  animateNumber(document.getElementById('grant-count'), grantTotal);
  animateNumber(document.getElementById('researcher-count'), researcherTotal);
  animateNumber(document.getElementById('match-count'), matchTotal);
  document.getElementById('avg-match-count').textContent = avgMatchesPerResearcher;

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim();
  const primary = styles.getPropertyValue('--primary').trim();

  const providerCounts = {};
  grantsData.forEach(g => {
    const label = g.provider.startsWith('HORIZON') ? 'EU Horizon' : g.provider;
    providerCounts[label] = (providerCounts[label] || 0) + 1;
  });
  // Sort providers by count (descending) for better readability
  const sortedProviders = Object.entries(providerCounts).sort((a, b) => b[1] - a[1]);
  const providerLabels = sortedProviders.map(([label]) => label);
  const providerValues = sortedProviders.map(([, count]) => count);
  // Distinct color palette for chart segments
  const chartColors = [
    '#00bcd4', '#ff6384', '#36a2eb', '#ffce56',
    '#4bc0c0', '#9966ff', '#ff9f40', '#c9cbcf',
    '#e7e9ed', '#7cb342', '#d32f2f', '#1976d2'
  ];

  if (providerChart) providerChart.destroy();
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
            font: {
              size: 18,
              weight: 'bold'
            },
            padding: {
              top: 10,
              bottom: 10
            }
          }
        },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eeeeee' } },
        y: { grid: { display: false } }
      },
      animation: { duration: 800 }
    }
  });

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

  if (deadlineChart) deadlineChart.destroy();
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
            font: {
              size: 18,
              weight: 'bold'
            },
            padding: {
              top: 10,
              bottom: 10
            }
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
}

function showTab(name) {
  const rec = document.getElementById('recommendations');
  const dash = document.getElementById('dashboard');
  const grantsSec = document.getElementById('tab-grants');
  const recTab = document.getElementById('tab-recommendations');
  const grantsTab = document.getElementById('tab-grants-btn');
  const statTab = document.getElementById('tab-stats');

  const allSecs = [rec, dash, grantsSec];
  const allTabs = [recTab, grantsTab, statTab];
  allSecs.forEach(sec => sec.classList.add('hidden'));
  allTabs.forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  if (name === 'stats') {
    dash.classList.remove('hidden');
    statTab.classList.add('active');
    statTab.setAttribute('aria-selected', 'true');
    requestAnimationFrame(showDashboard);
    track('view_stats_tab');
  } else if (name === 'grants') {
    grantsSec.classList.remove('hidden');
    grantsTab.classList.add('active');
    grantsTab.setAttribute('aria-selected', 'true');
    if (!grantsTable) initGrantsTable();
    track('view_grants_tab');
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

function initGrantsTable() {
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
    suggested_collaborators: idToNames[g.grant_id] || [],
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
      {
        data: 'suggested_collaborators',
        title: 'Suggested Collaborators',
        render: (data, type, row) => {
          if (type === 'display' && Array.isArray(data) && data.length > 0) {
            return data.slice(0, 10).map(name =>
              `<a href="#" class="researcher-link" data-researcher="${name}" data-grant-id="${row.grant_id}">${name}</a>`
            ).join(' <strong>·</strong> ');
          }
          return Array.isArray(data) ? data.slice(0, 10).join(', ') : '';
        }
      },
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

  // Handle researcher link clicks in Suggested Collaborators column
  $('#grants-table').on('click', '.researcher-link', function(e) {
    e.preventDefault();
    const researcherName = $(this).data('researcher');
    const grantId = $(this).data('grant-id');

    // Track the click with Google Analytics
    track('click_suggested_collaborator', {
      researcher_name: researcherName,
      grant_id: grantId,
      source: 'grants_table'
    });

    // Select the researcher and switch to Recommendations tab
    selectResearcher(researcherName);
    showTab('recommendations');
  });

}

async function init() {
  // Track session start with returning user context
  track('session_start', {
    is_returning_user: !!localStorage.getItem('researcher_id'),
    entry_point: document.referrer ? 'referral' : 'direct'
  });

  await loadData();

  showLandingWizard();

  document.getElementById('tab-recommendations').addEventListener('click', () => showTab('recommendations'));
  document.getElementById('tab-grants-btn').addEventListener('click', () => showTab('grants'));
  document.getElementById('tab-stats').addEventListener('click', () => showTab('stats'));

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

  const input = document.getElementById('researcher-input');
  input.addEventListener('input', (e) => updateSuggestions(e.target.value));
  input.addEventListener('focus', (e) => updateSuggestions(e.target.value));
  document.addEventListener('click', (e) => {
    if (!document.querySelector('.selector').contains(e.target)) {
      document.getElementById('suggestions').style.display = 'none';
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
