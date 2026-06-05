/**
 * العقد الموحد الجديد — أدوات التصدير الفاخرة
 * Enhanced Multi-Sheet Excel & PDF Export Engine — RFx 4000083770
 * v4.1 — Includes Emergency SAP (190%) calculation rates, Productivity Analysis, Crew Loading, and Compliance matrices.
 */

const VAT_RATE = 0.15;

// ─── Number formatter (internal) ─────────────────────────────────
function _fmt(n) {
  return Math.round(Number(n || 0)).toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ═══════════════════════════════════════════════════
// تصدير Excel المتعدد الأوراق
// ═══════════════════════════════════════════════════
function exportToExcel(boqData, meta) {
  meta = meta || {};
  const W = window.XLSX;
  if (!W) { alert('مكتبة Excel غير محملة. تحقق من الاتصال بالإنترنت.'); return; }

  const wb = W.utils.book_new();

  // -----------------------------------------------------------------
  // الورقة 1: المقايسة (BOQ Sheet)
  // -----------------------------------------------------------------
  const isEmergency = !!boqData.isEmergency;
  const mult = isEmergency ? 1.9 : 1.0;
  const wsData = [];
  wsData.push(['العقد الموحد الجديد — قائمة الأعمال والمقايسة الأساسية' + (isEmergency ? ' (طوارئ SAP)' : ''), '', '', '', '', '', '', '']);
  wsData.push(['العقد: RFx 4000083770 | المقاول: شركة الأساس العريض | صاحب العمل: الشركة السعودية للكهرباء' + (isEmergency ? ' | نظام حساب الطوارئ 190%' : '')]);
  wsData.push([`المشروع: ${meta.project || 'مشروع شبكات توزيع الطاقة'}`, '', '', `التاريخ: ${meta.date || new Date().toLocaleDateString('ar-SA')}`, '', '', '', '']);
  wsData.push([`رقم أمر العمل: ${meta.wo || meta.woNumber || '—'}`, '', '', `الموقع: ${meta.location || 'الرياض'}`, '', '', '', '']);
  wsData.push(['']);
  wsData.push(['م', 'رمز البند', 'الوصف بالعربية', 'الوصف بالإنجليزية', 'وحدة القياس', 'الكمية', (isEmergency ? 'السعر (طوارئ 190%)' : 'السعر الموحد الجديد (ر.س)'), 'الإجمالي (ر.س)', 'ملاحظات']);

  let totalWork = 0, rowNum = 1, curSec = '';
  const items = boqData.items || [];

  items.forEach(item => {
    const p = getItemByCode(item.code);
    let up = item.customPrice || (p ? p.newPrice : 0);
    up = Math.round(up * mult);
    const total = Math.round(up * (item.qty || 1));
    totalWork += total;

    if (p && p.section !== curSec) {
      curSec = p.section;
      wsData.push(['', `═══ ${curSec} ═══`, '', '', '', '', '', '', '']);
    }

    wsData.push([
      rowNum++, item.code,
      p ? p.arDesc : item.desc || '',
      p ? p.enDesc : '',
      p ? p.uom : item.uom || '',
      item.qty || 1, up, total, item.note || ''
    ]);
  });

  wsData.push(['']);
  wsData.push(['', '', '', '', '', '', 'إجمالي الأعمال قبل الضريبة:', totalWork]);
  wsData.push(['', '', '', '', '', '', 'ضريبة القيمة المضافة 15%:', Math.round(totalWork * VAT_RATE)]);
  wsData.push(['', '', '', '', '', '', 'الإجمالي الكلي شامل الضريبة:', Math.round(totalWork * (1 + VAT_RATE))]);
  if (meta.pdfNote) {
    wsData.push(['', '', '', '', '', '', 'ملاحظة فحص الـ PDF:', meta.pdfNote]);
  }

  const wsBOQ = W.utils.aoa_to_sheet(wsData);
  wsBOQ['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 45 }, { wch: 35 },
    { wch: 9 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 22 }
  ];
  W.utils.book_append_sheet(wb, wsBOQ, 'المقايسة');

  // -----------------------------------------------------------------
  // الورقة 2: التحليل المالي والإنتاجية (Productivity Cost Sheet)
  // -----------------------------------------------------------------
  const prodData = [];
  prodData.push(['التحليل المالي وتقدير التكلفة الفعلية بالإنتاجية' + (isEmergency ? ' (طوارئ SAP)' : ''), '', '', '', '', '', '', '', '', '', '', '', '']);
  prodData.push(['حسابات تفصيلية قائمة على أطقم العمل اليومية والمعاملات الميدانية لمدينة الرياض']);
  prodData.push([`معلمات الموقع: [التربة: ${meta.soilTypeAr || 'عادية'}] | [الوردية: ${meta.shiftAr || 'نهار'} ] | [الموسم: ${meta.seasonAr || 'شتاء'} ] | [المنطقة: ${meta.areaAr || 'مزدحمة'}]`]);
  prodData.push(['']);
  prodData.push([
    'رمز البند', 'الوصف العربي', 'الكمية', 'كود الطاقم', 'الإنتاجية اليومية المعدلة', 
    'أيام العمل المقدرة', 'تكلفة العمالة الفعلية', 'تكلفة المعدات الفعلية', 'تكلفة المواد الفعلية', 
    'التكلفة الإجمالية المقدرة', (isEmergency ? 'إيراد عقد الطوارئ' : 'إيراد العقد الجديد'), 'صافي الأرباح المقدرة', 'هامش الربح %', 'تقييم المخاطر'
  ]);

  let adjustedItems = items;
  if (isEmergency) {
    adjustedItems = items.map(item => {
      const p = getItemByCode(item.code);
      const normalPrice = item.customPrice || (p ? p.newPrice : 0);
      return {
        ...item,
        contractPrice: Math.round(normalPrice * 1.9)
      };
    });
  }

  let totalActualCost = 0;
  let totalLaborCost = 0;
  let totalEquipCost = 0;
  let totalMaterialCost = 0;

  if (window.ProductivityEngine) {
    // Run estimation
    const engineResult = window.ProductivityEngine.estimateBOQ(adjustedItems);
    totalActualCost = engineResult.totalActualVal;
    totalLaborCost = engineResult.totalLabor;
    totalEquipCost = engineResult.totalEquip;
    totalMaterialCost = engineResult.totalMaterial;

    engineResult.items.forEach(item => {
      const c = item.costDetails;
      prodData.push([
        item.code,
        item.priceItem ? item.priceItem.arDesc.slice(0, 35) : (item.desc || ''),
        item.qty,
        c.crewCode,
        c.adjustedOutput,
        c.requiredDays,
        c.totalLaborCost,
        c.totalEquipCost,
        c.totalMaterialCost,
        c.totalActualCost,
        c.totalContractRevenue,
        c.profitLoss,
        c.profitMargin,
        c.riskRating === 'High' ? '🔴 عالي' : (c.riskRating === 'Medium' ? '🟡 متوسط' : '🟢 آمن')
      ]);
    });
  } else {
    // Basic fallback if ProductivityEngine is missing
    adjustedItems.forEach(item => {
      const contractPrice = item.contractPrice || (getItemByCode(item.code)?.newPrice) || 0;
      const revenue = item.qty * contractPrice;
      prodData.push([
        item.code, item.desc || '', item.qty, 'CR-01', 35, 1, 0, 0, 0, 0, revenue, revenue, 100, '🟢 آمن'
      ]);
    });
  }

  prodData.push(['']);
  prodData.push(['', '', '', '', '', '', 'إجمالي تكلفة العمالة المباشرة:', totalLaborCost]);
  prodData.push(['', '', '', '', '', '', 'إجمالي تكلفة استئجار المعدات:', totalEquipCost]);
  prodData.push(['', '', '', '', '', '', 'إجمالي تكلفة المواد والمستلزمات:', totalMaterialCost]);
  prodData.push(['', '', '', '', '', '', 'إجمالي تكلفة التنفيذ الفعلية:', totalActualCost]);
  prodData.push(['', '', '', '', '', '', (isEmergency ? 'إجمالي قيمة عقد الطوارئ:' : 'إجمالي قيمة العقد الموحد الجديد:'), totalWork]);
  prodData.push(['', '', '', '', '', '', 'صافي الربح المتوقع من التنفيذ:', totalWork - totalActualCost]);
  prodData.push(['', '', '', '', '', '', 'هامش الربح التشغيلي الإجمالي %:', totalWork > 0 ? Math.round(((totalWork - totalActualCost)/totalWork)*10000)/100 : 0]);

  const wsProd = W.utils.aoa_to_sheet(prodData);
  wsProd['!cols'] = [
    { wch: 14 }, { wch: 35 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, 
    { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, 
    { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }
  ];
  W.utils.book_append_sheet(wb, wsProd, 'تحليل التكلفة الفعلية');

  // -----------------------------------------------------------------
  // الورقة 3: جدول أطقم العمل والآليات (Crew Loading Sheet)
  // -----------------------------------------------------------------
  const crewData = [];
  crewData.push(['تحليل الاحتياجات وأيام التشغيل للأطقم والمعدات' + (isEmergency ? ' (طوارئ SAP)' : ''), '', '', '', '', '', '', '']);
  crewData.push(['تقدير حجم الطلب على العمالة والآليات الثقيلة اللازمة لتنفيذ المشروع']);
  crewData.push(['']);
  crewData.push([
    'رمز الطاقم', 'اسم الطاقم الهندسي', 'الوحدة المعتمدة', 'إجمالي أيام العمل المطلوبة', 
    'الإنتاجية القياسية / يوم', 'تكلفة العمالة اليومية', 'تكلفة المعدات اليومية', 'إجمالي تكاليف الطاقم'
  ]);

  if (window.ProductivityEngine) {
    const crewSummary = {};
    const engineResult = window.ProductivityEngine.estimateBOQ(adjustedItems);
    
    engineResult.items.forEach(item => {
      const c = item.costDetails;
      if (!crewSummary[c.crewCode]) {
        crewSummary[c.crewCode] = {
          code: c.crewCode,
          name: c.crewNameAr,
          uom: c.uom,
          days: 0,
          stdOutput: c.standardOutput,
          laborRate: c.dailyLaborCost,
          equipRate: c.dailyEquipCost,
          totalCost: 0
        };
      }
      crewSummary[c.crewCode].days += c.requiredDays;
      crewSummary[c.crewCode].totalCost += c.totalCrewCost;
    });

    Object.values(crewSummary).forEach(cr => {
      crewData.push([
        cr.code,
        cr.name,
        cr.uom,
        Math.round(cr.days * 10) / 10,
        cr.stdOutput,
        cr.laborRate,
        cr.equipRate,
        Math.round(cr.totalCost)
      ]);
    });
  } else {
    crewData.push(['CR-01', 'طاقم حفر عادي', 'M3', 0, 35, 1500, 2400, 0]);
  }

  const wsCrew = W.utils.aoa_to_sheet(crewData);
  wsCrew['!cols'] = [
    { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 22 }, 
    { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 22 }
  ];
  W.utils.book_append_sheet(wb, wsCrew, 'أطقم العمل والجدول الزمني');

  // -----------------------------------------------------------------
  // الورقة 4: الالتزام الفني والمخاطر (Compliance & Risk Matrix)
  // -----------------------------------------------------------------
  const riskData = [];
  riskData.push(['مصفوفة المخاطر الفنية والالتزام بمواصفات الكود الموحد لـ SEC' + (isEmergency ? ' (طوارئ SAP)' : ''), '', '', '', '']);
  riskData.push(['تحليل تلقائي للكشف عن البنود المفقودة، التناقضات، ونقص شروط السلامة والتنثير']);
  riskData.push(['']);
  riskData.push(['نوع الملاحظة', 'البند المسبب', 'اسم البند الرئيسي', 'الرموز المقترحة للإضافة', 'تفاصيل المشكلة والتحليل الفني']);

  if (typeof window.checkDependencies === 'function') {
    const depResult = window.checkDependencies(items);
    
    depResult.missing.forEach(m => {
      riskData.push([
        '🔴 نقص بند حرج',
        m.triggeredBy,
        m.triggeredByName,
        (m.missingCodes || []).join(' | '),
        m.reason
      ]);
    });

    depResult.warnings.forEach(w => {
      riskData.push([
        '🟡 تحذير كفاءة',
        w.triggeredBy,
        w.triggeredByName,
        (w.suggestedCodes || []).join(' | '),
        w.reason
      ]);
    });

    if (depResult.missing.length === 0 && depResult.warnings.length === 0) {
      riskData.push(['🟢 سليم 100%', 'لا يوجد', 'المقايسة مطابقة تماماً لمواصفات العقد', 'لا يوجد', 'تم التحقق من جميع معايير SEC المتطابقة']);
    }
  } else {
    riskData.push(['🟢 غير متاح', '—', 'محرك التحقق الفني غير محمل', '—', '—']);
  }

  const wsRisk = W.utils.aoa_to_sheet(riskData);
  wsRisk['!cols'] = [
    { wch: 18 }, { wch: 15 }, { wch: 28 }, { wch: 25 }, { wch: 65 }
  ];
  W.utils.book_append_sheet(wb, wsRisk, 'الالتزام والتحليل الفني');

  // كتابة وتنزيل الملف
  const fileName = `التقرير_المتكامل_${isEmergency ? 'طوارئ_' : ''}${meta.wo || meta.woNumber || 'مقايسة'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  W.writeFile(wb, fileName);
}

// ═══════════════════════════════════════════════════
// تصدير PDF (نافذة طباعة)
// ═══════════════════════════════════════════════════
function exportToPDF(boqData, meta) {
  meta = meta || {};
  const win = window.open('', '_blank');
  if (!win) { alert('يرجى السماح للنوافذ المنبثقة في المتصفح'); return; }

  const items = boqData.items || [];
  const isEmergency = !!boqData.isEmergency;
  const mult = isEmergency ? 1.9 : 1.0;
  const total = items.reduce((s, i) => {
    const p = getItemByCode(i.code);
    return s + Math.round((i.customPrice || (p ? p.newPrice : 0)) * mult) * (i.qty || 1);
  }, 0);
  const vat = total * VAT_RATE;

  let rowsHtml = '', n = 1, lastSec = '';
  items.forEach(item => {
    const p = getItemByCode(item.code);
    const up = Math.round((item.customPrice || (p ? p.newPrice : 0)) * mult);
    const tot = up * (item.qty || 1);
    if (p && p.section !== lastSec) {
      lastSec = p.section;
      rowsHtml += `<tr class="sec"><td colspan="8">📁 ${lastSec}</td></tr>`;
    }
    rowsHtml += `<tr>
      <td>${n++}</td><td class="code">${item.code}</td>
      <td class="desc">${p ? p.arDesc : item.desc || ''}</td>
      <td>${p ? p.uom : ''}</td><td>${item.qty || 1}</td>
      <td>${_fmt(up)}</td><td>${_fmt(tot)}</td><td>${item.note || ''}</td>
    </tr>`;
  });

  win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"><title>مقايسة العقد الموحد الجديد</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo',sans-serif;direction:rtl;padding:20px;font-size:11px;color:#1a1a2e;background:#fff}
.hdr{text-align:center;border-bottom:3px solid #00843D;padding-bottom:14px;margin-bottom:14px}
.hdr h1{font-size:17px;color:#00843D;margin-bottom:4px}
.hdr h2{font-size:12px;color:#333}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;padding:10px;background:#f0f9f4;border-radius:6px}
.meta span{font-size:11px} .meta strong{color:#00843D}
table{width:100%;border-collapse:collapse;margin-bottom:14px}
th{background:#00843D;color:#fff;padding:7px 4px;text-align:center;font-size:10px}
td{padding:5px 4px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:middle}
.desc{text-align:right;max-width:200px;font-size:10px}
.code{font-family:monospace;font-weight:700;color:#004d25}
tr:nth-child(even){background:#f9fafb}
.sec td{background:#e8f5e9;font-weight:700;text-align:right;padding:5px 8px;border-top:2px solid #00843D;font-size:11px}
.totals{border:2px solid #00843D;border-radius:6px;overflow:hidden;margin-bottom:20px}
.totals table{margin:0}
.totals td{padding:7px 14px}
.totals .grand{background:#00843D;color:#fff;font-size:13px;font-weight:700}
.totals .grand td{color:#fff}
.footer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;text-align:center;margin-top:30px}
.sig{border-top:1px solid #999;padding-top:8px;font-size:10px;color:#666}
@media print{body{padding:10px}}
</style></head><body>
<div class="hdr">
  <h1>⚡ العقد الموحد الجديد — قائمة الأعمال${isEmergency ? ' (طوارئ SAP 190%)' : ''}</h1>
  <h2>عقد صيانة وإنشاء شبكات توزيع الطاقة | RFx 4000083770 | الشركة السعودية للكهرباء</h2>
</div>
<div class="meta">
  <span><strong>المشروع:</strong> ${meta.project || '—'}</span>
  <span><strong>رقم أمر العمل:</strong> ${meta.wo || meta.woNumber || '—'}</span>
  <span><strong>الموقع:</strong> ${meta.location || '—'}</span>
  <span><strong>التاريخ:</strong> ${meta.date || new Date().toLocaleDateString('ar-SA')}</span>
  <span><strong>المقاول:</strong> شركة الأساس العريض للمقاولات</span>
  <span><strong>صاحب العمل:</strong> الشركة السعودية للكهرباء</span>
</div>
<table>
  <thead><tr>
    <th>م</th><th>الرمز</th><th>الوصف</th><th>وحدة</th>
    <th>الكمية</th><th>السعر</th><th>الإجمالي</th><th>ملاحظات</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="totals"><table>
  <tr><td>إجمالي الأعمال قبل الضريبة</td><td>${_fmt(total)} ر.س</td></tr>
  <tr><td>ضريبة القيمة المضافة 15%</td><td>${_fmt(vat)} ر.س</td></tr>
  <tr class="grand"><td>الإجمالي الكلي شامل الضريبة</td><td>${_fmt(total + vat)} ر.س</td></tr>
 </table></div>
${meta.pdfNote ? `<div style="margin: 14px 0; padding: 12px; background: rgba(0, 132, 61, 0.05); border-right: 4px solid #00843D; border-radius: 4px; font-size: 11px; text-align: right; line-height: 1.5;">
  <strong>ملاحظة فحص الـ PDF:</strong> ${meta.pdfNote}
</div>` : ''}
<div class="footer">
  <div class="sig">توقيع المقاول<br><br>_______________</div>
  <div class="sig">توقيع المشرف<br><br>_______________</div>
  <div class="sig">ختم الشركة السعودية للكهرباء<br><br>_______________</div>
</div>
<script>window.onload=()=>window.print()<\/script>
</body></html>`);
  win.document.close();
}

// ═══════════════════════════════════════════════════
// تصدير JSON
// ═══════════════════════════════════════════════════
function exportToJSON(boqData, meta) {
  meta = meta || {};
  const items = boqData.items || [];
  const isEmergency = !!boqData.isEmergency;
  const mult = isEmergency ? 1.9 : 1.0;
  const total = Math.round(items.reduce((s, i) => {
    const p = getItemByCode(i.code);
    const up = Math.round((i.customPrice || (p ? p.newPrice : 0)) * mult);
    return s + (up * (i.qty || 1));
  }, 0));

  const obj = {
    meta: {
      system: 'العقد الموحد الجديد v4.1', contract: 'RFx 4000083770',
      contractor: 'شركة الأساس العريض للمقاولات',
      client: 'الشركة السعودية للكهرباء',
      isEmergency: isEmergency,
      calculationRate: isEmergency ? '190% (Emergency SAP)' : '100% (Standard)',
      exportDate: new Date().toISOString(), ...meta
    },
    items: items.map(item => {
      const p = getItemByCode(item.code);
      const up = Math.round((item.customPrice || (p ? p.newPrice : 0)) * mult);
      return {
        code: item.code, description_ar: p ? p.arDesc : item.desc,
        description_en: p ? p.enDesc : '', uom: p ? p.uom : item.uom,
        qty: item.qty || 1, unitPrice: up, total: Math.round(up * (item.qty || 1)), note: item.note || ''
      };
    }),
    totals: { subtotal: total, vat: Math.round(total * VAT_RATE), grandTotal: Math.round(total * (1 + VAT_RATE)) }
  };

  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `boq_${isEmergency ? 'emergency_' : ''}${meta.wo || 'export'}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════
// تصدير شيت القياس
// ═══════════════════════════════════════════════════
function exportMeasurementSheet(boqData, meta) {
  meta = meta || {};
  const W = window.XLSX;
  if (!W) { exportToCSV(boqData, meta); return; }

  const isEmergency = !!boqData.isEmergency;
  const mult = isEmergency ? 1.9 : 1.0;
  const wb = W.utils.book_new();
  const wsData = [
    ['شيت القياس — شركة الأساس العريض للمقاولات' + (isEmergency ? ' (طوارئ SAP)' : '')],
    ['العقد: RFx 4000083770 | الشركة السعودية للكهرباء'],
    [`أمر العمل: ${meta.wo || ''}`, '', `التاريخ: ${meta.date || new Date().toLocaleDateString('ar-SA')}`],
    [''],
    ['رمز البند', 'الوصف', 'وحدة', 'الكمية المعتمدة', 'الكمية المنفذة', 'نسبة الإنجاز %', 'السعر', 'القيمة المنفذة', 'ملاحظات']
  ];

  (boqData.items || []).forEach(item => {
    const p = getItemByCode(item.code);
    const up = Math.round((item.customPrice || (p ? p.newPrice : 0)) * mult);
    wsData.push([
      item.code, p ? p.arDesc : item.desc || '', p ? p.uom : '',
      item.qty || 1, '', '', up, '', ''
    ]);
  });

  const ws = W.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 13 }, { wch: 52 }, { wch: 8 }, { wch: 16 },
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 22 }
  ];
  W.utils.book_append_sheet(wb, ws, 'شيت القياس');
  W.writeFile(wb, `شيت_قياس_${isEmergency ? 'طوارئ_' : ''}${meta.wo || ''}_${Date.now()}.xlsx`);
}

// ═══════════════════════════════════════════════════
// تصدير CSV
// ═══════════════════════════════════════════════════
function exportToCSV(boqData, meta) {
  meta = meta || {};
  const isEmergency = !!boqData.isEmergency;
  const mult = isEmergency ? 1.9 : 1.0;
  let csv = '\uFEFF';
  csv += 'م,رمز البند,الوصف,وحدة,الكمية,سعر الوحدة,الإجمالي\n';
  let n = 1;
  (boqData.items || []).forEach(item => {
    const p = getItemByCode(item.code);
    const up = Math.round((item.customPrice || (p ? p.newPrice : 0)) * mult);
    const total = Math.round(up * (item.qty || 1));
    const desc = (p ? p.arDesc : item.desc || '').replace(/,/g, '،');
    csv += `${n++},${item.code},"${desc}",${p ? p.uom : ''},${item.qty || 1},${up},${total}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `مقايسة_${isEmergency ? 'طوارئ_' : ''}${meta.wo || ''}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
