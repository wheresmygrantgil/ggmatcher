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
  const datalist = document.getElementById('researchers');
  matches.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.name;
    datalist.appendChild(opt);
  });
  const input = document.getElementById('researcher-input');
  input.addEventListener('change', () => showGrants(matches, grantsData, input.value));
}

function showGrants(matches, grants, name) {
  const container = document.getElementById('grants');
  container.innerHTML = '';
  const match = matches.find(m => m.name === name);
  if (!match) return;
  const grantIds = match.grants;
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
