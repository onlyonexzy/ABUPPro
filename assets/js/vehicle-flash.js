(function () {
  const root = document.getElementById("vehicle-flash-root");
  if (!root) return;

  const state = {
    selectedType: "bus",
    selectedBusId: "",
    selectedEcuId: "",
    selectedSegmentId: "",
    treeCollapsed: false,
    expandedBusIds: [],
    parallelMode: "serial",
    contentSplitRatio: 0.42,
    logSplitRatios: [1.5, 1.0],
    flashState: {
      running: false,
      progressByKey: {},
    },
    flashTimer: null,
     logView: "raw",
    mockLogsByBus: {},
    checkedEcuIds: null,
    commHoldState: {
      active: true,
      cycle: 2000,
      type: "功能寻址",
      data: "3E80",
    },
    rootClickBound: false,
  };

  const getParallelConfig = () => {
    if (window.FlashConfigParallelModule?.getSavedConfig) {
      return window.FlashConfigParallelModule.getSavedConfig();
    }
    return { busSequenceMap: {}, ecuSequenceMap: {} };
  };

  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const notify = (message, type) => {
    if (typeof showToast === "function") showToast(message);
    if (typeof pushSystemMessage === "function") pushSystemMessage(message, type);
    if (typeof addLog === "function") addLog(message);
  };

  const createTimestamp = (secondsOffset = 0) => {
    const date = new Date(Date.now() + secondsOffset * 1000);
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  };

  const normalizeHexId = (value, fallback) => {
    const token = String(value ?? "").trim().replace(/^0x/i, "").toUpperCase();
    if (!token) return fallback;
    return token;
  };

  const getSelectedBus = (snapshot) =>
    (snapshot.buses || []).find((bus) => bus.id === state.selectedBusId) || snapshot.buses?.[0] || null;

  const buildRawFrames = (bus) => {
    const ecu = bus?.ecus?.[0];
    const requestId = normalizeHexId(ecu?.requestId, "7E0");
    const responseId = normalizeHexId(ecu?.responseId, "7E8");
    const functionId = normalizeHexId(ecu?.functionId, "7DF");
    const canType = String(bus?.protocol || "CAN").toUpperCase();
    const channel = bus?.name || "CAN1";
    return [
      {
        timestamp: createTimestamp(-6),
        direction: "Tx",
        channel,
        frameType: canType === "CANFD" ? "CANFD" : "CAN",
        frameId: functionId,
        dlc: "8",
        payload: "02 10 03 00 00 00 00 00",
        note: "Diagnostic Session Control",
      },
      {
        timestamp: createTimestamp(-5),
        direction: "Rx",
        channel,
        frameType: canType === "CANFD" ? "CANFD" : "CAN",
        frameId: responseId,
        dlc: "8",
        payload: "06 50 03 00 32 01 F4 00",
        note: "Session Positive Response",
      },
      {
        timestamp: createTimestamp(-4),
        direction: "Tx",
        channel,
        frameType: canType === "CANFD" ? "CANFD" : "CAN",
        frameId: requestId,
        dlc: "8",
        payload: "06 27 01 0A 5A C3 00 00",
        note: "Security Access Seed Request",
      },
      {
        timestamp: createTimestamp(-3),
        direction: "Rx",
        channel,
        frameType: canType === "CANFD" ? "CANFD" : "CAN",
        frameId: responseId,
        dlc: "8",
        payload: "06 67 01 9A C4 78 21 00",
        note: "Security Access Seed",
      },
      {
        timestamp: createTimestamp(-2),
        direction: "Tx",
        channel,
        frameType: canType === "CANFD" ? "CANFD" : "CAN",
        frameId: requestId,
        dlc: "8",
        payload: "10 0B 34 00 44 00 00 10",
        note: "Request Download",
      },
      {
        timestamp: createTimestamp(-1),
        direction: "Rx",
        channel,
        frameType: canType === "CANFD" ? "CANFD" : "CAN",
        frameId: responseId,
        dlc: "8",
        payload: "04 74 20 08 00 00 00 00",
        note: "Request Download Response",
      },
    ];
  };

  const buildDiagFrames = (bus) => {
    const ecu = bus?.ecus?.[0];
    return [
      {
        timestamp: createTimestamp(-6),
        direction: "请求",
        service: "0x10",
        summary: `扩展会话控制 ${bus?.name || "--"}`,
        payload: "10 03",
        status: "发送",
      },
      {
        timestamp: createTimestamp(-5),
        direction: "响应",
        service: "0x50",
        summary: `进入扩展会话 ${ecu?.shortName || "--"}`,
        payload: "50 03 00 32 01 F4",
        status: "正常",
      },
      {
        timestamp: createTimestamp(-4),
        direction: "请求",
        service: "0x27",
        summary: "安全访问请求种子 Level 1",
        payload: "27 01",
        status: "发送",
      },
      {
        timestamp: createTimestamp(-3),
        direction: "响应",
        service: "0x67",
        summary: "安全访问解锁成功",
        payload: "67 02",
        status: "正常",
      },
      {
        timestamp: createTimestamp(-2),
        direction: "请求",
        service: "0x34",
        summary: `请求下载 ${ecu?.gbfFile || `${ecu?.shortName || "ECU"}.gbf`}`,
        payload: "34 00 44 00 00 10 00 00 40 00",
        status: "发送",
      },
      {
        timestamp: createTimestamp(-1),
        direction: "响应",
        service: "0x74",
        summary: "下载请求接受",
        payload: "74 20 08",
        status: "正常",
      },
    ];
  };

  const ensureMockLogs = (snapshot) => {
    const bus = getSelectedBus(snapshot);
    if (!bus) return { raw: [], diag: [] };
    if (!state.mockLogsByBus[bus.id]) {
      state.mockLogsByBus[bus.id] = {
        raw: buildRawFrames(bus),
        diag: buildDiagFrames(bus),
      };
    }
    return state.mockLogsByBus[bus.id];
  };

  const addLogLine = (snapshot, message) => {
    const bus = getSelectedBus(snapshot);
    if (!bus) return;
    const logs = ensureMockLogs(snapshot);
    const now = createTimestamp(0);
    logs.raw.unshift({
      timestamp: now,
      direction: "Info",
      channel: bus.name || "--",
      frameType: "EVENT",
      frameId: "--",
      dlc: "--",
      payload: "--",
      note: message,
    });
    logs.diag.unshift({
      timestamp: now,
      direction: "状态",
      service: "--",
      summary: message,
      payload: "--",
      status: "事件",
    });
    logs.raw = logs.raw.slice(0, 160);
    logs.diag = logs.diag.slice(0, 160);
  };

  const getSnapshot = () => {
    if (window.FlashConfigShared && typeof window.FlashConfigShared.getSnapshot === "function") {
      return window.FlashConfigShared.getSnapshot();
    }
    return { buses: [] };
  };

  const stopVehicleFlash = () => {
    if (state.flashTimer) {
      window.clearTimeout(state.flashTimer);
      state.flashTimer = null;
    }
    state.flashState.running = false;
  };

  const ensureSelection = (snapshot) => {
    const buses = snapshot.buses || [];
    const busIds = buses.map((bus) => bus.id);

    if (!state.expandedBusIds.length) {
      state.expandedBusIds = [...busIds];
    } else {
      state.expandedBusIds = state.expandedBusIds.filter((id) => busIds.includes(id));
    }

    if (!buses.length) {
      state.selectedType = "bus";
      state.selectedBusId = "";
      state.selectedEcuId = "";
      return;
    }

    const selectedBus = buses.find((bus) => bus.id === state.selectedBusId) || buses[0];
    const selectedEcu = buses
      .flatMap((bus) => bus.ecus.map((ecu) => ({ busId: bus.id, ecu })))
      .find((item) => item.ecu.id === state.selectedEcuId);

    if (state.selectedType === "ecu" && selectedEcu) {
      state.selectedBusId = selectedEcu.busId;
      return;
    }

    state.selectedType = "bus";
    state.selectedBusId = selectedBus.id;
    state.selectedEcuId = "";
  };

  const derivePackages = (ecu) => {
    if (window.FlashConfigEcuStrategyModule?.getPackagesForEcu) {
      return window.FlashConfigEcuStrategyModule.getPackagesForEcu(ecu);
    }

    const inferPackageType = (item) => {
      const token = `${item.type || ""} ${item.name || ""} ${item.softwareVersion || ""}`.toLowerCase();
      if (token.includes("boot") || token.includes("bl") || token.includes("引导")) return "引导";
      if (token.includes("cal") || token.includes("cd") || token.includes("标定")) return "标定";
      return "应用";
    };

    const fallbackName = ecu.gbfFile && ecu.gbfFile !== "--" ? ecu.gbfFile : `${ecu.shortName}_${ecu.targetVersion || "CURRENT"}.gbf`;
    return [
      {
        order: 1,
        key: `${ecu.id}-slot-main`,
        name: fallbackName,
        type: inferPackageType({ name: fallbackName, type: fallbackName.split(".").pop()?.toUpperCase() || "GBF" }),
        softwareVersion: ecu.targetVersion || "--",
        sizeMb: "--",
        repeatCount: "1",
        intervalSec: "",
        gbfVersion: "--",
        hardwareVersion: "--",
        baselineVersion: "--",
      },
    ];
  };

  const mapPackageToRow = (pkg, rowKeyPrefix, supplier) => ({
    rowKey: `${rowKeyPrefix}-${pkg.key}`,
    name: pkg.name || "--",
    supplier: supplier || "--",
    softwareVersion: pkg.softwareVersion || "--",
    packageType: pkg.type || "--",
    sizeMb: pkg.sizeMb || "--",
    gbfVersion: pkg.gbfVersion || "--",
    hardwareVersion: pkg.hardwareVersion || "--",
    baselineVersion: pkg.baselineVersion || "--",
    repeatCount: pkg.repeatCount || "1",
    intervalSec: pkg.intervalSec ?? "",
  });

  const getCurrentVersion = (ecu) =>
    ecu.currentVersion || ecu.currentSoftwareVersion || ecu.applicationSoftwareVersion || ecu.targetVersion || "--";

  const getFlashScriptLabel = (ecu) => {
    const config = ecu.strategyConfig || null;
    if (!config) return "--";
    if (config.flowMode === "tb2") return config.tb2Flow?.tb2File || "--";
    return config.defaultFlow || "默认刷写流程";
  };

  const buildCurrentVersionFields = (ecu) => {
    const appVersion = ecu.currentAppVersionF189 || ecu.currentVersionF189 || ecu.currentVersion || ecu.targetVersion || "--";
    const baseVersion = ecu.currentBaseVersionF1C1 || ecu.currentVersionF1C1 || ecu.hardwareVersion || "--";
    const calibVersion =
      ecu.currentCalibVersionF1C0 || ecu.currentVersionF1C0 || ecu.calibrationVersion || ecu.targetVersion || "--";
    return {
      f189: appVersion || "--",
      f1c1: baseVersion || "--",
      f1c0: calibVersion || "--",
    };
  };

  const getSortedBuses = (snapshot) => {
    const config = getParallelConfig();
    return (snapshot.buses || [])
      .map((bus, index) => ({
        bus,
        index,
        sequence: state.parallelMode === "serial" ? index + 1 : Math.max(1, Number(config.busSequenceMap[bus.id]) || 1),
      }))
      .sort((a, b) => a.sequence - b.sequence || a.index - b.index);
  };

  const getSortedEcus = (bus) => {
    const config = getParallelConfig();
    return [...(bus?.ecus || [])]
      .map((ecu, index) => ({
        ecu,
        index,
        sequence: state.parallelMode === "serial" ? index + 1 : Math.max(1, Number(config.ecuSequenceMap[ecu.id]) || index + 1),
      }))
      .sort((a, b) => a.sequence - b.sequence || a.index - b.index)
      .map((item) => item.ecu);
  };

  const getEcuSequence = (ecu) => {
    const config = getParallelConfig();
    return String(Math.max(1, Number(config.ecuSequenceMap[ecu.id]) || 1));
  };

  const buildEcuLookupMap = (snapshot) => {
    const map = new Map();
    (snapshot.buses || []).forEach((bus) => {
      (bus.ecus || []).forEach((ecu) => {
        map.set(ecu.id, { bus, ecu });
      });
    });
    return map;
  };

  const buildVehicleData = (snapshot) => {
    const ecuMap = buildEcuLookupMap(snapshot);

    if (state.parallelMode === "parallel") {
      const steps = window.FlashConfigSequenceModule?.getParallelSteps?.() || [];

      if (steps.length > 0) {
        let parallelOrder = 1;
        const ecuRows = steps.flatMap((st, stIdx) =>
          st.segments.flatMap((sg) =>
            sg.ecus
              .filter((ecuId) => ecuMap.has(ecuId) && state.checkedEcuIds.includes(ecuId))
              .map((ecuId) => {
                const { bus, ecu } = ecuMap.get(ecuId);
                const versions = buildCurrentVersionFields(ecu);
                const executionLabel = String(parallelOrder);
                parallelOrder += 1;
                const packageRows = derivePackages(ecu).map((pkg) =>
                  mapPackageToRow(pkg, `P${stIdx + 1}-${sg.id}-${ecu.id}`, ecu.supplier || ecu.supplierCode || "--")
                );
                return {
                  rowKey: `E-P-${stIdx + 1}-${sg.id}-${ecu.id}`,
                  executionLabel,
                  stepLabel: String(stIdx + 1),
                  segmentId: sg.id,
                  segmentName: sg.name,
                  busId: bus.id,
                  busName: bus.name,
                  ecuId: ecu.id,
                  ecuName: ecu.shortName,
                  ecuAddress: bus.protocol === "ETH" ? (ecu.logicAddress || "--") : (ecu.requestId || "--"),
                  flashMode: bus.protocol === "ETH" ? "DoIP" : "DoCAN",
                  f189: versions.f189,
                  f1c1: versions.f1c1,
                  f1c0: versions.f1c0,
                  packageRows,
                };
              })
          )
        );

        const packageRows = ecuRows.flatMap((row) =>
          row.packageRows.map((pkg) => ({
            rowKey: pkg.rowKey,
            executionLabel: row.executionLabel,
            busId: row.busId,
            stepLabel: row.stepLabel,
          }))
        );

        return {
          sequenceBlocks: steps.map((st, idx) => ({
            key: String(idx + 1),
            label: String(idx + 1),
            name: st.name,
            segments: st.segments,
          })),
          ecuRows,
          packageRows,
        };
      }

      const sortedBuses = getSortedBuses(snapshot);
      const groupMap = new Map();
      sortedBuses.forEach(({ bus, sequence, index }) => {
        const key = String(sequence);
        if (!groupMap.has(key)) {
          groupMap.set(key, { key, label: key, buses: [], sortIndex: index });
        }
        groupMap.get(key).buses.push(bus);
      });
      const groups = Array.from(groupMap.values()).sort(
        (a, b) => Number(a.key) - Number(b.key) || a.sortIndex - b.sortIndex
      );

      let parallelOrder = 1;
      const ecuRows = groups.flatMap((group) =>
        group.buses.flatMap((bus) =>
          getSortedEcus(bus)
            .filter((ecu) => state.checkedEcuIds.includes(ecu.id))
            .map((ecu) => {
              const versions = buildCurrentVersionFields(ecu);
              const executionLabel = String(parallelOrder);
              parallelOrder += 1;
              const packageRows = derivePackages(ecu).map((pkg) =>
                mapPackageToRow(pkg, `P${group.key}-${bus.id}-${ecu.id}`, ecu.supplier || ecu.supplierCode || "--")
              );
              return {
                rowKey: `E-P-${group.key}-${bus.id}-${ecu.id}`,
                executionLabel,
                stepLabel: group.label,
                busId: bus.id,
                busName: bus.name,
                ecuId: ecu.id,
                ecuName: ecu.shortName,
                ecuAddress: bus.protocol === "ETH" ? (ecu.logicAddress || "--") : (ecu.requestId || "--"),
                flashMode: bus.protocol === "ETH" ? "DoIP" : "DoCAN",
                f189: versions.f189,
                f1c1: versions.f1c1,
                f1c0: versions.f1c0,
                packageRows,
              };
            })
        )
      );

      const packageRows = ecuRows.flatMap((row) =>
        row.packageRows.map((pkg) => ({
          rowKey: pkg.rowKey,
          executionLabel: row.executionLabel,
          busId: row.busId,
          stepLabel: row.stepLabel,
        }))
      );

      return {
        sequenceBlocks: groups.map((group) => ({
          key: group.key,
          label: group.label,
          buses: group.buses,
        })),
        ecuRows,
        packageRows,
      };
    }

    const serialEcuIds = window.FlashConfigSequenceModule?.getSerialExecList?.() || [];

    if (serialEcuIds.length > 0) {
      let serialOrder = 1;
      const ecuRows = serialEcuIds
        .filter((id) => ecuMap.has(id) && state.checkedEcuIds.includes(id))
        .map((id) => {
          const { bus, ecu } = ecuMap.get(id);
          const versions = buildCurrentVersionFields(ecu);
          const currentOrder = String(serialOrder);
          serialOrder += 1;
          const packageRows = derivePackages(ecu).map((pkg) =>
            mapPackageToRow(pkg, `S-${bus.id}-${ecu.id}`, ecu.supplier || ecu.supplierCode || "--")
          );
          return {
            rowKey: `E-S-${bus.id}-${ecu.id}`,
            executionLabel: currentOrder,
            busId: bus.id,
            busName: bus.name,
            ecuId: ecu.id,
            ecuName: ecu.shortName,
            ecuAddress: bus.protocol === "ETH" ? (ecu.logicAddress || "--") : (ecu.requestId || "--"),
            flashMode: bus.protocol === "ETH" ? "DoIP" : "DoCAN",
            f189: versions.f189,
            f1c1: versions.f1c1,
            f1c0: versions.f1c0,
            packageRows,
          };
        });

      const packageRows = ecuRows.flatMap((row) =>
        row.packageRows.map((pkg) => ({
          rowKey: pkg.rowKey,
          executionLabel: row.executionLabel,
          busId: row.busId,
        }))
      );

      return { sequenceBlocks: [], ecuRows, packageRows };
    }

    let serialOrder = 1;
    const ecuRows = (snapshot.buses || []).flatMap((bus) =>
      (bus.ecus || [])
        .filter((ecu) => state.checkedEcuIds.includes(ecu.id))
        .map((ecu) => {
        const versions = buildCurrentVersionFields(ecu);
        const currentOrder = String(serialOrder);
        serialOrder += 1;
        const packageRows = derivePackages(ecu).map((pkg) =>
          mapPackageToRow(pkg, `S-${bus.id}-${ecu.id}`, ecu.supplier || ecu.supplierCode || "--")
        );
        return {
          rowKey: `E-S-${bus.id}-${ecu.id}`,
          executionLabel: currentOrder,
          busId: bus.id,
          busName: bus.name,
          ecuId: ecu.id,
          ecuName: ecu.shortName,
          ecuAddress: bus.protocol === "ETH" ? (ecu.logicAddress || "--") : (ecu.requestId || "--"),
          flashMode: bus.protocol === "ETH" ? "DoIP" : "DoCAN",
          f189: versions.f189,
          f1c1: versions.f1c1,
          f1c0: versions.f1c0,
          packageRows,
        };
      })
    );

    const packageRows = ecuRows.flatMap((row) =>
      row.packageRows.map((pkg) => ({
        rowKey: pkg.rowKey,
        executionLabel: row.executionLabel,
        busId: row.busId,
      }))
    );

    return { sequenceBlocks: [], ecuRows, packageRows };
  };

  const ensureVehicleProgress = (vehicleData) => {
    (vehicleData.packageRows || []).forEach((row) => {
      if (!(row.rowKey in state.flashState.progressByKey)) {
        state.flashState.progressByKey[row.rowKey] = 0;
      }
    });
  };

  const renderProgressCell = (value, pkg) => {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    const totalRuns = Math.max(1, Number(pkg?.repeatCount) || 1);
    const completedRuns = percent >= 100 ? totalRuns : 0;
    const currentRun = percent >= 100 ? totalRuns : percent > 0 ? 1 : 0;
    const progressClass = percent >= 100 ? " is-done" : percent > 0 ? " is-active" : "";
    return `
      <div class="single-flash-progress${progressClass}" style="width: 100%;">
        <span class="single-flash-progress__run">${currentRun}/${totalRuns}</span>
        <div class="single-flash-progress__track">
          <div class="single-flash-progress__fill" style="width:${percent}%"></div>
        </div>
        <span class="single-flash-progress__label">${percent}%</span>
      </div>
    `;
  };

  const renderTree = (snapshot) =>
    snapshot.buses.length
      ? snapshot.buses
          .map(
            (bus, busIndex) => `
              <div class="flash-config-tree-group">
                <div class="flash-config-tree-node ${state.selectedType === "bus" && state.selectedBusId === bus.id ? "is-active" : ""}">
                  <button class="flash-config-tree-toggle" type="button" data-role="vehicle-toggle-bus" data-bus-id="${esc(bus.id)}">
                    ${state.expandedBusIds.includes(bus.id) ? "-" : "+"}
                  </button>
                  <button class="flash-config-tree-label" type="button" data-role="vehicle-select-bus" data-bus-id="${esc(bus.id)}">
                    <span class="flash-config-tree-label__inner">
                      <input type="checkbox" data-role="vehicle-toggle-bus-check" data-bus-id="${esc(bus.id)}" ${bus.ecus.every(ecu => state.checkedEcuIds.includes(ecu.id)) ? "checked" : ""} style="margin: 0; cursor: pointer; pointer-events: auto;" />
                      <i class="fa-solid fa-diagram-project"></i>
                      <span>${esc(bus.name)}</span>
                    </span>
                  </button>
                </div>
                <div class="flash-config-tree-children ${state.expandedBusIds.includes(bus.id) ? "" : "is-collapsed"}">
                  ${bus.ecus
                    .map(
                      (ecu, ecuIndex) => `
                        <button
                          class="flash-config-tree-child ${state.selectedType === "ecu" && state.selectedEcuId === ecu.id ? "is-active" : ""}"
                          type="button"
                          data-role="vehicle-select-ecu"
                          data-bus-id="${esc(bus.id)}"
                          data-ecu-id="${esc(ecu.id)}"
                        >
                          <span class="flash-config-tree-label__inner">
                            <input type="checkbox" data-role="vehicle-toggle-ecu-check" data-ecu-id="${esc(ecu.id)}" ${state.checkedEcuIds.includes(ecu.id) ? "checked" : ""} style="margin: 0; cursor: pointer; pointer-events: auto;" />
                            <i class="fa-solid fa-microchip"></i>
                            <span>${esc(`${ecu.shortName}（${ecu.supplierCode || "--"}）${ecu.swType && ecu.flashType !== 'ETHBootloaderonIP_TypeII' ? `-${ecu.swType}` : ''}`)}</span>
                          </span>
                        </button>
                      `
                    )
                    .join("")}
                </div>
              </div>
            `
          )
          .join("")
      : '<div class="single-flash-empty">请先在刷写配置中准备 ECU 数据</div>';

  const renderExecution = (vehicleData) => {
    const stepsHtml = vehicleData.sequenceBlocks
      .map((group) => {
        const hasSegments = Array.isArray(group.segments) && group.segments.length > 0;

        if (hasSegments) {
          const segCount = group.segments.length;
          const ecuCount = group.segments.reduce((s, sg) => s + sg.ecus.length, 0);
          return `
            <div class="vf-parallel-step-col">
              <div class="vf-parallel-step-col__head">
                <span class="vf-parallel-step-col__badge">并行组 ${esc(group.label)}</span>
                <span class="vf-parallel-step-col__sub">${segCount > 1 ? "并行" : "串行"} · ${segCount} 网段 · ${ecuCount} ECU</span>
              </div>
              ${group.name ? `<div style="padding:2px 10px 4px; font-size:11px; color:#475569; font-weight:600;">${esc(group.name)}</div>` : ""}
              <div class="vf-parallel-step-col__body">
                ${group.segments.map((sg) => `
                  <button class="vf-exec-bus-card ${state.selectedSegmentId === sg.id ? "is-active" : ""}"
                    type="button"
                    data-role="vehicle-pick-execution-segment"
                    data-segment-id="${esc(sg.id)}">
                    <i class="fa-solid fa-layer-group"></i>
                    <strong>${esc(sg.name)}</strong>
                    <span class="vf-exec-bus-card__protocol">${sg.ecus.length} ECU</span>
                  </button>
                `).join("")}
              </div>
            </div>`;
        }

        return `
          <div class="vf-parallel-step-col">
            <div class="vf-parallel-step-col__head">
              <span class="vf-parallel-step-col__badge">并行组 ${esc(group.label)}</span>
              <span class="vf-parallel-step-col__sub">${group.buses.length > 1 ? "并行" : "串行"} · ${group.buses.length} 总线</span>
            </div>
            <div class="vf-parallel-step-col__body">
              ${(group.buses || []).map((bus) => `
                <button class="vf-exec-bus-card ${state.selectedBusId === bus.id ? "is-active" : ""}"
                  type="button"
                  data-role="vehicle-pick-execution-bus"
                  data-bus-id="${esc(bus.id)}">
                  <i class="fa-solid fa-diagram-project"></i>
                  <strong>${esc(bus.name)}</strong>
                  <span class="vf-exec-bus-card__protocol">${esc(bus.protocol || "--")}</span>
                </button>
              `).join("")}
            </div>
          </div>`;
      })
      .join('<div class="vf-parallel-step-arrow"><i class="fa-solid fa-chevron-right"></i></div>');

    return `
      <section class="flash-config-sheet vehicle-flash-execution-sheet vehicle-flash-split__execution">
        <div class="flash-config-sheet__title">执行顺序</div>
        <div class="vehicle-flash-sheet-body">
          <div class="vf-parallel-step-board">
            ${stepsHtml || '<div class="vf-parallel-empty">暂无并行配置数据</div>'}
          </div>
        </div>
      </section>`;
  };

  const renderPackageTable = (vehicleData) => {
    let visibleEcuRows;
    if (state.parallelMode === "parallel") {
      if (state.selectedSegmentId) {
        visibleEcuRows = (vehicleData.ecuRows || []).filter((row) => row.segmentId === state.selectedSegmentId);
      } else if (state.selectedBusId) {
        visibleEcuRows = (vehicleData.ecuRows || []).filter((row) => row.busId === state.selectedBusId);
      } else {
        visibleEcuRows = vehicleData.ecuRows || [];
      }
    } else {
      visibleEcuRows = vehicleData.ecuRows || [];
    }

    if (!visibleEcuRows.length) {
      return '<div class="vehicle-flash-table-wrap"><div class="single-flash-empty">当前没有可展示的软件包信息</div></div>';
    }

    let lastStepLabel = "";
    let lastSegOrBusId = "";
    const bodyHtml = visibleEcuRows
      .map((row) => {
        let groupRowHtml = "";
        if (state.parallelMode === "parallel") {
          const segOrBusId = row.segmentId || row.busId;
          const segOrBusName = row.segmentName || row.busName || "--";
          
          if (lastSegOrBusId !== segOrBusId) {
            groupRowHtml += `<tr class="vehicle-flash-bus-row"><td colspan="6">${esc(segOrBusName)}</td></tr>`;
          }
          lastStepLabel = row.stepLabel || lastStepLabel;
          lastSegOrBusId = segOrBusId;
        }
        return `
          ${groupRowHtml}
          <tr class="vehicle-flash-parent-row">
            <td>${esc(row.executionLabel)}</td>
            <td>${esc(`${row.ecuName}（${row.ecuAddress}）`)}</td>
            <td>${esc(row.flashMode)}</td>
            <td>${esc(row.f189)}</td>
            <td>${esc(row.f1c1)}</td>
            <td>${esc(row.f1c0)}</td>
          </tr>
          <tr class="vehicle-flash-child-wrap-row">
            <td colspan="6">
              <div class="vehicle-flash-child-kv-list">
                ${row.packageRows
                  .map(
                    (pkg, index) => `
                      <section class="vehicle-flash-child-inline">
                        <span class="vehicle-flash-child-inline__index">软件包 ${index + 1}</span>

                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">供应商</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.supplier)}</span>
                        </span>

                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">软件版本</span>
                          <span class="vehicle-flash-child-inline__value" style="${(() => {
                            const pkgVer = String(pkg.softwareVersion || "").trim();
                            let currentVer = "--";
                            if (pkg.packageType === "应用") currentVer = row.f189;
                            else if (pkg.packageType === "引导") currentVer = row.f1c1;
                            else if (pkg.packageType === "标定") currentVer = row.f1c0;
                            currentVer = String(currentVer || "").trim();
                            return (pkgVer !== currentVer && currentVer !== "--") ? 'color: #ef4444; font-weight: 700;' : '';
                          })()}">${esc(pkg.softwareVersion)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">类型</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.packageType)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">刷写包大小</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.sizeMb)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">刷写后版本</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.softwareVersion)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item vehicle-flash-child-inline__item--progress" style="flex: 1.5;">
                          <span class="vehicle-flash-child-inline__label">进度</span>
                          <span class="vehicle-flash-child-inline__value">${renderProgressCell(
                            state.flashState.progressByKey[pkg.rowKey] || 0,
                            pkg
                          )}</span>
                        </span>
                      </section>
                    `
                  )
                  .join("")}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
    <div class="vehicle-flash-table-wrap">
      <table class="vehicle-flash-table vehicle-flash-table--two-level">
        <colgroup>
          <col class="vehicle-flash-col-order" />
          <col class="vehicle-flash-col-ecu" />
          <col class="vehicle-flash-col-mode" />
          <col class="vehicle-flash-col-current-version" />
          <col class="vehicle-flash-col-current-version" />
          <col class="vehicle-flash-col-current-version" />
        </colgroup>
        <thead>
          <tr>
            <th>顺序</th>
            <th>ECU（地址）</th>
            <th>刷写方式</th>
            <th>当前应用版本（F189）</th>
            <th>当前底层版本（F1C1）</th>
            <th>当前标定版本（F1C0）</th>
          </tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
  };

  const renderRawLogRows = (items) =>
    items.length
      ? items
          .map(
            (item) => `
              <div class="single-flash-log-row single-flash-log-row--raw">
                <span class="single-flash-log-row__time">${esc(item.timestamp)}</span>
                <span class="single-flash-log-row__badge">${esc(item.direction)}</span>
                <span class="single-flash-log-row__meta">${esc(`${item.channel} · ${item.frameType}`)}</span>
                <span class="single-flash-log-row__id">ID ${esc(item.frameId)}</span>
                <span class="single-flash-log-row__dlc">DLC ${esc(item.dlc)}</span>
                <span class="single-flash-log-row__payload">${esc(item.payload)}</span>
                <span class="single-flash-log-row__desc">${esc(item.note)}</span>
              </div>
            `
          )
          .join("")
      : '<div class="single-flash-empty">暂无原始报文数据</div>';

  const renderDiagLogRows = (items) =>
    items.length
      ? items
          .map(
            (item) => `
              <div class="single-flash-log-row single-flash-log-row--diag">
                <span class="single-flash-log-row__time">${esc(item.timestamp)}</span>
                <span class="single-flash-log-row__badge">${esc(item.direction)}</span>
                <span class="single-flash-log-row__service">${esc(item.service)}</span>
                <span class="single-flash-log-row__summary">${esc(item.summary)}</span>
                <span class="single-flash-log-row__payload">${esc(item.payload)}</span>
                <span class="single-flash-log-row__status">${esc(item.status)}</span>
              </div>
            `
          )
          .join("")
      : '<div class="single-flash-empty">暂无诊断报文数据</div>';

  const renderLogSection = (snapshot) => {
    const logs = ensureMockLogs(snapshot);
    const isRaw = state.logView === "raw";
    return `
      <section class="flash-config-sheet single-flash-log-sheet">
        <div class="flash-config-sheet__title flash-config-sheet__title--with-actions">
          <span>LOG数据</span>
          <div class="single-flash-log-tabs">
            <button class="flash-config-action-btn" type="button" data-role="vehicle-open-dir">打开目录</button>
          </div>
        </div>
        <div class="single-flash-log-body">
          ${isRaw ? renderRawLogRows(logs.raw) : renderDiagLogRows(logs.diag)}
        </div>
      </section>
    `;
  };

  // 通讯保持设置保存
  document.getElementById("btn-submit-comm-hold")?.addEventListener("click", () => {
    const win = root.closest(".workspace-window");
    if (win && win.classList.contains("is-hidden")) return;

    state.commHoldState.cycle = parseInt(document.getElementById("comm-hold-cycle").value) || 2000;
    state.commHoldState.type = document.getElementById("comm-hold-type").value;
    state.commHoldState.data = document.getElementById("comm-hold-data").value;
    notify("通讯保持设置已确认", "success");
    document.getElementById("modal-comm-hold-settings")?.classList.add("is-hidden");
  });


  const render = () => {
    const snapshot = getSnapshot();
    if (state.checkedEcuIds === null) {
      state.checkedEcuIds = (snapshot.buses || []).flatMap(bus => (bus.ecus || []).map(ecu => ecu.id));
    }
    ensureSelection(snapshot);

    const vehicleData = buildVehicleData(snapshot);
    ensureVehicleProgress(vehicleData);

          const logRatios = state.logSplitRatios || [1.5, 1.0];
          root.innerHTML = `
            <div class="vehicle-flash-layout">
              <section class="vehicle-flash-right" style="height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: #eef2f6;">
                <div class="vehicle-flash-toolbar" style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 8px 10px; gap: 8px; flex-shrink: 0;">
                  <!-- 左侧：通讯保持组 -->
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px; color: #475569;">
                      <input type="checkbox" id="vehicle-comm-hold-check" ${state.commHoldState.active ? "checked" : ""} style="width: 14px; height: 14px;" />
                      <button class="flash-config-action-btn" type="button" data-role="vehicle-comm-hold-settings" style="height: 26px; padding: 0 8px; font-size: 11px;">通讯保持</button>
                    </label>
                  </div>
      
                  <!-- 中间：主操作按钮 -->
                  <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button class="flash-config-action-btn" type="button" data-role="vehicle-get-ecu-info">
                      <i class="fa-solid fa-circle-info"></i>
                      <span>获取ECU信息</span>
                    </button>
                    <button class="flash-config-action-btn is-primary" type="button" data-role="vehicle-one-click-flash">
                      <i class="fa-solid fa-play"></i>
                      <span>一键刷写</span>
                    </button>
                    <button class="flash-config-action-btn" type="button" data-role="vehicle-upload-log">
                      <i class="fa-solid fa-arrow-up-from-bracket"></i>
                      <span>上传LOG</span>
                    </button>
      
                  </div>
      
                  <!-- 右侧：模式切换按钮 -->
                  <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end;">
                    <button class="flash-config-action-btn" type="button" data-role="vehicle-open-sequence">整车刷写顺序</button>
                  </div>
                </div>
                <div class="vehicle-flash-log-split" style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
                  <div class="vehicle-flash-log-split__top" style="flex: ${logRatios[0]}; display: ${logRatios[0] === 0 ? 'none' : 'block'}; min-height: 0; overflow: hidden;">
                    ${
                      state.parallelMode === "parallel"
                        ? `
                          <div class="vehicle-flash-split" style="--vehicle-flash-split-ratio:${state.contentSplitRatio};">
                            ${renderExecution(vehicleData)}
                            <div class="vehicle-flash-split__divider" data-role="vehicle-split-divider" title="拖动调整上下区域高度" aria-hidden="true">
                              <span class="vehicle-flash-split__grip"></span>
                            </div>
                            <section class="flash-config-sheet flash-config-sheet--main vehicle-flash-split__packages">
                              <div class="flash-config-sheet__title">ECU列表</div>
                              ${renderPackageTable(vehicleData)}
                            </section>
                          </div>
                        `
                        : `
                          <section class="flash-config-sheet flash-config-sheet--main" style="height: 100%; min-height: 0; display: flex; flex-direction: column;">
                            <div class="flash-config-sheet__title" style="flex-shrink: 0;">ECU列表</div>
                            ${renderPackageTable(vehicleData)}
                          </section>
                        `
                    }
                  </div>
                  <div class="vehicle-flash-log-split__divider" data-role="vehicle-log-split-divider" style="height: 10px; cursor: row-resize; background: #eef2f6; display: ${logRatios[0] === 0 && logRatios[1] === 0 ? 'none' : 'flex'}; align-items: center; justify-content: center; flex-shrink: 0;" title="拖动调整LOG区域高度" aria-hidden="true">
                    <span style="width: 56px; height: 2px; background: #aeb9c8;"></span>
                  </div>
                  <div class="vehicle-flash-log-split__bottom" style="flex: ${logRatios[1]}; display: ${logRatios[1] === 0 ? 'none' : 'block'}; min-height: 0; overflow: hidden;">
                    ${renderLogSection(snapshot)}
                  </div>
                </div>
              </section>
            </div>
            ${window.FlashConfigSequenceModule?.renderOverlay?.() ?? ""}
          `;

    bindEvents();
  };

  const startVehicleFlash = () => {
    const snapshot = getSnapshot();
    ensureSelection(snapshot);
    const vehicleData = buildVehicleData(snapshot);
    const rows = vehicleData.packageRows;

    if (!rows.length) {
      notify("当前没有可执行的软件包");
      return;
    }

    stopVehicleFlash();
    state.flashState = {
      running: true,
      progressByKey: Object.fromEntries(rows.map((row) => [row.rowKey, 0])),
    };

    notify(state.parallelMode === "parallel" ? "开始整车并行刷写" : "开始整车串行刷写");
    render();

    if (state.parallelMode === "parallel") {
      const groups = vehicleData.sequenceBlocks.map((block) =>
        rows.filter((row) => String(row.stepLabel) === String(block.label)).map((row) => row.rowKey)
      );
      let groupIndex = 0;

      const tickParallel = () => {
        if (groupIndex >= groups.length) {
          stopVehicleFlash();
          notify("整车刷写完成");
          render();
          return;
        }

        const currentGroup = groups[groupIndex];
        let finished = 0;
        currentGroup.forEach((rowKey) => {
          const next = Math.min(100, (state.flashState.progressByKey[rowKey] || 0) + 10);
          state.flashState.progressByKey[rowKey] = next;
          if (next >= 100) finished += 1;
        });

        render();

        if (finished === currentGroup.length) {
          groupIndex += 1;
          state.flashTimer = window.setTimeout(tickParallel, 260);
          return;
        }

        state.flashTimer = window.setTimeout(tickParallel, 140);
      };

      state.flashTimer = window.setTimeout(tickParallel, 140);
      return;
    }

    let rowIndex = 0;
    const tickSerial = () => {
      if (rowIndex >= rows.length) {
        stopVehicleFlash();
        notify("整车刷写完成");
        render();
        return;
      }

      const row = rows[rowIndex];
      const next = Math.min(100, (state.flashState.progressByKey[row.rowKey] || 0) + 10);
      state.flashState.progressByKey[row.rowKey] = next;
      render();

      if (next >= 100) {
        rowIndex += 1;
        state.flashTimer = window.setTimeout(tickSerial, 260);
        return;
      }

      state.flashTimer = window.setTimeout(tickSerial, 140);
    };

    state.flashTimer = window.setTimeout(tickSerial, 140);
  };

  const bindEvents = () => {
    root.querySelectorAll('[data-role="vehicle-toggle-bus"]').forEach((element) => {
      element.addEventListener("click", () => {
        const busId = element.dataset.busId || "";
        if (!busId) return;
        if (state.expandedBusIds.includes(busId)) {
          state.expandedBusIds = state.expandedBusIds.filter((id) => id !== busId);
        } else {
          state.expandedBusIds = [...state.expandedBusIds, busId];
        }
        render();
      });
    });

    root.querySelectorAll('[data-role="vehicle-select-bus"]').forEach((element) => {
      element.addEventListener("click", () => {
        const busId = element.dataset.busId || "";
        state.selectedType = "bus";
        state.selectedBusId = busId;
        state.selectedEcuId = "";
        if (busId) {
          if (state.expandedBusIds.includes(busId)) {
            state.expandedBusIds = state.expandedBusIds.filter((id) => id !== busId);
          } else {
            state.expandedBusIds = [...state.expandedBusIds, busId];
          }
        }
        render();
      });
    });

    root.querySelectorAll('[data-role="vehicle-select-ecu"]').forEach((element) => {
      element.addEventListener("click", () => {
        state.selectedType = "ecu";
        state.selectedBusId = element.dataset.busId || "";
        state.selectedEcuId = element.dataset.ecuId || "";
        render();
      });
    });

    root.querySelectorAll('input[data-role="vehicle-toggle-bus-check"]').forEach((element) => {
      element.addEventListener("change", (e) => {
        const busId = element.dataset.busId;
        const snapshot = getSnapshot();
        const bus = snapshot.buses.find(b => b.id === busId);
        if (bus) {
          const ecuIds = bus.ecus.map(ecu => ecu.id);
          if (e.target.checked) {
            ecuIds.forEach(id => {
              if (!state.checkedEcuIds.includes(id)) state.checkedEcuIds.push(id);
            });
          } else {
            state.checkedEcuIds = state.checkedEcuIds.filter(id => !ecuIds.includes(id));
          }
        }
        render();
      });
      element.addEventListener("click", (e) => e.stopPropagation());
    });

    root.querySelectorAll('input[data-role="vehicle-toggle-ecu-check"]').forEach((element) => {
      element.addEventListener("change", (e) => {
        const ecuId = element.dataset.ecuId;
        if (e.target.checked) {
          if (!state.checkedEcuIds.includes(ecuId)) state.checkedEcuIds.push(ecuId);
        } else {
          state.checkedEcuIds = state.checkedEcuIds.filter(id => id !== ecuId);
        }
        render();
      });
      element.addEventListener("click", (e) => e.stopPropagation());
    });

    root.querySelectorAll('input[data-role="vehicle-toggle-bus-check"]').forEach((element) => {
      const busId = element.dataset.busId;
      const snapshot = getSnapshot();
      const bus = snapshot.buses.find(b => b.id === busId);
      if (bus && bus.ecus.length > 0) {
        const checkedCount = bus.ecus.filter(ecu => state.checkedEcuIds.includes(ecu.id)).length;
        if (checkedCount > 0 && checkedCount < bus.ecus.length) {
          element.indeterminate = true;
        }
      }
    });

    if (!state.rootClickBound) {
      root.addEventListener("click", (event) => {
        const role = event.target.closest("[data-role]")?.dataset.role;
        if (role === "vehicle-toggle-tree-pane") {
          state.treeCollapsed = !state.treeCollapsed;
          render();
          return;
        }

        if (role === "vehicle-comm-hold-settings") {
          const modal = document.getElementById("modal-comm-hold-settings");
          if (modal) {
            document.getElementById("comm-hold-cycle").value = state.commHoldState.cycle;
            document.getElementById("comm-hold-type").value = state.commHoldState.type;
            document.getElementById("comm-hold-data").value = state.commHoldState.data;
            modal.classList.remove("is-hidden");
          }
          return;
        }

        if (role === "vehicle-open-sequence") {
          window.FlashConfigSequenceModule?.open?.(render);
          return;
        }
      });
      state.rootClickBound = true;
    }

    window.FlashConfigSequenceModule?.bindOverlay?.(root, render);

    root.querySelector("#vehicle-comm-hold-check")?.addEventListener("change", (e) => {
      state.commHoldState.active = e.target.checked;
    });

    root.querySelector('[data-role="vehicle-split-divider"]')?.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const split = root.querySelector(".vehicle-flash-split");
      if (!split) return;
      const rect = split.getBoundingClientRect();

      const onMove = (moveEvent) => {
        const rawRatio = (moveEvent.clientY - rect.top) / rect.height;
        state.contentSplitRatio = Math.min(0.78, Math.max(0.22, rawRatio));
        split.style.setProperty("--vehicle-flash-split-ratio", String(state.contentSplitRatio));
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        render();
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    root.querySelector('[data-role="vehicle-log-split-divider"]')?.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const split = root.querySelector(".vehicle-flash-log-split");
      if (!split) return;
      
      const sec1 = split.querySelector(".vehicle-flash-log-split__top");
      const sec2 = split.querySelector(".vehicle-flash-log-split__bottom");
      if (!sec1 || !sec2) return;
      
      const rect1 = sec1.getBoundingClientRect();
      const rect2 = sec2.getBoundingClientRect();
      const startY = event.clientY;
      
      if (!state.logSplitRatios) {
        state.logSplitRatios = [1.5, 1.0];
      }
      
      const totalFlex = state.logSplitRatios[0] + state.logSplitRatios[1];
      const totalHeight = rect1.height + rect2.height;
      
      const onMove = (moveEvent) => {
        let dy = moveEvent.clientY - startY;
        
        // 限制 dy 范围，防止超出边界
        dy = Math.max(-rect1.height, Math.min(rect2.height, dy));
        
        let newH1 = rect1.height + dy;
        let newH2 = rect2.height - dy;
        
        // 确保 newH1 + newH2 === totalHeight
        newH1 = Math.max(0, Math.min(totalHeight, newH1));
        newH2 = totalHeight - newH1;
        
        const finalH1 = newH1 < 15 ? 0 : newH1;
        const finalH2 = newH2 < 15 ? 0 : newH2;
        
        let flex1 = 0;
        let flex2 = 0;
        if (totalHeight > 0) {
          flex1 = (finalH1 / totalHeight) * totalFlex;
          flex2 = (finalH2 / totalHeight) * totalFlex;
        } else {
          flex1 = finalH1 > 0 ? 1.5 : 0;
          flex2 = finalH2 > 0 ? 1.0 : 0;
        }
        
        sec1.style.flex = String(flex1);
        sec2.style.flex = String(flex2);
        
        sec1.style.display = finalH1 === 0 ? "none" : "block";
        sec2.style.display = finalH2 === 0 ? "none" : "block";
        
        state.logSplitRatios[0] = flex1;
        state.logSplitRatios[1] = flex2;
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        render();
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    root.querySelectorAll('[data-role="vehicle-pick-execution-bus"]').forEach((element) => {
      element.addEventListener("click", () => {
        state.selectedType = "bus";
        state.selectedBusId = element.dataset.busId || "";
        state.selectedSegmentId = "";
        state.selectedEcuId = "";
        render();
      });
    });

    root.querySelectorAll('[data-role="vehicle-pick-execution-segment"]').forEach((element) => {
      element.addEventListener("click", () => {
        state.selectedSegmentId = element.dataset.segmentId || "";
        state.selectedBusId = "";
        state.selectedEcuId = "";
        render();
      });
    });

    // Removed legacy mode toggles

    root.querySelector('[data-role="vehicle-get-ecu-info"]')?.addEventListener("click", () => {
      const snapshot = getSnapshot();
      addLogLine(snapshot, "已触发整车 ECU 信息获取");
      notify("已触发整车 ECU 信息获取");
      render();
    });

    root.querySelector('[data-role="vehicle-one-click-flash"]')?.addEventListener("click", () => {
      if (state.flashState.running) return;
      startVehicleFlash();
    });

    root.querySelector('[data-role="vehicle-upload-log"]')?.addEventListener("click", () => {
      const snapshot = getSnapshot();
      addLogLine(snapshot, "LOG 上传成功");
      notify("已触发整车 LOG 上传");
      render();
    });




    root.querySelector('[data-role="vehicle-open-dir"]')?.addEventListener("click", () => {
      notify("日志所在目录已打开", "success");
    });
  };

  window.addEventListener("flash-config-shared-updated", render);

  render();
})();
