import os

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('  const render = () => {')
if idx == -1:
    print('Not found')
    exit(1)

new_ending = """  const renderOverlay = () => {
    if (!state.open) return "";
    
    return `
      <div class="pc-dialog-backdrop seq-dialog-backdrop" data-role="seq-close">
        <div class="pc-dialog seq-dialog" data-role="seq-dialog-panel" role="dialog" aria-modal="true" style="display:flex; flex-direction:column;">
          <div class="seq-dialog-head">
            <div class="seq-dialog-head-left">
              <h3 style="margin:0; font-size:18px; font-weight:700;">整车刷写顺序配置</h3>
              <p style="margin:4px 0 0; font-size:12px; color:#64748b;">配置 ECU 的整车刷写流程，并在串行或并行模式下执行</p>
            </div>
            <div class="seq-dialog-actions">
              <button class="seq-btn seq-btn--default" type="button" data-role="seq-close">取消</button>
              <button class="seq-btn seq-btn--primary" type="button" data-role="seq-save">确定</button>
            </div>
          </div>
          <div class="seq-dialog-tabs" style="border-bottom: 1px solid #d9e2f0; flex-shrink: 0; background: #fff;">
            <button class="seq-dialog-tab ${state.activeTab === 'ecu-config' ? 'is-active' : ''}" type="button" data-role="seq-tab" data-tab="ecu-config">ECU 配置</button>
            <button class="seq-dialog-tab ${state.activeTab === 'serial-seq' ? 'is-active' : ''}" type="button" data-role="seq-tab" data-tab="serial-seq">串行顺序</button>
            <button class="seq-dialog-tab ${state.activeTab === 'parallel-seq' ? 'is-active' : ''}" type="button" data-role="seq-tab" data-tab="parallel-seq">并行顺序</button>
          </div>
          <div class="seq-dialog-body" style="background:#f8fbff; flex:1; min-height:0; display:flex; flex-direction:column;">
            ${renderEcuConfigTab()}
            ${renderSerialSeqTab()}
            ${renderParallelSeqTab()}
          </div>
        </div>
      </div>
    `;
  };

  const bindOverlay = (root, rerenderCb) => {
    if (!state.open) return;
    state.rerender = rerenderCb;
    
    root.querySelectorAll('[data-role="seq-close"]')?.forEach(btn => {
      btn.addEventListener("click", () => {
        state.open = false;
        rerenderCb();
      });
    });
    
    root.querySelector('[data-role="seq-dialog-panel"]')?.addEventListener("click", (e) => e.stopPropagation());
    
    root.querySelector('[data-role="seq-save"]')?.addEventListener("click", () => {
      state.open = false;
      notify("整车刷写顺序配置已保存");
      rerenderCb();
    });

    root.querySelectorAll('[data-role="seq-tab"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.activeTab = btn.dataset.tab;
        rerenderCb();
      });
    });

    root.querySelectorAll('[data-role="seq-move-right"]').forEach(btn => {
      btn.addEventListener("click", () => moveRight(btn.dataset.id));
    });

    root.querySelectorAll('[data-role="seq-move-left"]').forEach(btn => {
      btn.addEventListener("click", () => moveLeft(btn.dataset.id));
    });
  };

  /* ---- Public API ---- */
  window.FlashConfigSequenceModule = {
    open: (rerenderCb) => {
      state.rerender = rerenderCb;
      state.open = true;
      initDraft();
      rerenderCb();
    },
    renderOverlay,
    bindOverlay
  };
})();
"""

content = content[:idx] + new_ending
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
