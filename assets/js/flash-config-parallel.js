(function () {
  const esc = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const notify = (m) => {
    if (typeof showToast === "function") showToast(m);
  };

  const DEFAULT_PRE_SCRIPTS = [
    "pre_default_diagnostic.tb2",
    "pre_security_access.tb2",
    "pre_tester_present.tb2",
    "pre_ecu_reset.tb2",
  ];
  const DEFAULT_POST_SCRIPTS = [
    "post_default_diagnostic.tb2",
    "post_reset_ecu.tb2",
    "post_verification.tb2",
    "post_clear_dtc.tb2",
  ];

  const saved = {
    busSequenceMap: {},
    ecuSequenceMap: {},
    preScript: { mode: "default", scriptName: "pre_default_diagnostic.tb2", localFile: "" },
    postScript: { mode: "default", scriptName: "post_default_diagnostic.tb2", localFile: "" },
    globalStopFunctionalAddr: false,
    ecuStopFunctionalAddr: {},
  };

  const draft = {
    open: false,
    busSequence: {},
    ecuSequence: {},
    preScript: null,
    postScript: null,
    globalStopFa: false,
    ecuStopFa: {},
    drag: null,
    activeTab: "parallel",
    rerender: null,
  };

  const getSnapshot = () => {
    if (window.FlashConfigShared && typeof window.FlashConfigShared.getSnapshot === "function") {
      return window.FlashConfigShared.getSnapshot();
    }
    return { buses: [] };
  };

  const getSortedBuses = (snapshot) =>
    (snapshot.buses || [])
      .map((bus, index) => ({
        bus,
        index,
        sequence: Math.max(1, Number(saved.busSequenceMap[bus.id]) || 1),
      }))
      .sort((a, b) => a.sequence - b.sequence || a.index - b.index);

  const getSortedEcus = (bus) =>
    [...(bus?.ecus || [])]
      .map((ecu, index) => ({
        ecu,
        index,
        sequence: Math.max(1, Number(saved.ecuSequenceMap[ecu.id]) || index + 1),
      }))
      .sort((a, b) => a.sequence - b.sequence || a.index - b.index)
      .map((item) => item.ecu);

  const reorderDraftEcus = (busId, draggedEcuId, targetEcuId) => {
    const snapshot = getSnapshot();
    const bus = (snapshot.buses || []).find((item) => item.id === busId);
    if (!bus || !draggedEcuId || !targetEcuId || draggedEcuId === targetEcuId) return;
    const ordered = getSortedEcus(bus).map((ecu) => ecu.id);
    const fromIndex = ordered.indexOf(draggedEcuId);
    const toIndex = ordered.indexOf(targetEcuId);
    if (fromIndex === -1 || toIndex === -1) return;
    ordered.splice(toIndex, 0, ordered.splice(fromIndex, 1)[0]);
    ordered.forEach((ecuId, i) => {
      draft.ecuSequence[ecuId] = String(i + 1);
    });
  };

  const renderScriptConfig = (prefix, d) => {
    const isDefault = d.mode === "default";
    const scripts = prefix === "pre" ? DEFAULT_PRE_SCRIPTS : DEFAULT_POST_SCRIPTS;
    const title = prefix === "pre" ? "Pre 脚本配置（刷写前执行）" : "Post 脚本配置（刷写后执行）";
    return `
      <section class="vf-parallel-script">
        <div class="vf-parallel-script__head"><strong>${title}</strong></div>
        <div class="vf-parallel-script__body">
          <label class="vf-parallel-script__field">
            <span class="vf-parallel-script__label">模式</span>
            <select class="flash-config-input vf-parallel-script__select" data-role="pc-script-mode" data-prefix="${prefix}">
              <option value="default"${isDefault ? " selected" : ""}>默认脚本</option>
              <option value="custom"${!isDefault ? " selected" : ""}>自定义脚本</option>
            </select>
          </label>
          ${isDefault ? `
            <label class="vf-parallel-script__field">
              <span class="vf-parallel-script__label">脚本</span>
              <select class="flash-config-input vf-parallel-script__select" data-role="pc-script-name" data-prefix="${prefix}">
                ${scripts.map((s) => `<option value="${esc(s)}"${d.scriptName === s ? " selected" : ""}>${esc(s)}</option>`).join("")}
              </select>
            </label>
          ` : `
            <div class="vf-parallel-script__field">
              <span class="vf-parallel-script__label">文件</span>
              <button class="flash-config-action-btn vf-parallel-script__file-btn" type="button" data-role="pc-script-local" data-prefix="${prefix}">
                <i class="fa-solid fa-folder-open"></i>
                <span>${d.localFile || "选择本地脚本..."}</span>
              </button>
            </div>
          `}
        </div>
      </section>`;
  };

  const buildStepsHtml = () => {
    const snapshot = getSnapshot();
    const sortedBuses = getSortedBuses(snapshot);

    const stepMap = new Map();
    sortedBuses.forEach(({ bus }) => {
      const stepNum = draft.busSequence[bus.id] || saved.busSequenceMap[bus.id] || "1";
      if (!stepMap.has(stepNum)) stepMap.set(stepNum, []);
      stepMap.get(stepNum).push(bus);
    });

    const steps = Array.from(stepMap.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));

    return steps
      .map(
        ([, buses], stepIdx) => `
        <div class="vf-parallel-step-col">
          <div class="vf-parallel-step-col__head">
            <span class="vf-parallel-step-col__badge">步骤 ${stepIdx + 1}</span>
            <span class="vf-parallel-step-col__sub">${buses.length > 1 ? "并行" : "串行"} · ${buses.length} 总线</span>
          </div>
          <div class="vf-parallel-step-col__body">
            ${buses.map((bus) => {
              const ecus = getSortedEcus(bus);
              return `
              <div class="vf-parallel-bus-card">
                <div class="vf-parallel-bus-card__head">
                  <i class="fa-solid fa-diagram-project"></i>
                  <strong>${esc(bus.name)}</strong>
                  <span class="vf-parallel-bus-card__protocol">${esc(bus.protocol || "--")}</span>
                  <label class="vf-parallel-bus-card__step-input" title="修改步骤编号以调整并行/串行分组">
                    <span>步骤</span>
                    <input class="flash-config-input" type="number" min="1" step="1"
                      value="${esc(draft.busSequence[bus.id] || saved.busSequenceMap[bus.id] || "1")}"
                      data-role="pc-bus-sequence"
                      data-bus-id="${esc(bus.id)}" />
                  </label>
                </div>
                <div class="vf-parallel-bus-card__ecus">
                  ${ecus.map((ecu) => `
                    <div class="vf-parallel-ecu-item${draft.ecuStopFa[ecu.id] ? " is-fa-stopped" : ""}"
                      draggable="true"
                      data-role="pc-ecu-drag"
                      data-bus-id="${esc(bus.id)}"
                      data-ecu-id="${esc(ecu.id)}">
                      <span class="vf-parallel-ecu-item__grip"><i class="fa-solid fa-grip-vertical"></i></span>
                      <span class="vf-parallel-ecu-item__name">${esc(`${ecu.shortName}（${ecu.supplierCode || "--"}）${ecu.swType && ecu.flashType !== "ETHBootloaderonIP_TypeII" ? `-${ecu.swType}` : ""}`)}</span>
                      <label class="vf-parallel-ecu-item__fa" title="终止此ECU功能寻址发送">
                        <input type="checkbox" data-role="pc-ecu-stop-fa" data-ecu-id="${esc(ecu.id)}"${draft.ecuStopFa[ecu.id] ? " checked" : ""} />
                        <span>终止FA</span>
                      </label>
                    </div>
                  `).join("")}
                </div>
              </div>`;
            }).join("")}
          </div>
        </div>`
      )
      .join('<div class="vf-parallel-step-arrow"><i class="fa-solid fa-chevron-right"></i></div>');
  };

  const renderOverlay = () => {
    if (!draft.open) return "";
    const isParallel = draft.activeTab === "parallel";

    let bodyHtml = "";
    if (isParallel) {
      const stepsHtml = buildStepsHtml();
      bodyHtml = `
        ${renderScriptConfig("pre", draft.preScript || saved.preScript)}
        <section class="vf-parallel-section">
          <div class="vf-parallel-section__head">
            <strong>执行步骤编排</strong>
          </div>
          <div class="vf-parallel-step-board">
            ${stepsHtml || '<div class="vf-parallel-empty">暂无总线数据，请先在刷写配置中准备数据</div>'}
          </div>
          <div class="vf-parallel-hint">
            <i class="fa-solid fa-circle-info"></i>
            同一步骤内的总线<strong>并行</strong>执行，不同步骤间<strong>串行</strong>执行。拖拽 ECU 可调整串行顺序。修改步骤编号可调整总线分组。
          </div>
        </section>
        ${renderScriptConfig("post", draft.postScript || saved.postScript)}
      `;
    } else {
      bodyHtml = window.FlashConfigSerialModule?.renderBody() || '<div class="vf-parallel-empty">加载串行配置失败</div>';
    }

    const allFaStopped = draft.globalStopFa;

    return `
      <div class="pc-dialog-backdrop" data-role="pc-close">
        <div class="pc-dialog" data-role="pc-dialog-panel">
          <div class="pc-dialog__head" style="display: flex; flex-direction: column; gap: 8px; padding-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div class="pc-dialog-tabs" style="display: flex; gap: 4px;">
                <button class="pc-dialog-tab ${!isParallel ? 'is-active' : ''}" type="button" data-role="pc-switch-tab" data-tab="serial">串行配置</button>
                <button class="pc-dialog-tab ${isParallel ? 'is-active' : ''}" type="button" data-role="pc-switch-tab" data-tab="parallel">并行配置</button>
              </div>
              <div class="pc-dialog__head-actions">
                ${isParallel ? `
                  <button class="flash-config-action-btn${allFaStopped ? " is-danger" : ""}" type="button" data-role="pc-global-stop-fa">
                    <i class="fa-solid fa-${allFaStopped ? "circle-check" : "ban"}"></i>
                    <span>${allFaStopped ? "恢复所有FA" : "一键终止所有FA"}</span>
                  </button>
                ` : ''}
                <button class="flash-config-action-btn is-primary" type="button" data-role="pc-save">保存</button>
                <button class="flash-config-action-btn" type="button" data-role="pc-close">取消</button>
              </div>
            </div>
          </div>
          <div class="pc-dialog__body">
            ${bodyHtml}
          </div>
        </div>
      </div>`;
  };

  const closeDraft = () => {
    draft.open = false;
    draft.busSequence = {};
    draft.ecuSequence = {};
    draft.preScript = null;
    draft.postScript = null;
    draft.drag = null;
  };

  const bindOverlay = (root, rerender) => {
    if (!draft.open) return;

    root.querySelectorAll('[data-role="pc-close"]').forEach((el) => {
      el.addEventListener("click", () => { closeDraft(); rerender(); });
    });

    root.querySelectorAll('[data-role="pc-switch-tab"]').forEach((el) => {
      el.addEventListener("click", () => {
        draft.activeTab = el.dataset.tab;
        rerender();
      });
    });

    root.querySelector('[data-role="pc-dialog-panel"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    root.querySelector('[data-role="pc-save"]')?.addEventListener("click", () => {
      if (draft.activeTab === "parallel") {
        Object.assign(saved.busSequenceMap, draft.busSequence);
        Object.assign(saved.ecuSequenceMap, draft.ecuSequence);
        if (draft.preScript) saved.preScript = { ...draft.preScript };
        if (draft.postScript) saved.postScript = { ...draft.postScript };
        saved.globalStopFunctionalAddr = draft.globalStopFa;
        saved.ecuStopFunctionalAddr = { ...draft.ecuStopFa };
      } else {
         window.FlashConfigSerialModule?.commitDraft?.();
      }
      closeDraft();
      rerender();
      window.dispatchEvent(new CustomEvent("flash-config-shared-updated"));
      notify(draft.activeTab === "parallel" ? "并行配置已保存" : "串行配置已保存");
    });

    if (draft.activeTab === "serial") {
      window.FlashConfigSerialModule?.bindEvents?.(root, rerender);
      return; // Do not bind parallel events if on serial tab
    }


    root.querySelectorAll('[data-role="pc-bus-sequence"]').forEach((el) => {
      el.addEventListener("input", () => {
        draft.busSequence[el.dataset.busId || ""] = String(Math.max(1, Number(el.value) || 1));
      });
      el.addEventListener("change", () => rerender());
    });

    root.querySelectorAll('[data-role="pc-ecu-drag"]').forEach((el) => {
      el.addEventListener("dragstart", () => {
        draft.drag = { busId: el.dataset.busId || "", ecuId: el.dataset.ecuId || "" };
        el.classList.add("is-dragging");
      });
      el.addEventListener("dragover", (e) => {
        if (!draft.drag || draft.drag.busId !== (el.dataset.busId || "")) return;
        e.preventDefault();
        el.classList.add("is-drop-target");
      });
      el.addEventListener("dragleave", () => el.classList.remove("is-drop-target"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("is-drop-target");
        if (!draft.drag) return;
        reorderDraftEcus(el.dataset.busId || "", draft.drag.ecuId, el.dataset.ecuId || "");
        draft.drag = null;
        rerender();
      });
      el.addEventListener("dragend", () => {
        draft.drag = null;
        root.querySelectorAll(".vf-parallel-ecu-item").forEach((item) => {
          item.classList.remove("is-dragging", "is-drop-target");
        });
      });
    });

    root.querySelectorAll('[data-role="pc-script-mode"]').forEach((el) => {
      el.addEventListener("change", () => {
        const d = el.dataset.prefix === "pre" ? draft.preScript : draft.postScript;
        if (d) d.mode = el.value;
        rerender();
      });
    });

    root.querySelectorAll('[data-role="pc-script-name"]').forEach((el) => {
      el.addEventListener("change", () => {
        const d = el.dataset.prefix === "pre" ? draft.preScript : draft.postScript;
        if (d) d.scriptName = el.value;
      });
    });

    root.querySelectorAll('[data-role="pc-script-local"]').forEach((el) => {
      el.addEventListener("click", () => {
        const d = el.dataset.prefix === "pre" ? draft.preScript : draft.postScript;
        if (d) {
          d.localFile = `custom_${el.dataset.prefix}_script_${Date.now()}.tb2`;
          notify(`已选择本地脚本：${d.localFile}`);
          rerender();
        }
      });
    });

    root.querySelectorAll('[data-role="pc-ecu-stop-fa"]').forEach((el) => {
      el.addEventListener("change", () => {
        draft.ecuStopFa[el.dataset.ecuId || ""] = el.checked;
      });
    });

    root.querySelector('[data-role="pc-global-stop-fa"]')?.addEventListener("click", () => {
      draft.globalStopFa = !draft.globalStopFa;
      const snapshot = getSnapshot();
      (snapshot.buses || []).forEach((bus) => {
        (bus.ecus || []).forEach((ecu) => {
          draft.ecuStopFa[ecu.id] = draft.globalStopFa;
        });
      });
      rerender();
    });
  };

  window.FlashConfigParallelModule = {
    open(rerender) {
      draft.open = true;
      const snapshot = getSnapshot();
      const busSeq = {};
      const ecuSeq = {};
      (snapshot.buses || []).forEach((bus, bIdx) => {
        busSeq[bus.id] = saved.busSequenceMap[bus.id] || "1";
        (bus.ecus || []).forEach((ecu, eIdx) => {
          ecuSeq[ecu.id] = saved.ecuSequenceMap[ecu.id] || String(eIdx + 1);
        });
      });
      draft.busSequence = busSeq;
      draft.ecuSequence = ecuSeq;
      draft.preScript = { ...saved.preScript };
      draft.postScript = { ...saved.postScript };
      draft.globalStopFa = saved.globalStopFunctionalAddr;
      draft.ecuStopFa = { ...saved.ecuStopFunctionalAddr };
      draft.rerender = rerender;
      draft.activeTab = "serial"; // defaults to serial when open
      window.FlashConfigSerialModule?.loadDraft?.();
      rerender();
    },
    renderOverlay,
    bindOverlay,
    getSavedConfig() {
      return {
        busSequenceMap: { ...saved.busSequenceMap },
        ecuSequenceMap: { ...saved.ecuSequenceMap },
        preScript: { ...saved.preScript },
        postScript: { ...saved.postScript },
        globalStopFunctionalAddr: saved.globalStopFunctionalAddr,
        ecuStopFunctionalAddr: { ...saved.ecuStopFunctionalAddr },
      };
    },
  };
})();
