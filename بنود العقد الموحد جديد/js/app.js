/**
 * PRICEWISE-SEC — المنطق الرئيسي للتطبيق
 * App Core — State management, navigation, storage, toasts
 */

// ═══════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════
const AppState = {
  currentPage: 'dashboard',
  currentBOQ: {
    id: null,
    meta: { project: '', woNumber: '', location: '', date: '' },
    items: []
  },
  savedBOQs: [],
  searchQuery: '',
  activeCategory: 'all',
  compareA: null,
  compareB: null,
  certificate: null
};

// ═══════════════════════════════════════════════════
// Storage
// ═══════════════════════════════════════════════════
const Storage = {
  key: 'pricewise_sec_data',

  save() {
    try {
      const data = {
        savedBOQs: AppState.savedBOQs,
        lastPage: AppState.currentPage
      };
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (e) { console.warn('Storage full:', e); }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return;
      const data = JSON.parse(raw);
      AppState.savedBOQs = data.savedBOQs || [];
    } catch (e) { console.warn('Storage load error:', e); }
  },

  saveBOQ(boq) {
    boq.id = boq.id || `boq_${Date.now()}`;
    boq.savedAt = new Date().toISOString();
    const idx = AppState.savedBOQs.findIndex(b => b.id === boq.id);
    if (idx >= 0) AppState.savedBOQs[idx] = boq;
    else AppState.savedBOQs.unshift(boq);
    this.save();
    return boq.id;
  },

  deleteBOQ(id) {
    AppState.savedBOQs = AppState.savedBOQs.filter(b => b.id !== id);
    this.save();
  },

  getBOQ(id) {
    return AppState.savedBOQs.find(b => b.id === id) || null;
  }
};

