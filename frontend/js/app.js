/**
 * Sales Prompt Router — Frontend Application Logic
 * ==================================================
 * This file manages the UI state for the 4-phase pipeline.
 * 
 * Architecture:
 *   - salesStore: Central state object (inspect via console: salesStore)
 *   - debugLog(): Appends timestamped entries to the Chain of Thought panel
 *   - runPipeline(): Orchestrates the 4-phase execution flow
 *
 * Currently uses a MOCK backend. To connect to the real Python backend,
 * replace the mock functions with fetch() calls to a FastAPI server.
 */

// ==========================================
// 1. GLOBAL STATE (inspect via console)
// ==========================================
const salesStore = {
  // Sidebar context (filled by user)
  context: {
    my_company: '',
    my_industry: '',
    my_website: '',
    my_social: '',
    product_name: '',
    product_desc: '',
    social_proof: '',
    prospect_name: '',
    prospect_title: '',
    company_name: '',
    industry: '',
  },
  // Pipeline results
  pipeline: {
    query: '',
    phase1: null,  // { categories: [], reasoning: '' }
    phase2: null,  // [{ id, category, use_case, template, variables, metadata }]
    phase3: null,  // { selected_prompt_id, missing_variables, clarifying_question, prompt }
    phase4: null,  // string (final artifact)
  },
  // UI State
  isRunning: false,
  startTime: null,
};

// Expose to browser console for debugging
window.salesStore = salesStore;

// ==========================================
// 2. DOM REFERENCES
// ==========================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  queryInput: $('#user-query-input'),
  btnRun: $('#btn-run-pipeline'),
  btnClear: $('#btn-clear-log'),
  btnToggleDebug: $('#btn-toggle-debug'),
  emptyState: $('#empty-state'),
  debugLog: $('#debug-log'),
  overallStatus: $('#pipeline-overall-status'),
  duration: $('#pipeline-duration'),
  contextStatus: $('#context-status'),
  // Phase cards
  phase1: { card: $('#phase-1-card'), body: $('#phase-1-body'), status: $('#phase-1-status') },
  phase2: { card: $('#phase-2-card'), body: $('#phase-2-body'), status: $('#phase-2-status') },
  phase3: { card: $('#phase-3-card'), body: $('#phase-3-body'), status: $('#phase-3-status') },
  phase4: { card: $('#phase-4-card'), body: $('#phase-4-body'), status: $('#phase-4-status') },
};

// ==========================================
// 3. DEBUG LOGGER (Chain of Thought)
// ==========================================
function debugLog(message, type = 'info') {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const colorClass = {
    phase: 'log-phase',
    info: 'log-info',
    success: 'log-success',
    warn: 'log-warn',
    error: 'log-error',
    arrow: 'log-arrow',
  }[type] || 'log-info';

  const entry = document.createElement('div');
  entry.className = `log-entry ${colorClass}`;
  entry.innerHTML = `<span class="text-surfaceHighlight mr-2">${ts}</span>${message}`;
  dom.debugLog.appendChild(entry);
  dom.debugLog.scrollTop = dom.debugLog.scrollHeight;
}

function clearDebugLog() {
  dom.debugLog.innerHTML = '<p class="text-textMuted/50 italic">Pipeline logs will appear here...</p>';
}

// ==========================================
// 4. CONTEXT SYNC (Sidebar → Store)
// ==========================================
function syncContext() {
  salesStore.context.my_company = $('#ctx-my-company').value.trim();
  salesStore.context.my_industry = $('#ctx-my-industry').value.trim();
  salesStore.context.my_website = $('#ctx-my-website').value.trim();
  salesStore.context.my_social = $('#ctx-my-social').value.trim();

  salesStore.context.product_name = $('#ctx-product-name').value.trim();
  salesStore.context.product_desc = $('#ctx-product-desc').value.trim();
  salesStore.context.social_proof = $('#ctx-social-proof').value.trim();

  salesStore.context.prospect_name = $('#ctx-prospect-name').value.trim();
  salesStore.context.prospect_title = $('#ctx-prospect-title').value.trim();
  salesStore.context.company_name = $('#ctx-company-name').value.trim();
  salesStore.context.industry = $('#ctx-industry').value.trim();

  // Update context status indicator
  const filled = Object.values(salesStore.context).filter(v => v).length;
  const total = Object.keys(salesStore.context).length;
  const statusEl = dom.contextStatus;
  if (filled === 0) {
    statusEl.innerHTML = `<i class="ph-fill ph-circle text-surfaceHighlight text-[8px]"></i><span>Fill context to enable auto-hydration</span>`;
  } else if (filled < total) {
    statusEl.innerHTML = `<i class="ph-fill ph-circle text-[#f9e2af] text-[8px]"></i><span>${filled}/${total} fields filled</span>`;
  } else {
    statusEl.innerHTML = `<i class="ph-fill ph-circle text-success text-[8px]"></i><span>All context ready ✓</span>`;
  }
}

