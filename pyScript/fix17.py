import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update ECU entry in renderParallelConfigTab to include detailed tags
new_ecu_entry = """
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; font-size:12px; gap: 8px;">
                          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width: 0; flex: 1;">
                            <span style="color:#334155; font-weight: 500;">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</span>
                            <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">当前：${esc(ecu.busType)}</span>
                            ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">原有：${esc(ecu.originalBus)}</span>` : ''}
                            <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">刷写包: ${ecu.pkgCount}</span>
                          </div>
                          <label style="display:flex; align-items:center; gap:4px; color:#64748b; font-size:11px; cursor:pointer; flex-shrink: 0;">
                            <input type="checkbox" data-role="pconf-ecu-stop-fa" data-ecu-id="${esc(ecu.id)}"${state.ecuStopFa[ecu.id] ? " checked" : ""} />
                            <span>终止FA</span>
                          </label>
                        </div>
"""

# Find the loop content and replace it
# The pattern is: ${sg.ecus.map(ecuId => { ... return ` ... ` }).join("")}
content = content.replace(
    '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; font-size:12px;">\n                          <span style="color:#334155;">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</span>',
    '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; font-size:12px; gap: 8px;">\n                          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width: 0; flex: 1;">\n                            <span style="color:#334155; font-weight: 500;">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</span>\n                            <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">当前：${esc(ecu.busType)}</span>\n                            ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">原有：${esc(ecu.originalBus)}</span>` : \'\'}\n                            <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">刷写包: ${ecu.pkgCount}</span>\n                          </div>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
