/**
 * PRICEWISE-SEC — Voice & Gemini AI Assistant Module
 * نظام إنشاء المقايسات والمستخلصات صوتياً وبمساعدة الذكاء الاصطناعي
 * Depends on: PRICE_LIST (js/data/price-list.js), App (index.html)
 */

const VoiceAssistant = {
  isRecording: false,
  recognition: null,
  apiKey: localStorage.getItem('gemini_api_key') || '',
  matchedItems: [],
  currentTarget: 'boq', // 'boq' or 'cert'

  /**
   * تهيئة المساعد الصوتي والتحقق من دعم المتصفح
   */
  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.lang = 'ar-SA'; // اللغة العربية - المملكة العربية السعودية
      this.recognition.interimResults = false;

      this.recognition.onstart = () => {
        this.isRecording = true;
        this.updateUIState();
      };

      this.recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        const textarea = document.getElementById('voice-input-text');
        if (textarea) {
          textarea.value = (textarea.value + ' ' + text).trim();
        }
        if (typeof showToast === 'function') {
          showToast(typeof App !== 'undefined' && App.lang === 'ar' ? 'تمت الكتابة بنجاح!' : 'Speech transcribed!', 'success');
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        let errMsg = 'خطأ في التعرف على الصوت';
        if (event.error === 'not-allowed') {
          errMsg = 'يرجى السماح بالوصول إلى الميكروفون لاستخدام المساعد الصوتي';
        }
        if (typeof showToast === 'function') {
          showToast(errMsg, 'error');
        }
        this.isRecording = false;
        this.updateUIState();
      };

      this.recognition.onend = () => {
        this.isRecording = false;
        this.updateUIState();
      };
    }
  },

  /**
   * تشغيل/إيقاف التسجيل الصوتي
   */
  toggleRecording() {
    if (!this.recognition) {
      const ar = typeof App !== 'undefined' && App.lang === 'ar';
      if (typeof showToast === 'function') {
        showToast(ar ? 'التعرف على الصوت غير مدعوم في هذا المتصفح. يمكنك كتابة النص يدوياً.' : 'Speech Recognition not supported in this browser. Please type manually.', 'warning');
      }
      return;
    }

    if (this.isRecording) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (e) {
        console.error('Failed to start recognition:', e);
      }
    }
  },

  /**
   * تحديث حالة الواجهة عند التسجيل
   */
  updateUIState() {
    const btn = document.getElementById('voice-record-btn');
    const status = document.getElementById('voice-status-badge');
    const ar = typeof App !== 'undefined' && App.lang === 'ar';

    if (!btn || !status) return;

    if (this.isRecording) {
      btn.innerHTML = `<span class="mic-icon animate-pulse" style="color:var(--accent-red);font-size:24px;">🛑</span>`;
      btn.style.borderColor = 'var(--accent-red)';
      btn.style.boxShadow = '0 0 15px rgba(255, 77, 106, 0.4)';
      status.innerHTML = `<span class="status-dot pulsing-red"></span> ${ar ? 'جاري الاستماع...' : 'Listening...'}`;
      status.className = 'voice-badge active';
    } else {
      btn.innerHTML = `<span class="mic-icon" style="color:var(--sec-gold);font-size:24px;">🎙️</span>`;
      btn.style.borderColor = 'var(--border-sec)';
      btn.style.boxShadow = 'none';
      status.innerHTML = `<span class="status-dot"></span> ${ar ? 'جاهز للمساعد الصوتي' : 'Ready for Voice AI'}`;
      status.className = 'voice-badge';
    }
  },

  /**
   * رسم كارت المساعد الصوتي في المكان المناسب
   */
  renderVoiceCard(containerId, targetType) {
    this.currentTarget = targetType; // 'boq' or 'cert'
    const container = document.getElementById(containerId);
    if (!container) return;

    // تهيئة السكريبت إذا لم يكن مهيئاً
    if (!this.recognition) {
      this.init();
    }

    const ar = typeof App !== 'undefined' && App.lang === 'ar';
    const examplePrompt = ar 
      ? 'أريد تركيب mini pillar تغذية عدادين double 70 قاطع 2x70 وعداد single 1x30. يتم صرف المواد كابلات 185 6 متر، كابل 70 6 متر، كابل 350 متر'
      : 'I want to install a mini pillar, 2x double 70 meter box, a 2x70 breaker and a single 1x30 meter. Issue 6m of 185 cable, 6m of 70 cable and 350m of cable';

    container.innerHTML = `
      <style>
        .voice-assistant-card {
          border: 1px solid var(--border-gold);
          background: linear-gradient(135deg, rgba(200, 168, 75, 0.04), var(--bg-card));
          border-radius: var(--r-lg);
          margin-bottom: 20px;
          overflow: hidden;
          transition: all 0.3s ease;
        }
        .voice-assistant-card:hover {
          box-shadow: 0 4px 20px rgba(200, 168, 75, 0.08);
          border-color: var(--sec-gold);
        }
        .voice-control-row {
          display: flex;
          gap: 14px;
          align-items: center;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .voice-record-circle-btn {
          width: 54px;
          height: 54px;
          border-radius: 50%;
          border: 2px solid var(--border-sec);
          background: var(--bg-surface);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
          outline: none;
          padding: 0;
        }
        .voice-record-circle-btn:hover {
          transform: scale(1.05);
          background: rgba(200, 168, 75, 0.08);
          border-color: var(--sec-gold);
        }
        .voice-badge {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 99px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-sub);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .voice-badge.active {
          color: var(--accent-red);
          border-color: rgba(255, 77, 106, 0.2);
          background: rgba(255, 77, 106, 0.05);
        }
        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--text-muted);
          display: inline-block;
        }
        .status-dot.pulsing-red {
          background: var(--accent-red);
          animation: statusPulse 1.2s infinite alternate;
        }
        @keyframes statusPulse {
          0% { transform: scale(0.9); opacity: 0.5; }
          100% { transform: scale(1.2); opacity: 1; }
        }
        .animate-pulse {
          animation: voicePulse 1s infinite alternate;
        }
        @keyframes voicePulse {
          0% { transform: scale(0.95); }
          100% { transform: scale(1.1); }
        }
        .ai-result-row:hover {
          background: rgba(0, 132, 61, 0.03) !important;
        }
        .api-settings-toggle {
          cursor: pointer;
          font-size: 10.5px;
          color: var(--text-sub);
          text-decoration: underline;
          margin-top: 6px;
          display: inline-block;
          transition: color 0.2s;
        }
        .api-settings-toggle:hover {
          color: var(--sec-gold);
        }
      </style>

      <div class="voice-assistant-card">
        <div class="card-head" style="background: linear-gradient(90deg, rgba(200, 168, 75, 0.06), transparent); border-bottom: 1px solid var(--border);">
          <span style="font-size: 16px;">🎙️</span>
          <span class="card-title" style="font-weight: 900; color: var(--sec-gold);">
            ${ar ? 'المساعد الصوتي بالذكاء الاصطناعي (Gemini AI)' : 'AI Voice Assistant (Gemini)'}
          </span>
          <span class="voice-badge" id="voice-status-badge" style="margin-right: auto; margin-left: 0;">
            <span class="status-dot"></span> ${ar ? 'جاهز للمساعد الصوتي' : 'Ready for Voice AI'}
          </span>
        </div>
        <div class="card-body" style="padding: 16px;">
          <!-- Voice Controls -->
          <div class="voice-control-row">
            <button class="voice-record-circle-btn" id="voice-record-btn" onclick="VoiceAssistant.toggleRecording()" title="${ar ? 'انقر للتحدث بالمايكروفون' : 'Click to speak via mic'}">
              <span class="mic-icon" style="color:var(--sec-gold);font-size:24px;">🎙️</span>
            </button>
            <div style="flex: 1; min-width: 200px;">
              <div style="font-size: 12.5px; font-weight: 700; color: var(--text-h); margin-bottom: 2px;">
                ${ar ? 'انقر على الميكروفون للتحدث باللغة العربية' : 'Click the mic to dictate or speak in Arabic'}
              </div>
              <div style="font-size: 11px; color: var(--text-sub);">
                ${ar ? 'يمكنك وصف البنود والمعدات وصرف الكابلات تلقائياً' : 'Describe installation items, meter counts, or cable laying.'}
              </div>
            </div>
          </div>

          <!-- Prompt input -->
          <div class="form-group" style="margin-top: 10px;">
            <label class="form-label" style="display:flex;justify-content:between;width:100%;">
              <span>${ar ? 'النص المطلوب تحليله فنيّاً:' : 'Text prompt to analyze:'}</span>
              <span onclick="VoiceAssistant.fillExamplePrompt()" style="margin-right:auto;font-size:10px;color:var(--sec-primary);cursor:pointer;text-decoration:underline;">
                💡 ${ar ? 'استخدام نص المثال المرجعي' : 'Use example prompt'}
              </span>
            </label>
            <textarea class="form-control" id="voice-input-text" rows="3" style="font-size: 12.5px; line-height: 1.5; font-family: inherit; resize: vertical;" placeholder="${ar ? 'اكتب هنا أو تحدث بالمايكروفون...' : 'Type or dictate here...'}" oninput="VoiceAssistant.clearPreview()"></textarea>
          </div>

          <!-- Actions -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 12px; flex-wrap:wrap; gap:8px;">
            <div>
              <span class="api-settings-toggle" onclick="VoiceAssistant.toggleApiSettings()">
                ⚙️ ${ar ? 'إعداد مفتاح Gemini API' : 'Configure Gemini API Key'}
              </span>
            </div>
            <div style="display:flex; gap: 8px;">
              <button class="btn btn-outline btn-sm" onclick="VoiceAssistant.clearInput()" style="font-size:12px;">
                ✕ ${ar ? 'مسح' : 'Clear'}
              </button>
              <button class="btn btn-gold btn-sm" id="voice-analyze-btn" onclick="VoiceAssistant.analyzeText()" style="font-weight:900; font-size:12.5px; padding:6px 16px;">
                ✨ ${ar ? 'تحليل وفك الترميز' : 'Analyze & Decode'}
              </button>
            </div>
          </div>

          <!-- API Key Settings Panel -->
          <div id="voice-api-panel" style="display:none; margin-top:14px; border:1px dashed var(--border-gold); padding:10px 14px; border-radius:var(--r-md); background:var(--bg-surface);">
            <div class="form-group" style="margin-bottom:8px;">
              <label class="form-label">${ar ? 'أدخل مفتاح Gemini API Key (اختياري - لتفعيل الذكاء الاصطناعي بالكامل):' : 'Enter Gemini API Key (Optional - unlocks full AI powers):'}</label>
              <input class="form-control" type="password" id="voice-api-key" value="${this.apiKey}" placeholder="AIzaSy..." style="font-size:11.5px; font-family:var(--font-mono); padding:6px 10px;" onchange="VoiceAssistant.saveApiKey(this.value)">
            </div>
            <div style="font-size:10px; color:var(--text-sub); line-height:1.4;">
              ${ar 
                ? 'ℹ️ يتم حفظ المفتاح محلياً في متصفحك. في حال عدم إدخال مفتاح، سيقوم النظام بالاعتماد تلقائياً على محرك التفسير المحلي الذكي (Offline NLP Parser) لفك الأكواد.' 
                : 'Key is saved locally. If left blank, the system automatically falls back to the smart Offline NLP Parser.'}
            </div>
          </div>

          <!-- Loading Indicator -->
          <div id="voice-loading" style="display:none; text-align:center; padding: 20px 0;">
            <div style="display:inline-block; width:28px; height:28px; border:3px solid var(--border); border-top-color:var(--sec-gold); border-radius:50%; animation: spin 1s infinite linear; margin-bottom:8px;"></div>
            <div style="font-size: 12px; color:var(--text-sub);" id="voice-loading-label">${ar ? 'جاري الفك والتحليل الدلالي...' : 'Decoding engineering specs...'}</div>
          </div>

          <!-- Results Preview -->
          <div id="voice-results" style="display:none; margin-top: 16px; border-top: 1px solid var(--border); padding-top: 14px;"></div>
        </div>
      </div>
    `;
  },

  toggleApiSettings() {
    const panel = document.getElementById('voice-api-panel');
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  },

  saveApiKey(val) {
    this.apiKey = val.trim();
    localStorage.setItem('gemini_api_key', this.apiKey);
  },

  fillExamplePrompt() {
    const textarea = document.getElementById('voice-input-text');
    const ar = typeof App !== 'undefined' && App.lang === 'ar';
    if (textarea) {
      textarea.value = ar 
        ? 'أريد تركيب mini pillar تغذية عدادين double 70 قاطع 2x70 وعداد single 1x30. يتم صرف المواد كابلات 185 6 متر، كابل 70 6 متر، كابل 350 متر'
        : 'I want to install a mini pillar, 2x double 70 meter box, a 2x70 breaker and a single 1x30 meter. Issue 6m of 185 cable, 6m of 70 cable and 350m of cable';
      this.clearPreview();
    }
  },

  clearInput() {
    const textarea = document.getElementById('voice-input-text');
    if (textarea) textarea.value = '';
    this.clearPreview();
  },

  clearPreview() {
    const resDiv = document.getElementById('voice-results');
    if (resDiv) {
      resDiv.style.display = 'none';
      resDiv.innerHTML = '';
    }
    this.matchedItems = [];
  },

  /**
   * تشغيل المحرك لتحليل النص وفك التبعيات
   */
  async analyzeText() {
    const textarea = document.getElementById('voice-input-text');
    if (!textarea || !textarea.value.trim()) {
      const ar = typeof App !== 'undefined' && App.lang === 'ar';
      if (typeof showToast === 'function') {
        showToast(ar ? 'يرجى التحدث أو كتابة نص أولاً للتحليل' : 'Please input some text or record speech first.', 'warning');
      }
      return;
    }

    const text = textarea.value.trim();
    const loading = document.getElementById('voice-loading');
    const resultsDiv = document.getElementById('voice-results');

    if (loading) loading.style.display = 'block';
    if (resultsDiv) resultsDiv.style.display = 'none';

    try {
      if (this.apiKey) {
        // الاتصال بـ Gemini API
        this.matchedItems = await this.callGeminiAPI(text);
      } else {
        // تشغيل محرك التفسير الدلالي المحلي (Offline NLP Parser)
        this.matchedItems = this.localNLPParse(text);
      }

      setTimeout(() => {
        if (loading) loading.style.display = 'none';
        if (resultsDiv) {
          resultsDiv.style.display = 'block';
          this.renderPreviewTable(resultsDiv);
        }
      }, 400);

    } catch (err) {
      if (loading) loading.style.display = 'none';
      console.error('AI Voice Assistant analysis error:', err);
      const ar = typeof App !== 'undefined' && App.lang === 'ar';
      if (typeof showToast === 'function') {
        showToast(ar ? 'فشل فك البنود: ' + err.message : 'Analysis failed: ' + err.message, 'error');
      }
    }
  },

  /**
   * مفسر محلي دلالي ذكي للغة العربية (Offline NLP Semantic Parser)
   */
  localNLPParse(text) {
    const parsed = [];
    const normalized = text.toLowerCase();

    // 1. فحص الميني بيلر (Mini Pillar)
    if (normalized.includes('mini pillar') || normalized.includes('mini-pillar') || normalized.includes('ميني بيلر') || normalized.includes('ميني بيلر حديد') || normalized.includes('لوحة توزيع فرعية')) {
      // 308010101: تركيب لوحة توزيع فرعية حديدية
      parsed.push({
        code: '308010101',
        qty: 1,
        note: typeof App !== 'undefined' && App.lang === 'ar' ? 'تركيب لوحة توزيع فرعية (Mini-pillar) حديدية' : 'Install Mini-pillar steel cabinet'
      });
      // 307010101: قاعدة خرسانية للميني بيلر
      parsed.push({
        code: '307010101',
        qty: 1,
        note: typeof App !== 'undefined' && App.lang === 'ar' ? 'إنشاء قاعدة خرسانية للميني بيلر الحديدي' : 'Concrete foundation for steel Mini-pillar'
      });
    } else if (normalized.includes('الياف') && (normalized.includes('لوحة توزيع') || normalized.includes('قاعدة خرسانة'))) {
      parsed.push({
        code: '308010102',
        qty: 1,
        note: typeof App !== 'undefined' && App.lang === 'ar' ? 'تركيب لوحة توزيع فرعية من الالياف الزجاجية' : 'Install Mini-pillar fiber cabinet'
      });
      parsed.push({
        code: '307010102',
        qty: 1,
        note: typeof App !== 'undefined' && App.lang === 'ar' ? 'إنشاء قاعدة خرسانية لميني بيلر الألياف' : 'Concrete foundation for fiber Mini-pillar'
      });
    }

    // 2. فحص العدادين (Double Meter)
    if (normalized.includes('عدادين') || normalized.includes('double 70') || normalized.includes('عداد ثنائي') || normalized.includes('صندوق بعدادين') || normalized.includes('double meter')) {
      parsed.push({
        code: '501010003',
        qty: 1,
        note: typeof App !== 'undefined' && App.lang === 'ar' ? 'تركيب وتوصيل صندوق بعدادين (Double Meter Box)' : 'Install and connect Double Meter assembly'
      });
    }

    // 3. فحص العداد الآحادي (Single Meter)
    if (normalized.includes('عداد single') || normalized.includes('عداد آحادي') || normalized.includes('عداد مفرد') || normalized.includes('1x30') || normalized.includes('1x70') || normalized.includes('عداد واحد')) {
      parsed.push({
        code: '501010001',
        qty: 1,
        note: typeof App !== 'undefined' && App.lang === 'ar' ? 'تركيب وتوصيل صندوق بعداد آحادي (Single Meter Box)' : 'Install and connect Single Meter assembly'
      });
    }

    // 4. فحص قاطع التيار (Circuit Breaker)
    if (normalized.includes('قاطع') || normalized.includes('قواطع') || normalized.includes('قاطع تيار') || normalized.includes('breaker') || normalized.includes('2x70')) {
      // استنتاج كمية القواطع: إذا ذكر عدادين وقاطع 2x70، ربما قاطعين أو قاطع واحد
      let cbQty = 1;
      if (normalized.includes('عدادين') || normalized.includes('قاطعين')) {
        cbQty = 2;
      }
      parsed.push({
        code: '308010503',
        qty: cbQty,
        note: typeof App !== 'undefined' && App.lang === 'ar' ? `تركيب قاطع تيار فرعي ج.منخفض (${cbQty} قاطع)` : `Install LV sub CB (${cbQty} unit)`
      });
    }

    // 5. فحص الكابلات وتمديدها بالمسافات والأمتار
    // Regex matches size (185, 70, 300, 350, 240, 120, etc.) and searches for the count of meters nearby
    // Example: كابلات 185 6 متر
    const cableRegex = /(?:كابل|كابلات|كيبل|كيبلات|سلك|اسلاك)\s+(185|70|300|350|240|120|95|50|35)\s*(?:مم2|مم٢)?\s*(\d+)?\s*(?:متر|م)?/g;
    let match;
    let textToScan = normalized;

    // سنقوم أيضاً بالبحث عن الأمتار المنفصلة التي تسبق أو تلي كلمة كابل
    // مثال: "كابل 350 متر" -> لا يحتوي على فئة الحجم صراحة بل الطول 350 متر
    // نتحقق من هذه الحالة أولاً لمنع تعارضها
    const lengthOnlyMatches = [...normalized.matchAll(/(?:كابل|كيبل)\s+(\d+)\s*متر/g)];
    const parsedCables = new Set();

    while ((match = cableRegex.exec(normalized)) !== null) {
      const size = parseInt(match[1]);
      let qty = match[2] ? parseInt(match[2]) : 1;
      
      // إذا كان الرقم التالي هو وحدة القياس، وكان هناك رقم أكبر (مثال: كابل 70 بطول 6 أمتار)
      if (size === 185) {
        parsed.push({
          code: '304010101', // تمديد كابل رباعي ج.منخفض <=185
          qty: qty,
          note: typeof App !== 'undefined' && App.lang === 'ar' ? `تمديد كابل رباعي ج.منخفض فئة 185 مم2 (${qty} متر)` : `Lay 4-Core LV cable 185 sq. mm. (${qty}m)`
        });
        parsedCables.add(185);
      } else if (size === 70) {
        parsed.push({
          code: '304010101', // تمديد كابل رباعي ج.منخفض <=185 (فئة 70)
          qty: qty,
          note: typeof App !== 'undefined' && App.lang === 'ar' ? `تمديد كابل رباعي ج.منخفض فئة 70 مم2 (${qty} متر)` : `Lay 4-Core LV cable 70 sq. mm. (${qty}m)`
        });
        parsedCables.add(70);
      } else if (size === 300 || size === 350 || size === 240) {
        // المقاسات الأكبر من 185 تقع تحت كود 304010102
        parsed.push({
          code: '304010102', // تمديد كابل رباعي ج.منخفض >185
          qty: qty,
          note: typeof App !== 'undefined' && App.lang === 'ar' ? `تمديد كابل رباعي ج.منخفض أكبر من 185 مم2 (${qty} متر)` : `Lay 4-Core LV cable > 185 sq. mm. (${qty}m)`
        });
        parsedCables.add(size);
      }
    }

    // التحقق من تمديد كابلات غير محددة الحجم بطول صريح (مثال: كابل 350 متر)
    lengthOnlyMatches.forEach(lm => {
      const len = parseInt(lm[1]);
      // إذا لم يكن هذا الطول قد أُضيف كحجم كابل، فهو بالتأكيد طول الكابل (مثل كابل 350 متر)
      if (!parsedCables.has(len) && len > 20) { 
        parsed.push({
          code: '304010102', // نضعه في الفئة الكبيرة كافتراض آمن (>185)
          qty: len,
          note: typeof App !== 'undefined' && App.lang === 'ar' ? `تمديد كابل ج.منخفض (>185) بطول ${len} متر` : `Lay LV cable (>185) length ${len}m`
        });
      }
    });

    // تصفية وحذف التكرار
    const unique = [];
    const seen = new Set();
    parsed.forEach(p => {
      const key = p.code + '_' + p.qty;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(p);
      }
    });

    return unique;
  },

  /**
   * الاتصال المباشر بـ Gemini API
   */
  async callGeminiAPI(text) {
    const prompt = `
You are an expert AI parser for the Saudi Electricity Company (SEC) Unified Contract.
Your task is to parse a natural language construction request in Arabic into a list of matched contract item codes and their quantities.

Available Item Codes and Categories:
- "308010101": تركيب لوحة توزيع فرعية حديدة (Mini-pillar installation, steel type)
- "307010101": توريد وتركيب/إنشاء لقاعدة خرسانة للوحة توزيع فرعية حديدية (Concrete foundation for steel Mini-pillar)
- "308010102": تركيب لوحة توزيع فرعية من الالياف الزجاجية بقاعدتها (Mini-pillar installation, fiber type)
- "307010102": قاعدة خرسانة للوحة توزيع فرعية من الألياف الزجاجية (Concrete foundation for fiber Mini-pillar)
- "501010003": تركيب وتوصيل صندوق بعدادين (Double meter box installation)
- "501010001": تركيب وتوصيل صندوق بعداد آحادي (Single meter box installation)
- "308010503": تركيب قاطع تيار فرعي ج.منخفض (Circuit breaker installation, LV sub)
- "308010502": تركيب قاطع تيار رئيسي ج.منخفض (Main circuit breaker installation)
- "304010101": تمديد كابل رباعي ج.منخفض <=185 (Laying LV 4-core cable <= 185 sq mm, including sizes 70, 120, 185)
- "304010102": تمديدكابل رباعي ج.منخفض >185 (Laying LV 4-core cable > 185 sq mm, including sizes 240, 300, 350, 400)
- "304010103": تمديد كابل آحادي ج.منخفض <=185 (Laying single-core LV cable <= 185 sq mm)
- "304010104": تمديد كابل آحادي ج.منخفض >185 (Laying single-core LV cable > 185 sq mm)

User Input: "${text}"

Parse this input and return a JSON array of objects, each containing:
- "code": string (the matched code from the list above)
- "qty": number (the parsed quantity)
- "note": string (reason for matching, in Arabic)

Return ONLY a valid JSON array. No markdown code blocks, no text around it.
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API call failed: status ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error('لم يقم الذكاء الاصطناعي بإرجاع أي بيانات للتحليل.');
    }

    // تنظيف المخرجات للتأكد من أنها جيسون صالح
    let cleaned = resultText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();

    return JSON.parse(cleaned);
  },

  /**
   * عرض جدول نتائج المساعد الصوتي قبل الإضافة
   */
  renderPreviewTable(container) {
    const ar = typeof App !== 'undefined' && App.lang === 'ar';
    const items = this.matchedItems || [];

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:12px;background:var(--bg-surface);border:1px dashed var(--border);border-radius:var(--r-md);">
          <span style="font-size:24px;margin-bottom:6px;display:block;">🔍</span>
          <p style="font-size:12px;color:var(--text-sub);margin:0;">
            ${ar ? 'لم نتمكن من التعرف على بنود فنية مطابقة في النص. يرجى تعديل الصياغة أو إضافة تفاصيل دقيقة.' : 'Could not match any unified items. Please refine your phrasing.'}
          </p>
        </div>
      `;
      return;
    }

    // التحقق من صفحة الطوارئ
    const isEmerg = typeof App !== 'undefined' && App.state?.boq?.isEmergency;
    const mult = isEmerg ? 1.9 : 1.0;

    let subtotal = 0;
    const rowsHtml = items.map((itm, idx) => {
      const p = typeof getItemByCode === 'function' ? getItemByCode(itm.code) : null;
      const basePrice = p ? p.newPrice : 0;
      const unitPrice = Math.round(basePrice * mult);
      const total = Math.round(unitPrice * itm.qty);
      subtotal += total;

      return `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:6px 10px; font-family:var(--font-mono); font-size:10.5px; color:var(--sec-primary); font-weight:700;">${itm.code}</td>
          <td style="padding:6px 10px; color:var(--text-main); font-size:11.5px; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${p ? p.arDesc : ''}">
            ${p ? p.arDesc : (ar ? 'بند غير معروف' : 'Unknown Item')}
          </td>
          <td style="padding:6px 10px; text-align:center; font-weight:700; color:var(--text-main);">${itm.qty}</td>
          <td style="padding:6px 10px; text-align:center; color:var(--text-sub); font-size:10.5px;">${p ? p.uom : '-'}</td>
          <td style="padding:6px 10px; text-align:left; font-weight:700; color:var(--sec-primary);">${typeof fmtNum === 'function' ? fmtNum(unitPrice) : unitPrice.toFixed(2)}</td>
          <td style="padding:6px 10px; text-align:left; font-weight:700; color:var(--sec-gold);">${typeof fmtNum === 'function' ? fmtNum(total) : total.toFixed(2)}</td>
          <td style="padding:6px 10px; color:var(--text-muted); font-size:10px;">${itm.note || '-'}</td>
        </tr>
      `;
    }).join('');

    const actionText = this.currentTarget === 'boq' 
      ? (ar ? 'إضافة البنود المكتشفة للمقايسة' : 'Add Decoded Items to BOQ')
      : (ar ? 'توليد وضخ البنود في المستخلص' : 'Add Decoded Items to Measurement Sheet');

    container.innerHTML = `
      <div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--r-md); padding:10px; margin-bottom:8px;">
        <div style="font-size:12px; font-weight:800; color:var(--text-h); margin-bottom:8px; display:flex; justify-content:space-between;">
          <span>📋 ${ar ? 'البنود المكتشفة فنيّاً بالذكاء الاصطناعي:' : 'AI Decoded Engineering Items:'}</span>
          <span style="color:var(--sec-gold);">${ar ? 'القيمة الإجمالية:' : 'Total Val:'} ${typeof fmtNum === 'function' ? fmtNum(subtotal) : subtotal.toFixed(2)} ${ar ? 'ر.س' : 'SAR'}</span>
        </div>
        <div style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:var(--r-sm); margin-bottom:10px;">
          <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
            <thead>
              <tr style="background:rgba(200,168,75,0.06); position:sticky; top:0;">
                <th style="padding:6px 10px; text-align:right; color:var(--text-muted); border-bottom:1px solid var(--border);">${ar ? 'الكود' : 'Code'}</th>
                <th style="padding:6px 10px; text-align:right; color:var(--text-muted); border-bottom:1px solid var(--border);">${ar ? 'الوصف' : 'Description'}</th>
                <th style="padding:6px 10px; text-align:center; color:var(--text-muted); border-bottom:1px solid var(--border);">${ar ? 'الكمية' : 'Qty'}</th>
                <th style="padding:6px 10px; text-align:center; color:var(--text-muted); border-bottom:1px solid var(--border);">${ar ? 'الوحدة' : 'UOM'}</th>
                <th style="padding:6px 10px; text-align:left; color:var(--text-muted); border-bottom:1px solid var(--border);">${ar ? 'السعر' : 'Price'}</th>
                <th style="padding:6px 10px; text-align:left; color:var(--text-muted); border-bottom:1px solid var(--border);">${ar ? 'الإجمالي' : 'Total'}</th>
                <th style="padding:6px 10px; text-align:right; color:var(--text-muted); border-bottom:1px solid var(--border);">${ar ? 'السبب المبرر' : 'AI Context'}</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button class="btn btn-primary" onclick="VoiceAssistant.addMatchedItems()" style="font-size:12px; font-weight:900;">
            ✅ ${actionText}
          </button>
        </div>
      </div>
    `;
  },

  /**
   * ضخ الأكواد في الذاكرة الحية للمقايسة أو المستخلص
   */
  addMatchedItems() {
    const ar = typeof App !== 'undefined' && App.lang === 'ar';
    const items = this.matchedItems || [];
    if (items.length === 0) return;

    if (this.currentTarget === 'boq') {
      // ضخها في منشئ المقايسات
      if (typeof App !== 'undefined') {
        const boqItems = items.map(itm => ({
          code: itm.code,
          qty: itm.qty || 1,
          customPrice: null,
          note: ar ? `🎙️ مساعد صوتي: ${itm.note || ''}` : `🎙️ Voice AI: ${itm.note || ''}`
        }));

        App.state.boq.items = [...App.state.boq.items, ...boqItems];
        if (typeof App._renderBOQTable === 'function') App._renderBOQTable();
        
        // حفظ تلقائي
        if (typeof BOQImporter !== 'undefined' && typeof BOQImporter.saveSession === 'function') {
          BOQImporter.saveSession();
        }

        if (typeof showToast === 'function') {
          showToast(ar ? `🎙️ تمت إضافة ${items.length} بند للمقايسة بنجاح!` : `🎙️ Successfully added ${items.length} items to BOQ!`, 'success');
        }
      }
    } else if (this.currentTarget === 'cert') {
      // ضخها في منشئ المستخلصات
      if (typeof App !== 'undefined') {
        if (typeof App.addVoiceItemsToCert === 'function') {
          App.addVoiceItemsToCert(items);
        }
      }
    }

    // إخفاء كارت المعاينة والمسح
    this.clearInput();
  }
};
