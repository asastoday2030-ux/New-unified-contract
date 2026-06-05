import csv
import json
import re

# 1. Read old prices
old_prices = {}
with open('العقد الموحد القديم.csv', 'r', encoding='windows-1256', errors='ignore') as f:
    reader = csv.reader(f)
    for row in reader:
        if len(row) > 6:
            code = str(row[1]).strip()
            price_str = str(row[5]).replace(',', '').strip()
            if code.isdigit():
                try:
                    old_prices[code] = float(price_str)
                except:
                    pass

# 2. Read new prices (just to verify)
new_prices = {}
with open('الأسعار الموحدة النهائية للعقد الموحد لخدمات شبكات الطاقة - مدينة الرياض (1).csv', 'r', encoding='windows-1256', errors='ignore') as f:
    reader = csv.reader(f)
    for row in reader:
        if len(row) > 6:
            code = str(row[1]).strip()
            price_str = str(row[5]).replace(',', '').strip()
            if code.isdigit():
                try:
                    new_prices[code] = float(price_str)
                except:
                    pass

# 3. Read current js/data/price-list.js
with open('js/data/price-list.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract the JSON part
match = re.search(r'const PRICE_LIST = (\[.*?\]);', content, re.DOTALL)
if match:
    items = json.loads(match.group(1))
    
    # Update prices
    updated_count = 0
    for item in items:
        code = item['code']
        if code in old_prices:
            item['oldPrice'] = old_prices[code]
        if code in new_prices:
            item['newPrice'] = new_prices[code]
        updated_count += 1
        
    # Write back
    new_json = json.dumps(items, ensure_ascii=False, indent=2)
    new_content = content.replace(match.group(1), new_json)
    
    with open('js/data/price-list.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f"Updated {updated_count} items.")
else:
    print("Could not parse PRICE_LIST.")
