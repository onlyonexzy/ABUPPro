/**
 * flash-config-sequence.js — 整车刷写顺序设置弹框
 * 包含三个Tab: ECU配置, 串行顺序, 整车顺序, 策略配置
 */
(function () {
  const esc = (v) =>
    String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;");

  const notify = (m) => { if (typeof showToast === "function") showToast(m); };

  const getSnapshot = () => {
    if (window.FlashConfigShared && typeof window.FlashConfigShared.getSnapshot === "function")
      return window.FlashConfigShared.getSnapshot();
    return { buses: [] };
  };


  const DEFAULT_PRE_SCRIPTS = ["pre_default_diagnostic.tb2", "pre_security_access.tb2", "pre_tester_present.tb2", "pre_ecu_reset.tb2"];
  const DEFAULT_POST_SCRIPTS = ["post_default_diagnostic.tb2", "post_reset_ecu.tb2", "post_verification.tb2", "post_clear_dtc.tb2"];

  const state = {
    open: false,
    activeTab: "parallel-conf", // parallel-conf, parallel-seq
    ecuPool: [], // 未选中的ECU池
    execList: [], // 执行的ECU列表
    rerender: null,
    isCustomOrder: false,
    initialized: false,
    parallelBusSeq: {},
    
    parallelSteps: [], // {id, name, segments: [{id, name, ecus: [ecuId, ...]}]}
    parallelAddStepName: "",
    parallelAddSegName: {}, // stepId -> input text
    parallelFilterText: "",
    preScript: { mode: "default", scriptName: "pre_default_diagnostic.tb2", localFile: "", enabled: true },
    postScript: { mode: "default", scriptName: "post_default_diagnostic.tb2", localFile: "", enabled: true },
    globalStopFa: false,
    ecuStopFa: {}, // ecuId -> boolean
    collapsedGroups: { poolCAN: false, poolETH: false, execCAN: false, execETH: false, poolParaCAN: false, poolParaETH: false },
    showLogicDiagram: false,
  };

  /* ---- Init ---- */
  const initDraft = () => {
    const snap = getSnapshot();
    const ecuMap = new Map();

    // 默认认为所有ECU一开始都在执行列表中，或者都在池子里？
    // 根据需求："左侧为ECU池...右侧为执行ECU，可以将ECU池中的ECU右移到执行ECU列表中"
    // 通常初始化时，如果之前没配置过，可能全在池子里，或者全在执行列表。
    // 这里我们假设全在池子里（作为初始配置），如果已经选过的，可以留在执行列表。
    // 为了简化，我们每次打开时重新加载所有ECU，并保留已在 execList 中的状态。

    const currentExecIds = new Set(state.execList.map(e => e.id));
    const allEcus = [];

    (snap.buses || []).forEach((bus) => {
      (bus.ecus || []).forEach((ecu) => {
        allEcus.push({
          id: ecu.id,
          shortName: ecu.shortName || ecu.name || "ECU",
          supplierCode: ecu.supplierCode || "--",
          address: bus.protocol === 'ETH' ? (ecu.logicAddress || '--') : (ecu.requestId || '--'),
          busType: bus.protocol || "CAN", // 当前总线
          originalBus: ecu.originalProtocol || ecu.mirrorSourceProtocol || "", // 原有总线
          pkgCount: ecu.strategyConfig?.queueSlots?.length || (ecu.strategyConfig?.extraPackages ? ecu.strategyConfig.extraPackages.length + 1 : 1),
        });
      });
    });

    if (!state.initialized) {
      state.execList = [...allEcus];
      state.ecuPool = [];
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

    if (!state.activeTab) state.activeTab = "parallel-conf";
  };

  /* ---- Actions ---- */
  
  const toggleGroup = (groupKey) => {
    state.collapsedGroups[groupKey] = !state.collapsedGroups[groupKey];
    if (state.rerender) state.rerender();
  };

  const moveExecUp = (idx) => {
    if (idx > 0) {
      state.isCustomOrder = true;
      const temp = state.execList[idx - 1];
      state.execList[idx - 1] = state.execList[idx];
      state.execList[idx] = temp;
      if (state.rerender) state.rerender();
    }
  };


  /* ---- Parallel Sequence Logic (Ported from Architecture Module) ---- */
  const isEcuAssignedToParallel = (ecuId) => 
    state.parallelSteps.some(st => st.segments.some(seg => seg.ecus.includes(ecuId)));

  const getEcuFromExecList = (ecuId) => state.execList.find(e => e.id === ecuId);

  const getEcuNormalizedBusType = (ecu) => {
    if (!ecu || !ecu.busType) return "";
    if (ecu.busType.includes("CAN")) return "CAN";
    if (ecu.busType.includes("ETH")) return "ETH";
    return ecu.busType;
  };

  const getStepBusType = (step) => {
    if (!step || !step.segments) return "";
    for (const seg of step.segments) {
      for (const ecuId of seg.ecus) {
        const ecu = getEcuFromExecList(ecuId);
        const norm = getEcuNormalizedBusType(ecu);
        if (norm) return norm;
      }
    }
    return "";
  };

  const renderStepBusBadge = (step) => {
    const busType = getStepBusType(step);
    if (!busType) return "";
    const isCan = busType === "CAN";
    return `
      <span class="arch-step-bus-badge ${isCan ? 'is-can' : 'is-eth'}">
        <i class="fa-solid ${isCan ? 'fa-diagram-project' : 'fa-network-wired'}"></i>
        <span>${busType}</span>
      </span>
    `;
  };

  const addParallelStep = () => {
    const nextIdx = state.parallelSteps.length + 1;
    const name = `并行组 ${nextIdx}`;
    state.parallelSteps.push({ id: 'pstep_' + Date.now() + Math.random(), name: name, segments: [] });
    return true;
  };

  const removeParallelStep = (id) => { 
    state.parallelSteps = state.parallelSteps.filter(s => s.id !== id); 
  };

  const addParallelSegment = (stepId, name) => {
    const t = (name || "").trim();
    if (!t) { notify("请输入网段名称"); return false; }
    const st = state.parallelSteps.find(s => s.id === stepId);
    if (!st) return false;
    st.segments.push({ id: 'pseg_' + Date.now() + Math.random(), name: t, ecus: [] });
    state.parallelAddSegName[stepId] = "";
    return true;
  };

  const removeParallelSegment = (stepId, segId) => {
    const st = state.parallelSteps.find(s => s.id === stepId);
    if (st) st.segments = st.segments.filter(sg => sg.id !== segId);
  };

  const addEcuToParallelSeg = (ecuId, stepId, segId) => {
    state.parallelSteps.forEach(st => st.segments.forEach(sg => {
      sg.ecus = sg.ecus.filter(id => id !== ecuId);
    }));
    const st = state.parallelSteps.find(s => s.id === stepId);
    const sg = st?.segments.find(s => s.id === segId);
    if (sg) sg.ecus.push(ecuId);
  };

  const removeEcuFromParallelSeg = (stepId, segId, ecuId) => {
    const st = state.parallelSteps.find(s => s.id === stepId);
    const sg = st?.segments.find(s => s.id === segId);
    if (sg) sg.ecus = sg.ecus.filter(id => id !== ecuId);
  };

  const moveParallelEcuInSeg = (stepId, segId, ecuIdx, dir) => {
    const st = state.parallelSteps.find(s => s.id === stepId);
    const sg = st?.segments.find(s => s.id === segId);
    if (!sg) return;
    const ti = dir === 'up' ? ecuIdx - 1 : ecuIdx + 1;
    if (ti < 0 || ti >= sg.ecus.length) return;
    sg.ecus.splice(ti, 0, sg.ecus.splice(ecuIdx, 1)[0]);
  };

  const reorderParallelStep = (fromIdx, toIdx) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= state.parallelSteps.length) return;
    state.parallelSteps.splice(toIdx, 0, state.parallelSteps.splice(fromIdx, 1)[0]);
  };

  const getFilteredExecPool = () => {
    const pool = state.execList.filter(e => !isEcuAssignedToParallel(e.id));
    const kw = state.parallelFilterText.trim().toLowerCase();
    if (!kw) return pool;
    return pool.filter(e => e.shortName.toLowerCase().includes(kw) || e.supplierCode.toLowerCase().includes(kw));
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

  const setTab = (tab) => {
    state.activeTab = tab;
    renderOverlay();
  };

  const moveRight = (ecuId) => {
    const idx = state.ecuPool.findIndex(e => e.id === ecuId);
    if (idx > -1) {
      const [ecu] = state.ecuPool.splice(idx, 1);
      state.execList.push(ecu);
      if (!state.isCustomOrder) state.execList.sort((a,b) => a.shortName.localeCompare(b.shortName));
      if (state.rerender) state.rerender();
    }
  };

  const moveLeft = (ecuId) => {
    const idx = state.execList.findIndex(e => e.id === ecuId);
    if (idx > -1) {
      // Clean up parallel assignment
      state.parallelSteps.forEach(st => st.segments.forEach(sg => { sg.ecus = sg.ecus.filter(id => id !== ecuId); }));
      const [ecu] = state.execList.splice(idx, 1);
      state.ecuPool.push(ecu);
      if (state.rerender) state.rerender();
    }
  };

  const saveAndClose = () => {
    state.open = false;
    renderOverlay();
    if (state.rerender) state.rerender();
    notify("整车刷写顺序配置已保存");
  };

  const close = () => {
    state.open = false;
    renderOverlay();
  };

  /* ---- Renderers ---- */
  const renderEcuItem = (ecu, isPool) => {
    return `
      <div class="seq-ecu-item" style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; padding:8px 12px;">
        <div class="seq-ecu-info-inline" style="display:flex; align-items:center; gap:8px; font-size:13px; color:#0f172a; flex-wrap:wrap;">
          <i class="fa-solid fa-microchip" style="color:#64748b;"></i>
          <span style="font-weight:600;">${esc(ecu.shortName)}（${esc(ecu.address)}）</span>
          <span class="seq-tag seq-tag--current">当前：${esc(ecu.busType)}</span>
          ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin">原有：${esc(ecu.originalBus)}</span>` : ''}
          <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">刷写包: ${ecu.pkgCount}</span>
        </div>
        <div class="seq-item-actions" style="flex-shrink:0; margin-left:8px;">
          ${isPool ? 
            `<button class="seq-icon-btn" type="button" data-role="seq-move-right" data-id="${esc(ecu.id)}" title="移至执行列表"><i class="fa-solid fa-arrow-right"></i></button>` : 
            `<button class="seq-icon-btn" type="button" data-role="seq-move-left" data-id="${esc(ecu.id)}" title="移回ECU池"><i class="fa-solid fa-arrow-left"></i></button>`
          }
        </div>
      </div>
    `;
  };

  const renderEcuConfigTab = () => {
    // 按总线类型分类 CAN / ETH
    const poolCan = state.ecuPool.filter(e => e.busType.includes("CAN"));
    const poolEth = state.ecuPool.filter(e => e.busType.includes("ETH"));
    
    // 执行列表同理
    const execCan = state.execList.filter(e => e.busType.includes("CAN"));
    const execEth = state.execList.filter(e => e.busType.includes("ETH"));

    return `
      <div class="seq-tab-panel ${state.activeTab === 'ecu-config' ? 'is-active' : ''}" style="flex-direction: column; gap: 12px;">
        <div class="seq-search-bar" style="position: relative; max-width: 360px;">
          <i class="fa-solid fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8;"></i>
          <input type="text" data-role="seq-search" placeholder="搜索 ECU 名称或供应商..." style="width: 100%; padding: 8px 12px 8px 32px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#cbd5e1'">
        </div>
        <div style="display: flex; gap: 16px; flex: 1; min-height: 0;">
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
      </div>
    `;
  };

  const renderSerialSeqTab = () => {
    return `
      <div class="seq-tab-panel ${state.activeTab === 'serial-seq' ? 'is-active' : ''}" style="flex-direction: column; align-items: center; gap: 12px;">
        <div class="seq-search-bar" style="position: relative; width: 100%; max-width: 600px;">
          <i class="fa-solid fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8;"></i>
          <input type="text" data-role="seq-search" placeholder="搜索串行列表中的 ECU..." style="width: 100%; padding: 8px 12px 8px 32px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#cbd5e1'">
        </div>
        <div class="seq-simple-list" style="width: 100%; max-width: 600px; display: flex; flex-direction: column; gap: 8px;">
          <div style="margin-bottom: 12px; font-size: 14px; color: #475569; text-align: center;">
            串行执行顺序预览 ${!state.isCustomOrder ? '(默认按 ECU 名称排序)' : '(自定义排序)'}
          </div>
          ${state.execList.length ? state.execList.map((e, idx) => `
            <div class="seq-simple-item" style="padding: 12px 16px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="seq-simple-index" style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: #e2e8f0; color: #475569; border-radius: 4px; font-size: 12px; font-weight: 600;">${idx + 1}</span>
                <span style="font-weight:600;">${esc(e.shortName)}（${esc(e.address)}）</span>
                <span class="seq-tag seq-tag--current">当前：${esc(e.busType)}</span>
                ${e.originalBus ? `<span class="seq-tag seq-tag--origin">原有：${esc(e.originalBus)}</span>` : ''}
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
  };

  const buildParallelStepsHtml = () => {
    const busMap = {};
    state.execList.forEach(ecu => {
      const bType = ecu.busType;
      if (!busMap[bType]) {
        busMap[bType] = { id: `bus-${bType}`, name: bType, protocol: bType, ecus: [] };
      }
      busMap[bType].ecus.push(ecu);
    });

    const sortedBuses = Object.values(busMap);
    const stepMap = new Map();
    sortedBuses.forEach(bus => {
      const stepNum = state.parallelBusSeq[bus.id] || "1";
      if (!stepMap.has(stepNum)) stepMap.set(stepNum, []);
      stepMap.get(stepNum).push(bus);
    });

    const steps = Array.from(stepMap.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));

    return steps.map(([_, buses], stepIdx) => `
        <div class="vf-parallel-step-col">
          <div class="vf-parallel-step-col__head">
            <span class="vf-parallel-step-col__badge">步骤 ${stepIdx + 1}</span>
            <span class="vf-parallel-step-col__sub">${buses.length > 1 ? "并行" : "串行"} · ${buses.length} 总线</span>
          </div>
          <div class="vf-parallel-step-col__body">
            ${buses.map((bus) => `
              <div class="vf-parallel-bus-card">
                <div class="vf-parallel-bus-card__head">
                  <i class="fa-solid fa-diagram-project"></i>
                  <strong>${esc(bus.name)}</strong>
                  <span class="vf-parallel-bus-card__protocol">${esc(bus.protocol)}</span>
                  <label class="vf-parallel-bus-card__step-input" title="修改步骤编号">
                    <span>步骤</span>
                    <input class="flash-config-input" type="number" min="1" step="1" style="width: 40px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px;"
                      value="${esc(state.parallelBusSeq[bus.id] || "1")}"
                      data-role="seq-parallel-bus-seq"
                      data-bus-id="${esc(bus.id)}" />
                  </label>
                </div>
                <div class="vf-parallel-bus-card__ecus">
                  ${bus.ecus.map((ecu) => `
                    <div class="vf-parallel-ecu-item" style="padding-left: 12px; font-size: 13px;">
                      <i class="fa-solid fa-microchip" style="color: #94a3b8; margin-right: 6px;"></i>
                      <span class="vf-parallel-ecu-item__name">${esc(`${ecu.shortName}（${ecu.address || "--"}）`)}</span>
                    </div>
                  `).join("")}
                </div>
              </div>`).join("")}
          </div>
        </div>`).join('<div class="vf-parallel-step-arrow"><i class="fa-solid fa-chevron-right"></i></div>');
  };


  /* ---- Parallel Rendering Helpers ---- */
  const renderParallelEcuInSeg = (ecuId, stepId, segId, idx, total) => {
    const ecu = getEcuFromExecList(ecuId);
    if (!ecu) return "";
    const isFirst = idx === 0, isLast = idx === total - 1;
    return `
      <li class="arch-seg-ecu-item" draggable="true" data-role="pseq-seg-ecu" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-id="${esc(ecuId)}" style="font-size: 11px;">
        <div class="arch-seg-ecu-item-left" style="flex: 1; min-width: 0;">
          <span class="arch-seg-ecu-order">${idx + 1}</span>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width: 0;">
            <span style="font-weight:600;">${esc(ecu.shortName)}（${esc(ecu.address)}）</span>
            <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">当前：${esc(ecu.busType)}</span>
            ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">原有：${esc(ecu.originalBus)}</span>` : ''}
            <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">刷写包: ${ecu.pkgCount}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:3px; flex-shrink: 0;">
          <button class="arch-icon-btn" type="button" title="上移" ${isFirst ? 'disabled style="opacity:.3;cursor:default"' : ''} data-role="pseq-ecu-up" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-idx="${idx}"><i class="fa-solid fa-arrow-up"></i></button>
          <button class="arch-icon-btn" type="button" title="下移" ${isLast ? 'disabled style="opacity:.3;cursor:default"' : ''} data-role="pseq-ecu-down" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-idx="${idx}"><i class="fa-solid fa-arrow-down"></i></button>
          <button class="arch-icon-btn is-danger" type="button" title="移出" data-role="pseq-remove-ecu" data-step-id="${esc(stepId)}" data-seg-id="${esc(segId)}" data-ecu-id="${esc(ecuId)}"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </li>`;
  };

  const renderParallelSegment = (seg, stepId, segIdx) => {
    const total = seg.ecus.length;
    const ecusHtml = total ? seg.ecus.map((eid, i) => renderParallelEcuInSeg(eid, stepId, seg.id, i, total)).join("") : `<li class="arch-empty-tip">拖动 ECU 到此处（串行执行）</li>`;
    return `
      <div class="arch-seg-card" data-role="pseq-seg-card" data-step-id="${esc(stepId)}" data-seg-id="${esc(seg.id)}">
        <div class="arch-seg-head">
          <div class="arch-seg-head-left">
            <span class="arch-seg-badge">${segIdx + 1}</span>
            <span class="arch-seg-name">${esc(seg.name)}</span>
          </div>
          <div class="arch-seg-head-right">
            <span class="arch-seg-parallel-tag">并行</span>
            <span class="arch-seg-meta">${seg.ecus.length} ECU</span>
            <button class="arch-icon-btn is-danger" type="button" title="删除网段" data-role="pseq-del-seg" data-step-id="${esc(stepId)}" data-seg-id="${esc(seg.id)}"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </div>
        <ul class="arch-seg-ecus" data-role="pseq-seg-drop" data-step-id="${esc(stepId)}" data-seg-id="${esc(seg.id)}">
          ${ecusHtml}
        </ul>
      </div>`;
  };

  const renderParallelStep = (step, idx) => {
    const segCount = step.segments.length;
    const ecuCount = step.segments.reduce((s, sg) => s + sg.ecus.length, 0);
    const segHtml = step.segments.map((sg, i) => renderParallelSegment(sg, step.id, i)).join("");
    const isFirst = idx === 0, isLast = idx === state.parallelSteps.length - 1;
    return `
      <div class="arch-step-card" style="margin-bottom:8px;">
        <div class="arch-step-head">
          <div class="arch-step-head-left">
            <span class="arch-step-badge">并行组 ${idx + 1}</span>
            ${renderStepBusBadge(step)}
          </div>
          <div class="arch-step-head-right">
            <span class="arch-step-meta">${segCount} 网段 · ${ecuCount} ECU</span>
            <button class="arch-icon-btn" type="button" title="上移" ${isFirst ? 'disabled style="opacity:.3;cursor:default"' : ''} data-role="pseq-step-up" data-step-idx="${idx}"><i class="fa-solid fa-arrow-up"></i></button>
            <button class="arch-icon-btn" type="button" title="下移" ${isLast ? 'disabled style="opacity:.3;cursor:default"' : ''} data-role="pseq-step-down" data-step-idx="${idx}"><i class="fa-solid fa-arrow-down"></i></button>
            <button class="arch-icon-btn is-danger" type="button" title="删除并行组" data-role="pseq-del-step" data-step-id="${esc(step.id)}"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </div>
        <div class="arch-add-seg-bar">
          <input type="text" placeholder="添加网段名称…" data-role="pseq-seg-name-input" data-step-id="${esc(step.id)}" value="${esc(state.parallelAddSegName[step.id] || "")}" />
          <button type="button" data-role="pseq-add-seg" data-step-id="${esc(step.id)}">+ 网段</button>
        </div>
        <div class="arch-step-body">
          ${segHtml || `<div class="arch-empty-tip">添加网段后可拖入 ECU</div>`}
        </div>
      </div>`;
  };

  const isEcuDisabledInPool = (ecu) => {
    return state.parallelSteps.some(st => 
      st.segments.some(seg => 
        seg.ecus.some(ecuId => {
          const assignedEcu = getEcuFromExecList(ecuId);
          return assignedEcu && assignedEcu.shortName === ecu.shortName;
        })
      )
    );
  };

  const renderParallelEcuCard = (ecu) => {
    const isDisabled = isEcuDisabledInPool(ecu);
    return `
      <div class="arch-ecu-card${isDisabled ? ' is-assigned' : ''}" 
        draggable="${isDisabled ? 'false' : 'true'}" 
        title="${isDisabled ? '该节点的同名总线镜像已在并行组中分配' : ''}"
        data-role="pseq-pool-ecu" 
        data-ecu-id="${esc(ecu.id)}" 
        style="display:flex; flex-direction:column; align-items:flex-start; gap:4px; padding:8px 10px; ${isDisabled ? 'pointer-events: none; cursor: not-allowed; opacity: 0.4;' : ''}">
        <div class="arch-ecu-card-info" style="width: 100%;">
          <strong style="font-size: 12px;">${esc(ecu.shortName)}（${esc(ecu.address)}）</strong>
        </div>
        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">当前：${esc(ecu.busType)}</span>
          ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">原有：${esc(ecu.originalBus)}</span>` : ''}
          <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">刷写包: ${ecu.pkgCount}</span>
        </div>
      </div>`;
  };

  
  /* ---- Parallel Config (4th Tab) Helpers ---- */
  const renderScriptConfig = (prefix) => {
    const d = prefix === "pre" ? state.preScript : state.postScript;
    const isDefault = d.mode === "default";
    const scripts = prefix === "pre" ? DEFAULT_PRE_SCRIPTS : DEFAULT_POST_SCRIPTS;
    const title = prefix === "pre" ? "Pre 脚本配置（刷写前执行）" : "Post 脚本配置（刷写后执行）";
    return `
      <section class="vf-parallel-script" style="margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; opacity: ${d.enabled ? 1 : 0.6}; pointer-events: ${d.enabled ? 'auto' : 'none'};">
        <div class="vf-parallel-script__head" style="padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px; pointer-events: auto;">
          <input type="checkbox" data-role="pconf-script-enable" data-prefix="${prefix}" ${d.enabled ? "checked" : ""} style="cursor:pointer;" />
          <span style="flex:1;">${title}</span>
        </div>
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
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span class="arch-step-badge">并行组 ${stepIdx + 1}</span>
                    ${renderStepBusBadge(st)}
                  </div>
                  <span style="font-size:11px; color:#64748b;">${st.segments.length > 1 ? "并行" : "串行"} · ${st.segments.length} 网段</span>
                </div>
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
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; font-size:12px; gap: 8px;">
                          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width: 0; flex: 1;">
                            <span style="color:#334155; font-weight: 500;">${esc(ecu.shortName)}（${esc(ecu.address)}）</span>
                            <span class="seq-tag seq-tag--current" style="font-size: 10px; padding: 1px 4px;">当前：${esc(ecu.busType)}</span>
                            ${ecu.originalBus ? `<span class="seq-tag seq-tag--origin" style="font-size: 10px; padding: 1px 4px;">原有：${esc(ecu.originalBus)}</span>` : ''}
                            <span class="seq-tag" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size: 10px; padding: 1px 4px;">刷写包: ${ecu.pkgCount}</span>
                          </div>
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
        </section>

        ${renderScriptConfig("post")}
      </div>
    `;
  };


  const renderParallelSeqTab = () => {
    const stepsHtml = state.parallelSteps.length
      ? state.parallelSteps.map((st, i) => {
          const arrow = i < state.parallelSteps.length - 1 ? `<div class="arch-serial-arrow"><i class="fa-solid fa-arrow-down"></i><span>串行</span></div>` : "";
          return renderParallelStep(st, i) + arrow;
        }).join("")
      : `<div class="arch-empty-tip" style="margin-top:8px;">点击左侧"添加并行组"开始配置</div>`;

    return `
      <div class="seq-tab-panel ${state.activeTab === 'parallel-seq' ? 'is-active' : ''}" style="padding: 0; gap: 0; overflow: hidden;">
        <div class="arch-dialog-body" style="width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 340px; padding: 12px; gap: 12px; box-sizing: border-box;">
          <!-- Left: Step Board -->
          <section class="arch-panel">
            <div class="arch-panel-header">
              <div style="display:flex; align-items:center; gap:12px;">
                <h4 style="margin:0;">执行步骤编排</h4>
                <button type="button" data-role="pseq-add-step" class="seq-btn seq-btn--primary" style="padding: 2px 10px; font-size:12px; height:24px; display:inline-flex; align-items:center;"><i class="fa-solid fa-plus" style="margin-right:4px;"></i>添加并行组</button>
                <button type="button" data-role="pseq-toggle-diagram" class="seq-btn seq-btn--default" style="padding: 2px 10px; font-size:12px; height:24px; display:inline-flex; align-items:center; color:#64748b;">
                  <i class="fa-solid fa-circle-nodes" style="margin-right:4px;"></i>${state.showLogicDiagram ? '关闭示意图' : '逻辑示意图'}
                </button>
              </div>
              <span>${state.parallelSteps.length} 个并行组</span>
            </div>
            <div class="arch-panel-content">
              ${state.showLogicDiagram ? `
                <div class="arch-logic-diagram" style="margin-bottom: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; overflow: hidden; position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                  <button type="button" data-role="pseq-toggle-diagram" style="position: absolute; right: 8px; top: 8px; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px;"><i class="fa-solid fa-xmark"></i></button>
                  <img src="assets/svg/vehicle-flash-sequence-logic.svg" style="max-width: 100%; height: auto; border-radius: 4px;" alt="执行逻辑示意图" />
                </div>
              ` : ''}
              <div class="arch-hint-banner" style="margin-bottom: 12px;">
                <i class="fa-solid fa-circle-info"></i>
                <span><strong>步骤间串行</strong>，步骤内网段<strong>并行</strong>，网段内 ECU <strong>串行</strong></span>
              </div>
              <div class="arch-step-list" style="flex: 1; overflow-y: auto;">${stepsHtml}</div>
            </div>
          </section>

                    <!-- Right: ECU Pool (from execList) -->
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
          </section>
        </div>
      </div>
    `;
  };


  const renderOverlay = () => {
    if (!state.open) return "";
    
    return `
      <div class="pc-dialog-backdrop seq-dialog-backdrop" data-role="seq-close">
        <div class="pc-dialog seq-dialog" data-role="seq-dialog-panel" role="dialog" aria-modal="true" style="display:flex; flex-direction:column;">
          <div class="seq-dialog-head">
            <div class="seq-dialog-head-left">
              <h3 style="margin:0; font-size:18px; font-weight:700;">整车刷写顺序配置</h3>
              
            </div>
            <div class="seq-dialog-actions">
              <button class="seq-btn seq-btn--default" type="button" data-role="seq-close">取消</button>
              <button class="seq-btn seq-btn--primary" type="button" data-role="seq-save">确定</button>
            </div>
          </div>
          <div class="seq-dialog-tabs" style="border-bottom: 1px solid #d9e2f0; flex-shrink: 0; background: #fff;">
            <button class="seq-dialog-tab ${state.activeTab === 'parallel-conf' ? 'is-active' : ''}" type="button" data-role="seq-tab" data-tab="parallel-conf">策略配置</button>
            <button class="seq-dialog-tab ${state.activeTab === 'parallel-seq' ? 'is-active' : ''}" type="button" data-role="seq-tab" data-tab="parallel-seq">整车顺序</button>
          </div>
          <div class="seq-dialog-body" style="background:#f8fbff; flex:1; min-height:0; display:flex; flex-direction:column;">
            ${renderEcuConfigTab()}
            ${renderSerialSeqTab()}
            ${renderParallelSeqTab()}
            ${renderParallelConfigTab()}
          </div>
        </div>
        </div>
      </div>
    `;
  };


  
  let lastRoot = null;
  let lastRerenderCb = null;

  const rerender = () => {
    if (!lastRoot || !lastRerenderCb) return;
    
    const stepList = lastRoot.querySelector('.arch-step-list');
    const ecuPool = lastRoot.querySelector('.arch-ecu-pool');
    const stepScroll = stepList ? stepList.scrollTop : 0;
    const poolScroll = ecuPool ? (ecuPool.parentElement ? ecuPool.parentElement.scrollTop : 0) : 0;

    lastRerenderCb();

    requestAnimationFrame(() => {
      const newStepList = lastRoot.querySelector('.arch-step-list');
      const newEcuPool = lastRoot.querySelector('.arch-ecu-pool');
      if (newStepList) newStepList.scrollTop = stepScroll;
      if (newEcuPool && newEcuPool.parentElement) newEcuPool.parentElement.scrollTop = poolScroll;
    });
  };

  const bindOverlay = (root, rerenderCb) => {
    if (!state.open) return;
    lastRoot = root;
    lastRerenderCb = rerenderCb;
    state.rerender = rerender;


    
    root.querySelectorAll('[data-role="seq-close"]')?.forEach(btn => {
      btn.addEventListener("click", () => {
        state.open = false;
        rerender();
      });
    });
    
    root.querySelector('[data-role="seq-dialog-panel"]')?.addEventListener("click", (e) => e.stopPropagation());
    
    root.querySelector('[data-role="seq-save"]')?.addEventListener("click", () => {
      state.open = false;
      notify("整车刷写顺序配置已保存");
      rerender();
    });

    root.querySelector('[data-role="seq-search"]')?.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      root.querySelectorAll('.seq-ecu-item, .seq-simple-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });

    root.querySelectorAll('[data-role="seq-toggle-group"]').forEach(btn => {
      btn.addEventListener("click", () => toggleGroup(btn.dataset.group));
    });

    root.querySelectorAll('[data-role="seq-tab"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.activeTab = btn.dataset.tab;
        rerender();
      });
    });

    root.querySelectorAll('[data-role="seq-move-up"]').forEach(btn => {
      btn.addEventListener("click", () => moveExecUp(parseInt(btn.dataset.idx, 10)));
    });

    root.querySelectorAll('[data-role="seq-move-down"]').forEach(btn => {
      btn.addEventListener("click", () => moveExecDown(parseInt(btn.dataset.idx, 10)));
    });

    root.querySelectorAll('[data-role="seq-parallel-bus-seq"]').forEach(input => {
      input.addEventListener("change", (e) => {
        let val = Math.max(1, parseInt(e.target.value, 10) || 1);
        state.parallelBusSeq[e.target.dataset.busId] = String(val);
        rerender();
      });
    });



    /* ---- Parallel Config Tab Bindings ---- */
    if (state.activeTab === 'parallel-conf') {
      root.querySelectorAll('[data-role="pconf-script-enable"]').forEach(el => {
        el.addEventListener("change", () => {
          const d = el.dataset.prefix === "pre" ? state.preScript : state.postScript;
          if (d) d.enabled = el.checked;
          rerender();
        });
      });

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

    /* ---- Parallel Tab Bindings ---- */
    if (state.activeTab === 'parallel-seq') {
      root.querySelector('[data-role="pseq-search"]')?.addEventListener("input", (e) => {
        state.parallelFilterText = e.target.value || ""; rerender();
      });

      root.querySelector('[data-role="pseq-step-name-input"]')?.addEventListener("input", (e) => {
        state.parallelAddStepName = e.target.value || "";
      });
      root.querySelectorAll('[data-role="pseq-toggle-group"]').forEach(btn => { btn.addEventListener("click", () => toggleGroup(btn.dataset.group)); });
      root.querySelector('[data-role="pseq-add-step"]')?.addEventListener("click", () => {
        if (addParallelStep()) rerender();
      });

      root.querySelectorAll('[data-role="pseq-toggle-diagram"]').forEach(btn => {
        btn.addEventListener("click", () => {
          state.showLogicDiagram = !state.showLogicDiagram;
          rerender();
        });
      });

      root.querySelectorAll('[data-role="pseq-del-step"]').forEach(btn => btn.addEventListener("click", () => { removeParallelStep(btn.dataset.stepId); rerender(); }));

      root.querySelectorAll('[data-role="pseq-seg-name-input"]').forEach(inp => {
        inp.addEventListener("input", () => { state.parallelAddSegName[inp.dataset.stepId] = inp.value || ""; });
      });
      root.querySelectorAll('[data-role="pseq-add-seg"]').forEach(btn => btn.addEventListener("click", () => {
        if (addParallelSegment(btn.dataset.stepId, state.parallelAddSegName[btn.dataset.stepId])) rerender();
      }));

      root.querySelectorAll('[data-role="pseq-del-seg"]').forEach(btn => btn.addEventListener("click", () => {
        removeParallelSegment(btn.dataset.stepId, btn.dataset.segId); rerender();
      }));

      root.querySelectorAll('[data-role="pseq-remove-ecu"]').forEach(btn => btn.addEventListener("click", () => {
        removeEcuFromParallelSeg(btn.dataset.stepId, btn.dataset.segId, btn.dataset.ecuId); rerender();
      }));

      root.querySelectorAll('[data-role="pseq-ecu-up"]').forEach(btn => btn.addEventListener("click", () => {
        moveParallelEcuInSeg(btn.dataset.stepId, btn.dataset.segId, Number(btn.dataset.ecuIdx), 'up'); rerender();
      }));
      root.querySelectorAll('[data-role="pseq-ecu-down"]').forEach(btn => btn.addEventListener("click", () => {
        moveParallelEcuInSeg(btn.dataset.stepId, btn.dataset.segId, Number(btn.dataset.ecuIdx), 'down'); rerender();
      }));

      root.querySelectorAll('[data-role="pseq-step-up"]').forEach(btn => btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.stepIdx); reorderParallelStep(idx, idx - 1); rerender();
      }));
      root.querySelectorAll('[data-role="pseq-step-down"]').forEach(btn => btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.stepIdx); reorderParallelStep(idx, idx + 1); rerender();
      }));

      /* D&D */
      root.querySelectorAll('[data-role="pseq-pool-ecu"]').forEach(el => {
        el.addEventListener("dragstart", (e) => {
          state.drag = { type: "pool", ecuId: el.dataset.ecuId };
          el.classList.add("is-dragging");
        });
        el.addEventListener("dragend", () => { state.drag = null; el.classList.remove("is-dragging"); });
      });

      root.querySelectorAll('[data-role="pseq-seg-ecu"]').forEach(el => {
        el.addEventListener("dragstart", (e) => {
          e.stopPropagation();
          state.drag = { type: "seg-ecu", ecuId: el.dataset.ecuId, stepId: el.dataset.stepId, segId: el.dataset.segId };
          el.classList.add("is-dragging");
        });
      });

      root.querySelectorAll('[data-role="pseq-seg-drop"]').forEach(zone => {
        zone.addEventListener("dragover", (e) => {
          if (!state.drag) return;
          const dragEcu = getEcuFromExecList(state.drag.ecuId);
          const step = state.parallelSteps.find(s => s.id === zone.dataset.stepId);
          if (dragEcu && step) {
            const dragNormBus = getEcuNormalizedBusType(dragEcu);
            const stepBus = getStepBusType(step);
            if (stepBus && dragNormBus && stepBus !== dragNormBus) {
              return; // Do not call e.preventDefault(), so drop is not allowed
            }
          }
          e.preventDefault(); zone.closest(".arch-seg-card")?.classList.add("is-drag-over-seg");
        });
        zone.addEventListener("dragleave", () => zone.closest(".arch-seg-card")?.classList.remove("is-drag-over-seg"));
        zone.addEventListener("drop", (e) => {
          e.preventDefault(); zone.closest(".arch-seg-card")?.classList.remove("is-drag-over-seg");
          if (!state.drag) return;
          const dragEcu = getEcuFromExecList(state.drag.ecuId);
          const step = state.parallelSteps.find(s => s.id === zone.dataset.stepId);
          if (dragEcu && step) {
            const dragNormBus = getEcuNormalizedBusType(dragEcu);
            const stepBus = getStepBusType(step);
            if (stepBus && dragNormBus && stepBus !== dragNormBus) {
              notify(`该并行组已包含 ${stepBus} 总线节点，无法移动 ${dragNormBus} 总线节点至此并行组`);
              state.drag = null;
              rerender();
              return;
            }
          }
          if (state.drag.type === "pool") addEcuToParallelSeg(state.drag.ecuId, zone.dataset.stepId, zone.dataset.segId);
          else if (state.drag.type === "seg-ecu") {
            removeEcuFromParallelSeg(state.drag.stepId, state.drag.segId, state.drag.ecuId);
            const sg = state.parallelSteps.find(s => s.id === zone.dataset.stepId)?.segments.find(s => s.id === zone.dataset.segId);
            if (sg) sg.ecus.push(state.drag.ecuId);
          }
          state.drag = null; rerender();
        });
      });
    }

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
      lastRerenderCb = rerenderCb;
      state.open = true;
      initDraft();
      if (typeof rerenderCb === 'function') rerenderCb();
    },
    renderOverlay,
    bindOverlay,
    getSerialExecList() {
      return state.execList.map(e => e.id);
    },
    getParallelSteps() {
      return state.parallelSteps.map(st => ({
        id: st.id,
        name: st.name,
        segments: st.segments.map(sg => ({
          id: sg.id,
          name: sg.name,
          ecus: [...sg.ecus],
        })),
      }));
    },
  };
})();
