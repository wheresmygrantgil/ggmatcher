let matchesData = [];
let grantsData = [];
let researcherNames = [];

function showLandingWizard() {
  const container = document.getElementById('grants');
  container.innerHTML = `
    <div class="landing-wizard">
      <img src="assets/wizardoc.png" alt="Cartoon robot scanning grant proposals">
    </div>`;
}

async function loadData() {
  const [matchesResp, grantsResp] = await Promise.all([
    fetch('matches.json'),
    fetch('grants.json'),
  ]);

  const matchesText = await matchesResp.text();
  const grantsText = await grantsResp.text();

  matchesData = JSON.parse(matchesText);
  grantsData = JSON.parse(grantsText);

  researcherNames = matchesData.map((m) => m.name);
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
  showGrants(name);
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

function moneyFmt(m) {
  if (m === null || m === undefined || Number.isNaN(m)) return '';
  return m.toLocaleString();
}

function createGrantCard(grant) {
  const card = document.createElement('div');
  card.className = 'grant';

  card.innerHTML = `
      <h3>${grant.title}</h3>
      <p><strong>Provider:</strong> ${grant.provider}</p>
      <p><strong>Due Date:</strong> ${formatDate(grant.due_date)}</p>
      <p><strong>Proposed Money:</strong> ${moneyFmt(grant.proposed_money)}</p>
      <p><a href="${grant.submission_link}" target="_blank" rel="noopener">Submission Link ↗</a></p>
    `;

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
  });

  card.appendChild(btn);
  card.appendChild(summary);

  return card;
}

function showStats() {
  const r = document.getElementById('researcher-count');
  const g = document.getElementById('grant-count');
  if (r) r.textContent = researcherNames.length;
  if (g) g.textContent = grantsData.length;
}

function showGrants(name) {
  const grantsContainer = document.getElementById('grants');
  grantsContainer.innerHTML = '';

  const match = matchesData.find((m) => m.name === name);
  if (!match) return;

  match.grants.forEach((id) => {
    const grant = grantsData.find(g => Number(g.grant_id) === Number(id));
    if (!grant) return;
    grantsContainer.appendChild(createGrantCard(grant));
  });

  grantsContainer.dispatchEvent(
    new CustomEvent('grantsUpdated', { detail: { name } })
  );
}

async function init() {
  await loadData();

  showStats();

  showLandingWizard();

  const input = document.getElementById('researcher-input');
  input.addEventListener('input', (e) => updateSuggestions(e.target.value));
  input.addEventListener('focus', (e) => updateSuggestions(e.target.value));
  document.addEventListener('click', (e) => {
    if (!document.querySelector('.selector').contains(e.target)) {
      document.getElementById('suggestions').style.display = 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
