/**
 * PRICEWISE-SEC — معاملات الإنتاجية الافتراضية للرياض
 * Default Productivity Databases and Riyadh Correction Factors
 */

const PRODUCTIVITY_DEFAULTS = {
  crews: {
    "CR-01": { code: "CR-01", nameAr: "طاقم حفر عادي", nameEn: "Civ Excavation", output: 35, uom: "M3", laborCost: 1500, equipCost: 2400, desc: "Normal soil excavation crew (Excavator + Loader + 3 Laborers)" },
    "CR-02": { code: "CR-02", nameAr: "طاقم حفر صخري", nameEn: "Civ Rock Excavation", output: 8, uom: "M3", laborCost: 1800, equipCost: 4500, desc: "Rock soil excavation crew (Heavy Excavator with Jackhammer + 2 Laborers)" },
    "CR-03": { code: "CR-03", nameAr: "طاقم سحب كابلات جهد متوسط", nameEn: "Cable Laying MV", output: 450, uom: "M", laborCost: 1600, equipCost: 1200, desc: "Medium Voltage cable pulling crew (Puller winches + 8 Laborers)" },
    "CR-04": { code: "CR-04", nameAr: "طاقم تمديد كابلات جهد منخفض", nameEn: "Cable Laying LV", output: 650, uom: "M", laborCost: 1400, equipCost: 800, desc: "Low Voltage cable laying crew (4 Laborers + Roller accessories)" },
    "CR-05": { code: "CR-05", nameAr: "طاقم صب خرسانة قواعد", nameEn: "Concrete Foundation", output: 12, uom: "M3", laborCost: 2200, equipCost: 1400, desc: "Concrete pouring crew (Mixer vehicle access + 4 Laborers)" },
    "CR-06": { code: "CR-06", nameAr: "طاقم إعادة سفلتة", nameEn: "Asphalt Restoration", output: 220, uom: "M2", laborCost: 1200, equipCost: 2500, desc: "Asphalt laying and compaction crew (Paver + Compactor + 3 Laborers)" },
    "CR-07": { code: "CR-07", nameAr: "طاقم تركيب مواسير", nameEn: "Duct Installation", output: 120, uom: "M", laborCost: 1300, equipCost: 1000, desc: "Conduit / duct installation crew (Trench helper + 4 Laborers)" },
    "CR-08": { code: "CR-08", nameAr: "طاقم حفرة التأريض", nameEn: "Earthing Work", output: 10, uom: "EA", laborCost: 1100, equipCost: 500, desc: "Earthing rod installation crew (Hammer machine + 3 Laborers)" },
    "CR-09": { code: "CR-09", nameAr: "طاقم الاختبار والتشغيل", nameEn: "Testing Commissioning", output: 4, uom: "EA", laborCost: 2500, equipCost: 1800, desc: "High-end testing crew (Secondary injection kit + 2 Engineers)" },
    "CR-10": { code: "CR-10", nameAr: "طاقم تركيب خطوط هوائية", nameEn: "Overhead Installation", output: 5, uom: "EA", laborCost: 1800, equipCost: 2200, desc: "Overhead line / poles installation crew (Crane + 4 Technicians)" }
  },
  riyadhFactors: {
    soil: {
      normal: { id: "normal", labelAr: "تربة عادية", labelEn: "Normal Soil", factor: 1.0 },
      sandy: { id: "sandy", labelAr: "تربة رملية مفككة", labelEn: "Sandy Soil", factor: 1.3 },
      rock: { id: "rock", labelAr: "تربة صخرية صلبة", labelEn: "Rock Soil", factor: 0.25 }
    },
    season: {
      winter: { id: "winter", labelAr: "الشتاء / معتدل", labelEn: "Winter / Moderate", factor: 1.0 },
      summer: { id: "summer", labelAr: "صيف الرياض الحار", labelEn: "Riyadh Summer Heat", factor: 0.75 }
    },
    shift: {
      day: { id: "day", labelAr: "وردية نهارية", labelEn: "Day Shift", factor: 1.0, costMultiplier: 1.0 },
      night: { id: "night", labelAr: "وردية ليلية", labelEn: "Night Shift", factor: 0.85, costMultiplier: 1.25 }
    },
    area: {
      rural: { id: "rural", labelAr: "خارج المدينة / مفتوحة", labelEn: "Rural / Open Area", factor: 1.1 },
      urban: { id: "urban", labelAr: "داخل الرياض / حركة مرورية", labelEn: "Urban Traffic Congestion", factor: 0.8 }
    }
  }
};

if (typeof window !== 'undefined') {
  window.PRODUCTIVITY_DEFAULTS = PRODUCTIVITY_DEFAULTS;
}
