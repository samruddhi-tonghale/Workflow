"use strict";
const API = '/api';
let workflows = [], current = null, selectedNode = null, saveTimer = null, toastTimer = null, zoom = 1;
const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s)), esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, opts = {}) { const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts }); let d = {}; try {
    d = await r.json();
}
catch { } if (!r.ok)
    throw Error(d.error || 'Request failed'); return d; }
function toast(s) { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
function titleBar(k, t, s, a = '') { return `<div class="topbar"><div><div class="eyebrow">${k}</div><h1 class="page-title">${t}</h1><p class="subtitle">${s}</p></div>${a}</div>`; }
async function load() { try {
    workflows = await api('/workflows');
    renderList();
}
catch (e) {
    $('#mainView').innerHTML = `<div class="integration-banner">Could not reach the local workflow service: ${esc(e.message)}. Start it with <code>python server.py</code>.</div>`;
} }
function renderList() { const action = '<button class="button primary" id="newWorkflow">＋ Create workflow</button>', opts = ['Draft', 'Published', 'Deactivated', 'Warning']; $('#mainView').innerHTML = titleBar('WORKFLOW MANAGEMENT', 'Workflows', 'Build, test and manage your AI request pipelines.', action) + `<div class="stat-strip"><div class="stat-card"><small>ALL WORKFLOWS</small><strong>${workflows.length}</strong><span>Across your workspace</span></div><div class="stat-card"><small>PUBLISHED</small><strong>${workflows.filter(w => w.status === 'Published').length}</strong><span>Live endpoints</span></div><div class="stat-card"><small>DRAFTS</small><strong>${workflows.filter(w => w.status === 'Draft').length}</strong><span>Ready to configure</span></div><div class="stat-card"><small>INTEGRATIONS</small><strong>0 <span style="font-size:12px">/ 2</span></strong><span>Orchestrator · Experts</span></div></div><div class="toolbar"><div class="search-wrap"><span>⌕</span><input id="search" class="field" placeholder="Search workflows by name…"></div><select id="statusFilter"><option>All statuses</option>${opts.map(x => `<option>${x}</option>`).join('')}</select><select id="sort"><option>Recently updated</option><option>Name A–Z</option></select></div><div id="listContent"></div>`; $('#newWorkflow').onclick = () => $('#createDialog').showModal(); $('#search').oninput = drawRows; $('#statusFilter').onchange = drawRows; $('#sort').onchange = drawRows; drawRows(); }
function drawRows() {
    const q = $('#search')?.value.toLowerCase() || '', st = $('#statusFilter')?.value || 'All statuses', sort = $('#sort')?.value;
    let rows = workflows.filter(w => (w.name + ' ' + w.domain).toLowerCase().includes(q) && (st === 'All statuses' || w.status === st));
    if (sort === 'Name A–Z')
        rows.sort((a, b) => a.name.localeCompare(b.name));
    const box = $('#listContent');
    if (!rows.length) {
        box.innerHTML = workflows.length ? '<div class="empty-state"><div class="empty-icon">⌕</div><h2>No workflows found</h2><p>Try changing your search or status filter.</p></div>' : '<div class="empty-state"><div class="empty-icon">⌘</div><h2>Your workflows start here</h2><p>Create a workflow to connect a request, routing rules, experts, escalation and one clear response. The Orchestrator and Experts integrations can be connected later.</p><button class="button primary" id="emptyCreate">＋ Create your first workflow</button></div>';
        const b = $('#emptyCreate');
        if (b)
            b.onclick = () => $('#createDialog').showModal();
        return;
    }
    box.innerHTML = `<p class="results-label">Showing ${rows.length} workflow${rows.length === 1 ? '' : 's'}</p><div class="table-wrap"><table class="workflow-table"><thead><tr><th>WORKFLOW</th><th>ORCHESTRATOR</th><th>EXPERTS</th><th>ROUTER</th><th>AGGREGATION</th><th>STATUS</th><th>VERSION</th><th>UPDATED</th><th></th></tr></thead><tbody>${rows.map(w => `<tr><td><span class="workflow-name" data-open="${w.id}">${esc(w.name)}</span><span class="cell-sub">${esc(w.domain || w.description || 'No description')}</span></td><td><span class="status">Not connected</span></td><td>—</td><td>${esc((w.settings.router.type || 'semantic').replace('_', ' '))}</td><td>${esc((w.settings.aggregator.method || 'highest_confidence').replaceAll('_', ' '))}</td><td><span class="status ${w.status.toLowerCase()}">${w.status}</span></td><td>v${w.version}</td><td>${new Date(w.updated_at).toLocaleDateString()}</td><td><button class="row-menu" data-menu="${w.id}">•••</button></td></tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openWorkflow(b.dataset.open));
    box.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => rowMenu(b.dataset.menu));
}
async function rowMenu(id) { const w = workflows.find(x => x.id === id), a = prompt(`Action for “${w.name}”: edit, ${w.status === 'Published' ? 'deactivate' : 'activate'}, duplicate, or delete`); if (!a)
    return; try {
    if (a === 'edit')
        return openWorkflow(id);
    if (a === 'deactivate' || a === 'activate') {
        await api('/workflows/' + id, { method: 'PUT', body: JSON.stringify({ ...w, status: a === 'deactivate' ? 'Deactivated' : 'Published' }) });
        toast(`Workflow ${a}d`);
    }
    else if (a === 'duplicate') {
        const c = await api('/workflows', { method: 'POST', body: JSON.stringify({ name: w.name + ' copy', description: w.description, domain: w.domain }) });
        await api('/workflows/' + c.id, { method: 'PUT', body: JSON.stringify({ ...c, graph: w.graph, settings: w.settings }) });
        toast('Workflow duplicated');
    }
    else if (a === 'delete') {
        if (w.status === 'Published')
            throw Error('Deactivate the workflow first.');
        if (confirm(`Delete “${w.name}”?`)) {
            await api('/workflows/' + id, { method: 'DELETE' });
            toast('Workflow deleted');
        }
    }
    await load();
}
catch (e) {
    toast(e.message);
} }
$('#createForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target); try {
    const w = await api('/workflows', { method: 'POST', body: JSON.stringify({ name: f.get('name'), description: f.get('description'), domain: f.get('domain') }) });
    $('#createDialog').close();
    e.target.reset();
    workflows.unshift(w);
    openWorkflow(w.id);
}
catch (x) {
    toast(x.message);
} });
async function openWorkflow(id) { try {
    current = await api('/workflows/' + id);
    let changed = migrateLinearGraph(current);
    current.graph.nodes.forEach(n => { n.config = n.config || {}; if (n.type === 'registry' && n.config.enabled !== true) {
        n.config.enabled = true;
        changed = true;
    } if (n.type === 'escalation') {
        if (n.config.fallbackEnabled !== true) {
            n.config.fallbackEnabled = true;
            changed = true;
        }
        if (n.previewActive !== true) {
            n.previewActive = true;
            changed = true;
        }
        if (n.summary !== 'Active · fallback when no expert matches') {
            n.summary = 'Active · fallback when no expert matches';
            changed = true;
        }
    } });
    if (changed)
        await api('/workflows/' + id, { method: 'PUT', body: JSON.stringify(current) });
    selectedNode = null;
    renderBuilder();
}
catch (e) {
    toast(e.message);
} }
function migrateLinearGraph(w) { const ns = w.graph?.nodes || [], types = ns.map(n => n.type).join(','); if (ns.some(n => n.label === 'ORK Orchestrator' && ns.filter(x => x.type === 'expert').length === 2))
    return false; const old = Object.fromEntries(ns.filter(n => !ns.some(m => m !== n && m.type === n.type)).map(n => [n.type, n])); const specs = [['request', 'Request', 45, 300, 'Input trigger'], ['orchestrator', 'ORK Orchestrator', 250, 260, 'Integration pending'], ['registry', 'Expert registry', 265, 515, 'Capabilities · availability'], ['expert', 'Expert 1', 650, 105, 'Integration pending'], ['expert', 'Expert 2', 650, 215, 'Integration pending'], ['escalation', 'Larger model fallback', 650, 575, 'Only when confidence is low'], ['aggregator', 'Aggregator', 1040, 275, 'Checks · combines · responds'], ['response', 'Response', 1340, 285, 'Final answer']]; const made = specs.map(([type, label, x, y, summary], i) => ({ id: old[type] && i < 3 ? old[type].id : crypto.randomUUID(), type, label, x, y, summary, config: {} })); const b = {}; made.forEach(n => { var _a; return (b[_a = n.type] ?? (b[_a] = [])).push(n); }); const edges = []; const link = (a, c) => edges.push({ id: crypto.randomUUID(), source: a.id, target: c.id, label: '' }); link(b.request[0], b.orchestrator[0]); link(b.registry[0], b.orchestrator[0]); b.expert.forEach(n => { link(b.orchestrator[0], n); link(n, b.aggregator[0]); }); link(b.orchestrator[0], b.escalation[0]); link(b.escalation[0], b.aggregator[0]); link(b.aggregator[0], b.response[0]); w.graph = { nodes: made, edges }; return true; }
