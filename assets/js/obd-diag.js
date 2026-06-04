/**
 * obd-diag.js - OBD排放诊断界面交互逻辑
 *
 * 拟真诊断功能变体交互：
 * - 顶层主页签：OBD测试 / 数据回放 切换
 * - ECU芯片栏：8个芯片卡片支持多选/单选，点击“重新扫描”触发芯片流水灯扫描动画
 * - OBD子页签：支持 Mode 01 ~ 09 切换，数据精准展示
 * - Mode 01 (实时数据流)：提供13个PIDs，数值随定时器产生微小变化，渲染展开的Raw UDS HEX报文流
 * - Mode 02 (冻结帧)：展示发生故障瞬间的抓图数值
 * - Mode 03 (读取故障码)：显示确诊码与待确诊故障码
 * - Mode 04 (清除故障码)：提供精美的二次确认框及清除进度条动画
 * - Mode 09 (车辆信息)：读取车辆VIN码、校准ID及CVN号码
 * - 数据回放：加载历史OBD诊断数据包，支持进度条播放、暂停、进度微调
 */
;(function () {
  "use strict";

  let root = document.getElementById("obd-diag-root");
  if (!root) {
    document.addEventListener("DOMContentLoaded", () => {
      root = document.getElementById("obd-diag-root");
      if (root) start();
    });
    return;
  }

  start();

  function start() {
    // 确保与顶部全局VIN码同步
    const globalVin = (window.state && window.state.vin) || "LGW12345678901234";

    /* ======================================================
       1. 拟真诊断数据定义
       ====================================================== */
    
    // Mode 01 - 13个实时PIDs (按照截图葡萄牙语翻译而来)
    const initialMode01Pids = [
      { id: "pid-04", name: "PID: 04_计算负荷值", val: 35.4, unit: "%", tx: "7DF 02 01 04", rx: "7E8 03 41 04 5A" },
      { id: "pid-00", name: "PID: 00_请求车辆支持的PID (0x01 - 0x20)", val: "BE3E2A13", unit: "HEX", tx: "7DF 02 01 00", rx: "7E8 06 41 00 BE 3E 2A 13" },
      { id: "pid-01", name: "PID: 01_排放相关故障码数量及故障指示灯(MIL)状态", val: "MIL OFF, 0 DTCs", unit: "状态", tx: "7DF 02 01 01", rx: "7E8 06 41 01 00 07 E5 00" },
      { id: "pid-0b", name: "PID: 0B_进气歧管绝对压力", val: 98, unit: "kPa", tx: "7DF 02 01 0B", rx: "7E8 03 41 0B 62" },
      { id: "pid-0c", name: "PID: 0C_发动机转速", val: 750, unit: "rpm", tx: "7DF 02 01 0C", rx: "7E8 04 41 0C 0B B8" },
      { id: "pid-0d", name: "PID: 0D_车速传感器", val: 0, unit: "km/h", tx: "7DF 02 01 0D", rx: "7E8 03 41 0D 00" },
      { id: "pid-14", name: "PID: 14_氧传感器 气缸组1 - 传感器1", val: 0.455, unit: "V", tx: "7DF 02 01 14", rx: "7E8 04 41 14 5A 7F" },
      { id: "pid-15", name: "PID: 15_氧传感器 气缸组1 - 传感器2", val: 0.280, unit: "V", tx: "7DF 02 01 15", rx: "7E8 04 41 15 38 7F" },
      { id: "pid-16", name: "PID: 16_氧传感器 气缸组2 - 传感器1", val: 0.420, unit: "V", tx: "7DF 02 01 16", rx: "7E8 04 41 16 54 7F" },
      { id: "pid-17", name: "PID: 17_氧传感器 气缸组2 - 传感器2", val: 0.310, unit: "V", tx: "7DF 02 01 17", rx: "7E8 04 41 17 3E 7F" },
      { id: "pid-18", name: "PID: 18_氧传感器 气缸组3 - 传感器1", val: 0.440, unit: "V", tx: "7DF 02 01 18", rx: "7E8 04 41 18 58 7F" },
      { id: "pid-19", name: "PID: 19_氧传感器 气缸组3 - 传感器2", val: 0.295, unit: "V", tx: "7DF 02 01 19", rx: "7E8 04 41 19 3B 7F" },
      { id: "pid-1a", name: "PID: 1A_氧传感器 气缸组4 - 传感器1", val: 0.435, unit: "V", tx: "7DF 02 01 1A", rx: "7E8 04 41 1A 57 7F" }
    ];

    // Mode 02 - 冻结帧数据 (故障瞬间抓拍快照)
    const initialMode02Pids = [
      { id: "m2-02", name: "PID: 02_导致冻结帧的故障码 (DTC)", val: "P0171", unit: "DTC", tx: "7DF 02 02 02", rx: "7E8 04 42 02 01 71" },
      { id: "m2-04", name: "PID: 04_计算负荷值 (冻结帧)", val: 68.2, unit: "%", tx: "7DF 02 02 04", rx: "7E8 03 42 04 AE" },
      { id: "m2-05", name: "PID: 05_发动机冷却液温度", val: 95, unit: "℃", tx: "7DF 02 02 05", rx: "7E8 03 42 05 A5" },
      { id: "m2-0b", name: "PID: 0B_进气歧管绝对压力 (冻结帧)", val: 124, unit: "kPa", tx: "7DF 02 02 0B", rx: "7E8 03 42 0B 7C" },
      { id: "m2-0c", name: "PID: 0C_发动机转速 (冻结帧)", val: 2240, unit: "rpm", tx: "7DF 02 02 0C", rx: "7E8 04 42 0C 22 F0" },
      { id: "m2-0d", name: "PID: 0D_车速传感器 (冻结帧)", val: 65, unit: "km/h", tx: "7DF 02 02 0D", rx: "7E8 03 42 0D 41" }
    ];

    // Mode 03/07/0A - 排放故障码
    let mode03Dtcs = [
      { code: "P0171", desc: "气缸组1混合气过稀 (System Too Lean Bank 1)", type: "确诊故障码 (Confirmed)", mil: "亮起 (ON)", count: "1", tx: "7DF 02 03", rx: "7E8 04 43 01 01 71" },
      { code: "P0300", desc: "随机/多个气缸检测到失火 (Random/Multiple Cylinder Misfire Detected)", type: "暂存故障码 (Pending)", mil: "未触发 (OFF)", count: "2", tx: "7DF 02 07", rx: "7E8 04 47 01 03 00" }
    ];

    // Mode 09 - 车辆信息
    const mode09Infos = [
      { id: "m9-02", name: "PID: 02_车辆识别代号 (VIN)", val: globalVin, unit: "文本", tx: "7DF 02 09 02", rx: "7E8 14 49 02 01 " + asciiToHex(globalVin) },
      { id: "m9-04", name: "PID: 04_校准标识 (Calibration ID)", val: "GW4N20-E02-710", unit: "文本", tx: "7DF 02 09 04", rx: "7E8 12 49 04 01 47 57 34 4E 32 30 2D 45 30 32 2D 37 31 30" },
      { id: "m9-06", name: "PID: 06_校准验证号 (CVN)", val: "8F3A2E7D", unit: "HEX", tx: "7DF 02 09 06", rx: "7E8 06 49 06 8F 3A 2E 7D" }
    ];

    // 历史诊断日志数据包
    const playbackRecords = [
      { id: "rec-1", name: "OBD_Emission_Log_20260530_01.dat", date: "2026-05-30 14:22", size: "142 KB", duration: "12s" },
      { id: "rec-2", name: "OBD_Emission_Log_20260531_02.dat", date: "2026-05-31 09:15", size: "86 KB", duration: "8s" }
    ];

    const playbackDataPoints = {
      "rec-1": [
        { time: "00:01", pid: "PID: 0C_发动机转速", val: "752 rpm", status: "正常" },
        { time: "00:02", pid: "PID: 04_计算负荷值", val: "34.8 %", status: "正常" },
        { time: "00:03", pid: "PID: 0B_进气压力", val: "97.8 kPa", status: "正常" },
        { time: "00:04", pid: "PID: 0C_发动机转速", val: "1204 rpm", status: "加速" },
        { time: "00:05", pid: "PID: 04_计算负荷值", val: "54.2 %", status: "正常" },
        { time: "00:06", pid: "PID: 0D_车速传感器", val: "12 km/h", status: "加速" },
        { time: "00:07", pid: "PID: 0C_发动机转速", val: "1860 rpm", status: "正常" },
        { time: "00:08", pid: "PID: 0D_车速传感器", val: "28 km/h", status: "正常" },
        { time: "00:09", pid: "PID: 0C_发动机转速", val: "2200 rpm", status: "正常" },
        { time: "00:10", pid: "PID: 04_计算负荷值", val: "68.2 %", status: "高负荷" },
        { time: "00:11", pid: "PID: 01_DTC故障码数量", val: "1 DTCs", status: "警告 (P0171)" },
        { time: "00:12", pid: "PID: 0C_发动机转速", val: "748 rpm", status: "怠速" }
      ],
      "rec-2": [
        { time: "00:01", pid: "PID: 0C_发动机转速", val: "0 rpm", status: "熄火" },
        { time: "00:02", pid: "PID: 05_水温温度", val: "42 ℃", status: "冷启动" },
        { time: "00:03", pid: "PID: 0C_发动机转速", val: "1150 rpm", status: "暖机" },
        { time: "00:04", pid: "PID: 0C_发动机转速", val: "820 rpm", status: "暖机" },
        { time: "00:05", pid: "PID: 05_水温温度", val: "68 ℃", status: "暖机" },
        { time: "00:06", pid: "PID: 0C_发动机转速", val: "752 rpm", status: "正常" },
        { time: "00:07", pid: "PID: 05_水温温度", val: "88 ℃", status: "正常" },
        { time: "00:08", pid: "PID: 01_DTC故障码数量", val: "0 DTCs", status: "无故障" }
      ]
    };

    /* ======================================================
       2. 组件状态 (State)
       ====================================================== */
    const state = {
      mainTab: "test", // test | playback
      selectedEcuId: "1", // 1 ~ 8
      activeMode: "01", // 01 | 02 | 03 | 04 | 09
      isPlayingStream: true, // 实时数据更新开关
      scanState: "idle", // idle | scanning | scanned
      readState: "idle", // idle | reading
      checkedPids: new Set(["pid-04", "pid-0b", "pid-0c", "pid-0d", "pid-14", "pid-15"]),
      expandedPids: new Set(),
      mode01Pids: JSON.parse(JSON.stringify(initialMode01Pids)),
      mode02Pids: JSON.parse(JSON.stringify(initialMode02Pids)),
      mode09Infos: JSON.parse(JSON.stringify(mode09Infos)),
      
      // 回放部分状态
      selectedPlaybackId: null,
      playbackState: "idle", // idle | playing | paused
      playbackIndex: 0,
      playbackInterval: null
    };

    /* ======================================================
       3. DOM 元素获取
       ====================================================== */
    const els = {
      mainTabs: root.querySelectorAll("[data-obd-main-tab]"),
      views: root.querySelectorAll(".obd-diag-view"),
      ecuBtns: root.querySelectorAll(".obd-ecu-btn"),
      btnScan: root.getElementById("obd-btn-scan"),
      btnRead: root.getElementById("obd-btn-read"),
      modeTabs: root.querySelectorAll("[data-obd-mode]"),
      tbody: root.getElementById("obd-table-tbody"),
      playToggle: root.getElementById("obd-table-play-toggle"),
      selectAll: root.getElementById("obd-table-select-all"),
      
      // 回放
      playbackList: root.getElementById("obd-playback-list"),
      playbackPlay: root.getElementById("obd-playback-play"),
      playbackPause: root.getElementById("obd-playback-pause"),
      playbackStop: root.getElementById("obd-playback-stop"),
      playbackTimeCurr: root.getElementById("obd-playback-time-curr"),
      playbackTimeTotal: root.getElementById("obd-playback-time-total"),
      playbackSliderFill: root.getElementById("obd-playback-slider-fill"),
      playbackEmpty: root.getElementById("obd-playback-empty"),
      playbackTableWrap: root.getElementById("obd-playback-table-wrap"),
      playbackTbody: root.getElementById("obd-playback-tbody"),
      btnExport: root.getElementById("obd-btn-export-obd")
    };

    /* ======================================================
       4. 定时数据流动态小幅抖动
       ====================================================== */
    let dataStreamTimer = setInterval(() => {
      if (!state.isPlayingStream || state.activeMode !== "01" || state.mainTab !== "test") return;

      state.mode01Pids.forEach((pid) => {
        if (pid.id === "pid-0c") { // 转速抖动 740~762
          const oldVal = pid.val;
          pid.val = Math.floor(740 + Math.random() * 22);
          flashCell(pid.id, pid.val);
        } else if (pid.id === "pid-04") { // 计算负荷值抖动
          pid.val = parseFloat((32.0 + Math.random() * 6).toFixed(1));
          flashCell(pid.id, pid.val);
        } else if (pid.id === "pid-0b") { // 进气压力抖动
          pid.val = Math.floor(96 + Math.random() * 4);
          flashCell(pid.id, pid.val);
        } else if (pid.id.startsWith("pid-1")) { // 氧传感器电压抖动
          pid.val = parseFloat((0.2 + Math.random() * 0.4).toFixed(3));
          flashCell(pid.id, pid.val);
        }
      });
    }, 1500);

    function flashCell(pidId, newVal) {
      const row = root.querySelector(`tr[data-pid-id="${pidId}"]`);
      if (!row) return;
      const valCell = row.querySelector(".obd-val-cell");
      if (valCell) {
        valCell.textContent = newVal;
        row.classList.add("is-updated");
        setTimeout(() => row.classList.remove("is-updated"), 800);
      }
    }

    /* ======================================================
       5. 界面渲染引擎
       ====================================================== */
    
    // 主渲染入口
    function render() {
      // 1. 渲染主表格 (OBD测试面板下)
      if (state.activeMode === "01") {
        renderTableRows(state.mode01Pids);
      } else if (state.activeMode === "02") {
        renderTableRows(state.mode02Pids);
      } else if (state.activeMode === "03") {
        renderDtcView();
      } else if (state.activeMode === "04") {
        renderClearView();
      } else if (state.activeMode === "09") {
        renderTableRows(state.mode09Infos);
      }
      
      // 更新表格控制按钮状态
      updateTableControls();
    }

    // 渲染常规PID表格行
    function renderTableRows(pids) {
      // 还原表格头部的表头
      const tableEl = root.getElementById("obd-table-el");
      tableEl.style.display = "table";
      
      const container = root.querySelector(".obd-data-area");
      const dtcDiv = container.querySelector(".obd-dtc-container");
      if (dtcDiv) dtcDiv.remove();

      let html = "";
      pids.forEach((pid) => {
        const isChecked = state.checkedPids.has(pid.id);
        const isExpanded = state.expandedPids.has(pid.id);
        html += `
          <tr data-pid-id="${pid.id}">
            <td style="text-align: center;">
              <button class="obd-caret ${isExpanded ? "is-expanded" : ""}" data-role="toggle-row" data-pid-id="${pid.id}">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
            </td>
            <td style="text-align: center;">
              <input type="checkbox" class="obd-pid-checkbox" data-role="check-row" data-pid-id="${pid.id}" ${isChecked ? "checked" : ""} />
            </td>
            <td style="font-weight: 500;">${pid.name}</td>
            <td class="obd-val-cell" style="font-family: monospace; font-weight: 600; color: #1e293b;">${pid.val}</td>
            <td style="color: #64748b;">${pid.unit}</td>
          </tr>
        `;

        if (isExpanded) {
          html += `
            <tr class="obd-detail-row" data-pid-parent="${pid.id}">
              <td colspan="5" class="obd-detail-cell">
                <div class="obd-detail-box">
                  <div class="obd-detail-header-info">UDS / KWP2000 报文追踪</div>
                  <div class="obd-detail-line">
                    <span class="obd-detail-dir is-tx">TX</span>
                    <span class="obd-detail-hex">${pid.tx}</span>
                    <span class="obd-detail-desc">(请求模式及PID参数数据)</span>
                  </div>
                  <div class="obd-detail-line">
                    <span class="obd-detail-dir is-rx">RX</span>
                    <span class="obd-detail-hex">${pid.rx}</span>
                    <span class="obd-detail-desc">(正常响应报文，解析值: ${pid.val} ${pid.unit})</span>
                  </div>
                </div>
              </td>
            </tr>
          `;
        }
      });
      els.tbody.innerHTML = html;
      bindTableEvents();
    }

    // 渲染 Mode 03 故障码视图
    function renderDtcView() {
      const tableEl = root.getElementById("obd-table-el");
      tableEl.style.display = "none";
      
      const container = root.querySelector(".obd-data-area");
      let dtcDiv = container.querySelector(".obd-dtc-container");
      if (!dtcDiv) {
        dtcDiv = document.createElement("div");
        dtcDiv.className = "obd-dtc-container";
        container.appendChild(dtcDiv);
      }

      if (mode03Dtcs.length === 0) {
        dtcDiv.innerHTML = `
          <div class="obd-dtc-empty">
            <i class="fa-solid fa-circle-check"></i>
            <span>排放控制系统正常，未检测到故障码 (No DTCs)</span>
          </div>
        `;
        return;
      }

      let html = "";
      mode03Dtcs.forEach((dtc) => {
        const isPending = dtc.type.includes("Pending");
        html += `
          <div class="obd-dtc-card ${isPending ? "obd-dtc-card--pending" : ""}">
            <div class="obd-dtc-info">
              <div class="obd-dtc-code-row">
                <span class="obd-dtc-code">${dtc.code}</span>
                <span class="obd-dtc-type">${isPending ? "暂存故障码" : "确诊故障码"}</span>
              </div>
              <div class="obd-dtc-desc">${dtc.desc}</div>
            </div>
            <div class="obd-dtc-status">
              <div style="font-weight:600; color:#475569;">MIL 灯状态: ${dtc.mil}</div>
              <div style="font-size:11px; margin-top:2px;">测试次数: ${dtc.count}</div>
              <div style="font-family: monospace; font-size:10px; color:#94a3b8; margin-top:4px;">TX: ${dtc.tx} | RX: ${dtc.rx}</div>
            </div>
          </div>
        `;
      });
      dtcDiv.innerHTML = html;
    }

    // 渲染 Mode 04 清除故障码视图
    function renderClearView() {
      const tableEl = root.getElementById("obd-table-el");
      tableEl.style.display = "none";
      
      const container = root.querySelector(".obd-data-area");
      let dtcDiv = container.querySelector(".obd-dtc-container");
      if (!dtcDiv) {
        dtcDiv = document.createElement("div");
        dtcDiv.className = "obd-dtc-container";
        container.appendChild(dtcDiv);
      }

      dtcDiv.innerHTML = `
        <div class="obd-dtc-empty" style="height: 100%; justify-content: center; gap: 16px; padding: 24px;">
          <i class="fa-solid fa-triangle-exclamation" style="color: #eab308; font-size: 48px;"></i>
          <span style="font-size: 15px; font-weight: 700; color: #1e293b;">清除车辆诊断故障码 (Mode 04)</span>
          <p style="text-align: center; font-size: 12px; color: #64748b; max-width: 420px; line-height: 1.6; margin: 0;">
            清除故障码将会清空车辆各控制单元的诊断故障码、冻结帧快照，并重置车辆“系统就绪监控状态 (I/M Readiness)”。请确认在清除前已做好相关记录。
          </p>
          <button class="obd-btn obd-btn--primary" id="obd-btn-clear-trigger" style="padding: 10px 24px; font-size:13px;">
            <i class="fa-solid fa-trash-can"></i> 立即清除故障码
          </button>
        </div>
      `;

      // 绑定清除触发事件
      const trigger = dtcDiv.querySelector("#obd-btn-clear-trigger");
      trigger?.addEventListener("click", () => {
        showClearConfirmation();
      });
    }

    function updateTableControls() {
      // 仅在 Mode 01 允许控制播放
      if (state.activeMode === "01") {
        els.playToggle.style.display = "inline-flex";
        if (state.isPlayingStream) {
          els.playToggle.classList.add("is-playing");
          els.playToggle.innerHTML = '<i class="fa-solid fa-pause"></i>';
          els.playToggle.title = "暂停实时数据流自动更新";
        } else {
          els.playToggle.classList.remove("is-playing");
          els.playToggle.innerHTML = '<i class="fa-solid fa-play"></i>';
          els.playToggle.title = "开启实时数据流自动更新";
        }
      } else {
        els.playToggle.style.display = "none";
      }

      // 根据状态控制表头复选框
      const visiblePids = state.activeMode === "01" ? state.mode01Pids :
                          state.activeMode === "02" ? state.mode02Pids :
                          state.activeMode === "09" ? state.mode09Infos : [];
      
      if (visiblePids.length > 0) {
        els.selectAll.disabled = false;
        const allChecked = visiblePids.every(p => state.checkedPids.has(p.id));
        els.selectAll.checked = allChecked;
      } else {
        els.selectAll.disabled = true;
      }
    }

    /* ======================================================
       6. 二次确认弹窗与清除进度遮罩
       ====================================================== */
    
    // 显示清除故障码二次确认
    function showClearConfirmation() {
      const overlay = document.createElement("div");
      overlay.className = "obd-confirm-overlay";
      overlay.innerHTML = `
        <div class="obd-confirm-card">
          <div class="obd-confirm-header">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>安全警告：确认清除故障码？</span>
          </div>
          <div class="obd-confirm-body">
            清除故障码将强制复位所有ECU排放参数，关闭故障指示灯 (MIL)，并清除发动机就绪帧快照。此操作不可撤销，车辆控制单元可能需要重新行驶循环方能完成就绪检测。
          </div>
          <div class="obd-confirm-actions">
            <button class="obd-btn obd-btn--secondary" id="obd-confirm-cancel">取消</button>
            <button class="obd-btn obd-btn--primary" id="obd-confirm-ok" style="background:#ef4444; box-shadow: 0 2px 6px rgba(239,68,68,0.25);">确认清除</button>
          </div>
        </div>
      `;
      root.appendChild(overlay);

      overlay.querySelector("#obd-confirm-cancel").addEventListener("click", () => overlay.remove());
      overlay.querySelector("#obd-confirm-ok").addEventListener("click", () => {
        overlay.remove();
        executeClearProcess();
      });
    }

    // 执行清除故障码拟真动画
    function executeClearProcess() {
      const loader = document.createElement("div");
      loader.className = "obd-loading-overlay";
      loader.innerHTML = `
        <div class="obd-loading-box">
          <i class="fa-solid fa-spinner obd-loading-spinner"></i>
          <span class="obd-loading-text" id="obd-clear-state-text">正在发送 Mode 04 清除报文...</span>
          <div class="obd-loading-bar-bg">
            <div class="obd-loading-bar-fill" id="obd-clear-bar-fill" style="width: 0%;"></div>
          </div>
        </div>
      `;
      root.appendChild(loader);

      const fill = loader.querySelector("#obd-clear-bar-fill");
      const text = loader.querySelector("#obd-clear-state-text");
      
      let progress = 0;
      const interval = setInterval(() => {
        progress += 4;
        fill.style.width = progress + "%";
        
        if (progress === 20) {
          text.textContent = "请求清除 ECU1 - ECU8 排放相关存储...";
        } else if (progress === 50) {
          text.textContent = "重置车辆 I/M Readiness (系统就绪) 监视器...";
        } else if (progress === 80) {
          text.textContent = "熄灭主仪表盘 MIL (故障指示灯) 信号...";
        }

        if (progress >= 100) {
          clearInterval(interval);
          loader.remove();
          
          // 更新故障码列表与状态
          mode03Dtcs = [];
          state.mode01Pids.forEach(p => {
            if (p.id === "pid-01") p.val = "MIL OFF, 0 DTCs";
          });
          
          if (window.showToast) {
            window.showToast("DTC故障码与冻结帧已成功清除！");
          }
          if (window.addLog) {
            window.addLog("OBD清除指令(Mode 04)执行完毕，控制单元已复位");
          }
          
          // 重新渲染当前页
          render();
        }
      }, 80);
    }

    /* ======================================================
       7. 芯片流水灯扫描动画
       ====================================================== */
    function runEcuScanAnimation() {
      if (state.scanState === "scanning") return;
      state.scanState = "scanning";
      
      els.btnScan.classList.add("is-loading");
      els.btnScan.disabled = true;

      // 全部变回初始状态
      els.ecuBtns.forEach(btn => {
        btn.classList.remove("is-active", "is-scanned", "is-scanning");
      });

      let ecuIndex = 0;
      function scanNextEcu() {
        if (ecuIndex < els.ecuBtns.length) {
          const currentBtn = els.ecuBtns[ecuIndex];
          currentBtn.classList.add("is-scanning");
          
          setTimeout(() => {
            currentBtn.classList.remove("is-scanning");
            currentBtn.classList.add("is-scanned");
            ecuIndex++;
            scanNextEcu();
          }, 350); // 每个芯片扫描350ms
        } else {
          // 扫描完成
          state.scanState = "scanned";
          els.btnScan.classList.remove("is-loading");
          els.btnScan.disabled = false;
          
          // 默认高亮选中ECU1
          els.ecuBtns[0].classList.add("is-active");
          state.selectedEcuId = "1";

          if (window.showToast) {
            window.showToast("整车 OBD 排放拓扑扫描完成，检测到 8 个排放 ECU");
          }
          if (window.addLog) {
            window.addLog("重新扫描完成：OBD 排放检测网络就绪");
          }
        }
      }
      scanNextEcu();
    }

    /* ======================================================
       8. “读取 (Ler)” 诊断读取过程
       ====================================================== */
    function runReadDiagnostic() {
      if (state.readState === "reading") return;
      state.readState = "reading";
      els.btnRead.disabled = true;

      const loader = document.createElement("div");
      loader.className = "obd-loading-overlay";
      loader.innerHTML = `
        <div class="obd-loading-box">
          <i class="fa-solid fa-arrows-spin obd-loading-spinner"></i>
          <span class="obd-loading-text">正在从 ECU${state.selectedEcuId} 读取诊断参数...</span>
        </div>
      `;
      root.appendChild(loader);

      setTimeout(() => {
        loader.remove();
        state.readState = "idle";
        els.btnRead.disabled = false;

        // 重新随机生成部分PID数据以展示刷新感
        if (state.activeMode === "01") {
          state.mode01Pids.forEach(p => {
            if (p.id === "pid-0c") p.val = Math.floor(740 + Math.random() * 20);
            if (p.id === "pid-04") p.val = parseFloat((30.0 + Math.random() * 6).toFixed(1));
            if (p.id === "pid-0b") p.val = Math.floor(96 + Math.random() * 4);
          });
        }

        render();

        // 触发整表刷新高亮闪烁
        const rows = els.tbody.querySelectorAll("tr:not(.obd-detail-row)");
        rows.forEach(row => {
          row.classList.add("is-updated");
          setTimeout(() => row.classList.remove("is-updated"), 800);
        });

        if (window.showToast) {
          window.showToast(`成功读取 Mode 0${state.activeMode} 数据快照`);
        }
      }, 700); // 拟真读取耗时700ms
    }

    /* ======================================================
       9. 数据回放交互控制
       ====================================================== */
    function renderPlaybackList() {
      let html = "";
      playbackRecords.forEach((rec) => {
        const isSelected = state.selectedPlaybackId === rec.id;
        html += `
          <div class="obd-playback-item ${isSelected ? "is-selected" : ""}" data-playback-id="${rec.id}">
            <span class="obd-playback-item-name"><i class="fa-solid fa-file-waveform" style="color:#2f6bff;margin-right:4px;"></i>${rec.name}</span>
            <div class="obd-playback-item-meta">
              <span>时长: ${rec.duration}</span>
              <span>${rec.date}</span>
            </div>
          </div>
        `;
      });
      els.playbackList.innerHTML = html;

      // 绑定选择文件事件
      const items = els.playbackList.querySelectorAll(".obd-playback-item");
      items.forEach(item => {
        item.addEventListener("click", () => {
          selectPlaybackFile(item.dataset.playbackId);
        });
      });
    }

    function selectPlaybackFile(id) {
      if (state.playbackInterval) {
        clearInterval(state.playbackInterval);
      }
      
      state.selectedPlaybackId = id;
      state.playbackState = "idle";
      state.playbackIndex = 0;
      
      // 更新高亮态
      const items = els.playbackList.querySelectorAll(".obd-playback-item");
      items.forEach(item => {
        item.classList.toggle("is-selected", item.dataset.playbackId === id);
      });

      // 切换视图内容
      els.playbackEmpty.classList.add("is-hidden");
      els.playbackTableWrap.classList.remove("is-hidden");
      els.playbackTbody.innerHTML = "";
      
      // 开启播放按钮
      els.playbackPlay.disabled = false;
      els.playbackPause.disabled = true;
      els.playbackStop.disabled = true;

      // 重置时间轴进度条
      els.playbackTimeCurr.textContent = "00:00";
      const totalPoints = playbackDataPoints[id].length;
      els.playbackTimeTotal.textContent = `00:${String(totalPoints).padStart(2, "0")}`;
      els.playbackSliderFill.style.width = "0%";
    }

    function startPlayback() {
      if (!state.selectedPlaybackId) return;
      
      state.playbackState = "playing";
      els.playbackPlay.disabled = true;
      els.playbackPause.disabled = false;
      els.playbackStop.disabled = false;
      
      const points = playbackDataPoints[state.selectedPlaybackId];

      state.playbackInterval = setInterval(() => {
        if (state.playbackIndex < points.length) {
          const pt = points[state.playbackIndex];
          
          // 在表格中添加一行记录
          const row = document.createElement("tr");
          const isWarn = pt.status.includes("警告");
          row.style.animation = "obdFadeIn 0.3s ease-out";
          row.innerHTML = `
            <td style="font-family:monospace; font-weight:600; color:#64748b;">${pt.time}</td>
            <td style="font-weight:500;">${pt.pid}</td>
            <td style="font-family:monospace; font-weight:600; color:#1e293b;">${pt.val}</td>
            <td>-</td>
            <td><span class="tag" style="background:${isWarn ? "rgba(239,68,68,0.1)":"rgba(16,185,129,0.1)"}; border-color:${isWarn ? "rgba(239,68,68,0.3)":"rgba(16,185,129,0.3)"}; color:${isWarn ? "#ef4444":"#10b981"}; font-weight:600;">${pt.status}</span></td>
          `;
          els.playbackTbody.appendChild(row);
          
          // 滚动到底部
          els.playbackTableWrap.scrollTop = els.playbackTableWrap.scrollHeight;

          // 更新进度条与当前时间
          state.playbackIndex++;
          els.playbackTimeCurr.textContent = `00:${String(state.playbackIndex).padStart(2, "0")}`;
          const progress = (state.playbackIndex / points.length) * 100;
          els.playbackSliderFill.style.width = `${progress}%`;
        } else {
          // 播放结束
          stopPlayback();
          if (window.showToast) {
            window.showToast("历史记录包回放完毕");
          }
        }
      }, 800); // 每800ms读取流回放一行
    }

    function pausePlayback() {
      state.playbackState = "paused";
      clearInterval(state.playbackInterval);
      
      els.playbackPlay.disabled = false;
      els.playbackPause.disabled = true;
    }

    function stopPlayback() {
      state.playbackState = "idle";
      clearInterval(state.playbackInterval);
      state.playbackIndex = 0;
      
      els.playbackPlay.disabled = false;
      els.playbackPause.disabled = true;
      els.playbackStop.disabled = true;
      
      els.playbackTimeCurr.textContent = "00:00";
      els.playbackSliderFill.style.width = "0%";
    }

    /* ======================================================
       10. 事件绑定
       ====================================================== */
    
    // 主页签切换
    els.mainTabs.forEach(btn => {
      btn.addEventListener("click", () => {
        els.mainTabs.forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");

        const tabKey = btn.dataset.obdMainTab;
        state.mainTab = tabKey;

        els.views.forEach(view => {
          const match = view.id === `obd-view-${tabKey}`;
          view.classList.toggle("is-active", match);
        });

        if (tabKey === "playback") {
          renderPlaybackList();
        } else {
          render();
        }
      });
    });

    // ECU按钮多选/单选
    els.ecuBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        els.ecuBtns.forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.selectedEcuId = btn.dataset.ecu;
        
        if (window.addLog) {
          window.addLog(`切换当前诊断目标：ECU${state.selectedEcuId}`);
        }
      });
    });

    // 模式子页签切换
    els.modeTabs.forEach(btn => {
      btn.addEventListener("click", () => {
        els.modeTabs.forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.activeMode = btn.dataset.obdMode;

        // 切换模式重置折叠集
        state.expandedPids.clear();
        render();
      });
    });

    // 重新扫描与读取按钮
    els.btnScan.addEventListener("click", runEcuScanAnimation);
    els.btnRead.addEventListener("click", runReadDiagnostic);

    // 主表格内全选/反选与折叠按钮事件绑定
    function bindTableEvents() {
      const toggleBtns = els.tbody.querySelectorAll("[data-role='toggle-row']");
      toggleBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const pidId = btn.dataset.pidId;
          const isExpanded = state.expandedPids.has(pidId);
          if (isExpanded) {
            state.expandedPids.delete(pidId);
          } else {
            state.expandedPids.add(pidId);
          }
          render();
        });
      });

      const checkBoxes = els.tbody.querySelectorAll("[data-role='check-row']");
      checkBoxes.forEach(cb => {
        cb.addEventListener("click", (e) => {
          e.stopPropagation();
          const pidId = cb.dataset.pidId;
          if (cb.checked) {
            state.checkedPids.add(pidId);
          } else {
            state.checkedPids.delete(pidId);
          }
          updateTableControls();
        });
      });
    }

    // 头部播放与勾选按钮绑定
    els.playToggle.addEventListener("click", () => {
      state.isPlayingStream = !state.isPlayingStream;
      updateTableControls();
    });

    els.selectAll.addEventListener("change", () => {
      const isChecked = els.selectAll.checked;
      const visiblePids = state.activeMode === "01" ? state.mode01Pids :
                          state.activeMode === "02" ? state.mode02Pids :
                          state.activeMode === "09" ? state.mode09Infos : [];
      
      visiblePids.forEach(p => {
        if (isChecked) {
          state.checkedPids.add(p.id);
        } else {
          state.checkedPids.delete(p.id);
        }
      });
      render();
    });

    // 回放播放器控制
    els.playbackPlay?.addEventListener("click", startPlayback);
    els.playbackPause?.addEventListener("click", pausePlayback);
    els.playbackStop?.addEventListener("click", () => {
      stopPlayback();
      if (els.playbackTbody) els.playbackTbody.innerHTML = "";
    });

    // 导出文件仿真
    els.btnExport?.addEventListener("click", () => {
      if (!state.selectedPlaybackId) return;
      if (window.showToast) {
        window.showToast("诊断记录导出成功！已保存至 C:\\GDTTools\\Logs");
      }
    });

    /* ======================================================
       11. 报文工具类 (ASCII 转 HEX)
       ====================================================== */
    function asciiToHex(str) {
      let arr = [];
      for (let i = 0, l = str.length; i < l; i++) {
        let hex = Number(str.charCodeAt(i)).toString(16).toUpperCase();
        arr.push(hex);
      }
      return arr.join(" ");
    }

    // 首次启动渲染
    render();
  }
})();
