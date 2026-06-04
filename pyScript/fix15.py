import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add new state variables for the 4th tab
state_insert = """
    preScript: { mode: "default", scriptName: "pre_default_diagnostic.tb2", localFile: "" },
    postScript: { mode: "default", scriptName: "post_default_diagnostic.tb2", localFile: "" },
    globalStopFa: false,
    ecuStopFa: {}, // ecuId -> boolean"""

content = content.replace('parallelFilterText: "",', 'parallelFilterText: "",' + state_insert)

# 2. Add constants for scripts
scripts_consts = """
  const DEFAULT_PRE_SCRIPTS = ["pre_default_diagnostic.tb2", "pre_security_access.tb2", "pre_tester_present.tb2", "pre_ecu_reset.tb2"];
  const DEFAULT_POST_SCRIPTS = ["post_default_diagnostic.tb2", "post_reset_ecu.tb2", "post_verification.tb2", "post_clear_dtc.tb2"];
"""
content = content.replace('  const state = {', scripts_consts + '\n  const state = {')

# 3. Add rendering helpers for the 4th tab
rendering_helpers = """
  /* ---- Parallel Config (4th Tab) Helpers ---- */
  const renderScriptConfig = (prefix) => {
    const d = prefix === "pre" ? state.preScript : state.postScript;
    const isDefault = d.mode === "default";
    const scripts = prefix === "pre" ? DEFAULT_PRE_SCRIPTS : DEFAULT_POST_SCRIPTS;
    const title = prefix === "pre" ? "Pre 脚本配置（刷写前执行）" : "Post 脚本配置（刷写后执行）";
    return `
      <section class="vf-parallel-script" style="margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;">
        <div class="vf-parallel-script__head" style="padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px;">${title}</div>
        <div class="vf-parallel-script__body" style="padding: 12px; display: flex; gap: 20px;">
          <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
            <span>模式</span>
            <select class="flash-config-input" style="width:120px;" data-role="pconf-script-mode" data-prefix="${prefix}">
              <option value="default"${isDefault ? " selected" : ""}>默认脚本</option>
              <option value="custom"${!isDefault ? " selected" : ""}>自定义脚本</option>
            </select>
          </label>
          ${isDefault ? `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
              <span>脚本</span>
              <select class="flash-config-input" style="width:200px;" data-role="pconf-script-name" data-prefix="${prefix}">
                ${scripts.map((s) => `<option value="${esc(s)}"${d.scriptName === s ? " selected" : ""}>${esc(s)}</option>`).join("")}
              </select>
            </label>
          ` : `
            <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
              <span>文件</span>
              <button class="flash-config-action-btn" type="button" data-role="pconf-script-local" data-prefix="${prefix}">
                <i class="fa-solid fa-folder-open"></i>
                <span style="margin-left:4px;">${d.localFile || "选择本地脚本..."}</span>
              </button>
            </div>
          `}
        </div>
      </section>`;
  };

  const renderParallelConfigTab = () => {
    // Group execList by bus type and step (using state.parallelBusSeq if available, or default to step 1)
    const busMap = {};
    state.execList.forEach(ecu => {
      const bType = ecu.busType;
      if (!busMap[bType]) busMap[bType] = { id: `bus-${bType}`, name: bType, protocol: bType, ecus: [] };
      busMap[bType].ecus.push(ecu);
    });

    const stepMap = new Map();
    Object.values(busMap).forEach(bus => {
      const stepNum = state.parallelBusSeq[bus.id] || "1";
      if (!stepMap.has(stepNum)) stepMap.set(stepNum, []);
      stepMap.get(stepNum).push(bus);
    });
    const steps = Array.from(stepMap.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));

    const allFaStopped = state.globalStopFa;

    return `
      <div class="seq-tab-panel ${state.activeTab === 'parallel-conf' ? 'is-active' : ''}" style="flex-direction: column; padding: 16px; overflow-y: auto; background: #f8fbff;">
        <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
          <button class="flash-config-action-btn${allFaStopped ? " is-danger" : ""}" type="button" data-role="pconf-global-stop-fa">
            <i class="fa-solid fa-${allFaStopped ? "circle-check" : "ban"}"></i>
            <span style="margin-left:4px;">${allFaStopped ? "恢复所有FA" : "一键终止所有FA"}</span>
          </button>
        </div>

        ${renderScriptConfig("pre")}

        <section class="vf-parallel-section" style="margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; display: flex; flex-direction: column;">
          <div class="vf-parallel-section__head" style="padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px;">执行步骤编排</div>
          <div class="vf-parallel-step-board" style="padding: 16px; display: flex; gap: 12px; overflow-x: auto; align-items: flex-start;">
            ${steps.map(([_, buses], stepIdx) => `
              <div class="vf-parallel-step-col" style="min-width: 280px; background: #f1f5f9; border-radius: 8px; padding: 12px; border: 1px solid #cbd5e1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                  <span style="background:#3b82f6; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">步骤 ${stepIdx + 1}</span>
                  <span style="font-size:11px; color:#64748b;">${buses.length > 1 ? "并行" : "串行"} · ${buses.length} 总线</span>
                </div>
                ${buses.map(bus => `
                  <div class="vf-parallel-bus-card" style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:8px;">
                    <div style="padding:6px 10px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                      <strong style="font-size:12px; color:#1e293b;"><i class="fa-solid fa-diagram-project" style="margin-right:4px; color:#94a3b8;"></i>${esc(bus.name)}</strong>
                      <span style="font-size:10px; color:#94a3b8;">${esc(bus.protocol)}</span>
                    </div>
                    <div style="padding:4px;">
                      ${bus.ecus.map(ecu => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; font-size:12px;">
                          <span style="color:#334155;">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</span>
                          <label style="display:flex; align-items:center; gap:4px; color:#64748b; font-size:11px; cursor:pointer;">
                            <input type="checkbox" data-role="pconf-ecu-stop-fa" data-ecu-id="${esc(ecu.id)}"${state.ecuStopFa[ecu.id] ? " checked" : ""} />
                            <span>终止FA</span>
                          </label>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `).join("")}
              </div>
            `).join('<div style="align-self:center; color:#cbd5e1;"><i class="fa-solid fa-chevron-right"></i></div>')}
            ${steps.length === 0 ? '<div class="seq-empty">暂无总线数据</div>' : ''}
          </div>
          <div style="padding: 8px 12px; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9; background: #fcfdfe;">
            <i class="fa-solid fa-circle-info" style="margin-right:4px;"></i>
            同一步骤内的总线<strong>并行</strong>执行，不同步骤间<strong>串行</strong>执行。
          </div>
        </section>

        ${renderScriptConfig("post")}
      </div>
    `;
  };
"""

