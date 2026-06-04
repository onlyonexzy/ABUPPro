import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/vehicle-flash.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update "步骤" to "并行组" in renderExecution
content = content.replace('<span class="vf-parallel-step-col__badge">步骤 ${esc(group.label)}</span>', 
                          '<span class="vf-parallel-step-col__badge">并行组 ${esc(group.label)}</span>')

# 2. Remove the "步骤" row from renderPackageTable
old_group_row_logic = """          if (lastStepLabel !== row.stepLabel) {
            groupRowHtml += `<tr class="vehicle-flash-group-row"><td colspan="5">步骤 ${esc(row.stepLabel || "--")}</td></tr>`;
          }"""

# Use regex to find and remove it, as it might have slight whitespace variations
content = re.sub(r'if\s*\(lastStepLabel\s*!==\s*row\.stepLabel\)\s*{\s*groupRowHtml\s*\+=\s*`<tr class="vehicle-flash-group-row"><td colspan="5">步骤 \${esc\(row\.stepLabel\s*\|\|\s*"--"\)\}<\/td><\/tr>`;\s*}', 
                 '', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
