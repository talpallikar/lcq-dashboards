// ---------- Theme ----------
const toggle = document.getElementById('theme-toggle');
toggle.addEventListener('click', () => {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ---------- State ----------
let activeFormat = 'all';

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.tab.active').classList.remove('active');
    btn.classList.add('active');
    activeFormat = btn.dataset.format;
    render();
  });
});

// ---------- Helpers ----------
function filtered() {
  if (activeFormat === 'all') return LCQ_DATA;
  return LCQ_DATA.filter(e => e.format === activeFormat);
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- Render ----------
function render() {
  const data = filtered();

  // Stats
  document.getElementById('stat-events').textContent = data.length;
  const uniquePlayers = new Set(data.map(e => e.winner)).size;
  document.getElementById('stat-players').textContent = uniquePlayers;
  const latest = data.length ? formatDate(data[0].date) : '—';
  document.getElementById('stat-latest').textContent = latest;

  // Events table
  const tbody = document.querySelector('#events-table tbody');
  const noEvents = document.getElementById('no-events');
  if (!data.length) {
    tbody.innerHTML = '';
    noEvents.hidden = false;
    document.getElementById('events-table').hidden = true;
  } else {
    noEvents.hidden = true;
    document.getElementById('events-table').hidden = false;
    tbody.innerHTML = data.map(e => `
      <tr>
        <td>${formatDate(e.date)}</td>
        <td><span class="format-badge ${e.format}">${e.format}</span></td>
        <td>${e.event}</td>
        <td>${e.players}</td>
        <td>${e.winner}</td>
        <td>${e.deck}</td>
      </tr>
    `).join('');
  }

  // Top decks bar chart
  const deckCounts = {};
  data.forEach(e => { deckCounts[e.deck] = (deckCounts[e.deck] || 0) + 1; });
  const sorted = Object.entries(deckCounts).sort((a, b) => b[1] - a[1]);
  const max = sorted.length ? sorted[0][1] : 1;
  const barsEl = document.getElementById('deck-bars');
  barsEl.innerHTML = sorted.map(([deck, count]) => `
    <div class="bar-row">
      <span class="bar-label">${deck}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${(count / max) * 100}%"></div>
      </div>
      <span class="bar-count">${count}</span>
    </div>
  `).join('');

  // Repeat qualifiers
  const playerWins = {};
  data.forEach(e => {
    if (!playerWins[e.winner]) playerWins[e.winner] = { wins: 0, formats: new Set() };
    playerWins[e.winner].wins++;
    playerWins[e.winner].formats.add(e.format);
  });
  const repeats = Object.entries(playerWins)
    .filter(([, v]) => v.wins > 1)
    .sort((a, b) => b[1].wins - a[1].wins);
  const ptbody = document.querySelector('#players-table tbody');
  if (!repeats.length) {
    ptbody.innerHTML = '<tr><td colspan="3" class="empty">No repeat qualifiers yet.</td></tr>';
  } else {
    ptbody.innerHTML = repeats.map(([name, v]) => `
      <tr>
        <td>${name}</td>
        <td>${v.wins}</td>
        <td>${[...v.formats].map(f => `<span class="format-badge ${f}">${f}</span>`).join(' ')}</td>
      </tr>
    `).join('');
  }
}

render();