// ==========================================
// 5. PHASE RENDERING
// ==========================================
function showPhase(phaseNum) {
  const phase = dom[`phase${phaseNum}`];
  phase.card.classList.remove('hidden');
  phase.status.innerHTML = '<i class="ph ph-circle-notch animate-spin text-primary"></i>';
}

function completePhase(phaseNum) {
  const phase = dom[`phase${phaseNum}`];
  phase.status.innerHTML = '<i class="ph-fill ph-check-circle text-success"></i>';
}

function failPhase(phaseNum, errorMsg) {
  const phase = dom[`phase${phaseNum}`];
  phase.status.innerHTML = '<i class="ph-fill ph-x-circle text-accent"></i>';
  phase.body.innerHTML = `<p class="text-accent text-sm">${errorMsg}</p>`;
}

function renderPhase1(data) {
  const badges = data.categories.map(cat =>
    `<span class="category-badge selected"><i class="ph-fill ph-folder-open text-xs"></i>${cat}</span>`
  ).join('');

  dom.phase1.body.innerHTML = `
    <div class="space-y-3">
      <div>
        <span class="text-[10px] text-textMuted uppercase tracking-wider font-bold">Top 2 Categories</span>
        <div class="flex gap-2 mt-1.5">${badges}</div>
      </div>
      <div class="bg-[#11111b]/50 rounded-lg p-3 border border-surfaceHighlight/30">
        <span class="text-[10px] text-textMuted uppercase tracking-wider font-bold block mb-1">Reasoning</span>
        <p class="text-xs text-textMuted leading-relaxed">${data.reasoning}</p>
      </div>
    </div>
  `;
}

function renderPhase2(prompts) {
  const cards = prompts.map((p, i) => `
    <div class="prompt-candidate" data-id="${p.id}">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-semibold text-white">${p.use_case}</span>
        <span class="text-[10px] text-textMuted font-mono">${p.id}</span>
      </div>
      <div class="flex gap-2 mb-2">
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/20">${p.category}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-surfaceHighlight text-textMuted">L${p.tree_level}</span>
      </div>
      <p class="text-xs text-textMuted leading-relaxed truncate">${p.template.substring(0, 120)}...</p>
    </div>
  `).join('');

  dom.phase2.body.innerHTML = `
    <div>
      <span class="text-[10px] text-textMuted uppercase tracking-wider font-bold">Top 3 Candidates (via Dense + Sparse Hybrid Search)</span>
      <div class="space-y-2 mt-2">${cards}</div>
    </div>
  `;
}

