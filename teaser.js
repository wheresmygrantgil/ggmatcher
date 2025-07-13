let selectedName = '';
let observer;
let teaserShown = false;

function showTeaser() {
  if (teaserShown) return;
  teaserShown = true;

  const card = document.createElement('div');
  card.className = 'teaser-card';
  card.innerHTML = `
    <img src="assets/wizardoc.png" alt="Cartoon robot scanning grant proposals">
    <p>Didn\u2019t spot the perfect call?<br>
    \u26A1 Let our AI scout the web for fresh opportunities tailored to <em>${selectedName}</em>!</p>
    <button class="teaser-cta">Engage the Robot \ud83e\udd16</button>
  `;
  document.getElementById('grants').appendChild(card);
  card.querySelector('button').addEventListener('click', openModal);
}

function openModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <button class="close-btn" aria-label="Close">\u00d7</button>
      <h2>Grant-Scouting Agent</h2>
      <p>Coming Soon \u2013 we\u2019re wiring the circuits! Check back shortly.</p>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
  };
  overlay.querySelector('.close-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.close-btn').focus();
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', esc);
    }
  });
}

document.getElementById('grants').addEventListener('grantsUpdated', (e) => {
  selectedName = e.detail.name;
  teaserShown = false;
  if (observer) observer.disconnect();
  const last = document.querySelector('#grants .grant:last-child');
  if (!last) return;
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        showTeaser();
      }
    });
  }, { threshold: 1 });
  observer.observe(last);
});
