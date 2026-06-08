/**
 * quick-diag.js - 快捷诊断页面
 *
 * 方案B精装交互版：
 * - 左侧：总线/ECU 树（复用 busConfig，带复选框）
 * - 右侧顶部：整车读码 / 整车版本 / 整车清码 / 执行 快捷按钮
 * - 右侧下方左：功能配置列表（支持高级文件导入、精美表单添加功能）
 * - 右侧下方右：报文区域
 * - 高级交互：内嵌现代化弹窗（Modal），带微交互上传进度动画与实时预览。
 */
;(function () {
  "use strict";

  let root = document.getElementById("quick-diag-root");
  if (!root) {
    document.addEventListener("DOMContentLoaded", () => {
      root = document.getElementById("quick-diag-root");
      if (root) start();
    });
    return;
  }

  start();

  function start() {

  /* ============================
     Bus/ECU 数据源（复用控制台 busConfig）
     ============================ */
  let cachedBusConfig = null;
  function getBusConfig() {
    if (window.ConsoleBusConfig) return window.ConsoleBusConfig;
    if (!cachedBusConfig) {
      cachedBusConfig = [
        {
          id: "can1", name: "CAN1", type: "can", busType: "CAN",
          baudrate: "500Kbps",
          children: [
            { id: "can1-ecu1", name: "ECM", type: "ecu", requestAddr: "0618" },
            { id: "can1-ecu2", name: "TCU", type: "ecu", requestAddr: "0641" },
            { id: "can1-ecu3", name: "ABS", type: "ecu", requestAddr: "0760" },
            { id: "can1-ecu4", name: "BCM", type: "ecu", requestAddr: "0740" },
            { id: "can1-ecu5", name: "SRS", type: "ecu", requestAddr: "0750" },
          ],
        },
        {
          id: "eth1", name: "Ethernet1", type: "ethernet", busType: "Ethernet",
          baudrate: "100Mbps",
          children: [
            { id: "eth1-ecu1", name: "GW", type: "ecu", logicAddr: "0x1010" },
            { id: "eth1-ecu2", name: "IVI", type: "ecu", logicAddr: "0x2010" },
            { id: "eth1-ecu3", name: "TBOX", type: "ecu", logicAddr: "0x3010" },
            { id: "eth1-ecu4", name: "ADAS", type: "ecu", logicAddr: "0x4010" },
          ],
        },
      ];
    }
    return cachedBusConfig;
  }

  /* ============================
     云端配置 - 默认功能列表
     ============================ */
  const DEFAULT_FUNCTIONS = [
    {
      id: "config-write",
      name: "配置字写入",
      icon: "fa-solid fa-pen-to-square",
      iconStyle: "config",
      description: "向勾选ECU批量写入配置字数据",
      source: "cloud",
    },
    {
      id: "secoc-write",
      name: "SecOC写入",
      icon: "fa-solid fa-shield-halved",
      iconStyle: "secoc",
      description: "执行SecOC安全认证密钥写入流程",
      source: "cloud",
    },
    {
      id: "immo-match",
      name: "防盗匹配",
      icon: "fa-solid fa-key",
      iconStyle: "immo",
      description: "IMMO防盗系统钥匙学习与匹配",
      source: "cloud",
    },
    {
      id: "obd-cert",
      name: "OBD认证",
      icon: "fa-solid fa-certificate",
      iconStyle: "obd",
      description: "OBD排放认证诊断序列执行",
      source: "cloud",
    },
    {
      id: "enhanced-reset",
      name: "增强诊断重置",
      icon: "fa-solid fa-rotate-right",
      iconStyle: "reset",
      description: "扩展会话下执行增强诊断重置流程",
      source: "cloud",
    },
    {
      id: "fill-config",
      name: "灌装等功能配置",
      icon: "fa-solid fa-fill-drip",
      iconStyle: "fill",
      description: "冷媒灌装/油液灌装等生产功能配置",
      source: "cloud",
    },
    {
      id: "tls-flow",
      name: "TLS流程",
      icon: "fa-solid fa-lock",
      iconStyle: "tls",
      description: "TLS安全传输层握手与证书交换流程",
      source: "cloud",
    },
  ];

  /* ============================
     Page State
     ============================ */
  const state = {
    treeCollapsed: false,
    expandedBusIds: ["can1", "eth1"],
    // ECU选中状态（复选框）
    checkedEcuIds: new Set(["can1-ecu1", "can1-ecu2", "can1-ecu4", "eth1-ecu1", "eth1-ecu2"]),
    // 功能列表（可动态增加）
    functions: [...DEFAULT_FUNCTIONS],
    // 选中高亮的功能
    selectedFuncId: null,
    // 报文日志
    msgLogs: [],
    msgSeq: 0,

    // 新增模态框内部选择状态
    newFuncIconStyle: "config",
  };

  // 模态框 DOM 引用
  let importModalEl = null;
  let addModalEl = null;

  /* ============================
     Helpers
     ============================ */
  function esc(val) {
    return String(val ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function getIconClass(type) {
    const map = {
      can: "fa-solid fa-road",
      canfd: "fa-solid fa-road",
      ethernet: "fa-solid fa-network-wired",
      lin: "fa-solid fa-link",
      ecu: "fa-solid fa-microchip",
    };
    return map[type] || "fa-solid fa-microchip";
  }

  function isBusAllChecked(bus) {
    return (bus.children || []).every(e => state.checkedEcuIds.has(e.id));
  }
  function isBusPartialChecked(bus) {
    const children = bus.children || [];
    const cnt = children.filter(e => state.checkedEcuIds.has(e.id)).length;
    return cnt > 0 && cnt < children.length;
  }

  function now() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
  }

  /* ============================
     Render: ECU 树
     ============================ */
  function renderTree() {
    const buses = getBusConfig();
    const getEcuDisplayLabel = (ecu, bus) => {
      const isEth = bus && (bus.type === "ethernet" || bus.id === "eth1");
      const rawAddr = isEth ? ecu.logicAddr : (ecu.requestAddr || ecu.nadAddr);
      if (!rawAddr) return ecu.name;
      let addr = String(rawAddr).trim();
      if (!addr.toLowerCase().startsWith("0x")) {
        addr = "0x" + addr;
      }
      return `${ecu.name} (${addr})`;
    };

    return `
      <aside class="quick-diag-left">
        <div class="quick-diag-tree-toolbar">
          <button class="quick-diag-tree-toolbar__import" data-role="qd-import-pdx" title="导入PDX">
            <i class="fa-solid fa-file-arrow-up"></i>
            <span>导入PDX</span>
          </button>
        </div>
        <div class="quick-diag-tree">
          ${buses.map(bus => {
            const expanded = state.expandedBusIds.includes(bus.id);
            const allChecked = isBusAllChecked(bus);
            const partial = isBusPartialChecked(bus);
            return `
              <div class="quick-diag-tree-group">
                <div class="quick-diag-tree-node">
                  <button class="quick-diag-tree-toggle" data-role="qd-toggle-bus" data-bus-id="${esc(bus.id)}">
                    ${expanded ? "−" : "+"}
                  </button>
                  <input type="checkbox" class="quick-diag-tree-check"
                    data-role="qd-check-bus" data-bus-id="${esc(bus.id)}"
                    ${allChecked ? "checked" : ""}
                    ${partial && !allChecked ? 'data-indeterminate="true"' : ""} />
                  <span class="quick-diag-tree-label" data-role="qd-click-bus" data-bus-id="${esc(bus.id)}">
                    <i class="${getIconClass(bus.type)}"></i>
                    <span>${esc(bus.name)}</span>
                    <span class="quick-diag-tree-label__baud">${esc(bus.baudrate || "")}</span>
                  </span>
                </div>
                <div class="quick-diag-tree-children ${expanded ? "" : "is-collapsed"}">
                  ${(bus.children || []).map(ecu => {
                    const checked = state.checkedEcuIds.has(ecu.id);
                    return `
                      <div class="quick-diag-tree-child">
                        <input type="checkbox" class="quick-diag-tree-check"
                          data-role="qd-check-ecu" data-bus-id="${esc(bus.id)}" data-ecu-id="${esc(ecu.id)}"
                          ${checked ? "checked" : ""} />
                        <i class="${getIconClass(ecu.type)}"></i>
                        <span>${esc(getEcuDisplayLabel(ecu, bus))}</span>
                      </div>`;
                  }).join("")}
                </div>
              </div>`;
          }).join("")}
        </div>
        <button class="quick-diag-toggle-pane" data-role="qd-toggle-pane" title="${state.treeCollapsed ? "展开列表" : "收起列表"}">
          <i class="fa-solid ${state.treeCollapsed ? "fa-chevron-right" : "fa-chevron-left"}"></i>
        </button>
      </aside>`;
  }

  /* ============================
     Render: 顶部快捷按钮栏
     ============================ */
  function renderTopbar() {
    return `
      <div class="quick-diag-topbar">
        <span class="quick-diag-topbar__label">
          <i class="fa-solid fa-bolt" style="color:#e6a23c;margin-right:3px;"></i>快捷操作
        </span>
        <div class="quick-diag-topbar__center">
          <button class="quick-diag-topbar__btn quick-diag-topbar__btn--read" data-role="qd-action" data-action="vehicle-dtc-read">
            <i class="fa-solid fa-magnifying-glass"></i>整车读码
          </button>
          <button class="quick-diag-topbar__btn quick-diag-topbar__btn--version" data-role="qd-action" data-action="vehicle-version">
            <i class="fa-solid fa-clipboard-list"></i>整车版本
          </button>
          <button class="quick-diag-topbar__btn quick-diag-topbar__btn--clear" data-role="qd-action" data-action="vehicle-clear-dtc">
            <i class="fa-solid fa-eraser"></i>整车清码
          </button>
        </div>
        <button class="quick-diag-topbar__btn quick-diag-topbar__btn--exec" data-role="qd-exec">
          <i class="fa-solid fa-play"></i>执行
        </button>
      </div>`;
  }

  /* ============================
     Render: 功能列表面板
     ============================ */
  function renderFuncPanel() {
    return `
      <div class="quick-diag-func-panel">
        <div class="quick-diag-func-header">
          <span class="quick-diag-func-header__title">
            <i class="fa-solid fa-list-check"></i>功能配置列表
          </span>
          <div class="quick-diag-func-header__actions">
            <button class="quick-diag-func-header__btn" data-role="qd-open-add-modal">
              <i class="fa-solid fa-plus"></i>添加功能
            </button>
          </div>
        </div>
        <div class="quick-diag-func-scroll">
          <div class="quick-diag-func-list">
            ${state.functions.map(func => {
              const selected = state.selectedFuncId === func.id;
              const isCustom = func.source === "local";
              return `
                <div class="quick-diag-func-item ${selected ? "is-selected" : ""}"
                  data-role="qd-func-click" data-func-id="${esc(func.id)}">
                  <div class="quick-diag-func-item__icon quick-diag-func-item__icon--${esc(func.iconStyle)}">
                    <i class="${esc(func.icon)}"></i>
                  </div>
                  <div class="quick-diag-func-item__info">
                    <div class="quick-diag-func-item__name">${esc(func.name)}</div>
                    <div class="quick-diag-func-item__desc">${esc(func.description)}</div>
                  </div>
                  ${isCustom ? `<button class="quick-diag-func-item__del" data-role="qd-del-func" data-func-id="${esc(func.id)}" title="移除">
                    <i class="fa-solid fa-xmark"></i>
                  </button>` : ""}
                </div>`;
            }).join("")}
          </div>
        </div>
      </div>`;
  }

  /* ============================
     Render: 报文区域面板
     ============================ */
  function renderMsgPanel() {
    const hasLogs = state.msgLogs.length > 0;
    return `
      <div class="quick-diag-msg-panel">
        <div class="quick-diag-msg-header">
          <span class="quick-diag-msg-header__title">
            <i class="fa-solid fa-terminal"></i>报文区域
          </span>
          <div class="quick-diag-msg-header__actions">
            <button class="quick-diag-msg-header__btn" data-role="qd-msg-clear">
              <i class="fa-solid fa-eraser"></i>清空
            </button>
          </div>
        </div>
        <div class="quick-diag-msg-body">
          ${hasLogs ? `
            <table class="quick-diag-msg-table">
              <thead>
                <tr>
                  <th style="width:40px;">#</th>
                  <th style="width:90px;">时间</th>
                  <th style="width:50px;">方向</th>
                  <th style="width:60px;">ECU</th>
                  <th>数据</th>
                </tr>
              </thead>
              <tbody>
                ${state.msgLogs.map(log => `
                  <tr class="${log.dir === "TX" ? "is-tx" : log.dir === "ERR" ? "is-err" : "is-rx"}">
                    <td>${log.seq}</td>
                    <td>${esc(log.time)}</td>
                    <td>${esc(log.dir)}</td>
                    <td>${esc(log.ecu)}</td>
                    <td>${esc(log.data)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `
            <div class="quick-diag-msg-empty">
              <i class="fa-solid fa-inbox"></i>
              <span>执行操作后，报文将显示在这里</span>
            </div>
          `}
        </div>
      </div>`;
  }

  /* ============================
     模态框(Modal)一次性挂载及交互初始化
     ============================ */
  function initModalsOnce() {
    if (document.getElementById("qd-add-modal")) return;

    // 2. 添加 Modal (支持双文件导入)
    addModalEl = document.createElement("div");
    addModalEl.id = "qd-add-modal";
    addModalEl.className = "qd-modal";
    addModalEl.innerHTML = `
      <div class="qd-modal-overlay" data-role="qd-close-add-modal"></div>
      <div class="qd-modal-container">
        <div class="qd-modal-header">
          <span class="qd-modal-title"><i class="fa-solid fa-plus"></i> 新建快捷诊断功能</span>
          <button class="qd-modal-close" data-role="qd-close-add-modal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="qd-modal-body">
          <!-- 1. .tb2 File Picker (Required) -->
          <div class="qd-form-group">
            <label class="qd-form-label">导入 .tb2 流程文件 <span style="color:#d9534f">*</span></label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="qd-btn qd-btn--secondary" type="button" id="qd-add-tb2-picker" style="height: 30px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; cursor: pointer;">
                <i class="fa-solid fa-file-import"></i> 选择 .tb2 文件
              </button>
              <span id="qd-add-tb2-label" style="font-size: 12px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">未选择文件</span>
              <input type="file" accept=".tb2" id="qd-add-tb2-hidden" style="display: none;" />
            </div>
          </div>

          <!-- 2. -j File Picker (Optional) -->
          <div class="qd-form-group" style="margin-top: 14px;">
            <label class="qd-form-label">导入 -j 配置文件 <span style="font-weight: normal; color: #64748b; font-size: 11px;">(可选)</span></label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="qd-btn qd-btn--secondary" type="button" id="qd-add-j-picker" style="height: 30px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; cursor: pointer;">
                <i class="fa-solid fa-file-import"></i> 选择 -j 文件
              </button>
              <span id="qd-add-j-label" style="font-size: 12px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">未选择文件</span>
              <input type="file" accept=".json,.j" id="qd-add-j-hidden" style="display: none;" />
            </div>
            <div style="font-size: 11px; color: #eab308; margin-top: 5px; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-circle-info"></i>
              <span>备注：导入后则以 -j 中 ECU 为准</span>
            </div>
          </div>
          
          <!-- 3. Function Name (Required) -->
          <div class="qd-form-group" style="margin-top: 16px;">
            <label class="qd-form-label">功能名称 <span style="color:#d9534f">*</span></label>
            <input type="text" class="qd-form-input" id="qd-add-name-input" placeholder="请输入功能名称，导入 .tb2 后默认填充为文件名" />
          </div>
        </div>
        <div class="qd-modal-footer">
          <button class="qd-btn qd-btn--secondary" data-role="qd-close-add-modal">取消</button>
          <button class="qd-btn qd-btn--primary" id="qd-confirm-add-btn">
            <i class="fa-solid fa-plus"></i> 确认创建
          </button>
        </div>
      </div>`;
    root.appendChild(addModalEl);

    // 绑定模态框交互事件
    initModalEvents();
  }

  function initModalEvents() {
    // === 添加 Modal 交互 ===
    const addNameInput = document.getElementById("qd-add-name-input");
    const confirmAddBtn = document.getElementById("qd-confirm-add-btn");
    
    // .tb2 文件选择绑定
    const tb2PickerBtn = document.getElementById("qd-add-tb2-picker");
    const hiddenTb2Input = document.getElementById("qd-add-tb2-hidden");
    const tb2Label = document.getElementById("qd-add-tb2-label");

    // -j 文件选择绑定
    const jPickerBtn = document.getElementById("qd-add-j-picker");
    const hiddenJInput = document.getElementById("qd-add-j-hidden");
    const jLabel = document.getElementById("qd-add-j-label");

    // .tb2 点击与变更
    tb2PickerBtn.addEventListener("click", () => {
      hiddenTb2Input.click();
    });

    hiddenTb2Input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const filename = file.name;
      tb2Label.textContent = filename;
      
      // 提取文件名作为默认功能名称
      const basename = filename.replace(/\.[^.]+$/, "");
      addNameInput.value = basename;

      if (window.showToast) {
        window.showToast(`流程文件已加载: ${filename}`);
      }
    });

    // -j 点击与变更
    jPickerBtn.addEventListener("click", () => {
      hiddenJInput.click();
    });

    hiddenJInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const filename = file.name;
      jLabel.textContent = filename;

      if (window.showToast) {
        window.showToast(`已加载可选 -j 配置文件，执行时将以其 ECU 为准`);
      }
    });

    confirmAddBtn.addEventListener("click", () => {
      const tb2File = hiddenTb2Input.files[0];
      const jFile = hiddenJInput.files[0];
      const name = addNameInput.value.trim();

      if (!tb2File) {
        alert("请先导入 .tb2 流程文件");
        return;
      }
      if (!name) {
        alert("请输入功能名称");
        addNameInput.focus();
        return;
      }

      // 构建描述文案
      let desc = `流程文件: ${tb2File.name}`;
      if (jFile) {
        desc += ` | ECU配置以 -j [${jFile.name}] 为准`;
      }

      const newId = "custom-" + Date.now();
      state.functions.push({
        id: newId,
        name: name,
        icon: "fa-solid fa-code-branch", // 流程分支图标
        iconStyle: "config", // 品牌经典蓝色调
        description: desc,
        source: "local",
      });

      // 重置弹框所有状态
      addNameInput.value = "";
      tb2Label.textContent = "未选择文件";
      jLabel.textContent = "未选择文件";
      hiddenTb2Input.value = "";
      hiddenJInput.value = "";

      addModalEl.classList.remove("is-open");
      render();
    });
  }

  /* ============================
     Main Render
     ============================ */
  function render() {
    // 仅更新 Shell DOM，不重绘独立的 Modals，以保留 Modals 内的输入状态与焦点
    const shellEl = root.querySelector(".quick-diag-shell");
    const shellHTML = `
      <div class="quick-diag-shell ${state.treeCollapsed ? "is-tree-collapsed" : ""}">
        ${renderTree()}
        <div class="quick-diag-right">
          ${renderTopbar()}
          <div class="quick-diag-content">
            ${renderFuncPanel()}
            ${renderMsgPanel()}
          </div>
        </div>
      </div>`;

    if (!shellEl) {
      root.innerHTML = shellHTML;
    } else {
      // 优雅置换 shell 的 outerHTML，保持 Modals 并存
      shellEl.outerHTML = shellHTML;
    }

    // 确保 Modals 已经创建
    initModalsOnce();

    // 处理 indeterminate 状态
    root.querySelectorAll('[data-indeterminate="true"]').forEach(cb => {
      cb.indeterminate = true;
    });
  }

  /* ============================
     模拟报文日志
     ============================ */
  function addMsgLog(dir, ecu, data) {
    state.msgSeq++;
    state.msgLogs.push({ seq: state.msgSeq, time: now(), dir, ecu, data });
  }

  function simulateAction(actionName, ecuIds) {
    const buses = getBusConfig();
    ecuIds.forEach(ecuId => {
      let ecuName = ecuId;
      buses.forEach(bus => {
        const found = (bus.children || []).find(e => e.id === ecuId);
        if (found) ecuName = found.name;
      });
      addMsgLog("TX", ecuName, `[${actionName}] 请求发送`);
      addMsgLog("RX", ecuName, `[${actionName}] 正响应`);
    });
    render();
  }

  /* ============================
     Event Handling
     ============================ */
  root.addEventListener("click", (e) => {
    const target = e.target.closest("[data-role]");
    if (!target) return;
    const role = target.dataset.role;

    switch (role) {
      // -- 导入 PDX 弹窗 --
      case "qd-import-pdx": {
        let backdrop = document.getElementById('pdx-import-modal-backdrop-el');
        if (backdrop) backdrop.remove();

        backdrop = document.createElement('div');
        backdrop.className = 'pdx-import-modal-backdrop';
        backdrop.id = 'pdx-import-modal-backdrop-el';
        backdrop.innerHTML = `
          <div class="pdx-import-card">
            <div class="pdx-import-header">
              <span class="pdx-import-title">导入PDX</span>
              <button type="button" class="pdx-import-close-x" id="pdx-import-close-btn">&times;</button>
            </div>
            <div class="pdx-import-body">
              <div class="pdx-import-section">
                <div class="pdx-import-section-header">
                  <span class="pdx-import-section-title">PDX文件</span>
                  <button type="button" class="pdx-import-btn-choose" id="pdx-import-btn-select-pdx">选择PDX</button>
                </div>
                <div class="pdx-import-tip-banner">
                  点击“选择PDX”会自动导入一组 mock PDX 数据，并异步生成 PTS。
                </div>
                <table class="pdx-import-table">
                  <thead>
                    <tr>
                      <th style="width: 45%;">PDX文件</th>
                      <th style="width: 30%;">提交时间</th>
                      <th style="width: 25%;">状态</th>
                    </tr>
                  </thead>
                  <tbody id="pdx-import-pdx-tbody">
                    <tr>
                      <td colspan="3" class="pdx-import-table-empty" id="pdx-empty-row">暂无导入记录</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="pdx-import-section">
                <div class="pdx-import-section-header">
                  <span class="pdx-import-section-title">PTS文件</span>
                </div>
                <table class="pdx-import-table">
                  <thead>
                    <tr>
                      <th style="width: 45%;">PTS文件</th>
                      <th style="width: 30%;">返回时间</th>
                      <th style="width: 25%;">结果</th>
                    </tr>
                  </thead>
                  <tbody id="pdx-import-pts-tbody">
                    <tr>
                      <td colspan="3" class="pdx-import-table-empty" id="pts-empty-row">云端返回的 PTS 文件会显示在这里</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <input type="file" id="pdx-hidden-file-input" accept=".pdx" style="display:none;" />
        `;

        document.body.appendChild(backdrop);
        setTimeout(() => backdrop.classList.add('is-active'), 50);

        const closeBtn = backdrop.querySelector('#pdx-import-close-btn');
        const btnSelect = backdrop.querySelector('#pdx-import-btn-select-pdx');
        const hiddenInput = backdrop.querySelector('#pdx-hidden-file-input');

        const closeModal = () => {
          backdrop.classList.remove('is-active');
          setTimeout(() => backdrop.remove(), 250);
        };

        closeBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (ev) => {
          if (ev.target === backdrop) closeModal();
        });

        btnSelect.addEventListener('click', () => {
          hiddenInput.click();
        });

        hiddenInput.addEventListener('change', (ev) => {
          const file = ev.target.files[0];
          if (!file) return;

          const pdxFileName = file.name;
          const ptsFileName = pdxFileName.replace(/\.[^/.]+$/, "") + ".pts";

          const nowTime = new Date();
          const timeStr = `${nowTime.getFullYear()}-${String(nowTime.getMonth() + 1).padStart(2, '0')}-${String(nowTime.getDate()).padStart(2, '0')} ${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}:${String(nowTime.getSeconds()).padStart(2, '0')}`;

          const pdxTbody = backdrop.querySelector('#pdx-import-pdx-tbody');
          pdxTbody.innerHTML = `
            <tr>
              <td style="font-weight: 600; font-family: Consolas, monospace;"><i class="fa-regular fa-file-code" style="color: #2f6bff; margin-right: 6px;"></i>${pdxFileName}</td>
              <td style="color: #4a5568;">${timeStr}</td>
              <td id="pdx-cell-status">
                <span class="pdx-status-badge is-pending">
                  <i class="fa-solid fa-spinner fa-spin"></i> 正在导入...
                </span>
              </td>
            </tr>
          `;

          if (typeof showToast === "function") {
            showToast(`已读取 PDX [${pdxFileName}]，正在上传并异步转化 PTS 诊断协议...`);
          }

          setTimeout(() => {
            const statusCell = backdrop.querySelector('#pdx-cell-status');
            if (statusCell) {
              statusCell.innerHTML = `
                <span class="pdx-status-badge is-success">
                  <i class="fa-solid fa-circle-check"></i> 导入成功
                </span>
              `;
            }

            const ptsTbody = backdrop.querySelector('#pdx-import-pts-tbody');
            const ptsNow = new Date();
            const ptsTimeStr = `${ptsNow.getFullYear()}-${String(ptsNow.getMonth() + 1).padStart(2, '0')}-${String(ptsNow.getDate()).padStart(2, '0')} ${String(ptsNow.getHours()).padStart(2, '0')}:${String(ptsNow.getMinutes()).padStart(2, '0')}:${String(ptsNow.getSeconds()).padStart(2, '0')}`;
            
            ptsTbody.innerHTML = `
              <tr>
                <td style="font-weight: 600; font-family: Consolas, monospace; color: #2d3748;"><i class="fa-solid fa-file-invoice" style="color: #38a169; margin-right: 6px;"></i>${ptsFileName}</td>
                <td style="color: #4a5568;">${ptsTimeStr}</td>
                <td>
                  <span class="pdx-status-badge is-success" style="font-weight: 600;">
                    <i class="fa-solid fa-square-poll-horizontal"></i> 成功 (生成快捷诊断云端服务 1 个, 12 个DTC)
                  </span>
                </td>
              </tr>
            `;

            // 导入成功后，给快捷诊断云端服务列表添加一个新的快捷诊断功能！
            const newFuncId = "pdx-scan-" + Date.now();
            state.functions.push({
              id: newFuncId,
              name: "PDX全车扫描校验",
              icon: "fa-solid fa-file-circle-check",
              iconStyle: "tls",
              description: `从 [${pdxFileName}] 提取的高保真整车PDX扫描校验流程`,
              source: "cloud",
            });
            state.selectedFuncId = newFuncId;
            render();

            if (typeof showToast === "function") {
              showToast(`快捷诊断 PTS 流程已成功生成并挂载！`);
            }
          }, 1500);
        });
        break;
      }

      // -- 树：展开/折叠 --
      case "qd-toggle-bus": {
        const busId = target.dataset.busId;
        const idx = state.expandedBusIds.indexOf(busId);
        if (idx >= 0) state.expandedBusIds.splice(idx, 1);
        else state.expandedBusIds.push(busId);
        render();
        break;
      }

      // -- 树：总线复选框 --
      case "qd-check-bus": {
        const busId = target.dataset.busId;
        const bus = getBusConfig().find(b => b.id === busId);
        if (!bus) break;
        const checked = target.checked;
        (bus.children || []).forEach(ecu => {
          if (checked) state.checkedEcuIds.add(ecu.id);
          else state.checkedEcuIds.delete(ecu.id);
        });
        render();
        break;
      }

      // -- 树：ECU复选框 --
      case "qd-check-ecu": {
        const ecuId = target.dataset.ecuId;
        if (target.checked) state.checkedEcuIds.add(ecuId);
        else state.checkedEcuIds.delete(ecuId);
        render();
        break;
      }

      // -- 树：点击总线文字 --
      case "qd-click-bus": {
        const busId = target.dataset.busId;
        const idx = state.expandedBusIds.indexOf(busId);
        if (idx >= 0) state.expandedBusIds.splice(idx, 1);
        else state.expandedBusIds.push(busId);
        render();
        break;
      }

      // -- 折叠/展开树面板 --
      case "qd-toggle-pane": {
        state.treeCollapsed = !state.treeCollapsed;
        render();
        break;
      }

      // -- 功能列表：点击条目（选中高亮） --
      case "qd-func-click": {
        const funcId = target.dataset.funcId;
        if (e.target.closest("[data-role='qd-del-func']")) break;
        state.selectedFuncId = state.selectedFuncId === funcId ? null : funcId;
        render();
        break;
      }

      // -- 打开添加弹窗 --
      case "qd-open-add-modal": {
        if (addModalEl) addModalEl.classList.add("is-open");
        break;
      }

      // -- 关闭添加弹窗 --
      case "qd-close-add-modal": {
        if (addModalEl) addModalEl.classList.remove("is-open");
        break;
      }

      // -- 删除功能 --
      case "qd-del-func": {
        e.stopPropagation();
        const funcId = target.dataset.funcId;
        state.functions = state.functions.filter(f => f.id !== funcId);
        if (state.selectedFuncId === funcId) state.selectedFuncId = null;
        render();
        break;
      }

      // -- 顶部快捷按钮（整车读码/版本/清码） --
      case "qd-action": {
        const action = target.dataset.action;
        const ecuIds = [...state.checkedEcuIds];
        if (ecuIds.length === 0) {
          alert("请先在左侧勾选需要诊断的ECU");
          return;
        }
        const actionNames = {
          "vehicle-dtc-read": "整车读码",
          "vehicle-version": "整车版本",
          "vehicle-clear-dtc": "整车清码",
        };
        simulateAction(actionNames[action] || action, ecuIds);
        break;
      }

      // -- 执行按钮 --
      case "qd-exec": {
        const ecuIds = [...state.checkedEcuIds];
        if (ecuIds.length === 0) {
          alert("请先在左侧勾选需要诊断的ECU");
          return;
        }
        if (!state.selectedFuncId) {
          alert("请先在功能列表中选择（高亮）要执行的功能");
          return;
        }
        const func = state.functions.find(f => f.id === state.selectedFuncId);
        if (func) simulateAction(func.name, ecuIds);
        break;
      }

      // -- 清空报文 --
      case "qd-msg-clear": {
        state.msgLogs = [];
        state.msgSeq = 0;
        render();
        break;
      }
    }
  });

  /* ============================
     Initial Render
     ============================ */
  render();

  } // end start()
})();
