const page = document.querySelector(".page");
const tabs = document.querySelectorAll(".tab");
const tabPanels = {
  online: document.getElementById("panel-online"),
  domain: document.getElementById("panel-domain"),
  offline: document.getElementById("panel-offline"),
};

const onlineAccountInput = document.getElementById("online-account");
const onlinePasswordInput = document.getElementById("online-password");
const domainAccountInput = document.getElementById("domain-account");
const offlineAccountInput = document.getElementById("offline-account");
const offlinePasswordInput = document.getElementById("offline-password");
const rememberPasswordInput = document.getElementById("remember-password");
const showPasswordInput = document.getElementById("show-password");
const passwordHint = document.getElementById("password-hint");
const lockHint = document.getElementById("lock-hint");

const onlineAlert = document.getElementById("online-alert");
const domainAlert = document.getElementById("domain-alert");
const offlineAlert = document.getElementById("offline-alert");

const accountHistoryBox = document.getElementById("account-history");
const attemptsBadge = document.getElementById("attempts-badge");
const eventLog = document.getElementById("event-log");
const toastBox = document.getElementById("toast");

const firstInstallPill = document.getElementById("first-install-pill");
const installNotice = document.getElementById("install-notice");
const offlineTip = document.getElementById("offline-tip");

const chipNetwork = document.getElementById("chip-network");
const chipLogin = document.getElementById("chip-login");
const chipLock = document.getElementById("chip-lock");

const firstInstallToggle = document.getElementById("toggle-first-install");
const networkStatusSelect = document.getElementById("network-status");
const offlinePermissionSelect = document.getElementById("offline-permission");
const dataVersionSelect = document.getElementById("data-version");
const offlineLoginButton = document.getElementById("offline-login-button");

const successAccount = document.getElementById("success-account");
const successType = document.getElementById("success-type");
const successPermission = document.getElementById("success-permission");
const menuTags = document.getElementById("menu-tags");
const versionStatus = document.getElementById("version-status");
const toolUserName = document.getElementById("tool-user-name");
const toolUserType = document.getElementById("tool-user-type");
const toolFileName = document.getElementById("tool-file-name");
const toolFileMeta = document.getElementById("tool-file-meta");
const userTrigger = document.getElementById("user-trigger");
const userMenu = document.getElementById("user-menu");
const userTriggerName = document.getElementById("user-trigger-name");
const languageText = document.getElementById("languageText");
const connDot = document.getElementById("conn-dot");
const connText = document.getElementById("conn-text");
const deviceDropdown = document.getElementById("device-dropdown");
const saveDropdown = document.getElementById("save-dropdown");
const messageDropdown = document.getElementById("message-dropdown");
const systemMessageList = document.getElementById("system-message-list");
const pendingLogBody = document.getElementById("pending-log-body");
const workspaceCanvas = document.getElementById("workspace-canvas");
const headerVinDisplay = document.getElementById("header-vin-display");
const updateTabButtons = document.querySelectorAll("[data-update-tab]");
const updatePanelVersion = document.getElementById("update-panel-version");
const updatePanelContent = document.getElementById("update-panel-content");
const currentVersion = document.getElementById("current-version");
const latestVersion = document.getElementById("latest-version");
const updateVersionList = document.getElementById("update-version-list");
const updateContentList = document.getElementById("update-content-list");
const updateEmpty = document.getElementById("update-empty");
const updateProgress = document.getElementById("update-progress");
const updateProgressFill = document.getElementById("update-progress-fill");
const updateProgressText = document.getElementById("update-progress-text");
const updateResult = document.getElementById("update-result");
const updateStartButton = document.getElementById("update-start");
const modalChangePassword = document.getElementById("modal-change-password");
const modalSaveAs = document.getElementById("modal-save-as");
const modalSaveConfirm = document.getElementById("modal-save-confirm");
const modalNewProject = document.getElementById("modal-new-project");
const pwdCurrent = document.getElementById("pwd-current");
const pwdNew = document.getElementById("pwd-new");
const pwdConfirm = document.getElementById("pwd-confirm");
const pwdError = document.getElementById("pwd-error");
const saveAsPath = document.getElementById("save-as-path");
const menuItems = document.querySelectorAll(".sidebar-item[data-window]");
const workspaceWindows = document.querySelectorAll(".workspace-window");

const HISTORY_KEY = "gwm_login_history_v0_1";

const state = {
  firstInstall: false,
  network: "online",
  offlinePermission: "allowed",
  dataVersion: "same",
  failedAttempts: 0,
  lockedUntil: null,
  loggedIn: false,
  currentAccount: "",
  loginType: "",
  language: "zh",
  connectedDevice: null,
  connectionStatus: "disconnected",
  currentProject: "GDTCfg.gn",
  openedProject: null,
  vin: "LGW12345678901234",
};

let lockTimer = null;
let history = [];
let zIndexSeed = 20;
let updateTimer = null;
let updateData = [];

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const showToast = (message) => {
  if (!toastBox) return;
  const toast = document.createElement("div");
  toast.className = "toast__item";
  toast.textContent = message;
  toastBox.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2600);
};
window.showToast = showToast;

const addLog = (message) => {
  if (!eventLog) return;
  const item = document.createElement("div");
  item.className = "log-item";
  item.innerHTML = `<strong>${timeFormatter.format(new Date())}</strong><span>${message}</span>`;
  eventLog.prepend(item);
  while (eventLog.children.length > 8) {
    eventLog.removeChild(eventLog.lastElementChild);
  }
};
window.addLog = addLog;

