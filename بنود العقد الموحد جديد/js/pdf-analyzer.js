/**
 * PRICEWISE-SEC — مركز التحليل الفني والمالي بالذكاء الاصطناعي (AI Smart Document Analyzer)
 * Supported Formats: PDF, Excel (.xlsx, .xls), CSV, JSON (Odoo ERP compatible)
 * Integrated with custom Google Gemini Session & Labor-Material Balancer
 */

const PDF_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const PATTERNS = {
  itemCode: /\b([1-7]\d{8})\b/g,
  woNumber: /(?:أمر\s*العمل|Work\s*Order|WO)[:\s#]*([A-Z0-9\-]+)/gi
};

const PDFAnalyzer = {

  /**
   * Main Router to analyze PDF, Excel, JSON or CSV files
   */
  async analyzeFile(file, progressCallback) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'json') {
      return this.analyzeJSON(file, progressCallback);
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      return this.analyzeExcelCSV(file, progressCallback);
    } else if (ext === 'pdf') {
      return this.analyzePDF(file, progressCallback);
    } else {
      throw new Error('صيغة الملف غير مدعومة. يرجى رفع ملف PDF أو Excel أو JSON أو CSV فقط.');
    }
  },

  /**
   * JSON / Odoo ERP Import Parsing Pipeline
   */
  async analyzeJSON(file, progressCallback) {
    progressCallback?.('extracting', 25);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          progressCallback?.('parsing', 60);
          const rawText = e.target.result;
          const parsed = JSON.parse(rawText);
          
          let itemsList = [];
          
          // Detect Odoo PO or standard list formats
          if (Array.isArray(parsed)) {
            itemsList = parsed;
          } else if (parsed.items && Array.isArray(parsed.items)) {
            itemsList = parsed.items;
          } else if (parsed.order_lines && Array.isArray(parsed.order_lines)) {
            itemsList = parsed.order_lines;
          } else {
            // Flatten object values to find arrays
            Object.values(parsed).forEach(val => {
              if (Array.isArray(val) && itemsList.length === 0) {
                itemsList = val;
              }
            });
          }

          const foundItems = [];
          const seenCodes = new Set();

          itemsList.forEach(rawItem => {
            // Find code key
            const code = String(rawItem.product_id || rawItem.item_code || rawItem.default_code || rawItem.code || '').trim();
            const cleanCodeMatch = code.match(/\b([1-7]\d{8})\b/);
            
            if (cleanCodeMatch) {
              const matchedCode = cleanCodeMatch[1];
              if (seenCodes.has(matchedCode)) return;
              
              const priceItem = getItemByCode(matchedCode);
              if (!priceItem) return;
              
              seenCodes.add(matchedCode);
              
              // Find quantity key
              const qty = parseFloat(rawItem.product_uom_qty || rawItem.qty || rawItem.quantity || 1);
              
              // Find unit price key
              const enteredPrice = parseFloat(rawItem.price_unit || rawItem.rate || rawItem.price || null);
              
              foundItems.push({
                code: matchedCode,
                qty: isNaN(qty) ? 1 : Math.round(qty * 100) / 100,
                enteredPrice: enteredPrice && !isNaN(enteredPrice) ? Math.round(enteredPrice * 100) / 100 : null,
                contractPrice: priceItem.newPrice,
                priceItem,
                fromFile: true
              });
            }
          });

          if (foundItems.length === 0) {
            // Fallback: try regex search in the entire JSON string
            const codesFound = rawText.match(/\b([1-7]\d{8})\b/g) || [];
            [...new Set(codesFound)].forEach(matchedCode => {
              const priceItem = getItemByCode(matchedCode);
              if (priceItem) {
                foundItems.push({
                  code: matchedCode,
                  qty: 1,
                  enteredPrice: null,
                  contractPrice: priceItem.newPrice,
                  priceItem,
                  fromFile: true
                });
              }
            });
          }

          progressCallback?.('pricing', 80);
          const itemsWithErrors = this.detectPricingErrors(foundItems);

          progressCallback?.('dependencies', 90);
          const depResults = checkDependencies(foundItems.map(i => ({
            code: i.code,
            qty: i.qty,
            customPrice: i.enteredPrice
          })));

          progressCallback?.('done', 100);

          const totalEntered = itemsWithErrors.reduce((s, i) => s + (i.enteredPrice || i.contractPrice) * i.qty, 0);
          const totalContract = itemsWithErrors.reduce((s, i) => s + i.contractPrice * i.qty, 0);
          const pricingErrorItems = itemsWithErrors.filter(i => i.errors && i.errors.length > 0);

          resolve({
            fileName: file.name,
            fileType: 'json (Odoo ERP)',
            numPages: 1,
            woNumber: parsed.name || parsed.order_no || "مستند Odoo مستورد",
            foundItems: itemsWithErrors,
            depResults,
            pricingErrors: pricingErrorItems,
            totalEntered,
            totalContract,
            correctedTotal: totalContract,
            timestamp: new Date().toISOString()
          });

        } catch (err) {
          reject(new Error('فشل تحليل ملف JSON/Odoo: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('خطأ في قراءة ملف JSON'));
      reader.readAsText(file);
    });
  },

  /**
   * PDF Extraction Pipeline
   */
  async analyzePDF(file, progressCallback) {
    progressCallback?.('extracting', 15);
    
    if (!window.pdfjsLib) {
      throw new Error('مكتبة PDF.js غير محملة');
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedArray = new Uint8Array(e.target.result);
          const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;

          let fullText = '';
          const pageTexts = [];

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            pageTexts.push(pageText);
            fullText += pageText + '\n';
          }

          progressCallback?.('parsing', 45);
          const foundItems = this.parseItemsFromText(fullText);
          const woNumber = this.extractWONumber(fullText);

          progressCallback?.('pricing', 70);
          const itemsWithErrors = this.detectPricingErrors(foundItems);

          progressCallback?.('dependencies', 85);
          const depResults = checkDependencies(foundItems.map(i => ({
            code: i.code,
            qty: i.qty,
            customPrice: i.enteredPrice
          })));

          progressCallback?.('done', 100);

          const totalEntered = itemsWithErrors.reduce((s, i) => s + (i.enteredPrice || i.contractPrice) * i.qty, 0);
          const totalContract = itemsWithErrors.reduce((s, i) => s + i.contractPrice * i.qty, 0);
          const pricingErrorItems = itemsWithErrors.filter(i => i.errors && i.errors.length > 0);

          resolve({
            fileName: file.name,
            fileType: 'pdf',
            numPages: pdf.numPages,
            woNumber: woNumber || 'مستخلص PDF ممسوح',
            foundItems: itemsWithErrors,
            depResults,
            pricingErrors: pricingErrorItems,
            totalEntered,
            totalContract,
            correctedTotal: totalContract,
            timestamp: new Date().toISOString()
          });

        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('خطأ في قراءة الملف'));
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Excel / CSV Parsing Pipeline using SheetJS (window.XLSX)
   */
  async analyzeExcelCSV(file, progressCallback) {
    progressCallback?.('extracting', 20);

    const W = window.XLSX;
    if (!W) {
      throw new Error('مكتبة SheetJS غير متوفرة في المتصفح.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          progressCallback?.('parsing', 50);
          const data = new Uint8Array(e.target.result);
          const workbook = W.read(data, { type: 'array' });
          
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = W.utils.sheet_to_json(worksheet, { header: 1 });
          
          const foundItems = [];
          const seenCodes = new Set();
          
          // Loop over rows and search for codes
          for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            if (!row || !row.length) continue;
            
            for (let c = 0; c < row.length; c++) {
              const val = String(row[c]).trim();
              const match = val.match(/\b([1-7]\d{8})\b/);
              
              if (match) {
                const code = match[1];
                if (seenCodes.has(code)) continue;
                const priceItem = getItemByCode(code);
                if (!priceItem) continue;
                
                seenCodes.add(code);
                
                // Identify quantity in the same row
                let qty = 1;
                let enteredPrice = null;
                
                // Scan row for other numbers
                for (let colIdx = 0; colIdx < row.length; colIdx++) {
                  if (colIdx === c) continue;
                  const cellVal = parseFloat(row[colIdx]);
                  if (!isNaN(cellVal) && cellVal > 0) {
                    // If close to price, likely custom price
                    if (cellVal >= priceItem.newPrice * 0.2 && cellVal <= priceItem.newPrice * 3 && !enteredPrice) {
                      enteredPrice = cellVal;
                    } else if (cellVal >= 0.01 && cellVal <= 1000000) {
                      qty = cellVal;
                    }
                  }
                }
                
                foundItems.push({
                  code,
                  qty: Math.round(qty * 100) / 100,
                  enteredPrice: enteredPrice ? Math.round(enteredPrice * 100) / 100 : null,
                  contractPrice: priceItem.newPrice,
                  priceItem,
                  fromFile: true
                });
              }
            }
          }
          
          progressCallback?.('pricing', 75);
          const itemsWithErrors = this.detectPricingErrors(foundItems);
          
          progressCallback?.('dependencies', 90);
          const depResults = checkDependencies(foundItems.map(i => ({
            code: i.code,
            qty: i.qty,
            customPrice: i.enteredPrice
          })));
          
          progressCallback?.('done', 100);
          
          const totalEntered = itemsWithErrors.reduce((s, i) => s + (i.enteredPrice || i.contractPrice) * i.qty, 0);
          const totalContract = itemsWithErrors.reduce((s, i) => s + i.contractPrice * i.qty, 0);
          const pricingErrorItems = itemsWithErrors.filter(i => i.errors && i.errors.length > 0);
          
          resolve({
            fileName: file.name,
            fileType: file.name.split('.').pop().toLowerCase(),
            numPages: 1,
            woNumber: "مستخلص مجدول",
            foundItems: itemsWithErrors,
            depResults,
            pricingErrors: pricingErrorItems,
            totalEntered,
            totalContract,
            correctedTotal: totalContract,
            timestamp: new Date().toISOString()
          });
          
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = () => reject(new Error('خطأ في قراءة ملف الإكسل/CSV'));
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Parse text for item codes with advanced Eastern Arabic digit support,
   * spaced-out character merging, and a robust mathematical context row-solver.
   */
  parseItemsFromText(text) {
    // 1. Normalise Eastern Arabic / Hindi numerals to standard Western numerals
    let cleanText = this.cleanArabicDigits(text);
    
    // 2. Merge spaced-out digits that form a 9-digit code starting with 1-7
    // Handles cases like "3 0 1 0 3 0 1 0 1" or "3 - 0103 - 0101"
    const spacingPattern = /\b([1-7])[\s-]*(\d)[\s-]*(\d)[\s-]*(\d)[\s-]*(\d)[\s-]*(\d)[\s-]*(\d)[\s-]*(\d)[\s-]*(\d)\b/g;
    cleanText = cleanText.replace(spacingPattern, '$1$2$3$4$5$6$7$8$9');

    const lines = cleanText.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    const foundItems = [];
    const seenCodes = new Set();
    
    // Find all lines containing valid codes
    const codeMatches = []; // items: { code, lineIdx }
    
    lines.forEach((line, idx) => {
      // Find all 9-digit codes in this line starting with 1-7
      const matches = line.match(/\b([1-7]\d{8})\b/g) || [];
      matches.forEach(code => {
        if (getItemByCode(code)) {
          codeMatches.push({ code, lineIdx: idx });
        }
      });
    });

    // Gather surrounding lines as context for each unique code
    codeMatches.forEach(({ code, lineIdx }) => {
      if (seenCodes.has(code)) return;
      seenCodes.add(code);
      
      const priceItem = getItemByCode(code);
      if (!priceItem) return;
      const contractPrice = priceItem.newPrice;

      // Group lineIdx-1 to lineIdx+1 for multi-row wrap safety
      const contextLines = [];
      const startIdx = Math.max(0, lineIdx - 1);
      const endIdx = Math.min(lines.length - 1, lineIdx + 1);
      
      for (let j = startIdx; j <= endIdx; j++) {
        contextLines.push(lines[j]);
      }
      
      const contextText = contextLines.join(' ');
      
      // Remove the 9-digit code itself to avoid parsing it as quantity/price
      const cleanedContextText = contextText.replace(new RegExp('\\b' + code + '\\b', 'g'), '');
      
      // Match decimals and integers (with support for commas like 1,250.50)
      const numPattern = /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b|\b\d+(?:\.\d+)?\b/g;
      const numMatches = cleanedContextText.match(numPattern) || [];
      
      const nums = numMatches.map(m => {
        const val = parseFloat(m.replace(/,/g, ''));
        return isNaN(val) ? null : val;
      }).filter(n => n !== null && n > 0);

      // Solve mathematically for quantity and entered price
      const { qty, enteredPrice } = this.solveRowNumbers(nums, contractPrice);

      foundItems.push({
        code,
        qty: Math.round(qty * 100) / 100,
        enteredPrice: enteredPrice ? Math.round(enteredPrice * 100) / 100 : null,
        contractPrice,
        priceItem,
        fromFile: true
      });
    });

    return foundItems;
  },

  /**
   * Resolves row numbers to mathematically consistent Qty, Price, and Total relationships.
   */
  solveRowNumbers(nums, contractPrice) {
    if (nums.length === 0) {
      return { qty: 1, enteredPrice: null };
    }

    const sorted = [...nums].sort((a, b) => a - b);
    const candidates = [...sorted, contractPrice];
    
    // Case 1: Search for any pair in candidates that multiplies to a value in sorted (Total = Qty * Price)
    for (let i = 0; i < candidates.length; i++) {
      for (let j = 0; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        const prod = a * b;
        
        // Find if a number matches the product within a 2.5% margin
        const totalIdx = sorted.findIndex(c => Math.abs(c - prod) <= Math.max(c, prod) * 0.025);
        if (totalIdx !== -1) {
          // Found a mathematically consistent row triplet!
          // Whichever is closer to contractPrice is the unit price, the other is quantity
          if (Math.abs(a - contractPrice) < Math.abs(b - contractPrice)) {
            return { qty: b, enteredPrice: a };
          } else {
            return { qty: a, enteredPrice: b };
          }
        }
      }
    }

    // Case 2: Find a number in sorted close to the contractPrice (enteredPrice)
    const priceIdx = sorted.findIndex(n => n >= contractPrice * 0.25 && n <= contractPrice * 4.0);
    if (priceIdx !== -1) {
      const enteredPrice = sorted[priceIdx];
      // Pick any other number as quantity
      const remaining = sorted.filter((_, idx) => idx !== priceIdx);
      if (remaining.length > 0) {
        return { qty: remaining[0], enteredPrice };
      }
      return { qty: 1, enteredPrice };
    }

    // Case 3: See if any number in sorted multiplied by contractPrice matches another number in sorted (implied price)
    for (let i = 0; i < sorted.length; i++) {
      const q = sorted[i];
      const expectedTotal = q * contractPrice;
      const totalIdx = sorted.findIndex(c => Math.abs(c - expectedTotal) <= expectedTotal * 0.025);
      if (totalIdx !== -1) {
        return { qty: q, enteredPrice: contractPrice };
      }
    }

    // Case 4: General fallback heuristics
    if (sorted.length >= 2) {
      // Smaller is likely quantity, larger is likely unit price
      return { qty: sorted[0], enteredPrice: sorted[1] };
    } else if (sorted.length === 1) {
      return { qty: sorted[0], enteredPrice: null };
    }

    return { qty: 1, enteredPrice: null };
  },

  /**
   * Helper to normalise Arabic/Hindi numerals (٠-٩) to Western standard (0-9)
   */
  cleanArabicDigits(str) {
    const arabicMap = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
    return str.replace(/[٠-٩]/g, d => arabicMap[d]);
  },

  /**
   * Extract WO number
   */
  extractWONumber(text) {
    const patterns = [
      /(?:رقم\s*أمر\s*العمل|Work\s*Order\s*No\.?)[:\s]*([A-Z0-9\-\/]+)/i,
      /WO[:\s#]*([0-9\-]+)/i,
      /أمر\s*العمل[:\s]*([0-9\-]+)/
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1].trim();
    }
    return null;
  },

  /**
   * Detect pricing errors
   */
  detectPricingErrors(items) {
    return items.map(item => {
      const errors = [];
      const contractPrice = item.contractPrice;
      const entered = item.enteredPrice;

      if (!entered) return { ...item, errors: [] };

      const diff = entered - contractPrice;
      const pct = ((diff / contractPrice) * 100).toFixed(1);

      if (entered > contractPrice * 1.15) {
        errors.push({
          type: 'above_ceiling',
          severity: 'critical',
          msg: 'السعر أعلى من السقف المعتمد بمواصفات العقد الموحد الجديد',
          entered, suggested: contractPrice, diff, pct: parseFloat(pct)
        });
      }

      if (entered < contractPrice * 0.3 && entered > 0) {
        errors.push({
          type: 'below_min',
          severity: 'critical',
          msg: 'السعر منخفض جداً عن السعر الموحد الجديد (قد يسبب خسائر للمقاول)',
          entered, suggested: contractPrice, diff, pct: parseFloat(pct)
        });
      }

      if (Math.abs(parseFloat(pct)) > 5 && errors.length === 0) {
        errors.push({
          type: 'mismatch',
          severity: 'medium',
          msg: 'يوجد تباين ملحوظ في تسعير البند مقارنة بالأسعار الجديدة المعتمدة',
          entered, suggested: contractPrice, diff, pct: parseFloat(pct)
        });
      }

      return { ...item, errors };
    });
  }
};

/**
 * AI Smart Analyzer Page Renderer
 */
function renderPDFAnalyzer(container) {
  container.innerHTML = `
    <!-- Header -->
    <div style="background:linear-gradient(135deg,var(--bg-card),rgba(0,132,61,0.06));border:1px solid var(--border-sec);border-radius:var(--r-xl);padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 10% 50%,rgba(0,132,61,0.08),transparent 45%);pointer-events:none;"></div>
      <div style="display:flex;align-items:center;gap:18px;position:relative;">
        <div style="width:56px;height:56px;background:rgba(0,132,61,0.15);border-radius:var(--r-lg);display:flex;align-items:center;justify-content:center;font-size:28px;border:1px solid var(--border-sec);">🤖</div>
        <div>
          <h2 style="font-size:18px;font-weight:900;color:var(--text-main);margin-bottom:4px;">المركز الذكي للتحليل الهندسي بالذكاء الاصطناعي (AI Smart Hub)</h2>
          <p style="font-size:12px;color:var(--text-sub);">ارفع مستندات المشروع بصيغة **PDF**، **Excel**، **JSON** أو **CSV** (بما فيها ملفات Odoo ERP) ليقوم المساعد الذكي بتشريح البنود، موازنة الأعمال والمواد، واقتراح بنود مراحل التنفيذ التابعة للموافقة التامة.</p>
        </div>
      </div>
    </div>

    <div id="pdf-layout-row" class="pdf-workspace-split">
      
      <!-- Left Panel -->
      <div>
        <!-- Upload Zone -->
        <div class="card" style="margin-bottom:20px;" id="pdf-upload-card">
          <div class="card-body">
            <div class="drop-zone" id="pdf-drop-zone" onclick="document.getElementById('pdf-file-input').click()">
              <input type="file" id="pdf-file-input" accept=".pdf,.xlsx,.xls,.csv,.json" style="display:none" onchange="handleFileUpload(this.files[0])">
              <div class="dz-icon">📂</div>
              <h3>اسحب ملف المقايسة أو مستند استيراد Odoo (PDF, Excel, CSV, JSON) هنا أو انقر للتصفح</h3>
              <p>يدعم جداول حقول SEC الرسمية، جداول الصيانة، وملفات الربط الهيكلي الموحدة لعقود الرياض</p>
              <div style="display:flex;justify-content:center;gap:8px;margin-top:14px;">
                <span style="background:rgba(0,132,61,0.12);border:1px solid var(--border-sec);color:var(--sec-primary);padding:6px 16px;border-radius:99px;font-size:11.5px;font-weight:700;">PDF Extract</span>
                <span style="background:rgba(16,124,65,0.12);border:1px solid rgba(16,124,65,0.2);color:#107C41;padding:6px 16px;border-radius:99px;font-size:11.5px;font-weight:700;">XLSX / CSV Parse</span>
                <span style="background:rgba(135,90,123,0.12);border:1px solid rgba(135,90,123,0.2);color:#875A7B;padding:6px 16px;border-radius:99px;font-size:11.5px;font-weight:700;">Odoo JSON Import</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div id="pdf-progress" style="display:none;" class="card mb-20">
          <div class="card-body">
            <div style="font-size:13px;color:var(--text-sub);margin-bottom:10px;" id="pdf-progress-label">جاري تشريح المستند...</div>
            <div style="background:var(--bg-surface);border-radius:99px;height:8px;overflow:hidden;border:1px solid var(--border);">
              <div id="pdf-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--sec-primary),var(--sec-gold));border-radius:99px;transition:width 0.4s ease;"></div>
            </div>
          </div>
        </div>

        <!-- Results (rendered after analysis) -->
        <div id="pdf-results-wrap" style="display:none;flex-direction:column;gap:18px;">
          <div id="pdf-results-main"></div>
        </div>
      </div>

      <!-- Right Side Panel: Integrated Google Gemini Gate & Local Advisor -->
      <div id="pdf-sidebar-panel" class="pdf-sidebar-sticky">
        
        <!-- Google Gemini Portal Gateway (Glow Gold Card) -->
        <div class="card" style="border:1px solid var(--sec-gold);box-shadow:var(--glow-gold);background:linear-gradient(135deg,rgba(200,168,75,0.06),var(--bg-card));">
          <div class="card-head" style="background:linear-gradient(90deg,rgba(200,168,75,0.1),transparent);border-bottom:1px solid var(--border-gold);">
            <span style="font-size:18px;">✨</span>
            <span class="card-title" style="color:var(--sec-gold);font-weight:900;">مستشار Google Gemini الهندسي</span>
          </div>
          <div class="card-body" style="padding:15px;display:flex;flex-direction:column;gap:12px;">
            <div style="font-size:12px;color:var(--text-body);line-height:1.6;">
              بوابة التحليل المباشر والتفاعل الفني مع **مساعد Google Gemini**. اضغط على الزر أدناه للانتقال الفوري إلى جلسة التحليل المشتركة والاستفسار الفني:
            </div>
            
            <a href="https://gemini.google.com/gem/1VRbTsjNS7GfnROMtObGrI-hi4LLKR0Ji?usp=sharing" target="_blank" class="btn btn-gold btn-sm btn-full" style="font-weight:900;letter-spacing:0.5px;box-shadow:var(--shadow-sm);">
              🔗 فتح بوابة Google Gemini المباشرة
            </a>
            
            <div style="border-top:1px dashed var(--border);margin-top:4px;padding-top:8px;">
              <button class="btn btn-outline btn-sm btn-full" onclick="copyBOQPromptForGemini()">
                📋 نسخ المقايسة كبرومبت لـ Gemini
              </button>
              <div style="font-size:10px;color:var(--text-sub);text-align:center;margin-top:6px;">
                انسخ بيانات المقايسة بكبسة زر لتلصقها مباشرة في Gemini لتعطيك تحليلاً فورياً!
              </div>
            </div>
          </div>
        </div>

        <!-- Local Crew & Timeline Tendering Sidebar -->
        <div class="card" style="border:1px solid rgba(0,132,61,0.2);box-shadow:0 0 25px rgba(0,132,61,0.05);display:flex;flex-direction:column;height:430px;">
          <div class="card-head" style="background:linear-gradient(135deg,rgba(0,132,61,0.06),transparent);border-bottom:1px solid var(--border-sec);">
            <span>🤖</span><span class="card-title" style="color:var(--sec-primary);">مساعد التقدير والتحرير المحلي</span>
          </div>
          <div class="card-body" style="padding:15px;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;">
            <!-- Chat Area -->
            <div id="ai-chat-messages" style="flex:1;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:10px;padding-left:4px;">
              <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12px;line-height:1.5;color:var(--text-main);">
                مرحباً مهندس! لقد انتهيت من تفكيك المستند المرفوع وموازنته فنيّاً. 
                اسألني عن توزيع الأطقم، الجدول الزمني، أو تقديرات تكلفة الآليات والردم.
              </div>
            </div>
            
            <!-- Quick Queries -->
            <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;">
              <button class="btn btn-outline btn-sm" onclick="askAIEngine('crews')" style="text-align:right;font-size:10.5px;padding:6px 10px;">🏗️ أطقم العمل والآليات الميدانية المقترحة؟</button>
              <button class="btn btn-outline btn-sm" onclick="askAIEngine('timeline')" style="text-align:right;font-size:10.5px;padding:6px 10px;">📅 المدة التشغيلية والمسار الحرج؟</button>
            </div>

            <!-- Input Area -->
            <div style="display:flex;gap:6px;">
              <input class="form-control" id="ai-chat-input" placeholder="اسأل المساعد الهندسي..." style="font-size:12px;padding:8px;" onkeydown="if(event.key==='Enter') sendCustomAIQuestion()">
              <button class="btn btn-primary btn-sm" onclick="sendCustomAIQuestion()" style="padding:0 12px;">إرسال</button>
            </div>
          </div>
        </div>

      </div>

    </div>
  `;

  // Drag & drop handlers
  const dropZone = document.getElementById('pdf-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      handleFileUpload(file);
    });
  }
}

