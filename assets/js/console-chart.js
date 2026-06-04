/**
 * console-chart.js - Vector CANoe Graphics 风格高保真图形监控引擎
 */
window.ConsoleChart = (() => {
  "use strict";

  /* ============================
     状态管理
     ============================ */
  const state = {
    // 默认预载的信号列表
    signals: [
      {
        id: 'vcu_brakeLight',
        name: 'vcu_brakeLight',
        checked: true,
        color: '#e53e3e', // Red
        value: 0.00,
        history: [],
        min: 0,
        max: 1.2, // 稍微多一点以便好看
        msgId: '10C',
        parseFn: (bytes) => (bytes[1] & 0x01)
      },
      {
        id: 'vcu_accelPosValid',
        name: 'vcu_accelPosValid',
        checked: true,
        color: '#38a169', // Green
        value: 0.00,
        history: [],
        min: 0,
        max: 1.2,
        msgId: '10C',
        parseFn: (bytes) => ((bytes[1] >> 1) & 0x01)
      },
      {
        id: 'vcu_accelPos',
        name: 'vcu_accelPos',
        checked: true,
        color: '#3182ce', // Blue
        value: 0.00,
        history: [],
        min: 0,
        max: 100,
        msgId: '10C',
        parseFn: (bytes) => parseFloat((bytes[0] / 2.55).toFixed(2))
      },
      {
        id: 'vcu_alertLevel',
        name: 'vcu_alertLevel',
        checked: true,
        color: '#1a202c', // Black
        value: 0.00,
        history: [],
        min: 0,
        max: 4,
        msgId: '10C',
        parseFn: (bytes) => bytes[2] || 0
      }
    ],
    isPaused: false,
    showGrid: true,
    timeSpan: 24,            // X轴默认时间窗口跨度 (秒)，匹配截图
    firstFrameTime: null,    // 接收到第一帧的绝对毫秒时间戳
    maxHistorySec: 120,      // 缓存的最大历史数据时间 (秒)
    splitRatio: 0.26,        // 左侧信号区宽度比例
  };

  // DOM 引用
  let panelEl = null;
  let canvasEl = null;
  let ctx = null;
  let tbodyEl = null;
  let animId = null;
  let isInitialized = false;

  // 鼠标交互状态
  const mouse = {
    x: -1,
    y: -1,
    isOver: false
  };

  /* ============================
     动态波形生成器 - 注入仿真数据 (只是演示)
     ============================ */
  function generateDynamicSignals(msg) {
    // 根据时间产生漂亮的模拟波形，让报文变化极其生动
    const time = Date.now() / 1000;

    if (msg.name === 'GW_vcu_obc_ecu_gcu') {
      // 1. vcu_accelPos: 缓慢正弦震荡 (20% 到 85%)
      const accelPos = 50 + 30 * Math.sin(time * 0.4);
      msg.data[0] = Math.round(accelPos * 2.55);

      // 2. vcu_brakeLight: 当油门非常低时 (假装松油门踩刹车) 刹车灯亮起
      const brakeLight = accelPos < 35 ? 1 : 0;
      msg.data[1] = (msg.data[1] & 0xFE) | brakeLight;

      // 3. vcu_accelPosValid: 始终有效 (1)
      msg.data[1] = (msg.data[1] & 0xFD) | (1 << 1);

      // 4. vcu_alertLevel: 当油门极大时爆发警告工况 (0->1->2)
      const alertLevel = accelPos > 76 ? 2 : (accelPos > 62 ? 1 : 0);
      msg.data[2] = alertLevel;
    } else if (msg.name === 'Engine_Status_DBC') {
      // 5. 模拟 DBC 转速轰油门 (1200rpm - 4200rpm)
      const rpm = 2500 + 1500 * Math.sin(time * 0.7) + (Math.random() * 40 - 20);
      const rpmVal = Math.round(Math.max(1000, rpm));
      msg.data[0] = (rpmVal >> 8) & 0xFF;
      msg.data[1] = rpmVal & 0xFF;

      // 6. 模拟发动机水温 (75 到 95 度)
      const temp = 85 + 4 * Math.sin(time * 0.05);
      msg.data[2] = Math.round(temp);
    }
  }

  /* ============================
     Trace 管道数据拦截与解析
     ============================ */
  function onTraceEntry(entry) {
    if (state.isPaused) return;

    const timestamp = entry.rawTime || Date.now();
    if (!state.firstFrameTime) {
      state.firstFrameTime = timestamp;
    }

    const relTimeSec = (timestamp - state.firstFrameTime) / 1000;

    // 解析 space-separated 的 hex 字符串
    if (!entry.data) return;
    const bytes = entry.data.split(' ').map(x => parseInt(x, 16) || 0);

    // 遍历信号列表进行匹配与解析
    state.signals.forEach(sig => {
      // 匹配 ID (十六进制，去掉前导 0x)
      const targetId = sig.msgId.toUpperCase().replace(/^0X/, '');
      const entryId = entry.id.toUpperCase().replace(/^0X/, '');

      if (entryId === targetId) {
        const val = sig.parseFn(bytes);
        sig.value = val;

        // 存入历史数据
        sig.history.push({ t: relTimeSec, val });

        // 限制历史数据缓存长度，防止内存溢出
        const minKeepTime = relTimeSec - state.maxHistorySec;
        while (sig.history.length > 0 && sig.history[0].t < minKeepTime) {
          sig.history.shift();
        }
      }
    });

    // 实时刷新左侧表格中的当前值单元格
    updateLeftValuesTable();
  }

  /* ============================
     左侧表格数值刷新
     ============================ */
  function updateLeftValuesTable() {
    if (!tbodyEl) return;
    state.signals.forEach(sig => {
      const row = tbodyEl.querySelector(`tr[data-sig-id="${sig.id}"]`);
      if (row) {
        const valCell = row.querySelector('.chart-signal-value-cell');
        if (valCell) {
          valCell.textContent = sig.value.toFixed(2);
        }
      }
    });
  }

  function renderLeftTable() {
    if (!tbodyEl) return;
    tbodyEl.innerHTML = '';
    state.signals.forEach(sig => {
      const tr = document.createElement('tr');
      tr.dataset.sigId = sig.id;
      tr.innerHTML = `
        <td style="text-align: center;"><input type="checkbox" class="chart-sig-cb" ${sig.checked ? 'checked' : ''} /></td>
        <td style="text-align: center;"><span class="chart-signal-color-block" style="background: ${sig.color}"></span></td>
        <td title="${sig.name}">${sig.name}</td>
        <td class="chart-signal-value-cell">${sig.value.toFixed(2)}</td>
      `;

      // 勾选改变事件
      tr.querySelector('.chart-sig-cb').addEventListener('change', (e) => {
        sig.checked = e.target.checked;
      });

      // 行选中高亮
      tr.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;
        tbodyEl.querySelectorAll('tr').forEach(r => r.classList.remove('is-selected'));
        tr.classList.add('is-selected');
      });

      tbodyEl.appendChild(tr);
    });
  }

  /* ============================
     示波器 Canvas 60FPS 渲染主循环
     ============================ */
  function startDrawLoop() {
    if (animId) cancelAnimationFrame(animId);

    const draw = () => {
      drawCanvas();
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
  }

  function stopDrawLoop() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
  }

  function drawCanvas() {
    if (!canvasEl || !ctx) return;

    const width = canvasEl.clientWidth;
    const height = canvasEl.clientHeight;

    // 保持高像素比渲染
    if (canvasEl.width !== width || canvasEl.height !== height) {
      canvasEl.width = width;
      canvasEl.height = height;
    }

    // 1. 清空画布 (CANoe 经典的白底示波器风格)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 绘图视窗内边距
    const padding = { top: 15, right: 20, bottom: 10, left: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // 确定当前的 X 轴时间边界
    let maxTime = 0;
    // 找出所有历史数据中的最大时间
    state.signals.forEach(sig => {
      if (sig.history.length > 0) {
        const lastPt = sig.history[sig.history.length - 1];
        if (lastPt.t > maxTime) maxTime = lastPt.t;
      }
    });

    // 模拟无输入时的时间走动
    if (maxTime === 0 && state.firstFrameTime) {
      maxTime = (Date.now() - state.firstFrameTime) / 1000;
    }

    let minTime = Math.max(0, maxTime - state.timeSpan);
    if (maxTime < state.timeSpan) {
      minTime = 0;
      maxTime = state.timeSpan;
    }

    // 更新底部 X 轴起止刻度
    const labelLeft = document.getElementById('chart-axis-label-left');
    const labelRight = document.getElementById('chart-axis-label-right');
    if (labelLeft) labelLeft.textContent = `${Math.floor(minTime)}[s]`;
    if (labelRight) labelRight.textContent = `${Math.floor(maxTime)}[s]`;

    // 2. 绘制深灰精致网格线 (Grid)
    if (state.showGrid) {
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = '#e2e8f0';

      // 2.1 绘制横向网格线 (5 等分)
      const divisionsY = 5;
      for (let i = 0; i <= divisionsY; i++) {
        const y = padding.top + (chartH * i) / divisionsY;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      // 2.2 绘制纵向网格线 (按每 2 秒划线 ticks)
      const tickStep = 2; // 2秒一个刻度线
      const firstTick = Math.ceil(minTime / tickStep) * tickStep;
      const lastTick = Math.floor(maxTime / tickStep) * tickStep;

      for (let t = firstTick; t <= lastTick; t += tickStep) {
        const ratio = (t - minTime) / (maxTime - minTime);
        const x = padding.left + ratio * chartW;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();

        // 绘制微小的网格秒数标记
        ctx.fillStyle = '#a0aec0';
        ctx.font = '9px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(t.toFixed(0), x, padding.top - 4);
      }
    }

    // 3. 绘制各路信号波形曲线 (Signals Lines)
    state.signals.forEach(sig => {
      if (!sig.checked || sig.history.length === 0) return;

      ctx.beginPath();
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = sig.color;
      ctx.lineJoin = 'round';

      let isFirst = true;

      sig.history.forEach(pt => {
        // 过滤不在当前视窗内的点 (稍微宽限一点边缘点防止折线断头)
        if (pt.t < minTime - 1 || pt.t > maxTime + 1) return;

        const ratioX = (pt.t - minTime) / (maxTime - minTime);
        const x = padding.left + ratioX * chartW;

        // 纵向物理值高度映射
        const ratioY = (pt.val - sig.min) / (sig.max - sig.min);
        const clampedRatioY = Math.max(0, Math.min(1, ratioY)); // 限制在0-1之间
        const y = padding.top + chartH * (1 - clampedRatioY);

        if (isFirst) {
          ctx.moveTo(x, y);
          isFirst = false;
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    });

    // 4. 绘制底部的 X 轴边框线
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#718096';
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // 5. 绘制悬停十字光标线与浮标 (Crosshair Cursor)
    if (mouse.isOver && mouse.x >= padding.left && mouse.x <= width - padding.right) {
      // 5.1 绘制红色虚线垂直指示线
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#d04030';
      ctx.setLineDash([4, 4]); // 虚线
      ctx.beginPath();
      ctx.moveTo(mouse.x, padding.top);
      ctx.lineTo(mouse.x, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]); // 还原实线

      // 计算鼠标所在处的相对时间点
      const ratioX = (mouse.x - padding.left) / chartW;
      const hoverTime = minTime + ratioX * (maxTime - minTime);

      const hoverData = [];

      // 5.2 绘制每个信号在当前虚线时间点上的定位实心小圆圈
      state.signals.forEach(sig => {
        if (!sig.checked || sig.history.length === 0) return;

        // 寻找距离 hoverTime 最近的一个历史点
        let closestPt = sig.history[0];
        let minDiff = Math.abs(closestPt.t - hoverTime);

        for (let i = 1; i < sig.history.length; i++) {
          const diff = Math.abs(sig.history[i].t - hoverTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestPt = sig.history[i];
          }
        }

        // 如果距离较远，代表没有波形
        if (Math.abs(closestPt.t - hoverTime) > 3) return;

        const ptX = padding.left + ((closestPt.t - minTime) / (maxTime - minTime)) * chartW;
        const ratioY = (closestPt.val - sig.min) / (sig.max - sig.min);
        const ptY = padding.top + chartH * (1 - Math.max(0, Math.min(1, ratioY)));

        // 绘制小圆点
        ctx.beginPath();
        ctx.arc(ptX, ptY, 4, 0, Math.PI * 2);
        ctx.fillStyle = sig.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // 记录浮标展示的数据
        hoverData.push({
          name: sig.name,
          color: sig.color,
          value: closestPt.val
        });
      });

      // 5.3 渲染气泡浮窗 (Tooltip HTML)
      updateTooltipBubble(mouse.x, mouse.y, hoverTime, hoverData);
    } else {
      hideTooltipBubble();
    }
  }

  /* ============================
     十字光标浮气泡的 DOM 更新
     ============================ */
  function updateTooltipBubble(mx, my, hoverTime, hoverData) {
    const bubble = document.getElementById('chart-tooltip-bubble');
    if (!bubble) return;

    if (hoverData.length === 0) {
      bubble.style.display = 'none';
      return;
    }

    let html = `<div style="font-weight:bold; border-bottom:1px solid #e2e8f0; padding-bottom:3px; margin-bottom:4px; color:#2d3748;">
      <i class="fa-regular fa-clock" style="color:#d04030; margin-right:4px;"></i>时间: ${hoverTime.toFixed(3)}s
    </div>`;

    hoverData.forEach(item => {
      html += `
        <div class="chart-tooltip-item">
          <span>
            <span class="chart-signal-color-block" style="background: ${item.color}; margin-right:4px;"></span>
            ${item.name}
          </span>
          <span style="font-weight:600; color:#2d3748;">${item.value.toFixed(2)}</span>
        </div>
      `;
    });

    bubble.innerHTML = html;
    bubble.style.display = 'block';

    // 定位气泡浮动位置 (防止超出 Canvas 视口边缘)
    const bubbleW = bubble.offsetWidth;
    const bubbleH = bubble.offsetHeight;
    const containerW = canvasEl.parentNode.clientWidth;
    const containerH = canvasEl.parentNode.clientHeight;

    let posX = mx + 15;
    let posY = my + 15;

    if (posX + bubbleW > containerW) {
      posX = mx - bubbleW - 15;
    }
    if (posY + bubbleH > containerH) {
      posY = my - bubbleH - 15;
    }

    bubble.style.left = `${posX}px`;
    bubble.style.top = `${posY}px`;
  }

  function hideTooltipBubble() {
    const bubble = document.getElementById('chart-tooltip-bubble');
    if (bubble) bubble.style.display = 'none';
  }

  /* ============================
     操作：添加/删除自定义信号
     ============================ */
  function showAddSignalModal() {
    if (document.getElementById('chart-add-modal-el')) {
      document.getElementById('chart-add-modal-el').classList.add('is-active');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'chart-modal';
    modal.id = 'chart-add-modal-el';
    modal.innerHTML = `
      <div class="chart-modal-card">
        <div class="chart-modal-header">
          <div class="chart-modal-title"><i class="fa-solid fa-plus" style="color:#2e8b2e"></i>添加自定义监控信号</div>
          <button class="chart-modal-close" id="chart-modal-close-x"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="chart-modal-body">
          <div class="chart-modal-item">
            <label>信号名称 (Signal Name)</label>
            <input type="text" class="chart-modal-input" id="chart-add-name" value="engine_rpm" placeholder="输入信号名称..." />
          </div>
          <div class="chart-modal-row">
            <div class="chart-modal-item">
              <label>报文ID (CAN Hex ID)</label>
              <input type="text" class="chart-modal-input" id="chart-add-msgid" value="0C9" placeholder="例如: 0C9" />
            </div>
            <div class="chart-modal-item">
              <label>信号色</label>
              <select class="chart-modal-select" id="chart-add-color">
                <option value="#8e44ad" style="color:#8e44ad;">紫色 (Purple)</option>
                <option value="#e67e22" style="color:#e67e22;">橙色 (Orange)</option>
                <option value="#1abc9c" style="color:#1abc9c;">青色 (Teal)</option>
                <option value="#f1c40f" style="color:#f1c40f;">黄色 (Yellow)</option>
                <option value="#e74c3c" style="color:#e74c3c;">鲜红 (LightRed)</option>
              </select>
            </div>
          </div>
          <div class="chart-modal-row">
            <div class="chart-modal-item">
              <label>量程下限 (Min)</label>
              <input type="number" class="chart-modal-input" id="chart-add-min" value="0" />
            </div>
            <div class="chart-modal-item">
              <label>量程上限 (Max)</label>
              <input type="number" class="chart-modal-input" id="chart-add-max" value="8000" />
            </div>
          </div>
          <div class="chart-modal-item" style="border-top:1px dashed #cbd5e0; padding-top:6px; margin-top:4px;">
            <label style="font-weight:600; color:#2d3748;"><i class="fa-solid fa-code" style="margin-right:4px;"></i>解析算法 (Demo级极简偏移)</label>
            <div style="font-size:10px; color:#718096; margin-bottom:4px;">
              选择从第几个字节起读取数值进行波形仿真映射
            </div>
            <select class="chart-modal-select" id="chart-add-offset">
              <option value="0" selected>读取前2字节做 16bit 物理值 (适合大转速/速度)</option>
              <option value="2">读取第2字节 (适合水温/负载等0-255数据)</option>
              <option value="3">读取第3字节</option>
            </select>
          </div>
        </div>
        <div class="chart-modal-footer">
          <button class="chart-modal-btn" id="chart-modal-cancel">取消</button>
          <button class="chart-modal-btn chart-modal-btn--primary" id="chart-modal-submit">确认添加</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('is-active');

    // 绑定 modal 事件
    const closeModal = () => modal.classList.remove('is-active');
    document.getElementById('chart-modal-close-x').addEventListener('click', closeModal);
    document.getElementById('chart-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('chart-modal-submit').addEventListener('click', () => {
      const name = document.getElementById('chart-add-name').value.trim();
      const msgId = document.getElementById('chart-add-msgid').value.trim().toUpperCase();
      const color = document.getElementById('chart-add-color').value;
      const min = parseFloat(document.getElementById('chart-add-min').value) || 0;
      const max = parseFloat(document.getElementById('chart-add-max').value) || 100;
      const offset = parseInt(document.getElementById('chart-add-offset').value, 10);

      if (!name) {
        if (window.showToast) window.showToast('请输入有效的信号名称。');
        return;
      }

      // 添加自定义信号实体
      const newSig = {
        id: `custom_${name}_${Date.now()}`,
        name: name,
        checked: true,
        color: color,
        value: 0.00,
        history: [],
        min: min,
        max: max,
        msgId: msgId,
        parseFn: (bytes) => {
          if (offset === 0) {
            // 前两字节组合 16bit (Big Endian)
            return (bytes[0] << 8) | bytes[1];
          } else {
            return bytes[offset] || 0;
          }
        }
      };

      state.signals.push(newSig);
      renderLeftTable();
      closeModal();
      if (window.showToast) window.showToast(`成功添加自定义信号 "${name}" 监测！`);
    });
  }

  function deleteSelectedSignal() {
    if (!tbodyEl) return;
    const selectedTr = tbodyEl.querySelector('tr.is-selected');
    if (!selectedTr) {
      if (window.showToast) window.showToast('请先在信号列表中点击选择一行需要删除的信号！');
      return;
    }

    const sigId = selectedTr.dataset.sigId;
    // 保护预载信号不被删除
    if (sigId === 'vcu_brakeLight' || sigId === 'vcu_accelPosValid' || sigId === 'vcu_accelPos' || sigId === 'vcu_alertLevel') {
      if (window.showToast) window.showToast('预置的核心系统信号无法删除，只允许进行勾选/取消勾选来控制显隐！');
      return;
    }

    state.signals = state.signals.filter(s => s.id !== sigId);
    renderLeftTable();
    if (window.showToast) window.showToast('自定义信号已成功移除！');
  }

  /* ============================
     拖拽 Splitter 调整左右大小比例
     ============================ */
  function bindSplitterResize() {
    const splitter = panelEl?.querySelector('#chart-splitter');
    const leftPanel = panelEl?.querySelector('.chart-signal-panel');
    if (!splitter || !leftPanel) return;

    let isDrag = false;
    let startX = 0;
    let startWidth = 0;

    splitter.addEventListener('mousedown', (e) => {
      isDrag = true;
      startX = e.clientX;
      startWidth = leftPanel.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDrag) return;
      const dx = e.clientX - startX;
      leftPanel.style.width = Math.max(100, Math.min(450, startWidth + dx)) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDrag) return;
      isDrag = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  /* ============================
     图形监控窗口初始化
     ============================ */
  function init() {
    if (isInitialized) return;

    panelEl = document.querySelector('.workspace-window[data-window="chart-monitor"]');
    if (!panelEl) return;

    canvasEl = panelEl.querySelector('#chart-monitor-canvas');
    if (!canvasEl) return;

    ctx = canvasEl.getContext('2d');
    tbodyEl = panelEl.querySelector('#chart-signal-tbody');
    if (!tbodyEl) return;

    isInitialized = true;

    // 1. 渲染左侧信号列表表格
    renderLeftTable();

    // 2. 绑定 Canvas 鼠标十字虚线滑动事件
    canvasEl.addEventListener('mousemove', (e) => {
      const rect = canvasEl.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.isOver = true;
    });

    canvasEl.addEventListener('mouseleave', () => {
      mouse.isOver = false;
    });

    // 3. 绑定左侧工具栏
    const addBtn = panelEl.querySelector('#chart-btn-add');
    if (addBtn) addBtn.addEventListener('click', showAddSignalModal);

    const delBtn = panelEl.querySelector('#chart-btn-delete');
    if (delBtn) delBtn.addEventListener('click', deleteSelectedSignal);

    const selectAllCb = panelEl.querySelector('#chart-signal-select-all');
    if (selectAllCb) {
      selectAllCb.addEventListener('change', (e) => {
        const checked = e.target.checked;
        state.signals.forEach(s => s.checked = checked);
        renderLeftTable();
      });
    }

    // 4. 绑定右侧 Canvas 工具栏
    // 4.1 切换网格线
    const gridBtn = panelEl.querySelector('#chart-btn-grid');
    if (gridBtn) {
      gridBtn.addEventListener('click', () => {
        state.showGrid = !state.showGrid;
        gridBtn.classList.toggle('is-active', !state.showGrid);
        if (window.showToast) window.showToast(state.showGrid ? '网格线已显示' : '网格线已隐藏');
      });
    }

    // 4.2 暂停/启动监视
    const pauseBtn = panelEl.querySelector('#chart-btn-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        state.isPaused = !state.isPaused;
        pauseBtn.innerHTML = state.isPaused
          ? '<i class="fa-solid fa-play" style="color:#2e8b2e"></i>'
          : '<i class="fa-solid fa-pause" style="color:#e6a23c"></i>';
        pauseBtn.title = state.isPaused ? "启动监视 (继续绘制)" : "暂停监视 (静止屏幕)";
        if (window.showToast) window.showToast(state.isPaused ? '图形监控已暂停滚动' : '图形监控已恢复实时绘制');
      });
    }

    // 4.3 X轴时窗缩放 (Zoom In/Out)
    const zoomInBtn = panelEl.querySelector('#chart-btn-zoom-in');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        // 时窗缩小，波形看起来被水平拉伸拉宽
        state.timeSpan = Math.max(5, state.timeSpan - 4);
        if (window.showToast) window.showToast(`X 轴展示时窗已缩至 ${state.timeSpan} 秒`);
      });
    }

    const zoomOutBtn = panelEl.querySelector('#chart-btn-zoom-out');
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        // 时窗扩大，波形看起来被压缩拉窄
        state.timeSpan = Math.min(60, state.timeSpan + 4);
        if (window.showToast) window.showToast(`X 轴展示时窗已扩至 ${state.timeSpan} 秒`);
      });
    }

    const fitBtn = panelEl.querySelector('#chart-btn-fit');
    if (fitBtn) {
      fitBtn.addEventListener('click', () => {
        state.timeSpan = 24; // 还原经典 24 秒
        if (window.showToast) window.showToast('X 轴时窗已重设为默认 24 秒');
      });
    }

    // 4.4 橡皮擦一键清空波形
    const clearBtn = panelEl.querySelector('#chart-btn-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.signals.forEach(sig => {
          sig.history = [];
          sig.value = 0.00;
        });
        state.firstFrameTime = null;
        updateLeftValuesTable();
        if (window.showToast) window.showToast('已清空图形历史波形缓存。');
      });
    }

    // 5. 拖拽 Splitter 初始化
    bindSplitterResize();

    // 6. 启动 60FPS 示波器渲染线程
    startDrawLoop();

    // 7. 挂接全局 Trace 接口回调，实现无缝泵入拦截
    hookTraceEntryPipeline();
  }

  /* ============================
     拦截器：挂钩 window.addTraceEntry 实现数据平滑泵入
     ============================ */
  function hookTraceEntryPipeline() {
    const originalAddTraceEntry = window.ConsoleTrace ? window.ConsoleTrace.addTraceEntry : null;

    const newAddTraceEntry = (entry) => {
      // 1. 保留原本的 Trace 行为
      if (originalAddTraceEntry) {
        originalAddTraceEntry(entry);
      }

      // 2. 注入图形监控解析回调
      onTraceEntry(entry);
    };

    if (window.ConsoleTrace) {
      window.ConsoleTrace.addTraceEntry = newAddTraceEntry;
    }
    // 确保直接调用全局 window.addTraceEntry 的老代码也能完美重定向
    window.addTraceEntry = newAddTraceEntry;
  }

  // 监听侧边栏，打开“图形监控”窗口时延迟初始化以确保 DOM 布局可用
  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-window="chart-monitor"]');
    if (item) {
      setTimeout(init, 120);
    }
  });

  return { generateDynamicSignals, init, onTraceEntry };
})();

// 页面加载尝试挂接绑定
setTimeout(() => {
  if (window.ConsoleChart) window.ConsoleChart.init();
}, 250);
