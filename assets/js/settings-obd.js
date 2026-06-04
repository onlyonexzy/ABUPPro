/**
 * settings-obd.js - OBD 设置独立逻辑
 *
 * 职责：
 *   1. 管理 OBD 设置页的标准变体联动与保存校验
 *   2. 仅解锁运行参数区，标准定义区始终只读
 *   3. 通过 SettingsShared 暴露 OBD 标准化配置快照
 */
;(function () {
  "use strict";

  const root = document.getElementById("obd-settings-root");
  if (!root) return;

  const DEFAULT_DATA_LINK = {
    samplePoint: "80%",
    tq: "0.125 us",
    timeQuanta: "16",
    prescaler: "1",
    tseg1: "11",
    tseg2: "4",
    sjw: "1",
  };

  const CAN_PROFILES = {
    "ISO 15765-4 CAN (11bit / 500 kbps)": {
      frameType: "11bit",
      baudRate: "500 kbps",
      canIdLength: 3,
      dataLink: { ...DEFAULT_DATA_LINK },
    },
    "ISO 15765-4 CAN (29bit / 500 kbps)": {
      frameType: "29bit",
      baudRate: "500 kbps",
      canIdLength: 8,
      dataLink: { ...DEFAULT_DATA_LINK },
    },
    "ISO 15765-4 CAN (11bit / 250 kbps)": {
      frameType: "11bit",
      baudRate: "250 kbps",
      canIdLength: 3,
      dataLink: { ...DEFAULT_DATA_LINK },
    },
    "ISO 15765-4 CAN (29bit / 250 kbps)": {
      frameType: "29bit",
      baudRate: "250 kbps",
      canIdLength: 8,
      dataLink: { ...DEFAULT_DATA_LINK },
    },
  };

  const DEFAULT_CAN_PROFILE = "ISO 15765-4 CAN (11bit / 500 kbps)";
  const CAN_PINS = { high: 6, low: 14 };
  const ETHERNET_PINS = {
    rxPlus: 3,
    rxMinus: 11,
    txPlus: 12,
    txMinus: 13,
    activation: 8,
    ground: [4, 5],
    kl30: 16,
  };

  const DOIP_PORT = "13400";

  const stripHexPrefix = (value) => String(value || "").trim().replace(/^0x/i, "").toUpperCase();
  const isValidVlanId = (value) => {
    const vlanId = Number(String(value || "").trim());
    return Number.isInteger(vlanId) && vlanId >= 1 && vlanId <= 4094;
  };

  const parsePositiveInt = (raw) => {
    const n = Number(String(raw || "").trim());
    return Number.isInteger(n) && n >= 1 ? n : NaN;
  };

  const editButton = root.querySelector("[data-obd-edit-toggle]");
  const tabButtons = root.querySelectorAll("[data-obd-tab]");
  const tabPanels = root.querySelectorAll("[data-obd-panel]");
  const elements = {
    canProfile: document.getElementById("obd-can-profile"),
    canFrameDisplay: document.getElementById("obd-can-frame-display"),
    canBaudDisplay: document.getElementById("obd-can-baud-display"),
    canSamplePoint: document.getElementById("obd-can-sample-point"),
    canTq: document.getElementById("obd-can-tq"),
    canTimeQuanta: document.getElementById("obd-can-time-quanta"),
    canPrescaler: document.getElementById("obd-can-prescaler"),
    canTseg1: document.getElementById("obd-can-tseg1"),
    canTseg2: document.getElementById("obd-can-tseg2"),
    canSjw: document.getElementById("obd-can-sjw"),
    ethVlanMode: document.getElementById("obd-eth-vlan-mode"),
    ethVlanIdRow: document.getElementById("row-obd-eth-vlan-id"),
    ethVlanId: document.getElementById("obd-eth-vlan-id"),
    saveButton: document.getElementById("btn-save-obd"),
    cancelButton: document.getElementById("btn-cancel-obd-edit"),
  };
  let editSnapshot = null;

  const getCurrentProfileName = () => (
    CAN_PROFILES[elements.canProfile?.value] ? elements.canProfile.value : DEFAULT_CAN_PROFILE
  );

  const getCurrentProfile = () => CAN_PROFILES[getCurrentProfileName()];

  const switchObdTab = (targetTab) => {
    tabButtons.forEach((button) => {
      const active = button.dataset.obdTab === targetTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    tabPanels.forEach((panel) => {
      const active = panel.dataset.obdPanel === targetTab;
      panel.classList.toggle("is-active", active);
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    });
  };

  const applyDataLink = (dl) => {
    if (!dl) return;
    if (elements.canSamplePoint) elements.canSamplePoint.value = dl.samplePoint;
    if (elements.canTq) elements.canTq.value = dl.tq;
    if (elements.canTimeQuanta) elements.canTimeQuanta.value = dl.timeQuanta;
    if (elements.canPrescaler) elements.canPrescaler.value = dl.prescaler;
    if (elements.canTseg1) elements.canTseg1.value = dl.tseg1;
    if (elements.canTseg2) elements.canTseg2.value = dl.tseg2;
    if (elements.canSjw) elements.canSjw.value = dl.sjw;
  };

  const applyCanProfile = (profileName, overwriteDataLink = true) => {
    const profile = CAN_PROFILES[profileName] || CAN_PROFILES[DEFAULT_CAN_PROFILE];
    if (elements.canProfile) {
      elements.canProfile.value = profileName in CAN_PROFILES ? profileName : DEFAULT_CAN_PROFILE;
    }
    if (elements.canFrameDisplay) elements.canFrameDisplay.textContent = profile.frameType;
    if (elements.canBaudDisplay) elements.canBaudDisplay.textContent = profile.baudRate;
    if (overwriteDataLink) {
      applyDataLink(profile.dataLink);
    }
  };

  const captureEditableSnapshot = () => {
    const snapshot = {};
    root.querySelectorAll('[data-obd-editable="true"]').forEach((element) => {
      const key = element.id;
      if (!key) return;
      snapshot[key] = element.value;
    });
    return snapshot;
  };

  const restoreEditableSnapshot = (snapshot) => {
    if (!snapshot) return;
    Object.entries(snapshot).forEach(([key, value]) => {
      const element = document.getElementById(key);
      if (!element) return;
      element.value = value;
    });
    applyCanProfile(elements.canProfile?.value || DEFAULT_CAN_PROFILE, false);
    syncEthernetRows();
  };

  const setEditableState = (editing) => {
    root.classList.toggle("is-editing", editing);
    root.querySelectorAll('[data-obd-editable="true"]').forEach((element) => {
      if (element.tagName === "SELECT") {
        element.disabled = !editing;
      } else {
        element.readOnly = !editing;
      }
    });
    syncEthernetRows();
    if (elements.saveButton) elements.saveButton.disabled = !editing;
    if (elements.cancelButton) elements.cancelButton.disabled = !editing;
  };

  const syncEthernetRows = () => {
    const vlanMode = elements.ethVlanMode?.value || "802.1q";

    if (elements.ethVlanIdRow) {
      elements.ethVlanIdRow.classList.toggle("is-hidden", vlanMode !== "802.1q");
    }
    if (elements.ethVlanId) {
      elements.ethVlanId.readOnly = !root.classList.contains("is-editing") || vlanMode !== "802.1q";
    }
  };

  const validateAndNormalize = () => {
    const profile = getCurrentProfile();
    const ethVlanMode = elements.ethVlanMode?.value || "802.1q";
    const ethVlanId = String(elements.ethVlanId?.value || "").trim();

    const samplePoint = String(elements.canSamplePoint?.value || "").trim();
    if (!/^\d{1,3}%$/.test(samplePoint) || Number(samplePoint) > 100) {
      alert("OBD CAN 采样点格式不正确，请使用例如 80% 的形式。");
      return false;
    }

    const tq = String(elements.canTq?.value || "").trim();
    if (!/^\d+(\.\d+)?\s*us$/i.test(tq)) {
      alert("OBD CAN Tq 格式不正确，请使用例如 0.125 us。");
      return false;
    }

    const tqNum = parsePositiveInt(elements.canTimeQuanta?.value);
    const prescaler = parsePositiveInt(elements.canPrescaler?.value);
    const tseg1 = parsePositiveInt(elements.canTseg1?.value);
    const tseg2 = parsePositiveInt(elements.canTseg2?.value);
    const sjw = parsePositiveInt(elements.canSjw?.value);
    if ([tqNum, prescaler, tseg1, tseg2, sjw].some((n) => Number.isNaN(n))) {
      alert("OBD CAN 时间量、预定标器、位定时段与 SJW 须为正整数。");
      return false;
    }
    if (sjw > tseg2) {
      alert("OBD CAN 同步跳转宽度 SJW 不能大于位定时段2。");
      return false;
    }

    if (ethVlanMode === "802.1q" && !isValidVlanId(ethVlanId)) {
      alert("OBD 以太网 VLAN ID 格式不正确，范围必须是 1 ~ 4094。");
      return false;
    }
    if (elements.canSamplePoint) elements.canSamplePoint.value = samplePoint;
    if (elements.canTq) elements.canTq.value = tq.replace(/\s*us$/i, (m) => m.toLowerCase());
    if (elements.canTimeQuanta) elements.canTimeQuanta.value = String(tqNum);
    if (elements.canPrescaler) elements.canPrescaler.value = String(prescaler);
    if (elements.canTseg1) elements.canTseg1.value = String(tseg1);
    if (elements.canTseg2) elements.canTseg2.value = String(tseg2);
    if (elements.canSjw) elements.canSjw.value = String(sjw);
    if (elements.ethVlanId && ethVlanMode === "802.1q") elements.ethVlanId.value = String(Number(ethVlanId));

    return true;
  };

  const getObdConfig = () => {
    const profileName = getCurrentProfileName();
    const profile = CAN_PROFILES[profileName];
    return {
      can: {
        profile: profileName,
        frameType: profile.frameType,
        baudRate: profile.baudRate,
        dataLink: {
          samplePoint: elements.canSamplePoint?.value || "",
          tq: elements.canTq?.value || "",
          timeQuanta: elements.canTimeQuanta?.value || "",
          prescaler: elements.canPrescaler?.value || "",
          tseg1: elements.canTseg1?.value || "",
          tseg2: elements.canTseg2?.value || "",
          sjw: elements.canSjw?.value || "",
        },
        pins: { ...CAN_PINS },
      },
      ethernet: {
        physicalLayer: "100BASE-TX",
        mediaConverterRequired: true,
        pins: {
          rxPlus: ETHERNET_PINS.rxPlus,
          rxMinus: ETHERNET_PINS.rxMinus,
          txPlus: ETHERNET_PINS.txPlus,
          txMinus: ETHERNET_PINS.txMinus,
          activation: ETHERNET_PINS.activation,
          ground: [...ETHERNET_PINS.ground],
          kl30: ETHERNET_PINS.kl30,
        },
        vlanMode: elements.ethVlanMode?.value || "802.1q",
        vlanId: (elements.ethVlanMode?.value || "802.1q") === "802.1q"
          ? (elements.ethVlanId?.value || "")
          : "",
        discoveryPort: DOIP_PORT,
        tcpPort: DOIP_PORT,
        doipPort: DOIP_PORT,
        routingActivationRequired: true,
      },
    };
  };

  elements.canProfile?.addEventListener("change", (event) => {
    applyCanProfile(event.target.value, true);
  });

  elements.ethVlanMode?.addEventListener("change", () => {
    syncEthernetRows();
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchObdTab(button.dataset.obdTab);
    });
  });

  elements.saveButton?.addEventListener("click", () => {
    if (!validateAndNormalize()) return;
    editSnapshot = captureEditableSnapshot();
    setEditableState(false);
    alert("OBD 配置已保存。");
  });

  editButton?.addEventListener("click", () => {
    editSnapshot = captureEditableSnapshot();
    setEditableState(true);
  });

  elements.cancelButton?.addEventListener("click", () => {
    restoreEditableSnapshot(editSnapshot);
    setEditableState(false);
  });

  applyCanProfile(getCurrentProfileName(), true);
  switchObdTab("obd-main");
  syncEthernetRows();
  editSnapshot = captureEditableSnapshot();
  setEditableState(false);

  window.SettingsShared = window.SettingsShared || {};
  window.SettingsShared.getObdConfig = getObdConfig;
})();
