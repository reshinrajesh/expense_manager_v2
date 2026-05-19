/* ============================================================
   EXPENSE PORTAL SPA â€” Part 1: Core, Bootstrap, Dashboard
   ============================================================ */
frappe.pages['expense_portal'].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'Expense Portal',
    single_column: true,
  });

  // Inject CSS link
  frappe.require([
    '/assets/expense_manager_v2/css/expense_portal.css',
  ]);

  // Mount the HTML shell if not already loaded by Frappe
  if ($(wrapper).find('.ep-shell').length === 0) {
    $(wrapper).find('.page-content').html(
      frappe.templates['expense_portal'] || ''
    );
  }

  // Boot the SPA
  new ExpensePortal(wrapper);
};

/* ============================================================
   Main SPA Class
   ============================================================ */
class ExpensePortal {
  constructor(wrapper) {
    this.wrapper      = wrapper;
    this.currentView  = 'dashboard';
    this.currentUser  = frappe.session.user;
    this.employee     = null;   // filled on init
    this.isManager    = false;
    this.dropdowns    = { expenseTypes: [], modes: [], costCenters: [] };

    this._init();
  }

  /* ---------- Bootstrap ---------- */
  async _init() {
    await this._loadSessionData();
    this._renderShell();
    this._bindNav();
    this._showView('dashboard');
  }

  async _loadSessionData() {
    try {
      const boot = frappe.boot;
      this.employee  = boot.expense_employee || {};
      this.isManager = (boot.expense_roles || []).includes('Expense Manager');
    } catch (e) {
      console.warn('ExpensePortal: boot data unavailable, fetchingâ€¦');
    }

    // Preload dropdowns, policies, and current month spends
    const [types, modes, ccs, analytics, monthSpends] = await Promise.all([
      this._api('expense_manager_v2.api.expense.get_expense_types'),
      this._api('expense_manager_v2.api.expense.get_modes_of_payment'),
      this._api('expense_manager_v2.api.expense.get_cost_centers'),
      this._api('expense_manager_v2.api.expense.get_analytics_data'),
      this._api('expense_manager_v2.api.expense.get_current_month_spends'),
    ]);
    this.dropdowns.expenseTypes  = types  || [];
    this.dropdowns.modes         = modes  || [];
    this.dropdowns.costCenters   = ccs    || [];
    this.policies                = analytics ? (analytics.policies || []) : [];
    this.currentMonthSpends      = monthSpends || {};
  }

  /* ---------- Shell ---------- */
  _renderShell() {
    const name   = this.employee.employee_name || this.currentUser;
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const role   = this.isManager ? 'Expense Manager' : 'Expense Employee';

    document.getElementById('ep-avatar-initials').textContent = initials;
    document.getElementById('ep-user-name').textContent       = name;
    document.getElementById('ep-user-role').textContent       = role;

    // Show manager-only nav items
    if (this.isManager) {
      document.querySelectorAll('.ep-manager-only')
        .forEach(el => el.style.display = '');
    }

    document.getElementById('btn-new-claim-top')
      .addEventListener('click', () => this._showView('new-claim'));
  }

