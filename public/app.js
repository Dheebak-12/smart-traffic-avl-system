/**
 * =============================================
 *   Frontend Application — Smart Traffic System
 *   D3.js AVL Tree Visualization + API Calls
 * =============================================
 */

// ─── GLOBAL STATE ───────────────────────────────────────────────────────────
let selectedLane = 1;
let currentTreeView = 'global';
let currentQueueView = 'all';
let refreshInterval = null;
const API = '';   // Same origin

// Vehicle type → SVG icon (matches sprite in index.html)
const TYPE_ICON = {
    'Ambulance': '<svg width="16" height="16" style="vertical-align:-3px"><use href="#icon-ambulance"/></svg>',
    'Fire Truck': '<svg width="16" height="16" style="vertical-align:-3px;color:#ff6b35"><use href="#icon-fire"/></svg>',
    'Police': '<svg width="16" height="16" style="vertical-align:-3px;color:#748ffc"><use href="#icon-police"/></svg>',
    'Bus': '<svg width="16" height="16" style="vertical-align:-3px;color:#ffa502"><use href="#icon-bus"/></svg>',
    'Car': '<svg width="16" height="16" style="vertical-align:-3px;color:#2ed573"><use href="#icon-car"/></svg>',
    'Bike': '<svg width="16" height="16" style="vertical-align:-3px;color:#1e90ff"><use href="#icon-bike"/></svg>'
};

// For D3 canvas we keep a text-only label (SVG can't go inside SVG text elements easily)
const TYPE_LABEL = {
    'Ambulance': 'AMB',
    'Fire Truck': 'FIR',
    'Police': 'POL',
    'Bus': 'BUS',
    'Car': 'CAR',
    'Bike': 'BIK'
};

// Vehicle type → D3 node color
const TYPE_COLOR = {
    'Ambulance': '#ff4757',
    'Fire Truck': '#ff6b35',
    'Police': '#3742fa',
    'Bus': '#ffa502',
    'Car': '#2ed573',
    'Bike': '#1e90ff'
};

// ─── TOAST NOTIFICATION ─────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => { toast.classList.remove('show'); }, duration);
}

// ─── SYSTEM CLOCK ────────────────────────────────────────────────────────────
function updateClock() {
    const el = document.getElementById('system-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
async function checkHealth() {
    try {
        const res = await fetch(`${API}/api/health`);
        const data = await res.json();
        const dot = document.getElementById('db-dot');
        const label = document.getElementById('db-label');
        if (data.db === 'connected') {
            dot.className = 'status-dot connected';
            label.textContent = 'PostgreSQL Connected';
        } else {
            dot.className = 'status-dot disconnected';
            label.textContent = 'DB Disconnected (in-memory)';
        }
    } catch (e) {
        document.getElementById('db-dot').className = 'status-dot disconnected';
        document.getElementById('db-label').textContent = 'Server Offline';
    }
}

// ─── LANE SELECTOR (FORM) ────────────────────────────────────────────────────
document.querySelectorAll('.lane-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.lane-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedLane = parseInt(btn.dataset.lane);
        document.getElementById('lane-number').value = selectedLane;
    });
});

// ─── VEHICLE NUMBER VALIDATION ─────────────────────────────────────────────────
// Format: 2 LETTERS · 2 DIGITS · 2 LETTERS · 4 DIGITS  →  e.g. TN01AB1234
const PLATE_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;

// Segments for the hint bar: [label, length, type ]
const PLATE_SEGS = [
    { id: 'ph-s1', len: 2, type: 'letter' },
    { id: 'ph-s2', len: 2, type: 'digit' },
    { id: 'ph-s3', len: 2, type: 'letter' },
    { id: 'ph-s4', len: 4, type: 'digit' }
];

// Cache of currently-waiting vehicle numbers for duplicate detection
let _queueNumbers = new Set();

// Refresh the queue-number cache (called after every queue load)
function refreshQueueCache(queue) {
    _queueNumbers = new Set((queue || []).map(v => v.vehicle_number));
}