function renderPhase3(data) {
  if (data.selected_prompt_id === "NONE") {
    dom.phase3.body.innerHTML = `
        <div class="bg-accent/10 border border-accent/20 rounded-lg p-4">
            <div class="flex items-start gap-3">
                <i class="ph-fill ph-warning-circle text-accent text-xl mt-0.5"></i>
                <div>
                    <h4 class="text-sm font-bold text-accent mb-1">No Matching Prompt Found</h4>
                    <p class="text-sm text-textMain leading-relaxed">${data.clarifying_question}</p>
                </div>
            </div>
        </div>
        `;
    return;
  }

  const prompt = data.prompt;
  const varsHtml = prompt.variables.map(v => {
    // Check if this variable can be filled from context
    const contextValue = findContextValue(v);
    if (contextValue) {
      return `<span class="var-pill filled" title="Filled: ${contextValue}"><i class="ph-fill ph-check-circle mr-1"></i>${v}</span>`;
    } else if (data.missing_variables.includes(v)) {
      return `<span class="var-pill unfilled"><i class="ph ph-warning-circle mr-1"></i>${v}</span>`;
    }
    return `<span class="var-pill filled">${v}</span>`;
  }).join('');

  // Highlight winner in Phase 2
  $$('.prompt-candidate').forEach(el => {
    if (el.dataset.id === data.selected_prompt_id) {
      el.classList.add('winner');
      el.querySelector('.text-white').insertAdjacentHTML('afterend',
        ' <i class="ph-fill ph-trophy text-success text-xs"></i>');
    }
  });

  // Build template display with highlighted variables
  let templateDisplay = prompt.template;
  prompt.variables.forEach(v => {
    const ctxVal = findContextValue(v);
    const pillClass = ctxVal ? 'var-pill filled' : 'var-pill unfilled';
    const displayText = ctxVal ? ctxVal : v;
    templateDisplay = templateDisplay.replace(`[${v}]`, `<span class="${pillClass}">[${displayText}]</span>`);
  });

  let missingHtml = '';
  if (data.missing_variables.length > 0) {
    missingHtml = `
      <div class="mt-4 bg-[#11111b] border border-surfaceHighlight/60 rounded-xl p-5 shadow-lg shadow-black/20">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
            <i class="ph-fill ph-robot text-primary text-lg"></i>
          </div>
          <div class="flex-1">
            <p class="text-xs font-semibold text-white mb-1">Agent Question</p>
            <p class="text-sm text-textMuted leading-relaxed mb-5">${data.clarifying_question}</p>
            
            <div class="space-y-4">
              ${data.missing_variables.map(v => `
                <div>
                  <label class="block text-[10px] text-textMuted uppercase tracking-wider font-bold mb-1.5">${v}</label>
                  <input type="text" data-var="${v}" class="missing-var-input input-field py-2.5 text-sm bg-background border-surfaceHighlight focus:ring-primary/30" placeholder="Enter ${v}...">
                </div>
              `).join('')}
              <button id="btn-submit-vars" class="btn-primary mt-2 flex items-center justify-center gap-2 w-full py-2.5 shadow-none transition-transform active:scale-[0.98]">
                <i class="ph ph-magic-wand"></i> Fill & Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  dom.phase3.body.innerHTML = `
    <div class="space-y-2">
      <div class="flex flex-col gap-1 mb-2">
        <span class="text-[10px] text-textMuted uppercase tracking-wider font-bold">Winning Prompt</span>
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-white">${prompt.use_case}</span>
          <span class="text-[10px] text-textMuted font-mono bg-surfaceHighlight/30 px-1.5 py-0.5 rounded">${data.selected_prompt_id}</span>
        </div>
      </div>

      <details class="group transition-all">
        <summary class="text-xs text-textMuted hover:text-white cursor-pointer select-none flex items-center gap-1.5 transition-colors w-max">
          <i class="ph-bold ph-caret-right transition-transform group-open:rotate-90"></i>
          View Prompt Template Details
        </summary>
        <div class="mt-3 bg-[#11111b]/50 rounded-lg p-4 border border-surfaceHighlight/30 ml-2">
          <div class="mb-4">
            <span class="text-[10px] text-textMuted uppercase tracking-wider font-bold block mb-1.5">Variables</span>
            <div class="flex flex-wrap gap-1.5">${varsHtml}</div>
          </div>
          <div>
            <span class="text-[10px] text-textMuted uppercase tracking-wider font-bold block mb-2">Template Preview</span>
            <p class="text-[13px] text-textMuted leading-relaxed font-mono">${templateDisplay}</p>
          </div>
        </div>
      </details>

      ${missingHtml}
    </div>
  `;

  // Wire up the submit button if it exists
  const submitBtn = document.getElementById('btn-submit-vars');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmitMissingVars);
  }
}

function renderPhase4(artifact) {
  dom.phase4.body.innerHTML = `
    <div class="space-y-3">
      <div class="bg-[#11111b] rounded-lg p-5 border border-success/20 shadow-[0_0_20px_rgba(166,227,161,0.05)]">
        <div class="flex items-center justify-between mb-3">
          <span class="text-[10px] text-success uppercase tracking-wider font-bold flex items-center gap-1">
            <i class="ph-fill ph-sparkle"></i> Generated Sales Artifact
          </span>
          <button id="btn-copy-artifact" class="text-[10px] text-textMuted hover:text-white transition-colors flex items-center gap-1 cursor-pointer">
            <i class="ph ph-copy"></i> Copy
          </button>
        </div>
        <div id="artifact-text" class="text-sm text-textMain leading-relaxed whitespace-pre-wrap">${artifact}</div>
      </div>
    </div>
  `;

  // Wire copy button
  const copyBtn = document.getElementById('btn-copy-artifact');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(artifact);
      copyBtn.innerHTML = '<i class="ph-fill ph-check"></i> Copied!';
      setTimeout(() => { copyBtn.innerHTML = '<i class="ph ph-copy"></i> Copy'; }, 2000);
    });
  }
}

// ==========================================
// 6. CONTEXT MATCHING HELPER
// ==========================================
function findContextValue(varName) {
  const ctx = salesStore.context;

  // 1. Exact match first (handles variables filled dynamically in Phase 3)
  if (ctx[varName]) {
    return ctx[varName];
  }

  // 2. Fallback to hardcoded sidebar mappings
  const lower = varName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  const map = {
    'my company': ctx.my_company,
    'our company': ctx.my_company,
    'sender company': ctx.my_company,
    'our industry': ctx.my_industry,
    'my industry': ctx.my_industry,
    'website url': ctx.my_website,
    'website': ctx.my_website,
    'social link': ctx.my_social,
    'linkedin': ctx.my_social,
    'linkedin url': ctx.my_social,
    'your product': ctx.product_name,
    'product description': ctx.product_desc,
    'product/service': ctx.product_name,
    'solution': ctx.product_name,
    'prospects name': ctx.prospect_name,
    'prospect name': ctx.prospect_name,
    'prospects job title': ctx.prospect_title,
    'prospect job title': ctx.prospect_title,
    'job title': ctx.prospect_title,
    'target role': ctx.prospect_title,
    'prospects role': ctx.prospect_title,
    'company name': ctx.company_name,
    'company': ctx.company_name,
    'industry': ctx.industry,
    'prospects industry': ctx.industry,
    'similar company': ctx.social_proof,
    'client company': ctx.social_proof,
    'competitor name': '',
  };

  return map[lower] || '';
}

// ==========================================
// 7. BACKEND API CALLS
// ==========================================
// These communicate with the FastAPI backend.

async function fetchPhase(endpoint, payload) {
  const res = await fetch(`http://localhost:8000/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error ${res.status}`);
  }
  return res.json();
}

