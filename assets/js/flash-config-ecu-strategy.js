(function () {
  const loadingTimers = {};

  const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stripExt = (name) => String(name || "").replace(/\.[^.]+$/, "");
  const normalizeToken = (value) => String(value || "").replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, "").toUpperCase();
  const normalizeVersion = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();
  const formatSize = (bytes) => (Number.isFinite(bytes) && bytes > 0 ? (bytes / 1024 / 1024).toFixed(2) : "--");
  const clamp = (value, min, max, fallback) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, Math.round(numeric)));
  };
  const cloneData = (value) => JSON.parse(JSON.stringify(value));

  const createPackage = (data) => ({
    id: data.id || uid("pkg"),
    name: data.name || "--",
    ecuName: data.ecuName || "--",
    vendor: data.vendor || "--",
    gbfVersion: data.gbfVersion || "--",
    type: data.type || "GBF",
    hardwareVersion: data.hardwareVersion || "--",
    softwareVersion: data.softwareVersion || "--",
    baselineVersion: data.baselineVersion || "--",
    sizeMb: data.sizeMb || "--",
    repeatCount: String(data.repeatCount ?? 1),
    intervalSec: data.intervalSec ?? "",
    source: data.source || "--",
    fixed: Boolean(data.fixed),
  });

  const createQueueSlot = (ref, data = {}) => ({
    id: data.id || uid("slot"),
    ref,
    repeatCount: String(data.repeatCount ?? 1),
    intervalSec: data.intervalSec ?? "",
  });

  const createCurrentPackage = (ecu) => {
    const fileName = ecu.gbfFile && ecu.gbfFile !== "--" ? ecu.gbfFile : `${ecu.shortName}_${ecu.targetVersion || "CURRENT"}.gbf`;
    const ext = fileName.split(".").pop()?.toUpperCase() || "GBF";
    const softwareVersion = ecu.targetVersion || "--";
    const derivedSize = (8 + fileName.length * 0.18).toFixed(2);

    return createPackage({
      id: "pkg-current",
      name: fileName,
      ecuName: ecu.shortName,
      vendor: ecu.supplierCode || ecu.supplier || "--",
      gbfVersion: softwareVersion !== "--" ? `GBF-${softwareVersion}` : "--",
      type: ext,
      hardwareVersion: ecu.hardwareVersion || "--",
      softwareVersion,
      baselineVersion: softwareVersion !== "--" ? `BL-${String(softwareVersion).slice(-6)}` : "--",
      sizeMb: derivedSize,
      repeatCount: 1,
      intervalSec: "",
      source: ecu.importSource && ecu.importSource !== "--" ? ecu.importSource : "当前配置",
      fixed: true,
    });
  };

  const getDynamicDefaultFlowOptions = (ecu) => {
    const flashType = ecu.flashType || "";
    if (flashType === "ETHBootloaderonIP_TypeI") return "1：ETHBootloaderonIP_TypeI（以太网34服务刷写）";
    if (flashType === "ETHBootloaderonIP_TypeII") return "2：ETHBootloaderonIP_TypeII（以太网38服务刷写）";
    if (flashType === "CANFBL_uncompressed") return "3：CANFBL_uncompressed（CAN非压缩刷写）";
    if (flashType === "CANFBL_compressed") return "4：CANFBL_compressed（CAN压缩格式刷写）";
    return `0：${flashType}（默认流程）`;
  };

  const getFlowOptionsList = (ecu) => [
    getDynamicDefaultFlowOptions(ecu),
    "11：其他流程1",
    "12：其他流程2"
  ];

  const getFlowFileName = (ecu, flowOption) => {
    if (!flowOption) return "";
    
    // 针对 ZCU 强制展示为 无此文件
    if (ecu.shortName === "ZCU") return "";

    const prefix = ecu.shortName ? `${ecu.shortName}_` : "";
    
    // 注意：TypeII 包含了 TypeI 的字符串，所以必须先匹配 TypeII
    if (flowOption.includes("ETHBootloaderonIP_TypeII")) return "ETH38Flash.tb2";
    if (flowOption.includes("ETHBootloaderonIP_TypeI")) return "ETH34Flash.tb2";
    
    if (flowOption.includes("CANFBL_uncompressed")) return "CANFlash.tb2";
    if (flowOption.includes("CANFBL_compressed")) return "CANFlash_Compressed.tb2";
    if (flowOption.includes("其他流程1")) return `${prefix}OtherFlow1.tb2`;
    
    // 留一个或两个无此文件的情况（例如其他流程2）
    return ""; 
  };

  const syncCurrentPackage = (ecu, config) => {
    const current = config.currentPackage || createCurrentPackage(ecu);
    const derived = createCurrentPackage(ecu);
    config.currentPackage = {
      ...current,
      name: derived.name,
      ecuName: derived.ecuName,
      vendor: derived.vendor,
      gbfVersion: derived.gbfVersion,
      type: derived.type,
      hardwareVersion: derived.hardwareVersion,
      softwareVersion: derived.softwareVersion,
      baselineVersion: derived.baselineVersion,
      sizeMb: derived.sizeMb,
      fixed: true,
      repeatCount: current.repeatCount || "1",
      intervalSec: current.intervalSec ?? "",
      source: current.source || derived.source,
    };
  };

  const ensureStrategyConfig = (ecu) => {
    if (!ecu.strategyConfig) {
      ecu.strategyConfig = {
        currentPackage: createCurrentPackage(ecu),
        extraPackages: [],
        flowMode: "default",
        defaultFlow: getFlowOptionsList(ecu)[0],
        tb2Flow: {
          tb2File: "",
          jFile: "",
        },
        selectedPackageId: "pkg-current",
        totalLoopCount: "1",
        loadingStrategy: true,
        strategyLoaded: false,
        validation: {
          type: "neutral",
          message: "等待导入其他 GBF 或配置刷写流程。",
        },
      };
    }

    syncCurrentPackage(ecu, ecu.strategyConfig);
    if (!Array.isArray(ecu.strategyConfig.queueSlots)) {
      const legacyPackages = [ecu.strategyConfig.currentPackage, ...ecu.strategyConfig.extraPackages];
      ecu.strategyConfig.queueSlots = legacyPackages.map((item, index) => createQueueSlot(
        index === 0 ? "main" : item.id,
        {
          repeatCount: item.repeatCount ?? 1,
          intervalSec: item.intervalSec ?? "",
        }
      ));
    }
    if (!ecu.strategyConfig.queueSlots.length) {
      ecu.strategyConfig.queueSlots = [createQueueSlot("main", { repeatCount: 1, intervalSec: "" })];
    }

    return ecu.strategyConfig;
  };

  const getTemplateList = (config) => [config.currentPackage, ...config.extraPackages];

  const findTemplateByRef = (config, ref) => {
    if (ref === "main") return config.currentPackage;
    return config.extraPackages.find((item) => item.id === ref) || null;
  };

  const findRefByVersion = (config, softwareVersion) => {
    const normalized = normalizeVersion(softwareVersion);
    if (!normalized) return null;
    if (normalizeVersion(config.currentPackage.softwareVersion) === normalized) return "main";
    const match = config.extraPackages.find((item) => normalizeVersion(item.softwareVersion) === normalized);
    return match ? match.id : null;
  };

  const getPackages = (config) => config.queueSlots.map((slot, index) => {
    const template = findTemplateByRef(config, slot.ref) || config.currentPackage;
    return {
      ...template,
      id: slot.id,
      ref: slot.ref,
      repeatCount: slot.repeatCount,
      intervalSec: slot.intervalSec,
      isMainReference: slot.ref === "main",
      fixed: false,
      order: index + 1,
    };
  });

  const appendQueueSlot = (config, ref, data = {}) => {
    const slot = createQueueSlot(ref, data);
    config.queueSlots.push(slot);
    return slot;
  };

  const duplicateQueueSlot = (config, slotId) => {
    const slot = config.queueSlots.find((item) => item.id === slotId);
    if (!slot) return null;
    return appendQueueSlot(config, slot.ref, {
      repeatCount: slot.repeatCount,
      intervalSec: slot.intervalSec,
    });
  };

  const addTemplateIfMissing = (config, templateData) => {
    const existingRef = findRefByVersion(config, templateData.softwareVersion);
    if (existingRef) {
      return { ref: existingRef, created: false };
    }
    const template = createPackage(templateData);
    config.extraPackages.push(template);
    return { ref: template.id, created: true };
  };

  const toDisplayPackageType = (pkg) => {
    const token = `${pkg.type || ""} ${pkg.name || ""} ${pkg.softwareVersion || ""}`.toLowerCase();
    if (token.includes("boot") || token.includes("bl") || token.includes("引导")) return "引导";
    if (token.includes("cal") || token.includes("cd") || token.includes("标定")) return "标定";
    return "应用";
  };
  const setValidation = (config, type, message) => {
    config.validation = { type, message };
  };

  const nextCloudVersion = (config) => {
    const versions = new Set(getTemplateList(config).map((item) => normalizeVersion(item.softwareVersion)));
    const base = normalizeVersion(config.currentPackage.softwareVersion) || "SW";
    let index = 2;
    while (versions.has(`${base}_C${index}`)) {
      index += 1;
    }
    return `${base}_C${index}`;
  };

  const createCloudPackage = (ecu, config) => {
    const swVersion = nextCloudVersion(config);
    const fileName = `${ecu.shortName}_${ecu.supplierCode || ecu.supplier || "SUP"}_${swVersion}.gbf`;
    return createPackage({
      name: fileName,
      ecuName: ecu.shortName,
      vendor: ecu.supplierCode || ecu.supplier || "--",
      gbfVersion: `GBF-${swVersion}`,
      type: "GBF",
      hardwareVersion: ecu.hardwareVersion || "--",
      softwareVersion: swVersion,
      baselineVersion: `BL-${swVersion.slice(-6)}`,
      sizeMb: (7.6 + config.extraPackages.length * 0.85).toFixed(2),
      source: "云端下载",
    });
  };

  const parseLocalPackage = (file, ecu, config) => {
    const ext = String(file.name || "").split(".").pop()?.toLowerCase();
    if (!["gbf", "zip"].includes(ext || "")) {
      return { ok: false, message: `${file.name} 导入失败：仅支持 .gbf 或 .zip` };
    }

    const parts = stripExt(file.name).split(/[-_\s]+/).filter(Boolean);
    if (parts.length < 3) {
      return { ok: false, message: `${file.name} 导入失败：文件名需包含 ECU、供应商编码、软件版本` };
    }

    const [ecuToken, supplierToken, ...versionParts] = parts;
    const expectedEcu = normalizeToken(ecu.shortName);
    const expectedSuppliers = [normalizeToken(ecu.supplierCode), normalizeToken(ecu.supplier)].filter(Boolean);
    const normalizedEcuToken = normalizeToken(ecuToken);
    const normalizedSupplierToken = normalizeToken(supplierToken);

    if (!normalizedEcuToken.includes(expectedEcu) && !expectedEcu.includes(normalizedEcuToken)) {
      return { ok: false, message: `${file.name} 导入失败：ECU 不一致` };
    }

    if (!expectedSuppliers.some((item) => item && (normalizedSupplierToken.includes(item) || item.includes(normalizedSupplierToken)))) {
      return { ok: false, message: `${file.name} 导入失败：供应商不一致` };
    }

    const swVersion = versionParts.join("_");

    return {
      ok: true,
      packageData: {
        name: file.name,
        ecuName: ecu.shortName,
        vendor: ecu.supplierCode || ecu.supplier || "--",
        gbfVersion: `GBF-${swVersion}`,
        type: ext.toUpperCase(),
        hardwareVersion: ecu.hardwareVersion || "--",
        softwareVersion: swVersion,
        baselineVersion: `BL-${String(swVersion).slice(-6)}`,
        sizeMb: formatSize(file.size) || "--",
        source: "从本地选择",
      },
    };
  };

  const logMessage = (message, type) => {
    if (typeof pushSystemMessage === "function") {
      pushSystemMessage(message, type);
    }
    if (typeof addLog === "function") {
      addLog(message);
    }
  };

  /* ── 渲染函数（垂直卡片队列布局） ── */

  const renderDiagnosticFlowContent = (ecu, config, esc, editing) => {
    const disabledAttr = editing === false ? " disabled" : "";
    return `
      <div class="flash-config-strategy-flow">
        <div class="flash-config-strategy-flow-row">
          <label class="flash-config-strategy-radio">
            <input type="radio" name="strategy-flow-mode" value="default" ${config.flowMode === "default" ? "checked" : ""} data-role="strategy-flow-mode"${disabledAttr} />
            默认刷写流程
          </label>
          ${config.flowMode === "default" ? (() => {
            const options = getFlowOptionsList(ecu);
            const fileName = getFlowFileName(ecu, config.defaultFlow);
            const fileDisplay = fileName 
              ? `<span class="flash-config-strategy-file-label">${esc(fileName)}</span>` 
              : `<span class="flash-config-strategy-file-label" style="color: #e11d48; font-weight: 500;">无此文件</span>`;
            return `
              <select class="flash-config-select flash-config-strategy-flow-select" data-role="strategy-default-flow"${disabledAttr}>
                ${options.map((item) => `<option value="${esc(item)}" ${item === config.defaultFlow || (!options.includes(config.defaultFlow) && item === options[0]) ? "selected" : ""}>${esc(item)}</option>`).join("")}
              </select>
              ${fileDisplay}
            `;
          })() : ""}
        </div>
        <div class="flash-config-strategy-flow-row">
          <label class="flash-config-strategy-radio">
            <input type="radio" name="strategy-flow-mode" value="tb2" ${config.flowMode === "tb2" ? "checked" : ""} data-role="strategy-flow-mode"${disabledAttr} />
            自选流程
          </label>
          ${config.flowMode === "tb2" ? `
            <button class="flash-config-action-btn" type="button" data-role="strategy-pick-tb2"${disabledAttr}>选择文件</button>
            <span class="flash-config-strategy-file-label">${esc(config.tb2Flow.tb2File || "未选择")}</span>
          ` : ""}
        </div>
      </div>
    `;
  };

  const renderDiagnosticFlowPanel = (ecu, config, esc, options = {}) => {
    const content = renderDiagnosticFlowContent(ecu, config, esc, options.editing);
    if (options.embedded) {
      return `
        <div class="flash-config-ecu-subsection">
          <div class="flash-config-ecu-subsection__title">诊断流程</div>
          ${content}
        </div>
      `;
    }
    return `
      <section class="flash-config-sheet">
        <div class="flash-config-sheet__title">诊断流程</div>
        ${content}
      </section>
    `;
  };

  const renderDiagnosticFlowInputs = () => `
    <input type="file" accept=".tb2" hidden data-role="strategy-tb2-input" />
  `;

  const bindDiagnosticFlowSection = ({ root, ecu, config, rerender, editable }) => {
    const targetConfig = config || ensureStrategyConfig(ecu);
    if (!editable) return;

    root.querySelectorAll('[data-role="strategy-flow-mode"]').forEach((element) => {
      element.addEventListener("change", () => {
        targetConfig.flowMode = element.value;
        rerender();
      });
    });

    root.querySelector('[data-role="strategy-default-flow"]')?.addEventListener("change", (event) => {
      targetConfig.defaultFlow = event.target.value;
      rerender();
    });

    root.querySelector('[data-role="strategy-pick-tb2"]')?.addEventListener("click", () => {
      root.querySelector('[data-role="strategy-tb2-input"]')?.click();
    });

    root.querySelector('[data-role="strategy-tb2-input"]')?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      targetConfig.tb2Flow.tb2File = file.name;
      setValidation(targetConfig, "success", "TB2 文件已加载");
      rerender();
    });

  };

  const renderPackageCard = (pkg, canMoveUp, canMoveDown, esc) => {
    const intervalHint = String(pkg.repeatCount || "1") === "1"
      ? "仅刷写1次，间隔忽略"
      : "下一包首次执行前沿用此间隔";
    const canRemove = !(pkg.isMainReference && pkg.order === 1);
    const displayType = toDisplayPackageType(pkg);
    return `
      <div class="flash-config-strategy-card">
        <div class="flash-config-strategy-card__head">
          <span class="flash-config-strategy-card__order">#${pkg.order}</span>
          <span class="flash-config-strategy-card__name" title="${esc(pkg.name)}">${esc(pkg.name)}（供应商：${esc(pkg.vendor)}）</span>
          <button class="flash-config-action-btn flash-config-strategy-card__duplicate-btn" type="button" data-role="duplicate-strategy-package" data-slot-id="${esc(pkg.id)}">再次添加</button>
          <div class="flash-config-strategy-card__actions">
            <button class="flash-config-icon-btn" type="button" data-role="move-strategy-package" data-slot-id="${esc(pkg.id)}" data-dir="up"${canMoveUp ? "" : " disabled"} title="上移"><i class="fa-solid fa-chevron-up"></i></button>
            <button class="flash-config-icon-btn" type="button" data-role="move-strategy-package" data-slot-id="${esc(pkg.id)}" data-dir="down"${canMoveDown ? "" : " disabled"} title="下移"><i class="fa-solid fa-chevron-down"></i></button>
            <button class="flash-config-icon-btn flash-config-strategy-card__remove-btn" type="button" data-role="remove-strategy-package" data-slot-id="${esc(pkg.id)}"${canRemove ? "" : " disabled"} title="${canRemove ? "移除" : "首个主包不可移除"}"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="flash-config-strategy-card__info">
          <div class="flash-config-strategy-card__info-main">
            <span><strong>GBF版本：</strong>${esc(pkg.gbfVersion)}</span>
            <span><strong>类型：</strong>${esc(displayType)}</span>
            <span><strong>刷写包大小：</strong>${esc(pkg.sizeMb)} MB</span>
          </div>
          <div class="flash-config-strategy-card__info-tags">
            <span><strong>硬件版本：</strong>${esc(pkg.hardwareVersion)}</span>
            <span><strong>软件版本：</strong>${esc(pkg.softwareVersion)}</span>
            <span><strong>基线版本：</strong>${esc(pkg.baselineVersion)}</span>
          </div>
        </div>
        <div class="flash-config-strategy-card__fields">
          <label class="flash-config-strategy-card__field">
            <span>刷写次数</span>
            <input class="flash-config-input" type="number" min="1" max="1000"
              data-role="strategy-package-field" data-slot-id="${esc(pkg.id)}" data-field="repeatCount"
              value="${esc(pkg.repeatCount || "1")}" />
          </label>
          <label class="flash-config-strategy-card__field">
            <span>间隔(s)</span>
            <input class="flash-config-input" type="number" min="0" max="6000"
              data-role="strategy-package-field" data-slot-id="${esc(pkg.id)}" data-field="intervalSec"
              value="${esc(pkg.intervalSec)}" />
          </label>
          <em class="flash-config-strategy-hint${String(pkg.repeatCount || "1") === "1" ? " is-muted" : ""}">${esc(intervalHint)}</em>
        </div>
      </div>
    `;
  };

  const renderPackageQueue = (config, esc) => {
    const packages = getPackages(config);
    const queueCount = packages.length;
    const connector = `<div class="flash-config-strategy-connector"><i class="fa-solid fa-arrow-down"></i></div>`;
    const cards = packages.map((pkg, idx) => {
      const canMoveUp = idx > 0;
      const canMoveDown = idx < queueCount - 1;
      const card = renderPackageCard(pkg, canMoveUp, canMoveDown, esc);
      return idx > 0 ? connector + card : card;
    }).join("");

    return `
      <section class="flash-config-sheet">
        <div class="flash-config-sheet__title flash-config-sheet__title--with-actions">
          <span>刷写包队列</span>
        </div>
        <div class="flash-config-strategy-queue">${cards}</div>
      </section>
    `;
  };

  const renderExecutionPreview = (config) => {
    const packages = getPackages(config);
    const steps = packages.map((pkg) => `包${pkg.order}(\u00d7${pkg.repeatCount || 1})`).join(" \u2192 ");
    return `${steps}\uff0c整体循环 ${config.totalLoopCount || "1"} 轮`;
  };

  const renderLoopStrategy = (config, esc) => `
    <section class="flash-config-sheet">
      <div class="flash-config-sheet__title">循环策略</div>
      <div class="flash-config-strategy-loop">
        <label class="flash-config-strategy-loop__field">
          <span>整体循环次数</span>
          <input class="flash-config-input" type="number" min="1" max="1000" data-role="strategy-total-loop" value="${esc(config.totalLoopCount || "1")}" />
        </label>
        <div class="flash-config-strategy-preview">
          <i class="fa-solid fa-list-check"></i>
          <span>预计执行：${esc(renderExecutionPreview(config))}</span>
        </div>
      </div>
    </section>
  `;

  const renderBody = ({ ecu, esc, buses }) => {
    const config = ensureStrategyConfig(ecu);
    return `
      <div class="flash-config-detail-grid">
        ${config.loadingStrategy ? `
          <div class="flash-config-strategy-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>正在加载ECU信息</span>
          </div>
        ` : ""}
        ${renderPackageQueue(config, esc)}
        ${renderLoopStrategy(config, esc)}
        <input type="file" accept=".gbf,.zip" multiple hidden data-role="strategy-gbf-input" />
      </div>
    `;
  };

  /* ── 业务逻辑 ── */

  const startLoading = (ecu, rerender) => {
    const config = ensureStrategyConfig(ecu);
    if (config.strategyLoaded || loadingTimers[ecu.id]) return;
    config.loadingStrategy = true;
    loadingTimers[ecu.id] = setTimeout(() => {
      config.loadingStrategy = false;
      config.strategyLoaded = true;
      delete loadingTimers[ecu.id];
      rerender();
    }, 700);
  };

  const importPackages = (files, ecu, rerender) => {
    const config = ensureStrategyConfig(ecu);
    const addedSlots = [];
    const reusedSlots = [];
    const errors = [];

    files.forEach((file) => {
      const result = parseLocalPackage(file, ecu, config);
      if (!result.ok) {
        errors.push(result.message);
        return;
      }
      const added = addTemplateIfMissing(config, result.packageData);
      appendQueueSlot(config, added.ref, { repeatCount: 1, intervalSec: "" });
      if (added.created) {
        addedSlots.push(result.packageData.name);
      } else {
        reusedSlots.push(result.packageData.name);
      }
    });

    if ((addedSlots.length || reusedSlots.length) && !errors.length) {
      setValidation(config, "success", "导入完成：新版本已建模板，重复版本仅追加队列槽位");
      if (typeof showToast === "function") showToast(`已新增 ${addedSlots.length} 个模板，追加 ${reusedSlots.length} 个队列槽位`);
    } else if (addedSlots.length || reusedSlots.length) {
      setValidation(config, "warning", errors[errors.length - 1]);
      if (typeof showToast === "function") showToast(`已新增 ${addedSlots.length} 个模板，追加 ${reusedSlots.length} 个队列槽位，部分失败`);
    } else if (errors.length) {
      setValidation(config, "error", errors[errors.length - 1]);
      if (typeof showToast === "function") showToast(errors[errors.length - 1]);
    }

    rerender();
  };

  const removePackage = (ecu, slotId, rerender) => {
    const config = ensureStrategyConfig(ecu);
    const index = config.queueSlots.findIndex((item) => item.id === slotId);
    if (index === -1) return;
    const slot = config.queueSlots[index];
    if (index === 0 && slot.ref === "main") {
      setValidation(config, "warning", "排序第一个的主包不可移除");
      if (typeof showToast === "function") showToast("排序第一个的主包不可移除");
      rerender();
      return;
    }
    config.queueSlots.splice(index, 1);
    if (!config.queueSlots.length) {
      config.queueSlots.push(createQueueSlot("main", { repeatCount: 1, intervalSec: "" }));
    }
    setValidation(config, "success", "刷写包已移除，序号与链路已重排");
    rerender();
  };

  const movePackage = (ecu, slotId, direction, rerender) => {
    const config = ensureStrategyConfig(ecu);
    const index = config.queueSlots.findIndex((item) => item.id === slotId);
    if (index === -1) return;

    const targetIndex = (direction === "left" || direction === "up") ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= config.queueSlots.length) return;

    const [item] = config.queueSlots.splice(index, 1);
    config.queueSlots.splice(targetIndex, 0, item);
    setValidation(config, "success", "刷写包顺序已调整");
    rerender();
  };

  const duplicatePackage = (ecu, slotId, rerender) => {
    const config = ensureStrategyConfig(ecu);
    const duplicated = duplicateQueueSlot(config, slotId);
    if (!duplicated) return;
    setValidation(config, "success", "已再次添加到队列末尾");
    if (typeof showToast === "function") showToast("已再次添加到队列");
    rerender();
  };

  const updatePackageField = (ecu, slotId, field, value) => {
    const config = ensureStrategyConfig(ecu);
    const target = config.queueSlots.find((item) => item.id === slotId);
    if (!target) return;
    if (field === "repeatCount") {
      target.repeatCount = value;
    } else if (field === "intervalSec") {
      target.intervalSec = value;
    }
  };

  const confirmStrategy = (ecu) => {
    const config = ensureStrategyConfig(ecu);
    const packages = getPackages(config);

    if (config.flowMode === "tb2") {
      if (!config.tb2Flow.tb2File) {
        const message = "自选流程缺少文件";
        setValidation(config, "error", message);
        logMessage(message, "error");
        if (typeof showToast === "function") showToast(message);
        return false;
      }
    }

    config.totalLoopCount = String(clamp(config.totalLoopCount, 1, 1000, 1));
    config.queueSlots.forEach((item) => {
      item.repeatCount = String(clamp(item.repeatCount, 1, 1000, 1));
      if (item.intervalSec !== "") {
        item.intervalSec = String(clamp(item.intervalSec, 0, 6000, 0));
      }
    });

    const modeLabel = config.flowMode === "default" ? "默认刷写流程" : "自选流程";
    logMessage(`刷写策略确认开始：ECU ${ecu.shortName}`);
    logMessage(`诊断流程模式：${modeLabel}`);
    logMessage(`诊断流程文件：${config.flowMode === "default" ? config.defaultFlow : config.tb2Flow.tb2File}`);
    logMessage(`刷写包数量：${packages.length}，总次数：${config.totalLoopCount}`);
    logMessage("刷写策略确认成功");
    setValidation(config, "success", "刷写策略已确认，执行日志已写入系统消息");
    if (typeof showToast === "function") showToast("刷写策略已确认");
    return true;
  };

  /* ── 模块导出 ── */

  window.FlashConfigEcuStrategyModule = {
    getPackagesForEcu(ecu) {
      const config = ensureStrategyConfig(ecu);
      return getPackages(config).map((pkg) => ({
        order: pkg.order,
        key: `${ecu.id}-slot-${pkg.id || pkg.order}`,
        name: pkg.name || "--",
        type: toDisplayPackageType(pkg),
        gbfVersion: pkg.gbfVersion || "--",
        hardwareVersion: pkg.hardwareVersion || "--",
        softwareVersion: pkg.softwareVersion || "--",
        baselineVersion: pkg.baselineVersion || "--",
        sizeMb: pkg.sizeMb || "--",
        repeatCount: String(Math.max(1, Number(pkg.repeatCount) || 1)),
        intervalSec: pkg.intervalSec ?? "",
      }));
    },

    checkEcuHasFlowFile(ecu) {
      const config = ensureStrategyConfig(ecu);
      if (config.flowMode === "default") {
        return !!getFlowFileName(ecu, config.defaultFlow);
      }
      if (config.flowMode === "tb2") {
        return !!config.tb2Flow.tb2File;
      }
      return false;
    },

    render({ ecu, esc, buses }) {
      return renderBody({ ecu, esc, buses });
    },

    cloneConfig(ecu) {
      return cloneData(ensureStrategyConfig(ecu));
    },

    applyConfig(ecu, config) {
      ecu.strategyConfig = cloneData(config);
      syncCurrentPackage(ecu, ecu.strategyConfig);
    },

    renderDiagnosticFlowSection({ ecu, esc, editing = true, config = null, embedded = false }) {
    const flowConfig = config || ensureStrategyConfig(ecu);
      return `${renderDiagnosticFlowPanel(ecu, flowConfig, esc, { editing, embedded })}${renderDiagnosticFlowInputs()}`;
    },

    bindDiagnosticFlowSection({ root, ecu, config, rerender, editable }) {
      bindDiagnosticFlowSection({ root, ecu, config, rerender, editable });
    },

    bind({ root, ecu, rerender, buses }) {
      const config = ensureStrategyConfig(ecu);
      startLoading(ecu, rerender);

      root.querySelectorAll('[data-role="strategy-import-local"]').forEach((element) => {
        element.addEventListener("click", () => {
          root.querySelector('[data-role="strategy-gbf-input"]')?.click();
        });
      });

      root.querySelector('[data-role="strategy-import-cloud"]')?.addEventListener("click", () => {
        const packageData = createCloudPackage(ecu, config);
        const added = addTemplateIfMissing(config, packageData);
        appendQueueSlot(config, added.ref, { repeatCount: 1, intervalSec: "" });
        setValidation(config, "success", "云端包已加入模板库并追加队列槽位");
        if (typeof showToast === "function") showToast("已从云端添加刷写包");
        rerender();
      });

      root.querySelector('[data-role="strategy-gbf-input"]')?.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        importPackages(files, ecu, rerender);
        event.target.value = "";
      });

      bindDiagnosticFlowSection({ root, ecu, config, rerender, editable: true });

      root.querySelectorAll('[data-role="remove-strategy-package"]').forEach((element) => {
        element.addEventListener("click", () => {
          removePackage(ecu, element.dataset.slotId, rerender);
        });
      });

      root.querySelectorAll('[data-role="move-strategy-package"]').forEach((element) => {
        element.addEventListener("click", () => {
          movePackage(ecu, element.dataset.slotId, element.dataset.dir, rerender);
        });
      });

      root.querySelectorAll('[data-role="duplicate-strategy-package"]').forEach((element) => {
        element.addEventListener("click", () => {
          duplicatePackage(ecu, element.dataset.slotId, rerender);
        });
      });

      root.querySelectorAll('[data-role="strategy-package-field"]').forEach((element) => {
        const sync = () => {
          updatePackageField(ecu, element.dataset.slotId, element.dataset.field, element.value);
          rerender();
        };
        element.addEventListener("change", sync);
      });

      root.querySelector('[data-role="strategy-total-loop"]')?.addEventListener("change", (event) => {
        config.totalLoopCount = event.target.value;
        rerender();
      });

    },
  };
})();