function renderBuilder() { const w = current; $('#mainView').innerHTML = `<div class="builder-head"><div><div class="eyebrow">WORKFLOW</div></div></div><div class="builder-layout diagram-only"><section class="canvas-wrap" id="canvasWrap"><div class="canvas" id="canvas"><svg class="edge-layer" id="edgeLayer"></svg><div id="nodeLayer"></div></div><div class="canvas-toolbar"><button id="zoomOut" title="Zoom out">−</button><button id="zoomLabel">100%</button><button id="zoomIn" title="Zoom in">＋</button><button id="fitCanvas">Fit diagram</button></div></section></div><div class="builder-bottom"><span class="validation-status" id="validationStatus">● Draft · Integration dependencies pending</span><button class="button secondary" id="validateWorkflow">Validate flow</button></div>`; $('#validateWorkflow').onclick = validate; $('#zoomOut').onclick = () => setZoom(zoom - .1); $('#zoomIn').onclick = () => setZoom(zoom + .1); $('#fitCanvas').onclick = fitDiagram; renderCanvas(); fitDiagram(); window.onresize = fitDiagram; }
const nodeTypes = [['request', 'Request', '↳'], ['orchestrator', 'Orchestrator', '◉'], ['registry', 'Registry lookup', '⌕'], ['expert', 'Expert', '✦'], ['condition', 'Condition', '◇'], ['escalation', 'Escalation LLM', '⚡'], ['aggregator', 'Aggregator', '⫶'], ['response', 'Response', '↗'], ['note', 'Note', '▤']];
function drawPalette() { const q = $('#paletteSearch')?.value.toLowerCase() || ''; $('#paletteItems').innerHTML = nodeTypes.filter(n => n[1].toLowerCase().includes(q)).map(n => `<div draggable="true" class="palette-node" data-type="${n[0]}"><span class="node-symbol">${n[2]}</span>${n[1]}</div>`).join(''); $$('.palette-node').forEach(el => el.ondragstart = e => e.dataTransfer.setData('nodeType', el.dataset.type)); }
function renderCanvas() { if (!current)
    return; const c = $('#canvas'), wrap = $('#canvasWrap'); if (!c)
    return; c.style.transform = `scale(${zoom})`; $('#nodeLayer').innerHTML = current.graph.nodes.map(n => `<div class="canvas-node node-${n.type} ${n.config?.enabled === false ? "inactive" : ""} ${n.previewActive ? "runtime-active" : ""} ${['orchestrator', 'registry', 'expert', 'escalation'].includes(n.type) ? 'stub' : ''} ${selectedNode === n.id ? 'selected' : ''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px"><i class="handle in"></i><div class="node-type">${nodeTypes.find(t => t[0] === n.type)?.[2] || '◇'} &nbsp;${esc(n.type)}</div><div class="node-label">${esc(n.label)}</div><div class="node-summary">${esc(n.summary || 'Click to configure')}</div><i class="handle out"></i></div>`).join(''); drawEdges(); $$('.canvas-node').forEach(el => { el.onclick = () => { const n = current.graph.nodes.find(x => x.id === el.dataset.id); if (n.type === "expert") {
    showExpertControls(n);
    return;
} selectedNode = el.dataset.id; renderCanvas(); }; let sx, sy, ox, oy; el.onpointerdown = e => { if (e.target.classList.contains('handle'))
    return; e.preventDefault(); el.setPointerCapture(e.pointerId); const n = current.graph.nodes.find(n => n.id === el.dataset.id); sx = e.clientX; sy = e.clientY; ox = n.x; oy = n.y; el.onpointermove = ev => { if (!ev.buttons)
    return; n.x = Math.round(ox + (ev.clientX - sx) / zoom); n.y = Math.round(oy + (ev.clientY - sy) / zoom); el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; drawEdges(); }; el.onpointerup = () => { el.onpointermove = null; scheduleSave(); }; }; }); }
