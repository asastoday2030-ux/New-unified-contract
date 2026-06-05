/**
 * PRICEWISE-SEC — BOQ Importer Module
 * يتيح استيراد ملفات المقايسات PDF / Excel / CSV / JSON مباشرة في منشئ المقايسات
 * Depends on: PDFAnalyzer (pdf-analyzer.js), App (index.html)
 */

const BOQImporter = {

  _importedItems: [],

  /**
   * رسم منطقة الاستيراد في صفحة منشئ المقايسات
   */
  renderImportCard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const ar = typeof App !== 'undefined' && App.lang === 'ar';

    container.innerHTML = `
      <div class="card boq-import-card" style="border:1px solid var(--border-sec);background:linear-gradient(135deg,rgba(0,132,61,0.03),var(--bg-card));margin-bottom:18px;">
        <div class="card-head" style="background:linear-gradient(90deg,rgba(0,132,61,0.06),transparent);border-bottom:1px solid var(--border);">
          <span style="font-size:16px;">📥</span>
          <span class="card-title" style="font-weight:900;color:var(--text-h);">
            ${ar ? 'استيراد مقايسة موجودة (PDF / Excel / CSV / JSON)' : 'Import Existing BOQ (PDF / Excel / CSV / JSON)'}
          </span>
          <button class="btn btn-outline btn-sm" id="boq-import-toggle" onclick="BOQImporter.togglePanel()" style="margin-right:auto;font-size:11px;padding:4px 10px;">
            ▼ ${ar ? 'توسيع / طي' : 'Expand / Collapse'}
          </button>
        </div>
        <div id="boq-import-panel" style="display:none;">
          <div class="card-body" style="padding:16px;">
            <!-- Drop Zone -->
            <div class="boq-import-dropzone" id="boq-import-dropzone" onclick="document.getElementById('boq-import-file-input').click()">
              <input type="file" id="boq-import-file-input" accept=".pdf,.xlsx,.xls,.csv,.json" style="display:none" onchange="BOQImporter.handleFile(this.files[0])">
              <div style="font-size:36px;margin-bottom:8px;">📂</div>
              <div style="font-size:14px;font-weight:700;color:var(--text-h);margin-bottom:4px;">
                ${ar ? 'اسحب ملف المقايسة هنا أو انقر للاستعراض' : 'Drag BOQ file here or click to browse'}
              </div>
              <div style="font-size:11.5px;color:var(--text-sub);">
                ${ar ? 'يدعم: PDF، Excel (.xlsx/.xls)، CSV، JSON (Odoo ERP)' : 'Supports: PDF, Excel (.xlsx/.xls), CSV, JSON (Odoo ERP)'}
              </div>
              <div style="display:flex;justify-content:center;gap:6px;margin-top:12px;flex-wrap:wrap;">
                <span class="boq-import-badge pdf">PDF</span>
                <span class="boq-import-badge xlsx">XLSX/XLS</span>
                <span class="boq-import-badge csv">CSV</span>
                <span class="boq-import-badge json">JSON/Odoo</span>
              </div>
            </div>

            <!-- Progress Bar -->
            <div id="boq-import-progress" style="display:none;margin-top:12px;">
              <div style="font-size:12px;color:var(--text-sub);margin-bottom:6px;" id="boq-import-progress-label">جاري تحليل الملف...</div>
              <div style="background:var(--bg-surface);border-radius:99px;height:7px;overflow:hidden;border:1px solid var(--border);">
                <div id="boq-import-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--sec-primary),var(--sec-gold));border-radius:99px;transition:width 0.4s ease;"></div>
              </div>
            </div>

            <!-- Preview Area -->
            <div id="boq-import-preview" style="display:none;margin-top:16px;"></div>
          </div>
        </div>
      </div>
    `;

    // Drag & drop handlers
    const dz = document.getElementById('boq-import-dropzone');
    if (dz) {
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('dragover');
        BOQImporter.handleFile(e.dataTransfer.files[0]);
      });
    }
  },

  togglePanel() {
    const panel = document.getElementById('boq-import-panel');
    const btn = document.getElementById('boq-import-toggle');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (btn) btn.textContent = (isOpen ? '▼ ' : '▲ ') + (typeof App !== 'undefined' && App.lang === 'ar' ? 'توسيع / طي' : 'Expand / Collapse');
  },

  /**
   * معالجة الملف المرفوع
   */
  async handleFile(file) {
    if (!file) return;
    const ar = typeof App !== 'undefined' && App.lang === 'ar';

    const progressDiv = document.getElementById('boq-import-progress');
    const progressBar = document.getElementById('boq-import-progress-bar');
    const progressLabel = document.getElementById('boq-import-progress-label');
    const previewDiv = document.getElementById('boq-import-preview');

    if (progressDiv) progressDiv.style.display = 'block';
    if (previewDiv) previewDiv.style.display = 'none';

    const updateProgress = (stage, pct) => {
      if (progressBar) progressBar.style.width = pct + '%';
      const labels = {
        extracting: ar ? 'جاري قراءة واستيراد الملف...' : 'Reading file...',
        parsing: ar ? 'جاري تحليل وتصفية البنود...' : 'Parsing items...',
        pricing: ar ? 'جاري مطابقة الأسعار مع قائمة SEC...' : 'Matching SEC prices...',
        dependencies: ar ? 'جاري فحص التبعيات...' : 'Checking dependencies...',
        done: ar ? 'اكتمل التحليل!' : 'Analysis complete!'
      };
      if (progressLabel) progressLabel.textContent = labels[stage] || (ar ? 'جاري التحليل...' : 'Analyzing...');
    };

    try {
      if (typeof PDFAnalyzer === 'undefined') {
        throw new Error('مكتبة التحليل غير محملة. يرجى التأكد من تحميل pdf-analyzer.js');
      }
      const results = await PDFAnalyzer.analyzeFile(file, updateProgress);
      this._importedItems = results.foundItems || [];

      setTimeout(() => {
        if (progressDiv) progressDiv.style.display = 'none';
        if (previewDiv) {
          previewDiv.style.display = 'block';
          this.renderPreview(results, previewDiv);
        }
      }, 400);

    } catch (err) {
      if (progressDiv) progressDiv.style.display = 'none';
      if (typeof showToast === 'function') showToast((ar ? 'خطأ في تحليل الملف: ' : 'File analysis error: ') + err.message, 'error');
      console.error('BOQ Import error:', err);
    }
  },

  /**
   * عرض معاينة البنود قبل الاستيراد
   */
  renderPreview(results, container) {
    const { fileName, fileType, foundItems, totalContract } = results;
    const ar = typeof App !== 'undefined' && App.lang === 'ar';
    const items = foundItems || [];
    const isEmerg = typeof App !== 'undefined' && !!App.state?.boq?.isEmergency;
    const mult = isEmerg ? 1.9 : 1.0;
    const adjustedTotal = totalContract * mult;

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:20px;background:var(--bg-surface);border:1px dashed var(--border);border-radius:var(--r-lg);">
          <div style="font-size:32px;margin-bottom:8px;">🔍</div>
          <p style="font-size:13px;color:var(--text-sub);">${ar ? 'لم يتم العثور على بنود مطابقة في الملف. تأكد أن الملف يحتوي على أكواد العقد الموحد (9 أرقام).' : 'No matching SEC items found in the file.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--border-sec);border-radius:var(--r-lg);padding:14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <div>
            <span style="font-size:13px;font-weight:800;color:var(--text-h);">📂 ${fileName}</span>
            <span style="font-size:10.5px;color:var(--text-sub);margin-right:8px;">| ${fileType.toUpperCase()}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span style="background:rgba(0,132,61,0.12);color:var(--sec-primary);padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;">
              ${items.length} ${ar ? 'بند مكتشف' : 'items found'}
            </span>
            <span style="background:rgba(200,168,75,0.12);color:var(--sec-gold);padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;">
              ${typeof formatNum === 'function' ? formatNum(adjustedTotal) : adjustedTotal.toFixed(2)} ${ar ? 'ر.س' : 'SAR'}
            </span>
          </div>
        </div>

        <!-- Items Preview Table -->
        <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-md);">
          <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
            <thead>
              <tr style="background:rgba(0,132,61,0.07);position:sticky;top:0;">
                <th style="padding:8px 10px;text-align:right;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);">
                  <input type="checkbox" id="boq-import-select-all" checked onclick="BOQImporter.toggleSelectAll(this.checked)" style="accent-color:var(--sec-primary);">
                </th>
                <th style="padding:8px 10px;text-align:right;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);">${ar ? 'الكود' : 'Code'}</th>
                <th style="padding:8px 10px;text-align:right;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);">${ar ? 'الوصف' : 'Description'}</th>
                <th style="padding:8px 10px;text-align:center;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);">${ar ? 'الكمية' : 'Qty'}</th>
                <th style="padding:8px 10px;text-align:center;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);">${ar ? 'الوحدة' : 'UOM'}</th>
                <th style="padding:8px 10px;text-align:left;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);">${ar ? 'سعر الوحدة' : 'Unit Price'}</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((itm, idx) => `
                <tr style="border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background='rgba(0,132,61,0.04)'" onmouseout="this.style.background=''">
                  <td style="padding:7px 10px;text-align:right;">
                    <input type="checkbox" class="boq-import-item-chk" data-idx="${idx}" checked style="accent-color:var(--sec-primary);">
                  </td>
                  <td style="padding:7px 10px;font-family:var(--font-mono);font-size:10.5px;color:var(--sec-primary);font-weight:700;">${itm.code}</td>
                  <td style="padding:7px 10px;color:var(--text-main);max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${itm.priceItem?.arDesc || ''}">${(itm.priceItem?.arDesc || '').slice(0, 50)}${(itm.priceItem?.arDesc || '').length > 50 ? '...' : ''}</td>
                  <td style="padding:7px 10px;text-align:center;font-weight:700;color:var(--text-main);">${itm.qty}</td>
                  <td style="padding:7px 10px;text-align:center;color:var(--text-sub);font-size:10.5px;">${itm.priceItem?.uom || '-'}</td>
                  <td style="padding:7px 10px;text-align:left;font-weight:700;color:var(--sec-primary);">${typeof fmtNum === 'function' ? fmtNum(itm.contractPrice * mult) : (itm.contractPrice * mult).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="BOQImporter.cancelImport()" style="font-size:12px;">
            ✕ ${ar ? 'إلغاء' : 'Cancel'}
          </button>
          <button class="btn btn-outline btn-sm" onclick="BOQImporter.importSelected(false)" style="font-size:12px;border-color:var(--sec-gold);color:var(--sec-gold);">
            📥 ${ar ? 'استيراد المحدد فقط' : 'Import Selected Only'}
          </button>
          <button class="btn btn-primary" onclick="BOQImporter.importSelected(true)" style="font-size:12px;font-weight:900;">
            ✅ ${ar ? 'استيراد الكل وإضافة للمقايسة' : 'Import All to BOQ'}
          </button>
        </div>
      </div>
    `;
  },

  toggleSelectAll(checked) {
    document.querySelectorAll('.boq-import-item-chk').forEach(chk => chk.checked = checked);
  },

  /**
   * استيراد البنود المحددة إلى App.state.boq
   */
  importSelected(all) {
    const ar = typeof App !== 'undefined' && App.lang === 'ar';
    const items = this._importedItems;
    if (!items || items.length === 0) return;

    let toImport = [];
    if (all) {
      toImport = items;
    } else {
      document.querySelectorAll('.boq-import-item-chk').forEach((chk, idx) => {
        if (chk.checked && items[idx]) toImport.push(items[idx]);
      });
    }

    if (toImport.length === 0) {
      if (typeof showToast === 'function') showToast(ar ? 'لم يتم تحديد أي بند' : 'No items selected', 'warning');
      return;
    }

    if (typeof App !== 'undefined') {
      const boqItems = toImport.map(i => ({
        code: i.code,
        qty: i.qty || 1,
        customPrice: null,
        note: ar ? '📥 مستورد من ملف' : '📥 Imported from file'
      }));
      App.state.boq.items = [...App.state.boq.items, ...boqItems];
      // Trigger re-render
      if (typeof App._renderBOQTable === 'function') App._renderBOQTable();
      // Hide import panel
      const panel = document.getElementById('boq-import-panel');
      const preview = document.getElementById('boq-import-preview');
      if (preview) preview.style.display = 'none';
      if (panel) panel.style.display = 'none';
      if (typeof showToast === 'function') showToast(`📥 ${ar ? `تمت إضافة ${toImport.length} بند للمقايسة بنجاح!` : `Successfully added ${toImport.length} items to BOQ!`}`, 'success');
      // Auto-save session
      BOQImporter.saveSession();
    }
  },

  cancelImport() {
    const preview = document.getElementById('boq-import-preview');
    if (preview) preview.style.display = 'none';
    this._importedItems = [];
  },

  _getSessionKey() {
    if (typeof App !== 'undefined' && App.state?.boq?.isEmergency) {
      return 'boq_session_cache_emergency';
    }
    return 'boq_session_cache_normal';
  },

  /**
   * حفظ جلسة المقايسة في sessionStorage
   */
  saveSession() {
    try {
      if (typeof App !== 'undefined' && App.state?.boq) {
        const sessionData = {
          items: App.state.boq.items,
          meta: App.state.boq.meta,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(this._getSessionKey(), JSON.stringify(sessionData));
      }
    } catch (e) { /* ignore quota errors */ }
  },

  /**
   * استعادة جلسة المقايسة من sessionStorage
   */
  restoreSession() {
    try {
      const raw = localStorage.getItem(this._getSessionKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  },

  clearSession() {
    localStorage.removeItem(this._getSessionKey());
  }
};

// Auto-save every 45 seconds when BOQ has items
setInterval(() => {
  if (typeof App !== 'undefined' && App.state?.boq?.items?.length > 0) {
    BOQImporter.saveSession();
    const badge = document.getElementById('boq-autosave-badge');
    if (badge) {
      badge.style.opacity = '1';
      setTimeout(() => { badge.style.opacity = '0'; }, 2000);
    }
  }
}, 45000);
