/**
 * Console CAN Simulation Panel
 * CAN报文仿真发送面板 —— 模拟 CANoe Interactive Generator (IG)
 *
 * 功能：
 * - 标题栏：显示当前总线名称
 * - 工具栏：添加/复制/删除/播放/停止/颜色/设置/上移/下移 + 默认周期设置
 * - 报文列表表格：发送状态、触发器、名称、29bit ID、标识、数据长度
 * - 下方 Data 编辑网格：选中报文的 8字节 HEX 数据编辑
 * - 分割线拖拽：调整上下区域比例
 */
window.ConsoleCan = (() => {
  /* ============================
     面板容器（由外部传入或查找）
     ============================ */
  let panelEl = null;

  /* ============================
     内部状态
     ============================ */
  const state = {
    busName: 'CAN1',
    messages: [
      {
        id: 'can-msg-1',
        name: 'GW_vcu_obc_ecu_gcu',
        sending: false,
        trigger: 'cycle',    // 'cycle' | 'once' | 'key'
        triggerKey: 'A',
        cycleMs: 20,
        is29bit: false,
        canId: '10C',
        dlc: 8,
        data: [0, 0, 0, 0, 0, 0, 0, 0],
      },
    ],
    selectedIdx: 0,
    defaultCycle: 100,
    splitRatio: 0.6,  // 上方区域占比
    openPopoverId: null,
    // 以下为新增的总线配置参数，与“刷写配置-总线配置-总线参数”相同
    dbcName: '',
    baudRate: '500 kbps',
    dataRate: '2 Mbps',
    samplePoint: '80%',
    tq: '0.125 us',
    timeQuanta: '16',
    prescaler: '1',
    phaseSeg1: '11',
    phaseSeg2: '4',
    sjw: '1',
    channel: 'OBD诊断通道',
    transport: 'ISO-TP',
  };

  /* ============================
     定时器与仿真发送逻辑
     ============================ */
  const timers = {}; // msgId -> { intervalId, ms }

  function updateSendTimers() {
    // 清理那些没有在发送或已被删除的报文定时器
    const activeIds = state.messages.map(m => m.id);
    Object.keys(timers).forEach(id => {
      const msg = state.messages.find(m => m.id === id);
      if (!msg || !msg.sending || msg.trigger !== 'cycle') {
        clearInterval(timers[id].intervalId);
        delete timers[id];
      }
    });

    // 启动/更新正在发送的周期报文定时器
    state.messages.forEach(msg => {
      if (msg.sending) {
        if (msg.trigger === 'cycle') {
          const currentInterval = msg.cycleMs || state.defaultCycle;
          if (!timers[msg.id]) {
            const sendFn = () => {
              if (window.ConsoleChart && window.ConsoleChart.generateDynamicSignals) {
                window.ConsoleChart.generateDynamicSignals(msg);
              }
              const hexData = msg.data.slice(0, msg.dlc).map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
              const idHex = msg.canId.toUpperCase().padStart(3, '0');
              const frameInfo = msg.is29bit ? '扩展帧(29bit)' : '标准帧(11bit)';
              const logMsg = `[CAN ${state.busName}] Tx: ID=0x${idHex} DLC=${msg.dlc} Data=[${hexData}] (${frameInfo}) 名称=${msg.name}`;
              if (window.addLog) window.addLog(logMsg);
              if (window.ConsoleTrace && window.ConsoleTrace.addTraceEntry) {
                window.ConsoleTrace.addTraceEntry({
                  channel: state.busName,
                  id: idHex,
                  name: msg.name,
                  dir: 'Tx',
                  dlc: msg.dlc,
                  data: hexData
                });
              }
            };
            const interval = Math.max(10, currentInterval);
            timers[msg.id] = {
              intervalId: setInterval(sendFn, interval),
              ms: interval
            };
          } else if (timers[msg.id].ms !== currentInterval) {
            // 周期改变，重建定时器
            clearInterval(timers[msg.id].intervalId);
            const sendFn = () => {
              if (window.ConsoleChart && window.ConsoleChart.generateDynamicSignals) {
                window.ConsoleChart.generateDynamicSignals(msg);
              }
              const hexData = msg.data.slice(0, msg.dlc).map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
              const idHex = msg.canId.toUpperCase().padStart(3, '0');
              const frameInfo = msg.is29bit ? '扩展帧(29bit)' : '标准帧(11bit)';
              const logMsg = `[CAN ${state.busName}] Tx: ID=0x${idHex} DLC=${msg.dlc} Data=[${hexData}] (${frameInfo}) 名称=${msg.name}`;
              if (window.addLog) window.addLog(logMsg);
              if (window.ConsoleTrace && window.ConsoleTrace.addTraceEntry) {
                window.ConsoleTrace.addTraceEntry({
                  channel: state.busName,
                  id: idHex,
                  name: msg.name,
                  dir: 'Tx',
                  dlc: msg.dlc,
                  data: hexData
                });
              }
            };
            const interval = Math.max(10, currentInterval);
            timers[msg.id] = {
              intervalId: setInterval(sendFn, interval),
              ms: interval
            };
          }
        } else {
          // 'once' 或 'key'，立即模拟发送一次，并恢复 sending = false
          const hexData = msg.data.slice(0, msg.dlc).map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
          const idHex = msg.canId.toUpperCase().padStart(3, '0');
          const frameInfo = msg.is29bit ? '扩展帧(29bit)' : '标准帧(11bit)';
          const logMsg = `[CAN ${state.busName}] Tx (单次): ID=0x${idHex} DLC=${msg.dlc} Data=[${hexData}] (${frameInfo}) 名称=${msg.name}`;
          if (window.addLog) window.addLog(logMsg);
          if (window.ConsoleTrace && window.ConsoleTrace.addTraceEntry) {
            window.ConsoleTrace.addTraceEntry({
              channel: state.busName,
              id: idHex,
              name: msg.name,
              dir: 'Tx',
              dlc: msg.dlc,
              data: hexData
            });
          }
          
          msg.sending = false;
          // 延迟刷新以防止死循环调用
          setTimeout(render, 50);
        }
      }
    });
  }

  /* ============================
     工具函数
     ============================ */
  let _idCounter = 100;
  const nextId = () => `can-msg-${++_idCounter}`;

  /** 将数值转为 2 位 HEX 字符串 */
  const toHex2 = (v) => (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');

  /** 解析 HEX 字符串为数值 (0-255) */
  const parseHexByte = (str) => {
    const n = parseInt(str, 16);
    return isNaN(n) ? 0 : Math.min(255, Math.max(0, n));
  };

  /** 生成一条默认报文 */
  const createDefaultMsg = () => ({
    id: nextId(),
    name: 'NewMessage',
    sending: false,
    trigger: 'cycle',
    triggerKey: 'A',
    cycleMs: state.defaultCycle,
    is29bit: false,
    canId: '000',
    dlc: 8,
    data: [0, 0, 0, 0, 0, 0, 0, 0],
  });

  /** 深拷贝一条报文 */
  const cloneMsg = (msg) => ({
    ...msg,
    id: nextId(),
    triggerKey: msg.triggerKey || 'A',
    data: [...msg.data],
  });

  /* ============================
     渲染：标题栏
     ============================ */
  function renderTitle() {
    const dbcDisplay = state.dbcName 
      ? `<span class="console-sim-dbc-name" title="${state.dbcName}"><i class="fa-solid fa-file-code"></i> ${state.dbcName}</span>` 
      : '<span class="console-sim-dbc-name no-dbc">未导入 DBC</span>';
    
    return `<div class="console-sim-title">
      <div class="console-sim-title-left">
        <i class="fa-solid fa-tower-broadcast" style="color:#2e8b57"></i>
        <span class="console-sim-title__text">仿真 - ${state.busName}</span>
        ${dbcDisplay}
      </div>
      <div class="console-sim-title-actions">
        <button class="console-title-btn" data-action="title-import-dbc" title="导入DBC">
          <i class="fa-solid fa-file-import"></i> 导入DBC
        </button>
        <button class="console-title-btn" data-action="title-switch-protocol" title="切换 CAN/CANFD">
          <i class="fa-solid fa-arrows-rotate"></i> 切换为 ${state.busName.startsWith('CANFD') ? 'CAN' : 'CANFD'}
        </button>
        <button class="console-title-btn" data-action="title-open-settings" title="参数设置">
          <i class="fa-solid fa-gear"></i> 设置
        </button>
      </div>
    </div>`;
  }

  /* ============================
     渲染：工具栏
     ============================ */
  function renderToolbar() {
    return `<div class="console-sim-toolbar">
      <button class="console-sim-toolbar__btn" data-action="add" title="添加报文">
        <i class="fa-solid fa-plus" style="color:#2e8b57"></i>
      </button>
      <button class="console-sim-toolbar__btn" data-action="add-raw" title="添加原始报文">
        <i class="fa-solid fa-file-circle-plus" style="color:#00a3a3"></i>
      </button>
      <button class="console-sim-toolbar__btn" data-action="copy" title="复制报文">
        <i class="fa-solid fa-copy" style="color:#3085c3"></i>
      </button>
      <button class="console-sim-toolbar__btn" data-action="delete" title="单个删除">
        <i class="fa-solid fa-xmark" style="color:#d04030"></i>
      </button>
      <span class="console-sim-toolbar__sep"></span>
      <button class="console-sim-toolbar__btn" data-action="play-all" title="全部开始发送">
        <i class="fa-solid fa-play" style="color:#2e8b57"></i>
      </button>
      <button class="console-sim-toolbar__btn" data-action="stop-all" title="全部停止发送">
        <i class="fa-solid fa-square" style="color:#333"></i>
      </button>
      <button class="console-sim-toolbar__btn" data-action="clear-all" title="全部清除">
        <i class="fa-solid fa-broom" style="color:#e6a23c"></i>
      </button>
      <span class="console-sim-toolbar__sep"></span>
      <button class="console-sim-toolbar__btn" data-action="move-up" title="上移">
        <i class="fa-solid fa-arrow-up" style="color:#888"></i>
      </button>
      <button class="console-sim-toolbar__btn" data-action="move-down" title="下移">
        <i class="fa-solid fa-arrow-down" style="color:#888"></i>
      </button>
    </div>`;
  }

  /* ============================
     渲染：上方报文列表
     ============================ */
  function renderUpper() {
    let rows = '';
    state.messages.forEach((msg, idx) => {
      const isSelected = idx === state.selectedIdx;
      const rowCls = isSelected ? 'console-sim-row is-selected' : 'console-sim-row';

      // 发送按钮图标
      const sendIcon = msg.sending
        ? '<i class="fa-solid fa-pause" style="color:#d04030"></i>'
        : '<i class="fa-solid fa-play" style="color:#2e8b2e"></i>';

      // 触发器显示文本
      let triggerText = '';
      if (msg.trigger === 'cycle') {
        triggerText = `周期: ${msg.cycleMs}ms`;
      } else {
        triggerText = `手动: Ctrl+${msg.triggerKey || 'A'}`;
      }

      const showPopover = state.openPopoverId === msg.id;
      const popoverClass = showPopover ? 'sim-trigger-popover' : 'sim-trigger-popover is-hidden';
      const isCycle = msg.trigger === 'cycle';
      const isManual = !isCycle;
      const trigKey = msg.triggerKey || 'A';

      rows += `<tr class="${rowCls}" data-idx="${idx}">
        <td style="width:50px;text-align:center">
          <button class="console-sim-send-btn" data-action="toggle-send" data-idx="${idx}" title="${msg.sending ? '暂停' : '发送'}">${sendIcon}</button>
        </td>
        <td style="width:145px; overflow:visible;">
          <div class="sim-trigger-cell-wrap">
            <button class="sim-trigger-dropdown-btn" data-action="toggle-popover" data-idx="${idx}">
              <span>${triggerText}</span>
              <i class="fa-solid fa-caret-down" style="font-size:10px; margin-left:4px;"></i>
            </button>
            <div class="${popoverClass}">
              <div class="sim-trigger-popover__cols">
                <div class="sim-trigger-popover__col">
                  <label class="sim-trigger-popover__label">
                    <input type="radio" name="trig-type-${idx}" value="manual" ${isManual ? 'checked' : ''} data-action="set-trig-type" data-idx="${idx}">
                    手动触发
                  </label>
                  <div class="sim-trigger-popover__sub-label">触发键：</div>
                  <div class="sim-trigger-popover__val-row">
                    <span class="sim-trigger-popover__ctrl-label">Ctrl+</span>
                    <input type="text" class="sim-trigger-popover__key-input" value="${trigKey}" maxlength="1" data-field="triggerKey" data-idx="${idx}" ${isCycle ? 'disabled' : ''}>
                  </div>
                </div>
                <div class="sim-trigger-popover__col">
                  <label class="sim-trigger-popover__label">
                    <input type="radio" name="trig-type-${idx}" value="cycle" ${isCycle ? 'checked' : ''} data-action="set-trig-type" data-idx="${idx}">
                    周期触发
                  </label>
                  <div class="sim-trigger-popover__sub-label">触发周期(毫秒)：</div>
                  <div class="sim-trigger-popover__val-row">
                    <input type="number" class="sim-trigger-popover__cycle-input" value="${msg.cycleMs}" min="1" max="10000" data-field="cycleMs" data-idx="${idx}" ${isManual ? 'disabled' : ''}>
                  </div>
                </div>
              </div>
              <div class="sim-trigger-popover__slider-row">
                <input type="range" class="sim-trigger-popover__slider" min="10" max="2000" step="10" value="${msg.cycleMs}" data-field="cycleSlider" data-idx="${idx}" ${isManual ? 'disabled' : ''}>
                <div class="sim-trigger-popover__ticks"></div>
              </div>
            </div>
          </div>
        </td>
        <td>
          <input type="text" class="console-sim-text-input" data-field="name" data-idx="${idx}" value="${msg.name}" title="报文名称">
        </td>
        <td style="width:60px;text-align:center">
          <input type="checkbox" class="console-sim-checkbox" data-field="is29bit" data-idx="${idx}" ${msg.is29bit ? 'checked' : ''} title="29bit 扩展帧">
        </td>
        <td style="width:80px">
          <input type="text" class="console-sim-hex-input" data-field="canId" data-idx="${idx}" value="${msg.canId}" maxlength="8" title="CAN ID (HEX)">
        </td>
        <td style="width:80px">
          <select class="console-sim-select" data-field="dlc" data-idx="${idx}">
            ${Array.from({length: 65}, (_, i) => i).map(d => `<option value="${d}" ${msg.dlc === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </td>
      </tr>`;
    });

    return `<div class="console-sim-upper" style="flex:${state.splitRatio}">
      <div class="console-sim-table-wrap">
        <table class="console-sim-table">
          <thead>
            <tr>
              <th style="width:50px">发送</th>
              <th style="width:145px">触发器</th>
              <th>名称</th>
              <th style="width:60px">29bit ID</th>
              <th style="width:80px">标识</th>
              <th style="width:80px">数据长度</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  /* ============================
     渲染：分割线
     ============================ */
  function renderSplitter() {
    return `<div class="console-sim-splitter" data-action="splitter">
      <div class="console-sim-splitter__bar"></div>
    </div>`;
  }

  /* ============================
     渲染：下方 Data 编辑网格
     ============================ */
  function renderLower() {
    const msg = state.messages[state.selectedIdx];
    if (!msg) {
      return `<div class="console-sim-lower" style="flex:${1 - state.splitRatio}">
        <div class="console-sim-data-empty">未选中报文</div>
      </div>`;
    }

    const dlc = msg.dlc;
    const rowsCount = Math.max(1, Math.ceil(dlc / 8));

    // 列头：Data | 0 | 1 | ... | 7
    let headerCells = '<th class="console-sim-data__label">Data</th>';
    for (let i = 0; i < 8; i++) {
      headerCells += `<th class="console-sim-data__col-head">${i}</th>`;
    }

    // 动态行
    let tbodyContent = '';
    for (let r = 0; r < rowsCount; r++) {
      const startIdx = r * 8;
      const endIdx = startIdx + 7;
      let dataCells = `<td class="console-sim-data__row-head"><i class="fa-solid fa-table-cells" style="margin-right:4px"></i>${startIdx}-${endIdx}</td>`;
      
      for (let c = 0; c < 8; c++) {
        const byteIdx = startIdx + c;
        if (byteIdx < dlc) {
          if (msg.data[byteIdx] === undefined) {
            msg.data[byteIdx] = 0;
          }
          dataCells += `<td class="console-sim-data__cell">
            <input type="text" class="console-sim-data__input" data-byte="${byteIdx}"
                   value="${toHex2(msg.data[byteIdx])}" maxlength="2" title="Byte ${byteIdx}">
          </td>`;
        } else {
          dataCells += `<td class="console-sim-data__cell console-sim-data__cell--disabled">--</td>`;
        }
      }
      tbodyContent += `<tr>${dataCells}</tr>`;
    }

    return `<div class="console-sim-lower" style="flex:${1 - state.splitRatio}; overflow-y: auto;">
      <table class="console-sim-data-grid">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${tbodyContent}</tbody>
      </table>
    </div>`;
  }

  /* ============================
     主渲染
     ============================ */
  function render() {
    if (!panelEl) return;
    panelEl.innerHTML =
      renderTitle() +
      renderToolbar() +
      renderUpper() +
      renderSplitter() +
      renderLower();
    bindEvents();
    updateSendTimers();
  }

  /* ============================
     事件绑定（事件委托）
     ============================ */
  function bindEvents() {
    if (!panelEl) return;

    // 移除旧监听（使用克隆替换的方式太重，这里用标记）
    panelEl.removeEventListener('click', handleClick);
    panelEl.removeEventListener('change', handleChange);
    panelEl.removeEventListener('input', handleInput);
    panelEl.removeEventListener('mousedown', handleSplitterDown);

    panelEl.addEventListener('click', handleClick);
    panelEl.addEventListener('change', handleChange);
    panelEl.addEventListener('input', handleInput);
    panelEl.addEventListener('mousedown', handleSplitterDown);
  }

  /* ---------- 点击处理 ---------- */
  function handleClick(e) {
    // 弹窗相关动作拦截
    const popoverBtn = e.target.closest('[data-action]');
    if (popoverBtn) {
      const action = popoverBtn.dataset.action;
      const idx = popoverBtn.dataset.idx !== undefined ? parseInt(popoverBtn.dataset.idx, 10) : -1;
      const msg = idx >= 0 ? state.messages[idx] : null;

      if (action === 'toggle-popover' && msg) {
        e.stopPropagation();
        state.openPopoverId = (state.openPopoverId === msg.id ? null : msg.id);
        render();
        return;
      }
      if (action === 'close-popover') {
        e.stopPropagation();
        state.openPopoverId = null;
        render();
        return;
      }
      if (action === 'set-trig-type' && msg) {
        e.stopPropagation();
        msg.trigger = (popoverBtn.value === 'cycle' ? 'cycle' : 'key');
        render();
        return;
      }
    }

    // 工具栏按钮
    const toolBtn = e.target.closest('[data-action]');
    if (toolBtn) {
      const action = toolBtn.dataset.action;
      const idx = toolBtn.dataset.idx !== undefined ? parseInt(toolBtn.dataset.idx, 10) : -1;

      switch (action) {
        case 'title-import-dbc':
          doAddDBC();
          break;
        case 'title-switch-protocol':
          doSwitchProtocol();
          break;
        case 'title-open-settings':
          doOpenSettings();
          break;
        case 'add':
          doAdd();
          break;
        case 'add-raw':
          doAddRaw();
          break;
        case 'copy':
          doCopy();
          break;
        case 'delete':
          doDelete();
          break;
        case 'play-all':
          doPlayAll();
          break;
        case 'stop-all':
          doStopAll();
          break;
        case 'clear-all':
          doClearAll();
          break;
        case 'move-up':
          doMoveUp();
          break;
        case 'move-down':
          doMoveDown();
          break;
        case 'toggle-send':
          if (idx >= 0) doToggleSend(idx);
          break;
        default:
          break;
      }
      return;
    }

    // 点击表格行 → 选中
    const row = e.target.closest('.console-sim-row');
    if (row) {
      const idx = parseInt(row.dataset.idx, 10);
      if (!isNaN(idx) && idx !== state.selectedIdx) {
        state.selectedIdx = idx;
        render();
      }
    }
  }

  /* ---------- change 处理（select / checkbox） ---------- */
  function handleChange(e) {
    const el = e.target;
    const field = el.dataset.field;
    const idx = el.dataset.idx !== undefined ? parseInt(el.dataset.idx, 10) : -1;

    if (!field) return;

    // 默认周期
    if (field === 'defaultCycle') {
      const v = parseInt(el.value, 10);
      if (!isNaN(v) && v > 0) state.defaultCycle = v;
      return;
    }

    if (idx < 0 || idx >= state.messages.length) return;
    const msg = state.messages[idx];

    switch (field) {
      case 'trigger': {
        msg.trigger = el.value;
        if (msg.trigger === 'cycle') {
          msg.cycleMs = state.defaultCycle;
        }
        render();
        break;
      }
      case 'is29bit':
        msg.is29bit = el.checked;
        break;
      case 'dlc': {
        const dlc = parseInt(el.value, 10);
        msg.dlc = isNaN(dlc) ? 8 : dlc;
        // 调整 data 数组长度
        while (msg.data.length < msg.dlc) msg.data.push(0);
        // 只在选中当前行时重新渲染下方 Data
        if (idx === state.selectedIdx) render();
        break;
      }
      default:
        break;
    }
  }

  /* ---------- input 处理（文本输入） ---------- */
  function handleInput(e) {
    const el = e.target;
    const field = el.dataset.field;
    const idx = el.dataset.idx !== undefined ? parseInt(el.dataset.idx, 10) : -1;
    const byteIdx = el.dataset.byte !== undefined ? parseInt(el.dataset.byte, 10) : -1;

    // 默认周期输入
    if (field === 'defaultCycle') {
      const v = parseInt(el.value, 10);
      if (!isNaN(v) && v > 0) state.defaultCycle = v;
      return;
    }

    // 弹窗：快捷键输入
    if (field === 'triggerKey' && idx >= 0 && idx < state.messages.length) {
      el.value = el.value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(-1);
      state.messages[idx].triggerKey = el.value || 'A';
      render();
      return;
    }

    // 弹窗：数字周期输入
    if (field === 'cycleMs' && idx >= 0 && idx < state.messages.length) {
      const v = parseInt(el.value, 10);
      if (!isNaN(v) && v > 0) {
        state.messages[idx].cycleMs = v;
        const slider = panelEl.querySelector(`.sim-trigger-popover__slider[data-idx="${idx}"]`);
        if (slider) slider.value = String(v);
      }
      return;
    }

    // 弹窗：滑动条拉动输入
    if (field === 'cycleSlider' && idx >= 0 && idx < state.messages.length) {
      const v = parseInt(el.value, 10);
      state.messages[idx].cycleMs = v;
      const numInp = panelEl.querySelector(`.sim-trigger-popover__cycle-input[data-idx="${idx}"]`);
      if (numInp) numInp.value = String(v);
      return;
    }

    // 报文名称
    if (field === 'name' && idx >= 0 && idx < state.messages.length) {
      state.messages[idx].name = el.value;
      return;
    }

    // CAN ID
    if (field === 'canId' && idx >= 0 && idx < state.messages.length) {
      // 只允许 HEX 字符
      el.value = el.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
      state.messages[idx].canId = el.value;
      return;
    }

    // Data 字节编辑
    if (byteIdx >= 0) {
      const msg = state.messages[state.selectedIdx];
      if (!msg) return;
      el.value = el.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
      msg.data[byteIdx] = parseHexByte(el.value);
    }
  }

  /* ============================
     分割线拖拽
     ============================ */
  let _splitDragging = false;
  let _splitStartY = 0;
  let _splitStartRatio = 0;
  let _splitContainerH = 0;

  function handleSplitterDown(e) {
    const splitter = e.target.closest('.console-sim-splitter');
    if (!splitter) return;

    e.preventDefault();
    _splitDragging = true;
    _splitStartY = e.clientY;
    _splitStartRatio = state.splitRatio;

    // 计算上下容器总可用高度（排除 title + toolbar + splitter 自身）
    const titleEl = panelEl.querySelector('.console-sim-title');
    const toolbarEl = panelEl.querySelector('.console-sim-toolbar');
    const titleH = titleEl ? titleEl.offsetHeight : 0;
    const toolbarH = toolbarEl ? toolbarEl.offsetHeight : 0;
    const splitterH = splitter.offsetHeight;
    _splitContainerH = panelEl.offsetHeight - titleH - toolbarH - splitterH;

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev) => {
      if (!_splitDragging) return;
      const dy = ev.clientY - _splitStartY;
      const delta = _splitContainerH > 0 ? dy / _splitContainerH : 0;
      state.splitRatio = Math.min(0.85, Math.max(0.15, _splitStartRatio + delta));

      // 实时更新 flex
      const upper = panelEl.querySelector('.console-sim-upper');
      const lower = panelEl.querySelector('.console-sim-lower');
      if (upper) upper.style.flex = String(state.splitRatio);
      if (lower) lower.style.flex = String(1 - state.splitRatio);
    };

    const onMouseUp = () => {
      _splitDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /* ============================
     信号选择模态框关联数据与状态
     ============================ */
  let signalSelectInitialized = false;
  const signalTreeState = {
    searchQuery: '',
    selectedNode: null,
    root: {
      name: "ECUs",
      id: "0",
      type: "root",
      checked: false,
      expanded: true,
      children: [
        {
          name: "ACU",
          id: "0",
          type: "ecu",
          checked: false,
          expanded: false,
          children: [
            { name: "RxMsgs", id: "0", type: "folder", checked: false, children: [] },
            { 
              name: "TxMsgs", 
              id: "0", 
              type: "folder", 
              checked: false, 
              expanded: false,
              children: [
                {
                  name: "ACU_Status",
                  id: "12A",
                  type: "message",
                  checked: false,
                  cycleMs: 20,
                  dlc: 8,
                  data: [0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                  comment: "安全气囊控制单元状态报文，包含气囊状态、碰撞传感器数据等"
                }
              ] 
            }
          ]
        },
        {
          name: "APA",
          id: "0",
          type: "ecu",
          checked: false,
          expanded: false,
          children: [
            { name: "RxMsgs", id: "0", type: "folder", checked: false, children: [] },
            { 
              name: "TxMsgs", 
              id: "0", 
              type: "folder", 
              checked: false, 
              expanded: false,
              children: [
                {
                  name: "APA_Control",
                  id: "135",
                  type: "message",
                  checked: false,
                  cycleMs: 50,
                  dlc: 8,
                  data: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
                  comment: "自动泊车辅助系统控制报文，包含泊车指令、目标位置等"
                }
              ] 
            }
          ]
        },
        { name: "ASC", id: "0", type: "ecu", checked: false, children: [] },
        { name: "AVM", id: "0", type: "ecu", checked: false, children: [] },
        { name: "EPS", id: "0", type: "ecu", checked: false, children: [] },
        { name: "ESC", id: "0", type: "ecu", checked: false, children: [] },
        { name: "GW", id: "0", type: "ecu", checked: false, children: [] },
        { name: "MPC", id: "0", type: "ecu", checked: false, children: [] },
        { name: "MRR", id: "0", type: "ecu", checked: false, children: [] },
        { name: "MRR_R1", id: "0", type: "ecu", checked: false, children: [] },
        { name: "MRR_R2", id: "0", type: "ecu", checked: false, children: [] },
        { name: "VCU", id: "0", type: "ecu", checked: false, children: [] },
        { name: "iBooster", id: "0", type: "ecu", checked: false, children: [] },
        {
          name: "Messages",
          id: "0",
          type: "folder",
          checked: false,
          expanded: true,
          children: [
            { 
              name: "GW_vcu_obc_ecu_gcu", 
              id: "10C", 
              type: "message", 
              checked: false,
              cycleMs: 10,
              dlc: 8,
              data: [0x00, 0x12, 0x00, 0x00, 0x8A, 0x00, 0x00, 0x00],
              comment: "网关-整车控制器-充电机-发动机控制-发电机控制单元报文"
            },
            { 
              name: "IVI_AVMSet", 
              id: "10E", 
              type: "message", 
              checked: false,
              cycleMs: 100,
              dlc: 8,
              data: [0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00],
              comment: "车载信息娱乐系统-全景环视功能设置与标定交互报文"
            },
            {
              name: "Engine_Status_DBC",
              id: "0C9",
              type: "message",
              checked: false,
              cycleMs: 10,
              dlc: 8,
              data: [0x12, 0x34, 0x56, 0x78, 0x00, 0x00, 0x00, 0x00],
              comment: "发动机实时状态报文，包含转速、负荷、水温及状态位"
            },
            {
              name: "ABS_Data_DBC",
              id: "201",
              type: "message",
              checked: false,
              cycleMs: 20,
              dlc: 8,
              data: [0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00],
              comment: "防抱死制动系统数据，包含四个车轮的轮速及制动压力"
            },
            {
              name: "BCM_LightControl_DBC",
              id: "3A0",
              type: "message",
              checked: false,
              cycleMs: 100,
              dlc: 8,
              data: [0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
              comment: "车身控制模块灯光控制报文，包含大灯、转向灯及环境氛围灯状态"
            }
          ]
        }
      ]
    }
  };

  function clearSignalTreeSelection() {
    function clearNode(node) {
      node.checked = false;
      if (node.children) {
        node.children.forEach(clearNode);
      }
    }
    clearNode(signalTreeState.root);
    signalTreeState.selectedNode = signalTreeState.root;
    signalTreeState.searchQuery = '';
    
    const searchInput = document.getElementById('signal-search-input');
    if (searchInput) searchInput.value = '';
    
    updateDetailView(signalTreeState.root);
  }

  function updateDetailView(node) {
    const detailName = document.getElementById('signal-detail-name');
    const detailStartBit = document.getElementById('signal-detail-start-bit');
    const detailComment = document.getElementById('signal-detail-comment');
    
    if (node) {
      detailName.textContent = node.name || '--';
      detailStartBit.textContent = (node.type === 'message') ? '0' : '--';
      detailComment.textContent = node.comment || '--';
    } else {
      detailName.textContent = '--';
      detailStartBit.textContent = '--';
      detailComment.textContent = '--';
    }
  }

  function findNodeInTree(node, name, id) {
    if (node.name === name && node.id === id) {
      return node;
    }
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const found = findNodeInTree(node.children[i], name, id);
        if (found) return found;
      }
    }
    return null;
  }

  function toggleChildrenChecked(node, isChecked) {
    if (node.children) {
      node.children.forEach(child => {
        child.checked = isChecked;
        toggleChildrenChecked(child, isChecked);
      });
    }
  }

  function updateParentCheckedState(rootNode) {
    function updateNode(node) {
      if (node.children && node.children.length > 0) {
        node.children.forEach(updateNode);
        const allChecked = node.children.every(child => child.checked);
        node.checked = allChecked;
      }
    }
    updateNode(rootNode);
  }

  function renderSignalTree() {
    const treeContainer = document.getElementById('signal-tree-container');
    if (!treeContainer) return;
    
    const query = signalTreeState.searchQuery;
    
    function generateHtml(node, depth = 0) {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = node.expanded;
      const isSelected = signalTreeState.selectedNode === node;
      
      if (query && !matchSearch(node, query)) {
        return '';
      }
      
      let indents = '';
      for (let i = 0; i < depth; i++) {
        indents += '<span class="tree-node-indent"></span>';
      }
      
      let toggleIcon = '<span class="tree-node-toggle" style="visibility: hidden;"><i class="fa-solid fa-chevron-right"></i></span>';
      if (hasChildren) {
        toggleIcon = `<span class="tree-node-toggle" data-node-id="${node.id}" data-node-name="${node.name}">
          <i class="fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
        </span>`;
      }
      
      const checkboxHtml = `<input type="checkbox" class="tree-node-checkbox" data-node-id="${node.id}" data-node-name="${node.name}" ${node.checked ? 'checked' : ''} />`;
      
      let typeIcon = '<i class="fa-solid fa-cube"></i>';
      let iconClass = '';
      if (node.type === 'ecu') {
        typeIcon = '<i class="fa-solid fa-microchip"></i>';
        iconClass = 'ecu';
      } else if (node.type === 'folder') {
        typeIcon = '<i class="fa-solid fa-folder"></i>';
        iconClass = 'folder';
      } else if (node.type === 'message') {
        typeIcon = '<i class="fa-solid fa-envelope"></i>';
        iconClass = 'message';
      }
      
      const iconHtml = `<span class="tree-node-icon ${iconClass}">${typeIcon}</span>`;
      const idHtml = (node.type === 'message') ? `<span class="tree-node-id">${node.id}</span>` : '';
      
      let html = `<div class="tree-node">
        <div class="tree-node-row ${isSelected ? 'is-selected' : ''}" data-node-id="${node.id}" data-node-name="${node.name}">
          ${indents}
          ${toggleIcon}
          ${checkboxHtml}
          ${iconHtml}
          <span class="tree-node-name" title="${node.name}">${node.name}</span>
          ${idHtml}
        </div>`;
        
      if (hasChildren && (isExpanded || query)) {
        html += '<div class="tree-node-children">';
        node.children.forEach(child => {
          html += generateHtml(child, depth + 1);
        });
        html += '</div>';
      }
      
      html += '</div>';
      return html;
    }
    
    function matchSearch(node, queryStr) {
      if (node.name.toLowerCase().includes(queryStr) || node.id.toLowerCase().includes(queryStr)) {
        return true;
      }
      if (node.children) {
        return node.children.some(child => matchSearch(child, queryStr));
      }
      return false;
    }
    
    treeContainer.innerHTML = generateHtml(signalTreeState.root);
  }

  function initSignalSelectModal(modalEl) {
    if (signalSelectInitialized) return;
    
    const confirmBtn = document.getElementById('btn-confirm-signal-select');
    const searchBtn = document.getElementById('signal-search-btn');
    const searchInput = document.getElementById('signal-search-input');
    
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const selectedMessages = [];
        function collectChecked(node) {
          if (node.type === 'message' && node.checked) {
            selectedMessages.push(node);
          }
          if (node.children) {
            node.children.forEach(collectChecked);
          }
        }
        collectChecked(signalTreeState.root);
        
        if (selectedMessages.length === 0) {
          if (window.showToast) window.showToast('请至少选择一条报文！');
          return;
        }
        
        selectedMessages.forEach(item => {
          const newMsg = {
            id: nextId(),
            name: item.name,
            sending: false,
            trigger: 'cycle',
            triggerKey: 'D',
            cycleMs: item.cycleMs || 10,
            is29bit: false,
            canId: item.id,
            dlc: item.dlc || 8,
            data: [...item.data]
          };
          state.messages.push(newMsg);
        });
        
        state.selectedIdx = state.messages.length - 1;
        render();
        
        if (window.showToast) {
          window.showToast(`已成功添加 ${selectedMessages.length} 条报文到仿真列表中`);
        }
        
        if (window.hideModal) {
          window.hideModal(modalEl);
        } else {
          modalEl.classList.add('is-hidden');
        }
      };
    }
    
    if (searchBtn) {
      searchBtn.onclick = () => {
        signalTreeState.searchQuery = searchInput.value.trim().toLowerCase();
        renderSignalTree();
      };
    }
    
    if (searchInput) {
      searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          signalTreeState.searchQuery = searchInput.value.trim().toLowerCase();
          renderSignalTree();
        }
      };
    }
    
    const treeContainer = document.getElementById('signal-tree-container');
    if (treeContainer) {
      treeContainer.onclick = (e) => {
        const toggleBtn = e.target.closest('.tree-node-toggle');
        if (toggleBtn) {
          e.stopPropagation();
          const nodeId = toggleBtn.dataset.nodeId;
          const nodeName = toggleBtn.dataset.nodeName;
          const node = findNodeInTree(signalTreeState.root, nodeName, nodeId);
          if (node) {
            node.expanded = !node.expanded;
            renderSignalTree();
          }
          return;
        }
        
        const checkbox = e.target.closest('.tree-node-checkbox');
        if (checkbox) {
          e.stopPropagation();
          const nodeId = checkbox.dataset.nodeId;
          const nodeName = checkbox.dataset.nodeName;
          const node = findNodeInTree(signalTreeState.root, nodeName, nodeId);
          if (node) {
            node.checked = checkbox.checked;
            toggleChildrenChecked(node, checkbox.checked);
            updateParentCheckedState(signalTreeState.root);
            renderSignalTree();
          }
          return;
        }
        
        const nodeRow = e.target.closest('.tree-node-row');
        if (nodeRow) {
          e.stopPropagation();
          const nodeId = nodeRow.dataset.nodeId;
          const nodeName = nodeRow.dataset.nodeName;
          const node = findNodeInTree(signalTreeState.root, nodeName, nodeId);
          if (node) {
            signalTreeState.selectedNode = node;
            updateDetailView(node);
            
            const activeRows = treeContainer.querySelectorAll('.tree-node-row');
            activeRows.forEach(r => r.classList.remove('is-selected'));
            nodeRow.classList.add('is-selected');
          }
        }
      };
    }
    
    signalSelectInitialized = true;
  }

  /* ============================
     操作：添加报文
     ============================ */
  function doAdd() {
    const modalEl = document.getElementById('modal-signal-select');
    if (!modalEl) {
      const msg = createDefaultMsg();
      state.messages.push(msg);
      state.selectedIdx = state.messages.length - 1;
      render();
      return;
    }
    
    initSignalSelectModal(modalEl);
    clearSignalTreeSelection();
    renderSignalTree();
    
    if (window.showModal) {
      window.showModal(modalEl);
    } else {
      modalEl.classList.remove('is-hidden');
    }
  }

  /* ============================
     操作：添加原始报文
     ============================ */
  function doAddRaw() {
    const msg = createDefaultMsg();
    state.messages.push(msg);
    state.selectedIdx = state.messages.length - 1;
    render();
    if (window.showToast) {
      window.showToast("已成功添加一条原始报文");
    }
  }

  /* ============================
     操作：复制选中报文
     ============================ */
  function doCopy() {
    if (state.messages.length === 0) return;
    const src = state.messages[state.selectedIdx];
    if (!src) return;
    const copy = cloneMsg(src);
    copy.name = src.name + '_copy';
    state.messages.splice(state.selectedIdx + 1, 0, copy);
    state.selectedIdx += 1;
    render();
  }

  /* ============================
     操作：删除选中报文
     ============================ */
  function doDelete() {
    if (state.messages.length === 0) return;
    state.messages.splice(state.selectedIdx, 1);
    if (state.selectedIdx >= state.messages.length) {
      state.selectedIdx = Math.max(0, state.messages.length - 1);
    }
    render();
  }

  /* ============================
     操作：添加DBC报文
     ============================ */
  function doAddDBC() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.dbc';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        state.dbcName = file.name;
        render();
        if (window.showToast) {
          window.showToast(`导入 DBC 成功！加载文件：${file.name}`);
        }
      }
      document.body.removeChild(fileInput);
    };
    
    fileInput.click();
  }

  /* ============================
     操作：协议切换 (CAN <-> CANFD)
     ============================ */
  function doSwitchProtocol() {
    if (window.ConsoleDiagram) {
      window.ConsoleDiagram.switchProtocol('can1');
      const bus = window.ConsoleDiagram.getBusConfig('can1');
      if (bus) {
        state.busName = bus.name;
        // 同步修改当前的位定时参数值以符合“刷写配置-总线参数”
        if (bus.type === 'canfd') {
          state.timeQuanta = '20';
          state.phaseSeg1 = '14';
          state.phaseSeg2 = '5';
          state.sjw = '2';
          state.baudRate = bus.baudrate || '500 kbps';
        } else {
          state.timeQuanta = '16';
          state.phaseSeg1 = '11';
          state.phaseSeg2 = '4';
          state.sjw = '1';
          state.baudRate = bus.baudrate || '500 kbps';
        }
        render();
        if (window.showToast) {
          window.showToast(`总线协议已成功切换为 ${bus.name}！`);
        }
      }
    } else {
      state.busName = state.busName.startsWith('CANFD') ? 'CAN1' : 'CANFD1';
      render();
    }
  }

  /* ============================
     操作：打开总线参数设置弹框
     ============================ */
  function doOpenSettings() {
    const isCanFd = state.busName.startsWith('CANFD');
    const modalHtml = `
      <div class="bus-settings-overlay" id="can-bus-settings-modal">
        <div class="bus-settings-card">
          <div class="bus-settings-header">
            <h3><i class="fa-solid fa-gear" style="color: var(--accent);"></i> ${state.busName} 总线参数设置</h3>
            <button class="bus-settings-close" id="can-bus-settings-close-btn">&times;</button>
          </div>
          <div class="bus-settings-body">
            <form id="can-bus-settings-form" class="bus-settings-form-grid">
              <div class="bus-settings-form-item">
                <label>总线类型</label>
                <input class="bus-settings-input" type="text" value="${isCanFd ? 'CANFD' : 'CAN'}" disabled />
              </div>
              <div class="bus-settings-form-item">
                <label>总线名称</label>
                <input class="bus-settings-input" type="text" id="can-set-name" value="${state.busName}" />
              </div>
              <div class="bus-settings-form-item">
                <label>标准波特率</label>
                <select class="bus-settings-select" id="can-set-baud">
                  ${['100 kbps', '125 kbps', '250 kbps', '500 kbps', '1 Mbps'].map(v => `<option value="${v}" ${v === state.baudRate ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>
              ${isCanFd ? `
              <div class="bus-settings-form-item">
                <label>数据波特率</label>
                <select class="bus-settings-select" id="can-set-databaud">
                  ${['2 Mbps', '4 Mbps', '6 Mbps'].map(v => `<option value="${v}" ${v === state.dataRate ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>
              ` : `
              <div class="bus-settings-form-item">
                <label>数据波特率</label>
                <input class="bus-settings-input" type="text" value="--" disabled />
              </div>
              `}
              <div class="bus-settings-form-item">
                <label>采样点</label>
                <input class="bus-settings-input" type="text" id="can-set-sp" value="${state.samplePoint}" />
              </div>
              <div class="bus-settings-form-item">
                <label>Tq</label>
                <input class="bus-settings-input" type="text" id="can-set-tq" value="${state.tq}" />
              </div>
              <div class="bus-settings-form-item">
                <label>时间量</label>
                <input class="bus-settings-input" type="text" id="can-set-timequanta" value="${state.timeQuanta}" />
              </div>
              <div class="bus-settings-form-item">
                <label>预定标器</label>
                <input class="bus-settings-input" type="text" id="can-set-prescaler" value="${state.prescaler}" />
              </div>
              <div class="bus-settings-form-item">
                <label>位定时段1</label>
                <input class="bus-settings-input" type="text" id="can-set-seg1" value="${state.phaseSeg1}" />
              </div>
              <div class="bus-settings-form-item">
                <label>位定时段2</label>
                <input class="bus-settings-input" type="text" id="can-set-seg2" value="${state.phaseSeg2}" />
              </div>
              <div class="bus-settings-form-item">
                <label>同步跳转宽度 (SJW)</label>
                <input class="bus-settings-input" type="text" id="can-set-sjw" value="${state.sjw}" />
              </div>

            </form>
          </div>
          <div class="bus-settings-footer">
            <button class="bus-settings-btn" id="can-bus-settings-cancel-btn">取消</button>
            <button class="bus-settings-btn primary" id="can-bus-settings-save-btn">保存</button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    const modalEl = div.firstElementChild;
    document.body.appendChild(modalEl);

    // 绑定弹窗事件
    const closeBtn = modalEl.querySelector('#can-bus-settings-close-btn');
    const cancelBtn = modalEl.querySelector('#can-bus-settings-cancel-btn');
    const saveBtn = modalEl.querySelector('#can-bus-settings-save-btn');

    const closeModal = () => {
      document.body.removeChild(modalEl);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    saveBtn.addEventListener('click', () => {
      const newName = modalEl.querySelector('#can-set-name').value.trim();
      if (!newName) {
        if (window.showToast) window.showToast('总线名称不能为空！');
        return;
      }
      state.busName = newName;
      state.baudRate = modalEl.querySelector('#can-set-baud').value;
      if (isCanFd) {
        state.dataRate = modalEl.querySelector('#can-set-databaud').value;
      }
      state.samplePoint = modalEl.querySelector('#can-set-sp').value.trim();
      state.tq = modalEl.querySelector('#can-set-tq').value.trim();
      state.timeQuanta = modalEl.querySelector('#can-set-timequanta').value.trim();
      state.prescaler = modalEl.querySelector('#can-set-prescaler').value.trim();
      state.phaseSeg1 = modalEl.querySelector('#can-set-seg1').value.trim();
      state.phaseSeg2 = modalEl.querySelector('#can-set-seg2').value.trim();
      state.sjw = modalEl.querySelector('#can-set-sjw').value.trim();


      // 同步拓扑视图中总线的名称与波特率显示
      if (window.ConsoleDiagram) {
        const bus = window.ConsoleDiagram.getBusConfig('can1');
        if (bus) {
          bus.name = state.busName;
          bus.baudrate = state.baudRate;
          // 重新刷新拓扑图顶部 Tabs
          const tabsEl = document.getElementById("console-topo-tabs");
          if (tabsEl) {
            // 在 tabsEl 中寻找对应的 tab
            const tabs = tabsEl.querySelectorAll('.console-topo-tab');
            tabs.forEach(tab => {
              if (tab.dataset.busId === 'can1') {
                tab.textContent = state.busName;
              }
            });
          }
          // 重新刷新拓扑图 InfoBar
          const infoEl = document.getElementById("console-topo-info");
          if (infoEl) {
            const valEls = infoEl.querySelectorAll('.console-topo-info__val');
            if (valEls.length >= 2) {
              valEls[1].textContent = state.baudRate;
            }
          }
        }
      }

      closeModal();
      render();
      if (window.showToast) {
        window.showToast(`保存总线 ${state.busName} 的设置成功！`);
      }
    });
  }

  /* ============================
     操作：全部清除
     ============================ */
  function doClearAll() {
    if (state.messages.length === 0) return;
    // 停止所有周期定时器
    state.messages.forEach(msg => {
      msg.sending = false;
    });
    updateSendTimers();
    state.messages = [];
    state.selectedIdx = 0;
    render();
    if (window.showToast) {
      window.showToast('已清除全部报文。');
    }
  }

  /* ============================
     操作：全部播放 / 全部停止
     ============================ */
  function doPlayAll() {
    state.messages.forEach((m) => { m.sending = true; });
    render();
  }

  function doStopAll() {
    state.messages.forEach((m) => { m.sending = false; });
    render();
  }

  /* ============================
     操作：切换单条报文发送状态
     ============================ */
  function doToggleSend(idx) {
    if (idx < 0 || idx >= state.messages.length) return;
    state.messages[idx].sending = !state.messages[idx].sending;
    render();
  }

  /* ============================
     操作：上移 / 下移
     ============================ */
  function doMoveUp() {
    if (state.selectedIdx <= 0) return;
    const i = state.selectedIdx;
    [state.messages[i - 1], state.messages[i]] = [state.messages[i], state.messages[i - 1]];
    state.selectedIdx -= 1;
    render();
  }

  function doMoveDown() {
    if (state.selectedIdx >= state.messages.length - 1) return;
    const i = state.selectedIdx;
    [state.messages[i], state.messages[i + 1]] = [state.messages[i + 1], state.messages[i]];
    state.selectedIdx += 1;
    render();
  }

  /* ============================
     全局键盘与点击处理
     ============================ */
  let _hasGlobalKeyBind = false;
  function bindGlobalKeyboard() {
    if (_hasGlobalKeyBind) return;
    window.addEventListener('keydown', (e) => {
      if (panelEl && !panelEl.classList.contains('is-hidden')) {
        // 判断是否为输入框焦点，若是，则不触发快捷键，防止打字冲突
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (e.ctrlKey) {
          const keyChar = e.key.toUpperCase();
          state.messages.forEach((msg, idx) => {
            if (msg.trigger !== 'cycle' && (msg.triggerKey || 'A') === keyChar) {
              e.preventDefault();
              doToggleSend(idx);
            }
          });
        }
      }
    });
    _hasGlobalKeyBind = true;
  }

  let _hasGlobalClickBind = false;
  function bindGlobalClick() {
    if (_hasGlobalClickBind) return;
    document.addEventListener('mousedown', (e) => {
      if (state.openPopoverId && panelEl && !panelEl.classList.contains('is-hidden')) {
        const wrap = e.target.closest('.sim-trigger-cell-wrap');
        if (!wrap) {
          state.openPopoverId = null;
          render();
        }
      }
    });
    _hasGlobalClickBind = true;
  }

  /* ============================
     激活面板
     ============================ */
  function activate(busId, busName) {
    state.openPopoverId = null; // 激活时清空任何打开的弹窗
    panelEl = document.getElementById('console-can-panel');
    if (!panelEl) {
      console.warn('[ConsoleCan] 未找到 #console-can-panel 容器');
      return;
    }

    // 从全局 ConsoleDiagram 同步总线名称与类型，以自适应切换 CAN / CANFD 参数
    if (window.ConsoleDiagram) {
      const bus = window.ConsoleDiagram.getBusConfig(busId);
      if (bus) {
        state.busName = bus.name;
        // 同步修改当前的位定时参数
        if (bus.type === 'canfd') {
          state.timeQuanta = '20';
          state.phaseSeg1 = '14';
          state.phaseSeg2 = '5';
          state.sjw = '2';
          state.baudRate = bus.baudrate || '500 kbps';
        } else {
          state.timeQuanta = '16';
          state.phaseSeg1 = '11';
          state.phaseSeg2 = '4';
          state.sjw = '1';
          state.baudRate = bus.baudrate || '500 kbps';
        }
      }
    } else {
      state.busName = busName || 'CAN1';
    }

    panelEl.classList.add('console-sim-panel');
    render();
    bindGlobalKeyboard();
    bindGlobalClick();
  }

  /* ============================
     公开 API
     ============================ */
  return { activate, render, importDBC: doAddDBC };
})();
