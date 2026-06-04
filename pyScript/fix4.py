import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update push in initDraft
old_push = """          originalBus: ecu.originalProtocol || ecu.mirrorSourceProtocol || "", // 原有总线
        });"""
new_push = """          originalBus: ecu.originalProtocol || ecu.mirrorSourceProtocol || "", // 原有总线
          pkgCount: ecu.strategyConfig?.queueSlots?.length || (ecu.strategyConfig?.extraPackages ? ecu.strategyConfig.extraPackages.length + 1 : 1),
        });"""
content = content.replace(old_push, new_push)

# 2. Update renderEcuItem to add the pkgCount tag
old_render = """          <span class="seq-tag seq-tag--current">当前：${esc(ecu.busType)}</span>
          ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin">原有：${esc(ecu.originalBus)}</span>` : ''}
        </div>"""
new_render = """          <span class="seq-tag seq-tag--current">当前：${esc(ecu.busType)}</span>
          ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin">原有：${esc(ecu.originalBus)}</span>` : ''}
          <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">刷写包: ${ecu.pkgCount}</span>
        </div>"""
content = content.replace(old_render, new_render)

# 3. Inject Search Bar into renderEcuConfigTab
old_tab_start = """    return `
      <div class="seq-tab-panel ${state.activeTab === 'ecu-config' ? 'is-active' : ''}">
        <!-- 左侧 ECU池 -->
        <div class="seq-panel">"""
new_tab_start = """    return `
      <div class="seq-tab-panel ${state.activeTab === 'ecu-config' ? 'is-active' : ''}" style="flex-direction: column; gap: 12px;">
        <div class="seq-search-bar" style="position: relative; max-width: 360px;">
          <i class="fa-solid fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8;"></i>
          <input type="text" data-role="seq-search" placeholder="搜索 ECU 名称或供应商..." style="width: 100%; padding: 8px 12px 8px 32px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#cbd5e1'">
        </div>
        <div style="display: flex; gap: 16px; flex: 1; min-height: 0;">
          <!-- 左侧 ECU池 -->
          <div class="seq-panel">"""
content = content.replace(old_tab_start, new_tab_start)

old_tab_end = """          </div>
        </div>
      </div>
    `;"""
new_tab_end = """          </div>
        </div>
        </div>
      </div>
    `;"""
content = content.replace(old_tab_end, new_tab_end)

# 4. Add search listener in bindOverlay
old_bind = """    root.querySelectorAll('[data-role="seq-toggle-group"]').forEach(btn => {"""
new_bind = """    root.querySelector('[data-role="seq-search"]')?.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      root.querySelectorAll('.seq-ecu-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(q)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    });

    root.querySelectorAll('[data-role="seq-toggle-group"]').forEach(btn => {"""
content = content.replace(old_bind, new_bind)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
