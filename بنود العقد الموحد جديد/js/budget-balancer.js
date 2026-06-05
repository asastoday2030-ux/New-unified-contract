/**
 * PRICEWISE-SEC — Budget Balancer Module (محرك الموازنة العامة)
 * يحلل المقايسة الحالية ويقترح بنوداً لموازنة المواد والعمالة وضمان الاكتمال
 * Depends on: App (index.html), getItemByCode (price-list.js), checkDependencies (dependencies.js)
 */

const BudgetBalancer = {

  /**
   * تصنيف البنود حسب الفئة الرئيسية
   */
  _categorize(code) {
    const c = String(code);
    if (c.startsWith('1')) return 'civil';       // أعمال مدنية + حفريات
    if (c.startsWith('2')) return 'cable';        // كابلات وتمديدات
    if (c.startsWith('3')) return 'civil';        // أعمال ردم وأنابيب
    if (c.startsWith('4')) return 'equipment';    // معدات (محولات، لوحات)
    if (c.startsWith('5')) return 'overhead';     // خطوط هوائية
    if (c.startsWith('6')) return 'testing';      // اختبار وتشغيل
    if (c.startsWith('7')) return 'misc';         // متفرقات
    return 'misc';
  },

  /**
   * تقدير نسبة المواد vs العمالة لبند واحد
   */
  _itemRatio(code, arDesc) {
    const c = String(code);
    const desc = (arDesc || '').toLowerCase();

    // بنود التوريد فقط = مواد عالية
    if (desc.includes('توريد') && !desc.includes('تركيب') && !desc.includes('مد')) {
      return { material: 0.80, labor: 0.20 };
    }
    // بنود التركيب فقط = عمالة عالية
    if ((desc.includes('تركيب') || desc.includes('وصل') || desc.includes('تأريض')) && !desc.includes('توريد')) {
      return { material: 0.15, labor: 0.85 };
    }
    // كابلات توريد وتمديد = متوازنة
    if (c.startsWith('2') || desc.includes('كابل') || desc.includes('تمديد')) {
      return { material: 0.55, labor: 0.45 };
    }
    // حفريات وردم = عمالة عالية
    if (c.startsWith('1') || desc.includes('حفر') || desc.includes('ردم') || desc.includes('سفلتة')) {
      return { material: 0.20, labor: 0.80 };
    }
    // اختبارات = عمالة بحتة
    if (c.startsWith('6') || desc.includes('اختبار') || desc.includes('تشغيل')) {
      return { material: 0.05, labor: 0.95 };
    }
    // معدات = مواد عالية
    if (c.startsWith('4') || desc.includes('محول') || desc.includes('لوحة')) {
      return { material: 0.75, labor: 0.25 };
    }
    // افتراضي
    return { material: 0.45, labor: 0.55 };
  },

  /**
   * تحليل المقايسة الكاملة
   */
  analyze(boqItems) {
    if (!boqItems || boqItems.length === 0) return null;

    const isEmergency = typeof App !== 'undefined' && App.state?.boq?.isEmergency;
    const mult = isEmergency ? 1.9 : 1.0;

    let totalContract = 0;
    let totalMaterial = 0;
    let totalLabor = 0;
    let civilTotal = 0;
    let cableTotal = 0;
    let equipmentTotal = 0;
    let testingTotal = 0;

    const categorizedItems = boqItems.map(item => {
      const priceItem = typeof getItemByCode === 'function' ? getItemByCode(item.code) : null;
      const contractPrice = Math.round((item.customPrice || priceItem?.newPrice || 0) * mult);
      const lineTotal = contractPrice * (item.qty || 1);
      const ratio = this._itemRatio(item.code, priceItem?.arDesc || '');
      const cat = this._categorize(item.code);

      totalContract += lineTotal;
      totalMaterial += lineTotal * ratio.material;
      totalLabor += lineTotal * ratio.labor;

      if (cat === 'civil') civilTotal += lineTotal;
      else if (cat === 'cable') cableTotal += lineTotal;
      else if (cat === 'equipment') equipmentTotal += lineTotal;
      else if (cat === 'testing') testingTotal += lineTotal;

      return { ...item, priceItem, contractPrice, lineTotal, ratio, cat };
    });

    const materialPct = totalContract > 0 ? (totalMaterial / totalContract) * 100 : 0;
    const laborPct = totalContract > 0 ? (totalLabor / totalContract) * 100 : 0;

    // SEC ideal: 50-60% material, 40-50% labor
    const idealMaterial = 55;
    const idealLabor = 45;
    const materialBalance = materialPct - idealMaterial;   // +ve = too much material, -ve = need more
    const laborBalance = laborPct - idealLabor;

    // Generate balance status
    let status = 'balanced';
    let statusAr = 'متوازنة';
    let statusColor = 'var(--sec-primary)';

    if (Math.abs(materialBalance) > 20) {
      status = materialBalance > 0 ? 'heavy-material' : 'heavy-labor';
      statusAr = materialBalance > 0 ? 'ثقل في المواد' : 'ثقل في العمالة';
      statusColor = 'var(--accent-red)';
    } else if (Math.abs(materialBalance) > 10) {
      status = 'slight-imbalance';
      statusAr = 'خلل طفيف في الموازنة';
      statusColor = 'var(--accent-gold)';
    }

    // Run dependencies check
    const depResults = typeof checkDependencies === 'function'
      ? checkDependencies(boqItems.map(i => ({ code: i.code, qty: i.qty, customPrice: null })))
      : { missing: [], warnings: [] };

    // Calculate readiness score
    const missingCount = depResults.missing.length;
    let score = 100;
    score -= missingCount * 12;
    score -= Math.min(Math.abs(materialBalance - 0) * 0.8, 25);
    if (testingTotal === 0 && totalContract > 10000) score -= 10;
    if (civilTotal === 0 && cableTotal > 0) score -= 8;
    score = Math.max(0, Math.round(score));

    // Phase suggestions (missing civil/testing)
    const suggestions = this._generateSuggestions(categorizedItems, depResults, totalContract);

    return {
      totalContract,
      totalMaterial: Math.round(totalMaterial),
      totalLabor: Math.round(totalLabor),
      materialPct: Math.round(materialPct * 10) / 10,
      laborPct: Math.round(laborPct * 10) / 10,
      idealMaterial,
      idealLabor,
      materialBalance: Math.round(materialBalance * 10) / 10,
      laborBalance: Math.round(laborBalance * 10) / 10,
      status,
      statusAr,
      statusColor,
      civilTotal: Math.round(civilTotal),
      cableTotal: Math.round(cableTotal),
      equipmentTotal: Math.round(equipmentTotal),
      testingTotal: Math.round(testingTotal),
      depResults,
      readinessScore: score,
      suggestions,
      categorizedItems
    };
  },

  /**
   * توليد الاقتراحات لموازنة المقايسة
   */
  _generateSuggestions(categorizedItems, depResults, totalContract) {
    const suggestions = [];
    const presentCodes = new Set(categorizedItems.map(i => i.code));
    const isEmergency = typeof App !== 'undefined' && App.state?.boq?.isEmergency;
    const mult = isEmergency ? 1.9 : 1.0;

    const addSug = (code, reason, priority = 'medium', suggestedQty = 1) => {
      if (presentCodes.has(code)) return;
      const pi = typeof getItemByCode === 'function' ? getItemByCode(code) : null;
      if (!pi) return;
      presentCodes.add(code); // prevent duplicates
      suggestions.push({ code, arDesc: pi.arDesc, enDesc: pi.enDesc, uom: pi.uom, price: Math.round(pi.newPrice * mult), reason, priority, suggestedQty });
    };

    const hasCables = categorizedItems.some(i => i.cat === 'cable');
    const hasCivil = categorizedItems.some(i => i.cat === 'civil');
    const hasEquipment = categorizedItems.some(i => i.cat === 'equipment');
    const hasTesting = categorizedItems.some(i => i.cat === 'testing');
    const hasCodes = (prefix) => categorizedItems.some(i => String(i.code).startsWith(prefix));

    // 1. كابلات بدون حفريات = خطر
    if (hasCables && !hasCivil) {
      addSug('301030101', '⚠️ كابلات تمديد بدون أعمال حفريات — يجب إضافة بند الحفر لاكتمال المقايسة', 'critical', 1);
      addSug('301030301', 'إعادة السفلتة والتبليط مطلوبة بعد الحفر لشروط البلدية', 'high', 1);
      addSug('305010101', 'شريط تحذيري لحماية الكابل من الحفريات المستقبلية', 'medium', 1);
    }

    // 2. بنود كابلات بدون وصلات
    if (hasCodes('2') && !hasCodes('304')) {
      addSug('304010101', 'نهايات الكابلات الخارجية مطلوبة لإتمام الدائرة الكهربائية', 'high', 1);
    }

    // 3. معدات بدون تأريض
    if (hasEquipment && !hasCodes('303')) {
      addSug('303010101', '⚠️ معدات كهربائية بدون منظومة تأريض — خطر سلامة عالي', 'critical', 1);
    }

    // 4. معدات بدون قواعد خرسانية
    if (hasEquipment && !hasCodes('301040')) {
      addSug('301040101', 'قواعد خرسانية مسلحة مطلوبة لحمل المعدات الثقيلة', 'high', 1);
    }

    // 5. لا يوجد اختبار تشغيل
    if ((hasCables || hasEquipment) && !hasTesting && totalContract > 15000) {
      addSug('601010101', '⚠️ لا يوجد بند اختبار شبكة — شرط إلزامي لتسليم المشروع لـ SEC', 'critical', 1);
    }

    // 6. تحذيرات من engine التبعيات
    depResults.missing.forEach(m => {
      m.missingCodes.forEach(code => {
        addSug(code, m.reason + ' (من فحص التبعيات التلقائي)', 'high', m.suggestedQty === 'same' ? 1 : (parseFloat(m.suggestedQty) || 1));
      });
    });

    return suggestions.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] || 2) - (order[b.priority] || 2);
    });
  },

  /**
   * حساب درجة جاهزية المقايسة مع لون + نص
   */
  getReadinessLabel(score) {
    if (score >= 90) return { label: 'ممتاز — جاهز للتقديم', color: 'var(--sec-primary)', icon: '✅' };
    if (score >= 75) return { label: 'جيد — يحتاج تحسينات طفيفة', color: 'var(--sec-gold)', icon: '🟡' };
    if (score >= 55) return { label: 'متوسط — توجد ثغرات مهمة', color: '#FF9800', icon: '⚠️' };
    return { label: 'ضعيف — المقايسة تحتاج مراجعة جوهرية', color: 'var(--accent-red)', icon: '🔴' };
  },

  /**
   * عرض النافذة المنبثقة لتقرير الموازنة
   */
  renderModal(analysis) {
    // Store suggestions for retrieval on apply
    this._lastSuggestions = analysis.suggestions || [];
    this._lastAnalysis = analysis;

    const ar = typeof App !== 'undefined' && App.lang === 'ar';
    const { totalContract, totalMaterial, totalLabor, materialPct, laborPct,
            idealMaterial, idealLabor, statusAr, statusColor,
            civilTotal, cableTotal, equipmentTotal, testingTotal,
            readinessScore, suggestions, depResults } = analysis;

    const readiness = this.getReadinessLabel(readinessScore);
    const fmt = (v) => typeof fmtNum === 'function' ? fmtNum(v) : Number(v).toLocaleString('ar-SA');

    // Remove old modal if exists
    const existing = document.getElementById('budget-balancer-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'budget-balancer-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-start;justify-content:center;
      background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);padding:20px 12px;overflow-y:auto;
    `;

    modal.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border-sec);border-radius:var(--r-xl);
                  width:100%;max-width:820px;box-shadow:0 24px 80px rgba(0,0,0,0.5);margin:auto;animation:pageFade 0.25s ease;">

        <!-- Modal Header -->
        <div style="background:linear-gradient(135deg,rgba(0,132,61,0.08),transparent);border-bottom:1px solid var(--border);
                    padding:18px 22px;display:flex;align-items:center;gap:12px;border-radius:var(--r-xl) var(--r-xl) 0 0;">
          <div style="width:44px;height:44px;background:rgba(0,132,61,0.15);border-radius:var(--r-lg);display:flex;align-items:center;justify-content:center;font-size:22px;">⚖️</div>
          <div>
            <h3 style="font-size:16px;font-weight:900;color:var(--text-h);margin:0 0 2px;">تقرير الموازنة العامة وجاهزية المقايسة</h3>
            <p style="font-size:11.5px;color:var(--text-sub);margin:0;">Budget Balance Analyzer & BOQ Readiness Report</p>
          </div>
          <button onclick="document.getElementById('budget-balancer-modal').remove()" 
                  style="margin-right:auto;background:rgba(255,71,87,0.1);border:1px solid rgba(255,71,87,0.2);color:var(--accent-red);
                         border-radius:var(--r-md);padding:6px 14px;font-size:12px;cursor:pointer;font-weight:700;">✕ إغلاق</button>
        </div>

        <div style="padding:20px;">

          <!-- Readiness Score Row -->
          <div style="background:linear-gradient(135deg,rgba(0,132,61,0.05),var(--bg-surface));border:1px solid var(--border-sec);
                      border-radius:var(--r-lg);padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
            <div style="text-align:center;min-width:90px;">
              <div style="font-size:38px;font-weight:900;color:${readiness.color};line-height:1;">${readinessScore}</div>
              <div style="font-size:10.5px;color:var(--text-muted);font-weight:700;">/ 100</div>
            </div>
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:800;color:var(--text-h);margin-bottom:4px;">${readiness.icon} ${readiness.label}</div>
              <div style="background:var(--bg-surface);border-radius:99px;height:10px;overflow:hidden;border:1px solid var(--border);margin-top:6px;">
                <div style="height:100%;width:${readinessScore}%;background:linear-gradient(90deg,${readinessScore < 55 ? 'var(--accent-red)' : readinessScore < 75 ? 'var(--accent-gold)' : 'var(--sec-primary)'},transparent);border-radius:99px;transition:width 0.8s ease;"></div>
              </div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:12px;color:${statusColor};font-weight:800;background:${statusColor}18;padding:6px 14px;border-radius:99px;border:1px solid ${statusColor}30;">${statusAr}</div>
            </div>
          </div>

          <!-- Stats Grid -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
            <div class="stat-card" style="border-color:var(--border-sec);">
              <div class="stat-icon g">💰</div>
              <div class="stat-val num">${fmt(totalContract)}</div>
              <div class="stat-lbl">قيمة المقايسة الكلية (ر.س)</div>
            </div>
            <div class="stat-card" style="border-color:rgba(0,181,184,0.3);">
              <div class="stat-icon" style="color:#00B5B8">🏗️</div>
              <div class="stat-val num">${materialPct}%</div>
              <div class="stat-lbl">نسبة المواد الهندسية<br><small style="color:var(--text-muted)">المثالي: ${idealMaterial}%</small></div>
            </div>
            <div class="stat-card" style="border-color:rgba(200,168,75,0.3);">
              <div class="stat-icon" style="color:var(--sec-gold)">👷</div>
              <div class="stat-val num">${laborPct}%</div>
              <div class="stat-lbl">نسبة العمالة والتركيب<br><small style="color:var(--text-muted)">المثالي: ${idealLabor}%</small></div>
            </div>
            <div class="stat-card" style="border-color:${depResults.missing.length > 0 ? 'rgba(255,71,87,0.3)' : 'var(--border-sec)'};">
              <div class="stat-icon" style="color:${depResults.missing.length > 0 ? 'var(--accent-red)' : 'var(--sec-primary)'}">🛡️</div>
              <div class="stat-val num" style="color:${depResults.missing.length > 0 ? 'var(--accent-red)' : 'var(--sec-primary)'}">${depResults.missing.length}</div>
              <div class="stat-lbl">بنود ناقصة حرجة</div>
            </div>
          </div>

          <!-- Category Breakdown -->
          <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:14px;margin-bottom:16px;">
            <div style="font-size:12.5px;font-weight:800;color:var(--text-h);margin-bottom:10px;">📊 توزيع قيمة المقايسة حسب القسم</div>
            ${this._renderCategoryBar('أعمال مدنية وحفريات', civilTotal, totalContract, '#FF9800')}
            ${this._renderCategoryBar('الكابلات والتمديدات', cableTotal, totalContract, 'var(--sec-primary)')}
            ${this._renderCategoryBar('المعدات والمحولات', equipmentTotal, totalContract, '#00B5B8')}
            ${this._renderCategoryBar('الاختبار والتشغيل', testingTotal, totalContract, 'var(--sec-gold)')}
          </div>

          <!-- Material vs Labor Balance Visual -->
          <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:14px;margin-bottom:16px;">
            <div style="font-size:12.5px;font-weight:800;color:var(--text-h);margin-bottom:8px;">⚖️ موازنة المواد مقابل العمالة</div>
            <div style="position:relative;border-radius:99px;height:22px;overflow:hidden;background:var(--bg-card);border:1px solid var(--border);">
              <div style="position:absolute;top:0;right:0;height:100%;width:${Math.min(materialPct, 100)}%;background:linear-gradient(90deg,#00B5B8,#007B87);border-radius:99px 0 0 99px;transition:width 0.8s ease;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-muted);margin-top:4px;">
              <span>مواد: <strong style="color:#00B5B8">${materialPct}%</strong> (${fmt(totalMaterial)} ر.س)</span>
              <span>عمالة: <strong style="color:var(--sec-gold)">${laborPct}%</strong> (${fmt(totalLabor)} ر.س)</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px;opacity:0.7;">
              <span>الحد المثالي: ${idealMaterial}% مواد</span>
              <span>${idealLabor}% عمالة</span>
            </div>
          </div>

          <!-- Suggestions -->
          ${suggestions.length > 0 ? `
            <div style="border:1px solid var(--border-gold);border-radius:var(--r-lg);overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(90deg,rgba(200,168,75,0.08),transparent);padding:12px 16px;border-bottom:1px solid var(--border-gold);display:flex;align-items:center;gap:8px;">
                <span>🔧</span>
                <span style="font-size:13px;font-weight:800;color:var(--sec-gold);">الاقتراحات لتحسين الموازنة والاكتمال (${suggestions.length})</span>
              </div>
              <div style="padding:12px;display:flex;flex-direction:column;gap:8px;" id="balance-suggestions-list">
                ${suggestions.map((sug, idx) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 14px;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                      <input type="checkbox" id="bal-sug-${idx}" checked style="width:15px;height:15px;accent-color:var(--sec-primary);flex-shrink:0;">
                      <div>
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                          <span style="font-family:var(--font-mono);font-size:10px;background:rgba(200,168,75,0.1);color:var(--sec-gold);padding:1px 5px;border-radius:3px;">${sug.code}</span>
                          <span style="font-size:12.5px;font-weight:700;color:var(--text-h);">${sug.arDesc}</span>
                        </div>
                        <div style="font-size:10.5px;color:var(--text-sub);">${sug.reason}</div>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                      <div style="text-align:center;">
                        <div style="font-size:10px;color:var(--text-muted)">كمية</div>
                        <input type="number" min="0.01" step="0.01" value="${sug.suggestedQty}" id="bal-qty-${idx}"
                          style="width:65px;text-align:center;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg-surface);color:var(--text-main);">
                      </div>
                      <div>
                        <span style="font-size:11.5px;color:var(--sec-primary);font-weight:800;">${typeof fmtNum === 'function' ? fmtNum(sug.price) : sug.price.toFixed(2)} ر.س</span>
                        <div style="font-size:10px;color:var(--text-muted);">${sug.uom}</div>
                      </div>
                      <span class="badge badge-${sug.priority === 'critical' ? 'critical' : sug.priority === 'high' ? 'critical' : 'medium'}"
                            style="font-size:10px;">${sug.priority === 'critical' ? '🔴 حرج' : sug.priority === 'high' ? '🟠 مهم' : '🟡 مقترح'}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
              <div style="padding:12px 16px;background:rgba(0,132,61,0.03);border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;">
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('budget-balancer-modal').remove()" style="font-size:12px;">
                  ✕ إغلاق بدون إضافة
                </button>
                <button class="btn btn-primary" onclick="BudgetBalancer.applySelectedSuggestions()" style="font-size:12px;font-weight:900;">
                  ✅ إضافة البنود المحددة للمقايسة
                </button>
              </div>
            </div>
          ` : `
            <div style="text-align:center;padding:20px;background:rgba(0,132,61,0.05);border:1px solid var(--border-sec);border-radius:var(--r-lg);margin-bottom:16px;">
              <div style="font-size:28px;margin-bottom:6px;">✅</div>
              <p style="font-size:13px;color:var(--sec-primary);font-weight:700;">المقايسة متكاملة — لا توجد اقتراحات جوهرية</p>
            </div>
          `}

          <!-- Close Button bottom -->
          ${suggestions.length === 0 ? `
            <div style="text-align:center;">
              <button class="btn btn-primary" onclick="document.getElementById('budget-balancer-modal').remove()" style="font-size:13px;padding:10px 28px;">
                ✓ إغلاق التقرير
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    // Close on backdrop click
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  },

  _renderCategoryBar(label, value, total, color) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    const fmt = (v) => typeof fmtNum === 'function' ? fmtNum(v) : Number(v).toLocaleString('ar-SA');
    return `
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
          <span style="color:var(--text-sub);">${label}</span>
          <span style="font-weight:700;color:var(--text-main);">${pct}% — ${fmt(value)} ر.س</span>
        </div>
        <div style="background:var(--bg-card);border-radius:99px;height:7px;overflow:hidden;border:1px solid var(--border);">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width 0.8s ease;"></div>
        </div>
      </div>
    `;
  },

  /**
   * تطبيق الاقتراحات المحددة على المقايسة
   */
  applySelectedSuggestions() {
    const modal = document.getElementById('budget-balancer-modal');
    const ar = typeof App !== 'undefined' && App.lang === 'ar';
    const suggestions = this._lastSuggestions || [];
    let added = 0;

    suggestions.forEach((sug, idx) => {
      const chk = document.getElementById(`bal-sug-${idx}`);
      if (chk && chk.checked) {
        const qtyInput = document.getElementById(`bal-qty-${idx}`);
        const qty = qtyInput ? (parseFloat(qtyInput.value) || 1) : 1;
        if (sug.code && typeof App !== 'undefined') {
          App.state.boq.items.push({
            code: sug.code,
            qty,
            customPrice: null,
            note: ar ? '⚖️ مضاف من موازن الميزانية' : '⚖️ Added by Budget Balancer'
          });
          added++;
        }
      }
    });

    if (modal) modal.remove();
    if (added > 0) {
      if (typeof App !== 'undefined' && typeof App._renderBOQTable === 'function') App._renderBOQTable();
      if (typeof showToast === 'function') showToast(`✅ ${ar ? `تمت إضافة ${added} بنود من الاقتراحات للمقايسة!` : `Added ${added} suggested items to BOQ!`}`, 'success');
      if (typeof BOQImporter !== 'undefined') BOQImporter.saveSession();
    } else {
      if (typeof showToast === 'function') showToast(ar ? 'لم يتم تحديد أي بند' : 'No items selected', 'warning');
    }
  },

  /**
   * الدالة الرئيسية: تحليل وعرض النافذة مباشرة
   */
  run() {
    if (typeof App === 'undefined') return;
    const ar = App.lang === 'ar';
    const items = App.state?.boq?.items || [];
    if (items.length === 0) {
      if (typeof showToast === 'function') showToast(ar ? 'أضف بنوداً في المقايسة أولاً' : 'Add BOQ items first', 'warning');
      return;
    }
    const analysis = this.analyze(items);
    if (!analysis) return;
    this.renderModal(analysis);
  }
};

// Expose globally
if (typeof window !== 'undefined') {
  window.BudgetBalancer = BudgetBalancer;
}
