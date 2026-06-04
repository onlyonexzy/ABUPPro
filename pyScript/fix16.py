import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update renderParallelConfigTab to use state.parallelSteps structure
new_render_pconf_tab = """
  const renderParallelConfigTab = () => {
    const steps = state.parallelSteps;
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
            ${steps.map((st, stepIdx) => {
              const ecuCount = st.segments.reduce((acc, sg) => acc + sg.ecus.length, 0);
              return `
              <div class="vf-parallel-step-col" style="min-width: 280px; background: #f1f5f9; border-radius: 8px; padding: 12px; border: 1px solid #cbd5e1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                  <span style="background:#3b82f6; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">步骤 ${stepIdx + 1}</span>
                  <span style="font-size:11px; color:#64748b;">${st.segments.length > 1 ? "并行" : "串行"} · ${st.segments.length} 网段</span>
                </div>
                <div style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 8px;">${esc(st.name)}</div>
                ${st.segments.map((sg, sgIdx) => `
                  <div class="vf-parallel-bus-card" style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:8px;">
                    <div style="padding:6px 10px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                      <strong style="font-size:11px; color:#1e293b;"><i class="fa-solid fa-layer-group" style="margin-right:4px; color:#94a3b8;"></i>${esc(sg.name)}</strong>
                      <span style="font-size:10px; color:#94a3b8;">${sg.ecus.length} ECU</span>
                    </div>
                    <div style="padding:4px;">
                      ${sg.ecus.map(ecuId => {
                        const ecu = getEcuFromExecList(ecuId);
                        if (!ecu) return "";
                        return `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; font-size:12px;">
                          <span style="color:#334155;">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</span>
                          <label style="display:flex; align-items:center; gap:4px; color:#64748b; font-size:11px; cursor:pointer;">
                            <input type="checkbox" data-role="pconf-ecu-stop-fa" data-ecu-id="${esc(ecu.id)}"${state.ecuStopFa[ecu.id] ? " checked" : ""} />
                            <span>终止FA</span>
                          </label>
                        </div>
                        `;
                      }).join("")}
                    </div>
                  </div>
                `).join("")}
              </div>
            `; }).join('<div style="align-self:center; color:#cbd5e1;"><i class="fa-solid fa-chevron-right"></i></div>')}
            ${steps.length === 0 ? '<div class="seq-empty" style="padding: 40px; text-align: center; width: 100%;">请先在“并行顺序”页签中编排步骤</div>' : ''}
          </div>
          <div style="padding: 8px 12px; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9; background: #fcfdfe;">
            <i class="fa-solid fa-circle-info" style="margin-right:4px;"></i>
            步骤间<strong>串行</strong>执行，步骤内网段<strong>并行</strong>执行，网段内 ECU <strong>串行</strong>执行。
          </div>
        </section>

        ${renderScriptConfig("post")}
      </div>
    `;
  };
"""

# Replace the old renderParallelConfigTab with the new one
content = re.sub(r'const renderParallelConfigTab = \(\) => \{[\s\S]+?return `[\s\S]+?`;\n  \};', new_render_pconf_tab, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
