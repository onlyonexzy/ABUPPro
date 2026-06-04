/**
 * console-playback.js - Vector CANoe Playback 风格高保真报文回放引擎
 */
window.ConsolePlayback = (() => {
  "use strict";

  /* ============================
     状态管理
     ============================ */
  const state = {
    isReplaying: false,
    sourceFile: 'D:\\deskTopFiles\\Log_GW_vcu_obc_ecu_gcu.asc',
    selectedChannel: {
      can1: true,
      eth1: false
    },
    transmitMsg: true,
    receiveMsg: true,

    // 内部播放相关状态
    replayIndex: 0,
    replayTimer: null,
    playStartTime: null,

    // 默认内置可重播的测试报文包，用于高逼格的回放演示
    mockPackets: [
      { id: '10C', name: 'GW_vcu_obc_ecu_gcu', dlc: 8, data: '50 02 01 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
      { id: '0C9', name: 'Engine_Status_DBC', dlc: 8, data: '0A BC 50 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
      { id: '10C', name: 'GW_vcu_obc_ecu_gcu', dlc: 8, data: '55 02 01 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
      { id: '201', name: 'ABS_Data_DBC', dlc: 8, data: '00 00 FF FF 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
      { id: '10C', name: 'GW_vcu_obc_ecu_gcu', dlc: 8, data: '60 02 01 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
      { id: '0C9', name: 'Engine_Status_DBC', dlc: 8, data: '0A EE 51 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
      { id: '10C', name: 'GW_vcu_obc_ecu_gcu', dlc: 8, data: '65 03 01 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
      { id: '3A0', name: 'BCM_LightControl_DBC', dlc: 8, data: '01 02 00 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
      { id: '10C', name: 'GW_vcu_obc_ecu_gcu', dlc: 8, data: '70 03 01 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' }
    ]
  };

  // DOM 缓存
  let panelEl = null;
  let startBtn = null;
  let stopBtn = null;
  let statusDot = null;
  let statusText = null;
  let isInitialized = false;

  /* ============================
     回放播放引擎
     ============================ */
  function startPlayback() {
    if (state.isReplaying) return;

    state.isReplaying = true;
    state.replayIndex = 0;
    state.playStartTime = Date.now();

    // 更新 UI 状态 (Play 键加亮闪烁红边)
    if (startBtn) {
      startBtn.classList.add('is-recording');
      startBtn.title = "回放正在运行...";
      startBtn.querySelector('i').style.color = '#e53e3e';
    }
    if (stopBtn) {
      stopBtn.classList.remove('is-disabled');
    }
    if (statusDot) {
      statusDot.classList.add('is-recording');
    }
    if (statusText) {
      statusText.textContent = "Replaying...";
      statusText.style.color = '#e53e3e';
    }

    if (window.showToast) {
      const fileName = state.sourceFile.substring(state.sourceFile.lastIndexOf('\\') + 1);
      window.showToast(`已启动报文回放，读取文件 [${fileName}]...`);
    }

    // 开启高频泵入时钟
    state.replayTimer = setInterval(playbackTick, 180);
  }

  function stopPlayback() {
    if (!state.isReplaying) return;

    state.isReplaying = false;
    if (state.replayTimer) {
      clearInterval(state.replayTimer);
      state.replayTimer = null;
    }

    // 还原 UI
    if (startBtn) {
      startBtn.classList.remove('is-recording');
      startBtn.title = "开始回放 (Play)";
      startBtn.querySelector('i').style.color = '#555';
    }
    if (stopBtn) {
      stopBtn.classList.add('is-disabled');
    }
    if (statusDot) {
      statusDot.classList.remove('is-recording');
    }
    if (statusText) {
      statusText.textContent = "Stopped";
      statusText.style.color = '#718096';
    }

    if (window.showToast) {
      window.showToast('报文回放已安全停止。');
    }
  }

  function playbackTick() {
    if (!state.isReplaying) return;

    // 1. 如果没有报文，或者回放走到了尽头，则自动循环播放
    if (state.replayIndex >= state.mockPackets.length) {
      state.replayIndex = 0;
    }

    const pkt = state.mockPackets[state.replayIndex];

    // 2. 判断是否符合通道设置和发送/接收勾选
    const channelEnabled = (pkt.channel === 'CAN1' && state.selectedChannel.can1) ||
                           (pkt.channel === 'ETH1' && state.selectedChannel.eth1);
    
    if (channelEnabled) {
      // 3. 泵入全局 Trace 管道！
      if (window.addTraceEntry) {
        window.addTraceEntry({
          channel: pkt.channel,
          id: pkt.id,
          name: pkt.name,
          dir: pkt.dir, // 回放报文视为 Rx/Tx 帧
          dlc: pkt.dlc,
          data: pkt.data
        });
      }
    }

    state.replayIndex++;
  }

  /* ============================
     高保真配置 Modal 弹窗交互
     ============================ */
  function showSettingsModal() {
    if (document.getElementById('playback-settings-modal-el')) {
      document.getElementById('playback-settings-modal-el').classList.add('is-active');
      syncSettingsToInputs();
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'playback-settings-modal';
    modal.id = 'playback-settings-modal-el';
    modal.innerHTML = `
      <div class="playback-settings-card">
        <div class="playback-settings-header">
          <div class="playback-settings-title">回放设置</div>
          <button class="playback-settings-close" id="playback-settings-close-x"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="playback-settings-body">
          <!-- 通常栏 -->
          <fieldset class="playback-groupbox">
            <legend>通常</legend>
            <div class="playback-settings-row">
              <span class="playback-settings-label">源文件:</span>
              <input type="text" class="playback-settings-input is-readonly" id="playback-inp-source" value="${state.sourceFile}" readonly />
              <button class="playback-settings-btn-browse" id="playback-btn-browse">...</button>
            </div>
          </fieldset>

          <!-- 发送栏 -->
          <fieldset class="playback-groupbox">
            <legend>发送</legend>
            <div class="playback-channel-grid">
              <!-- 左侧通道列表，带边框 -->
              <div class="playback-channel-list">
                <label class="playback-channel-item">
                  <input type="checkbox" id="playback-cb-can1" ${state.selectedChannel.can1 ? 'checked' : ''} />
                  <span>CAN1</span>
                </label>
              </div>

              <!-- 右侧发送接收选项 -->
              <div class="playback-right-options">
                <label class="playback-settings-checkbox-item">
                  <input type="checkbox" id="playback-cb-tx" ${state.transmitMsg ? 'checked' : ''} />
                  <span>发送报文 (Tx)</span>
                </label>
                <label class="playback-settings-checkbox-item">
                  <input type="checkbox" id="playback-cb-rx" ${state.receiveMsg ? 'checked' : ''} />
                  <span>接收报文 (Rx)</span>
                </label>
              </div>
            </div>
          </fieldset>
        </div>
        <div class="playback-settings-footer">
          <button class="playback-footer-btn playback-footer-btn--primary" id="playback-settings-submit">确定</button>
          <button class="playback-footer-btn" id="playback-settings-cancel">取消</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('is-active');

    // 绑定事件
    bindSettingsEvents(modal);
  }

  function bindSettingsEvents(modal) {
    const closeX = modal.querySelector('#playback-settings-close-x');
    const btnCancel = modal.querySelector('#playback-settings-cancel');
    const btnSubmit = modal.querySelector('#playback-settings-submit');
    const btnBrowse = modal.querySelector('#playback-btn-browse');

    const cbCan1 = modal.querySelector('#playback-cb-can1');
    const cbTx = modal.querySelector('#playback-cb-tx');
    const cbRx = modal.querySelector('#playback-cb-rx');
    const inpSource = modal.querySelector('#playback-inp-source');

    btnBrowse.addEventListener('click', () => {
      // 弹出高逼格的“回放源文件选择器”，可以读取 ConsoleRecord 中的录制文件！
      showFileSelector(inpSource);
    });

    const closeModal = () => modal.classList.remove('is-active');
    closeX.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    btnSubmit.addEventListener('click', () => {
      state.sourceFile = inpSource.value;
      state.selectedChannel.can1 = cbCan1.checked;
      state.selectedChannel.eth1 = false;
      state.transmitMsg = cbTx.checked;
      state.receiveMsg = cbRx.checked;

      // 根据选中的文件类型自适应加载回放包！
      adaptPacketsByFileExtension();

      closeModal();
      if (window.showToast) window.showToast('回放选项已配置成功！');
    });
  }

  function adaptPacketsByFileExtension() {
    const isPcap = state.sourceFile.toLowerCase().endsWith('.pcap');
    if (isPcap) {
      // 加载以太网 UDP 回放序列
      state.mockPackets = [
        { id: 'UDP', name: 'OBC_Udp_Status', dlc: 32, data: '00 01 02 03 04 05 AC 10 08 02', channel: 'ETH1', dir: 'Rx' },
        { id: 'UDP', name: 'VCU_Udp_Feedback', dlc: 64, data: '00 11 22 33 44 55 AC 10 08 0A', channel: 'ETH1', dir: 'Rx' },
        { id: 'UDP', name: 'OBC_Udp_Status', dlc: 32, data: '00 01 02 03 04 05 AC 10 08 02', channel: 'ETH1', dir: 'Rx' }
      ];
      state.selectedChannel.can1 = false;
      state.selectedChannel.eth1 = true;
    } else {
      // 加载 CAN 回放序列
      state.mockPackets = [
        { id: '10C', name: 'GW_vcu_obc_ecu_gcu', dlc: 8, data: '50 02 01 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
        { id: '0C9', name: 'Engine_Status_DBC', dlc: 8, data: '0A BC 50 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
        { id: '201', name: 'ABS_Data_DBC', dlc: 8, data: '00 00 FF FF 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
        { id: '10C', name: 'GW_vcu_obc_ecu_gcu', dlc: 8, data: '60 02 01 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' },
        { id: '3A0', name: 'BCM_LightControl_DBC', dlc: 8, data: '01 02 00 00 00 00 00 00', channel: 'CAN1', dir: 'Rx' }
      ];
      state.selectedChannel.can1 = true;
      state.selectedChannel.eth1 = false;
    }
  }

  function syncSettingsToInputs() {
    const modal = document.getElementById('playback-settings-modal-el');
    if (!modal) return;

    modal.querySelector('#playback-inp-source').value = state.sourceFile;
    modal.querySelector('#playback-cb-can1').checked = state.selectedChannel.can1;
    modal.querySelector('#playback-cb-tx').checked = state.transmitMsg;
    modal.querySelector('#playback-cb-rx').checked = state.receiveMsg;
  }

  /* ============================
     回放源文件选择器 (深度打通 ConsoleRecord 日志数据库！)
     ============================ */
  function showFileSelector(targetInput) {
    if (document.getElementById('playback-file-sel-modal-el')) {
      document.getElementById('playback-file-sel-modal-el').classList.add('is-active');
      renderFilesList();
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'playback-settings-modal';
    modal.id = 'playback-file-sel-modal-el';
    modal.innerHTML = `
      <div class="playback-settings-card" style="width: 480px; height: 300px;">
        <div class="playback-settings-header" style="background:#f1f5f9;">
          <div class="playback-settings-title"><i class="fa-regular fa-folder-open" style="color:#e6a23c; margin-right:4px;"></i>选择回放源文件 (双击选择)</div>
          <button class="playback-settings-close" id="playback-file-sel-close-x"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="playback-settings-body" style="padding:8px; overflow-y:auto;">
          <table class="record-folder-table">
            <thead>
              <tr>
                <th>文件名称</th>
                <th>通道格式</th>
                <th>大小</th>
              </tr>
            </thead>
            <tbody id="playback-file-sel-tbody">
              <!-- 动态列出录像文件 -->
            </tbody>
          </table>
        </div>
        <div class="playback-settings-footer">
          <button class="playback-footer-btn" id="playback-file-sel-cancel">取消</button>
          <button class="playback-footer-btn playback-footer-btn--primary" id="playback-file-sel-submit">确定选择</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('is-active');

    // 绑定事件
    const closeModal = () => modal.classList.remove('is-active');
    document.getElementById('playback-file-sel-close-x').addEventListener('click', closeModal);
    document.getElementById('playback-file-sel-cancel').addEventListener('click', closeModal);

    const btnSubmit = document.getElementById('playback-file-sel-submit');
    btnSubmit.addEventListener('click', () => {
      const selectedTr = document.getElementById('playback-file-sel-tbody').querySelector('tr.is-selected');
      if (selectedTr) {
        targetInput.value = selectedTr.dataset.filePath;
      }
      closeModal();
    });

    renderFilesList(targetInput);
  }

  function renderFilesList(targetInput) {
    const tbody = document.getElementById('playback-file-sel-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    // 获取 ConsoleRecord 模块中已录制的真实文件
    const recordLogs = (window.ConsoleRecord && window.ConsoleRecord.state && window.ConsoleRecord.state.localLogs) 
      ? window.ConsoleRecord.state.localLogs 
      : [];

    const folderPrefix = (window.ConsoleRecord && window.ConsoleRecord.state && window.ConsoleRecord.state.folder)
      ? window.ConsoleRecord.state.folder
      : 'D:\\deskTopFiles';

    // 组合展示文件列表 (包括一个默认测试文件)
    const list = [
      { name: 'Log_GW_vcu_obc_ecu_gcu.asc', type: 'CAN Log (Test)', size: '8.5 KB', path: folderPrefix + '\\Log_GW_vcu_obc_ecu_gcu.asc' },
      ...recordLogs.map(log => ({
        name: log.name,
        type: log.type,
        size: log.size,
        path: folderPrefix + '\\' + log.name
      }))
    ];

    list.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.filePath = item.path;
      tr.innerHTML = `
        <td style="font-weight:600; font-family:Consolas,monospace;"><i class="fa-regular fa-file-code" style="margin-right:6px; color:#3182ce;"></i>${item.name}</td>
        <td><span class="trace-ai-badge trace-ai-badge--success" style="font-size:9px;">${item.type}</span></td>
        <td>${item.size}</td>
      `;

      tr.addEventListener('click', () => {
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('is-selected'));
        tr.classList.add('is-selected');
      });

      tr.addEventListener('dblclick', () => {
        if (targetInput) {
          targetInput.value = item.path;
        }
        document.getElementById('playback-file-sel-modal-el').classList.remove('is-active');
      });

      tbody.appendChild(tr);
    });
  }

  /* ============================
     初始化与悬浮窗绑定
     ============================ */
  function init() {
    if (isInitialized) return;

    panelEl = document.querySelector('.workspace-window[data-window="message-playback"]');
    if (!panelEl) return;

    startBtn = panelEl.querySelector('#playback-btn-start');
    stopBtn = panelEl.querySelector('#playback-btn-stop');
    statusDot = panelEl.querySelector('#playback-status-dot');
    statusText = panelEl.querySelector('#playback-status-text');

    if (!startBtn || !stopBtn) return;

    isInitialized = true;

    // 绑定事件
    startBtn.addEventListener('click', startPlayback);
    stopBtn.addEventListener('click', stopPlayback);

    const settingsBtn = panelEl.querySelector('#playback-btn-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', showSettingsModal);
  }

  // 监听侧边栏，打开“报文回放”窗口时延迟初始化以确保 DOM 布局可用
  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-window="message-playback"]');
    if (item) {
      setTimeout(init, 120);
    }
  });

  return { init, startPlayback, stopPlayback, state };
})();

// 首屏尝试捕获绑定
setTimeout(() => {
  if (window.ConsolePlayback) window.ConsolePlayback.init();
}, 350);
