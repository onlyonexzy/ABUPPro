import os

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add `isCustomOrder: false` to state
content = content.replace(
    'rerender: null,\n    collapsedGroups:',
    'rerender: null,\n    isCustomOrder: false,\n    collapsedGroups:'
)

# 2. Add moveExecUp and moveExecDown
move_funcs = """  const moveExecUp = (idx) => {
    if (idx > 0) {
      state.isCustomOrder = true;
      const temp = state.execList[idx - 1];
      state.execList[idx - 1] = state.execList[idx];
      state.execList[idx] = temp;
      if (state.rerender) state.rerender();
    }
  };

  const moveExecDown = (idx) => {
    if (idx < state.execList.length - 1) {
      state.isCustomOrder = true;
      const temp = state.execList[idx + 1];
      state.execList[idx + 1] = state.execList[idx];
      state.execList[idx] = temp;
      if (state.rerender) state.rerender();
    }
  };
"""
content = content.replace(
    '  const setTab = (tab) => {',
    move_funcs + '\n  const setTab = (tab) => {'
)

# 3. Add default sorting to initDraft and moveRight
content = content.replace(
    'state.execList = newExecList;\n\n    if (!state.activeTab)',
    'state.execList = newExecList;\n    if (!state.isCustomOrder) state.execList.sort((a,b) => a.shortName.localeCompare(b.shortName));\n\n    if (!state.activeTab)'
)

content = content.replace(
    'state.execList.push(ecu);\n      if (state.rerender) state.rerender();',
    'state.execList.push(ecu);\n      if (!state.isCustomOrder) state.execList.sort((a,b) => a.shortName.localeCompare(b.shortName));\n      if (state.rerender) state.rerender();'
)

# 4. Rewrite renderSerialSeqTab
old_serial_tab = """  const renderSerialSeqTab = () => {
    return `
      <div class="seq-tab-panel ${state.activeTab === 'serial-seq' ? 'is-active' : ''}">
        <div class="seq-simple-list">
          <div style="margin-bottom: 12px; font-size: 14px; color: #475569; text-align: center;">串行执行顺序预览 (按加入顺序)</div>
          ${state.execList.length ? state.execList.map((e, idx) => `
            <div class="seq-simple-item">
              <div><span class="seq-simple-index">${idx + 1}</span> <strong>${esc(e.shortName)}</strong></div>
              <div style="font-size: 11px; color: #64748b;">${esc(e.busType)}</div>
            </div>
          `).join("") : `<div class="seq-empty">暂无执行 ECU，请在 ECU 配置中分配。</div>`}
        </div>
      </div>
    `;
  };"""

new_serial_tab = """  const renderSerialSeqTab = () => {
    return `
      <div class="seq-tab-panel ${state.activeTab === 'serial-seq' ? 'is-active' : ''}" style="flex-direction: column; align-items: center;">
        <div class="seq-simple-list" style="width: 100%; max-width: 600px; display: flex; flex-direction: column; gap: 8px;">
          <div style="margin-bottom: 12px; font-size: 14px; color: #475569; text-align: center;">
            串行执行顺序预览 ${!state.isCustomOrder ? '(默认按 ECU 名称排序)' : '(自定义排序)'}
          </div>
          ${state.execList.length ? state.execList.map((e, idx) => `
            <div class="seq-simple-item" style="padding: 12px 16px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="seq-simple-index" style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: #e2e8f0; color: #475569; border-radius: 4px; font-size: 12px; font-weight: 600;">${idx + 1}</span>
                <strong>${esc(e.shortName)}</strong>
                <span style="font-size: 11px; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">当前：${esc(e.busType)}</span>
                <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">刷写包: ${e.pkgCount}</span>
              </div>
              <div class="seq-item-actions" style="display: flex; gap: 4px;">
                <button class="seq-icon-btn" type="button" data-role="seq-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : 'title="向上移动"'}><i class="fa-solid fa-arrow-up"></i></button>
                <button class="seq-icon-btn" type="button" data-role="seq-move-down" data-idx="${idx}" ${idx === state.execList.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : 'title="向下移动"'}><i class="fa-solid fa-arrow-down"></i></button>
              </div>
            </div>
          `).join("") : `<div class="seq-empty">暂无执行 ECU，请在 ECU 配置中分配。</div>`}
        </div>
      </div>
    `;
  };"""

content = content.replace(old_serial_tab, new_serial_tab)

# 5. Bind up/down events
old_bind = """    root.querySelectorAll('[data-role="seq-move-right"]').forEach(btn => {"""
new_bind = """    root.querySelectorAll('[data-role="seq-move-up"]').forEach(btn => {
      btn.addEventListener("click", () => moveExecUp(parseInt(btn.dataset.idx, 10)));
    });

    root.querySelectorAll('[data-role="seq-move-down"]').forEach(btn => {
      btn.addEventListener("click", () => moveExecDown(parseInt(btn.dataset.idx, 10)));
    });

    root.querySelectorAll('[data-role="seq-move-right"]').forEach(btn => {"""

content = content.replace(old_bind, new_bind)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