content = content.replace(
    '  const renderParallelSeqTab = () => {',
    rendering_helpers + '\n  const renderParallelSeqTab = () => {'
)

# 4. Update renderOverlay to include the 4th tab
content = content.replace(
    '<button class="seq-dialog-tab ${state.activeTab === \'parallel-seq\' ? \'is-active\' : \'\'}" type="button" data-role="seq-tab" data-tab="parallel-seq">并行顺序</button>',
    '<button class="seq-dialog-tab ${state.activeTab === \'parallel-seq\' ? \'is-active\' : \'\'}" type="button" data-role="seq-tab" data-tab="parallel-seq">并行顺序</button>\n            <button class="seq-dialog-tab ${state.activeTab === \'parallel-conf\' ? \'is-active\' : \'\'}" type="button" data-role="seq-tab" data-tab="parallel-conf">并行配置</button>'
)

content = content.replace(
    '${renderParallelSeqTab()}',
    '${renderParallelSeqTab()}\n            ${renderParallelConfigTab()}'
)

# 5. Add event bindings for the 4th tab in bindOverlay
new_bindings = """
    /* ---- Parallel Config Tab Bindings ---- */
    if (state.activeTab === 'parallel-conf') {
      root.querySelectorAll('[data-role="pconf-script-mode"]').forEach(el => {
        el.addEventListener("change", () => {
          const d = el.dataset.prefix === "pre" ? state.preScript : state.postScript;
          if (d) d.mode = el.value;
          rerender();
        });
      });
      root.querySelectorAll('[data-role="pconf-script-name"]').forEach(el => {
        el.addEventListener("change", () => {
          const d = el.dataset.prefix === "pre" ? state.preScript : state.postScript;
          if (d) d.scriptName = el.value;
        });
      });
      root.querySelectorAll('[data-role="pconf-script-local"]').forEach(el => {
        el.addEventListener("click", () => {
          const d = el.dataset.prefix === "pre" ? state.preScript : state.postScript;
          if (d) {
            d.localFile = `custom_${el.dataset.prefix}_script_${Date.now()}.tb2`;
            notify(`已选择本地脚本：${d.localFile}`);
            rerender();
          }
        });
      });
      root.querySelectorAll('[data-role="pconf-ecu-stop-fa"]').forEach(el => {
        el.addEventListener("change", () => {
          state.ecuStopFa[el.dataset.ecuId] = el.checked;
        });
      });
      root.querySelector('[data-role="pconf-global-stop-fa"]')?.addEventListener("click", () => {
        state.globalStopFa = !state.globalStopFa;
        state.execList.forEach(ecu => {
          state.ecuStopFa[ecu.id] = state.globalStopFa;
        });
        rerender();
      });
    }
"""

content = content.replace(
    '    /* ---- Parallel Tab Bindings ---- */',
    new_bindings + '\n    /* ---- Parallel Tab Bindings ---- */'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