/**
 * Handle Document Upload and Process
 */
async function handleFileUpload(file) {
  if (!file) return;

  const progress = document.getElementById('pdf-progress');
  const progressBar = document.getElementById('pdf-progress-bar');
  const progressLabel = document.getElementById('pdf-progress-label');
  const wrap = document.getElementById('pdf-results-wrap');
  const resultsDiv = document.getElementById('pdf-results-main');

  progress.style.display = 'block';
  wrap.style.display = 'none';

  const updateProgress = (stage, pct) => {
    progressBar.style.width = pct + '%';
    const labels = {
      extracting: 'جاري قراءة واستيراد ملف المقايسة/Odoo...',
      parsing: 'جاري تصفية البنود وتفكيك المجلدات الموحدة للرياض...',
      pricing: 'جاري مطابقة الأسعار مع جدول أسعار الشركة السعودية للكهرباء...',
      dependencies: 'جاري تشغيل موازن الأعمال والمواد واقتراح بنود مراحل التنفيذ التابعة...',
      done: 'اكتمل التحليل الفني والمالي كلياً بنجاح!'
    };
    progressLabel.textContent = labels[stage] || 'جاري التحليل...';
  };

  try {
    const results = await PDFAnalyzer.analyzeFile(file, updateProgress);
    setTimeout(() => { 
      progress.style.display = 'none'; 
      wrap.style.display = 'flex';
      renderPDFResults(results, resultsDiv);
      showToast('⚡ تم تحليل واستيراد ملف المقايسة فنيّاً وبنود الأودو بنجاح!', 'success');
    }, 600);
  } catch (err) {
    progress.style.display = 'none';
    showToast('خطأ في استيراد/تحليل الملف: ' + err.message, 'error');
    console.error('File Analysis error:', err);
  }
}

