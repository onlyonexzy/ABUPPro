/**
 * flash-config-architecture.js — 并行设置弹框
 * 三层结构：
 *   并行组(步骤) → 串行执行
 *     网段(总线) → 同步骤内并行执行
 *       ECU     → 同网段内串行执行
 */
(function () {
  const esc = (v) =>
    String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const notify = (m) => { if (typeof showToast === "function") showToast(m); };
  let _uid = 0;
  const uid = (p) => `${p}_${++_uid}_${Date.now()}`;
  const deepCopy = (v) => JSON.parse(JSON.stringify(v));

  const getSnapshot = () => {
    if (window.FlashConfigShared && typeof window.FlashConfigShared.getSnapshot === "function")
      return window.FlashConfigShared.getSnapshot();
    return { buses: [] };
  };

  /*
   * state.steps = [
   *   { id, name, segments: [
   *       { id, name, ecus: [ecuId, ...] }
   *   ]}
   * ]
   */
  const state = {
    open: false,
    steps: [],
    ecuPool: [],       // flat list: {id, shortName, supplierCode, busType}
    filterText: "",
    addStepName: "",
    addSegName: {},    // stepId -> input text
    drag: null,
    rerender: null,
  };

  /* ---- helpers ---- */
  const isEcuAssigned = (ecuId) =>
    state.steps.some((st) => st.segments.some((seg) => seg.ecus.includes(ecuId)));
  const getEcuInfo = (ecuId) => state.ecuPool.find((e) => e.id === ecuId);
  const isStepNameDup = (name, exId) =>
    state.steps.some((s) => s.id !== exId && s.name.trim() === name.trim());
  const isSegNameDup = (stepId, name, exId) => {
    const st = state.steps.find((s) => s.id === stepId);
    return st ? st.segments.some((sg) => sg.id !== exId && sg.name.trim() === name.trim()) : false;
  };

  /* ---- init ---- */
  const initDraft = () => {
    const snap = getSnapshot();
    const ecuMap = new Map();
    (snap.buses || []).forEach((bus) => {
      (bus.ecus || []).forEach((ecu) => {
        if (!ecuMap.has(ecu.id)) {
          ecuMap.set(ecu.id, {
            id: ecu.id,
            shortName: ecu.shortName || ecu.name || "ECU",
            supplierCode: ecu.supplierCode || "--",
            busType: bus.protocol || "--",
          });
        }
      });
    });
    state.ecuPool = Array.from(ecuMap.values());
    if (!state.steps.length) state.steps = [];
    state.filterText = "";
    state.addStepName = "";
    state.addSegName = {};
    state.drag = null;
  };

  /* ---- mutations ---- */
  const addStep = (name) => {
    const t = (name || "").trim();
    if (!t) { notify("请输入并行组名称"); return false; }
    if (isStepNameDup(t)) { notify("并行组名称已存在"); return false; }
    state.steps.push({ id: uid("step"), name: t, segments: [] });
    state.addStepName = "";
    return true;
  };
  const removeStep = (id) => { state.steps = state.steps.filter((s) => s.id !== id); };
  const addSegment = (stepId, name) => {
    const t = (name || "").trim();
    if (!t) { notify("请输入网段名称"); return false; }
    if (isSegNameDup(stepId, t)) { notify("该并行组内网段名称已存在"); return false; }
    const st = state.steps.find((s) => s.id === stepId);
    if (!st) return false;
    st.segments.push({ id: uid("seg"), name: t, ecus: [] });
    state.addSegName[stepId] = "";
    return true;
  };
  const removeSegment = (stepId, segId) => {
    const st = state.steps.find((s) => s.id === stepId);
    if (st) st.segments = st.segments.filter((sg) => sg.id !== segId);
  };
  const addEcuToSeg = (ecuId, stepId, segId) => {
    // remove from all segments first
    state.steps.forEach((st) => st.segments.forEach((sg) => {
      sg.ecus = sg.ecus.filter((id) => id !== ecuId);
    }));
    const st = state.steps.find((s) => s.id === stepId);
    const sg = st?.segments.find((s) => s.id === segId);
    if (sg) sg.ecus.push(ecuId);
  };
  const removeEcuFromSeg = (stepId, segId, ecuId) => {
    const st = state.steps.find((s) => s.id === stepId);
    const sg = st?.segments.find((s) => s.id === segId);
    if (sg) sg.ecus = sg.ecus.filter((id) => id !== ecuId);
  };
  const reorderEcu = (stepId, segId, fromEcuId, toEcuId) => {
    const st = state.steps.find((s) => s.id === stepId);
    const sg = st?.segments.find((s) => s.id === segId);
    if (!sg || fromEcuId === toEcuId) return;
    const fi = sg.ecus.indexOf(fromEcuId), ti = sg.ecus.indexOf(toEcuId);
    if (fi === -1 || ti === -1) return;
    sg.ecus.splice(ti, 0, sg.ecus.splice(fi, 1)[0]);
  };
  const moveEcuInSeg = (stepId, segId, ecuIdx, dir) => {
    const st = state.steps.find((s) => s.id === stepId);
    const sg = st?.segments.find((s) => s.id === segId);
    if (!sg) return;
    const ti = dir === 'up' ? ecuIdx - 1 : ecuIdx + 1;
    if (ti < 0 || ti >= sg.ecus.length) return;
    sg.ecus.splice(ti, 0, sg.ecus.splice(ecuIdx, 1)[0]);
  };
  const reorderStep = (fromIdx, toIdx) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= state.steps.length) return;
    state.steps.splice(toIdx, 0, state.steps.splice(fromIdx, 1)[0]);
  };

  /* ---- filtered pool (hide assigned) ---- */
  const filteredPool = () => {
    const pool = state.ecuPool.filter((e) => !isEcuAssigned(e.id));
    const kw = state.filterText.trim().toLowerCase();
    if (!kw) return pool;
    return pool.filter((e) =>
      e.shortName.toLowerCase().includes(kw) || e.supplierCode.toLowerCase().includes(kw)
    );
  };
  const unassignedCount = () => state.ecuPool.filter((e) => !isEcuAssigned(e.id)).length;

  /* ======== RENDER ======== */
  const renderEcuInSeg = (ecuId, stepId, segId, idx, total) => {
    const ecu = getEcuInfo(ecuId);
    if (!ecu) return "";
    const isFirst = idx === 0, isLast = idx === total - 1;
    return `<li class="arch-seg-ecu-item" draggable="true"
        data-role="arch-seg-ecu" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-id="${esc(ecuId)}">
      <div class="arch-seg-ecu-item-left">
        <span class="arch-seg-ecu-order">${idx + 1}</span>
        <span class="arch-seg-ecu-name">${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</span>
      </div>
      <div style="display:flex;align-items:center;gap:3px;">
        <span class="arch-seg-ecu-bus">${esc(ecu.busType)}</span>
        <button class="arch-icon-btn" type="button" title="上移" ${isFirst ? 'disabled style="opacity:.3;cursor:default"' : ''}
          data-role="arch-ecu-up" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-idx="${idx}">
          <i class="fa-solid fa-arrow-up"></i></button>
        <button class="arch-icon-btn" type="button" title="下移" ${isLast ? 'disabled style="opacity:.3;cursor:default"' : ''}
          data-role="arch-ecu-down" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-idx="${idx}">
          <i class="fa-solid fa-arrow-down"></i></button>
        <button class="arch-icon-btn is-danger" type="button" title="移出"
          data-role="arch-remove-ecu" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-id="${esc(ecuId)}">
          <i class="fa-solid fa-xmark"></i></button>
      </div>
    </li>`;
  };

  const renderSegment = (seg, stepId, segIdx) => {
    const total = seg.ecus.length;
    const ecusHtml = total
      ? seg.ecus.map((eid, i) => renderEcuInSeg(eid, stepId, seg.id, i, total)).join("")
      : `<li class="arch-empty-tip">拖动 ECU 到此处（串行执行）</li>`;
    return `<div class="arch-seg-card" data-role="arch-seg-card" data-step-id="${esc(stepId)}" data-seg-id="${esc(seg.id)}">
      <div class="arch-seg-head">
        <div class="arch-seg-head-left">
          <span class="arch-seg-badge">${segIdx + 1}</span>
          <span class="arch-seg-name">${esc(seg.name)}</span>
        </div>
        <div class="arch-seg-head-right">
          <span class="arch-seg-parallel-tag">并行</span>
          <span class="arch-seg-meta">${seg.ecus.length} ECU</span>
          <button class="arch-icon-btn is-danger" type="button" title="删除网段"
            data-role="arch-del-seg" data-step-id="${esc(stepId)}" data-seg-id="${esc(seg.id)}">
            <i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>
      <ul class="arch-seg-ecus" data-role="arch-seg-drop" data-step-id="${esc(stepId)}" data-seg-id="${esc(seg.id)}">
        ${ecusHtml}
      </ul>
    </div>`;
  };

  const renderStep = (step, idx) => {
    const segCount = step.segments.length;
    const ecuCount = step.segments.reduce((s, sg) => s + sg.ecus.length, 0);
    const segHtml = step.segments.map((sg, i) => renderSegment(sg, step.id, i)).join("");
    const segInput = state.addSegName[step.id] || "";
    const isFirst = idx === 0, isLast = idx === state.steps.length - 1;
    return `<div class="arch-step-card" data-role="arch-step-card" data-step-id="${esc(step.id)}" data-step-idx="${idx}">
      <div class="arch-step-head">
        <div class="arch-step-head-left">
          <span class="arch-step-badge">并行组 ${idx + 1}</span>
          <span class="arch-step-name" title="${esc(step.name)}">${esc(step.name)}</span>
        </div>
        <div class="arch-step-head-right">
          <span class="arch-step-meta">${segCount} 网段 · ${ecuCount} ECU</span>
          <button class="arch-icon-btn" type="button" title="上移" ${isFirst ? 'disabled style="opacity:.3;cursor:default"' : ''}
            data-role="arch-step-up" data-step-idx="${idx}"><i class="fa-solid fa-arrow-up"></i></button>
          <button class="arch-icon-btn" type="button" title="下移" ${isLast ? 'disabled style="opacity:.3;cursor:default"' : ''}
            data-role="arch-step-down" data-step-idx="${idx}"><i class="fa-solid fa-arrow-down"></i></button>
          <button class="arch-icon-btn is-danger" type="button" title="删除并行组"
            data-role="arch-del-step" data-step-id="${esc(step.id)}">
            <i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>
      <div class="arch-add-seg-bar">
        <input type="text" placeholder="添加网段名称…"
          data-role="arch-seg-name-input" data-step-id="${esc(step.id)}" value="${esc(segInput)}" />
        <button type="button" data-role="arch-add-seg" data-step-id="${esc(step.id)}">+ 网段</button>
      </div>
      <div class="arch-step-body">
        ${segHtml || `<div class="arch-empty-tip">添加网段后可拖入 ECU</div>`}
      </div>
    </div>`;
  };

  const renderEcuCard = (ecu) => {
    return `<div class="arch-ecu-card" draggable="true"
        data-role="arch-pool-ecu" data-ecu-id="${esc(ecu.id)}">
      <div class="arch-ecu-card-info">
        <strong>${esc(ecu.shortName)}（${esc(ecu.supplierCode)}）</strong>
      </div>
      <span class="arch-type-tag">${esc(ecu.busType)}</span>
    </div>`;
  };

  const renderOverlay = () => {
    if (!state.open) return "";
    const stepsHtml = state.steps.length
      ? state.steps.map((st, i) => {
          const arrow = i < state.steps.length - 1
            ? `<div class="arch-serial-arrow"><i class="fa-solid fa-arrow-down"></i><span>串行</span></div>` : "";
          return renderStep(st, i) + arrow;
        }).join("")
      : `<div class="arch-empty-tip" style="margin-top:8px;">点击上方"添加并行组"开始配置</div>`;

    return `<div class="pc-dialog-backdrop arch-dialog-backdrop" data-role="arch-close">
      <div class="pc-dialog arch-dialog" data-role="arch-dialog-panel">
        <div class="arch-dialog-head">
          <div>
            <h3>并行设置</h3>
            <p>并行组（步骤）间串行，组内网段间并行，网段内 ECU 串行。</p>
          </div>
          <div class="arch-dialog-actions">
            <button class="flash-config-action-btn is-primary" type="button" data-role="arch-save">保存</button>
            <button class="flash-config-action-btn" type="button" data-role="arch-close">取消</button>
          </div>
        </div>
        <div class="arch-dialog-body">
          <section class="arch-panel">
            <div class="arch-panel-header">
              <h4>执行步骤编排</h4>
              <span>${state.steps.length} 个并行组</span>
            </div>
            <div class="arch-panel-content">
              <div class="arch-hint-banner">
                <i class="fa-solid fa-circle-info"></i>
                <span><strong>步骤间串行</strong>（步骤1→步骤2→…），每步骤内网段<strong>并行</strong>，网段内 ECU <strong>串行</strong></span>
              </div>
              <div class="arch-add-bar">
                <input type="text" placeholder="输入并行组（步骤）名称…"
                  data-role="arch-step-name-input" value="${esc(state.addStepName)}" />
                <button type="button" data-role="arch-add-step"><i class="fa-solid fa-plus"></i> 添加并行组</button>
              </div>
              <div class="arch-step-list">${stepsHtml}</div>
              <div class="arch-legend">
                <div class="arch-legend-item"><span class="arch-legend-dot is-serial-step"></span> 步骤间串行</div>
                <div class="arch-legend-item"><span class="arch-legend-dot is-parallel-seg"></span> 网段间并行</div>
                <div class="arch-legend-item"><span class="arch-legend-dot is-serial-ecu"></span> ECU间串行</div>
              </div>
            </div>
          </section>
          <section class="arch-panel">
            <div class="arch-panel-header">
              <h4>ECU 池</h4>
              <span>${unassignedCount()} 个可用 ECU</span>
            </div>
            <div class="arch-panel-content">
              <div class="arch-toolbar">
                <input data-role="arch-search" type="text" value="${esc(state.filterText)}"
                  placeholder="搜索 ECU 名称 / 供应商" />
              </div>
              <div class="arch-ecu-pool">${filteredPool().map(renderEcuCard).join("")}</div>
            </div>
          </section>
        </div>
      </div>
    </div>`;
  };

  /* ======== CLOSE ======== */
  const closeDraft = () => {
    state.open = false; state.filterText = ""; state.addStepName = "";
    state.addSegName = {}; state.drag = null;
  };

  /* ======== BIND ======== */
  const bindOverlay = (root, origRerender) => {
    if (!state.open) return;

    /* wrap rerender to save scroll before re-rendering */
    const rerender = () => {
      const lp = root.querySelector('[data-role="arch-left-panel"]');
      const sl = root.querySelector('.arch-step-list');
      state._scrollPanel = lp ? lp.scrollTop : 0;
      state._scrollList = sl ? sl.scrollTop : 0;
      origRerender();
    };

    /* restore scroll positions */
    const restoreScroll = () => {
      const lp = root.querySelector('[data-role="arch-left-panel"]');
      const sl = root.querySelector('.arch-step-list');
      if (lp && state._scrollPanel) lp.scrollTop = state._scrollPanel;
      if (sl && state._scrollList) sl.scrollTop = state._scrollList;
    };
    restoreScroll();
    requestAnimationFrame(restoreScroll);

    root.querySelectorAll('[data-role="arch-close"]').forEach((el) =>
      el.addEventListener("click", () => { closeDraft(); rerender(); }));
    root.querySelector('[data-role="arch-dialog-panel"]')?.addEventListener("click", (e) => e.stopPropagation());

    /* search */
    root.querySelector('[data-role="arch-search"]')?.addEventListener("input", (e) => {
      state.filterText = e.target.value || ""; rerender();
    });

    /* add step */
    root.querySelector('[data-role="arch-step-name-input"]')?.addEventListener("input", (e) => {
      state.addStepName = e.target.value || "";
    });
    root.querySelector('[data-role="arch-step-name-input"]')?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); if (addStep(state.addStepName)) rerender(); }
    });
    root.querySelector('[data-role="arch-add-step"]')?.addEventListener("click", () => {
      if (addStep(state.addStepName)) rerender();
    });

    /* delete step */
    root.querySelectorAll('[data-role="arch-del-step"]').forEach((btn) =>
      btn.addEventListener("click", (e) => { e.stopPropagation(); removeStep(btn.dataset.stepId); rerender(); }));

    /* add segment */
    root.querySelectorAll('[data-role="arch-seg-name-input"]').forEach((inp) => {
      inp.addEventListener("input", () => { state.addSegName[inp.dataset.stepId] = inp.value || ""; });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (addSegment(inp.dataset.stepId, state.addSegName[inp.dataset.stepId])) rerender();
        }
      });
    });
    root.querySelectorAll('[data-role="arch-add-seg"]').forEach((btn) =>
      btn.addEventListener("click", () => {
        if (addSegment(btn.dataset.stepId, state.addSegName[btn.dataset.stepId])) rerender();
      }));

    /* delete segment */
    root.querySelectorAll('[data-role="arch-del-seg"]').forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeSegment(btn.dataset.stepId, btn.dataset.segId); rerender();
      }));

    /* remove ECU */
    root.querySelectorAll('[data-role="arch-remove-ecu"]').forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeEcuFromSeg(btn.dataset.stepId, btn.dataset.segId, btn.dataset.ecuId); rerender();
      }));

    /* save */
    root.querySelector('[data-role="arch-save"]')?.addEventListener("click", () => {
      if (window.FlashConfigShared && typeof window.FlashConfigShared.applyArchitecture === "function")
        window.FlashConfigShared.applyArchitecture(deepCopy(state.steps));
      closeDraft(); rerender();
      window.dispatchEvent(new CustomEvent("flash-config-shared-updated"));
      notify("并行设置已保存");
    });

    /* ---- D&D: pool ECU ---- */
    root.querySelectorAll('[data-role="arch-pool-ecu"]').forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        state.drag = { type: "pool", ecuId: el.dataset.ecuId };
        el.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => { state.drag = null; el.classList.remove("is-dragging"); });
    });

    /* ---- D&D: ECU inside segment (reorder + accept pool) ---- */
    root.querySelectorAll('[data-role="arch-seg-ecu"]').forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        state.drag = { type: "seg-ecu", ecuId: el.dataset.ecuId, stepId: el.dataset.stepId, segId: el.dataset.segId };
        el.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragover", (e) => {
        if (!state.drag) return;
        if ((state.drag.type === "seg-ecu" && state.drag.segId === el.dataset.segId) || state.drag.type === "pool") {
          e.preventDefault(); el.classList.add("is-drop-target");
        }
      });
      el.addEventListener("dragleave", () => el.classList.remove("is-drop-target"));
      el.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation(); el.classList.remove("is-drop-target");
        if (!state.drag) return;
        const tStepId = el.dataset.stepId, tSegId = el.dataset.segId;
        if (state.drag.type === "seg-ecu") reorderEcu(tStepId, tSegId, state.drag.ecuId, el.dataset.ecuId);
        else if (state.drag.type === "pool") addEcuToSeg(state.drag.ecuId, tStepId, tSegId);
        state.drag = null; rerender();
      });
      el.addEventListener("dragend", () => {
        state.drag = null;
        root.querySelectorAll(".arch-seg-ecu-item").forEach((it) => it.classList.remove("is-dragging","is-drop-target"));
      });
    });

    /* ---- D&D: segment drop zone (for pool ECU) ---- */
    root.querySelectorAll('[data-role="arch-seg-drop"]').forEach((zone) => {
      zone.addEventListener("dragover", (e) => {
        if (!state.drag) return;
        if (state.drag.type === "pool" || state.drag.type === "seg-ecu") {
          e.preventDefault(); zone.closest(".arch-seg-card")?.classList.add("is-drag-over-seg");
        }
      });
      zone.addEventListener("dragleave", (e) => {
        if (!zone.contains(e.relatedTarget)) zone.closest(".arch-seg-card")?.classList.remove("is-drag-over-seg");
      });
      zone.addEventListener("drop", (e) => {
        e.preventDefault(); zone.closest(".arch-seg-card")?.classList.remove("is-drag-over-seg");
        if (!state.drag) return;
        const tStepId = zone.dataset.stepId, tSegId = zone.dataset.segId;
        if (state.drag.type === "pool") addEcuToSeg(state.drag.ecuId, tStepId, tSegId);
        else if (state.drag.type === "seg-ecu" && state.drag.segId !== tSegId) {
          removeEcuFromSeg(state.drag.stepId, state.drag.segId, state.drag.ecuId);
          const sg = state.steps.find((s) => s.id === tStepId)?.segments.find((s) => s.id === tSegId);
          if (sg && !sg.ecus.includes(state.drag.ecuId)) sg.ecus.push(state.drag.ecuId);
        }
        state.drag = null; rerender();
      });
    });

    /* ---- ECU move up/down buttons ---- */
    root.querySelectorAll('[data-role="arch-ecu-up"]').forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveEcuInSeg(btn.dataset.stepId, btn.dataset.segId, Number(btn.dataset.ecuIdx), 'up');
        rerender();
      }));
    root.querySelectorAll('[data-role="arch-ecu-down"]').forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveEcuInSeg(btn.dataset.stepId, btn.dataset.segId, Number(btn.dataset.ecuIdx), 'down');
        rerender();
      }));

    /* ---- Step move up/down buttons ---- */
    root.querySelectorAll('[data-role="arch-step-up"]').forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.stepIdx);
        if (idx > 0) { reorderStep(idx, idx - 1); rerender(); }
      }));
    root.querySelectorAll('[data-role="arch-step-down"]').forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.stepIdx);
        if (idx < state.steps.length - 1) { reorderStep(idx, idx + 1); rerender(); }
      }));
  };

  /* ======== PUBLIC ======== */
  window.FlashConfigArchitectureModule = {
    open(origRerender) {
      state.open = true;
      state._scrollTop = 0;
      /* wrap rerender to preserve scroll position */
      const rerender = () => {
        const lp = document.querySelector('[data-role="arch-left-panel"]');
        if (lp) state._scrollTop = lp.scrollTop;
        origRerender();
      };
      state.rerender = rerender;
      state.filterText = ""; initDraft(); origRerender();
    },
    renderOverlay,
    bindOverlay,
  };
})();