/**
 * Validate the plate input in real time.
 * Returns { ok: boolean, msg: string, type: 'ok'|'err'|'warn'|'info' }
 */
function validatePlate(raw) {
    const val = raw.toUpperCase();

    if (val.length === 0) {
        return { ok: false, msg: 'Format: TN01AB1234  (2L·2N·2L·4N)', type: 'info' };
    }

    // Step-by-step character feedback
    for (let i = 0; i < val.length; i++) {
        const ch = val[i];
        if (i < 2 || (i >= 4 && i < 6)) {
            // Positions 0,1 and 4,5 must be letters
            if (!/[A-Z]/.test(ch)) {
                return { ok: false, msg: `Position ${i + 1}: expected a LETTER, got '${ch}'`, type: 'err' };
            }
        } else {
            // Positions 2,3 and 6-9 must be digits
            if (!/[0-9]/.test(ch)) {
                return { ok: false, msg: `Position ${i + 1}: expected a DIGIT, got '${ch}'`, type: 'err' };
            }
        }
    }

    if (val.length < 10) {
        const remaining = 10 - val.length;
        return { ok: false, msg: `${remaining} more character${remaining > 1 ? 's' : ''} needed (${val.length}/10)`, type: 'warn' };
    }

    // Full 10-char – run the regex
    if (!PLATE_REGEX.test(val)) {
        return { ok: false, msg: 'Invalid format. Must be 2 letters · 2 digits · 2 letters · 4 digits', type: 'err' };
    }

    // Duplicate check against live queue
    if (_queueNumbers.has(val)) {
        return { ok: false, msg: `${val} is already in the queue!`, type: 'err' };
    }

    return { ok: true, msg: `${val} — valid plate number`, type: 'ok' };
}

/**
 * Update the hint bar — colour each segment green once those chars are typed
 */
function updatePlateHint(raw) {
    const val = raw.toUpperCase();
    let pos = 0;
    PLATE_SEGS.forEach(seg => {
        const el = document.getElementById(seg.id);
        if (!el) return;
        const filled = val.slice(pos, pos + seg.len);
        const isDone = filled.length === seg.len;
        el.className = `plate-seg seg-${isDone ? 'done' : seg.type}`;
        pos += seg.len;
    });
}

// Wire up the vehicle-number input
const _plateInput = document.getElementById('vehicle-number');
const _plateIcon = document.getElementById('plate-status-icon');
const _plateMsg = document.getElementById('plate-validation-msg');

_plateInput.addEventListener('input', () => {
    // Auto-uppercase 
    const start = _plateInput.selectionStart;
    _plateInput.value = _plateInput.value.toUpperCase();
    _plateInput.setSelectionRange(start, start);

    const val = _plateInput.value;
    const result = validatePlate(val);

    // Update hint bar
    updatePlateHint(val);

    // Update input border class
    _plateInput.classList.remove('input-valid', 'input-invalid', 'input-checking');
    if (val.length === 0) {
        _plateIcon.textContent = '';
    } else if (result.type === 'ok') {
        _plateInput.classList.add('input-valid');
        _plateIcon.innerHTML = '<svg width="14" height="14" style="color:var(--success)"><use href="#icon-check-circle"/></svg>';
    } else if (result.type === 'err') {
        _plateInput.classList.add('input-invalid');
        _plateIcon.innerHTML = '<svg width="14" height="14" style="color:var(--danger)"><use href="#icon-alert"/></svg>';
    } else {
        // warn / info — partial
        _plateIcon.innerHTML = '<svg width="13" height="13" style="color:var(--warning)"><use href="#icon-bolt"/></svg>';
    }

    // Update message
    _plateMsg.className = `validation-msg msg-${result.type}`;
    _plateMsg.textContent = result.msg;
});