// ═══════════════════════════════════════════════════
// Toast Notifications
// ═══════════════════════════════════════════════════
function showToast(msg, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════
function navigateTo(page) {
  AppState.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage(page);
}

function renderPage(page) {
  const content = document.getElementById('page-content');
  const isAr = I18N.currentLang === 'ar';

  const titles = {
    dashboard:    { icon: '🏠',  title: isAr ? 'لوحة التحكم' : 'Dashboard' },
    boq:          { icon: '📋',  title: isAr ? 'منشئ المقايسات' : 'BOQ Builder' },
    search:       { icon: '🔍',  title: isAr ? 'البحث عن البنود' : 'Search Items' },
    analyzer:     { icon: '📂',  title: isAr ? 'محلل الوثائق' : 'Document Analyzer' },
    'pdf-analyzer': { icon: '📄', title: isAr ? 'تحليل مستندات PDF' : 'PDF Document Analyzer' },
    compare:      { icon: '⚖️', title: isAr ? 'مقارنة المقايسات' : 'Compare BOQs' },
    certificate:  { icon: '📜',  title: isAr ? 'إنشاء مستخلص' : 'Payment Certificate' },
    saved:        { icon: '💾',  title: isAr ? 'المقايسات المحفوظة' : 'Saved BOQs' },
    pricelist:    { icon: '📊',  title: isAr ? 'قائمة الأسعار الكاملة' : 'Full Price List' },
    support:      { icon: '📞',  title: isAr ? 'الدعم الفني والتواصل' : 'Technical Support' }
  };

  const pt = titles[page] || { icon: '⚡', title: page };
  document.getElementById('page-icon').textContent = pt.icon;
  document.getElementById('page-title').textContent = pt.title;

  content.innerHTML = '';
  content.className = 'page-content animate-in';

  const pages = {
    dashboard:     renderDashboard,
    boq:           renderBOQBuilder,
    search:        renderSearchPage,
    analyzer:      renderAnalyzer,
    'pdf-analyzer': renderPDFAnalyzer,
    compare:       renderCompare,
    certificate:   renderCertificate,
    saved:         renderSaved,
    pricelist:     renderPriceList,
    support:       renderSupport
  };

  if (pages[page]) pages[page](content);
}

function newBOQ() {
  AppState.currentBOQ = { id: null, meta: { project:'', woNumber:'', location:'', date:'' }, items: [] };
  navigateTo('boq');
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════
function renderDashboard(container) {
  const isAr = I18N.currentLang === 'ar';
  const totalBOQs = AppState.savedBOQs.length;
  const totalItems = AppState.savedBOQs.reduce((s, b) => s + b.items.length, 0);
  const totalValue = AppState.savedBOQs.reduce((s, b) => {
    return s + b.items.reduce((si, item) => {
      const p = getItemByCode(item.code);
      return si + (item.customPrice || (p ? p.newPrice : 0)) * item.qty;
    }, 0);
  }, 0);

  container.innerHTML = `
    <!-- Welcome Banner -->
    <div style="background:linear-gradient(135deg,#0d1829,#111827);border:1px solid var(--border-accent);border-radius:var(--radius-xl);padding:28px 32px;margin-bottom:24px;display:flex;align-items:center;gap:24px;overflow:hidden;position:relative;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 50%,rgba(0,208,132,0.08),transparent 60%);pointer-events:none;"></div>
      <div style="font-size:56px;filter:drop-shadow(0 0 20px rgba(0,208,132,0.4));">⚡</div>
      <div style="flex:1;position:relative;">
        <div style="font-size:11px;color:var(--accent-green);font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">مرحباً بك في</div>
        <h1 style="font-size:24px;font-weight:900;color:var(--text-primary);margin-bottom:6px;">PRICEWISE-SEC</h1>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;">النظام الذكي للتسعير والمقايسات | عقد RFx 4000083770<br>شركة الأساس العريض للمقاولات ← الشركة السعودية للكهرباء</p>
      </div>
      <div style="text-align:center;position:relative;">
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">نسبة ضريبة القيمة المضافة</div>
        <div style="font-size:36px;font-weight:900;color:var(--accent-gold);">15%</div>
        <div style="font-size:10px;color:var(--text-muted);">على الأعمال فقط</div>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid-4" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-icon green">📋</div>
        <div class="stat-value num">${totalBOQs}</div>
        <div class="stat-label">مقايسة محفوظة</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">🔢</div>
        <div class="stat-value num">${totalItems}</div>
        <div class="stat-label">إجمالي البنود</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold">💰</div>
        <div class="stat-value num" style="font-size:18px;">${formatNum(totalValue)}</div>
        <div class="stat-label">إجمالي الأعمال (ر.س)</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">📦</div>
        <div class="stat-value num">${PRICE_LIST.length}</div>
        <div class="stat-label">بند في قاعدة البيانات</div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div style="margin-bottom:8px;font-size:12px;color:var(--text-muted);font-weight:700;letter-spacing:1px;">${isAr ? 'ماذا تريد اليوم؟' : 'What would you like to do?'}</div>
    <div class="quick-actions" style="margin-bottom:24px;">
      ${[
        { icon:'📋', labelAr:'إنشاء مقايسة جديدة', labelEn:'Create New BOQ', subAr:'BOQ Builder كامل', subEn:'Full BOQ Builder', page:'boq' },
        { icon:'📄', labelAr:'تحليل ملف PDF', labelEn:'Analyze PDF File', subAr:'استخراج وفحص البنود', subEn:'Extract & inspect items', page:'pdf-analyzer' },
        { icon:'🔍', labelAr:'بحث عن بند', labelEn:'Search Item', subAr:'بالرمز أو الوصف', subEn:'By code or description', page:'search' },
        { icon:'⚖️', labelAr:'مقارنة مقايستين', labelEn:'Compare BOQs', subAr:'تقرير فروقات تفصيلي', subEn:'Detailed diff report', page:'compare' },
        { icon:'📜', labelAr:'إنشاء مستخلص', labelEn:'Create Certificate', subAr:'استكلاص الدفعات', subEn:'Payment certificate', page:'certificate' },
        { icon:'💾', labelAr:'المقايسات المحفوظة', labelEn:'Saved BOQs', subAr:totalBOQs + ' مقايسة', subEn:totalBOQs + ' saved', page:'saved' },
      ].map(a => `
        <div class="quick-action-card" onclick="navigateTo('${a.page}')">
          <span class="quick-action-icon">${a.icon}</span>
          <div class="quick-action-label">${isAr ? a.labelAr : a.labelEn}</div>
          <div class="quick-action-sub">${isAr ? a.subAr : a.subEn}</div>
        </div>
      `).join('')}
    </div>

    <!-- Recent BOQs -->
    ${AppState.savedBOQs.length > 0 ? `
    <div class="card">
      <div class="card-header">
        <span>💾</span>
        <span class="card-title">آخر المقايسات المحفوظة</span>
        <button class="btn btn-sm btn-secondary" onclick="navigateTo('saved')">عرض الكل</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>
            <th>رقم أمر العمل</th><th>المشروع</th><th>البنود</th>
            <th>الإجمالي</th><th>التاريخ</th><th>إجراءات</th>
          </tr></thead>
          <tbody>
            ${AppState.savedBOQs.slice(0,5).map(b => {
              const total = b.items.reduce((s, i) => {
                const p = getItemByCode(i.code);
                return s + (i.customPrice || (p ? p.newPrice : 0)) * i.qty;
              }, 0);
              return `<tr>
                <td class="code-cell">${b.meta.woNumber || '—'}</td>
                <td>${b.meta.project || '—'}</td>
                <td>${b.items.length}</td>
                <td class="total-cell">${formatNum(total * 1.15)} ر.س</td>
                <td style="font-size:11px;color:var(--text-muted)">${b.savedAt ? new Date(b.savedAt).toLocaleDateString('ar-SA') : '—'}</td>
                <td>
                  <button class="btn btn-sm btn-secondary" onclick="loadBOQ('${b.id}')">فتح</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteBOQ('${b.id}')">حذف</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : `
    <div class="card">
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>لا توجد مقايسات محفوظة بعد</h3>
        <p>أنشئ مقايستك الأولى بالنقر على "إنشاء مقايسة جديدة"</p>
        <br>
        <button class="btn btn-primary" onclick="navigateTo('boq')">📋 إنشاء مقايسة جديدة</button>
      </div>
    </div>
    `}
  `;
}

// ═══════════════════════════════════════════════════
// BOQ BUILDER
// ═══════════════════════════════════════════════════
function renderBOQBuilder(container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 380px;gap:20px;align-items:start;">
      <!-- Left: BOQ Table -->
      <div>
        <!-- Meta -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header">
            <span>📋</span>
            <span class="card-title">بيانات أمر العمل</span>
          </div>
          <div class="card-body">
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">رقم أمر العمل</label>
                <input class="form-control" id="meta-wo" placeholder="مثال: 251178040-802" value="${AppState.currentBOQ.meta.woNumber}">
              </div>
              <div class="form-group">
                <label class="form-label">اسم المشروع</label>
                <input class="form-control" id="meta-project" placeholder="مثال: توصيل طاقة حي النرجس" value="${AppState.currentBOQ.meta.project}">
              </div>
              <div class="form-group">
                <label class="form-label">الموقع</label>
                <input class="form-control" id="meta-location" placeholder="مثال: الرياض — حي النرجس" value="${AppState.currentBOQ.meta.location}">
              </div>
              <div class="form-group">
                <label class="form-label">التاريخ</label>
                <input class="form-control" type="date" id="meta-date" value="${AppState.currentBOQ.meta.date || new Date().toISOString().slice(0,10)}">
              </div>
            </div>
          </div>
        </div>

        <!-- Add Item -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header">
            <span>➕</span>
            <span class="card-title">إضافة بند</span>
          </div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:10px;align-items:end;">
              <div>
                <label class="form-label">بحث بالرمز أو الوصف</label>
                <div class="search-box" style="position:relative;">
                  <span class="search-icon">🔍</span>
                  <input class="form-control" id="boq-search-input" placeholder="اكتب رمز البند أو جزء من الوصف..." autocomplete="off">
                  <div class="search-results-dropdown" id="boq-search-dropdown"></div>
                </div>
              </div>
              <div>
                <label class="form-label">الكمية</label>
                <input class="form-control" id="boq-qty-input" type="number" min="0.01" step="0.01" value="1" style="width:90px;">
              </div>
              <div>
                <label class="form-label">السعر (اختياري)</label>
                <input class="form-control" id="boq-custom-price" type="number" min="0" step="0.01" placeholder="الافتراضي" style="width:110px;">
              </div>
              <div>
                <label class="form-label">&nbsp;</label>
                <button class="btn btn-primary" id="boq-add-btn" onclick="addBOQItem()" disabled>إضافة</button>
              </div>
            </div>
            <div id="selected-item-preview" style="display:none;margin-top:12px;padding:12px;background:rgba(0,208,132,0.06);border:1px solid var(--border-accent);border-radius:var(--radius-md);"></div>
          </div>
        </div>

        <!-- BOQ Table -->
        <div class="card" id="boq-table-card">
          <div class="card-header">
            <span>📊</span>
            <span class="card-title">بنود المقايسة</span>
            <span id="boq-item-count" style="font-size:12px;color:var(--text-muted);margin-right:auto;">0 بند</span>
            <button class="btn btn-sm btn-secondary" onclick="clearBOQ()">🗑️ مسح الكل</button>
          </div>
          <div id="boq-table-wrapper">
            <div class="empty-state" id="boq-empty-state">
              <div class="empty-icon">📋</div>
              <h3>لا توجد بنود بعد</h3>
              <p>ابدأ بإضافة بند من مربع البحث أعلاه</p>
            </div>
          </div>
          <!-- Totals -->
          <div class="boq-totals" id="boq-totals" style="display:none;">
            <div class="totals-grid">
              <div class="total-item subtotal">
                <div class="t-label">إجمالي الأعمال</div>
                <div class="t-value num" id="total-subtotal">0.00 ر.س</div>
              </div>
              <div class="total-item vat">
                <div class="t-label">ضريبة القيمة المضافة 15%</div>
                <div class="t-value num" id="total-vat">0.00 ر.س</div>
              </div>
              <div class="total-item grand">
                <div class="t-label">الإجمالي الكلي</div>
                <div class="t-value num" id="total-grand">0.00 ر.س</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Validator + Actions -->
      <div style="position:sticky;top:80px;">
        <!-- Actions -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header">
            <span>⚡</span>
            <span class="card-title">إجراءات</span>
          </div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px;">
            <button class="btn btn-primary btn-lg" onclick="saveBOQ()" style="width:100%;">💾 حفظ المقايسة</button>
            <button class="btn btn-secondary" onclick="runValidator()" style="width:100%;">✅ فحص الاكتمال</button>
            <div class="divider"></div>
            <div style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-bottom:4px;">تصدير</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <button class="btn btn-secondary btn-sm" onclick="doExport('excel')">📊 Excel</button>
              <button class="btn btn-secondary btn-sm" onclick="doExport('pdf')">📄 PDF</button>
              <button class="btn btn-secondary btn-sm" onclick="doExport('json')">🔗 JSON</button>
              <button class="btn btn-secondary btn-sm" onclick="doExport('sheet')">📏 شيت قياس</button>
            </div>
            <div class="divider"></div>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('certificate')" style="width:100%;">📜 إنشاء مستخلص من هذه المقايسة</button>
          </div>
        </div>

        <!-- Validator Panel -->
        <div id="validator-panel-wrapper">
          <div class="card">
            <div class="card-header">
              <span>🛡️</span>
              <span class="card-title">فحص الاكتمال</span>
            </div>
            <div class="card-body">
              <div class="empty-state" style="padding:30px 10px;">
                <div class="empty-icon" style="font-size:36px;">🛡️</div>
                <p>اضغط "فحص الاكتمال"<br>للتحقق من البنود المفقودة</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  setupBOQSearch();
  renderBOQTable();
}

let selectedItem = null;

function setupBOQSearch() {
  const input = document.getElementById('boq-search-input');
  const dropdown = document.getElementById('boq-search-dropdown');
  const addBtn = document.getElementById('boq-add-btn');

  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q.length < 1) { dropdown.classList.remove('open'); return; }
    const results = searchItems(q).slice(0, 10);
    if (!results.length) { dropdown.innerHTML = '<div style="padding:12px;color:var(--text-muted);text-align:center;font-size:12px;">لا توجد نتائج</div>'; dropdown.classList.add('open'); return; }
    dropdown.innerHTML = results.map(item => `
      <div class="search-result-item" onclick="selectBOQItem('${item.code}')">
        <span class="search-result-code">${item.code}</span>
        <div class="search-result-desc">
          <div>${item.arDesc}</div>
          <div style="font-size:10.5px;color:var(--text-muted)">${item.enDesc}</div>
        </div>
        <span class="search-result-uom">${item.uom}</span>
        ${item.isFuzzy ? `<span style="font-size:9px;background:rgba(200,168,75,0.15);color:#F0B429;border:1px solid rgba(200,168,75,0.3);padding:2px 6px;border-radius:4px;margin-right:6px;font-weight:700;">🔍 مقارب</span>` : ''}
        <span class="search-result-price">${formatNum(item.newPrice)}</span>
      </div>
    `).join('');
    dropdown.classList.add('open');
  });

  document.addEventListener('click', (e) => {
    if (dropdown && !e.target.closest('#boq-search-input') && !e.target.closest('#boq-search-dropdown')) {
      dropdown.classList.remove('open');
    }
  });
}

function selectBOQItem(code) {
  const item = getItemByCode(code);
  if (!item) return;
  selectedItem = item;

  const input = document.getElementById('boq-search-input');
  const dropdown = document.getElementById('boq-search-dropdown');
  const addBtn = document.getElementById('boq-add-btn');
  const preview = document.getElementById('selected-item-preview');

  if (input) input.value = `${item.code} — ${item.arDesc}`;
  if (dropdown) dropdown.classList.remove('open');
  if (addBtn) addBtn.disabled = false;

  if (preview) {
    preview.style.display = 'block';
    preview.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:13px;color:var(--text-h);margin-bottom:4px;">${item.arDesc}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">${item.enDesc}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <span class="uom-tag">${item.uom}</span>
            <span style="font-size:11px;color:var(--text-muted);">القسم: ${item.section}</span>
          </div>
        </div>
        <div style="text-align:left;">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">السعر الموحد</div>
          <div style="font-size:20px;font-weight:800;color:var(--accent-gold);">${formatNum(item.newPrice)} <span style="font-size:11px;font-weight:400;color:var(--text-muted);">ر.س</span></div>
        </div>
      </div>
    `;
  }
}

function addBOQItem() {
  if (!selectedItem) return;
  const qty = parseFloat(document.getElementById('boq-qty-input').value) || 1;
  const customPrice = parseFloat(document.getElementById('boq-custom-price').value) || null;

  AppState.currentBOQ.items.push({
    code: selectedItem.code,
    qty,
    customPrice,
    note: ''
  });

  saveMeta();
  renderBOQTable();
  updateBOQTotals();

  // Reset
  const searchInput = document.getElementById('boq-search-input');
  const qtyInput = document.getElementById('boq-qty-input');
  const priceInput = document.getElementById('boq-custom-price');
  const addBtn = document.getElementById('boq-add-btn');
  const preview = document.getElementById('selected-item-preview');
  const dropdown = document.getElementById('boq-search-dropdown');

  if (searchInput) searchInput.value = '';
  if (qtyInput) qtyInput.value = '1';
  if (priceInput) priceInput.value = '';
  if (addBtn) addBtn.disabled = true;
  if (preview) preview.style.display = 'none';
  if (dropdown) dropdown.classList.remove('open');
  selectedItem = null;

  const lastAdded = AppState.currentBOQ.items.at(-1);
  if (lastAdded) {
    showToast(`تم إضافة: ${getItemByCode(lastAdded.code)?.arDesc?.slice(0,30)}...`);
  }
}

function renderBOQTable() {
  const wrapper = document.getElementById('boq-table-wrapper');
  const emptyState = document.getElementById('boq-empty-state');
  const totalsEl = document.getElementById('boq-totals');
  const countEl = document.getElementById('boq-item-count');

  if (!wrapper) return;
  const items = AppState.currentBOQ.items;

  if (countEl) countEl.textContent = `${items.length} بند`;

  if (!items.length) {
    wrapper.innerHTML = `<div class="empty-state" style="padding:40px 20px;">
      <div class="empty-icon">📋</div>
      <h3>لا توجد بنود بعد</h3>
      <p>ابدأ بإضافة بند من مربع البحث أعلاه</p>
    </div>`;
    if (totalsEl) totalsEl.style.display = 'none';
    return;
  }

  if (totalsEl) totalsEl.style.display = 'block';

  let html = `<div class="table-wrapper"><table class="data-table"><thead><tr>
    <th>#</th><th>الرمز</th><th>الوصف</th><th>الوحدة</th>
    <th>الكمية</th><th>السعر الموحد</th><th>الإجمالي</th><th>ملاحظات</th><th></th>
  </tr></thead><tbody>`;

  let rowNum = 1;
  let lastSection = '';

  items.forEach((item, idx) => {
    const p = getItemByCode(item.code);
    const unitPrice = item.customPrice || (p ? p.newPrice : 0);
    const total = unitPrice * item.qty;

    if (p && p.section !== lastSection) {
      lastSection = p.section;
      html += `<tr class="section-row"><td colspan="9">📁 ${lastSection}</td></tr>`;
    }

    html += `<tr class="boq-row" data-idx="${idx}">
      <td style="color:var(--text-muted);font-size:11px;">${rowNum++}</td>
      <td class="code-cell">${item.code}</td>
      <td class="desc-cell">
        <div>${p ? p.arDesc : '—'}</div>
        <div class="desc-en">${p ? p.enDesc : ''}</div>
      </td>
      <td><span class="uom-badge">${p ? p.uom : ''}</span></td>
      <td><input class="qty-input" type="number" min="0.01" step="0.01" value="${item.qty}" onchange="updateQty(${idx}, this.value)"></td>
      <td class="price-cell">${formatNum(unitPrice)} <span style="font-size:10px;color:var(--text-muted);">ر.س</span></td>
      <td class="total-cell">${formatNum(total)} <span style="font-size:10px;color:var(--text-muted);">ر.س</span></td>
      <td><input class="form-control" style="width:120px;font-size:11px;padding:4px 8px;" placeholder="ملاحظة" value="${item.note || ''}" onchange="updateNote(${idx}, this.value)"></td>
      <td><button class="btn btn-danger btn-sm btn-icon" onclick="removeBOQItem(${idx})" title="حذف">✕</button></td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  wrapper.innerHTML = html;
  updateBOQTotals();
}

function updateQty(idx, val) {
  AppState.currentBOQ.items[idx].qty = parseFloat(val) || 1;
  updateBOQTotals();
}

function updateNote(idx, val) {
  AppState.currentBOQ.items[idx].note = val;
}

function removeBOQItem(idx) {
  AppState.currentBOQ.items.splice(idx, 1);
  renderBOQTable();
}

function clearBOQ() {
  if (!confirm('هل تريد مسح جميع البنود؟')) return;
  AppState.currentBOQ.items = [];
  renderBOQTable();
}

function updateBOQTotals() {
  const items = AppState.currentBOQ.items;
  const subtotal = items.reduce((s, i) => {
    const p = getItemByCode(i.code);
    return s + (i.customPrice || (p ? p.newPrice : 0)) * i.qty;
  }, 0);
  const vat = subtotal * 0.15;
  const grand = subtotal + vat;

  const el = (id) => document.getElementById(id);
  if (el('total-subtotal')) el('total-subtotal').textContent = formatNum(subtotal) + ' ر.س';
  if (el('total-vat')) el('total-vat').textContent = formatNum(vat) + ' ر.س';
  if (el('total-grand')) el('total-grand').textContent = formatNum(grand) + ' ر.س';
}

function saveMeta() {
  AppState.currentBOQ.meta.woNumber = document.getElementById('meta-wo')?.value || '';
  AppState.currentBOQ.meta.project = document.getElementById('meta-project')?.value || '';
  AppState.currentBOQ.meta.location = document.getElementById('meta-location')?.value || '';
  AppState.currentBOQ.meta.date = document.getElementById('meta-date')?.value || '';
}

function saveBOQ() {
  saveMeta();
  if (!AppState.currentBOQ.items.length) { showToast('أضف بنوداً قبل الحفظ', 'warning'); return; }
  const id = Storage.saveBOQ({ ...AppState.currentBOQ });
  AppState.currentBOQ.id = id;
  showToast('تم حفظ المقايسة بنجاح ✅', 'success');
}

function loadBOQ(id) {
  const boq = Storage.getBOQ(id);
  if (!boq) return;
  AppState.currentBOQ = { ...boq, items: [...boq.items] };
  navigateTo('boq');
  showToast('تم فتح المقايسة', 'info');
}

function deleteBOQ(id) {
  if (!confirm('حذف المقايسة نهائياً؟')) return;
  Storage.deleteBOQ(id);
  showToast('تم حذف المقايسة', 'warning');
  renderDashboard(document.getElementById('page-content'));
}

function doExport(type) {
  saveMeta();
  const boq = AppState.currentBOQ;
  if (!boq.items.length) { showToast('لا توجد بنود للتصدير', 'warning'); return; }
  const meta = boq.meta;
  if (type === 'excel') exportToExcel(boq, meta);
  else if (type === 'pdf') exportToPDF(boq, meta);
  else if (type === 'json') exportToJSON(boq, meta);
  else if (type === 'sheet') exportMeasurementSheet(boq, meta);
}

// ═══════════════════════════════════════════════════
// VALIDATOR
// ═══════════════════════════════════════════════════
function runValidator() {
  const items = AppState.currentBOQ.items;
  if (!items.length) { showToast('أضف بنوداً أولاً', 'warning'); return; }

  const results = checkDependencies(items);
  const wrapper = document.getElementById('validator-panel-wrapper');
  if (!wrapper) return;

  const totalMissing = results.missing.length;
  const totalWarnings = results.warnings.length;

  let html = `
    <div class="validator-panel">
      <div class="validator-header" style="background:${totalMissing > 0 ? 'rgba(255,71,87,0.08)' : 'rgba(0,208,132,0.08)'};">
        <span>${totalMissing > 0 ? '🔴' : '✅'}</span>
        <span>${totalMissing > 0 ? `${totalMissing} بند مفقود` : 'المقايسة مكتملة!'}</span>
        ${totalWarnings > 0 ? `<span class="risk-badge medium" style="margin-right:auto;">🟡 ${totalWarnings} تحذير</span>` : ''}
      </div>
  `;

  if (totalMissing === 0 && totalWarnings === 0) {
    html += `<div class="validator-item">
      <div class="validator-item-icon">✅</div>
      <div class="validator-item-body">
        <div class="validator-item-title" style="color:var(--accent-green);">جميع البنود المطلوبة موجودة</div>
        <div class="validator-item-desc">المقايسة مكتملة وجاهزة للتقديم</div>
      </div>
    </div>`;
  }

  results.missing.forEach(m => {
    html += `
      <div class="validator-item">
        <div class="validator-item-icon">${riskIcon(m.risk)}</div>
        <div class="validator-item-body">
          <div class="validator-item-title">${m.reason}</div>
          <div class="validator-item-desc">بسبب: <strong>${m.triggeredByName}</strong> (${m.triggeredBy})</div>
          <div class="validator-item-codes">
            ${m.missingCodes.map(c => {
              const p = getItemByCode(c);
              return `<span onclick="quickAddItem('${c}')" title="${p ? p.arDesc : ''}">${c}</span>`;
            }).join('')}
          </div>
          ${m.suggestedQty && m.suggestedQty !== 'same' ? `<div style="font-size:10.5px;color:var(--accent-gold);margin-top:4px;">الكمية المقترحة: ${m.suggestedQty}</div>` : ''}
        </div>
        <span class="risk-badge ${m.risk}">${riskIcon(m.risk)} ${riskLabel(m.risk)}</span>
      </div>
    `;
  });

  results.warnings.forEach(w => {
    html += `
      <div class="validator-item">
        <div class="validator-item-icon">🟡</div>
        <div class="validator-item-body">
          <div class="validator-item-title" style="color:var(--accent-gold);">${w.reason}</div>
          <div class="validator-item-desc">بسبب: ${w.triggeredByName} (${w.triggeredBy})</div>
          <div class="validator-item-codes">
            ${w.suggestedCodes.map(c => `<span onclick="quickAddItem('${c}')">${c}</span>`).join('')}
          </div>
        </div>
        <span class="risk-badge medium">🟡 اختياري</span>
      </div>
    `;
  });

  html += '</div>';
  wrapper.innerHTML = html;
}

function quickAddItem(code) {
  const item = getItemByCode(code);
  if (!item) return;
  AppState.currentBOQ.items.push({ code, qty: 1, customPrice: null, note: '' });
  renderBOQTable();
  runValidator();
  showToast(`تمت إضافة: ${item.arDesc.slice(0,30)}...`);
}

// ═══════════════════════════════════════════════════
// SEARCH PAGE
// ═══════════════════════════════════════════════════
function renderSearchPage(container) {
  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body">
        <div class="search-box" style="margin-bottom:12px;">
          <span class="search-icon">🔍</span>
          <input class="form-control" id="search-main-input" placeholder="ابحث بالرمز أو الوصف العربي أو الإنجليزي..." style="font-size:15px;padding:14px 44px 14px 14px;">
        </div>
        <div class="cat-pills" id="cat-pills">
          ${CATEGORIES.map(c => `<button class="cat-pill ${c.id === 'all' ? 'active' : ''}" data-cat="${c.id}" onclick="filterCat('${c.id}')">${c.label}</button>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--text-muted);" id="search-count">${PRICE_LIST.length} بند إجمالاً</div>
      </div>
    </div>
    <div id="search-results-grid"></div>
  `;

  AppState.searchQuery = '';
  AppState.activeCategory = 'all';
  renderSearchResults(PRICE_LIST);

  document.getElementById('search-main-input').addEventListener('input', function () {
    AppState.searchQuery = this.value.trim();
    applySearchFilter();
  });
}

function filterCat(cat) {
  AppState.activeCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === cat);
  });
  applySearchFilter();
}

function applySearchFilter() {
  let items = searchItems(AppState.searchQuery);
  if (AppState.activeCategory !== 'all') {
    items = items.filter(i => i.cat === AppState.activeCategory);
  }
  document.getElementById('search-count').textContent = `${items.length} نتيجة`;
  renderSearchResults(items);
}

function renderSearchResults(items) {
  const grid = document.getElementById('search-results-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>لا توجد نتائج</h3><p>جرّب كلمات بحث مختلفة</p></div>`;
    return;
  }

  const grouped = {};
  items.forEach(i => {
    if (!grouped[i.section]) grouped[i.section] = [];
    grouped[i.section].push(i);
  });

  let html = '';
  Object.entries(grouped).forEach(([section, secItems]) => {
    html += `<div style="margin-bottom:20px;">
      <div style="font-size:12px;font-weight:700;color:var(--accent-green);margin-bottom:10px;padding-right:4px;border-right:3px solid var(--accent-green);padding-right:10px;">📁 ${section}</div>
      <div style="overflow-x:auto;"><table class="data-table">
        <thead><tr>
          <th>الرمز</th><th>الوصف بالعربية</th><th>الوصف بالإنجليزية</th>
          <th>الوحدة</th><th>السعر الموحد</th><th>إضافة</th>
        </tr></thead>
        <tbody>
          ${secItems.map(item => {
            return `<tr>
              <td class="code-cell">${item.code}</td>
              <td class="desc-cell">${item.arDesc}</td>
              <td style="font-size:11px;color:var(--text-muted);">${item.enDesc}</td>
              <td><span class="uom-badge">${item.uom}</span></td>
              <td class="price-cell">${formatNum(item.newPrice)} <span style="font-size:10px;color:var(--text-muted)">ر.س</span></td>
              <td><button class="btn btn-sm btn-primary" onclick="addFromSearch('${item.code}')">➕ إضافة</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>`;
  });

  grid.innerHTML = html;
}

function addFromSearch(code) {
  const item = getItemByCode(code);
  if (!item) return;
  AppState.currentBOQ.items.push({ code, qty: 1, customPrice: null, note: '' });
  showToast(`تمت إضافة ${item.arDesc.slice(0,25)}... إلى المقايسة الحالية`);
}

// ═══════════════════════════════════════════════════
// ANALYZER
// ═══════════════════════════════════════════════════
function renderAnalyzer(container) {
  container.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px;align-items:start;">
      <div>
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><span>📂</span><span class="card-title">استيراد بيانات المقايسة</span></div>
          <div class="card-body">
            <div class="tab-nav" style="margin-bottom:16px;">
              <button class="tab-btn active" onclick="switchAnalyzerTab('manual', this)">إدخال يدوي</button>
              <button class="tab-btn" onclick="switchAnalyzerTab('csv', this)">استيراد CSV</button>
            </div>
            <div id="analyzer-manual">
              <div class="form-group">
                <label class="form-label">رقم أمر العمل</label>
                <input class="form-control" id="ana-wo" placeholder="مثال: 251178040-802">
              </div>
              <div id="analyzer-items-list">
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">بنود المقايسة للفحص:</div>
                <div id="ana-rows"></div>
                <button class="btn btn-secondary btn-sm" onclick="addAnaRow()" style="margin-top:8px;">➕ إضافة بند</button>
              </div>
            </div>
            <div id="analyzer-csv" style="display:none;">
              <div class="alert alert-info">
                <span class="alert-icon">ℹ️</span>
                <div>أدخل بيانات المقايسة بصيغة CSV: <strong>رمز_البند,الكمية,السعر</strong><br>
                مثال: <code style="font-family:var(--font-mono);font-size:11px;">304010101,100,9</code></div>
              </div>
              <textarea class="form-control" id="csv-input" rows="8" placeholder="304010101,100,9&#10;301010101,100,65&#10;305010301,2,196" style="font-family:var(--font-mono);font-size:12px;"></textarea>
            </div>
            <div style="margin-top:14px;">
              <button class="btn btn-primary" onclick="runAnalysis()" style="width:100%;">🔍 تشغيل التحليل</button>
            </div>
          </div>
        </div>
      </div>
      <div id="analysis-result">
        <div class="card">
          <div class="card-body">
            <div class="empty-state" style="padding:40px 10px;">
              <div class="empty-icon">📊</div>
              <h3>جاهز للتحليل</h3>
              <p>أدخل بيانات المقايسة واضغط<br>"تشغيل التحليل"</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  addAnaRow();
}

let anaTabActive = 'manual';
function switchAnalyzerTab(tab, btn) {
  anaTabActive = tab;
  document.querySelectorAll('#analyzer-manual, #analyzer-csv').forEach(el => el.style.display = 'none');
  document.getElementById(`analyzer-${tab}`).style.display = 'block';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

let anaRowCount = 0;
function addAnaRow() {
  const container = document.getElementById('ana-rows');
  if (!container) return;
  const id = ++anaRowCount;
  const div = document.createElement('div');
  div.id = `ana-row-${id}`;
  div.style.cssText = 'display:grid;grid-template-columns:1fr auto auto auto;gap:8px;margin-bottom:8px;align-items:center;';
  div.innerHTML = `
    <div class="search-box" style="position:relative;">
      <span class="search-icon">🔍</span>
      <input class="form-control" id="ana-search-${id}" placeholder="رمز البند أو الوصف..." autocomplete="off" data-row="${id}">
      <div class="search-results-dropdown" id="ana-dd-${id}"></div>
    </div>
    <input class="form-control" id="ana-qty-${id}" type="number" value="1" placeholder="الكمية" style="width:75px;">
    <input class="form-control" id="ana-price-${id}" type="number" placeholder="السعر" style="width:90px;" data-code="">
    <button class="btn btn-danger btn-sm btn-icon" onclick="document.getElementById('ana-row-${id}').remove()">✕</button>
  `;
  container.appendChild(div);

  const si = document.getElementById(`ana-search-${id}`);
  const dd = document.getElementById(`ana-dd-${id}`);
  si.addEventListener('input', () => {
    const results = searchItems(si.value.trim()).slice(0, 8);
    if (!results.length || !si.value.trim()) { dd.classList.remove('open'); return; }
    dd.innerHTML = results.map(item => `
      <div class="search-result-item" onclick="selectAnaItem(${id},'${item.code}')">
        <span class="search-result-code">${item.code}</span>
        <span class="search-result-desc">${item.arDesc}</span>
        <span class="search-result-price">${formatNum(item.newPrice)}</span>
      </div>
    `).join('');
    dd.classList.add('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest(`#ana-search-${id}`) && !e.target.closest(`#ana-dd-${id}`)) dd.classList.remove('open');
  });
}

function selectAnaItem(id, code) {
  const item = getItemByCode(code);
  if (!item) return;
  document.getElementById(`ana-search-${id}`).value = `${code} — ${item.arDesc}`;
  document.getElementById(`ana-search-${id}`).dataset.code = code;
  document.getElementById(`ana-price-${id}`).value = item.newPrice;
  document.getElementById(`ana-price-${id}`).dataset.code = code;
  document.getElementById(`ana-dd-${id}`).classList.remove('open');
}

function runAnalysis() {
  let items = [];

  if (anaTabActive === 'manual') {
    document.querySelectorAll('[id^="ana-search-"]').forEach(el => {
      const id = el.id.replace('ana-search-', '');
      const code = el.dataset.code || el.value.split('—')[0].trim();
      const qty = parseFloat(document.getElementById(`ana-qty-${id}`)?.value) || 1;
      const price = parseFloat(document.getElementById(`ana-price-${id}`)?.value) || null;
      if (code && getItemByCode(code)) items.push({ code, qty, customPrice: price });
    });
  } else {
    const csv = document.getElementById('csv-input')?.value || '';
    csv.split('\n').forEach(line => {
      const parts = line.trim().split(',');
      if (parts.length >= 1 && parts[0].trim()) {
        const code = parts[0].trim();
        const qty = parseFloat(parts[1]) || 1;
        const price = parseFloat(parts[2]) || null;
        if (getItemByCode(code)) items.push({ code, qty, customPrice: price });
      }
    });
  }

  if (!items.length) { showToast('لا توجد بنود صالحة للتحليل', 'warning'); return; }

  const woNumber = document.getElementById('ana-wo')?.value || '—';
  const depResults = checkDependencies(items);

  let totalOriginal = 0, totalDeviation = 0;
  const itemRows = items.map((item, i) => {
    const p = getItemByCode(item.code);
    const contractPrice = p ? p.newPrice : 0;
    const enteredPrice = item.customPrice || contractPrice;
    const diff = enteredPrice - contractPrice;
    const diffPct = contractPrice ? ((diff / contractPrice) * 100).toFixed(1) : 0;
    const total = enteredPrice * item.qty;
    totalOriginal += total;
    if (Math.abs(diff) > contractPrice * 0.05) totalDeviation += Math.abs(diff) * item.qty;

    const status = Math.abs(parseFloat(diffPct)) <= 5 ? '✅ مطابق' :
      parseFloat(diffPct) > 5 ? `<span class="price-up">🔺 +${diffPct}%</span>` :
      `<span class="price-down">🔻 ${diffPct}%</span>`;

    return `<tr>
      <td>${i+1}</td>
      <td class="code-cell">${item.code}</td>
      <td class="desc-cell">${p ? p.arDesc : '—'}</td>
      <td><span class="uom-badge">${p ? p.uom : ''}</span></td>
      <td>${item.qty}</td>
      <td class="price-cell">${formatNum(enteredPrice)}</td>
      <td style="color:var(--text-muted);">${formatNum(contractPrice)}</td>
      <td>${status}</td>
      <td class="total-cell">${formatNum(total)}</td>
    </tr>`;
  }).join('');

  const missingHtml = depResults.missing.map(m => `
    <div class="validator-item">
      <div class="validator-item-icon">${riskIcon(m.risk)}</div>
      <div class="validator-item-body">
        <div class="validator-item-title">${m.reason}</div>
        <div class="validator-item-desc">بسبب وجود: ${m.triggeredByName}</div>
        <div class="validator-item-codes">${m.missingCodes.map(c => `<span>${c}</span>`).join('')}</div>
      </div>
      <span class="risk-badge ${m.risk}">${riskIcon(m.risk)} ${riskLabel(m.risk)}</span>
    </div>
  `).join('');

  const vat = totalOriginal * 0.15;

  document.getElementById('analysis-result').innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <span>📋</span>
        <span class="card-title">تقرير تحليل المقايسة — ${woNumber}</span>
        <button class="btn btn-sm btn-secondary" onclick="importAnalyzedItems(${JSON.stringify(items).replace(/"/g,'&quot;')})">📥 استيراد للمنشئ</button>
      </div>
      <div class="card-body">
        <div class="grid-3" style="margin-bottom:16px;">
          <div style="text-align:center;">
            <div style="font-size:11px;color:var(--text-muted);">البنود المحللة</div>
            <div style="font-size:22px;font-weight:800;color:var(--text-primary);">${items.length}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:var(--text-muted);">الإجمالي قبل الضريبة</div>
            <div style="font-size:22px;font-weight:800;color:var(--accent-gold);">${formatNum(totalOriginal)} ر.س</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:var(--text-muted);">الإجمالي + 15% ضريبة</div>
            <div style="font-size:22px;font-weight:800;color:var(--accent-green);">${formatNum(totalOriginal + vat)} ر.س</div>
          </div>
        </div>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>الرمز</th><th>الوصف</th><th>وحدة</th>
            <th>الكمية</th><th>سعر أمر العمل</th><th>السعر الموحد</th><th>الحالة</th><th>الإجمالي</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    </div>

    ${depResults.missing.length > 0 ? `
    <div class="card">
      <div class="card-header" style="background:rgba(255,71,87,0.06);">
        <span>⚠️</span>
        <span class="card-title" style="color:var(--accent-red);">بنود مفقودة — ${depResults.missing.length} مشكلة</span>
      </div>
      <div class="validator-panel">${missingHtml}</div>
    </div>
    ` : `
    <div class="alert alert-success">
      <span class="alert-icon">✅</span>
      <span>المقايسة مكتملة — لا توجد بنود مفقودة من تحليل الاعتماديات</span>
    </div>
    `}
  `;
}

function importAnalyzedItems(items) {
  if (!items || !items.length) return;
  AppState.currentBOQ.items = [...AppState.currentBOQ.items, ...items];
  navigateTo('boq');
  showToast(`تم استيراد ${items.length} بند إلى المنشئ`);
}

// ═══════════════════════════════════════════════════
// COMPARE
// ═══════════════════════════════════════════════════
function renderCompare(container) {
  container.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px;align-items:start;">
      <div class="card">
        <div class="card-header"><span>🅰️</span><span class="card-title">المقايسة (أ)</span></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">اختر مقايسة محفوظة (أ)</label>
            <select class="form-control" id="cmp-select-a">
              <option value="">— اختر —</option>
              ${AppState.savedBOQs.map(b => `<option value="${b.id}">${b.meta.woNumber || b.id} — ${b.meta.project || 'بدون اسم'}</option>`).join('')}
            </select>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin:8px 0;text-align:center;">— أو —</div>
          <div class="form-group">
            <label class="form-label">إدخال CSV (رمز,كمية,سعر)</label>
            <textarea class="form-control" id="cmp-csv-a" rows="5" placeholder="304010101,100,9&#10;301010101,100,65" style="font-family:var(--font-mono);font-size:11px;"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">اسم المقايسة أ</label>
            <input class="form-control" id="cmp-label-a" value="المقايسة أ" placeholder="اسم للعرض">
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span>🅱️</span><span class="card-title">المقايسة (ب)</span></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">اختر مقايسة محفوظة (ب)</label>
            <select class="form-control" id="cmp-select-b">
              <option value="">— اختر —</option>
              ${AppState.savedBOQs.map(b => `<option value="${b.id}">${b.meta.woNumber || b.id} — ${b.meta.project || 'بدون اسم'}</option>`).join('')}
            </select>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin:8px 0;text-align:center;">— أو —</div>
          <div class="form-group">
            <label class="form-label">إدخال CSV (رمز,كمية,سعر)</label>
            <textarea class="form-control" id="cmp-csv-b" rows="5" placeholder="304010101,100,11&#10;301010101,100,65" style="font-family:var(--font-mono);font-size:11px;"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">اسم المقايسة ب</label>
            <input class="form-control" id="cmp-label-b" value="المقايسة ب" placeholder="اسم للعرض">
          </div>
        </div>
      </div>
    </div>
    <div style="text-align:center;margin-bottom:20px;">
      <button class="btn btn-primary btn-lg" onclick="runComparison()">⚖️ تشغيل المقارنة</button>
    </div>
    <div id="compare-result"></div>
  `;
}

