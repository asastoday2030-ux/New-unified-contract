/**
 * PRICEWISE-SEC — مركز تكامل أنظمة الـ ERP الموحدة المطور
 * Enhanced ERP Integration Hub for SAP, Oracle, Odoo, Primavera, Microsoft Dynamics, and ERPNext
 */

const ERPIntegration = {
  
  /**
   * Mock API endpoints for ERP integration
   */
  async simulateApiCall(endpoint, method = 'GET', data = null) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (endpoint === '/api/boq' && method === 'GET') {
          resolve({
            status: 200,
            message: "Successfully retrieved active BOQs from local DB",
            timestamp: new Date().toISOString()
          });
        } else if (endpoint === '/api/import' && method === 'POST') {
          resolve({
            status: 200,
            message: `ERP Import Successful! Created project with ${data?.items?.length || 0} line items.`,
            projectNumber: "PRJ-SEC-" + Math.floor(100000 + Math.random() * 900000),
            timestamp: new Date().toISOString()
          });
        } else {
          resolve({
            status: 404,
            message: "Endpoint not found"
          });
        }
      }, 600);
    });
  },

  /**
   * Generates a CSV file and triggers a browser download
   */
  downloadCSV(filename, headers, rows) {
    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(r => r.map(val => {
        const strVal = String(val === null || val === undefined ? '' : val);
        if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Generates an XML file and triggers a download
   */
  downloadXML(filename, xmlText) {
    const blob = new Blob([xmlText], { type: 'text/xml;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Generates a JSON file and triggers a download
   */
  downloadJSON(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Exports BOQ items to SAP ERP CSV layout
   */
  exportToSAP(boqName, items) {
    const filename = `SAP_WBS_Export_${boqName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    const headers = [
      "WBS_Element", "Item_Code", "Short_Text_Description", "Target_Quantity", "Order_Unit", "Net_Price_SAR", "Total_Value_SAR", "GL_Account"
    ];
    const wbsMock = "WBS-4000083770-R1";
    const glMock = "41039820";

    const rows = items.map((item, idx) => {
      const contractPrice = item.contractPrice || item.newPrice || 0;
      const total = item.qty * contractPrice;
      const desc = item.priceItem ? item.priceItem.arDesc : `بند رقم ${item.code}`;
      return [
        `${wbsMock}-${String(idx+1).padStart(3, '0')}`,
        item.code, desc.slice(0, 40), item.qty, item.uom || 'EA', contractPrice, total, glMock
      ];
    });

    this.downloadCSV(filename, headers, rows);
    return true;
  },

  /**
   * Exports BOQ items to Oracle Fusion layout
   */
  exportToOracle(boqName, items) {
    const filename = `Oracle_Fusion_Export_${boqName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    const headers = [
      "Project_Number", "Task_Number", "Expenditure_Type", "Item_Number", "Item_Description", "Quantity", "UOM", "Unit_Price", "Line_Total"
    ];
    const projMock = "PRJ-SEC-RFx83770";
    const taskMock = "100.10.20";

    const rows = items.map((item, idx) => {
      const contractPrice = item.contractPrice || item.newPrice || 0;
      const total = item.qty * contractPrice;
      const desc = item.priceItem ? item.priceItem.arDesc : `بند رقم ${item.code}`;
      return [
        projMock, `${taskMock}.${String(idx+1).padStart(2, '0')}`, "UTILITY_CONSTRUCTION", item.code, desc, item.qty, item.uom || 'EA', contractPrice, total
      ];
    });

    this.downloadCSV(filename, headers, rows);
    return true;
  },

  /**
   * Exports BOQ items to Odoo CSV import format
   */
  exportToOdoo(boqName, items) {
    const filename = `Odoo_BOQ_Import_${boqName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    const headers = [
      "product_id/default_code", "name", "product_uom_qty", "product_uom/name", "price_unit", "tax_id/name"
    ];

    const rows = items.map(item => {
      const contractPrice = item.contractPrice || item.newPrice || 0;
      const desc = item.priceItem ? item.priceItem.arDesc : `بند رقم ${item.code}`;
      return [
        item.code, desc, item.qty, item.uom || 'Units', contractPrice, "VAT 15%"
      ];
    });

    this.downloadCSV(filename, headers, rows);
    return true;
  },

  /**
   * Exports to Oracle Primavera P6 (XML Activity layout)
   */
  exportToPrimavera(boqName, items) {
    const filename = `Primavera_P6_Import_${boqName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xml`;
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<APRPExportProject>
  <Project>
    <ProjectID>SEC-RFx-4000083770</ProjectID>
    <ProjectName>${boqName}</ProjectName>
    <Activities>`;

    items.forEach((item, idx) => {
      const desc = item.priceItem ? item.priceItem.arDesc : `بند رقم ${item.code}`;
      xml += `
      <Activity>
        <ActivityID>ACT-${item.code}</ActivityID>
        <ActivityName>${desc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</ActivityName>
        <ActivityType>Task_Dependent</ActivityType>
        <DurationType>Fixed_Duration_Units</DurationType>
        <OriginalDuration>${Math.ceil(item.qty / 35)}</OriginalDuration>
        <Units>${item.qty}</Units>
        <UOM>${item.uom || 'EA'}</UOM>
      </Activity>`;
    });

    xml += `
    </Activities>
  </Project>
</APRPExportProject>`;

    this.downloadXML(filename, xml);
    return true;
  },

  /**
   * Exports BOQ items to Microsoft Dynamics Journal CSV layout
   */
  exportToDynamics(boqName, items) {
    const filename = `Dynamics_Finance_Export_${boqName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
    const headers = [
      "JournalBatchNumber", "LineNumber", "AccountType", "AccountNumber", "TransactionDate", "DebitAmount", "CreditAmount", "CurrencyCode", "Description", "ProjectWBSCode"
    ];
    const batchMock = "DYN-SEC-09";
    const dateMock = new Date().toISOString().slice(0, 10);

    const rows = items.map((item, idx) => {
      const contractPrice = item.contractPrice || item.newPrice || 0;
      const total = item.qty * contractPrice;
      const desc = item.priceItem ? item.priceItem.arDesc : `بند رقم ${item.code}`;
      return [
        batchMock, idx + 1, "Vendor", "VEND-SEC-ALASAS", dateMock, total, 0, "SAR", desc.slice(0, 50), `WBS-${item.code}`
      ];
    });

    this.downloadCSV(filename, headers, rows);
    return true;
  },

  /**
   * Exports BOQ items to ERPNext Purchase Order JSON layout
   */
  exportToERPNext(boqName, items) {
    const filename = `ERPNext_PO_Import_${boqName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.json`;
    const erpObj = {
      doctype: "Purchase Order",
      supplier: "Al-Asas Al-Areed Contracting Co.",
      transaction_date: new Date().toISOString().slice(0, 10),
      naming_series: "PO-SEC-",
      company: "Saudi Electricity Company",
      currency: "SAR",
      conversion_rate: 1.0,
      items: items.map(item => {
        const contractPrice = item.contractPrice || item.newPrice || 0;
        const desc = item.priceItem ? item.priceItem.arDesc : `بند رقم ${item.code}`;
        return {
          item_code: item.code,
          item_name: desc.slice(0, 60),
          qty: item.qty,
          uom: item.uom || 'Nos',
          rate: contractPrice,
          amount: item.qty * contractPrice,
          warehouse: "Stores - Riyadh Network"
        };
      })
    };

    this.downloadJSON(filename, erpObj);
    return true;
  }
};

// Expose to window
if (typeof window !== 'undefined') {
  window.ERPIntegration = ERPIntegration;
}