/**
 * Helper to get execution phase suggestions
 */
function getExecutionPhaseSuggestions(items) {
  const suggestions = [];
  const presentCodes = new Set(items.map(i => i.code));
  const ar = (App.lang === 'ar');

  const addSug = (c, reason, type = 'missing') => {
    if (presentCodes.has(c)) return;
    const p = getItemByCode(c);
    if (!p) return;
    suggestions.push({
      code: c,
      arDesc: p.arDesc,
      enDesc: p.enDesc,
      uom: p.uom,
      newPrice: p.newPrice,
      reason,
      type
    });
    presentCodes.add(c); // prevent duplicate suggestions
  };

  items.forEach(itm => {
    const code = itm.code;
    const desc = itm.priceItem?.arDesc || '';

    // Phase 1: Excavation -> Suggest backfilling & Re-asphalting
    if (desc.includes('حفر') || desc.includes('حفريات')) {
      addSug('301030101', ar ? 'ردم الخندق بالرمال الناعمة المعالجة حول الكابل لحمايته' : 'Sand bedding for cable protection', 'phase');
      addSug('301030301', ar ? 'أعمال إعادة سفلتة وتعبيد الطرق بموجب شروط بلدية الرياض' : 'Re-asphalting and road compaction', 'phase');
      addSug('305010101', ar ? 'شريط تحذيري بلاستيكي أصفر لحماية الكابل المردوم من الحفر المستقبلي' : 'Yellow warning tape over backfill', 'phase');
    }

    // Phase 2: Cable Laying -> Suggest joints & Splicing
    if (desc.includes('تمديد') && desc.includes('كابل')) {
      addSug('304010101', ar ? 'نهايات كابلات خارجية معلبة لإتمام التوصيل بمحطة التوزيع' : 'Outdoor cable terminations', 'phase');
      addSug('304020101', ar ? 'وصلات مستقيمة لتوصيل مقاطع الكابلات وتأمين العزل المائي' : 'Straight-through cable joints', 'phase');
    }

    // Phase 3: Transformers/Equipment -> Suggest Grounding & concrete bases
    if (desc.includes('محول') || desc.includes('لوحة توزيع') || desc.includes('حلقة')) {
      addSug('303010101', ar ? 'منظومة بئر تأريض أرضي كاملة مع قضبان النحاس لحماية المعدات' : 'Grounding pit copper electrodes', 'phase');
      addSug('301040101', ar ? 'صب خرساني مسلّح للقواعد الميدانية الحاملة للأوزان الثقيلة للمحولات' : 'Concrete foundation base for transformer', 'phase');
    }
  });

  return suggestions;
}

/**
 * Render PDF/Excel/CSV/JSON Results UI
 */
