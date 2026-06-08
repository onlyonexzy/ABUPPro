/**
 * Console Page - Bus Tree + Topology Diagram
 *
 * 控制台页面核心交互逻辑：
 * - 左侧树形视图：展示总线/ECU/Slave 层级结构
 * - 右侧拓扑图：根据选中的总线展示 ECU 节点与总线接口的连接关系
 *   - 多 ECU 时采用 2 列网格 + 共享水平干线连线方式
 * - 底部 Tab 栏：切换不同总线的拓扑视图
 * - 可拖拽分割条：调整左右面板宽度
 */
(() => {
  const layout = document.getElementById("console-layout");
  if (!layout) return;

  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ============================
     Mock Data - 总线/节点配置
     ============================ */
  const busConfig = [
    {
      id: "can1",
      name: "CAN1",
      type: "can",
      busType: "CAN",
      baudrate: "500Kbps",
      desc: "CAN",
      checked: true,
      expanded: true,
      children: [
        { id: "can1-ecu1", name: "ECM", type: "ecu", checked: true, requestAddr: "0618" },
        { id: "can1-ecu2", name: "TCU", type: "ecu", checked: true, requestAddr: "0641" },
        { id: "can1-ecu3", name: "ABS", type: "ecu", checked: true, requestAddr: "0760" },
        { id: "can1-ecu4", name: "BCM", type: "ecu", checked: true, requestAddr: "0740" },
        { id: "can1-ecu5", name: "SRS", type: "ecu", checked: true, requestAddr: "0750" },
      ],
    },
    {
      id: "eth1",
      name: "Ethernet1",
      type: "ethernet",
      busType: "Ethernet",
      baudrate: "100Mbps",
      ip: "172.16.8.2",
      desc: "以太网",
      checked: true,
      expanded: true,
      children: [
        { id: "eth1-ecu1", name: "GW", type: "ecu", checked: true, logicAddr: "0x1010" },
        { id: "eth1-ecu2", name: "IVI", type: "ecu", checked: true, logicAddr: "0x2010" },
        { id: "eth1-ecu3", name: "TBOX", type: "ecu", checked: true, logicAddr: "0x3010" },
        { id: "eth1-ecu4", name: "ADAS", type: "ecu", checked: true, logicAddr: "0x4010" },
      ],
    },
  ];

  const iconMap = {
    can: "fa-solid fa-road",
    ethernet: "fa-solid fa-network-wired",
    lin: "fa-solid fa-link",
    ecu: "fa-solid fa-microchip",
    slave: "fa-solid fa-cube",
    master: "fa-solid fa-crown",
  };

  let selectedNodeId = "eth1-ecu1";
  let activeBusId = "eth1";

  const treeEl = document.getElementById("console-tree");
  const infoEl = document.getElementById("console-topo-info");
  const canvasEl = document.getElementById("console-topo-canvas");
  const tabsEl = document.getElementById("console-topo-tabs");
  const treePanel = document.getElementById("console-tree-panel");
  const splitter = document.getElementById("console-splitter");

  /* ============================
     Tree Rendering (HTML Template based)
     ============================ */
  let expandedBusIds = ["can1", "eth1"];

  function buildTree() {
    const esc = (val) => String(val ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const getIconClass = (type) => {
      const map = { can: "fa-solid fa-road", canfd: "fa-solid fa-road", ethernet: "fa-solid fa-network-wired", lin: "fa-solid fa-link", ecu: "fa-solid fa-microchip", slave: "fa-solid fa-cube", master: "fa-solid fa-crown" };
      return map[type] || "fa-solid fa-microchip";
    };
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

    treeEl.innerHTML = busConfig.map(bus => {
      const expanded = expandedBusIds.includes(bus.id);
      const isBusActive = selectedNodeId === bus.id;
      return `
        <div class="basic-diag-tree-group">
          <div class="basic-diag-tree-node ${isBusActive ? "is-active" : ""}">
            <button class="basic-diag-tree-toggle" data-role="console-toggle-bus" data-bus-id="${esc(bus.id)}">
              ${expanded ? "−" : "+"}
            </button>
            <button class="basic-diag-tree-label" data-role="console-pick-bus" data-bus-id="${esc(bus.id)}">
              <i class="${getIconClass(bus.type)}"></i>
              <span>${esc(bus.name)}</span>
              <span class="basic-diag-tree-label__baud">${esc(bus.baudrate || "")}</span>
            </button>
            ${(bus.id === "can1" || bus.type === "can" || bus.type === "canfd") ? `
              <button class="basic-diag-switch-btn" type="button" data-role="console-toggle-bus-protocol" data-bus-id="${esc(bus.id)}" title="切换为 ${bus.type === "can" ? "CANFD" : "CAN"}">
                <i class="fa-solid fa-right-left"></i>
              </button>
            ` : ""}
          </div>
          <div class="basic-diag-tree-children ${expanded ? "" : "is-collapsed"}">
            ${(bus.children || []).map(ecu => {
              const isActive = selectedNodeId === ecu.id;
              return `
                <button class="basic-diag-tree-child ${isActive ? "is-active" : ""}"
                  data-role="console-pick-ecu" data-bus-id="${esc(bus.id)}" data-ecu-id="${esc(ecu.id)}">
                  <i class="${getIconClass(ecu.type)}"></i>
                  <span>${esc(getEcuDisplayLabel(ecu, bus))}</span>
                </button>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");
  }

  /* ============================
     Tree Interactions
     ============================ */
  treePanel.addEventListener("click", (e) => {
    // 1. 点击展开/折叠
    const toggleBtn = e.target.closest('[data-role="console-toggle-bus"]');
    if (toggleBtn) {
      const busId = toggleBtn.dataset.busId;
      const idx = expandedBusIds.indexOf(busId);
      if (idx >= 0) {
        expandedBusIds.splice(idx, 1);
      } else {
        expandedBusIds.push(busId);
      }
      buildTree();
      return;
    }

    // 2. 点击总线协议转换按钮 (CAN <-> CANFD)
    const switchProtoBtn = e.target.closest('[data-role="console-toggle-bus-protocol"]');
    if (switchProtoBtn) {
      e.stopPropagation();
      const busId = switchProtoBtn.dataset.busId;
      const bus = busConfig.find(b => b.id === busId);
      if (bus) {
        if (bus.type === "can") {
          bus.type = "canfd";
          bus.name = "CANFD1";
          bus.baudrate = "8Mbps";
          bus.busType = "CANFD";
          bus.desc = "CANFD";
        } else {
          bus.type = "can";
          bus.name = "CAN1";
          bus.baudrate = "500Kbps";
          bus.busType = "CAN";
          bus.desc = "CAN";
        }
        buildTree();
        if (activeBusId === busId) {
          renderTabs();
          renderTopology();
          updateInfoBar();
        }
      }
      return;
    }

    // 3. 点击总线节点
    const busLabelBtn = e.target.closest('[data-role="console-pick-bus"]');
    if (busLabelBtn) {
      const busId = busLabelBtn.dataset.busId;
      selectedNodeId = busId;
      activeBusId = busId;
      buildTree();
      renderTabs();
      renderTopology();
      updateInfoBar();
      return;
    }

    // 4. 点击子节点 ECU
    const ecuBtn = e.target.closest('[data-role="console-pick-ecu"]');
    if (ecuBtn) {
      const busId = ecuBtn.dataset.busId;
      const ecuId = ecuBtn.dataset.ecuId;
      selectedNodeId = ecuId;
      activeBusId = busId;
      buildTree();
      renderTabs();
      renderTopology();
      updateInfoBar();
      return;
    }

    // 5. 点击左侧工具栏的 DBC 导入按钮
    const importBtn = e.target.closest('[data-role="console-import-dbc"]');
    if (importBtn) {
      if (activeBusId === "can1") {
        if (window.ConsoleCan && window.ConsoleCan.importDBC) {
          window.ConsoleCan.importDBC();
        } else {
          console.warn("[ConsoleCan] 未找到 importDBC 接口");
        }
      } else {
        if (window.showToast) {
          window.showToast("DBC导入仅适用于 CAN 总线。已自动为您切换到 CAN1 并执行导入！");
        }
        selectedNodeId = "can1";
        activeBusId = "can1";
        buildTree();
        renderTabs();
        renderTopology();
        updateInfoBar();
        setTimeout(() => {
          if (window.ConsoleCan && window.ConsoleCan.importDBC) {
            window.ConsoleCan.importDBC();
          }
        }, 100);
      }
      return;
    }
  });

  /* ============================
     Tab Rendering
     ============================ */
  function renderTabs() {
    tabsEl.innerHTML = "";
    busConfig.forEach((bus) => {
      const tab = document.createElement("button");
      tab.className = "console-topo-tab";
      if (bus.id === activeBusId) tab.classList.add("is-active");
      tab.textContent = bus.name;
      tab.dataset.busId = bus.id;
      tabsEl.appendChild(tab);
    });
  }

  tabsEl.addEventListener("click", (e) => {
    const tab = e.target.closest(".console-topo-tab");
    if (!tab) return;
    activeBusId = tab.dataset.busId;
    selectedNodeId = activeBusId;
    buildTree();
    renderTabs();
    renderTopology();
    updateInfoBar();
  });

  /* ============================
     Info Bar
     ============================ */
  function updateInfoBar() {
    const bus = busConfig.find((b) => b.id === activeBusId);
    if (!bus) {
      infoEl.innerHTML = "";
      return;
    }

    let html = `<span class="console-topo-info__pair">
      <span class="console-topo-info__key">BusType:</span>
      <span class="console-topo-info__val">${bus.busType}</span>
    </span>`;

    html += `<span class="console-topo-info__pair">
      <span class="console-topo-info__key">Baudrate:</span>
      <span class="console-topo-info__val">${bus.baudrate}</span>
    </span>`;

    if (bus.ip) {
      html += `<span class="console-topo-info__pair">
        <span class="console-topo-info__key">IP:</span>
        <span class="console-topo-info__val">${bus.ip}</span>
      </span>`;
    }

    html += `<span class="console-topo-info__tag">${bus.desc}</span>`;
    infoEl.innerHTML = html;
  }

  /* ============================
     Topology Constants
     ============================ */
  const TOPO = {
    ECU_W: 120,
    GAP_X: 30,
    TRUNK_GAP: 34,
    MARGIN_LEFT: 24,
    MARGIN_TOP: 20,
    BUS_IF_W: 110,
    BUS_IF_H: 56,
  };

  /* ============================
     Topology Diagram Rendering
     ============================ */
  function renderTopology() {
    const canPanel = document.getElementById("console-can-panel");
    const ethPanel = document.getElementById("console-eth-panel");

    const bus = busConfig.find((b) => b.id === activeBusId);

    if (bus && (bus.type === "can" || bus.type === "canfd")) {
      if (canvasEl) canvasEl.classList.add("is-hidden");
      if (infoEl) infoEl.classList.add("is-hidden");
      if (ethPanel) ethPanel.classList.add("is-hidden");
      if (canPanel) {
        canPanel.classList.remove("is-hidden");
        if (window.ConsoleCan) {
          window.ConsoleCan.activate(bus.id, bus.name);
        }
      }
      return;
    }

    if (bus && bus.type === "ethernet") {
      if (canvasEl) canvasEl.classList.add("is-hidden");
      if (infoEl) infoEl.classList.add("is-hidden");
      if (canPanel) canPanel.classList.add("is-hidden");
      if (ethPanel) {
        ethPanel.classList.remove("is-hidden");
        if (window.ConsoleEth) {
          window.ConsoleEth.activate(bus.id, bus.name);
        }
      }
      return;
    }

    // 默认情况（显示原拓扑视图）
    if (canPanel) canPanel.classList.add("is-hidden");
    if (ethPanel) ethPanel.classList.add("is-hidden");
    if (canvasEl) canvasEl.classList.remove("is-hidden");
    if (infoEl) infoEl.classList.remove("is-hidden");

    canvasEl.innerHTML = "";
    canvasEl.style.minWidth = "";
    canvasEl.style.minHeight = "";

    if (!bus) {
      canvasEl.innerHTML =
        '<div class="topo-empty"><i class="fa-solid fa-diagram-project"></i>选择一个总线查看拓扑</div>';
      return;
    }

    const activeChildren = bus.children.filter((c) => c.checked);
    if (activeChildren.length === 0) {
      canvasEl.innerHTML =
        '<div class="topo-empty"><i class="fa-solid fa-diagram-project"></i>该总线下暂无启用节点</div>';
      return;
    }

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("console-topo-canvas__svg");
    canvasEl.appendChild(svg);

    const canvasRect = canvasEl.getBoundingClientRect();
    const cw = Math.max(canvasRect.width || 500, 400);
    const ch = Math.max(canvasRect.height || 350, 250);

    const count = activeChildren.length;

    if (count === 1) {
      renderSingleNode(svg, canvasEl, activeChildren[0], bus, cw, ch);
    } else {
      renderMultiNodes(svg, canvasEl, activeChildren, bus, cw, ch);
    }
  }

  /**
   * 单个 ECU 节点的简单左右布局
   */
  function renderSingleNode(svg, canvas, child, bus, cw, ch) {
    const ecuX = TOPO.MARGIN_LEFT + 40;
    const ecuY = 30;

    const ecuEl = createEcuNode(child);
    ecuEl.style.left = ecuX + "px";
    ecuEl.style.top = ecuY + "px";
    canvas.appendChild(ecuEl);

    requestAnimationFrame(() => {
      const ecuH = ecuEl.offsetHeight;
      const ecuCX = ecuX + TOPO.ECU_W / 2;
      const ecuBottom = ecuY + ecuH;
      const trunkY = ecuBottom + TOPO.TRUNK_GAP;

      const busIfX = Math.min(cw * 0.62, cw - 160);
      const busIfY = trunkY - TOPO.BUS_IF_H / 2 - 12;

      const busEl = createBusInterface(bus);
      busEl.style.left = busIfX + "px";
      busEl.style.top = busIfY + "px";
      canvas.appendChild(busEl);

      const totalW = Math.max(cw, busIfX + TOPO.BUS_IF_W + 60);
      svg.setAttribute("width", totalW);
      svg.setAttribute("height", ch);
      svg.setAttribute("viewBox", `0 0 ${totalW} ${ch}`);
      canvas.style.minWidth = totalW + "px";

      const busCY = busIfY + TOPO.BUS_IF_H / 2 + 12;

      drawLine(svg, ecuCX, ecuBottom, ecuCX, trunkY);
      drawLine(svg, ecuCX, trunkY, busIfX, trunkY, true);
      drawLine(svg, busIfX, trunkY, busIfX, busCY);
    });
  }

  /**
   * 多 ECU 节点的按列分配 + 共享水平干线布局
   *
   * 按列分配：列数 = ceil(N/2)，每列上下各放一个节点
   * 布局示意（5 个节点）：
   *   [0]    [2]    [4]       ← 上方一行
   *    |      |      |
   *   -+------+------+---------[Bus]
   *    |      |
   *   [1]    [3]               ← 下方一行
   *
   * 使用 DOM 实际测量值确定干线位置和连线端点
   */
  function renderMultiNodes(svg, canvas, children, bus, cw, ch) {
    const count = children.length;
    const numCols = Math.ceil(count / 2);
    const topY = TOPO.MARGIN_TOP;

    const columns = [];

    for (let col = 0; col < numCols; col++) {
      const topIdx = col * 2;
      const bottomIdx = col * 2 + 1;
      const x = TOPO.MARGIN_LEFT + col * (TOPO.ECU_W + TOPO.GAP_X);
      const entry = { x, topEl: null, bottomEl: null };

      if (topIdx < count) {
        const el = createEcuNode(children[topIdx]);
        el.style.left = x + "px";
        el.style.top = topY + "px";
        canvas.appendChild(el);
        entry.topEl = el;
      }

      if (bottomIdx < count) {
        const el = createEcuNode(children[bottomIdx]);
        el.style.left = x + "px";
        canvas.appendChild(el);
        entry.bottomEl = el;
      }

      columns.push(entry);
    }

    requestAnimationFrame(() => {
      let maxTopH = 0;
      columns.forEach((c) => {
        if (c.topEl) maxTopH = Math.max(maxTopH, c.topEl.offsetHeight);
      });

      const trunkY = topY + maxTopH + TOPO.TRUNK_GAP;
      const bottomY = trunkY + TOPO.TRUNK_GAP;

      columns.forEach((c) => {
        if (c.bottomEl) c.bottomEl.style.top = bottomY + "px";
      });

      const ecuBlockRight =
        TOPO.MARGIN_LEFT + numCols * (TOPO.ECU_W + TOPO.GAP_X);
      const busIfX = Math.max(
        ecuBlockRight + 20,
        Math.min(cw * 0.6, cw - 160)
      );
      const busIfY = trunkY - TOPO.BUS_IF_H / 2 - 12;

      const busEl = createBusInterface(bus);
      busEl.style.left = busIfX + "px";
      busEl.style.top = busIfY + "px";
      canvas.appendChild(busEl);

      const bottomExists = columns.some((c) => c.bottomEl);
      let maxBottomH = 0;
      columns.forEach((c) => {
        if (c.bottomEl)
          maxBottomH = Math.max(maxBottomH, c.bottomEl.offsetHeight);
      });

      const totalW = Math.max(cw, busIfX + TOPO.BUS_IF_W + 60);
      const totalH = bottomExists
        ? Math.max(ch, bottomY + maxBottomH + 24)
        : Math.max(ch, trunkY + 60);

      svg.setAttribute("width", totalW);
      svg.setAttribute("height", totalH);
      svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
      canvas.style.minWidth = totalW + "px";
      canvas.style.minHeight = totalH + "px";

      let trunkMinX = Infinity;
      let trunkMaxX = -Infinity;

      columns.forEach((c) => {
        const cx = c.x + TOPO.ECU_W / 2;
        trunkMinX = Math.min(trunkMinX, cx);
        trunkMaxX = Math.max(trunkMaxX, cx);

        if (c.topEl) {
          const topH = c.topEl.offsetHeight;
          drawLine(svg, cx, topY + topH, cx, trunkY);
        }
        if (c.bottomEl) {
          drawLine(svg, cx, trunkY, cx, bottomY);
        }
      });

      const busConnX = busIfX;
      trunkMaxX = Math.max(trunkMaxX, busConnX);

      drawLine(svg, trunkMinX, trunkY, trunkMaxX, trunkY, true);

      const busCenterY = busIfY + TOPO.BUS_IF_H / 2 + 12;
      drawLine(svg, busConnX, trunkY, busConnX, busCenterY);
    });
  }

  /* ============================
     ECU / Bus Node Creation
     ============================ */
  function createEcuNode(child) {
    const el = document.createElement("div");
    el.className = "topo-ecu";

    const typeLabel =
      child.type === "master"
        ? "Master"
        : child.type === "ecu"
          ? "ECU"
          : "Slave";

    el.innerHTML = `
      <div class="topo-ecu__box">
        <div class="topo-ecu__title">${typeLabel}</div>
        <div class="topo-ecu__name">${child.name}</div>
        <div class="topo-ecu__check"><i class="fa-solid fa-check"></i></div>
        <div class="topo-ecu__actions">
          <span class="topo-ecu__action" title="诊断"><i class="fa-solid fa-stethoscope"></i></span>
          <span class="topo-ecu__action" title="设置"><i class="fa-solid fa-gear"></i></span>
        </div>
      </div>
    `;
    return el;
  }

  function createBusInterface(bus) {
    const el = document.createElement("div");
    el.className = "topo-bus";

    const modClass =
      bus.type === "can"
        ? "topo-bus__box--can"
        : bus.type === "lin"
          ? "topo-bus__box--lin"
          : "";

    el.innerHTML = `
      <div class="topo-bus__top-actions">
        <button class="topo-bus__action-btn" title="连接"><i class="fa-solid fa-tower-broadcast"></i></button>
        <button class="topo-bus__action-btn" title="列表"><i class="fa-solid fa-bars"></i></button>
        <button class="topo-bus__action-btn" title="设置"><i class="fa-solid fa-gear"></i></button>
      </div>
      <div class="topo-bus__box ${modClass}">
        <div class="topo-bus__name">${bus.name}</div>
        <div class="topo-bus__rate">${bus.baudrate}</div>
        <div class="topo-bus__pins">
          <div class="topo-bus__pin"></div>
          <div class="topo-bus__pin"></div>
        </div>
      </div>
    `;
    return el;
  }

  /* ============================
     SVG Line Drawing Helpers
     ============================ */
  function drawLine(svg, x1, y1, x2, y2, isTrunk) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.classList.add("topo-line");
    if (isTrunk) line.classList.add("topo-line--trunk");
    svg.appendChild(line);
  }

  /* ============================
     Splitter - Drag to Resize
     ============================ */
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  splitter.addEventListener("mousedown", (e) => {
    if (e.target.closest(".console-splitter__toggle")) return;
    isDragging = true;
    startX = e.clientX;
    startWidth = treePanel.offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(80, Math.min(400, startWidth + dx));
    treePanel.style.width = newWidth + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    renderTopology();
  });

  let treePanelCollapsed = false;

  splitter
    .querySelector(".console-splitter__toggle")
    .addEventListener("click", () => {
      treePanelCollapsed = !treePanelCollapsed;
      const toggleIcon = splitter.querySelector(".console-splitter__toggle i");

      if (treePanelCollapsed) {
        treePanel.style.display = "none";
        toggleIcon.className = "fa-solid fa-chevron-right";
      } else {
        treePanel.style.display = "";
        toggleIcon.className = "fa-solid fa-chevron-left";
      }

      requestAnimationFrame(() => renderTopology());
    });

  /* ============================
     Window Resize Handler
     ============================ */
  let resizeTimer;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderTopology(), 100);
  });
  resizeObserver.observe(canvasEl);

  /* ============================
     Initialization
     ============================ */
  buildTree();
  renderTabs();
  updateInfoBar();
  renderTopology();

  // 暴露 API 给全局，以便在仿真控制台的标题栏切换协议时进行联动
  window.ConsoleDiagram = {
    switchProtocol(busId) {
      const bus = busConfig.find(b => b.id === busId);
      if (bus) {
        if (bus.type === "can") {
          bus.type = "canfd";
          bus.name = "CANFD1";
          bus.baudrate = "8Mbps";
          bus.busType = "CANFD";
          bus.desc = "CANFD";
        } else {
          bus.type = "can";
          bus.name = "CAN1";
          bus.baudrate = "500Kbps";
          bus.busType = "CAN";
          bus.desc = "CAN";
        }
        buildTree();
        if (activeBusId === busId) {
          renderTabs();
          renderTopology();
          updateInfoBar();
        }
      }
    },
    getBusConfig(busId) {
      return busConfig.find(b => b.id === busId);
    }
  };
})();
