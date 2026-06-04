/**
 * console-record.js - Vector CANoe Logging 风格高保真多通道报文录制引擎
 */
window.ConsoleRecord = (() => {
  "use strict";

  /* ============================
     状态管理
     ============================ */
  const state = {
    isRecording: false,
    recordedPackets: [],
    recordingStartTime: null,

    // Settings Parameters (像素级对齐图2)
    folder: 'D:\\deskTopFiles',
    fileNamePrefix: 'Log',
    format: 'asc',              // 'asc' (CAN) | 'pcap' (ETH)
    suffixUserName: false,
    suffixVersion: false,
    suffixStartTime: true,     // 默认勾选 Start Time
    warnOverwrite: true,

    // Mock 本地已存日志库，用于 Folder 浏览
    localLogs: [
      { name: 'Log_20260528_120000.asc', type: 'CAN Log', size: '124 KB', time: '2026-05-28 12:00:00' },
      { name: 'Log_20260528_153000.pcap', type: 'ETH Capture', size: '2.4 MB', time: '2026-05-28 15:30:00' }
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
     动态路径拼接预览算法
     ============================ */
  function getFullFilename() {
    let filename = state.fileNamePrefix;

    if (state.suffixUserName) {
      filename += '_fxxie';
    }
    if (state.suffixVersion) {
      filename += '_V02';
    }
    if (state.suffixStartTime) {
      // 演示用固定时间戳，录制完成时采用真实时间
      filename += '_20260528_175252';
    }

    filename += '.' + state.format;
    return state.folder + '\\' + filename;
  }

  function getRealFilename() {
    let filename = state.fileNamePrefix;

    if (state.suffixUserName) {
      filename += '_fxxie';
    }
    if (state.suffixVersion) {
      filename += '_V02';
    }
    if (state.suffixStartTime) {
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const dy = String(now.getDate()).padStart(2, '0');
      const hr = String(now.getHours()).padStart(2, '0');
      const mi = String(now.getMinutes()).padStart(2, '0');
      const sc = String(now.getSeconds()).padStart(2, '0');
      filename += `_${yr}${mo}${dy}_${hr}${mi}${sc}`;
    }

    filename += '.' + state.format;
    return filename;
  }

  /* ============================
     数据泵入拦截器
     ============================ */
  function recordPacket(entry) {
    if (!state.isRecording) return;

    // 根据当前选定的格式过滤并抓包
    if (state.format === 'asc') {
      // CAN 模式下：只记录 CAN 报文 (ID为十六进制)
      const isEth = entry.channel && entry.channel.toLowerCase().includes('eth');
      if (isEth) return; 
    } else {
      // PCAP 模式下：只记录 ETH 以太网报文
      const isEth = entry.channel && entry.channel.toLowerCase().includes('eth');
      const isUdp = entry.id === 'UDP';
      if (!isEth && !isUdp) return;
    }

    state.recordedPackets.push({
      time: Date.now(),
      channel: entry.channel || 'CAN1',
      id: entry.id || '000',
      name: entry.name || 'Msg',
      dir: entry.dir || 'Tx',
      dlc: entry.dlc ?? 8,
      data: entry.data || '00'
    });
  }

  /* ============================
     录制控制逻辑
     ============================ */
  function startRecording() {
    if (state.isRecording) return;

    state.isRecording = true;
    state.recordedPackets = [];
    state.recordingStartTime = Date.now();

    // 更新 UI 按钮激活态
    if (startBtn) {
      startBtn.classList.add('is-recording');
      startBtn.title = "正在录制中...";
      startBtn.querySelector('i').style.color = '#e53e3e';
    }
    if (stopBtn) {
      stopBtn.classList.remove('is-disabled');
    }
    if (statusDot) {
      statusDot.classList.add('is-recording');
    }
    if (statusText) {
      statusText.textContent = "Recording...";
      statusText.style.color = '#e53e3e';
    }

    if (window.showToast) {
      const modeText = state.format === 'asc' ? 'CAN (ASC)' : 'Ethernet (PCAP)';
      window.showToast(`已开启多通道 [${modeText}] 报文录制...`);
    }
  }

  function stopRecording() {
    if (!state.isRecording) return;

    state.isRecording = false;

    // 还原 UI
    if (startBtn) {
      startBtn.classList.remove('is-recording');
      startBtn.title = "开始录制 (Play)";
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

    const count = state.recordedPackets.length;
    if (count === 0) {
      if (window.showToast) window.showToast('录制停止。没有捕获到任何有效报文，未生成日志。');
      return;
    }

    if (window.showToast) {
      window.showToast(`录制已停止，成功捕获 ${count} 帧报文，正在导出文件...`);
    }

    // 编译并导出日志
    compileAndDownloadLog();
  }

  function compileAndDownloadLog() {
    const filename = getRealFilename();
    
    if (state.format === 'asc') {
      const text = compileASC();
      downloadTextFile(filename, text);
    } else {
      const bytes = compilePCAP();
      downloadBinaryFile(filename, bytes);
    }

    // 存入 mock 日志目录
    state.localLogs.unshift({
      name: filename,
      type: state.format === 'asc' ? 'CAN Log' : 'ETH Capture',
      size: `${(state.recordedPackets.length * 0.15).toFixed(1)} KB`,
      time: new Date().toLocaleString()
    });
  }

  /* ============================
     Vector CANoe ASC 日志文本编译器
     ============================ */
  function compileASC() {
    const d = new Date(state.recordingStartTime);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dateStr = `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} ${d.getFullYear()}`;

    let out = `date ${dateStr}\n`;
    out += `base hex timestamps absolute\n`;
    out += `internal events logged\n`;
    out += `// version 8.1.0\n`;
    out += `//\n`;

    state.recordedPackets.forEach(pkt => {
      const relTimeSec = ((pkt.time - state.recordingStartTime) / 1000).toFixed(6);
      
      // 区分 CAN 通道，CAN1->1, CAN2->2, 默认1
      let chan = 1;
      if (pkt.channel && pkt.channel.toUpperCase().includes('CAN2')) chan = 2;

      const idHex = pkt.id.toUpperCase().replace(/^0X/, '').padStart(3, '0');
      const dirStr = pkt.dir === 'Tx' ? 'Tx' : 'Rx';
      
      // 组装 HEX bytes，如 "d 8 00 12 34"
      const hexBytes = pkt.data.split(' ').map(x => x.toUpperCase().padStart(2, '0')).join(' ');
      
      out += `  ${relTimeSec} ${chan}  ${idHex}             ${dirStr}   d ${pkt.dlc} ${hexBytes}\n`;
    });

    return out;
  }

  /* ============================
     Wireshark PCAP 二进制包编译器
     ============================ */
  function compilePCAP() {
    const buffers = [];
    
    // 1. PCAP Global Header (24字节)
    // Little Endian
    const globalHeader = new Uint8Array([
      0xd4, 0xc3, 0xb2, 0xa1, // magic number (nanosecond resolution, or microsecond)
      0x02, 0x00,             // version major (2)
      0x04, 0x00,             // version minor (4)
      0x00, 0x00, 0x00, 0x00, // thiszone (0)
      0x00, 0x00, 0x00, 0x00, // sigfigs (0)
      0xff, 0xff, 0x00, 0x00, // snaplen (65535)
      0x01, 0x00, 0x00, 0x00  // network (LinkType 1 = Ethernet)
    ]);
    buffers.push(globalHeader);

    // 2. 逐包编译
    state.recordedPackets.forEach(pkt => {
      // 提取 Space-separated 的 Payload 载荷字节
      const payloadBytes = pkt.data.split(' ').map(x => parseInt(x, 16) || 0);
      const payloadLen = payloadBytes.length;

      // 2.1 构建以太网 Frame (以太网II + IPv4 + UDP)
      const frameLen = 14 + 20 + 8 + payloadLen;
      const frame = new Uint8Array(frameLen);

      // 以太网 II 头 (14字节)
      frame.set([0x00, 0x11, 0x22, 0x33, 0x44, 0x55], 0); // Dest MAC
      frame.set([0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb], 6); // Src MAC
      frame.set([0x08, 0x00], 12);                        // EtherType (IPv4)

      // IPv4 头 (20字节)
      const totalIpLen = 20 + 8 + payloadLen;
      frame.set([
        0x45, 0x00,             // Version=4, IHL=5, TOS=0
        (totalIpLen >> 8) & 0xff, totalIpLen & 0xff, // Total Length
        0x00, 0x00,             // Ident
        0x40, 0x00,             // Flags (Don't Fragment)
        0x40, 0x11,             // TTL (64), Protocol (17 = UDP)
        0x00, 0x00,             // Checksum (Wireshark allows 0x0000)
        0xac, 0x10, 0x08, 0x02, // Src IP: 172.16.8.2
        0xac, 0x10, 0x08, 0x0a  // Dst IP: 172.16.8.10
      ], 14);

      // UDP 头 (8字节)
      const totalUdpLen = 8 + payloadLen;
      frame.set([
        0x13, 0x89,             // Src Port: 5001 (0x1389)
        0x13, 0x89,             // Dst Port: 5001
        (totalUdpLen >> 8) & 0xff, totalUdpLen & 0xff, // UDP Length
        0x00, 0x00              // Checksum (0x0000)
      ], 34);

      // Payload
      frame.set(payloadBytes, 42);

      // 2.2 构建 PCAP Packet Header (16字节)
      const diffMs = pkt.time - state.recordingStartTime;
      const sec = Math.floor(diffMs / 1000);
      const usec = (diffMs % 1000) * 1000;

      const pktHeader = new Uint8Array(16);
      // Little Endian uint32
      pktHeader[0] = sec & 0xff;
      pktHeader[1] = (sec >> 8) & 0xff;
      pktHeader[2] = (sec >> 16) & 0xff;
      pktHeader[3] = (sec >> 24) & 0xff;

      pktHeader[4] = usec & 0xff;
      pktHeader[5] = (usec >> 8) & 0xff;
      pktHeader[6] = (usec >> 16) & 0xff;
      pktHeader[7] = (usec >> 24) & 0xff;

      pktHeader[8] = frameLen & 0xff;
      pktHeader[9] = (frameLen >> 8) & 0xff;
      pktHeader[10] = (frameLen >> 16) & 0xff;
      pktHeader[11] = (frameLen >> 24) & 0xff;

      pktHeader[12] = frameLen & 0xff;
      pktHeader[13] = (frameLen >> 8) & 0xff;
      pktHeader[14] = (frameLen >> 16) & 0xff;
      pktHeader[15] = (frameLen >> 24) & 0xff;

      buffers.push(pktHeader);
      buffers.push(frame);
    });

    // 合并所有的字节流数组
    let totalBytes = 0;
    buffers.forEach(b => totalBytes += b.length);
    
    const out = new Uint8Array(totalBytes);
    let offset = 0;
    buffers.forEach(b => {
      out.set(b, offset);
      offset += b.length;
    });

    return out;
  }

  /* ============================
     触发下载文件的核心工具
     ============================ */
  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadBinaryFile(filename, bytes) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ============================
     高精度配置 Modal 弹窗交互
     ============================ */
  function showSettingsModal() {
    if (document.getElementById('record-settings-modal-el')) {
      document.getElementById('record-settings-modal-el').classList.add('is-active');
      syncSettingsToInputs();
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'record-settings-modal';
    modal.id = 'record-settings-modal-el';
    modal.innerHTML = `
      <div class="record-settings-card">
        <div class="record-settings-header">
          <div class="record-settings-title"><i class="fa-solid fa-gear" style="color:#2f6bff;"></i>Logging 设置</div>
          <button class="record-settings-close" id="record-settings-close-x"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="record-settings-body">
          <div class="record-settings-desc">
            使用系统代码，可以自动生成和增加文件名与目录，同时可以拆分日志文件，以免被覆盖。
          </div>
          
          <!-- 日志文件目录 -->
          <div class="record-settings-row">
            <span class="record-settings-label">日志文件目录:</span>
            <input type="text" class="record-settings-input" id="record-inp-folder" value="${state.folder}" />
            <button class="record-settings-btn-browse" id="record-btn-browse">...</button>
          </div>

          <!-- 目标文件预览 -->
          <div class="record-settings-row">
            <span class="record-settings-label">目标文件:</span>
            <input type="text" class="record-settings-input is-readonly" id="record-inp-preview" value="${getFullFilename()}" readonly />
          </div>

          <!-- 第三排复合大区，像素级对齐截图2 -->
          <div class="record-settings-complex-row">
            <div class="record-settings-left-col">
              <div class="record-settings-row" style="width: 100%;">
                <span class="record-settings-label">文件格式:</span>
                <select class="record-settings-select" id="record-sel-format">
                  <option value="asc" ${state.format === 'asc' ? 'selected' : ''}>ASCII Frame Logging (*.asc)</option>
                  <option value="pcap" ${state.format === 'pcap' ? 'selected' : ''}>Ethernet PCAP Logging (*.pcap)</option>
                </select>
              </div>
              <div class="record-settings-row" style="width: 100%;">
                <span class="record-settings-label">文件名缀:</span>
                <input type="text" class="record-settings-input" id="record-inp-prefix" value="${state.fileNamePrefix}" />
              </div>
            </div>

            <!-- 右侧加边框的后缀勾选框区，像素级对齐截图2 -->
            <div class="record-settings-suffix-box">
              <label class="record-settings-checkbox-item">
                <input type="checkbox" id="record-cb-username" ${state.suffixUserName ? 'checked' : ''} />
                <span>User Name</span>
              </label>
              <label class="record-settings-checkbox-item">
                <input type="checkbox" id="record-cb-version" ${state.suffixVersion ? 'checked' : ''} />
                <span>Version</span>
              </label>
              <label class="record-settings-checkbox-item">
                <input type="checkbox" id="record-cb-starttime" ${state.suffixStartTime ? 'checked' : ''} />
                <span>Start Time</span>
              </label>
            </div>
          </div>

          <!-- 底部覆盖警告 -->
          <label class="record-settings-checkbox-item" style="margin-top:4px;">
            <input type="checkbox" id="record-cb-overwrite" ${state.warnOverwrite ? 'checked' : ''} />
            <span>覆盖日志文件前发出警告</span>
          </label>
        </div>
        <div class="record-settings-footer">
          <button class="record-footer-btn" id="record-settings-cancel">取消</button>
          <button class="record-footer-btn record-footer-btn--primary" id="record-settings-submit">确定</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('is-active');

    // 绑定事件
    bindSettingsModalEvents(modal);
  }

  function bindSettingsModalEvents(modal) {
    const closeX = modal.querySelector('#record-settings-close-x');
    const btnCancel = modal.querySelector('#record-settings-cancel');
    const btnSubmit = modal.querySelector('#record-settings-submit');
    const btnBrowse = modal.querySelector('#record-btn-browse');

    const inpFolder = modal.querySelector('#record-inp-folder');
    const inpPrefix = modal.querySelector('#record-inp-prefix');
    const selFormat = modal.querySelector('#record-sel-format');
    const cbUser = modal.querySelector('#record-cb-username');
    const cbVer = modal.querySelector('#record-cb-version');
    const cbTime = modal.querySelector('#record-cb-starttime');
    const cbOverwrite = modal.querySelector('#record-cb-overwrite');
    const inpPreview = modal.querySelector('#record-inp-preview');

    const updatePreview = () => {
      const tempState = {
        folder: inpFolder.value,
        fileNamePrefix: inpPrefix.value,
        format: selFormat.value,
        suffixUserName: cbUser.checked,
        suffixVersion: cbVer.checked,
        suffixStartTime: cbTime.checked
      };

      let filename = tempState.fileNamePrefix;
      if (tempState.suffixUserName) filename += '_fxxie';
      if (tempState.suffixVersion) filename += '_V02';
      if (tempState.suffixStartTime) filename += '_20260528_175252';
      filename += '.' + tempState.format;

      inpPreview.value = tempState.folder + '\\' + filename;
    };

    // 绑定表单更改监听以实现目标路径预览联动
    [inpFolder, inpPrefix, selFormat, cbUser, cbVer, cbTime].forEach(el => {
      el.addEventListener('change', updatePreview);
      el.addEventListener('input', updatePreview);
    });

    btnBrowse.addEventListener('click', () => {
      // 模拟选择目录
      if (window.showToast) window.showToast('浏览目录选项启动：Windows 系统已选定默认文件夹！');
    });

    const closeModal = () => modal.classList.remove('is-active');
    closeX.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    btnSubmit.addEventListener('click', () => {
      // 保存全局设置状态
      state.folder = inpFolder.value.trim() || 'D:\\deskTopFiles';
      state.fileNamePrefix = inpPrefix.value.trim() || 'Log';
      state.format = selFormat.value;
      state.suffixUserName = cbUser.checked;
      state.suffixVersion = cbVer.checked;
      state.suffixStartTime = cbTime.checked;
      state.warnOverwrite = cbOverwrite.checked;

      closeModal();
      if (window.showToast) window.showToast('Logging 录制配置已成功应用！');
    });
  }

  function syncSettingsToInputs() {
    const modal = document.getElementById('record-settings-modal-el');
    if (!modal) return;

    modal.querySelector('#record-inp-folder').value = state.folder;
    modal.querySelector('#record-inp-prefix').value = state.fileNamePrefix;
    modal.querySelector('#record-sel-format').value = state.format;
    modal.querySelector('#record-cb-username').checked = state.suffixUserName;
    modal.querySelector('#record-cb-version').checked = state.suffixVersion;
    modal.querySelector('#record-cb-starttime').checked = state.suffixStartTime;
    modal.querySelector('#record-cb-overwrite').checked = state.warnOverwrite;

    // 更新预览
    let filename = state.fileNamePrefix;
    if (state.suffixUserName) filename += '_fxxie';
    if (state.suffixVersion) filename += '_V02';
    if (state.suffixStartTime) filename += '_20260528_175252';
    filename += '.' + state.format;
    modal.querySelector('#record-inp-preview').value = state.folder + '\\' + filename;
  }

  /* ============================
     Mock 本地录制仓库浏览
     ============================ */
  function showFolderModal() {
    if (document.getElementById('record-folder-modal-el')) {
      document.getElementById('record-folder-modal-el').classList.add('is-active');
      renderLogsTable();
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'record-folder-modal';
    modal.id = 'record-folder-modal-el';
    modal.innerHTML = `
      <div class="record-folder-card">
        <div class="record-folder-header">
          <div class="record-settings-title"><i class="fa-solid fa-folder-open" style="color:#e6a23c;"></i>本地录制目录: ${state.folder}</div>
          <button class="record-settings-close" id="record-folder-close-x"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="record-folder-body">
          <table class="record-folder-table">
            <thead>
              <tr>
                <th>日志名称</th>
                <th>通道格式</th>
                <th>大小</th>
                <th>保存时间</th>
              </tr>
            </thead>
            <tbody id="record-folder-tbody">
              <!-- 动态加载保存日志 -->
            </tbody>
          </table>
        </div>
        <div class="record-settings-footer">
          <button class="record-footer-btn record-footer-btn--primary" id="record-folder-close-btn">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('is-active');

    // 绑定关闭
    const closeModal = () => modal.classList.remove('is-active');
    document.getElementById('record-folder-close-x').addEventListener('click', closeModal);
    document.getElementById('record-folder-close-btn').addEventListener('click', closeModal);

    renderLogsTable();
  }

  function renderLogsTable() {
    const tbody = document.getElementById('record-folder-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    state.localLogs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600; font-family:Consolas,monospace;"><i class="fa-regular fa-file" style="margin-right:6px; color:#4a5568;"></i>${log.name}</td>
        <td><span class="trace-ai-badge trace-ai-badge--success" style="font-size:9px;">${log.type}</span></td>
        <td>${log.size}</td>
        <td style="color:#718096; font-size:10px;">${log.time}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ============================
     初始化与管道注入
     ============================ */
  function init() {
    if (isInitialized) return;

    panelEl = document.querySelector('.workspace-window[data-window="message-record"]');
    if (!panelEl) return;

    startBtn = panelEl.querySelector('#record-btn-start');
    stopBtn = panelEl.querySelector('#record-btn-stop');
    statusDot = panelEl.querySelector('#record-status-dot');
    statusText = panelEl.querySelector('#record-status-text');

    if (!startBtn || !stopBtn) return;

    isInitialized = true;

    // 绑定控制条点击事件
    startBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    
    const settingsBtn = panelEl.querySelector('#record-btn-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', showSettingsModal);

    const folderBtn = panelEl.querySelector('#record-btn-folder');
    if (folderBtn) folderBtn.addEventListener('click', showFolderModal);

    // 桥接管道实现无缝流拦截捕获
    hookTracePipeline();
  }

  function hookTracePipeline() {
    const originalAddTraceEntry = window.addTraceEntry;

    window.addTraceEntry = (entry) => {
      if (originalAddTraceEntry) {
        originalAddTraceEntry(entry);
      }
      
      // 泵入拦截录像
      recordPacket(entry);
    };

    // 同样重写 ConsoleTrace 下的 addTraceEntry
    if (window.ConsoleTrace) {
      window.ConsoleTrace.addTraceEntry = window.addTraceEntry;
    }
  }

  // 监听侧边栏，打开“报文录制”窗口时延迟初始化以确保 DOM 布局可用
  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-window="message-record"]');
    if (item) {
      setTimeout(init, 120);
    }
  });

  return { init, startRecording, stopRecording, state };
})();

// 首屏尝试捕获绑定
setTimeout(() => {
  if (window.ConsoleRecord) window.ConsoleRecord.init();
}, 300);
