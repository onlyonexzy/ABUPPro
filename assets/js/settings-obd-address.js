/**
 * settings-obd-address.js - 通讯设置 / 地址设置 TAB 逻辑
 *
 * 职责：
 *   1. 管理地址设置页签的编辑态、保存、取消
 *   2. 管理 TB2 / DLL 文件选择与模式联动
 *   3. 对外暴露 SettingsShared.getObdAddressConfig
 */
;(function () {
  "use strict";

  const root = document.getElementById("obd-settings-root");
  if (!root) return;

  const addressPanel = root.querySelector('[data-obd-panel="obd-address"]');
  if (!addressPanel) return;

  const ipRegex =
    /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  const stripHexPrefix = (value) => String(value || "").trim().replace(/^0x/i, "").toUpperCase();
  const isExactHexLength = (value, length) => new RegExp(`^[0-9A-F]{${length}}$`).test(stripHexPrefix(value));
  const formatFixedHex = (value, width) => `0x${stripHexPrefix(value).padStart(width, "0")}`;

  const elements = {
    testerLogical: document.getElementById("tester-logical"),
    testerIp: document.getElementById("tester-ip"),
    gatewayLogical: document.getElementById("gateway-logical"),
    gatewayIp: document.getElementById("gateway-ip"),
    gatewayCanReq: document.getElementById("gateway-can-req"),
    gatewayCanRes: document.getElementById("gateway-can-res"),
    gatewayDllDefault: document.getElementById("row-gateway-dll-default"),
    gatewayDllCustom: document.getElementById("row-gateway-dll-custom"),
    gatewayDllFileLabel: document.getElementById("lbl-gateway-dll-file"),
    gatewayDllFileInput: document.getElementById("input-gateway-dll-file"),
    openDefaultRow: document.getElementById("row-open-default-flow"),
    openTb2Row: document.getElementById("row-open-tb2-flow"),
    openTb2FileLabel: document.getElementById("lbl-open-tb2-file"),
    openTb2FileInput: document.getElementById("input-open-tb2-file"),
    closeDefaultRow: document.getElementById("row-close-default-flow"),
    closeTb2Row: document.getElementById("row-close-tb2-flow"),
    closeTb2FileLabel: document.getElementById("lbl-close-tb2-file"),
    closeTb2FileInput: document.getElementById("input-close-tb2-file"),
    authDefaultRow: document.getElementById("row-auth-default-flow"),
    authTb2Row: document.getElementById("row-auth-tb2-flow"),
    authTb2FileLabel: document.getElementById("lbl-auth-tb2-file"),
    authTb2FileInput: document.getElementById("input-auth-tb2-file"),
    editButton: addressPanel.querySelector("[data-obd-address-edit-toggle]"),
    saveButton: document.getElementById("btn-save-obd-address"),
    cancelButton: document.getElementById("btn-cancel-obd-address-edit"),
  };

  let editSnapshot = null;
  let fileSnapshot = null;

  const setFileLabel = (label, fileName) => {
    if (!label) return;
    const text = fileName || "未选择";
    label.textContent = text;
    label.classList.toggle("has-file", Boolean(fileName));
  };

  const getSelectedValue = (name) =>
    addressPanel.querySelector(`input[name="${name}"]:checked`)?.value || "";

  const syncChannelMode = (prefix) => {
    const mode = getSelectedValue(`${prefix}-flow-mode`) || "default";
    const defaultRow = elements[`${prefix}DefaultRow`];
    const tb2Row = elements[`${prefix}Tb2Row`];
    if (defaultRow) defaultRow.classList.toggle("is-hidden", mode !== "default");
    if (tb2Row) tb2Row.classList.toggle("is-hidden", mode !== "tb2");
  };

  const syncDllMode = () => {
    const mode = getSelectedValue("gateway-dll-mode") || "default";
    if (elements.gatewayDllDefault) elements.gatewayDllDefault.classList.toggle("is-hidden", mode !== "default");
    if (elements.gatewayDllCustom) elements.gatewayDllCustom.classList.toggle("is-hidden", mode !== "custom");
  };

  const captureEditableSnapshot = () => {
    const snapshot = {};
    addressPanel.querySelectorAll("[data-obd-address-editable='true']").forEach((element) => {
      const key = element.id || `${element.name}:${element.value}`;
      if (!key) return;
      if (element.type === "radio" || element.type === "checkbox") {
        snapshot[key] = element.checked;
      } else {
        snapshot[key] = element.value;
      }
    });
    return snapshot;
  };

  const captureFileSnapshot = () => ({
    openTb2: elements.openTb2FileLabel?.textContent?.trim() || "未选择",
    closeTb2: elements.closeTb2FileLabel?.textContent?.trim() || "未选择",
    authTb2: elements.authTb2FileLabel?.textContent?.trim() || "未选择",
    gatewayDll: elements.gatewayDllFileLabel?.textContent?.trim() || "未选择",
  });

  const restoreEditableSnapshot = (snapshot, fileState) => {
    if (snapshot) {
      addressPanel.querySelectorAll("[data-obd-address-editable='true']").forEach((element) => {
        const key = element.id || `${element.name}:${element.value}`;
        if (!(key in snapshot)) return;
        if (element.type === "radio" || element.type === "checkbox") {
          element.checked = Boolean(snapshot[key]);
        } else {
          element.value = snapshot[key];
        }
      });
    }

    setFileLabel(elements.openTb2FileLabel, fileState?.openTb2 === "未选择" ? "" : fileState?.openTb2);
    setFileLabel(elements.closeTb2FileLabel, fileState?.closeTb2 === "未选择" ? "" : fileState?.closeTb2);
    setFileLabel(elements.authTb2FileLabel, fileState?.authTb2 === "未选择" ? "" : fileState?.authTb2);
    setFileLabel(elements.gatewayDllFileLabel, fileState?.gatewayDll === "未选择" ? "" : fileState?.gatewayDll);

    syncChannelMode("open");
    syncChannelMode("close");
    syncChannelMode("auth");
    syncDllMode();
  };

  const setEditableState = (editing) => {
    addressPanel.classList.toggle("is-address-editing", editing);
    addressPanel.querySelectorAll("[data-obd-address-editable='true']").forEach((element) => {
      if (element.tagName === "SELECT") {
        element.disabled = !editing;
        return;
      }
      if (element.type === "radio" || element.type === "checkbox") {
        element.disabled = !editing;
      } else {
        element.readOnly = !editing;
      }
    });

    addressPanel.querySelectorAll("[data-pick-tb2], [data-pick-dll]").forEach((button) => {
      button.disabled = !editing;
    });

    if (elements.saveButton) elements.saveButton.disabled = !editing;
    if (elements.cancelButton) elements.cancelButton.disabled = !editing;
    if (elements.editButton) elements.editButton.hidden = editing;
    if (elements.saveButton) elements.saveButton.hidden = !editing;
    if (elements.cancelButton) elements.cancelButton.hidden = !editing;
  };

  const validateAndNormalize = () => {
    const testerLogical = stripHexPrefix(elements.testerLogical?.value);
    const testerIp = String(elements.testerIp?.value || "").trim();
    const gatewayLogical = stripHexPrefix(elements.gatewayLogical?.value);
    const gatewayIp = String(elements.gatewayIp?.value || "").trim();

    if (!isExactHexLength(testerLogical, 4)) {
      alert("Tester 逻辑地址格式不正确，必须是 4 位十六进制。");
      return false;
    }
    if (!ipRegex.test(testerIp)) {
      alert("Tester 静态IP地址格式不正确。");
      return false;
    }
    if (!isExactHexLength(gatewayLogical, 4)) {
      alert("网关逻辑地址格式不正确，必须是 4 位十六进制。");
      return false;
    }
    if (!ipRegex.test(gatewayIp)) {
      alert("网关 IP 地址格式不正确。");
      return false;
    }

    const gatewayCanReq = stripHexPrefix(elements.gatewayCanReq?.value);
    const gatewayCanRes = stripHexPrefix(elements.gatewayCanRes?.value);

    if (!gatewayCanReq || !gatewayCanRes) {
      alert("网关 CAN 请求/响应地址不能为空。");
      return false;
    }

    if (getSelectedValue("open-flow-mode") === "tb2" && !elements.openTb2FileInput?.files?.[0]) {
      alert("打开直连通道：请先选择 TB2 文件。");
      return false;
    }
    if (getSelectedValue("close-flow-mode") === "tb2" && !elements.closeTb2FileInput?.files?.[0]) {
      alert("关闭直连通道：请先选择 TB2 文件。");
      return false;
    }
    if (getSelectedValue("auth-flow-mode") === "tb2" && !elements.authTb2FileInput?.files?.[0]) {
      alert("网关增强OBD认证：请先选择 TB2 文件。");
      return false;
    }
    if (getSelectedValue("gateway-dll-mode") === "custom" && !elements.gatewayDllFileInput?.files?.[0]) {
      alert("安全算法 DLL：请先选择自选 DLL 文件。");
      return false;
    }

    if (elements.testerLogical) elements.testerLogical.value = formatFixedHex(testerLogical, 4);
    if (elements.gatewayLogical) elements.gatewayLogical.value = formatFixedHex(gatewayLogical, 4);
    if (elements.testerIp) elements.testerIp.value = testerIp;
    if (elements.gatewayIp) elements.gatewayIp.value = gatewayIp;
    if (elements.gatewayCanReq) elements.gatewayCanReq.value = `0x${gatewayCanReq}`;
    if (elements.gatewayCanRes) elements.gatewayCanRes.value = `0x${gatewayCanRes}`;

    return true;
  };

  const bindFlowMode = (prefix) => {
    addressPanel.querySelectorAll(`input[name="${prefix}-flow-mode"]`).forEach((radio) => {
      radio.addEventListener("change", () => syncChannelMode(prefix));
    });
    const picker = addressPanel.querySelector(`[data-pick-tb2="${prefix}"]`);
    const input = elements[`${prefix}Tb2FileInput`];
    const label = elements[`${prefix}Tb2FileLabel`];
    picker?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", () => {
      setFileLabel(label, input.files?.[0]?.name || "");
    });
  };

  const bindDllMode = () => {
    addressPanel.querySelectorAll('input[name="gateway-dll-mode"]').forEach((radio) => {
      radio.addEventListener("change", syncDllMode);
    });
    const picker = addressPanel.querySelector('[data-pick-dll="gateway"]');
    picker?.addEventListener("click", () => elements.gatewayDllFileInput?.click());
    elements.gatewayDllFileInput?.addEventListener("change", () => {
      setFileLabel(elements.gatewayDllFileLabel, elements.gatewayDllFileInput.files?.[0]?.name || "");
    });
  };

  const getAddressConfig = () => ({
    tester: {
      logicalAddress: elements.testerLogical?.value || "",
      ip: elements.testerIp?.value || "",
    },
    gateway: {
      logicalAddress: elements.gatewayLogical?.value || "",
      ip: elements.gatewayIp?.value || "",
      canRequestAddress: elements.gatewayCanReq?.value || "",
      canResponseAddress: elements.gatewayCanRes?.value || "",
      dllMode: getSelectedValue("gateway-dll-mode") || "default",
      defaultDll: (document.getElementById("sel-gateway-dll-default")?.value || ""),
      customDllFile: elements.gatewayDllFileInput?.files?.[0]?.name || "",
    },
    flow: {
      open: {
        mode: getSelectedValue("open-flow-mode") || "default",
        defaultFlow: (document.getElementById("sel-open-default-flow")?.value || ""),
        tb2File: elements.openTb2FileInput?.files?.[0]?.name || "",
      },
      close: {
        mode: getSelectedValue("close-flow-mode") || "default",
        defaultFlow: (document.getElementById("sel-close-default-flow")?.value || ""),
        tb2File: elements.closeTb2FileInput?.files?.[0]?.name || "",
      },
      auth: {
        enable: document.getElementById("chk-gateway-auth-enable")?.checked ?? true,
        mode: getSelectedValue("auth-flow-mode") || "default",
        defaultFlow: (document.getElementById("sel-auth-default-flow")?.value || ""),
        tb2File: elements.authTb2FileInput?.files?.[0]?.name || "",
      },
    },
  });

  elements.editButton?.addEventListener("click", () => {
    editSnapshot = captureEditableSnapshot();
    fileSnapshot = captureFileSnapshot();
    setEditableState(true);
  });

  elements.cancelButton?.addEventListener("click", () => {
    restoreEditableSnapshot(editSnapshot, fileSnapshot);
    setEditableState(false);
  });

  elements.saveButton?.addEventListener("click", () => {
    if (!validateAndNormalize()) return;
    editSnapshot = captureEditableSnapshot();
    fileSnapshot = captureFileSnapshot();
    setEditableState(false);
    alert("地址配置已保存。");
  });

  bindFlowMode("open");
  bindFlowMode("close");
  bindFlowMode("auth");
  bindDllMode();
  syncChannelMode("open");
  syncChannelMode("close");
  syncChannelMode("auth");
  syncDllMode();

  editSnapshot = captureEditableSnapshot();
  fileSnapshot = captureFileSnapshot();
  setEditableState(false);

  window.SettingsShared = window.SettingsShared || {};
  window.SettingsShared.getObdAddressConfig = getAddressConfig;
})();
