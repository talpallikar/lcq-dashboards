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
let activeView = 'overview'; // 'overview' or a format name

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.tab.active').classList.remove('active');
    btn.classList.add('active');
    activeView = btn.dataset.format;
    render();
  });
});

// ---------- Helpers ----------
function eventsForFormat(fmt) {
  return LCQ_DATA.filter(e => e.format === fmt);
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function metaCounts(events) {
  const counts = {};
  let total = 0;
  for (const ev of events) {
    for (const dl of ev.decklists) {
      counts[dl.deck] = (counts[dl.deck] || 0) + 1;
      total++;
    }
  }
  return { counts, total };
}

function renderBars(containerEl, counts, total, limit) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const show = limit ? sorted.slice(0, limit) : sorted;
  const max = show.length ? show[0][1] : 1;
  containerEl.innerHTML = show.map(([deck, count]) => `
    <div class="bar-row">
      <span class="bar-label" title="${deck}">${deck}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${(count / max) * 100}%"></div>
      </div>
      <span class="bar-count">${count}</span>
      <span class="bar-pct">${pct(count, total)}%</span>
    </div>
  `).join('');
}

// ---------- Overview ----------
function renderOverview() {
  document.getElementById('overview-section').hidden = false;
  document.getElementById('format-section').hidden = true;

  document.querySelectorAll('.overview-card').forEach(card => {
    const fmt = card.dataset.fmt;
    const events = eventsForFormat(fmt);
    const { counts, total } = metaCounts(events);

    const statsEl = card.querySelector('.overview-stats');
    statsEl.innerHTML = `<span class="overview-stat">${events.length} events</span><span class="overview-stat">${total} decklists</span>`;

    const barsEl = card.querySelector('.overview-bars');
    renderBars(barsEl, counts, total, 8);
  });

  // Make overview cards clickable to jump to format
  document.querySelectorAll('.overview-card').forEach(card => {
    card.onclick = () => {
      const fmt = card.dataset.fmt;
      document.querySelector('.tab.active').classList.remove('active');
      document.querySelector(`.tab[data-format="${fmt}"]`).classList.add('active');
      activeView = fmt;
      render();
    };
  });
}

// ---------- Format detail ----------
function renderFormat(fmt) {
  document.getElementById('overview-section').hidden = true;
  document.getElementById('format-section').hidden = false;

  const data = eventsForFormat(fmt);

  // Meta heading
  document.getElementById('meta-heading').textContent = fmt.charAt(0).toUpperCase() + fmt.slice(1) + ' Metagame';

  // Stats
  document.getElementById('stat-events').textContent = data.length;
  let totalDecklists = 0;
  for (const ev of data) totalDecklists += ev.decklists.length;
  document.getElementById('stat-decklists').textContent = totalDecklists;

  // Metagame bars
  const { counts, total } = metaCounts(data);
  renderBars(document.getElementById('meta-bars'), counts, total);

  // Events list
  const eventsEl = document.getElementById('events-list');
  const noEvents = document.getElementById('no-events');

  if (!data.length) {
    eventsEl.innerHTML = '';
    noEvents.hidden = false;
    return;
  }

  noEvents.hidden = true;

  eventsEl.innerHTML = data.map((ev, idx) => {
    const { counts: evCounts, total: evTotal } = metaCounts([ev]);
    const winner = ev.decklists[0];
    const metaSorted = Object.entries(evCounts).sort((a, b) => b[1] - a[1]);

    return `
      <div class="event-card">
        <div class="event-header" data-idx="${fmt}-${idx}">
          <div class="event-info">
            <strong>${ev.event}</strong>
            <span class="event-date">${formatDate(ev.date)}</span>
          </div>
          <div class="event-summary">
            <span class="event-players">${ev.players} players</span>
            <span class="event-winner">Winner: <strong>${winner.player}</strong> (${winner.deck})</span>
            <span class="event-toggle">&#9656;</span>
          </div>
        </div>
        <div class="event-detail" id="detail-${fmt}-${idx}" hidden>
          <div class="event-detail-grid">
            <div class="event-meta-col">
              <h3>Event Meta</h3>
              <div class="mini-meta">
                ${metaSorted.map(([deck, count]) => `
                  <div class="mini-meta-row">
                    <span class="mini-meta-name">${deck}</span>
                    <span class="mini-meta-bar"><span style="width:${(count / metaSorted[0][1]) * 100}%"></span></span>
                    <span class="mini-meta-count">${count} <small>(${pct(count, evTotal)}%)</small></span>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="event-decks-col">
              <h3>All Decklists</h3>
              <table class="decklist-table">
                <thead>
                  <tr><th>#</th><th>Player</th><th>Deck</th></tr>
                </thead>
                <tbody>
                  ${ev.decklists.map(dl => `
                    <tr>
                      <td>${dl.place}</td>
                      <td>${dl.player}</td>
                      <td>${dl.deck_url ? `<a href="${dl.deck_url}" target="_blank" rel="noopener">${dl.deck}</a>` : dl.deck}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <a href="${ev.url}" class="event-link" target="_blank" rel="noopener">View on MTGGoldfish &#8594;</a>
        </div>
      </div>
    `;
  }).join('');

  // Attach toggle listeners
  eventsEl.querySelectorAll('.event-header').forEach(header => {
    header.addEventListener('click', () => {
      const id = header.dataset.idx;
      const detail = document.getElementById('detail-' + id);
      const arrow = header.querySelector('.event-toggle');
      if (detail.hidden) {
        detail.hidden = false;
        arrow.innerHTML = '&#9662;';
      } else {
        detail.hidden = true;
        arrow.innerHTML = '&#9656;';
      }
    });
  });
}

// ---------- Render ----------
function render() {
  if (activeView === 'overview') {
    renderOverview();
  } else {
    renderFormat(activeView);
  }
}

render();