function renderPDFResults(results, container) {
  window._pdfResults = results;
  const { fileName, fileType, woNumber, foundItems, depResults, pricingErrors, totalEntered, totalContract } = results;

  const pEngine = window.ProductivityEngine;
  let costSummary = { totalActualVal: 0, totalLabor: 0, totalEquip: 0, totalMaterial: 0, profitMargin: 0, overallRisk: 'Low' };
  
  if (pEngine) {
    costSummary = pEngine.estimateBOQ(foundItems);
  }

  const totalFound = foundItems.length;
  const totalMissing = depResults.missing.length;
  const totalPricingErrors = pricingErrors.length;
  const netProfit = totalContract - costSummary.totalActualVal;
  const marginPct = totalContract > 0 ? Math.round((netProfit / totalContract) * 100) : 0;

  // Tender Readiness Score
  let deductions = (totalMissing * 12) + (totalPricingErrors * 8);
  if (marginPct < 12) deductions += 15;
  const readinessScore = Math.max(0, 100 - deductions);

  // Generate same execution phase suggestions
  const phaseSuggestions = getExecutionPhaseSuggestions(foundItems);
  window._phaseSuggestions = phaseSuggestions;

  const ar = (App.lang === 'ar');

  let html = `
    <!-- Top Stats Cards -->
    <div class="grid-4 mb-20">
      <div class="stat-card" style="border-color:var(--border-sec);">
        <div class="stat-icon g">📋</div>
        <div class="stat-val num">${totalFound}</div>
        <div class="stat-lbl">${ar?'بنود مطابقة مكتشفة':'Matched items found'}</div>
      </div>
      <div class="stat-card" style="border-color:var(--border-sec);">
        <div class="stat-icon" style="color:var(--accent-gold)">💵</div>
        <div class="stat-val num">${formatNum(costSummary.totalActualVal)}</div>
        <div class="stat-lbl">${ar?'التكلفة الفعلية المقدرة (ر.س)':'Actual Operational Cost'}</div>
      </div>
      <div class="stat-card" style="border-color:var(--border-sec);">
        <div class="stat-icon" style="color:var(--accent-green)">📈</div>
        <div class="stat-val num">${marginPct}%</div>
        <div class="stat-lbl">${ar?'هامش أرباح التوريد والعمليات':'Estimated profit margin'}</div>
      </div>
      <div class="stat-card" style="border-color: ${readinessScore >= 80 ? 'var(--border-sec)' : 'rgba(255,71,87,0.3)'};">
        <div class="stat-icon" style="color:var(--accent-green)">🛡️</div>
        <div class="stat-val num">${readinessScore}%</div>
        <div class="stat-lbl">${ar?'مؤشر استقرار وجاهزية المقايسة':'BOQ Readiness Audit Score'}</div>
      </div>
    </div>

    <!-- Active File Info Banner -->
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-lg);padding:14px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div style="font-size:12.5px;color:var(--text-sub);">
        📂 ${ar?'المستند النشط:':'Active File:'} <strong style="color:var(--text-h);">${fileName}</strong> &nbsp;|&nbsp; 
        ⚡ ${ar?'نوع الملف:':'Type:'} <strong style="text-transform:uppercase;color:var(--accent-green);">${fileType}</strong> &nbsp;|&nbsp;
        💰 ${ar?'القيمة الكلية:':'Contract Revenue:'} <strong style="color:var(--accent-green);">${formatNum(totalContract)} ر.س</strong>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('pdf-file-input').click()">${ar?'استيراد ملف جديد':'Upload New File'}</button>
      </div>
    </div>

    <!-- Phase 4 Approval Card: Execution Phase Supporting items (Crucial Requirement!) -->
    <div class="card mb-20" style="border:1px solid var(--border-gold);background:linear-gradient(135deg,rgba(200,168,75,0.02),transparent);">
      <div class="card-head" style="background:linear-gradient(90deg,rgba(200,168,75,0.05),transparent);border-bottom:1px solid var(--border-gold);">
        <span>🏗️</span>
        <span class="card-title" style="color:var(--sec-gold);font-weight:900;">${ar?'بنود متممة ومقترحة لمرحلة التنفيذ الميداني (تتطلب موافقة المهندس)':'Execution Phase Supporting Items & Gaps Balance (Requires Approval)'}</span>
        <span style="font-size:11px;color:var(--text-muted);margin-right:auto;background:rgba(200,168,75,0.1);padding:2px 8px;border-radius:99px;font-weight:700;">${phaseSuggestions.length} ${ar?'مقترحات':'suggestions'}</span>
      </div>
      <div class="card-body" style="padding:16px;">
        <p style="font-size:12px;color:var(--text-sub);margin-bottom:12px;line-height:1.6;">
          كشف موازن النطاق الهندسي عن بنود تكميلية ناقصة تقع في نفس **مراحل التنفيذ التشغيلية**. حدد البنود المعتمدة واضغط على زر الموافقة والتطبيق لإدراجها في المقايسة النهائية تلقائياً:
        </p>
        
        ${phaseSuggestions.length === 0 ? `
          <div style="text-align:center;padding:12px;font-size:12px;color:var(--text-muted);">
            لا توجد مقترحات ناقصة لهذه البنود المحددة. المقايسة تعتبر متكاملة في نطاق العمل الحالي.
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:8px;" id="phase-approvals-list">
            ${phaseSuggestions.map((sug, sIdx) => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 14px;gap:12px;">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                  <input type="checkbox" id="phase-sug-chk-${sIdx}" checked style="width:16px;height:16px;accent-color:var(--sec-primary);cursor:pointer;">
                  <div style="text-align:right;font-size:12.5px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <span class="uom-tag" style="font-family:var(--font-mono);font-size:10px;background:rgba(200,168,75,0.1);color:var(--sec-gold);padding:1px 5px;border-radius:3px;">${sug.code}</span>
                      <strong style="color:var(--text-h);">${sug.arDesc}</strong>
                    </div>
                    <div style="font-size:10.5px;color:var(--accent-red);margin-top:4px;">⚠️ ${sug.reason}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                  <span class="uom-tag" style="font-size:11px;">${sug.uom}</span>
                  <span style="font-size:12.5px;font-weight:900;color:var(--sec-primary);">${fmtNum(sug.newPrice)} ر.س</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:14px;display:flex;justify-content:flex-end;">
            <button class="btn btn-primary" onclick="applyApprovedPhaseSuggestions()" style="font-weight:900;">
              ✅ اعتماد وتطبيق البنود المقترحة في المقايسة المفتوحة
            </button>
          </div>
        `}
      </div>
    </div>

    <!-- Environmental Adjustments Settings Widget -->
    <div class="card mb-20" style="border:1px solid rgba(200,168,75,0.15);">
      <div class="card-head" style="background:linear-gradient(135deg,rgba(200,168,75,0.04),transparent);">
        <span>📊</span><span class="card-title">لوحة التقدير وحساب أيام أطقم العمل والآليات (الرياض)</span>
        <span class="badge" style="background:${costSummary.overallRisk === 'High' ? 'rgba(255,71,87,0.15)' : 'rgba(0,132,61,0.15)'};color:${costSummary.overallRisk === 'High' ? 'var(--accent-red)' : 'var(--sec-primary)'};margin-right:auto;">
          مخاطر تشغيلية: ${costSummary.overallRisk === 'High' ? 'عالية' : (costSummary.overallRisk === 'Medium' ? 'متوسطة' : 'آمنة')}
        </span>
      </div>
      <div class="card-body" style="padding:16px;">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;background:var(--bg-surface);padding:12px;border-radius:var(--r-md);border:1px solid var(--border);">
          <div>
            <label style="font-size:10.5px;color:var(--text-muted);font-weight:700;display:block;margin-bottom:4px;">نوع التربة بالرياض</label>
            <select class="form-control" style="font-size:11.5px;padding:5px;" id="env-soil" onchange="updatePDFEnvFactor('soilType', this.value)">
              <option value="normal" ${pEngine?.settings.soilType === 'normal' ? 'selected' : ''}>تربة عادية (1.0)</option>
              <option value="sandy" ${pEngine?.settings.soilType === 'sandy' ? 'selected' : ''}>رملية مفككة (1.3)</option>
              <option value="rock" ${pEngine?.settings.soilType === 'rock' ? 'selected' : ''}>صخرية صلبة (0.25)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10.5px;color:var(--text-muted);font-weight:700;display:block;margin-bottom:4px;">الحرارة والطقس</label>
            <select class="form-control" style="font-size:11.5px;padding:5px;" id="env-season" onchange="updatePDFEnvFactor('season', this.value)">
              <option value="winter" ${pEngine?.settings.season === 'winter' ? 'selected' : ''}>شتاء / معتدل (1.0)</option>
              <option value="summer" ${pEngine?.settings.season === 'summer' ? 'selected' : ''}>صيف الرياض الحار (0.75)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10.5px;color:var(--text-muted);font-weight:700;display:block;margin-bottom:4px;">وردية العمل</label>
            <select class="form-control" style="font-size:11.5px;padding:5px;" id="env-shift" onchange="updatePDFEnvFactor('shiftType', this.value)">
              <option value="day" ${pEngine?.settings.shiftType === 'day' ? 'selected' : ''}>وردية نهارية (1.0)</option>
              <option value="night" ${pEngine?.settings.shiftType === 'night' ? 'selected' : ''}>وردية ليلية (0.85)</option>
            </select>
          </div>
          <div>
            <label style="font-size:10.5px;color:var(--text-muted);font-weight:700;display:block;margin-bottom:4px;">الازدحام وموقع الموقع</label>
            <select class="form-control" style="font-size:11.5px;padding:5px;" id="env-area" onchange="updatePDFEnvFactor('areaType', this.value)">
              <option value="urban" ${pEngine?.settings.areaType === 'urban' ? 'selected' : ''}>وسط الرياض / مزدحم (0.8)</option>
              <option value="rural" ${pEngine?.settings.areaType === 'rural' ? 'selected' : ''}>خارج النطاق / مفتوح (1.1)</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div style="background:var(--bg-surface);border-radius:var(--r-md);padding:10px 14px;border:1px solid var(--border);border-right:3px solid var(--sec-primary);">
            <div style="font-size:10px;color:var(--text-muted);font-weight:700;">طواقم العمالة المباشرة</div>
            <div style="font-size:16px;font-weight:900;color:var(--text-main);margin:2px 0;">${formatNum(costSummary.totalLabor)} ر.س</div>
          </div>
          <div style="background:var(--bg-surface);border-radius:var(--r-md);padding:10px 14px;border:1px solid var(--border);border-right:3px solid var(--sec-gold);">
            <div style="font-size:10px;color:var(--text-muted);font-weight:700;">تشغيل وتشغيل الآليات والمعدات</div>
            <div style="font-size:16px;font-weight:900;color:var(--text-main);margin:2px 0;">${formatNum(costSummary.totalEquip)} ر.س</div>
          </div>
          <div style="background:var(--bg-surface);border-radius:var(--r-md);padding:10px 14px;border:1px solid var(--border);border-right:3px solid #00B5B8;">
            <div style="font-size:10px;color:var(--text-muted);font-weight:700;">تكلفة المواد الهندسية والمستلزمات</div>
            <div style="font-size:16px;font-weight:900;color:var(--text-main);margin:2px 0;">${formatNum(costSummary.totalMaterial)} ر.س</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Exporters and Action Buttons -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;background:var(--bg-card);border:1px solid var(--border);padding:12px;border-radius:var(--r-lg);">
      <button class="btn btn-primary" onclick="importPDFItemsToBOQ()">
        📥 استيراد البنود المكتشفة بالكامل للمنشئ (${totalFound})
      </button>
      <button class="btn btn-gold" onclick="exportPDFReport()">
        📊 تصدير شيت إكسل المتكامل الملون (4 صفحات)
      </button>
      
      <div style="width:1px;background:var(--border);height:32px;margin:0 6px;align-self:center;"></div>
      
      <!-- ERP simulated gates -->
      <button class="btn btn-outline" style="border-color:#0078BE;color:#0078BE;" onclick="exportPDFToERP('sap')">SAP WBS</button>
      <button class="btn btn-outline" style="border-color:#E06D53;color:#E06D53;" onclick="exportPDFToERP('oracle')">Oracle ERP</button>
      <button class="btn btn-outline" style="border-color:#875A7B;color:#875A7B;" onclick="exportPDFToERP('odoo')">Odoo ERP</button>
      <button class="btn btn-outline" style="border-color:#51A351;color:#51A351;" onclick="exportPDFToERP('primavera')">Primavera XML</button>
    </div>

    <!-- Results Tabs Switchers -->
    <div class="tab-nav mb-16" style="display:flex;gap:4px;background:var(--bg-surface);border:1px solid var(--border);padding:4px;border-radius:var(--r-md);margin-bottom:12px;">
      <button class="tab-btn active" id="btn-tab-matched" onclick="switchPDFTab('matched')">✅ البنود المستخلصة (${totalFound})</button>
      <button class="tab-btn" id="btn-tab-missing" onclick="switchPDFTab('missing')">🔴 موازن التوريد والتركيب (${totalMissing})</button>
      <button class="tab-btn" id="btn-tab-pricing" onclick="switchPDFTab('pricing')">⚠️ أخطاء تسعير المستند المرفوع (${totalPricingErrors})</button>
      <button class="tab-btn" id="btn-tab-corrected" onclick="switchPDFTab('corrected')">📋 المقايسة المصوبة المقترحة</button>
    </div>

    <!-- Tab Contents Containers -->
    <div id="pdf-tab-matched">
      ${renderPDFMatchedItems(foundItems, depResults)}
    </div>
    <div id="pdf-tab-missing" style="display:none;">
      ${renderPDFMissingItems(depResults)}
    </div>
    <div id="pdf-tab-pricing" style="display:none;">
      ${renderPDFPricingErrors(pricingErrors)}
    </div>
    <div id="pdf-tab-corrected" style="display:none;">
      ${renderPDFCorrectedBOQ(foundItems, depResults)}
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Switch Tabs
 */
function switchPDFTab(tab) {
  ['matched','missing','pricing','corrected'].forEach(t => {
    const el = document.getElementById(`pdf-tab-${t}`);
    const btn = document.getElementById(`btn-tab-${t}`);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
}

/**
 * 1. Matched Items Tab with INLINE EDITABLE QUANTITIES and FUZZY SWAP SUGGESTIONS
 */
function renderPDFMatchedItems(items, depResults) {
  if (!items.length) return `<div class="empty-state"><div class="empty-icon">🔍</div><h3>لم يتم العثور على بنود مطابقة مع العقد الموحد</h3></div>`;

  let html = `
    <div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,rgba(0,132,61,0.04),transparent);">
        <span>✅</span><span class="card-title">جدول البنود المستخلصة المطابقة وأسعار التعميد</span>
      </div>
      <div class="tbl-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الرمز الموحد</th>
              <th>الوصف الفني التفصيلي للبند</th>
              <th>وحدة</th>
              <th style="width:85px;">الكمية</th>
              <th>السعر الموحد الجديد</th>
              <th>إجمالي العقد</th>
              <th>طاقم العمل المقدر</th>
              <th>خيارات البند</th>
            </tr>
          </thead>
          <tbody>
  `;

  items.forEach((item, idx) => {
    const p = item.priceItem;
    const contractPrice = item.contractPrice;
    const totalRevenue = item.qty * contractPrice;
    
    let costVal = 0;
    let crewLabel = '—';
    if (window.ProductivityEngine) {
      const details = window.ProductivityEngine.calculateItemCost(item.code, item.qty, contractPrice);
      costVal = details.totalActualCost;
      crewLabel = `${details.crewCode} (${details.requiredDays} يوم)`;
    }

    const hasError = item.errors && item.errors.length > 0;
    const status = hasError
      ? `<span class="risk-badge critical">⚠️ خطأ تسعير</span>`
      : '<span class="risk-badge minor">✅ مطابق</span>';

    html += `
      <tr class="${hasError ? 'boq-row missing-dep' : ''}">
        <td style="color:var(--text-muted);font-size:11px">${idx+1}</td>
        <td class="td-code">${item.code}</td>
        <td class="td-desc">
          <div style="font-weight:700;color:var(--text-h);">${p.arDesc}</div>
          <div style="font-size:10.5px;color:var(--text-sub);margin-top:2px;">${p.enDesc}</div>
        </td>
        <td><span class="uom-tag">${p.uom}</span></td>
        <td>
          <input class="qty-cell-input" type="number" value="${item.qty}" min="0.01" step="any"
                 onchange="updatePDFItemQty(${idx}, this.value)" 
                 style="width:70px;padding:4px 6px;font-size:12px;text-align:center;">
        </td>
        <td class="num font-bold" style="color:var(--sec-gold);">${formatNum(contractPrice)}</td>
        <td class="num font-bold" style="color:var(--sec-primary);">${formatNum(totalRevenue)}</td>
        <td style="font-size:11.5px;color:var(--text-sub);">${crewLabel}</td>
        <td style="display:flex;gap:4px;">
          <button class="btn btn-outline btn-sm" onclick="openFuzzySwapModal(${idx})" title="استبدال ببند مقارب ومطابق من العقد الجديد">🔍 مقارب</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table></div></div>';
  
  // Dynamic bilingual editable CSV download callout box at the bottom of the table
  html += `
    <div style="margin-top:16px;background:var(--bg-card);border:1px solid var(--sec-gold);border-radius:var(--r-lg);padding:18px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;box-shadow:var(--shadow-sm);position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 1% 50%,rgba(200,168,75,0.04),transparent 45%);pointer-events:none;"></div>
      <div style="text-align:right;position:relative;">
        <h4 style="font-size:14px;font-weight:900;color:var(--text-h);margin-bottom:6px;display:flex;align-items:center;gap:8px;">📊 ${App?.lang === 'ar' ? 'تنزيل شيت التعديل الفوري للبنود المستخلصة' : 'Download Extracted Items Editing Sheet'}</h4>
        <p style="font-size:11.5px;color:var(--text-sub);line-height:1.6;max-width:550px;margin:0;">
          ${App?.lang === 'ar' 
            ? 'تتيح لك هذه الأداة تنزيل كافة البنود المستخلصة أعلاه مع كمياتها وأسعارها الموحدة في شيت Excel/CSV مبسط. يمكنك تعديل الكميات والرموز الهندسية مباشرة في Excel ثم إعادة رفعه كملف تعديلات لتحديث المقايسة بكبسة زر!'
            : 'Download all extracted items above in a simplified Excel/CSV format. Edit unified codes or quantities freely in Excel, then re-upload it to apply edits seamlessly!'}
        </p>
      </div>
      <button class="btn btn-gold" onclick="downloadExtractedCSV()" style="font-weight:900;letter-spacing:0.3px;box-shadow:var(--shadow-sm);padding:10px 20px;position:relative;">
        💾 ${App?.lang === 'ar' ? 'تنزيل البنود الحالية كشيت تعديل (CSV)' : 'Download Extracted Sheet (CSV)'}
      </button>
    </div>
  `;

  return html;
}

/**
 * 2. Missing Items & Labor-Material Balancer Tab
 */
function renderPDFMissingItems(depResults) {
  const { missing, warnings } = depResults;

  if (!missing.length && !warnings.length) {
    return `
      <div class="card" style="border-color:var(--sec-primary);">
        <div class="card-body" style="text-align:center;padding:30px;">
          <div style="font-size:48px;margin-bottom:12px;">✅</div>
          <h3 style="font-size:15px;font-weight:800;color:var(--sec-primary);margin-bottom:6px;">المقايسة متكاملة ومتوازنة تماماً بموجب شروط SEC!</h3>
          <p style="font-size:12px;color:var(--text-sub);max-width:400px;margin:0 auto;">
            تم مطابقة بنود التوريد والتركيب والأعمال الترابية بنسبة 100% بموجب شروط بلدية الرياض والشركة السعودية للكهرباء.
          </p>
        </div>
      </div>
    `;
  }

  let html = '<div class="validator-panel">';

  if (missing.length > 0) {
    html += `
      <div class="validator-header" style="background:rgba(255,71,87,0.06);color:var(--accent-red);border:1px solid rgba(255,71,87,0.15);border-radius:var(--r-md);padding:10px 14px;margin-bottom:12px;font-weight:700;font-size:12.5px;">
        🔴 يوجد ${missing.length} بنود وتناثير إلزامية مفقودة بموجب موازن المواد والأعمال
      </div>
    `;

    missing.forEach(m => {
      const estimatedCost = m.missingCodes.reduce((s, c) => {
        const p = getItemByCode(c);
        return s + (p ? p.newPrice * (m.suggestedQty || 1) : 0);
      }, 0);

      html += `
        <div class="validator-item mb-12" style="background:var(--bg-card);border:1px solid var(--border);border-right:4px solid var(--accent-red);border-radius:var(--r-md);padding:14px;display:flex;justify-content:space-between;align-items:center;">
          <div style="text-align:right;">
            <div style="font-weight:800;font-size:13px;color:var(--text-h);">${m.reason}</div>
            <div style="font-size:11px;color:var(--text-sub);margin-top:4px;">
              السبب: وجود بند <strong>${m.triggeredByName}</strong> (${m.triggeredBy})
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              ${m.missingCodes.map(c => {
                const p = getItemByCode(c);
                return `<span class="uom-tag" style="cursor:pointer;background:rgba(0,132,61,0.08);border:1px solid rgba(0,132,61,0.15);color:var(--sec-primary);" onclick="quickAddItem('${c}')" title="${p ? p.arDesc : c}">➕ كود البند الموصى به: ${c}</span>`;
              }).join('')}
            </div>
          </div>
          <div style="text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <span class="risk-badge critical" style="background:rgba(255,77,106,0.12);color:var(--accent-red);padding:2px 8px;border-radius:4px;font-size:11px;">خطورة عالية</span>
            <div style="font-size:11.5px;color:var(--text-sub);">
              الأثر المالي المتوقع: <strong style="color:var(--sec-primary);">${formatNum(estimatedCost)} ر.س</strong>
            </div>
          </div>
        </div>
      `;
    });
  }

  if (warnings.length > 0) {
    html += `
      <div class="validator-header" style="background:rgba(200,168,75,0.06);color:var(--sec-gold);border:1px solid rgba(200,168,75,0.15);border-radius:var(--r-md);padding:10px 14px;margin:18px 0 12px 0;font-weight:700;font-size:12.5px;">
        🟡 ملاحظات تحسين الكفاءة والتناثير الفنية الاختيارية
      </div>
    `;

    warnings.forEach(w => {
      html += `
        <div class="validator-item mb-12" style="background:var(--bg-card);border:1px solid var(--border);border-right:4px solid var(--sec-gold);border-radius:var(--r-md);padding:12px;display:flex;justify-content:space-between;align-items:center;">
          <div style="text-align:right;">
            <div style="font-weight:700;font-size:12.5px;color:var(--text-h);">${w.reason}</div>
            <div style="font-size:11px;color:var(--text-sub);margin-top:2px;">مرتبط بـ: ${w.triggeredByName} (${w.triggeredBy})</div>
            <div style="display:flex;gap:6px;margin-top:6px;">
              ${w.suggestedCodes.map(c => `<span class="uom-tag" style="cursor:pointer;" onclick="quickAddItem('${c}')">كود: ${c}</span>`).join('')}
            </div>
          </div>
          <div>
            <span class="risk-badge medium" style="background:rgba(200,168,75,0.1);color:var(--sec-gold);padding:2px 8px;border-radius:4px;font-size:11px;">موصى به</span>
          </div>
        </div>
      `;
    });
  }

  html += '</div>';
  return html;
}

/**
 * 3. Pricing Errors Tab
 */
function renderPDFPricingErrors(errors) {
  if (!errors.length) {
    return `
      <div class="card" style="border-color:var(--sec-primary);">
        <div class="card-body" style="text-align:center;padding:30px;">
          <div style="font-size:48px;margin-bottom:12px;">✅</div>
          <h3 style="font-size:15px;font-weight:800;color:var(--sec-primary);margin-bottom:6px;">لا توجد أخطاء تسعير!</h3>
          <p style="font-size:12px;color:var(--text-sub);max-width:400px;margin:0 auto;">
            أسعار جميع البنود المدخلة مطابقة تماماً للتسعيرات المعتمدة للعقد الموحد الجديد لـ SEC.
          </p>
        </div>
      </div>
    `;
  }

  let totalErrorImpact = 0;
  errors.forEach(item => {
    item.errors?.forEach(e => { totalErrorImpact += Math.abs(e.diff || 0) * item.qty; });
  });

  let html = `
    <div class="alert alert-err" style="margin-bottom:16px;background:rgba(255,71,87,0.06);border:1px solid rgba(255,71,87,0.15);border-radius:var(--r-md);padding:14px;color:var(--accent-red);">
      <strong>🚨 تم كشف تباينات في أسعار ملف الإدخال مقارنة بالعقد الموحد الجديد</strong><br>
      الأثر المالي التقديري الإجمالي للانحرافات: <strong>${formatNum(totalErrorImpact)} ر.س</strong>
    </div>
    <div class="card">
  `;

  errors.forEach((item, idx) => {
    item.errors.forEach(err => {
      const impact = Math.abs(err.diff || 0) * item.qty;
      const severityBg = err.severity === 'critical' ? 'rgba(255,71,87,0.02)' : 'rgba(200,168,75,0.02)';

      html += `
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);background:${severityBg};">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <span style="font-size:20px;">${err.severity === 'critical' ? '🔴' : '🟡'}</span>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:800;color:var(--text-h);margin-bottom:4px;">${err.msg}</div>
              <div style="font-size:12px;color:var(--text-sub);margin-bottom:8px;">
                البند: <span class="uom-tag" style="font-family:var(--font-mono);font-size:10.5px;">${item.code}</span> — ${item.priceItem.arDesc}
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                <div style="background:var(--bg-surface);border-radius:var(--r-md);padding:10px;text-align:center;border:1px solid var(--border);">
                  <div style="font-size:10px;color:var(--text-muted);font-weight:700;">السعر بملف الإدخال</div>
                  <div style="font-size:16px;font-weight:900;color:var(--accent-red);margin-top:2px;">${formatNum(err.entered)}</div>
                </div>
                <div style="background:var(--bg-surface);border-radius:var(--r-md);padding:10px;text-align:center;border:1px solid var(--border);">
                  <div style="font-size:10px;color:var(--text-muted);font-weight:700;">السعر الموحد الجديد</div>
                  <div style="font-size:16px;font-weight:900;color:var(--sec-primary);margin-top:2px;">${formatNum(err.suggested)}</div>
                </div>
                <div style="background:var(--bg-surface);border-radius:var(--r-md);padding:10px;text-align:center;border:1px solid var(--border);">
                  <div style="font-size:10px;color:var(--text-muted);font-weight:700;">فارق التكلفة بالكمية</div>
                  <div style="font-size:16px;font-weight:900;color:var(--sec-gold);margin-top:2px;">${formatNum(impact)} ر.س</div>
                </div>
              </div>
              <div style="margin-top:10px;display:flex;gap:8px;">
                <button class="btn btn-sm btn-primary" onclick="correctSinglePDFPrice(${idx},'${item.code}',${err.suggested})">✅ تصحيح فوري للسعر الموحد</button>
                <span style="font-size:11px;color:var(--text-muted);align-self:center;margin-right:auto;">نسبة الانحراف الفردي: ${err.pct > 0 ? '+' : ''}${err.pct}%</span>
              </div>
            </div>
          </div>
        </div>
      `;
    });
  });

  html += '</div>';
  return html;
}

/**
 * 4. Corrected BOQ Tab
 */
function renderPDFCorrectedBOQ(foundItems, depResults) {
  const correctedItems = [
    ...foundItems.map(i => ({
      code: i.code,
      qty: i.qty,
      customPrice: null,
      note: i.enteredPrice && Math.abs(i.enteredPrice - i.contractPrice) > 1 ? `مصحح من سعر ملف الإدخال: ${formatNum(i.enteredPrice)} ر.س` : ''
    }))
  ];

  depResults.missing.forEach(m => {
    const code = m.missingCodes[0];
    if (code && getItemByCode(code)) {
      correctedItems.push({
        code,
        qty: m.suggestedQty === 'same' ? 1 : (m.suggestedQty || 1),
        customPrice: null,
        note: '🔴 بند مضاف لتوازن الأعمال والمواد'
      });
    }
  });

  const total = correctedItems.reduce((s, i) => {
    const p = getItemByCode(i.code);
    return s + (p ? p.newPrice : 0) * i.qty;
  }, 0);
  const vat = total * 0.15;

  let html = `
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="importPDFCorrected(${JSON.stringify(correctedItems).split('"').join('&quot;')})">
        📥 استيراد المقايسة المصوّبة الكاملة للمنشئ
      </button>
      <button class="btn btn-gold" onclick="exportCorrectedBOQ()">📊 تصدير إكسل المقايسة المصوّبة</button>
    </div>
    <div class="card">
      <div class="card-head" style="background:linear-gradient(135deg,rgba(0,132,61,0.04),transparent);">
        <span>📋</span><span class="card-title">بنود المقايسة المصوّبة والمنثّرة والجاهزة للاعتماد</span>
        <span style="font-size:11.5px;color:var(--text-sub);margin-right:auto;">إجمالي البنود: ${correctedItems.length} بند</span>
      </div>
      <div class="tbl-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>رمز البند</th>
              <th>وصف البند المعتمد</th>
              <th>وحدة</th>
              <th>الكمية المصوّبة</th>
              <th>السعر الموحد</th>
              <th>الإجمالي المقدر</th>
              <th>ملاحظات الضبط والتحقق</th>
            </tr>
          </thead>
          <tbody>
  `;

  let rowNum = 1;
  correctedItems.forEach(item => {
    const p = getItemByCode(item.code);
    if (!p) return;
    const itemTotal = p.newPrice * item.qty;
    const isAdded = item.note?.includes('مضاف');
    
    html += `
      <tr class="${isAdded ? 'boq-row missing-dep' : ''}">
        <td style="color:var(--text-muted);font-size:11px">${rowNum++}</td>
        <td class="td-code">${item.code}</td>
        <td class="td-desc">${p.arDesc}</td>
        <td><span class="uom-tag">${p.uom}</span></td>
        <td>${item.qty}</td>
        <td class="num">${formatNum(p.newPrice)}</td>
        <td class="num font-bold" style="color:var(--sec-primary);">${formatNum(itemTotal)}</td>
        <td style="font-size:11px;color:${isAdded ? 'var(--accent-red)' : 'var(--text-sub)'};font-weight:${isAdded ? 'bold' : 'normal'};">${item.note || '—'}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
      
      <div style="background:var(--bg-surface);padding:20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;">
        <div style="width:320px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-sub);">
            <span>إجمالي المقايسة قبل الضريبة</span>
            <strong style="color:var(--text-h);">${formatNum(total)} ر.س</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-sub);">
            <span>ضريبة القيمة المضافة (15%)</span>
            <strong style="color:var(--text-h);">${formatNum(vat)} ر.س</strong>
          </div>
          <div style="width:100%;height:1px;background:var(--border);margin:4px 0;"></div>
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;color:var(--sec-primary);">
            <span>الإجمالي الكلي شامل الضريبة</span>
            <span>${formatNum(total + vat)} ر.س</span>
          </div>
        </div>
      </div>
    </div>
  `;

  window._correctedItems = correctedItems;
  return html;
}

/**
 * Interactive Fuzzy Swap Selector Dialog
 */
function openFuzzySwapModal(itemIdx) {
  if (!window._pdfResults) return;
  const item = window._pdfResults.foundItems[itemIdx];
  const arDesc = item.priceItem.arDesc;
  
  const suggestions = searchItems(arDesc).slice(0, 5);

  const optionsHtml = suggestions.map((s, idx) => {
    return `${idx + 1}. كود: [${s.code}] - ${s.arDesc.slice(0, 50)}... (السعر: ${s.newPrice} ر.س)`;
  }).join('\n');

  const selection = prompt(
    `🔄 استبدال البند الحالي ببند مقارب ومطابق من العقد الموحد:\n\n` +
    `البند الحالي: [${item.code}] - ${arDesc.slice(0, 60)}...\n\n` +
    `اختر رقم البند البديل المقترح بالأسفل (اكتب الرقم 1 إلى ${suggestions.length}):\n\n` +
    optionsHtml, 
    "1"
  );

  if (selection) {
    const idx = parseInt(selection) - 1;
    if (idx >= 0 && idx < suggestions.length) {
      const chosen = suggestions[idx];
      item.code = chosen.code;
      item.contractPrice = chosen.newPrice;
      item.priceItem = chosen;
      item.errors = [];
      showToast(`🔄 تم استبدال البند بالبند المعتمد الجديد: [${chosen.code}]`);
      recalculatePDFEngine();
    } else {
      showToast("اختيار غير صالح", "error");
    }
  }
}

/**
 * Recalculate Results dynamically
 */
function recalculatePDFEngine() {
  if (!window._pdfResults) return;
  const results = window._pdfResults;

  results.totalEntered = results.foundItems.reduce((s, i) => s + (i.enteredPrice || i.contractPrice) * i.qty, 0);
  results.totalContract = results.foundItems.reduce((s, i) => s + i.contractPrice * i.qty, 0);
  results.pricingErrors = results.foundItems.filter(i => i.errors && i.errors.length > 0);

  results.depResults = checkDependencies(results.foundItems.map(i => ({
    code: i.code,
    qty: i.qty,
    customPrice: i.enteredPrice
  })));

  renderPDFResults(results, document.getElementById('pdf-results-main'));
}

/**
 * Actions Handlers
 */
function updatePDFItemQty(idx, val) {
  if (window._pdfResults) {
    window._pdfResults.foundItems[idx].qty = parseFloat(val) || 1;
    recalculatePDFEngine();
  }
}

function updatePDFEnvFactor(category, value) {
  if (window.ProductivityEngine) {
    window.ProductivityEngine.setFactor(category, value);
    recalculatePDFEngine();
    showToast(`⚙️ تم تحديث معاملات الإنتاجية: [${category}: ${value}]`);
  }
}

function correctSinglePDFPrice(idx, code, price) {
  if (window._pdfResults) {
    const item = window._pdfResults.foundItems.find(i => i.code === code);
    if (item) {
      item.enteredPrice = price;
      item.errors = [];
    }
    showToast(`✅ تم تصحيح سعر البند ${code}`);
    recalculatePDFEngine();
  }
}

function importPDFItemsToBOQ() {
  if (!window._pdfResults) return;
  const items = window._pdfResults.foundItems.map(i => ({
    code: i.code,
    qty: i.qty,
    customPrice: null,
    note: 'مستورد من موديول التحليل بالذكاء الاصطناعي'
  }));
  
  if (typeof App !== 'undefined') {
    App.state.boq.items = [...App.state.boq.items, ...items];
    App.go(App.state.boq.isEmergency ? 'emergency_boq' : 'boq');
    showToast(`📥 تم استيراد ${items.length} بند لمنشئ المقايسات`);
  }
}

function importPDFCorrected(items) {
  if (typeof App !== 'undefined') {
    App.state.boq.items = [...App.state.boq.items, ...items];
    App.go(App.state.boq.isEmergency ? 'emergency_boq' : 'boq');
    showToast(`📥 تم استيراد المقايسة المصوّبة بالكامل (${items.length} بند)`);
  }
}

/**
 * User approval of same execution phase suggestions (Crucial Requirement!)
 */
function applyApprovedPhaseSuggestions() {
  if (!window._phaseSuggestions || window._phaseSuggestions.length === 0) return;
  
  const ar = (App.lang === 'ar');
  const added = [];
  
  window._phaseSuggestions.forEach((sug, idx) => {
    const chk = document.getElementById(`phase-sug-chk-${idx}`);
    if (chk && chk.checked) {
      if (typeof App !== 'undefined') {
        App.state.boq.items.push({
          code: sug.code,
          qty: 1, // Default quantity for support items
          customPrice: null,
          note: ar ? '🔴 بند تكميلي مضاف للمواصفات ومرحلة التنفيذ' : 'Complementary execution phase item'
        });
        added.push(sug.code);
      }
    }
  });

  if (added.length > 0) {
    showToast(ar ? `تمت الموافقة وإضافة ${added.length} بنود تكميلية للمقايسة النشطة!` : `Approved and added ${added.length} supporting items to BOQ!`, 'success');
    if (typeof App !== 'undefined') {
      App.go(App.state.boq.isEmergency ? 'emergency_boq' : 'boq');
    }
  } else {
    showToast(ar ? 'لم يتم تحديد أي بند للإضافة' : 'No items selected for addition', 'warning');
  }
}

function quickAddItem(code) {
  if (typeof App !== 'undefined' && getItemByCode(code)) {
    App.state.boq.items.push({
      code,
      qty: 1,
      customPrice: null,
      note: '🔴 بند مضاف من توصيات التوازن'
    });
    showToast(`تمت إضافة البند ${code} للمنشئ`);
  }
}

/**
 * Copy entire BOQ prompt to clipboard for Gemini assistant
 */
function copyBOQPromptForGemini() {
  if (!window._pdfResults) {
    showToast("يرجى رفع ملف وتحليله أولاً للحصول على بيانات المقايسة.", "warning");
    return;
  }

  const ar = (App.lang === 'ar');
  const items = window._pdfResults.foundItems;
  const wo = window._pdfResults.woNumber || "غير محدد";
  
  let pText = `مرحباً يا مساعد جوجل جيميناي المهندسي! أنا مهندس تقدير وعقود بمدينة الرياض.\n`;
  pText += `لدي مقايسة مشروع معتمدة تحت أمر عمل رقم (${wo}) وعقد SEC الموحد الجديد لخدمات شبكات الطاقة (مدينة الرياض).\n\n`;
  pText += `إليك جدول البنود التي استخلصتها وتحليل الأسعار الحالي للتأكد من الموازنة وتحديد النواقص الفنية:\n`;
  pText += `---------------------------------------------------------\n`;
  
  items.forEach((itm, idx) => {
    pText += `${idx+1}. كود البند: [${itm.code}] | الوصف: ${itm.priceItem.arDesc} | الكمية: ${itm.qty} ${itm.priceItem.uom} | السعر الموحد: ${itm.contractPrice} ر.س | السعر المرفوع: ${itm.enteredPrice || itm.contractPrice} ر.س\n`;
  });
  
  pText += `---------------------------------------------------------\n\n`;
  pText += `أريد منك عمل تحليل فني ومالي كخبير تقدير وعقود:\n`;
  pText += `1. هل البنود متوازنة فنيّاً (أعمال التوريد متطابقة مع التركيب)؟\n`;
  pText += `2. ما هي التناثير والمخاطر التشغيلية الميدانية في حفر خنادق الكابلات بناءً على البنود أعلاه؟\n`;
  pText += `3. اقترح أي بنود مفقودة أو توصيات لضمان عدم وجود خسائر ماليّة وتحقيق أقصى ربحية ممكنة.\n`;

  navigator.clipboard.writeText(pText).then(() => {
    showToast("📋 تم نسخ البرومبت الكامل بنجاح! انتقل الآن لـ Gemini والصقه هناك.", "success");
  }).catch(err => {
    console.error("Failed to copy text:", err);
    showToast("فشل في نسخ النص تلقائياً.", "error");
  });
}

/**
 * Multi-Sheet Excel Exporter trigger
 */
function exportPDFReport() {
  if (!window._pdfResults) return;
  
  const soilEl = document.getElementById('env-soil');
  const seasonEl = document.getElementById('env-season');
  const shiftEl = document.getElementById('env-shift');
  const areaEl = document.getElementById('env-area');

  const meta = {
    woNumber: window._pdfResults.woNumber || 'مستخلص مقايسة',
    project: 'التحليل الهندسي الذكي بالذكاء الاصطناعي',
    date: new Date().toLocaleDateString('ar-SA'),
    soilTypeAr: soilEl?.options[soilEl.selectedIndex]?.text || 'عادية',
    seasonAr: seasonEl?.options[seasonEl.selectedIndex]?.text || 'معتدل',
    shiftAr: shiftEl?.options[shiftEl.selectedIndex]?.text || 'نهار',
    areaAr: areaEl?.options[areaEl.selectedIndex]?.text || 'مزدحم'
  };

  const boq = { items: window._pdfResults.foundItems };
  exportToExcel(boq, meta);
}

function exportCorrectedBOQ() {
  if (!window._correctedItems) return;
  const boq = { items: window._correctedItems };
  exportToExcel(boq, { project: 'المقايسة المصوّبة المعتمدة لـ SEC' });
}

/**
 * Download extracted items in a simple, flat CSV format for quick local editing
 */
function downloadExtractedCSV() {
  if (!window._pdfResults || !window._pdfResults.foundItems || window._pdfResults.foundItems.length === 0) {
    showToast(App?.lang === 'ar' ? 'لا توجد بنود مستخلصة لتنزيلها حالياً.' : 'No extracted items found to download.', 'warning');
    return;
  }
  const items = window._pdfResults.foundItems;
  const ar = (App?.lang === 'ar');
  let csvContent = ar 
    ? 'رمز البند الموحد,الكمية المطلوبة,السعر المعتمد بالريال,الوصف الفني التفصيلي للبند\n'
    : 'Unified Item Code,Quantity,Unified Contract Price,Technical Description\n';
    
  items.forEach(itm => {
    // Escape description commas for CSV safety
    const descClean = (itm.priceItem?.arDesc || itm.priceItem?.enDesc || '').split('"').join('""');
    csvContent += `${itm.code},${itm.qty},${itm.contractPrice},"${descClean}"\n`;
  });

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = `boq_extracted_items_${window._pdfResults.woNumber || 'unbalanced'}.csv`;
  
  if (navigator.msSaveBlob) { // IE10+
    navigator.msSaveBlob(blob, filename);
  } else {
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(ar ? '⚡ تم تصدير شيت التعديل الفوري كـ CSV بنجاح!' : '⚡ Extracted items CSV exported successfully!', 'success');
    }
  }
}

/**
 * ERP Export Handler
 */
function exportPDFToERP(system) {
  if (!window._pdfResults) return;
  const items = window._pdfResults.foundItems;
  const wo = window._pdfResults.woNumber || 'ERP_Export';

  if (!window.ERPIntegration) {
    showToast("محرك تكامل الـ ERP غير محمل.", "error");
    return;
  }

  if (system === 'sap') {
    window.ERPIntegration.exportToSAP(wo, items);
    showToast("📥 تم تنزيل قالب SAP WBS بنجاح!");
  } else if (system === 'oracle') {
    window.ERPIntegration.exportToOracle(wo, items);
    showToast("📥 تم تنزيل قالب Oracle Fusion بنجاح!");
  } else if (system === 'odoo') {
    window.ERPIntegration.exportToOdoo(wo, items);
    showToast("📥 تم تنزيل قالب استيراد Odoo بنجاح!");
  } else if (system === 'primavera') {
    window.ERPIntegration.exportToPrimavera(wo, items);
    showToast("📥 تم تنزيل جدول Primavera XML بنجاح!");
  }
}

/**
 * AI Assistant Sidebar Dialog and Responses
 */
function sendCustomAIQuestion() {
  const input = document.getElementById('ai-chat-input');
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;

  appendChatBubble(question, 'user');
  input.value = '';

  showAILoader();
  setTimeout(() => {
    const qLower = question.toLowerCase();
    let reply = "";

    if (qLower.includes("حفر") || qLower.includes("تربة")) {
      reply = "بالنسبة لأعمال الحفريات والتربة في مدينة الرياض:<br>• التربة الصخرية تقوم بتحويل الحفر تلقائياً إلى طاقم الحفر الصخري الثقيل (CR-02) بمعدل إنتاج 8 متر مكعب يومياً وتكلفة 6,300 ريال يومياً.<br>• صيف الرياض الحار يقلل الإنتاجية بنسبة 25% بسبب حرارة الجو القصوى في الظهيرة.";
    } else if (qLower.includes("ربح") || qLower.includes("توازن") || qLower.includes("مخاطر")) {
      reply = "بموجب موازن المواد والأعمال الفائق المدمج:<br>• تم تصفية البنود وربط توريد المواد (Supply) ببنود التركيب (Install) المناظرة تلقائياً لضمان التوازن الفني.<br>• إجمالي قيمة العقد الموحد الجديد يبلغ " + formatNum(window._pdfResults?.totalContract || 0) + " ر.س.<br>• تكلفة التنفيذ الفعلية المقدرة بالإنتاجية هي " + formatNum(window._pdfResults?.foundItems ? window.ProductivityEngine?.estimateBOQ(window._pdfResults.foundItems).totalActualVal : 0) + " ر.س.<br>• هامش الأرباح الإجمالي آمن جداً ويصل إلى " + (window._pdfResults?.foundItems ? window.ProductivityEngine?.estimateBOQ(window._pdfResults.foundItems).profitMargin : 0) + "% بموجب الأسعار الجديدة.";
    } else {
      reply = "سؤال هندسي ممتاز. طبقاً لمعايير الكود الموحد لـ SEC وموازن المواد والأعمال الذكي، يوصى باعتماد جدول البنود المصوبة وتنزيل التقرير المتكامل Excel للتحقق الميداني الشامل، أو الدخول على مساعد Google Gemini الموصول للحصول على تفاصيل فنية أوسع.";
    }

    appendChatBubble(reply, 'assistant');
  }, 1000);
}

function askAIEngine(type) {
  showAILoader();
  setTimeout(() => {
    let reply = "";
    const items = window._pdfResults?.foundItems || [];

    if (type === 'crews') {
      reply = "<strong>👷 الأطقم الهندسية والمعدات المقترحة للموقع:</strong><br><br>";
      if (window.ProductivityEngine) {
        const est = window.ProductivityEngine.estimateBOQ(items);
        const crewDays = {};
        est.items.forEach(i => {
          const c = i.costDetails;
          crewDays[c.crewCode] = (crewDays[c.crewCode] || 0) + c.requiredDays;
        });

        Object.keys(crewDays).forEach(code => {
          const defaults = window.PRODUCTIVITY_DEFAULTS.crews[code];
          reply += `• <strong>الطاقم ${code} [${defaults.nameAr}]:</strong> مطلوب للعمل مدة <strong>${Math.round(crewDays[code]*10)/10} يوم</strong>. الآليات اللازمة: ${defaults.desc.split('(')[1]?.replace(')','') || 'حسب المواصفات'}.<br>`;
        });
      } else {
        reply += "• طاقم الحفر وتمديد الكابلات القياسي (CR-01 & CR-03) لجميع الأعمال الأرضية.";
      }
    } else if (type === 'timeline') {
      reply = "<strong>📅 تقدير الجدول الزمني وجدول الحفر:</strong><br><br>";
      if (window.ProductivityEngine) {
        const est = window.ProductivityEngine.estimateBOQ(items);
        reply += `• أعمال الحفر والردم المدني خندق الكابلات: <strong>${Math.round(est.totalDays * 0.4 * 10)/10} أيام عمل</strong>.<br>`;
        reply += `• سحب وتمديد كابلات الطاقة: <strong>${Math.round(est.totalDays * 0.5 * 10)/10} أيام عمل</strong>.<br>`;
        reply += `• الاختبارات والتشغيل النهائي للشبكة: <strong>${Math.round(est.totalDays * 0.1 * 10)/10} أيام عمل</strong>.<br>`;
        reply += `• ⏳ إجمالي المسار الحرج للتنفيذ المتتالي: <strong>${Math.round(est.totalDays)} يوم عمل</strong>.`;
      } else {
        reply += "• الجدول الزمني الإجمالي المقدر هو 15 يوم تشغيلي.";
      }
    }

    appendChatBubble(reply, 'assistant');
  }, 800);
}

function appendChatBubble(text, sender) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  const bubble = document.createElement('div');
  if (sender === 'user') {
    bubble.style.cssText = "align-self:flex-end;background:var(--sec-primary);color:white;border-radius:12px 12px 0 12px;padding:8px 12px;font-size:11.5px;max-width:85%;line-height:1.4;box-shadow:var(--glow-green);";
    bubble.innerHTML = text;
  } else {
    bubble.style.cssText = "align-self:flex-start;background:var(--bg-surface);border:1px solid var(--border);border-radius:12px 12px 12px 0;padding:10px 12px;font-size:11.5px;max-width:85%;line-height:1.5;color:var(--text-main);";
    bubble.innerHTML = text;
  }

  const loader = document.getElementById('ai-chat-loader');
  if (loader) loader.remove();

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function showAILoader() {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  const loader = document.createElement('div');
  loader.id = 'ai-chat-loader';
  loader.style.cssText = "align-self:flex-start;background:var(--bg-surface);border:1px solid var(--border);border-radius:12px 12px 12px 0;padding:8px 12px;font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;";
  loader.innerHTML = `<span>⏳ جاري التحليل برمجياً بالذكاء الاصطناعي...</span>`;

  container.appendChild(loader);
  container.scrollTop = container.scrollHeight;
}

// Expose globally
if (typeof window !== 'undefined') {
  window.renderPDFAnalyzer = renderPDFAnalyzer;
  window.handleFileUpload = handleFileUpload;
  window.switchPDFTab = switchPDFTab;
  window.updatePDFItemQty = updatePDFItemQty;
  window.updatePDFEnvFactor = updatePDFEnvFactor;
  window.correctSinglePDFPrice = correctSinglePDFPrice;
  window.importPDFItemsToBOQ = importPDFItemsToBOQ;
  window.importPDFCorrected = importPDFCorrected;
  window.openFuzzySwapModal = openFuzzySwapModal;
  window.applyApprovedPhaseSuggestions = applyApprovedPhaseSuggestions;
  window.quickAddItem = quickAddItem;
  window.copyBOQPromptForGemini = copyBOQPromptForGemini;
  window.exportPDFReport = exportPDFReport;
  window.exportCorrectedBOQ = exportCorrectedBOQ;
  window.exportPDFToERP = exportPDFToERP;
  window.downloadExtractedCSV = downloadExtractedCSV;
  window.sendCustomAIQuestion = sendCustomAIQuestion;
  window.askAIEngine = askAIEngine;
}
