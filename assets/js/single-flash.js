(function () {
  const root = document.getElementById("single-flash-root");
  if (!root) return;

  const state = {
    selectedEcuId: "",
    logView: "raw",
    treeCollapsed: false,
    expandedBusIds: [],
    contentSplitRatios: [1.0, 1.0, 0.8],
    mockLogsByEcu: {},
    ecuInfoState: {
      ecuId: "",
      running: false,
      fetched: false,
    },
    ecuInfoTimer: null,
    flashState: {
      ecuId: "",
      running: false,
      currentLoop: 0,
      progressByOrder: {},
    },
    flashTimer: null,
    commHoldState: {
      active: true,
      cycle: 2000,
      type: "功能寻址",
      data: "3E80",
    },
    rootClickBound: false,
  };

  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const formatTime = () =>
    new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());

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

  const hexByte = (value) => Number(value).toString(16).toUpperCase().padStart(2, "0");

  const normalizeHexId = (value, fallback) => {
    const token = String(value ?? "").trim().replace(/^0x/i, "").toUpperCase();
    if (!token) return fallback;
    return token;
  };

  const MockLogDataService = {
    buildRawFrames(ecu) {
      const requestId = normalizeHexId(ecu.requestId, "7E0");
      const responseId = normalizeHexId(ecu.responseId, "7E8");
      const functionId = normalizeHexId(ecu.functionId, "7DF");
      const canType = String(ecu.busType || ecu.protocol || "CAN").toUpperCase();
      const channel = ecu.busName || ecu.parentBusName || "CAN1";
      const logicAddress = normalizeHexId(ecu.xotaLogicalAddress || ecu.logicAddress, "0A");
      const basePayload = [
        `02 10 03 00 00 00 00 00`,
        `06 27 01 ${hexByte(parseInt(logicAddress.slice(-2), 16) || 10)} 5A C3 00 00`,
        `10 0B 34 00 44 00 00 10`,
        `21 00 00 40 00 00 00 00`,
        `10 08 36 01 11 22 33 44`,
        `30 00 00 AA AA AA AA AA`,
        `02 37 00 00 00 00 00 00`,
      ];

      return [
        {
          timestamp: createTimestamp(-11),
          direction: "Tx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: functionId,
          dlc: "8",
          payload: basePayload[0],
          note: "Diagnostic Session Control",
        },
        {
          timestamp: createTimestamp(-10),
          direction: "Rx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: responseId,
          dlc: "8",
          payload: `06 50 03 00 32 01 F4 00`,
          note: "Session Positive Response",
        },
        {
          timestamp: createTimestamp(-9),
          direction: "Tx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: requestId,
          dlc: "8",
          payload: basePayload[1],
          note: "Security Access Seed Request",
        },
        {
          timestamp: createTimestamp(-8),
          direction: "Rx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: responseId,
          dlc: "8",
          payload: `06 67 01 9A C4 78 21 00`,
          note: "Security Access Seed",
        },
        {
          timestamp: createTimestamp(-7),
          direction: "Tx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: requestId,
          dlc: "8",
          payload: `06 27 02 D4 65 3F 1A 00`,
          note: "Security Access Key",
        },
        {
          timestamp: createTimestamp(-6),
          direction: "Rx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: responseId,
          dlc: "8",
          payload: `02 67 02 00 00 00 00 00`,
          note: "Security Access Unlock",
        },
        {
          timestamp: createTimestamp(-5),
          direction: "Tx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: requestId,
          dlc: "8",
          payload: basePayload[2],
          note: "Request Download FF",
        },
        {
          timestamp: createTimestamp(-4),
          direction: "Tx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: requestId,
          dlc: "8",
          payload: basePayload[3],
          note: "Request Download CF",
        },
        {
          timestamp: createTimestamp(-3),
          direction: "Rx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: responseId,
          dlc: "8",
          payload: `04 74 20 08 00 00 00 00`,
          note: "Request Download Response",
        },
        {
          timestamp: createTimestamp(-2),
          direction: "Tx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: requestId,
          dlc: "8",
          payload: basePayload[4],
          note: "Transfer Data",
        },
        {
          timestamp: createTimestamp(-1),
          direction: "Rx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: responseId,
          dlc: "8",
          payload: `02 76 01 00 00 00 00 00`,
          note: "Transfer Data Ack",
        },
        {
          timestamp: createTimestamp(0),
          direction: "Tx",
          channel,
          frameType: canType === "CANFD" ? "CANFD" : "CAN",
          frameId: requestId,
          dlc: "8",
          payload: basePayload[6],
          note: "Request Transfer Exit",
        },
      ];
    },
    buildDiagFrames(ecu) {
      const canType = String(ecu.busType || ecu.protocol || "CAN").toUpperCase();
      const addressLabel =
        canType === "ETH"
          ? `LA:${normalizeHexId(ecu.logicAddress, "0E00")}`
          : `Req:${normalizeHexId(ecu.requestId, "7E0")} / Res:${normalizeHexId(ecu.responseId, "7E8")}`;

      return [
        {
          timestamp: createTimestamp(-11),
          direction: "请求",
          service: "0x10",
          summary: `扩展会话控制 ${addressLabel}`,
          payload: "10 03",
          status: "发送",
        },
        {
          timestamp: createTimestamp(-10),
          direction: "响应",
          service: "0x50",
          summary: `进入扩展会话 ${ecu.shortName}`,
          payload: "50 03 00 32 01 F4",
          status: "正常",
        },
        {
          timestamp: createTimestamp(-9),
          direction: "请求",
          service: "0x27",
          summary: `安全访问请求种子 Level 1`,
          payload: "27 01",
          status: "发送",
        },
        {
          timestamp: createTimestamp(-8),
          direction: "响应",
          service: "0x67",
          summary: `安全种子返回`,
          payload: "67 01 9A C4 78 21",
          status: "正常",
        },
        {
          timestamp: createTimestamp(-7),
          direction: "请求",
          service: "0x27",
          summary: `安全访问提交 Key`,
          payload: "27 02 D4 65 3F 1A",
          status: "发送",
        },
        {
          timestamp: createTimestamp(-6),
          direction: "响应",
          service: "0x67",
          summary: `安全访问解锁成功`,
          payload: "67 02",
          status: "正常",
        },
        {
          timestamp: createTimestamp(-5),
          direction: "请求",
          service: "0x34",
          summary: `请求下载 ${ecu.gbfFile || `${ecu.shortName}.gbf`}`,
          payload: "34 00 44 00 00 10 00 00 40 00",
          status: "发送",
        },
        {
          timestamp: createTimestamp(-4),
          direction: "响应",
          service: "0x74",
          summary: `下载请求接受`,
          payload: "74 20 08",
          status: "正常",
        },
        {
          timestamp: createTimestamp(-3),
          direction: "请求",
          service: "0x36",
          summary: `传输数据块 #01`,
          payload: "36 01 11 22 33 44 55 66",
          status: "发送",
        },
        {
          timestamp: createTimestamp(-2),
          direction: "响应",
          service: "0x76",
          summary: `数据块确认 #01`,
          payload: "76 01",
          status: "正常",
        },
        {
          timestamp: createTimestamp(-1),
          direction: "请求",
          service: "0x37",
          summary: `请求退出传输`,
          payload: "37",
          status: "发送",
        },
        {
          timestamp: createTimestamp(0),
          direction: "响应",
          service: "0x77",
          summary: `传输结束，等待刷写完成`,
          payload: "77",
          status: "正常",
        },
      ];
    },
    buildOperationEntries(ecu, message) {
      const requestId = normalizeHexId(ecu.requestId, "7E0");
      const responseId = normalizeHexId(ecu.responseId, "7E8");
      const channel = ecu.busName || ecu.parentBusName || "CAN1";
      const time = createTimestamp(0);
      return {
        raw: {
          timestamp: time,
          direction: "Info",
          channel,
          frameType: "EVENT",
          frameId: "--",
          dlc: "--",
          payload: "--",
          note: message,
        },
        diag: {
          timestamp: time,
          direction: "状态",
          service: `${requestId}/${responseId}`,
          summary: message,
          payload: "--",
          status: "事件",
        },
      };
    },
  };

  const ensureMockLogs = (ecu) => {
    if (!ecu) return { raw: [], diag: [] };
    if (!state.mockLogsByEcu[ecu.id]) {
      state.mockLogsByEcu[ecu.id] = {
        raw: MockLogDataService.buildRawFrames(ecu),
        diag: MockLogDataService.buildDiagFrames(ecu),
      };
    }
    return state.mockLogsByEcu[ecu.id];
  };

  const addLogLine = (ecu, message) => {
    if (!ecu) return;
    const logs = ensureMockLogs(ecu);
    const operation = MockLogDataService.buildOperationEntries(ecu, message);
    logs.raw.unshift(operation.raw);
    logs.diag.unshift(operation.diag);
    logs.raw = logs.raw.slice(0, 160);
    logs.diag = logs.diag.slice(0, 160);
  };

  const openFlashConfigAndFocusEcu = (ecuId) => {
    const bringFlashConfigWindowToFront = () => {
      const flashWindow = document.querySelector('.workspace-window[data-window="flash-config"]');
      if (!flashWindow) return;
      flashWindow.classList.remove("is-hidden", "is-minimized");
      flashWindow.classList.add("is-maximized", "is-active");
      const maxZ = [...document.querySelectorAll(".workspace-window")]
        .map((element) => Number.parseInt(element.style.zIndex || "0", 10) || 0)
        .reduce((max, value) => Math.max(max, value), 20);
      flashWindow.style.zIndex = String(maxZ + 1);
    };

    const menuItem = document.querySelector('[data-window="flash-config"]');
    if (menuItem) menuItem.click();
    bringFlashConfigWindowToFront();

    const tryFocus = (retryLeft) => {
      bringFlashConfigWindowToFront();
      if (window.FlashConfigShared && typeof window.FlashConfigShared.focusEcu === "function") {
        const focused = window.FlashConfigShared.focusEcu(ecuId);
        if (focused) return;
      }
      if (retryLeft > 0) {
        window.setTimeout(() => tryFocus(retryLeft - 1), 80);
      } else {
        notify("刷写配置已打开，但未定位到对应 ECU");
      }
    };

    tryFocus(10);
  };

  const getSnapshot = () => {
    if (window.FlashConfigShared && typeof window.FlashConfigShared.getSnapshot === "function") {
      return window.FlashConfigShared.getSnapshot();
    }
    return { buses: [] };
  };

  const ensureSelectedEcu = (snapshot) => {
    const busIds = snapshot.buses.map((bus) => bus.id);
    if (!state.expandedBusIds.length) {
      state.expandedBusIds = [...busIds];
    } else {
      state.expandedBusIds = state.expandedBusIds.filter((id) => busIds.includes(id));
    }

    const all = snapshot.buses.flatMap((bus) => bus.ecus.map((ecu) => ({ bus, ecu })));
    if (!all.length) {
      state.selectedEcuId = "";
      return null;
    }

    const current = all.find((item) => item.ecu.id === state.selectedEcuId);
    if (current) return current;

    state.selectedEcuId = all[0].ecu.id;
    return all[0];
  };

  const inferPackageType = (item) => {
    const token = `${item.type || ""} ${item.name || ""} ${item.softwareVersion || ""}`.toLowerCase();
    if (token.includes("boot") || token.includes("bl") || token.includes("引导")) return "引导";
    if (token.includes("cal") || token.includes("cd") || token.includes("标定")) return "标定";
    return "应用";
  };

  const derivePackages = (ecu) => {
    const strategyConfig = ecu.strategyConfig || null;
    if (strategyConfig?.currentPackage) {
      const findTemplateByRef = (ref) => {
        if (ref === "main") return strategyConfig.currentPackage;
        return (strategyConfig.extraPackages || []).find((item) => item.id === ref) || null;
      };

      const slots =
        Array.isArray(strategyConfig.queueSlots) && strategyConfig.queueSlots.length
          ? strategyConfig.queueSlots
          : [
            {
              ref: "main",
              repeatCount: strategyConfig.currentPackage.repeatCount || "1",
              intervalSec: strategyConfig.currentPackage.intervalSec ?? "",
            },
          ];

      return slots.map((slot, index) => {
        const template = findTemplateByRef(slot.ref) || strategyConfig.currentPackage;
        return {
          order: index + 1,
          name: template.name || "--",
          type: inferPackageType(template),
          softwareVersion: template.softwareVersion || "--",
          hardwareVersion: template.hardwareVersion || "--",
          sizeMb: template.sizeMb || "--",
          vendor: template.vendor || "--",
          repeatCount: String(Math.max(1, Number(slot.repeatCount) || 1)),
          intervalSec: slot.intervalSec === "" || slot.intervalSec === undefined ? "--" : slot.intervalSec,
          source: template.source || "--",
        };
      });
    }

    const fallbackName = ecu.gbfFile && ecu.gbfFile !== "--" ? ecu.gbfFile : `${ecu.shortName}_${ecu.targetVersion || "CURRENT"}.gbf`;
    return [
      {
        order: 1,
        name: fallbackName,
        type: inferPackageType({ name: fallbackName, type: fallbackName.split(".").pop()?.toUpperCase() || "GBF" }),
        softwareVersion: ecu.targetVersion || "--",
        hardwareVersion: ecu.hardwareVersion || "--",
        vendor: ecu.supplierCode || "--",
        sizeMb: "--",
        repeatCount: "1",
        intervalSec: "--",
        source: ecu.importSource && ecu.importSource !== "--" ? ecu.importSource : "当前配置",
      },
    ];
  };

  const stopEcuInfoSimulation = () => {
    if (state.ecuInfoTimer) {
      window.clearTimeout(state.ecuInfoTimer);
      state.ecuInfoTimer = null;
    }
    state.ecuInfoState.running = false;
  };

  const startEcuInfoSimulation = (ecu) => {
    stopEcuInfoSimulation();
    state.ecuInfoState = {
      ecuId: ecu.id,
      running: true,
      fetched: false,
    };
    addLogLine(ecu, `开始获取 ECU 信息：${ecu.shortName}`);
    notify(`开始获取 ECU 信息：${ecu.shortName}`);
    render();

    state.ecuInfoTimer = window.setTimeout(() => {
      state.ecuInfoTimer = null;
      state.ecuInfoState.running = false;
      state.ecuInfoState.fetched = true;
      addLogLine(ecu, `已获取 ECU 信息：${ecu.shortName}`);
      notify(`已获取 ECU 信息：${ecu.shortName}`);
      render();
    }, 1800);
  };

  const stopFlashSimulation = () => {
    if (state.flashTimer) {
      window.clearTimeout(state.flashTimer);
      state.flashTimer = null;
    }
    state.flashState.running = false;
  };

  const ensureFlashProgress = (ecuId, packages) => {
    if (state.flashState.ecuId !== ecuId) {
      state.flashState = {
        ecuId,
        running: false,
        progressByOrder: {},
      };
    }

    packages.forEach((item) => {
      if (!(item.order in state.flashState.progressByOrder)) {
        state.flashState.progressByOrder[item.order] = {
          completedRuns: 0,
          percent: 0,
        };
      }
    });
  };

  const renderProgressCell = (progressState, item) => {
    const totalRuns = Math.max(1, Number(item.repeatCount) || 1);
    const completedRuns = Math.max(0, Math.min(totalRuns, Number(progressState?.completedRuns) || 0));
    const currentPercent = Math.max(0, Math.min(100, Number(progressState?.percent) || 0));
    const currentRun = completedRuns >= totalRuns ? totalRuns : currentPercent > 0 ? completedRuns + 1 : completedRuns;
    const value = completedRuns >= totalRuns && currentPercent === 0 ? 100 : currentPercent;
    const progressClass = value >= 100 ? " is-done" : value > 0 ? " is-active" : "";
    return `
      <div class="single-flash-progress${progressClass}">
        <span class="single-flash-progress__run">${currentRun}/${totalRuns}</span>
        <div class="single-flash-progress__track">
          <div class="single-flash-progress__fill" style="width:${value}%"></div>
        </div>
        <span class="single-flash-progress__label">${value}%</span>
      </div>
    `;
  };

  const startFlashSimulation = (ecu) => {
    const packages = derivePackages(ecu);
    const totalLoopCount = Math.max(1, Number(ecu?.strategyConfig?.totalLoopCount) || 1);
    const tasks = [];

    for (let loopIndex = 0; loopIndex < totalLoopCount; loopIndex += 1) {
      packages.forEach((item) => {
        const repeatCount = Math.max(1, Number(item.repeatCount) || 1);
        for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
          tasks.push({
            loopIndex,
            order: item.order,
            name: item.name,
            repeatIndex,
            repeatCount,
          });
        }
      });
    }

    stopFlashSimulation();
    state.flashState = {
      ecuId: ecu.id,
      running: true,
      currentLoop: 0,
      progressByOrder: Object.fromEntries(
        packages.map((item) => [
          item.order,
          {
            completedRuns: 0,
            percent: 0,
          },
        ])
      ),
    };

    let index = 0;
    addLogLine(ecu, `开始单件刷写：${ecu.shortName}，共 ${packages.length} 个刷写包`);
    notify(`开始单件刷写：${ecu.shortName}`);
    render();

    const tick = () => {
      if (index >= tasks.length) {
        state.flashState.running = false;
        state.flashTimer = null;
        addLogLine(ecu, `单件刷写完成：${ecu.shortName}`);
        notify(`单件刷写完成：${ecu.shortName}`);
        render();
        return;
      }

      const task = tasks[index];
      if (task.loopIndex !== state.flashState.currentLoop) {
        state.flashState.currentLoop = task.loopIndex;
        packages.forEach((item) => {
          state.flashState.progressByOrder[item.order] = {
            completedRuns: 0,
            percent: 0,
          };
        });
        addLogLine(ecu, `开始整体循环 ${state.flashState.currentLoop + 1}/${totalLoopCount}`);
      }

      const rowState = state.flashState.progressByOrder[task.order] || {
        completedRuns: 0,
        percent: 0,
      };
      const next = Math.min(100, rowState.percent + 10);
      state.flashState.progressByOrder[task.order] = {
        ...rowState,
        percent: next,
      };

      if (next >= 100) {
        state.flashState.progressByOrder[task.order] = {
          completedRuns: task.repeatIndex + 1,
          percent: task.repeatIndex + 1 >= task.repeatCount ? 100 : 0,
        };
        addLogLine(ecu, `刷写包完成：${task.name}（${task.repeatIndex + 1}/${task.repeatCount}）`);
        index += 1;
      }

      render();
      state.flashTimer = window.setTimeout(tick, next >= 100 ? 260 : 140);
    };

    state.flashTimer = window.setTimeout(tick, 140);
  };

  const getLoopCount = (ecu) => ecu?.strategyConfig?.totalLoopCount || "1";

  const getConfiguredDids = () => {
    if (window.SettingsShared?.getSingleDids) {
      return window.SettingsShared.getSingleDids();
    }
    return [
      { name: "应用软件版本", did: "F189", cmd: "22 F189" },
      { name: "标定软件版本", did: "F1C0", cmd: "22 F1C0" },
      { name: "底层软件版本", did: "F1C1", cmd: "22 F1C1" },
    ];
  };

  const DID_VALUE_MAP = {
    F189: (ecu) => {
      const cp = ecu?.strategyConfig?.currentPackage || {};
      return cp.applicationSoftwareVersion || cp.appSoftwareVersion || cp.softwareVersion || ecu?.applicationSoftwareVersion || ecu?.targetVersion || "--";
    },
    F1C0: (ecu) => {
      const cp = ecu?.strategyConfig?.currentPackage || {};
      return cp.calibrationSoftwareVersion || cp.calSoftwareVersion || cp.calibrationVersion || ecu?.calibrationSoftwareVersion || ecu?.calibrationVersion || "--";
    },
    F1C1: (ecu) => {
      const cp = ecu?.strategyConfig?.currentPackage || {};
      return cp.bootSoftwareVersion || cp.baseSoftwareVersion || cp.bottomSoftwareVersion || ecu?.bootSoftwareVersion || ecu?.baseSoftwareVersion || ecu?.bottomSoftwareVersion || "--";
    },
  };

  const getDidValue = (ecu, did) => {
    const resolver = DID_VALUE_MAP[did?.toUpperCase()];
    return resolver ? resolver(ecu) : "--";
  };

  const formatFlashType = (ecu) => {
    const flashType = ecu.flashType || "";
    if (flashType === "ETHBootloaderonIP_TypeI") return "1：ETHBootloaderonIP_TypeI（以太网34服务刷写）";
    if (flashType === "ETHBootloaderonIP_TypeII") return "2：ETHBootloaderonIP_TypeII（以太网38服务刷写）";
    if (flashType === "CANFBL_uncompressed") return "3：CANFBL_uncompressed（CAN非压缩刷写）";
    if (flashType === "CANFBL_compressed") return "4：CANFBL_compressed（CAN压缩格式刷写）";
    return flashType ? `0：${flashType}（默认流程）` : "--";
  };

  const getFlowFileName = (ecu) => {
    const config = ecu.strategyConfig;
    if (!config) return "无此文件";
    
    if (config.flowMode === "custom") {
      return config.tb2Flow?.tb2File || "无此文件";
    }

    const flowOption = config.defaultFlow;
    if (!flowOption) return "无此文件";
    if (ecu.shortName === "ZCU") return "无此文件";
    const prefix = ecu.shortName ? `${ecu.shortName}_` : "";
    if (flowOption.includes("ETHBootloaderonIP_TypeII")) return "ETH38Flash.tb2";
    if (flowOption.includes("ETHBootloaderonIP_TypeI")) return "ETH34Flash.tb2";
    if (flowOption.includes("CANFBL_uncompressed")) return "CANFlash.tb2";
    if (flowOption.includes("CANFBL_compressed")) return "CANFlash_Compressed.tb2";
    if (flowOption.includes("其他流程1")) return `${prefix}OtherFlow1.tb2`;
    return "无此文件";
  };

  const renderCommParamsSection = (ecu) => {
    if (!ecu) return "";
    const protocol = String(ecu.busType || ecu.protocol || "").toUpperCase();
    const fields =
      protocol === "ETH"
        ? [
          { label: "逻辑地址", value: ecu.logicAddress || "--" },
          { label: "功能地址", value: ecu.functionAddress || "--" },
          { label: "IP地址", value: ecu.ipAddress || "--" },
        ]
        : [
          { label: "请求地址", value: ecu.requestId || "--" },
          { label: "响应地址", value: ecu.responseId || "--" },
          { label: "功能地址", value: ecu.functionId || "--" },
        ];

    fields.push({ label: "刷写类型", value: formatFlashType(ecu) });
    fields.push({ label: "刷写脚本名称", value: getFlowFileName(ecu), isError: getFlowFileName(ecu) === "无此文件" });

    return `
      <div class="single-flash-comm">
        <div class="single-flash-comm__items">
          ${fields
        .map(
          (item) => `
                <div class="single-flash-comm__item">
                  <span class="single-flash-comm__label">${esc(item.label)}</span>
                  <strong class="single-flash-comm__value ${item.isError ? "is-error" : ""}">${esc(item.value)}</strong>
                </div>
              `
        )
        .join("")}
        </div>
        <div class="single-flash-comm__actions">
          <button class="flash-config-action-btn" type="button" data-role="single-open-flash-config">
            设置
          </button>
        </div>
      </div>
    `;
  };

  const renderLeftTree = (snapshot) => `
    <aside class="single-flash-left">
      <div class="flash-config-tree">
        ${snapshot.buses.length
      ? snapshot.buses
        .map(
          (bus, busIndex) => `
                    <div class="flash-config-tree-group">
                      <div class="flash-config-tree-node">
                        <button class="flash-config-tree-toggle" type="button" data-role="single-toggle-bus" data-bus-id="${esc(bus.id)}">
                          ${state.expandedBusIds.includes(bus.id) ? "-" : "+"}
                        </button>
                        <button class="flash-config-tree-label" type="button" data-role="single-toggle-bus" data-bus-id="${esc(bus.id)}">
                          <span class="flash-config-tree-label__inner">
                            <i class="fa-solid fa-diagram-project"></i>
                            <span>${esc(bus.name)}</span>
                          </span>
                        </button>
                        ${(bus.protocol === 'CAN' || bus.protocol === 'CANFD') ? `<button class="flash-config-icon-btn flash-config-switch-btn" type="button" data-role="single-switch-protocol" data-bus-id="${esc(bus.id)}" title="切换${bus.protocol === 'CAN' ? 'CANFD' : 'CAN'}"><i class="fa-solid fa-right-left"></i></button>` : ''}
                      </div>
                      <div class="flash-config-tree-children ${state.expandedBusIds.includes(bus.id) ? "" : "is-collapsed"}">
                        ${bus.ecus
              .map(
                (ecu, ecuIndex) => `
                              <button
                                class="flash-config-tree-child ${ecu.id === state.selectedEcuId ? "is-active" : ""} ${window.FlashConfigEcuStrategyModule?.checkEcuHasFlowFile?.(ecu) === false ? 'is-missing-file' : ''}"
                                type="button"
                                data-role="single-pick-ecu"
                                data-ecu-id="${esc(ecu.id)}"
                              >
                              <span class="flash-config-tree-label__inner ${(ecu.mirrorSourceProtocol || ecu.originalProtocol) ? "flash-config-tree-label__inner--with-tag" : ""}">
                                  <span class="flash-config-tree-label__text">
                                    <i class="fa-solid fa-microchip"></i>
                                    <span>${esc(`${ecu.shortName}（${bus.protocol === 'ETH' ? (ecu.logicAddress || '--') : (ecu.requestId || '--')}）${ecu.swType && ecu.flashType !== 'ETHBootloaderonIP_TypeII' ? `-${ecu.swType}` : ''}`)}</span>
                                  </span>
                                  ${(() => {
                    const isCAN = (p) => p === 'CAN' || p === 'CANFD';
                    const tagClass = (p) => isCAN(p) ? 'flash-config-tree-tag--mirror' : 'flash-config-tree-tag--origin';
                    const proto = ecu.mirrorSourceProtocol || ecu.originalProtocol;
                    return proto
                      ? `<span class="flash-config-tree-tag ${tagClass(proto)}">${esc(proto)}</span>`
                      : '';
                  })()}
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
      : '<div class="single-flash-empty">请先在刷写配置中准备 ECU 数据</div>'
    }
      </div>
      <button
        class="flash-config-pane__toggle"
        type="button"
        data-role="single-toggle-tree-pane"
        title="${state.treeCollapsed ? "展开列表" : "收起列表"}"
        aria-label="${state.treeCollapsed ? "展开列表" : "收起列表"}"
      >
        <i class="fa-solid ${state.treeCollapsed ? "fa-panel-right" : "fa-panel-left"}"></i>
      </button>
    </aside>
  `;

  const renderToolbar = (disabled) => `
    <div class="single-flash-toolbar" style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 8px 10px; gap: 8px;">
      <!-- 左侧：通讯保持组 -->
      <div style="display: flex; align-items: center; gap: 8px;">
        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px; color: #475569;">
          <input type="checkbox" id="single-comm-hold-check" ${state.commHoldState.active ? "checked" : ""} style="width: 14px; height: 14px;" />
          <button class="flash-config-action-btn" type="button" data-role="single-comm-hold-settings" style="height: 26px; padding: 0 8px; font-size: 11px;">通讯保持</button>
        </label>
      </div>

      <!-- 中间：其他按钮居中 -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
        <button class="flash-config-action-btn" type="button" ${disabled ? "disabled" : 'data-role="single-get-ecu-info"'}>
          <i class="fa-solid ${state.ecuInfoState.running ? "fa-stop" : "fa-circle-info"}"></i>
          <span>${state.ecuInfoState.running ? "终止" : "获取ECU信息"}</span>
        </button>
        <button class="flash-config-action-btn is-primary" type="button" ${disabled ? "disabled" : 'data-role="single-flash-start"'}>
          <i class="fa-solid ${state.flashState.running ? "fa-stop" : "fa-play"}"></i>
          <span>${state.flashState.running ? "终止" : "刷写"}</span>
        </button>
        <button class="flash-config-action-btn" type="button" ${disabled ? "disabled" : 'data-role="single-upload-log"'}>
          <i class="fa-solid fa-arrow-up-from-bracket"></i>
          <span>上传LOG</span>
        </button>

      </div>

      <!-- 右侧：占位占位，保证中间居中 -->
      <div></div>
    </div>
  `;

  const renderEcuInfoSection = (selectedEcu) => {
    if (!selectedEcu) {
      return `
        <div class="single-flash-content" style="height: 100%; min-height: 0; display: flex; align-items: center; justify-content: center;">
          <div class="single-flash-empty">请选择左侧 ECU</div>
        </div>
      `;
    }
    const dids = getConfiguredDids();
    const didRows = dids.map((d) => {
      const beforeValue = getDidValue(selectedEcu, d.did);
      const manuallyFetchedValue = state.ecuInfoState.ecuId === selectedEcu.id && state.ecuInfoState.fetched
        ? beforeValue
        : "--";
      const afterValue = state.flashState.ecuId === selectedEcu.id && state.flashState.running === false && Object.values(state.flashState.progressByOrder || {}).some((v) => v >= 100)
        ? getDidValue(selectedEcu, d.did)
        : "--";
      return `
        <tr>
          <td>${esc(d.name)}（${esc(d.cmd)}）</td>
          <td>${esc(manuallyFetchedValue)}</td>
          <td>${esc(beforeValue)}</td>
          <td>${esc(afterValue)}</td>
        </tr>`;
    }).join("");

    return `
      <div class="single-flash-content" style="height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 8px;">
        <div class="flash-config-detail-head single-flash-version-head" style="margin: 0; display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0;">
          <div class="single-flash-version-head__title" style="flex-shrink: 0;">${esc(`${selectedEcu.shortName}（${selectedEcu.supplierCode || "--"}）${selectedEcu.swType && selectedEcu.flashType !== 'ETHBootloaderonIP_TypeII' ? `-${selectedEcu.swType}` : ''}`)}</div>
          <div style="flex-shrink: 0;">
            ${renderCommParamsSection(selectedEcu)}
          </div>
          <div class="single-flash-did-table-wrap" style="flex: 1; min-height: 0; overflow-y: auto;">
            <table class="single-flash-did-table">
              <thead>
                <tr>
                  <th>DID 名称</th>
                  <th>手动获取值</th>
                  <th>刷写前</th>
                  <th>刷写后</th>
                </tr>
              </thead>
              <tbody>${didRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  };

  const renderPackagesSection = (selectedEcu) => {
    if (!selectedEcu) {
      return `
        <div class="single-flash-content" style="height: 100%; min-height: 0; display: flex; align-items: center; justify-content: center;">
          <div class="single-flash-empty">请选择左侧 ECU</div>
        </div>
      `;
    }

    const packages = derivePackages(selectedEcu);
    ensureFlashProgress(selectedEcu.id, packages);
    const loops = getLoopCount(selectedEcu);

    return `
      <div class="single-flash-content" style="height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 8px;">
        <section class="flash-config-sheet flash-config-sheet--main single-flash-split__packages" style="height: 100%; min-height: 0; display: flex; flex-direction: column; margin: 0;">
          <div class="flash-config-sheet__title" style="flex-shrink: 0;">刷写包列表（整体循环次数：${state.flashState.ecuId === selectedEcu.id ? state.flashState.currentLoop + 1 : 1}/${esc(loops)}）</div>
          <div class="single-flash-table-wrap" style="flex: 1; min-height: 0; overflow-y: auto;">
            <table class="single-flash-table">
              <colgroup>
                <col class="single-flash-col-order" />
                <col class="single-flash-col-name" />
                <col class="single-flash-col-vendor" />
                <col class="single-flash-col-type" />
                <col class="single-flash-col-soft" />
                <col class="single-flash-col-hard" />
                <col class="single-flash-col-size" />
                <col class="single-flash-col-count" />
                <col class="single-flash-col-interval" />
                <col class="single-flash-col-progress" />
              </colgroup>
              <thead>
                <tr>
                  <th>顺序</th>
                  <th>刷写包名称</th>
                  <th>供应商</th>
                  <th>类型</th>
                  <th>软件版本</th>
                  <th>硬件版本</th>
                  <th>大小(M)</th>
                  <th>刷写次数</th>
                  <th>间隔(s)</th>
                  <th>刷写进度</th>
                </tr>
              </thead>
              <tbody>
                ${packages
                  .map((item) => {
                    const progress =
                      state.flashState.ecuId === selectedEcu.id ? state.flashState.progressByOrder[item.order] || 0 : 0;

                    let currentVersion = "--";
                    if (item.type === "应用") currentVersion = getDidValue(selectedEcu, "F189");
                    else if (item.type === "标定") currentVersion = getDidValue(selectedEcu, "F1C0");
                    else if (item.type === "引导") currentVersion = getDidValue(selectedEcu, "F1C1");

                    const isMismatch = currentVersion !== "--" && item.softwareVersion !== "--" && currentVersion !== item.softwareVersion;
                    const versionStyle = isMismatch ? ' style="color: #ff4d4f; font-weight: bold;" title="与刷写前版本不一致"' : '';

                    return `
                      <tr>
                        <td>${esc(item.order)}</td>
                        <td>${esc(item.name)}</td>
                        <td>${esc(item.vendor)}</td>
                        <td>${esc(item.type)}</td>
                        <td${versionStyle}>${esc(item.softwareVersion)}</td>
                        <td>${esc(item.hardwareVersion)}</td>
                        <td>${esc(item.sizeMb)}</td>
                        <td>${esc(item.repeatCount)}</td>
                        <td>${esc(item.intervalSec)}</td>
                        <td>${renderProgressCell(progress, item)}</td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>
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

  const renderLogSection = (selectedEcu) => {
    const logs = ensureMockLogs(selectedEcu);
    const isRaw = state.logView === "raw";
    return `
    <section class="flash-config-sheet single-flash-log-sheet single-flash-split__log" style="height: 100%; min-height: 0; display: flex; flex-direction: column; margin: 0;">
      <div class="flash-config-sheet__title flash-config-sheet__title--with-actions" style="flex-shrink: 0;">
        <span>LOG数据</span>
        <div class="single-flash-log-tabs">
          <button class="flash-config-action-btn" type="button" data-role="single-open-dir">打开目录</button>
        </div>
      </div>
      <div class="single-flash-log-body" style="flex: 1; min-height: 0; overflow-y: auto;">
        ${isRaw ? renderRawLogRows(logs.raw) : renderDiagLogRows(logs.diag)}
      </div>
    </section>
  `;
  };

  const renderRightPanel = (selectedEcu) => {
    const ratios = state.contentSplitRatios || [1.0, 1.0, 0.8];
    return `
    <section class="single-flash-right" style="height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: #eef2f6;">
      ${renderToolbar(!selectedEcu)}
      <div class="single-flash-main" style="flex: 1; min-height: 0; overflow: hidden;">
        <div class="single-flash-log-split" style="display: flex; flex-direction: column; height: 100%; min-height: 0;">
          <div class="single-flash-section-ecu" style="flex: ${ratios[0]}; display: ${ratios[0] === 0 ? 'none' : 'flex'}; flex-direction: column; min-height: 0; overflow: hidden;">
            ${renderEcuInfoSection(selectedEcu)}
          </div>
          <div class="single-flash-divider-1" data-role="single-split-divider-1" style="height: 10px; cursor: row-resize; background: #eef2f6; display: ${ratios[0] === 0 && ratios[1] === 0 ? 'none' : 'flex'}; align-items: center; justify-content: center; flex-shrink: 0;" title="拖动调整高度">
            <span style="width: 56px; height: 2px; background: #aeb9c8;"></span>
          </div>
          <div class="single-flash-section-packages" style="flex: ${ratios[1]}; display: ${ratios[1] === 0 ? 'none' : 'flex'}; flex-direction: column; min-height: 0; overflow: hidden;">
            ${renderPackagesSection(selectedEcu)}
          </div>
          <div class="single-flash-divider-2" data-role="single-split-divider-2" style="height: 10px; cursor: row-resize; background: #eef2f6; display: ${ratios[1] === 0 && ratios[2] === 0 ? 'none' : 'flex'}; align-items: center; justify-content: center; flex-shrink: 0;" title="拖动调整高度">
            <span style="width: 56px; height: 2px; background: #aeb9c8;"></span>
          </div>
          <div class="single-flash-section-log" style="flex: ${ratios[2]}; display: ${ratios[2] === 0 ? 'none' : 'flex'}; flex-direction: column; min-height: 0; overflow: hidden;">
            ${renderLogSection(selectedEcu)}
          </div>
        </div>
      </div>
    </section>
  `;
  };

  const bindTreeHandlers = () => {
    root.querySelectorAll('[data-role="single-pick-ecu"]').forEach((element) => {
      element.addEventListener("click", () => {
        stopEcuInfoSimulation();
        state.ecuInfoState = {
          ecuId: "",
          running: false,
        };
        stopFlashSimulation();
        state.flashState = {
          ecuId: "",
          running: false,
          progressByOrder: {},
        };
        state.selectedEcuId = element.dataset.ecuId || "";
        const snapshot = getSnapshot();
        const current = snapshot.buses
          .flatMap((bus) => bus.ecus.map((ecu) => ({ bus, ecu })))
          .find((item) => item.ecu.id === state.selectedEcuId);
        if (current?.ecu) {
          current.ecu.busName = current.bus.name;
          addLogLine(current.ecu, `已切换 ECU：${current.ecu.shortName}`);
        }
        render();
      });
    });

    root.querySelectorAll('[data-role="single-toggle-bus"]').forEach((element) => {
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

    root.querySelectorAll('[data-role="single-switch-protocol"]').forEach((element) => {
      element.addEventListener("click", (e) => {
        e.stopPropagation();
        const busId = element.dataset.busId || "";
        if (!busId) return;
        if (window.FlashConfigShared && typeof window.FlashConfigShared.switchBusProtocol === "function") {
          window.FlashConfigShared.switchBusProtocol(busId);
        }
      });
    });

    if (!state.rootClickBound) {
      root.addEventListener("click", (event) => {
        const role = event.target.closest("[data-role]")?.dataset.role;
        if (role === "single-toggle-tree-pane") {
          state.treeCollapsed = !state.treeCollapsed;
          render();
          return;
        }

        if (role === "single-comm-hold-settings") {
          const modal = document.getElementById("modal-comm-hold-settings");
          if (modal) {
            document.getElementById("comm-hold-cycle").value = state.commHoldState.cycle;
            document.getElementById("comm-hold-type").value = state.commHoldState.type;
            document.getElementById("comm-hold-data").value = state.commHoldState.data;
            modal.classList.remove("is-hidden");
          }
          return;
        }


        if (role === "single-open-flash-config") {
          const targetEcuId = state.selectedEcuId;
          if (!targetEcuId) {
            notify("请先选择 ECU");
            return;
          }
          openFlashConfigAndFocusEcu(targetEcuId);
          return;
        }

        const actionBtn = event.target.closest("[data-action]");
      });
      state.rootClickBound = true;
    }
  };

  const bindSplitDrag = () => {
    // Divider 1 drag (between ECU Info and Packages)
    root.querySelector('[data-role="single-split-divider-1"]')?.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const split = root.querySelector(".single-flash-log-split");
      if (!split) return;
      
      const sec1 = split.querySelector(".single-flash-section-ecu");
      const sec2 = split.querySelector(".single-flash-section-packages");
      if (!sec1 || !sec2) return;
      
      const rect1 = sec1.getBoundingClientRect();
      const rect2 = sec2.getBoundingClientRect();
      const startY = event.clientY;
      
      let totalFlex = (state.contentSplitRatios[0] || 0) + (state.contentSplitRatios[1] || 0);
      if (totalFlex === 0) {
        totalFlex = 2.0;
      }
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
          flex1 = finalH1 > 0 ? 1.0 : 0;
          flex2 = finalH2 > 0 ? 1.0 : 0;
        }
        
        sec1.style.flex = String(flex1);
        sec2.style.flex = String(flex2);
        
        sec1.style.display = finalH1 === 0 ? "none" : "flex";
        sec2.style.display = finalH2 === 0 ? "none" : "flex";
        
        state.contentSplitRatios[0] = flex1;
        state.contentSplitRatios[1] = flex2;
      };
      
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        render();
      };
      
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    // Divider 2 drag (between Packages and Log)
    root.querySelector('[data-role="single-split-divider-2"]')?.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const split = root.querySelector(".single-flash-log-split");
      if (!split) return;
      
      const sec1 = split.querySelector(".single-flash-section-ecu");
      const sec2 = split.querySelector(".single-flash-section-packages");
      const sec3 = split.querySelector(".single-flash-section-log");
      if (!sec1 || !sec2 || !sec3) return;
      
      const rect1 = sec1.getBoundingClientRect();
      const rect2 = sec2.getBoundingClientRect();
      const rect3 = sec3.getBoundingClientRect();
      const startY = event.clientY;
      
      const totalFlex = (state.contentSplitRatios[0] || 0) + (state.contentSplitRatios[1] || 0) + (state.contentSplitRatios[2] || 0);
      const totalHeight = rect1.height + rect2.height + rect3.height;
      const topHeight = rect1.height + rect2.height;
      
      const r0 = state.contentSplitRatios[0] || 0;
      const r1 = state.contentSplitRatios[1] || 0;
      
      let ratio1 = 0;
      let ratio2 = 0;
      
      if (r0 === 0 && r1 === 0) {
        ratio1 = 0.5;
        ratio2 = 0.5;
      } else {
        const sum = r0 + r1;
        ratio1 = r0 / sum;
        ratio2 = r1 / sum;
      }
      
      const onMove = (moveEvent) => {
        let dy = moveEvent.clientY - startY;
        
        // 限制 dy 范围，防止超出边界
        dy = Math.max(-topHeight, Math.min(rect3.height, dy));
        
        let newHTop = topHeight + dy;
        let newH3 = rect3.height - dy;
        
        // 确保 newHTop + newH3 === totalHeight
        newHTop = Math.max(0, Math.min(totalHeight, newHTop));
        newH3 = totalHeight - newHTop;
        
        const finalHTop = newHTop < 15 ? 0 : newHTop;
        const finalH3 = newH3 < 15 ? 0 : newH3;
        
        let flexTop = 0;
        let flex3 = 0;
        if (totalHeight > 0) {
          flexTop = (finalHTop / totalHeight) * (totalFlex === 0 ? 2.8 : totalFlex);
          flex3 = (finalH3 / totalHeight) * (totalFlex === 0 ? 2.8 : totalFlex);
        } else {
          flexTop = finalHTop > 0 ? 2.0 : 0;
          flex3 = finalH3 > 0 ? 0.8 : 0;
        }
        
        const flex1 = flexTop * ratio1;
        const flex2 = flexTop * ratio2;
        
        sec1.style.flex = String(flex1);
        sec2.style.flex = String(flex2);
        sec3.style.flex = String(flex3);
        
        sec1.style.display = flex1 === 0 ? "none" : "flex";
        sec2.style.display = flex2 === 0 ? "none" : "flex";
        sec3.style.display = finalH3 === 0 ? "none" : "flex";
        
        state.contentSplitRatios[0] = flex1;
        state.contentSplitRatios[1] = flex2;
        state.contentSplitRatios[2] = flex3;
      };
      
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        render();
      };
      
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  };

  const bindToolbarHandlers = () => {

    root.querySelector('[data-role="single-open-dir"]')?.addEventListener("click", () => {
      notify("日志所在目录已打开", "success");
    });

    root.querySelector('[data-role="single-get-ecu-info"]')?.addEventListener("click", () => {
      const ecu = ensureSelectedEcu(getSnapshot())?.ecu;
      if (!ecu) return;
      if (state.ecuInfoState.running) {
        stopEcuInfoSimulation();
        addLogLine(ecu, `获取 ECU 信息已终止：${ecu.shortName}`);
        notify(`获取 ECU 信息已终止：${ecu.shortName}`);
        render();
        return;
      }
      startEcuInfoSimulation(ecu);
    });

    root.querySelector('[data-role="single-flash-start"]')?.addEventListener("click", () => {
      const current = ensureSelectedEcu(getSnapshot());
      if (!current?.ecu) return;
      if (state.flashState.running) {
        stopFlashSimulation();
        addLogLine(current.ecu, `单件刷写已终止：${current.ecu.shortName}`);
        notify(`单件刷写已终止：${current.ecu.shortName}`);
        render();
        return;
      }
      startFlashSimulation(current.ecu);
    });

    root.querySelector('[data-role="single-upload-log"]')?.addEventListener("click", () => {
      const ecu = ensureSelectedEcu(getSnapshot())?.ecu;
      if (!ecu) return;
      addLogLine(ecu, `LOG 上传成功：${ecu.shortName}`);
      notify(`LOG 上传成功：${ecu.shortName}`);
      render();
    });

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

  // 点击外部关闭下拉菜单
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#single-gw-auth-dropdown") && state.gwAuthState.open) {
      state.gwAuthState.open = false;
      render();
    }
  });

  const render = () => {
    const snapshot = getSnapshot();
    const current = ensureSelectedEcu(snapshot);
    const selectedEcu = current?.ecu || null;
    if (selectedEcu && current?.bus) {
      selectedEcu.busName = current.bus.name;
      selectedEcu.busType = current.bus.type || current.bus.protocol || selectedEcu.busType;
      ensureMockLogs(selectedEcu);
    }

    root.innerHTML = `
      <div class="single-flash-shell ${state.treeCollapsed ? "is-tree-collapsed" : ""}">
        ${renderLeftTree(snapshot)}
        <div class="single-flash-right-wrap">
          ${renderRightPanel(selectedEcu)}
        </div>
      </div>
    `;

    bindTreeHandlers();
    bindSplitDrag();
    bindToolbarHandlers();
  };

  window.addEventListener("flash-config-shared-updated", render);

  render();
})();
