import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update renderParallelEcuInSeg to match ECU tags
old_pseq_ecu_in_seg = """    return `
      <li class="arch-seg-ecu-item" draggable="true" data-role="pseq-seg-ecu" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-id="${esc(ecuId)}">
        <div class="arch-seg-ecu-item-left">
          <span class="arch-seg-ecu-order">${idx + 1}</span>
          <span class="arch-seg-ecu-name">${esc(ecu.shortName)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:3px;">
          <span class="arch-seg-ecu-bus" style="font-size:10px; color:#64748b;">${esc(ecu.busType)}</span>"""

new_pseq_ecu_in_seg = """    return `
      <li class="arch-seg-ecu-item" draggable="true" data-role="pseq-seg-ecu" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-id="${esc(ecuId)}" style="font-size: 11px;">
        <div class="arch-seg-ecu-item-left" style="flex: 1; min-width: 0;">
          <span class="arch-seg-ecu-order">${idx + 1}</span>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width: 0;">
            <span style="font-weight:600;">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</span>
            <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">${esc(ecu.busType)}</span>
            ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">${esc(ecu.originalBus)}</span>` : ''}
            <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">${ecu.pkgCount}包</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:3px; flex-shrink: 0;">"""

content = content.replace(old_pseq_ecu_in_seg, new_pseq_ecu_in_seg)

# 2. Update renderParallelEcuCard to match ECU tags
old_pseq_ecu_card = """  const renderParallelEcuCard = (ecu) => {
    return `
      <div class="arch-ecu-card" draggable="true" data-role="pseq-pool-ecu" data-ecu-id="${esc(ecu.id)}">
        <div class="arch-ecu-card-info">
          <strong>${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</strong>
        </div>
        <span class="arch-type-tag">${esc(ecu.busType)}</span>
      </div>`;
  };"""

new_pseq_ecu_card = """  const renderParallelEcuCard = (ecu) => {
    return `
      <div class="arch-ecu-card" draggable="true" data-role="pseq-pool-ecu" data-ecu-id="${esc(ecu.id)}" style="display:flex; flex-direction:column; align-items:flex-start; gap:4px; padding:8px 10px;">
        <div class="arch-ecu-card-info" style="width: 100%;">
          <strong style="font-size: 12px;">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</strong>
        </div>
        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">当前：${esc(ecu.busType)}</span>
          ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">原有：${esc(ecu.originalBus)}</span>` : ''}
          <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">刷写包: ${ecu.pkgCount}</span>
        </div>
      </div>`;
  };"""

content = content.replace(old_pseq_ecu_card, new_pseq_ecu_card)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
