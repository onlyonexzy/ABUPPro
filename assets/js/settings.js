/**
 * settings.js - 统一刷写设置页交互逻辑（已移除 DID 配置）
 */
;(function () {
  "use strict";

  const root = document.getElementById("flash-settings-root");
  if (!root) return;

  const DEFAULT_SINGLE_DIDS = [
    { name: "应用软件版本", did: "F189", cmd: "22 F189" },
    { name: "标定软件版本", did: "F1C0", cmd: "22 F1C0" },
    { name: "底层软件版本", did: "F1C1", cmd: "22 F1C1" },
  ];

  const lockSection = (section) => {
    section.classList.remove("is-editing");
    section.querySelectorAll('input[type="text"]').forEach((el) => {
      el.readOnly = true;
    });
    section.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => {
      el.disabled = true;
    });
    section.querySelectorAll(".settings-btn").forEach((btn) => {
      if (!btn.classList.contains("settings-edit-btn")) btn.disabled = true;
    });
    const editBtn = section.querySelector("[data-edit-toggle]");
    const saveBtn = section.querySelector("[data-save-toggle]");
    const cancelBtn = section.querySelector("[data-cancel-toggle]");
    if (editBtn) {
      editBtn.classList.remove("is-editing");
      editBtn.textContent = "编辑";
      editBtn.hidden = false;
    }
    if (saveBtn) saveBtn.hidden = true;
    if (cancelBtn) cancelBtn.hidden = true;
  };

  const unlockSection = (section) => {
    section.classList.add("is-editing");
    section.querySelectorAll('input[type="text"]').forEach((el) => {
      el.readOnly = false;
    });
    section.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => {
      el.disabled = false;
    });
    section.querySelectorAll(".settings-btn").forEach((btn) => {
      if (!btn.classList.contains("settings-edit-btn")) btn.disabled = false;
    });
    const editBtn = section.querySelector("[data-edit-toggle]");
    const saveBtn = section.querySelector("[data-save-toggle]");
    const cancelBtn = section.querySelector("[data-cancel-toggle]");
    if (editBtn) {
      editBtn.classList.add("is-editing");
      editBtn.textContent = "取消编辑";
      editBtn.hidden = true;
    }
    if (saveBtn) saveBtn.hidden = false;
    if (cancelBtn) cancelBtn.hidden = false;
  };

  root.querySelectorAll(".settings-section").forEach((section) => {
    const editBtn = section.querySelector("[data-edit-toggle]");
    const saveBtn = section.querySelector("[data-save-toggle]");
    const cancelBtn = section.querySelector("[data-cancel-toggle]");

    // 无编辑按钮的页签（例如“数据版本”）保持始终可用，不参与锁定策略
    if (!editBtn) return;

    lockSection(section);
    editBtn.addEventListener("click", () => unlockSection(section));
    saveBtn?.addEventListener("click", () => lockSection(section));
    cancelBtn?.addEventListener("click", () => lockSection(section));
  });

  const navItems = root.querySelectorAll(".settings-nav__item[data-settings-tab]");
  const panels = root.querySelectorAll(".settings-section[data-settings-panel]");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.settingsTab;
      navItems.forEach((n) => n.classList.remove("is-active"));
      item.classList.add("is-active");
      panels.forEach((p) => {
        p.classList.toggle("is-active", p.dataset.settingsPanel === target);
      });
      if (target === "did-settings") renderDidTable();
    });
  });

  const verCurrent = document.getElementById("ver-current");
  const verRemote = document.getElementById("ver-remote");
  const cloudVersionList = document.getElementById("cloud-version-list");
  const btnFetchCloudVer = document.getElementById("btn-fetch-cloud-ver");
  const btnCheckVer = document.getElementById("btn-check-ver");
  const btnUpdateVer = document.getElementById("btn-update-ver");
  let currentVersion = "V2.1.0";
  const MOCK_REMOTE_VERSIONS = ["V2.3.0", "V2.2.3", "V2.2.2", "V2.1.9"];
  let fetchedCloudVersions = [];
  let selectedCloudVersion = "";

  const syncUpdateButtonState = () => {
    if (!btnUpdateVer) return;
    btnUpdateVer.disabled = !selectedCloudVersion || selectedCloudVersion === currentVersion;
  };

  const renderCloudVersions = () => {
    if (!cloudVersionList) return;
    if (!fetchedCloudVersions.length) {
      cloudVersionList.innerHTML = '<div class="settings-version-val">暂无云端版本数据，请先获取。</div>';
      return;
    }
    cloudVersionList.innerHTML = fetchedCloudVersions
      .map((version) => (
        `<label class="settings-radio" style="margin-right:16px;">
          <input type="radio" name="cloud-version-choice" value="${version}" ${version === selectedCloudVersion ? "checked" : ""} />
          ${version}
        </label>`
      ))
      .join("");
  };

  cloudVersionList?.addEventListener("change", (event) => {
    if (event.target?.name !== "cloud-version-choice") return;
    selectedCloudVersion = event.target.value;
    if (verRemote) {
      verRemote.textContent = selectedCloudVersion;
      verRemote.className = "settings-version-val " +
        (selectedCloudVersion === currentVersion ? "settings-version-val--same" : "settings-version-val--new");
    }
    syncUpdateButtonState();
  });

  btnFetchCloudVer?.addEventListener("click", () => {
    btnFetchCloudVer.disabled = true;
    btnFetchCloudVer.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>获取中…';
    setTimeout(() => {
      fetchedCloudVersions = MOCK_REMOTE_VERSIONS.slice(0, 3);
      selectedCloudVersion = fetchedCloudVersions[0] || "";
      if (verRemote) {
        verRemote.textContent = selectedCloudVersion || "--";
        verRemote.className = "settings-version-val " +
          (selectedCloudVersion === currentVersion ? "settings-version-val--same" : "settings-version-val--new");
      }
      renderCloudVersions();
      syncUpdateButtonState();
      btnFetchCloudVer.disabled = false;
      btnFetchCloudVer.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i>获取云端版本';
    }, 900);
  });

  btnCheckVer?.addEventListener("click", () => {
    btnCheckVer.disabled = true;
    btnCheckVer.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>检查中…';
    setTimeout(() => {
      if (!selectedCloudVersion) {
        selectedCloudVersion = MOCK_REMOTE_VERSIONS[0];
      }
      if (verRemote) verRemote.textContent = selectedCloudVersion;
      const isSame = currentVersion === selectedCloudVersion;
      if (verRemote) {
        verRemote.className = "settings-version-val " +
          (isSame ? "settings-version-val--same" : "settings-version-val--new");
      }
      syncUpdateButtonState();
      btnCheckVer.disabled = false;
      btnCheckVer.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>检查数据';
    }, 1200);
  });

  btnUpdateVer?.addEventListener("click", () => {
    if (btnUpdateVer.disabled) return;
    const nextVersion = selectedCloudVersion || fetchedCloudVersions[0] || "";
    if (!nextVersion) return;
    btnUpdateVer.disabled = true;
    btnUpdateVer.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>更新中…';
    setTimeout(() => {
      currentVersion = nextVersion;
      if (verCurrent) verCurrent.textContent = currentVersion;
      if (verRemote) {
        verRemote.textContent = currentVersion;
        verRemote.className = "settings-version-val settings-version-val--same";
      }
      btnUpdateVer.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i>立即更新';
      syncUpdateButtonState();
      alert("数据已更新至 " + currentVersion);
    }, 2000);
  });

  root.querySelectorAll("[data-path-for]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inputId = btn.dataset.pathFor;
      const input = document.getElementById(inputId);
      if (!input) return;
      const newPath = prompt("请输入新的文件夹路径：", input.value);
      if (newPath === null) return;
      const trimmed = newPath.trim();
      if (!trimmed) {
        alert("路径不能为空。");
        return;
      }
      input.value = trimmed;
    });
  });


  // DID 设置逻辑
  const didState = {
    items: [
      { name: "应用软件版本", did: "F189", fixed: true },
      { name: "标定软件版本", did: "F1C0", fixed: true },
      { name: "底层软件版本", did: "F1C1", fixed: true },
    ],
  };

  const renderDidTable = () => {
    const tbody = document.getElementById("did-settings-tbody");
    if (!tbody) return;
    if (didState.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="settings-table__empty">暂无 DID 数据项</td></tr>';
      return;
    }
    tbody.innerHTML = didState.items
      .map((item, index) => `
        <tr>
          <td class="is-center">${index + 1}</td>
          <td>${item.name}</td>
          <td><code>${item.did}</code></td>
          <td class="is-center">
            ${item.fixed ? '<span style="color: #999; font-size: 11px;">固定</span>' : `
              <button class="settings-btn settings-btn--danger" type="button" data-action="delete-did" data-index="${index}">
                <i class="fa-regular fa-trash-can"></i>
              </button>
            `}
          </td>
        </tr>
      `)
      .join("");
  };

  const modalAddDid = document.getElementById("modal-add-did");
  const btnAddDid = document.getElementById("btn-add-did");
  const btnSubmitDid = document.getElementById("btn-submit-did");
  const didDescInput = document.getElementById("did-desc-input");
  const didValInput = document.getElementById("did-val-input");
  const didErrorMsg = document.getElementById("did-error-msg");

  btnAddDid?.addEventListener("click", () => {
    didDescInput.value = "";
    didValInput.value = "";
    didErrorMsg.style.display = "none";
    modalAddDid.classList.remove("is-hidden");
  });

  btnSubmitDid?.addEventListener("click", () => {
    const desc = didDescInput.value.trim();
    const val = didValInput.value.trim().toUpperCase();
    if (!desc) {
      didErrorMsg.textContent = "请输入 DID 描述";
      didErrorMsg.style.display = "block";
      return;
    }
    // 校验 4 位 16 进制
    if (!/^[0-9A-F]{4}$/.test(val)) {
      didErrorMsg.textContent = "DID 格式错误，必须为 4 位 16 进制数字 (如 F190)";
      didErrorMsg.style.display = "block";
      return;
    }
    
    didState.items.push({ name: desc, did: val, fixed: false });
    renderDidTable();
    modalAddDid.classList.add("is-hidden");
  });

  document.getElementById("did-settings-tbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="delete-did"]');
    if (!btn) return;
    const index = parseInt(btn.dataset.index);
    if (confirm("确认需要移除这些数据？")) {
      didState.items.splice(index, 1);
      renderDidTable();
    }
  });

  window.SettingsShared = window.SettingsShared || {};
  window.SettingsShared.getSingleDids = () => DEFAULT_SINGLE_DIDS.map((d) => ({ ...d }));
})();