async function mockPhase1(query) {
  return await fetchPhase('phase1', { query });
}

async function mockPhase2(query, categories) {
  return await fetchPhase('phase2', { query, categories });
}

async function mockPhase3(query, top3, context) {
  return await fetchPhase('phase3', { query, top3, context });
}

async function mockPhase4(promptId, context) {
  const result = await fetchPhase('phase4', { promptId, context });
  return result.output;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// 8. PIPELINE ORCHESTRATOR
// ==========================================
async function runPipeline(query) {
  if (salesStore.isRunning) return;
  salesStore.isRunning = true;
  salesStore.startTime = Date.now();
  salesStore.pipeline.query = query;

  // Reset UI
  dom.emptyState.classList.add('hidden');
  [1, 2, 3, 4].forEach(n => {
    dom[`phase${n}`].card.classList.add('hidden');
    dom[`phase${n}`].body.innerHTML = '';
  });
  clearDebugLog();
  dom.overallStatus.textContent = 'RUNNING';
  dom.overallStatus.className = 'text-primary font-bold';

  syncContext();
  debugLog(`<b>Pipeline started</b> for query: "${query}"`, 'phase');
  debugLog(`Context: ${JSON.stringify(salesStore.context, null, 0)}`, 'info');

  try {
    // ── PHASE 1 ──
    debugLog('─────────────────────────', 'arrow');
    debugLog('[PHASE 1] Dispatcher analyzing intent...', 'phase');
    showPhase(1);
    const p1 = await mockPhase1(query);
    salesStore.pipeline.phase1 = p1;
    renderPhase1(p1);
    completePhase(1);
    debugLog(`→ Categories: [${p1.categories.join(', ')}]`, 'success');
    debugLog(`→ Reasoning: ${p1.reasoning}`, 'info');

    // ── PHASE 2 ──
    debugLog('─────────────────────────', 'arrow');
    debugLog('[PHASE 2] Executing Hybrid Search...', 'phase');
    showPhase(2);
    const p2 = await mockPhase2(query, p1.categories);
    salesStore.pipeline.phase2 = p2;
    renderPhase2(p2);
    completePhase(2);
    debugLog(`→ Found ${p2.length} candidates: [${p2.map(p => p.id).join(', ')}]`, 'success');

    // ── PHASE 3 ──
    debugLog('─────────────────────────', 'arrow');
    debugLog('[PHASE 3] Specialist selecting best prompt...', 'phase');
    showPhase(3);
    const p3 = await mockPhase3(query, p2, salesStore.context);
    salesStore.pipeline.phase3 = p3;
    renderPhase3(p3);
    completePhase(3);

    if (p3.selected_prompt_id === "NONE") {
      debugLog(`→ No matching prompt found!`, 'error');
      debugLog(`→ Agent asked for clarification`, 'warn');
      dom.overallStatus.textContent = 'NEEDS CLARIFICATION';
      dom.overallStatus.className = 'text-accent font-bold';
      salesStore.isRunning = false;
      updateDuration();
      return;
    }

    debugLog(`→ Winner: ${p3.selected_prompt_id} (${p3.prompt.use_case})`, 'success');
    if (p3.missing_variables.length > 0) {
      debugLog(`→ Missing vars: [${p3.missing_variables.join(', ')}]`, 'warn');
      debugLog('⏸ Waiting for user input...', 'warn');
      dom.overallStatus.textContent = 'WAITING FOR INPUT';
      dom.overallStatus.className = 'text-[#f9e2af] font-bold';
    } else {
      // All vars present, go straight to Phase 4
      await executePhase4();
    }

  } catch (err) {
    debugLog(`ERROR: ${err.message}`, 'error');
    dom.overallStatus.textContent = 'ERROR';
    dom.overallStatus.className = 'text-accent font-bold';
  }

  salesStore.isRunning = p3HasMissing();
  updateDuration();
}

function p3HasMissing() {
  return salesStore.pipeline.phase3?.missing_variables?.length > 0;
}

async function handleSubmitMissingVars() {
  const inputs = document.querySelectorAll('.missing-var-input');
  inputs.forEach(input => {
    const varName = input.dataset.var;
    const value = input.value.trim();
    if (value) {
      salesStore.context[varName] = value;
      debugLog(`→ User provided "${varName}": "${value}"`, 'success');
    }
  });

  debugLog('[CONTEXT UPDATED] Proceeding to Phase 4...', 'phase');
  await executePhase4();
}

async function executePhase4() {
  debugLog('─────────────────────────', 'arrow');
  debugLog('[PHASE 4] Generating final artifact...', 'phase');
  showPhase(4);

  const p4 = await mockPhase4(salesStore.pipeline.phase3.selected_prompt_id, salesStore.context);
  salesStore.pipeline.phase4 = p4;
  renderPhase4(p4);
  completePhase(4);

  debugLog('→ Artifact generated successfully!', 'success');
  debugLog('<b>Pipeline complete ✓</b>', 'phase');
  dom.overallStatus.textContent = 'COMPLETE';
  dom.overallStatus.className = 'text-success font-bold';
  salesStore.isRunning = false;
  updateDuration();
}

function updateDuration() {
  if (salesStore.startTime) {
    const elapsed = ((Date.now() - salesStore.startTime) / 1000).toFixed(1);
    dom.duration.textContent = `${elapsed}s`;
  }
}

// ==========================================
// 9. EVENT LISTENERS
// ==========================================
dom.btnRun.addEventListener('click', () => {
  const query = dom.queryInput.value.trim();
  if (query) runPipeline(query);
});

dom.queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = dom.queryInput.value.trim();
    if (query) runPipeline(query);
  }
});

dom.btnClear.addEventListener('click', clearDebugLog);

if (dom.btnToggleDebug) {
  dom.btnToggleDebug.addEventListener('click', () => {
    const debugSidebar = document.getElementById('sidebar-debug');
    debugSidebar.classList.toggle('hidden');

    // toggle icon
    const icon = dom.btnToggleDebug.querySelector('i');
    if (debugSidebar.classList.contains('hidden')) {
      icon.classList.remove('text-surfaceHighlight');
      icon.classList.add('text-primary');
    } else {
      icon.classList.remove('text-primary');
      icon.classList.add('text-surfaceHighlight');
    }
  });
}

// Example query buttons
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('example-query')) {
    dom.queryInput.value = e.target.textContent.trim();
    runPipeline(dom.queryInput.value);
  }
});

// Sync context on any sidebar input change
$$('#sidebar-context input').forEach(input => {
  input.addEventListener('input', syncContext);
});

// Initialize
syncContext();
console.log('%c🚀 Sales Prompt Router loaded. Inspect state: salesStore', 'color: #89b4fa; font-weight: bold; font-size: 14px;');
