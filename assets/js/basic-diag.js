/**
 * basic-diag.js - 基础诊断页面
 *
 * 方案A：经典 DVR 风格布局
 * - 左侧：总线/ECU 树（复用控制台 busConfig）
 * - 右侧：诊断地址栏 + "服务"/"PDX校验" 两个功能页签
 *   - 服务页签内：左侧服务列表 + 右侧 参数/请求/响应/日志；自定义模式仅显示发送框
 *   - PDX校验页签：DTC + DID 比对校验（复用 pdx-check 逻辑）
 */
;(function () {
  "use strict";

  let root = document.getElementById("basic-diag-root");
  if (!root) {
    document.addEventListener("DOMContentLoaded", () => {
      root = document.getElementById("basic-diag-root");
      if (root) start();
    });
    return;
  }
  
  start();

  function start() {
    const CUSTOM_SERVICE_IDX = -1;

  /* ============================
     DID & RID 数据源定义
     ============================ */
  const DID_DATASOURCE = [
    { id: "F189", name: "应用软件版本 (App Software Version)" },
    { id: "F190", name: "车辆识别码 (VIN)" },
    { id: "F187", name: "供应商编码 (Supplier Code)" },
    { id: "F18A", name: "ECU零件号 (ECU Part Number)" },
    { id: "F18B", name: "ECU硬件号 (ECU Hardware Number)" },
    { id: "F18C", name: "ECU软件号 (ECU Software Number)" },
    { id: "F191", name: "ECU名称 (ECU Name)" },
    { id: "F1C0", name: "标定软件版本 (Calibration Software Version)" },
    { id: "F1C1", name: "底层软件版本 (Boot Software Version)" },
    { id: "F193", name: "节点地址 (Node Address)" },
    { id: "F195", name: "系统配置 (System Configuration)" },
    { id: "F1A0", name: "底盘号 (Chassis Number)" },
    { id: "F1A1", name: "生产日期 (Production Date)" }
  ];

  const RID_DATASOURCE = [
    { id: "FF01", name: "擦除内存 (Erase Memory)" },
    { id: "FF00", name: "例程校验 (Check Routine)" },
    { id: "FF02", name: "检查依赖关系 (Check Dependencies)" },
    { id: "0202", name: "驱动板校验 (Driver Board Check)" },
    { id: "0301", name: "清除存储器 (Clear Flash Memory)" }
  ];

  /* ============================
     UDS 服务定义
     ============================ */
  const UDS_SERVICES = [
    {
      sid: 0x10,
      hex: "10",
      name: "DiagnosticSessionControl",
      label: "会话控制",
      paramType: "subFunction",
      subFunctions: [
        { value: "01", label: "01 默认会话 (defaultSession)" },
        { value: "02", label: "02 编程会话 (programmingSession)" },
        { value: "03", label: "03 扩展会话 (extendedDiagnosticSession)" },
      ],
      defaultSub: "01",
      buildRequest(sub) { return `10 ${sub}`; },
      mockResponse(sub) {
        return { positive: true, raw: "50 00 00 00 00 00", fields: [
          ["ServiceIdentifier", "50"],
          ["diagnosticSessionType", "0"],
          ["P2CanServerMax", "0"],
          ["P2EnhancedCanServerMax", "0"],
        ]};
      },
    },
    {
      sid: 0x11,
      hex: "11",
      name: "ECUReset",
      label: "ECU复位",
      paramType: "subFunction",
      subFunctions: [
        { value: "01", label: "01 硬复位 (hardReset)" },
        { value: "02", label: "02 IGN复位 (keyOffOnReset)" },
        { value: "03", label: "03 软复位 (softReset)" },
      ],
      defaultSub: "01",
      buildRequest(sub) { return `11 ${sub}`; },
      mockResponse(sub) {
        return { positive: true, raw: `51 ${sub}`, fields: [
          ["ServiceID", "51 (positiveResponse)"],
          ["resetType", sub === "01" ? "hardReset" : sub === "02" ? "keyOffOnReset" : "softReset"],
        ]};
      },
    },
    {
      sid: 0x14,
      hex: "14",
      name: "ClearDiagnosticInformation",
      label: "清除DTC",
      paramType: "dtcGroup",
      defaultGroup: "FF FF FF",
      buildRequest(group) { return `14 ${group}`; },
      mockResponse() {
        return { positive: true, raw: "54", fields: [
          ["ServiceID", "54 (positiveResponse)"],
        ]};
      },
    },
    {
      sid: 0x19,
      hex: "19",
      name: "ReadDTCInformation",
      label: "读取DTC",
      paramType: "subFunction",
      subFunctions: [
        { value: "01", label: "01 按状态掩码报告DTC数量 (reportNumberOfDTCByStatusMask)" },
        { value: "02", label: "02 按状态掩码报告DTC (reportDTCByStatusMask)" },
        { value: "04", label: "04 按DTC编号报告快照 (reportDTCSnapshotRecordByDTCNumber)" },
        { value: "06", label: "06 按DTC编号报告扩展数据 (reportDTCExtendedDataRecordByDTCNumber)" },
        { value: "0A", label: "0A 报告支持的DTC (reportSupportedDTC)" },
      ],
      defaultSub: "02",
      extraParam: { name: "statusMask", label: "状态掩码", default: "09" },
      buildRequest(sub, extra, dids, writeDid, writeData, dtcNum, dtcRecord) {
        if (sub === "0A") return `19 ${sub}`;
        if (sub === "04" || sub === "06") {
          const code = dtcNum || "C1 00 87";
          const cleanCode = code.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
          let formattedCode = "";
          for (let i = 0; i < cleanCode.length; i += 2) {
            formattedCode += cleanCode.slice(i, i + 2) + " ";
          }
          formattedCode = formattedCode.trim() || code;
          const rec = dtcRecord || "01";
          return `19 ${sub} ${formattedCode} ${rec}`;
        }
        return `19 ${sub} ${extra || "09"}`;
      },
      mockResponse(sub, extra, dids, writeDid, writeData, dtcNum, dtcRecord) {
        if (sub === "01") {
          return { positive: true, raw: "59 01 09 00 05", fields: [
            ["ServiceID", "59 (positiveResponse)"],
            ["subFunction", "01 (reportNumberOfDTCByStatusMask)"],
            ["statusAvailabilityMask", "09"],
            ["DTCFormatIdentifier", "00 (ISO 14229-1)"],
            ["DTCCount", "05"],
          ]};
        }
        if (sub === "04" || sub === "06") {
          const code = dtcNum || "C1 00 87";
          const rec = dtcRecord || "01";
          const name = sub === "04" ? "reportDTCSnapshotRecordByDTCNumber" : "reportDTCExtendedDataRecordByDTCNumber";
          return { positive: true, raw: `59 ${sub} ${code} ${rec} 12 56 00 00`, fields: [
            ["ServiceID", "59 (positiveResponse)"],
            ["subFunction", `${sub} (${name})`],
            ["DTCAndStatusRecord", `${code} (status: 2F)`],
            ["RecordNumber", rec],
            ["Data", "12 56 00 00 (里程: 12560km)"]
          ]};
        }
        return { positive: true, raw: "59 02 09 U0100 87 08 B1241 00 24", fields: [
          ["ServiceID", "59 (positiveResponse)"],
          ["subFunction", sub === "02" ? "02 (reportDTCByStatusMask)" : "0A (reportSupportedDTC)"],
          ["statusAvailabilityMask", "09"],
          ["DTC_1", "U010087 - 与网关控制器通讯中断 (status: 08)"],
          ["DTC_2", "B124100 - 配置数据校验失败 (status: 24)"],
        ]};
      },
    },
    {
      sid: 0x22,
      hex: "22",
      name: "ReadDataByIdentifier",
      label: "读取DID",
      paramType: "didSelect",
      didList: [
        { id: "F189", name: "应用软件版本" },
        { id: "F190", name: "VIN" },
        { id: "F187", name: "供应商编码" },
        { id: "F18A", name: "ECU零件号" },
        { id: "F18B", name: "ECU硬件号" },
        { id: "F18C", name: "ECU软件号" },
        { id: "F191", name: "ECU名称" },
        { id: "F1C0", name: "标定软件版本" },
        { id: "F1C1", name: "底层软件版本" },
        { id: "F193", name: "节点地址" },
      ],
      selectedDids: ["F189"],
      buildRequest(_, __, selectedDids) {
        const dids = (selectedDids || ["F189"]).map(d => {
          const clean = d.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
          if (clean.length <= 2) return clean;
          return `${clean.slice(0, 2)} ${clean.slice(2)}`;
        });
        return "22 " + dids.join(" ");
      },
      mockResponse(_, __, selectedDids) {
        const did = (selectedDids || ["F189"])[0];
        const mockValues = {
          F189: "ECM_APP_V3.2.1",
          F190: "LGWCAN1ECM0123456789",
          F187: "BOSCH-2026",
          F18A: "ECM-PN-2026",
          F18B: "ECM-HW-A1",
          F18C: "ECM-SW-A1",
          F191: "ECM",
          F1C0: "ECM_CAL_202603",
          F1C1: "ECM_BL_1.0.3",
          F193: "0x0618",
        };
        const val = mockValues[did] || "MOCK_VALUE";
        return { positive: true, raw: `62 ${did.slice(0, 2)} ${did.slice(2)} ${val}`, fields: [
          ["ServiceID", "62 (positiveResponse)"],
          ["DID", did],
          ["Data", val],
        ]};
      },
    },
    {
      sid: 0x27,
      hex: "27",
      name: "SecurityAccess",
      label: "安全访问",
      paramType: "subFunction",
      subFunctions: [
        { value: "01", label: "01 请求Seed (requestSeed)" },
        { value: "02", label: "02 发送Key (sendKey)" },
      ],
      defaultSub: "01",
      buildRequest(sub) {
        return sub === "01" ? "27 01" : "27 02 A1 B2 C3 D4";
      },
      mockResponse(sub) {
        if (sub === "01") {
          return { positive: true, raw: "67 01 3A 7B 2C 1D", fields: [
            ["ServiceID", "67 (positiveResponse)"],
            ["accessType", "01 (requestSeed)"],
            ["Seed", "3A 7B 2C 1D"],
          ]};
        }
        return { positive: true, raw: "67 02", fields: [
          ["ServiceID", "67 (positiveResponse)"],
          ["accessType", "02 (sendKey)"],
          ["Result", "安全访问已解锁"],
        ]};
      },
    },
    {
      sid: 0x28,
      hex: "28",
      name: "CommunicationControl",
      label: "通信控制",
      paramType: "subFunction",
      subFunctions: [
        { value: "00", label: "00 使能接收和发送 (enableRxAndTx)" },
        { value: "01", label: "01 使能接收并禁止发送 (enableRxAndDisableTx)" },
        { value: "02", label: "02 禁止接收并使能发送 (disableRxAndEnableTx)" },
        { value: "03", label: "03 禁止接收和发送 (disableRxAndTx)" },
      ],
      defaultSub: "00",
      extraParam: { name: "communicationType", label: "通信类型", default: "03" },
      buildRequest(sub, extra) {
        return `28 ${sub} ${extra || "03"}`;
      },
      mockResponse(sub) {
        const controlTypes = {
          "00": "enableRxAndTx",
          "01": "enableRxAndDisableTx",
          "02": "disableRxAndEnableTx",
          "03": "disableRxAndTx",
        };
        return { positive: true, raw: `68 ${sub}`, fields: [
          ["ServiceID", "68 (positiveResponse)"],
          ["controlType", `${sub} (${controlTypes[sub] || "unknown"})`],
          ["Result", "通信控制已生效"],
        ]};
      },
    },
    {
      sid: 0x2E,
      hex: "2E",
      name: "WriteDataByIdentifier",
      label: "写入DID",
      paramType: "didWrite",
      defaultDid: "F190",
      defaultData: "4C 47 57 43 41 4E",
      buildRequest(_, __, ___, did, data) {
        did = did || "F190";
        const cleanDid = did.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
        const formattedDid = cleanDid.length <= 2 ? cleanDid : `${cleanDid.slice(0, 2)} ${cleanDid.slice(2)}`;
        return `2E ${formattedDid} ${data || "00"}`;
      },
      mockResponse() {
        return { positive: true, raw: "6E F1 90", fields: [
          ["ServiceID", "6E (positiveResponse)"],
          ["DID", "F190"],
        ]};
      },
    },
    {
      sid: 0x2F,
      hex: "2F",
      name: "InputOutputControlByIdentifier",
      label: "IO控制",
      paramType: "didIoControl",
      defaultDid: "F190",
      defaultSub: "03",
      buildRequest(sub, extra, dids, did, data) {
        did = did || "F190";
        sub = sub || "03";
        const cleanDid = did.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
        const formattedDid = cleanDid.length <= 2 ? cleanDid : `${cleanDid.slice(0, 2)} ${cleanDid.slice(2)}`;
        const stateStr = (sub === "03" && data) ? ` ${data}` : "";
        return `2F ${formattedDid} ${sub}${stateStr}`;
      },
      mockResponse(sub, extra, dids, did, data) {
        did = did || "F190";
        sub = sub || "03";
        const controlTypes = {
          "00": "ReturnControlToECU",
          "01": "ResetToDefault",
          "02": "FreezeCurrentState",
          "03": "ShortTermAdjustment"
        };
        return { positive: true, raw: `6F ${did.slice(0, 2)} ${did.slice(2)} ${sub}`, fields: [
          ["ServiceID", "6F (positiveResponse)"],
          ["DID", did],
          ["ControlParameter", `${sub} (${controlTypes[sub] || "unknown"})`],
        ]};
      },
    },
    {
      sid: 0x31,
      hex: "31",
      name: "RoutineControl",
      label: "例程控制",
      paramType: "subFunction",
      subFunctions: [
        { value: "01", label: "01 启动例程 (startRoutine)" },
        { value: "02", label: "02 停止例程 (stopRoutine)" },
        { value: "03", label: "03 请求结果 (requestRoutineResults)" },
      ],
      defaultSub: "01",
      extraParam: { name: "routineId", label: "例程ID", default: "FF 00" },
      buildRequest(sub, extra) {
        const val = extra || "FF 00";
        const clean = val.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
        const formatted = clean.length <= 2 ? clean : `${clean.slice(0, 2)} ${clean.slice(2)}`;
        return `31 ${sub} ${formatted}`;
      },
      mockResponse(sub) {
        return { positive: true, raw: `71 ${sub} FF 00 00`, fields: [
          ["ServiceID", "71 (positiveResponse)"],
          ["routineControlType", sub === "01" ? "startRoutine" : sub === "02" ? "stopRoutine" : "requestRoutineResults"],
          ["routineIdentifier", "FF00"],
          ["routineStatusRecord", "00 (成功)"],
        ]};
      },
    },
    {
      sid: 0x85,
      hex: "85",
      name: "ControlDTCSetting",
      label: "DTC设置控制",
      paramType: "subFunction",
      subFunctions: [
        { value: "01", label: "01 打开DTC记录 (on)" },
        { value: "02", label: "02 关闭DTC记录 (off)" },
      ],
      defaultSub: "01",
      buildRequest(sub) {
        return `85 ${sub}`;
      },
      mockResponse(sub) {
        return { positive: true, raw: `C5 ${sub}`, fields: [
          ["ServiceID", "C5 (positiveResponse)"],
          ["DTCSettingType", sub === "01" ? "01 (on)" : "02 (off)"],
          ["Result", sub === "01" ? "DTC记录已打开" : "DTC记录已关闭"],
        ]};
      },
    },
  ];

  /* ============================
     Mock PDX 数据
     ============================ */
  const PDX_MOCK_DIDS = [
    { id: "F189", name: "应用软件版本", expected: "V3.2.1" },
    { id: "F190", name: "VIN", expected: "LGWCAN1ECM*" },
    { id: "F187", name: "供应商编码", expected: "BOSCH-*" },
    { id: "F18A", name: "ECU零件号", expected: "*-PN-*" },
    { id: "F18B", name: "ECU硬件号", expected: "*-HW-*" },
    { id: "F18C", name: "ECU软件号", expected: "*-SW-*" },
    { id: "F193", name: "节点地址", expected: "0x*" },
    { id: "F195", name: "系统配置", expected: "SYS-*" },
    { id: "F1C0", name: "标定软件版本", expected: "GW4*" },
    { id: "F1C1", name: "底层软件版本", expected: "*_BL_*" },
  ];

  const PDX_MOCK_DTCS = [
    { code: "U010087", hex: "C1 00 87", desc: "与网关控制器通讯中断" },
    { code: "B124100", hex: "92 41 00", desc: "配置数据校验失败" },
    { code: "U012100", hex: "C1 21 00", desc: "与ESP控制器通讯丢失" },
    { code: "C056100", hex: "80 56 00", desc: "转向角信号超出范围" },
    { code: "U030000", hex: "C3 00 00", desc: "软件版本不匹配" },
  ];

  const PDX_DTC_UDS_DETAILS = {
    "U010087": {
      snapshots: {
        "01": [
          { name: "里程 (Odometer)", value: "12560 km" },
          { name: "供电电压 (Battery Voltage)", value: "11.8 V" },
          { name: "发动机转速 (Engine Speed)", value: "0 rpm" },
          { name: "车速 (Vehicle Speed)", value: "0 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "85 ℃" }
        ],
        "02": [
          { name: "里程 (Odometer)", value: "12562 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.0 V" },
          { name: "发动机转速 (Engine Speed)", value: "800 rpm" },
          { name: "车速 (Vehicle Speed)", value: "5 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "87 ℃" }
        ],
        "03": [
          { name: "里程 (Odometer)", value: "12565 km" },
          { name: "供电电压 (Battery Voltage)", value: "13.5 V" },
          { name: "发动机转速 (Engine Speed)", value: "2200 rpm" },
          { name: "车速 (Vehicle Speed)", value: "55 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "90 ℃" }
        ]
      },
      extended: {
        "01": { occurrenceCounter: 5, agingCounter: 0, statusByte: "2F" },
        "02": { occurrenceCounter: 7, agingCounter: 0, statusByte: "2F" },
        "03": { occurrenceCounter: 10, agingCounter: 0, statusByte: "2F" }
      }
    },
    "B124100": {
      snapshots: {
        "01": [
          { name: "里程 (Odometer)", value: "12558 km" },
          { name: "供电电压 (Battery Voltage)", value: "13.6 V" },
          { name: "发动机转速 (Engine Speed)", value: "1850 rpm" },
          { name: "车速 (Vehicle Speed)", value: "45 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "90 ℃" }
        ],
        "02": [
          { name: "里程 (Odometer)", value: "12560 km" },
          { name: "供电电压 (Battery Voltage)", value: "13.8 V" },
          { name: "发动机转速 (Engine Speed)", value: "2000 rpm" },
          { name: "车速 (Vehicle Speed)", value: "80 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "92 ℃" }
        ],
        "03": [
          { name: "里程 (Odometer)", value: "12564 km" },
          { name: "供电电压 (Battery Voltage)", value: "14.0 V" },
          { name: "发动机转速 (Engine Speed)", value: "2200 rpm" },
          { name: "车速 (Vehicle Speed)", value: "110 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "95 ℃" }
        ]
      },
      extended: {
        "01": { occurrenceCounter: 1, agingCounter: 32, statusByte: "04" },
        "02": { occurrenceCounter: 2, agingCounter: 30, statusByte: "04" },
        "03": { occurrenceCounter: 3, agingCounter: 28, statusByte: "04" }
      }
    },
    "U012100": {
      snapshots: {
        "01": [
          { name: "里程 (Odometer)", value: "11200 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.2 V" },
          { name: "发动机转速 (Engine Speed)", value: "1200 rpm" },
          { name: "车速 (Vehicle Speed)", value: "30 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "70 ℃" }
        ],
        "02": [
          { name: "里程 (Odometer)", value: "11205 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.4 V" },
          { name: "发动机转速 (Engine Speed)", value: "1500 rpm" },
          { name: "车速 (Vehicle Speed)", value: "40 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "73 ℃" }
        ],
        "03": [
          { name: "里程 (Odometer)", value: "11210 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.8 V" },
          { name: "发动机转速 (Engine Speed)", value: "1800 rpm" },
          { name: "车速 (Vehicle Speed)", value: "50 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "75 ℃" }
        ]
      },
      extended: {
        "01": { occurrenceCounter: 0, agingCounter: 40, statusByte: "00" },
        "02": { occurrenceCounter: 1, agingCounter: 38, statusByte: "00" },
        "03": { occurrenceCounter: 2, agingCounter: 36, statusByte: "00" }
      }
    },
    "C056100": {
      snapshots: {
        "01": [
          { name: "里程 (Odometer)", value: "12559 km" },
          { name: "供电电压 (Battery Voltage)", value: "13.8 V" },
          { name: "发动机转速 (Engine Speed)", value: "2200 rpm" },
          { name: "车速 (Vehicle Speed)", value: "95 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "92 ℃" }
        ],
        "02": [
          { name: "里程 (Odometer)", value: "12561 km" },
          { name: "供电电压 (Battery Voltage)", value: "14.0 V" },
          { name: "发动机转速 (Engine Speed)", value: "2400 rpm" },
          { name: "车速 (Vehicle Speed)", value: "105 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "94 ℃" }
        ],
        "03": [
          { name: "里程 (Odometer)", value: "12563 km" },
          { name: "供电电压 (Battery Voltage)", value: "14.2 V" },
          { name: "发动机转速 (Engine Speed)", value: "2600 rpm" },
          { name: "车速 (Vehicle Speed)", value: "120 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "96 ℃" }
        ]
      },
      extended: {
        "01": { occurrenceCounter: 3, agingCounter: 0, statusByte: "28" },
        "02": { occurrenceCounter: 4, agingCounter: 0, statusByte: "28" },
        "03": { occurrenceCounter: 5, agingCounter: 0, statusByte: "28" }
      }
    },
    "U030000": {
      snapshots: {
        "01": [
          { name: "里程 (Odometer)", value: "12550 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.0 V" },
          { name: "发动机转速 (Engine Speed)", value: "0 rpm" },
          { name: "车速 (Vehicle Speed)", value: "0 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "80 ℃" }
        ],
        "02": [
          { name: "里程 (Odometer)", value: "12553 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.2 V" },
          { name: "发动机转速 (Engine Speed)", value: "800 rpm" },
          { name: "车速 (Vehicle Speed)", value: "0 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "82 ℃" }
        ],
        "03": [
          { name: "里程 (Odometer)", value: "12556 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.5 V" },
          { name: "发动机转速 (Engine Speed)", value: "1200 rpm" },
          { name: "车速 (Vehicle Speed)", value: "10 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "84 ℃" }
        ]
      },
      extended: {
        "01": { occurrenceCounter: 0, agingCounter: 40, statusByte: "00" },
        "02": { occurrenceCounter: 1, agingCounter: 38, statusByte: "00" },
        "03": { occurrenceCounter: 2, agingCounter: 36, statusByte: "00" }
      }
    },
    "U029300": {
      snapshots: {
        "01": [
          { name: "里程 (Odometer)", value: "12560 km" },
          { name: "供电电压 (Battery Voltage)", value: "13.1 V" },
          { name: "发动机转速 (Engine Speed)", value: "1500 rpm" },
          { name: "车速 (Vehicle Speed)", value: "70 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "88 ℃" }
        ],
        "02": [
          { name: "里程 (Odometer)", value: "12562 km" },
          { name: "供电电压 (Battery Voltage)", value: "13.3 V" },
          { name: "发动机转速 (Engine Speed)", value: "1800 rpm" },
          { name: "车速 (Vehicle Speed)", value: "85 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "90 ℃" }
        ],
        "03": [
          { name: "里程 (Odometer)", value: "12565 km" },
          { name: "供电电压 (Battery Voltage)", value: "13.6 V" },
          { name: "发动机转速 (Engine Speed)", value: "2100 rpm" },
          { name: "车速 (Vehicle Speed)", value: "95 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "92 ℃" }
        ]
      },
      extended: {
        "01": { occurrenceCounter: 8, agingCounter: 0, statusByte: "2F" },
        "02": { occurrenceCounter: 9, agingCounter: 0, statusByte: "2F" },
        "03": { occurrenceCounter: 10, agingCounter: 0, statusByte: "2F" }
      }
    },
    "B10001B": {
      snapshots: {
        "01": [
          { name: "里程 (Odometer)", value: "12560 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.6 V" },
          { name: "发动机转速 (Engine Speed)", value: "0 rpm" },
          { name: "车速 (Vehicle Speed)", value: "0 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "20 ℃" }
        ],
        "02": [
          { name: "里程 (Odometer)", value: "12562 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.4 V" },
          { name: "发动机转速 (Engine Speed)", value: "0 rpm" },
          { name: "车速 (Vehicle Speed)", value: "0 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "22 ℃" }
        ],
        "03": [
          { name: "里程 (Odometer)", value: "12565 km" },
          { name: "供电电压 (Battery Voltage)", value: "12.2 V" },
          { name: "发动机转速 (Engine Speed)", value: "0 rpm" },
          { name: "车速 (Vehicle Speed)", value: "0 km/h" },
          { name: "冷却液温度 (Coolant Temp)", value: "24 ℃" }
        ]
      },
      extended: {
        "01": { occurrenceCounter: 2, agingCounter: 0, statusByte: "2C" },
        "02": { occurrenceCounter: 3, agingCounter: 0, statusByte: "2C" },
        "03": { occurrenceCounter: 4, agingCounter: 0, statusByte: "2C" }
      }
    }
  };

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
            { id: "can1-ecu1", name: "ECM", type: "ecu", requestAddr: "0618", responseAddr: "0619", funcAddr: "0x760", p2Client_timeout: "150 ms", p2StarClient_timeout: "5100 ms" },
            { id: "can1-ecu2", name: "TCU", type: "ecu", requestAddr: "0641", responseAddr: "0642", funcAddr: "0x760", p2Client_timeout: "150 ms", p2StarClient_timeout: "5100 ms" },
            { id: "can1-ecu3", name: "ABS", type: "ecu", requestAddr: "0760", responseAddr: "0761", funcAddr: "0x760", p2Client_timeout: "150 ms", p2StarClient_timeout: "5100 ms" },
            { id: "can1-ecu4", name: "BCM", type: "ecu", requestAddr: "0740", responseAddr: "0748", funcAddr: "0x760", p2Client_timeout: "150 ms", p2StarClient_timeout: "5100 ms" },
            { id: "can1-ecu5", name: "SRS", type: "ecu", requestAddr: "0750", responseAddr: "0758", funcAddr: "0x760", p2Client_timeout: "150 ms", p2StarClient_timeout: "5100 ms" },
          ],
        },
        {
          id: "eth1", name: "Ethernet1", type: "ethernet", busType: "Ethernet",
          baudrate: "100Mbps", ip: "172.16.8.2",
          children: [
            { id: "eth1-ecu1", name: "GW", type: "ecu", logicAddr: "0x1010", ip: "172.16.8.10", p6Client_timeout: "5000 ms", p6StarClient_timeout: "9950 ms" },
            { id: "eth1-ecu2", name: "IVI", type: "ecu", logicAddr: "0x2010", ip: "172.16.8.20", p6Client_timeout: "5000 ms", p6StarClient_timeout: "9950 ms" },
            { id: "eth1-ecu3", name: "TBOX", type: "ecu", logicAddr: "0x3010", ip: "172.16.8.30", p6Client_timeout: "5000 ms", p6StarClient_timeout: "9950 ms" },
            { id: "eth1-ecu4", name: "ADAS", type: "ecu", logicAddr: "0x4010", ip: "172.16.8.40", p6Client_timeout: "5000 ms", p6StarClient_timeout: "9950 ms" },
          ],
        },
      ];
    }
    return cachedBusConfig;
  }

  /* ============================
     Page State
     ============================ */
  const state = {
    treeCollapsed: false,
    busConfigDialogOpen: false,
    editingBusId: "",
    editingBusData: null,
    contextMenu: { open: false, type: "", busId: "", ecuId: "", x: 0, y: 0 },
    expandedBusIds: ["can1", "eth1"],
    selectedBusId: "can1",
    selectedEcuId: "can1-ecu1",
    activeTab: "service",
    commHold: {
      active: true,
      cycle: 2000,
      type: "功能寻址",
      data: "3E80"
    },
    selectedServiceIdx: 0,
    subFunctionValues: {},
    extraParamValues: {},
    selectedDids: { "F189": true },
    writeDid: "F190",
    writeData: "4C 47 57 43 41 4E",
    ioDid: "F190",
    ioState: "00",
    dtcNumber: "C1 00 87",
    dtcRecordNum: "01",
    hexInput: "",
    funcAddr: false,
    lastResponse: null,
    logEntries: [],
    logSeq: 0,
    pdxDidResults: {},
    pdxDtcResults: {},
    pdxTraceLog: [],
    reportDialogOpen: false,
    pdxDtcManualOverrides: {},
    pdxDidManualOverrides: {},
    pdxReportActiveTab: "dtc",
    pdxDtcNotes: {},
    pdxDidNotes: {},
    pdxSplitRatio: 0.7,
    pdxColWidths: [1.0, 1.0, 1.2],
    svcColWidths: [1.0, 3.0, 1.2],
    pdxUdsInnerSplitRatio: 0.5,
    pdxUdsDtcResults: [],
    pdxUdsSelectedDtcCode: "",
    pdxUdsActiveTab: "snapshot",
    pdxMaskInput: "FF",
    pdxUdsSnapshotNumbers: {},
    pdxUdsExtendedNumbers: {},
    pdxUdsSnapshotValues: {},
    pdxUdsExtendedValues: {},
    selectedPdxDids: {
      "F189": true, "F190": true, "F187": true, "F18A": true, "F18B": true,
      "F18C": true, "F193": true, "F195": true, "F1C0": true, "F1C1": true
    },
    pdxDtcExtraResults: {},
    pdxConfigVersionOpen: false,
    pdxDidSearchQuery: "",
    tempSelectedPdxDids: {},
    pdxDtcLoading: false,
    pdxDidLoading: false,
    pdxUdsLoading: false,
    pdxDtcDetailsOpen: false,
    pdxSelectedDtcCode: "",
    secAlgoOpen: false,
    secAlgoPos: null,
    secAlgo: {
      busId: "can1",
      ecuId: "can1-ecu1",
      algoType: "4bytes", // "4bytes" or "16bytes"
      level: "01",
      levelManual: "01",
      mask: "00 00 00 00",
      fileSource: "ecuFile", // "ecuFile" or "localFile"
      dllPath: "",
      localDllPath: "",
    },
    // 指令流程
    flowSteps: [],
    flowInterval: 50,
    flowRunning: false,
    flowCurrentIdx: -1,
    flowSplitRatio: 0.55,
    flowSelectedIdx: -1,
  };

  UDS_SERVICES.forEach((svc, idx) => {
    if (svc.defaultSub) state.subFunctionValues[idx] = svc.defaultSub;
    if (svc.extraParam) state.extraParamValues[idx] = svc.extraParam.default;
  });

  /* ============================
     Helpers
     ============================ */
  function esc(val) {
    return String(val ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function parseValAndUnit(str) {
    if (!str) return { val: "--", unit: "--" };
    const match = String(str).match(/^([\d.]+)\s*(.*)$/);
    if (match) {
      return { val: match[1], unit: match[2] || "--" };
    }
    return { val: str, unit: "--" };
  }

  function now() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
  }

  function getSelectedBus() {
    return getBusConfig().find(b => b.id === state.selectedBusId) || null;
  }

  function buildTemplateEcu(bus) {
    if (!bus) return null;
    if (bus.type === "ethernet") {
      return { id: "__tpl__", name: "ECU1", type: "ecu", logicAddr: "0x1000", ip: "172.16.8.100", p6Client_timeout: "5000 ms", p6StarClient_timeout: "9950 ms" };
    }
    if (bus.type === "lin") {
      return { id: "__tpl__", name: "ECU1", type: "ecu", nadAddr: "01" };
    }
    return { id: "__tpl__", name: "ECU1", type: "ecu", requestAddr: "0700", responseAddr: "0708", funcAddr: "0x760", p2Client_timeout: "150 ms", p2StarClient_timeout: "5100 ms" };
  }

  function getSelectedEcu() {
    const bus = getSelectedBus();
    if (!bus) return null;
    if (state.selectedEcuId) {
      return (bus.children || []).find(e => e.id === state.selectedEcuId) || null;
    }
    return buildTemplateEcu(bus);
  }

  function getEcuDisplayLabel(ecu, bus) {
    const isEth = bus && (bus.type === "ethernet" || bus.id === "eth1");
    const rawAddr = isEth ? ecu.logicAddr : (ecu.requestAddr || ecu.nadAddr);
    if (!rawAddr) return ecu.name;
    let addr = String(rawAddr).trim();
    if (!addr.toLowerCase().startsWith("0x")) {
      addr = "0x" + addr;
    }
    return `${ecu.name} (${addr})`;
  }

  function updateTitleBreadcrumb(ecu, bus) {
    const win = root.closest(".workspace-window");
    if (win) {
      const titleEl = win.querySelector(".window-title");
      if (titleEl) {
        if (ecu) {
          const busName = bus ? bus.name : "";
          let addrPart = "";
          if (bus && (bus.type === "ethernet" || bus.id === "eth1")) {
            addrPart = ecu.logicAddr ? ecu.logicAddr.replace(/^0[xX]/, "") : "";
          } else {
            const req = (ecu.requestAddr || ecu.nadAddr || "").replace(/^0[xX]/, "");
            const resp = (ecu.responseAddr || "").replace(/^0[xX]/, "");
            addrPart = resp ? `${req}/${resp}` : req;
          }
          titleEl.innerHTML = `<i class="fa-solid fa-terminal"></i> 基础诊断 <span style="margin: 0 4px; color: #94a3b8; font-weight: normal;">&gt;</span> <span style="font-size: 11px; font-weight: normal; color: #475569; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${esc(ecu.name)} - (${esc(addrPart)}) - ${esc(busName)}</span>`;
        } else {
          titleEl.innerHTML = `<i class="fa-solid fa-terminal"></i> 基础诊断`;
        }
      }
    }
  }

  function shouldShowPdxTab() {
    const ecu = getSelectedEcu();
    if (!ecu) return false;
    if (ecu.id === "__tpl__") {
      return false;
    }
    return true;
  }

  function isEthernet() {
    const bus = getSelectedBus();
    return bus && bus.type === "ethernet";
  }

  function getIconClass(type) {
    const map = { can: "fa-solid fa-road", canfd: "fa-solid fa-road", ethernet: "fa-solid fa-network-wired", lin: "fa-solid fa-link", ecu: "fa-solid fa-microchip", slave: "fa-solid fa-cube", master: "fa-solid fa-crown" };
    return map[type] || "fa-solid fa-microchip";
  }

  function buildHexForCurrentService() {
    if (state.selectedServiceIdx === CUSTOM_SERVICE_IDX) return "";
    const svc = UDS_SERVICES[state.selectedServiceIdx];
    if (!svc) return "";
    const sub = state.subFunctionValues[state.selectedServiceIdx];
    const extra = state.extraParamValues[state.selectedServiceIdx];
    const dids = Object.keys(state.selectedDids).filter(k => state.selectedDids[k]);
    if (svc.paramType === "didSelect") return svc.buildRequest(sub, extra, dids);
    if (svc.paramType === "didWrite") return svc.buildRequest(sub, extra, null, state.writeDid, state.writeData);
    if (svc.paramType === "didIoControl") return svc.buildRequest(sub, extra, null, state.ioDid, state.ioState);
    return svc.buildRequest(sub, extra, dids, state.writeDid, state.writeData, state.dtcNumber, state.dtcRecordNum);
  }

  /* ============================
     Render: Tree
     ============================ */
  function renderTree() {
    const buses = getBusConfig();

    return `
      <aside class="basic-diag-left">
        <div class="basic-diag-tree-toolbar">
          <button class="basic-diag-tree-toolbar__import" data-role="bd-import-pdx" title="导入PDX">
            <i class="fa-solid fa-file-arrow-up"></i>
            <span>导入PDX</span>
          </button>
        </div>
        <div class="basic-diag-tree">
          ${buses.map(bus => {
            const expanded = state.expandedBusIds.includes(bus.id);
            const isBusActive = state.selectedBusId === bus.id && !state.selectedEcuId;
            return `
              <div class="basic-diag-tree-group">
                <div class="basic-diag-tree-node ${isBusActive ? "is-active" : ""}">
                  <button class="basic-diag-tree-toggle" data-role="bd-toggle-bus" data-bus-id="${esc(bus.id)}">
                    ${expanded ? "−" : "+"}
                  </button>
                  <button class="basic-diag-tree-label" data-role="bd-pick-bus" data-bus-id="${esc(bus.id)}">
                    <i class="${getIconClass(bus.type)}"></i>
                    <span>${esc(bus.name)}</span>
                    <span class="basic-diag-tree-label__baud">${esc(bus.baudrate || "")}</span>
                  </button>
                  ${(bus.id === "can1" || bus.type === "can" || bus.type === "canfd") ? `
                    <button class="basic-diag-switch-btn" type="button" data-role="bd-toggle-bus-protocol" data-bus-id="${esc(bus.id)}" title="切换为 ${bus.type === "can" ? "CANFD" : "CAN"}">
                      <i class="fa-solid fa-right-left"></i>
                    </button>
                  ` : ""}
                </div>
                <div class="basic-diag-tree-children ${expanded ? "" : "is-collapsed"}">
                  ${(bus.children || []).map(ecu => {
                    const isActive = state.selectedBusId === bus.id && state.selectedEcuId === ecu.id;
                    return `
                      <button class="basic-diag-tree-child ${isActive ? "is-active" : ""}"
                        data-role="bd-pick-ecu" data-bus-id="${esc(bus.id)}" data-ecu-id="${esc(ecu.id)}">
                        <i class="${getIconClass(ecu.type)}"></i>
                        <span>${esc(getEcuDisplayLabel(ecu, bus))}</span>
                      </button>`;
                  }).join("")}
                </div>
              </div>`;
          }).join("")}
        </div>
        <button class="basic-diag-toggle-pane" data-role="bd-toggle-pane" title="${state.treeCollapsed ? "展开列表" : "收起列表"}">
          <i class="fa-solid ${state.treeCollapsed ? "fa-chevron-right" : "fa-chevron-left"}"></i>
        </button>
      </aside>`;
  }

  /* ============================
     Render: Address Bar
     ============================ */
  function renderAddrBar() {
    const ecu = getSelectedEcu();
    const bus = getSelectedBus();
    if (!ecu) return `<div class="basic-diag-addr-bar"><span style="color:#999;">请在左侧选择一个 ECU</span></div>`;

    const eth = isEthernet();
    
    // Format request address with 0x prefix for display
    let reqDisplay = "";
    if (ecu.requestAddr || ecu.nadAddr) {
      const raw = ecu.requestAddr || ecu.nadAddr;
      reqDisplay = String(raw).toLowerCase().startsWith("0x") ? raw : "0x" + raw;
    }
    
    // Format response address with 0x prefix for display
    let respDisplay = "";
    if (ecu.responseAddr) {
      const raw = ecu.responseAddr;
      respDisplay = String(raw).toLowerCase().startsWith("0x") ? raw : "0x" + raw;
    }

    return `
      <div class="basic-diag-addr-bar">
        <span class="basic-diag-addr-bar__ecu-name"><i class="fa-solid fa-microchip"></i>${esc(ecu.name)}</span>
        
        <!-- 通讯保持 -->
        <div class="basic-diag-addr-bar__group" style="flex-direction: row; align-items: center; gap: 6px; padding: 0 8px;">
          <input type="checkbox" id="bd-comm-hold-check" ${state.commHold.active ? "checked" : ""} style="width: 14px; height: 14px; margin: 0; cursor: pointer;" />
          <button class="basic-diag-comm-hold-btn" type="button" data-role="bd-comm-hold-settings">通讯保持</button>
        </div>

        ${eth ? `
          <div class="basic-diag-addr-bar__group">
            <span>逻辑地址</span>
            <input type="text" id="bd-addr-logic" value="${esc(ecu.logicAddr || "")}" style="font-family:Consolas,monospace;" />
          </div>
          <div class="basic-diag-addr-bar__group">
            <span>IP地址</span>
            <input type="text" id="bd-addr-ip" value="${esc(ecu.ip || "")}" style="font-family:Consolas,monospace;" />
          </div>
        ` : `
          <div class="basic-diag-addr-bar__group">
            <span>请求地址</span>
            <input type="text" id="bd-addr-request" value="${esc(reqDisplay)}" style="font-family:Consolas,monospace;" />
          </div>
          <div class="basic-diag-addr-bar__group">
            <span>响应地址</span>
            <input type="text" id="bd-addr-response" value="${esc(respDisplay)}" style="font-family:Consolas,monospace;" />
          </div>
          
          <!-- 29bit ID Checkbox -->
          <div class="basic-diag-addr-bar__group" style="flex-direction: row; align-items: center; gap: 6px; padding: 0 8px;">
            <input type="checkbox" id="bd-comm-29bit-check" ${ecu.is29bit ? "checked" : ""} style="width: 14px; height: 14px; margin: 0; cursor: pointer;" />
            <span style="font-size: 12px; color: #4d5f76; cursor: pointer; user-select: none;" onclick="document.getElementById('bd-comm-29bit-check').click()">29bit ID</span>
          </div>
        `}
        <div class="basic-diag-addr-bar__spacer"></div>
        <button class="basic-diag-sec-algo-btn ${state.secAlgoOpen ? "is-active" : ""}" data-role="bd-toggle-sec-algo" title="安全算法">
          <i class="fa-solid fa-shield-halved"></i> 安全算法
        </button>
      </div>`;
  }

  /* ============================
     Render: Security Algorithm Dialog
     ============================ */
  function renderSecAlgoDialog() {
    if (!state.secAlgoOpen) return "";
    const sa = state.secAlgo;
    const posStyle = state.secAlgoPos
      ? `top:${state.secAlgoPos.top}px;right:auto;left:${state.secAlgoPos.left}px;`
      : "";

    const buses = getBusConfig();
    const selectedBus = buses.find(b => b.id === sa.busId) || buses[0];
    const isTemplateEcuInDialog = sa.ecuId === "__tpl__";
    
    // Find the DLL file of the selected ECU in the dialog
    let ecuDllName = "GWM_SA.dll";
    if (!isTemplateEcuInDialog && selectedBus) {
      const childEcu = (selectedBus.children || []).find(e => e.id === sa.ecuId);
      if (childEcu && childEcu.secAlgoDllPath) {
        ecuDllName = childEcu.secAlgoDllPath.substring(childEcu.secAlgoDllPath.lastIndexOf('\\') + 1) || "GWM_SA.dll";
      }
    }

    return `
      <div class="basic-diag-sec-algo-dialog" style="${posStyle}">
        <div class="basic-diag-sec-algo-dialog__header" data-role="bd-sec-drag-handle">
          <span><i class="fa-solid fa-shield-halved"></i> 安全算法配置</span>
          <button class="basic-diag-sec-algo-dialog__close" data-role="bd-close-sec-algo" title="关闭">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="basic-diag-sec-algo-dialog__body">
          
          <!-- 目标 ECU -->
          <div class="sec-algo-section">
            <div class="sec-algo-section-title">目标 ECU</div>
            <div class="sec-algo-row" style="margin-bottom: 8px;">
              <span class="sec-algo-label">总线:</span>
              <select class="sec-algo-select" id="bd-sec-bus-select">
                ${buses.map(b => `<option value="${esc(b.id)}" ${b.id === sa.busId ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
              </select>
            </div>
            <div class="sec-algo-row">
              <span class="sec-algo-label">ECU:</span>
              <select class="sec-algo-select" id="bd-sec-ecu-select">
                ${(selectedBus.children || []).map(e => `<option value="${esc(e.id)}" ${e.id === sa.ecuId ? "selected" : ""}>${esc(e.name)}</option>`).join("")}
                <option value="__tpl__" ${isTemplateEcuInDialog ? "selected" : ""}>ECU1</option>
              </select>
            </div>
          </div>

          <!-- 算法类型 -->
          <div class="sec-algo-section">
            <div class="sec-algo-section-title">算法类型</div>
            <div class="sec-algo-radio-group">
              <label class="sec-algo-radio-label">
                <input type="radio" name="bd-sec-algo-type" value="4bytes" ${sa.algoType === "4bytes" ? "checked" : ""} />
                <span>4字节安全算法</span>
              </label>
              <label class="sec-algo-radio-label">
                <input type="radio" name="bd-sec-algo-type" value="16bytes" ${sa.algoType === "16bytes" ? "checked" : ""} />
                <span>16字节安全算法</span>
              </label>
            </div>
          </div>

          <!-- 算法等级 -->
          <div class="sec-algo-section">
            <div class="sec-algo-section-title">算法等级</div>
            ${isTemplateEcuInDialog ? `
              <input type="text" class="basic-diag-sec-algo-input" value="${esc(sa.levelManual || '')}" id="bd-sec-level-input" placeholder="请输入算法等级" style="height: 30px;" />
            ` : `
              <select class="sec-algo-select" id="bd-sec-level-select" style="width: 100%;">
                <option value="01" ${sa.level === "01" ? "selected" : ""}>Level 01 (0x01/0x02)</option>
                <option value="03" ${sa.level === "03" ? "selected" : ""}>Level 03 (0x03/0x04)</option>
                <option value="05" ${sa.level === "05" ? "selected" : ""}>Level 05 (0x05/0x06)</option>
                <option value="09" ${sa.level === "09" ? "selected" : ""}>Level 09 (0x09/0x0A)</option>
                <option value="11" ${sa.level === "11" ? "selected" : ""}>Level 11 (0x11/0x12)</option>
              </select>
            `}
          </div>

          <!-- 安全掩码 (选填) -->
          <div class="sec-algo-section">
            <div class="sec-algo-section-title">安全掩码 (选填)</div>
            <input type="text" class="basic-diag-sec-algo-input" value="${esc(sa.mask)}" id="bd-sec-mask-input" placeholder="00 00 00 00" style="height: 30px; font-family: Consolas, monospace;" />
          </div>

          <!-- 算法文件 -->
          <div class="sec-algo-section">
            <div class="sec-algo-section-title">算法文件</div>
            ${sa.algoType === "16bytes" ? `
              <div style="font-size: 12px; color: #334155; padding-left: 2px; font-weight: 500;">云端计算</div>
            ` : `
              <div class="sec-algo-radio-group-vertical">
                <label class="sec-algo-radio-label-vertical">
                  <input type="radio" name="bd-sec-file-source" value="ecuFile" ${sa.fileSource === "ecuFile" ? "checked" : ""} />
                  <span>使用该ECU通讯设置文件 <span style="color: #64748b; font-family: Consolas, monospace; margin-left: 4px;">${esc(ecuDllName)}</span></span>
                </label>
                <label class="sec-algo-radio-label-vertical" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="radio" name="bd-sec-file-source" value="localFile" ${sa.fileSource === "localFile" ? "checked" : ""} />
                    <span>重新上传本地DLL文件</span>
                  </div>
                  ${sa.fileSource === "localFile" ? `
                    <button class="basic-diag-sec-algo-file-btn" id="bd-sec-upload-btn" title="上传DLL" style="width: 24px; height: 24px; font-size: 11px;">
                      <i class="fa-solid fa-folder-open"></i>
                    </button>
                  ` : ""}
                </label>
                ${(sa.fileSource === "localFile" && sa.localDllPath) ? `
                  <div style="font-size: 11px; color: #2563eb; font-family: Consolas, monospace; padding-left: 20px; margin-top: 2px; word-break: break-all;">
                    已选择: ${esc(sa.localDllPath.substring(sa.localDllPath.lastIndexOf('\\') + 1))}
                  </div>
                ` : ""}
              </div>
            `}
          </div>

        </div>
        <div class="basic-diag-sec-algo-dialog__footer">
          <button class="basic-diag-sec-algo-send" id="bd-sec-send-btn">
            <i class="fa-solid fa-paper-plane"></i> 发送安全算法
          </button>
        </div>
      </div>`;
  }

  /* ============================
     Render: Tabs
     ============================ */
  function renderTabs() {
    const showPdx = shouldShowPdxTab();
    return `
      <div class="basic-diag-tabs">
        <button class="basic-diag-tab ${state.activeTab === "service" ? "is-active" : ""}" data-role="bd-tab" data-tab="service">
          <i class="fa-solid fa-terminal" style="margin-right:4px;"></i>服务
        </button>
        ${showPdx ? `
          <button class="basic-diag-tab ${state.activeTab === "pdx" ? "is-active" : ""}" data-role="bd-tab" data-tab="pdx">
            <i class="fa-solid fa-file-circle-check" style="margin-right:4px;"></i>PDX校验
          </button>
        ` : ""}
        <button class="basic-diag-tab ${state.activeTab === "comm" ? "is-active" : ""}" data-role="bd-tab" data-tab="comm">
          <i class="fa-solid fa-gears" style="margin-right:4px;"></i>通讯参数
        </button>
      </div>`;
  }

  /* ============================
     Render: Service List
     ============================ */
  function renderServiceList() {
    return `
      <div class="basic-diag-svc-list" style="flex:${state.svcColWidths[0]}; display:${state.svcColWidths[0] <= 0.001 ? 'none' : 'block'}; width:auto; min-width:0; border-right:none; overflow-y:auto;">
        <button class="basic-diag-svc-item ${state.selectedServiceIdx === CUSTOM_SERVICE_IDX ? "is-active" : ""}" data-role="bd-pick-svc" data-svc-idx="${CUSTOM_SERVICE_IDX}">
          <span class="basic-diag-svc-item__sid basic-diag-svc-item__sid--custom">HEX</span>
          自定义
        </button>
        ${UDS_SERVICES.map((svc, idx) => {
          const active = idx === state.selectedServiceIdx;
          return `
            <button class="basic-diag-svc-item ${active ? "is-active" : ""}" data-role="bd-pick-svc" data-svc-idx="${idx}">
              <span class="basic-diag-svc-item__sid">${esc(svc.hex)}</span>
              ${esc(svc.name)}
            </button>`;
        }).join("")}
      </div>`;
  }

  /* ============================
     Render: Param Panel
     ============================ */
  function renderParamPanel() {
    if (state.selectedServiceIdx === CUSTOM_SERVICE_IDX) return "";
    const svc = UDS_SERVICES[state.selectedServiceIdx];
    if (!svc) return '<div class="basic-diag-param"></div>';

    const isTemplateEcu = state.selectedEcuId === "__tpl__";

    let paramHtml = "";

    if (svc.hex === "10") {
      const curSub = state.subFunctionValues[state.selectedServiceIdx] || svc.defaultSub;
      const curSubValInt = parseInt(curSub, 16);
      const curHex = state.hexInput || `10 ${curSub}`;
      paramHtml = `
        <div class="basic-diag-canoe-tree">
          <div class="canoe-tree-node">
            <span class="canoe-tree-toggle"><i class="fa-regular fa-minus-square"></i></span>
            <span class="canoe-tree-node-hex">${esc(curHex)}</span>
          </div>
          <div class="canoe-tree-children">
            <div class="canoe-tree-leaf">
              <span class="canoe-tree-param-name">ServiceIdentifier</span>
              <span class="canoe-tree-param-val">10</span>
            </div>
            <div class="canoe-tree-leaf is-interactive" style="border: 1px dotted #0078d7; outline: 1px dotted #000;">
              <span class="canoe-tree-param-name">diagnosticSessionType</span>
              <span class="canoe-tree-param-val" id="bd-param-session-val">${curSubValInt}</span>
              <select class="canoe-tree-select" id="bd-session-type-select" style="outline: none;">
                <option value="01" ${curSub === "01" ? "selected" : ""}>defaultSession</option>
                <option value="02" ${curSub === "02" ? "selected" : ""}>ProgrammingSession</option>
                <option value="03" ${curSub === "03" ? "selected" : ""}>extendedDiagnosticSession</option>
              </select>
            </div>
          </div>
        </div>
      `;
    } else if (svc.paramType === "subFunction") {
      const curVal = state.subFunctionValues[state.selectedServiceIdx] || svc.defaultSub;
      paramHtml = `
        <div class="basic-diag-param__row">
          <span class="basic-diag-param__label">子功能:</span>
          <select class="basic-diag-select" data-role="bd-subfunc" style="min-width: 200px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; outline: none; background: #fff;">
            ${svc.subFunctions.map(sf => `
              <option value="${esc(sf.value)}" ${sf.value === curVal ? "selected" : ""}>
                ${esc(sf.label)}
              </option>
            `).join("")}
          </select>
        </div>`;
      if (svc.extraParam) {
        const extraVal = state.extraParamValues[state.selectedServiceIdx] || svc.extraParam.default;
        if (svc.hex === "31") {
          const cleanRid = String(extraVal).replace(/\s+/g, '').toUpperCase();
          const ridItem = RID_DATASOURCE.find(r => r.id === cleanRid);
          const ridName = ridItem ? ridItem.name : "未知例程";
          paramHtml += `
            <div class="basic-diag-param__row" style="margin-top: 8px;">
              <span class="basic-diag-param__label">例程ID:</span>
              <div class="basic-diag-did-picker" style="display:flex; gap:8px; align-items:center;">
                <input type="text" value="${esc(extraVal)}" data-role="bd-did-picker-val-31" style="font-family:Consolas,monospace; font-size:12px; padding:4px 8px; border:1px solid #ccc; border-radius:4px; width:100px; background:#fff; text-align:center;" />
                <span id="bd-rid-name-label-31" style="font-size:12px; color:#555;">${esc(ridName)}</span>
                <button type="button" class="basic-diag-btn-select-did" data-service="31" ${isTemplateEcu ? 'disabled style="background:#94a3b8; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:not-allowed; opacity:0.65;"' : 'style="background:#2f6bff; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:pointer;"'}>选择例程ID</button>
              </div>
            </div>`;
        } else if (svc.hex === "19") {
          if (curVal === "04" || curVal === "06") {
            const cleanDtc = String(state.dtcNumber).replace(/\s+/g, '').toUpperCase();
            const dtcItem = PDX_MOCK_DTCS.find(d => d.hex.replace(/\s+/g, '').toUpperCase() === cleanDtc);
            const dtcDesc = dtcItem ? dtcItem.desc : "未知故障码";
            paramHtml += `
              <div class="basic-diag-param__row" style="margin-top: 8px;">
                <span class="basic-diag-param__label">故障码:</span>
                <div class="basic-diag-did-picker" style="display:flex; gap:8px; align-items:center;">
                  <input type="text" value="${esc(state.dtcNumber)}" data-role="bd-dtc-picker-val" style="font-family:Consolas,monospace; font-size:12px; padding:4px 8px; border:1px solid #ccc; border-radius:4px; width:100px; background:#fff; text-align:center;" />
                  <span id="bd-dtc-desc-label-19" style="font-size:12px; color:#555;">${esc(dtcDesc)}</span>
                  <button type="button" class="basic-diag-btn-select-did" data-service="19" ${isTemplateEcu ? 'disabled style="background:#94a3b8; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:not-allowed; opacity:0.65;"' : 'style="background:#2f6bff; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:pointer;"'}>选择故障码</button>
                </div>
              </div>
              <div class="basic-diag-param__row" style="margin-top: 8px;">
                <span class="basic-diag-param__label">编号:</span>
                <input type="text" value="${esc(state.dtcRecordNum)}" data-role="bd-dtc-record-num"
                  style="font-family:Consolas,monospace;font-size:12px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;width:60px;" />
              </div>`;
          } else if (curVal === "01" || curVal === "02") {
            paramHtml += `
              <div class="basic-diag-param__row" style="margin-top: 8px;">
                <span class="basic-diag-param__label">${esc(svc.extraParam.label)}:</span>
                <input type="text" value="${esc(extraVal)}" data-role="bd-extra-param"
                  style="font-family:Consolas,monospace;font-size:11px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;width:80px;" />
              </div>`;
          }
        } else {
          paramHtml += `
            <div class="basic-diag-param__row" style="margin-top: 8px;">
              <span class="basic-diag-param__label">${esc(svc.extraParam.label)}:</span>
              <input type="text" value="${esc(extraVal)}" data-role="bd-extra-param"
                style="font-family:Consolas,monospace;font-size:11px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;width:80px;" />
            </div>`;
        }
      }
    } else if (svc.paramType === "dtcGroup") {
      const groupVal = state.extraParamValues[state.selectedServiceIdx] || svc.defaultGroup;
      paramHtml = `
        <div class="basic-diag-param__row">
          <span class="basic-diag-param__label">groupOfDTC:</span>
          <input type="text" value="${esc(groupVal)}" data-role="bd-extra-param"
            style="font-family:Consolas,monospace;font-size:11px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;width:100px;" />
          <span style="font-size:10px;color:#999;">FF FF FF = 全部DTC</span>
        </div>`;
    } else if (svc.paramType === "didSelect") {
      const activeDid = Object.keys(state.selectedDids).find(k => state.selectedDids[k]) || "F189";
      const didItem = DID_DATASOURCE.find(d => d.id === activeDid);
      const didName = didItem ? didItem.name : "未知识别符";
      paramHtml = `
        <div class="basic-diag-param__row">
          <span class="basic-diag-param__label">选择DID:</span>
          <div class="basic-diag-did-picker" style="display:flex; gap:8px; align-items:center;">
            <input type="text" value="${esc(activeDid)}" data-role="bd-did-picker-val-22" style="font-family:Consolas,monospace; font-size:12px; padding:4px 8px; border:1px solid #ccc; border-radius:4px; width:100px; background:#fff; text-align:center;" />
            <span id="bd-did-name-label-22" style="font-size:12px; color:#555;">${esc(didName)}</span>
            <button type="button" class="basic-diag-btn-select-did" data-service="22" ${isTemplateEcu ? 'disabled style="background:#94a3b8; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:not-allowed; opacity:0.65;"' : 'style="background:#2f6bff; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:pointer;"'}>选择DID</button>
          </div>
        </div>`;
    } else if (svc.paramType === "didWrite") {
      const didItem = DID_DATASOURCE.find(d => d.id === state.writeDid);
      const didName = didItem ? didItem.name : "未知识别符";
      paramHtml = `
        <div class="basic-diag-param__row">
          <span class="basic-diag-param__label">DID:</span>
          <div class="basic-diag-did-picker" style="display:flex; gap:8px; align-items:center;">
            <input type="text" value="${esc(state.writeDid)}" data-role="bd-write-did" style="font-family:Consolas,monospace; font-size:12px; padding:4px 8px; border:1px solid #ccc; border-radius:4px; width:100px; background:#fff; text-align:center;" />
            <span id="bd-did-name-label-2E" style="font-size:12px; color:#555;">${esc(didName)}</span>
            <button type="button" class="basic-diag-btn-select-did" data-service="2E" ${isTemplateEcu ? 'disabled style="background:#94a3b8; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:not-allowed; opacity:0.65;"' : 'style="background:#2f6bff; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:pointer;"'}>选择DID</button>
          </div>
        </div>
        <div class="basic-diag-param__row" style="margin-top: 8px;">
          <span class="basic-diag-param__label">数据:</span>
          <input type="text" value="${esc(state.writeData)}" data-role="bd-write-data"
            style="font-family:Consolas,monospace;font-size:12px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;flex:1;min-width:100px;" />
        </div>`;
    } else if (svc.paramType === "didIoControl") {
      const curIoVal = state.subFunctionValues[state.selectedServiceIdx] || "03";
      const didItem = DID_DATASOURCE.find(d => d.id === state.ioDid);
      const didName = didItem ? didItem.name : "未知识别符";
      paramHtml = `
        <div class="basic-diag-param__row">
          <span class="basic-diag-param__label">DID:</span>
          <div class="basic-diag-did-picker" style="display:flex; gap:8px; align-items:center;">
            <input type="text" value="${esc(state.ioDid)}" data-role="bd-io-did" style="font-family:Consolas,monospace; font-size:12px; padding:4px 8px; border:1px solid #ccc; border-radius:4px; width:100px; background:#fff; text-align:center;" />
            <span id="bd-did-name-label-2F" style="font-size:12px; color:#555;">${esc(didName)}</span>
            <button type="button" class="basic-diag-btn-select-did" data-service="2F" ${isTemplateEcu ? 'disabled style="background:#94a3b8; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:not-allowed; opacity:0.65;"' : 'style="background:#2f6bff; color:#fff; border:none; border-radius:4px; padding:4px 12px; font-size:12px; cursor:pointer;"'}>选择DID</button>
          </div>
        </div>
        <div class="basic-diag-param__row" style="margin-top: 8px;">
          <span class="basic-diag-param__label">控制参数:</span>
          <select class="basic-diag-select" data-role="bd-subfunc" style="min-width: 180px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; outline: none; background: #fff;">
            <option value="00" ${curIoVal === "00" ? "selected" : ""}>00 ReturnControlToECU (交回控制权)</option>
            <option value="01" ${curIoVal === "01" ? "selected" : ""}>01 ResetToDefault (复位默认值)</option>
            <option value="02" ${curIoVal === "02" ? "selected" : ""}>02 FreezeCurrentState (冻结当前状态)</option>
            <option value="03" ${curIoVal === "03" ? "selected" : ""}>03 ShortTermAdjustment (短期调整/执行控制)</option>
          </select>
        </div>
        <div class="basic-diag-param__row" id="bd-io-state-row" style="margin-top: 8px; ${curIoVal === '03' ? '' : 'display: none;'}">
          <span class="basic-diag-param__label">控制状态:</span>
          <input type="text" value="${esc(state.ioState)}" data-role="bd-io-state"
            style="font-family:Consolas,monospace;font-size:12px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;width:100px;" />
        </div>`;
    }

    return `
      <div class="basic-diag-param">
        <div class="basic-diag-param__title">
          <span class="basic-diag-svc-item__sid" style="font-size:11px;">${esc(svc.hex)}</span>
          ${esc(svc.label)} (${esc(svc.name)})
        </div>
        ${paramHtml}
      </div>`;
  }

  /* ============================
     Render: Request Bar
     ============================ */
  function renderReqBar() {
    const hex = state.hexInput || buildHexForCurrentService();
    const isCustom = state.selectedServiceIdx === CUSTOM_SERVICE_IDX;
    return `
      <div class="basic-diag-req-bar ${isCustom ? "basic-diag-req-bar--custom" : ""}">
        <input class="basic-diag-req-bar__input" type="text" value="${esc(hex)}" data-role="bd-hex-input" placeholder="${isCustom ? "请输入自定义 HEX 请求数据" : "HEX 请求数据"}" />
        <label class="basic-diag-req-bar__chk">
          <input type="checkbox" ${state.funcAddr ? "checked" : ""} data-role="bd-func-addr" />
          功能寻址
        </label>
        <button class="basic-diag-req-bar__btn basic-diag-req-bar__btn--send" data-role="bd-send">
          <i class="fa-solid fa-paper-plane" style="margin-right:4px;"></i>发送
        </button>
      </div>`;
  }

  /* ============================
     Render: Response
     ============================ */
  function renderResponse() {
    const resp = state.lastResponse;
    if (!resp) return `<div class="basic-diag-resp"><div class="basic-diag-resp-empty"><i class="fa-solid fa-inbox"></i> 发送请求后，响应将显示在这里</div></div>`;

    if (state.selectedServiceIdx !== CUSTOM_SERVICE_IDX) {
      const svc = UDS_SERVICES[state.selectedServiceIdx];
      if (svc && svc.hex === "10" && resp.positive) {
        return `
          <div class="basic-diag-resp">
            <div class="basic-diag-resp__title"><i class="fa-solid fa-check-circle" style="color:#5cb85c;margin-right:4px;"></i>正响应</div>
            <div class="basic-diag-canoe-tree">
              <div class="canoe-tree-node">
                <span class="canoe-tree-toggle"><i class="fa-regular fa-minus-square"></i></span>
                <span class="canoe-tree-node-hex">${esc(resp.raw)}</span>
              </div>
              <div class="canoe-tree-children">
                <div class="canoe-tree-leaf">
                  <span class="canoe-tree-param-name">ServiceIdentifier</span>
                  <span class="canoe-tree-param-val">50</span>
                </div>
                <div class="canoe-tree-leaf">
                  <span class="canoe-tree-param-name">diagnosticSessionType</span>
                  <span class="canoe-tree-param-val">0</span>
                </div>
                <div class="canoe-tree-leaf">
                  <span class="canoe-tree-param-name">P2CanServerMax</span>
                  <span class="canoe-tree-param-val">0</span>
                </div>
                <div class="canoe-tree-leaf">
                  <span class="canoe-tree-param-name">P2EnhancedCanServerMax</span>
                  <span class="canoe-tree-param-val">0</span>
                </div>
              </div>
            </div>
            <div class="basic-diag-resp-raw">RAW: ${esc(resp.raw)}</div>
          </div>`;
      }
    }

    return `
      <div class="basic-diag-resp">
        <div class="basic-diag-resp__title"><i class="fa-solid fa-check-circle" style="color:${resp.positive ? "#5cb85c" : "#d9534f"};margin-right:4px;"></i>${resp.positive ? "正响应" : "负响应"}</div>
        <div class="basic-diag-resp-tree">
          <div class="basic-diag-resp-tree__node">
            ${(resp.fields || []).map(([key, val]) => `
              <div class="basic-diag-resp-tree__leaf">
                <span class="basic-diag-resp-tree__key">${esc(key)}</span>
                <span class="basic-diag-resp-tree__val">${esc(val)}</span>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="basic-diag-resp-raw">RAW: ${esc(resp.raw)}</div>
      </div>`;
  }

  /* ============================
     Render: Log
     ============================ */
  function renderLog() {
    return `
      <div class="basic-diag-log" style="flex:${state.svcColWidths[2]}; display:${state.svcColWidths[2] <= 0.001 ? 'none' : 'flex'}; width:auto; min-width:0; border-left:none;">
        <div class="basic-diag-log__header">
          <span><i class="fa-solid fa-list" style="margin-right:4px;"></i>收发日志 (${state.logEntries.length})</span>
          <button class="basic-diag-log__clear" data-role="bd-clear-log"><i class="fa-solid fa-trash-can" style="margin-right:3px;"></i>清空</button>
        </div>
        <div class="basic-diag-log__body">
          <table>
            <thead>
              <tr><th style="width:36px;">#</th><th style="width:90px;">时间</th><th style="width:30px;">方向</th><th>数据</th></tr>
            </thead>
            <tbody>
              ${state.logEntries.map(e => `
                <tr class="${e.dir === "Tx" ? "is-tx" : e.dir === "Err" ? "is-err" : "is-rx"}">
                  <td>${e.seq}</td>
                  <td>${esc(e.time)}</td>
                  <td>${esc(e.dir)}</td>
                  <td>${esc(e.data)}</td>
                </tr>
              `).join("")}
              ${state.logEntries.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#ccc;padding:12px;">暂无日志</td></tr>' : ""}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ============================
     Render: Flow Panel
     ============================ */
  function renderFlowPanel() {
    const steps = state.flowSteps;
    const running = state.flowRunning;
    const rows = steps.map((step, i) => {
      const isRunning = running && state.flowCurrentIdx === i;
      const isSelected = i === state.flowSelectedIdx;
      
      let reqContent = esc(step.hex);
      if (step.type === 'delay') {
        reqContent = `<div style="display:flex;align-items:center;gap:4px;">延时 <input type="number" class="flow-delay-input" data-flow-idx="${i}" value="${step.delayMs || 100}" style="width:60px;height:20px;text-align:center;padding:2px;border:1px solid #c8d1dc;border-radius:3px;font-size:11px;" /> ms</div>`;
      }

      // 成对的自动安全算法步骤隐藏第二个的删除按钮
      const isAutoSecKey = step.autoSecGroup && steps.filter(x => x.autoSecGroup === step.autoSecGroup)[0] !== step;

      return `
        <tr class="${isRunning ? 'is-running' : ''} ${isSelected ? 'is-selected' : ''}" data-role="bd-flow-row" data-flow-idx="${i}" style="cursor:pointer;">
          <td><input type="checkbox" class="flow-check" data-role="bd-flow-check" data-flow-idx="${i}" ${step.enabled ? 'checked' : ''} /></td>
          <td>${i}</td>
          <td class="flow-hex">${reqContent}</td>
          <td class="flow-resp ${step.respOk === true ? 'is-ok' : step.respOk === false ? 'is-err' : ''}">${step.type === 'delay' ? (step.response || '等待执行') : esc(step.response || '')}</td>
          <td>
            ${isAutoSecKey ? '' : `<button class="basic-diag-flow-delete" data-role="bd-flow-delete" data-flow-idx="${i}" title="删除"><i class="fa-solid fa-xmark"></i></button>`}
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="basic-diag-flow">
        <div class="basic-diag-flow-toolbar">
          <span class="basic-diag-flow-toolbar__title"><i class="fa-solid fa-list-ol"></i> 指令序列 (${steps.length})</span>
          <button class="basic-diag-flow-btn basic-diag-flow-btn--primary" data-role="bd-flow-run" ${running ? '' : (steps.length === 0 ? 'disabled' : '')}>
            <i class="fa-solid ${running ? 'fa-stop' : 'fa-play'}"></i> ${running ? '停止' : '执行'}
          </button>
          <button class="basic-diag-flow-btn basic-diag-flow-btn--danger" data-role="bd-flow-clear" ${steps.length === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-trash-can"></i> 清空
          </button>
          <button class="basic-diag-flow-btn" data-role="bd-flow-save" ${steps.length === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-download"></i> 保存
          </button>
          <button class="basic-diag-flow-btn" data-role="bd-flow-load">
            <i class="fa-solid fa-upload"></i> 打开
          </button>
          <input type="file" id="bd-flow-file-input" accept=".json" hidden />
          <div class="basic-diag-flow-interval">
            <span>间隔</span>
            <input type="number" value="${state.flowInterval}" data-role="bd-flow-interval" min="0" max="10000" />
            <span>ms</span>
          </div>
        </div>
        <div class="basic-diag-flow-main" style="display:flex; flex:1; overflow:hidden; min-height:0;">
          <!-- 左侧垂直操作栏 -->
          <div class="basic-diag-flow-left-bar" style="display:flex; flex-direction:column; align-items:center; gap:12px; padding:12px 8px; border-right:1px solid #e1e6eb; background:#f8fafc; flex-shrink:0;">
            <button class="basic-diag-flow-action-btn" data-role="bd-flow-left-add" title="添加当前调试指令" style="border:none; background:transparent; font-size:18px; color:#2f6bff; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; transition:transform 0.1s;"><i class="fa-solid fa-plus"></i></button>
            <button class="basic-diag-flow-action-btn" data-role="bd-flow-left-delete" title="删除选中步骤" style="border:none; background:transparent; font-size:18px; color:#d9534f; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; transition:transform 0.1s;"><i class="fa-solid fa-xmark"></i></button>
            <button class="basic-diag-flow-action-btn" data-role="bd-flow-left-up" title="上移步骤" style="border:none; background:transparent; font-size:18px; color:#3b82f6; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; transition:transform 0.1s;"><i class="fa-solid fa-circle-arrow-up"></i></button>
            <button class="basic-diag-flow-action-btn" data-role="bd-flow-left-down" title="下移步骤" style="border:none; background:transparent; font-size:18px; color:#3b82f6; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; transition:transform 0.1s;"><i class="fa-solid fa-circle-arrow-down"></i></button>
            <button class="basic-diag-flow-action-btn" data-role="bd-flow-left-delay" title="添加延时" style="border:none; background:transparent; font-size:18px; color:#f59e0b; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; transition:transform 0.1s;"><i class="fa-solid fa-clock"></i></button>
            <button class="basic-diag-flow-action-btn" data-role="bd-flow-left-auto-sec" title="自动安全算法" style="border:none; background:transparent; font-size:18px; color:#10b981; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; transition:transform 0.1s;"><i class="fa-solid fa-shield-halved"></i></button>
          </div>
          <!-- 右侧表格区 -->
          <div class="basic-diag-flow-body" style="flex:1; overflow-y:auto; min-height:0;">
            <table class="basic-diag-flow-table">
              <thead>
                <tr><th style="width:28px;">☑</th><th style="width:36px;">序号</th><th>请求/延时</th><th>响应</th><th style="width:30px;"></th></tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="5" class="basic-diag-flow-empty">使用左侧的 <i class="fa-solid fa-plus"></i> 添加调试指令，<i class="fa-solid fa-shield-halved"></i> 自动安全算法，或 <i class="fa-solid fa-clock"></i> 添加延时</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  /* ============================
     Render: Service Tab
     ============================ */
  function renderServiceTab() {
    const isCustom = state.selectedServiceIdx === CUSTOM_SERVICE_IDX;
    const upperPct = Math.round(state.flowSplitRatio * 100);
    return `
      <div class="basic-diag-tab-body ${state.activeTab === "service" ? "is-active" : ""}" data-tab-body="service">
        <div class="basic-diag-svc-layout">
          ${renderServiceList()}
          
          <!-- 垂直分割条 1 -->
          <div class="basic-diag-svc-vsplitter" data-role="bd-svc-vsplitter-1">
            <span class="basic-diag-svc-vsplitter__dots"></span>
          </div>

          <div class="basic-diag-svc-right" style="flex:${state.svcColWidths[1] + state.svcColWidths[2]}; display:flex; min-width:0;">
            <!-- 左半部分：调试内容与流程组合的上下分割 -->
            <div class="basic-diag-svc-content-wrapper" style="flex:${state.svcColWidths[1]}; display:${state.svcColWidths[1] <= 0.001 ? 'none' : 'flex'}; flex-direction:column; overflow:hidden; min-width:0; border-right:none;">
              <div class="basic-diag-svc-upper" style="flex:${upperPct}; min-height:0; display:${state.flowSplitRatio <= 0.001 ? 'none' : 'flex'}; flex-direction:column; overflow:hidden;">
                <div class="basic-diag-svc-content ${isCustom ? "basic-diag-svc-content--custom" : ""}" style="flex:1;">
                  ${renderParamPanel()}
                  ${renderReqBar()}
                  ${renderResponse()}
                </div>
              </div>
              <div class="basic-diag-svc-splitter" data-role="bd-flow-splitter">
                <span class="basic-diag-svc-splitter__dots"></span>
              </div>
              <div class="basic-diag-svc-lower" style="flex:${100 - upperPct}; min-height:0; height:auto; display:${state.flowSplitRatio >= 0.999 ? 'none' : 'flex'};">
                ${renderFlowPanel()}
              </div>
            </div>

            <!-- 垂直分割条 2 -->
            <div class="basic-diag-svc-vsplitter" data-role="bd-svc-vsplitter-2">
              <span class="basic-diag-svc-vsplitter__dots"></span>
            </div>

            <!-- 右半部分：收发日志 -->
            ${renderLog()}
          </div>
        </div>
      </div>`;
  }

  /* ============================
     Render: PDX Configuration & DTC Details Dialogs
     ============================ */
  function renderPdxConfigDialog() {
    if (!state.pdxConfigVersionOpen) return "";
    const searchQuery = (state.pdxDidSearchQuery || "").toLowerCase().trim();
    const didCheckboxes = PDX_MOCK_DIDS.map(did => {
      const checked = (state.tempSelectedPdxDids && state.tempSelectedPdxDids[did.id] !== undefined)
        ? state.tempSelectedPdxDids[did.id] === true
        : state.selectedPdxDids[did.id] === true;
      const matchesSearch = !searchQuery || did.id.toLowerCase().includes(searchQuery) || did.name.toLowerCase().includes(searchQuery);
      return `
        <label class="pdx-config-item" data-did-id="${esc(did.id)}" data-did-name="${esc(did.name)}" style="display:${matchesSearch ? 'flex' : 'none'}; align-items:center; gap:8px; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:12px; font-weight:500; color:#334155; transition:all 0.15s; user-select:none;">
          <input type="checkbox" class="pdx-config-checkbox" data-did-id="${esc(did.id)}" ${checked ? "checked" : ""} style="width:15px; height:15px; cursor:pointer; accent-color:#2f6bff;" />
          <span style="font-family:Consolas,monospace; font-weight:600; color:#0f172a; min-width:36px;">${esc(did.id)}</span>
          <span style="color:#64748b;">${esc(did.name)}</span>
        </label>`;
    }).join("");

    return `
      <div class="pdx-check-backdrop" data-role="bd-pdx-close-config" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); z-index:9999; display:flex; align-items:center; justify-content:center;">
        <div class="pdx-config-modal-card" style="background:#fff; border-radius:12px; width:480px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden; border:1px solid #e2e8f0;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #f1f5f9; background:#fafafa;">
            <span style="font-size:15px; font-weight:600; color:#0f172a; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-sliders" style="color:#2f6bff;"></i> 配置读取项 (DID 多选配置)</span>
            <button type="button" data-role="bd-pdx-close-config" style="border:none; background:transparent; font-size:18px; color:#94a3b8; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">&times;</button>
          </div>
          <!-- 搜索框 -->
          <div style="padding:12px 20px 8px 20px; background:#fff; border-bottom:1px solid #f1f5f9;">
            <div style="position:relative; display:flex; align-items:center;">
              <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; color:#94a3b8; font-size:13px;"></i>
              <input type="text" id="pdx-did-search-input" value="${esc(state.pdxDidSearchQuery || '')}" placeholder="搜索 DID 编码或描述名称..." style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:8px 12px 8px 34px; font-size:12px; outline:none; transition:all 0.15s; box-sizing:border-box;" />
              <button type="button" id="pdx-did-clear-search" style="position:absolute; right:10px; border:none; background:transparent; color:#94a3b8; cursor:pointer; font-size:14px; padding:4px; display: ${state.pdxDidSearchQuery ? 'block' : 'none'};">&times;</button>
            </div>
          </div>
          <div style="padding:10px 20px; display:flex; gap:8px; border-bottom:1px solid #f1f5f9; background:#fff;">
            <button type="button" data-role="bd-pdx-config-all" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:4px 10px; font-size:11px; font-weight:600; color:#334155; cursor:pointer;">全选</button>
            <button type="button" data-role="bd-pdx-config-none" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:4px 10px; font-size:11px; font-weight:600; color:#334155; cursor:pointer;">全不选</button>
            <button type="button" data-role="bd-pdx-config-invert" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:4px 10px; font-size:11px; font-weight:600; color:#334155; cursor:pointer;">反选</button>
          </div>
          <div style="padding:20px; max-height:320px; overflow-y:auto; display:grid; grid-template-columns:1fr; gap:8px; background:#fff;">
            ${didCheckboxes}
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px; padding:16px 20px; border-top:1px solid #f1f5f9; background:#fcfcfc;">
            <button type="button" data-role="bd-pdx-close-config" style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:6px 16px; font-size:12px; font-weight:600; color:#334155; cursor:pointer;">取消</button>
            <button type="button" data-role="bd-pdx-save-config" style="background:#2f6bff; color:#fff; border:none; border-radius:6px; padding:6px 18px; font-size:12px; font-weight:600; cursor:pointer; box-shadow:0 2px 4px rgba(47,107,255,0.15);">保存配置</button>
          </div>
        </div>
      </div>`;
  }

  function renderDtcDetailsDialog() {
    if (!state.pdxDtcDetailsOpen || !state.pdxSelectedDtcCode) return "";
    const code = state.pdxSelectedDtcCode;
    const details = PDX_DTC_UDS_DETAILS[code];

    const mockDesc = PDX_MOCK_DTCS.find(d => d.code === code)?.desc || "--";
    const mockHex = code === "U029300" ? "C2 93 00" : code === "B10001B" ? "90 00 1B" : (PDX_MOCK_DTCS.find(d => d.code === code)?.hex || "00 00 00");

    if (!details) {
      return `
        <div class="pdx-check-backdrop" data-role="bd-pdx-close-dtc-details" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); z-index:9999; display:flex; align-items:center; justify-content:center;">
          <div style="background:#fff; border-radius:12px; width:450px; padding:24px; text-align:center; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:36px; color:#f59e0b; margin-bottom:12px;"></i>
            <h4 style="margin:0 0 8px 0; font-size:16px; color:#0f172a;">未读取诊断数据</h4>
            <p style="margin:0 0 16px 0; font-size:12px; color:#64748b;">请先执行一键读取或获取故障信息以获取快照与扩展报文。</p>
            <button type="button" data-role="bd-pdx-close-dtc-details" style="background:#2f6bff; color:#fff; border:none; border-radius:6px; padding:6px 16px; font-size:12px; font-weight:600; cursor:pointer;">确定</button>
          </div>
        </div>`;
    }

    const snapshotRows = details.snapshots.map(item => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
        <span style="font-size:12px; color:#64748b; font-weight:500;">${esc(item.name)}</span>
        <strong style="font-size:12px; color:#0f172a; font-family:Consolas, monospace;">${esc(item.value)}</strong>
      </div>`).join("");

    return `
      <div class="pdx-check-backdrop" data-role="bd-pdx-close-dtc-details" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); z-index:9999; display:flex; align-items:center; justify-content:center;">
        <div class="pdx-dtc-modal-card" style="background:#fff; border-radius:12px; width:500px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden; border:1px solid #e2e8f0;">
          <!-- Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #f1f5f9; background:#fafafa;">
            <span style="font-size:15px; font-weight:600; color:#0f172a; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-circle-info" style="color:#d9534f;"></i> 故障码诊断详情 (DTC Inspector)</span>
            <button type="button" data-role="bd-pdx-close-dtc-details" style="border:none; background:transparent; font-size:18px; color:#94a3b8; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">&times;</button>
          </div>
          <!-- Body -->
          <div style="padding:20px; max-height:420px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
            <!-- Meta -->
            <div style="border:1px solid #f1f5f9; background:#fafafa; padding:14px; border-radius:8px; display:grid; grid-template-columns:1fr 1fr; gap:8px 16px;">
              <div><span style="font-size:11px; color:#94a3b8; display:block;">DTC 编码</span><strong style="font-size:14px; color:#0f172a; font-family:Consolas, monospace;">${esc(code)}</strong></div>
              <div><span style="font-size:11px; color:#94a3b8; display:block;">HEX 编码</span><strong style="font-size:14px; color:#0f172a; font-family:Consolas, monospace;">${esc(mockHex)}</strong></div>
              <div style="grid-column: span 2;"><span style="font-size:11px; color:#94a3b8; display:block;">描述</span><strong style="font-size:13px; color:#334155; font-weight:500;">${esc(mockDesc)}</strong></div>
            </div>

            <!-- 19 06 Extended Data -->
            <div>
              <h5 style="margin:0 0 8px 0; font-size:12px; font-weight:600; color:#3b4252; display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-chart-bar" style="color:#337ab7;"></i> UDS 19 06 扩展信息 (Extended Data)</h5>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div style="padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:12px; color:#64748b;">发生次数 (Occurrence Counter)</span>
                  <strong style="font-size:13px; color:#0f172a;">${esc(details.occurrenceCounter)}</strong>
                </div>
                <div style="padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:12px; color:#64748b;">老化计数器 (Aging Counter)</span>
                  <strong style="font-size:13px; color:#0f172a;">${esc(details.agingCounter)}</strong>
                </div>
                <div style="grid-column: span 2; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:12px; color:#64748b;">状态字节 (DTC Status Byte)</span>
                  <strong style="font-size:13px; color:#d9534f; font-family:Consolas, monospace;">0x${esc(details.statusByte)}</strong>
                </div>
              </div>
            </div>

            <!-- 19 04 Freeze Frame -->
            <div>
              <h5 style="margin:0 0 8px 0; font-size:12px; font-weight:600; color:#3b4252; display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-clock-rotate-left" style="color:#d9534f;"></i> UDS 19 04 快照信息冻结帧 (Freeze Frame 01)</h5>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${snapshotRows}
              </div>
            </div>
          </div>
          <!-- Footer -->
          <div style="display:flex; justify-content:flex-end; padding:14px 20px; border-top:1px solid #f1f5f9; background:#fafafa;">
            <button type="button" data-role="bd-pdx-close-dtc-details" style="background:#2f6bff; color:#fff; border:none; border-radius:6px; padding:6px 20px; font-size:12px; font-weight:600; cursor:pointer;">关闭详情</button>
          </div>
        </div>
      </div>`;
  }

  /* ============================
     Render: PDX Tab
     ============================ */
  function renderPdxTab() {
    const ecu = getSelectedEcu();
    const ecuName = ecu ? ecu.name : "--";

    // 正则拆分数值和单位的辅助函数
    function parseValAndUnit(str) {
      if (!str) return { val: "--", unit: "" };
      const match = str.trim().match(/^([\d\.\-]+)\s*(.*)$/);
      if (match) {
        return { val: match[1], unit: match[2] };
      }
      return { val: str, unit: "" };
    }

    const dtcRowsArray = PDX_MOCK_DTCS.map(dtc => {
      const result = state.pdxDtcResults[dtc.code]; // "存在" or "不存在"
      let statusByte = "--";
      let statusClass = "is-pending";
      let rowStyle = "";
      if (result) {
        if (result === "存在") {
          statusByte = PDX_DTC_UDS_DETAILS[dtc.code]?.statusByte || "2F";
          statusClass = "is-present";
          rowStyle = "background-color: #fef2f2; cursor: pointer;";
        } else {
          statusByte = "00";
          statusClass = "is-absent";
          rowStyle = "background-color: #f0fdf4; cursor: pointer;";
        }
      }
      return `
        <tr data-role="bd-pdx-dtc-row" data-dtc-code="${esc(dtc.code)}" style="${rowStyle}" title="点击查看UDS快照与扩展信息">
          <td><span style="border-bottom: 1px dashed #64748b; font-weight:600;">${esc(dtc.code)}</span></td>
          <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${esc(dtc.hex)}</td>
          <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${esc(statusByte)}</td>
          <td>${esc(dtc.desc)}</td>
          <td>
            <span class="basic-diag-pdx-status ${statusClass}">
              ${result ? esc(result) : "--"}
            </span>
          </td>
        </tr>`;
    });

    // Add extra DTC rows if any
    Object.keys(state.pdxDtcExtraResults).forEach(code => {
      const result = state.pdxDtcExtraResults[code]; // "多余"
      const details = PDX_DTC_UDS_DETAILS[code] || { statusByte: "08" };
      const hex = code === "U029300" ? "C2 93 00" : code === "B10001B" ? "90 00 1B" : "00 00 00";
      const desc = code === "U029300" ? "--" : code === "B10001B" ? "--" : "--";
      const statusClass = "is-extra";
      const rowStyle = "background-color: #fefce8; cursor: pointer;";
      dtcRowsArray.push(`
        <tr data-role="bd-pdx-dtc-row" data-dtc-code="${esc(code)}" style="${rowStyle}" title="点击查看UDS快照与扩展信息">
          <td><span style="border-bottom: 1px dashed #b45309; font-weight:600; color: #b45309;">${esc(code)}</span></td>
          <td style="font-family:Consolas,monospace;font-weight:600;color:#b45309;">${esc(hex)}</td>
          <td style="font-family:Consolas,monospace;font-weight:600;color:#b45309;">${esc(details.statusByte)}</td>
          <td style="color: #64748b; font-style: italic;">${esc(desc)} <span style="font-size:10px; color:#f59e0b; padding:1px 4px; border:1px solid #f59e0b; border-radius:3px; margin-left:4px; font-weight:600; font-style: normal;">PDX未定义</span></td>
          <td>
            <span class="basic-diag-pdx-status ${statusClass}">
              ${esc(result)}
            </span>
          </td>
        </tr>`);
    });

    const dtcRows = dtcRowsArray.join("");

    const didRows = PDX_MOCK_DIDS.map(did => {
      const isConfigured = state.selectedPdxDids[did.id] === true;
      const result = state.pdxDidResults[did.id];
      const validationResult = result?.validationResult || "--";
      const isPass = result?.pass === true;
      const isFail = result?.pass === false;
      const flagClass = result ? (isPass ? "is-pass" : "is-fail") : "";
      const validResultClass = validationResult === "通过" ? "is-pass" : validationResult !== "--" ? "is-fail" : "";

      if (!isConfigured) {
        return `
          <tr style="opacity: 0.55; background-color: #f8fafc;">
            <td style="font-family:Consolas,monospace; color: #94a3b8;">${esc(did.id)}</td>
            <td style="color: #94a3b8;">${esc(did.name)}</td>
            <td style="color: #94a3b8;">${esc(did.expected)}</td>
            <td>
              <span style="color: #94a3b8; font-style: italic; font-size:11px;">跳过配置</span>
            </td>
            <td>
              <span class="basic-diag-pdx-status" style="background:#cbd5e1; color:#475569; border:none;">未配置</span>
            </td>
          </tr>`;
      }

      return `
        <tr>
          <td style="font-family:Consolas,monospace; font-weight:600;">${esc(did.id)}</td>
          <td>${esc(did.name)}</td>
          <td>${esc(did.expected)}</td>
          <td>
            ${result ? `
              <span class="basic-diag-pdx-did-value">
                <span class="basic-diag-pdx-did-flag ${flagClass}">${isPass ? "√" : "x"}</span>
                <span>${esc(result.value)}</span>
              </span>` : '<span class="basic-diag-pdx-status is-pending">--</span>'}
          </td>
          <td>
            <span class="basic-diag-pdx-status ${validResultClass}">${esc(validationResult)}</span>
          </td>
        </tr>`;
    }).join("");

    const traceRows = state.pdxTraceLog.map(entry => `
      <tr class="${entry.dir === 'Tx' ? 'is-tx' : 'is-rx'}">
        <td>${esc(entry.time)}</td>
        <td><span class="basic-diag-pdx-dir basic-diag-pdx-dir--${entry.dir.toLowerCase()}">${esc(entry.dir)}</span></td>
        <td style="font-family:Consolas,monospace;font-size:11px;">${esc(entry.data)}</td>
      </tr>`).join("");

    // UDS故障诊断大面板的DTC行数据生成
    const udsDtcRowsHtml = state.pdxUdsDtcResults.length > 0
      ? state.pdxUdsDtcResults.map(d => {
          const isSelected = d.code === state.pdxUdsSelectedDtcCode;
          return `
            <tr data-role="bd-pdx-uds-row" data-dtc-code="${esc(d.code)}" class="${isSelected ? 'is-selected' : ''}" style="cursor:pointer;" title="点击查看快照信息与扩展信息">
              <td style="font-weight:600; color:#0f172a;">${esc(d.code)}</td>
              <td style="font-family:Consolas,monospace;color:#475569;font-weight:600;">${esc(d.hex)}</td>
              <td style="font-family:Consolas,monospace;color:#ef4444;font-weight:600;">${esc(d.statusByte)}</td>
              <td style="color:#334155;">${esc(d.desc)}</td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px;">无活动故障码，请选择掩码配置并点击“获取故障信息”</td></tr>`;

    // 快照信息与扩展信息详细内容渲染
    let udsDetailContentHtml = "";
    if (!state.pdxUdsSelectedDtcCode) {
      udsDetailContentHtml = `<div style="text-align:center;color:#94a3b8;padding:24px 12px;font-size:12px;"><i class="fa-solid fa-arrow-pointer" style="margin-right:4px;"></i>请先在上方表格中选择一个故障码以联动展示快照与扩展信息</div>`;
    } else {
      const code = state.pdxUdsSelectedDtcCode;
      const details = PDX_DTC_UDS_DETAILS[code];
      const mockHex = code === "U029300" ? "C2 93 00" : code === "B10001B" ? "90 00 1B" : (PDX_MOCK_DTCS.find(d => d.code === code)?.hex || "00 00 00");

      if (state.pdxUdsActiveTab === "snapshot") {
        // 渲染快照信息 (平铺 01, 02, 03 所有记录，使用 rowspan 合并)
        let snapTableRowsHtml = "";
        const snapRecords = ["01", "02", "03"];
        snapRecords.forEach(recordNum => {
          const snapshotsList = (details && details.snapshots && details.snapshots[recordNum])
            ? details.snapshots[recordNum]
            : [
                { name: "里程 (Odometer)", value: "0 km" },
                { name: "供电电压 (Battery Voltage)", value: "12.0 V" },
                { name: "发动机转速 (Engine Speed)", value: "0 rpm" },
                { name: "车速 (Vehicle Speed)", value: "0 km/h" },
                { name: "冷却液温度 (Coolant Temp)", value: "85 ℃" }
              ];

          snapshotsList.forEach((s, idx) => {
            const valKey = `${code}_${recordNum}_${s.name}`;
            const currentVal = (state.pdxUdsSnapshotValues && valKey in state.pdxUdsSnapshotValues)
              ? state.pdxUdsSnapshotValues[valKey]
              : s.value;
            const parsed = parseValAndUnit(currentVal);
            
            snapTableRowsHtml += "<tr>";
            if (idx === 0) {
              snapTableRowsHtml += `<td rowspan="${snapshotsList.length}" style="text-align:center; vertical-align:middle; background:#f8fafc; font-weight:bold; color:#0f172a; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1; font-size:11px;">${recordNum}</td>`;
            }
            const bottomBorder = (idx === snapshotsList.length - 1) ? 'border-bottom:1px solid #cbd5e1;' : '';
            snapTableRowsHtml += `
              <td style="text-align:left; padding:5px 8px; font-weight:500; color:#475569; font-size:11px; ${bottomBorder}">${esc(s.name)}</td>
              <td style="text-align:left; padding:3px 8px; ${bottomBorder}">
                <input type="text" data-role="bd-pdx-snapshot-val-input" data-record-num="${recordNum}" data-item-name="${esc(s.name)}" style="width:100%; height:20px; font-size:11px; border:1px solid #cbd5e1; border-radius:3px; padding:0 6px; color:#0f172a; font-family:Consolas,monospace; text-align:left; background:#fff;" value="${esc(parsed.val)}" />
              </td>
              <td style="text-align:left; padding:5px 8px; color:#64748b; font-size:11px; font-weight:500; ${bottomBorder}">${esc(parsed.unit || '--')}</td>
            </tr>`;
          });
        });

        udsDetailContentHtml = `
          <div style="display:flex; flex-direction:column; gap:4px; padding: 8px;">
            <div style="overflow-x:auto; border:1px solid #cbd5e1; border-radius:4px; background:#fff;">
              <table class="basic-diag-pdx-table" style="width:100%; border-collapse:collapse; margin:0;">
                <thead>
                  <tr>
                    <th style="text-align:center; padding:6px 8px; font-size:11px; width:15%; background:#f8fafc; border-bottom:1px solid #cbd5e1; border-right:1px solid #cbd5e1; color:#4d5f76; font-weight:600;">快照号</th>
                    <th style="text-align:left; padding:6px 8px; font-size:11px; width:40%; background:#f8fafc; border-bottom:1px solid #cbd5e1; color:#4d5f76; font-weight:600;">数据项</th>
                    <th style="text-align:left; padding:6px 8px; font-size:11px; width:30%; background:#f8fafc; border-bottom:1px solid #cbd5e1; color:#4d5f76; font-weight:600;">值</th>
                    <th style="text-align:left; padding:6px 8px; font-size:11px; width:15%; background:#f8fafc; border-bottom:1px solid #cbd5e1; color:#4d5f76; font-weight:600;">单位</th>
                  </tr>
                </thead>
                <tbody>
                  ${snapTableRowsHtml}
                </tbody>
              </table>
            </div>
          </div>`;
      } else {
        // 渲染扩展信息 (3列结构：扩展编号，编号名称，值)
        let extTableRowsHtml = "";
        
        const extItems = [
          { num: "1", recordNum: "01", key: "occurrenceCounter", name: "DTC发生计数器", defaultVal: (details && details.extended && details.extended["01"]) ? String(details.extended["01"].occurrenceCounter) : "0" },
          { num: "2", recordNum: "02", key: "agingCounter", name: "老化计数器", defaultVal: (details && details.extended && details.extended["02"]) ? String(details.extended["02"].agingCounter) : "0" },
          { num: "3", recordNum: "03", key: "statusByte", name: "故障检测计数器", defaultVal: (details && details.extended && details.extended["03"]) ? `0x${details.extended["03"].statusByte}` : "0x00" }
        ];

        extItems.forEach((item) => {
          const valKey = `${code}_${item.recordNum}_${item.key}`;
          const currentVal = (state.pdxUdsExtendedValues && valKey in state.pdxUdsExtendedValues)
            ? state.pdxUdsExtendedValues[valKey]
            : item.defaultVal;

          extTableRowsHtml += `
            <tr>
              <td style="text-align:left; font-size:11px; padding:5px 8px; font-weight:500; color:#475569; border-bottom:1px solid #cbd5e1;">${esc(item.num)}</td>
              <td style="text-align:left; font-size:11px; padding:5px 8px; font-weight:500; color:#475569; border-bottom:1px solid #cbd5e1;">${esc(item.name)}</td>
              <td style="text-align:left; padding:3px 8px; border-bottom:1px solid #cbd5e1;">
                <input type="text" data-role="bd-pdx-extended-val-input" data-record-num="${item.recordNum}" data-item-key="${esc(item.key)}" style="width:100%; height:20px; font-size:11px; border:1px solid #cbd5e1; border-radius:3px; padding:0 6px; color:#0f172a; font-family:Consolas,monospace; text-align:left; background:#fff;" value="${esc(currentVal)}" />
              </td>
            </tr>`;
        });

        udsDetailContentHtml = `
          <div style="display:flex; flex-direction:column; gap:4px; padding: 8px;">
            <div style="overflow-x:auto; border:1px solid #cbd5e1; border-radius:4px; background:#fff;">
              <table class="basic-diag-pdx-table" style="width:100%; border-collapse:collapse; margin:0;">
                <thead>
                  <tr>
                    <th style="text-align:left; padding:6px 8px; font-size:11px; width:20%; background:#f8fafc; border-bottom:1px solid #cbd5e1; color:#4d5f76; font-weight:600;">扩展编号</th>
                    <th style="text-align:left; padding:6px 8px; font-size:11px; width:45%; background:#f8fafc; border-bottom:1px solid #cbd5e1; color:#4d5f76; font-weight:600;">编号名称</th>
                    <th style="text-align:left; padding:6px 8px; font-size:11px; width:35%; background:#f8fafc; border-bottom:1px solid #cbd5e1; color:#4d5f76; font-weight:600;">值</th>
                  </tr>
                </thead>
                <tbody>
                  ${extTableRowsHtml}
                </tbody>
              </table>
            </div>
          </div>`;
      }
    }

    const upperPct = Math.round(state.pdxSplitRatio * 100);
    const lowerPct = Math.round((1 - state.pdxSplitRatio) * 100);

    return `
      <div class="basic-diag-tab-body ${state.activeTab === "pdx" ? "is-active" : ""}" data-tab-body="pdx" style="height:100%;">
        <div class="basic-diag-pdx" style="flex:1; display:flex; flex-direction:column; height:100%; padding:8px 12px; gap:4px; min-height:0; overflow:hidden;">
          ${!ecu ? '<div class="basic-diag-pdx-empty">请先选择一个 ECU</div>' : `
            <div class="basic-diag-pdx-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-shrink:0;">
              <span class="basic-diag-pdx-header__title"><i class="fa-solid fa-file-circle-check" style="margin-right:5px;"></i>PDX 校验 — ${esc(ecuName)}</span>
              <div class="basic-diag-pdx-header-actions" style="display:flex; gap:8px; align-items:center;">
                <button class="basic-diag-pdx-export-btn" data-role="bd-pdx-read-all" style="background:#2f6bff; color:#fff; border:none; border-radius:4px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; box-shadow:0 2px 4px rgba(47,107,255,0.2); transition:background 0.1s; margin: 0; padding: 5px 12px; height: 26px;">
                  <i class="fa-solid fa-play"></i>一键读取
                </button>
                <button class="basic-diag-pdx-export-btn" data-role="bd-pdx-config-version" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:4px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; transition:background 0.1s; margin: 0; padding: 5px 12px; height: 26px;">
                  <i class="fa-solid fa-sliders"></i>配置版本
                </button>
                <button class="basic-diag-pdx-export-btn" data-role="bd-pdx-export-report" style="margin: 0; padding: 5px 12px; height: 26px;">
                  <i class="fa-solid fa-file-export" style="margin-right:4px;"></i>导出报告
                </button>
              </div>
            </div>

            <!-- 上层三大列分屏区域 -->
            <div class="basic-diag-pdx-upper" style="flex: ${upperPct}; display:${state.pdxSplitRatio <= 0.001 ? 'none' : 'flex'}; gap:0; min-height:0; overflow:hidden; margin-bottom:4px;">
              <!-- 第一列：故障码 (DTC) -->
              <div class="basic-diag-pdx-column" style="flex:${state.pdxColWidths[0]}; display:${state.pdxColWidths[0] <= 0.001 ? 'none' : 'flex'}; flex-direction:column; min-width:0; overflow:hidden; padding-right:4px;">
                <div class="basic-diag-pdx-title" style="flex-shrink:0;">
                  <span><i class="fa-solid fa-bug" style="margin-right:4px;color:#d9534f;"></i>故障码 (DTC)</span>
                  <button class="basic-diag-pdx-btn" data-role="bd-pdx-read-dtc"><i class="fa-solid fa-play" style="margin-right:3px;"></i>故障比对</button>
                </div>
                <div style="flex:1; overflow-y:auto; border:1px solid #c8d1dc; border-radius:3px; background:#fff; position:relative;">
                  ${state.pdxDtcLoading ? `
                    <div class="pdx-panel-loading-overlay" style="position: absolute; inset: 0; background: rgba(255,255,255,0.75); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; z-index: 10;">
                      <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: #2f6bff;"></i>
                      <span style="font-size: 11px; color: #64748b; font-weight: 600;">正在比对故障码...</span>
                    </div>` : ''}
                  <table class="basic-diag-pdx-table">
                    <thead><tr><th style="width:70px;">DTC</th><th style="width:70px;">HEX码</th><th style="width:50px;">status</th><th>描述</th><th style="width:75px;">是否存在</th></tr></thead>
                    <tbody>${dtcRows}</tbody>
                  </table>
                </div>
              </div>

              <!-- 垂直分割条 1 -->
              <div class="basic-diag-pdx-vsplitter" data-role="bd-pdx-vsplitter-1">
                <span class="basic-diag-pdx-vsplitter__dots"></span>
              </div>

              <!-- 第二列：DID 列表 -->
              <div class="basic-diag-pdx-column" style="flex:${state.pdxColWidths[1]}; display:${state.pdxColWidths[1] <= 0.001 ? 'none' : 'flex'}; flex-direction:column; min-width:0; overflow:hidden; padding: 0 4px;">
                <div class="basic-diag-pdx-title" style="flex-shrink:0;">
                  <span><i class="fa-solid fa-database" style="margin-right:4px;color:#337ab7;"></i>DID 列表</span>
                  <button class="basic-diag-pdx-btn" data-role="bd-pdx-read-did"><i class="fa-solid fa-play" style="margin-right:3px;"></i>获取DID信息</button>
                </div>
                <div style="flex:1; overflow-y:auto; border:1px solid #c8d1dc; border-radius:3px; background:#fff; position:relative;">
                  ${state.pdxDidLoading ? `
                    <div class="pdx-panel-loading-overlay" style="position: absolute; inset: 0; background: rgba(255,255,255,0.75); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; z-index: 10;">
                      <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: #2f6bff;"></i>
                      <span style="font-size: 11px; color: #64748b; font-weight: 600;">正在读取DID信息...</span>
                    </div>` : ''}
                  <table class="basic-diag-pdx-table">
                    <thead><tr><th style="width:55px;">DID</th><th>名称</th><th style="width:75px;">预期范围</th><th style="width:130px;">当前值</th><th style="width:75px;">校验结果</th></tr></thead>
                    <tbody>${didRows}</tbody>
                  </table>
                </div>
              </div>

              <!-- 垂直分割条 2 -->
              <div class="basic-diag-pdx-vsplitter" data-role="bd-pdx-vsplitter-2">
                <span class="basic-diag-pdx-vsplitter__dots"></span>
              </div>

              <!-- 第三列：UDS 故障诊断大面板 -->
              <div class="basic-diag-pdx-column basic-diag-pdx-column--uds" style="flex:${state.pdxColWidths[2]}; display:${state.pdxColWidths[2] <= 0.001 ? 'none' : 'flex'}; flex-direction:column; min-width:0; overflow:hidden; padding-left:4px;">
                <div class="basic-diag-pdx-uds-toolbar">
                  <button class="basic-diag-pdx-uds-toolbar__btn basic-diag-pdx-uds-toolbar__btn--primary" data-role="bd-pdx-uds-read">
                    <i class="fa-solid fa-book-open"></i>获取故障信息
                  </button>
                  <button class="basic-diag-pdx-uds-toolbar__btn basic-diag-pdx-uds-toolbar__btn--danger" data-role="bd-pdx-uds-clear">
                    <i class="fa-solid fa-trash-can"></i>清除故障码
                  </button>
                  <div style="flex:1;"></div>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <span style="font-size:11px; color:#4d5f76; font-weight:600;">状态掩码:</span>
                    <input class="basic-diag-comm-input" type="text" data-role="bd-pdx-uds-mask" style="width:36px; height:22px; text-align:center; padding:0; font-family:Consolas,monospace; font-weight:bold; border:1px solid #c8d1dc; border-radius:3px;" value="${esc(state.pdxMaskInput || 'FF')}" />
                  </div>
                </div>

                <!-- UDS 故障码结果表格 -->
                <div data-role="bd-pdx-uds-table-container" style="flex:${state.pdxUdsInnerSplitRatio * 2.2}; display:${state.pdxUdsInnerSplitRatio <= 0.001 ? 'none' : 'block'}; overflow-y:auto; border:1px solid #cbd5e1; border-radius:4px 4px 0 0; background:#fff; min-height:0; position:relative;">
                  ${state.pdxUdsLoading ? `
                    <div class="pdx-panel-loading-overlay" style="position: absolute; inset: 0; background: rgba(255,255,255,0.75); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; z-index: 10;">
                      <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: #2f6bff;"></i>
                      <span style="font-size: 11px; color: #64748b; font-weight: 600;">正在获取故障信息...</span>
                    </div>` : ''}
                  <table class="basic-diag-pdx-table">
                    <thead>
                      <tr>
                        <th style="width:70px;">DTC</th>
                        <th style="width:75px;">HEX码</th>
                        <th style="width:50px;">status</th>
                        <th>描述</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${udsDtcRowsHtml}
                    </tbody>
                  </table>
                </div>

                <!-- 内部水平分割条 -->
                <div class="basic-diag-pdx-uds-splitter" data-role="bd-pdx-uds-inner-splitter">
                  <span class="basic-diag-pdx-uds-splitter__dots"></span>
                </div>

                <!-- 下半部分容器 -->
                <div class="basic-diag-pdx-uds-bottom-container" data-role="bd-pdx-uds-bottom-container" style="display:${state.pdxUdsInnerSplitRatio >= 0.999 ? 'none' : 'flex'}; flex-direction:column; min-height:0; flex:${(1 - state.pdxUdsInnerSplitRatio) * 2.2};">
                  <!-- 快照/扩展 Tabs 选项卡 -->
                  <div class="basic-diag-pdx-uds-tabs" style="flex-shrink:0;">
                    <button class="basic-diag-pdx-uds-tab-btn ${state.pdxUdsActiveTab === 'snapshot' ? 'is-active' : ''}" data-role="bd-pdx-uds-tab" data-tab="snapshot">
                      <i class="fa-solid fa-clock-rotate-left" style="margin-right:2px;"></i>快照信息
                    </button>
                    <button class="basic-diag-pdx-uds-tab-btn ${state.pdxUdsActiveTab === 'extended' ? 'is-active' : ''}" data-role="bd-pdx-uds-tab" data-tab="extended">
                      <i class="fa-solid fa-circle-info" style="margin-right:2px;"></i>扩展信息
                    </button>
                  </div>
                  <div class="basic-diag-pdx-uds-tab-content" data-role="bd-pdx-uds-content-container" style="border:1px solid #cbd5e1; border-top:none; border-radius:0 0 4px 4px; overflow-y:auto; background:#fff; min-height:0; flex:1;">
                    ${udsDetailContentHtml}
                  </div>
                </div>
              </div>
            </div>

            <!-- 上下分割拉伸滑块 -->
            <div class="basic-diag-pdx-splitter" data-role="bd-pdx-splitter">
              <span class="basic-diag-pdx-splitter__dots"></span>
            </div>

            <!-- 下层：报文展示全宽区域 -->
            <div class="basic-diag-pdx-lower" style="flex: ${lowerPct}; display:${state.pdxSplitRatio >= 0.999 ? 'none' : 'flex'}; flex-direction:column; min-height:0; overflow:hidden;">
              <div class="basic-diag-pdx-title" style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center;">
                <span><i class="fa-solid fa-wave-square" style="margin-right:4px;color:#5a6ea0;"></i>报文展示</span>
                <button class="basic-diag-pdx-btn" data-role="bd-pdx-clear-trace"><i class="fa-solid fa-trash-can" style="margin-right:3px;"></i>清空</button>
              </div>
              <div style="flex:1; overflow-y:auto; border:1px solid #c8d1dc; border-radius:3px; background:#fff;">
                <table class="basic-diag-pdx-table basic-diag-pdx-table--trace">
                  <colgroup>
                    <col style="width:100px" />
                    <col style="width:50px" />
                    <col />
                  </colgroup>
                  <thead><tr><th>时间</th><th>方向</th><th>数据</th></tr></thead>
                  <tbody>
                    ${traceRows || '<tr><td colspan="3" style="text-align:center;color:#bbb;padding:12px;">暂无报文，点击一键读取后生成</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          `}
        </div>
      </div>`;
  }

  /* ============================
     Render: Comm Tab
     ============================ */
  function renderCommSecAlgoBlock(ecu) {
    if (ecu.algoSource === undefined) ecu.algoSource = "default";
    if (ecu.defaultAlgoIndex === undefined) ecu.defaultAlgoIndex = "1";
    if (ecu.secAlgoDllPath === undefined) ecu.secAlgoDllPath = "";
    if (ecu.secAlgoType === undefined) ecu.secAlgoType = "SA_TYPE_INVALID";

    const saDllPath = ecu.secAlgoDllPath || "";
    const filename = saDllPath ? saDllPath.substring(saDllPath.lastIndexOf('\\') + 1) : "GWM_SA.dll";

    return `
      <div class="basic-diag-comm-section" style="margin-top: 20px;">
        <div class="basic-diag-comm-section-title">安全算法</div>
        <div style="font-size: 12px; color: #4d5f76; margin-bottom: 8px; font-weight: 500;">算法来源</div>
        <div style="display: flex; flex-direction: column; gap: 12px; padding-left: 2px;">
          
          <!-- 默认算法 Row -->
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label class="sec-algo-radio-label" style="font-weight: 500; min-width: 80px;">
              <input type="radio" name="bd-comm-algo-source" value="default" ${ecu.algoSource === "default" ? "checked" : ""} />
              <span>默认算法</span>
            </label>
            
            <select class="sec-algo-select" id="bd-comm-default-algo-select" style="max-width: 260px; height: 30px; ${ecu.algoSource === "default" ? "" : "background: #f1f5f9; cursor: not-allowed;"}" ${ecu.algoSource === "default" ? "" : "disabled"}>
              <option value="1" ${ecu.defaultAlgoIndex === "1" ? "selected" : ""}>1: GWM_SA (通用算法)</option>
              <option value="2" ${ecu.defaultAlgoIndex === "2" ? "selected" : ""}>2: standard (标准算法)</option>
            </select>
            
            <span style="font-size: 12px; color: #64748b; font-family: Consolas, monospace; margin-left: 4px;">
              ${ecu.defaultAlgoIndex === "2" ? "standard.dll" : "GWM_SA.dll"}
            </span>
          </div>

          <!-- 自选算法 Row -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 2px;">
            <label class="sec-algo-radio-label" style="font-weight: 500;">
              <input type="radio" name="bd-comm-algo-source" value="custom" ${ecu.algoSource === "custom" ? "checked" : ""} />
              <span>自选算法</span>
            </label>
            
            ${ecu.algoSource === "custom" ? `
              <div class="basic-diag-comm-grid" style="margin-top: 4px; gap: 10px; width: 100%;">
                <div class="basic-diag-comm-item" style="grid-column: span 2;">
                  <span>安全算法库路径</span>
                  <div class="basic-diag-sec-algo-file-row" style="display: flex; gap: 6px; align-items: center; width: 100%;">
                    <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="secAlgoDllPath" value="${esc(ecu.secAlgoDllPath)}" placeholder="选择安全算法DLL文件..." style="flex: 1; height: 30px;" />
                    <button class="basic-diag-sec-algo-file-btn" id="bd-comm-browse-btn" type="button" style="width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; cursor: pointer;"><i class="fa-solid fa-folder-open"></i></button>
                  </div>
                </div>
              </div>
            ` : ""}
          </div>

        </div>
      </div>
    `;
  }

  function renderCommTab() {
    const ecu = getSelectedEcu();
    const bus = getSelectedBus();
    if (!ecu || !bus) return "";

    const isEth = bus.type === "ethernet";
    const isCanBus = bus.type === "can" || bus.type === "canfd";

    let fieldsHtml = "";
    if (isCanBus) {
      if (ecu.iso15765_stmin === undefined) ecu.iso15765_stmin = "0";
      if (ecu.stmin_tx === undefined) ecu.stmin_tx = "65535";
      if (ecu.bs === undefined) ecu.bs = "0";
      let p2Val = String(ecu.p2Client_timeout || "150").replace(/\s*ms\s*/i, "");
      ecu.p2Client_timeout = p2Val;
      
      fieldsHtml = `
        <div class="basic-diag-comm-section">
          <div class="basic-diag-comm-section-title">通用</div>
          <div class="basic-diag-comm-grid">
            <div class="basic-diag-comm-item">
              <span>名称</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="name" value="${esc(ecu.name)}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>功能地址</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="funcAddr" value="${esc(ecu.funcAddr || "")}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>ISO15765_STMIN</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="iso15765_stmin" value="${esc(ecu.iso15765_stmin)}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>STMIN_TX</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="stmin_tx" value="${esc(ecu.stmin_tx)}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>BS</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="bs" value="${esc(ecu.bs)}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>P2Timeout</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="p2Client_timeout" value="${esc(ecu.p2Client_timeout)}" />
            </div>
          </div>
        </div>
        ${renderCommSecAlgoBlock(ecu)}
      `;
    } else if (isEth) {
      if (ecu.port === undefined) ecu.port = "13400";
      if (ecu.funcAddr === undefined) ecu.funcAddr = "0xE000";
      let p6Val = String(ecu.p6Client_timeout || "5000").replace(/\s*ms\s*/i, "");
      ecu.p6Client_timeout = p6Val;

      fieldsHtml = `
        <div class="basic-diag-comm-section">
          <div class="basic-diag-comm-section-title">通用</div>
          <div class="basic-diag-comm-grid">
            <div class="basic-diag-comm-item">
              <span>名称</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="name" value="${esc(ecu.name)}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>逻辑地址</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="logicAddr" value="${esc(ecu.logicAddr || "")}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>功能地址</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="funcAddr" value="${esc(ecu.funcAddr || "")}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>IP地址</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="ip" value="${esc(ecu.ip || "")}" />
            </div>
            <div class="basic-diag-comm-item">
              <span>P6Timeout</span>
              <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="p6Client_timeout" value="${esc(ecu.p6Client_timeout)}" />
            </div>
          </div>
        </div>
        ${renderCommSecAlgoBlock(ecu)}
      `;
    } else {
      fieldsHtml = `
        <div class="basic-diag-comm-grid">
          <div class="basic-diag-comm-item">
            <span>ECU名称</span>
            <input class="basic-diag-comm-input" type="text" data-role="bd-comm-field" data-field="name" value="${esc(ecu.name)}" />
          </div>
        </div>
      `;
    }

    return `
      <div class="basic-diag-tab-body ${state.activeTab === "comm" ? "is-active" : ""}" data-tab-body="comm">
        <div class="basic-diag-comm-layout">
          <div class="basic-diag-comm-card">
            <div class="basic-diag-comm-header">
              <i class="fa-solid fa-gears" style="color:#2f6bff;"></i>
              <span>通讯参数配置 — ${esc(ecu.name)}</span>
            </div>
            ${fieldsHtml}
          </div>
        </div>
      </div>
    `;
  }

  /* ============================
     Render: Report Dialog
     ============================ */

  // 获取导出报告和弹窗中使用的 UDS 快照与扩展信息高精度 HTML 表格（Rowspan 跨行合并）
  function getUdsReportHtml() {
    const allCandidates = [
      ...PDX_MOCK_DTCS.map(d => ({ code: d.code, hex: d.hex, desc: d.desc, statusByte: PDX_DTC_UDS_DETAILS[d.code]?.statusByte || "00" })),
      { code: "U029300", hex: "C2 93 00", desc: "--", statusByte: "2F" },
      { code: "B10001B", hex: "90 00 1B", desc: "--", statusByte: "2C" }
    ];

    return allCandidates.map(d => {
      const details = PDX_DTC_UDS_DETAILS[d.code];
      
      // 快照信息表格行组装
      let snapTableRowsHtml = "";
      const snapRecords = ["01", "02", "03"];
      snapRecords.forEach(recordNum => {
        const snapshotsList = (details && details.snapshots && details.snapshots[recordNum])
          ? details.snapshots[recordNum]
          : [
              { name: "里程 (Odometer)", value: "0 km" },
              { name: "供电电压 (Battery Voltage)", value: "12.0 V" },
              { name: "发动机转速 (Engine Speed)", value: "0 rpm" },
              { name: "车速 (Vehicle Speed)", value: "0 km/h" },
              { name: "冷却液温度 (Coolant Temp)", value: "85 ℃" }
            ];

        snapshotsList.forEach((s, idx) => {
          const valKey = `${d.code}_${recordNum}_${s.name}`;
          const currentVal = (state.pdxUdsSnapshotValues && valKey in state.pdxUdsSnapshotValues)
            ? state.pdxUdsSnapshotValues[valKey]
            : s.value;
          const parsed = parseValAndUnit(currentVal);
          
          snapTableRowsHtml += "<tr>";
          if (idx === 0) {
            snapTableRowsHtml += `<td rowspan="${snapshotsList.length}" style="text-align:center; vertical-align:middle; background:#f8fafc; font-weight:bold; color:#0f172a; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1; font-size:11px;">${recordNum}</td>`;
          }
          const bottomBorder = (idx === snapshotsList.length - 1) ? 'border-bottom:1px solid #cbd5e1;' : '';
          snapTableRowsHtml += `
            <td style="text-align:left; font-size:11px; ${bottomBorder}">${esc(s.name)}</td>
            <td style="text-align:left; font-family:Consolas,monospace; font-weight:600; font-size:11px; ${bottomBorder}">${esc(parsed.val)}</td>
            <td style="text-align:left; color:#64748b; font-size:11px; ${bottomBorder}">${esc(parsed.unit || '--')}</td>
          </tr>`;
        });
      });

      // 扩展信息表格行组装
      let extTableRowsHtml = "";
      
      const extItems = [
        { num: "1", recordNum: "01", key: "occurrenceCounter", name: "DTC发生计数器", defaultVal: (details && details.extended && details.extended["01"]) ? String(details.extended["01"].occurrenceCounter) : "0", unit: "次" },
        { num: "2", recordNum: "02", key: "agingCounter", name: "老化计数器", defaultVal: (details && details.extended && details.extended["02"]) ? String(details.extended["02"].agingCounter) : "0", unit: "周期" },
        { num: "3", recordNum: "03", key: "statusByte", name: "故障检测计数器", defaultVal: (details && details.extended && details.extended["03"]) ? `0x${details.extended["03"].statusByte}` : "0x00", unit: "--" }
      ];

      extItems.forEach((item) => {
        const valKey = `${d.code}_${item.recordNum}_${item.key}`;
        const currentVal = (state.pdxUdsExtendedValues && valKey in state.pdxUdsExtendedValues)
          ? state.pdxUdsExtendedValues[valKey]
          : item.defaultVal;

        extTableRowsHtml += `
          <tr>
            <td style="text-align:left; font-size:11px; padding:6px 8px; border-bottom:1px solid #cbd5e1;">${esc(item.num)}</td>
            <td style="text-align:left; font-size:11px; padding:6px 8px; border-bottom:1px solid #cbd5e1;">${esc(item.name)}</td>
            <td style="text-align:left; font-family:Consolas,monospace; font-weight:600; font-size:11px; padding:6px 8px; border-bottom:1px solid #cbd5e1;">${esc(currentVal)}${item.unit !== '--' ? ' ' + item.unit : ''}</td>
          </tr>`;
      });

      return `
        <div class="flash-config-sheet uds-dtc-block" style="margin-bottom:20px; padding:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; display:flex; flex-direction:column; gap:6px;">
          <!-- 故障码基本信息表 (点击折叠/展开) -->
          <div class="uds-dtc-header-trigger" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:10px;" onclick="const d = this.nextElementSibling; const icon = this.querySelector('.uds-toggle-icon'); if(d.style.display==='none'){ d.style.display='flex'; icon.className='fa-solid fa-chevron-down uds-toggle-icon'; }else{ d.style.display='none'; icon.className='fa-solid fa-chevron-right uds-toggle-icon'; }">
            <table class="pdx-check-table" style="width:calc(100% - 24px); border-collapse:collapse; border:1px solid #cbd5e1; border-radius:4px; overflow:hidden; margin:0; transition: border-color 0.15s ease;">
              <thead>
                <tr>
                  <th style="width:20%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">DTC</th>
                  <th style="width:25%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">HEX码</th>
                  <th style="width:15%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">status</th>
                  <th style="width:40%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">DTC描述信息</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="font-weight:bold; color:#0f172a; border-bottom:none; text-align:left; font-size:11px; padding:6px 8px;">${esc(d.code)}</td>
                  <td style="font-family:Consolas,monospace; font-weight:600; border-bottom:none; text-align:left; font-size:11px; padding:6px 8px;">${esc(d.hex)}</td>
                  <td style="font-family:Consolas,monospace; font-weight:600; color:#ef4444; border-bottom:none; text-align:left; font-size:11px; padding:6px 8px;">${esc(d.statusByte)}</td>
                  <td style="color:#334155; border-bottom:none; text-align:left; font-size:11px; padding:6px 8px;">${esc(d.desc)}</td>
                </tr>
              </tbody>
            </table>
            <div style="width:20px; text-align:center; color:#64748b;">
              <i class="fa-solid fa-chevron-right uds-toggle-icon" style="font-size:12px; transition: transform 0.2s;"></i>
            </div>
          </div>

          <!-- 下方详细信息包装区 -->
          <div class="uds-dtc-details-wrapper" style="display:none; flex-direction:column; gap:6px;">
            <!-- 快照信息表 -->
            <div style="font-size:11px; font-weight:bold; color:#1e293b; padding:4px 8px; background:#f1f5f9; border-left:3px solid #2f6bff; margin-top:2px; margin-bottom:2px; text-align:left; border-radius:0 3px 3px 0;">快照信息</div>
            <table class="pdx-check-table" style="width:100%; border-collapse:collapse; border:1px solid #cbd5e1; border-radius:4px; overflow:hidden;">
              <thead>
                <tr>
                  <th style="width:15%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:center; font-size:11px; padding:6px 8px;">快照号</th>
                  <th style="width:40%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">数据项</th>
                  <th style="width:30%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">值</th>
                  <th style="width:15%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">单位</th>
                </tr>
              </thead>
              <tbody>
                ${snapTableRowsHtml}
              </tbody>
            </table>

            <!-- 扩展信息表 -->
            <div style="font-size:11px; font-weight:bold; color:#1e293b; padding:4px 8px; background:#f1f5f9; border-left:3px solid #ef4444; margin-top:6px; margin-bottom:2px; text-align:left; border-radius:0 3px 3px 0;">扩展信息</div>
            <table class="pdx-check-table" style="width:100%; border-collapse:collapse; border:1px solid #cbd5e1; border-radius:4px; overflow:hidden;">
              <thead>
                <tr>
                  <th style="width:20%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">扩展编号</th>
                  <th style="width:45%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">编号名称</th>
                  <th style="width:35%; background:#f8fafc; font-weight:600; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; padding:6px 8px;">值</th>
                </tr>
              </thead>
              <tbody>
                ${extTableRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      `;;
    }).join("");
  }

  function getReportData() {
    const ecu = getSelectedEcu();
    const ecuName = ecu ? ecu.name : "--";
    const reporter = (window.currentUser && window.currentUser.name) || window.currentUserName || "系统用户";
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const exportTime = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    const dtcRows = PDX_MOCK_DTCS.map(dtc => {
      const res = state.pdxDtcResults[dtc.code] || "--";
      const statusByte = res === "存在" ? "08" : res === "不存在" ? "00" : "--";
      
      let manualVal = null;
      if (state.pdxDtcManualOverrides[dtc.code] !== undefined) {
        manualVal = state.pdxDtcManualOverrides[dtc.code];
      }
      const note = state.pdxDtcNotes[dtc.code] || "";

      return {
        code: dtc.code,
        hex: dtc.hex,
        description: dtc.desc,
        status: statusByte,
        result: res,
        manualVal: manualVal,
        note: note,
      };
    });

    // 融入 Extra 故障码
    Object.keys(state.pdxDtcExtraResults).forEach(code => {
      const res = state.pdxDtcExtraResults[code]; // "多余"
      const details = PDX_DTC_UDS_DETAILS[code] || { statusByte: "08" };
      const hex = code === "U029300" ? "C2 93 00" : code === "B10001B" ? "90 00 1B" : "00 00 00";
      const desc = code === "U029300" ? "--" : code === "B10001B" ? "--" : "--";
      
      let manualVal = null;
      if (state.pdxDtcManualOverrides[code] !== undefined) {
        manualVal = state.pdxDtcManualOverrides[code];
      }
      const note = state.pdxDtcNotes[code] || "";

      dtcRows.push({
        code,
        hex,
        description: desc,
        status: details.statusByte,
        result: res,
        manualVal: manualVal,
        note: note,
      });
    });

    const didRows = PDX_MOCK_DIDS.map(did => {
      const r = state.pdxDidResults[did.id];
      const valResult = r ? (r.validationResult || (r.pass ? "通过" : "失败")) : "--";
      const valPassed = r ? !!r.pass : false;

      const isConfigured = state.selectedPdxDids[did.id] === true;
      let manualVal = null;
      if (isConfigured) {
        if (state.pdxDidManualOverrides[did.id] !== undefined) {
          manualVal = state.pdxDidManualOverrides[did.id];
        }
      }
      const note = state.pdxDidNotes[did.id] || "";

      return {
        id: did.id,
        name: did.name,
        expected: did.expected,
        value: r ? r.value : "--",
        validationPassed: valPassed,
        validationResult: valResult,
        manualVal: manualVal,
        note: note,
      };
    });

    const overallResult =
      didRows.every(row => row.manualVal === "pass") &&
      dtcRows.every(row => row.manualVal === "pass")
        ? "成功" : "失败";

    const hasOverrides = Object.keys(state.pdxDtcManualOverrides).length > 0 || Object.keys(state.pdxDidManualOverrides).length > 0;
    const finalResult = overallResult;
    const manualLabel = hasOverrides ? " (已人工确认)" : "";

    const reqAddr = ecu?.requestAddr || "0618";
    const versions = {
      supplier: state.pdxDidResults["F187"]?.value || (ecu ? (ecu.supplierCode || "BOSCH") : "BOSCH"),
      partNo: state.pdxDidResults["F18A"]?.value || (ecu ? `${ecu.name}-PN-2026` : "--"),
      nodeAddr: state.pdxDidResults["F193"]?.value || (reqAddr.startsWith("0x") ? reqAddr : "0x" + reqAddr),
      sysConfig: state.pdxDidResults["F195"]?.value || "SYS-CFG-V1.0",
      appVersion: state.pdxDidResults["F189"]?.value || (ecu ? (ecu.targetVersion || "V3.2.1") : "V3.2.1"),
      calVersion: state.pdxDidResults["F1C0"]?.value || "GW4N20-E02-710",
      bootVersion: state.pdxDidResults["F1C1"]?.value || "ECM_BL_1.0.3",
    };

    return { title: `${ecuName} PDX校验报告`, reporter, exportTime, overallResult, finalResult, manualLabel, dtcRows, didRows, versions };
  }

  function renderReportDialog() {
    if (!state.reportDialogOpen) return "";
    const report = getReportData();

    const dtcRowsHtml = report.dtcRows.length
      ? report.dtcRows.map(row => {
          const isPass = row.manualVal === "pass";
          const isFail = row.manualVal === "fail";
          return `
          <tr>
            <td>${esc(row.code)}</td>
            <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${esc(row.hex)}</td>
            <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${esc(row.status)}</td>
            <td>${esc(row.description)}</td>
            <td>
              <span class="pdx-check-status ${row.result === "存在" ? "is-fail" : row.result === "不存在" ? "is-pass" : row.result === "多余" ? "is-extra" : ""}">
                ${esc(row.result)}
              </span>
            </td>
            <td>
              <div class="pdx-report-row-actions no-print" style="display: inline-flex; gap: 4px;">
                <button class="pdx-row-btn pdx-row-btn--pass ${isPass ? "active" : ""}" data-type="dtc" data-code="${row.code}" data-value="pass" type="button">PASS</button>
                <button class="pdx-row-btn pdx-row-btn--fail ${isFail ? "active" : ""}" data-type="dtc" data-code="${row.code}" data-value="fail" type="button">FAIL</button>
              </div>
              <span class="print-only pdx-check-status ${isPass ? 'is-pass' : isFail ? 'is-fail' : 'is-pending'}">
                ${isPass ? 'PASS' : isFail ? 'FAIL' : '未选择'}
              </span>
            </td>
            <td>
              <input type="text" class="pdx-report-note-input no-print" data-type="dtc" data-id="${esc(row.code)}" value="${esc(row.note)}" placeholder="输入说明..." style="width:100%; height:22px; padding:0 6px; font-size:11px; border:1px solid #cbd5e1; border-radius:3px; outline:none;" />
              <span class="print-only" style="font-size:11px; color:#334155; font-style:italic;">${esc(row.note || "--")}</span>
            </td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="7" class="pdx-check-empty">暂无故障码结果</td></tr>';

    const didRowsHtml = report.didRows.length
      ? report.didRows.map(row => {
          const isPass = row.manualVal === "pass";
          const isFail = row.manualVal === "fail";
          return `
          <tr>
            <td>${esc(row.id)}</td>
            <td>${esc(row.name)}</td>
            <td>${esc(row.expected)}</td>
            <td>
              <span class="pdx-check-did-value">
                <span class="pdx-check-did-flag ${row.validationPassed ? "is-pass" : "is-fail"}">
                  ${row.validationPassed ? "√" : "x"}
                </span>
                <span>${esc(row.value)}</span>
              </span>
            </td>
            <td>${esc(row.validationResult)}</td>
            <td>
              <div class="pdx-report-row-actions no-print" style="display: inline-flex; gap: 4px;">
                <button class="pdx-row-btn pdx-row-btn--pass ${isPass ? "active" : ""}" data-type="did" data-id="${row.id}" data-value="pass" type="button">PASS</button>
                <button class="pdx-row-btn pdx-row-btn--fail ${isFail ? "active" : ""}" data-type="did" data-id="${row.id}" data-value="fail" type="button">FAIL</button>
              </div>
              <span class="print-only pdx-check-status ${isPass ? 'is-pass' : isFail ? 'is-fail' : 'is-pending'}">
                ${isPass ? 'PASS' : isFail ? 'FAIL' : '未选择'}
              </span>
            </td>
            <td>
              <input type="text" class="pdx-report-note-input no-print" data-type="did" data-id="${esc(row.id)}" value="${esc(row.note)}" placeholder="输入说明..." style="width:100%; height:22px; padding:0 6px; font-size:11px; border:1px solid #cbd5e1; border-radius:3px; outline:none;" />
              <span class="print-only" style="font-size:11px; color:#334155; font-style:italic;">${esc(row.note || "--")}</span>
            </td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="7" class="pdx-check-empty">暂无DID测试结果</td></tr>';

    const isExportDisabled = 
      report.dtcRows.some(row => row.manualVal === null) ||
      report.didRows.some(row => {
        const isConfigured = state.selectedPdxDids[row.id] === true;
        return isConfigured && row.manualVal === null;
      });

    const udsReportHtml = getUdsReportHtml();

    return `
      <div class="pdx-check-dialog-backdrop" data-role="bd-close-report"></div>
      <section class="pdx-check-dialog pdx-check-dialog--report" role="dialog" aria-modal="true" aria-label="导出报告">
        <div class="pdx-check-dialog__header" style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${esc(report.title)}</strong>
          <div style="display:flex; align-items:center; gap:8px; margin-left:auto; margin-right:8px;">
            <button class="pdx-report-export-header-btn no-print" data-role="bd-report-export-trigger" ${isExportDisabled ? 'disabled title="请先完成所有项的人工校验确认"' : 'title="所有人工校验已完成，点击导出报告/打印"'} type="button" style="background:#2f6bff; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:600; cursor:${isExportDisabled ? 'not-allowed' : 'pointer'}; padding:4px 12px; height:24px; display:flex; align-items:center; gap:4px; opacity:${isExportDisabled ? 0.55 : 1}; transition:all 0.15s;">
              <i class="fa-solid fa-file-export"></i>导出
            </button>
          </div>
          <button class="pdx-check-dialog__close" type="button" data-role="bd-close-report" aria-label="关闭" style="margin-left:0;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="pdx-check-dialog__body">
          <section class="flash-config-sheet flash-config-sheet--main" style="padding: 8px 12px; margin-bottom: 4px;">
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; font-size: 11px;">
              <div style="display: flex; gap: 4px; align-items: baseline;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">报告人:</span>
                <strong style="color: #0f172a; font-weight: 600;">${esc(report.reporter)}</strong>
              </div>
              <div style="display: flex; gap: 4px; align-items: baseline;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">导出时间:</span>
                <strong style="color: #0f172a; font-weight: 600;">${esc(report.exportTime)}</strong>
              </div>
              <div style="display: flex; gap: 4px; align-items: baseline; grid-column: span 2;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">总体结果:</span>
                <strong class="pdx-check-report-result ${report.finalResult === "成功" ? "is-success" : "is-fail"}" style="font-weight: 700;">
                  ${esc(report.finalResult)}${esc(report.manualLabel)}
                </strong>
              </div>
              
              <div style="display: flex; gap: 4px; align-items: baseline;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F187 供应商编码:</span>
                <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.supplier)}</strong>
              </div>
              <div style="display: flex; gap: 4px; align-items: baseline;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F18A ECU零件号:</span>
                <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.partNo)}</strong>
              </div>
              <div style="display: flex; gap: 4px; align-items: baseline;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F193 节点地址:</span>
                <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.nodeAddr)}</strong>
              </div>
              <div style="display: flex; gap: 4px; align-items: baseline;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F195 系统配置:</span>
                <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.sysConfig)}</strong>
              </div>
              
              <div style="display: flex; gap: 4px; align-items: baseline;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F189 应用软件版:</span>
                <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.appVersion)}</strong>
              </div>
              <div style="display: flex; gap: 4px; align-items: baseline;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F1C0 标定软件版:</span>
                <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.calVersion)}</strong>
              </div>
              <div style="display: flex; gap: 4px; align-items: baseline; grid-column: span 2;">
                <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F1C1 底层软件版:</span>
                <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.bootVersion)}</strong>
              </div>
            </div>
          </section>

          <!-- 报告 Tab 多页签切换 (屏幕显示，打印时自动隐藏) -->
          <div class="pdx-report-tabs no-print" style="margin: 4px 0 2px 0;">
            <button class="pdx-report-tab-btn ${state.pdxReportActiveTab === 'dtc' ? 'is-active' : ''}" data-role="bd-report-tab" data-tab="dtc" type="button">
              <i class="fa-solid fa-bug"></i> 故障比对
            </button>
            <button class="pdx-report-tab-btn ${state.pdxReportActiveTab === 'did' ? 'is-active' : ''}" data-role="bd-report-tab" data-tab="did" type="button">
              <i class="fa-solid fa-database"></i> DID校验
            </button>
            <button class="pdx-report-tab-btn ${state.pdxReportActiveTab === 'uds' ? 'is-active' : ''}" data-role="bd-report-tab" data-tab="uds" type="button">
              <i class="fa-solid fa-file-invoice"></i> 故障信息
            </button>
          </div>

          <!-- DTC测试结果 Section -->
          <section class="flash-config-sheet flash-config-sheet--main pdx-report-section ${state.pdxReportActiveTab === 'dtc' ? '' : 'is-hidden-tab'}" style="margin-top: 0; margin-bottom: 0;">
            <div class="flash-config-sheet__title">故障比对结果</div>
            <div class="pdx-check-table-wrap" style="max-height: 450px !important; overflow-y: auto;">
              <table class="pdx-check-table">
                <thead>
                  <tr>
                    <th>DTC</th>
                    <th>HEX码</th>
                    <th>status</th>
                    <th>描述</th>
                    <th>是否存在</th>
                    <th style="width: 140px;">
                      人工校验
                      <div class="no-print" style="display:inline-flex; gap:2px; margin-left:4px;">
                        <button class="pdx-report-header-bulk-btn pdx-report-header-bulk-btn--pass" data-role="pdx-report-bulk" data-type="dtc" data-value="pass" title="当前列全选 PASS" type="button">PASS</button>
                        <button class="pdx-report-header-bulk-btn pdx-report-header-bulk-btn--fail" data-role="pdx-report-bulk" data-type="dtc" data-value="fail" title="当前列全选 FAIL" type="button">FAIL</button>
                      </div>
                    </th>
                    <th style="width: 180px;">备注</th>
                  </tr>
                </thead>
                <tbody>${dtcRowsHtml}</tbody>
              </table>
            </div>
          </section>

          <!-- DID测试结果 Section -->
          <section class="flash-config-sheet flash-config-sheet--main pdx-report-section ${state.pdxReportActiveTab === 'did' ? '' : 'is-hidden-tab'}" style="margin-top: 0; margin-bottom: 0;">
            <div class="flash-config-sheet__title">DID校验结果</div>
            <div class="pdx-check-table-wrap" style="max-height: 450px !important; overflow-y: auto;">
              <table class="pdx-check-table">
                <thead>
                  <tr>
                    <th>DID</th>
                    <th>名称</th>
                    <th>预期范围</th>
                    <th>当前值</th>
                    <th>校验结果</th>
                    <th style="width: 140px;">
                      人工校验
                      <div class="no-print" style="display:inline-flex; gap:2px; margin-left:4px;">
                        <button class="pdx-report-header-bulk-btn pdx-report-header-bulk-btn--pass" data-role="pdx-report-bulk" data-type="did" data-value="pass" title="当前列全选 PASS" type="button">PASS</button>
                        <button class="pdx-report-header-bulk-btn pdx-report-header-bulk-btn--fail" data-role="pdx-report-bulk" data-type="did" data-value="fail" title="当前列全选 FAIL" type="button">FAIL</button>
                      </div>
                    </th>
                    <th style="width: 180px;">备注</th>
                  </tr>
                </thead>
                <tbody>${didRowsHtml}</tbody>
              </table>
            </div>
          </section>

          <!-- 快照和扩展信息 Section -->
          <section class="flash-config-sheet flash-config-sheet--main pdx-report-section ${state.pdxReportActiveTab === 'uds' ? '' : 'is-hidden-tab'}" style="border:none; background:transparent; padding:0; box-shadow:none; margin-top: 0; margin-bottom: 0;">
            <div class="pdx-check-table-wrap" style="max-height: 450px !important; overflow-y: auto; padding-right: 4px;">
              ${udsReportHtml}
            </div>
          </section>
        </div>
      </section>`;
  }
  function pdxExportHtmlReport() {
    const report = getReportData();
    const ecu = getSelectedEcu();
    const bus = getSelectedBus();
    const ecuName = ecu ? ecu.name : "UNKNOWN_ECU";
    const busType = bus ? bus.busType : "CAN";
    
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timestamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const fileName = `${ecuName}_${busType}_${report.reporter}_${timestamp}.html`;
    
    const dtcRowsHtml = report.dtcRows.map(row => {
      const isPass = row.manualVal === "pass";
      const isFail = row.manualVal === "fail";
      const statusBadge = isPass 
        ? `<span class="pdx-check-status is-pass">PASS</span>` 
        : isFail 
          ? `<span class="pdx-check-status is-fail">FAIL</span>` 
          : `<span class="pdx-check-status is-pending">未确认</span>`;
      return `
        <tr>
          <td>${esc(row.code)}</td>
          <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${esc(row.hex)}</td>
          <td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">${esc(row.status)}</td>
          <td>${esc(row.description)}</td>
          <td>
            <span class="pdx-check-status ${row.result === '存在' ? 'is-fail' : row.result === '不存在' ? 'is-pass' : row.result === '多余' ? 'is-extra' : ''}">
              ${esc(row.result)}
            </span>
          </td>
          <td>${statusBadge}</td>
          <td style="color:#475569; font-style:italic;">${esc(row.note || '--')}</td>
        </tr>`;
    }).join("");

    const didRowsHtml = report.didRows.map(row => {
      const isPass = row.manualVal === "pass";
      const isFail = row.manualVal === "fail";
      const statusBadge = isPass 
        ? `<span class="pdx-check-status is-pass">PASS</span>` 
        : isFail 
          ? `<span class="pdx-check-status is-fail">FAIL</span>` 
          : `<span class="pdx-check-status is-pending">未确认</span>`;
      return `
        <tr>
          <td>${esc(row.id)}</td>
          <td>${esc(row.name)}</td>
          <td>${esc(row.expected)}</td>
          <td>
            <span class="pdx-check-did-value">
              <span class="pdx-check-did-flag ${row.validationPassed ? 'is-pass' : 'is-fail'}">
                ${row.validationPassed ? '√' : 'x'}
              </span>
              <span>${esc(row.value)}</span>
            </span>
          </td>
          <td>${esc(row.validationResult)}</td>
          <td>${statusBadge}</td>
          <td style="color:#475569; font-style:italic;">${esc(row.note || '--')}</td>
        </tr>`;
    }).join("");

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(report.title)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #f1f5f9;
      color: #1e293b;
      margin: 0;
      padding: 24px;
      display: flex;
      justify-content: center;
    }
    .report-container {
      width: 100%;
      max-width: 900px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .report-header {
      padding: 16px 24px;
      background: linear-gradient(180deg, #f8fafc, #f1f5f9);
      border-bottom: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .report-header strong {
      font-size: 16px;
      color: #0f172a;
    }
    .report-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .flash-config-sheet {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #fff;
      overflow: hidden;
    }
    .flash-config-sheet__title {
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      padding: 8px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #cbd5e1;
    }
    .pdx-check-report-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px 20px;
      padding: 14px 16px;
    }
    .pdx-check-report-meta div {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pdx-check-report-meta span {
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 600;
    }
    .pdx-check-report-meta strong {
      font-size: 13px;
      color: #0f172a;
    }
    .pdx-check-report-result {
      font-size: 13px;
      font-weight: bold;
    }
    .pdx-check-report-result.is-success {
      color: #16a34a;
    }
    .pdx-check-report-result.is-fail {
      color: #dc2626;
    }
    
    /* Tabs 页签 */
    .pdx-report-tabs {
      display: flex;
      border-bottom: 2px solid #cbd5e1;
      background: #f8fafc;
      margin: 4px 0 8px 0;
      border-radius: 4px;
    }
    .pdx-report-tab-btn {
      flex: 1;
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .pdx-report-tab-btn:hover {
      color: #0f172a;
      background: #f1f5f9;
    }
    .pdx-report-tab-btn.is-active {
      color: #2f6bff;
      border-bottom-color: #2f6bff;
      background: #fff;
    }
    
    /* 表格 */
    .pdx-check-table-wrap {
      overflow-x: auto;
      width: 100%;
    }
    .pdx-check-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .pdx-check-table th {
      padding: 8px 12px;
      text-align: left;
      font-weight: 600;
      color: #4d5f76;
      border-bottom: 1px solid #cbd5e1;
      background: #f8fafc;
      white-space: nowrap;
    }
    .pdx-check-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #eef1f5;
      color: #0f172a;
      word-break: break-all;
    }
    .pdx-check-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
    }
    .pdx-check-status.is-pass { background: #dcfce7; color: #16a34a; }
    .pdx-check-status.is-fail { background: #fee2e2; color: #dc2626; }
    .pdx-check-status.is-pending { background: #f1f5f9; color: #64748b; }
    .pdx-check-status.is-extra { background: #fef9c3; color: #d97706; }
    
    .pdx-check-did-value {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pdx-check-did-flag {
      display: inline-block;
      width: 14px;
      height: 14px;
      line-height: 12px;
      text-align: center;
      border-radius: 50%;
      font-size: 10px;
      font-weight: bold;
    }
    .pdx-check-did-flag.is-pass {
      background: #dcfce7;
      color: #16a34a;
      border: 1px solid #bbf7d0;
    }
    .pdx-check-did-flag.is-fail {
      background: #fee2e2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }

    .is-hidden-tab {
      display: none !important;
    }
    .uds-dtc-header-trigger:hover table {
      border-color: #2f6bff !important;
    }
    @media print {
      .uds-dtc-details-wrapper {
        display: flex !important;
      }
      .uds-toggle-icon {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <i class="fa-solid fa-file-invoice" style="color: #2f6bff; font-size: 18px;"></i>
      <strong>${esc(report.title)}</strong>
    </div>
    <div class="report-body">
      <section class="flash-config-sheet" style="padding: 8px 12px; margin-bottom: 4px;">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; font-size: 11px;">
          <div style="display: flex; gap: 4px; align-items: baseline;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">报告人:</span>
            <strong style="color: #0f172a; font-weight: 600;">${esc(report.reporter)}</strong>
          </div>
          <div style="display: flex; gap: 4px; align-items: baseline;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">导出时间:</span>
            <strong style="color: #0f172a; font-weight: 600;">${esc(report.exportTime)}</strong>
          </div>
          <div style="display: flex; gap: 4px; align-items: baseline; grid-column: span 2;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">总体结果:</span>
            <strong class="pdx-check-report-result ${report.finalResult === '成功' ? 'is-success' : 'is-fail'}" style="font-weight: 700;">
              ${esc(report.finalResult)}${esc(report.manualLabel)}
            </strong>
          </div>
          
          <div style="display: flex; gap: 4px; align-items: baseline;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F187 供应商编码:</span>
            <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.supplier)}</strong>
          </div>
          <div style="display: flex; gap: 4px; align-items: baseline;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F18A ECU零件号:</span>
            <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.partNo)}</strong>
          </div>
          <div style="display: flex; gap: 4px; align-items: baseline;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F193 节点地址:</span>
            <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.nodeAddr)}</strong>
          </div>
          <div style="display: flex; gap: 4px; align-items: baseline;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F195 系统配置:</span>
            <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.sysConfig)}</strong>
          </div>
          
          <div style="display: flex; gap: 4px; align-items: baseline;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F189 应用软件版:</span>
            <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.appVersion)}</strong>
          </div>
          <div style="display: flex; gap: 4px; align-items: baseline;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F1C0 标定软件版:</span>
            <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.calVersion)}</strong>
          </div>
          <div style="display: flex; gap: 4px; align-items: baseline; grid-column: span 2;">
            <span style="color: #64748b; font-weight: 500; white-space: nowrap;">F1C1 底层软件版:</span>
            <strong style="color: #0f172a; font-family: monospace; font-weight: 600;">${esc(report.versions.bootVersion)}</strong>
          </div>
        </div>
      </section>

      <!-- 三 Tab 页签分栏切换 -->
      <div class="pdx-report-tabs" style="margin: 4px 0 2px 0;">
        <button class="pdx-report-tab-btn is-active" data-role="bd-report-tab" data-tab="dtc" type="button">
          <i class="fa-solid fa-bug"></i> 故障码测试 (DTC)
        </button>
        <button class="pdx-report-tab-btn" data-role="bd-report-tab" data-tab="did" type="button">
          <i class="fa-solid fa-database"></i> 配置项校验 (DID)
        </button>
        <button class="pdx-report-tab-btn" data-role="bd-report-tab" data-tab="uds" type="button">
          <i class="fa-solid fa-file-invoice"></i> 快照和扩展信息
        </button>
      </div>

      <!-- DTC测试结果 Section -->
      <section class="flash-config-sheet pdx-report-section pdx-report-section--dtc" style="margin-top: 0; margin-bottom: 0;">
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
                <th style="width: 100px;">人工校验</th>
                <th style="width: 180px;">备注</th>
              </tr>
            </thead>
            <tbody>${dtcRowsHtml}</tbody>
          </table>
        </div>
      </section>

      <!-- DID测试结果 Section -->
      <section class="flash-config-sheet pdx-report-section pdx-report-section--did is-hidden-tab" style="margin-top: 0; margin-bottom: 0;">
        <div class="flash-config-sheet__title">DID测试结果</div>
        <div class="pdx-check-table-wrap">
          <table class="pdx-check-table">
            <thead>
              <tr>
                <th>DID</th>
                <th>名称</th>
                <th>预期范围</th>
                <th>当前值</th>
                <th>校验结果</th>
                <th style="width: 100px;">人工校验</th>
                <th style="width: 180px;">备注</th>
              </tr>
            </thead>
            <tbody>${didRowsHtml}</tbody>
          </table>
        </div>
      </section>

      <!-- 快照和扩展信息 Section -->
      <section class="flash-config-sheet pdx-report-section pdx-report-section--uds is-hidden-tab" style="border:none; background:transparent; padding:0; box-shadow:none; margin-top: 0; margin-bottom: 0;">
        ${getUdsReportHtml()}
      </section>
    </div>
  </div>

  <script>
    document.querySelectorAll('[data-role="bd-report-tab"]').forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('[data-role="bd-report-tab"]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        
        document.querySelectorAll('.pdx-report-section').forEach(sec => {
          if (sec.classList.contains('pdx-report-section--' + tab)) {
            sec.classList.remove('is-hidden-tab');
          } else {
            sec.classList.add('is-hidden-tab');
          }
        });
      });
    });
  <\/script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast("校验报告 HTML 文档导出成功！");
  }
  /* ============================
     Render: Full Page
     ============================ */
  function render() {
    const ecu = getSelectedEcu();
    const bus = getSelectedBus();

    // Update workspace window title bar breadcrumbs dynamically
    updateTitleBreadcrumb(ecu, bus);

    root.innerHTML = `
      <div class="basic-diag-shell ${state.treeCollapsed ? "is-tree-collapsed" : ""}">
        ${renderTree()}
        <section class="basic-diag-right">
          ${ecu ? `
            ${renderAddrBar()}
            ${renderSecAlgoDialog()}
            ${renderReportDialog()}
            ${renderPdxConfigDialog()}
            ${renderDtcDetailsDialog()}
            ${renderTabs()}
            ${renderServiceTab()}
            ${renderPdxTab()}
            ${renderCommTab()}
          ` : `
            ${renderAddrBar()}
            <div class="basic-diag-placeholder">
              <i class="fa-solid fa-arrow-left"></i>
              <span>请在左侧选择一个 ECU 开始诊断</span>
            </div>
          `}
        </section>
      </div>
      ${renderBusConfigDialog()}
      ${renderContextMenu()}
    `;
    bindEvents();
    syncHexInput();
  }

  function renderContextMenu() {
    if (!state.contextMenu || !state.contextMenu.open) return "";
    const { type, x, y } = state.contextMenu;
    const style = `position: fixed; left: ${x}px; top: ${y}px; z-index: 9999;`;
    
    if (type === "bus") {
      return `
        <div class="basic-diag-context-menu" style="${style}">
          <button class="basic-diag-context-menu__item" data-role="bd-context-edit-bus">
            <i class="fa-regular fa-pen-to-square"></i>
            <span>编辑总线</span>
          </button>
        </div>
      `;
    } else if (type === "ecu") {
      return `
        <div class="basic-diag-context-menu" style="${style}">
          <button class="basic-diag-context-menu__item basic-diag-context-menu__item--danger" data-role="bd-context-delete-ecu">
            <i class="fa-regular fa-trash-can"></i>
            <span>删除ECU</span>
          </button>
        </div>
      `;
    }
    return "";
  }

  function renderBusConfigDialog() {
    if (!state.busConfigDialogOpen) return "";
    const bus = getBusConfig().find(b => b.id === state.editingBusId);
    if (!bus) return "";
    
    const data = state.editingBusData || {};
    const isCanFd = data.type === "canfd";
    const isCanOrCanFd = data.type === "can" || data.type === "canfd";
    
    return `
      <div class="bd-modal-overlay">
        <div class="bd-bus-dialog-card">
          <div class="bd-bus-dialog-header">
            <span class="bd-bus-dialog-title">
              <i class="fa-solid fa-gear" style="color: #2f6bff; margin-right: 6px;"></i>
              ${esc(data.name || bus.name)} 总线参数设置
            </span>
            <button class="bd-bus-dialog-close-btn" data-role="bd-bus-dialog-close">&times;</button>
          </div>
          <div class="bd-bus-dialog-body">
            <div class="bd-bus-grid">
              <div class="bd-bus-field-group">
                <label>总线类型</label>
                <input type="text" class="bd-bus-input is-readonly" value="${esc(data.type ? data.type.toUpperCase() : bus.type.toUpperCase())}" readonly />
              </div>
              <div class="bd-bus-field-group">
                <label>总线名称</label>
                <input type="text" class="bd-bus-input" data-field="name" value="${esc(data.name)}" />
              </div>
              
              <div class="bd-bus-field-group">
                <label>标准波特率</label>
                <select class="bd-bus-select" data-field="baudrate" ${isCanOrCanFd ? "" : "disabled"}>
                  <option value="250Kbps" ${data.baudrate === "250Kbps" ? "selected" : ""}>250 kbps</option>
                  <option value="500Kbps" ${data.baudrate === "500Kbps" || data.baudrate === "500K/2M" ? "selected" : ""}>500 kbps</option>
                  <option value="1Mbps" ${data.baudrate === "1Mbps" ? "selected" : ""}>1 Mbps</option>
                </select>
              </div>
              <div class="bd-bus-field-group">
                <label>数据波特率</label>
                <select class="bd-bus-select" data-field="dataBaudrate" ${isCanFd ? "" : "disabled"}>
                  <option value="2 Mbps" ${data.dataBaudrate === "2 Mbps" || data.dataBaudrate === "2M" ? "selected" : ""}>2 Mbps</option>
                  <option value="5 Mbps" ${data.dataBaudrate === "5 Mbps" || data.dataBaudrate === "5M" ? "selected" : ""}>5 Mbps</option>
                </select>
              </div>
              
              <div class="bd-bus-field-group">
                <label>采样点</label>
                <input type="text" class="bd-bus-input" data-field="samplePoint" value="${esc(data.samplePoint)}" />
              </div>
              <div class="bd-bus-field-group">
                <label>Tq</label>
                <input type="text" class="bd-bus-input" data-field="tq" value="${esc(data.tq)}" />
              </div>
              
              <div class="bd-bus-field-group">
                <label>时间量</label>
                <input type="text" class="bd-bus-input" data-field="timeAmount" value="${esc(data.timeAmount)}" />
              </div>
              <div class="bd-bus-field-group">
                <label>预定标器</label>
                <input type="text" class="bd-bus-input" data-field="prescaler" value="${esc(data.prescaler)}" />
              </div>
              
              <div class="bd-bus-field-group">
                <label>位定时段1</label>
                <input type="text" class="bd-bus-input" data-field="timeSegment1" value="${esc(data.timeSegment1)}" />
              </div>
              <div class="bd-bus-field-group">
                <label>位定时段2</label>
                <input type="text" class="bd-bus-input" data-field="timeSegment2" value="${esc(data.timeSegment2)}" />
              </div>
              
              <div class="bd-bus-field-group" style="grid-column: span 2;">
                <label>同步跳转宽度 (SJW)</label>
                <input type="text" class="bd-bus-input" data-field="sjw" value="${esc(data.sjw)}" />
              </div>
            </div>
          </div>
          <div class="bd-bus-dialog-footer">
            <button class="bd-bus-btn bd-bus-btn--cancel" data-role="bd-bus-dialog-close">取消</button>
            <button class="bd-bus-btn bd-bus-btn--save" data-role="bd-bus-dialog-save">保存</button>
          </div>
        </div>
      </div>
    `;
  }

  /* ============================
     Sync hex input
     ============================ */
  function syncHexInput() {
    if (!state.hexInput) {
      const inp = root.querySelector('[data-role="bd-hex-input"]');
      if (inp) inp.value = buildHexForCurrentService();
    }
  }

  /* ============================
     Actions
     ============================ */
  function mockCustomResponse(hex) {
    const bytes = hex.match(/[0-9a-fA-F]{2}/g) || [];
    const sid = bytes.length ? parseInt(bytes[0], 16) : NaN;
    const positiveSid = Number.isNaN(sid) ? "7F" : ((sid + 0x40) & 0xFF).toString(16).toUpperCase().padStart(2, "0");
    const raw = [positiveSid, ...bytes.slice(1)].join(" ") || "7F 00 11";
    return {
      positive: true,
      raw,
      fields: [
        ["Request", hex],
        ["Addressing", state.funcAddr ? "功能寻址" : "物理寻址"],
        ["ECUResponse", raw],
      ],
    };
  }

  function doSend() {
    const svc = UDS_SERVICES[state.selectedServiceIdx];
    const inp = root.querySelector('[data-role="bd-hex-input"]');
    const hex = inp ? inp.value.trim() : buildHexForCurrentService();
    if (!hex) return;

    state.logSeq += 1;
    state.logEntries.push({ seq: state.logSeq, time: now(), dir: "Tx", data: hex });

    if (state.selectedServiceIdx === CUSTOM_SERVICE_IDX) {
      const resp = mockCustomResponse(hex);
      state.lastResponse = resp;
      state.logSeq += 1;
      state.logEntries.push({ seq: state.logSeq, time: now(), dir: "Rx", data: resp.raw });
      if (state.logEntries.length > 200) state.logEntries = state.logEntries.slice(-200);
      state.hexInput = "";
      render();
      setTimeout(() => {
        const logBody = root.querySelector(".basic-diag-log__body");
        if (logBody) logBody.scrollTop = logBody.scrollHeight;
      }, 30);
      return;
    }

    const sub = state.subFunctionValues[state.selectedServiceIdx];
    const extra = state.extraParamValues[state.selectedServiceIdx];
    const dids = Object.keys(state.selectedDids).filter(k => state.selectedDids[k]);

    let resp;
    if (svc && svc.mockResponse) {
      resp = svc.mockResponse(sub, extra, dids);
    } else {
      resp = { positive: true, raw: "-- mock --", fields: [["Info", "无模拟数据"]] };
    }

    state.lastResponse = resp;
    state.logSeq += 1;
    state.logEntries.push({ seq: state.logSeq, time: now(), dir: resp.positive ? "Rx" : "Err", data: resp.raw });

    if (state.logEntries.length > 200) state.logEntries = state.logEntries.slice(-200);

    state.hexInput = "";
    render();

    setTimeout(() => {
      const logBody = root.querySelector(".basic-diag-log__body");
      if (logBody) logBody.scrollTop = logBody.scrollHeight;
    }, 30);
  }

  function pdxReadDtc(quiet = false) {
    const statuses = ["存在", "不存在"];
    const newTrace = [];
    
    // 19 0A Read Supported DTCs
    newTrace.push({ time: now(), dir: "Tx", data: "19 0A" });
    // Payload contains DTC hex codes + status bytes
    newTrace.push({ time: now(), dir: "Rx", data: "59 0A 2F C1 00 87 2F 92 41 00 04 C1 21 00 00 80 56 00 28 C3 00 00 00 C2 93 00 2F 90 00 1B 2C" });

    // PDX Defined DTCs
    PDX_MOCK_DTCS.forEach(dtc => {
      // Simulating UDS sequence: For each supported DTC, read 19 04 and 19 06 with FF mask
      newTrace.push({ time: now(), dir: "Tx", data: `19 04 ${dtc.hex} FF` });
      let allSnapsData = [];
      ["01", "02", "03"].forEach(recordNum => {
        const snaps = PDX_DTC_UDS_DETAILS[dtc.code]?.snapshots[recordNum] || [];
        const snapData = snaps.map(s => s.value.replace(/[^0-9V]/g, "")).join(" ") || "00";
        allSnapsData.push(`${recordNum} ${snapData}`);
      });
      newTrace.push({ time: now(), dir: "Rx", data: `59 04 ${dtc.hex} FF ${allSnapsData.join(" ")}` });
      
      newTrace.push({ time: now(), dir: "Tx", data: `19 06 ${dtc.hex} FF` });
      let allExtData = [];
      ["01", "02", "03"].forEach(recordNum => {
        const ext = PDX_DTC_UDS_DETAILS[dtc.code]?.extended[recordNum] || { occurrenceCounter: 0, agingCounter: 0, statusByte: "00" };
        allExtData.push(`${recordNum} ${ext.occurrenceCounter} ${ext.agingCounter} ${ext.statusByte}`);
      });
      newTrace.push({ time: now(), dir: "Rx", data: `59 06 ${dtc.hex} FF ${allExtData.join(" ")}` });
    });

    // Extra DTCs: "U029300", "B10001B"
    const extraCodes = ["U029300", "B10001B"];
    extraCodes.forEach(code => {
      const hex = code === "U029300" ? "C2 93 00" : "90 00 1B";
      newTrace.push({ time: now(), dir: "Tx", data: `19 04 ${hex} FF` });
      let allSnapsData = [];
      ["01", "02", "03"].forEach(recordNum => {
        const snaps = PDX_DTC_UDS_DETAILS[code]?.snapshots[recordNum] || [];
        const snapData = snaps.map(s => s.value.replace(/[^0-9V]/g, "")).join(" ") || "00";
        allSnapsData.push(`${recordNum} ${snapData}`);
      });
      newTrace.push({ time: now(), dir: "Rx", data: `59 04 ${hex} FF ${allSnapsData.join(" ")}` });
      
      newTrace.push({ time: now(), dir: "Tx", data: `19 06 ${hex} FF` });
      let allExtData = [];
      ["01", "02", "03"].forEach(recordNum => {
        const ext = PDX_DTC_UDS_DETAILS[code]?.extended[recordNum] || { occurrenceCounter: 0, agingCounter: 0, statusByte: "00" };
        allExtData.push(`${recordNum} ${ext.occurrenceCounter} ${ext.agingCounter} ${ext.statusByte}`);
      });
      newTrace.push({ time: now(), dir: "Rx", data: `59 06 ${hex} FF ${allExtData.join(" ")}` });
    });

    if (!quiet) {
      state.pdxDtcLoading = true;
      state.pdxTraceLog = [...newTrace, ...state.pdxTraceLog].slice(0, 200);
      render();

      setTimeout(() => {
        PDX_MOCK_DTCS.forEach(dtc => {
          let status = "不存在";
          if (dtc.code === "U010087" || dtc.code === "C056100") {
            status = "存在";
          }
          state.pdxDtcResults[dtc.code] = status;
        });
        extraCodes.forEach(code => {
          state.pdxDtcExtraResults[code] = "多余";
        });
        state.pdxDtcLoading = false;
        render();
      }, 1200);
    } else {
      PDX_MOCK_DTCS.forEach(dtc => {
        let status = "不存在";
        if (dtc.code === "U010087" || dtc.code === "C056100") {
          status = "存在";
        }
        state.pdxDtcResults[dtc.code] = status;
      });
      extraCodes.forEach(code => {
        state.pdxDtcExtraResults[code] = "多余";
      });
    }
    return newTrace;
  }
  function pdxUdsReadDtc(quiet = false) {
    const maskHex = state.pdxMaskInput || "08";
    const mask = parseInt(maskHex, 16) || 0;
    const newTrace = [];
    
    // 发送 19 02 + 掩码
    newTrace.push({ time: now(), dir: "Tx", data: `19 02 ${maskHex.toUpperCase().padStart(2, '0')}` });
    
    // 构建 Rx 数据。Rx 数据类似于 59 02 + statusAvailabilityMask (比如 FF) + DTC1 + status1 + DTC2 + status2...
    // 这里我们把所有可能存在的 DTC 拿出来（包括 Mock 和 Extra）
    const allCandidates = [
      ...PDX_MOCK_DTCS.map(d => ({ code: d.code, hex: d.hex, desc: d.desc, statusByte: PDX_DTC_UDS_DETAILS[d.code]?.statusByte || "00" })),
      { code: "U029300", hex: "C2 93 00", desc: "--", statusByte: "2F" },
      { code: "B10001B", hex: "90 00 1B", desc: "--", statusByte: "2C" }
    ];
    
    // 筛选出符合掩码 of (按位与不为0)
    const matched = allCandidates.filter(d => {
      const statusVal = parseInt(d.statusByte, 16) || 0;
      return (statusVal & mask) !== 0;
    });
    
    // 构建 Rx 报文 hex
    let rxData = `59 02 FF`;
    matched.forEach(d => {
      rxData += ` ${d.hex} ${d.statusByte}`;
    });
    newTrace.push({ time: now(), dir: "Rx", data: rxData });
    
    // 轮询读快照 19 04 和扩展 19 06 (均使用 FF 掩码读取)
    matched.forEach(d => {
      // 19 04 [DTC Hex] FF
      newTrace.push({ time: now(), dir: "Tx", data: `19 04 ${d.hex} FF` });
      
      const details = PDX_DTC_UDS_DETAILS[d.code];
      let allSnapsData = [];
      
      ["01", "02", "03"].forEach(recordNum => {
        const snapshotsList = (details && details.snapshots && details.snapshots[recordNum])
          ? details.snapshots[recordNum]
          : [
              { name: "里程 (Odometer)", value: "0 km" },
              { name: "供电电压 (Battery Voltage)", value: "12.0 V" },
              { name: "发动机转速 (Engine Speed)", value: "0 rpm" },
              { name: "车速 (Vehicle Speed)", value: "0 km/h" },
              { name: "冷却液温度 (Coolant Temp)", value: "85 ℃" }
            ];

        let snapValues = [];
        snapshotsList.forEach(s => {
          const valKey = `${d.code}_${recordNum}_${s.name}`;
          const currentVal = (state.pdxUdsSnapshotValues && valKey in state.pdxUdsSnapshotValues)
            ? state.pdxUdsSnapshotValues[valKey]
            : s.value;
          snapValues.push(currentVal.replace(/[^0-9\.V]/g, ""));
        });
        allSnapsData.push(`${recordNum} ${snapValues.join(" ")}`);
      });
      newTrace.push({ time: now(), dir: "Rx", data: `59 04 ${d.hex} FF ${allSnapsData.join(" ")}` });
      
      // 19 06 [DTC Hex] FF
      newTrace.push({ time: now(), dir: "Tx", data: `19 06 ${d.hex} FF` });
      
      let allExtData = [];
      ["01", "02", "03"].forEach(recordNum => {
        const extDataForRecord = (details && details.extended && details.extended[recordNum])
          ? details.extended[recordNum]
          : { occurrenceCounter: 0, agingCounter: 0, statusByte: "00" };

        let occurrenceVal = String(extDataForRecord.occurrenceCounter);
        let agingVal = String(extDataForRecord.agingCounter);
        let statusVal = extDataForRecord.statusByte;
        
        if (state.pdxUdsExtendedValues) {
          const occKey = `${d.code}_${recordNum}_occurrenceCounter`;
          const agKey = `${d.code}_${recordNum}_agingCounter`;
          const stKey = `${d.code}_${recordNum}_statusByte`;
          if (occKey in state.pdxUdsExtendedValues) occurrenceVal = state.pdxUdsExtendedValues[occKey].replace(/次/g, "");
          if (agKey in state.pdxUdsExtendedValues) agingVal = state.pdxUdsExtendedValues[agKey].replace(/周期/g, "");
          if (stKey in state.pdxUdsExtendedValues) statusVal = state.pdxUdsExtendedValues[stKey].replace(/0x/g, "");
        }
        allExtData.push(`${recordNum} ${occurrenceVal.replace(/[^0-9]/g, "")} ${agingVal.replace(/[^0-9]/g, "")} ${statusVal}`);
      });
      newTrace.push({ time: now(), dir: "Rx", data: `59 06 ${d.hex} FF ${allExtData.join(" ")}` });
    });

    if (!quiet) {
      state.pdxUdsLoading = true;
      state.pdxTraceLog = [...newTrace, ...state.pdxTraceLog].slice(0, 200);
      render();

      setTimeout(() => {
        state.pdxUdsDtcResults = matched;
        if (matched.length > 0) {
          state.pdxUdsSelectedDtcCode = matched[0].code;
        } else {
          state.pdxUdsSelectedDtcCode = "";
        }
        state.pdxUdsLoading = false;
        render();
        if (typeof showToast === 'function') showToast(`UDS获取故障信息完成，共 ${matched.length} 个故障码`);
      }, 1200);
    } else {
      state.pdxUdsDtcResults = matched;
      if (matched.length > 0) {
        state.pdxUdsSelectedDtcCode = matched[0].code;
      } else {
        state.pdxUdsSelectedDtcCode = "";
      }
    }
    return newTrace;
  }

  function pdxUdsClearDtc() {
    const newTrace = [];
    newTrace.push({ time: now(), dir: "Tx", data: `14 FF FF FF` });
    newTrace.push({ time: now(), dir: "Rx", data: `54` });
    
    // 清空状态
    state.pdxUdsDtcResults = [];
    state.pdxUdsSelectedDtcCode = "";
    
    state.pdxTraceLog = [...newTrace, ...state.pdxTraceLog].slice(0, 200);
    render();
    if (typeof showToast === 'function') showToast("UDS清除故障码成功");
  }

  function pdxReadDid(quiet = false) {
    const ecu = getSelectedEcu();
    const reqAddr = ecu?.requestAddr || "0618";
    const mockVals = {
      F189: "V3.2.1",
      F190: "LGWCAN1ECM0123456789",
      F187: "BOSCH-2026",
      F18A: "ECM-PN-2026",
      F18B: "ECM-HW-A1",
      F18C: "ECM-SW-A1",
      F193: reqAddr.startsWith("0x") ? reqAddr : "0x" + reqAddr,
      F195: "SYS-CFG-V1.0",
      F1C0: "GW4N20-E02-710",
      F1C1: "ECM_BL_1.0.3"
    };
    const reasonCycle = ["通过", "超出范围", "负响应", "无响应", "无效值"];
    const newTrace = [];
    PDX_MOCK_DIDS.forEach((did, index) => {
      const isConfigured = state.selectedPdxDids[did.id] === true;
      if (!isConfigured) return;

      const val = mockVals[did.id] || "MOCK";
      const reason = reasonCycle[index % reasonCycle.length];
      const pass = reason === "通过";
      const displayVal = reason === "负响应" ? "7F 22 31" : reason === "无响应" ? "--" : val;
      newTrace.push({ time: now(), dir: "Tx", data: `22 ${did.id.slice(0,2)} ${did.id.slice(2)}` });
      newTrace.push({ time: now(), dir: "Rx", data: reason === "负响应" ? `7F 22 31` : reason === "无响应" ? "--" : `62 ${did.id.slice(0,2)} ${did.id.slice(2)} ${val}` });
    });

    if (!quiet) {
      state.pdxDidLoading = true;
      state.pdxTraceLog = [...newTrace, ...state.pdxTraceLog].slice(0, 200);
      render();

      setTimeout(() => {
        PDX_MOCK_DIDS.forEach((did, index) => {
          const isConfigured = state.selectedPdxDids[did.id] === true;
          if (!isConfigured) return;
          const val = mockVals[did.id] || "MOCK";
          const reason = reasonCycle[index % reasonCycle.length];
          const pass = reason === "通过";
          const displayVal = reason === "负响应" ? "7F 22 31" : reason === "无响应" ? "--" : val;
          state.pdxDidResults[did.id] = { value: displayVal, pass, validationResult: reason };
        });
        state.pdxDidLoading = false;
        render();
      }, 1200);
    } else {
      PDX_MOCK_DIDS.forEach((did, index) => {
        const isConfigured = state.selectedPdxDids[did.id] === true;
        if (!isConfigured) return;
        const val = mockVals[did.id] || "MOCK";
        const reason = reasonCycle[index % reasonCycle.length];
        const pass = reason === "通过";
        const displayVal = reason === "负响应" ? "7F 22 31" : reason === "无响应" ? "--" : val;
        state.pdxDidResults[did.id] = { value: displayVal, pass, validationResult: reason };
      });
    }
    return newTrace;
  }

  function pdxReadAll() {
    state.pdxDtcLoading = true;
    state.pdxDidLoading = true;
    state.pdxUdsLoading = true;

    state.pdxDidResults = {};
    state.pdxDtcResults = {};
    state.pdxDtcExtraResults = {};
    
    const dtcTrace = pdxReadDtc(true);
    const didTrace = pdxReadDid(true);
    const udsTrace = pdxUdsReadDtc(true);
    
    state.pdxTraceLog = [...dtcTrace, ...didTrace, ...udsTrace, ...state.pdxTraceLog].slice(0, 200);
    render();

    setTimeout(() => {
      state.pdxDtcLoading = false;
      state.pdxDidLoading = false;
      state.pdxUdsLoading = false;
      render();
      if (typeof showToast === 'function') showToast("一键读取PDX校验数据完成！");
    }, 1500);
  }

  /* ============================
     Event Binding
     ============================ */
  function bindEvents() {
    if (!state.globalListenersBound) {
      state.globalListenersBound = true;
      document.addEventListener("click", (e) => {
        if (state.contextMenu && state.contextMenu.open && !e.target.closest('.basic-diag-context-menu')) {
          state.contextMenu.open = false;
          render();
        }
      });
      document.addEventListener("contextmenu", (e) => {
        if (state.contextMenu && state.contextMenu.open && !e.target.closest('[data-role="bd-pick-bus"]') && !e.target.closest('[data-role="bd-pick-ecu"]')) {
          state.contextMenu.open = false;
          render();
        }
      });
    }

    // 绑定右键菜单
    root.querySelectorAll('[data-role="bd-pick-bus"]').forEach(btn => {
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.contextMenu = {
          open: true,
          type: "bus",
          busId: btn.dataset.busId,
          ecuId: "",
          x: e.clientX,
          y: e.clientY
        };
        render();
      });
    });

    root.querySelectorAll('[data-role="bd-pick-ecu"]').forEach(btn => {
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.contextMenu = {
          open: true,
          type: "ecu",
          busId: btn.dataset.busId,
          ecuId: btn.dataset.ecuId,
          x: e.clientX,
          y: e.clientY
        };
        render();
      });
    });

    // 右键菜单项点击
    root.querySelector('[data-role="bd-context-edit-bus"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      const busId = state.contextMenu.busId;
      state.contextMenu.open = false;
      const bus = getBusConfig().find(b => b.id === busId);
      if (bus) {
        state.editingBusId = busId;
        state.editingBusData = {
          name: bus.name,
          type: bus.type,
          baudrate: bus.baudrate || "500Kbps",
          dataBaudrate: bus.dataBaudrate || "2 Mbps",
          samplePoint: bus.samplePoint || "80%",
          tq: bus.tq || "0.125 us",
          timeAmount: bus.timeAmount || "16",
          prescaler: bus.prescaler || "1",
          timeSegment1: bus.timeSegment1 || "11",
          timeSegment2: bus.timeSegment2 || "4",
          sjw: bus.sjw || "1"
        };
        state.busConfigDialogOpen = true;
      }
      render();
    });

    root.querySelector('[data-role="bd-context-delete-ecu"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      const busId = state.contextMenu.busId;
      const ecuId = state.contextMenu.ecuId;
      state.contextMenu.open = false;
      
      const bus = getBusConfig().find(b => b.id === busId);
      if (bus && bus.children) {
        bus.children = bus.children.filter(x => x.id !== ecuId);
        if (state.selectedEcuId === ecuId) {
          state.selectedEcuId = "";
        }
      }
      render();
      if (typeof showToast === 'function') showToast("ECU删除成功！");
    });

    // 弹窗关闭
    root.querySelectorAll('[data-role="bd-bus-dialog-close"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.busConfigDialogOpen = false;
        render();
      });
    });

    // 弹窗输入双向绑定
    root.querySelectorAll('.bd-bus-dialog-card .bd-bus-input, .bd-bus-dialog-card .bd-bus-select').forEach(el => {
      el.addEventListener("change", () => {
        const field = el.dataset.field;
        if (field && state.editingBusData) {
          state.editingBusData[field] = el.value;
        }
      });
      el.addEventListener("input", () => {
        const field = el.dataset.field;
        if (field && state.editingBusData) {
          state.editingBusData[field] = el.value;
        }
      });
    });

    // 弹窗保存
    root.querySelector('[data-role="bd-bus-dialog-save"]')?.addEventListener("click", () => {
      const targetBus = getBusConfig().find(b => b.id === state.editingBusId);
      if (targetBus && state.editingBusData) {
        targetBus.name = state.editingBusData.name;
        if (targetBus.type === "canfd") {
          if (state.editingBusData.baudrate === "500Kbps" && state.editingBusData.dataBaudrate === "2 Mbps") {
            targetBus.baudrate = "500K/2M";
          } else {
            const std = state.editingBusData.baudrate.replace("Kbps", "K").replace("Mbps", "M");
            const dat = state.editingBusData.dataBaudrate.replace("Kbps", "K").replace("Mbps", "M").replace(/\s+/g, "");
            targetBus.baudrate = `${std}/${dat}`;
          }
        } else {
          targetBus.baudrate = state.editingBusData.baudrate;
        }
        targetBus.samplePoint = state.editingBusData.samplePoint;
        targetBus.tq = state.editingBusData.tq;
        targetBus.timeAmount = state.editingBusData.timeAmount;
        targetBus.prescaler = state.editingBusData.prescaler;
        targetBus.timeSegment1 = state.editingBusData.timeSegment1;
        targetBus.timeSegment2 = state.editingBusData.timeSegment2;
        targetBus.sjw = state.editingBusData.sjw;
      }
      state.busConfigDialogOpen = false;
      render();
      if (typeof showToast === 'function') showToast("保存总线设置成功！");
    });

    root.querySelectorAll('[data-role="bd-toggle-bus"]').forEach(btn => {
      btn.addEventListener("click", () => {
        const busId = btn.dataset.busId;
        const idx = state.expandedBusIds.indexOf(busId);
        if (idx >= 0) state.expandedBusIds.splice(idx, 1);
        else state.expandedBusIds.push(busId);
        render();
      });
    });

    root.querySelectorAll('[data-role="bd-pick-bus"]').forEach(btn => {
      btn.addEventListener("click", () => {
        const busId = btn.dataset.busId;
        state.selectedBusId = busId;
        state.selectedEcuId = "";
        if (!state.expandedBusIds.includes(busId)) state.expandedBusIds.push(busId);
        state.lastResponse = null;
        state.hexInput = "";
        state.pdxDidResults = {};
        state.pdxDtcResults = {};
        if (state.activeTab === "pdx") {
          state.activeTab = "service";
        }
        // Sync security algorithm dialog
        state.secAlgo.busId = busId;
        state.secAlgo.ecuId = "__tpl__";
        render();
      });
    });

    root.querySelectorAll('[data-role="bd-pick-ecu"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.selectedBusId = btn.dataset.busId;
        state.selectedEcuId = btn.dataset.ecuId;
        state.lastResponse = null;
        state.hexInput = "";
        state.pdxDidResults = {};
        state.pdxDtcResults = {};
        // Sync security algorithm dialog
        state.secAlgo.busId = state.selectedBusId;
        state.secAlgo.ecuId = state.selectedEcuId;
        render();
      });
    });

    root.querySelectorAll('[data-role="bd-toggle-bus-protocol"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const busId = btn.dataset.busId;
        const buses = getBusConfig();
        const bus = buses.find(b => b.id === busId);
        if (bus) {
          if (bus.type === "can") {
            bus.type = "canfd";
            bus.busType = "CANFD";
            bus.name = bus.name.replace("CAN", "CANFD");
            bus.baudrate = "500K/2M";
          } else if (bus.type === "canfd") {
            bus.type = "can";
            bus.busType = "CAN";
            bus.name = bus.name.replace("CANFD", "CAN");
            bus.baudrate = "500Kbps";
          }
          render();
        }
      });
    });

    root.querySelector('[data-role="bd-toggle-pane"]')?.addEventListener("click", () => {
      state.treeCollapsed = !state.treeCollapsed;
      render();
    });

    root.querySelectorAll('[data-role="bd-tab"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.activeTab = btn.dataset.tab;
        render();
      });
    });

    root.querySelectorAll('[data-role="bd-pick-svc"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.selectedServiceIdx = parseInt(btn.dataset.svcIdx, 10);
        state.hexInput = "";
        state.lastResponse = null;
        render();
      });
    });

    root.querySelectorAll('[data-role="bd-subfunc"]').forEach(el => {
      el.addEventListener("change", () => {
        state.subFunctionValues[state.selectedServiceIdx] = el.value;
        state.hexInput = "";
        syncHexInput();
        const svc = UDS_SERVICES[state.selectedServiceIdx];
        if (svc && (svc.hex === "2F" || svc.hex === "19")) {
          render();
        }
      });
    });

    root.querySelector('[data-role="bd-extra-param"]')?.addEventListener("input", (e) => {
      state.extraParamValues[state.selectedServiceIdx] = e.target.value;
      state.hexInput = "";
      syncHexInput();
    });

    root.querySelector('[data-role="bd-write-data"]')?.addEventListener("input", (e) => {
      state.writeData = e.target.value;
      state.hexInput = "";
      syncHexInput();
    });

    root.querySelector('[data-role="bd-io-state"]')?.addEventListener("input", (e) => {
      state.ioState = e.target.value;
      state.hexInput = "";
      syncHexInput();
    });

    root.querySelector('[data-role="bd-dtc-record-num"]')?.addEventListener("input", (e) => {
      state.dtcRecordNum = e.target.value;
      state.hexInput = "";
      syncHexInput();
    });

    root.querySelector('[data-role="bd-did-picker-val-22"]')?.addEventListener("input", (e) => {
      const val = e.target.value;
      state.selectedDids = {};
      state.selectedDids[val] = true;
      state.hexInput = "";
      syncHexInput();
      const label = root.querySelector("#bd-did-name-label-22");
      if (label) {
        const clean = val.replace(/\s+/g, "").toUpperCase();
        const found = DID_DATASOURCE.find(d => d.id === clean);
        label.textContent = found ? found.name : "未知识别符";
      }
    });

    root.querySelector('[data-role="bd-write-did"]')?.addEventListener("input", (e) => {
      const val = e.target.value;
      state.writeDid = val;
      state.hexInput = "";
      syncHexInput();
      const label = root.querySelector("#bd-did-name-label-2E");
      if (label) {
        const clean = val.replace(/\s+/g, "").toUpperCase();
        const found = DID_DATASOURCE.find(d => d.id === clean);
        label.textContent = found ? found.name : "未知识别符";
      }
    });

    root.querySelector('[data-role="bd-io-did"]')?.addEventListener("input", (e) => {
      const val = e.target.value;
      state.ioDid = val;
      state.hexInput = "";
      syncHexInput();
      const label = root.querySelector("#bd-did-name-label-2F");
      if (label) {
        const clean = val.replace(/\s+/g, "").toUpperCase();
        const found = DID_DATASOURCE.find(d => d.id === clean);
        label.textContent = found ? found.name : "未知识别符";
      }
    });

    root.querySelector('[data-role="bd-did-picker-val-31"]')?.addEventListener("input", (e) => {
      const val = e.target.value;
      state.extraParamValues[state.selectedServiceIdx] = val;
      state.hexInput = "";
      syncHexInput();
      const label = root.querySelector("#bd-rid-name-label-31");
      if (label) {
        const clean = val.replace(/\s+/g, "").toUpperCase();
        const found = RID_DATASOURCE.find(r => r.id === clean);
        label.textContent = found ? found.name : "未知例程";
      }
    });

    root.querySelector('[data-role="bd-dtc-picker-val"]')?.addEventListener("input", (e) => {
      const val = e.target.value;
      state.dtcNumber = val;
      state.hexInput = "";
      syncHexInput();
      const label = root.querySelector("#bd-dtc-desc-label-19");
      if (label) {
        const clean = val.replace(/\s+/g, "").toUpperCase();
        const found = PDX_MOCK_DTCS.find(d => d.hex.replace(/\s+/g, "").toUpperCase() === clean);
        label.textContent = found ? found.desc : "未知故障码";
      }
    });

    root.querySelectorAll('.basic-diag-btn-select-did').forEach(btn => {
      btn.addEventListener("click", () => {
        if (state.selectedEcuId === "__tpl__") {
          return; // Template ECU cannot select, only manual input
        }
        const service = btn.dataset.service; // "22", "2E", "2F", "31", "19"
        let curVal = "";
        if (service === "22") {
          curVal = Object.keys(state.selectedDids).find(k => state.selectedDids[k]) || "F189";
        } else if (service === "2E") {
          curVal = state.writeDid;
        } else if (service === "2F") {
          curVal = state.ioDid;
        } else if (service === "31") {
          curVal = state.extraParamValues[state.selectedServiceIdx] || "FF 00";
        } else if (service === "19") {
          curVal = state.dtcNumber;
        }
        
        showDidSelectModal(service, curVal, (newVal) => {
          if (service === "22") {
            state.selectedDids = {};
            state.selectedDids[newVal] = true;
          } else if (service === "2E") {
            state.writeDid = newVal;
          } else if (service === "2F") {
            state.ioDid = newVal;
          } else if (service === "31") {
            const formatted = newVal.length === 4 ? `${newVal.slice(0, 2)} ${newVal.slice(2)}` : newVal;
            state.extraParamValues[state.selectedServiceIdx] = formatted;
          } else if (service === "19") {
            state.dtcNumber = newVal;
          }
          state.hexInput = "";
          syncHexInput();
          render();
        });
      });
    });

    root.querySelector('[data-role="bd-hex-input"]')?.addEventListener("input", (e) => {
      state.hexInput = e.target.value;
      
      // 双向解析：如果选中的是 10 会话控制，且用户输入格式如 "10 XX"
      if (state.selectedServiceIdx !== CUSTOM_SERVICE_IDX) {
        const svc = UDS_SERVICES[state.selectedServiceIdx];
        if (svc && svc.hex === "10") {
          const clean = e.target.value.trim().replace(/\s+/g, '');
          if (clean.length === 4 && clean.startsWith("10")) {
            const sub = clean.substring(2); // "01", "02" 或 "03"
            if (["01", "02", "03"].includes(sub)) {
              state.subFunctionValues[state.selectedServiceIdx] = sub;
              state.lastResponse = null;
              render();
            }
          }
        }
      }
    });

    // 绑定 UDS 解析树 diagnosticSessionType 下拉选择框事件
    root.querySelector('#bd-session-type-select')?.addEventListener("change", (e) => {
      const selectedSub = e.target.value; // "01", "02" 或 "03"
      state.subFunctionValues[state.selectedServiceIdx] = selectedSub;
      
      // 同步修改顶层的 HEX 发送栏内容与响应清空
      state.hexInput = `10 ${selectedSub}`;
      state.lastResponse = null;
      render();
    });

    root.querySelector('[data-role="bd-func-addr"]')?.addEventListener("change", (e) => {
      state.funcAddr = e.target.checked;
    });

    root.querySelector('[data-role="bd-send"]')?.addEventListener("click", doSend);

    root.querySelector('[data-role="bd-hex-input"]')?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSend();
    });

    root.querySelector('[data-role="bd-clear-log"]')?.addEventListener("click", () => {
      state.logEntries = [];
      state.logSeq = 0;
      render();
    });

    root.querySelector('[data-role="bd-pdx-read-all"]')?.addEventListener("click", pdxReadAll);
    root.querySelector('[data-role="bd-pdx-config-version"]')?.addEventListener("click", () => {
      state.pdxConfigVersionOpen = true;
      state.pdxDidSearchQuery = "";
      state.tempSelectedPdxDids = { ...state.selectedPdxDids };
      render();
    });
    root.querySelectorAll('[data-role="bd-pdx-close-config"]').forEach(el => {
      el.addEventListener("click", () => {
        state.pdxConfigVersionOpen = false;
        render();
      });
    });
    root.querySelector('[data-role="bd-pdx-config-all"]')?.addEventListener("click", () => {
      root.querySelectorAll('.pdx-config-checkbox').forEach(cb => {
        const item = cb.closest('.pdx-config-item');
        if (item && item.style.display !== 'none') {
          cb.checked = true;
          state.tempSelectedPdxDids[cb.dataset.didId] = true;
        }
      });
    });
    root.querySelector('[data-role="bd-pdx-config-none"]')?.addEventListener("click", () => {
      root.querySelectorAll('.pdx-config-checkbox').forEach(cb => {
        const item = cb.closest('.pdx-config-item');
        if (item && item.style.display !== 'none') {
          cb.checked = false;
          state.tempSelectedPdxDids[cb.dataset.didId] = false;
        }
      });
    });
    root.querySelector('[data-role="bd-pdx-config-invert"]')?.addEventListener("click", () => {
      root.querySelectorAll('.pdx-config-checkbox').forEach(cb => {
        const item = cb.closest('.pdx-config-item');
        if (item && item.style.display !== 'none') {
          cb.checked = !cb.checked;
          state.tempSelectedPdxDids[cb.dataset.didId] = cb.checked;
        }
      });
    });
    root.querySelector('[data-role="bd-pdx-save-config"]')?.addEventListener("click", () => {
      state.selectedPdxDids = { ...state.tempSelectedPdxDids };
      state.pdxConfigVersionOpen = false;
      render();
      showToast("保存配置读取项成功！");
    });

    // DTC 行点击联动
    root.querySelectorAll('[data-role="bd-pdx-dtc-row"]').forEach(row => {
      row.addEventListener("click", () => {
        const code = row.dataset.dtcCode;
        state.pdxUdsSelectedDtcCode = code;
        render();
        // 自动平滑滚动至 UDS 详情区以获得极佳联动视觉感受
        root.querySelector('.basic-diag-pdx-column--uds')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    // UDS DTC 行点击联动
    root.querySelectorAll('[data-role="bd-pdx-uds-row"]').forEach(row => {
      row.addEventListener("click", () => {
        const code = row.dataset.dtcCode;
        state.pdxUdsSelectedDtcCode = code;
        render();
      });
    });

    // UDS Tab 选项卡切换
    root.querySelectorAll('[data-role="bd-pdx-uds-tab"]').forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        state.pdxUdsActiveTab = tab;
        render();
      });
    });

    // UDS 读取故障码
    root.querySelector('[data-role="bd-pdx-uds-read"]')?.addEventListener("click", () => {
      pdxUdsReadDtc(false);
    });

    // UDS 清除故障码
    root.querySelector('[data-role="bd-pdx-uds-clear"]')?.addEventListener("click", () => {
      pdxUdsClearDtc();
    });

    // UDS 掩码配置输入框绑定
    root.querySelector('[data-role="bd-pdx-uds-mask"]')?.addEventListener("input", (e) => {
      state.pdxMaskInput = e.target.value;
    });

    // PDX 页面上下拖拽分割拉伸滑块逻辑
    root.querySelector('[data-role="bd-pdx-splitter"]')?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pdxWrapper = root.querySelector('.basic-diag-pdx');
      if (!pdxWrapper) return;
      const splitter = e.currentTarget;
      splitter.classList.add('is-dragging');
      const rect = pdxWrapper.getBoundingClientRect();
      const headerHeight = root.querySelector('.basic-diag-pdx-header')?.getBoundingClientRect().height || 36;
      const availableHeight = rect.height - headerHeight - 16; // 除去 header 及其 padding
      
      function onMove(ev) {
        const yOffset = ev.clientY - rect.top - headerHeight;
        let ratio = Math.max(0, Math.min(1, yOffset / availableHeight));
        if (ratio < 0.03) ratio = 0;
        if (ratio > 0.97) ratio = 1;
        
        state.pdxSplitRatio = ratio;
        const upper = pdxWrapper.querySelector('.basic-diag-pdx-upper');
        const lower = pdxWrapper.querySelector('.basic-diag-pdx-lower');
        
        if (upper) {
          if (ratio === 0) {
            upper.style.display = 'none';
          } else {
            upper.style.display = 'flex';
            upper.style.flex = Math.round(ratio * 100);
          }
        }
        if (lower) {
          if (ratio === 1) {
            lower.style.display = 'none';
          } else {
            lower.style.display = 'flex';
            lower.style.flex = Math.round((1 - ratio) * 100);
          }
        }
      }
      
      function onUp() {
        splitter.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // 垂直分割条 1 拖拽逻辑（DTC 和 DID 之间）
    root.querySelector('[data-role="bd-pdx-vsplitter-1"]')?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const upperContainer = root.querySelector('.basic-diag-pdx-upper');
      if (!upperContainer) return;
      const splitter = e.currentTarget;
      splitter.classList.add('is-dragging');
      
      const columns = upperContainer.querySelectorAll('.basic-diag-pdx-column');
      if (columns.length < 2) return;
      const col1 = columns[0];
      const col2 = columns[1];
      
      const rect1 = col1.getBoundingClientRect();
      const rect2 = col2.getBoundingClientRect();
      const startX = e.clientX;
      
      const totalFlex = state.pdxColWidths[0] + state.pdxColWidths[1];
      const totalWidth = rect1.width + rect2.width;
      
      function onMove(ev) {
        const dx = ev.clientX - startX;
        const newW1 = Math.max(0, rect1.width + dx);
        const newW2 = Math.max(0, rect2.width - dx);
        
        // 可以缩到最小，只保留拖动标签
        const finalW1 = newW1 < 10 ? 0 : newW1;
        const finalW2 = newW2 < 10 ? 0 : newW2;
        
        const flex1 = (finalW1 / totalWidth) * totalFlex;
        const flex2 = (finalW2 / totalWidth) * totalFlex;
        
        col1.style.flex = flex1;
        col2.style.flex = flex2;
        
        if (finalW1 === 0) {
          col1.style.display = 'none';
        } else {
          col1.style.display = 'flex';
        }
        if (finalW2 === 0) {
          col2.style.display = 'none';
        } else {
          col2.style.display = 'flex';
        }
        
        state.pdxColWidths[0] = flex1;
        state.pdxColWidths[1] = flex2;
      }
      
      function onUp() {
        splitter.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // 垂直分割条 2 拖拽逻辑（DID 和 UDS 之间）
    root.querySelector('[data-role="bd-pdx-vsplitter-2"]')?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const upperContainer = root.querySelector('.basic-diag-pdx-upper');
      if (!upperContainer) return;
      const splitter = e.currentTarget;
      splitter.classList.add('is-dragging');
      
      const columns = upperContainer.querySelectorAll('.basic-diag-pdx-column');
      if (columns.length < 3) return;
      const col2 = columns[1];
      const col3 = columns[2];
      
      const rect2 = col2.getBoundingClientRect();
      const rect3 = col3.getBoundingClientRect();
      const startX = e.clientX;
      
      const totalFlex = state.pdxColWidths[1] + state.pdxColWidths[2];
      const totalWidth = rect2.width + rect3.width;
      
      function onMove(ev) {
        const dx = ev.clientX - startX;
        const newW2 = Math.max(0, rect2.width + dx);
        const newW3 = Math.max(0, rect3.width - dx);
        
        const finalW2 = newW2 < 10 ? 0 : newW2;
        const finalW3 = newW3 < 10 ? 0 : newW3;
        
        const flex2 = (finalW2 / totalWidth) * totalFlex;
        const flex3 = (finalW3 / totalWidth) * totalFlex;
        
        col2.style.flex = flex2;
        col3.style.flex = flex3;
        
        if (finalW2 === 0) {
          col2.style.display = 'none';
        } else {
          col2.style.display = 'flex';
        }
        if (finalW3 === 0) {
          col3.style.display = 'none';
        } else {
          col3.style.display = 'flex';
        }
        
        state.pdxColWidths[1] = flex2;
        state.pdxColWidths[2] = flex3;
      }
      
      function onUp() {
        splitter.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // UDS 诊断控制面板内部水平分割条拖拽逻辑
    root.querySelector('[data-role="bd-pdx-uds-inner-splitter"]')?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const udsCol = root.querySelector('.basic-diag-pdx-column--uds');
      if (!udsCol) return;
      const splitter = e.currentTarget;
      splitter.classList.add('is-dragging');
      
      const topEl = udsCol.querySelector('[data-role="bd-pdx-uds-table-container"]');
      const bottomEl = udsCol.querySelector('[data-role="bd-pdx-uds-bottom-container"]');
      if (!topEl || !bottomEl) return;
      
      const rectTop = topEl.getBoundingClientRect();
      const rectBottom = bottomEl.getBoundingClientRect();
      const startY = e.clientY;
      
      const totalFlex = 2.2;
      const totalHeight = rectTop.height + rectBottom.height;
      
      function onMove(ev) {
        const dy = ev.clientY - startY;
        const newH1 = Math.max(0, rectTop.height + dy);
        const newH2 = Math.max(0, rectBottom.height - dy);
        
        const finalH1 = newH1 < 10 ? 0 : newH1;
        const finalH2 = newH2 < 10 ? 0 : newH2;
        
        const flex1 = (finalH1 / totalHeight) * totalFlex;
        const flex2 = (finalH2 / totalHeight) * totalFlex;
        
        topEl.style.flex = flex1;
        bottomEl.style.flex = flex2;
        
        if (finalH1 === 0) {
          topEl.style.display = 'none';
        } else {
          topEl.style.display = 'block';
        }
        if (finalH2 === 0) {
          bottomEl.style.display = 'none';
        } else {
          bottomEl.style.display = 'flex';
        }
        
        state.pdxUdsInnerSplitRatio = flex1 / totalFlex;
      }
      
      function onUp() {
        splitter.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // 绑定快照与扩展信息输入框实时静默保存
    root.querySelector('.basic-diag-pdx-uds-tab-content')?.addEventListener("input", (e) => {
      const target = e.target;
      const code = state.pdxUdsSelectedDtcCode;
      if (!code) return;
      
      if (target.matches('[data-role="bd-pdx-snapshot-val-input"]')) {
        const snapNum = target.dataset.recordNum || "01";
        const itemName = target.dataset.itemName;
        if (itemName) {
          state.pdxUdsSnapshotValues[`${code}_${snapNum}_${itemName}`] = target.value;
        }
      } else if (target.matches('[data-role="bd-pdx-extended-val-input"]')) {
        const extNum = target.dataset.recordNum || "01";
        const itemKey = target.dataset.itemKey;
        if (itemKey) {
          state.pdxUdsExtendedValues[`${code}_${extNum}_${itemKey}`] = target.value;
        }
      }
    });

    root.querySelector('[data-role="bd-pdx-read-dtc"]')?.addEventListener("click", () => pdxReadDtc(false));
    root.querySelector('[data-role="bd-pdx-read-did"]')?.addEventListener("click", () => pdxReadDid(false));
    root.querySelector('[data-role="bd-pdx-clear-trace"]')?.addEventListener("click", () => {
      state.pdxTraceLog = [];
      render();
    });
    root.querySelector('[data-role="bd-pdx-export-report"]')?.addEventListener("click", () => {
      state.pdxDtcManualOverrides = {};
      PDX_MOCK_DTCS.forEach(d => {
        state.pdxDtcManualOverrides[d.code] = null;
      });
      Object.keys(state.pdxDtcExtraResults).forEach(code => {
        state.pdxDtcManualOverrides[code] = null;
      });

      state.pdxDidManualOverrides = {};
      PDX_MOCK_DIDS.forEach(d => {
        if (state.selectedPdxDids[d.id] === true) {
          state.pdxDidManualOverrides[d.id] = null;
        }
      });

      state.pdxReportActiveTab = "dtc";
      state.reportDialogOpen = true;
      render();
    });
    root.querySelectorAll('[data-role="bd-close-report"]').forEach(el => {
      el.addEventListener("click", () => {
        state.reportDialogOpen = false;
        render();
      });
    });

    root.querySelector('[data-role="bd-report-export-trigger"]')?.addEventListener("click", () => {
      pdxExportHtmlReport();
    });

    // 报告 Tab 页签切换
    root.querySelectorAll('[data-role="bd-report-tab"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.pdxReportActiveTab = btn.dataset.tab;
        render();
      });
    });

    // 报告 人工校验一键批量处理
    root.querySelectorAll('[data-role="pdx-report-bulk"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const type = btn.dataset.type;
        const val = btn.dataset.value;
        if (type === "dtc") {
          PDX_MOCK_DTCS.forEach(d => {
            state.pdxDtcManualOverrides[d.code] = val;
          });
          Object.keys(state.pdxDtcExtraResults).forEach(code => {
            state.pdxDtcManualOverrides[code] = val;
          });
        } else {
          PDX_MOCK_DIDS.forEach(d => {
            state.pdxDidManualOverrides[d.id] = val;
          });
        }
        render();
      });
    });

    // 报告 备注文字实时持久化存入 state，防刷且完美保护打字聚焦状态
    root.querySelectorAll('.pdx-report-note-input').forEach(input => {
      input.addEventListener("input", (e) => {
        const type = input.dataset.type;
        const id = input.dataset.id;
        const val = e.target.value;
        if (type === "dtc") {
          state.pdxDtcNotes[id] = val;
        } else {
          state.pdxDidNotes[id] = val;
        }
      });
    });

    // Checkbox changes immediately sync to temp state
    root.querySelectorAll('.pdx-config-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.didId;
        state.tempSelectedPdxDids[id] = e.target.checked;
      });
    });

    // Search input handlers
    const searchInp = root.querySelector('#pdx-did-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        state.pdxDidSearchQuery = e.target.value;
        root.querySelectorAll('.pdx-config-item').forEach(item => {
          const id = item.dataset.didId.toLowerCase();
          const name = item.dataset.didName.toLowerCase();
          if (id.includes(query) || name.includes(query)) {
            item.style.display = 'flex';
          } else {
            item.style.display = 'none';
          }
        });
        const clearBtn = root.querySelector('#pdx-did-clear-search');
        if (clearBtn) {
          clearBtn.style.display = e.target.value ? 'block' : 'none';
        }
      });
    }
    root.querySelector('#pdx-did-clear-search')?.addEventListener('click', () => {
      state.pdxDidSearchQuery = "";
      render();
    });

    root.querySelectorAll('.pdx-row-btn').forEach(btn => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        const id = btn.dataset.id || btn.dataset.code;
        const val = btn.dataset.value;
        if (type === "dtc") {
          if (state.pdxDtcManualOverrides[id] === val) {
            delete state.pdxDtcManualOverrides[id];
          } else {
            state.pdxDtcManualOverrides[id] = val;
          }
        } else {
          if (state.pdxDidManualOverrides[id] === val) {
            delete state.pdxDidManualOverrides[id];
          } else {
            state.pdxDidManualOverrides[id] = val;
          }
        }
        render();
      });
    });
    root.querySelector('[data-role="bd-import-pdx"]')?.addEventListener("click", () => {
      // 弹出高保真导入PDX对话框
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
            <!-- PDX文件大栏 -->
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

            <!-- PTS文件大栏 -->
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
        <!-- 隐藏的 file 选择器 -->
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
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });

      btnSelect.addEventListener('click', () => {
        hiddenInput.click();
      });

      hiddenInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const pdxFileName = file.name;
        const ptsFileName = pdxFileName.replace(/\.[^/.]+$/, "") + ".pts";

        const now = new Date();
        const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        // 1. 插入导入中记录
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

        // 2. 模拟异步解析
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
                  <i class="fa-solid fa-square-poll-horizontal"></i> 成功 (生成 28 个诊断服务, 124 个DTC)
                </span>
              </td>
            </tr>
          `;

          // 自动激活基础诊断的数据读取和校验结果！
          PDX_MOCK_DTCS.forEach(dtc => {
            state.pdxDtcResults[dtc.code] = Math.random() > 0.3 ? "存在" : "不存在";
          });
          PDX_MOCK_DIDS.forEach((did) => {
            const pass = Math.random() > 0.15;
            state.pdxDidResults[did.id] = { 
              value: pass ? did.mockVal : "00 00 00", 
              pass, 
              validationResult: pass ? "符合规范" : "返回值超限，期望: " + did.mockVal 
            };
          });
          state.pdxTraceLog = [
            { time: new Date().toLocaleTimeString(), dir: "Rx", desc: `解析 PDX [${pdxFileName}]，提取 ${PDX_MOCK_DTCS.length} 个故障码与 ${PDX_MOCK_DIDS.length} 个数据流服务完毕。` },
            ...state.pdxTraceLog
          ];
          
          // 自动切换到 PDX 校验选项卡并重新渲染！
          state.activeTab = "pdx";
          render();

          if (typeof showToast === "function") {
            showToast(`PTS 协议已成功异步生成！已注入基础诊断数据库进行联调校验。`);
          }
        }, 1500);
      });
    });

    root.querySelector('[data-role="bd-toggle-sec-algo"]')?.addEventListener("click", () => {
      state.secAlgoOpen = !state.secAlgoOpen;
      if (state.secAlgoOpen) {
        state.secAlgo.busId = state.selectedBusId || "can1";
        state.secAlgo.ecuId = state.selectedEcuId || "__tpl__";
      }
      render();
    });
    root.querySelector('[data-role="bd-close-sec-algo"]')?.addEventListener("click", () => {
      state.secAlgoOpen = false;
      render();
    });

    // Dropdown selectors for Bus and ECU
    root.querySelector('#bd-sec-bus-select')?.addEventListener("change", (e) => {
      state.secAlgo.busId = e.target.value;
      const bus = getBusConfig().find(b => b.id === e.target.value);
      if (bus && bus.children && bus.children.length > 0) {
        state.secAlgo.ecuId = bus.children[0].id;
      } else {
        state.secAlgo.ecuId = "__tpl__";
      }
      render();
    });
    root.querySelector('#bd-sec-ecu-select')?.addEventListener("change", (e) => {
      state.secAlgo.ecuId = e.target.value;
      render();
    });

    // Algorithm Type radios
    root.querySelectorAll('input[name="bd-sec-algo-type"]').forEach(radio => {
      radio.addEventListener("change", (e) => {
        state.secAlgo.algoType = e.target.value;
        render();
      });
    });

    // Algorithm Level
    root.querySelector('#bd-sec-level-select')?.addEventListener("change", (e) => {
      state.secAlgo.level = e.target.value;
    });
    root.querySelector('#bd-sec-level-input')?.addEventListener("input", (e) => {
      state.secAlgo.levelManual = e.target.value;
    });

    // Mask input
    root.querySelector('#bd-sec-mask-input')?.addEventListener("input", (e) => {
      state.secAlgo.mask = e.target.value;
    });

    // Algorithm File source radios
    root.querySelectorAll('input[name="bd-sec-file-source"]').forEach(radio => {
      radio.addEventListener("change", (e) => {
        state.secAlgo.fileSource = e.target.value;
        render();
      });
    });

    // Upload DLL file
    root.querySelector('#bd-sec-upload-btn')?.addEventListener("click", () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.dll';
      fileInput.onchange = (e) => {
        if (e.target.files[0]) {
          state.secAlgo.localDllPath = 'C:\\DiagDLL\\' + e.target.files[0].name;
          render();
        }
      };
      fileInput.click();
    });

    // Send Security Algorithm
    root.querySelector('#bd-sec-send-btn')?.addEventListener("click", () => {
      const sa = state.secAlgo;
      const isTemplate = sa.ecuId === "__tpl__";
      const rawLevel = isTemplate ? (sa.levelManual || "01") : (sa.level || "01");
      const cleanLevel = rawLevel.replace(/[^0-9a-fA-F]/g, "").toUpperCase().padStart(2, "0").slice(-2);
      
      const seedReq = `27 ${cleanLevel}`;
      state.logSeq += 1;
      state.logEntries.push({ seq: state.logSeq, time: now(), dir: "Tx", data: seedReq });
      const seedHex = "3A 7B 2C 1D";
      state.logSeq += 1;
      state.logEntries.push({ seq: state.logSeq, time: now(), dir: "Rx", data: `67 ${cleanLevel} ${seedHex}` });

      const keyLevelNum = parseInt(cleanLevel, 16) + 1;
      const keyLevel = keyLevelNum.toString(16).toUpperCase().padStart(2, "0");
      const keyReq = `27 ${keyLevel} A1 B2 C3 D4`;
      state.logSeq += 1;
      state.logEntries.push({ seq: state.logSeq, time: now(), dir: "Tx", data: keyReq });
      state.logSeq += 1;
      state.logEntries.push({ seq: state.logSeq, time: now(), dir: "Rx", data: `67 ${keyLevel}` });

      const buses = getBusConfig();
      const selectedBus = buses.find(b => b.id === sa.busId);
      const childEcu = selectedBus ? (selectedBus.children || []).find(e => e.id === sa.ecuId) : null;

      let dllName = "(云端计算)";
      if (sa.algoType === "4bytes") {
        if (sa.fileSource === "ecuFile") {
          dllName = childEcu && childEcu.secAlgoDllPath ? childEcu.secAlgoDllPath.substring(childEcu.secAlgoDllPath.lastIndexOf('\\') + 1) : "GWM_SA.dll";
        } else {
          dllName = sa.localDllPath ? sa.localDllPath.substring(sa.localDllPath.lastIndexOf('\\') + 1) : "(未选择本地文件)";
        }
      }

      const algoTypeName = sa.algoType === "4bytes" ? "4字节安全算法" : "16字节安全算法";

      state.lastResponse = {
        positive: true,
        raw: `67 ${keyLevel}`,
        fields: [
          ["ServiceID", "67 (positiveResponse)"],
          ["accessType", `${keyLevel} (sendKey)`],
          ["Algorithm", algoTypeName],
          ["Level", `Level ${cleanLevel}`],
          ["Mask", sa.mask || "(无)"],
          ["DLL", dllName],
          ["Result", "安全访问已解锁"],
        ],
      };
      state.secAlgoOpen = false;
      if (typeof showToast === "function") showToast("安全算法发送成功，已解锁");
      render();
    });

    const dragHandle = root.querySelector('[data-role="bd-sec-drag-handle"]');
    if (dragHandle) {
      dragHandle.style.cursor = "move";
      dragHandle.addEventListener("mousedown", (e) => {
        if (e.target.closest("button")) return;
        const dialog = dragHandle.closest(".basic-diag-sec-algo-dialog");
        if (!dialog) return;
        const rect = dialog.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const parentRect = dialog.parentElement.getBoundingClientRect();

        function onMove(ev) {
          const newLeft = Math.max(0, Math.min(ev.clientX - offsetX - parentRect.left, parentRect.width - rect.width));
          const newTop = Math.max(0, Math.min(ev.clientY - offsetY - parentRect.top, parentRect.height - rect.height));
          dialog.style.left = newLeft + "px";
          dialog.style.top = newTop + "px";
          dialog.style.right = "auto";
          state.secAlgoPos = { left: newLeft, top: newTop };
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault();
      });
    }

    // -- Bind Comm Field editing listeners --
    root.querySelectorAll('[data-role="bd-comm-field"]').forEach(input => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        const ecu = getSelectedEcu();
        if (ecu) {
          ecu[field] = input.value;
          // Dynamically update UI text labels to avoid losing typing focus
          if (field === "name") {
            const labelEl = root.querySelector(`[data-role="bd-pick-ecu"][data-ecu-id="${ecu.id}"] span`);
            if (labelEl) labelEl.textContent = input.value;
            const headerEl = root.querySelector(`.basic-diag-comm-header span`);
            if (headerEl) headerEl.textContent = `通讯参数配置 — ${input.value}`;
            const addrBarNameEl = root.querySelector(`.basic-diag-addr-bar__ecu-name`);
            if (addrBarNameEl) addrBarNameEl.innerHTML = `<i class="fa-solid fa-microchip"></i>${esc(input.value)}`;
          }
          if (field === "logicAddr") {
            const topInput = root.querySelector('#bd-addr-logic');
            if (topInput) topInput.value = input.value;
            const bus = getSelectedBus();
            const activeEcuNode = root.querySelector(`[data-role="bd-pick-ecu"][data-ecu-id="${ecu.id}"] span`);
            if (activeEcuNode) activeEcuNode.textContent = getEcuDisplayLabel(ecu, bus);
            updateTitleBreadcrumb(ecu, bus);
          }
          if (field === "ip") {
            const topInput = root.querySelector('#bd-addr-ip');
            if (topInput) topInput.value = input.value;
          }
        }
      });
      input.addEventListener("change", () => {
        render();
      });
    });

    // -- Top-bar Address fields editing listeners --
    root.querySelector('#bd-addr-request')?.addEventListener("input", (e) => {
      const ecu = getSelectedEcu();
      const bus = getSelectedBus();
      if (ecu) {
        const val = e.target.value;
        if (ecu.requestAddr !== undefined) {
          ecu.requestAddr = val.replace(/^0[xX]/i, '');
        } else if (ecu.nadAddr !== undefined) {
          ecu.nadAddr = val.replace(/^0[xX]/i, '');
        }
        
        // Dynamically update UI text labels to avoid losing typing focus
        const activeEcuNode = root.querySelector(`[data-role="bd-pick-ecu"][data-ecu-id="${ecu.id}"] span`);
        if (activeEcuNode) {
          activeEcuNode.textContent = getEcuDisplayLabel(ecu, bus);
        }
        updateTitleBreadcrumb(ecu, bus);
      }
    });
    root.querySelector('#bd-addr-request')?.addEventListener("change", () => {
      render();
    });

    root.querySelector('#bd-addr-response')?.addEventListener("input", (e) => {
      const ecu = getSelectedEcu();
      const bus = getSelectedBus();
      if (ecu) {
        ecu.responseAddr = e.target.value.replace(/^0[xX]/i, '');
        updateTitleBreadcrumb(ecu, bus);
      }
    });
    root.querySelector('#bd-addr-response')?.addEventListener("change", () => {
      render();
    });

    root.querySelector('#bd-addr-logic')?.addEventListener("input", (e) => {
      const ecu = getSelectedEcu();
      const bus = getSelectedBus();
      if (ecu) {
        ecu.logicAddr = e.target.value;
        
        // Dynamically update UI text labels to avoid losing typing focus
        const activeEcuNode = root.querySelector(`[data-role="bd-pick-ecu"][data-ecu-id="${ecu.id}"] span`);
        if (activeEcuNode) {
          activeEcuNode.textContent = getEcuDisplayLabel(ecu, bus);
        }
        updateTitleBreadcrumb(ecu, bus);
        
        // Symmetrically update inputs in Comm Tab
        const tabInput = root.querySelector(`.basic-diag-comm-card input[data-role="bd-comm-field"][data-field="logicAddr"]`);
        if (tabInput) tabInput.value = e.target.value;
      }
    });
    root.querySelector('#bd-addr-logic')?.addEventListener("change", () => {
      render();
    });

    root.querySelector('#bd-addr-ip')?.addEventListener("input", (e) => {
      const ecu = getSelectedEcu();
      if (ecu) {
        ecu.ip = e.target.value;
        
        // Symmetrically update inputs in Comm Tab
        const tabInput = root.querySelector(`.basic-diag-comm-card input[data-role="bd-comm-field"][data-field="ip"]`);
        if (tabInput) tabInput.value = e.target.value;
      }
    });
    root.querySelector('#bd-addr-ip')?.addEventListener("change", () => {
      render();
    });

    root.querySelector('#bd-comm-29bit-check')?.addEventListener("change", (e) => {
      const ecu = getSelectedEcu();
      if (ecu) {
        ecu.is29bit = e.target.checked;
        render();
      }
    });

    // -- Bind Comm Security Algorithm source radios --
    root.querySelectorAll('input[name="bd-comm-algo-source"]').forEach(radio => {
      radio.addEventListener("change", (e) => {
        const ecu = getSelectedEcu();
        if (ecu) {
          ecu.algoSource = e.target.value;
          render();
        }
      });
    });

    // -- Bind Comm Security Algorithm default select --
    root.querySelector('#bd-comm-default-algo-select')?.addEventListener("change", (e) => {
      const ecu = getSelectedEcu();
      if (ecu) {
        ecu.defaultAlgoIndex = e.target.value;
        render();
      }
    });

    // -- Bind Comm Security Algorithm browse button --
    root.querySelector('#bd-comm-browse-btn')?.addEventListener("click", () => {
      const ecu = getSelectedEcu();
      if (!ecu) return;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.dll';
      fileInput.onchange = (e) => {
        if (e.target.files[0]) {
          ecu.secAlgoDllPath = 'C:\\DiagDLL\\' + e.target.files[0].name;
          render();
        }
      };
      fileInput.click();
    });

    // -- Bind Keep Alive / Comm Hold check listener --
    root.querySelector('#bd-comm-hold-check')?.addEventListener("change", (e) => {
      state.commHold.active = e.target.checked;
      if (state.commHold.active) {
        if (typeof showToast === "function") showToast("通讯保持已开启");
      } else {
        if (typeof showToast === "function") showToast("通讯保持已关闭");
      }
    });

    // -- Bind Keep Alive / Comm Hold settings click listener --
    root.querySelector('[data-role="bd-comm-hold-settings"]')?.addEventListener("click", () => {
      const modal = document.getElementById("modal-comm-hold-settings");
      if (modal) {
        document.getElementById("comm-hold-cycle").value = state.commHold.cycle;
        document.getElementById("comm-hold-type").value = state.commHold.type;
        document.getElementById("comm-hold-data").value = state.commHold.data;
        modal.classList.remove("is-hidden");
      }
    });

    // -- Flow: Click row to select --
    root.querySelectorAll('[data-role="bd-flow-row"]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('input') || e.target.closest('button')) return;
        const idx = parseInt(row.dataset.flowIdx, 10);
        state.flowSelectedIdx = idx;
        render();
      });
    });

    // -- Flow: Delay input change --
    root.querySelectorAll('.flow-delay-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.dataset.flowIdx, 10);
        const val = parseInt(input.value, 10) || 100;
        if (state.flowSteps[idx]) {
          state.flowSteps[idx].delayMs = val;
        }
      });
    });

    // -- Flow: Add current command --
    root.querySelector('[data-role="bd-flow-left-add"]')?.addEventListener('click', () => {
      const svcIdx = state.selectedServiceIdx;
      let hex = '';
      if (svcIdx === CUSTOM_SERVICE_IDX) {
        hex = state.hexInput || '00';
      } else {
        const svc = UDS_SERVICES[svcIdx];
        if (svc) {
          const sub = state.subFunctionValues[svcIdx];
          const extra = state.extraParamValues[svcIdx];
          const dids = Object.keys(state.selectedDids).filter(k => state.selectedDids[k]);
          if (svc.paramType === 'didSelect') hex = svc.buildRequest(sub, extra, dids);
          else if (svc.paramType === 'didWrite') hex = svc.buildRequest(sub, extra, null, state.writeDid, state.writeData);
          else hex = svc.buildRequest(sub, extra);
        }
      }
      state.flowSteps.push({ type: 'cmd', hex, enabled: true, response: '', respOk: null });
      state.flowSelectedIdx = state.flowSteps.length - 1;
      render();
      if (typeof showToast === 'function') showToast(`已添加指令: ${hex}`);
    });

    // -- Flow: Delete selected steps --
    root.querySelector('[data-role="bd-flow-left-delete"]')?.addEventListener('click', () => {
      const idx = state.flowSelectedIdx;
      if (idx !== -1 && state.flowSteps[idx]) {
        state.flowSteps.splice(idx, 1);
        state.flowSelectedIdx = state.flowSteps.length ? Math.min(idx, state.flowSteps.length - 1) : -1;
        render();
      } else {
        if (typeof showToast === 'function') showToast('请先选择一个步骤');
      }
    });

    // -- Flow: Move step UP --
    root.querySelector('[data-role="bd-flow-left-up"]')?.addEventListener('click', () => {
      const idx = state.flowSelectedIdx;
      if (idx > 0 && state.flowSteps[idx]) {
        const temp = state.flowSteps[idx];
        state.flowSteps[idx] = state.flowSteps[idx - 1];
        state.flowSteps[idx - 1] = temp;
        state.flowSelectedIdx = idx - 1;
        render();
      }
    });

    // -- Flow: Move step DOWN --
    root.querySelector('[data-role="bd-flow-left-down"]')?.addEventListener('click', () => {
      const idx = state.flowSelectedIdx;
      if (idx !== -1 && idx < state.flowSteps.length - 1 && state.flowSteps[idx]) {
        const temp = state.flowSteps[idx];
        state.flowSteps[idx] = state.flowSteps[idx + 1];
        state.flowSteps[idx + 1] = temp;
        state.flowSelectedIdx = idx + 1;
        render();
      }
    });

    // -- Flow: Add delay step --
    root.querySelector('[data-role="bd-flow-left-delay"]')?.addEventListener('click', () => {
      state.flowSteps.push({ type: 'delay', delayMs: 100, enabled: true, response: '', respOk: null });
      state.flowSelectedIdx = state.flowSteps.length - 1;
      render();
      if (typeof showToast === 'function') showToast('已添加延时步骤');
    });

    // -- Flow: Add auto security algorithm steps --
    root.querySelector('[data-role="bd-flow-left-auto-sec"]')?.addEventListener('click', () => {
      const sa = state.secAlgo;
      const isTemplate = sa.ecuId === "__tpl__";
      const rawLevel = isTemplate ? (sa.levelManual || "01") : (sa.level || "01");
      const cleanLevel = rawLevel.replace(/[^0-9a-fA-F]/g, "").toUpperCase().padStart(2, "0").slice(-2);
      
      const keyLevelNum = parseInt(cleanLevel, 16) + 1;
      const keyLevel = keyLevelNum.toString(16).toUpperCase().padStart(2, "0");

      const seedHex = `27 ${cleanLevel}`;
      const keyHex = `27 ${keyLevel}`;

      const groupId = 'autosec-' + Date.now();
      state.flowSteps.push({ type: 'cmd', hex: seedHex, enabled: true, response: '', respOk: null, autoSecGroup: groupId });
      state.flowSteps.push({ type: 'cmd', hex: keyHex, enabled: true, response: '', respOk: null, autoSecGroup: groupId });

      state.flowSelectedIdx = state.flowSteps.length - 1;
      render();

      if (typeof showToast === 'function') {
        showToast(`已添加自动安全算法步骤: ${seedHex}, ${keyHex}`);
      }
    });

    // -- Flow: Check toggle --
    root.querySelectorAll('[data-role="bd-flow-check"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const idx = parseInt(cb.dataset.flowIdx, 10);
        if (state.flowSteps[idx]) state.flowSteps[idx].enabled = cb.checked;
      });
    });

    // -- Flow: Delete single --
    root.querySelectorAll('[data-role="bd-flow-delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.flowIdx, 10);
        const targetStep = state.flowSteps[idx];
        if (targetStep && targetStep.autoSecGroup) {
          state.flowSteps = state.flowSteps.filter(x => x.autoSecGroup !== targetStep.autoSecGroup);
        } else {
          state.flowSteps.splice(idx, 1);
        }
        if (state.flowSelectedIdx === idx) state.flowSelectedIdx = -1;
        render();
      });
    });

    // -- Flow: Run / Stop --
    root.querySelector('[data-role="bd-flow-run"]')?.addEventListener('click', () => {
      if (state.flowRunning) {
        state.flowRunning = false;
        state.flowCurrentIdx = -1;
        render();
        return;
      }
      const enabledSteps = state.flowSteps.filter(s => s.enabled);
      if (enabledSteps.length === 0) return;
      state.flowSteps.forEach(s => { s.response = ''; s.respOk = null; });
      state.flowRunning = true;
      state.flowCurrentIdx = 0;
      render();
      runFlowStep(0);
    });

    // -- Flow: Clear --
    root.querySelector('[data-role="bd-flow-clear"]')?.addEventListener('click', () => {
      state.flowSteps = [];
      state.flowSelectedIdx = -1;
      render();
    });

    // -- Flow: Interval --
    root.querySelector('[data-role="bd-flow-interval"]')?.addEventListener('input', (e) => {
      state.flowInterval = parseInt(e.target.value, 10) || 50;
    });

    // -- Flow: Save --
    root.querySelector('[data-role="bd-flow-save"]')?.addEventListener('click', () => {
      const data = { flowSteps: state.flowSteps.map(s => ({ type: s.type || 'cmd', hex: s.hex || '', delayMs: s.delayMs || 100, enabled: s.enabled })), flowInterval: state.flowInterval };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diag-flow-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') showToast('流程已保存');
    });

    // -- Flow: Load --
    root.querySelector('[data-role="bd-flow-load"]')?.addEventListener('click', () => {
      document.getElementById('bd-flow-file-input')?.click();
    });
    document.getElementById('bd-flow-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.flowSteps && Array.isArray(data.flowSteps)) {
            state.flowSteps = data.flowSteps.map(s => ({ type: s.type || 'cmd', hex: s.hex || '', delayMs: s.delayMs || 100, enabled: s.enabled !== false, response: '', respOk: null }));
            if (data.flowInterval) state.flowInterval = data.flowInterval;
            state.flowSelectedIdx = -1;
            render();
            if (typeof showToast === 'function') showToast(`已加载 ${state.flowSteps.length} 条指令`);
          }
        } catch (err) {
          if (typeof showToast === 'function') showToast('文件格式错误');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });



    // -- Flow: Splitter drag --
    root.querySelector('[data-role="bd-flow-splitter"]')?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const svcWrapper = root.querySelector('.basic-diag-svc-content-wrapper');
      if (!svcWrapper) return;
      const splitter = e.currentTarget;
      splitter.classList.add('is-dragging');
      const rect = svcWrapper.getBoundingClientRect();
      function onMove(ev) {
        let ratio = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
        if (ratio < 0.03) ratio = 0;
        if (ratio > 0.97) ratio = 1;
        
        state.flowSplitRatio = ratio;
        const upper = svcWrapper.querySelector('.basic-diag-svc-upper');
        const lower = svcWrapper.querySelector('.basic-diag-svc-lower');
        
        if (upper) {
          if (ratio === 0) {
            upper.style.display = 'none';
          } else {
            upper.style.display = 'flex';
            upper.style.flex = Math.round(ratio * 100);
          }
        }
        if (lower) {
          if (ratio === 1) {
            lower.style.display = 'none';
          } else {
            lower.style.display = 'flex';
            lower.style.flex = Math.round((1 - ratio) * 100);
          }
        }
      }
      function onUp() {
        splitter.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // 服务列表与配置区垂直分割条 1 拖拽逻辑
    root.querySelector('[data-role="bd-svc-vsplitter-1"]')?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const layout = root.querySelector('.basic-diag-svc-layout');
      if (!layout) return;
      const splitter = e.currentTarget;
      splitter.classList.add('is-dragging');
      
      const col1 = layout.querySelector('.basic-diag-svc-list');
      const col2 = layout.querySelector('.basic-diag-svc-content-wrapper');
      if (!col1 || !col2) return;
      
      const rect1 = col1.getBoundingClientRect();
      const rect2 = col2.getBoundingClientRect();
      const startX = e.clientX;
      
      const totalFlex = state.svcColWidths[0] + state.svcColWidths[1];
      const totalWidth = rect1.width + rect2.width;
      
      function onMove(ev) {
        const dx = ev.clientX - startX;
        const newW1 = Math.max(0, rect1.width + dx);
        const newW2 = Math.max(0, rect2.width - dx);
        
        const finalW1 = newW1 < 10 ? 0 : newW1;
        const finalW2 = newW2 < 10 ? 0 : newW2;
        
        const flex1 = (finalW1 / totalWidth) * totalFlex;
        const flex2 = (finalW2 / totalWidth) * totalFlex;
        
        col1.style.flex = flex1;
        col2.style.flex = flex2;
        
        const rightCol = layout.querySelector('.basic-diag-svc-right');
        if (rightCol) {
          rightCol.style.flex = flex2 + state.svcColWidths[2];
        }
        
        if (finalW1 === 0) {
          col1.style.display = 'none';
        } else {
          col1.style.display = 'block';
        }
        if (finalW2 === 0) {
          col2.style.display = 'none';
        } else {
          col2.style.display = 'flex';
        }
        
        state.svcColWidths[0] = flex1;
        state.svcColWidths[1] = flex2;
      }
      
      function onUp() {
        splitter.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // 配置区与日志区垂直分割条 2 拖拽逻辑
    root.querySelector('[data-role="bd-svc-vsplitter-2"]')?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const layout = root.querySelector('.basic-diag-svc-layout');
      if (!layout) return;
      const splitter = e.currentTarget;
      splitter.classList.add('is-dragging');
      
      const col2 = layout.querySelector('.basic-diag-svc-content-wrapper');
      const col3 = layout.querySelector('.basic-diag-log');
      if (!col2 || !col3) return;
      
      const rect2 = col2.getBoundingClientRect();
      const rect3 = col3.getBoundingClientRect();
      const startX = e.clientX;
      
      const totalFlex = state.svcColWidths[1] + state.svcColWidths[2];
      const totalWidth = rect2.width + rect3.width;
      
      function onMove(ev) {
        const dx = ev.clientX - startX;
        const newW2 = Math.max(0, rect2.width + dx);
        const newW3 = Math.max(0, rect3.width - dx);
        
        const finalW2 = newW2 < 10 ? 0 : newW2;
        const finalW3 = newW3 < 10 ? 0 : newW3;
        
        const flex2 = (finalW2 / totalWidth) * totalFlex;
        const flex3 = (finalW3 / totalWidth) * totalFlex;
        
        col2.style.flex = flex2;
        col3.style.flex = flex3;
        
        const rightCol = layout.querySelector('.basic-diag-svc-right');
        if (rightCol) {
          rightCol.style.flex = flex2 + flex3;
        }
        
        if (finalW2 === 0) {
          col2.style.display = 'none';
        } else {
          col2.style.display = 'flex';
        }
        if (finalW3 === 0) {
          col3.style.display = 'none';
        } else {
          col3.style.display = 'flex';
        }
        
        state.svcColWidths[1] = flex2;
        state.svcColWidths[2] = flex3;
      }
      
      function onUp() {
        splitter.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ============================
     Flow: Step Runner
     ============================ */
  function runFlowStep(idx) {
    if (!state.flowRunning) return;
    while (idx < state.flowSteps.length && !state.flowSteps[idx].enabled) {
      idx++;
    }
    if (idx >= state.flowSteps.length) {
      state.flowRunning = false;
      state.flowCurrentIdx = -1;
      render();
      if (typeof showToast === 'function') showToast('流程执行完成');
      return;
    }
    state.flowCurrentIdx = idx;
    render();
    const step = state.flowSteps[idx];

    if (step.type === 'delay') {
      step.response = '延时进行中...';
      step.respOk = true;
      render();

      const delayMs = parseInt(step.delayMs, 10) || 100;
      setTimeout(() => {
        if (!state.flowRunning) return;
        step.response = `等待 ${delayMs} ms 完成`;
        render();
        runFlowStep(idx + 1);
      }, delayMs);
      return;
    }

    const hex = step.hex;

    // Simulate send and receive
    state.logSeq += 1;
    state.logEntries.push({ seq: state.logSeq, time: now(), dir: 'Tx', data: hex });

    // Mock response
    const bytes = hex.match(/[0-9a-fA-F]{2}/g) || [];
    const sid = bytes.length ? parseInt(bytes[0], 16) : NaN;
    const posSid = Number.isNaN(sid) ? '7F' : ((sid + 0x40) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    const respRaw = [posSid, ...bytes.slice(1)].join(' ');
    step.response = respRaw;
    step.respOk = true;

    state.logSeq += 1;
    state.logEntries.push({ seq: state.logSeq, time: now(), dir: 'Rx', data: respRaw });
    if (state.logEntries.length > 200) state.logEntries = state.logEntries.slice(-200);

    setTimeout(() => runFlowStep(idx + 1), state.flowInterval);
  }

  /* ============================
     Init
     ============================ */
  document.getElementById("btn-submit-comm-hold")?.addEventListener("click", () => {
    const win = root.closest(".workspace-window");
    if (win && win.classList.contains("is-hidden")) return;

    state.commHold.cycle = parseInt(document.getElementById("comm-hold-cycle").value) || 2000;
    state.commHold.type = document.getElementById("comm-hold-type").value;
    state.commHold.data = document.getElementById("comm-hold-data").value;
    if (typeof showToast === "function") {
      showToast("通讯保持设置已确认");
    }
    document.getElementById("modal-comm-hold-settings")?.classList.add("is-hidden");
  });

  function showDidSelectModal(service, currentVal, onSelect) {
    const is31 = service === "31";
    const is19 = service === "19";
    const title = is31 ? "选择例程标识符 (RID)" : is19 ? "选择DTC故障码" : "选择数据标识符 (DID)";
    const placeholder = is31 ? "搜索例程ID或名称..." : is19 ? "搜索故障码或名称..." : "搜索DID或名称...";
    
    let dataSource = DID_DATASOURCE;
    if (is31) {
      dataSource = RID_DATASOURCE;
    } else if (is19) {
      dataSource = PDX_MOCK_DTCS.map(d => ({ id: d.hex, name: d.desc }));
    }
    
    const cleanCurVal = String(currentVal).replace(/\s+/g, '').toUpperCase();

    const modalHtml = `
      <div class="bus-settings-overlay" id="bd-did-select-modal">
        <div class="bus-settings-card" style="width: 460px; max-height: 80vh;">
          <div class="bus-settings-header">
            <h3 style="margin:0; font-size:14px; font-weight:600; display:flex; align-items:center; gap:8px; color:var(--text);">
              <i class="fa-solid fa-search" style="color:#2f6bff;"></i>
              ${title}
            </h3>
            <button type="button" id="bd-did-modal-close-btn" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:16px;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="bus-settings-body" style="padding:16px; display:flex; flex-direction:column; gap:12px; overflow:hidden; flex:1;">
            <div style="position:relative;">
              <input type="text" id="bd-did-search-input" placeholder="${placeholder}" autofocus
                style="width:100%; box-sizing:border-box; padding:8px 32px 8px 12px; border:1px solid var(--border); border-radius:6px; font-size:12px; outline:none; background:var(--surface); color:var(--text);" />
              <i class="fa-solid fa-magnifying-glass" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:12px;"></i>
            </div>
            
            <div id="bd-did-list-container" style="flex:1; overflow-y:auto; border:1px solid var(--border); border-radius:6px; background:var(--surface-2); max-height: 300px;">
              <!-- 列表项 -->
            </div>
          </div>
          <div class="bus-settings-footer" style="padding:12px 16px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px; background:var(--surface-2);">
            <button type="button" id="bd-did-modal-ok-btn" style="background:#2f6bff; color:#fff; border:none; border-radius:4px; padding:6px 16px; font-size:12px; font-weight:600; cursor:pointer; box-shadow:0 2px 4px rgba(47,107,255,0.2);">确定</button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement("div");
    div.innerHTML = modalHtml;
    const modalEl = div.firstElementChild;
    document.body.appendChild(modalEl);

    let selectedId = cleanCurVal;

    const renderList = (filterText = "") => {
      const query = filterText.trim().toLowerCase();
      const container = modalEl.querySelector("#bd-did-list-container");
      
      const filtered = dataSource.filter(item => {
        return item.id.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
      });

      if (filtered.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:#94a3b8; font-size:12px;">未找到匹配项</div>`;
        return;
      }

      container.innerHTML = filtered.map(item => {
        const isSelected = item.id.replace(/\s+/g, '').toUpperCase() === selectedId.replace(/\s+/g, '').toUpperCase();
        return `
          <div class="bd-did-list-item" data-id="${esc(item.id)}" 
            style="padding:10px 12px; cursor:pointer; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; transition:all 0.15s; background: ${isSelected ? 'rgba(47, 107, 255, 0.15)' : 'transparent'};">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-family:Consolas,monospace; font-weight:600; font-size:12px; color: ${isSelected ? '#2f6bff' : 'var(--text)'};">${esc(item.id)}</span>
              <span style="font-size:12px; color:var(--text); opacity:0.8;">${esc(item.name)}</span>
            </div>
            ${isSelected ? '<i class="fa-solid fa-circle-check" style="color:#2f6bff; font-size:14px;"></i>' : ''}
          </div>
        `;
      }).join("");

      container.querySelectorAll(".bd-did-list-item").forEach(row => {
        row.addEventListener("click", () => {
          selectedId = row.dataset.id;
          renderList(filterText);
        });

        row.addEventListener("dblclick", () => {
          selectedId = row.dataset.id;
          confirmAndClose();
        });
      });
    };

    const confirmAndClose = () => {
      if (selectedId) {
        onSelect(selectedId);
      }
      closeModal();
    };

    const closeModal = () => {
      modalEl.remove();
    };

    const searchInput = modalEl.querySelector("#bd-did-search-input");
    searchInput.addEventListener("input", (e) => {
      renderList(e.target.value);
    });

    modalEl.querySelector("#bd-did-modal-ok-btn").addEventListener("click", confirmAndClose);
    modalEl.querySelector("#bd-did-modal-close-btn").addEventListener("click", closeModal);

    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) {
        closeModal();
      }
    });

    renderList();
  }

  render();
}
})();
