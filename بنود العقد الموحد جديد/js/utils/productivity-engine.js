/**
 * PRICEWISE-SEC — محرك التقدير والتحليل بالإنتاجية
 * Productivity Cost Estimation & Riyadh Field Correction Engine
 */

const ProductivityEngine = {
  crews: {},
  settings: {
    soilType: 'normal',   // normal, sandy, rock
    season: 'winter',     // winter, summer
    shiftType: 'day',     // day, night
    areaType: 'urban'     // rural, urban
  },

  /**
   * Initialize engine and fetch productivity rates from CSV if available
   */
  async init() {
    try {
      this.crews = JSON.parse(JSON.stringify(window.PRODUCTIVITY_DEFAULTS.crews));
      await this.loadProductivityFromCSV();
    } catch (e) {
      console.warn("Using default hardcoded productivity rates as fallback:", e);
    }
  },

  /**
   * Fetch and parse productivity.csv
   */
  async loadProductivityFromCSV() {
    try {
      const response = await fetch('data/productivity.csv');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const csvText = await response.text();
      this.parseCSV(csvText);
      console.log("Successfully loaded productivity rates from CSV");
    } catch (e) {
      // Fallback is already loaded in init
      console.log("Using hardcoded fallback productivity data (Offline/File mode)");
    }
  },

  /**
   * Simple CSV Parser to extract productivity columns
   */
  parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length <= 1) return;
    
    const headers = lines[0].split(',').map(h => h.trim());
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < headers.length) continue;
      
      const crewCode = cols[0];
      if (this.crews[crewCode]) {
        this.crews[crewCode].output = parseFloat(cols[2]) || this.crews[crewCode].output;
        this.crews[crewCode].laborCost = parseFloat(cols[4]) || this.crews[crewCode].laborCost;
        this.crews[crewCode].equipCost = parseFloat(cols[5]) || this.crews[crewCode].equipCost;
      }
    }
  },

  /**
   * Set Riyadh environmental factors
   */
  setFactor(category, value) {
    if (this.settings.hasOwnProperty(category)) {
      this.settings[category] = value;
      return true;
    }
    return false;
  },

  /**
   * Automatically select best crew based on item code and soil type
   */
  suggestCrewForItem(code, nameAr, nameEn) {
    const codeStr = String(code);
    const searchStr = `${nameAr} ${nameEn}`.toLowerCase();
    const isRockSoil = this.settings.soilType === 'rock';

    // 1. Excavation & Civils
    if (codeStr.startsWith('1101') || codeStr.startsWith('1.1') || searchStr.includes(' excavation') || searchStr.includes('حفر')) {
      return isRockSoil ? 'CR-02' : 'CR-01'; // If rock soil, use heavy rock excavation
    }
    
    // 2. Concrete Works
    if (codeStr.startsWith('1104') || searchStr.includes('concrete') || searchStr.includes('خرسانة')) {
      return 'CR-05';
    }

    // 3. Asphalt Restoration
    if (codeStr.startsWith('1105') || searchStr.includes('asphalt') || searchStr.includes('سفلت') || searchStr.includes('بلاط')) {
      return 'CR-06';
    }

    // 4. Duct & Conduit Installation
    if (codeStr.startsWith('1103') || searchStr.includes('duct') || searchStr.includes('conduit') || searchStr.includes('مواسير') || searchStr.includes('أنبوب')) {
      return 'CR-07';
    }

    // 5. Earthing Work
    if (searchStr.includes('earth') || searchStr.includes('تأريض') || searchStr.includes('بئر تأريض')) {
      return 'CR-08';
    }

    // 6. Testing & Commissioning
    if (codeStr.startsWith('6') || searchStr.includes('test') || searchStr.includes('fdt') || searchStr.includes('اختبار') || searchStr.includes('تشغيل')) {
      return 'CR-09';
    }

    // 7. Overhead Power Lines
    if (codeStr.startsWith('5') || searchStr.includes('overhead') || searchStr.includes('pole') || searchStr.includes('هوائي') || searchStr.includes('عمود')) {
      return 'CR-10';
    }

    // 8. Cable Laying (MV vs LV)
    if (codeStr.startsWith('2') || searchStr.includes('cable') || searchStr.includes('كابل') || searchStr.includes('تمديد')) {
      if (searchStr.includes('mv') || searchStr.includes('medium voltage') || searchStr.includes('13.8') || searchStr.includes('33')) {
        return 'CR-03';
      } else {
        return 'CR-04';
      }
    }

    // Default Fallback
    return 'CR-01';
  },

  /**
   * Core Calculation: Estimate actual execution cost of an item
   */
  calculateItemCost(code, quantity, unitContractPrice) {
    const priceItem = typeof getItemByCode === 'function' ? getItemByCode(code) : null;
    const nameAr = priceItem ? priceItem.arDesc : '';
    const nameEn = priceItem ? priceItem.enDesc : '';
    
    // Choose appropriate crew
    const crewCode = this.suggestCrewForItem(code, nameAr, nameEn);
    const crew = this.crews[crewCode] || this.crews['CR-01'];

    // Retrieve Riyadh factors
    const fDefaults = window.PRODUCTIVITY_DEFAULTS.riyadhFactors;
    
    const soilF = fDefaults.soil[this.settings.soilType]?.factor ?? 1.0;
    const seasonF = fDefaults.season[this.settings.season]?.factor ?? 1.0;
    const shiftF = fDefaults.shift[this.settings.shiftType]?.factor ?? 1.0;
    const areaF = fDefaults.area[this.settings.areaType]?.factor ?? 1.0;
    
    const shiftCostMult = fDefaults.shift[this.settings.shiftType]?.costMultiplier ?? 1.0;

    // Apply correction factors to daily productivity output
    // Excavation speed is heavily affected by soil type, but other works might be less affected
    const isExcavation = crew.code === 'CR-01' || crew.code === 'CR-02';
    const activeSoilFactor = isExcavation ? soilF : 1.0; // Non-excavation is not slowed down by rock in the same way
    
    const adjustedOutput = crew.output * activeSoilFactor * seasonF * shiftF * areaF;

    // Apply shift premium to crew labor cost
    const adjustedLaborCost = crew.laborCost * shiftCostMult;
    const dailyCrewCost = adjustedLaborCost + crew.equipCost;

    // Calculate required crew workdays (8-hour standard shifts)
    let requiredDays = 0;
    if (adjustedOutput > 0 && quantity > 0) {
      requiredDays = quantity / adjustedOutput;
    }

    // Calculate total crew costs
    const totalLaborCost = requiredDays * adjustedLaborCost;
    const totalEquipCost = requiredDays * crew.equipCost;
    const totalCrewCost = totalLaborCost + totalEquipCost;

    // Materials: Estimate material cost as a percentage of the contract price
    // Typically, SEC contracts include high materials. Let's assume standard SEC materials percentages or 0 if it is purely labor
    let materialPercentage = 0.15; // default 15% materials factor
    if (nameAr.includes('توريد') || nameEn.toLowerCase().includes('supply')) {
      materialPercentage = 0.55; // 55% for supply items
    } else if (nameAr.includes('تركيب') || nameEn.toLowerCase().includes('install')) {
      materialPercentage = 0.05; // 5% for install-only items
    }
    
    const totalMaterialCost = quantity * (unitContractPrice * materialPercentage);
    
    // Total Execution Cost
    const totalActualCost = totalCrewCost + totalMaterialCost;
    const unitActualCost = quantity > 0 ? (totalActualCost / quantity) : 0;

    // Financial Analysis vs Contract Price
    const totalContractRevenue = quantity * unitContractPrice;
    const profitLoss = totalContractRevenue - totalActualCost;
    const profitMargin = totalContractRevenue > 0 ? (profitLoss / totalContractRevenue) * 100 : 0;

    // Risk Rating Calculation
    let riskRating = 'Low';
    let riskReason = '';
    
    if (profitMargin < 5) {
      riskRating = 'High';
      riskReason = 'هامش ربح ضئيل جداً أو خسارة تشغيلية مؤكدة';
    } else if (profitMargin < 15) {
      riskRating = 'Medium';
      riskReason = 'هامش ربح محدود معرض للتقلبات التشغيلية';
    } else {
      riskRating = 'Low';
      riskReason = 'هامش ربح آمن وتغطية تشغيلية ممتازة';
    }

    // Double check if execution days exceed threshold
    if (requiredDays > 60) {
      riskRating = riskRating === 'High' ? 'High' : 'Medium';
      riskReason += ' + مدة تنفيذ طويلة تتجاوز شهرين للطاقم الواحد';
    }

    return {
      crewCode: crew.code,
      crewNameAr: crew.nameAr,
      crewNameEn: crew.nameEn,
      standardOutput: crew.output,
      adjustedOutput: Math.round(adjustedOutput * 100) / 100,
      uom: crew.uom,
      dailyLaborCost: adjustedLaborCost,
      dailyEquipCost: crew.equipCost,
      dailyCrewCost,
      requiredDays: Math.round(requiredDays * 100) / 100,
      totalLaborCost: Math.round(totalLaborCost),
      totalEquipCost: Math.round(totalEquipCost),
      totalCrewCost: Math.round(totalCrewCost),
      totalMaterialCost: Math.round(totalMaterialCost),
      totalActualCost: Math.round(totalActualCost),
      unitActualCost: Math.round(unitActualCost * 100) / 100,
      totalContractRevenue: Math.round(totalContractRevenue),
      profitLoss: Math.round(profitLoss),
      profitMargin: Math.round(profitMargin * 100) / 100,
      riskRating,
      riskReason
    };
  },

  /**
   * Bulk Estimation: Estimate costs for an entire list of BOQ items
   */
  estimateBOQ(items) {
    let totalContractVal = 0;
    let totalActualVal = 0;
    let totalDays = 0;
    let totalLabor = 0;
    let totalEquip = 0;
    let totalMaterial = 0;
    
    const detailedItems = items.map(item => {
      const cost = this.calculateItemCost(item.code, item.qty, item.contractPrice || item.newPrice || 0);
      totalContractVal += cost.totalContractRevenue;
      totalActualVal += cost.totalActualCost;
      totalDays = Math.max(totalDays, cost.requiredDays); // Parallel working or consecutive? Let's assume parallel (max days)
      totalLabor += cost.totalLaborCost;
      totalEquip += cost.totalEquipCost;
      totalMaterial += cost.totalMaterialCost;
      
      return {
        ...item,
        costDetails: cost
      };
    });

    const netProfit = totalContractVal - totalActualVal;
    const profitMargin = totalContractVal > 0 ? (netProfit / totalContractVal) * 100 : 0;
    
    let overallRisk = 'Low';
    if (profitMargin < 10) overallRisk = 'High';
    else if (profitMargin < 20) overallRisk = 'Medium';

    return {
      items: detailedItems,
      totalContractVal,
      totalActualVal,
      totalDays: Math.round(totalDays * 10) / 10,
      totalLabor,
      totalEquip,
      totalMaterial,
      netProfit,
      profitMargin: Math.round(profitMargin * 100) / 100,
      overallRisk
    };
  }
};

// Auto Init
if (typeof window !== 'undefined') {
  window.ProductivityEngine = ProductivityEngine;
  document.addEventListener('DOMContentLoaded', () => {
    ProductivityEngine.init();
  });
}