function drawEdges() { const svg = $('#edgeLayer'); if (!svg)
    return; svg.setAttribute('width', '1540'); svg.setAttribute('height', '720'); const nodes = current.graph.nodes, dim = n => ({ request: [150, 64], orchestrator: [250, 128], registry: [230, 76], expert: [310, 68], escalation: [310, 82], aggregator: [250, 92], response: [180, 68] }[n.type] || [220, 76]); const paths = current.graph.edges.map(e => { const a = nodes.find(n => n.id === e.source), b = nodes.find(n => n.id === e.target); if (!a || !b)
    return ''; const [aw, ah] = dim(a), [bw, bh] = dim(b); let d; if (a.type === 'registry' && b.type === 'orchestrator') {
    d = `M${a.x + aw / 2},${a.y} V${b.y + ah}`;
}
else if (a.type === 'orchestrator' && b.type === 'escalation') {
    d = `M${a.x + aw / 2},${a.y + ah} V${b.y + bh / 2} H${b.x}`;
}
else if (a.type === 'escalation' && b.type === 'aggregator') {
    d = `M${a.x + aw},${a.y + ah / 2} H${b.x + bw / 2} V${b.y + bh}`;
}
else {
    const x = a.x + aw, y = a.y + ah / 2, u = b.x, v = b.y + bh / 2, m = (x + u) / 2;
    d = `M${x},${y} C${m},${y} ${m},${v} ${u},${v}`;
} const inactiveExpert = (a.type === 'expert' && a.config?.enabled === false) || (b.type === 'expert' && b.config?.enabled === false); return `<path class="edge-path ${a.type === 'orchestrator' && b.type === 'escalation' || a.type === 'escalation' ? 'fallback' : ''} ${inactiveExpert ? 'disabled' : ''}" d="${d}" marker-end="url(#arrow)"/>`; }).join(''); svg.innerHTML = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#8198b2" stroke-width="1.5"/></marker></defs>${paths}`; }
function renderSettings() { }
function addNode(type, x = 420, y = 400) { const d = nodeTypes.find(t => t[0] === type); if (!d)
    return; const n = { id: crypto.randomUUID(), type, label: d[1], x, y, summary: type === 'expert' ? 'No experts connected' : type === 'condition' ? 'Set a condition' : 'Click to configure', config: {} }; const ns = current.graph.nodes; ns.push(n); if (ns.length > 1)
    current.graph.edges.push({ id: crypto.randomUUID(), source: ns[ns.length - 2].id, target: n.id, label: '' }); selectedNode = n.id; renderCanvas(); scheduleSave(); }
function fitDiagram() { const w = $('#canvasWrap'); if (w)
    setZoom(Math.min(1, (w.clientWidth - 48) / 1540, (w.clientHeight - 48) / 720)); }
function setZoom(z) { zoom = Math.max(.25, Math.min(1.4, z)); const c = $('#canvas'); if (c)
    c.style.transform = `scale(${zoom})`; const b = $('#zoomLabel'); if (b)
    b.textContent = Math.round(zoom * 100) + '%'; }
function scheduleSave() { if (!current)
    return; $('#saveState').textContent = 'Saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => saveCurrent(true), 650); }
async function saveCurrent(quiet = false) { if (!current)
    return; const id = current.id, payload = JSON.stringify(current); try {
    const saved = await api('/workflows/' + id, { method: 'PUT', body: payload });
    const state = $('#saveState');
    if (state)
        state.textContent = 'All changes saved';
    workflows = workflows.map(w => w.id === id ? saved : w);
    if (!quiet)
        toast('Draft saved');
}
catch (e) {
    const state = $('#saveState');
    if (state)
        state.textContent = 'Save failed';
    toast(e.message);
} }
async function testFlow() { const promptText = prompt('Enter a sample request to preview routing:'); if (promptText === null)
    return; const noMatch = confirm('Preview routing: click OK if no active expert matches (LLM fallback runs). Click Cancel if an active expert matches.'); const experts = current.graph.nodes.filter(n => n.type === 'expert' && n.config?.enabled !== false); const llm = current.graph.nodes.find(n => n.type === 'escalation'); if (llm)
    llm.previewActive = true; renderCanvas(); try {
    await api('/workflows/' + current.id + '/test', { method: 'POST', body: JSON.stringify({ prompt: promptText }) });
}
catch (e) {
    toast(e.message);
    return;
} alert(noMatch ? `No active expert matched. The LLM fallback is activated for this preview. The Expert registry remains active to check for matches. ${experts.length} active expert(s) were checked. No real model was called.` : `An active expert matched. The LLM remains on standby. The Expert registry remains active. ${experts.length} active expert(s) are available. No real model was called.`); }
function validate() { const ts = current.graph.nodes.map(n => n.type), issues = []; for (const t of ['request', 'response', 'expert', 'aggregator', 'escalation'])
    if (!ts.includes(t))
        issues.push(`Add a ${t} node`); if (current.graph.edges.length < current.graph.nodes.length - 1)
    issues.push('Connect all nodes'); const el = $('#validationStatus'); el.textContent = issues.length ? '● ' + issues.join(' · ') : '● Structure looks good · Integrations still pending'; el.style.color = issues.length ? 'var(--amber)' : 'var(--teal)'; toast(issues.length ? `${issues.length} validation item${issues.length > 1 ? 's' : ''} found` : 'Flow structure validated'); }
function switchTab(t) { if (t === 'thresholds')
    alert('Thresholds: router confidence 0.70 · answer confidence 0.75 · workflow test pass rate 85% · expert timeout 30 sec.'); if (t === 'versions')
    alert(`Version history\nCurrent version: v${current.version} · ${current.status}`); if (t === 'tests')
    alert('No test runs yet. Use Test to preview the workflow structure.'); }
$('#integrationDetails').onclick = () => alert('Integration placeholders\n\nOrchestrator: registry lookup, routing execution, retries and live endpoint.\nExperts: ready-to-deploy expert catalogue and endpoint calls.\n\nThese are intentionally empty until the other modules are available.');
openWorkflowsDefault();
// Sidebar destinations are clickable; external modules remain empty integration shells.
$$('.nav-item[data-page]').forEach(link => link.addEventListener('click', e => { e.preventDefault(); const page = link.dataset.page; $$('.nav-item').forEach(x => x.classList.toggle('active', x === link)); if (page === 'workflows') {
    openWorkflowsDefault();
    return;
} showNavPage(page); }));
function showNavPage(page) { const names = { overview: 'Overview', orchestrator: 'Orchestrator', experts: 'Experts', team: 'Team', settings: 'Settings' }; const integrations = ['orchestrator', 'experts'].includes(page); const title = names[page] || 'Workspace'; const message = page === 'orchestrator' ? 'The Orchestrator module is being developed separately. Its registry, routing engine, run logs and runtime endpoint will connect here when available.' : page === 'experts' ? 'The Experts module is being developed separately. Its expert catalogue, readiness status and deployment endpoints will connect here when available.' : page === 'overview' ? 'Your workspace overview will appear here. Start by creating a workflow.' : `${title} workspace features will be added here.`; $('#mainView').innerHTML = titleBar(integrations ? 'INTEGRATION PLACEHOLDER' : 'WORKSPACE', title, message, `<button class="button primary" id="goWorkflows">Open workflows <span>→</span></button>`) + `<div class="empty-state"><div class="empty-icon">${page === 'orchestrator' ? '◎' : page === 'experts' ? '✦' : '⌘'}</div><h2>${integrations ? 'Module not connected yet' : `${title} is ready for setup`}</h2><p>${esc(message)}</p>${integrations ? '<div class="integration-placeholder" style="max-width:480px;margin:0 auto 18px;text-align:left">Status: awaiting integration<br>This page is a clickable placeholder. No orchestrator or expert behavior is simulated here.</div>' : ''}<button class="button secondary" id="goWorkflows2">Go to Workflows</button></div>`; $('#goWorkflows').onclick = () => $('[data-page="workflows"]').click(); $('#goWorkflows2').onclick = () => $('[data-page="workflows"]').click(); }
function showExpertControls(node) { let d = document.getElementById('expertDialog'); if (!d) {
    d = document.createElement('dialog');
    d.id = 'expertDialog';
    d.innerHTML = '<form method="dialog" class="expert-dialog"><div class="eyebrow">EXPERT STATUS</div><h2 id="expertDialogTitle"></h2><p id="expertDialogStatus"></p><div class="dialog-actions"><button class="button secondary" value="cancel">Close</button><button type="button" class="button primary" id="expertToggle"></button></div></form>';
    document.body.appendChild(d);
} node.config = node.config || {}; const active = node.config.enabled !== false; document.getElementById('expertDialogTitle').textContent = node.label; document.getElementById('expertDialogStatus').textContent = active ? 'This expert is active and included in the workflow.' : 'This expert is inactive, remains on the diagram, and will be skipped.'; const b = document.getElementById('expertToggle'); b.textContent = active ? 'Deactivate expert' : 'Activate expert'; b.disabled = false; b.onclick = async () => { node.config.enabled = !active; const llm = current.graph.nodes.find(n => n.type === 'escalation'); if (llm)
    llm.previewActive = true; renderCanvas(); b.disabled = true; try {
    await saveCurrent(true);
    d.close();
    toast(node.label + (active ? ' deactivated' : ' activated'));
}
finally {
    b.disabled = false;
} }; d.showModal(); }
async function openWorkflowsDefault() { try {
    const items = await api('/workflows');
    if (items.length) {
        await openWorkflow(items[0].id);
    }
    else {
        current = null;
        workflows = items;
        renderList();
    }
}
catch (e) {
    toast(e.message);
} }