const updateToolProjectHeader = (projectName = state.currentProject) => {
  if (toolFileName) {
    toolFileName.textContent = `${projectName} - 长城工程诊断工具`;
    toolFileName.title = `${projectName} - 长城工程诊断工具`;
  }
  if (toolFileMeta) {
    toolFileMeta.textContent = projectName;
  }
};

const updateHeaderVin = (vin = state.vin) => {
  if (!headerVinDisplay) return;
  headerVinDisplay.textContent = vin ? `VIN：${vin}` : "VIN：--";
};

const closeAllDropdowns = (preserveUserMenu = false) => {
  [deviceDropdown, saveDropdown, messageDropdown].forEach((dropdown) => {
    if (!dropdown) return;
    dropdown.classList.remove("is-open");
  });
  if (userMenu && !preserveUserMenu) {
    userMenu.classList.remove("is-open");
  }
};

const setConnectionStatus = (status, label) => {
  state.connectionStatus = status;
  if (!connDot || !connText) return;
  const hintEl = connDot.closest(".tool-file__hint");
  connDot.classList.remove("status-dot--connected", "status-dot--error", "status-dot--disconnected");
  if (status === "connected") {
    connDot.classList.add("status-dot--connected");
  } else if (status === "error") {
    connDot.classList.add("status-dot--error");
  } else {
    connDot.classList.add("status-dot--disconnected");
  }
  if (hintEl) hintEl.setAttribute("data-conn", status);
  connText.textContent = label || "未连接";
};

const bringToFront = (windowEl) => {
  if (!windowEl) return;
  zIndexSeed += 1;
  windowEl.style.zIndex = String(zIndexSeed);
};

const openWindow = (windowKey) => {
  if (!windowKey) return;

  // 仿真、总线数据、图形监控、报文录制、报文回放，在侧边栏全部触发标准的单选互斥高亮，并在桌面并存置顶显示
  if (["home", "bus-data", "chart-monitor", "message-record", "message-playback"].includes(windowKey)) {
    setActiveWindow(windowKey);
    const windowEl = document.querySelector(`.workspace-window[data-window="${windowKey}"]`);
    if (windowEl) {
      windowEl.classList.remove("is-hidden");
      windowEl.classList.remove("is-maximized", "is-minimized");
      bringToFront(windowEl);
    }
    return;
  }

  setActiveWindow(windowKey);
  const windowEl = document.querySelector(`.workspace-window[data-window="${windowKey}"]`);
  if (windowEl) {
    windowEl.classList.remove("is-hidden");
    windowEl.classList.remove("is-minimized");
    windowEl.classList.add("is-maximized");
    bringToFront(windowEl);
  }
};

const closeWindow = (windowEl) => {
  if (!windowEl) return;
  windowEl.classList.add("is-hidden");
  windowEl.classList.remove("is-active", "is-minimized", "is-maximized");
};

const toggleMaximizeWindow = (windowEl) => {
  if (!windowEl) return;
  windowEl.classList.toggle("is-maximized");
  bringToFront(windowEl);
};

const toggleMinimizeWindow = (windowEl) => {
  if (!windowEl) return;
  windowEl.classList.toggle("is-minimized");
  bringToFront(windowEl);
};

const pushSystemMessage = (message, type = "info") => {
  if (!systemMessageList) return;
  const item = document.createElement("div");
  item.className = `system-message__item${type === "error" ? " is-error" : ""}`;
  item.innerHTML = `<strong>${timeFormatter.format(new Date())}</strong><span>${message}</span>`;
  systemMessageList.prepend(item);
  while (systemMessageList.children.length > 12) {
    systemMessageList.removeChild(systemMessageList.lastElementChild);
  }
  if (type === "error") {
    openWindow("system-messages");
  }
};

