(() => {
  const gbfWindow = document.querySelector('.workspace-window[data-window="gbf-convert"]');
  if (!gbfWindow) return;

  const gbfMain = gbfWindow.querySelector(".gbf-main");
  const gbfFileListOriginal = document.getElementById("gbf-file-list-original");
  const gbfFileListGbf = document.getElementById("gbf-file-list-gbf");
  const gbfFileListParent = gbfWindow.querySelector(".gbf-file-split-container");
  const gbfPanelHeader = document.getElementById("gbf-panel-header");
  const gbfPanelBinary = document.getElementById("gbf-panel-binary");
  const gbfPanelStructure = document.getElementById("gbf-panel-structure");
  const gbfPanelResult = document.getElementById("gbf-panel-result");
  const gbfListCount = document.getElementById("gbf-list-count");
  const gbfConvertButton = document.getElementById("gbf-convert-button");
  const gbfPackageButton = document.getElementById("gbf-package-button");
  const modalGbfSync = document.getElementById("modal-gbf-sync");
  const modalGbfPackage = document.getElementById("modal-gbf-package");
  const gbfSyncEcuResult = document.getElementById("gbf-sync-ecu-result");
  const gbfSyncVehicleResult = document.getElementById("gbf-sync-vehicle-result");
  const gbfPackageTree = document.getElementById("gbf-package-tree");
  const gbfPackageCount = document.getElementById("gbf-package-count");
  const gbfPackagePath = document.getElementById("gbf-package-path");
  const gbfProgressButton = document.getElementById("gbf-progress-button");
  const gbfSyncPath = document.getElementById("gbf-sync-path");
  const gbfSyncEcuFileType = document.getElementById("gbf-sync-ecu-file-type");
  const gbfSyncVehicleFileType = document.getElementById("gbf-sync-vehicle-file-type");
  const gbfVehicleVin = document.getElementById("gbf-vehicle-vin");
  const gbfVehicleBaseline = document.getElementById("gbf-vehicle-baseline");
  const gbfToggleFilesButton = document.getElementById("gbf-toggle-files");

  const createImportInput = (mode) => {
    const input = document.createElement("input");
    input.type = "file";
    input.className = "is-hidden";
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    if (mode === "folder") {
      input.multiple = true;
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    } else {
      input.multiple = true;
      input.accept = ".zip,.gbf,.bin,.hex,.s19,.tar,.json";
    }
    gbfWindow.appendChild(input);
    return input;
  };

  const gbfImportFileInput = createImportInput("file");
  const gbfImportFolderInput = createImportInput("folder");

  const createFileContextMenu = () => {
    const menu = document.createElement("div");
    menu.className = "gbf-context-menu";
    menu.innerHTML = `
      <button class="gbf-context-menu__item" type="button" data-action="gbf-context-remove">
        <i class="fa-regular fa-trash-can"></i>
        <span>移除</span>
      </button>
      <button class="gbf-context-menu__item" type="button" data-action="gbf-context-copy">
        <i class="fa-regular fa-copy"></i>
        <span>复制文件</span>
      </button>
      <button class="gbf-context-menu__item" type="button" data-action="gbf-context-convert">
        <i class="fa-solid fa-right-left"></i>
        <span>转化</span>
      </button>
      <button class="gbf-context-menu__item" type="button" data-action="gbf-context-package">
        <i class="fa-solid fa-briefcase"></i>
        <span>整车打包</span>
      </button>
      <button class="gbf-context-menu__item" type="button" data-action="gbf-context-multi-ecu">
        <i class="fa-solid fa-diagram-project"></i>
        <span>多刷写包</span>
      </button>
      <div class="gbf-context-menu__divider"></div>
      <button class="gbf-context-menu__item" type="button" data-action="gbf-context-add-to-flash">
        <i class="fa-solid fa-file-import"></i>
        <span>添加到刷写</span>
      </button>
    `;
    menu.addEventListener("contextmenu", (event) => event.preventDefault());
    document.body.appendChild(menu);
    return menu;
  };

  const gbfFileContextMenu = createFileContextMenu();

  const createProgressPopover = () => {
    const popover = document.createElement("div");
    popover.className = "gbf-progress-popover";
    popover.addEventListener("click", (event) => event.stopPropagation());
    document.body.appendChild(popover);
    return popover;
  };

  const gbfProgressPopover = createProgressPopover();

  const STATUS_META = {
    draft: { label: "配置未完成", className: "gbf-status--draft", iconType: "dot" },
    configured: { label: "配置完成", className: "gbf-status--configured", iconType: "dot" },
    running: { label: "转化中", className: "gbf-status--running", iconType: "running" },
    success: { label: "转化成功", className: "gbf-status--success", iconType: "success" },
    error: { label: "转化失败", className: "gbf-status--error", iconType: "error" },
  };

  const renderStatusIcon = (statusMeta, extraClass = "") => {
    const className = extraClass ? ` ${extraClass}` : "";
    if (statusMeta.iconType === "running") {
      return `<i class="fa-solid fa-spinner fa-spin${className}"></i>`;
    }
    if (statusMeta.iconType === "success") {
      return `<i class="fa-solid fa-check${className}"></i>`;
    }
    if (statusMeta.iconType === "error") {
      return `<i class="fa-solid fa-xmark${className}"></i>`;
    }
    return `<span class="gbf-status-icon gbf-status-icon--dot${className}"></span>`;
  };

  const BUS_LABELS = {
    can: "CAN",
    canfd: "CANFD",
    ethernet: "Ethernet",
  };

  const FLASH_OPTIONS = {
    can: [
      { value: "can-uncompressed", label: "CANFBL_uncompressed" },
      { value: "can-compressed", label: "CANFBL_compressed" },
    ],
    canfd: [
      { value: "can-uncompressed", label: "CANFBL_uncompressed" },
      { value: "can-compressed", label: "CANFBL_compressed" },
    ],
    ethernet: [
      { value: "eth-type1", label: "ETHBootloaderonIP_TypeI" },
      { value: "eth-type2", label: "ETHBootloaderonIP_TypeII" },
    ],
  };

  const FLASH_TYPE_CODES = {
    "can-uncompressed": 1,
    "eth-type2": 2,
    "can-compressed": 3,
    "eth-type1": 4,
  };

  const SA_TYPE_OPTIONS = [
    { value: "0", label: "4字节默认算法" },
    { value: "1", label: "16字节默认算法" },
    { value: "2", label: "16字节增强算法" },
  ];

  const DATA_TYPE_OPTIONS = [
    { value: "0x00", label: "0x00 未加密 / 未压缩" },
    { value: "0x01", label: "0x01 加密 / 未压缩" },
    { value: "0x10", label: "0x10 未加密 / 压缩" },
    { value: "0x11", label: "0x11 加密 / 压缩" },
  ];

  const SW_TYPE_OPTIONS = [
    { value: "1", label: "A 应用" },
    { value: "2", label: "B 底层" },
    { value: "3", label: "C 标定" },
  ];

  const BLOCK_TYPE_OPTIONS = [
    { value: "0", label: "0 flashDriver" },
    { value: "1", label: "1 appData" },
  ];

  const HEADER_SECTION_DEFAULTS = {
    basic: false,
    comm: false,
    version: false,
    sa: false,
    ota: false,
    data: false,
    flash: false,
    ecuSwSignature: false,
    hutSshfsInfo: false,
  };

  const syncMockData = {
    ecu: [
      {
        id: "ecu-v0203",
        version: "V02.03.01",
        type: "原始文件",
        summary: "CEM / AAPCA / G01",
        note: "新增 CANFD 压缩包与 OTA Header",
      },
      {
        id: "ecu-v0202",
        version: "V02.02.05",
        type: "GBF文件",
        summary: "ZCU / AAPCA / G02",
        note: "38服务传输文件，含 Hash256",
      },
      {
        id: "ecu-v0201",
        version: "V02.01.09",
        type: "原始文件",
        summary: "HUT / CAXSO / G01",
        note: "支持整车打包联动",
      },
    ],
    vehicle: [
      {
        id: "vehicle-v2503",
        version: "25-03-Istep-300",
        summary: "VIN 命中 6 个 ECU 包",
        note: "默认以 VIN 为准，包含 ZCU / HUT / CEM / BCM",
      },
    ],
  };

  const initialFiles = [
    {
      id: "cem-canfd",
      name: "01_CEM_CANFD.zip",
      ext: "zip",
      status: "configured",
      configured: true,
      progress: 36,
      path: "D:\\GWM\\Packages\\CEM\\01_CEM_CANFD.zip",
      outputPath: "D:\\GWM\\Packages\\CEM\\01_CEM_CANFD.gbf",
      summary: "34服务 / CANFD / Block结构",
      layerInfo: "单层压缩包",
      sourceTree: [
        { text: "flashDriver.bin" },
        { text: "cem_app.s19" },
        { text: "cem_cali.hex" },
      ],
      resultTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "Block1 flashDriver", child: true },
        { text: "Block2 app", child: true },
        { text: "Block3 cali", child: true },
      ],
      gbfVersion: "V01.00.06",
      gdtVersion: "V02.00.00",
      busType: "canfd",
      flashType: "can-uncompressed",
      supplierCode: "AAPCA",
      version: {
        hwVersion: "3652112XST01A",
        swVersion: "S037A01XKN72005",
        baselineVersion: "25-03-Istep-300",
      },
      canParams: [
        {
          ecuName: "CEM",
          requestId: "0x7E0",
          responseId: "0x7E8",
          logicAddress: "0x1010",
          funId: "0x7DF",
        },
      ],
      ethParams: [
        {
          ecuName: "CEM",
          logicAddress: "0x1010",
          funId: "0xE400",
          ipAddress: "192.168.1.20",
        },
      ],
      sas: [
        { saType: "0", saLvl: "0x01", saMask: "0x204F4243" },
        { saType: "0", saLvl: "0x35", saMask: "0x354F4243" },
      ],
      otaEnabled: true,
      otaFile: "otaHeader_CEM.bin",
      readonly: {
        otaOffset: "0x000006D0",
        otaLength: "0x000002B0",
        otaChecksum: "0xBF6B3E23",
        dataOffset: "0x00000980",
        dataLength: "0x00000000000E6E4C",
        dataChecksum: "0x281A6F9B",
      },
      flash34: {
        swType: "1",
        dataType: "0x00",
        blocks: [
          {
            blockDataType: "0",
            fileIndex: "0",
            gbfBlockOffset: "0x00000400",
            startAddress: "0x70000100",
            length: "0x00000400",
            checkSum: "0xBF6B3E23",
          },
          {
            blockDataType: "1",
            fileIndex: "1",
            gbfBlockOffset: "0x00000980",
            startAddress: "0x80038400",
            length: "0x000BB494",
            checkSum: "0x281A6F9B",
          },
          {
            blockDataType: "1",
            fileIndex: "2",
            gbfBlockOffset: "0x000BC1E4",
            startAddress: "0x80238000",
            length: "0x0002B5B8",
            checkSum: "0x382FA566",
          },
        ],
      },
      flash38: {
        installAddress: "/opt/gwm/cem/",
        files: [],
      },
      validationNotes: [
        "supplierCode 需为 ASCII，长度不超过 15",
        "CANFD 场景仅允许 CANFBL_uncompressed / CANFBL_compressed",
        "Hex 地址允许简写，导出 GBF 时自动补齐到 4 字节",
      ],
    },
    {
      id: "zcu-eth38",
      name: "02_ZCU_ETH38.zip",
      ext: "zip",
      status: "configured",
      configured: true,
      progress: 52,
      path: "D:\\GWM\\Packages\\ZCU\\02_ZCU_ETH38.zip",
      outputPath: "D:\\GWM\\Packages\\ZCU\\02_ZCU_ETH38.gbf",
      summary: "38服务 / Ethernet / 文件结构",
      layerInfo: "单层压缩包",
      sourceTree: [
        { text: "manifest.json" },
        { text: "02_ZCU_ETH38.zip" },
      ],
      resultTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "File1 02_ZCU_ETH38.zip", child: true },
      ],
      gbfVersion: "V01.00.06",
      gdtVersion: "V02.00.00",
      busType: "ethernet",
      flashType: "eth-type2",
      supplierCode: "AAPCA",
      version: {
        hwVersion: "ZCUA1120XST01A",
        swVersion: "ZCU_MAIN_20260318",
        baselineVersion: "25-03-Istep-520",
      },
      canParams: [
        {
          ecuName: "ZCU",
          requestId: "0x7E0",
          responseId: "0x7E8",
          logicAddress: "0x1012",
          funId: "0x7DF",
        },
      ],
      ethParams: [
        {
          ecuName: "ZCU",
          logicAddress: "0x1012",
          funId: "0xE400",
          ipAddress: "192.168.1.12",
        },
      ],
      sas: [
        { saType: "1", saLvl: "0x01", saMask: "0x204F42435A43555F5345435552495459" },
      ],
      otaEnabled: false,
      otaFile: "",
      readonly: {
        otaOffset: "---",
        otaLength: "---",
        otaChecksum: "---",
        dataOffset: "0x00000980",
        dataLength: "0x0000000000189A20",
        dataChecksum: "0x7C2E8B10",
      },
      flash34: {
        swType: "1",
        dataType: "0x00",
        blocks: [],
      },
      flash38: {
        installAddress: "/opt/gwm/zcu/",
        files: [
          {
            installAddress: "/opt/gwm/zcu/",
            fileName: "02_ZCU_ETH38.zip",
            dataType: "0x00",
            fileSizeUnzip: "0x0000000000189A20",
            fileSizeZip: "0x000000000010A120",
            fileHash: "A7CB15E90D2A1B4FF00ACAB1830F12CC",
          },
        ],
      },
      validationNotes: [
        "Ethernet 场景仅允许 Type I / Type II",
        "flashType=Type II 时，OTA Header 区域不显示",
        "38服务结构中仅安装路径可编辑，文件大小与 Hash 自动计算",
      ],
    },
    {
      id: "hut-release",
      name: "HUT_release_20260318.gbf",
      ext: "gbf",
      status: "success",
      configured: true,
      progress: 100,
      path: "D:\\GWM\\Packages\\HUT\\HUT_release_20260318.gbf",
      outputPath: "D:\\GWM\\Packages\\HUT\\HUT_release_20260318.gbf",
      summary: "只读预览 / 可参与整车打包",
      layerInfo: "已转化 GBF 文件",
      sourceTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "File1 HUT_rootfs.tar", child: true },
      ],
      resultTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "File1 HUT_rootfs.tar", child: true },
      ],
      gbfVersion: "V01.00.06",
      gdtVersion: "V02.00.00",
      busType: "ethernet",
      flashType: "eth-type1",
      supplierCode: "CAXSO",
      version: {
        hwVersion: "HUT3562001XST02A",
        swVersion: "HUT_MAIN_20260318",
        baselineVersion: "25-04-Istep-120",
      },
      canParams: [
        {
          ecuName: "HUT",
          requestId: "0x7E0",
          responseId: "0x7E8",
          logicAddress: "0x1013",
          funId: "0x7DF",
        },
      ],
      ethParams: [
        {
          ecuName: "HUT",
          logicAddress: "0x1013",
          funId: "0xE400",
          ipAddress: "192.168.1.30",
        },
      ],
      sas: [
        { saType: "0", saLvl: "0x01", saMask: "0x20485554" },
      ],
      otaEnabled: true,
      otaFile: "hut_ota_header.bin",
      readonly: {
        otaOffset: "0x00000400",
        otaLength: "0x00000320",
        otaChecksum: "0x66CCAA10",
        dataOffset: "0x00000F80",
        dataLength: "0x0000000000121000",
        dataChecksum: "0x99AB0011",
      },
      flash34: {
        swType: "1",
        dataType: "0x00",
        blocks: [],
      },
      flash38: {
        installAddress: "/opt/gwm/hut/",
        files: [
          {
            fileName: "HUT_rootfs.tar",
            dataType: "0x00",
            fileSizeUnzip: "0x0000000000121000",
            fileSizeZip: "0x0000000000098000",
            fileHash: "1213AA905598C0173BCBE1212233FE90",
          },
        ],
      },
      validationNotes: [
        "`.gbf` 文件仅支持只读预览与整车打包，不参与再次转化",
        "Header JSON 已计算完成，可用于字段校验映射",
      ],
    },
    {
      id: "radar-nested",
      name: "Radar_nested.zip",
      ext: "zip",
      status: "draft",
      configured: false,
      progress: 0,
      convertShouldFail: true,
      path: "D:\\GWM\\Packages\\Radar\\Radar_nested.zip",
      outputPath: "D:\\GWM\\Packages\\Radar\\Radar_nested.gbf",
      summary: "两层压缩包 / 待补录地址",
      layerInfo: "包含两层 zip",
      sourceTree: [
        { text: "Radar_outer.zip" },
        { text: "Radar_inner.zip", child: true },
        { text: "radar_payload.bin", child: true },
      ],
      resultTree: [
        { text: "等待完成 Header 配置" },
      ],
      gbfVersion: "V01.00.06",
      gdtVersion: "V02.00.00",
      busType: "can",
      flashType: "can-compressed",
      supplierCode: "供应商1",
      version: {
        hwVersion: "",
        swVersion: "",
        baselineVersion: "25-01-Istep-010",
      },
      canParams: [
        {
          ecuName: "RR_Radar",
          requestId: "0x7E2",
          responseId: "",
          logicAddress: "0x1014",
          funId: "0x7DF",
        },
      ],
      ethParams: [
        {
          ecuName: "RR_Radar",
          logicAddress: "0x1014",
          funId: "0xE400",
          ipAddress: "192.168.1.88",
        },
      ],
      sas: [
        { saType: "0", saLvl: "0x01", saMask: "" },
      ],
      otaEnabled: true,
      otaFile: "",
      readonly: {
        otaOffset: "---",
        otaLength: "---",
        otaChecksum: "---",
        dataOffset: "---",
        dataLength: "---",
        dataChecksum: "---",
      },
      flash34: {
        swType: "1",
        dataType: "0x10",
        blocks: [
          {
            blockDataType: "1",
            fileIndex: "0",
            gbfBlockOffset: "---",
            startAddress: "",
            length: "",
            checkSum: "---",
          },
        ],
      },
      flash38: {
        installAddress: "/opt/gwm/radar/",
        files: [],
      },
      validationNotes: [
        "两层 zip 仅解析到第二层，导出后默认重新打包为 GBF_原文件名.zip",
        "BIN / OTA BIN 场景需要补录 startAddress 与 length",
      ],
    },
  ];

  const createDemoFile = (source, overrides = {}) => {
    const file = JSON.parse(JSON.stringify(source));
    Object.assign(file, overrides);
    if (overrides.version) file.version = overrides.version;
    if (overrides.canParams) file.canParams = overrides.canParams;
    if (overrides.ethParams) file.ethParams = overrides.ethParams;
    if (overrides.sas) file.sas = overrides.sas;
    if (overrides.readonly) file.readonly = overrides.readonly;
    if (overrides.flash34) file.flash34 = overrides.flash34;
    if (overrides.flash38) file.flash38 = overrides.flash38;
    if (overrides.sourceTree) file.sourceTree = overrides.sourceTree;
    if (overrides.resultTree) file.resultTree = overrides.resultTree;
    if (overrides.validationNotes) file.validationNotes = overrides.validationNotes;
    return file;
  };

  const [cemSeed, zcuSeed, hutSeed, radarSeed] = initialFiles;

  initialFiles.push(
    createDemoFile(radarSeed, {
      id: "camera-draft",
      name: "ADAS_Camera_pending.zip",
      path: "D:\\GWM\\Packages\\ADAS\\ADAS_Camera_pending.zip",
      outputPath: "D:\\GWM\\Packages\\ADAS\\ADAS_Camera_pending.gbf",
      summary: "单文件导入 / 待勾选完成配置",
      layerInfo: "单层压缩包",
      supplierCode: "VEND-02",
      version: {
        hwVersion: "ADAS3652002XST01A",
        swVersion: "ADAS_CAM_20260319",
        baselineVersion: "25-03-Istep-210",
      },
      canParams: [
        {
          ecuName: "ADAS_CAM",
          requestId: "0x7E3",
          responseId: "0x7EB",
          logicAddress: "0x1015",
          funId: "0x7DF",
        },
      ],
      sas: [{ saType: "0", saLvl: "0x01", saMask: "0x20414441" }],
      otaFile: "otaHeader_ADAS_CAM.bin",
      readonly: {
        otaOffset: "0x00000400",
        otaLength: "0x00000220",
        otaChecksum: "0xA1B20C3D",
        dataOffset: "0x00000980",
        dataLength: "0x000000000009A220",
        dataChecksum: "0xC011AB29",
      },
      flash34: {
        swType: "1",
        dataType: "0x10",
        blocks: [
          {
            blockDataType: "1",
            fileIndex: "0",
            gbfBlockOffset: "0x00000980",
            startAddress: "0x80480000",
            length: "0x00022000",
            checkSum: "0xAF18B290",
          },
        ],
      },
      status: "draft",
      configured: false,
      progress: 0,
      convertShouldFail: false,
      validationNotes: [
        "字段已通过校验，但尚未勾选“完成配置”，列表仍显示为草稿状态。",
        "勾选完成配置后才允许参与转化。",
      ],
      resultTree: [{ text: "等待勾选完成配置" }],
    }),
    createDemoFile(cemSeed, {
      id: "bcm-running",
      name: "03_BCM_CANFD.zip",
      path: "D:\\GWM\\Packages\\BCM\\03_BCM_CANFD.zip",
      outputPath: "D:\\GWM\\Packages\\BCM\\03_BCM_CANFD.gbf",
      summary: "34 服务 / CANFD / 转化中",
      version: {
        hwVersion: "BCM3652109XST01A",
        swVersion: "BCM_MAIN_20260319",
        baselineVersion: "25-03-Istep-320",
      },
      canParams: [
        {
          ecuName: "BCM",
          requestId: "0x7E1",
          responseId: "0x7E9",
          logicAddress: "0x1011",
          funId: "0x7DF",
        },
      ],
      status: "running",
      configured: true,
      progress: 42,
      convertShouldFail: false,
    }),
    createDemoFile(zcuSeed, {
      id: "ivi-running",
      name: "04_IVI_ETH38.zip",
      path: "D:\\GWM\\Packages\\IVI\\04_IVI_ETH38.zip",
      outputPath: "D:\\GWM\\Packages\\IVI\\04_IVI_ETH38.gbf",
      summary: "38 服务 / Ethernet / 转化中",
      layerInfo: "单层压缩包",
      sourceTree: [
        { text: "manifest.json" },
        { text: "04_IVI_ETH38.zip" },
      ],
      resultTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "File1 04_IVI_ETH38.zip", child: true },
      ],
      flashType: "eth-type1",
      version: {
        hwVersion: "IVI3652110XST01A",
        swVersion: "IVI_MAIN_20260319",
        baselineVersion: "25-03-Istep-330",
      },
      ethParams: [
        {
          ecuName: "IVI",
          logicAddress: "0x1016",
          funId: "0xE400",
          ipAddress: "192.168.1.48",
        },
      ],
      sas: [
        { saType: "1", saLvl: "0x01", saMask: "0x204956495F53454355524954595F4B4559" },
      ],
      otaEnabled: true,
      otaFile: "otaHeader_IVI.bin",
      readonly: {
        otaOffset: "0x000006D0",
        otaLength: "0x000002B0",
        otaChecksum: "0x8A15C210",
        dataOffset: "0x00000980",
        dataLength: "0x0000000000214020",
        dataChecksum: "0x6C9F21A8",
      },
      flash38: {
        installAddress: "/opt/gwm/ivi/",
        files: [
          {
            installAddress: "/opt/gwm/ivi/",
            fileName: "04_IVI_ETH38.zip",
            dataType: "0x00",
            fileSizeUnzip: "0x0000000000214020",
            fileSizeZip: "0x0000000000152D40",
            fileHash: "8F6B15E90D2A1B4FF00ACAB1830F12CC",
          },
        ],
      },
      status: "running",
      configured: true,
      progress: 68,
      convertShouldFail: false,
      validationNotes: [
        "IVI Ethernet 场景使用 ecuEthComParams 与 flashFile38s 输出 Header。",
        "Type I 场景展示 otaHeader 与 38 服务文件清单。",
      ],
    }),
    createDemoFile(zcuSeed, {
      id: "ivi-release",
      name: "04_IVI_ETH38.gbf",
      ext: "gbf",
      path: "D:\\GWM\\Packages\\IVI\\04_IVI_ETH38.gbf",
      outputPath: "D:\\GWM\\Packages\\IVI\\04_IVI_ETH38.gbf",
      summary: "只读预览 / Ethernet GBF",
      layerInfo: "已转化 GBF 文件",
      sourceTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "File1 04_IVI_ETH38.zip", child: true },
      ],
      resultTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "File1 04_IVI_ETH38.zip", child: true },
      ],
      flashType: "eth-type1",
      version: {
        hwVersion: "IVI3652110XST01A",
        swVersion: "IVI_MAIN_20260319",
        baselineVersion: "25-03-Istep-330",
      },
      ethParams: [
        {
          ecuName: "IVI",
          logicAddress: "0x1016",
          funId: "0xE400",
          ipAddress: "192.168.1.48",
        },
      ],
      sas: [
        { saType: "1", saLvl: "0x01", saMask: "0x204956495F53454355524954595F4B4559" },
      ],
      otaEnabled: true,
      otaFile: "otaHeader_IVI.bin",
      readonly: {
        otaOffset: "0x000006D0",
        otaLength: "0x000002B0",
        otaChecksum: "0x8A15C210",
        dataOffset: "0x00000980",
        dataLength: "0x0000000000214020",
        dataChecksum: "0x6C9F21A8",
      },
      flash38: {
        installAddress: "/opt/gwm/ivi/",
        files: [
          {
            installAddress: "/opt/gwm/ivi/",
            fileName: "04_IVI_ETH38.zip",
            dataType: "0x00",
            fileSizeUnzip: "0x0000000000214020",
            fileSizeZip: "0x0000000000152D40",
            fileHash: "8F6B15E90D2A1B4FF00ACAB1830F12CC",
          },
        ],
      },
      status: "success",
      configured: true,
      progress: 100,
      convertShouldFail: false,
      validationNotes: [
        "`.gbf` 文件仅支持只读预览与整车打包，不参与再次转化。",
        "IVI Ethernet Header 已按 38 服务文件结构展示。",
      ],
    }),
    createDemoFile(cemSeed, {
      id: "bms-success",
      name: "05_BMS_CANFD.zip",
      path: "D:\\GWM\\Packages\\BMS\\05_BMS_CANFD.zip",
      outputPath: "D:\\GWM\\Packages\\BMS\\05_BMS_CANFD.gbf",
      summary: "34 服务 / CANFD / 已转化完成",
      version: {
        hwVersion: "BMS3652115XST01A",
        swVersion: "BMS_MAIN_20260319",
        baselineVersion: "25-03-Istep-350",
      },
      canParams: [
        {
          ecuName: "BMS",
          requestId: "0x7E4",
          responseId: "0x7EC",
          logicAddress: "0x1018",
          funId: "0x7DF",
        },
      ],
      status: "success",
      configured: true,
      progress: 100,
      convertShouldFail: false,
    }),
    createDemoFile(cemSeed, {
      id: "cem-release",
      name: "01_CEM_CANFD.gbf",
      ext: "gbf",
      path: "D:\\GWM\\Packages\\CEM\\01_CEM_CANFD.gbf",
      outputPath: "D:\\GWM\\Packages\\CEM\\01_CEM_CANFD.gbf",
      summary: "只读预览 / CANFD GBF",
      layerInfo: "已转化 GBF 文件",
      sourceTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "Block1 flashDriver", child: true },
        { text: "Block2 app", child: true },
        { text: "Block3 cali", child: true },
      ],
      resultTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "Block1 flashDriver", child: true },
        { text: "Block2 app", child: true },
        { text: "Block3 cali", child: true },
      ],
      status: "success",
      configured: true,
      progress: 100,
      convertShouldFail: false,
      validationNotes: [
        "`.gbf` 文件仅支持只读预览与整车打包，不参与再次转化。",
        "34 服务示例会展示 Header、OtaHeader、Block 与 Data 二进制内容。",
      ],
    }),
    createDemoFile(zcuSeed, {
      id: "eth-bin-list-08",
      name: "08_ETH_TYPEI_BINLIST.zip",
      path: "D:\\GWM\\Packages\\ETH\\08_ETH_TYPEI_BINLIST.zip",
      outputPath: "D:\\GWM\\Packages\\ETH\\08_ETH_TYPEI_BINLIST.gbf",
      summary: "34 服务 / Ethernet Type I / BIN 列表",
      layerInfo: "ZIP 内含 FlashDriver.s19、binFile1、binFile2",
      sourceTree: [
        { text: "FlashDriver.s19" },
        { text: "binFile1" },
        { text: "binFile2" },
      ],
      resultTree: [
        { text: "gbfHeader.json" },
        { text: "DATA" },
        { text: "Block1 fileIndex=0", child: true },
        { text: "binFile1", child: true },
        { text: "binFile2", child: true },
      ],
      flashType: "eth-type1",
      version: {
        hwVersion: "ETHBIN3652001XST01A",
        swVersion: "ETH_BINLIST_20260410",
        baselineVersion: "25-04-Istep-210",
      },
      ethParams: [
        {
          ecuName: "ETHBIN",
          logicAddress: "0x1019",
          funId: "0xE400",
          ipAddress: "192.168.1.88",
        },
      ],
      otaEnabled: true,
      otaFile: "otaHeader_ETHBIN.bin",
      readonly: {
        otaOffset: "0x00000400",
        otaLength: "0x00000220",
        otaChecksum: "0x45AF2190",
        dataOffset: "0x00000980",
        dataLength: "0x0000000000104000",
        dataChecksum: "0x37AE2190",
      },
      flash34: {
        swType: "1",
        dataType: "0x00",
        blocks: [
          {
            sourceName: "FlashDriver.s19",
            blockDataType: "0",
            fileIndex: "0",
            gbfBlockOffset: "0x00000400",
            startAddress: "0x70000100",
            length: "0x00000400",
            checkSum: "0x45AF2190",
          },
          {
            sourceName: "binFile1",
            blockDataType: "1",
            fileIndex: "1",
            gbfBlockOffset: "---",
            startAddress: "",
            length: "",
            checkSum: "---",
          },
          {
            sourceName: "binFile2",
            blockDataType: "1",
            fileIndex: "2",
            gbfBlockOffset: "---",
            startAddress: "",
            length: "",
            checkSum: "---",
          },
        ],
      },
      flash38: {
        installAddress: "/opt/gwm/ethbin/",
        files: [],
      },
      status: "draft",
      configured: false,
      progress: 0,
      convertShouldFail: false,
      validationNotes: [
        "FlashDriver.s19 保持 Block 展示；binFile1、binFile2 按文件名称展示。",
        "BIN 文件需要手工补录 StartAddress 和 Length。",
      ],
    }),
    createDemoFile(radarSeed, {
      id: "vehicle-sw",
      name: "vehicleSw.zip",
      path: "D:\\GWM\\Packages\\Vehicle\\vehicleSw.zip",
      outputPath: "D:\\GWM\\Packages\\Vehicle\\vehicleSw.gbf",
      summary: "整车子包集合 / 可展开查看内层 zip",
      layerInfo: "包含 3 个 ECU 子 zip",
      sourceTree: [
        { text: "S028A01XKV3J00D.zip" },
        { text: "S029A01XKV3J00D.zip" },
        { text: "S031A01XKV3J00D.zip" },
      ],
      resultTree: [{ text: "按子包分别生成 .gbf 文件" }],
      supplierCode: "AAPCA",
      version: {
        hwVersion: "VEHICLE_SW_BUNDLE",
        swVersion: "VEHICLE_SW_20260328",
        baselineVersion: "25-03-Istep-300",
      },
      canParams: [
        {
          ecuName: "VehicleSW",
          requestId: "0x7E0",
          responseId: "0x7E8",
          logicAddress: "0x1020",
          funId: "0x7DF",
        },
      ],
      status: "success",
      configured: true,
      progress: 100,
      convertShouldFail: false,
      validationNotes: [
        "内层 zip 支持在左侧列表中展开，并可独立勾选。",
        "父包用于展示整车分发关系，子包可单独参与转化。",
      ],
    }),
    createDemoFile(cemSeed, {
      id: "vehicle-sw-s028",
      parentId: "vehicle-sw",
      name: "S028A01XKV3J00D.zip",
      path: "D:\\GWM\\Packages\\Vehicle\\vehicleSw\\S028A01XKV3J00D.zip",
      outputPath: "D:\\GWM\\Packages\\Vehicle\\vehicleSw\\S028A01XKV3J00D.gbf",
      summary: "vehicleSw 子包 / 可单独勾选转化",
      layerInfo: "vehicleSw.zip 内层文件",
      version: {
        hwVersion: "S028A01XKV3",
        swVersion: "S028A01XKV3J00D",
        baselineVersion: "25-03-Istep-300",
      },
      canParams: [
        {
          ecuName: "S028",
          requestId: "0x78C",
          responseId: "0x7CC",
          logicAddress: "0x1021",
          funId: "0x7DF",
        },
      ],
      status: "configured",
      configured: true,
      progress: 0,
      convertShouldFail: false,
    }),
    createDemoFile(cemSeed, {
      id: "vehicle-sw-s029",
      parentId: "vehicle-sw",
      name: "S029A01XKV3J00D.zip",
      path: "D:\\GWM\\Packages\\Vehicle\\vehicleSw\\S029A01XKV3J00D.zip",
      outputPath: "D:\\GWM\\Packages\\Vehicle\\vehicleSw\\S029A01XKV3J00D.gbf",
      summary: "vehicleSw 子包 / 可单独勾选转化",
      layerInfo: "vehicleSw.zip 内层文件",
      version: {
        hwVersion: "S029A01XKV3",
        swVersion: "S029A01XKV3J00D",
        baselineVersion: "25-03-Istep-300",
      },
      canParams: [
        {
          ecuName: "S029",
          requestId: "0x78D",
          responseId: "0x7CD",
          logicAddress: "0x1022",
          funId: "0x7DF",
        },
      ],
      status: "configured",
      configured: true,
      progress: 0,
      convertShouldFail: false,
    }),
    createDemoFile(cemSeed, {
      id: "vehicle-sw-s031",
      parentId: "vehicle-sw",
      name: "S031A01XKV3J00D.zip",
      path: "D:\\GWM\\Packages\\Vehicle\\vehicleSw\\S031A01XKV3J00D.zip",
      outputPath: "D:\\GWM\\Packages\\Vehicle\\vehicleSw\\S031A01XKV3J00D.gbf",
      summary: "vehicleSw 子包 / 可单独勾选转化",
      layerInfo: "vehicleSw.zip 内层文件",
      version: {
        hwVersion: "S031A01XKV3",
        swVersion: "S031A01XKV3J00D",
        baselineVersion: "25-03-Istep-300",
      },
      canParams: [
        {
          ecuName: "S031",
          requestId: "0x78E",
          responseId: "0x7CE",
          logicAddress: "0x1023",
          funId: "0x7DF",
        },
      ],
      status: "configured",
      configured: true,
      progress: 0,
      convertShouldFail: false,
    }),
    createDemoFile(radarSeed, {
      id: "all-sw",
      name: "ALLSW.zip",
      path: "D:\\GWM\\Packages\\Vehicle\\ALLSW.zip",
      outputPath: "D:\\GWM\\Packages\\Vehicle\\ALLSW.gbf",
      summary: "多 ECU 整车包 / 可切换为子包下拉",
      layerInfo: "ZIP 内含 3 个 ECU 子 zip，支持多ECU展开",
      sourceTree: [
        { text: "S028A01XKV3J00D.zip" },
        { text: "S029A01XKV3J00D.zip" },
        { text: "S031A01XKV3J00D.zip" },
      ],
      resultTree: [{ text: "点击多ECU后按子包分别生成 .gbf 文件" }],
      supplierCode: "AAPCA",
      version: {
        hwVersion: "ALL_SW_BUNDLE",
        swVersion: "ALL_SW_20260417",
        baselineVersion: "25-04-Istep-360",
      },
      canParams: [
        {
          ecuName: "ALLSW",
          requestId: "0x7E0",
          responseId: "0x7E8",
          logicAddress: "0x1024",
          funId: "0x7DF",
        },
      ],
      multiEcuChildren: [
        {
          templateId: "vehicle-sw-s028",
          name: "S028A01XKV3J00D.zip",
          path: "D:\\GWM\\Packages\\Vehicle\\ALLSW\\S028A01XKV3J00D.zip",
          outputPath: "D:\\GWM\\Packages\\Vehicle\\ALLSW\\S028A01XKV3J00D.gbf",
        },
        {
          templateId: "vehicle-sw-s029",
          name: "S029A01XKV3J00D.zip",
          path: "D:\\GWM\\Packages\\Vehicle\\ALLSW\\S029A01XKV3J00D.zip",
          outputPath: "D:\\GWM\\Packages\\Vehicle\\ALLSW\\S029A01XKV3J00D.gbf",
        },
        {
          templateId: "vehicle-sw-s031",
          name: "S031A01XKV3J00D.zip",
          path: "D:\\GWM\\Packages\\Vehicle\\ALLSW\\S031A01XKV3J00D.zip",
          outputPath: "D:\\GWM\\Packages\\Vehicle\\ALLSW\\S031A01XKV3J00D.gbf",
        },
      ],
      status: "configured",
      configured: true,
      progress: 0,
      convertShouldFail: false,
      validationNotes: [
        "未切换多ECU前按普通 zip 显示，可直接勾选。",
        "点击“多ECU”后会生成与 vehicleSw.zip 相同结构的子包下拉。",
      ],
    }),
    createDemoFile(zcuSeed, {
      id: "adas-failed",
      name: "06_ADAS_FAIL.zip",
      path: "D:\\GWM\\Packages\\ADAS\\06_ADAS_FAIL.zip",
      outputPath: "D:\\GWM\\Packages\\ADAS\\06_ADAS_FAIL.gbf",
      summary: "38 服务 / 转化失败 / 可重新发起",
      version: {
        hwVersion: "ADAS3652116XST01A",
        swVersion: "ADAS_FAIL_20260319",
        baselineVersion: "25-03-Istep-360",
      },
      ethParams: [
        {
          ecuName: "ADAS",
          logicAddress: "0x1019",
          funId: "0xE400",
          ipAddress: "192.168.1.58",
        },
      ],
      status: "error",
      configured: true,
      progress: 82,
      convertShouldFail: true,
      validationNotes: [
        "演示失败态：文件转化执行失败，需回到配置完成状态后重新发起。",
        "失败原因需在详情区和系统消息中同步展示。",
      ],
    }),
    createDemoFile(cemSeed, {
      id: "eps-failed",
      name: "07_EPS_FAIL.zip",
      path: "D:\\GWM\\Packages\\EPS\\07_EPS_FAIL.zip",
      outputPath: "D:\\GWM\\Packages\\EPS\\07_EPS_FAIL.gbf",
      summary: "34 服务 / 转化失败 / 可重新发起",
      version: {
        hwVersion: "EPS3652117XST01A",
        swVersion: "EPS_FAIL_20260319",
        baselineVersion: "25-03-Istep-370",
      },
      canParams: [
        {
          ecuName: "EPS",
          requestId: "0x7E5",
          responseId: "0x7ED",
          logicAddress: "0x101A",
          funId: "0x7DF",
        },
      ],
      status: "error",
      configured: true,
      progress: 74,
      convertShouldFail: true,
      validationNotes: [
        "演示失败态：执行中断后显示失败状态。",
        "修正后应回到配置完成状态再重新转化。",
      ],
    })
  );

  const state = {
    activeTab: "header",
    syncTab: "ecu",
    filesCollapsed: false,
    fileSectionsCollapsed: {
      original: false,
      gbf: false,
    },
    fileTreeExpanded: { "vehicle-sw": true },
    headerSections: { ...HEADER_SECTION_DEFAULTS },
    gbfDataSelection: {},
    gbfDataExpanded: {},
    contextMenuFileId: "",
    selectedFileId: "cem-canfd",
    multiEcuSelections: {},
    checkedIds: new Set([
      "cem-canfd",
      "zcu-eth38",
      "vehicle-sw",
      "vehicle-sw-s028",
      "vehicle-sw-s029",
      "vehicle-sw-s031",
    ]),
    syncSelectedId: "ecu-v0203",
    syncLoadedEcu: true,
    syncLoadedVehicle: true,
    convertTimer: null,
    convertBatchItems: [],
    files: initialFiles.map((item) => JSON.parse(JSON.stringify(item))),
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const getFieldDisplayName = (path) => {
    const text = String(path ?? "");
    const parts = text.split(".");
    return parts[parts.length - 1] || text;
  };

  const getSelectedFile = () =>
    state.files.find(
      (item) => item.id === state.selectedFileId && !state.files.some((entry) => entry.parentId === item.id)
    ) ||
    state.files.find((item) => !state.files.some((entry) => entry.parentId === item.id)) ||
    state.files[0];

  const getFileById = (fileId) => state.files.find((item) => item.id === fileId);

  const getChildFiles = (parentId = "") =>
    state.files.filter((item) => String(item.parentId || "") === String(parentId || ""));

  const getTopLevelFiles = () => getChildFiles("");

  const hasChildFiles = (fileId) => state.files.some((item) => item.parentId === fileId);

  const isContainerFile = (fileOrId) => {
    const file = typeof fileOrId === "string" ? getFileById(fileOrId) : fileOrId;
    return Boolean(file && hasChildFiles(file.id));
  };

  const getDescendantFileIds = (fileId) => {
    const ids = [];
    const walk = (parentId) => {
      getChildFiles(parentId).forEach((child) => {
        ids.push(child.id);
        walk(child.id);
      });
    };
    walk(fileId);
    return ids;
  };

  const getAncestorFileIds = (fileId) => {
    const ids = [];
    let current = getFileById(fileId);
    while (current?.parentId) {
      ids.push(current.parentId);
      current = getFileById(current.parentId);
    }
    return ids;
  };

  const getNestedZipEntries = (file) => {
    const currentName = String(file?.name || "").trim().toLowerCase();
    return (file?.sourceTree || [])
      .map((item) => normalizeJsonText(item?.text))
      .filter((text) => text && /\.zip$/i.test(text) && text.trim().toLowerCase() !== currentName);
  };

  const canEnableMultiEcu = (file) =>
    Boolean(
      file &&
        file.ext === "zip" &&
        !file.multiEcuEnabled &&
        !hasChildFiles(file.id) &&
        ((Array.isArray(file.multiEcuChildren) && file.multiEcuChildren.length) || getNestedZipEntries(file).length)
    );

  const syncParentMultiEcuSelection = (parentId) => {
    const childFiles = getChildFiles(parentId);
    if (!childFiles.length) {
      delete state.multiEcuSelections[parentId];
      return;
    }

    const checkedChild = childFiles.find((item) => state.checkedIds.has(item.id));
    if (checkedChild) {
      state.multiEcuSelections[parentId] = checkedChild.id;
      return;
    }

    if (!childFiles.some((item) => item.id === state.multiEcuSelections[parentId])) {
      state.multiEcuSelections[parentId] = childFiles[0].id;
    }
  };

  const syncAncestorMultiEcuSelection = (fileId) => {
    getAncestorFileIds(fileId).forEach((parentId) => {
      state.multiEcuSelections[parentId] = fileId;
    });
  };

  const syncAllMultiEcuSelections = () => {
    state.files.forEach((item) => {
      if (item.multiEcuEnabled && hasChildFiles(item.id)) {
        syncParentMultiEcuSelection(item.id);
      }
    });
  };

  const syncAncestorCheckedState = (fileId) => {
    getAncestorFileIds(fileId).forEach((parentId) => {
      state.checkedIds.delete(parentId);
    });
  };

  const toggleFileCheckedState = (fileId) => {
    if (isContainerFile(fileId)) return;
    const branchIds = [fileId, ...getDescendantFileIds(fileId)];
    const shouldCheck = branchIds.some((id) => !state.checkedIds.has(id));
    branchIds.forEach((id) => {
      if (shouldCheck) {
        state.checkedIds.add(id);
      } else {
        state.checkedIds.delete(id);
      }
    });
    syncAncestorCheckedState(fileId);
    syncAncestorMultiEcuSelection(fileId);
  };

  const isFileTreeExpanded = (fileId) => Boolean(state.fileTreeExpanded[fileId]);

  const isGbfFile = (file) => file?.ext === "gbf";

  const clampProgress = (value) => Math.max(0, Math.min(Number(value) || 0, 100));

  const getConvertBatchItems = () =>
    (state.convertBatchItems || [])
      .map((item) => {
        const file = state.files.find((entry) => entry.id === item.id);
        return file ? { ...item, file } : null;
      })
      .filter(Boolean);

  const getConvertBatchPercent = (items = getConvertBatchItems()) =>
    items.length ? Math.round(items.reduce((sum, item) => sum + clampProgress(item.file.progress), 0) / items.length) : 0;

  const getGbfPath = (file) => file.outputPath || file.path.replace(/\.[^.]+$/, ".gbf");

  const syncGeneratedGbfState = (file) => {
    if (!file) return;
    if (isGbfFile(file)) {
      const gbfPath = file.outputPath || file.path || file.name;
      file.outputPath = gbfPath;
      file.path = gbfPath;
      if (gbfPath) {
        file.name = gbfPath.split("\\").pop() || file.name;
      }
      file.status = "success";
      file.configured = true;
      file.progress = 100;
      return;
    }
  };

  const createDefaultCanParam = (file) => ({
    ecuName: "",
    requestId: "",
    responseId: "",
    logicAddress: "",
    funId: "0x7DF",
  });

  const createDefaultEthParam = (file) => ({
    ecuName: "",
    logicAddress: "",
    funId: "0xE400",
    ipAddress: "",
  });

  const createDefaultSaItem = () => ({
    saType: "0",
    saLvl: "0x01",
    saMask: "",
  });

  const createDefaultFlash34Block = (index = 0, overrides = {}) => ({
    sourceName: overrides.sourceName || `binFile${index + 1}`,
    blockDataType: overrides.blockDataType || "1",
    fileIndex: String(index),
    gbfBlockOffset: overrides.gbfBlockOffset || "---",
    startAddress: overrides.startAddress || "",
    length: overrides.length || "",
    checkSum: overrides.checkSum || "---",
  });

  const getFlash34BlockSourceName = (item) => normalizeJsonText(item?.sourceName || item?.fileName);

  const isFlash34NamedFile = (item) => {
    const sourceName = getFlash34BlockSourceName(item);
    return Boolean(sourceName) && !/\.(s19|hex)$/i.test(sourceName);
  };

  const getFlash34BlockTitle = (item, index) =>
    isFlash34NamedFile(item) ? getFlash34BlockSourceName(item) : `Block ${index + 1}`;

  const getFlash34ChildBlockTitle = (item, index) => `Block ${Number(item?.fileIndex ?? index) + 1}`;

  const getFlash34BlockTreeText = (item, index) =>
    isFlash34NamedFile(item)
      ? getFlash34BlockSourceName(item)
      : `Block${index + 1} fileIndex=${item.fileIndex}`;

  const normalizeFlash34BlockSequence = (file) => {
    if (!Array.isArray(file.flash34?.blocks)) return;
    file.flash34.blocks = file.flash34.blocks.map((item, index) => ({
      ...item,
      fileIndex: String(index),
    }));
  };

  const buildFlash34BlockGroups = (file) => {
    const groups = [];
    const namedFileGroups = new Map();
    (file.flash34?.blocks || []).forEach((item, index) => {
      if (!isFlash34NamedFile(item)) {
        groups.push({
          type: "block",
          title: getFlash34BlockTitle(item, index),
          items: [{ item, index }],
        });
        return;
      }

      const sourceName = getFlash34BlockSourceName(item);
      let group = namedFileGroups.get(sourceName);
      if (!group) {
        group = {
          type: "file",
          title: sourceName,
          sourceName,
          items: [],
        };
        namedFileGroups.set(sourceName, group);
        groups.push(group);
      }
      group.items.push({ item, index });
    });
    return groups;
  };

  const getGroupCollection = (file, group) => {
    const segments = String(group || "").split(".");
    let cursor = file;
    for (const segment of segments) {
      if (!cursor || !(segment in cursor)) return null;
      cursor = cursor[segment];
    }
    return Array.isArray(cursor) ? cursor : null;
  };

  const captureGbfScrollState = () => {
    const file = getSelectedFile();
    if (!file) return null;

    if (isGbfFile(file)) {
      return {
        panel: "binary",
        treeTop: gbfPanelBinary?.querySelector(".gbf-data-tree")?.scrollTop || 0,
        contentTop: gbfPanelBinary?.querySelector(".gbf-data-content")?.scrollTop || 0,
      };
    }

    if (state.activeTab === "header") {
      return {
        panel: "header",
        top: gbfPanelHeader?.querySelector(".gbf-config-sheet__table")?.scrollTop || 0,
      };
    }

    return null;
  };

  const restoreGbfScrollState = (scrollState) => {
    if (!scrollState) return;

    window.requestAnimationFrame(() => {
      if (scrollState.panel === "binary") {
        const tree = gbfPanelBinary?.querySelector(".gbf-data-tree");
        const content = gbfPanelBinary?.querySelector(".gbf-data-content");
        if (tree) tree.scrollTop = scrollState.treeTop || 0;
        if (content) content.scrollTop = scrollState.contentTop || 0;
        return;
      }

      if (scrollState.panel === "header") {
        const table = gbfPanelHeader?.querySelector(".gbf-config-sheet__table");
        if (table) {
          table.scrollTop = scrollState.top || 0;
        }
      }
    });
  };

  const createDefaultReservedInfo = () => ({
    swDataSignatureAlgorithm: "",
    swDataSignatureValue: "",
    publicKey: "",
    dataHash: "",
  });

  const normalizeReservedInfo = (rawValue) => {
    const base = createDefaultReservedInfo();

    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      return {
        swDataSignatureAlgorithm:
          rawValue.swDataSignatureAlgorithm == null || rawValue.swDataSignatureAlgorithm === "---"
            ? ""
            : String(rawValue.swDataSignatureAlgorithm),
        swDataSignatureValue:
          rawValue.swDataSignatureValue == null || rawValue.swDataSignatureValue === "---"
            ? ""
            : String(rawValue.swDataSignatureValue),
        publicKey: rawValue.publicKey == null || rawValue.publicKey === "---" ? "" : String(rawValue.publicKey),
        dataHash: rawValue.dataHash == null || rawValue.dataHash === "---" ? "" : String(rawValue.dataHash),
      };
    }

    const text = rawValue == null || rawValue === "---" ? "" : String(rawValue).trim();
    if (!text) return base;

    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return normalizeReservedInfo(parsed);
      }
    } catch {}

    return {
      ...base,
      swDataSignatureValue: text,
    };
  };

  const normalizeHeaderCollections = (file) => {
    if (!Array.isArray(file.canParams) || !file.canParams.length) {
      file.canParams = [createDefaultCanParam(file)];
    }
    if (!Array.isArray(file.ethParams) || !file.ethParams.length) {
      file.ethParams = [createDefaultEthParam(file)];
    }
    if (!Array.isArray(file.sas) || !file.sas.length) {
      file.sas = [createDefaultSaItem()];
    }
    const flash38InstallAddress =
      normalizeJsonText(file.flash38?.installAddress) ||
      normalizeJsonText(file.flash38?.files?.find((item) => item?.installAddress)?.installAddress);
    if (file.flash38 && Array.isArray(file.flash38.files)) {
      file.flash38.installAddress = flash38InstallAddress;
      file.flash38.files = file.flash38.files.map((item) => ({
        ...item,
        installAddress: normalizeJsonText(item?.installAddress) || flash38InstallAddress,
      }));
    }
    normalizeFlash34BlockSequence(file);
    file.ecuSwSignature = normalizeReservedInfo(file.ecuSwSignature);
    file.hutSshfsInfo = normalizeReservedInfo(file.hutSshfsInfo);
  };

  const isAscii = (value) => /^[\x20-\x7E]*$/.test(value || "");
  const isIpv4 = (value) => {
    if (!value) return false;
    const parts = value.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
  };
  const isHex = (value, maxBytes) => {
    if (!value) return false;
    const normalized = String(value).replace(/^0x/i, "");
    return /^[0-9A-Fa-f]+$/.test(normalized) && normalized.length <= maxBytes * 2;
  };

  const openModalSafe = (modalEl) => {
    if (!modalEl) return;
    if (typeof showModal === "function") {
      showModal(modalEl);
      return;
    }
    modalEl.classList.remove("is-hidden");
  };

  const closeModalSafe = (modalEl) => {
    if (!modalEl) return;
    if (typeof hideModal === "function") {
      hideModal(modalEl);
      return;
    }
    modalEl.classList.add("is-hidden");
  };

  const toast = (message) => {
    if (typeof showToast === "function") {
      showToast(message);
    }
  };

  const systemMessage = (message, type = "info") => {
    if (typeof pushSystemMessage === "function") {
      pushSystemMessage(message, type);
    }
    if (typeof addLog === "function") {
      addLog(message);
    }
  };

  const focusGbfWindow = () => {
    if (typeof setActiveWindow === "function") {
      setActiveWindow("gbf-convert");
    }
  };

  const normalizeFlashType = (file) => {
    const options = FLASH_OPTIONS[file.busType] || FLASH_OPTIONS.can;
    const validValues = options.map((item) => item.value);
    if (!validValues.includes(file.flashType)) {
      file.flashType = options[0].value;
    }
    if (isFlashFile38Service(file)) {
      file.otaEnabled = false;
    }
  };

  const validateFile = (file) => {
    const issues = [];
    if (!file.supplierCode || !isAscii(file.supplierCode) || file.supplierCode.length > 15) {
      issues.push("supplierCode 必须为 ASCII，且长度不超过 15 个字符");
    }
    if (!file.version.hwVersion || !isAscii(file.version.hwVersion)) {
      issues.push("硬件版本不能为空，且需为 ASCII 字符串");
    }
    if (!file.version.swVersion || !isAscii(file.version.swVersion)) {
      issues.push("软件版本不能为空，且需为 ASCII 字符串");
    }
    if (!file.version.baselineVersion) {
      issues.push("基线版本不能为空");
    }
    if (!file.sas.length) {
      issues.push("至少需要配置一组安全算法");
    }
    file.sas.forEach((item, index) => {
      if (!item.saLvl || !isHex(item.saLvl, 1)) {
        issues.push(`SA 第${index + 1}组等级需为 1 字节 HEX`);
      }
      const maskBytes = item.saType === "0" ? 4 : 16;
      if (!item.saMask || !isHex(item.saMask, maskBytes)) {
        issues.push(`SA 第${index + 1}组掩码需为 ${maskBytes} 字节 HEX`);
      }
    });

    if (!isFlashFile38Service(file) && file.otaEnabled && !file.otaFile) {
      issues.push("OTA Header 文件未上传");
    }

    if (file.busType === "ethernet") {
      file.ethParams.forEach((item, index) => {
        if (!item.ecuName) issues.push(`Ethernet 第${index + 1}组 ECU 名称不能为空`);
        if (!isHex(item.logicAddress, 4)) issues.push(`Ethernet 第${index + 1}组逻辑地址格式错误`);
        if (!isHex(item.funId, 4)) issues.push(`Ethernet 第${index + 1}组功能地址格式错误`);
        if (!isIpv4(item.ipAddress)) issues.push(`Ethernet 第${index + 1}组 IP 地址格式错误`);
      });
      if (isFlashFile38Service(file)) {
        file.flash38.files.forEach((item, index) => {
          if (!normalizeJsonText(item.installAddress)) {
            issues.push(`38 服务文件 ${index + 1} 安装路径不能为空`);
          }
        });
      } else if (file.flash34.blocks.some((item) => !item.startAddress || !item.length)) {
        issues.push("34 服务 Block 存在地址或长度未补录项");
      }
    } else {
      file.canParams.forEach((item, index) => {
        if (!item.ecuName) issues.push(`CAN 第${index + 1}组 ECU 名称不能为空`);
        if (!isHex(item.requestId, 4)) issues.push(`CAN 第${index + 1}组请求地址格式错误`);
        if (!isHex(item.responseId, 4)) issues.push(`CAN 第${index + 1}组响应地址格式错误`);
        if (item.logicAddress && !isHex(item.logicAddress, 4)) {
          issues.push(`CAN 第${index + 1}组 逻辑地址格式错误`);
        }
      });
      if (file.flash34.blocks.some((item) => !item.startAddress || !item.length)) {
        issues.push("34 服务 Block 存在地址或长度未补录项");
      }
    }
    return issues;
  };

  const setFileConfigured = (file, options = {}) => {
    const { preserveTerminalStatus = false } = options;
    if (file.ext === "gbf") {
      file.configured = true;
      file.status = "success";
      return [];
    }
    const issues = validateFile(file);
    if (issues.length > 0) {
      file.configured = false;
    }
    const preserveStatus =
      preserveTerminalStatus && ["running", "success", "error"].includes(file.status);
    if (!preserveStatus) {
      if (issues.length > 0) {
        file.status = "draft";
      } else if (file.configured) {
        file.status = "configured";
      } else {
        file.status = "draft";
      }
    }
    return issues;
  };

  const updateActionState = () => {
    const checkedFiles = state.files.filter((item) => state.checkedIds.has(item.id));
    const allGbf = checkedFiles.length > 0 && checkedFiles.every((item) => isGbfFile(item));
    const convertible = checkedFiles.some(
      (item) => item.ext !== "gbf" && item.configured && item.status === "configured"
    );
    const batchItems = getConvertBatchItems();
    const batchPercent = getConvertBatchPercent(batchItems);
    if (gbfListCount) gbfListCount.textContent = `${checkedFiles.length}/${getTopLevelFiles().length}`;
    if (gbfConvertButton) {
      gbfConvertButton.disabled = !convertible;
      gbfConvertButton.classList.toggle("is-disabled", !convertible);
    }
    if (gbfPackageButton) {
      gbfPackageButton.disabled = !allGbf;
      gbfPackageButton.classList.toggle("is-disabled", !allGbf);
    }
    if (gbfProgressButton) {
      gbfProgressButton.disabled = !batchItems.length;
      const value = gbfProgressButton.querySelector("strong");
      if (value) {
        value.textContent = batchItems.length ? `${batchPercent}%` : "";
      }
    }
  };

  const renderFileList = () => {
    if (!gbfFileListOriginal || !gbfFileListGbf) return;

    const renderFileRows = (parentId = "", depth = 0, filterFn = () => true) =>
      getChildFiles(parentId)
        .filter((file) => {
          if (isContainerFile(file.id)) {
            // For folders, only show if they have at least one matching non-container descendant
            const descendants = getDescendantFileIds(file.id);
            return descendants.some((id) => {
              const f = getFileById(id);
              return f && !isContainerFile(f.id) && filterFn(f);
            });
          }
          return filterFn(file);
        })
        .map((file) => {
          const childFiles = getChildFiles(file.id);
          const hasChildren = childFiles.length > 0;
          const expanded = hasChildren && isFileTreeExpanded(file.id);
          const checked = !hasChildren && state.checkedIds.has(file.id);
          const selected = !hasChildren && state.selectedFileId === file.id;
          const statusMeta = STATUS_META[file.status] || STATUS_META.draft;
          const hideListState = Boolean(file.hideListState || isGbfFile(file) || hasChildren);
          return `
            <div class="gbf-file-item ${selected ? "is-selected" : ""} ${depth > 0 ? "is-nested" : ""} ${hasChildren ? "has-children is-container" : ""}" data-file-id="${file.id}" style="--gbf-indent: ${depth * 18}px;">
              ${
                hasChildren
                  ? '<span class="gbf-file-check-placeholder" aria-hidden="true"></span>'
                  : `<button class="gbf-file-check ${checked ? "is-checked" : ""}" data-action="gbf-toggle-check" data-file-id="${file.id}" type="button" aria-pressed="${checked ? "true" : "false"}">
                      ${checked ? '<i class="fa-solid fa-check"></i>' : ""}
                    </button>`
              }
              ${
                hasChildren
                  ? `<button class="gbf-file-toggle ${expanded ? "is-open" : ""}" data-action="gbf-toggle-file-group" data-file-id="${file.id}" type="button" aria-label="${expanded ? "收起子文件" : "展开子文件"}" aria-expanded="${expanded ? "true" : "false"}">
                      <i class="fa-solid ${expanded ? "fa-chevron-down" : "fa-chevron-right"}"></i>
                    </button>`
                  : '<span class="gbf-file-toggle-placeholder" aria-hidden="true"></span>'
              }
              <div class="gbf-file-main" data-action="gbf-select-file" data-file-id="${file.id}">
                <div class="gbf-file-main__top">
                  <span class="gbf-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                </div>
              </div>
              <span class="gbf-file-state gbf-file-state--${escapeHtml(file.status)} ${hideListState ? "is-hidden" : ""}" title="${escapeHtml(statusMeta.label)}">
                ${renderStatusIcon(statusMeta, "gbf-file-state__icon")}
              </span>
            </div>
            ${expanded ? renderFileRows(file.id, depth + 1, filterFn) : ""}
          `;
        })
        .join("");

    gbfFileListOriginal.innerHTML = renderFileRows("", 0, (f) => f.ext !== "gbf");
    gbfFileListGbf.innerHTML = renderFileRows("", 0, (f) => f.ext === "gbf");
  };

  const canRemoveFile = (file) => Boolean(file && file.status !== "running");

  const canConvertFile = (file) =>
    Boolean(file && file.ext !== "gbf" && file.configured && file.status === "configured");

  const canPackageFile = (file) => Boolean(file && isGbfFile(file));

  const appendCopySuffix = (value) => {
    const text = String(value || "");
    return text.replace(/([^\\\/]+?)(\.[^.\\\/]+)?$/, (_, base, ext = "") => `${base}_copy${ext}`);
  };

  const closeFileContextMenu = () => {
    state.contextMenuFileId = "";
    gbfFileContextMenu.classList.remove("is-open");
    gbfFileContextMenu.style.removeProperty("left");
    gbfFileContextMenu.style.removeProperty("top");
  };

  const closeProgressPopover = () => {
    gbfProgressPopover.classList.remove("is-open");
    gbfProgressPopover.style.removeProperty("left");
    gbfProgressPopover.style.removeProperty("top");
  };

  const syncFileContextMenu = (fileId) => {
    const file = getFileById(fileId);
    state.contextMenuFileId = file?.id || "";

    const removeButton = gbfFileContextMenu.querySelector('[data-action="gbf-context-remove"]');
    const copyButton = gbfFileContextMenu.querySelector('[data-action="gbf-context-copy"]');
    const convertButton = gbfFileContextMenu.querySelector('[data-action="gbf-context-convert"]');
    const packageButton = gbfFileContextMenu.querySelector('[data-action="gbf-context-package"]');
    const multiEcuButton = gbfFileContextMenu.querySelector('[data-action="gbf-context-multi-ecu"]');
    const addToFlashButton = gbfFileContextMenu.querySelector('[data-action="gbf-context-add-to-flash"]');


    [removeButton, copyButton, convertButton, packageButton, multiEcuButton, addToFlashButton].forEach((button) => {

      if (!button) return;
      button.dataset.fileId = file?.id || "";
    });

    if (removeButton) removeButton.disabled = !canRemoveFile(file);
    if (copyButton) copyButton.disabled = !file;
    if (convertButton) convertButton.disabled = !canConvertFile(file);
    if (packageButton) packageButton.disabled = !canPackageFile(file);
    if (multiEcuButton) multiEcuButton.disabled = !canEnableMultiEcu(file);

    if (addToFlashButton) {
      if (!file) {
        addToFlashButton.disabled = true;
      } else if (isContainerFile(file.id)) {
        // If it's a folder, check if it contains any GBF files
        const descendants = getDescendantFileIds(file.id);
        addToFlashButton.disabled = !descendants.some(id => {
            const f = getFileById(id);
            return f && isGbfFile(f);
        });
      } else {
        addToFlashButton.disabled = !isGbfFile(file);
      }
    }
  };

  const openFileContextMenu = (fileId, clientX, clientY) => {
    closeProgressPopover();
    syncFileContextMenu(fileId);
    if (!state.contextMenuFileId) {
      closeFileContextMenu();
      return;
    }
    gbfFileContextMenu.classList.add("is-open");

    window.requestAnimationFrame(() => {
      const rect = gbfFileContextMenu.getBoundingClientRect();
      const left = Math.max(12, Math.min(clientX, window.innerWidth - rect.width - 12));
      const top = Math.max(12, Math.min(clientY, window.innerHeight - rect.height - 12));
      gbfFileContextMenu.style.left = `${left}px`;
      gbfFileContextMenu.style.top = `${top}px`;
    });
  };

  const renderConvertProgressPopover = () => {
    const batchItems = getConvertBatchItems();
    const batchPercent = getConvertBatchPercent(batchItems);
    const runningCount = batchItems.filter((item) => item.file.status === "running").length;
    const successCount = batchItems.filter((item) => item.file.status === "success").length;
    const failedCount = batchItems.filter((item) => item.file.status === "error").length;

    gbfProgressPopover.innerHTML = batchItems.length
      ? `
        <div class="gbf-progress-popover__head">
          <div class="gbf-progress-popover__title">整体进度</div>
          <div class="gbf-progress-popover__percent">${batchPercent}%</div>
        </div>
        <div class="gbf-progress-summary">
          <div class="gbf-progress-summary__pill">文件 ${batchItems.length}</div>
          <div class="gbf-progress-summary__pill">转化中 ${runningCount}</div>
          <div class="gbf-progress-summary__pill">成功 ${successCount}</div>
          <div class="gbf-progress-summary__pill">失败 ${failedCount}</div>
        </div>
        <div class="gbf-progress-board">
          ${batchItems
            .map((item) => {
              const file = item.file;
              const progress = clampProgress(file.progress);
              const statusMeta = STATUS_META[file.status] || STATUS_META.draft;
              return `
                <div class="gbf-progress-item">
                  <div class="gbf-progress-item__top">
                    <div>
                      <div class="gbf-progress-item__title">${escapeHtml(item.name)}</div>
                      <div class="gbf-progress-item__meta">${escapeHtml(file.summary || file.path || "")}</div>
                    </div>
                    <div class="gbf-progress-item__side">
                      <span class="gbf-status ${statusMeta.className}">
                        ${renderStatusIcon(statusMeta, "gbf-status__icon")}${statusMeta.label}
                      </span>
                      <span class="gbf-progress-item__percent">${progress}%</span>
                    </div>
                  </div>
                  <div class="gbf-progress-bar">
                    <div class="gbf-progress-bar__fill" style="width: ${progress}%"></div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `
      : `<div class="gbf-empty">本次尚未发起转化，执行转化后会在这里展示每个文件的进度。</div>`;
  };

  const openProgressPopover = (anchorEl) => {
    if (!anchorEl) return;
    closeFileContextMenu();
    renderConvertProgressPopover();
    gbfProgressPopover.classList.add("is-open");

    window.requestAnimationFrame(() => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const popoverRect = gbfProgressPopover.getBoundingClientRect();
      const left = Math.max(12, Math.min(anchorRect.right - popoverRect.width, window.innerWidth - popoverRect.width - 12));
      const top = Math.max(12, Math.min(anchorRect.top - popoverRect.height - 8, window.innerHeight - popoverRect.height - 12));
      gbfProgressPopover.style.left = `${left}px`;
      gbfProgressPopover.style.top = `${top}px`;
    });
  };

  const renderBusOptions = (currentValue) =>
    Object.entries(BUS_LABELS)
      .map(
        ([value, label]) =>
          `<option value="${value}" ${currentValue === value ? "selected" : ""}>${label}</option>`
      )
      .join("");

  const renderFlashOptions = (file) =>
    (FLASH_OPTIONS[file.busType] || [])
      .map(
        (item) =>
          `<option value="${item.value}" ${item.value === file.flashType ? "selected" : ""}>${item.label}</option>`
      )
      .join("");

  const renderSaRows = (file) =>
    file.sas
      .map(
        (item, index) => `
          <tr>
            <td>
              <select class="select" data-gbf-group="sas" data-index="${index}" data-field="saType">
                ${SA_TYPE_OPTIONS.map(
                  (option) =>
                    `<option value="${option.value}" ${option.value === item.saType ? "selected" : ""}>${option.label}</option>`
                ).join("")}
              </select>
            </td>
            <td><input class="input" value="${escapeHtml(
              item.saLvl
            )}" data-gbf-group="sas" data-index="${index}" data-field="saLvl" /></td>
            <td><input class="input" value="${escapeHtml(
              item.saMask
            )}" data-gbf-group="sas" data-index="${index}" data-field="saMask" /></td>
          </tr>
        `
      )
      .join("");

  const renderReadonlyCards = (file) => `
    <div class="gbf-readonly-grid">
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">gbfVersion</div><div class="gbf-readonly-item__value">${escapeHtml(file.gbfVersion)}</div></div>
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">gdtVersion</div><div class="gbf-readonly-item__value">${escapeHtml(file.gdtVersion)}</div></div>
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">supplierCode</div><div class="gbf-readonly-item__value">${escapeHtml(file.supplierCode || "---")}</div></div>
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">otaHeader.offset</div><div class="gbf-readonly-item__value">${escapeHtml(file.readonly.otaOffset)}</div></div>
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">otaHeader.length</div><div class="gbf-readonly-item__value">${escapeHtml(file.readonly.otaLength)}</div></div>
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">otaHeader.checkSum</div><div class="gbf-readonly-item__value">${escapeHtml(file.readonly.otaChecksum)}</div></div>
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">dataContent.offset</div><div class="gbf-readonly-item__value">${escapeHtml(file.readonly.dataOffset)}</div></div>
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">dataContent.length</div><div class="gbf-readonly-item__value">${escapeHtml(file.readonly.dataLength)}</div></div>
      <div class="gbf-readonly-item"><div class="gbf-readonly-item__label">dataContent.checkSum</div><div class="gbf-readonly-item__value">${escapeHtml(file.readonly.dataChecksum)}</div></div>
    </div>
  `;

  const renderTreeItems = (items) =>
    (items || [])
      .map(
        (item) =>
          `<div class="gbf-tree-item ${item.child ? "is-child" : ""}">${escapeHtml(item.text || "")}</div>`
      )
      .join("");

  const GBF_BUS_TYPE_CODES = {
    can: 1,
    canfd: 2,
    ethernet: 3,
  };

  const GBF_BUS_TYPE_VALUES = {
    1: "can",
    2: "canfd",
    3: "ethernet",
  };

  const normalizeJsonText = (value) => (value == null || value === "---" ? "" : String(value));

  const normalizeJsonNumber = (value, fallback = 0) => {
    const numeric = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const getFlashTypeCode = (file) => FLASH_TYPE_CODES[file?.flashType] || 0;

  const isFlashFile38Service = (file) => getFlashTypeCode(file) === 2;

  const buildSignatureJson = (rawValue) => {
    return normalizeReservedInfo(rawValue);
  };

  const serializeSignatureJson = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const normalized = {
      swDataSignatureAlgorithm: normalizeJsonText(value.swDataSignatureAlgorithm),
      swDataSignatureValue: normalizeJsonText(value.swDataSignatureValue),
      publicKey: normalizeJsonText(value.publicKey),
      dataHash: normalizeJsonText(value.dataHash),
    };
    return Object.values(normalized).some(Boolean) ? JSON.stringify(normalized, null, 2) : "";
  };

  const buildGbfHeaderText = (file) => {
    const head = {
      gbfVersion: normalizeJsonText(file.gbfVersion),
      gdtVersion: normalizeJsonText(file.gdtVersion),
      busType: GBF_BUS_TYPE_CODES[file.busType] || 0,
      flashType: getFlashTypeCode(file),
      supplierCode: normalizeJsonText(file.supplierCode),
    };

    if (file.busType === "ethernet") {
      head.ecuEthComParams = (file.ethParams || []).map((item) => ({
        ecuName: normalizeJsonText(item.ecuName),
        logicAddress: normalizeJsonText(item.logicAddress),
        funId: normalizeJsonText(item.funId),
        ipAddress: normalizeJsonText(item.ipAddress),
      }));
    } else {
      head.ecuCanComParams = (file.canParams || []).map((item) => ({
        ecuName: normalizeJsonText(item.ecuName),
        requestId: normalizeJsonText(item.requestId),
        responseId: normalizeJsonText(item.responseId),
        logicAddress: normalizeJsonText(item.logicAddress),
        funId: normalizeJsonText(item.funId),
      }));
    }

    head.ecuVersion = {
      hwVersion: normalizeJsonText(file.version?.hwVersion),
      swVersion: normalizeJsonText(file.version?.swVersion),
      baselineVersion: normalizeJsonText(file.version?.baselineVersion),
    };

    head.dataContent = {
      gbfDataOffset: normalizeJsonText(file.readonly?.dataOffset),
      length: normalizeJsonText(file.readonly?.dataLength),
      checkSum: normalizeJsonText(file.readonly?.dataChecksum),
    };

    head.sas = (file.sas || []).map((item) => ({
      saType: normalizeJsonNumber(item.saType),
      saLvl: normalizeJsonText(item.saLvl),
      saMask: normalizeJsonText(item.saMask),
    }));

    if (isFlashFile38Service(file)) {
      const installAddress = normalizeJsonText(file.flash38?.installAddress);
      head.flashFile38s = (file.flash38?.files || []).map((item) => ({
        filePathAndName: normalizeJsonText(item.filePathAndName || `${installAddress}${item.fileName || ""}`),
        installAddress,
        fileName: normalizeJsonText(item.fileName),
        dataType: normalizeJsonText(item.dataType),
        fileSizeUnzip: normalizeJsonText(item.fileSizeUnzip),
        fileSizeZip: normalizeJsonText(item.fileSizeZip),
        fileHash: normalizeJsonText(item.fileHash),
        md5: normalizeJsonText(item.md5 || ""),
      }));
    } else {
      head.otaHeader = {
        gbfOtaOffset: normalizeJsonText(file.readonly?.otaOffset),
        length: normalizeJsonText(file.readonly?.otaLength),
        checkSum: normalizeJsonText(file.readonly?.otaChecksum),
      };
      head.flashData34 = {
        swType: normalizeJsonNumber(file.flash34?.swType),
        dataType: normalizeJsonText(file.flash34?.dataType),
        blocks: (file.flash34?.blocks || []).map((item, index) => ({
          dataType: normalizeJsonNumber(item.blockDataType),
          fileIndex: normalizeJsonNumber(item.fileIndex, index),
          gbfBlockOffset: normalizeJsonText(item.gbfBlockOffset),
          startAddress: normalizeJsonText(item.startAddress),
          length: normalizeJsonText(item.length),
          checkSum: normalizeJsonText(item.checkSum),
        })),
      };
    }

    head.ecuSwSignature = buildSignatureJson(file.ecuSwSignature);
    head.hutSshfsInfo = buildSignatureJson(file.hutSshfsInfo);

    return JSON.stringify({ head }, null, 2);
  };

  const buildHexDump = (seed) => {
    let value = 2166136261;
    Array.from(String(seed || "gdt")).forEach((char) => {
      value ^= char.charCodeAt(0);
      value = Math.imul(value, 16777619) >>> 0;
    });

    const rows = [];
    for (let row = 0; row < 23; row += 1) {
      const bytes = [];
      for (let col = 0; col < 16; col += 1) {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        const byte = value & 0xff;
        bytes.push(byte.toString(16).toUpperCase().padStart(2, "0"));
      }
      rows.push(`${(row * 16).toString(16).toUpperCase().padStart(4, "0")} : ${bytes.join(" ")}`);
    }
    return rows.join("\n");
  };

  const getGbfNodeDisplayText = (file, node) => {
    if (!node) return "";
    if (node.kind === "header") {
      return buildGbfHeaderText(file);
    }
    if (node.kind === "hex") {
      return buildHexDump(node.seed);
    }
    if (node.kind === "object") {
      return JSON.stringify(node.content || {}, null, 2);
    }
    if (node.kind === "value") {
      return `${node.valueLabel} = ${node.value || "---"};`;
    }
    return "";
  };

  const updateGbfDerivedTrees = (file) => {
    const nextTree = buildResultTree(file);
    file.resultTree = nextTree;
    if (isGbfFile(file)) {
      file.sourceTree = nextTree;
    }
  };

  const buildGbfDataNodes = (file) => {
    const nodes = [{ id: "header", label: "Header", kind: "header" }];

    if (isFlashFile38Service(file)) {
      const item = file.flash38.files?.[0] || {
        installAddress: file.flash38?.installAddress || "---",
        fileName: file.outputPath?.split("\\").pop() || "payload.bin",
        dataType: "0x00",
        fileSizeUnzip: file.readonly.dataLength || "---",
        fileSizeZip: file.readonly.dataLength || "---",
        fileHash: file.readonly.dataChecksum || "---",
      };

      nodes.push({
        id: "flash-file-38",
        label: "flashFile38s",
        kind: "object",
        content: {
          installAddress: normalizeJsonText(item.installAddress || file.flash38?.installAddress),
          fileName: normalizeJsonText(item.fileName),
          dataType: normalizeJsonText(item.dataType),
          fileSizeUnzip: normalizeJsonText(item.fileSizeUnzip),
          fileSizeZip: normalizeJsonText(item.fileSizeZip),
          fileHash: normalizeJsonText(item.fileHash || file.readonly.dataChecksum),
        },
      });
      return nodes;
    }

    nodes.push({
      id: "ota-header",
      label: "OtaHeader",
      kind: "object",
      content: {
        gbfOtaOffset: normalizeJsonText(file.readonly?.otaOffset),
        length: normalizeJsonText(file.readonly?.otaLength),
        checkSum: normalizeJsonText(file.readonly?.otaChecksum),
      },
      children: [
        {
          id: "ota-header-data",
          label: "Data",
          kind: "hex",
          seed: `${file.id}-ota-header-data`,
        },
      ],
    });

    const blocks = file.flash34.blocks?.length
      ? file.flash34.blocks
      : [
          {
            startAddress: "0xFF000000",
            length: file.readonly.dataLength || "---",
            checkSum: file.readonly.dataChecksum || "---",
          },
        ];

    blocks.forEach((item, index) => {
      const blockId = `block-${index}`;
      nodes.push({
        id: blockId,
        label: getFlash34BlockTitle(item, index),
        kind: "object",
        content: {
          dataType: normalizeJsonNumber(item.blockDataType),
          fileIndex: normalizeJsonNumber(item.fileIndex, index),
          gbfBlockOffset: normalizeJsonText(item.gbfBlockOffset),
          startAddress: normalizeJsonText(item.startAddress),
          length: normalizeJsonText(item.length),
          checkSum: normalizeJsonText(item.checkSum || file.readonly.dataChecksum),
        },
        children: [
          {
            id: `${blockId}-data`,
            label: "Data",
            kind: "hex",
            seed: `${file.id}-${blockId}-data`,
          },
        ],
      });
    });

    return nodes;
  };

  const flattenGbfDataNodes = (nodes, bucket = []) => {
    nodes.forEach((node) => {
      bucket.push(node);
      if (node.children?.length) {
        flattenGbfDataNodes(node.children, bucket);
      }
    });
    return bucket;
  };

  const ensureGbfDataExpandedState = (file, nodes) => {
    const expandedState = state.gbfDataExpanded[file.id] || {};
    const visit = (items) => {
      items.forEach((node) => {
        if (node.children?.length && !(node.id in expandedState)) {
          expandedState[node.id] = true;
        }
        if (node.children?.length) {
          visit(node.children);
        }
      });
    };
    visit(nodes);
    state.gbfDataExpanded[file.id] = expandedState;
    return expandedState;
  };

  const renderGbfDataTree = (nodes, selectedId, expandedState, depth = 0) =>
    nodes
      .map((node) => {
        const hasChildren = Boolean(node.children?.length);
        const expanded = !hasChildren || expandedState[node.id] !== false;
        return `
          <div class="gbf-data-tree__group">
            <div class="gbf-data-tree__row" style="--gbf-tree-depth:${depth}">
              ${
                hasChildren
                  ? `
                    <button
                      class="gbf-data-tree__toggle"
                      type="button"
                      data-action="gbf-toggle-data-group"
                      data-node-id="${escapeHtml(node.id)}"
                      aria-label="${expanded ? "收起" : "展开"}"
                    >
                      <i class="fa-regular ${expanded ? "fa-square-minus" : "fa-square-plus"}"></i>
                    </button>
                  `
                  : '<span class="gbf-data-tree__spacer"></span>'
              }
              <button
                class="gbf-data-tree__item ${node.id === selectedId ? "is-selected" : ""} ${hasChildren ? "is-parent" : ""}"
                type="button"
                data-action="gbf-select-data-node"
                data-node-id="${escapeHtml(node.id)}"
              >
                ${
                  hasChildren
                    ? ""
                    : `
                      <span class="gbf-data-tree__marker">
                        <i class="fa-regular fa-file-code"></i>
                      </span>
                    `
                }
                <span class="gbf-data-tree__label">${escapeHtml(node.label)}</span>
              </button>
            </div>
            ${
              hasChildren
                ? `
                  <div class="gbf-data-tree__children ${expanded ? "" : "is-collapsed"}">
                    ${expanded ? renderGbfDataTree(node.children, selectedId, expandedState, depth + 1) : ""}
                  </div>
                `
                : ""
            }
          </div>
        `;
      })
      .join("");

  const renderGbfDataContent = (file, node) => {
    if (!node) {
      return `<div class="gbf-empty">当前节点暂无可展示内容。</div>`;
    }
    const text = getGbfNodeDisplayText(file, node);
    if (!text) {
      return `<div class="gbf-empty">当前节点暂无可展示内容。</div>`;
    }
    return `<pre class="gbf-data-content__pre ${node.kind === "hex" ? "gbf-data-content__pre--hex" : ""}">${escapeHtml(text)}</pre>`;
  };

  const renderGbfDataPanel = () => {
    if (!gbfPanelBinary) return;
    const file = getSelectedFile();
    if (!isGbfFile(file)) {
      gbfPanelBinary.innerHTML = `
        <div class="gbf-config-sheet__title">.gbf 文件数据</div>
        <div class="gbf-empty">当前文件尚未生成 .gbf，转化成功后才可查看 .gbf 文件数据。</div>
      `;
      return;
    }
    const nodes = buildGbfDataNodes(file);
    const expandedState = ensureGbfDataExpandedState(file, nodes);
    const flatNodes = flattenGbfDataNodes(nodes);
    const selectedId =
      state.gbfDataSelection[file.id] && flatNodes.some((item) => item.id === state.gbfDataSelection[file.id])
        ? state.gbfDataSelection[file.id]
        : nodes[0]?.id || "";
    state.gbfDataSelection[file.id] = selectedId;
    const selectedNode = flatNodes.find((item) => item.id === selectedId) || nodes[0];

    gbfPanelBinary.innerHTML = `
      <div class="gbf-data-panel__head">
        <div class="gbf-config-sheet__title">.gbf 文件数据</div>
        <div class="gbf-pane__hint">只读预览</div>
      </div>
      <div class="gbf-data-viewer">
        <div class="gbf-data-tree">
          ${renderGbfDataTree(nodes, selectedId, expandedState)}
        </div>
        <div class="gbf-data-content">
          ${renderGbfDataContent(file, selectedNode)}
        </div>
      </div>
    `;
  };

  const syncDetailPanels = () => {
    const file = getSelectedFile();
    const showGbfData = isGbfFile(file);
    gbfPanelHeader?.classList.toggle("is-hidden", showGbfData);
    gbfPanelBinary?.classList.toggle("is-hidden", !showGbfData);
  };

  const renderEmptyWorkspace = () => {
    if (gbfFileListOriginal) {
      gbfFileListOriginal.innerHTML = `<div class="gbf-empty">列表暂时为空</div>`;
    }
    if (gbfFileListGbf) {
      gbfFileListGbf.innerHTML = `<div class="gbf-empty">列表暂时为空</div>`;
    }
    if (gbfPanelHeader) {
      gbfPanelHeader.innerHTML = `
        <div class="gbf-config-sheet__title">字段配置</div>
        <div class="gbf-empty">暂无可配置文件，请先在左侧导入 ZIP 或文件夹。</div>
      `;
    }
    if (gbfPanelBinary) {
      gbfPanelBinary.innerHTML = `
        <div class="gbf-config-sheet__title">.gbf 文件数据</div>
        <div class="gbf-empty">暂无 .gbf 文件可预览。</div>
      `;
    }
    if (gbfPanelStructure) {
      gbfPanelStructure.innerHTML = `<div class="gbf-empty">暂无结构数据。</div>`;
    }
    if (gbfPanelResult) {
      gbfPanelResult.innerHTML = `<div class="gbf-empty">暂无转化结果。</div>`;
    }
    if (gbfProgressPopover.classList.contains("is-open")) {
      renderConvertProgressPopover();
    }
    renderSyncResults();
    renderPackageTree();
    applyMainLayout();
    syncDetailPanels();
    panelVisibility();
    syncTabVisibility();
    updateActionState();
  };

  const renderValidationItems = (items, isError = false) => {
    const rows = (items || []).length ? items : ["当前无校验问题"];
    return `
      <div class="gbf-validation-list">
        ${rows
          .map(
            (item) =>
              `<div class="gbf-validation-item ${isError ? "is-error" : ""}">${escapeHtml(item)}</div>`
          )
          .join("")}
      </div>
    `;
  };

  const renderCommSection = (file) => {
    const canEdit = file.ext !== "gbf";
    const disabled = canEdit ? "" : "disabled";
    const readonly = canEdit ? "" : "readonly";

    if (file.busType === "ethernet") {
      const item = file.ethParams[0] || {
        ecuName: "",
        logicAddress: "",
        funId: "",
        ipAddress: "",
      };
      return `
        <div class="gbf-comm-list">
          <div class="gbf-form-grid">
            <div class="field">
              <label>ECU名称</label>
              <input class="input" value="${escapeHtml(item.ecuName)}" data-gbf-group="ethParams" data-index="0" data-field="ecuName" ${readonly} />
              <div class="field__hint">ecuEthComParam.ecuName</div>
            </div>
            <div class="field">
              <label>逻辑地址</label>
              <input class="input" value="${escapeHtml(
                item.logicAddress
              )}" data-gbf-group="ethParams" data-index="0" data-field="logicAddress" ${readonly} />
              <div class="field__hint">4字节 HEX</div>
            </div>
            <div class="field">
              <label>功能地址</label>
              <input class="input" value="${escapeHtml(
                item.funId
              )}" data-gbf-group="ethParams" data-index="0" data-field="funId" ${readonly} />
              <div class="field__hint">4字节 HEX</div>
            </div>
            <div class="field">
              <label>默认IP</label>
              <input class="input" value="${escapeHtml(
                item.ipAddress
              )}" data-gbf-group="ethParams" data-index="0" data-field="ipAddress" ${readonly} />
              <div class="field__hint">IPv4，映射 ecuEthComParam.ipAddress</div>
            </div>
          </div>
          <div class="field__hint">Ethernet 场景重点展示 ecuEthComParam、installAddress 与 38 服务文件列表。</div>
        </div>
      `;
    }

    const item = file.canParams[0] || {
      ecuName: "",
      requestId: "",
      responseId: "",
      logicAddress: "",
      funId: "",
    };
    return `
      <div class="gbf-comm-list">
        <div class="gbf-form-grid">
          <div class="field">
            <label>ECU名称</label>
            <input class="input" value="${escapeHtml(item.ecuName)}" data-gbf-group="canParams" data-index="0" data-field="ecuName" ${readonly} />
            <div class="field__hint">ecuCanComParams.ecuName</div>
          </div>
          <div class="field">
            <label>请求ID</label>
            <input class="input" value="${escapeHtml(
              item.requestId
            )}" data-gbf-group="canParams" data-index="0" data-field="requestId" ${readonly} />
            <div class="field__hint">udsReqID，4字节 HEX</div>
          </div>
          <div class="field">
            <label>响应ID</label>
            <input class="input" value="${escapeHtml(
              item.responseId
            )}" data-gbf-group="canParams" data-index="0" data-field="responseId" ${readonly} />
            <div class="field__hint">udsRespID，4字节 HEX</div>
          </div>
          <div class="field">
            <label>逻辑地址</label>
            <input class="input" value="${escapeHtml(
              item.logicAddress
            )}" data-gbf-group="canParams" data-index="0" data-field="logicAddress" ${readonly} />
            <div class="field__hint">logicAddress，4字节 HEX</div>
          </div>
          <div class="field">
            <label>功能ID</label>
            <input class="input" value="${escapeHtml(
              item.funId
            )}" data-gbf-group="canParams" data-index="0" data-field="funId" ${readonly} />
            <div class="field__hint">funId，4字节 HEX</div>
          </div>
        </div>
        <div class="field__hint">CAN / CANFD 场景展示 ecuCanComParams，34 服务 Block 信息在“结构解析”中查看。</div>
      </div>
    `;
  };

  const renderEnumOptions = (options, currentValue) =>
    options
      .map(
        (item) =>
          `<option value="${item.value}" ${String(item.value) === String(currentValue) ? "selected" : ""}>${item.label}</option>`
      )
      .join("");

  const renderSnapshotInput = (value, attrs, canEdit) =>
    `<div class="gbf-cell-control"><input class="input" value="${escapeHtml(value ?? "")}" ${attrs} ${
      canEdit ? "" : "readonly"
    } /></div>`;

  const renderSnapshotSelect = (optionsHtml, attrs, canEdit) =>
    `<div class="gbf-cell-control"><select class="select" ${attrs} ${canEdit ? "" : "disabled"}>${optionsHtml}</select></div>`;

  const renderSnapshotStatic = (value) =>
    `<div class="gbf-cell-static">${escapeHtml(value == null || value === "" ? "---" : String(value))}</div>`;

  const renderSnapshotUpload = (value, field, canEdit, action) => `
    <div class="gbf-cell-control gbf-cell-control--upload">
      <input class="input" value="${escapeHtml(value ?? "")}" data-gbf-field="${escapeHtml(field)}" ${
        canEdit ? "" : "readonly"
      } />
      <button class="btn btn--ghost btn--sm" type="button" data-action="${escapeHtml(action)}" ${
        canEdit ? "" : "disabled"
      }>
        上传文件
      </button>
    </div>
  `;

  const renderSnapshotSectionRow = (title) => `
    <tr class="gbf-table-section">
      <td colspan="3">${escapeHtml(title)}</td>
    </tr>
  `;

  const renderHeaderField = (label, path, control, note = "") => `
    <div class="field gbf-config-entry">
      <label>${escapeHtml(label)}<span class="gbf-config-entry__path">(${escapeHtml(
        getFieldDisplayName(path)
      )})</span></label>
      ${control}
      <div class="field__hint">
        <span>${escapeHtml(getFieldDisplayName(path))}</span>
      </div>
    </div>
  `;

  const renderHeaderSection = (key, title, hint, bodyHtml, badge = "") => `
    <section class="gbf-config-block ${state.headerSections[key] ? "is-collapsed" : ""}">
      <button
        class="gbf-config-block__head"
        type="button"
        data-action="gbf-toggle-header-section"
        data-section="${escapeHtml(key)}"
      >
        <div class="gbf-config-block__title-wrap">
          <div class="gbf-config-block__title">${escapeHtml(title)}</div>
          ${hint ? `<div class="gbf-config-block__hint">${escapeHtml(hint)}</div>` : ""}
        </div>
        <div class="gbf-config-block__meta">
          ${badge ? `<span class="gbf-config-block__badge">${escapeHtml(badge)}</span>` : ""}
          <i class="fa-solid fa-chevron-down gbf-config-block__chevron"></i>
        </div>
      </button>
      <div class="gbf-config-block__body">
        ${bodyHtml}
      </div>
    </section>
  `;

  const renderHeaderPanel = () => {
    if (!gbfPanelHeader) return;
    const file = getSelectedFile();
    normalizeHeaderCollections(file);
    const canEdit = file.ext !== "gbf";
    const issues = file.ext === "gbf" ? [] : validateFile(file);
    const canToggleConfigured = file.ext !== "gbf" && issues.length === 0;
    const statusMeta = STATUS_META[file.status] || STATUS_META.draft;
    const commGroupKey = file.busType === "ethernet" ? "ethParams" : "canParams";
    const commItems = file.busType === "ethernet" ? file.ethParams : file.canParams;
    const progress = Math.max(0, Math.min(file.ext === "gbf" ? 100 : file.progress || 0, 100));

    const basicSection = renderHeaderSection(
      "basic",
      "基础信息",
      "基础头字段与刷写方式",
      `
        <div class="gbf-config-grid">
          ${renderHeaderField("GBF版本", "gbfVersion", renderSnapshotStatic(file.gbfVersion), "工具自动填写")}
          ${renderHeaderField("工具版本", "gdtVersion", renderSnapshotStatic(file.gdtVersion), "工具自动填写")}
          ${renderHeaderField(
            "总线类型",
            "busType",
            renderSnapshotSelect(renderBusOptions(file.busType), 'data-gbf-field="busType"', canEdit),
            "1 CAN / 2 CANFD / 3 Ethernet"
          )}
          ${renderHeaderField(
            "刷写类型",
            "flashType",
            renderSnapshotSelect(renderFlashOptions(file), 'data-gbf-field="flashType"', canEdit),
            "与总线类型联动"
          )}
          ${renderHeaderField(
            "供应商编码",
            "supplierCode",
            renderSnapshotInput(file.supplierCode, 'data-gbf-field="supplierCode"', canEdit),
            "ASCII，最长 15 个字符"
          )}
        </div>
      `
    );

    const commSection = renderHeaderSection(
      "comm",
      "ECU通讯参数",
      `当前总线：${BUS_LABELS[file.busType] || file.busType}`,
      `
        <div class="gbf-config-toolbar">
          <div class="gbf-config-toolbar__hint">支持维护多个 ECU 通讯参数项</div>
          ${
            canEdit
              ? `<button class="btn btn--ghost btn--sm" type="button" data-action="gbf-add-group" data-group="${commGroupKey}">新增ECU</button>`
              : ""
          }
        </div>
        <div class="gbf-config-list">
          ${commItems
            .map((item, index) => {
              const itemTitle = `ECU ${index + 1}`;
              const removeDisabled = !canEdit || commItems.length === 1;
              const fieldsHtml =
                file.busType === "ethernet"
                  ? `
                    <div class="gbf-config-grid">
                      ${renderHeaderField(
                        "ECU名称",
                        `ecuEthComParam[${index}].ecuName`,
                        renderSnapshotInput(item.ecuName, `data-gbf-group="ethParams" data-index="${index}" data-field="ecuName"`, canEdit),
                        "最长 32 个字符"
                      )}
                      ${renderHeaderField(
                        "逻辑地址",
                        `ecuEthComParam[${index}].logicAddress`,
                        renderSnapshotInput(item.logicAddress, `data-gbf-group="ethParams" data-index="${index}" data-field="logicAddress"`, canEdit),
                        "4 字节 HEX"
                      )}
                      ${renderHeaderField(
                        "功能地址",
                        `ecuEthComParam[${index}].funId`,
                        renderSnapshotInput(item.funId, `data-gbf-group="ethParams" data-index="${index}" data-field="funId"`, canEdit),
                        "默认 E400"
                      )}
                      ${renderHeaderField(
                        "默认IP",
                        `ecuEthComParam[${index}].ipAddress`,
                        renderSnapshotInput(item.ipAddress, `data-gbf-group="ethParams" data-index="${index}" data-field="ipAddress"`, canEdit),
                        "IPv4 地址"
                      )}
                    </div>
                  `
                  : `
                    <div class="gbf-config-grid gbf-config-grid--wide">
                      ${renderHeaderField(
                        "ECU名称",
                        `ecuCanComParams[${index}].ecuName`,
                        renderSnapshotInput(item.ecuName, `data-gbf-group="canParams" data-index="${index}" data-field="ecuName"`, canEdit),
                        "最长 32 个字符"
                      )}
                      ${renderHeaderField(
                        "请求ID",
                        `ecuCanComParams[${index}].requestId`,
                        renderSnapshotInput(item.requestId, `data-gbf-group="canParams" data-index="${index}" data-field="requestId"`, canEdit),
                        "4 字节 HEX"
                      )}
                      ${renderHeaderField(
                        "响应ID",
                        `ecuCanComParams[${index}].responseId`,
                        renderSnapshotInput(item.responseId, `data-gbf-group="canParams" data-index="${index}" data-field="responseId"`, canEdit),
                        "4 字节 HEX"
                      )}
                      ${renderHeaderField(
                        "逻辑地址",
                        `ecuCanComParams[${index}].logicAddress`,
                        renderSnapshotInput(
                          item.logicAddress,
                          `data-gbf-group="canParams" data-index="${index}" data-field="logicAddress"`,
                          canEdit
                        ),
                        "4 字节 HEX"
                      )}
                      ${renderHeaderField(
                        "功能ID",
                        `ecuCanComParams[${index}].funId`,
                        renderSnapshotInput(item.funId, `data-gbf-group="canParams" data-index="${index}" data-field="funId"`, canEdit),
                        "默认 0x7DF"
                      )}
                    </div>
                  `;
              return `
                <div class="gbf-config-list-item">
                  <div class="gbf-config-list-item__head">
                    <div class="gbf-config-list-item__title">${itemTitle}</div>
                    ${
                      canEdit
                        ? `<button class="btn btn--ghost btn--sm" type="button" data-action="gbf-remove-group" data-group="${commGroupKey}" data-index="${index}" ${
                            removeDisabled ? "disabled" : ""
                          }>删除</button>`
                        : ""
                    }
                  </div>
                  ${fieldsHtml}
                </div>
              `;
            })
            .join("")}
        </div>
      `,
      `${commItems.length} 个ECU`
    );

    const versionSection = renderHeaderSection(
      "version",
      "ECU版本信息",
      "版本信息字段",
      `
        <div class="gbf-config-grid">
          ${renderHeaderField(
            "硬件版本",
            "ecuVersion.hwVersion",
            renderSnapshotInput(file.version.hwVersion, 'data-gbf-field="version.hwVersion"', canEdit),
            "ASCII"
          )}
          ${renderHeaderField(
            "软件版本",
            "ecuVersion.swVersion",
            renderSnapshotInput(file.version.swVersion, 'data-gbf-field="version.swVersion"', canEdit),
            "ASCII"
          )}
          ${renderHeaderField(
            "基线版本",
            "ecuVersion.baselineVersion",
            renderSnapshotInput(file.version.baselineVersion, 'data-gbf-field="version.baselineVersion"', canEdit),
            "基础版本号"
          )}
        </div>
      `
    );

    const saSection = renderHeaderSection(
      "sa",
      "SA算法信息",
      "支持维护多组 SA 参数",
      `
        <div class="gbf-config-toolbar">
          <div class="gbf-config-toolbar__hint">每组算法独立维护类型、等级和掩码</div>
          ${
            canEdit
              ? `<button class="btn btn--ghost btn--sm" type="button" data-action="gbf-add-group" data-group="sas">新增算法</button>`
              : ""
          }
        </div>
        <div class="gbf-config-list">
          ${file.sas
            .map((item, index) => {
              const removeDisabled = !canEdit || file.sas.length === 1;
              return `
                <div class="gbf-config-list-item">
                  <div class="gbf-config-list-item__head">
                    <div class="gbf-config-list-item__title">算法 ${index + 1}</div>
                    ${
                      canEdit
                        ? `<button class="btn btn--ghost btn--sm" type="button" data-action="gbf-remove-group" data-group="sas" data-index="${index}" ${
                            removeDisabled ? "disabled" : ""
                          }>删除</button>`
                        : ""
                    }
                  </div>
                  <div class="gbf-config-grid">
                    ${renderHeaderField(
                      "算法类型",
                      `sas[${index}].saType`,
                      renderSnapshotSelect(
                        renderEnumOptions(SA_TYPE_OPTIONS, item.saType),
                        `data-gbf-group="sas" data-index="${index}" data-field="saType"`,
                        canEdit
                      ),
                      "0 4字节 / 1 16字节默认 / 2 16字节增强"
                    )}
                    ${renderHeaderField(
                      "安全等级",
                      `sas[${index}].saLvl`,
                      renderSnapshotInput(item.saLvl, `data-gbf-group="sas" data-index="${index}" data-field="saLvl"`, canEdit),
                      "1 字节 HEX"
                    )}
                    ${renderHeaderField(
                      "掩码",
                      `sas[${index}].saMask`,
                      renderSnapshotInput(item.saMask, `data-gbf-group="sas" data-index="${index}" data-field="saMask"`, canEdit),
                      item.saType === "0" ? "4 字节 HEX" : "16 字节 HEX"
                    )}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `,
      `${file.sas.length} 组`
    );

    const otaSection =
      !isFlashFile38Service(file)
        ? renderHeaderSection(
            "ota",
            "OTA Header",
            "上传原始文件后自动回填只读字段",
            `
              <div class="gbf-config-grid">
                ${renderHeaderField(
                  "原始文件",
                  "otaHeader.fileName",
                  renderSnapshotUpload(file.otaFile, "otaFile", canEdit, "gbf-upload-ota-file"),
                  "上传后自动计算 offset / length / checkSum"
                )}
              </div>
            `
          )
        : "";

    const flash38Confirmed = !!file.flash38.confirmed;
    const flash38GeneratedFiles = flash38Confirmed ? (file.flash38.files || []) : [];
    const flash38InputInstallAddr = file.flash38.inputInstallAddress ?? file.flash38.installAddress ?? "/opt/gwm/zcu/";
    const flash38InputFileName = file.flash38.inputFileName ?? file.name ?? "";

    const flashSection =
      isFlashFile38Service(file)
        ? renderHeaderSection(
            "flash",
            "flashFile38s",
            "38 服务文件清单",
            `
              <div class="gbf-config-list">
                <div class="gbf-config-list-item">
                  <div class="gbf-config-list-item__head">
                    <div class="gbf-config-list-item__title">配置文件信息</div>
                    ${canEdit ? `
                      <button class="btn btn--primary btn--sm" type="button" data-action="gbf-flash38-confirm">
                        <i class="fa-solid fa-check" style="margin-right:4px;"></i>确认
                      </button>
                    ` : ""}
                  </div>
                  <div class="gbf-config-grid">
                    ${renderHeaderField(
                      "安装路径",
                      "flashFile38s.installAddress",
                      renderSnapshotInput(
                        flash38InputInstallAddr,
                        'data-gbf-field="flash38.inputInstallAddress"',
                        canEdit
                      ),
                      "38 服务安装路径，如 /opt/gwm/zcu/"
                    )}
                    ${renderHeaderField(
                      "原文件名",
                      "flashFile38s.fileName",
                      renderSnapshotInput(
                        flash38InputFileName,
                        'data-gbf-field="flash38.inputFileName"',
                        canEdit
                      ),
                      "原始压缩包文件名"
                    )}
                  </div>
                </div>
                ${flash38GeneratedFiles.length ? flash38GeneratedFiles.map((item, idx) => `
                  <div class="gbf-config-list-item">
                    <div class="gbf-config-list-item__head">
                      <div class="gbf-config-list-item__title">File ${idx + 1}</div>
                    </div>
                    <div class="gbf-config-grid gbf-config-grid--wide">
                      ${renderHeaderField("filePathAndName", `flashFile38s[${idx}].filePathAndName`, renderSnapshotStatic(item.filePathAndName || ""), "安装路径+文件名")}
                      ${renderHeaderField("fileName", `flashFile38s[${idx}].fileName`, renderSnapshotStatic(item.fileName), "原文件名")}
                      ${renderHeaderField("dataType", `flashFile38s[${idx}].dataType`, renderSnapshotStatic(item.dataType), "当前固定 0x00")}
                      ${renderHeaderField("fileSizeUnzip", `flashFile38s[${idx}].fileSizeUnzip`, renderSnapshotStatic(item.fileSizeUnzip), "未压缩大小 8字节 HEX")}
                      ${renderHeaderField("fileSizeZip", `flashFile38s[${idx}].fileSizeZip`, renderSnapshotStatic(item.fileSizeZip), "压缩后大小 8字节 HEX")}
                      ${renderHeaderField("fileHash", `flashFile38s[${idx}].fileHash`, renderSnapshotStatic(item.fileHash), "文件 Hash")}
                      ${renderHeaderField("MD5", `flashFile38s[${idx}].md5`, renderSnapshotStatic(item.md5 || ""), "MD5 校验值")}
                    </div>
                  </div>
                `).join("") : `<div class="gbf-config-empty">点击"确认"后，将自动生成 File1 ~ File3</div>`}
              </div>
            `,
            flash38GeneratedFiles.length ? `${flash38GeneratedFiles.length} 个文件` : "0 个文件"
          )
        : renderHeaderSection(
            "flash",
            "flashData34",
            "34 服务 Block 信息",
            `
              ${(() => {
                const flash34Groups = buildFlash34BlockGroups(file);
                const renderFlash34BlockFields = (item, index, options = {}) => {
                  const { childBlock = false } = options;
                  const removeDisabled = file.flash34.blocks.length === 1;
                  return `
                    <div class="${childBlock ? "gbf-config-list-item" : ""}">
                      ${
                        childBlock
                          ? `
                            <div class="gbf-config-list-item__head">
                              <div class="gbf-config-list-item__title">${escapeHtml(getFlash34ChildBlockTitle(item, index))}</div>
                              ${
                                canEdit
                                  ? `<button class="btn btn--ghost btn--sm" type="button" data-action="gbf-remove-group" data-group="flash34.blocks" data-index="${index}" ${
                                      removeDisabled ? "disabled" : ""
                                    }>删除</button>`
                                  : ""
                              }
                            </div>
                          `
                          : ""
                      }
                      <div class="gbf-config-grid gbf-config-grid--wide">
                        ${renderHeaderField(
                          "Block类型",
                          `flashData34.blocks[${index}].blockDataType`,
                          renderSnapshotSelect(
                            renderEnumOptions(BLOCK_TYPE_OPTIONS, item.blockDataType),
                            `data-gbf-group="flash34.blocks" data-index="${index}" data-field="blockDataType"`,
                            false
                          ),
                          "工具识别"
                        )}
                        ${renderHeaderField("文件索引", `flashData34.blocks[${index}].fileIndex`, renderSnapshotStatic(item.fileIndex), "工具生成")}
                        ${renderHeaderField(
                          "刷写地址",
                          `flashData34.blocks[${index}].startAddress`,
                          renderSnapshotInput(
                            item.startAddress,
                            `data-gbf-group="flash34.blocks" data-index="${index}" data-field="startAddress"`,
                            canEdit
                          ),
                          "HEX/S19 自动识别，BIN 可手填"
                        )}
                        ${renderHeaderField(
                          "长度",
                          `flashData34.blocks[${index}].length`,
                          renderSnapshotInput(
                            item.length,
                            `data-gbf-group="flash34.blocks" data-index="${index}" data-field="length"`,
                            canEdit
                          ),
                          "HEX/S19 自动识别，BIN 可手填"
                        )}
                      </div>
                    </div>
                  `;
                };

                return `
              <div class="gbf-config-grid">
                ${renderHeaderField(
                  "软件类型",
                  "flashData34.swType",
                  renderSnapshotSelect(renderEnumOptions(SW_TYPE_OPTIONS, file.flash34.swType), 'data-gbf-field="flash34.swType"', canEdit),
                  "A 应用 / B 底层 / C 标定"
                )}
                ${renderHeaderField(
                  "数据类型",
                  "flashData34.dataType",
                  renderSnapshotSelect(
                    renderEnumOptions(DATA_TYPE_OPTIONS, file.flash34.dataType),
                    'data-gbf-field="flash34.dataType"',
                    canEdit
                  ),
                  "加密 / 压缩组合"
                )}
              </div>
              <div class="gbf-config-toolbar">
                <div class="gbf-config-toolbar__hint">FlashDriver.s19 按 Block 展示；BIN 文件按父节点展示，Block 作为子节点追加。</div>
              </div>
              <div class="gbf-config-list">
                ${
                  flash34Groups.length
                    ? flash34Groups
                        .map(
                          (group) =>
                            group.type === "file"
                              ? `
                                  <div class="gbf-config-list-item">
                                    <div class="gbf-config-list-item__head">
                                      <div class="gbf-config-list-item__title">${escapeHtml(group.title)}</div>
                                      ${
                                        canEdit
                                          ? `<button class="btn btn--ghost btn--sm" type="button" data-action="gbf-add-flash34-child-block" data-source-name="${escapeHtml(
                                              group.sourceName
                                            )}">新增Block</button>`
                                          : ""
                                      }
                                    </div>
                                    <div class="gbf-config-list">
                                      ${group.items
                                        .map(({ item, index }) => renderFlash34BlockFields(item, index, { childBlock: true }))
                                        .join("")}
                                    </div>
                                  </div>
                                `
                              : `
                                  <div class="gbf-config-list-item">
                                    <div class="gbf-config-list-item__head">
                                      <div class="gbf-config-list-item__title">${escapeHtml(group.title)}</div>
                                      ${
                                        canEdit
                                          ? `<button class="btn btn--ghost btn--sm" type="button" data-action="gbf-remove-group" data-group="flash34.blocks" data-index="${
                                              group.items[0].index
                                            }" ${file.flash34.blocks.length === 1 ? "disabled" : ""}>删除</button>`
                                          : ""
                                      }
                                    </div>
                                    ${renderFlash34BlockFields(group.items[0].item, group.items[0].index)}
                                  </div>
                                `
                        )
                        .join("")
                    : `<div class="gbf-config-empty">暂无 34 服务 Block 数据</div>`
                }
              </div>
              `;
              })()}
            `,
            `${file.flash34.blocks.length} 个 Block`
          );

    const ecuSwSignatureSection = renderHeaderSection(
      "ecuSwSignature",
      "ecuSwSignature",
      "",
      `
        <div class="gbf-config-grid">
          ${renderHeaderField(
            "签名算法",
            "ecuSwSignature.swDataSignatureAlgorithm",
            renderSnapshotInput(
              file.ecuSwSignature.swDataSignatureAlgorithm,
              'data-gbf-field="ecuSwSignature.swDataSignatureAlgorithm"',
              canEdit
            ),
            "swDataSignatureAlgorithm"
          )}
          ${renderHeaderField(
            "签名值",
            "ecuSwSignature.swDataSignatureValue",
            renderSnapshotInput(
              file.ecuSwSignature.swDataSignatureValue,
              'data-gbf-field="ecuSwSignature.swDataSignatureValue"',
              canEdit
            ),
            "swDataSignatureValue"
          )}
          ${renderHeaderField(
            "公钥",
            "ecuSwSignature.publicKey",
            renderSnapshotInput(file.ecuSwSignature.publicKey, 'data-gbf-field="ecuSwSignature.publicKey"', canEdit),
            "publicKey"
          )}
          ${renderHeaderField(
            "数据 Hash",
            "ecuSwSignature.dataHash",
            renderSnapshotInput(file.ecuSwSignature.dataHash, 'data-gbf-field="ecuSwSignature.dataHash"', canEdit),
            "dataHash"
          )}
        </div>
      `
    );

    const hutSshfsInfoSection = renderHeaderSection(
      "hutSshfsInfo",
      "hutSshfsInfo",
      "",
      `
        <div class="gbf-config-grid">
          ${renderHeaderField(
            "签名算法",
            "hutSshfsInfo.swDataSignatureAlgorithm",
            renderSnapshotInput(
              file.hutSshfsInfo.swDataSignatureAlgorithm,
              'data-gbf-field="hutSshfsInfo.swDataSignatureAlgorithm"',
              canEdit
            ),
            "swDataSignatureAlgorithm"
          )}
          ${renderHeaderField(
            "签名值",
            "hutSshfsInfo.swDataSignatureValue",
            renderSnapshotInput(
              file.hutSshfsInfo.swDataSignatureValue,
              'data-gbf-field="hutSshfsInfo.swDataSignatureValue"',
              canEdit
            ),
            "swDataSignatureValue"
          )}
          ${renderHeaderField(
            "公钥",
            "hutSshfsInfo.publicKey",
            renderSnapshotInput(file.hutSshfsInfo.publicKey, 'data-gbf-field="hutSshfsInfo.publicKey"', canEdit),
            "publicKey"
          )}
          ${renderHeaderField(
            "数据 Hash",
            "hutSshfsInfo.dataHash",
            renderSnapshotInput(file.hutSshfsInfo.dataHash, 'data-gbf-field="hutSshfsInfo.dataHash"', canEdit),
            "dataHash"
          )}
        </div>
      `
    );

    gbfPanelHeader.innerHTML = `
      <div class="gbf-config-sheet__title">字段配置</div>
      <div class="gbf-config-sheet__table">
        <div class="gbf-config-stack">
          ${basicSection}
          ${commSection}
          ${versionSection}
          ${saSection}
          ${otaSection}
          ${flashSection}
          ${ecuSwSignatureSection}
          ${hutSshfsInfoSection}
        </div>
      </div>
      <div class="gbf-config-footer">
        <label class="check gbf-config-footer__check">
          <input
            type="checkbox"
            data-gbf-config-toggle="true"
            ${file.configured ? "checked" : ""}
            ${file.ext === "gbf" ? "disabled" : ""}
            ${!canToggleConfigured && !file.configured ? "disabled" : ""}
          />
          完成配置
        </label>
        <div class="gbf-config-footer__progress">
          <div class="gbf-config-footer__progress-bar">
            <div class="gbf-config-footer__progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="gbf-config-footer__progress-text">${progress}%</div>
        </div>
        <div class="gbf-config-footer__meta">
          <span class="gbf-status ${statusMeta.className}">${renderStatusIcon(statusMeta, "gbf-status__icon")}${statusMeta.label}</span>
          <span class="gbf-pane__hint">${escapeHtml(file.name)}</span>
        </div>
      </div>
    `;
  };

  const renderStructurePanel = () => {
    if (!gbfPanelStructure) return;
    const file = getSelectedFile();
    const usesFlash38 = isFlashFile38Service(file);
    const tableHtml = usesFlash38
      ? `
        <table class="gbf-table">
          <thead>
            <tr>
              <th>fileName</th>
              <th>dataType</th>
              <th>fileSizeUnzip</th>
              <th>fileSizeZip</th>
              <th>fileHash</th>
            </tr>
          </thead>
          <tbody>
            ${
              file.flash38.files.length
                ? file.flash38.files
                    .map(
                      (item) => `
                  <tr>
                    <td>${escapeHtml(item.fileName)}</td>
                    <td>${escapeHtml(item.dataType)}</td>
                    <td><code>${escapeHtml(item.fileSizeUnzip)}</code></td>
                    <td><code>${escapeHtml(item.fileSizeZip)}</code></td>
                    <td><code>${escapeHtml(item.fileHash)}</code></td>
                  </tr>
                `
                    )
                    .join("")
                : `<tr><td colspan="5">暂无 38 服务文件清单</td></tr>`
            }
          </tbody>
        </table>
      `
      : `
        <table class="gbf-table">
          <thead>
            <tr>
              <th>blockDataType</th>
              <th>fileIndex</th>
              <th>gbfBlockOffset</th>
              <th>startAddress</th>
              <th>length</th>
              <th>checkSum</th>
            </tr>
          </thead>
          <tbody>
            ${
              file.flash34.blocks.length
                ? file.flash34.blocks
                    .map(
                      (item) => `
                  <tr>
                    <td>${escapeHtml(item.blockDataType)}</td>
                    <td>${escapeHtml(item.fileIndex)}</td>
                    <td><code>${escapeHtml(item.gbfBlockOffset)}</code></td>
                    <td><code>${escapeHtml(item.startAddress || "---")}</code></td>
                    <td><code>${escapeHtml(item.length || "---")}</code></td>
                    <td><code>${escapeHtml(item.checkSum || "---")}</code></td>
                  </tr>
                `
                    )
                    .join("")
                : `<tr><td colspan="6">暂无 34 服务 Block 定义</td></tr>`
            }
          </tbody>
        </table>
      `;

    gbfPanelStructure.innerHTML = `
      <div class="gbf-structure-columns">
        <div class="gbf-tree-card">
          <div class="gbf-tree-card__title">源文件结构</div>
          <div class="gbf-tree-list">${renderTreeItems(file.sourceTree)}</div>
          <div class="gbf-validation-list">
            <div class="gbf-validation-item">源路径：${escapeHtml(file.path)}</div>
            <div class="gbf-validation-item">层级说明：${escapeHtml(file.layerInfo)}</div>
            <div class="gbf-validation-item">原型支持最多两层 ZIP 结构，全景图中二层压缩路径在此只展示到第二层。</div>
          </div>
        </div>

        <div class="gbf-tree-card">
          <div class="gbf-tree-card__title">目标 GBF 结构</div>
          <div class="gbf-tree-list">${renderTreeItems(file.resultTree)}</div>
          <div class="gbf-validation-list">
            <div class="gbf-validation-item">输出路径：${escapeHtml(file.outputPath)}</div>
            <div class="gbf-validation-item">
              ${
                usesFlash38
                  ? `installAddress：${escapeHtml(file.flash38.installAddress || "---")}`
                  : `swType=${escapeHtml(file.flash34.swType)} / dataType=${escapeHtml(file.flash34.dataType)}`
              }
            </div>
            <div class="gbf-validation-item">
              ${
                usesFlash38
                  ? "38 服务展示 fileName / fileSizeUnzip / fileSizeZip / fileHash。"
                  : "34 服务展示 Block offset / startAddress / length / checkSum。"
              }
            </div>
          </div>
        </div>
      </div>

      <div class="gbf-section">
        <div class="gbf-section__head">
          <div>
            <div class="gbf-section__title">${usesFlash38 ? "38 服务文件清单" : "34 服务 Block 清单"}</div>
            <div class="gbf-section__hint">
              ${
                usesFlash38
                  ? "按 GBF 定义展示安装路径与文件元数据；大小与 Hash 在导出时自动计算。"
                  : "地址允许在界面录入简写，导出时统一补齐到 4 字节并写入 Header。"
              }
            </div>
          </div>
          <div class="tag-list">
            <span class="tag">${escapeHtml(BUS_LABELS[file.busType])}</span>
            <span class="tag">${escapeHtml(file.flashType)}</span>
          </div>
        </div>
        ${tableHtml}
      </div>
    `;
  };

  const renderResultPanel = () => {
    if (!gbfPanelResult) return;
    const file = getSelectedFile();
    const issues = file.ext === "gbf" ? [] : validateFile(file);
    const packageReady = isGbfFile(file);
    let stepStates;

    if (isGbfFile(file)) {
      stepStates = ["is-done", "is-done", "is-done", "is-done"];
    } else if (file.status === "running") {
      stepStates = ["is-done", "is-done", "is-running", ""];
    } else if (file.status === "error") {
      stepStates = ["is-done", "is-done", "is-error", ""];
    } else if (file.status === "configured" || (file.status === "draft" && issues.length === 0)) {
      stepStates = ["is-done", "is-done", "", ""];
    } else if (issues.length > 0) {
      stepStates = ["is-done", "is-error", "", ""];
    } else {
      stepStates = ["", "", "", ""];
    }

    const steps = [
      {
        title: "源文件解析",
        desc: "识别 ZIP / GBF 类型，解析最多两层压缩包，并提取 Header / DATA 对应源文件。",
      },
      {
        title: "Header 字段校验",
        desc: issues.length
          ? issues[0]
          : file.configured
            ? "字段校验通过。"
            : "字段校验通过，请勾选“完成配置”后转化。",
      },
      {
        title: "DATA 区域组装",
        desc:
          file.status === "running"
            ? "正在组装 DATA 区与只读校验字段。"
            : file.status === "error"
              ? "转化执行失败，请根据失败原因修正后重试。"
            : isGbfFile(file)
              ? "DATA 区已生成，对应 block/file 元数据已落盘。"
              : "等待转化动作触发。",
      },
      {
        title: "输出与打包",
        desc: packageReady ? "输出结果可参与整车打包。" : "输出文件尚未生成。",
      },
    ];

    gbfPanelResult.innerHTML = `
      <div class="gbf-result-columns">
        <div class="gbf-result-card">
          <div class="gbf-result-card__title">执行轨迹</div>
          <div class="gbf-result-timeline">
            ${steps
              .map(
                (item, index) => `
              <div class="gbf-result-step ${stepStates[index]}">
                <div class="gbf-result-step__dot"></div>
                <div>
                  <div class="gbf-result-step__title">${escapeHtml(item.title)}</div>
                  <div class="gbf-result-step__desc">${escapeHtml(item.desc)}</div>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>

        <div class="gbf-progress-card">
          <div class="gbf-result-card__title">输出摘要</div>
          <div class="gbf-readonly-grid">
            <div class="gbf-readonly-item">
              <div class="gbf-readonly-item__label">当前状态</div>
              <div class="gbf-readonly-item__value">${escapeHtml(
                (STATUS_META[file.status] || STATUS_META.draft).label
              )}</div>
            </div>
            <div class="gbf-readonly-item">
              <div class="gbf-readonly-item__label">当前进度</div>
              <div class="gbf-readonly-item__value">${escapeHtml(String(file.progress || 0))}%</div>
            </div>
            <div class="gbf-readonly-item">
              <div class="gbf-readonly-item__label">打包可用</div>
              <div class="gbf-readonly-item__value">${packageReady ? "是" : "否"}</div>
            </div>
          </div>
          ${renderValidationItems(
            packageReady
              ? ["输出文件已可用于整车打包。", `结果路径：${file.outputPath}`]
              : [
                  "当前仅完成字段配置展示，尚未形成最终可打包结果。",
                  "完成配置并执行转化后，结果区将展示已生成的 Header / DATA 信息。",
                ]
          )}
        </div>
      </div>

      <div class="gbf-split">
        <div class="gbf-section">
          <div class="gbf-section__head">
            <div>
              <div class="gbf-section__title">问题与提示</div>
              <div class="gbf-section__hint">错误优先显示字段校验问题；无错误时展示导出与打包说明。</div>
            </div>
          </div>
          ${renderValidationItems(
            issues.length
              ? issues
              : [
                  isGbfFile(file)
                    ? "当前为只读 GBF，可直接参与整车打包。"
                    : "字段配置已通过。",
                  isFlashFile38Service(file)
                    ? "Type II 场景不显示 otaHeader 区域。"
                    : "OTA Header 仅保留原始文件上传入口。",
                ],
            issues.length > 0
          )}
        </div>

        <div class="gbf-section">
          <div class="gbf-section__head">
            <div>
              <div class="gbf-section__title">结果结构预览</div>
              <div class="gbf-section__hint">成功后显示最终输出结构；失败时保留待生成提示。</div>
            </div>
          </div>
          <div class="gbf-tree-list">${renderTreeItems(file.resultTree)}</div>
        </div>
      </div>
    `;
  };

  const renderSyncResults = () => {
    if (gbfSyncEcuResult) {
      const typeFilter = gbfSyncEcuFileType?.value || "";
      const rows = syncMockData.ecu.filter((item) => !typeFilter || item.type === typeFilter);
      gbfSyncEcuResult.innerHTML = !state.syncLoadedEcu
        ? `<div class="gbf-empty">点击“获取版本”加载单 ECU 刷写包版本。</div>`
        : `
          <div class="gbf-sync-result__title">单 ECU 版本列表</div>
          ${
            rows.length
              ? rows
                  .map(
                    (item) => `
                <div class="gbf-version-row">
                  <button class="gbf-version-radio ${state.syncSelectedId === item.id ? "is-selected" : ""}" data-action="gbf-select-sync-version" data-version-id="${item.id}" type="button"></button>
                  <div>
                    <strong>${escapeHtml(item.version)}</strong>
                    <div class="gbf-version-row__meta">${escapeHtml(item.summary)}</div>
                  </div>
                  <div>
                    <strong>${escapeHtml(item.type)}</strong>
                    <div class="gbf-version-row__meta">存储路径：${escapeHtml(
                      `${gbfSyncPath?.value || "D:\\GWM\\swfiledown"}\\${item.version}`
                    )}</div>
                  </div>
                  <div class="gbf-version-row__meta">${escapeHtml(item.note)}</div>
                </div>
              `
                  )
                  .join("")
              : `<div class="gbf-empty">当前筛选条件下无版本数据。</div>`
          }
        `;
    }

    if (gbfSyncVehicleResult) {
      const typeLabel = gbfSyncVehicleFileType?.value || "原始文件";
      gbfSyncVehicleResult.innerHTML = !state.syncLoadedVehicle
        ? `<div class="gbf-empty">点击“立即下载”按 VIN 获取整车刷写包。</div>`
        : `
          <div class="gbf-sync-result__title">整车刷写包结果</div>
          ${syncMockData.vehicle
            .map(
              (item) => `
            <div class="gbf-version-row">
              <button class="gbf-version-radio ${state.syncSelectedId === item.id ? "is-selected" : ""}" data-action="gbf-select-sync-version" data-version-id="${item.id}" type="button"></button>
              <div>
                <strong>${escapeHtml(item.version)}</strong>
                <div class="gbf-version-row__meta">${escapeHtml(item.summary)}</div>
              </div>
              <div>
                <strong>${escapeHtml(typeLabel)}</strong>
                <div class="gbf-version-row__meta">VIN：${escapeHtml(gbfVehicleVin?.value || "")}</div>
              </div>
              <div class="gbf-version-row__meta">${escapeHtml(item.note)}</div>
            </div>
          `
            )
            .join("")}
        `;
    }
  };

  const renderPackageTree = () => {
    if (!gbfPackageTree) return;
    const packageableFiles = state.files.filter((item) => state.checkedIds.has(item.id) && isGbfFile(item));

    if (gbfPackageCount) {
      gbfPackageCount.textContent = `已选择 ${packageableFiles.length} 个 GBF 文件`;
    }

    gbfPackageTree.innerHTML = packageableFiles.length
      ? `
        <div class="gbf-package-file">vehicleSw.zip</div>
        ${packageableFiles
          .map(
            (item) => `
          <div class="gbf-package-file">
            ${escapeHtml(item.outputPath.split("\\").pop() || item.name.replace(/\.[^.]+$/, ".gbf"))}
          </div>
        `
          )
          .join("")}
      `
      : `<div class="gbf-empty">请选择已生成或已导入的 GBF 文件后再进行整车打包。</div>`;
  };

  const syncTabVisibility = () => {
    document.querySelectorAll(".gbf-sync-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.syncTab === state.syncTab);
    });
    document.querySelectorAll(".gbf-sync-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `gbf-sync-panel-${state.syncTab}`);
    });
  };

  const panelVisibility = () => {
    document.querySelectorAll(".gbf-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.gbfTab === state.activeTab);
    });
    gbfPanelHeader?.classList.toggle("is-active", state.activeTab === "header");
    gbfPanelStructure?.classList.toggle("is-active", state.activeTab === "structure");
    gbfPanelResult?.classList.toggle("is-active", state.activeTab === "result");
  };

  const applyMainLayout = () => {
    if (gbfMain) {
      gbfMain.classList.toggle("gbf-main--files-collapsed", state.filesCollapsed);
    }
    if (gbfToggleFilesButton) {
      const label = state.filesCollapsed ? "展开列表" : "收起列表";
      gbfToggleFilesButton.title = label;
      gbfToggleFilesButton.setAttribute("aria-label", label);
      const icon = gbfToggleFilesButton.querySelector("i");
      if (icon) {
        icon.className = `fa-solid ${state.filesCollapsed ? "fa-panel-right" : "fa-panel-left"}`;
      }
      const text = gbfToggleFilesButton.querySelector(".gbf-pane__toggle-text");
      if (text) {
        text.textContent = label;
      }
    }
  };

  const applyFileSectionState = () => {
    gbfWindow.querySelectorAll("[data-gbf-file-section]").forEach((section) => {
      const sectionKey = section.dataset.gbfFileSection;
      const collapsed = Boolean(state.fileSectionsCollapsed[sectionKey]);
      section.classList.toggle("is-collapsed", collapsed);

      const toggleButton = section.querySelector('[data-action="gbf-toggle-file-section"]');
      if (toggleButton) {
        toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggleButton.title = collapsed ? "展开文件列表" : "收起文件列表";
      }
    });
  };

  const setValueByPath = (target, field, value) => {
    const segments = String(field).split(".");
    let cursor = target;
    while (segments.length > 1) {
      const key = segments.shift();
      if (!(key in cursor) || typeof cursor[key] !== "object" || cursor[key] === null) {
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    cursor[segments[0]] = value;
  };

  const updateTopLevelField = (file, field, value, options = {}) => {
    const { validate = true } = options;
    const normalizedValue = field === "otaEnabled" ? Boolean(value) : value;
    if (file.ext !== "gbf") {
      file.configured = false;
      if (file.status === "success") {
        file.progress = 0;
      }
    }
    setValueByPath(file, field, normalizedValue);
    if (field === "flash38.installAddress" && Array.isArray(file.flash38?.files)) {
      file.flash38.files = file.flash38.files.map((item) => ({
        ...item,
        installAddress: normalizeJsonText(normalizedValue),
      }));
    }
    if (field === "busType") {
      normalizeFlashType(file);
    }
    if (field === "flashType" && isFlashFile38Service(file)) {
      file.otaEnabled = false;
      file.otaFile = "";
    }
    seedReadonlyValues(file);
    if (validate) {
      setFileConfigured(file);
    }
  };

  const updateGroupField = (file, group, index, field, value, options = {}) => {
    const { validate = true } = options;
    if (file.ext !== "gbf") {
      file.configured = false;
      if (file.status === "success") {
        file.progress = 0;
      }
    }
    const segments = String(group).split(".");
    let cursor = file;
    for (const segment of segments) {
      if (!(segment in cursor)) return;
      cursor = cursor[segment];
    }
    if (!Array.isArray(cursor)) return;
    if (!cursor[index]) {
      cursor[index] = {};
    }
    cursor[index][field] = value;
    if (group === "flash38.files" && field === "installAddress" && !file.flash38.installAddress) {
      file.flash38.installAddress = normalizeJsonText(value);
    }
    seedReadonlyValues(file);
    if (validate) {
      setFileConfigured(file);
    }
  };

  const seedReadonlyValues = (file) => {
    if (!isFlashFile38Service(file) && file.otaEnabled && file.otaFile) {
      file.readonly.otaOffset = file.readonly.otaOffset === "---" ? "0x00000400" : file.readonly.otaOffset;
      file.readonly.otaLength = file.readonly.otaLength === "---" ? "0x00000220" : file.readonly.otaLength;
      file.readonly.otaChecksum =
        file.readonly.otaChecksum === "---" ? "0xA1B20C3D" : file.readonly.otaChecksum;
    } else {
      file.readonly.otaOffset = "---";
      file.readonly.otaLength = "---";
      file.readonly.otaChecksum = "---";
    }

    file.readonly.dataOffset = file.readonly.dataOffset === "---" ? "0x00000980" : file.readonly.dataOffset;
    file.readonly.dataLength =
      file.readonly.dataLength === "---" ? "0x000000000009A220" : file.readonly.dataLength;
    file.readonly.dataChecksum =
      file.readonly.dataChecksum === "---" ? "0xC011AB29" : file.readonly.dataChecksum;
  };

  const buildResultTree = (file) => {
    const prefix = [{ text: "gbfHeader.json" }, { text: "DATA" }];
    if (isFlashFile38Service(file)) {
      const children = (file.flash38.files || []).map((item, index) => ({
        text: `File${index + 1} ${item.fileName}`,
        child: true,
      }));
      return prefix.concat(children.length ? children : [{ text: "File1 payload.tar", child: true }]);
    }

    const children = (file.flash34.blocks || []).map((item, index) => ({
      text: getFlash34BlockTreeText(item, index),
      child: true,
    }));
    return prefix.concat(children.length ? children : [{ text: "Block1 flashData", child: true }]);
  };

  const applyTemplateToCurrentFile = () => {
    const file = getSelectedFile();
    if (!file || file.ext === "gbf") {
      toast("当前 .gbf 文件为只读预览，无需套用模板");
      return;
    }

    const ecuName =
      file.busType === "ethernet"
        ? file.ethParams[0]?.ecuName || "ZCU"
        : file.canParams[0]?.ecuName || file.name.split("_")[0] || "ECU";
    const sanitizedEcu = ecuName.replace(/[^A-Za-z0-9_]/g, "").toUpperCase() || "ECU";

    file.supplierCode = isAscii(file.supplierCode) && file.supplierCode.length <= 15 ? file.supplierCode : "AAPCA";
    file.version.hwVersion = file.version.hwVersion || `${sanitizedEcu}3652001XST01A`;
    file.version.swVersion = file.version.swVersion || `${sanitizedEcu}_MAIN_20260318`;
    file.version.baselineVersion = file.version.baselineVersion || "25-03-Istep-300";

    if (!file.sas.length) {
      file.sas.push({ saType: "0", saLvl: "0x01", saMask: "0x20454355" });
    }
    file.sas = file.sas.map((item, index) => ({
      saType: item.saType || "0",
      saLvl: item.saLvl || "0x01",
      saMask:
        item.saMask ||
        (item.saType === "0"
          ? `0x20${String(index + 1).padStart(2, "0")}454355`
          : "0x204543555345435552495459303030303030"),
    }));

    if (file.busType === "ethernet") {
      const item = file.ethParams[0] || {};
      item.ecuName = item.ecuName || sanitizedEcu;
      item.logicAddress = item.logicAddress || "0x1010";
      item.funId = item.funId || "0xE400";
      item.ipAddress = item.ipAddress || "192.168.1.20";
      file.ethParams[0] = item;
    } else {
      const item = file.canParams[0] || {};
      item.ecuName = item.ecuName || sanitizedEcu;
      item.requestId = item.requestId || "0x7E0";
      item.responseId = item.responseId || "0x7E8";
      item.logicAddress = item.logicAddress || "0x1010";
      item.funId = item.funId || "0x7DF";
      file.canParams[0] = item;
    }

    if (isFlashFile38Service(file)) {
      file.flash38.installAddress =
        file.flash38.installAddress || `/opt/gwm/${sanitizedEcu.toLowerCase()}/`;
      if (!file.flash38.files.length) {
        file.flash38.files = [
          {
            installAddress: file.flash38.installAddress,
            fileName: `${sanitizedEcu.toLowerCase()}_payload.tar`,
            dataType: "0x00",
            fileSizeUnzip: "0x000000000009A220",
            fileSizeZip: "0x0000000000051220",
            fileHash: "A7CB15E90D2A1B4FF00ACAB1830F12CC",
          },
        ];
      }
    } else {
      if (!file.flash34.blocks.length) {
        file.flash34.blocks = [
          {
            blockDataType: "1",
            fileIndex: "0",
            gbfBlockOffset: "0x00000980",
            startAddress: "0x80000000",
            length: "0x00024000",
            checkSum: "0x11AA22BB",
          },
        ];
      } else {
        file.flash34.blocks = file.flash34.blocks.map((item, index) => ({
          blockDataType: item.blockDataType || "1",
          fileIndex: item.fileIndex || String(index),
          gbfBlockOffset: item.gbfBlockOffset === "---" ? "0x00000980" : item.gbfBlockOffset,
          startAddress: item.startAddress || `0x80${String(index).padStart(2, "0")}4000`,
          length: item.length || "0x00024000",
          checkSum: item.checkSum === "---" ? "0x11AA22BB" : item.checkSum,
        }));
      }
      normalizeFlash34BlockSequence(file);
    }

    if (isFlashFile38Service(file)) {
      file.otaEnabled = false;
      file.otaFile = "";
    } else {
      file.otaEnabled = true;
      file.otaFile = file.otaFile || `otaHeader_${sanitizedEcu}.bin`;
    }

    seedReadonlyValues(file);
    file.configured = false;
    setFileConfigured(file);
    renderAll();
    systemMessage(`GBF转化模板已套用：${file.name}`);
    toast("已套用推荐模板");
  };

  const saveCurrentConfig = () => {
    const file = getSelectedFile();
    if (!file || file.ext === "gbf") {
      toast("当前 .gbf 文件为只读预览，无需保存配置");
      return;
    }
    const issues = setFileConfigured(file);
    state.activeTab = "header";
    renderAll();
    if (issues.length) {
      systemMessage(`GBF转化配置校验失败：${file.name}`, "error");
      toast("仍有字段未通过校验");
      return;
    }
    systemMessage(`GBF转化配置已保存：${file.name}`);
    toast(file.configured ? "Header 配置已保存" : "校验通过，请勾选完成配置");
  };

  const buildGeneratedGbfEntry = (sourceFile) => {
    const gbfPath = getGbfPath(sourceFile);
    const existingOutput =
      (sourceFile.generatedGbfId && getFileById(sourceFile.generatedGbfId)) ||
      state.files.find((item) => item.sourceFileId === sourceFile.id && isGbfFile(item));
    const output = existingOutput ? JSON.parse(JSON.stringify(existingOutput)) : JSON.parse(JSON.stringify(sourceFile));

    output.id = existingOutput?.id || `gbf-${sourceFile.id}-${Date.now()}`;
    delete output.generatedGbfId;
    output.sourceFileId = sourceFile.id;
    output.generatedFromConvert = true;
    output.hideListState = true;
    output.ext = "gbf";
    output.status = "success";
    output.configured = true;
    output.progress = 100;
    output.outputPath = gbfPath;
    output.path = gbfPath;
    output.name = gbfPath.split("\\").pop() || String(sourceFile.name || "").replace(/\.[^.]+$/, ".gbf");
    output.layerInfo = "已转化 GBF 文件";

    normalizeHeaderCollections(output);
    normalizeFlashType(output);
    seedReadonlyValues(output);
    updateGbfDerivedTrees(output);

    return {
      output,
      existingOutputId: existingOutput?.id || "",
    };
  };

  const finalizeConvertedFile = (file) => {
    file.outputPath = file.outputPath || file.path.replace(/\.[^.]+$/, ".gbf");
    seedReadonlyValues(file);
    file.resultTree = buildResultTree(file);
    file.status = "success";
    file.configured = true;
    file.progress = 100;

    const { output, existingOutputId } = buildGeneratedGbfEntry(file);
    file.generatedGbfId = output.id;

    const sourceIndex = state.files.findIndex((item) => item.id === file.id);
    if (existingOutputId) {
      const outputIndex = state.files.findIndex((item) => item.id === existingOutputId);
      if (outputIndex >= 0) {
        state.files[outputIndex] = output;
      }
    } else {
      state.files.splice(sourceIndex >= 0 ? sourceIndex + 1 : state.files.length, 0, output);
    }

    if (state.checkedIds.has(file.id)) {
      state.checkedIds.delete(file.id);
      state.checkedIds.add(output.id);
    }

    if (state.selectedFileId === file.id) {
      state.selectedFileId = output.id;
    }
  };

  const convertSelectedFiles = () => {
    const files = state.files.filter(
      (item) =>
        state.checkedIds.has(item.id) &&
        item.ext !== "gbf" &&
        item.configured &&
        item.status === "configured"
    );

    if (!files.length) {
      toast("当前没有可转化的文件，请先完成 Header 配置");
      return;
    }

    if (state.convertTimer) {
      window.clearInterval(state.convertTimer);
      state.convertTimer = null;
    }

    state.convertBatchItems = files.map((file) => ({
      id: file.id,
      name: file.name,
    }));

    files.forEach((file, index) => {
      file.status = "running";
      file.progress = Math.max(file.progress || 0, 10 + index * 6);
    });

    state.activeTab = "result";
    focusGbfWindow();
    renderAll();
    systemMessage(`开始转化 ${files.length} 个文件`);

    state.convertTimer = window.setInterval(() => {
      files.forEach((file, index) => {
        if (file.status === "error" || file.progress >= 100) return;
        const nextProgress = Math.min(100, file.progress + 14 + index * 2);
        if (file.convertShouldFail && nextProgress >= 82) {
          file.progress = 82;
          file.status = "error";
          return;
        }
        file.progress = nextProgress;
        if (file.progress >= 100) {
          finalizeConvertedFile(file);
        } else {
          file.status = "running";
        }
      });

      renderAll();

      if (files.every((file) => file.progress >= 100 || file.status === "error")) {
        window.clearInterval(state.convertTimer);
        state.convertTimer = null;
        const successFiles = files.filter((item) => item.status === "success");
        const failedFiles = files.filter((item) => item.status === "error");
        if (failedFiles.length && successFiles.length) {
          systemMessage(`GBF转化完成：成功 ${successFiles.length} 个，失败 ${failedFiles.length} 个`, "error");
          toast("转化结束，存在失败文件");
        } else if (failedFiles.length) {
          systemMessage(`GBF转化失败：${failedFiles.map((item) => item.name).join("、")}`, "error");
          toast("转化失败");
        } else {
          systemMessage(
            `GBF转化完成：${successFiles.map((item) => item.outputPath.split("\\").pop()).join("、")}`
          );
          toast("选中文件已完成转化");
        }
      }
    }, 260);
  };

  const openPackageModal = () => {
    const packageableFiles = state.files.filter((item) => state.checkedIds.has(item.id) && isGbfFile(item));
    if (!packageableFiles.length) {
      toast("请选择已生成的 GBF 文件后再进行整车打包");
      return;
    }

    if (gbfPackagePath) {
      const firstPath = packageableFiles[0].outputPath || packageableFiles[0].path;
      const folder = firstPath.includes("\\") ? firstPath.replace(/[^\\]+$/, "") : "D:\\GWM\\Packages\\";
      const baseline = (packageableFiles[0].version?.baselineVersion || "baseline").replace(/[^\w-]+/g, "_");
      gbfPackagePath.value = `${folder}vehicleSw_${baseline}.zip`;
    }

    renderPackageTree();
    openModalSafe(modalGbfPackage);
  };

  const generateVehiclePackage = () => {
    const packageableFiles = state.files.filter((item) => state.checkedIds.has(item.id) && isGbfFile(item));
    if (!packageableFiles.length) {
      toast("当前没有可打包的 GBF 文件");
      return;
    }
    closeModalSafe(modalGbfPackage);
    systemMessage(`整车打包已生成：${gbfPackagePath?.value || "vehicleSw.zip"}`);
    toast("整车 GBF 打包完成");
  };

  const createImportedFile = (source, overrides = {}) => {
    const file = JSON.parse(JSON.stringify(source));
    Object.assign(file, overrides);
    if (overrides.version) {
      file.version = overrides.version;
    }
    return file;
  };

  const getPathExt = (name) => {
    const match = String(name || "").match(/\.([^.\\/]+)$/);
    return match ? match[1].toLowerCase() : "";
  };

  const toGbfOutputPath = (path) =>
    /\.[^.\\/]+$/.test(path || "") ? String(path).replace(/\.[^.\\/]+$/, ".gbf") : `${String(path || "")}.gbf`;

  const createMultiEcuChildFiles = (file) => {
    const timestamp = Date.now();
    const explicitChildren = Array.isArray(file.multiEcuChildren) ? file.multiEcuChildren : [];
    if (explicitChildren.length) {
      return explicitChildren.map((child, index) => {
        const template =
          initialFiles.find((item) => item.id === child.templateId) ||
          state.files.find((item) => item.id === child.templateId) ||
          resolveImportTemplate(getPathExt(child.name || "") || "zip", file.busType);
        return createImportedFile(template, {
          ...child,
          id: `${file.id}-multi-${timestamp}-${index + 1}`,
          parentId: file.id,
          ext: child.ext || getPathExt(child.name || "") || "zip",
          multiEcuChildren: [],
        });
      });
    }

    const nestedZipEntries = getNestedZipEntries(file);
    return nestedZipEntries.map((name, index) =>
      createImportedFile(file, {
        id: `${file.id}-multi-${timestamp}-${index + 1}`,
        parentId: file.id,
        name,
        ext: getPathExt(name) || "zip",
        path: `${String(file.path || file.name).replace(/\.zip$/i, "")}\\${name}`,
        outputPath: toGbfOutputPath(`${String(file.path || file.name).replace(/\.zip$/i, "")}\\${name}`),
        summary: `${file.name} 子包 / 多ECU展开`,
        layerInfo: `${file.name} 内层文件`,
        sourceTree: [{ text: name }],
        resultTree: [{ text: "按子包独立生成 .gbf 文件" }],
        multiEcuChildren: [],
      })
    );
  };

  const enableMultiEcuById = (fileId) => {
    const file = getFileById(fileId);
    if (!canEnableMultiEcu(file)) {
      toast("当前文件不包含子 zip，无法切换为多ECU");
      return;
    }

    const childFiles = createMultiEcuChildFiles(file);
    if (!childFiles.length) {
      toast("当前文件未解析到可展开的 ECU 子包");
      return;
    }

    const parentIndex = state.files.findIndex((item) => item.id === fileId);
    const parentWasChecked = state.checkedIds.has(fileId);
    state.files.splice(parentIndex + 1, 0, ...childFiles);
    file.multiEcuEnabled = true;
    file.summary = `${file.summary || file.name} / 多ECU`;
    file.layerInfo = file.layerInfo || `包含 ${childFiles.length} 个 ECU 子 zip`;
    state.fileTreeExpanded[fileId] = true;
    state.checkedIds.delete(fileId);
    if (parentWasChecked) {
      childFiles.forEach((item) => state.checkedIds.add(item.id));
    }
    delete state.multiEcuSelections[fileId];
    state.selectedFileId = childFiles[0].id;
    closeFileContextMenu();
    renderAll();
    systemMessage(`已切换多ECU模式：${file.name}`);
    toast("已展开多ECU子包");
  };

  const inferImportBusType = (name, importFiles = []) => {
    const corpus = [name, ...importFiles.map((item) => item.webkitRelativePath || item.name || "")]
      .join(" ")
      .toUpperCase();
    if (/\bETH\b|\bIVI\b|\bZCU\b|\bHUT\b|MANIFEST\.JSON|\.TAR\b|\b38\b/.test(corpus)) {
      return "ethernet";
    }
    return "canfd";
  };

  const resolveImportTemplate = (ext, busType) => {
    const findTemplate = (id) => initialFiles.find((item) => item.id === id);
    if (ext === "gbf") {
      return busType === "ethernet"
        ? findTemplate("ivi-release") || findTemplate("hut-release") || initialFiles[2]
        : findTemplate("bms-success") || initialFiles[0];
    }
    return busType === "ethernet"
      ? findTemplate("ivi-running") || findTemplate("zcu-eth38") || initialFiles[1]
      : findTemplate("camera-draft") || findTemplate("radar-nested") || initialFiles[0];
  };

  const buildImportSourceTree = (importFiles, useRelativePath = false) => {
    const lines = (importFiles || [])
      .map((item) => String(useRelativePath ? item.webkitRelativePath || item.name || "" : item.name || ""))
      .filter(Boolean)
      .map((item) => item.replaceAll("/", "\\"));

    if (!lines.length) {
      return [{ text: "待导入内容" }];
    }

    const visibleLines = lines.slice(0, 10).map((item) => ({ text: item }));
    if (lines.length > 10) {
      visibleLines.push({ text: `... 共 ${lines.length} 项` });
    }
    return visibleLines;
  };

  const createImportedLocalEntry = ({ mode, name, path, importFiles }) => {
    const ext = mode === "file" ? getPathExt(name) || "file" : "folder";
    const isGbf = ext === "gbf";
    const busType = inferImportBusType(name, importFiles);
    const template = resolveImportTemplate(ext, busType);
    const importLabel = mode === "folder" ? "文件夹导入" : "本地文件导入";
    const file = createImportedFile(template, {
      id: `${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      ext,
      status: isGbf ? "success" : "draft",
      configured: isGbf,
      progress: isGbf ? 100 : 0,
      path,
      outputPath: isGbf ? path : toGbfOutputPath(path),
      summary: isGbf
        ? `${importLabel} / ${BUS_LABELS[busType] || busType} / 只读预览`
        : `${importLabel} / ${BUS_LABELS[busType] || busType} / 待补全 Header`,
      layerInfo: mode === "folder" ? `来自本地文件夹导入，共 ${importFiles.length} 项` : "来自本地文件导入",
      sourceTree: buildImportSourceTree(importFiles, mode === "folder"),
      resultTree: isGbf ? template.resultTree : [{ text: "等待完成 Header 配置" }],
    });

    normalizeHeaderCollections(file);
    normalizeFlashType(file);
    seedReadonlyValues(file);

    if (isGbf) {
      syncGeneratedGbfState(file);
      updateGbfDerivedTrees(file);
    }

    return file;
  };

  const appendImportedEntries = (entries, typeLabel) => {
    if (!entries.length) return;
    state.files = entries.concat(state.files);
    state.selectedFileId = entries[0].id;
    entries.forEach((item) => state.checkedIds.add(item.id));
    state.activeTab = "header";
    renderAll();
    systemMessage(
      entries.length === 1
        ? `${typeLabel}已导入 GBF 转化列表：${entries[0].name}`
        : `${entries.length} 个${typeLabel}已导入 GBF 转化列表`
    );
    toast(entries.length === 1 ? `已导入${typeLabel}` : `已导入 ${entries.length} 个${typeLabel}`);
  };

  const importSelectedFiles = (fileList) => {
    const entries = (fileList || []).map((item) =>
      createImportedLocalEntry({
        mode: "file",
        name: item.name,
        path: `D:\\GWM\\Imports\\${item.name}`,
        importFiles: [item],
      })
    );
    appendImportedEntries(entries, "文件");
  };

  const importSelectedFolder = (fileList) => {
    const importFiles = Array.from(fileList || []);
    if (!importFiles.length) return;
    const relativePath = importFiles[0].webkitRelativePath || "";
    const folderName = relativePath.split("/")[0] || `Folder_Import_${Date.now()}`;
    const entry = createImportedLocalEntry({
      mode: "folder",
      name: folderName,
      path: `D:\\GWM\\Imports\\${folderName}`,
      importFiles,
    });
    appendImportedEntries([entry], "文件夹");
  };

  const openImportDialog = (mode) => {
    const input = mode === "folder" ? gbfImportFolderInput : gbfImportFileInput;
    if (!input) {
      addLocalMockFile(mode);
      return;
    }
    input.value = "";
    input.click();
  };

  const addLocalMockFile = (mode) => {
    const nextIndex = state.files.length + 1;
    const id = `${mode}-${Date.now()}`;
    const template = mode === "folder" ? initialFiles[1] : initialFiles[3];
    const name =
      mode === "folder"
        ? `Folder_Import_${String(nextIndex).padStart(2, "0")}.zip`
        : `Local_Import_${String(nextIndex).padStart(2, "0")}.zip`;
    const file = createImportedFile(template, {
      id,
      name,
      ext: "zip",
      status: "draft",
      configured: false,
      progress: mode === "folder" ? 14 : 0,
      path: `D:\\GWM\\Imports\\${name}`,
      outputPath: `D:\\GWM\\Imports\\${name.replace(/\.[^.]+$/, ".gbf")}`,
      summary: mode === "folder" ? "目录导入 / 已带默认模板" : "本地单文件导入 / 待补全 Header",
      layerInfo: mode === "folder" ? "来自文件夹扫描" : "单文件导入",
    });

    state.files.unshift(file);
    state.selectedFileId = file.id;
    state.checkedIds.add(file.id);
    state.activeTab = "header";
    renderAll();
    systemMessage(`${mode === "folder" ? "文件夹" : "文件"}已加入 GBF 转化列表：${name}`);
    toast(mode === "folder" ? "已添加文件夹内容" : "已添加本地文件");
  };

  const removeFileById = (fileId) => {
    const file = getFileById(fileId);
    if (!file) return;
    if (!canRemoveFile(file)) {
      toast("转化中的文件暂不支持移除");
      return;
    }

    const removedIds = new Set([fileId, ...getDescendantFileIds(fileId)]);
    state.files = state.files.filter((item) => !removedIds.has(item.id));
    removedIds.forEach((id) => {
      state.checkedIds.delete(id);
      delete state.fileTreeExpanded[id];
      delete state.gbfDataSelection[id];
      delete state.gbfDataExpanded[id];
    });
    if (removedIds.has(state.selectedFileId)) {
      state.selectedFileId = getTopLevelFiles()[0]?.id || state.files[0]?.id || "";
    }
    closeFileContextMenu();
    renderAll();
    systemMessage(`已移除文件：${file.name}`);
    toast("文件已移除");
  };

  const copyFileById = (fileId) => {
    const file = getFileById(fileId);
    if (!file) return;

    const sourceEntries = state.files.filter((item) => [fileId, ...getDescendantFileIds(fileId)].includes(item.id));
    const sourceIds = new Set(sourceEntries.map((item) => item.id));
    const baseStamp = Date.now();
    const idMap = Object.fromEntries(
      sourceEntries.map((item, index) => [item.id, `copy-${baseStamp}-${index}-${Math.random().toString(36).slice(2, 8)}`])
    );
    const copies = sourceEntries.map((source) => {
      const copiedPath = appendCopySuffix(source.path || source.name);
      const copiedName = copiedPath.split("\\").pop() || appendCopySuffix(source.name);
      const copy = createImportedFile(source, {
        id: idMap[source.id],
        parentId: source.parentId && sourceIds.has(source.parentId) ? idMap[source.parentId] : source.parentId || "",
        name: copiedName,
        path: copiedPath,
        outputPath: appendCopySuffix(source.outputPath || toGbfOutputPath(source.path || source.name)),
        generatedGbfId: "",
        sourceFileId: "",
        generatedFromConvert: false,
        hideListState: Boolean(source.ext === "gbf" && source.hideListState),
      });

      if (copy.ext === "gbf") {
        copy.status = "success";
        copy.configured = true;
        copy.progress = 100;
        syncGeneratedGbfState(copy);
      } else {
        copy.status = copy.configured ? "configured" : "draft";
        copy.progress = copy.configured ? Math.min(copy.progress || 0, 36) : 0;
      }
      return copy;
    });

    const anchorId = sourceEntries[sourceEntries.length - 1]?.id || fileId;
    const sourceIndex = state.files.findIndex((item) => item.id === anchorId);
    state.files.splice(sourceIndex >= 0 ? sourceIndex + 1 : 0, 0, ...copies);
    state.selectedFileId = copies[0]?.id || fileId;
    copies.forEach((item) => state.checkedIds.add(item.id));
    if (state.fileTreeExpanded[fileId] && copies[0]) {
      state.fileTreeExpanded[copies[0].id] = true;
    }
    closeFileContextMenu();
    renderAll();
    systemMessage(`已复制文件：${file.name}`);
    toast("已复制文件");
  };

  const convertFileById = (fileId) => {
    const file = getFileById(fileId);
    if (!canConvertFile(file)) {
      toast("当前文件未完成配置，暂不能转化");
      return;
    }

    const previousChecked = new Set(state.checkedIds);
    state.selectedFileId = fileId;
    state.checkedIds = new Set([fileId]);
    closeFileContextMenu();
    convertSelectedFiles();
    state.checkedIds = previousChecked;
    state.checkedIds.add(fileId);
    renderAll();
  };

  const packageFileById = (fileId) => {
    const file = getFileById(fileId);
    if (!canPackageFile(file)) {
      toast("请先生成 .gbf 文件后再整车打包");
      return;
    }

    state.selectedFileId = fileId;
    state.checkedIds.add(fileId);
    closeFileContextMenu();
    renderAll();
    openPackageModal();
  };

  const downloadSelectedSyncVersion = () => {
    const sourceList = state.syncTab === "vehicle" ? syncMockData.vehicle : syncMockData.ecu;
    const selected = sourceList.find((item) => item.id === state.syncSelectedId) || sourceList[0];
    if (!selected) {
      toast("当前没有可下载的版本");
      return;
    }

    const isVehicle = state.syncTab === "vehicle";
    const typeLabel = isVehicle
      ? gbfSyncVehicleFileType?.value || "原始文件"
      : gbfSyncEcuFileType?.value || selected.type || "原始文件";
    const importedAsGbf = typeLabel === "GBF文件";
    const template = importedAsGbf ? initialFiles[2] : isVehicle ? initialFiles[1] : initialFiles[0];
    const ecuName = isVehicle ? "Vehicle" : selected.summary.split(" / ")[0];
    const safeVersion = selected.version.replace(/[^\w.-]+/g, "_");
    const extension = importedAsGbf ? "gbf" : "zip";
    const fileName = `${ecuName}_${safeVersion}.${extension}`;
    const file = createImportedFile(template, {
      id: `sync-${Date.now()}`,
      name: fileName,
      ext: extension,
      status: importedAsGbf ? "success" : "draft",
      configured: importedAsGbf,
      progress: importedAsGbf ? 100 : 18,
      path: `${gbfSyncPath?.value || "D:\\GWM\\swfiledown"}\\${fileName}`,
      outputPath: `${gbfSyncPath?.value || "D:\\GWM\\swfiledown"}\\${fileName.replace(/\.[^.]+$/, ".gbf")}`,
      summary: isVehicle
        ? `云端整车包 / ${typeLabel} / ${gbfVehicleBaseline?.value || selected.version}`
        : `云端ECU包 / ${typeLabel} / ${selected.summary}`,
      layerInfo: isVehicle ? "VIN 命中下载" : "云端版本同步",
      version: {
        ...template.version,
        baselineVersion: isVehicle ? gbfVehicleBaseline?.value || selected.version : template.version.baselineVersion,
      },
    });

    state.files.unshift(file);
    state.selectedFileId = file.id;
    state.checkedIds.add(file.id);
    state.activeTab = "header";
    closeModalSafe(modalGbfSync);
    renderAll();
    systemMessage(`云端版本已下载到转化列表：${fileName}`);
    toast("已下载选中版本");
  };

  const renderAll = () => {
    const scrollState = captureGbfScrollState();
    if (!state.files.length) {
      closeFileContextMenu();
      renderEmptyWorkspace();
      return;
    }
    const ids = new Set(state.files.map((item) => item.id));
    const selectableIds = new Set(state.files.filter((item) => !isContainerFile(item)).map((item) => item.id));
    if (!selectableIds.has(state.selectedFileId)) {
      state.selectedFileId = state.files.find((item) => !isContainerFile(item))?.id || state.files[0].id;
    }
    state.checkedIds = new Set([...state.checkedIds].filter((id) => ids.has(id) && selectableIds.has(id)));
    state.convertBatchItems = (state.convertBatchItems || []).filter((item) => ids.has(item.id));

    state.files.forEach((file) => {
      syncGeneratedGbfState(file);
      normalizeHeaderCollections(file);
      normalizeFlashType(file);
      setFileConfigured(file, { preserveTerminalStatus: true });
    });
    syncAllMultiEcuSelections();

    renderFileList();
    renderHeaderPanel();
    renderGbfDataPanel();
    renderStructurePanel();
    renderResultPanel();
    renderSyncResults();
    renderPackageTree();
    if (gbfProgressPopover.classList.contains("is-open")) {
      renderConvertProgressPopover();
    }
    applyMainLayout();
    applyFileSectionState();
    syncDetailPanels();
    panelVisibility();
    syncTabVisibility();
    updateActionState();
    restoreGbfScrollState(scrollState);
  };

  gbfFileListParent?.addEventListener("contextmenu", (event) => {
    const fileItem = event.target.closest(".gbf-file-item[data-file-id]");
    if (!fileItem) {
      closeFileContextMenu();
      return;
    }
    event.preventDefault();
    const fileId = fileItem.dataset.fileId;
    if (!fileId) return;
    if (!isContainerFile(fileId)) {
      state.selectedFileId = fileId;
    }
    focusGbfWindow();
    renderAll();
    openFileContextMenu(fileId, event.clientX, event.clientY);
  });

  gbfFileListOriginal?.addEventListener("scroll", () => {
    closeFileContextMenu();
    closeProgressPopover();
  });

  gbfFileListGbf?.addEventListener("scroll", () => {
    closeFileContextMenu();
    closeProgressPopover();
  });

  window.addEventListener("resize", () => {
    closeFileContextMenu();
    closeProgressPopover();
  });

  document.addEventListener("contextmenu", (event) => {
    if (!event.target.closest(".gbf-file-item[data-file-id]") && !event.target.closest(".gbf-context-menu")) {
      closeFileContextMenu();
    }
    if (!event.target.closest(".gbf-progress-popover") && !event.target.closest("#gbf-progress-button")) {
      closeProgressPopover();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".gbf-context-menu")) {
      closeFileContextMenu();
    }
    if (!event.target.closest(".gbf-progress-popover") && !event.target.closest("#gbf-progress-button")) {
      closeProgressPopover();
    }
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    const fileId = actionButton.dataset.fileId;

    if (action === "gbf-toggle-file-section") {
      const sectionKey = actionButton.dataset.section;
      if (sectionKey && sectionKey in state.fileSectionsCollapsed) {
        state.fileSectionsCollapsed[sectionKey] = !state.fileSectionsCollapsed[sectionKey];
        applyFileSectionState();
      }
      return;
    }

    if (action === "gbf-toggle-file-group" && fileId) {
      if (state.fileTreeExpanded[fileId]) {
        delete state.fileTreeExpanded[fileId];
      } else {
        state.fileTreeExpanded[fileId] = true;
      }
      focusGbfWindow();
      renderAll();
      return;
    }

    if (action === "gbf-select-file" && fileId) {
      if (hasChildFiles(fileId)) {
        if (state.fileTreeExpanded[fileId]) {
          delete state.fileTreeExpanded[fileId];
        } else {
          state.fileTreeExpanded[fileId] = true;
        }
        focusGbfWindow();
        renderAll();
        return;
      }
      state.selectedFileId = fileId;
      syncAncestorMultiEcuSelection(fileId);
      focusGbfWindow();
      renderAll();
      return;
    }

    if (action === "gbf-toggle-check" && fileId) {
      toggleFileCheckedState(fileId);
      renderAll();
      return;
    }

    if (action === "gbf-context-remove" && fileId) {
      removeFileById(fileId);
      return;
    }

    if (action === "gbf-context-copy" && fileId) {
      copyFileById(fileId);
      return;
    }

    if (action === "gbf-context-convert" && fileId) {
      convertFileById(fileId);
      return;
    }

    if (action === "gbf-context-package" && fileId) {
      packageFileById(fileId);
      return;
    }

    if (action === "gbf-context-multi-ecu" && fileId) {
      enableMultiEcuById(fileId);
      return;
    }

    if (action === "gbf-context-add-to-flash" && fileId) {
      const file = getFileById(fileId);
      if (!file) return;

      let gbfToImport = [];
      if (isContainerFile(fileId)) {
        const descendants = getDescendantFileIds(fileId);
        gbfToImport = descendants.map((id) => getFileById(id)).filter((f) => f && isGbfFile(f));
      } else if (isGbfFile(file)) {
        gbfToImport = [file];
      }

      if (gbfToImport.length > 0) {
        if (window.FlashConfigShared && typeof window.FlashConfigShared.importFiles === "function") {
          window.FlashConfigShared.importFiles(gbfToImport, "GBF库导入");
          closeFileContextMenu();
        } else {
          toast("刷写配置模块不可用，无法导入");
        }
      } else {
        toast("未发现可导入的 GBF 文件");
      }
      return;
    }

    if (action === "gbf-switch-tab") {
      state.activeTab = actionButton.dataset.gbfTab || "header";
      panelVisibility();
      return;
    }

    if (action === "gbf-toggle-data-group") {
      const file = getSelectedFile();
      if (!file) return;
      const nodeId = actionButton.dataset.nodeId;
      if (!nodeId) return;
      if (!state.gbfDataExpanded[file.id]) {
        state.gbfDataExpanded[file.id] = {};
      }
      state.gbfDataExpanded[file.id][nodeId] = state.gbfDataExpanded[file.id][nodeId] === false;
      renderGbfDataPanel();
      return;
    }

    if (action === "gbf-select-data-node") {
      const file = getSelectedFile();
      if (!file) return;
      const nextNodeId = actionButton.dataset.nodeId || "header";
      state.gbfDataSelection[file.id] = nextNodeId;
      renderGbfDataPanel();
      return;
    }

    if (action === "gbf-flash38-confirm") {
      const file = getSelectedFile();
      if (!file || file.ext === "gbf") return;
      const installAddr = normalizeJsonText(file.flash38.inputInstallAddress || file.flash38.installAddress || "/opt/gwm/zcu/");
      const baseName = normalizeJsonText(file.flash38.inputFileName || file.name || "payload.tar");
      const nameNoExt = baseName.replace(/\.[^.]+$/, "");
      const ext = baseName.includes(".") ? baseName.slice(baseName.lastIndexOf(".")) : ".bin";

      const mockHex = (len) => {
        let s = "0x";
        for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16).toUpperCase();
        return s;
      };
      const mockMD5 = () => {
        let s = "";
        for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16).toUpperCase();
        return s;
      };

      file.flash38.confirmed = true;
      file.flash38.installAddress = installAddr;
      const fileNames = ["qqqqq.zip", "mmm.elf", "delta.zip", "boot.bin"];
      file.flash38.files = fileNames.map((fn) => ({
        filePathAndName: `${installAddr}${fn}`,
        fileName: fn,
        installAddress: installAddr,
        dataType: "0x00",
        fileSizeUnzip: mockHex(16),
        fileSizeZip: mockHex(16),
        fileHash: mockMD5(),
        md5: mockMD5(),
      }));
      seedReadonlyValues(file);
      renderAll();
      toast("已生成 File1 ~ File4 文件列表");
      return;
    }

    if (action === "gbf-switch-sync-tab") {
      state.syncTab = actionButton.dataset.syncTab || "ecu";
      renderSyncResults();
      syncTabVisibility();
      return;
    }

    if (action === "open-gbf-progress") {
      if (gbfProgressPopover.classList.contains("is-open")) {
        closeProgressPopover();
      } else {
        openProgressPopover(actionButton);
      }
      return;
    }

    if (action === "gbf-select-sync-version") {
      state.syncSelectedId = actionButton.dataset.versionId || state.syncSelectedId;
      renderSyncResults();
      return;
    }

    if (action === "gbf-add-file") {
      openImportDialog("file");
      return;
    }

    if (action === "gbf-add-folder") {
      openImportDialog("folder");
      return;
    }

    if (action === "open-gbf-sync") {
      focusGbfWindow();
      renderSyncResults();
      syncTabVisibility();
      openModalSafe(modalGbfSync);
      return;
    }

    if (action === "open-gbf-package") {
      focusGbfWindow();
      openPackageModal();
      return;
    }

    if (action === "gbf-toggle-files") {
      state.filesCollapsed = !state.filesCollapsed;
      applyMainLayout();
      return;
    }

    if (action === "gbf-toggle-header-section") {
      const sectionKey = actionButton.dataset.section;
      if (sectionKey && sectionKey in state.headerSections) {
        state.headerSections[sectionKey] = !state.headerSections[sectionKey];
        renderHeaderPanel();
      }
      return;
    }

    if (action === "gbf-add-flash34-child-block") {
      const currentFile = getSelectedFile();
      if (!currentFile || currentFile.ext === "gbf") return;
      const sourceName = normalizeJsonText(actionButton.dataset.sourceName);
      if (!sourceName) return;
      const blocks = getGroupCollection(currentFile, "flash34.blocks");
      if (!blocks) return;
      const insertIndex = Math.max(
        ...blocks
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => getFlash34BlockSourceName(item) === sourceName)
          .map(({ index }) => index),
        -1
      );
      blocks.splice(insertIndex + 1, 0, createDefaultFlash34Block(blocks.length, { sourceName }));
      normalizeFlash34BlockSequence(currentFile);
      currentFile.configured = false;
      if (currentFile.status === "success") {
        currentFile.progress = 0;
      }
      setFileConfigured(currentFile);
      renderAll();
      toast(`已为 ${sourceName} 新增一组 Block`);
      return;
    }

    if (action === "gbf-add-group") {
      const currentFile = getSelectedFile();
      if (!currentFile || currentFile.ext === "gbf") return;
      const group = actionButton.dataset.group;
      if (group === "sas") {
        currentFile.sas.push(createDefaultSaItem());
        toast("已新增一组 SA 算法");
      } else if (group === "canParams") {
        currentFile.canParams.push(createDefaultCanParam(currentFile));
        toast("已新增一组 CAN ECU 通讯参数");
      } else if (group === "ethParams") {
        currentFile.ethParams.push(createDefaultEthParam(currentFile));
        toast("已新增一组 Ethernet ECU 通讯参数");
      } else if (group === "flash34.blocks") {
        const blocks = getGroupCollection(currentFile, group);
        if (!blocks) return;
        blocks.push(createDefaultFlash34Block(blocks.length));
        normalizeFlash34BlockSequence(currentFile);
        toast("已新增一组 34 服务 Block");
      } else {
        return;
      }
      currentFile.configured = false;
      if (currentFile.status === "success") {
        currentFile.progress = 0;
      }
      setFileConfigured(currentFile);
      renderAll();
      return;
    }

    if (action === "gbf-remove-group") {
      const currentFile = getSelectedFile();
      if (!currentFile || currentFile.ext === "gbf") return;
      const group = actionButton.dataset.group;
      const index = Number(actionButton.dataset.index || -1);
      const collection = getGroupCollection(currentFile, group);
      if (!Array.isArray(collection) || collection.length <= 1 || index < 0 || index >= collection.length) {
        return;
      }
      collection.splice(index, 1);
      if (group === "flash34.blocks") {
        normalizeFlash34BlockSequence(currentFile);
      }
      currentFile.configured = false;
      if (currentFile.status === "success") {
        currentFile.progress = 0;
      }
      setFileConfigured(currentFile);
      renderAll();
      toast("已移除一组配置");
      return;
    }

    if (action === "gbf-upload-ota-file") {
      const currentFile = getSelectedFile();
      if (!currentFile || currentFile.ext === "gbf" || isFlashFile38Service(currentFile)) {
        return;
      }
      const ecuName =
        currentFile.busType === "ethernet"
          ? currentFile.ethParams[0]?.ecuName || "ECU"
          : currentFile.canParams[0]?.ecuName || "ECU";
      const safeEcuName = ecuName.replace(/[^A-Za-z0-9_]/g, "").toUpperCase() || "ECU";
      currentFile.otaFile = currentFile.otaFile || `otaHeader_${safeEcuName}.bin`;
      currentFile.configured = false;
      seedReadonlyValues(currentFile);
      setFileConfigured(currentFile);
      renderAll();
      toast("已填入 OTA Header 文件");
      return;
    }

    if (action === "gbf-apply-template") {
      applyTemplateToCurrentFile();
      return;
    }

    if (action === "gbf-save-config") {
      saveCurrentConfig();
      return;
    }

    if (action === "gbf-convert-selected") {
      convertSelectedFiles();
      return;
    }

    if (action === "gbf-download-selected") {
      downloadSelectedSyncVersion();
      return;
    }

    if (action === "gbf-fetch-version") {
      state.syncLoadedEcu = true;
      renderSyncResults();
      toast("已加载单 ECU 云端版本");
      return;
    }

    if (action === "gbf-reset-version") {
      state.syncLoadedEcu = false;
      state.syncSelectedId = "";
      renderSyncResults();
      return;
    }

    if (action === "gbf-fetch-vehicle-package") {
      state.syncLoadedVehicle = true;
      state.syncSelectedId = syncMockData.vehicle[0]?.id || "";
      renderSyncResults();
      toast("已按 VIN 获取整车刷写包");
      return;
    }

    if (action === "gbf-open-sync-path") {
      toast("原型中仅展示路径，不打开系统目录");
      return;
    }

    if (action === "gbf-open-package-path") {
      toast("原型中仅展示输出路径，不打开系统目录");
      return;
    }

    if (action === "gbf-generate-package") {
      generateVehiclePackage();
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    const file = getSelectedFile();
    if (!file) return;

    if (target.matches("[data-gbf-config-toggle]")) {
      const issues = file.ext === "gbf" ? [] : validateFile(file);
      if (file.ext === "gbf") {
        renderAll();
        return;
      }
      if (target.checked && issues.length) {
        file.configured = false;
        setFileConfigured(file);
        renderAll();
        toast("请先通过必填项和校验项");
        return;
      }
      file.configured = Boolean(target.checked);
      setFileConfigured(file);
      renderAll();
      toast(file.configured ? "已勾选完成配置" : "已取消完成配置");
      return;
    }

    if (target.matches("[data-gbf-multi-ecu-select]")) {
      const parentId = target.dataset.fileId || "";
      const childId = target.value || "";
      const childFiles = getChildFiles(parentId);
      if (!parentId || !childId || !getFileById(childId) || !childFiles.length) return;
      state.multiEcuSelections[parentId] = childId;
      childFiles.forEach((item) => state.checkedIds.delete(item.id));
      state.checkedIds.add(childId);
      state.selectedFileId = childId;
      syncAncestorCheckedState(childId);
      focusGbfWindow();
      renderAll();
      return;
    }

    if (target.matches("[data-gbf-field]")) {
      const value = target.type === "checkbox" ? target.checked : target.value;
      updateTopLevelField(file, target.dataset.gbfField, value);
      renderAll();
      return;
    }

    if (target.matches("[data-gbf-group]")) {
      const index = Number(target.dataset.index || 0);
      updateGroupField(file, target.dataset.gbfGroup, index, target.dataset.field, target.value);
      renderAll();
      return;
    }

    if (target === gbfSyncEcuFileType || target === gbfSyncVehicleFileType) {
      renderSyncResults();
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    const file = getSelectedFile();
    if (!file) return;

    if (target.matches("input[data-gbf-field]")) {
      const value = target.type === "checkbox" ? target.checked : target.value;
      updateTopLevelField(file, target.dataset.gbfField, value, { validate: false });
      return;
    }

    if (target.matches("input[data-gbf-group]")) {
      const index = Number(target.dataset.index || 0);
      updateGroupField(file, target.dataset.gbfGroup, index, target.dataset.field, target.value, {
        validate: false,
      });
    }
  });

  gbfImportFileInput.addEventListener("change", () => {
    importSelectedFiles(Array.from(gbfImportFileInput.files || []));
    gbfImportFileInput.value = "";
  });

  gbfImportFolderInput.addEventListener("change", () => {
    importSelectedFolder(Array.from(gbfImportFolderInput.files || []));
    gbfImportFolderInput.value = "";
  });

  [initialFiles, state.files].forEach((collection) => {
    collection.forEach((file) => {
      if (isContainerFile(file.id)) return;
      normalizeHeaderCollections(file);
      normalizeFlashType(file);
      updateGbfDerivedTrees(file);
    });
  });

  renderAll();
})();

