/**
 * Console ETH Simulation Panel
 * ETH UDP 报文仿真发送面板 —— 模拟 CANoe Interactive Generator (IG) 的以太网仿真功能
 *
 * 功能：
 * - 仅支持 UDP 报文的仿真发送
 * - 报文列表管理（添加、复制、删除、清空、全部发送、全部停止、上移、下移）
 * - 支持三种协议头填充：Raw UDP、DoIP、SOME/IP
 * - 精细的网络参数编辑：源/目的 IP，源/目的端口
 * - 动态的协议头字段编辑器（支持 DoIP SA/TA/PayloadType，SOME/IP Service/Method/Client/Session ID 等）
 * - 8字节 HexDump 格式 Payload 编辑器，包含 Offset 列和 ASCII 字符显示，支持 [+8B] [-8B] [清空]
 * - 分割线拖拽：支持调整上下区域比例
 */
window.ConsoleEth = (() => {
  /* ============================
     面板容器（由外部传入或查找）
     ============================ */
  let panelEl = null;

  /* ============================
     内部状态
     ============================ */
  const state = {
    busName: 'Ethernet1',
    messages: [
      {
        id: 'eth-msg-1',
        name: 'UDP_Diag_Request',
        sending: false,
        protocol: 'raw',   // 'raw' | 'doip' | 'someip'
        trigger: 'cycle',    // 'cycle' | 'once' | 'key'
        triggerKey: 'A',
        cycleMs: 100,
        srcIp: '192.168.1.10',
        dstIp: '192.168.1.100',
        srcPort: 53100,
        dstPort: 13400,
        payload: [0x10, 0x01, 0x00, 0x00, 0x22, 0xf1, 0x90],
      },
      {
        id: 'eth-msg-2',
        name: 'UDP_Sensor_Data',
        sending: false,
        protocol: 'raw',
        trigger: 'cycle',
        triggerKey: 'B',
        cycleMs: 200,
        srcIp: '192.168.1.10',
        dstIp: '192.168.1.100',
        srcPort: 30490,
        dstPort: 30490,
        payload: [0xaa, 0xbb, 0xcc, 0xdd, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88],
      }
    ],
    selectedIdx: 0,
    defaultCycle: 100,
    splitRatio: 0.45,  // 上方区域占比
    openPopoverId: null,
    // 以下为新增的 ETH 总线参数，与“刷写配置”的参数对齐
    baudRate: '100 Mbps',
    connectionType: 'OBD转以太网'
  };

  /* ============================
     定时器与以太网仿真发送
     ============================ */
  const timers = {}; // msgId -> { intervalId, ms }

  /** 组装 DoIP 完整字节流 (8B Header + DoIP Payload) */
  const buildDoIPBytes = (msg) => {
    const doip = msg.doip || {};
    const sa = doip.sourceAddr || 0;
    const ta = doip.targetAddr || 0;
    const uds = msg.payload || [];
    
    // 如果是 0x8001 (Diagnostic Message)，载荷以 SA(2B) + TA(2B) 开头，然后是 UDS payload
    let doipPayload = [];
    if (doip.payloadType === 0x8001) {
      doipPayload = [
        (sa >> 8) & 0xFF, sa & 0xFF,
        (ta >> 8) & 0xFF, ta & 0xFF,
        ...uds
      ];
    } else {
      doipPayload = [...uds];
    }
    
    const len = doipPayload.length;
    const header = [
      doip.version & 0xFF,
      doip.invVersion & 0xFF,
      (doip.payloadType >> 8) & 0xFF, doip.payloadType & 0xFF,
      (len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF
    ];
    
    return [...header, ...doipPayload];
  };

  /** 组装 SOME/IP 完整字节流 (16B Header + Payload) */
  const buildSomeIPBytes = (msg) => {
    const someip = msg.someip || {};
    const uds = msg.payload || [];
    const payloadLen = 8 + uds.length; // SOME/IP length 字段为后面所有字段的总长度
    
    const header = [
      (someip.serviceId >> 8) & 0xFF, someip.serviceId & 0xFF,
      (someip.methodId >> 8) & 0xFF, someip.methodId & 0xFF,
      (payloadLen >> 24) & 0xFF, (payloadLen >> 16) & 0xFF, (payloadLen >> 8) & 0xFF, payloadLen & 0xFF,
      (someip.clientId >> 8) & 0xFF, someip.clientId & 0xFF,
      (someip.sessionId >> 8) & 0xFF, someip.sessionId & 0xFF,
      someip.protocolVersion & 0xFF,
      someip.interfaceVersion & 0xFF,
      someip.messageType & 0xFF,
      someip.returnCode & 0xFF
    ];
    
    return [...header, ...uds];
  };

  function updateSendTimers() {
    // 清除已停发或删除的定时器
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
              let packet = [];
              let packetType = '';
              if (msg.protocol === 'doip') {
                packet = buildDoIPBytes(msg);
                packetType = 'DoIP (UDP)';
              } else if (msg.protocol === 'someip') {
                packet = buildSomeIPBytes(msg);
                packetType = 'SOME/IP (UDP)';
              } else {
                packet = msg.payload || [];
                packetType = 'Raw UDP';
              }
              const hexStr = packet.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
              const logMsg = `[ETH ${state.busName}] Tx: [${packetType}] ${msg.srcIp}:${msg.srcPort} -> ${msg.dstIp}:${msg.dstPort} | Data=[${hexStr}] | len=${packet.length}B`;
              if (window.addLog) window.addLog(logMsg);
              if (window.ConsoleTrace && window.ConsoleTrace.addTraceEntry) {
                window.ConsoleTrace.addTraceEntry({
                  channel: state.busName,
                  id: 'UDP',
                  name: msg.name,
                  dir: 'Tx',
                  dlc: packet.length,
                  data: hexStr
                });
              }
            };
            const interval = Math.max(10, currentInterval);
            timers[msg.id] = {
              intervalId: setInterval(sendFn, interval),
              ms: interval
            };
          } else if (timers[msg.id].ms !== currentInterval) {
            clearInterval(timers[msg.id].intervalId);
            const sendFn = () => {
              let packet = [];
              let packetType = '';
              if (msg.protocol === 'doip') {
                packet = buildDoIPBytes(msg);
                packetType = 'DoIP (UDP)';
              } else if (msg.protocol === 'someip') {
                packet = buildSomeIPBytes(msg);
                packetType = 'SOME/IP (UDP)';
              } else {
                packet = msg.payload || [];
                packetType = 'Raw UDP';
              }
              const hexStr = packet.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
              const logMsg = `[ETH ${state.busName}] Tx: [${packetType}] ${msg.srcIp}:${msg.srcPort} -> ${msg.dstIp}:${msg.dstPort} | Data=[${hexStr}] | len=${packet.length}B`;
              if (window.addLog) window.addLog(logMsg);
              if (window.ConsoleTrace && window.ConsoleTrace.addTraceEntry) {
                window.ConsoleTrace.addTraceEntry({
                  channel: state.busName,
                  id: 'UDP',
                  name: msg.name,
                  dir: 'Tx',
                  dlc: packet.length,
                  data: hexStr
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
          // 'once' 或 'key'，立即模拟发送一次
          let packet = [];
          let packetType = '';
          if (msg.protocol === 'doip') {
            packet = buildDoIPBytes(msg);
            packetType = 'DoIP (UDP)';
          } else if (msg.protocol === 'someip') {
            packet = buildSomeIPBytes(msg);
            packetType = 'SOME/IP (UDP)';
          } else {
            packet = msg.payload || [];
            packetType = 'Raw UDP';
          }
          const hexStr = packet.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
          const logMsg = `[ETH ${state.busName}] Tx (单次): [${packetType}] ${msg.srcIp}:${msg.srcPort} -> ${msg.dstIp}:${msg.dstPort} | Data=[${hexStr}] | len=${packet.length}B`;
          if (window.addLog) window.addLog(logMsg);
          if (window.ConsoleTrace && window.ConsoleTrace.addTraceEntry) {
            window.ConsoleTrace.addTraceEntry({
              channel: state.busName,
              id: 'UDP',
              name: msg.name,
              dir: 'Tx',
              dlc: packet.length,
              data: hexStr
            });
          }
          
          msg.sending = false;
          setTimeout(render, 50);
        }
      }
    });
  }

  /* ============================
     工具函数
     ============================ */
  let _idCounter = 100;
  const nextId = () => `eth-msg-${++_idCounter}`;

  /** 数字转为指定位数的 HEX 字符串 */
  const toHex = (n, len = 2) => {
    if (isNaN(n)) return ''.padStart(len, '0');
    return n.toString(16).toUpperCase().padStart(len, '0');
  };

  /** 解析 HEX 字符串为数值 */
  const parseHexVal = (str, def = 0) => {
    const n = parseInt(str, 16);
    return isNaN(n) ? def : n;
  };

  /** 解析单个 HEX 字节 */
  const parseHexByte = (str) => {
    const n = parseInt(str, 16);
    return isNaN(n) ? 0 : Math.min(255, Math.max(0, n));
  };

  /** 生成一条默认报文 */
  const createDefaultMsg = () => ({
    id: nextId(),
    name: 'New_Ethernet_Msg',
    sending: false,
    protocol: 'raw',
    trigger: 'cycle',
    triggerKey: 'A',
    cycleMs: state.defaultCycle,
    srcIp: '192.168.1.10',
    dstIp: '192.168.1.100',
    srcPort: 50000,
    dstPort: 50000,
    doip: {
      version: 0x02,
      invVersion: 0xFD,
      payloadType: 0x8001,
      sourceAddr: 0x0E80,
      targetAddr: 0x1000,
    },
    someip: {
      serviceId: 0xFFFF,
      methodId: 0x8100,
      clientId: 0x0001,
      sessionId: 0x0001,
      protocolVersion: 0x01,
      interfaceVersion: 0x01,
      messageType: 0x02,
      returnCode: 0x00,
    },
    payload: [0x00, 0x00, 0x00, 0x00],
  });

  /** 深拷贝一条报文 */
  const cloneMsg = (msg) => ({
    ...msg,
    id: nextId(),
    triggerKey: msg.triggerKey || 'A',
    doip: { ...msg.doip },
    someip: { ...msg.someip },
    payload: [...msg.payload],
  });

  /** 计算包的总长度 (协议头 + Payload) */
  const getPacketLength = (msg) => {
    let headerLen = 0;
    if (msg.protocol === 'doip') {
      headerLen = 8; // DoIP header is always 8 bytes
    } else if (msg.protocol === 'someip') {
      headerLen = 16; // SOME/IP header is always 16 bytes (including 8B header + 8B length/session/msgtype/retcode etc.)
    }
    return headerLen + msg.payload.length;
  };

  /* ============================
     渲染：标题栏
     ============================ */
  function renderTitle() {
    return `<div class="console-sim-title">
      <div class="console-sim-title-left">
        <i class="fa-solid fa-network-wired console-sim-title__icon" style="color:#0078d4"></i>
        <span class="console-sim-title__text">仿真 - ${state.busName} (UDP)</span>
      </div>
      <div class="console-sim-title-actions">
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
      <button class="console-sim-toolbar__btn console-sim-toolbar__btn--add" data-action="add" title="添加报文">
        <i class="fa-solid fa-plus"></i>
      </button>
      <button class="console-sim-toolbar__btn console-sim-toolbar__btn--copy" data-action="copy" title="复制报文">
        <i class="fa-solid fa-copy"></i>
      </button>
      <button class="console-sim-toolbar__btn console-sim-toolbar__btn--delete" data-action="delete" title="单个删除">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <span class="console-sim-toolbar__sep"></span>
      <button class="console-sim-toolbar__btn console-sim-toolbar__btn--play" data-action="play-all" title="全部开始发送">
        <i class="fa-solid fa-play"></i>
      </button>
      <button class="console-sim-toolbar__btn console-sim-toolbar__btn--stop" data-action="stop-all" title="全部停止发送">
        <i class="fa-solid fa-square"></i>
      </button>
      <button class="console-sim-toolbar__btn console-sim-toolbar__btn--settings" data-action="clear-all" title="全部清除" style="color:#e6a23c;">
        <i class="fa-solid fa-broom"></i>
      </button>
      <span class="console-sim-toolbar__sep"></span>
      <button class="console-sim-toolbar__btn console-sim-toolbar__btn--up" data-action="move-up" title="上移">
        <i class="fa-solid fa-arrow-up"></i>
      </button>
      <button class="console-sim-toolbar__btn console-sim-toolbar__btn--down" data-action="move-down" title="下移">
        <i class="fa-solid fa-arrow-down"></i>
      </button>
    </div>`;
  }

  /* ============================
     渲染：上方报文列表表格
     ============================ */
  function renderUpper() {
    let rows = '';
    state.messages.forEach((msg, idx) => {
      const isSelected = idx === state.selectedIdx;
      const rowCls = isSelected ? 'console-sim-row is-selected' : 'console-sim-row';

      // 发送状态图标
      const sendIcon = msg.sending
        ? '<i class="fa-solid fa-pause" style="color:#c03030"></i>'
        : '<i class="fa-solid fa-play" style="color:#2e8b2e"></i>';
      const sendBtnCls = msg.sending ? 'sim-send-btn is-sending' : 'sim-send-btn';

      // 协议头文字显示
      let protoLabel = 'Raw UDP';
      if (msg.protocol === 'doip') protoLabel = 'DoIP';
      if (msg.protocol === 'someip') protoLabel = 'SOME/IP';

      const totalLen = getPacketLength(msg);

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
        <td style="width:45px;text-align:center">
          <button class="${sendBtnCls}" data-action="toggle-send" data-idx="${idx}" title="${msg.sending ? '暂停' : '发送'}">${sendIcon}</button>
        </td>
        <td style="width:100px; color: var(--text-muted); font-weight: 500; font-size: 13px;">
          Raw UDP
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
          <input type="text" class="sim-id-input" data-field="name" data-idx="${idx}" value="${msg.name}" title="报文名称">
        </td>
        <td style="width:200px">
          <input type="text" class="sim-id-input" data-field="dstAddress" data-idx="${idx}" value="${msg.dstIp}:${msg.dstPort}" title="目标IP:端口" placeholder="192.168.1.100:13400">
        </td>
        <td style="width:80px;text-align:center;font-weight:600;color:#555;">
          ${totalLen} B
        </td>
      </tr>`;
    });

    return `<div class="console-sim-upper" style="flex:${state.splitRatio}">
      <table class="console-sim-table">
        <thead>
          <tr>
            <th style="width:45px;text-align:center">发送</th>
            <th style="width:100px">协议</th>
            <th style="width:145px;text-align:center">触发器</th>
            <th>名称</th>
            <th style="width:200px">目标IP:端口</th>
            <th style="width:80px;text-align:center">长度</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">列表为空，请点击左上角【+】添加 UDP 报文</td></tr>'}
        </tbody>
      </table>
    </div>`;
  }

  /* ============================
     渲染：分割线
     ============================ */
  function renderSplitter() {
    return `<div class="console-sim-hsplitter" data-action="splitter">
      <span class="console-sim-hsplitter__handle"><i class="fa-solid fa-ellipsis"></i></span>
    </div>`;
  }

  /* ============================
     渲染：下方详情编辑区
     ============================ */
  function renderLower() {
    const msg = state.messages[state.selectedIdx];
    if (!msg) {
      return `<div class="console-sim-lower" style="flex:${1 - state.splitRatio};display:flex;align-items:center;justify-content:center;color:#999;">
        请在上方列表中选中报文进行参数编辑
      </div>`;
    }

    return `<div class="console-sim-lower" style="flex:${1 - state.splitRatio}">
      <!-- 1. 网络参数段 -->
      ${renderNetParams(msg)}
      
      <!-- 2. 协议头段 -->
      ${renderProtocolHeader(msg)}
      
      <!-- 3. Payload HEX编辑器 -->
      ${renderPayloadEditor(msg)}
    </div>`;
  }

  /* --- 网络参数 --- */
  function renderNetParams(msg) {
    return `<div class="sim-net-params">
      <div class="sim-net-params__group">
        <div class="sim-net-params__group-title">源端网络 (Local)</div>
        <div class="sim-net-params__row">
          <span class="sim-net-params__label">源 IP 地址</span>
          <input type="text" class="sim-net-params__input" data-field="srcIp" value="${msg.srcIp}" placeholder="如 192.168.1.10">
          <span class="sim-net-params__label">源端口</span>
          <input type="number" class="sim-net-params__input" data-field="srcPort" value="${msg.srcPort}" placeholder="0 (随机)" min="0" max="65535" style="width:70px;">
        </div>
      </div>
      <div class="sim-net-params__group" style="margin-left:24px;">
        <div class="sim-net-params__group-title">目标网络 (Remote)</div>
        <div class="sim-net-params__row">
          <span class="sim-net-params__label">目标 IP 地址</span>
          <input type="text" class="sim-net-params__input" data-field="dstIp" value="${msg.dstIp}" placeholder="如 192.168.1.100">
          <span class="sim-net-params__label">目的端口</span>
          <input type="number" class="sim-net-params__input" data-field="dstPort" value="${msg.dstPort}" placeholder="13400" min="0" max="65535" style="width:70px;">
        </div>
      </div>
    </div>`;
  }

  /* --- 协议头编辑器 (DoIP / SOMEIP / Raw) --- */
  function renderProtocolHeader(msg) {
    if (msg.protocol === 'raw') {
      return ''; // Raw UDP 不需要特殊字段头
    }

    if (msg.protocol === 'doip') {
      const doip = msg.doip || {};
      // 常用 doip 负载类型选项
      const types = [
        { val: 0x0001, label: '0x0001 - Vehicle ID Request' },
        { val: 0x0005, label: '0x0005 - Routing Activation Req' },
        { val: 0x0006, label: '0x0006 - Routing Activation Resp' },
        { val: 0x0007, label: '0x0007 - Alive Check Req' },
        { val: 0x8001, label: '0x8001 - Diagnostic Message' },
        { val: 0x8002, label: '0x8002 - Diagnostic Message Ack' },
        { val: 0x8003, label: '0x8003 - Diagnostic Message Nack' }
      ];

      return `<div class="sim-protocol-header">
        <div class="sim-protocol-header__title">DoIP Header (Diagnostics over IP)</div>
        <div class="sim-protocol-header__fields">
          <div class="sim-protocol-header__field">
            <label>协议版本 (Ver)</label>
            <input type="text" class="console-sim-mono" data-proto="doip" data-field="version" value="${toHex(doip.version, 2)}" maxlength="2" style="width:36px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>逆版本 (InvVer)</label>
            <input type="text" class="console-sim-mono" data-proto="doip" data-field="invVersion" value="${toHex(doip.invVersion, 2)}" maxlength="2" style="width:36px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>负载类型 (PayloadType)</label>
            <select data-proto="doip" data-field="payloadType" style="height:20px;font-size:11px;">
              ${types.map(t => `<option value="${t.val}" ${doip.payloadType === t.val ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="sim-protocol-header__field">
            <label>源地址 (SA)</label>
            <input type="text" class="console-sim-mono" data-proto="doip" data-field="sourceAddr" value="${toHex(doip.sourceAddr, 4)}" maxlength="4" style="width:50px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>目标地址 (TA)</label>
            <input type="text" class="console-sim-mono" data-proto="doip" data-field="targetAddr" value="${toHex(doip.targetAddr, 4)}" maxlength="4" style="width:50px;text-align:center;">
          </div>
        </div>
      </div>`;
    }

    if (msg.protocol === 'someip') {
      const someip = msg.someip || {};
      const msgTypes = [
        { val: 0x00, label: '0x00 - REQUEST' },
        { val: 0x01, label: '0x01 - REQUEST_NO_RETURN' },
        { val: 0x02, label: '0x02 - NOTIFICATION' },
        { val: 0x80, label: '0x80 - RESPONSE' },
        { val: 0x81, label: '0x81 - ERROR' }
      ];

      return `<div class="sim-protocol-header">
        <div class="sim-protocol-header__title">SOME/IP Header (Scalable service-Oriented MiddlewarE over IP)</div>
        <div class="sim-protocol-header__fields">
          <div class="sim-protocol-header__field">
            <label>Service ID</label>
            <input type="text" class="console-sim-mono" data-proto="someip" data-field="serviceId" value="${toHex(someip.serviceId, 4)}" maxlength="4" style="width:50px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>Method ID</label>
            <input type="text" class="console-sim-mono" data-proto="someip" data-field="methodId" value="${toHex(someip.methodId, 4)}" maxlength="4" style="width:50px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>Client ID</label>
            <input type="text" class="console-sim-mono" data-proto="someip" data-field="clientId" value="${toHex(someip.clientId, 4)}" maxlength="4" style="width:50px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>Session ID</label>
            <input type="text" class="console-sim-mono" data-proto="someip" data-field="sessionId" value="${toHex(someip.sessionId, 4)}" maxlength="4" style="width:50px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>Protocol Ver</label>
            <input type="text" class="console-sim-mono" data-proto="someip" data-field="protocolVersion" value="${toHex(someip.protocolVersion, 2)}" maxlength="2" style="width:30px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>Interface Ver</label>
            <input type="text" class="console-sim-mono" data-proto="someip" data-field="interfaceVersion" value="${toHex(someip.interfaceVersion, 2)}" maxlength="2" style="width:30px;text-align:center;">
          </div>
          <div class="sim-protocol-header__field">
            <label>Message Type</label>
            <select data-proto="someip" data-field="messageType" style="height:20px;font-size:11px;">
              ${msgTypes.map(t => `<option value="${t.val}" ${someip.messageType === t.val ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="sim-protocol-header__field">
            <label>Return Code</label>
            <input type="text" class="console-sim-mono" data-proto="someip" data-field="returnCode" value="${toHex(someip.returnCode, 2)}" maxlength="2" style="width:30px;text-align:center;">
          </div>
        </div>
      </div>`;
    }
    return '';
  }

  /** 组装完整的以太网帧字节及各字节属性 */
  const buildFullEthernetFrame = (msg) => {
    // 1. MAC Header (14B)
    const dstMac = [0x02, 0x47, 0x57, 0x4d, 0x00, 0x30]; // GWM MAC
    const srcMac = [0x00, 0xe9, 0xf7, 0x75, 0xcc, 0x1b];
    const etherType = [0x08, 0x00]; // IPv4
    const macHeader = [...dstMac, ...srcMac, ...etherType];

    // 2. Application protocol header & payload
    let appHeader = [];
    if (msg.protocol === 'doip') {
      const doip = msg.doip || {};
      const sa = doip.sourceAddr || 0;
      const ta = doip.targetAddr || 0;
      const uds = msg.payload || [];
      let doipPayload = [];
      if (doip.payloadType === 0x8001) {
        doipPayload = [
          (sa >> 8) & 0xFF, sa & 0xFF,
          (ta >> 8) & 0xFF, ta & 0xFF,
          ...uds
        ];
      } else {
        doipPayload = [...uds];
      }
      const doipLen = doipPayload.length;
      appHeader = [
        doip.version & 0xFF,
        doip.invVersion & 0xFF,
        (doip.payloadType >> 8) & 0xFF, doip.payloadType & 0xFF,
        (doipLen >> 24) & 0xFF, (doipLen >> 16) & 0xFF, (doipLen >> 8) & 0xFF, doipLen & 0xFF
      ];
      // For DoIP Diagnostic message, we also count SA and TA (4 bytes) as part of DoIP header
      if (doip.payloadType === 0x8001) {
        appHeader = [...appHeader, (sa >> 8) & 0xFF, sa & 0xFF, (ta >> 8) & 0xFF, ta & 0xFF];
      }
    } else if (msg.protocol === 'someip') {
      const someip = msg.someip || {};
      const uds = msg.payload || [];
      const payloadLen = 8 + uds.length;
      appHeader = [
        (someip.serviceId >> 8) & 0xFF, someip.serviceId & 0xFF,
        (someip.methodId >> 8) & 0xFF, someip.methodId & 0xFF,
        (payloadLen >> 24) & 0xFF, (payloadLen >> 16) & 0xFF, (payloadLen >> 8) & 0xFF, payloadLen & 0xFF,
        (someip.clientId >> 8) & 0xFF, someip.clientId & 0xFF,
        (someip.sessionId >> 8) & 0xFF, someip.sessionId & 0xFF,
        someip.protocolVersion & 0xFF,
        someip.interfaceVersion & 0xFF,
        someip.messageType & 0xFF,
        someip.returnCode & 0xFF
      ];
    }

    const udsPayload = msg.payload || [];

    // 3. UDP Header (8B) & IP Header (20B)
    const appAndPayloadLen = appHeader.length + udsPayload.length;
    const udpLen = 8 + appAndPayloadLen;
    const ipTotalLen = 20 + udpLen;

    // Source IP
    const parseIp = (ipStr, def) => {
      const parts = ipStr.split('.').map(p => parseInt(p, 10));
      if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
        return parts;
      }
      return def;
    };
    const srcIpBytes = parseIp(msg.srcIp || '192.168.1.10', [192, 168, 1, 10]);
    const dstIpBytes = parseIp(msg.dstIp || '192.168.1.100', [192, 168, 1, 100]);

    const ipHeader = [
      0x45, // Version = 4, IHL = 5
      0x00, // TOS
      (ipTotalLen >> 8) & 0xFF, ipTotalLen & 0xFF,
      0x2a, 0xca, // Identification
      0x40, 0x00, // Don't Fragment
      0x80, // TTL
      0x11, // Protocol = 17 (UDP)
      0x00, 0x00, // Header Checksum (simplified)
      ...srcIpBytes,
      ...dstIpBytes
    ];

    const srcPort = parseInt(msg.srcPort, 10) || 50000;
    const dstPort = parseInt(msg.dstPort, 10) || 13400;

    const udpHeader = [
      (srcPort >> 8) & 0xFF, srcPort & 0xFF,
      (dstPort >> 8) & 0xFF, dstPort & 0xFF,
      (udpLen >> 8) & 0xFF, udpLen & 0xFF,
      0x00, 0x00 // Checksum (simplified)
    ];

    // Assemble the complete packet
    const bytes = [
      ...macHeader, // 14B
      ...ipHeader,  // 20B
      ...udpHeader, // 8B
      ...appHeader,
      ...udsPayload
    ];

    // Construct the metadata array indicating the layer/type for each byte
    const meta = [];
    // MAC: 0 to 13
    for (let i = 0; i < 14; i++) meta.push({ type: 'mac', label: 'Ethernet MAC Header' });
    // IP: 14 to 33
    for (let i = 0; i < 20; i++) meta.push({ type: 'ip', label: 'IPv4 Header' });
    // UDP: 34 to 41
    for (let i = 0; i < 8; i++) meta.push({ type: 'udp', label: 'UDP Header' });
    // App Header: 42 to 41 + appHeader.length
    const appHeaderStart = 42;
    const appHeaderEnd = appHeaderStart + appHeader.length;
    for (let i = appHeaderStart; i < appHeaderEnd; i++) {
      meta.push({ type: 'app', label: msg.protocol.toUpperCase() + ' Header' });
    }
    // UDS Payload: from appHeaderEnd to the end
    const payloadStart = appHeaderEnd;
    for (let i = payloadStart; i < bytes.length; i++) {
      meta.push({ type: 'payload', label: 'UDS Payload', payloadIdx: i - payloadStart });
    }

    return { bytes, meta, payloadStart };
  };

  /* --- Payload HEX 编辑网格 --- */
  function renderPayloadEditor(msg) {
    const payload = msg.payload || [];
    const len = payload.length;

    const { bytes, meta } = buildFullEthernetFrame(msg);
    const totalLen = bytes.length;

    // 行渲染 (每行 16 字节)
    let gridRows = '';
    const numRows = Math.ceil(totalLen / 16) || 1;

    for (let r = 0; r < numRows; r++) {
      const rowOffset = r * 16;
      let offsetText = toHex(rowOffset, 4).toLowerCase();
      
      let hexCells = '';
      let asciiChars = '';

      for (let c = 0; c < 16; c++) {
        const byteIdx = rowOffset + c;

        // Between 8th and 9th byte, add Wireshark divider space
        if (c === 8) {
          hexCells += '<span class="wireshark-divider"></span>';
        }

        if (byteIdx < totalLen) {
          const val = bytes[byteIdx];
          const m = meta[byteIdx];

          if (m.type === 'payload') {
            hexCells += `<input type="text" class="sim-hex-byte-input" data-byte="${m.payloadIdx}" value="${toHex(val, 2).toLowerCase()}" maxlength="2" title="Payload Byte ${m.payloadIdx}">`;
          } else {
            hexCells += `<span class="sim-hex-byte sim-byte-${m.type}" title="${m.label}">${toHex(val, 2).toLowerCase()}</span>`;
          }

          // ASCII text character
          if (val >= 0x20 && val <= 0x7E) {
            const ch = String.fromCharCode(val);
            // Escape HTML special characters
            if (ch === '<') asciiChars += '&lt;';
            else if (ch === '>') asciiChars += '&gt;';
            else if (ch === '&') asciiChars += '&amp;';
            else asciiChars += ch;
          } else {
            asciiChars += '.';
          }
        } else {
          // Out of bounds: fill with blank aligned space
          hexCells += '<span class="sim-hex-byte" style="background:transparent;border:none;color:transparent;user-select:none;">  </span>';
          asciiChars += ' ';
        }
      }

      gridRows += `<div class="wireshark-row">
        <div class="wireshark-offset">${offsetText}</div>
        <div class="wireshark-bytes">${hexCells}</div>
      </div>`;
    }

    return `<div class="sim-payload-editor">
      <div class="sim-payload-toolbar">
        <span class="sim-payload-toolbar__info">Ethernet Frame (完整帧长: <strong>${totalLen}</strong> 字节，载荷: <strong>${len}</strong> 字节)</span>
        <div style="flex-grow:1"></div>
        <div class="sim-payload-import-wrap">
          <input type="text" class="sim-payload-import-input" id="payload-hex-import-val" placeholder="输入16进制数据，如: 10 03 22 f1 c5" title="输入以空格分隔的十六进制字节数据">
          <button class="sim-payload-import-btn" data-action="import-payload" title="添加并覆盖当前载荷数据">添加</button>
        </div>
        <button class="sim-payload-toolbar__toggle" data-action="clear-payload" title="载荷全部归零" ${len <= 0 ? 'disabled' : ''}>清空载荷</button>
      </div>
      <div class="wireshark-hex-dump">
        ${gridRows}
      </div>
    </div>`;
  }

  /* ============================
     主渲染逻辑
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
     事件监听绑定（事件委托）
     ============================ */
  function bindEvents() {
    if (!panelEl) return;

    panelEl.removeEventListener('click', handleClick);
    panelEl.removeEventListener('change', handleChange);
    panelEl.removeEventListener('input', handleInput);
    panelEl.removeEventListener('mousedown', handleSplitterDown);

    panelEl.addEventListener('click', handleClick);
    panelEl.addEventListener('change', handleChange);
    panelEl.addEventListener('input', handleInput);
    panelEl.addEventListener('mousedown', handleSplitterDown);
  }

  /* ---------- 点击事件处理器 ---------- */
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

    // 动作按钮
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const action = btn.dataset.action;
      const idx = btn.dataset.idx !== undefined ? parseInt(btn.dataset.idx, 10) : -1;

      switch (action) {
        case 'title-open-settings':
          doOpenSettings();
          break;
        case 'add':
          doAdd();
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
        case 'toggle-send':
          if (idx >= 0) doToggleSend(idx);
          break;
        case 'move-up':
          doMoveUp();
          break;
        case 'move-down':
          doMoveDown();
          break;
        case 'import-payload':
          doImportPayload();
          break;
        case 'clear-payload':
          doClearPayload();
          break;
        default:
          break;
      }
      return;
    }

    // 点击列表行 → 切换选中报文
    const row = e.target.closest('.console-sim-row');
    if (row) {
      const idx = parseInt(row.dataset.idx, 10);
      if (!isNaN(idx) && idx !== state.selectedIdx) {
        state.selectedIdx = idx;
        render();
      }
    }
  }

  /* ---------- change 事件处理器（下拉菜单） ---------- */
  function handleChange(e) {
    const el = e.target;
    const field = el.dataset.field;
    const idx = el.dataset.idx !== undefined ? parseInt(el.dataset.idx, 10) : -1;
    const proto = el.dataset.proto;

    if (!field) return;

    // 默认周期
    if (field === 'defaultCycle') {
      const v = parseInt(el.value, 10);
      if (!isNaN(v) && v > 0) state.defaultCycle = v;
      return;
    }

    // 更新特定的协议属性下拉
    if (proto && idx === -1) {
      const msg = state.messages[state.selectedIdx];
      if (!msg) return;
      
      const val = parseInt(el.value, 10);
      if (proto === 'doip' && msg.doip) {
        msg.doip[field] = isNaN(val) ? el.value : val;
      } else if (proto === 'someip' && msg.someip) {
        msg.someip[field] = isNaN(val) ? el.value : val;
      }
      render();
      return;
    }

    if (idx < 0 || idx >= state.messages.length) return;
    const msg = state.messages[idx];

    switch (field) {
      case 'protocol':
        msg.protocol = el.value;
        // 改变协议类型时更改默认端口以显得专业
        if (msg.protocol === 'doip') {
          msg.dstPort = 13400;
        } else if (msg.protocol === 'someip') {
          msg.dstPort = 30490;
        } else {
          msg.dstPort = 50000;
        }
        render();
        break;
      case 'trigger':
        msg.trigger = el.value;
        if (msg.trigger === 'cycle') {
          msg.cycleMs = state.defaultCycle;
        }
        render();
        break;
      default:
        break;
    }
  }

  /* ---------- input 事件处理器（文本修改） ---------- */
  function handleInput(e) {
    const el = e.target;
    const field = el.dataset.field;
    const idx = el.dataset.idx !== undefined ? parseInt(el.dataset.idx, 10) : -1;
    const proto = el.dataset.proto;
    const byteIdx = el.dataset.byte !== undefined ? parseInt(el.dataset.byte, 10) : -1;

    // 默认周期修改
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

    // 报文列表中的目标IP端口修改 (格式 ip:port)
    if (field === 'dstAddress' && idx >= 0 && idx < state.messages.length) {
      const val = el.value.trim();
      const parts = val.split(':');
      if (parts.length >= 1) state.messages[idx].dstIp = parts[0];
      if (parts.length >= 2) {
        const port = parseInt(parts[1], 10);
        if (!isNaN(port)) state.messages[idx].dstPort = port;
      }
      return;
    }

    // 报文名称
    if (field === 'name' && idx >= 0 && idx < state.messages.length) {
      state.messages[idx].name = el.value;
      return;
    }

    // 下方表单：网络基础参数修改
    if (idx === -1 && ['srcIp', 'dstIp', 'srcPort', 'dstPort'].includes(field)) {
      const msg = state.messages[state.selectedIdx];
      if (!msg) return;
      if (field === 'srcIp' || field === 'dstIp') {
        msg[field] = el.value.trim();
      } else {
        const port = parseInt(el.value, 10);
        msg[field] = isNaN(port) ? 0 : Math.min(65535, Math.max(0, port));
      }
      // 同步刷新列表
      const addrInput = panelEl.querySelector(`.sim-id-input[data-field="dstAddress"][data-idx="${state.selectedIdx}"]`);
      if (addrInput) {
        addrInput.value = `${msg.dstIp}:${msg.dstPort}`;
      }
      return;
    }

    // 下方表单：协议头特有 HEX 字段编辑
    if (proto) {
      const msg = state.messages[state.selectedIdx];
      if (!msg || !msg[proto]) return;
      // 仅保留 0-9 a-f
      el.value = el.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
      msg[proto][field] = parseHexVal(el.value, 0);
      return;
    }

    // 下方表单：Payload 单字节修改
    if (byteIdx >= 0) {
      const msg = state.messages[state.selectedIdx];
      if (!msg) return;
      el.value = el.value.replace(/[^0-9a-fA-F]/g, '').toLowerCase(); // Keep Wireshark lowercase format!
      const byteVal = parseHexByte(el.value);
      msg.payload[byteIdx] = byteVal;

      // 实时更新 ASCII 显示
      const rowEl = el.closest('.wireshark-row');
      if (rowEl) {
        const asciiEl = rowEl.querySelector('.wireshark-ascii');
        if (asciiEl) {
          // Select all bytes in this row: inputs and spans
          const byteEls = rowEl.querySelectorAll('.sim-hex-byte, .sim-hex-byte-input');
          let asciiStr = '';
          byteEls.forEach(byteEl => {
            let val = 0;
            if (byteEl.tagName === 'INPUT') {
              val = parseHexByte(byteEl.value);
            } else {
              val = parseHexByte(byteEl.textContent);
            }
            if (val >= 0x20 && val <= 0x7E) {
              const ch = String.fromCharCode(val);
              asciiStr += ch; // textContent will automatically escape
            } else {
              asciiStr += '.';
            }
          });
          asciiEl.textContent = asciiStr;
        }
      }
    }
  }

  /* ============================
     分割线水平拖拽 resizer
     ============================ */
  let _splitDragging = false;
  let _splitStartY = 0;
  let _splitStartRatio = 0;
  let _splitContainerH = 0;

  function handleSplitterDown(e) {
    const splitter = e.target.closest('.console-sim-hsplitter');
    if (!splitter) return;

    e.preventDefault();
    _splitDragging = true;
    _splitStartY = e.clientY;
    _splitStartRatio = state.splitRatio;

    // 计算可用总高度 (面板总高度 - title - toolbar - splitter自身)
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

      // 实时更新布局高度比例
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
     操作：添加报文
     ============================ */
  function doAdd() {
    const msg = createDefaultMsg();
    state.messages.push(msg);
    state.selectedIdx = state.messages.length - 1;
    render();
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
     操作：全部清除
     ============================ */
  function doClearAll() {
    if (state.messages.length === 0) return;
    state.messages.forEach(msg => {
      msg.sending = false;
    });
    updateSendTimers();
    state.messages = [];
    state.selectedIdx = 0;
    render();
    if (window.showToast) {
      window.showToast('已清除全部以太网报文。');
    }
  }

  /* ============================
     操作：全部发送 / 全部停止
     ============================ */
  function doPlayAll() {
    state.messages.forEach(m => { m.sending = true; });
    render();
  }

  function doStopAll() {
    state.messages.forEach(m => { m.sending = false; });
    render();
  }

  /* ============================
     操作：单个发送状态切换
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
     操作：Payload 导入与清空
     ============================ */
  function doImportPayload() {
    const msg = state.messages[state.selectedIdx];
    if (!msg) return;

    const inputEl = panelEl.querySelector('#payload-hex-import-val');
    if (!inputEl) return;

    const rawVal = inputEl.value.trim();
    if (!rawVal) {
      if (window.showToast) window.showToast('请输入有效的十六进制数据！');
      return;
    }

    // 提取所有的十六进制字节
    const cleanStr = rawVal.replace(/[^0-9a-fA-F]/g, '');
    const newBytes = [];
    for (let i = 0; i < cleanStr.length; i += 2) {
      const hex = cleanStr.substr(i, 2);
      if (hex.length === 2) {
        newBytes.push(parseInt(hex, 16));
      } else if (hex.length === 1) {
        newBytes.push(parseInt(hex + '0', 16)); // 补零
      }
    }

    if (newBytes.length === 0) {
      if (window.showToast) window.showToast('解析失败，请输入正确的16进制格式！');
      return;
    }

    // 覆盖数据载荷
    msg.payload = newBytes;
    render();

    if (window.showToast) {
      window.showToast(`已成功替换载荷，新载荷共 ${newBytes.length} 字节！`);
    }
  }

  function doClearPayload() {
    const msg = state.messages[state.selectedIdx];
    if (!msg) return;
    // 数据载荷全设为 0
    msg.payload = msg.payload.map(() => 0x00);
    render();
  }

  /* ============================
     操作：打开以太网参数设置弹框
     ============================ */
  function doOpenSettings() {
    const modalHtml = `
      <div class="bus-settings-overlay" id="eth-bus-settings-modal">
        <div class="bus-settings-card">
          <div class="bus-settings-header">
            <h3><i class="fa-solid fa-gear" style="color: var(--accent);"></i> ${state.busName} 总线参数设置</h3>
            <button class="bus-settings-close" id="eth-bus-settings-close-btn">&times;</button>
          </div>
          <div class="bus-settings-body">
            <form id="eth-bus-settings-form" class="bus-settings-form-grid">
              <div class="bus-settings-form-item">
                <label>总线类型</label>
                <input class="bus-settings-input" type="text" value="ETH" disabled />
              </div>
              <div class="bus-settings-form-item">
                <label>总线名称</label>
                <input class="bus-settings-input" type="text" id="eth-set-name" value="${state.busName}" />
              </div>
              <div class="bus-settings-form-item">
                <label>波特率</label>
                <select class="bus-settings-select" id="eth-set-baud">
                  ${['100 Mbps', '1000 Mbps'].map(v => `<option value="${v}" ${v === state.baudRate ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>

            </form>
          </div>
          <div class="bus-settings-footer">
            <button class="bus-settings-btn" id="eth-bus-settings-cancel-btn">取消</button>
            <button class="bus-settings-btn primary" id="eth-bus-settings-save-btn">保存</button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    const modalEl = div.firstElementChild;
    document.body.appendChild(modalEl);

    // 绑定弹窗事件
    const closeBtn = modalEl.querySelector('#eth-bus-settings-close-btn');
    const cancelBtn = modalEl.querySelector('#eth-bus-settings-cancel-btn');
    const saveBtn = modalEl.querySelector('#eth-bus-settings-save-btn');

    const closeModal = () => {
      document.body.removeChild(modalEl);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    saveBtn.addEventListener('click', () => {
      const newName = modalEl.querySelector('#eth-set-name').value.trim();
      if (!newName) {
        if (window.showToast) window.showToast('总线名称不能为空！');
        return;
      }
      state.busName = newName;
      state.baudRate = modalEl.querySelector('#eth-set-baud').value;


      // 同步以太网的名称和属性
      if (window.ConsoleDiagram) {
        const bus = window.ConsoleDiagram.getBusConfig('eth1');
        if (bus) {
          bus.name = state.busName;
          bus.baudrate = state.baudRate;
          // 重新刷新拓扑图顶部 Tabs
          const tabsEl = document.getElementById("console-topo-tabs");
          if (tabsEl) {
            const tabs = tabsEl.querySelectorAll('.console-topo-tab');
            tabs.forEach(tab => {
              if (tab.dataset.busId === 'eth1') {
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
     全局键盘与点击处理
     ============================ */
  let _hasGlobalKeyBind = false;
  function bindGlobalKeyboard() {
    if (_hasGlobalKeyBind) return;
    window.addEventListener('keydown', (e) => {
      if (panelEl && !panelEl.classList.contains('is-hidden')) {
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
    state.busName = busName || 'Ethernet1';
    state.openPopoverId = null; // 激活时清空任何打开的弹窗
    panelEl = document.getElementById('console-eth-panel');
    if (!panelEl) {
      console.warn('[ConsoleEth] 未找到 #console-eth-panel 容器');
      return;
    }
    panelEl.classList.add('console-sim-panel');
    render();
    bindGlobalKeyboard();
    bindGlobalClick();
  }

  /* ============================
     公开暴露的 API
     ============================ */
  return { activate, render };
})();
