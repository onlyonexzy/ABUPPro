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

  const saved = {
    busSequenceMap: {},
    ecuSequenceMap: {},
  };

  const draft = {
    busSequence: {},
    ecuSequence: {},
    dragBus: null,
    dragEcu: null,
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
        sequence: Math.max(1, Number(saved.busSequenceMap[bus.id]) || index + 1),
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

  const reorderDraftArray = (orderedIds, fromId, toId, mapRef) => {
    const fromIndex = orderedIds.indexOf(fromId);
    const toIndex = orderedIds.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1) return;
    orderedIds.splice(toIndex, 0, orderedIds.splice(fromIndex, 1)[0]);
    orderedIds.forEach((id, i) => {
      mapRef[id] = String(i + 1);
    });
  };

  const reorderDraftBuses = (draggedId, targetId) => {
    const snapshot = getSnapshot();
    if (!draggedId || !targetId || draggedId === targetId) return;
    const ordered = getSortedBuses(snapshot).map((item) => item.bus.id);
    reorderDraftArray(ordered, draggedId, targetId, draft.busSequence);
  };

  const reorderDraftEcus = (busId, draggedEcuId, targetEcuId) => {
    const snapshot = getSnapshot();
    const bus = (snapshot.buses || []).find((item) => item.id === busId);
    if (!bus || !draggedEcuId || !targetEcuId || draggedEcuId === targetEcuId) return;
    const ordered = getSortedEcus(bus).map((ecu) => ecu.id);
    reorderDraftArray(ordered, draggedEcuId, targetEcuId, draft.ecuSequence);
  };

  const renderBody = () => {
    const snapshot = getSnapshot();
    const sortedBuses = getSortedBuses(snapshot);

    return `
      <section class="vf-parallel-section">
        <div class="vf-parallel-section__head">
          <strong>串行执行顺序调整</strong>
        </div>
        <div class="vf-parallel-step-board" style="flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto;">
          ${
            sortedBuses.length === 0
              ? '<div class="vf-parallel-empty">暂无总线数据，请先在刷写配置中准备数据</div>'
              : sortedBuses.map(({ bus }, bIdx) => {
                  const ecus = getSortedEcus(bus);
                  return `
                  <div class="vf-parallel-bus-card" style="width: 100%; border: 2px solid #e0e6ed;"
                       draggable="true" 
                       data-role="sc-bus-drag" 
                       data-bus-id="${esc(bus.id)}">
                    <div class="vf-parallel-bus-card__head" style="background: #eef2f6; cursor: grab;">
                      <span class="vf-parallel-ecu-item__grip" style="margin-right: 8px;"><i class="fa-solid fa-grip-lines"></i></span>
                      <i class="fa-solid fa-diagram-project"></i>
                      <strong>${esc(bus.name)}</strong>
                      <span class="vf-parallel-bus-card__protocol">${esc(bus.protocol || "--")}</span>
                      <span style="margin-left: auto; font-size: 11px; color: #6a7a8e;">总线执行顺序: ${bIdx + 1}</span>
                    </div>
                    <div class="vf-parallel-bus-card__ecus" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; padding: 10px;">
                      ${ecus.map((ecu, eIdx) => `
                        <div class="vf-parallel-ecu-item"
                          draggable="true"
                          data-role="sc-ecu-drag"
                          data-bus-id="${esc(bus.id)}"
                          data-ecu-id="${esc(ecu.id)}"
                          style="cursor: grab;">
                          <span class="vf-parallel-ecu-item__grip"><i class="fa-solid fa-grip-vertical"></i></span>
                          <span class="vf-parallel-ecu-item__name">${esc(`${ecu.shortName}（${ecu.supplierCode || "--"}）${ecu.swType && ecu.flashType !== "ETHBootloaderonIP_TypeII" ? `-${ecu.swType}` : ""}`)}</span>
                          <span style="margin-left: auto; font-size: 10px; color: #8e9bb0;">顺序: ${eIdx + 1}</span>
                        </div>
                      `).join("")}
                    </div>
                  </div>`;
                }).join("")
          }
        </div>
        <div class="vf-parallel-hint">
          <i class="fa-solid fa-circle-info"></i>
          通过上下拖拽总线卡片调整总线的执行顺序，拖拽同总线内的 ECU 卡片调整 ECU 的串行执行顺序。
        </div>
      </section>
    `;
  };

  const bindEvents = (root, rerender) => {
    // Bus drag
    root.querySelectorAll('[data-role="sc-bus-drag"]').forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        draft.dragBus = { busId: el.dataset.busId || "" };
        el.style.opacity = "0.5";
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draft.dragBus) return;
        el.style.borderColor = "#2f6bff";
      });
      el.addEventListener("dragleave", (e) => {
        e.stopPropagation();
        el.style.borderColor = "#e0e6ed";
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.style.borderColor = "#e0e6ed";
        if (!draft.dragBus) return;
        reorderDraftBuses(draft.dragBus.busId, el.dataset.busId || "");
        draft.dragBus = null;
        Object.assign(saved.busSequenceMap, draft.busSequence); // save immediately for UX
        rerender();
      });
      el.addEventListener("dragend", (e) => {
        e.stopPropagation();
        draft.dragBus = null;
        el.style.opacity = "1";
        root.querySelectorAll('[data-role="sc-bus-drag"]').forEach(card => card.style.borderColor = "#e0e6ed");
      });
    });

    // ECU drag
    root.querySelectorAll('[data-role="sc-ecu-drag"]').forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        draft.dragEcu = { busId: el.dataset.busId || "", ecuId: el.dataset.ecuId || "" };
        el.classList.add("is-dragging");
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draft.dragEcu || draft.dragEcu.busId !== (el.dataset.busId || "")) return;
        el.classList.add("is-drop-target");
      });
      el.addEventListener("dragleave", (e) => {
        e.stopPropagation();
        el.classList.remove("is-drop-target");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove("is-drop-target");
        if (!draft.dragEcu) return;
        reorderDraftEcus(el.dataset.busId || "", draft.dragEcu.ecuId, el.dataset.ecuId || "");
        draft.dragEcu = null;
        Object.assign(saved.ecuSequenceMap, draft.ecuSequence); // save immediately for UX
        rerender();
      });
      el.addEventListener("dragend", (e) => {
        e.stopPropagation();
        draft.dragEcu = null;
        root.querySelectorAll(".vf-parallel-ecu-item").forEach((item) => {
          item.classList.remove("is-dragging", "is-drop-target");
        });
      });
    });
  };

  const loadDraft = () => {
    const snapshot = getSnapshot();
    const busSeq = {};
    const ecuSeq = {};
    (snapshot.buses || []).forEach((bus, bIdx) => {
      busSeq[bus.id] = saved.busSequenceMap[bus.id] || String(bIdx + 1);
      (bus.ecus || []).forEach((ecu, eIdx) => {
        ecuSeq[ecu.id] = saved.ecuSequenceMap[ecu.id] || String(eIdx + 1);
      });
    });
    draft.busSequence = busSeq;
    draft.ecuSequence = ecuSeq;
    // ensure saved is populated if empty
    if (Object.keys(saved.busSequenceMap).length === 0) {
       Object.assign(saved.busSequenceMap, busSeq);
    }
    if (Object.keys(saved.ecuSequenceMap).length === 0) {
       Object.assign(saved.ecuSequenceMap, ecuSeq);
    }
  };

  const commitDraft = () => {
    Object.assign(saved.busSequenceMap, draft.busSequence);
    Object.assign(saved.ecuSequenceMap, draft.ecuSequence);

    const busArr = Object.entries(draft.busSequence).sort((a,b) => Number(a[1]) - Number(b[1])).map(x => x[0]);
    const ecuMap = {};
    const snapshot = getSnapshot();
    (snapshot.buses || []).forEach(b => {
        ecuMap[b.id] = b.ecus
            .map(e => ({ id: e.id, seq: Number(draft.ecuSequence[e.id]) || 1 }))
            .sort((a, b) => a.seq - b.seq)
            .map(x => x.id);
    });
    if (window.FlashConfigShared?.applyOrder) {
        window.FlashConfigShared.applyOrder(busArr, ecuMap);
    }
  };

  window.FlashConfigSerialModule = {
    renderBody,
    bindEvents,
    loadDraft,
    commitDraft,
    getSavedConfig() {
      return {
        busSequenceMap: { ...saved.busSequenceMap },
        ecuSequenceMap: { ...saved.ecuSequenceMap },
      };
    },
  };
})();
