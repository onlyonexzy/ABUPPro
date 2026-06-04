import os

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update renderParallelEcuInSeg to include prefixes
content = content.replace(
    '            <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">${esc(ecu.busType)}</span>',
    '            <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">当前：${esc(ecu.busType)}</span>'
)
content = content.replace(
    '            ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">${esc(ecu.originalBus)}</span>` : \'\'}',
    '            ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">原有：${esc(ecu.originalBus)}</span>` : \'\'}'
)
content = content.replace(
    '            <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">${ecu.pkgCount}包</span>',
    '            <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">刷写包: ${ecu.pkgCount}</span>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
