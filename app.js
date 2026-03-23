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

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

// Gather all decklists from filtered events into archetype counts
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

function renderBars(containerEl, counts, total) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted.length ? sorted[0][1] : 1;
  containerEl.innerHTML = sorted.map(([deck, count]) => `
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

// ---------- Render ----------
function render() {
  const data = filtered();

  // Stats
  document.getElementById('stat-events').textContent = data.length;
  let totalDecklists = 0;
  for (const ev of data) totalDecklists += ev.decklists.length;
  document.getElementById('stat-decklists').textContent = totalDecklists;
  const latest = data.length ? formatDate(data[0].date) : '—';
  document.getElementById('stat-latest').textContent = latest;

  // Overall metagame bars
  const { counts: overallCounts, total: overallTotal } = metaCounts(data);
  renderBars(document.getElementById('meta-bars'), overallCounts, overallTotal);

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

    // Per-event meta breakdown as sorted array
    const metaSorted = Object.entries(evCounts).sort((a, b) => b[1] - a[1]);

    return `
      <div class="event-card">
        <div class="event-header" data-idx="${idx}">
          <div class="event-info">
            <span class="format-badge ${ev.format}">${ev.format}</span>
            <strong>${ev.event}</strong>
            <span class="event-date">${formatDate(ev.date)}</span>
          </div>
          <div class="event-summary">
            <span class="event-players">${ev.players} players</span>
            <span class="event-winner">Winner: <strong>${winner.player}</strong> (${winner.deck})</span>
            <span class="event-toggle">▸</span>
          </div>
        </div>
        <div class="event-detail" id="detail-${idx}" hidden>
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
                      <td>${dl.deck}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          ${ev.url ? `<a href="${ev.url}" class="event-link" target="_blank" rel="noopener">View on MTGO →</a>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Attach toggle listeners
  eventsEl.querySelectorAll('.event-header').forEach(header => {
    header.addEventListener('click', () => {
      const idx = header.dataset.idx;
      const detail = document.getElementById('detail-' + idx);
      const arrow = header.querySelector('.event-toggle');
      if (detail.hidden) {
        detail.hidden = false;
        arrow.textContent = '▾';
      } else {
        detail.hidden = true;
        arrow.textContent = '▸';
      }
    });
  });
}

render();
