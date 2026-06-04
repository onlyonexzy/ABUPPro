(function () {
  const root = document.getElementById("pdx-check-root");
  if (!root) return;

  class PdxMockService {
    static BUS_TYPES = ["CAN", "CANFD", "ETH", "LIN"];

    static DID_DEFINITIONS = [
      { id: "22F189", name: "应用软件版本", field: "app" },
      { id: "22F1C0", name: "标定软件版本", field: "cal" },
      { id: "22F1C1", name: "底层软件版本", field: "boot" },
      { id: "22F190", name: "VIN", field: "vin" },
      { id: "22F187", name: "供应商编码", field: "supplierCode" },
      { id: "22F18A", name: "ECU零件号", field: "partNumber" },
      { id: "22F18B", name: "ECU硬件号", field: "hardwarePart" },
      { id: "22F18C", name: "ECU软件号", field: "softwarePart" },
      { id: "22F18D", name: "生产日期", field: "buildDate" },
      { id: "22F18E", name: "诊断版本", field: "diagVersion" },
      { id: "22F18F", name: "刷写计数", field: "flashCount" },
      { id: "22F191", name: "ECU名称", field: "ecuName" },
      { id: "22F192", name: "总线名称", field: "busName" },
      { id: "22F193", name: "节点地址", field: "nodeAddress" },
      { id: "22F194", name: "配置版本", field: "configVersion" },
      { id: "22F195", name: "系统配置", field: "systemConfig" },
    ];

    static DTC_TEMPLATES = {
      CAN: [
        ["U010087", "与网关控制器通讯中断", "当前"],
        ["B124100", "配置数据校验失败", "历史"],
        ["U012100", "与ESP控制器通讯丢失", "当前"],
        ["U014000", "与车身控制器通讯中断", "历史"],
        ["C056100", "转向角信号超出范围", "当前"],
        ["B17F211", "点火状态异常", "历史"],
        ["U030000", "软件版本不匹配", "当前"],
        ["C151200", "电源监控异常", "历史"],
      ],
      CANFD: [
        ["U014687", "与车身域控制器通讯丢失", "当前"],
        ["C110100", "程序块校验失败", "历史"],
        ["U100300", "CANFD报文调度异常", "当前"],
        ["U120211", "整车网络同步失败", "历史"],
        ["B102455", "配置区版本异常", "当前"],
        ["C220677", "安全访问次数超限", "历史"],
        ["U145888", "诊断会话超时", "当前"],
        ["B155012", "数据段完整性错误", "历史"],
      ],
      ETH: [
        ["U196700", "DoIP 会话异常中断", "当前"],
        ["B15A318", "以太网链路质量低", "历史"],
        ["U1A0100", "TCP连接被远端关闭", "当前"],
        ["U1A0200", "逻辑地址冲突", "历史"],
        ["B15A411", "以太网诊断路由异常", "当前"],
        ["U1A0333", "报文重组失败", "历史"],
        ["U1A0444", "AliveCheck超时", "当前"],
        ["B15A522", "IP配置与PDX不一致", "历史"],
      ],
      LIN: [
        ["U015587", "LIN 从节点响应超时", "当前"],
        ["C123400", "转向角信号异常", "历史"],
        ["U100900", "LIN帧头丢失", "当前"],
        ["U101000", "LIN校验和错误", "历史"],
        ["B127700", "节点唤醒失败", "当前"],
        ["C123455", "转矩信号异常", "历史"],
        ["U101100", "调度表执行异常", "当前"],
        ["B128800", "节点地址冲突", "历史"],
      ],
    };

    static resolveProtocol(fileName) {
      const name = String(fileName || "").toUpperCase();
      if (name.includes("CANFD") || name.includes("_FD") || name.includes("FD_")) return "CANFD";
      if (name.includes("ETH") || name.includes("DOIP") || name.includes("ZCU") || name.includes("HUT")) return "ETH";
      if (name.includes("LIN")) return "LIN";
      return "CAN";
    }

    static buildPtsFileName(fileName) {
      const source = String(fileName || "import.pdx").replace(/\.(pdx|zip)$/i, "");
      return `${source}.pts`;
    }

    static getCalibrationVersion(ecu) {
      return (
        ecu.calibrationSoftwareVersion ||
        ecu.calibrationVersion ||
        `${ecu.shortName}_CAL_202603`
      );
    }

    static getBootVersion(ecu) {
      return (
        ecu.bootSoftwareVersion ||
        ecu.baseSoftwareVersion ||
        `${ecu.shortName}_BL_1.0.3`
      );
    }

    static buildVin(bus, ecu) {
      const busCode = String(bus.name || bus.protocol || "BUS")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase()
        .slice(0, 2) || "BU";
      const ecuCode = String(ecu.shortName || "ECU")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase()
        .slice(0, 3) || "ECU";
      return `LGW${busCode}${ecuCode}0123456789`;
    }

    static buildDidList(bus, ecu) {
      const values = {
        app: ecu.targetVersion || "--",
        cal: this.getCalibrationVersion(ecu),
        boot: this.getBootVersion(ecu),
        vin: this.buildVin(bus, ecu),
        supplierCode: ecu.supplierCode || "--",
        partNumber: `${ecu.shortName}-PN-2026`,
        hardwarePart: ecu.hardwareVersion || `${ecu.shortName}-HW-A1`,
        softwarePart: ecu.targetVersion || `${ecu.shortName}-SW-A1`,
        buildDate: "2026-03-18",
        diagVersion: "DID-2.3.1",
        flashCount: "12",
        ecuName: ecu.shortName || "--",
        busName: bus.name || "--",
        nodeAddress: ecu.requestAddress || ecu.logicAddress || "0x2010",
        configVersion: "CFG-2026.03",
        systemConfig: "SYS-CFG-V1.0",
      };

      const definitions = [...this.DID_DEFINITIONS];
      while (definitions.length < 30) {
        const index = definitions.length - this.DID_DEFINITIONS.length + 1;
        definitions.push({
          id: `22F${String(195 + index).padStart(3, "0")}`,
          name: `扩展诊断项${String(index).padStart(2, "0")}`,
          field: "configVersion",
        });
      }

      return definitions.map((item, index) => ({
        id: item.id,
        name: item.name,
        value: "--",
        actualValue:
          item.field === "configVersion" && index >= this.DID_DEFINITIONS.length
            ? `EXT-${String(index + 1).padStart(2, "0")}`
            : values[item.field] || "--",
        validationPassed: false,
        validationResult: "--",
        lastReadTime: "--",
      }));
    }

    static buildDtcList(bus, ecu) {
      const templates = this.DTC_TEMPLATES[bus.protocol] || this.DTC_TEMPLATES.CAN;
      const rows = [];
      for (let index = 0; index < 30; index += 1) {
        const [code, description, actualStatus] = templates[index % templates.length];
        const suffix = String(index + 1).padStart(2, "0");
        rows.push({
          code: `${code}${suffix}`,
          description: `${description}${index >= templates.length ? ` ${suffix}` : ""}`,
          status: "--",
          actualStatus: actualStatus === "当前" ? "存在" : "不存在",
          detail: `${ecu.shortName} / ${bus.name} / Snapshot ${index + 1}`,
          lastReadTime: "--",
        });
      }
      return rows;
    }

    static buildExtraDtcList(bus, ecu) {
      const map = {
        CAN: [
          ["U100100", "总线负载异常"],
          ["B120200", "配置项超出 PDX 定义"],
          ["U100201", "冗余故障记录未清除"],
          ["B120233", "多余告警项未映射"],
        ],
        CANFD: [
          ["U300188", "报文调度未在 PDX 定义中"],
          ["C220344", "安全访问失败记录冗余"],
          ["U300199", "下载会话故障项冗余"],
          ["B220355", "配置镜像冗余项未清除"],
        ],
        ETH: [
          ["U500122", "DoIP 节点发现记录冗余"],
          ["B15A411", "以太网通道诊断项冗余"],
          ["U500133", "TCP诊断会话残留"],
          ["B15A422", "IP诊断快照冗余"],
        ],
        LIN: [
          ["U015500", "LIN 从节点离线历史冗余"],
          ["C123455", "转向角校验项冗余"],
          ["U015566", "调度表故障项冗余"],
          ["C123466", "唤醒失败记录冗余"],
        ],
      };
      return (map[bus.protocol] || map.CAN).map(([code, description]) => ({
        ecuName: ecu.shortName,
        code,
        description,
      }));
    }

    static getDtcHex(code) {
      if (!code) return "--";
      const c = code.toUpperCase();
      const prefixMap = { 'P': '0', 'C': '4', 'B': '8', 'U': 'C' };
      const firstChar = c.charAt(0);
      const start = prefixMap[firstChar] || 'C';
      const rest = c.slice(1);
      
      if (c.startsWith("U010087")) return "C1 00 87" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B124100")) return "92 41 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U012100")) return "C1 21 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U014000")) return "C1 40 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("C056100")) return "80 56 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B17F211")) return "97 F2 11" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U030000")) return "C3 00 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("C151200")) return "81 51 00" + (c.slice(7) ? " " + c.slice(7) : "");
      
      if (c.startsWith("U196700")) return "D9 67 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B15A318")) return "95 A3 18" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U1A0100")) return "DA 01 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U1A0200")) return "DA 02 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B15A411")) return "95 A4 11" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U1A0333")) return "DA 03 33" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U1A0444")) return "DA 04 44" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B15A522")) return "95 A5 22" + (c.slice(7) ? " " + c.slice(7) : "");
      
      if (c.startsWith("U015587")) return "C1 55 87" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("C123400")) return "81 23 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U100900")) return "D0 09 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U101000")) return "D0 10 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B127700")) return "92 77 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("C123455")) return "81 23 55" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U101100")) return "D0 11 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B128800")) return "92 88 00" + (c.slice(7) ? " " + c.slice(7) : "");

      if (c.startsWith("U100100")) return "D0 01 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B120200")) return "92 02 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U100201")) return "D0 02 01" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B120233")) return "92 02 33" + (c.slice(7) ? " " + c.slice(7) : "");

      if (c.startsWith("U300188")) return "E0 01 88" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("C220344")) return "92 03 44" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U300199")) return "E0 01 99" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("B220355")) return "A2 03 55" + (c.slice(7) ? " " + c.slice(7) : "");

      if (c.startsWith("U500122")) return "F0 01 22" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U500133")) return "F0 01 33" + (c.slice(7) ? " " + c.slice(7) : "");
      
      if (c.startsWith("U015500")) return "C1 55 00" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("U015566")) return "C1 55 66" + (c.slice(7) ? " " + c.slice(7) : "");
      if (c.startsWith("C123466")) return "81 23 66" + (c.slice(7) ? " " + c.slice(7) : "");

      const startByte = prefixMap[c[0]] || 'C';
      const byte1 = startByte + (c[1] || '0');
      const byte2 = (c[2] || '0') + (c[3] || '0');
      const byte3 = (c[4] || '0') + (c[5] || '0');
      const suffixBytes = c.slice(6) ? " " + c.slice(6) : "";
      return `${byte1} ${byte2} ${byte3}${suffixBytes}`.toUpperCase();
    }

    static createProfile(bus, ecu, sourceFileName, ptsFileName, uploadTime) {
      return {
        ecuId: ecu.id,
        busId: bus.id,
        sourceFileName,
        ptsFileName,
        uploadTime,
        dids: this.buildDidList(bus, ecu),
        dtcs: this.buildDtcList(bus, ecu),
        extraDtcs: [],
      };
    }
  }

  class PdxCheckPage {
    constructor(container) {
      this.root = container;
      this.contextMenu = this.createContextMenu();
      this.importTimers = new Map();
      this.jobSeed = 1;
      this.state = {
        selectedType: "bus",
        selectedBusId: "",
        selectedEcuId: "",
        treeCollapsed: false,
        expandedBusIds: [],
        busMenuOpen: false,
        pdxProfilesByEcu: {},
        importDialogOpen: false,
        importJobs: [],
        extraDtcDialogOpen: false,
        reportDialogOpen: false,
        pdxDtcManualOverrides: {},
        pdxDidManualOverrides: {},
        tpModeByTarget: {},
        activeModule: "service",
        selectedCommandId: "",
      };

      this.render = this.render.bind(this);
      window.addEventListener("flash-config-shared-updated", this.render);
      document.addEventListener("click", (event) => {
        if (!event.target.closest(".flash-config-context-menu")) this.closeContextMenu();
      });
      document.addEventListener("contextmenu", (event) => {
        if (!event.target.closest("#pdx-check-root") && !event.target.closest(".flash-config-context-menu")) {
          this.closeContextMenu();
        }
      });
      window.addEventListener("resize", () => this.closeContextMenu());
      this.render();
    }

    esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    notify(message, type) {
      if (typeof showToast === "function") showToast(message);
      if (typeof pushSystemMessage === "function") pushSystemMessage(message, type);
      if (typeof addLog === "function") addLog(message);
    }

    formatTime(date) {
      if (!date) return "--";
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    }

    createContextMenu() {
      const menu = document.createElement("div");
      menu.className = "flash-config-context-menu";
      menu.innerHTML = `
        <button class="flash-config-context-menu__item" type="button" data-role="pdx-context-remove">
          <i class="fa-regular fa-trash-can"></i>
          <span>移除</span>
        </button>
      `;
      menu.addEventListener("contextmenu", (event) => event.preventDefault());
      menu.querySelector('[data-role="pdx-context-remove"]')?.addEventListener("click", () => {
        this.closeContextMenu();
        this.removeCurrent();
      });
      document.body.appendChild(menu);
      return menu;
    }

    closeContextMenu() {
      if (!this.contextMenu) return;
      this.contextMenu.classList.remove("is-open");
      delete this.contextMenu.dataset.type;
      delete this.contextMenu.dataset.busId;
      delete this.contextMenu.dataset.ecuId;
    }

    openContextMenu(type, busId, ecuId, x, y) {
      if (!this.contextMenu) return;
      this.contextMenu.dataset.type = type;
      this.contextMenu.dataset.busId = busId || "";
      this.contextMenu.dataset.ecuId = ecuId || "";
      this.contextMenu.style.left = "0px";
      this.contextMenu.style.top = "0px";
      this.contextMenu.classList.add("is-open");
      const rect = this.contextMenu.getBoundingClientRect();
      const left = Math.min(x, window.innerWidth - rect.width - 8);
      const top = Math.min(y, window.innerHeight - rect.height - 8);
      this.contextMenu.style.left = `${Math.max(8, left)}px`;
      this.contextMenu.style.top = `${Math.max(8, top)}px`;
    }

    getSnapshot() {
      if (window.FlashConfigShared && typeof window.FlashConfigShared.getSnapshot === "function") {
        return window.FlashConfigShared.getSnapshot();
      }
      return { buses: [] };
    }

    hasPendingImports() {
      return this.state.importJobs.some((job) => job.status === "running");
    }

    createJobId() {
      const id = `pdx-job-${this.jobSeed}`;
      this.jobSeed += 1;
      return id;
    }

    openImportDialog() {
      this.state.importDialogOpen = true;
      this.state.busMenuOpen = false;
      this.render();
    }

    closeImportDialog() {
      this.state.importDialogOpen = false;
      this.render();
    }

    openExtraDtcDialog() {
      this.state.extraDtcDialogOpen = true;
      this.render();
    }

    closeExtraDtcDialog() {
      this.state.extraDtcDialogOpen = false;
      this.render();
    }

    openReportDialog() {
      this.state.pdxDtcManualOverrides = {};
      this.state.pdxDidManualOverrides = {};
      this.state.reportDialogOpen = true;
      this.render();
    }

    closeReportDialog() {
      this.state.reportDialogOpen = false;
      this.render();
    }

    getMockImportFiles() {
      return [
        { name: "01_CEM_CANFD_release_20260318.pdx" },
        { name: "02_ZCU_ETH_release_20260318.pdx" },
        { name: "03_BCM_CAN_release_20260318.pdx" },
        { name: "04_EPS_LIN_release_20260318.pdx" },
      ];
    }

    addBus(protocol) {
      if (!window.FlashConfigShared || typeof window.FlashConfigShared.addBus !== "function") {
        this.notify("刷写配置未提供添加总线接口");
        return;
      }
      const busId = window.FlashConfigShared.addBus(protocol);
      if (busId) {
        this.state.selectedType = "bus";
        this.state.selectedBusId = busId;
        this.state.selectedEcuId = "";
        this.state.busMenuOpen = false;
        this.render();
      }
    }

    getExistingBusByProtocol(protocol) {
      return (this.getSnapshot().buses || []).find((bus) => bus.protocol === protocol) || null;
    }

    getOrCreateBusForProtocol(protocol) {
      const existing = this.getExistingBusByProtocol(protocol);
      if (existing) return existing.id;
      if (!window.FlashConfigShared || typeof window.FlashConfigShared.addBus !== "function") return "";
      return window.FlashConfigShared.addBus(protocol) || "";
    }

    cleanupProfiles(snapshot) {
      const validEcuIds = new Set(
        (snapshot.buses || []).flatMap((bus) => (bus.ecus || []).map((ecu) => ecu.id))
      );
      Object.keys(this.state.pdxProfilesByEcu).forEach((ecuId) => {
        if (!validEcuIds.has(ecuId)) delete this.state.pdxProfilesByEcu[ecuId];
      });
    }

    ensureSelection(snapshot) {
      this.cleanupProfiles(snapshot);
      const buses = snapshot.buses || [];
      const busIds = buses.map((bus) => bus.id);

      if (!this.state.expandedBusIds.length) {
        this.state.expandedBusIds = [...busIds];
      } else {
        this.state.expandedBusIds = this.state.expandedBusIds.filter((id) => busIds.includes(id));
      }

      if (!buses.length) {
        this.state.selectedBusId = "";
        this.state.selectedEcuId = "";
        this.state.selectedType = "bus";
        return null;
      }

      const allEcus = buses.flatMap((bus) => (bus.ecus || []).map((ecu) => ({ bus, ecu })));
      const selectedBus = buses.find((bus) => bus.id === this.state.selectedBusId) || buses[0];
      const selectedEcu = allEcus.find((item) => item.ecu.id === this.state.selectedEcuId) || null;

      if (this.state.selectedType === "ecu" && selectedEcu) {
        this.state.selectedBusId = selectedEcu.bus.id;
        return selectedEcu;
      }

      this.state.selectedType = "bus";
      this.state.selectedBusId = selectedBus.id;
      this.state.selectedEcuId = "";
      return { bus: selectedBus, ecu: null };
    }

    getCurrent(snapshot) {
      const buses = snapshot.buses || [];
      const bus = buses.find((item) => item.id === this.state.selectedBusId) || null;
      if (!bus) return null;
      if (this.state.selectedType === "ecu") {
        const ecu = (bus.ecus || []).find((item) => item.id === this.state.selectedEcuId) || null;
        if (ecu) return { bus, ecu };
      }
      return { bus, ecu: null };
    }

    getSelectedTargets(snapshot) {
      const current = this.getCurrent(snapshot);
      if (!current?.bus) return [];
      if (current.ecu) return [current];
      return (current.bus.ecus || []).map((ecu) => ({ bus: current.bus, ecu }));
    }

    ensureProfile(bus, ecu, sourceFileName, ptsFileName, uploadTime) {
      const existing = this.state.pdxProfilesByEcu[ecu.id];
      if (existing) return existing;

      const created = PdxMockService.createProfile(
        bus,
        ecu,
        sourceFileName || `${ecu.shortName}.pdx`,
        ptsFileName || PdxMockService.buildPtsFileName(sourceFileName || `${ecu.shortName}.pdx`),
        uploadTime || new Date()
      );
      this.state.pdxProfilesByEcu[ecu.id] = created;
      return created;
    }

    removeCurrent() {
      if (!window.FlashConfigShared) {
        this.notify("刷写配置未提供删除接口");
        return;
      }

      if (this.state.selectedType === "ecu") {
        if (typeof window.FlashConfigShared.removeEcu !== "function") {
          this.notify("刷写配置未提供 ECU 删除接口");
          return;
        }
        if (!this.state.selectedBusId || !this.state.selectedEcuId) {
          this.notify("请先选择需要移除的 ECU");
          return;
        }
        delete this.state.pdxProfilesByEcu[this.state.selectedEcuId];
        window.FlashConfigShared.removeEcu(this.state.selectedBusId, this.state.selectedEcuId);
        return;
      }

      if (typeof window.FlashConfigShared.removeBus !== "function") {
        this.notify("刷写配置未提供总线删除接口");
        return;
      }
      if (!this.state.selectedBusId) {
        this.notify("请先选择需要移除的总线");
        return;
      }

      const snapshot = this.getSnapshot();
      const bus = (snapshot.buses || []).find((item) => item.id === this.state.selectedBusId);
      (bus?.ecus || []).forEach((ecu) => delete this.state.pdxProfilesByEcu[ecu.id]);
      window.FlashConfigShared.removeBus(this.state.selectedBusId);
    }

    startImportJobs(files) {
      if (!files.length) return;
      if (this.hasPendingImports()) {
        this.notify("当前仍有 PDX 正在执行中，请等待结果返回");
        return;
      }

      const now = new Date();
      const jobs = files.map((file) => {
        const protocol = PdxMockService.resolveProtocol(file.name);
        return {
          id: this.createJobId(),
          sourceFileName: file.name,
          protocol,
          submittedAt: now,
          completedAt: null,
          ptsFileName: "",
          busName: "--",
          ecuName: "--",
          status: "running",
          message: "上传中，等待云端返回 PTS",
        };
      });

      this.state.importJobs = [...jobs, ...this.state.importJobs];
      this.render();

      jobs.forEach((job, index) => {
        const delay = 1300 + index * 500;
        const timer = window.setTimeout(() => {
          this.finishImportJob(job.id);
          this.importTimers.delete(job.id);
        }, delay);
        this.importTimers.set(job.id, timer);
      });
    }

    finishImportJob(jobId) {
      const job = this.state.importJobs.find((item) => item.id === jobId);
      if (!job || job.status !== "running") return;

      if (!window.FlashConfigShared || typeof window.FlashConfigShared.importPdxToBus !== "function") {
        job.status = "failed";
        job.message = "刷写配置未提供 PDX 导入接口";
        job.completedAt = new Date();
        this.render();
        return;
      }

      const busId = this.getOrCreateBusForProtocol(job.protocol);
      if (!busId) {
        job.status = "failed";
        job.message = "无法创建目标总线";
        job.completedAt = new Date();
        this.render();
        return;
      }

      const ecuId = window.FlashConfigShared.importPdxToBus(busId, job.sourceFileName);
      const snapshot = this.getSnapshot();
      const bus = (snapshot.buses || []).find((item) => item.id === busId) || null;
      const ecu = (bus?.ecus || []).find((item) => item.id === ecuId) || null;

      if (!bus || !ecu) {
        job.status = "failed";
        job.message = "云端返回成功，但工具端生成 ECU 失败";
        job.completedAt = new Date();
        this.render();
        return;
      }

      const completedAt = new Date();
      const ptsFileName = PdxMockService.buildPtsFileName(job.sourceFileName);
      this.state.pdxProfilesByEcu[ecu.id] = PdxMockService.createProfile(
        bus,
        ecu,
        job.sourceFileName,
        ptsFileName,
        completedAt
      );

      job.status = "success";
      job.completedAt = completedAt;
      job.ptsFileName = ptsFileName;
      job.busName = bus.name;
      job.ecuName = ecu.shortName;
      job.message = "云端返回成功，PTS 已下发到工具端";

      this.state.selectedType = "ecu";
      this.state.selectedBusId = bus.id;
      this.state.selectedEcuId = ecu.id;
      this.state.expandedBusIds = [...new Set([...this.state.expandedBusIds, bus.id])];

      this.render();
      this.notify(`PDX 已转换为 PTS 并生成 ECU：${ecu.shortName}`);
    }

    readAllDids() {
      const snapshot = this.getSnapshot();
      const targets = this.getSelectedTargets(snapshot);
      if (!targets.length) return;

      targets.forEach(({ bus, ecu }) => {
        const profile =
          this.state.pdxProfilesByEcu[ecu.id] ||
          this.ensureProfile(bus, ecu, `${ecu.shortName}.pdx`, `${ecu.shortName}.pts`, new Date());
        const reasonCycle = ["通过", "超出范围", "负响应", "无响应", "无效值"];
        profile.dids = profile.dids.map((item, index) => ({
          ...item,
          value: reasonCycle[index % reasonCycle.length] === "负响应"
            ? "7F 22 31"
            : reasonCycle[index % reasonCycle.length] === "无响应"
              ? "--"
              : item.actualValue,
          validationPassed: reasonCycle[index % reasonCycle.length] === "通过",
          validationResult: reasonCycle[index % reasonCycle.length],
          lastReadTime: this.formatTime(new Date()),
        }));
      });

      this.render();
      this.notify("DID 一键读取完成");
    }

    readDtc(ecuId, code) {
      const profile = this.state.pdxProfilesByEcu[ecuId];
      if (!profile) return;

      profile.dtcs = profile.dtcs.map((item) =>
        item.code === code
          ? {
              ...item,
              status: item.actualStatus,
              lastReadTime: this.formatTime(new Date()),
            }
          : item
      );
      if (!profile.extraDtcs?.length) {
        const snapshot = this.getSnapshot();
        const bus = (snapshot.buses || []).find((item) => item.id === profile.busId);
        const ecu = bus?.ecus?.find((item) => item.id === ecuId);
        if (bus && ecu) profile.extraDtcs = PdxMockService.buildExtraDtcList(bus, ecu);
      }

      this.render();
      this.notify(`DTC 读取完成：${code}`);
    }

    readAllDtcs() {
      const snapshot = this.getSnapshot();
      const targets = this.getSelectedTargets(snapshot);
      if (!targets.length) return;

      targets.forEach(({ bus, ecu }) => {
        const profile =
          this.state.pdxProfilesByEcu[ecu.id] ||
          this.ensureProfile(bus, ecu, `${ecu.shortName}.pdx`, `${ecu.shortName}.pts`, new Date());
        profile.dtcs = profile.dtcs.map((item) => ({
          ...item,
          status: item.actualStatus,
          lastReadTime: this.formatTime(new Date()),
        }));
        profile.extraDtcs = PdxMockService.buildExtraDtcList(bus, ecu);
      });

      this.render();
      this.notify("DTC 一键读取完成");
    }

    exportReport() {
      this.openReportDialog();
    }

    getSelectionKey(snapshot) {
      const current = this.getCurrent(snapshot);
      if (current?.ecu) return `ecu:${current.ecu.id}`;
      if (current?.bus) return `bus:${current.bus.id}`;
      return "global";
    }

    getTpMode(snapshot) {
      const key = this.getSelectionKey(snapshot);
      if (this.state.tpModeByTarget[key]) return this.state.tpModeByTarget[key];
      const current = this.getCurrent(snapshot);
      return current?.ecu?.tpType || "无";
    }

    setTpMode(snapshot, value) {
      const key = this.getSelectionKey(snapshot);
      this.state.tpModeByTarget[key] = value || "无";
      this.render();
    }

    getViewData(snapshot) {
      const current = this.getCurrent(snapshot);
      if (!current?.bus) {
        return {
          title: "PDX校验",
          sourceLabel: "--",
          ptsLabel: "--",
          uploadTime: "--",
          didRows: [],
          dtcRows: [],
          targetCount: 0,
        };
      }

      const targets = this.getSelectedTargets(snapshot);
      const profiles = targets
        .map(({ bus, ecu }) => ({ bus, ecu, profile: this.state.pdxProfilesByEcu[ecu.id] || null }))
        .filter((item) => item.profile);

      const title = current.ecu
        ? `${current.ecu.shortName}（${current.ecu.supplierCode || "--"}）${current.ecu.swType && current.ecu.flashType !== 'ETHBootloaderonIP_TypeII' ? `-${current.ecu.swType}` : ''}`
        : `${current.bus.name} PDX校验`;

      const latestUpload = profiles.length
        ? new Date(
            Math.max(
              ...profiles.map((item) => new Date(item.profile.uploadTime || 0).getTime())
            )
          )
        : null;

      const sourceLabel =
        profiles.length === 1
          ? profiles[0].profile.sourceFileName
          : profiles.length > 1
            ? `已导入 ${profiles.length} 个 PDX`
            : "--";

      const ptsLabel =
        profiles.length === 1
          ? profiles[0].profile.ptsFileName
          : profiles.length > 1
            ? `已生成 ${profiles.length} 个 PTS`
            : "--";

      const didRows = profiles.flatMap(({ ecu, profile }) =>
        profile.dids.map((item) => ({
          ecuName: ecu.shortName,
          ...item,
        }))
      );

      const dtcRows = profiles.flatMap(({ ecu, profile }) =>
        profile.dtcs.map((item) => ({
          ecuId: ecu.id,
          ecuName: ecu.shortName,
          ...item,
        }))
      );

      return {
        title,
        sourceLabel,
        ptsLabel,
        uploadTime: this.formatTime(latestUpload),
        didRows,
        dtcRows,
        targetCount: targets.length,
      };
    }

    getReportData(snapshot, viewData) {
      const current = this.getCurrent(snapshot);
      const targets = this.getSelectedTargets(snapshot);
      const reporter =
        window.currentUser?.name ||
        window.currentUserName ||
        "系统用户";
      const exportTime = this.formatTime(new Date());

      const dtcRows = [
        ...viewData.dtcRows.map((row) => {
          const res = row.status || "--";
          const statusByte = res === "存在" ? "08" : res === "不存在" ? "00" : "--";
          
          let manualVal = (res === "存在" ? "fail" : "pass");
          const override = this.state.pdxDtcManualOverrides[row.code];
          if (override) {
            manualVal = override;
          }

          return {
            code: row.code,
            hex: PdxMockService.getDtcHex(row.code),
            description: row.description,
            status: statusByte,
            result: res,
            manualVal: manualVal,
          };
        }),
        ...targets.flatMap(({ ecu }) => {
          const profile = this.state.pdxProfilesByEcu[ecu.id];
          return (profile?.extraDtcs || []).map((item) => {
            const res = "多余";
            let manualVal = "fail";
            const override = this.state.pdxDtcManualOverrides[item.code];
            if (override) {
              manualVal = override;
            }
            return {
              code: item.code,
              hex: PdxMockService.getDtcHex(item.code),
              description: "--",
              status: "08",
              result: res,
              manualVal: manualVal,
            };
          });
        }),
      ];

      const didRows = viewData.didRows.map((row) => {
        const valResult = row.validationResult || "--";
        const valPassed = !!row.validationPassed;
        
        let manualVal = (valResult === "失败" ? "fail" : "pass");
        const override = this.state.pdxDidManualOverrides[String(row.id).replace(/^22/, "")];
        if (override) {
          manualVal = override;
        }

        return {
          id: String(row.id).replace(/^22/, ""),
          name: row.name,
          value: row.value,
          validationPassed: valPassed,
          validationResult: valResult,
          manualVal: manualVal,
        };
      });

      const overallResult =
        didRows.every((row) => row.manualVal === "pass") &&
        dtcRows.every((row) => row.manualVal === "pass")
          ? "成功"
          : "失败";

      const hasOverrides = Object.keys(this.state.pdxDtcManualOverrides).length > 0 || Object.keys(this.state.pdxDidManualOverrides).length > 0;
      const finalResult = overallResult;
      const manualLabel = hasOverrides ? " (已人工确认)" : "";

      const firstEcu = targets[0]?.ecu || null;
      const profile = firstEcu ? (this.state.pdxProfilesByEcu[firstEcu.id] || null) : null;
      const getDidVal = (didId, defaultVal) => {
        if (!profile) return defaultVal;
        const found = profile.dids.find(d => d.id === didId);
        return found && found.value !== "--" ? found.value : defaultVal;
      };
      const nodeAddr = firstEcu ? (firstEcu.requestAddress || firstEcu.logicAddress || "0x2010") : "--";
      const versions = {
        supplier: getDidVal("22F187", firstEcu?.supplierCode || "BOSCH"),
        partNo: getDidVal("22F18A", firstEcu ? `${firstEcu.shortName}-PN-2026` : "--"),
        nodeAddr: getDidVal("22F193", nodeAddr),
        sysConfig: getDidVal("22F195", "SYS-CFG-V1.0"),
        appVersion: getDidVal("22F189", firstEcu?.targetVersion || "V3.2.1"),
        calVersion: getDidVal("22F1C0", firstEcu ? PdxMockService.getCalibrationVersion(firstEcu) : "GW4N20-E02-710"),
        bootVersion: getDidVal("22F1C1", firstEcu ? PdxMockService.getBootVersion(firstEcu) : "ECM_BL_1.0.3"),
      };

      return {
        title: current?.ecu ? `${current.ecu.shortName} PDX校验报告` : `${current?.bus?.name || "当前对象"} PDX校验报告`,
        reporter,
        exportTime,
        overallResult,
        finalResult,
        manualLabel,
        dtcRows,
        didRows,
        versions,
      };
    }

    buildWorkbenchModel(snapshot, viewData) {
      const current = this.getCurrent(snapshot);
      const bus = current?.bus || null;
      const ecu = current?.ecu || (current?.bus?.ecus || [])[0] || null;
      const requestId = ecu?.requestAddress || ecu?.logicAddress || "740";
      const responseId = ecu?.responseAddress || ecu?.functionalAddress || "748";
      const tpType = ecu?.tpType || "物理 TP";
      const is29Bit = String(ecu?.frameFormat || "").toLowerCase() === "29bit";
      const targetName = ecu ? `${ecu.shortName}（${ecu.supplierCode || "--"}）${ecu.swType && ecu.flashType !== 'ETHBootloaderonIP_TypeII' ? `-${ecu.swType}` : ''}` : bus?.name || "--";

      const serviceItems = [
        {
          id: "svc-session",
          label: "DiagnosticSessionControl(10 01)",
          payload: "10 01",
          decode: [
            ["ServiceID", "10"],
            ["SubFunction", "01"],
            ["SessionName", "DefaultSession"],
          ],
          queue: [{ index: 0, request: "10 01", response: "50 01 00 32 01 F4" }],
          trace: [
            ["10:18:03.114", requestId, "Tx", "10 01"],
            ["10:18:03.136", responseId, "Rx", "50 01 00 32 01 F4"],
          ],
        },
        {
          id: "svc-reset",
          label: "ECUReset(11 01)",
          payload: "11 01",
          decode: [
            ["ServiceID", "11"],
            ["ResetType", "01"],
            ["Description", "HardReset"],
          ],
          queue: [{ index: 0, request: "11 01", response: "51 01" }],
          trace: [
            ["10:18:14.420", requestId, "Tx", "11 01"],
            ["10:18:14.458", responseId, "Rx", "51 01"],
          ],
        },
        {
          id: "svc-tester",
          label: "TesterPresent(3E 00)",
          payload: "3E 00",
          decode: [
            ["ServiceID", "3E"],
            ["SubFunction", "00"],
            ["suppressPosRspMsgIndicationBit", "false"],
          ],
          queue: [{ index: 0, request: "3E 00", response: "7E 00" }],
          trace: [
            ["10:18:20.115", requestId, "Tx", "3E 00"],
            ["10:18:20.131", responseId, "Rx", "7E 00"],
          ],
        },
      ];

      const securityItems = [
        {
          id: "sec-seed",
          label: "SARequestSeed(27 01)",
          payload: "27 01",
          decode: [
            ["ServiceID", "27"],
            ["SubFunction", "01"],
            ["Level", "SupplierLevel1"],
          ],
          queue: [{ index: 0, request: "27 01", response: "67 01 12 34 56 78" }],
          trace: [
            ["10:18:31.204", requestId, "Tx", "27 01"],
            ["10:18:31.239", responseId, "Rx", "67 01 12 34 56 78"],
          ],
        },
        {
          id: "sec-key",
          label: "SASendKey(27 02 00 00 00 00)",
          payload: "27 02 00 00 00 00",
          decode: [
            ["ServiceID", "27"],
            ["SubFunction", "02"],
            ["KeyLength", "4"],
          ],
          queue: [{ index: 0, request: "27 02 00 00 00 00", response: "67 02" }],
          trace: [
            ["10:18:35.006", requestId, "Tx", "27 02 00 00 00 00"],
            ["10:18:35.044", responseId, "Rx", "67 02"],
          ],
        },
      ];

      const dtcItems = viewData.dtcRows.map((row) => ({
        id: `dtc-${row.ecuId}-${row.code}`,
        label: `DTC(${row.code})-${row.description}`,
        payload: `19 02 ${row.code.slice(0, 2)} ${row.code.slice(2, 4)}`,
        decode: [
          ["ServiceID", "19"],
          ["DTC", row.code],
          ["Status", row.status],
          ["TargetECU", row.ecuName],
        ],
        queue: [{ index: 0, request: `19 02 ${row.code.slice(0, 2)} ${row.code.slice(2, 4)}`, response: row.status === "--" ? "--" : `59 02 ${row.code}` }],
        trace: [
          ["10:18:40.300", requestId, "Tx", `19 02 ${row.code.slice(0, 2)} ${row.code.slice(2, 4)}`],
          ["10:18:40.348", responseId, "Rx", row.status === "--" ? "--" : `59 02 ${row.code}`],
        ],
        actionType: "dtc",
        actionLabel: "读取",
        ecuId: row.ecuId,
        code: row.code,
      }));

      const didItems = viewData.didRows.map((row) => ({
        id: `did-${row.ecuName}-${row.id}`,
        label: `ReadDataByIdentifier(${row.id})`,
        payload: `22 ${row.id.slice(0, 2)} ${row.id.slice(2)}`,
        decode: [
          ["ServiceID", "22"],
          ["DID", row.id],
          ["Name", row.name],
          ["CurrentValue", row.value],
        ],
        queue: [{ index: 0, request: `22 ${row.id.slice(0, 2)} ${row.id.slice(2)}`, response: row.value === "--" ? "--" : `62 ${row.id.slice(0, 2)} ${row.id.slice(2)}` }],
        trace: [
          ["10:18:52.614", requestId, "Tx", `22 ${row.id.slice(0, 2)} ${row.id.slice(2)}`],
          ["10:18:52.652", responseId, "Rx", row.value === "--" ? "--" : `62 ${row.id.slice(0, 2)} ${row.id.slice(2)}`],
        ],
      }));

      const modules = [
        { id: "service", label: "服务", items: serviceItems },
        { id: "security", label: "安全访问", items: securityItems },
        { id: "dtc", label: "故障码", items: dtcItems },
        { id: "did", label: "实时显示", items: didItems },
        { id: "io", label: "IO控制", items: [{ id: "io-1", label: "InputOutputControlByIdentifier(2F 00 01)", payload: "2F 00 01", decode: [["ServiceID", "2F"], ["Action", "占位"], ["Target", targetName]], queue: [{ index: 0, request: "2F 00 01", response: "--" }], trace: [["10:19:03.104", requestId, "Tx", "2F 00 01"]] }] },
        { id: "vehicle", label: "物流数据", items: didItems.slice(0, 3) },
        { id: "program", label: "程序控制", items: [{ id: "prog-1", label: "RequestDownload(34)", payload: "34 00 44", decode: [["ServiceID", "34"], ["FormatIdentifier", "00"], ["MemorySize", "44"]], queue: [{ index: 0, request: "34 00 44", response: "74 20" }], trace: [["10:19:10.118", requestId, "Tx", "34 00 44"], ["10:19:10.161", responseId, "Rx", "74 20"]] }] },
        { id: "setting", label: "设置", items: [{ id: "set-1", label: "Physical Address", payload: `${requestId} / ${responseId}`, decode: [["RequestId", requestId], ["ResponseId", responseId], ["TPType", tpType]], queue: [{ index: 0, request: requestId, response: responseId }], trace: [["10:19:20.000", requestId, "Tx", "Config Loaded"]] }] },
      ];

      const activeModule = modules.find((item) => item.id === this.state.activeModule && item.items.length) ||
        modules.find((item) => item.items.length) ||
        modules[0];
      const activeItems = activeModule?.items || [];
      const activeCommand =
        activeItems.find((item) => item.id === this.state.selectedCommandId) ||
        activeItems[0] ||
        null;

      if (activeModule && this.state.activeModule !== activeModule.id) this.state.activeModule = activeModule.id;
      if (activeCommand && this.state.selectedCommandId !== activeCommand.id) this.state.selectedCommandId = activeCommand.id;

      return {
        targetName,
        requestId,
        responseId,
        tpType,
        is29Bit,
        modules,
        activeModule: activeModule?.id || "service",
        activeCommand,
      };
    }

    renderTree(snapshot) {
      const busMenu = this.state.busMenuOpen
        ? `
            <div class="flash-config-bus-menu">
              ${PdxMockService.BUS_TYPES.map(
                (type) => `
                  <button class="flash-config-bus-menu__item" type="button" data-role="pdx-add-bus-type" data-bus-type="${this.esc(type)}">
                    ${this.esc(type)}
                  </button>
                `
              ).join("")}
            </div>
          `
        : "";

      return `
        <aside class="pdx-check-left">
          <div class="flash-config-pane__actions">
            <div class="flash-config-action-menu">
              <button
                class="flash-config-icon-btn"
                type="button"
                data-role="pdx-toggle-bus-menu"
                title="添加总线"
                aria-label="添加总线"
              >
                <i class="fa-solid fa-plus"></i>
              </button>
              ${busMenu}
            </div>
            <button
              class="flash-config-icon-btn"
              type="button"
              data-role="pdx-open-import"
              title="导入PDX"
              aria-label="导入PDX"
            >
              <i class="fa-solid fa-file-arrow-up"></i>
            </button>
            <button
              class="flash-config-icon-btn"
              type="button"
              data-role="pdx-remove"
              title="删除"
              aria-label="删除"
            >
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
          <div class="flash-config-tree">
            ${
              (snapshot.buses || []).length
                ? snapshot.buses
                    .map(
                      (bus) => `
                        <div class="flash-config-tree-group">
                          <div class="flash-config-tree-node ${
                            this.state.selectedType === "bus" && this.state.selectedBusId === bus.id ? "is-active" : ""
                          }">
                            <button class="flash-config-tree-toggle" type="button" data-role="pdx-toggle-bus" data-bus-id="${this.esc(bus.id)}">
                              ${this.state.expandedBusIds.includes(bus.id) ? "-" : "+"}
                            </button>
                            <button class="flash-config-tree-label" type="button" data-role="pdx-pick-bus" data-bus-id="${this.esc(bus.id)}">
                              <span class="flash-config-tree-label__inner">
                                <i class="fa-solid fa-diagram-project"></i>
                                <span>${this.esc(bus.name)}</span>
                              </span>
                            </button>
                          </div>
                          <div class="flash-config-tree-children ${this.state.expandedBusIds.includes(bus.id) ? "" : "is-collapsed"}">
                            ${(bus.ecus || [])
                              .map(
                                (ecu) => `
                                  <button
                                    class="flash-config-tree-child ${
                                      this.state.selectedType === "ecu" &&
                                      this.state.selectedBusId === bus.id &&
                                      this.state.selectedEcuId === ecu.id
                                        ? "is-active"
                                        : ""
                                    }"
                                    type="button"
                                    data-role="pdx-pick-ecu"
                                    data-bus-id="${this.esc(bus.id)}"
                                    data-ecu-id="${this.esc(ecu.id)}"
                                  >
                                    <span class="flash-config-tree-label__inner">
                                      <i class="fa-solid fa-microchip"></i>
                                      <span>${this.esc(`${ecu.shortName}（${ecu.supplierCode || "--"}）${ecu.swType && ecu.flashType !== 'ETHBootloaderonIP_TypeII' ? `-${ecu.swType}` : ''}`)}</span>
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
                : '<div class="pdx-check-empty">请先添加总线或导入 PDX</div>'
            }
          </div>
          <button
            class="flash-config-pane__toggle"
            type="button"
            data-role="pdx-toggle-tree-pane"
            title="${this.state.treeCollapsed ? "展开列表" : "收起列表"}"
            aria-label="${this.state.treeCollapsed ? "展开列表" : "收起列表"}"
          >
            <i class="fa-solid ${this.state.treeCollapsed ? "fa-panel-right" : "fa-panel-left"}"></i>
          </button>
        </aside>
      `;
    }

    renderDidSection(viewData, isBusView) {
      return `
        <section class="flash-config-sheet flash-config-sheet--main">
          <div class="flash-config-sheet__title flash-config-sheet__title--with-actions">
            <span>DID列表</span>
            <div class="flash-config-sheet__actions">
              <button class="flash-config-action-btn is-primary" type="button" data-role="pdx-read-all-did">一键读取</button>
            </div>
          </div>
          ${
            viewData.didRows.length
              ? `
                <div class="pdx-check-table-wrap">
                  <table class="pdx-check-table">
                    <colgroup>
                      ${isBusView ? '<col class="pdx-check-col-ecu" />' : ""}
                      <col class="pdx-check-col-did" />
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        ${isBusView ? "<th>ECU</th>" : ""}
                        <th>DID</th>
                        <th>名称</th>
                        <th>当前值</th>
                        <th>最近读取时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${viewData.didRows
                        .map(
                          (row) => `
                            <tr>
                              ${isBusView ? `<td>${this.esc(row.ecuName)}</td>` : ""}
                              <td>${this.esc(row.id)}</td>
                              <td>${this.esc(row.name)}</td>
                              <td>${this.esc(row.value)}</td>
                              <td>${this.esc(row.lastReadTime)}</td>
                            </tr>
                          `
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              `
              : '<div class="pdx-check-empty">请先导入 PDX 文件，生成 DID 列表</div>'
          }
        </section>
      `;
    }

    renderDtcSection(viewData, isBusView) {
      return `
        <section class="flash-config-sheet flash-config-sheet--main">
          <div class="flash-config-sheet__title">DTC列表</div>
          ${
            viewData.dtcRows.length
              ? `
                <div class="pdx-check-table-wrap">
                  <table class="pdx-check-table">
                    <colgroup>
                      ${isBusView ? '<col class="pdx-check-col-ecu" />' : ""}
                      <col class="pdx-check-col-dtc" />
                      <col style="width:120px;" />
                      <col />
                      <col style="width:80px;" />
                      <col />
                      <col />
                      <col class="pdx-check-col-op" />
                    </colgroup>
                    <thead>
                      <tr>
                        ${isBusView ? "<th>ECU</th>" : ""}
                        <th>DTC</th>
                        <th>HEX码</th>
                        <th>status</th>
                        <th>描述</th>
                        <th>状态</th>
                        <th>最近读取时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${viewData.dtcRows
                        .map(
                          (row) => {
                            const hex = PdxMockService.getDtcHex(row.code);
                            const statusByte = row.status === "存在" ? "08" : row.status === "不存在" ? "00" : "--";
                            return `
                              <tr>
                                ${isBusView ? `<td>${this.esc(row.ecuName)}</td>` : ""}
                                <td>${this.esc(row.code)}</td>
                                <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${this.esc(hex)}</td>
                                <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${this.esc(statusByte)}</td>
                                <td>${this.esc(row.description)}</td>
                                <td>
                                  <span class="pdx-check-pill ${row.status === "存在" ? "is-warning" : row.status === "不存在" ? "is-success" : ""}">
                                    ${this.esc(row.status)}
                                  </span>
                                </td>
                                <td>${this.esc(row.lastReadTime)}</td>
                                <td>
                                  <button
                                    class="flash-config-action-btn"
                                    type="button"
                                    data-role="pdx-read-dtc"
                                    data-ecu-id="${this.esc(row.ecuId)}"
                                    data-dtc-code="${this.esc(row.code)}"
                                  >
                                    读取
                                  </button>
                                </td>
                              </tr>
                            `;
                          }
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              `
              : '<div class="pdx-check-empty">请先导入 PDX 文件，生成 DTC 列表</div>'
          }
        </section>
      `;
    }

    renderImportDialog() {
      if (!this.state.importDialogOpen) return "";

      const hasPending = this.hasPendingImports();
      const sourceRows = this.state.importJobs.length
        ? this.state.importJobs
            .map(
              (job) => `
                <tr>
                  <td>${this.esc(job.sourceFileName)}</td>
                  <td>${this.esc(this.formatTime(job.submittedAt))}</td>
                  <td>
                    <span class="pdx-check-pill ${job.status === "success" ? "is-success" : job.status === "running" ? "is-warning" : ""}">
                      ${job.status === "running" ? '<i class="fa-solid fa-spinner fa-spin"></i>' : ""}
                      <span>${this.esc(job.status === "running" ? "执行中" : job.status === "success" ? "已完成" : "失败")}</span>
                    </span>
                  </td>
                </tr>
              `
            )
            .join("")
        : `
            <tr>
              <td colspan="3" class="pdx-check-empty">暂无导入记录</td>
            </tr>
          `;

      const ptsRows = this.state.importJobs.length
        ? this.state.importJobs
            .map(
              (job) => `
                <tr>
                  <td>${this.esc(job.ptsFileName || "--")}</td>
                  <td>${this.esc(job.completedAt ? this.formatTime(job.completedAt) : "--")}</td>
                  <td>
                    <span class="pdx-check-pill ${job.status === "success" ? "is-success" : job.status === "running" ? "is-warning" : ""}">
                      ${job.status === "running" ? '<i class="fa-solid fa-spinner fa-spin"></i>' : ""}
                      <span>${this.esc(job.message)}</span>
                    </span>
                  </td>
                </tr>
              `
            )
            .join("")
        : `
            <tr>
              <td colspan="3" class="pdx-check-empty">云端返回的 PTS 文件会显示在这里</td>
            </tr>
          `;

      return `
        <div class="pdx-check-dialog-backdrop" data-role="pdx-close-dialog"></div>
        <section class="pdx-check-dialog" role="dialog" aria-modal="true" aria-label="导入PDX">
          <div class="pdx-check-dialog__header">
            <strong>导入PDX</strong>
            <button class="pdx-check-dialog__close" type="button" data-role="pdx-close-dialog" aria-label="关闭">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="pdx-check-dialog__body">
            <section class="flash-config-sheet flash-config-sheet--main">
              <div class="flash-config-sheet__title flash-config-sheet__title--with-actions">
                <span>PDX文件</span>
                <div class="flash-config-sheet__actions">
                  <button
                    class="flash-config-action-btn is-primary"
                    type="button"
                    data-role="pdx-select-files"
                    ${hasPending ? "disabled" : ""}
                  >
                    选择PDX
                  </button>
                  <input id="pdx-check-import-input" type="file" accept=".pdx,.zip" multiple hidden />
                </div>
              </div>
              <div class="pdx-check-dialog__hint">
                ${hasPending ? "当前仍有 PDX 正在执行中，云端返回前不可再次导入。" : "点击“选择PDX”会自动导入一组 mock PDX 数据，并异步生成 PTS。"}
              </div>
              <div class="pdx-check-table-wrap">
                <table class="pdx-check-table">
                  <thead>
                    <tr>
                      <th>PDX文件</th>
                      <th>提交时间</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>${sourceRows}</tbody>
                </table>
              </div>
            </section>
            <section class="flash-config-sheet flash-config-sheet--main">
              <div class="flash-config-sheet__title">PTS文件</div>
              <div class="pdx-check-table-wrap">
                <table class="pdx-check-table">
                  <thead>
                    <tr>
                      <th>PTS文件</th>
                      <th>返回时间</th>
                      <th>结果</th>
                    </tr>
                  </thead>
                  <tbody>${ptsRows}</tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      `;
    }

    renderReportDialog(snapshot, viewData) {
      if (!this.state.reportDialogOpen) return "";
      const report = this.getReportData(snapshot, viewData);
      return `
        <div class="pdx-check-dialog-backdrop" data-role="pdx-close-report"></div>
        <section class="pdx-check-dialog pdx-check-dialog--report" role="dialog" aria-modal="true" aria-label="导出报告">
          <div class="pdx-check-dialog__header">
            <strong>${this.esc(report.title)}</strong>
            <button class="pdx-check-dialog__close" type="button" data-role="pdx-close-report" aria-label="关闭">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="pdx-check-dialog__body">
            <section class="flash-config-sheet flash-config-sheet--main">
              <div class="pdx-check-report-meta">
                <div><span>报告人</span><strong>${this.esc(report.reporter)}</strong></div>
                <div><span>报告导出时间</span><strong>${this.esc(report.exportTime)}</strong></div>
                <div><span>总体报告结果</span><strong class="pdx-check-report-result ${report.finalResult === "成功" ? "is-success" : "is-fail"}">${this.esc(report.finalResult)}${this.esc(report.manualLabel)}</strong></div>
              </div>
            </section>
            <section class="flash-config-sheet flash-config-sheet--main">
              <div class="flash-config-sheet__title">ECU 版本信息</div>
              <div class="pdx-check-report-meta" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 16px; display: grid; padding: 12px 16px;">
                <div style="margin: 0;"><span>0xF187 供应商编码</span><strong style="color: #0f172a; font-family: monospace;">${this.esc(report.versions.supplier)}</strong></div>
                <div style="margin: 0;"><span>0xF18A ECU零件号</span><strong style="color: #0f172a; font-family: monospace;">${this.esc(report.versions.partNo)}</strong></div>
                <div style="margin: 0;"><span>0xF193 节点地址</span><strong style="color: #0f172a; font-family: monospace;">${this.esc(report.versions.nodeAddr)}</strong></div>
                <div style="margin: 0;"><span>0xF195 系统配置</span><strong style="color: #0f172a; font-family: monospace;">${this.esc(report.versions.sysConfig)}</strong></div>
                <div style="margin: 0;"><span>0xF189 应用软件版本</span><strong style="color: #0f172a; font-family: monospace;">${this.esc(report.versions.appVersion)}</strong></div>
                <div style="margin: 0;"><span>0xF1C0 标定软件版本</span><strong style="color: #0f172a; font-family: monospace;">${this.esc(report.versions.calVersion)}</strong></div>
                <div style="margin: 0;"><span>0xF1C1 底层软件版本</span><strong style="color: #0f172a; font-family: monospace;">${this.esc(report.versions.bootVersion)}</strong></div>
              </div>
            </section>
            <section class="flash-config-sheet flash-config-sheet--main">
              <div class="flash-config-sheet__title">DTC测试结果</div>
              <div class="pdx-check-table-wrap">
                <table class="pdx-check-table">
                  <thead>
                    <tr>
                      <th>DTC</th>
                      <th>HEX码</th>
                      <th>status</th>
                      <th>描述</th>
                      <th>是否存在</th>
                      <th>人工校验</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      report.dtcRows.length
                        ? report.dtcRows
                            .map(
                              (row) => {
                                const isPass = row.manualVal === "pass";
                                const isFail = row.manualVal === "fail";
                                return `
                                  <tr>
                                    <td>${this.esc(row.code)}</td>
                                    <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${this.esc(row.hex)}</td>
                                    <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${this.esc(row.status)}</td>
                                    <td>${this.esc(row.description)}</td>
                                    <td>
                                      <span class="pdx-check-status ${row.result === "存在" || row.result === "多余" ? "is-fail" : row.result === "不存在" ? "is-pass" : ""}">
                                        ${this.esc(row.result)}
                                      </span>
                                    </td>
                                    <td>
                                      <div class="pdx-report-row-actions no-print" style="display: inline-flex; gap: 4px;">
                                        <button class="pdx-row-btn pdx-row-btn--pass ${isPass ? "active" : ""}" data-type="dtc" data-code="${row.code}" data-value="pass" type="button">PASS</button>
                                        <button class="pdx-row-btn pdx-row-btn--fail ${isFail ? "active" : ""}" data-type="dtc" data-code="${row.code}" data-value="fail" type="button">FAIL</button>
                                      </div>
                                      <span class="print-only pdx-check-status ${isFail ? "is-fail" : "is-pass"}">
                                        ${isFail ? "FAIL" : "PASS"}
                                      </span>
                                    </td>
                                  </tr>
                                `;
                              }
                            )
                            .join("")
                        : '<tr><td colspan="6" class="pdx-check-empty">暂无故障码结果</td></tr>'
                    }
                  </tbody>
                </table>
              </div>
            </section>
            <section class="flash-config-sheet flash-config-sheet--main">
              <div class="flash-config-sheet__title">DID测试结果</div>
              <div class="pdx-check-table-wrap">
                <table class="pdx-check-table">
                  <thead>
                    <tr>
                      <th>DID</th>
                      <th>名称</th>
                      <th>当前值</th>
                      <th>校验结果</th>
                      <th>人工校验</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      report.didRows.length
                        ? report.didRows
                            .map(
                              (row) => {
                                const isPass = row.manualVal === "pass";
                                const isFail = row.manualVal === "fail";
                                return `
                                  <tr>
                                    <td>${this.esc(row.id)}</td>
                                    <td>${this.esc(row.name)}</td>
                                    <td>
                                      <span class="pdx-check-did-value">
                                        <span class="pdx-check-did-flag ${row.validationPassed ? "is-pass" : "is-fail"}">
                                          ${row.validationPassed ? "√" : "x"}
                                        </span>
                                        <span>${this.esc(row.value)}</span>
                                      </span>
                                    </td>
                                    <td>
                                      <span class="pdx-check-status ${row.validationResult === "通过" ? "is-pass" : row.validationResult === "失败" ? "is-fail" : ""}">
                                        ${this.esc(row.validationResult)}
                                      </span>
                                    </td>
                                    <td>
                                      <div class="pdx-report-row-actions no-print" style="display: inline-flex; gap: 4px;">
                                        <button class="pdx-row-btn pdx-row-btn--pass ${isPass ? "active" : ""}" data-type="did" data-id="${row.id}" data-value="pass" type="button">PASS</button>
                                        <button class="pdx-row-btn pdx-row-btn--fail ${isFail ? "active" : ""}" data-type="did" data-id="${row.id}" data-value="fail" type="button">FAIL</button>
                                      </div>
                                      <span class="print-only pdx-check-status ${isFail ? "is-fail" : "is-pass"}">
                                        ${isFail ? "FAIL" : "PASS"}
                                      </span>
                                    </td>
                                  </tr>
                                `;
                              }
                            )
                            .join("")
                        : '<tr><td colspan="5" class="pdx-check-empty">暂无DID测试结果</td></tr>'
                    }
                  </tbody>
                </table>
              </div>
            </section>
            <style>
              @media print {
                .no-print {
                  display: none !important;
                }
                .print-only {
                  display: inline-block !important;
                }
              }
              .print-only {
                display: none;
              }
              .pdx-row-btn {
                font-size: 11px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 4px;
                border: 1px solid #cbd5e1;
                background-color: #fff;
                color: #64748b;
                cursor: pointer;
                transition: all 0.15s ease;
              }
              .pdx-row-btn--pass:hover, .pdx-row-btn--pass.active {
                background-color: #d1fae5;
                border-color: #10b981;
                color: #065f46;
              }
              .pdx-row-btn--fail:hover, .pdx-row-btn--fail.active {
                background-color: #fee2e2;
                border-color: #ef4444;
                color: #991b1b;
              }
            </style>
          </div>
        </section>
      `;
    }

    renderRight(snapshot) {
      const current = this.getCurrent(snapshot);
      const viewData = this.getViewData(snapshot);
      const bus = current?.bus || null;
      const ecu = current?.ecu || (bus?.ecus || [])[0] || null;
      const isEth = bus?.protocol === "ETH";
      const requestAddress = ecu?.requestAddress || "740";
      const responseAddress = ecu?.responseAddress || ecu?.functionalAddress || "748";
      const logicAddress = ecu?.logicAddress || ecu?.logicalAddress || "0x2010";
      const tpMode = this.getTpMode(snapshot);
      const traceRows = [
        ...viewData.didRows.slice(0, 4).map((row, index) => ({
          time: `10:2${index}:1${index}.10${index}`,
          data: `22 ${row.id.slice(0, 2)} ${row.id.slice(2)}`,
        })),
        ...viewData.dtcRows.slice(0, 4).map((row, index) => ({
          time: `10:3${index}:2${index}.21${index}`,
          data: row.status === "--" ? `59 02 ${row.code}` : `59 06 ${row.code}`,
        })),
      ];
      const targets = this.getSelectedTargets(snapshot);
      const extraDtcRows = targets.flatMap(({ ecu: targetEcu }) => {
        const profile = this.state.pdxProfilesByEcu[targetEcu.id];
        return (profile?.extraDtcs || []).map((item) => ({ ...item, ecuName: targetEcu.shortName }));
      });
      const canShowExtraDtc = viewData.dtcRows.some((row) => row.lastReadTime && row.lastReadTime !== "--");

      return `
        <section class="pdx-check-right">
          <div class="pdx-check-body pdx-check-diagnostic">
            <section class="pdx-check-topbar ${isEth ? "is-eth" : ""}">
              ${
                isEth
                  ? `
                    <div class="pdx-check-topbar__group">
                      <span>逻辑地址</span>
                      <input type="text" value="${this.esc(logicAddress)}" readonly />
                    </div>
                  `
                  : `
                    <div class="pdx-check-topbar__group">
                      <span>请求地址</span>
                      <input type="text" value="${this.esc(requestAddress)}" readonly />
                    </div>
                    <div class="pdx-check-topbar__group">
                      <span>响应地址</span>
                      <input type="text" value="${this.esc(responseAddress)}" readonly />
                    </div>
                  `
              }
              <div class="pdx-check-topbar__group">
                <span>TP模式</span>
                <select data-role="pdx-select-tp-mode">
                  <option value="无" ${tpMode === "无" ? "selected" : ""}>无</option>
                  <option value="物理TP" ${tpMode === "物理TP" ? "selected" : ""}>物理TP</option>
                  <option value="功能TP" ${tpMode === "功能TP" ? "selected" : ""}>功能TP</option>
                </select>
              </div>
              <button class="flash-config-action-btn pdx-check-topbar__report" type="button" data-role="pdx-export-report">导出报告</button>
            </section>
            <section class="pdx-check-columns">
              <div class="pdx-check-column">
                <div class="flash-config-sheet__title flash-config-sheet__title--with-actions">
                  <span>故障码</span>
                  <div class="flash-config-sheet__actions">
                    <button class="flash-config-action-btn is-primary" type="button" data-role="pdx-read-all-dtc">一键读取</button>
                    ${canShowExtraDtc ? '<button class="flash-config-action-btn" type="button" data-role="pdx-open-extra-dtc">多余DTC</button>' : ""}
                  </div>
                </div>
                <div class="pdx-check-table-wrap">
                  <table class="pdx-check-table">
                    <thead>
                      <tr>
                        <th>DTC</th>
                        <th>描述</th>
                        <th>是否存在</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        viewData.dtcRows.length
                          ? viewData.dtcRows
                              .map(
                                (row) => `
                                  <tr>
                                    <td>${this.esc(row.code)}</td>
                                    <td>${this.esc(row.description)}</td>
                                    <td>
                                      <span class="pdx-check-status ${row.status === "存在" ? "is-pass" : row.status === "不存在" ? "is-fail" : ""}">
                                        ${this.esc(row.status)}
                                      </span>
                                    </td>
                                  </tr>
                                `
                              )
                              .join("")
                          : ""
                      }
                    </tbody>
                  </table>
                  ${
                    viewData.dtcRows.length
                      ? ""
                      : '<div class="pdx-check-table-empty">暂无故障码数据</div>'
                  }
                </div>
              </div>
              <div class="pdx-check-column">
                <div class="flash-config-sheet__title flash-config-sheet__title--with-actions">
                  <span>DID列表</span>
                  <div class="flash-config-sheet__actions">
                    <button class="flash-config-action-btn is-primary" type="button" data-role="pdx-read-all-did">一键读取</button>
                  </div>
                </div>
                <div class="pdx-check-table-wrap">
                  <table class="pdx-check-table">
                    <colgroup>
                      <col style="width:72px" />
                      <col style="width:140px" />
                      <col style="width:110px" />
                      <col style="width:100px" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>DID</th>
                        <th>名称</th>
                        <th>当前值</th>
                        <th>校验结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        viewData.didRows.length
                          ? viewData.didRows
                              .map(
                                (row) => `
                                  <tr>
                                    <td>${this.esc(String(row.id).replace(/^22/, ""))}</td>
                                    <td>${this.esc(row.name)}</td>
                                    <td>
                                      <span class="pdx-check-did-value">
                                        <span class="pdx-check-did-flag ${row.validationPassed ? "is-pass" : "is-fail"}">
                                          ${row.validationPassed ? "√" : "x"}
                                        </span>
                                        <span>${this.esc(row.value)}</span>
                                      </span>
                                    </td>
                                    <td>${this.esc(row.validationResult || "--")}</td>
                                  </tr>
                                `
                              )
                              .join("")
                          : ""
                      }
                    </tbody>
                  </table>
                  ${
                    viewData.didRows.length
                      ? ""
                      : '<div class="pdx-check-table-empty">暂无 DID 数据</div>'
                  }
                </div>
              </div>
              <div class="pdx-check-column">
                <div class="flash-config-sheet__title">
                  <span>报文展示</span>
                </div>
                <div class="pdx-check-table-wrap">
                  <table class="pdx-check-table">
                    <colgroup>
                      <col style="width:108px" />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>数据</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        traceRows.length
                          ? traceRows
                              .map(
                                (row) => `
                                  <tr>
                                    <td>${this.esc(row.time)}</td>
                                    <td>${this.esc(row.data)}</td>
                                  </tr>
                                `
                              )
                              .join("")
                          : ""
                      }
                    </tbody>
                  </table>
                  ${
                    traceRows.length
                      ? ""
                      : '<div class="pdx-check-table-empty">暂无报文数据</div>'
                  }
                </div>
              </div>
            </section>
          </div>
          ${
            this.state.extraDtcDialogOpen
              ? `
                <div class="pdx-check-dialog-backdrop" data-role="pdx-close-extra-dtc"></div>
                <section class="pdx-check-dialog pdx-check-dialog--narrow" role="dialog" aria-modal="true" aria-label="多余DTC">
                  <div class="pdx-check-dialog__header">
                    <strong>多余DTC</strong>
                    <button class="pdx-check-dialog__close" type="button" data-role="pdx-close-extra-dtc" aria-label="关闭">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                  <div class="pdx-check-dialog__body">
                    <section class="flash-config-sheet flash-config-sheet--main">
                      <div class="flash-config-sheet__title">额外诊断故障项</div>
                      <div class="pdx-check-table-wrap">
                        <table class="pdx-check-table">
                          <thead>
                            <tr>
                              <th>ECU</th>
                              <th>DTC</th>
                              <th>描述</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${
                              extraDtcRows.length
                                ? extraDtcRows
                                    .map(
                                      (row) => `
                                        <tr>
                                          <td>${this.esc(row.ecuName)}</td>
                                          <td>${this.esc(row.code)}</td>
                                          <td>${this.esc(row.description)}</td>
                                        </tr>
                                      `
                                    )
                                    .join("")
                                : '<tr><td colspan="3" class="pdx-check-empty">暂无多余DTC</td></tr>'
                            }
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </section>
              `
              : ""
          }
        </section>
      `;
    }

    bindEvents() {
      this.root.querySelectorAll('[data-role="pdx-pick-bus"]').forEach((element) => {
        element.addEventListener("click", () => {
          const busId = element.dataset.busId || "";
          this.state.selectedType = "bus";
          this.state.selectedBusId = busId;
          this.state.selectedEcuId = "";
          this.state.busMenuOpen = false;
          if (busId) {
            if (this.state.expandedBusIds.includes(busId)) {
              this.state.expandedBusIds = this.state.expandedBusIds.filter((id) => id !== busId);
            } else {
              this.state.expandedBusIds = [...this.state.expandedBusIds, busId];
            }
          }
          this.render();
        });
        element.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const busId = element.dataset.busId || "";
          this.state.selectedType = "bus";
          this.state.selectedBusId = busId;
          this.state.selectedEcuId = "";
          this.state.busMenuOpen = false;
          this.render();
          this.openContextMenu("bus", busId, "", event.clientX, event.clientY);
        });
      });

      this.root.querySelectorAll('[data-role="pdx-pick-ecu"]').forEach((element) => {
        element.addEventListener("click", () => {
          this.state.selectedType = "ecu";
          this.state.selectedBusId = element.dataset.busId || "";
          this.state.selectedEcuId = element.dataset.ecuId || "";
          this.state.busMenuOpen = false;
          this.render();
        });
        element.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.state.selectedType = "ecu";
          this.state.selectedBusId = element.dataset.busId || "";
          this.state.selectedEcuId = element.dataset.ecuId || "";
          this.state.busMenuOpen = false;
          this.render();
          this.openContextMenu("ecu", element.dataset.busId || "", element.dataset.ecuId || "", event.clientX, event.clientY);
        });
      });

      this.root.querySelectorAll('[data-role="pdx-toggle-bus"]').forEach((element) => {
        element.addEventListener("click", () => {
          const busId = element.dataset.busId || "";
          if (!busId) return;
          if (this.state.expandedBusIds.includes(busId)) {
            this.state.expandedBusIds = this.state.expandedBusIds.filter((id) => id !== busId);
          } else {
            this.state.expandedBusIds = [...this.state.expandedBusIds, busId];
          }
          this.state.busMenuOpen = false;
          this.render();
        });
      });

      this.root.querySelector('[data-role="pdx-toggle-tree-pane"]')?.addEventListener("click", () => {
        this.state.treeCollapsed = !this.state.treeCollapsed;
        this.state.busMenuOpen = false;
        this.render();
      });

      this.root.querySelector('[data-role="pdx-remove"]')?.addEventListener("click", () => {
        this.removeCurrent();
      });

      this.root.querySelector('[data-role="pdx-open-import"]')?.addEventListener("click", () => {
        this.openImportDialog();
      });

      this.root.querySelector('[data-role="pdx-toggle-bus-menu"]')?.addEventListener("click", () => {
        this.state.busMenuOpen = !this.state.busMenuOpen;
        this.render();
      });

      this.root.querySelectorAll('[data-role="pdx-add-bus-type"]').forEach((element) => {
        element.addEventListener("click", () => {
          this.addBus(element.dataset.busType || "");
        });
      });

      this.root.querySelectorAll('[data-role="pdx-close-dialog"]').forEach((element) => {
        element.addEventListener("click", () => {
          this.closeImportDialog();
        });
      });

      this.root.querySelector('[data-role="pdx-select-files"]')?.addEventListener("click", () => {
        if (this.hasPendingImports()) return;
        this.startImportJobs(this.getMockImportFiles());
      });

      this.root.querySelector("#pdx-check-import-input")?.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        if (files.length) this.startImportJobs(files);
        event.target.value = "";
      });

      this.root.querySelector('[data-role="pdx-read-all-did"]')?.addEventListener("click", () => {
        this.readAllDids();
      });

      this.root.querySelector('[data-role="pdx-read-all-dtc"]')?.addEventListener("click", () => {
        this.readAllDtcs();
      });

      this.root.querySelector('[data-role="pdx-export-report"]')?.addEventListener("click", () => {
        this.exportReport();
      });

      this.root.querySelector('[data-role="pdx-select-tp-mode"]')?.addEventListener("change", (event) => {
        this.setTpMode(this.getSnapshot(), event.target.value);
      });

      this.root.querySelector('[data-role="pdx-open-extra-dtc"]')?.addEventListener("click", () => {
        this.openExtraDtcDialog();
      });

      this.root.querySelectorAll('[data-role="pdx-close-extra-dtc"]').forEach((element) => {
        element.addEventListener("click", () => {
          this.closeExtraDtcDialog();
        });
      });

      this.root.querySelectorAll('[data-role="pdx-close-report"]').forEach((element) => {
        element.addEventListener("click", () => {
          this.closeReportDialog();
        });
      });

      this.root.querySelectorAll('.pdx-row-btn').forEach((btn) => {
        btn.addEventListener("click", () => {
          const type = btn.dataset.type;
          const id = btn.dataset.id || btn.dataset.code;
          const val = btn.dataset.value;
          if (type === "dtc") {
            this.state.pdxDtcManualOverrides[id] = val;
          } else {
            this.state.pdxDidManualOverrides[id] = val;
          }
          this.render();
        });
      });

      this.root.querySelectorAll('[data-role="pdx-read-dtc"]').forEach((element) => {
        element.addEventListener("click", () => {
          this.readDtc(element.dataset.ecuId || "", element.dataset.dtcCode || "");
        });
      });
    }

    render() {
      this.closeContextMenu();
      const snapshot = this.getSnapshot();
      this.ensureSelection(snapshot);
      this.root.innerHTML = `
        <div class="pdx-check-shell ${this.state.treeCollapsed ? "is-tree-collapsed" : ""}">
          ${this.renderTree(snapshot)}
          ${this.renderRight(snapshot)}
          ${this.renderImportDialog()}
          ${this.renderReportDialog(snapshot, this.getViewData(snapshot))}
        </div>
      `;
      this.bindEvents();
    }
  }

  new PdxCheckPage(root);
})();
