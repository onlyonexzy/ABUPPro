import os

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add initialized state
content = content.replace(
    'isCustomOrder: false,\n    collapsedGroups:',
    'isCustomOrder: false,\n    initialized: false,\n    collapsedGroups:'
)

# 2. Update initDraft to default ETH to execList
old_init_logic = """    state.ecuPool = allEcus.filter(e => !currentExecIds.has(e.id));
    
    // 更新 execList 中可能被删除或修改的 ECU 信息
    const newExecList = [];
    state.execList.forEach(execEcu => {
      const found = allEcus.find(e => e.id === execEcu.id);
      if (found) newExecList.push(found);
    });
    state.execList = newExecList;
    if (!state.isCustomOrder) state.execList.sort((a,b) => a.shortName.localeCompare(b.shortName));

    if (!state.activeTab) state.activeTab = "ecu-config";"""

new_init_logic = """    if (!state.initialized) {
      allEcus.forEach(e => {
        if (e.busType.includes("ETH")) {
          state.execList.push(e);
        } else {
          state.ecuPool.push(e);
        }
      });
      if (!state.isCustomOrder) state.execList.sort((a,b) => a.shortName.localeCompare(b.shortName));
      state.initialized = true;
    } else {
      state.ecuPool = allEcus.filter(e => !currentExecIds.has(e.id));
      const newExecList = [];
      state.execList.forEach(execEcu => {
        const found = allEcus.find(e => e.id === execEcu.id);
        if (found) newExecList.push(found);
      });
      state.execList = newExecList;
      if (!state.isCustomOrder) state.execList.sort((a,b) => a.shortName.localeCompare(b.shortName));
    }

    if (!state.activeTab) state.activeTab = "ecu-config";"""
content = content.replace(old_init_logic, new_init_logic)

# 3. Update renderSerialSeqTab for the ECU tags
old_serial_tag = """                <strong>${esc(e.shortName)}</strong>
                <span style="font-size: 11px; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">当前：${esc(e.busType)}</span>
                <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">刷写包: ${e.pkgCount}</span>"""

new_serial_tag = """                <span style="font-weight:600;">${esc(e.shortName)}（${esc(e.supplierCode)}）</span>
                <span class="seq-tag seq-tag--current">当前：${esc(e.busType)}</span>
                ${e.originalBus ? `<span class="seq-tag seq-tag--origin">原有：${esc(e.originalBus)}</span>` : ''}
                <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">刷写包: ${e.pkgCount}</span>"""
content = content.replace(old_serial_tag, new_serial_tag)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