// Reset validation UI helper
function resetPlateUI() {
    _plateInput.value = '';
    _plateInput.classList.remove('input-valid', 'input-invalid', 'input-checking');
    _plateIcon.textContent = '';
    _plateMsg.className = 'validation-msg msg-info';
    _plateMsg.textContent = 'Format: TN01AB1234 (2L·2N·2L·4N)';
    PLATE_SEGS.forEach(seg => {
        const el = document.getElementById(seg.id);
        if (el) el.className = `plate-seg seg-${seg.type}`;
    });
}

// ─── ADD VEHICLE ─────────────────────────────────────────────────────────────
document.getElementById('add-vehicle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('add-vehicle-btn');
    const num = _plateInput.value.trim().toUpperCase();
    const type = document.getElementById('vehicle-type').value;
    const lane = document.getElementById('lane-number').value;

    // ── Frontend validation first ──
    if (!num || !type || !lane) {
        showToast('Please fill all fields', 'error');
        return;
    }

    const plateCheck = validatePlate(num);
    if (!plateCheck.ok) {
        // Shake the input and show message
        _plateInput.classList.remove('input-invalid');
        void _plateInput.offsetWidth;
        _plateInput.classList.add('input-invalid');
        _plateIcon.innerHTML = '<svg width="14" height="14" style="color:var(--danger)"><use href="#icon-alert"/></svg>';
        _plateMsg.className = 'validation-msg msg-err';
        _plateMsg.textContent = plateCheck.msg;
        showToast(`Invalid plate: ${plateCheck.msg}`, 'error');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = 'Adding...';

    try {
        const res = await fetch(`${API}/api/vehicles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicle_number: num, vehicle_type: type, lane_number: parseInt(lane) })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to add vehicle');

        showToast(data.message, 'success');
        resetPlateUI();
        document.getElementById('vehicle-type').value = '';
        await refreshAll();

    } catch (err) {
        // Could be server-side duplicate / format rejection
        showToast(`Error: ${err.message}`, 'error');
        _plateInput.classList.add('input-invalid');
        _plateIcon.innerHTML = '<svg width="14" height="14" style="color:var(--danger)"><use href="#icon-alert"/></svg>';
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<svg width="16" height="16"><use href="#icon-seed"/></svg> Add to AVL Queue';
    }
});

// ─── SIGNAL GREEN (GLOBAL) ───────────────────────────────────────────────────
async function signalGreen(lane = null) {
    const btn = document.getElementById('btn-signal-green');
    btn.classList.add('loading');

    try {
        const url = lane
            ? `${API}/api/vehicles/remove?lane=${lane}`
            : `${API}/api/vehicles/remove`;

        const res = await fetch(url, { method: 'DELETE' });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Queue is empty');

        showToast(data.message, 'success', 5000);
        await refreshAll();

    } catch (err) {
        showToast(err.message, 'warning');
    } finally {
        btn.classList.remove('loading');
    }
}

async function signalGreenLane(lane) {
    await signalGreen(lane);
}

// ─── SEARCH VEHICLE ──────────────────────────────────────────────────────────
async function searchVehicle() {
    const number = document.getElementById('search-input').value.trim().toUpperCase();
    const resultDiv = document.getElementById('search-result');

    if (!number) { showToast('Enter a vehicle number to search', 'warning'); return; }

    resultDiv.className = 'search-result';
    resultDiv.innerHTML = '<span style="color:var(--text-muted)">Searching…</span>';

    try {
        const res = await fetch(`${API}/api/vehicles/search?number=${encodeURIComponent(number)}`);
        const data = await res.json();

        if (!data.found) {
            resultDiv.className = 'search-result not-found';
            resultDiv.innerHTML = `<strong>Not Found</strong><br>${data.message}`;
        } else {
            const v = data.vehicle;
            resultDiv.className = 'search-result found';
            resultDiv.innerHTML = `
        <strong>${TYPE_ICON[v.vehicle_type] || '🚗'} ${v.vehicle_number}</strong><br>
        Type: ${v.vehicle_type} &nbsp;|&nbsp; Priority: <strong>P${v.priority}</strong><br>
        Lane: ${v.lane_number} &nbsp;|&nbsp; Waiting: <strong>${data.waitTime} min</strong><br>
        Status: ${v.status}
      `;
        }
    } catch (err) {
        resultDiv.className = 'search-result not-found';
        resultDiv.innerHTML = `Error: ${err.message}`;
    }
}

document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchVehicle();
});

// ─── DYNAMIC PRIORITY UPDATE ─────────────────────────────────────────────────
async function updatePriorities() {
    const btn = document.getElementById('btn-update-priority');
    btn.classList.add('loading');
    btn.textContent = 'Updating...';

    try {
        const res = await fetch(`${API}/api/vehicles/update-priority`, { method: 'POST' });
        const data = await res.json();
        showToast(data.message, data.updated > 0 ? 'warning' : 'info');
        if (data.updated > 0) await refreshAll();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<svg width="16" height="16"><use href="#icon-flame"/></svg> Dynamic Priority Boost';
    }
}

// ─── CLEAR LANE ───────────────────────────────────────────────────────────────
async function clearLane(lane) {
    if (!confirm(`Clear all vehicles from Lane ${lane}?`)) return;

    try {
        const res = await fetch(`${API}/api/lane/${lane}`, { method: 'DELETE' });
        const data = await res.json();
        showToast(data.message, 'warning');
        await refreshAll();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

// ─── TREE VIEW SWITCH ─────────────────────────────────────────────────────────
function switchTreeView(view) {
    currentTreeView = view;
    document.querySelectorAll('.tree-view-btn').forEach(b => b.classList.remove('active'));
    const btnId = view === 'global' ? 'btn-global-tree' : `btn-lane${view}-tree`;
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');
    loadTree();
}

function switchQueueView(view) {
    currentQueueView = view;
    document.querySelectorAll('.queue-view-btn').forEach(b => b.classList.remove('active'));
    const btnId = view === 'all' ? 'qv-all' : `qv-${view}`;
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');
    loadQueue();
}

// ─── D3.JS AVL TREE VISUALIZATION ─────────────────────────────────────────────
async function loadTree() {
    try {
        const url = currentTreeView === 'global'
            ? `${API}/api/tree`
            : `${API}/api/tree?lane=${currentTreeView}`;
        const res = await fetch(url);
        const data = await res.json();
        renderTree(data.tree, data.analytics);
        updateAnalytics(data.analytics);
    } catch (err) {
        console.warn('Tree load error:', err.message);
    }
}

function updateAnalytics(a) {
    if (!a) return;
    document.getElementById('analytics-height').textContent = `Height: ${a.height}`;
    document.getElementById('analytics-nodes').textContent = `Nodes: ${a.size}`;
    document.getElementById('analytics-rotations').textContent = `Rotations: ${a.rotations}`;
    document.getElementById('stat-tree-height').textContent = `Height: ${a.height} | Inserts: ${a.insertions}`;
    document.getElementById('stat-rotation-count').textContent = a.rotations;
}

function renderTree(treeData, analytics) {
    const container = document.getElementById('tree-container');

    if (!treeData) {
        container.innerHTML = `
      <div class="tree-empty">
        <div class="tree-empty-icon">
          <svg width="52" height="52" style="opacity:.35;color:var(--primary)"><use href="#icon-tree"/></svg>
        </div>
        <p>AVL Tree is empty — Add vehicles to see the tree</p>
      </div>`;
        return;
    }

    container.innerHTML = '';

    const W = container.clientWidth || 700;
    const H = Math.max(container.clientHeight || 420, 420);
    const NODE_R = 24;

    /* Convert backend tree → D3 hierarchy */
    function toD3(node) {
        if (!node) return null;
        const d = {
            name: node.name,
            vehicle: node.vehicle,
            balance: node.balance,
            nodeH: node.height,
        };
        const children = [];
        if (node.left) children.push(toD3(node.left));
        if (node.right) children.push(toD3(node.right));
        if (children.length) d.children = children;
        return d;
    }

    const root = d3.hierarchy(toD3(treeData));
    const layout = d3.tree().nodeSize([NODE_R * 3.2, 90]);
    layout(root);

    // Find bounds for centering
    let minX = Infinity, maxX = -Infinity;
    root.each(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); });
    const treeWidth = maxX - minX + NODE_R * 4;
    const svgWidth = Math.max(W, treeWidth);

    const svg = d3.select('#tree-container')
        .append('svg')
        .attr('width', svgWidth)
        .attr('height', H)
        .style('display', 'block');

    const g = svg.append('g')
        .attr('transform', `translate(${svgWidth / 2 - (minX + maxX) / 2}, 40)`);

    /* Tooltip */
    const tooltip = d3.select('#tree-container')
        .append('div')
        .attr('class', 'tooltip-box');

    /* Links */
    g.selectAll('.link')
        .data(root.links())
        .join('path')
        .attr('class', 'link')
        .attr('d', d3.linkVertical().x(d => d.x).y(d => d.y));

    /* Nodes */
    const node = g.selectAll('.node')
        .data(root.descendants())
        .join('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`);

    /* Circle */
    node.append('circle')
        .attr('r', NODE_R)
        .attr('fill', d => d.data.vehicle ? (TYPE_COLOR[d.data.vehicle.vehicle_type] || '#667eea') : '#334155')
        .attr('stroke', d => Math.abs(d.data.balance || 0) > 1 ? '#ffa502' : 'rgba(255,255,255,0.25)')
        .attr('stroke-width', d => Math.abs(d.data.balance || 0) > 1 ? 2.5 : 1.5)
        .style('filter', d => d.data.vehicle && d.data.vehicle.priority <= 3
            ? `drop-shadow(0 0 8px ${TYPE_COLOR[d.data.vehicle.vehicle_type]})` : 'none')
        .on('mouseover', (event, d) => {
            if (!d.data.vehicle) return;
            const v = d.data.vehicle;
            tooltip.style('display', 'block').html(`
        <strong style="color:${TYPE_COLOR[v.vehicle_type]}">${TYPE_ICON[v.vehicle_type] || ''} ${v.vehicle_number}</strong><br>
        Type: ${v.vehicle_type}<br>
        Priority: P${v.priority}<br>
        Lane: ${v.lane_number}<br>
        BF: ${d.data.balance} &nbsp;Height: ${d.data.nodeH}<br>
        Status: ${v.status}
      `);
        })
        .on('mousemove', (event) => {
            const rect = container.getBoundingClientRect();
            tooltip
                .style('left', (event.clientX - rect.left + 14) + 'px')
                .style('top', (event.clientY - rect.top - 20) + 'px');
        })
        .on('mouseleave', () => { tooltip.style('display', 'none'); });

    /* Vehicle type label inside node (text, not emoji — stays crisp in SVG) */
    node.append('text')
        .attr('y', -4)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '8px')
        .attr('font-weight', '800')
        .attr('fill', 'rgba(255,255,255,0.90)')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('letter-spacing', '0.5')
        .text(d => d.data.vehicle ? (TYPE_LABEL[d.data.vehicle.vehicle_type] || 'VEH') : '');

    /* Priority under icon */
    node.append('text')
        .attr('y', 11)
        .attr('text-anchor', 'middle')
        .attr('class', 'node-label')
        .attr('fill', 'rgba(255,255,255,0.95)')
        .attr('font-size', '9px')
        .attr('font-weight', '700')
        .text(d => d.data.vehicle ? `P${d.data.vehicle.priority}` : '');

    /* Vehicle number below circle */
    node.append('text')
        .attr('y', NODE_R + 13)
        .attr('text-anchor', 'middle')
        .attr('class', 'node-label')
        .attr('fill', 'rgba(200,210,230,0.85)')
        .attr('font-size', '8.5px')
        .text(d => d.data.name ? (d.data.name.length > 10 ? d.data.name.slice(0, 10) + '…' : d.data.name) : '');

    /* Balance factor label */
    node.append('text')
        .attr('y', NODE_R + 24)
        .attr('text-anchor', 'middle')
        .attr('class', d => `node-label ${Math.abs(d.data.balance || 0) > 1 ? 'balance-warn' : 'balance-good'}`)
        .attr('font-size', '8px')
        .text(d => d.data.balance !== undefined ? `BF:${d.data.balance}` : '');
}

// ─── LOAD QUEUE ───────────────────────────────────────────────────────────────
async function loadQueue() {
    try {
        const url = currentQueueView === 'all'
            ? `${API}/api/queue`
            : `${API}/api/queue?lane=${currentQueueView}`;
        const res = await fetch(url);
        const data = await res.json();
        const queue = data.queue || [];
        refreshQueueCache(queue);          // ← keep duplicate-check cache fresh
        renderQueue(queue);
        document.getElementById('queue-count').textContent = `${data.total || 0} waiting`;
    } catch (err) {
        console.warn('Queue load error:', err.message);
    }
}

function renderQueue(queue) {
    const list = document.getElementById('queue-list');
    if (!queue || queue.length === 0) {
        list.innerHTML = '<div class="queue-empty">No vehicles waiting</div>';
        return;
    }

    list.innerHTML = queue.map((v, i) => `
    <div class="queue-item">
      <span class="queue-rank">#${i + 1}</span>
      <span class="queue-type-icon">${TYPE_ICON[v.vehicle_type] || '<svg width="16" height="16"><use href="#icon-car"/></svg>'}</span>
      <div class="queue-info">
        <div class="queue-number">${v.vehicle_number}</div>
        <div class="queue-meta">
          <span class="queue-meta-item">Lane ${v.lane_number}</span>
          <span class="queue-meta-item">•</span>
          <span class="queue-meta-item">${v.vehicle_type}</span>
        </div>
      </div>
      <span class="queue-priority-badge priority-${v.priority}">P${v.priority}</span>
      <span class="queue-wait">${v.wait_minutes}m</span>
    </div>
  `).join('');
}

// ─── LOAD STATS ───────────────────────────────────────────────────────────────
async function loadStats() {
    try {
        const res = await fetch(`${API}/api/stats`);
        const data = await res.json();

        animateNumber('stat-in-queue', data.inQueue || 0);
        animateNumber('stat-emergency-count', data.emergencyInQueue || 0);
        animateNumber('stat-passed-count', data.passedVehicles || 0);

        document.getElementById('stat-avg-wait').textContent =
            `Avg wait: ${(data.avgWaitTime || 0).toFixed(1)} min`;

        if (data.busiestLane) {
            document.getElementById('stat-busiest-lane').textContent = `Lane ${data.busiestLane}`;
            document.getElementById('stat-busiest-count').textContent = `${data.busiestLaneCount} vehicles`;
        }

        // Lane density bars
        if (data.laneBreakdown) {
            const max = Math.max(...Object.values(data.laneBreakdown), 1);
            [1, 2, 3, 4].forEach(l => {
                const count = data.laneBreakdown[l] || 0;
                const pct = (count / max * 100).toFixed(1);
                const fill = document.getElementById(`lane-fill-${l}`);
                const cnt = document.getElementById(`lane-count-${l}`);
                if (fill) {
                    fill.style.width = `${pct}%`;
                    fill.className = `lane-bar-fill ${pct > 70 ? 'high' : pct > 35 ? 'medium' : 'low'}`;
                }
                if (cnt) cnt.textContent = count;
            });
        }

    } catch (err) {
        console.warn('Stats load error:', err.message);
    }
}

// Smooth number animation
function animateNumber(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    const cur = parseInt(el.textContent) || 0;
    if (cur === target) return;
    const diff = target - cur;
    const steps = 12;
    let step = 0;
    const timer = setInterval(() => {
        step++;
        el.textContent = Math.round(cur + diff * (step / steps));
        if (step >= steps) clearInterval(timer);
    }, 25);
}

// ─── LOAD DATABASE RECORDS ────────────────────────────────────────────────────
async function loadDbRecords() {
    try {
        const res = await fetch(`${API}/api/vehicles`);
        const data = await res.json();
        renderDbTable(data.vehicles || []);
    } catch (err) {
        document.getElementById('db-table-body').innerHTML =
            `<tr><td colspan="7" class="table-empty">DB unavailable — ${err.message}</td></tr>`;
    }
}

function renderDbTable(vehicles) {
    const tbody = document.getElementById('db-table-body');
    if (!vehicles.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No records yet</td></tr>';
        return;
    }

    tbody.innerHTML = vehicles.map(v => {
        const dt = new Date(v.arrival_time).toLocaleTimeString('en-IN', { hour12: false });
        return `
      <tr>
        <td style="color:var(--text-muted);font-family:var(--font-mono)">${v.id}</td>
        <td class="vehicle-num-cell">${v.vehicle_number}</td>
        <td class="vehicle-type-cell" style="color:${TYPE_COLOR[v.vehicle_type] || '#aaa'}">${TYPE_ICON[v.vehicle_type] || ''} ${v.vehicle_type}</td>
        <td class="priority-cell" style="color:${priorityColor(v.priority)}">P${v.priority}</td>
        <td style="color:var(--text-secondary)">Lane ${v.lane_number}</td>
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${dt}</td>
        <td><span class="status-${v.status}">${v.status.toUpperCase()}</span></td>
      </tr>
    `;
    }).join('');
}

function priorityColor(p) {
    const colors = { 1: '#ff4757', 2: '#ff6b35', 3: '#748ffc', 4: '#ffa502', 5: '#2ed573', 6: '#1e90ff' };
    return colors[p] || '#aaa';
}

// ─── LOAD LOGS ────────────────────────────────────────────────────────────────
async function loadLogs() {
    try {
        const res = await fetch(`${API}/api/logs`);
        const data = await res.json();
        renderLogs(data.logs || []);
    } catch (err) {
        document.getElementById('logs-list').innerHTML =
            `<div class="log-empty">DB unavailable</div>`;
    }
}

function renderLogs(logs) {
    const list = document.getElementById('logs-list');
    if (!logs.length) {
        list.innerHTML = '<div class="log-empty">No activity yet</div>';
        return;
    }

    list.innerHTML = logs.map(log => {
        const t = new Date(log.timestamp).toLocaleTimeString('en-IN', { hour12: false });
        return `
      <div class="log-item ${log.action}">
        <div class="log-action">${log.action.replace(/_/g, ' ')}</div>
        <div class="log-message">${log.message || '—'}</div>
        <div class="log-time">${t}</div>
      </div>
    `;
    }).join('');
}

// ─── REFRESH ALL ──────────────────────────────────────────────────────────────
async function refreshAll() {
    await Promise.all([
        loadStats(),
        loadQueue(),
        loadTree(),
        loadDbRecords(),
        loadLogs()
    ]);
}

// ─── AUTO REFRESH EVERY 5 SECONDS ────────────────────────────────────────────
function startAutoRefresh() {
    refreshInterval = setInterval(async () => {
        await loadStats();
        await loadQueue();
        await loadTree();
    }, 5000);
}

// ─── INITIALIZE ───────────────────────────────────────────────────────────────
(async function init() {
    await checkHealth();
    await refreshAll();
    startAutoRefresh();

    // Refresh DB + logs every 10 seconds
    setInterval(() => { loadDbRecords(); loadLogs(); }, 10000);

    // Health check every 30 seconds
    setInterval(checkHealth, 30000);

    console.log('%c Smart Traffic System — AVL Engine Active', 'color:#00d4ff;font-size:14px;font-weight:bold;');
    console.log('%cO(log n) guaranteed for Insert / Delete / Search', 'color:#2ed573;font-size:12px;');
})();
