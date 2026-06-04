import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update state
content = content.replace(
    'rerender: null,',
    'rerender: null,\n    collapsedGroups: { poolCAN: false, poolETH: false, execCAN: false, execETH: false },'
)

# 2. Add toggleGroup function right after setTab
toggle_func = """
  const toggleGroup = (groupKey) => {
    state.collapsedGroups[groupKey] = !state.collapsedGroups[groupKey];
    if (state.rerender) state.rerender();
  };
"""
content = content.replace(
    'const setTab = (tab) => {',
    toggle_func + '\n  const setTab = (tab) => {'
)

# 3. Update renderEcuItem
old_renderEcuItem = """  const renderEcuItem = (ecu, isPool) => {
    const tags = [];
    tags.push(`<span class="seq-tag seq-tag--current">当前: ${esc(ecu.busType)}</span>`);
    if (ecu.originalBus) {
      tags.push(`<span class="seq-tag seq-tag--origin">原有: ${esc(ecu.originalBus)}</span>`);
    }

    return `
      <div class="seq-ecu-item">
        <div class="seq-ecu-item-head">
          <div class="seq-ecu-name">
            <i class="fa-solid fa-microchip"></i>
            ${esc(ecu.shortName)}
          </div>
          <div class="seq-item-actions">
            ${isPool ? 
              `<button class="seq-icon-btn" type="button" data-role="seq-move-right" data-id="${esc(ecu.id)}" title="移至执行列表"><i class="fa-solid fa-arrow-right"></i></button>` : 
              `<button class="seq-icon-btn" type="button" data-role="seq-move-left" data-id="${esc(ecu.id)}" title="移回ECU池"><i class="fa-solid fa-arrow-left"></i></button>`
            }
          </div>
        </div>
        <div class="seq-ecu-tags">
          ${tags.join("")}
        </div>
        <div class="seq-ecu-supplier">供应商代码: ${esc(ecu.supplierCode)}</div>
      </div>
    `;
  };"""

new_renderEcuItem = """  const renderEcuItem = (ecu, isPool) => {
    return `
      <div class="seq-ecu-item" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px;">
        <div class="seq-ecu-info-inline" style="display:flex; align-items:center; gap:8px; font-size:13px; color:#0f172a; flex-wrap:wrap;">
          <i class="fa-solid fa-microchip" style="color:#64748b;"></i>
          <span style="font-weight:600;">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</span>
          <span class="seq-tag seq-tag--current">当前：${esc(ecu.busType)}</span>
          ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin">原有：${esc(ecu.originalBus)}</span>` : ''}
        </div>
        <div class="seq-item-actions" style="flex-shrink:0; margin-left:8px;">
          ${isPool ? 
            `<button class="seq-icon-btn" type="button" data-role="seq-move-right" data-id="${esc(ecu.id)}" title="移至执行列表"><i class="fa-solid fa-arrow-right"></i></button>` : 
            `<button class="seq-icon-btn" type="button" data-role="seq-move-left" data-id="${esc(ecu.id)}" title="移回ECU池"><i class="fa-solid fa-arrow-left"></i></button>`
          }
        </div>
      </div>
    `;
  };"""
content = content.replace(old_renderEcuItem, new_renderEcuItem)

# 4. Update renderEcuConfigTab with collapsibles and CAN/ETH names
old_renderEcuConfigTab = """  const renderEcuConfigTab = () => {
    // 按总线类型分类 CAN / ETH
    const poolCan = state.ecuPool.filter(e => e.busType.includes("CAN"));
    const poolEth = state.ecuPool.filter(e => e.busType.includes("ETH"));
    
    // 执行列表同理
    const execCan = state.execList.filter(e => e.busType.includes("CAN"));
    const execEth = state.execList.filter(e => e.busType.includes("ETH"));

    return `
      <div class="seq-tab-panel ${state.activeTab === 'ecu-config' ? 'is-active' : ''}">
        <!-- 左侧 ECU池 -->
        <div class="seq-panel">
          <div class="seq-panel-header">
            <h4>ECU 池</h4>
            <span>待分配 (${state.ecuPool.length})</span>
          </div>
          <div class="seq-panel-content">
            <div class="seq-ecu-group">
              <div class="seq-ecu-group-title">CAN / CANFD</div>
              <div class="seq-ecu-list">
                ${poolCan.length ? poolCan.map(e => renderEcuItem(e, true)).join("") : `<div class="seq-empty">暂无 CAN 节点</div>`}
              </div>
            </div>
            <div class="seq-ecu-group">
              <div class="seq-ecu-group-title">以太网 (ETH)</div>
              <div class="seq-ecu-list">
                ${poolEth.length ? poolEth.map(e => renderEcuItem(e, true)).join("") : `<div class="seq-empty">暂无 ETH 节点</div>`}
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧 执行列表 -->
        <div class="seq-panel">
          <div class="seq-panel-header">
            <h4>执行 ECU</h4>
            <span>已加入执行 (${state.execList.length})</span>
          </div>
          <div class="seq-panel-content">
            <div class="seq-ecu-group">
              <div class="seq-ecu-group-title">CAN / CANFD</div>
              <div class="seq-ecu-list">
                ${execCan.length ? execCan.map(e => renderEcuItem(e, false)).join("") : `<div class="seq-empty">拖拽或点击移入 CAN 节点</div>`}
              </div>
            </div>
            <div class="seq-ecu-group">
              <div class="seq-ecu-group-title">以太网 (ETH)</div>
              <div class="seq-ecu-list">
                ${execEth.length ? execEth.map(e => renderEcuItem(e, false)).join("") : `<div class="seq-empty">拖拽或点击移入 ETH 节点</div>`}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };"""