function getCompareItems(selectId, csvId) {
  const savedId = document.getElementById(selectId)?.value;
  if (savedId) {
    const boq = Storage.getBOQ(savedId);
    if (boq) return boq.items.map(i => {
      const p = getItemByCode(i.code);
      return { code: i.code, qty: i.qty, price: i.customPrice || (p ? p.newPrice : 0) };
    });
  }
  const csv = document.getElementById(csvId)?.value || '';
  return csv.split('\n').filter(l => l.trim()).map(line => {
    const [code, qty, price] = line.split(',');
    return { code: code?.trim(), qty: parseFloat(qty)||1, price: parseFloat(price)||0 };
  }).filter(i => i.code && getItemByCode(i.code));
}

function runComparison() {
  const itemsA = getCompareItems('cmp-select-a', 'cmp-csv-a');
  const itemsB = getCompareItems('cmp-select-b', 'cmp-csv-b');
  const labelA = document.getElementById('cmp-label-a')?.value || 'أ';
  const labelB = document.getElementById('cmp-label-b')?.value || 'ب';

  if (!itemsA.length || !itemsB.length) { showToast('أدخل بيانات المقايستين', 'warning'); return; }

  const mapA = Object.fromEntries(itemsA.map(i => [i.code, i]));
  const mapB = Object.fromEntries(itemsB.map(i => [i.code, i]));
  const allCodes = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])];

  let totalA = 0, totalB = 0, overrun = 0, saving = 0;
  let rows = '';
  let same = 0, up = 0, down = 0, onlyA = 0, onlyB = 0;

  allCodes.forEach(code => {
    const a = mapA[code];
    const b = mapB[code];
    const p = getItemByCode(code);
    const aTotal = a ? a.price * a.qty : 0;
    const bTotal = b ? b.price * b.qty : 0;
    totalA += aTotal;
    totalB += bTotal;
    const diff = bTotal - aTotal;
    const diffPct = aTotal ? ((diff / aTotal) * 100).toFixed(1) : '—';

    let status = '';
    if (!a) { onlyB++; status = '<span class="risk-badge minor">جديد في ب</span>'; }
    else if (!b) { onlyA++; status = '<span class="risk-badge medium">في أ فقط</span>'; }
    else if (diff > 0) { up++; overrun += diff; status = `<span class="price-up">🔺 +${diffPct}%</span>`; }
    else if (diff < 0) { down++; saving += Math.abs(diff); status = `<span class="price-down">🔻 ${diffPct}%</span>`; }
    else { same++; status = '✅ مطابق'; }

    rows += `<tr>
      <td class="code-cell">${code}</td>
      <td class="desc-cell">${p ? p.arDesc : '—'}</td>
      <td>${p ? p.uom : ''}</td>
      <td>${a ? `${a.qty} × ${formatNum(a.price)}` : '—'}</td>
      <td>${b ? `${b.qty} × ${formatNum(b.price)}` : '—'}</td>
      <td class="${diff > 0 ? 'price-up' : diff < 0 ? 'price-down' : ''}">${aTotal ? formatNum(aTotal) : '—'}</td>
      <td class="${diff > 0 ? 'price-up' : diff < 0 ? 'price-down' : ''}">${bTotal ? formatNum(bTotal) : '—'}</td>
      <td>${status}</td>
    </tr>`;
  });

  const netDiff = totalB - totalA;
  document.getElementById('compare-result').innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><span>⚖️</span><span class="card-title">تقرير المقارنة: ${labelA} مقابل ${labelB}</span></div>
      <div class="card-body">
        <div class="grid-4" style="margin-bottom:16px;">
          <div style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">مطابق</div><div style="font-size:20px;font-weight:800;color:var(--accent-green)">${same}</div></div>
          <div style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">ارتفع</div><div style="font-size:20px;font-weight:800;color:var(--accent-red)">${up}</div></div>
          <div style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">انخفض</div><div style="font-size:20px;font-weight:800;color:var(--accent-green)">${down}</div></div>
          <div style="text-align:center"><div style="font-size:11px;color:var(--text-muted)">مختلف</div><div style="font-size:20px;font-weight:800;color:var(--accent-gold)">${onlyA + onlyB}</div></div>
        </div>
        <div class="grid-3">
          <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:16px;text-align:center;">
            <div style="font-size:11px;color:var(--text-muted)">إجمالي ${labelA}</div>
            <div style="font-size:18px;font-weight:800;color:var(--accent-gold)">${formatNum(totalA)} ر.س</div>
          </div>
          <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:16px;text-align:center;">
            <div style="font-size:11px;color:var(--text-muted)">إجمالي ${labelB}</div>
            <div style="font-size:18px;font-weight:800;color:var(--accent-blue)">${formatNum(totalB)} ر.س</div>
          </div>
          <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:16px;text-align:center;border:1px solid ${netDiff > 0 ? 'rgba(255,71,87,0.3)' : 'rgba(0,208,132,0.3)'};">
            <div style="font-size:11px;color:var(--text-muted)">صافي الفارق</div>
            <div style="font-size:18px;font-weight:800;color:${netDiff > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">
              ${netDiff > 0 ? '+' : ''}${formatNum(netDiff)} ر.س
            </div>
          </div>
        </div>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>الرمز</th><th>الوصف</th><th>وحدة</th>
            <th>${labelA}</th><th>${labelB}</th>
            <th>إجمالي أ</th><th>إجمالي ب</th><th>الحالة</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════