const renderPendingLogs = () => {
  if (!pendingLogBody) return;
  const rows = [
    {
      type: "整车刷写",
      time: "2026-01-27 10:21",
      reason: "网络原因：连接超时",
    },
    {
      type: "刷写配置",
      time: "2026-01-27 09:40",
      reason: "云端返回：校验失败",
    },
  ];
  pendingLogBody.innerHTML = rows
    .map(
      (row, index) => `
      <tr>
        <td>${row.type}</td>
        <td>${row.time}</td>
        <td>${row.reason}</td>
        <td>
          <div class="log-actions">
            <button class="btn btn--ghost btn--sm" data-action="export-log" data-index="${index}">
              导出
            </button>
            <button class="btn btn--ghost btn--sm" data-action="upload-log" data-index="${index}">
              上传
            </button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
};

const renderUpdateContent = () => {
  if (!updateContentList || !updateEmpty) return;
  updateContentList.innerHTML = "";
  if (!updateData.length) {
    updateEmpty.classList.remove("is-hidden");
    return;
  }
  updateEmpty.classList.add("is-hidden");
  updateData.forEach((item) => {
    const content = state.language === "zh" ? item.contentZh : item.contentEn;
    const block = document.createElement("div");
    block.className = "update-content-item";
    block.innerHTML = `<strong>${item.version}</strong><div>${content}</div>`;
    updateContentList.appendChild(block);
  });
};

const renderUpdateList = () => {
  if (!updateVersionList) return;
  updateVersionList.innerHTML = "";
  updateData.forEach((item, index) => {
    const row = document.createElement("label");
    row.className = "update-item";
    row.innerHTML = `
      <span><input type="radio" name="updateVersion" value="${item.version}" ${
        index === 0 ? "checked" : ""
      } />${item.version}</span>
      <span>${item.date}</span>
    `;
    updateVersionList.appendChild(row);
  });
};

const checkUpdate = () => {
  updateData = [
    {
      version: "V0.2.3",
      date: "2026-01-27",
      contentZh: "修复在线更新失败重试逻辑；优化日志导出。",
      contentEn: "Fix update retry logic; improve log export.",
    },
    {
      version: "V0.2.2",
      date: "2026-01-20",
      contentZh: "增加系统消息置顶提示；完善设备打开错误提示。",
      contentEn: "Add message pinning; improve device error tips.",
    },
  ];
  latestVersion.textContent = updateData[0]?.version || "---";
  updateResult.textContent = updateData.length ? "发现新版本" : "已是最新版本";
  updateStartButton.classList.toggle("is-hidden", !updateData.length);
  renderUpdateList();
  renderUpdateContent();
};

const startUpdate = () => {
  if (!updateData.length) return;
  if (updateTimer) {
    clearInterval(updateTimer);
  }
  updateProgress.classList.remove("is-hidden");
  updateResult.textContent = "";
  let progress = 0;
  updateProgressFill.style.width = "0%";
  updateProgressText.textContent = "更新中 0%";
  updateTimer = setInterval(() => {
    progress += 10;
    updateProgressFill.style.width = `${progress}%`;
    updateProgressText.textContent = `更新中 ${progress}%`;
    if (progress >= 100) {
      clearInterval(updateTimer);
      updateTimer = null;
      updateResult.textContent = "更新成功，请退出软件重新登录。";
      pushSystemMessage("在线更新完成，请退出软件重新登录。", "info");
    }
  }, 300);
};

const openDevice = (device) => {
  state.connectedDevice = device;
  if (device.includes("CANoe") || device.includes("以太网")) {
    setConnectionStatus("connected", "连接成功");
    pushSystemMessage(`设备打开成功：${device}`);
    addLog(`设备打开成功：${device}`);
  } else {
    setConnectionStatus("error", "连接失败");
    pushSystemMessage(`设备打开失败：${device} 暂不支持`, "error");
    addLog(`设备打开失败：${device}`);
  }
};

const closeDevice = () => {
  if (!state.connectedDevice) {
    setConnectionStatus("error", "关闭失败");
    pushSystemMessage("设备关闭失败：当前未连接设备", "error");
    addLog("设备关闭失败：当前未连接设备");
    return;
  }
  pushSystemMessage(`设备已关闭：${state.connectedDevice}`);
  addLog(`设备已关闭：${state.connectedDevice}`);
  state.connectedDevice = null;
  setConnectionStatus("disconnected", "未连接");
};

const showModal = (modalEl) => {
  if (!modalEl) return;
  modalEl.classList.remove("is-hidden");
};

const hideModal = (modalEl) => {
  if (!modalEl) return;
  modalEl.classList.add("is-hidden");
};

const setAlert = (element, message) => {
  if (!element) return;
  element.textContent = message;
  element.classList.add("is-show");
};

const clearAlerts = () => {
  [onlineAlert, domainAlert, offlineAlert].forEach((alert) => {
    if (!alert) return;
    alert.textContent = "";
    alert.classList.remove("is-show");
  });
};

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const loadMockHistory = () => {
  if (typeof mockUsers === "undefined" || !Array.isArray(mockUsers)) return [];
  return mockUsers
    .filter((item) => item && item.account && item.password)
    .map((item) => ({
      account: String(item.account),
      password: String(item.password),
      remember: true,
      loginType: "在线账号登录",
      lastLoginAt: 0,
    }));
};

const mergeHistoryWithMock = (localHistory) => {
  const merged = [];
  const pushUnique = (entry) => {
    if (!entry?.account) return;
    if (merged.some((item) => item.account === entry.account)) return;
    merged.push(entry);
  };
  localHistory.forEach(pushUnique);
  loadMockHistory().forEach(pushUnique);
  return merged.slice(0, 10);
};

const syncLoginInputs = () => {
  if (!offlineAccountInput || !offlinePasswordInput || !domainAccountInput) return;
  offlineAccountInput.value = onlineAccountInput.value;
  offlinePasswordInput.value = onlinePasswordInput.value;
  domainAccountInput.value = onlineAccountInput.value;
};

const saveHistory = () => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
};

const renderHistory = () => {
  if (!accountHistoryBox) return;
  accountHistoryBox.innerHTML = "";
  if (state.firstInstall) {
    accountHistoryBox.classList.remove("is-open");
    return;
  }
  if (!history.length) {
    accountHistoryBox.innerHTML = `<div class="history__meta">暂无历史账号</div>`;
    return;
  }
  history.forEach((item) => {
    const metaText = item.loginType?.includes("域账号")
      ? "域账号免密"
      : item.remember
      ? "记住密码"
      : "密码已保存（隐藏）";
    const row = document.createElement("div");
    row.className = "history__item";
    row.dataset.account = item.account;
    row.innerHTML = `
      <div>
        <div>${item.account}</div>
        <div class="history__meta">${metaText}</div>
      </div>
      <button class="btn btn--ghost btn--sm">使用</button>
    `;
    accountHistoryBox.appendChild(row);
  });
};

const applyLastAccount = () => {
  if (!history.length || state.firstInstall) {
    onlineAccountInput.value = "";
    onlinePasswordInput.value = "";
    passwordHint.textContent = "";
    syncLoginInputs();
    updateOfflineAvailability();
    return;
  }
  const last = history[0];
  onlineAccountInput.value = last.account;
  offlineAccountInput.value = last.account;
  const isDomain = last.loginType?.includes("域账号");
  rememberPasswordInput.checked = !isDomain && Boolean(last.remember);
  if (isDomain) {
    onlinePasswordInput.value = "";
    passwordHint.textContent = "域账号免密，无需密码";
  } else if (last.remember && last.password) {
    onlinePasswordInput.value = last.password;
    passwordHint.textContent = "已填充记住的密码";
  } else {
    onlinePasswordInput.value = "";
    passwordHint.textContent = "密码已保存（隐藏），需重新输入";
  }
  syncLoginInputs();
  updateOfflineAvailability();
};

const updateHistory = (account, password, remember, loginType) => {
  const index = history.findIndex((item) => item.account === account);
  if (index >= 0) {
    history.splice(index, 1);
  }
  history.unshift({
    account,
    password,
    remember,
    loginType,
    lastLoginAt: Date.now(),
  });
  history = history.slice(0, 5);
  saveHistory();
  renderHistory();
  applyLastAccount();
};

const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

const isLocked = () => state.lockedUntil && Date.now() < state.lockedUntil;

const updateLockState = () => {
  const locked = isLocked();
  chipLock.dataset.state = locked ? "locked" : "normal";
  chipLock.querySelector("span:last-child").textContent = locked ? "锁定中" : "未锁定";
  attemptsBadge.textContent = `失败次数 ${state.failedAttempts}/5`;
  if (locked) {
    lockHint.textContent = `账号已锁定，剩余 ${formatCountdown(
      state.lockedUntil - Date.now()
    )}`;
  } else {
    lockHint.textContent = "";
  }
};

const startLock = (minutes = 10) => {
  state.lockedUntil = Date.now() + minutes * 60 * 1000;
  if (lockTimer) clearInterval(lockTimer);
  lockTimer = setInterval(() => {
    if (!isLocked()) {
      clearInterval(lockTimer);
      lockTimer = null;
      state.failedAttempts = 0;
      state.lockedUntil = null;
      updateLockState();
      addLog("账号锁定已解除");
      return;
    }
    updateLockState();
  }, 1000);
  updateLockState();
  addLog("账号已锁定 10 分钟");
};

const incrementFailedAttempt = () => {
  state.failedAttempts += 1;
  if (state.failedAttempts >= 5) {
    startLock(10);
  } else {
    updateLockState();
  }
};

const resetAttempts = () => {
  state.failedAttempts = 0;
  state.lockedUntil = null;
  if (lockTimer) {
    clearInterval(lockTimer);
    lockTimer = null;
  }
  updateLockState();
};

const setLoginState = (loggedIn) => {
  state.loggedIn = loggedIn;
  page.dataset.state = loggedIn ? "logged-in" : "logged-out";
  chipLogin.dataset.state = loggedIn ? "logged-in" : "logged-out";
  chipLogin.querySelector("span:last-child").textContent = loggedIn ? "已登录" : "未登录";
};

const updateNetworkState = () => {
  const online = state.network === "online";
  chipNetwork.dataset.state = online ? "online" : "offline";
  chipNetwork.querySelector("span:last-child").textContent = `网络：${online ? "在线" : "离线"}`;
};

const updateFirstInstallUI = () => {
  const show = state.firstInstall;
  firstInstallPill.style.display = show ? "inline-flex" : "none";
  installNotice.style.display = show ? "block" : "none";
};

const getAccountOfflinePermission = async (account) => {
  if (state.offlinePermission !== "allowed") {
    return false;
  }
  if (!account) {
    return false;
  }
  if (typeof window.api.getOfflinePermission === "function") {
    const response = await window.api.getOfflinePermission({ account });
    return response.code === 0 ? Boolean(response.data) : false;
  }
  return true;
};

const updateOfflineAvailability = async () => {
  const offlineTab = document.querySelector('.tab[data-tab="offline"]');
  const showOfflineTab = !state.firstInstall && state.network === "offline";
  offlineTab.classList.toggle("tab--hidden", !showOfflineTab);
  if (!showOfflineTab && offlineTab.classList.contains("is-active")) {
    switchTab("online");
  }
  if (!showOfflineTab) {
    offlineTip.textContent = "离线登录仅在断网且具备离线权限时显示。";
    offlineTip.classList.add("is-hidden");
    offlineLoginButton.classList.add("is-hidden");
    return;
  }
  const account = offlineAccountInput.value.trim() || onlineAccountInput.value.trim();
  if (!account) {
    offlineTip.textContent = "请输入账号以判断离线权限。";
    offlineTip.classList.remove("is-hidden");
    offlineLoginButton.classList.add("is-hidden");
    return;
  }
  offlineAccountInput.value = account;
  const allowed = await getAccountOfflinePermission(account);
  offlineLoginButton.classList.toggle("is-hidden", !allowed);
  offlineTip.textContent = allowed
    ? "离线登录已启用，请输入密码。"
    : "当前账号无离线权限，离线登录不可用。";
  offlineTip.classList.remove("is-hidden");
};

const switchTab = (target) => {
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === target);
  });
  Object.entries(tabPanels).forEach(([key, panel]) => {
    panel.classList.toggle("is-active", key === target);
  });
  clearAlerts();
};

const setVersionStatus = (label, level) => {
  versionStatus.textContent = label;
  versionStatus.classList.remove("is-warning", "is-danger", "is-success");
  if (level === "warning") versionStatus.classList.add("is-warning");
  if (level === "danger") versionStatus.classList.add("is-danger");
  if (level === "success") versionStatus.classList.add("is-success");
};

const checkDataVersion = async () => {
  const response = await window.api.checkDataVersion({ status: state.dataVersion });
  if (response.code !== 0) {
    setVersionStatus("版本检测失败", "danger");
    return;
  }
  setVersionStatus(response.data.label, response.data.level);
};

const renderMenuTags = (permissions = []) => {
  menuTags.innerHTML = "";
  permissions.forEach((item) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = item;
    menuTags.appendChild(tag);
  });
};

const setActiveWindow = (windowKey) => {
  let labelText = "";
  menuItems.forEach((item) => {
    const isActive = item.dataset.window === windowKey;
    item.classList.toggle("is-active", isActive);
    if (isActive) {
      labelText = item.textContent.trim();
      // 展开包含当前选中项的二级菜单组，并高亮一级菜单
      const group = item.closest(".sidebar-group");
      if (group) {
        document.querySelectorAll(".sidebar-group").forEach((g) => {
          g.classList.remove("has-active");
          if (g !== group) return;
          g.classList.add("is-expanded", "has-active");
          const header = g.querySelector(".sidebar-group-header");
          if (header) header.setAttribute("aria-expanded", "true");
        });
      }
    }
  });
  workspaceWindows.forEach((window) => {
    // 仿真、总线数据、图形监控、录制和回放是悬浮窗口，不参与主视窗互斥激活与最大化隐藏逻辑
    const floatWindows = ['message-record', 'message-playback', 'home', 'bus-data', 'chart-monitor'];
    if (floatWindows.includes(window.dataset.window)) return;

    const isActive = window.dataset.window === windowKey;
    window.classList.toggle("is-active", isActive);
    if (isActive) {
      const shouldExpand = window.classList.contains("is-hidden") || window.classList.contains("is-minimized");
      window.classList.remove("is-hidden");
      window.classList.remove("is-minimized");
      if (shouldExpand) {
        window.classList.add("is-maximized");
      }
      bringToFront(window);
    }
  });
};

const initWindowDrag = () => {
  if (!workspaceCanvas) return;
  let draggingWindow = null;
  let offsetX = 0;
  let offsetY = 0;

  workspaceCanvas.addEventListener("mousedown", (event) => {
    const header = event.target.closest(".window-header");
    if (!header) return;
    if (event.target.closest("[data-action]")) return;
    const windowEl = header.closest(".workspace-window");
    if (!windowEl || windowEl.classList.contains("is-maximized")) return;
    draggingWindow = windowEl;
    const rect = windowEl.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    bringToFront(windowEl);
  });

  document.addEventListener("mousemove", (event) => {
    if (!draggingWindow || !workspaceCanvas) return;
    const canvasRect = workspaceCanvas.getBoundingClientRect();
    let nextLeft = event.clientX - canvasRect.left - offsetX;
    let nextTop = event.clientY - canvasRect.top - offsetY;
    nextLeft = Math.max(0, Math.min(nextLeft, canvasRect.width - 120));
    nextTop = Math.max(0, Math.min(nextTop, canvasRect.height - 60));
    draggingWindow.style.left = `${nextLeft}px`;
    draggingWindow.style.top = `${nextTop}px`;
  });

  document.addEventListener("mouseup", () => {
    draggingWindow = null;
  });
};

const updateLanguageText = () => {
  if (!languageText) return;
  languageText.textContent = state.language === "zh" ? "切换成英文" : "Set to Chinese";
  renderUpdateContent();
};

const blockClipboardOnInput = (input) => {
  if (!input) return;
  ["paste", "copy", "cut"].forEach((eventName) => {
    input.addEventListener(eventName, (event) => event.preventDefault());
  });
};

const onLoginSuccess = async (
  typeLabel,
  account,
  data,
  rememberPassword,
  rawPassword
) => {
  setLoginState(true);
  state.currentAccount = account;
  state.loginType = typeLabel;
  resetAttempts();

  successAccount.textContent = account;
  successType.textContent = typeLabel;
  successPermission.textContent = data?.permissions?.length ? "权限已更新" : "权限待确认";
  if (toolUserName) {
    toolUserName.textContent = data?.name || account || "-";
  }
  if (toolUserType) {
    toolUserType.textContent = typeLabel || "已登录";
  }
  if (userTriggerName) {
    userTriggerName.textContent = data?.name || account || "用户名";
  }
  updateToolProjectHeader();
  updateHeaderVin();
  setConnectionStatus("disconnected", "未连接");
  renderPendingLogs();

  renderMenuTags(data?.permissions || []);
  await checkDataVersion();
  setActiveWindow("gbf-convert");

  if (account) {
    const safePassword = typeof rawPassword === "string" ? rawPassword : "";
    updateHistory(account, safePassword, rememberPassword, typeLabel);
  }

  addLog(`${typeLabel}成功：${account || "未知账号"}`);
  showToast("登录成功，进入工具端");
};

const handleOnlineLogin = async () => {
  clearAlerts();
  if (state.network === "offline") {
    setAlert(onlineAlert, "网络不可用，请尝试离线登录");
    addLog("在线登录失败：网络不可用");
    return;
  }
  if (isLocked()) {
    setAlert(onlineAlert, "账号已锁定，请稍后再试");
    return;
  }
  const account = onlineAccountInput.value.trim();
  const password = onlinePasswordInput.value.trim();
  if (!account) {
    setAlert(onlineAlert, "请填写账号");
    return;
  }
  if (!password) {
    setAlert(onlineAlert, "请填写密码");
    return;
  }
  const response = await window.api.loginOnline({ account, password });
  if (response.code === 0) {
    await onLoginSuccess(
      "在线登录",
      account,
      response.data,
      rememberPasswordInput.checked,
      password
    );
    return;
  }
  setAlert(onlineAlert, response.message || "登录失败");
  if (["PASSWORD_MISMATCH", "ACCOUNT_NOT_FOUND"].includes(response.error)) {
    incrementFailedAttempt();
  }
  addLog(`在线登录失败：${response.message}`);
};

const handleDomainLogin = async () => {
  clearAlerts();
  if (state.network === "offline") {
    setAlert(domainAlert, "网络不可用，无法进行域账号登录");
    addLog("域账号登录失败：网络不可用");
    return;
  }
  const account =
    domainAccountInput.value.trim() || onlineAccountInput.value.trim();
  if (!account) {
    setAlert(domainAlert, "请填写域账号");
    return;
  }
  domainAccountInput.value = account;
  const response = await window.api.loginDomain({ account });
  if (response.code === 0) {
    await onLoginSuccess("域账号登录", account, response.data, false, "");
    return;
  }
  setAlert(domainAlert, response.message || "登录失败");
  addLog(`域账号登录失败：${response.message}`);
};

const handleOfflineLogin = async () => {
  clearAlerts();
  if (state.network !== "offline") {
    setAlert(offlineAlert, "请断网后使用离线登录");
    return;
  }
  if (isLocked()) {
    setAlert(offlineAlert, "账号已锁定，请稍后再试");
    return;
  }
  const account = offlineAccountInput.value.trim();
  if (!account) {
    setAlert(offlineAlert, "请填写账号");
    return;
  }
  const password = offlinePasswordInput.value.trim();
  if (!password) {
    setAlert(offlineAlert, "请填写密码");
    return;
  }
  const accountAllowed = await getAccountOfflinePermission(account);
  if (!accountAllowed) {
    setAlert(offlineAlert, "无离线权限，无法登录");
    return;
  }
  const response = await window.api.loginOffline({
    account,
    password,
    offlinePermission: accountAllowed,
  });
  if (response.code === 0) {
    await onLoginSuccess("离线登录", account, response.data, false, password);
    return;
  }
  setAlert(offlineAlert, response.message || "登录失败");
  if (["PASSWORD_MISMATCH", "ACCOUNT_NOT_FOUND"].includes(response.error)) {
    incrementFailedAttempt();
  }
  addLog(`离线登录失败：${response.message}`);
};

const handleLogout = () => {
  if (!state.loggedIn) {
    showToast("当前未登录");
    return;
  }
  setLoginState(false);
  state.currentAccount = "";
  state.loginType = "";
  successAccount.textContent = "-";
  successType.textContent = "-";
  successPermission.textContent = "-";
  menuTags.innerHTML = "";
  versionStatus.textContent = "待检测";
  versionStatus.classList.remove("is-warning", "is-danger", "is-success");
  if (toolUserName) {
    toolUserName.textContent = "-";
  }
  if (toolUserType) {
    toolUserType.textContent = "未登录";
  }
  if (userTriggerName) {
    userTriggerName.textContent = "用户名";
  }
  if (toolFileName) {
    updateToolProjectHeader("GDTCfg.gn");
  }
  if (systemMessageList) {
    systemMessageList.innerHTML = "";
  }
  if (pendingLogBody) {
    pendingLogBody.innerHTML = "";
  }
  state.connectedDevice = null;
  setConnectionStatus("disconnected", "未连接");
  setActiveWindow("home");
  closeAllDropdowns();
  document.querySelectorAll(".modal").forEach((modal) => hideModal(modal));
  addLog("用户已退出登录");
  showToast("已退出登录");
};

const clearCache = () => {
  history = [];
  saveHistory();
  renderHistory();
  applyLastAccount();
  showToast("账号缓存已清空");
  addLog("账号缓存已清空");
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    switchTab(tab.dataset.tab);
  });
});

menuItems.forEach((item) => {
  item.addEventListener("click", () => {
    openWindow(item.dataset.window);
  });
});

// 一级菜单点击：展开/收起二级菜单
document.querySelectorAll(".sidebar-group-header").forEach((header) => {
  header.addEventListener("click", (e) => {
    e.stopPropagation();
    const group = header.closest(".sidebar-group");
    if (!group) return;
    const isExpanded = group.classList.toggle("is-expanded");
    header.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  });
});

workspaceWindows.forEach((window) => {
  window.addEventListener("click", () => {
    setActiveWindow(window.dataset.window);
  });
});

if (userTrigger) {
  userTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    userMenu.classList.toggle("is-open");
    closeAllDropdowns(true);
  });
}

updateTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.updateTab;
    updateTabButtons.forEach((btn) =>
      btn.classList.toggle("is-active", btn === button)
    );
    updatePanelVersion.classList.toggle("is-active", target === "version");
    updatePanelContent.classList.toggle("is-active", target === "content");
  });
});

document.addEventListener("click", (event) => {
  const deviceItem = event.target.closest("[data-device]");
  if (deviceItem) {
    openDevice(deviceItem.dataset.device);
    closeAllDropdowns();
  }
});

accountHistoryBox.addEventListener("click", (event) => {
  const item = event.target.closest(".history__item");
  if (!item) return;
  const account = item.dataset.account;
  const record = history.find((entry) => entry.account === account);
  if (!record) return;
  onlineAccountInput.value = record.account;
  offlineAccountInput.value = record.account;
  const isDomain = record.loginType?.includes("域账号");
  rememberPasswordInput.checked = !isDomain && Boolean(record.remember);
  if (isDomain) {
    onlinePasswordInput.value = "";
    passwordHint.textContent = "域账号免密，无需密码";
  } else if (record.remember && record.password) {
    onlinePasswordInput.value = record.password;
    passwordHint.textContent = "已填充记住的密码";
  } else {
    onlinePasswordInput.value = "";
    passwordHint.textContent = "密码已保存（隐藏），需重新输入";
  }
  accountHistoryBox.classList.remove("is-open");
  updateOfflineAvailability();
});

onlineAccountInput.addEventListener("input", () => {
  syncLoginInputs();
  updateOfflineAvailability();
});

onlinePasswordInput.addEventListener("input", () => {
  syncLoginInputs();
});

offlineAccountInput.addEventListener("input", () => {
  updateOfflineAvailability();
});

showPasswordInput.addEventListener("change", () => {
  onlinePasswordInput.type = showPasswordInput.checked ? "text" : "password";
});

firstInstallToggle.addEventListener("change", () => {
  state.firstInstall = firstInstallToggle.checked;
  updateFirstInstallUI();
  updateOfflineAvailability();
  renderHistory();
  applyLastAccount();
  addLog(state.firstInstall ? "切换为首次安装模式" : "退出首次安装模式");
});

networkStatusSelect.addEventListener("change", () => {
  state.network = networkStatusSelect.value;
  updateNetworkState();
  updateOfflineAvailability();
  addLog(`网络状态切换为${state.network === "online" ? "在线" : "离线"}`);
});

offlinePermissionSelect.addEventListener("change", () => {
  state.offlinePermission = offlinePermissionSelect.value;
  updateOfflineAvailability();
  addLog(
    state.offlinePermission === "allowed" ? "离线权限已开启" : "离线权限已关闭"
  );
});

dataVersionSelect.addEventListener("change", () => {
  state.dataVersion = dataVersionSelect.value;
  if (state.loggedIn) {
    checkDataVersion();
  }
});

document.addEventListener("click", (event) => {
  const isOverlayClick =
    event.target.closest(".dropdown") || event.target.closest(".tool-user");
  if (!isOverlayClick) {
    closeAllDropdowns();
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === "toggle-history") {
    accountHistoryBox.classList.toggle("is-open");
    return;
  }
  if (action === "domain-shortcut") {
    switchTab("domain");
    return;
  }
  if (action === "login-online") {
    handleOnlineLogin();
    return;
  }
  if (action === "login-domain") {
    handleDomainLogin();
    return;
  }
  if (action === "login-offline") {
    handleOfflineLogin();
    return;
  }
  if (action === "force-lock") {
    startLock(10);
    showToast("已强制锁定账号");
    return;
  }
  if (action === "force-unlock") {
    resetAttempts();
    showToast("锁定已解除");
    addLog("锁定已解除");
    return;
  }
  if (action === "simulate-timeout") {
    if (state.loggedIn) {
      handleLogout();
      showToast("模拟超时：已自动退出");
      addLog("模拟 1h 无交互退出");
    } else {
      showToast("当前未登录");
    }
    return;
  }
  if (action === "force-logout") {
    handleLogout();
    return;
  }
  if (action === "recheck-version") {
    checkDataVersion();
    return;
  }
  if (action === "clear-cache") {
    clearCache();
    return;
  }
  if (action === "export-log") {
    pushSystemMessage("待上传日志已导出：类型_上传失败_时间.zip");
    showToast("日志已导出");
    return;
  }
  if (action === "upload-log") {
    pushSystemMessage("日志上传失败：网络原因（已更新失败时间与原因）", "error");
    showToast("上传失败，请重试");
    return;
  }
  if (action === "toggle-device-menu") {
    deviceDropdown.classList.toggle("is-open");
    saveDropdown.classList.remove("is-open");
    messageDropdown.classList.remove("is-open");
    if (userMenu) userMenu.classList.remove("is-open");
    return;
  }
  if (action === "toggle-save-menu") {
    saveDropdown.classList.toggle("is-open");
    deviceDropdown.classList.remove("is-open");
    messageDropdown.classList.remove("is-open");
    if (userMenu) userMenu.classList.remove("is-open");
    return;
  }
  if (action === "toggle-message-menu") {
    messageDropdown.classList.toggle("is-open");
    deviceDropdown.classList.remove("is-open");
    saveDropdown.classList.remove("is-open");
    if (userMenu) userMenu.classList.remove("is-open");
    return;
  }
  if (action === "close-device") {
    closeDevice();
    return;
  }
  if (action === "save-project") {
    pushSystemMessage("保存成功：默认配置已更新");
    showToast("已保存当前配置");
    return;
  }
  if (action === "save-as-project") {
    showModal(modalSaveAs);
    return;
  }
  if (action === "open-project") {
    state.openedProject = "Project_A.gn";
    state.currentProject = state.openedProject;
    updateToolProjectHeader();
    pushSystemMessage(`打开工程文件：${state.currentProject}`);
    showToast("工程文件已打开");
    return;
  }
  if (action === "new-project") {
    showModal(modalNewProject);
    return;
  }
  if (action === "pack-flash-only") {
    pushSystemMessage("打包工程：已生成统一刷写包");
    showToast("已成功打包统一刷写");
    closeAllDropdowns();
    return;
  }
  if (action === "pack-all") {
    pushSystemMessage("打包工程：已生成完整打包文件");
    showToast("已成功全部打包");
    closeAllDropdowns();
    return;
  }
  if (action === "open-system-messages") {
    openWindow("system-messages");
    return;
  }
  if (action === "open-pending-logs") {
    openWindow("pending-logs");
    return;
  }
  if (action === "open-update") {
    openWindow("update");
    return;
  }
  if (action === "open-help") {
    openWindow("help");
    return;
  }
  if (action === "open-change-password") {
    showModal(modalChangePassword);
    return;
  }
  if (action === "toggle-language") {
    state.language = state.language === "zh" ? "en" : "zh";
    updateLanguageText();
    showToast(state.language === "zh" ? "已切换为中文" : "Switched to English");
    return;
  }
  if (action === "logout") {
    showModal(modalSaveConfirm);
    return;
  }
  if (action === "check-update") {
    checkUpdate();
    return;
  }
  if (action === "start-update") {
    startUpdate();
    return;
  }
  if (action === "close-modal") {
    hideModal(actionButton.closest(".modal"));
    return;
  }
  if (action === "confirm-save-as") {
    state.currentProject = saveAsPath.value || "GDTCfg.gn";
    updateToolProjectHeader();
    pushSystemMessage(`另存为：${state.currentProject}`);
    hideModal(modalSaveAs);
    showToast("另存为成功");
    return;
  }
  if (action === "confirm-save-logout") {
    pushSystemMessage("保存成功：默认配置已更新");
    hideModal(modalSaveConfirm);
    handleLogout();
    return;
  }
  if (action === "skip-save-logout") {
    hideModal(modalSaveConfirm);
    handleLogout();
    return;
  }
  if (action === "confirm-new-project") {
    pushSystemMessage("新建工程并保存成功");
    state.currentProject = "新建工程.gn";
    updateToolProjectHeader();
    hideModal(modalNewProject);
    showToast("新建工程完成");
    return;
  }
  if (action === "cancel-new-project") {
    state.currentProject = "新建工程.gn";
    updateToolProjectHeader();
    hideModal(modalNewProject);
    return;
  }
  if (action === "submit-change-password") {
    pwdError.textContent = "";
    if (!pwdNew.value || pwdNew.value !== pwdConfirm.value) {
      pwdError.textContent = "两次输入密码不一致";
      return;
    }
    pushSystemMessage("修改密码成功，请重新登录。");
    hideModal(modalChangePassword);
    handleLogout();
    return;
  }
  if (action === "cancel-change-password") {
    hideModal(modalChangePassword);
    return;
  }
  if (action === "minimize-window") {
    const windowEl = actionButton.closest(".workspace-window");
    toggleMinimizeWindow(windowEl);
    return;
  }
  if (action === "maximize-window") {
    const windowEl = actionButton.closest(".workspace-window");
    toggleMaximizeWindow(windowEl);
    return;
  }
  if (action === "close-window") {
    const windowEl = actionButton.closest(".workspace-window");
    closeWindow(windowEl);
    const floatWindows = ["message-record", "message-playback", "home", "bus-data", "chart-monitor"];
    if (windowEl && floatWindows.includes(windowEl.dataset.window)) {
      const windowKey = windowEl.dataset.window;
      const menuBtn = document.querySelector(`.sidebar-item[data-window="${windowKey}"]`);
      if (menuBtn) menuBtn.classList.remove("is-active");
    }
  }
});

const init = () => {
  history = mergeHistoryWithMock(loadHistory());
  saveHistory();
  updateNetworkState();
  updateFirstInstallUI();
  updateOfflineAvailability();
  renderHistory();
  applyLastAccount();
  updateLockState();
  setLoginState(false);
  updateLanguageText();
  initWindowDrag();
  blockClipboardOnInput(pwdCurrent);
  blockClipboardOnInput(pwdNew);
  blockClipboardOnInput(pwdConfirm);
  if (toolUserName) {
    toolUserName.textContent = "-";
  }
  if (toolUserType) {
    toolUserType.textContent = "未登录";
  }
  if (userTriggerName) {
    userTriggerName.textContent = "用户名";
  }
  updateToolProjectHeader("GDTCfg.gn");
  if (currentVersion) {
    currentVersion.textContent = "xxxxxxxxxx";
  }
  if (latestVersion) {
    latestVersion.textContent = "---";
  }
  setConnectionStatus("disconnected", "未连接");
  setActiveWindow("home");
  addLog("系统就绪，等待登录");
};

init();
