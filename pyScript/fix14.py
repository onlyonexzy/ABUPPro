import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update state to include collapse keys for parallel pool
if 'poolParaCAN' not in content:
    content = content.replace(
        'collapsedGroups: { poolCAN: false, poolETH: false, execCAN: false, execETH: false },',
        'collapsedGroups: { poolCAN: false, poolETH: false, execCAN: false, execETH: false, poolParaCAN: false, poolParaETH: false },'
    )

# 2. Update renderParallelSeqTab to use grouped pool
new_parallel_pool = """          <!-- Right: ECU Pool (from execList) -->
          <section class="arch-panel">
            <div class="arch-panel-header">
              <h4>待分组 ECU</h4>
              <span>${getFilteredExecPool().length} 个可用</span>
            </div>
            <div class="arch-panel-content">
              <div class="arch-toolbar">
                <input data-role="pseq-search" type="text" value="${esc(state.parallelFilterText)}" placeholder="搜索执行列表中的 ECU..." />
              </div>
              <div class="arch-ecu-pool" style="display: flex; flex-direction: column; gap: 12px; padding: 4px;">
                <!-- CAN Group -->
                <div class="seq-ecu-group">
                  <div class="seq-ecu-group-title is-collapsible" data-role="pseq-toggle-group" data-group="poolParaCAN" style="padding: 6px 10px; background: #f1f5f9; border-radius: 6px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; font-size:12px; font-weight:600; color:#475569;">
                    <span>CAN 节点</span>
                    <i class="fa-solid ${state.collapsedGroups.poolParaCAN ? 'fa-chevron-right' : 'fa-chevron-down'}"></i>
                  </div>
                  <div style="display: ${state.collapsedGroups.poolParaCAN ? 'none' : 'flex'}; flex-direction: column; gap: 8px; margin-top: 8px;">
                    ${getFilteredExecPool().filter(e => e.busType.includes("CAN")).map(renderParallelEcuCard).join("") || '<div class="seq-empty" style="font-size:11px;">无 CAN 节点</div>'}
                  </div>
                </div>
                <!-- ETH Group -->
                <div class="seq-ecu-group">
                  <div class="seq-ecu-group-title is-collapsible" data-role="pseq-toggle-group" data-group="poolParaETH" style="padding: 6px 10px; background: #f1f5f9; border-radius: 6px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; font-size:12px; font-weight:600; color:#475569;">
                    <span>ETH 节点</span>
                    <i class="fa-solid ${state.collapsedGroups.poolParaETH ? 'fa-chevron-right' : 'fa-chevron-down'}"></i>
                  </div>
                  <div style="display: ${state.collapsedGroups.poolParaETH ? 'none' : 'flex'}; flex-direction: column; gap: 8px; margin-top: 8px;">
                    ${getFilteredExecPool().filter(e => e.busType.includes("ETH")).map(renderParallelEcuCard).join("") || '<div class="seq-empty" style="font-size:11px;">无 ETH 节点</div>'}
                  </div>
                </div>
              </div>
            </div>
          </section>"""

content = re.sub(r'<!-- Right: ECU Pool \(from execList\) -->[\s\S]+?</section>', new_parallel_pool, content)

# 3. Bind the toggle event in bindOverlay
content = content.replace(
    '      root.querySelector(\'[data-role="pseq-add-step"]\')?.addEventListener("click", () => {',
    '      root.querySelectorAll(\'[data-role="pseq-toggle-group"]\').forEach(btn => { btn.addEventListener("click", () => toggleGroup(btn.dataset.group)); });\n      root.querySelector(\'[data-role="pseq-add-step"]\')?.addEventListener("click", () => {'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