  /* ---------- Navigation ---------- */
  _bindNav() {
    document.querySelectorAll('.ep-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this._showView(item.dataset.view);
      });
    });
  }

  _showView(view) {
    this.currentView = view;

    // Update nav highlight
    document.querySelectorAll('.ep-nav-item').forEach(i => {
      i.classList.toggle('active', i.dataset.view === view);
    });

    const titles = {
      'dashboard':     'Dashboard',
      'new-claim':     'New Expense Claim',
      'my-claims':     'My Claims',
      'claim-detail':  'Claim Detail',
      'manager-queue': 'Manager Queue',
      'analytics':     'Analytics',
    };
    document.getElementById('ep-page-title').textContent = titles[view] || 'Expense Portal';

    const content = document.getElementById('ep-content');
    content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--gray-400);font-size:14px;">Loadingâ€¦</div>';

    const views = {
      'dashboard':     () => this._renderDashboard(),
      'new-claim':     () => this._renderNewClaim(),
      'my-claims':     () => this._renderMyClaims(),
      'claim-detail':  () => {},
      'manager-queue': () => this._renderManagerQueue(),
      'analytics':     () => this._renderAnalytics(),
    };
    (views[view] || (() => {}))();
  }

  /* ============================================================
     VIEW: Dashboard
     ============================================================ */
  async _renderDashboard() {
    const data = await this._api('expense_manager_v2.api.expense.get_dashboard_data');
    const s    = data.summary || {};
    const recent = data.recent_claims || [];

    let momHtml = '';
    if (data.mom_percent !== undefined) {
      const pct = Math.abs(data.mom_percent).toFixed(1);
      const isUp = data.mom_percent > 0;
      const isDown = data.mom_percent < 0;
      const arrow = isUp ? '▲' : isDown ? '▼' : '•';
      const badgeColor = isUp ? 'var(--danger)' : isDown ? 'var(--success)' : 'var(--gray-400)';
      const badgeBg = isUp ? 'rgba(239,68,68,.12)' : isDown ? 'rgba(0,201,80,.12)' : 'rgba(113,113,123,.12)';
      const labelText = isUp ? 'increase MoM' : isDown ? 'decrease MoM' : 'MoM';
      
      momHtml = `
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;font-weight:600;">
          <span style="background:${badgeBg};color:${badgeColor};padding:2px 8px;border-radius:var(--radius-full);display:inline-flex;align-items:center;gap:3px;">
            <span>${arrow}</span><span>${pct}%</span>
          </span>
          <span style="color:var(--gray-400);font-weight:500;">${labelText}</span>
        </div>`;
    }

    const html = `
      <!-- Stat Cards -->
      <div class="ep-stats-grid" id="ep-stats-grid">
        ${this._statCard('Pending', s['Pending Approval'] || 0, '#F59E0B', `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>`)}
        ${this._statCard('Approved', s['Approved'] || 0, '#00C950', `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>`)}
        ${this._statCard('Rejected', s['Rejected'] || 0, '#EF4444', `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>`)}
        ${this._statCard('Total Claimed', '₹ ' + this._fmt(s['total_amount'] || 0), '#114EFF', `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-2.21 0-4 1.343-4 3s1.79 3 4 3 4 1.343 4 3-1.79 3-4 3m0-15v1m0 14v1"/>
          </svg>`, momHtml)}
      </div>
 
      <!-- Brand gradient divider -->
      <div style="height:3px;background:var(--brand-gradient);border-radius:99px;margin-bottom:24px;"></div>
 
      <!-- Recent Claims -->
      <div class="ep-card">
        <div class="ep-section-title">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          Recent Claims
        </div>
        ${recent.length ? `
        <div class="ep-table-wrap">
          <table class="ep-table">
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${recent.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.claim_date || '—'}</td>
                  <td>₹ ${this._fmt(c.total_claimed_amount)}</td>
                  <td>${this._badge(c.workflow_state)}</td>
                  <td>
                    <button class="btn btn-tertiary btn-sm ep-view-claim"
                            data-name="${c.name}">View</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : this._emptyState('No claims yet. Create your first expense!')}
      </div>`;
 
    document.getElementById('ep-content').innerHTML = html;
 
    // Bind view buttons
    document.querySelectorAll('.ep-view-claim').forEach(btn => {
      btn.addEventListener('click', () => this._renderClaimDetail(btn.dataset.name));
    });
  }
 
  _statCard(label, value, color, iconSvg, extraHtml = '') {
    return `
      <div class="ep-stat-card">
        <div class="ep-stat-icon" style="background:${color}18;">${iconSvg.replace('stroke="currentColor"', `stroke="${color}"`)}</div>
        <div class="ep-stat-label">${label}</div>
        <div class="ep-stat-value" style="color:${color};">${value}</div>
        ${extraHtml}
      </div>`;
  }

  /* ============================================================
     VIEW: New Expense Claim Form
     ============================================================ */
  _renderNewClaim() {
    const typeOpts = this.dropdowns.expenseTypes
      .map(t => `<option value="${t.name}">${t.expense_type_name}</option>`).join('');
    const modeOpts = this.dropdowns.modes
      .map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    const ccOpts   = `<option value="">— None —</option>` + this.dropdowns.costCenters
      .map(c => `<option value="${c.name}">${c.cost_center_name}</option>`).join('');

    const html = `
      <div class="ep-card">
        <div class="ep-section-title">Claim Header</div>
        <div class="ep-form-grid" id="ep-new-claim-form">
          <div class="form-group">
            <label class="form-label">Claim Date <span style="color:var(--danger)">*</span></label>
            <input type="date" id="nc-date" class="form-control"
                   value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="form-group">
            <label class="form-label">Cost Center</label>
            <select id="nc-cost-center" class="form-control">${ccOpts}</select>
          </div>
        </div>

        <hr class="ep-divider">
        <div class="ep-section-title">Expense Line Items</div>

        <table class="ep-line-items" id="ep-line-items-table">
          <thead>
            <tr>
              <th style="width:180px">Type *</th>
              <th>Description</th>
              <th style="width:130px">Amount *</th>
              <th style="width:160px">Mode of Payment</th>
              <th style="width:180px">Receipt</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="ep-line-items-body">
            ${this._newLineItemRow(typeOpts, modeOpts, 0)}
          </tbody>
        </table>

        <button class="btn btn-tertiary btn-sm" id="btn-add-line" style="margin-bottom:20px;">
          + Add Line
        </button>

        <hr class="ep-divider">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:15px;font-weight:700;color:var(--navy-dark);">
            Total: ₹ <span id="nc-total">0.00</span>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-tertiary" id="btn-save-draft">Save Draft</button>
            <button class="btn btn-primary" id="btn-submit-claim">Submit for Approval</button>
          </div>
        </div>
      </div>`;

    document.getElementById('ep-content').innerHTML = html;

    let rowIdx = 1;
    // Add line
    document.getElementById('btn-add-line').addEventListener('click', () => {
      document.getElementById('ep-line-items-body')
        .insertAdjacentHTML('beforeend', this._newLineItemRow(typeOpts, modeOpts, rowIdx++));
      this._bindLineItemEvents();
    });

    this._bindLineItemEvents();

    // Save draft
    document.getElementById('btn-save-draft').addEventListener('click', async () => {
      await this._submitNewClaim(false);
    });

    // Submit
    document.getElementById('btn-submit-claim').addEventListener('click', async () => {
      await this._submitNewClaim(true);
    });
  }

  _newLineItemRow(typeOpts, modeOpts, idx) {
    return `
      <tr class="ep-line-row" id="ep-line-row-${idx}">
        <td><select class="li-type" required><option value="">Select…</option>${typeOpts}</select></td>
        <td><input type="text" class="li-desc" placeholder="Description"></td>
        <td><input type="number" class="li-amount" min="0" step="0.01" placeholder="0.00"></td>
        <td><select class="li-mode"><option value="">— None —</option>${modeOpts}</select></td>
        <td>
          <div class="ep-upload-btn-wrap" style="display:flex;align-items:center;gap:6px;">
            <button class="btn btn-tertiary btn-sm ep-row-upload-btn" type="button" style="padding:4px 8px;font-size:11px;min-width:unset;display:inline-flex;align-items:center;gap:3px;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              Upload
            </button>
            <span class="ep-row-upload-status" style="font-size:11px;color:var(--gray-400);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">No file</span>
            <input type="hidden" class="li-receipt">
          </div>
        </td>
        <td>
          <button class="btn btn-danger btn-sm ep-remove-row" style="padding:6px 8px;min-width:unset;"
                  title="Remove row">✖</button>
        </td>
      </tr>`;
  }

  _bindLineItemEvents() {
    // Remove row
    document.querySelectorAll('.ep-remove-row').forEach(btn => {
      btn.onclick = () => {
        const rows = document.querySelectorAll('.ep-line-row');
        if (rows.length > 1) btn.closest('tr').remove();
        this._recalcTotal();
      };
    });

    // Add input and change events for policy checking & file uploads
    document.querySelectorAll('.ep-line-row').forEach(row => {
      const typeSelect = row.querySelector('.li-type');
      const amountInput = row.querySelector('.li-amount');
      
      const handler = () => {
        this._recalcTotal();
        this._checkRowPolicy(row);
      };
      
      typeSelect.onchange = handler;
      amountInput.oninput = handler;

      // Handle direct receipt file upload
      const uploadBtn = row.querySelector('.ep-row-upload-btn');
      const statusSpan = row.querySelector('.ep-row-upload-status');
      const hiddenInput = row.querySelector('.li-receipt');

      if (uploadBtn && !uploadBtn.dataset.bound) {
        uploadBtn.dataset.bound = "true";
        uploadBtn.onclick = () => {
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*,application/pdf';
          fileInput.onchange = async () => {
            const file = fileInput.files[0];
            if (!file) return;

            statusSpan.style.color = 'var(--gray-400)';
            statusSpan.textContent = 'Uploading...';
            uploadBtn.disabled = true;

            try {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('is_private', 0);
              formData.append('folder', 'Home');

              const response = await fetch('/api/method/upload_file', {
                method: 'POST',
                headers: {
                  'X-Frappe-CSRF-Token': frappe.csrf_token || ''
                },
                body: formData
              });

              if (!response.ok) throw new Error('Upload failed');
              const resData = await response.json();
              const fileUrl = resData.message?.file_url;

              if (fileUrl) {
                hiddenInput.value = fileUrl;
                statusSpan.style.color = 'var(--success)';
                statusSpan.innerHTML = `<span style="font-weight:600;">✓</span> ${file.name}`;
                
                // Add a dynamic View button or link
                let viewBtn = row.querySelector('.ep-row-view-file-btn');
                if (!viewBtn) {
                  viewBtn = document.createElement('a');
                  viewBtn.className = 'btn btn-tertiary btn-sm ep-row-view-file-btn';
                  viewBtn.target = '_blank';
                  viewBtn.style.padding = '4px 6px';
                  viewBtn.style.fontSize = '10px';
                  viewBtn.style.minWidth = 'unset';
                  viewBtn.style.marginLeft = '4px';
                  viewBtn.textContent = 'View';
                  uploadBtn.parentElement.appendChild(viewBtn);
                }
                viewBtn.href = fileUrl;
              } else {
                throw new Error('No URL returned');
              }
            } catch (e) {
              console.error(e);
              statusSpan.style.color = 'var(--danger)';
              statusSpan.textContent = 'Failed';
            } finally {
              uploadBtn.disabled = false;
            }
          };
          fileInput.click();
        };
      }
    });
  }

  _checkRowPolicy(row) {
    const type = row.querySelector('.li-type').value;
    const amountVal = parseFloat(row.querySelector('.li-amount').value || 0);
    const amountInput = row.querySelector('.li-amount');
    
    // Find matching policy
    const policy = (this.policies || []).find(p => p.expense_type === type);
    
    // Remove any existing warning label under or inside the cell
    const cell = amountInput.parentElement;
    const existing = cell.querySelector('.ep-policy-warning');
    if (existing) existing.remove();
    amountInput.style.borderColor = '';
    
    if (policy && amountVal > 0) {
      const claimCap = parseFloat(policy.max_amount_per_claim || 0);
      const monthCap = parseFloat(policy.max_amount_per_month || 0);
      
      // 1. Check Per-Claim Cap
      if (claimCap > 0 && amountVal > claimCap) {
        amountInput.style.borderColor = 'var(--danger)';
        const warning = document.createElement('div');
        warning.className = 'ep-policy-warning';
        warning.style.color = 'var(--danger)';
        warning.style.fontSize = '10px';
        warning.style.fontWeight = '600';
        warning.style.marginTop = '4px';
        warning.innerHTML = `⚠️ Exceeds per-claim cap of ₹${this._fmt(claimCap)}`;
        cell.appendChild(warning);
        return;
      }
      
      // 2. Check Monthly Cap
      if (monthCap > 0) {
        // Sum up all rows in this form with the same type
        let formTotalForType = 0;
        document.querySelectorAll('.ep-line-row').forEach(r => {
          if (r.querySelector('.li-type').value === type) {
            formTotalForType += parseFloat(r.querySelector('.li-amount').value || 0);
          }
        });
        
        const spentThisMonth = parseFloat(this.currentMonthSpends[type] || 0);
        const projectedTotal = spentThisMonth + formTotalForType;
        
        if (projectedTotal > monthCap) {
          amountInput.style.borderColor = 'var(--danger)';
          const warning = document.createElement('div');
          warning.className = 'ep-policy-warning';
          warning.style.color = 'var(--danger)';
          warning.style.fontSize = '10px';
          warning.style.fontWeight = '600';
          warning.style.marginTop = '4px';
          warning.innerHTML = `⚠️ Exceeds monthly cap of ₹${this._fmt(monthCap)} (Spent: ₹${this._fmt(spentThisMonth)})`;
          cell.appendChild(warning);
        }
      }
    }
  }

  _recalcTotal() {
    let total = 0;
    document.querySelectorAll('.li-amount').forEach(inp => {
      total += parseFloat(inp.value || 0);
    });
    document.getElementById('nc-total').textContent = this._fmt(total);
  }

  _collectLineItems() {
    const items = [];
    document.querySelectorAll('.ep-line-row').forEach(row => {
      items.push({
        expense_type:    row.querySelector('.li-type').value,
        description:     row.querySelector('.li-desc').value,
        amount:          parseFloat(row.querySelector('.li-amount').value || 0),
        mode_of_payment: row.querySelector('.li-mode').value,
        receipt:         row.querySelector('.li-receipt').value,
      });
    });
    return items;
  }

  async _submitNewClaim(doSubmit) {
    const items = this._collectLineItems();
    if (!items.length || items.some(i => !i.expense_type || !i.amount)) {
      this._toast('Please fill in all required line item fields.', 'error');
      return;
    }

    const payload = {
      claim_date:  document.getElementById('nc-date').value,
      cost_center: document.getElementById('nc-cost-center').value,
      expenses:    items,
    };

    try {
      const res = await this._api(
        'expense_manager_v2.api.expense.create_expense_claim',
        { data: JSON.stringify(payload) }
      );
      this._toast(`${res.name} saved!`);

      if (doSubmit) {
        await this._api('expense_manager_v2.api.expense.submit_expense_claim',
                        { claim_name: res.name });
        this._toast(`${res.name} submitted for approval!`);
      }

      this._showView('my-claims');
    } catch (e) {
      this._toast(e.message || 'Failed to save claim.', 'error');
    }
  }

  /* ============================================================
     VIEW: My Claims List
     ============================================================ */
  async _renderMyClaims(status = 'All') {
    const claims = await this._api(
      'expense_manager_v2.api.expense.get_my_claims',
      { status }
    );

    const filters = ['All', 'Pending Approval', 'Approved', 'Rejected', 'Draft'];
    const filterBtns = filters.map(f => `
      <button class="btn ${f === status ? 'btn-secondary' : 'btn-tertiary'} btn-sm ep-filter-btn"
              data-status="${f}" style="min-width:unset;">${f}</button>
    `).join('');

    const html = `
      <div class="ep-card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
          <div class="ep-section-title" style="margin:0;">My Expense Claims</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${filterBtns}</div>
        </div>

        ${claims.length ? `
        <div class="ep-table-wrap">
          <table class="ep-table">
            <thead>
              <tr>
                <th>Claim ID</th><th>Date</th><th>Department</th>
                <th>Amount</th><th>Status</th><th>Remarks</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${claims.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.claim_date || '—'}</td>
                  <td>${c.department || '—'}</td>
                  <td>₹ ${this._fmt(c.total_claimed_amount)}</td>
                  <td>${this._badge(c.workflow_state)}</td>
                  <td style="max-width:180px;font-size:12px;color:var(--gray-400);">
                    ${c.remarks ? `<em>${c.remarks}</em>` : 'â€”'}
                  </td>
                  <td>
                    <button class="btn btn-tertiary btn-sm ep-view-claim" data-name="${c.name}">
                      View
                    </button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : this._emptyState(`No ${status === 'All' ? '' : status + ' '}claims found.`)}
      </div>`;

    document.getElementById('ep-content').innerHTML = html;

    document.querySelectorAll('.ep-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => this._renderMyClaims(btn.dataset.status));
    });
    document.querySelectorAll('.ep-view-claim').forEach(btn => {
      btn.addEventListener('click', () => this._renderClaimDetail(btn.dataset.name));
    });
  }

  /* ============================================================
     VIEW: Claim Detail
     ============================================================ */
  async _renderClaimDetail(claimName) {
    document.getElementById('ep-page-title').textContent = claimName;
    const doc = await this._api(
      'expense_manager_v2.api.expense.get_claim_detail',
      { claim_name: claimName }
    );

    const steps  = ['Draft', 'Pending Approval', 'Approved'];
    const rejected = doc.workflow_state === 'Rejected';
    const activeStep = rejected ? 'Rejected' : doc.workflow_state;

    const workflowHtml = this._workflowBar(
      rejected ? [...steps, 'Rejected'] : steps,
      activeStep
    );

    const itemRows = (doc.expenses || []).map(i => `
      <tr>
        <td>${i.expense_type || '—'}</td>
        <td>${i.description || '—'}</td>
        <td>₹ ${this._fmt(i.amount)}</td>
        <td>${i.mode_of_payment || '—'}</td>
        <td>${i.receipt
              ? `<a href="${i.receipt}" target="_blank" style="color:var(--bright-blue);font-size:12px;">View</a>`
              : '—'}</td>
      </tr>`).join('');

    const remarksBox = doc.remarks ? `
      <div style="background:${rejected ? '#FEF2F2' : '#F0FDF4'};
                  border-left:4px solid ${rejected ? 'var(--danger)' : 'var(--success)'};
                  padding:14px 16px;border-radius:var(--radius-sm);margin-top:16px;">
        <p style="font-size:13px;font-weight:600;margin-bottom:4px;
                  color:${rejected ? '#7F1D1D' : '#065F46'};">Manager Remarks</p>
        <p style="font-size:13px;color:${rejected ? '#991B1B' : '#065F46'};">${doc.remarks}</p>
      </div>` : '';

    // Manager action panel
    const managerPanel = (this.isManager && doc.workflow_state === 'Pending Approval') ? `
      <hr class="ep-divider">
      <div class="ep-section-title">Manager Actions</div>
      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label">Remarks (required to reject)</label>
        <textarea id="mgr-remarks" class="form-control" rows="3"
                  placeholder="Add remarks…" style="resize:vertical;"></textarea>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" id="btn-approve-claim" data-name="${doc.name}">
          ✓ Approve
        </button>
        <button class="btn btn-danger" id="btn-reject-claim" data-name="${doc.name}">
          ✗ Reject
        </button>
      </div>` : '';

    const html = `
      <div class="ep-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:20px;font-weight:700;color:var(--navy-dark);">${doc.name}</div>
            <div style="font-size:13px;color:var(--gray-400);margin-top:2px;">
              ${doc.employee_name} &nbsp;Â·&nbsp; ${doc.claim_date}
              ${doc.department ? `&nbsp;Â·&nbsp; ${doc.department}` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            ${this._badge(doc.workflow_state)}
            <button class="btn btn-tertiary btn-sm" id="btn-back-list">â† Back</button>
          </div>
        </div>

        ${workflowHtml}
        ${remarksBox}

        <hr class="ep-divider">
        <div class="ep-section-title">Line Items</div>
        <div class="ep-table-wrap">
          <table class="ep-table">
            <thead>
              <tr><th>Type</th><th>Description</th><th>Amount</th><th>Mode</th><th>Receipt</th></tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>

        <div style="text-align:right;margin-top:16px;font-size:15px;font-weight:700;color:var(--navy-dark);">
          Total Claimed: ₹ ${this._fmt(doc.total_claimed_amount)}
        </div>

        ${managerPanel}
      </div>`;

    document.getElementById('ep-content').innerHTML = html;
    document.getElementById('btn-back-list')
      .addEventListener('click', () => this._showView('my-claims'));

    if (this.isManager && doc.workflow_state === 'Pending Approval') {
      document.getElementById('btn-approve-claim').addEventListener('click', async () => {
        const remarks = document.getElementById('mgr-remarks').value;
        try {
          await this._api('expense_manager_v2.api.expense.approve_claim',
                          { claim_name: doc.name, remarks });
          this._toast(`${doc.name} approved!`);
          this._renderClaimDetail(doc.name);
        } catch (e) { this._toast(e.message, 'error'); }
      });

      document.getElementById('btn-reject-claim').addEventListener('click', async () => {
        const remarks = document.getElementById('mgr-remarks').value;
        if (!remarks.trim()) {
          this._toast('Remarks are required to reject a claim.', 'error');
          return;
        }
        try {
          await this._api('expense_manager_v2.api.expense.reject_claim',
                          { claim_name: doc.name, remarks });
          this._toast(`${doc.name} rejected.`);
          this._renderClaimDetail(doc.name);
        } catch (e) { this._toast(e.message, 'error'); }
      });
    }
  }

  /* ============================================================
     Shared Helpers
     ============================================================ */
  _workflowBar(steps, activeState) {
    const doneIdx   = steps.indexOf(activeState);
    return `<div class="ep-workflow">` +
      steps.map((s, i) => {
        const isDone   = i < doneIdx;
        const isActive = i === doneIdx;
        const cls      = isDone ? 'done' : isActive ? 'active' : '';
        return `
          ${i > 0 ? `<div class="ep-workflow-line ${isDone ? 'done' : ''}"></div>` : ''}
          <div class="ep-workflow-step ${cls}">
            <div class="step-dot">${isDone ? '✓' : i + 1}</div>
            <span>${s}</span>
          </div>`;
      }).join('') +
    `</div>`;
  }

  _badge(state) {
    const map = {
      'Draft':            'badge-draft',
      'Pending Approval': 'badge-pending',
      'Approved':         'badge-approved',
      'Rejected':         'badge-rejected',
    };
    return `<span class="badge ${map[state] || 'badge-draft'}">${state || 'Draft'}</span>`;
  }

  _emptyState(msg) {
    return `<div class="ep-empty">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
                 M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
      <p>${msg}</p>
    </div>`;
  }

  _fmt(n) {
    return (parseFloat(n) || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  _toast(msg, type = 'success') {
    const wrap = document.getElementById('ep-toast-wrap');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = `ep-toast${type === 'error' ? ' error' : ''}`;
    t.innerHTML = `<span>${type === 'error' ? '✖' : '✓'}</span><span>${msg}</span>`;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  _api(method, args = {}) {
    return new Promise((resolve, reject) => {
      frappe.call({
        method,
        args,
        callback: r => resolve(r.message),
        error:    e => reject(e),
      });
    });
  }

  /* ============================================================
     NEW VIEW: My Claims — Advanced Filters
     ============================================================ */
  async _renderMyClaims(filters = {}) {
    const { status='All',from_date='',to_date='',min_amount='',max_amount='',search='' } = filters;
    const claims = await this._api('expense_manager_v2.api.expense.get_my_claims_filtered',
      { status, from_date, to_date, min_amount, max_amount, search });

    const statusOpts = ['All','Pending Approval','Approved','Rejected','Draft']
      .map(s => `<option value="${s}" ${s===status?'selected':''}>${s}</option>`).join('');

    const tableHtml = claims.length ? `
      <div class="ep-table-wrap">
        <table class="ep-table"><thead><tr>
          <th>Claim ID</th><th>Date</th><th>Dept</th><th>Amount</th><th>Status</th><th>Remarks</th><th></th>
        </tr></thead><tbody>
          ${claims.map(c => `<tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.claim_date||'—'}</td><td>${c.department||'—'}</td>
            <td>₹ ${this._fmt(c.total_claimed_amount)}</td>
            <td>${this._badge(c.workflow_state)}</td>
            <td style="max-width:160px;font-size:12px;color:var(--gray-400);">${c.remarks?`<em>${c.remarks}</em>`:'—'}</td>
            <td><button class="btn btn-tertiary btn-sm ep-view-claim" data-name="${c.name}">View</button></td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : this._emptyState('No claims match your filters.');

    document.getElementById('ep-content').innerHTML = `
      <div class="ep-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div class="ep-section-title" style="margin:0;">My Expense Claims</div>
        </div>
        <div class="ep-filter-bar">
          <div><div class="ep-filter-bar-label">Status</div><select class="form-control" id="af-status">${statusOpts}</select></div>
          <div><div class="ep-filter-bar-label">From Date</div><input type="date" class="form-control" id="af-from" value="${from_date}"></div>
          <div><div class="ep-filter-bar-label">To Date</div><input type="date" class="form-control" id="af-to" value="${to_date}"></div>
          <div><div class="ep-filter-bar-label">Min Rs.</div><input type="number" class="form-control" id="af-min" placeholder="0" value="${min_amount}"></div>
          <div><div class="ep-filter-bar-label">Max Rs.</div><input type="number" class="form-control" id="af-max" placeholder="No limit" value="${max_amount}"></div>
          <div><div class="ep-filter-bar-label">Search ID</div><input type="text" class="form-control" id="af-search" placeholder="EXP-..." value="${search}"></div>
          <div style="display:flex;align-items:flex-end;"><button class="btn btn-primary btn-sm" id="btn-apply-filters" style="width:100%;">Apply</button></div>
        </div>
        ${tableHtml}
      </div>`;

    document.getElementById('btn-apply-filters').addEventListener('click', () => {
      this._renderMyClaims({
        status: document.getElementById('af-status').value,
        from_date: document.getElementById('af-from').value,
        to_date: document.getElementById('af-to').value,
        min_amount: document.getElementById('af-min').value,
        max_amount: document.getElementById('af-max').value,
        search: document.getElementById('af-search').value,
      });
    });
    document.querySelectorAll('.ep-view-claim').forEach(b =>
      b.addEventListener('click', () => this._renderClaimDetail(b.dataset.name)));
  }

  /* ============================================================
     NEW VIEW: Manager Queue — bulk approve / reject
     ============================================================ */
  async _renderManagerQueue(qStatus = 'Pending Approval') {
    const statusOpts = ['Pending Approval','All','Approved','Rejected']
      .map(s => `<option value="${s}" ${s===qStatus?'selected':''}>${s}</option>`).join('');
    const claims = await this._api('expense_manager_v2.api.expense.get_manager_queue',{status:qStatus});

    const tableBody = claims.length ? `
      <div class="ep-select-all-row">
        <input type="checkbox" id="ep-check-all">
        <span style="font-size:13px;font-weight:600;color:var(--navy-dark);">Select All</span>
        <div class="ep-bulk-actions" style="margin-left:auto;">
          <input type="text" id="bulk-remarks" class="form-control" placeholder="Remarks (required to reject)" style="width:240px;height:36px;">
          <button class="btn btn-primary btn-sm" id="btn-bulk-approve">Approve Selected</button>
          <button class="btn btn-danger btn-sm" id="btn-bulk-reject">Reject Selected</button>
        </div>
      </div>
      <div class="ep-table-wrap">
        <table class="ep-table"><thead><tr>
          <th style="width:40px;"></th><th>Claim ID</th><th>Employee</th>
          <th>Dept</th><th>Date</th><th>Amount</th><th>Status</th><th></th>
        </tr></thead><tbody>
          ${claims.map(c => `<tr data-name="${c.name}">
            <td><input type="checkbox" class="mq-check" data-name="${c.name}"></td>
            <td><strong>${c.name}</strong></td>
            <td>${c.employee_name||c.employee}</td><td>${c.department||'—'}</td>
            <td>${c.claim_date||'—'}</td>
            <td>Rs. ${this._fmt(c.total_claimed_amount)}</td>
            <td>${this._badge(c.workflow_state)}</td>
            <td><button class="btn btn-tertiary btn-sm ep-view-claim" data-name="${c.name}">Review</button></td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : this._emptyState('No claims in this queue.');

    document.getElementById('ep-content').innerHTML = `
      <div class="ep-card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
          <div class="ep-section-title" style="margin:0;">Manager Review Queue</div>
          <div style="display:flex;gap:10px;">
            <select class="form-control" id="mq-status" style="width:180px;">${statusOpts}</select>
            <button class="btn btn-secondary btn-sm" id="btn-mq-filter">Filter</button>
          </div>
        </div>
        ${tableBody}
      </div>`;

    document.getElementById('btn-mq-filter')?.addEventListener('click', () =>
      this._renderManagerQueue(document.getElementById('mq-status').value));
    document.getElementById('ep-check-all')?.addEventListener('change', e =>
      document.querySelectorAll('.mq-check').forEach(cb => cb.checked = e.target.checked));

    const bulkAction = async (action) => {
      const selected = [...document.querySelectorAll('.mq-check:checked')].map(cb => cb.dataset.name);
      const remarks  = document.getElementById('bulk-remarks')?.value || '';
      if (!selected.length) { this._toast('Select at least one claim.', 'error'); return; }
      if (action === 'reject' && !remarks.trim()) { this._toast('Remarks required.', 'error'); return; }
      try {
        const r = await this._api('expense_manager_v2.api.expense.bulk_action_claims',
          { claim_names: JSON.stringify(selected), action, remarks });
        this._toast((action==='approve'?'Approved':'Rejected') + ' ' + r.success.length + ' claim(s).');
        if (r.failed.length) this._toast(r.failed.length + ' failed.', 'error');
        this._renderManagerQueue(qStatus);
      } catch (e) { this._toast(e.message, 'error'); }
    };

    document.getElementById('btn-bulk-approve')?.addEventListener('click', () => bulkAction('approve'));
    document.getElementById('btn-bulk-reject')?.addEventListener('click',  () => bulkAction('reject'));
    document.querySelectorAll('.ep-view-claim').forEach(b =>
      b.addEventListener('click', () => this._renderClaimDetail(b.dataset.name)));
  }

  /* ============================================================
     NEW VIEW: Analytics
     ============================================================ */
  async _renderAnalytics() {
    const data = await this._api('expense_manager_v2.api.expense.get_analytics_data');
    const byType = data.by_type || [], monthly = data.monthly || [], policies = data.policies || [];
    const maxT = Math.max(...byType.map(r => r.total||0), 1);
    const maxM = Math.max(...monthly.map(r => r.total||0), 1);

    const byTypeBars = byType.length
      ? byType.map(r =>
          '<div class="ep-bar-row">' +
          '<div class="ep-bar-label" title="' + r.expense_type + '">' + r.expense_type + '</div>' +
          '<div class="ep-bar-track"><div class="ep-bar-fill" style="width:' + Math.round(r.total/maxT*100) + '%;"></div></div>' +
          '<div class="ep-bar-value">Rs. ' + this._fmt(r.total) + '</div></div>'
        ).join('')
      : '<p style="color:var(--gray-400);font-size:13px;">No data yet.</p>';

    const trendBars = monthly.length
      ? monthly.map(r =>
          '<div class="ep-trend-col">' +
          '<div class="ep-trend-bar" style="height:' + Math.round(r.total/maxM*90) + 'px;" title="' + r.month_label + ': Rs.' + this._fmt(r.total) + '"></div>' +
          '<div class="ep-trend-label">' + r.month_label + '</div>' +
          '</div>'
        ).join('')
      : '<p style="color:var(--gray-400);font-size:13px;">No data yet.</p>';

    const policyIcons = {
      'Travel': '✈️',
      'Meals': '🍔',
      'Equipment': '💻',
      'Marketing': '📢',
      'Office': '🏢',
      'Entertainment': '🎬'
    };

    const policyRows = policies.length
      ? '<div class="ep-policy-grid">' +
        policies.map(p => {
          const icon = policyIcons[p.expense_type] || '📋';
          return '<div class="ep-policy-card">' +
            '<div class="ep-policy-header">' +
              '<div class="ep-policy-icon-box">' + icon + '</div>' +
              '<div class="ep-policy-title">' + p.expense_type + '</div>' +
            '</div>' +
            '<div class="ep-policy-limits">' +
              '<div class="ep-policy-limit-item">' +
                '<span class="ep-policy-limit-label">Per Claim</span>' +
                '<span class="ep-policy-limit-val">Rs. ' + this._fmt(p.max_amount_per_claim) + '</span>' +
              '</div>' +
              (p.max_amount_per_month ? 
              '<div class="ep-policy-limit-item">' +
                '<span class="ep-policy-limit-label">Per Month</span>' +
                '<span class="ep-policy-limit-val">Rs. ' + this._fmt(p.max_amount_per_month) + '</span>' +
              '</div>' : '') +
            '</div>' +
          '</div>';
        }).join('') +
        '</div>'
      : '<p style="color:var(--gray-400);font-size:13px;">No policies configured yet.</p>';

    document.getElementById('ep-content').innerHTML = `
      <div class="ep-card" style="margin-bottom:20px;padding:16px 24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="font-size:14px;font-weight:700;color:var(--navy-dark);display:flex;align-items:center;gap:6px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            Analytics &amp; Export Controls
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-tertiary btn-sm" id="btn-export-csv" style="display:inline-flex;align-items:center;gap:6px;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Export CSV
            </button>
            <button class="btn btn-tertiary btn-sm" id="btn-print-analytics" style="display:inline-flex;align-items:center;gap:6px;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Print Report
            </button>
          </div>
        </div>
      </div>
      
      <div id="ep-analytics-print-area">
        <div class="ep-charts-grid">
          <div class="ep-chart-card">
            <div class="ep-chart-title">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--bright-blue);flex-shrink:0;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
              </svg>
              Spend by Category
            </div>
            ${byTypeBars}
          </div>
          <div class="ep-chart-card">
            <div class="ep-chart-title">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--mint-green);flex-shrink:0;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
              6-Month Trend
            </div>
            <div class="ep-trend-bars">${trendBars}</div>
          </div>
        </div>
        <div class="ep-card">
          <div class="ep-section-title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--bright-blue);flex-shrink:0;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            Expense Policies
          </div>
          ${policyRows}
        </div>
      </div>`;

    document.getElementById('btn-export-csv').addEventListener('click', async () => {
      try {
        const claims = await this._api('expense_manager_v2.api.expense.get_my_claims_filtered', { status: 'All' });
        if (!claims || !claims.length) {
          this._toast('No claims data to export.', 'error');
          return;
        }
        
        let csv = '\uFEFFClaim ID,Date,Department,Amount,Status,Remarks\n';
        claims.forEach(c => {
          const name = c.name || '';
          const date = c.claim_date || '';
          const dept = c.department || '';
          const amount = c.total_claimed_amount || 0.0;
          const status = c.workflow_state || 'Draft';
          const remarks = (c.remarks || '').replace(/"/g, '""');
          csv += `"${name}","${date}","${dept}",${amount},"${status}","${remarks}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `Expense_Report_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this._toast('CSV Export downloaded successfully!');
      } catch (e) {
        this._toast('Export failed: ' + e.message, 'error');
      }
    });

    document.getElementById('btn-print-analytics').addEventListener('click', () => {
      const now = new Date().toLocaleString();
      const contentHtml = document.getElementById('ep-analytics-print-area').innerHTML;
      
      const w = window.open('', '_blank', 'width=900,height=800');
      w.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Expense Analytics Report</title>
          <style>
            @import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap");
            body { font-family: "DM Sans", Arial, sans-serif; margin: 0; padding: 40px; color: #05133C; background: #FFF; }
            .hdr { background: #05133C; color: #14F1B1; padding: 20px 28px; border-radius: 12px; margin-bottom: 24px; }
            h1 { font-size: 22px; margin: 0; }
            .meta { font-size: 13px; color: #B0B8D0; margin-top: 6px; }
            .ep-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
            .ep-chart-card { background: #FFF; border: 1px solid #F4F4F5; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
            .ep-chart-title { font-size: 13px; font-weight: 700; color: #05133C; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 16px; }
            .ep-bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
            .ep-bar-label { width: 110px; font-size: 12px; font-weight: 500; color: #71717B; text-align: right; }
            .ep-bar-track { flex: 1; height: 12px; background: #F4F4F5; border-radius: 99px; overflow: hidden; }
            .ep-bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #14F1B1 0%, #114EFF 100%); }
            .ep-bar-value { font-size: 12px; font-weight: 600; color: #05133C; min-width: 80px; text-align: right; }
            .ep-trend-bars { display: flex; align-items: flex-end; gap: 10px; height: 120px; padding-bottom: 28px; position: relative; }
            .ep-trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; position: relative; height: 100%; justify-content: flex-end; }
            .ep-trend-bar { width: 100%; border-radius: 4px 4px 0 0; background: linear-gradient(180deg, #14F1B1, #114EFF); min-height: 4px; }
            .ep-trend-label { position: absolute; bottom: -24px; font-size: 10px; color: #71717B; }
            .ep-card { background: #FFF; border: 1px solid #F4F4F5; border-radius: 12px; padding: 24px; }
            .ep-section-title { font-size: 16px; font-weight: 700; color: #05133C; margin-bottom: 16px; }
            .ep-policy-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #F4F4F5; font-size: 13px; }
            .ep-policy-name { font-weight: 600; color: #05133C; }
            .ep-policy-cap { display: flex; gap: 16px; color: #71717B; }
            .ep-policy-cap span { display: flex; align-items: center; gap: 4px; }
          </style>
        </head>
        <body>
          <div class="hdr">
            <h1>Expense Analytics Report</h1>
            <div class="meta">Generated by ${this.employee.employee_name || this.currentUser} | ${now}</div>
          </div>
          <div>${contentHtml}</div>
          <div style="margin-top:40px;font-size:11px;color:#71717B;border-top:1px solid #F4F4F5;padding-top:12px;text-align:center;">
            Bizaxl Expense Manager Platform
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
        </html>
      `);
      w.document.close();
    });
  }

  /* ============================================================
     UPDATED: Claim Detail — Amend + Print
     ============================================================ */
  async _renderClaimDetail(claimName) {
    document.getElementById('ep-page-title').textContent = claimName;
    const doc = await this._api('expense_manager_v2.api.expense.get_claim_detail',{claim_name:claimName});
    const rejected = doc.workflow_state === 'Rejected';
    const wfSteps = rejected
      ? ['Draft','Pending Approval','Approved','Rejected']
      : ['Draft','Pending Approval','Approved'];
    const workflowHtml = this._workflowBar(wfSteps, rejected ? 'Rejected' : doc.workflow_state);

    const itemRows = (doc.expenses||[]).map(i =>
      '<tr><td>' + (i.expense_type||'—') + '</td>' +
      '<td>' + (i.description||'—') + '</td>' +
      '<td>Rs. ' + this._fmt(i.amount) + '</td>' +
      '<td>' + (i.mode_of_payment||'—') + '</td>' +
      '<td>' + (i.receipt ? '<a href="' + i.receipt + '" target="_blank" style="color:var(--bright-blue);font-size:12px;">View</a>' : '—') + '</td></tr>'
    ).join('');

    const remarksColor = rejected ? '#7F1D1D' : '#065F46';
    const remarksBorder = rejected ? 'var(--danger)' : 'var(--success)';
    const remarksBg = rejected ? '#FEF2F2' : '#F0FDF4';
    const remarksBox = doc.remarks
      ? '<div style="background:' + remarksBg + ';border-left:4px solid ' + remarksBorder + ';padding:14px 16px;border-radius:var(--radius-sm);margin-top:16px;">' +
        '<p style="font-size:13px;font-weight:600;margin-bottom:4px;color:' + remarksColor + ';">Manager Remarks</p>' +
        '<p style="font-size:13px;color:' + remarksColor + ';">' + doc.remarks + '</p></div>'
      : '';

    const managerPanel = (this.isManager && doc.workflow_state === 'Pending Approval')
      ? '<hr class="ep-divider"><div class="ep-section-title">Manager Actions</div>' +
        '<div class="form-group" style="margin-bottom:16px;"><label class="form-label">Remarks (required to reject)</label>' +
        '<textarea id="mgr-remarks" class="form-control" rows="3" placeholder="Add remarks..." style="resize:vertical;"></textarea></div>' +
        '<div style="display:flex;gap:10px;">' +
        '<button class="btn btn-primary" id="btn-approve-claim">Approve</button>' +
        '<button class="btn btn-danger" id="btn-reject-claim">Reject</button>' +
        '</div>'
      : '';

    const amendBtn = (!this.isManager && rejected)
      ? '<button class="btn btn-secondary btn-sm" id="btn-amend-claim">Amend &amp; Resubmit</button>'
      : '';

    const draftBtns = (!doc.workflow_state || doc.workflow_state === 'Draft')
      ? '<button class="btn btn-primary btn-sm" id="btn-submit-draft">Send for Approval</button>' +
        '<button class="btn btn-danger btn-sm" id="btn-decline-draft">Decline</button>'
      : '';

    document.getElementById('ep-content').innerHTML =
      '<div id="ep-print-area"><div class="ep-card">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">' +
      '<div><div style="font-size:20px;font-weight:700;color:var(--navy-dark);">' + doc.name + '</div>' +
      '<div style="font-size:13px;color:var(--gray-400);margin-top:2px;">' + doc.employee_name + '  &nbsp;.&nbsp;  ' + doc.claim_date + (doc.department ? '  &nbsp;.&nbsp;  ' + doc.department : '') + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      this._badge(doc.workflow_state) + amendBtn + draftBtns +
      '<button class="btn btn-tertiary btn-sm" id="btn-print-claim">Print</button>' +
      '<button class="btn btn-tertiary btn-sm" id="btn-back-list">Back</button>' +
      '</div></div>' +
      workflowHtml + remarksBox +
      '<hr class="ep-divider"><div class="ep-section-title">Line Items</div>' +
      '<div class="ep-table-wrap"><table class="ep-table"><thead><tr><th>Type</th><th>Description</th><th>Amount</th><th>Mode</th><th>Receipt</th></tr></thead>' +
      '<tbody>' + itemRows + '</tbody></table></div>' +
      '<div style="text-align:right;margin-top:16px;font-size:15px;font-weight:700;color:var(--navy-dark);">Total Claimed: Rs. ' + this._fmt(doc.total_claimed_amount) + '</div>' +
      managerPanel +
      '</div></div>';

    document.getElementById('btn-back-list').addEventListener('click', () => this._showView('my-claims'));
    document.getElementById('btn-print-claim').addEventListener('click', () => this._printClaim(doc));

    document.getElementById('btn-amend-claim')?.addEventListener('click', async () => {
      try {
        const res = await this._api('expense_manager_v2.api.expense.amend_claim',{claim_name:doc.name});
        this._toast(res.name + ' created as draft.');
        this._renderClaimDetail(res.name);
      } catch(e) { this._toast(e.message,'error'); }
    });

    document.getElementById('btn-submit-draft')?.addEventListener('click', async () => {
      try {
        await this._api('expense_manager_v2.api.expense.submit_expense_claim',{claim_name:doc.name});
        this._toast(doc.name + ' submitted for approval!');
        this._renderClaimDetail(doc.name);
      } catch(e) { this._toast(e.message,'error'); }
    });

    document.getElementById('btn-decline-draft')?.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to decline and delete this draft claim?')) return;
      try {
        await this._api('expense_manager_v2.api.expense.decline_draft_claim',{claim_name:doc.name});
        this._toast(doc.name + ' draft claim declined.');
        this._showView('my-claims');
      } catch(e) { this._toast(e.message,'error'); }
    });

    if (this.isManager && doc.workflow_state === 'Pending Approval') {
      document.getElementById('btn-approve-claim').addEventListener('click', async () => {
        const remarks = document.getElementById('mgr-remarks').value;
        try {
          await this._api('expense_manager_v2.api.expense.approve_claim',{claim_name:doc.name,remarks});
          this._toast(doc.name + ' approved!');
          this._renderClaimDetail(doc.name);
        } catch(e) { this._toast(e.message,'error'); }
      });
      document.getElementById('btn-reject-claim').addEventListener('click', async () => {
        const remarks = document.getElementById('mgr-remarks').value;
        if (!remarks.trim()) { this._toast('Remarks required.','error'); return; }
        try {
          await this._api('expense_manager_v2.api.expense.reject_claim',{claim_name:doc.name,remarks});
          this._toast(doc.name + ' rejected.');
          this._renderClaimDetail(doc.name);
        } catch(e) { this._toast(e.message,'error'); }
      });
    }
  }

  /* ============================================================
     NEW: Print Claim
     ============================================================ */
  _printClaim(doc) {
    const rows = (doc.expenses||[]).map(i =>
      '<tr><td style="padding:8px 12px;border-bottom:1px solid #F4F4F5;">' + (i.expense_type||'—') + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #F4F4F5;">' + (i.description||'—') + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #F4F4F5;text-align:right;">Rs. ' + this._fmt(i.amount) + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #F4F4F5;">' + (i.mode_of_payment||'—') + '</td></tr>'
    ).join('');

    const now = new Date().toLocaleString();
    const w = window.open('','_blank','width=800,height=700');
    w.document.write('<!DOCTYPE html><html><head><title>Expense Claim - ' + doc.name + '</title>' +
      '<style>@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap");' +
      'body{font-family:"DM Sans",Arial,sans-serif;margin:0;padding:40px;color:#05133C;}' +
      '.hdr{background:#05133C;color:#14F1B1;padding:20px 28px;border-radius:12px;margin-bottom:24px;}' +
      'h1{font-size:22px;margin:0;}.meta{font-size:13px;color:#B0B8D0;margin-top:6px;}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;}' +
      'th{background:#F4F4F5;padding:10px 12px;text-align:left;font-weight:700;color:#05133C;}' +
      '.total{font-size:15px;font-weight:700;text-align:right;margin-top:16px;}' +
      '.badge{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:600;background:#F0FDF4;color:#065F46;}' +
      '</style></head><body>' +
      '<div class="hdr"><h1>Expense Claim</h1><div class="meta">' + doc.name + ' | ' + doc.claim_date + '</div></div>' +
      '<table style="margin-bottom:16px;border-collapse:collapse;">' +
      '<tr><td style="padding:6px 0;width:140px;color:#71717B;">Employee</td><td style="padding:6px 0;font-weight:600;">' + doc.employee_name + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#71717B;">Department</td><td>' + (doc.department||'—') + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#71717B;">Cost Center</td><td>' + (doc.cost_center||'—') + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#71717B;">Status</td><td><span class="badge">' + doc.workflow_state + '</span></td></tr>' +
      (doc.remarks ? '<tr><td style="padding:6px 0;color:#71717B;">Remarks</td><td><em>' + doc.remarks + '</em></td></tr>' : '') +
      '</table>' +
      '<table><thead><tr><th>Type</th><th>Description</th><th style="text-align:right">Amount</th><th>Mode</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="total">Total Claimed: Rs. ' + this._fmt(doc.total_claimed_amount) + '</div>' +
      '<div style="margin-top:40px;font-size:11px;color:#71717B;border-top:1px solid #F4F4F5;padding-top:12px;">Generated by Bizaxl Expense Portal | ' + now + '</div>' +
      '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }
}