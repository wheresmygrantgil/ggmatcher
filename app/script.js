async function loadData() {
  const [matchesResp, grantsResp] = await Promise.all([
    fetch('../matches.json'),
    fetch('../grants.json')
  ]);
  const matches = await matchesResp.json();
  const grants = await grantsResp.json();
  return { matches, grants };
}

function populateResearchers(matches) {
  const select = document.getElementById('researcher-select');
  matches.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m.name;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => showGrants(matches, grantsData));
}

function showGrants(matches, grants) {
  const select = document.getElementById('researcher-select');
  const container = document.getElementById('grants');
  container.innerHTML = '';
  const idx = select.value;
  if (idx === '') return;
  const grantIds = matches[idx].grants;
  grantIds.forEach(id => {
    const g = grants.find(gr => gr.grant_id === id);
    if (!g) return;
    const div = document.createElement('div');
    div.className = 'grant';
    div.innerHTML = `<h3>${g.title}</h3><p><strong>Provider:</strong> ${g.provider}</p>`;
    container.appendChild(div);
  });
}

let grantsData = [];
loadData().then(({ matches, grants }) => {
  grantsData = grants;
  populateResearchers(matches);
});