new_renderEcuConfigTab = """  const renderEcuConfigTab = () => {
    // 按总线类型分类 CAN / ETH
    const poolCan = state.ecuPool.filter(e => e.busType.includes("CAN"));
    const poolEth = state.ecuPool.filter(e => e.busType.includes("ETH"));
    
    // 执行列表同理
    const execCan = state.execList.filter(e => e.busType.includes("CAN"));
    const execEth = state.execList.filter(e => e.busType.includes("ETH"));

    return `
      <div class="seq-tab-panel ${state.activeTab === 'ecu-config' ? 'is-active' : ''}">
        <!-- 左侧 ECU池 -->
        <div class="seq-panel">
          <div class="seq-panel-header">
            <h4>ECU 池</h4>
            <span>待分配 (${state.ecuPool.length})</span>
          </div>
          <div class="seq-panel-content">
            <div class="seq-ecu-group">
              <div class="seq-ecu-group-title is-collapsible" data-role="seq-toggle-group" data-group="poolCAN">
                <span>CAN</span>
                <i class="fa-solid ${state.collapsedGroups.poolCAN ? 'fa-chevron-right' : 'fa-chevron-down'}"></i>
              </div>
              <div class="seq-ecu-list" style="display: ${state.collapsedGroups.poolCAN ? 'none' : 'flex'}">
                ${poolCan.length ? poolCan.map(e => renderEcuItem(e, true)).join("") : `<div class="seq-empty">暂无 CAN 节点</div>`}
              </div>
            </div>
            <div class="seq-ecu-group">
              <div class="seq-ecu-group-title is-collapsible" data-role="seq-toggle-group" data-group="poolETH">
                <span>ETH</span>
                <i class="fa-solid ${state.collapsedGroups.poolETH ? 'fa-chevron-right' : 'fa-chevron-down'}"></i>
              </div>
              <div class="seq-ecu-list" style="display: ${state.collapsedGroups.poolETH ? 'none' : 'flex'}">
                ${poolEth.length ? poolEth.map(e => renderEcuItem(e, true)).join("") : `<div class="seq-empty">暂无 ETH 节点</div>`}
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧 执行列表 -->
        <div class="seq-panel">
          <div class="seq-panel-header">
            <h4>执行 ECU</h4>
            <span>已加入执行 (${state.execList.length})</span>
          </div>
          <div class="seq-panel-content">
            <div class="seq-ecu-group">
              <div class="seq-ecu-group-title is-collapsible" data-role="seq-toggle-group" data-group="execCAN">
                <span>CAN</span>
                <i class="fa-solid ${state.collapsedGroups.execCAN ? 'fa-chevron-right' : 'fa-chevron-down'}"></i>
              </div>
              <div class="seq-ecu-list" style="display: ${state.collapsedGroups.execCAN ? 'none' : 'flex'}">
                ${execCan.length ? execCan.map(e => renderEcuItem(e, false)).join("") : `<div class="seq-empty">拖拽或点击移入 CAN 节点</div>`}
              </div>
            </div>
            <div class="seq-ecu-group">
              <div class="seq-ecu-group-title is-collapsible" data-role="seq-toggle-group" data-group="execETH">
                <span>ETH</span>
                <i class="fa-solid ${state.collapsedGroups.execETH ? 'fa-chevron-right' : 'fa-chevron-down'}"></i>
              </div>
              <div class="seq-ecu-list" style="display: ${state.collapsedGroups.execETH ? 'none' : 'flex'}">
                ${execEth.length ? execEth.map(e => renderEcuItem(e, false)).join("") : `<div class="seq-empty">拖拽或点击移入 ETH 节点</div>`}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };"""
content = content.replace(old_renderEcuConfigTab, new_renderEcuConfigTab)

# 5. Remove subtitle
content = content.replace(
    '<p style="margin:4px 0 0; font-size:12px; color:#64748b;">配置 ECU 的整车刷写流程，并在串行或并行模式下执行</p>',
    ''
)

# 6. Add event listeners for toggling
content = content.replace(
    'root.querySelectorAll(\'[data-role="seq-tab"]\').forEach(btn => {',
    """root.querySelectorAll('[data-role="seq-toggle-group"]').forEach(btn => {
      btn.addEventListener("click", () => toggleGroup(btn.dataset.group));
    });

    root.querySelectorAll('[data-role="seq-tab"]').forEach(btn => {"""
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