// CERTIFICATE
// ═══════════════════════════════════════════════════
function renderCertificate(container) {
  container.innerHTML = `
    <div class="cert-header">
      <h2>📜 منشئ المستخلصات</h2>
      <p>إنشاء مستخلص دفعة من مقايسة موجودة أو إدخال يدوي</p>
    </div>
    <div class="grid-2" style="margin-bottom:16px;align-items:start;">
      <div class="card">
        <div class="card-header"><span>⚙️</span><span class="card-title">بيانات المستخلص</span></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">رقم المستخلص</label>
            <input class="form-control" id="cert-num" value="1" type="number" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">رقم أمر العمل</label>
            <input class="form-control" id="cert-wo" placeholder="مثال: 251178040-802">
          </div>
          <div class="form-group">
            <label class="form-label">التاريخ</label>
            <input class="form-control" type="date" id="cert-date" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="form-group">
            <label class="form-label">اختر مقايسة محفوظة</label>
            <select class="form-control" id="cert-boq-select" onchange="loadCertBOQ()">
              <option value="">— اختر مقايسة —</option>
              ${AppState.savedBOQs.map(b => `<option value="${b.id}">${b.meta.woNumber || b.id} — ${b.meta.project || ''}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">نسبة الإنجاز الإجمالية % (اختياري)</label>
            <input class="form-control" id="cert-global-pct" type="number" min="0" max="100" placeholder="أو ادخل لكل بند" oninput="applyGlobalPct(this.value)">
          </div>
        </div>
      </div>
      <div id="cert-items-panel">
        <div class="card">
          <div class="card-body">
            <div class="empty-state" style="padding:40px 10px;">
              <div class="empty-icon">📄</div>
              <p>اختر مقايسة لبدء إنشاء المستخلص</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="cert-preview"></div>
  `;
}

let certItems = [];
function loadCertBOQ() {
  const id = document.getElementById('cert-boq-select')?.value;
  if (!id) return;
  const boq = Storage.getBOQ(id);
  if (!boq) return;

  certItems = boq.items.map(item => {
    const p = getItemByCode(item.code);
    return { ...item, unitPrice: item.customPrice || (p ? p.newPrice : 0), pct: 0 };
  });

  document.getElementById('cert-wo').value = boq.meta.woNumber || '';
  renderCertItems();
}

function renderCertItems() {
  const panel = document.getElementById('cert-items-panel');
  if (!certItems.length) return;

  panel.innerHTML = `
    <div class="card">
      <div class="card-header"><span>📋</span><span class="card-title">تفاصيل البنود</span></div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>الرمز</th><th>الوصف</th><th>وحدة</th><th>الكمية</th>
            <th>السعر</th><th>الإجمالي</th><th>نسبة الإنجاز %</th><th>المنفذ</th>
          </tr></thead>
          <tbody>
            ${certItems.map((item, idx) => {
              const p = getItemByCode(item.code);
              const total = item.unitPrice * item.qty;
              const executed = total * (item.pct / 100);
              return `<tr>
                <td class="code-cell">${item.code}</td>
                <td class="desc-cell">${p ? p.arDesc : '—'}</td>
                <td><span class="uom-badge">${p ? p.uom : ''}</span></td>
                <td>${item.qty}</td>
                <td class="price-cell">${formatNum(item.unitPrice)}</td>
                <td>${formatNum(total)}</td>
                <td><input type="number" min="0" max="100" value="${item.pct}" class="qty-input" oninput="updateCertPct(${idx},this.value)" style="width:65px;"> %</td>
                <td class="total-cell" id="cert-exec-${idx}">${formatNum(executed)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:16px;display:flex;justify-content:flex-end;gap:10px;">
        <button class="btn btn-primary" onclick="generateCertPreview()">📄 عرض المستخلص</button>
        <button class="btn btn-secondary" onclick="printCertificate()">🖨️ طباعة</button>
      </div>
    </div>
  `;
}

function applyGlobalPct(val) {
  const pct = parseFloat(val) || 0;
  certItems.forEach((item, idx) => {
    item.pct = pct;
    const el = document.getElementById(`cert-exec-${idx}`);
    if (el) el.textContent = formatNum(item.unitPrice * item.qty * pct / 100);
  });
  document.querySelectorAll('#cert-items-panel input[type=number]').forEach(inp => { inp.value = pct; });
}

function updateCertPct(idx, val) {
  certItems[idx].pct = parseFloat(val) || 0;
  const total = certItems[idx].unitPrice * certItems[idx].qty;
  const el = document.getElementById(`cert-exec-${idx}`);
  if (el) el.textContent = formatNum(total * certItems[idx].pct / 100);
}

function generateCertPreview() {
  const certNum = document.getElementById('cert-num')?.value || '1';
  const certWO  = document.getElementById('cert-wo')?.value || '—';
  const certDate = document.getElementById('cert-date')?.value || '';

  const totalContract = certItems.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const totalExecuted = certItems.reduce((s, i) => s + i.unitPrice * i.qty * (i.pct/100), 0);
  const vat = totalExecuted * 0.15;
  const due = totalExecuted + vat;
  const overallPct = totalContract > 0 ? ((totalExecuted/totalContract)*100).toFixed(1) : '0';

  document.getElementById('cert-preview').innerHTML = `
    <div class="card">
      <div style="padding:24px;background:linear-gradient(135deg,var(--bg-surface),var(--bg-card));border-radius:var(--radius-lg);border:1px solid var(--border-accent);">
        <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--accent-green);">
          <div style="font-size:11px;color:var(--accent-green);font-weight:700;letter-spacing:2px;">مستخلص دفعة رقم</div>
          <div style="font-size:32px;font-weight:900;color:var(--text-primary);">${certNum}</div>
          <div style="font-size:13px;color:var(--text-secondary);">عقد صيانة وإنشاء شبكات توزيع الطاقة — مدينة الرياض</div>
        </div>
        <div class="cert-meta">
          <div class="cert-meta-item">رقم أمر العمل<strong>${certWO}</strong></div>
          <div class="cert-meta-item">التاريخ<strong>${certDate}</strong></div>
          <div class="cert-meta-item">نسبة الإنجاز<strong style="color:var(--accent-gold)">${overallPct}%</strong></div>
          <div class="cert-meta-item">المقاول<strong>شركة الأساس العريض</strong></div>
          <div class="cert-meta-item">صاحب العمل<strong>SEC</strong></div>
          <div class="cert-meta-item">RFx<strong>4000083770</strong></div>
        </div>
        <div class="table-wrapper" style="margin-bottom:16px;">
          <table class="data-table">
            <thead><tr>
              <th>#</th><th>الرمز</th><th>الوصف</th><th>وحدة</th>
              <th>الكمية</th><th>السعر</th><th>الإجمالي</th><th>نسبة الإنجاز</th><th>القيمة المنفذة</th>
            </tr></thead>
            <tbody>
              ${certItems.map((item, i) => {
                const p = getItemByCode(item.code);
                const total = item.unitPrice * item.qty;
                const exec = total * (item.pct/100);
                return `<tr>
                  <td>${i+1}</td>
                  <td class="code-cell">${item.code}</td>
                  <td class="desc-cell">${p ? p.arDesc : '—'}</td>
                  <td><span class="uom-badge">${p ? p.uom : ''}</span></td>
                  <td>${item.qty}</td>
                  <td class="price-cell">${formatNum(item.unitPrice)}</td>
                  <td>${formatNum(total)}</td>
                  <td><div style="background:rgba(0,208,132,0.1);border-radius:99px;height:6px;width:80px;overflow:hidden;"><div style="height:100%;width:${item.pct}%;background:var(--accent-green);border-radius:99px;"></div></div> ${item.pct}%</td>
                  <td class="total-cell">${formatNum(exec)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border-accent);border-radius:var(--radius-lg);padding:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:var(--text-secondary)">قيمة الأعمال المنجزة</span>
            <span style="font-weight:700;color:var(--text-primary)">${formatNum(totalExecuted)} ر.س</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:var(--text-secondary)">ضريبة القيمة المضافة (15%)</span>
            <span style="font-weight:700;color:var(--accent-gold)">${formatNum(vat)} ر.س</span>
          </div>
          <div style="height:1px;background:var(--border);margin:12px 0;"></div>
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:16px;font-weight:800;color:var(--accent-green)">إجمالي المستخلص المستحق</span>
            <span style="font-size:22px;font-weight:900;color:var(--accent-green)">${formatNum(due)} ر.س</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:24px;text-align:center;">
          <div style="border-top:1px solid var(--border);padding-top:12px;color:var(--text-muted);font-size:12px;">توقيع المقاول<br><br>_______________</div>
          <div style="border-top:1px solid var(--border);padding-top:12px;color:var(--text-muted);font-size:12px;">توقيع المشرف<br><br>_______________</div>
          <div style="border-top:1px solid var(--border);padding-top:12px;color:var(--text-muted);font-size:12px;">ختم SEC<br><br>_______________</div>
        </div>
      </div>
    </div>
  `;
}

function printCertificate() {
  generateCertPreview();
  setTimeout(() => window.print(), 500);
}

// ═══════════════════════════════════════════════════
// SAVED BOQs
// ═══════════════════════════════════════════════════
function renderSaved(container) {
  const boqs = AppState.savedBOQs;
  if (!boqs.length) {
    container.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">💾</div><h3>لا توجد مقايسات محفوظة</h3><button class="btn btn-primary" onclick="navigateTo('boq')" style="margin-top:16px;">📋 إنشاء مقايسة جديدة</button></div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span>💾</span>
        <span class="card-title">المقايسات المحفوظة (${boqs.length})</span>
        <button class="btn btn-sm btn-danger" onclick="clearAllBOQs()">🗑️ حذف الكل</button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>رقم أمر العمل</th><th>المشروع</th><th>الموقع</th>
            <th>البنود</th><th>الإجمالي (ش.ض)</th><th>تاريخ الحفظ</th><th>إجراءات</th>
          </tr></thead>
          <tbody>
            ${boqs.map(b => {
              const total = b.items.reduce((s, i) => {
                const p = getItemByCode(i.code);
                return s + (i.customPrice || (p ? p.newPrice : 0)) * i.qty;
              }, 0);
              return `<tr>
                <td class="code-cell">${b.meta.woNumber || '—'}</td>
                <td>${b.meta.project || '—'}</td>
                <td style="font-size:11px;color:var(--text-secondary)">${b.meta.location || '—'}</td>
                <td>${b.items.length}</td>
                <td class="total-cell">${formatNum(total * 1.15)} ر.س</td>
                <td style="font-size:11px;color:var(--text-muted)">${b.savedAt ? new Date(b.savedAt).toLocaleDateString('ar-SA') : '—'}</td>
                <td style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="btn btn-sm btn-secondary" onclick="loadBOQ('${b.id}')">✏️ فتح</button>
                  <button class="btn btn-sm btn-gold" onclick="exportSaved('${b.id}')">📊 Excel</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteBOQ('${b.id}');renderSaved(document.getElementById('page-content'))">🗑️</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function clearAllBOQs() {
  if (!confirm('حذف جميع المقايسات المحفوظة نهائياً؟')) return;
  AppState.savedBOQs = [];
  Storage.save();
  renderSaved(document.getElementById('page-content'));
}

function exportSaved(id) {
  const boq = Storage.getBOQ(id);
  if (boq) exportToExcel(boq, boq.meta);
}

// ═══════════════════════════════════════════════════
// FULL PRICE LIST
// ═══════════════════════════════════════════════════
function renderPriceList(container) {
  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body">
        <div class="search-box" style="margin-bottom:12px;">
          <span class="search-icon">🔍</span>
          <input class="form-control" id="pl-search" placeholder="بحث في قائمة الأسعار الكاملة..." oninput="filterPriceList(this.value)" style="font-size:14px;padding:12px 44px 12px 14px;">
        </div>
        <div class="cat-pills">
          ${CATEGORIES.map(c => `<button class="cat-pill ${c.id === 'all' ? 'active' : ''}" data-cat="${c.id}" onclick="plFilterCat('${c.id}',this)">${c.label}</button>`).join('')}
        </div>
      </div>
    </div>
    <div id="pl-results"></div>
  `;
  renderPLResults(PRICE_LIST);
}

let plActiveCat = 'all', plQuery = '';
function plFilterCat(cat, btn) {
  plActiveCat = cat;
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  applyPLFilter();
}
function filterPriceList(q) { plQuery = q; applyPLFilter(); }
function applyPLFilter() {
  let items = searchItems(plQuery);
  if (plActiveCat !== 'all') items = items.filter(i => i.cat === plActiveCat);
  renderPLResults(items);
}

function renderPLResults(items) {
  const container = document.getElementById('pl-results');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>لا توجد نتائج</p></div>`;
    return;
  }

  const grouped = {};
  items.forEach(i => { if (!grouped[i.section]) grouped[i.section] = []; grouped[i.section].push(i); });

  container.innerHTML = Object.entries(grouped).map(([section, secItems]) => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <span>📁</span>
        <span class="card-title">${section}</span>
        <span style="font-size:11px;color:var(--text-muted);margin-right:auto;">${secItems.length} بند</span>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>الرمز</th><th>الوصف العربي</th><th>الوصف الإنجليزي</th>
            <th>وحدة</th><th>السعر الموحد</th><th>إضافة</th>
          </tr></thead>
          <tbody>
            ${secItems.map(item => {
              return `<tr>
                <td class="code-cell">${item.code}</td>
                <td class="desc-cell">${item.arDesc}</td>
                <td style="font-size:11px;color:var(--text-muted);">${item.enDesc}</td>
                <td><span class="uom-badge">${item.uom}</span></td>
                <td class="price-cell">${formatNum(item.newPrice)} <span style="font-size:10px;color:var(--text-muted)">ر.س</span></td>
                <td><button class="btn btn-sm btn-primary" onclick="addFromSearch('${item.code}')">➕</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════
// SUPPORT PAGE
// ═══════════════════════════════════════════════════
function renderSupport(container) {
  const isAr = I18N.currentLang === 'ar';

  container.innerHTML = `
    <!-- Header -->
    <div style="background:linear-gradient(135deg,var(--sec-dark),var(--bg-card));border:1px solid var(--sec-green-dim);border-radius:var(--radius-xl);padding:28px 32px;margin-bottom:24px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 50%,rgba(0,132,61,0.1),transparent 60%);pointer-events:none;"></div>
      <div style="display:flex;align-items:center;gap:20px;position:relative;">
        <div style="width:64px;height:64px;background:linear-gradient(135deg,var(--sec-green),var(--sec-green-2));border-radius:var(--radius-xl);display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 0 24px rgba(0,132,61,0.4);">📞</div>
        <div>
          <div style="font-size:11px;color:var(--sec-green);font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">${isAr ? 'تواصل معنا' : 'Contact Us'}</div>
          <h2 style="font-size:20px;font-weight:900;margin-bottom:4px;">${isAr ? 'الدعم الفني' : 'Technical Support'}</h2>
          <p style="font-size:12.5px;color:var(--text-secondary);">${isAr ? 'شركة الأساس العريض للمقاولات' : 'Al-Asas Al-Areed Contracting Company'}</p>
        </div>
      </div>
    </div>

    <div class="grid-2" style="align-items:start;">
      <!-- Contact Methods -->
      <div>
        <div class="support-card">
          <div class="card-header">
            <span>📬</span>
            <span class="card-title">${isAr ? 'وسائل التواصل' : 'Contact Methods'}</span>
          </div>

          <!-- Email -->
          <div class="contact-item">
            <div class="contact-icon" style="background:rgba(21,101,192,0.12);">✉️</div>
            <div class="contact-info">
              <div class="contact-label">${isAr ? 'البريد الإلكتروني' : 'Email'}</div>
              <div class="contact-value">asas.today2030@gmail.com</div>
            </div>
            <a href="mailto:asas.today2030@gmail.com" class="btn btn-secondary btn-sm">${isAr ? 'إرسال بريد' : 'Send Email'}</a>
          </div>

          <!-- WhatsApp -->
          <div class="contact-item">
            <div class="contact-icon" style="background:rgba(0,180,80,0.12);">💬</div>
            <div class="contact-info">
              <div class="contact-label">${isAr ? 'واتساب' : 'WhatsApp'}</div>
              <div class="contact-value" dir="ltr">+966 59 643 9721</div>
            </div>
            <a href="https://wa.me/966596439721" target="_blank" class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#25D366,#128C7E);">💬 ${isAr ? 'محادثة' : 'Chat'}</a>
          </div>

          <!-- Instagram -->
          <div class="contact-item">
            <div class="contact-icon" style="background:rgba(225,48,108,0.12);">📸</div>
            <div class="contact-info">
              <div class="contact-label">${isAr ? 'إنستغرام' : 'Instagram'}</div>
              <div class="contact-value" dir="ltr">@0596439721</div>
            </div>
            <a href="https://instagram.com/0596439721" target="_blank" class="btn btn-sm" style="background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);color:white;border:none;">📸 ${isAr ? 'تابع' : 'Follow'}</a>
          </div>

          <!-- Working Hours -->
          <div class="contact-item">
            <div class="contact-icon" style="background:rgba(200,168,75,0.12);">🕐</div>
            <div class="contact-info">
              <div class="contact-label">${isAr ? 'ساعات العمل' : 'Working Hours'}</div>
              <div class="contact-value" style="font-size:13px;">${isAr ? 'الأحد — الخميس: 8 ص — 5 م' : 'Sun — Thu: 8 AM — 5 PM'}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Company Info -->
      <div>
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><span>🏢</span><span class="card-title">${isAr ? 'معلومات الشركة' : 'Company Info'}</span></div>
          <div class="card-body">
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div style="padding:14px;background:var(--bg-surface);border-radius:var(--radius-md);border-right:3px solid var(--sec-green);">
                <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${isAr ? 'المقاول' : 'Contractor'}</div>
                <div style="font-size:14px;font-weight:700;">${isAr ? 'شركة الأساس العريض للمقاولات' : 'Al-Asas Al-Areed Contracting Co.'}</div>
              </div>
              <div style="padding:14px;background:var(--bg-surface);border-radius:var(--radius-md);border-right:3px solid var(--sec-gold);">
                <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${isAr ? 'صاحب العمل' : 'Client'}</div>
                <div style="font-size:14px;font-weight:700;">${isAr ? 'الشركة السعودية للكهرباء (SEC)' : 'Saudi Electricity Company (SEC)'}</div>
              </div>
              <div style="padding:14px;background:rgba(0,132,61,0.06);border-radius:var(--radius-md);border:1px solid var(--sec-green-dim);">
                <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${isAr ? 'رقم العقد' : 'Contract No.'}</div>
                <div style="font-size:16px;font-weight:800;color:var(--sec-green);">RFx 4000083770</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${isAr ? 'مدينة الرياض — الأسعار الموحدة النهائية' : 'Riyadh City — Final Unified Prices'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Expertise Badge -->
        <div class="card">
          <div class="card-body">
            <div style="text-align:center;padding:20px 10px;">
              <div style="font-size:52px;margin-bottom:12px;">🏆</div>
              <div style="font-size:28px;font-weight:900;color:var(--sec-gold);margin-bottom:4px;">30+</div>
              <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">${isAr ? 'عام من الخبرة' : 'Years of Experience'}</div>
              <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6;">${isAr ? 'في تسعير وإدارة مشاريع شبكات الطاقة الكهربائية<br>وعقود الصيانة مع الشركة السعودية للكهرباء' : 'In pricing & managing electrical power network projects<br>and maintenance contracts with Saudi Electricity Company'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Send Message -->
    <div class="card" style="margin-top:20px;">
      <div class="card-header"><span>💌</span><span class="card-title">${isAr ? 'إرسال رسالة سريعة عبر واتساب' : 'Quick Message via WhatsApp'}</span></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">${isAr ? 'موضوع الرسالة' : 'Message Subject'}</label>
          <input class="form-control" id="support-subject" placeholder="${isAr ? 'مثال: استفسار عن تسعير بند 304010101' : 'e.g. Inquiry about item 304010101 pricing'}">
        </div>
        <div class="form-group">
          <label class="form-label">${isAr ? 'تفاصيل الرسالة' : 'Message Details'}</label>
          <textarea class="form-control" id="support-msg" rows="4" placeholder="${isAr ? 'اكتب رسالتك هنا...' : 'Write your message here...'}"></textarea>
        </div>
        <button class="btn btn-primary" onclick="sendWhatsAppMessage()" style="background:linear-gradient(135deg,#25D366,#128C7E);">💬 ${isAr ? 'إرسال عبر واتساب' : 'Send via WhatsApp'}</button>
      </div>
    </div>
  `;
}

function sendWhatsAppMessage() {
  const subject = document.getElementById('support-subject')?.value || '';
  const msg = document.getElementById('support-msg')?.value || '';
  const text = encodeURIComponent(`*PRICEWISE-SEC — رسالة دعم فني*\n\nالموضوع: ${subject}\n\n${msg}\n\n_من نظام PRICEWISE-SEC | RFx 4000083770_`);
  window.open(`https://wa.me/966596439721?text=${text}`, '_blank');
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  Storage.load();

  // Nav items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });

  navigateTo('dashboard');
});
