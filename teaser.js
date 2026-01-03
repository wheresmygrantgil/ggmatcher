let selectedName = '';
let observer;
let teaserShown = false;

function showTeaser() {
  if (teaserShown) return;
  teaserShown = true;

  const card = document.createElement('div');
  card.className = 'teaser-card';
  card.innerHTML = `
    <img src="assets/wizardoc.jpg" alt="Grant Matching Wizard">
    <p>Didn't spot the perfect call?<br>
    ⚡ Let our AI wizard scout the web for fresh opportunities tailored to <em>${selectedName}</em>!</p>
    <button class="teaser-cta">Engage the Wizard 🧙</button>
  `;
  document.getElementById('grants').appendChild(card);
  const teaserBtn = card.querySelector('button');
  teaserBtn.addEventListener('click', openModal);
  teaserBtn.addEventListener('click', () =>
    track('click_teaser_cta', { researcher_name: selectedName })
  );
}

function openModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <button class="close-btn" aria-label="Close">\u00d7</button>
      <h2>Your Personal Grant Wizard 🧙</h2>
      <p>
        Interested in an AI wizard that continuously monitors new grant opportunities tailored to your research?
        <br><br>
        <a href="mailto:gzeevi25@gmail.com" style="color: var(--accent); text-decoration: underline;">Get in touch</a> to learn more.
      </p>
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
