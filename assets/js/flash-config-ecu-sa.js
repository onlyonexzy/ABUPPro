(function () {
  const DEFAULT_SA_OPTIONS = [
    "1：GWM_SA（通用算法）",
    "2：SA UASE CWL",
    "3：SA_INV_LID",
  ];

  const DEFAULT_SA_FILES = {
    "1：GWM_SA（通用算法）": "GWM_SA.dll",
    "2：SA UASE CWL": "SA_UASE_CWL.dll",
    "3：SA_INV_LID": "SA_INV_LID.dll"
  };

  const getSaFileName = (opt) => DEFAULT_SA_FILES[opt] || "未找到文件";

  const DEFAULT_ROWS = [
    {
      key: "sa-1",
      name: "SA 1",
      level: "01/02",
      algorithmType: "4字节算法",
      mask: "FF FF FF 3F",
      source: "default",
      defaultAlgorithm: DEFAULT_SA_OPTIONS[0],
      customFile: "",
    },
    {
      key: "sa-2",
      name: "SA 2",
      level: "35/36",
      algorithmType: "16字节默认算法",
      mask: "",
      source: "cloud",
      defaultAlgorithm: "",
      customFile: "",
    },
    {
      key: "sa-3",
      name: "SA 3",
      level: "27/28",
      algorithmType: "16字节增强算法",
      mask: "",
      source: "cloud",
      defaultAlgorithm: "",
      customFile: "",
    },
  ];

  const state = {
    editingEcuId: "",
    drafts: {},
  };

  const is16Byte = (type) => type === "16字节默认算法" || type === "16字节增强算法";
  const hasMask = (type) => type === "4字节算法";

  const getRows = (ecu) => {
    if (!ecu.saAlgorithms || !ecu.saAlgorithms.length) {
      ecu.saAlgorithms = DEFAULT_ROWS.map((r) => ({ ...r }));
    }
    return ecu.saAlgorithms;
  };

  const getDraft = (ecu) => state.drafts[ecu.id] || null;
  const isEditing = (ecu) => state.editingEcuId === ecu.id && !!getDraft(ecu);
  const createDraft = (ecu) => getRows(ecu).map((row) => ({ ...row }));

  const readonlyField = (label, value, esc) => `
    <label class="flash-config-form-item">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </label>
  `;

  const renderSaRow = (row, index, editing, esc) => {
    const disabledAttr = editing ? "" : " disabled";

    // 算法等级（只读）
    const levelHtml = readonlyField("算法等级", row.level, esc);

    // 算法类型（只读）
    const typeHtml = readonlyField("算法类型", row.algorithmType, esc);

    // 算法掩码（仅4字节算法显示，只读）
    const maskHtml = hasMask(row.algorithmType)
      ? readonlyField("算法掩码", row.mask || "--", esc)
      : "";

    // 16字节算法 → 固定展示"云端计算"
    if (is16Byte(row.algorithmType)) {
      return `
        <section class="flash-config-sa-item">
          <div class="flash-config-sa-item__head">
            <strong>${esc(row.name)}</strong>
          </div>
          <div class="flash-config-sa-body">
            ${levelHtml}
            ${typeHtml}
            ${readonlyField("算法掩码", "--", esc)}
            ${readonlyField("算法来源", "云端计算", esc)}
          </div>
        </section>
      `;
    }

    // 4字节算法 → radio 选择来源
    const sourceDefaultChecked = row.source === "default" ? "checked" : "";
    const sourceCustomChecked = row.source === "custom" ? "checked" : "";

    const defaultAlgorithmSelect = row.source === "default"
      ? `<select class="flash-config-select flash-config-strategy-flow-select" data-role="sa-default-algorithm" data-index="${index}"${disabledAttr}>
          ${DEFAULT_SA_OPTIONS.map((opt) =>
            `<option value="${esc(opt)}" ${opt === row.defaultAlgorithm ? "selected" : ""}>${esc(opt)}</option>`
          ).join("")}
        </select>
        <span class="flash-config-strategy-file-label">${esc(getSaFileName(row.defaultAlgorithm))}</span>`
      : "";

    const customFileHtml = row.source === "custom"
      ? `
        <button class="flash-config-action-btn" type="button" data-role="pick-sa-file" data-index="${index}"${disabledAttr}>选择文件</button>
        <span class="flash-config-strategy-file-label">${esc(row.customFile || "未选择")}</span>
        <input type="file" accept=".dll,.so" hidden data-role="sa-file-input" data-index="${index}" />`
      : "";

    return `
      <section class="flash-config-sa-item">
        <div class="flash-config-sa-item__head">
          <strong>${esc(row.name)}</strong>
        </div>
        <div class="flash-config-sa-body">
          ${levelHtml}
          ${typeHtml}
          ${maskHtml}
          <label class="flash-config-form-item">
            <span>算法来源</span>
            <div class="flash-config-strategy-flow">
              <div class="flash-config-strategy-flow-row">
                <label class="flash-config-strategy-radio">
                  <input type="radio" name="sa-source-mode-${index}" value="default" ${sourceDefaultChecked} data-role="sa-source-mode" data-index="${index}"${disabledAttr} />
                  默认算法
                </label>
                ${defaultAlgorithmSelect}
              </div>
              <div class="flash-config-strategy-flow-row">
                <label class="flash-config-strategy-radio">
                  <input type="radio" name="sa-source-mode-${index}" value="custom" ${sourceCustomChecked} data-role="sa-source-mode" data-index="${index}"${disabledAttr} />
                  自选算法
                </label>
                ${customFileHtml}
              </div>
            </div>
          </label>
        </div>
      </section>
    `;
  };

  window.FlashConfigEcuSaModule = {
    render({ ecu, esc }) {
      const rows = getDraft(ecu) || getRows(ecu);
      const editing = isEditing(ecu);

      const actions = editing
        ? `
          <div class="flash-config-sheet__actions">
            <button class="flash-config-action-btn is-primary" type="button" data-role="save-ecu-sa">保存</button>
            <button class="flash-config-action-btn" type="button" data-role="cancel-ecu-sa">取消</button>
          </div>`
        : `
          <div class="flash-config-sheet__actions">
            <button class="flash-config-action-btn is-primary" type="button" data-role="edit-ecu-sa">编辑</button>
          </div>`;

      const rowsHtml = rows.map((row, index) => renderSaRow(row, index, editing, esc)).join("");

      return `
        <section class="flash-config-sheet flash-config-sheet--main">
          <div class="flash-config-sheet__title flash-config-sheet__title--with-actions">
            <span>SA算法</span>
            ${actions}
          </div>
          <div class="flash-config-sa-list">${rowsHtml}</div>
        </section>
      `;
    },

    bind({ root, ecu, rerender }) {
      root.querySelector('[data-role="edit-ecu-sa"]')?.addEventListener("click", () => {
        state.editingEcuId = ecu.id;
        state.drafts[ecu.id] = createDraft(ecu);
        rerender();
      });

      root.querySelector('[data-role="cancel-ecu-sa"]')?.addEventListener("click", () => {
        delete state.drafts[ecu.id];
        state.editingEcuId = "";
        rerender();
      });

      root.querySelector('[data-role="save-ecu-sa"]')?.addEventListener("click", () => {
        const draft = getDraft(ecu);
        if (!draft) return;
        ecu.saAlgorithms = draft.map((row) => ({ ...row }));
        delete state.drafts[ecu.id];
        state.editingEcuId = "";
        rerender();
      });

      // 算法来源 radio
      root.querySelectorAll('[data-role="sa-source-mode"]').forEach((el) => {
        el.addEventListener("change", () => {
          const draft = getDraft(ecu);
          if (!draft) return;
          const index = Number(el.dataset.index);
          if (!draft[index]) return;
          draft[index].source = el.value;
          rerender();
        });
      });

      // 默认算法下拉
      root.querySelectorAll('[data-role="sa-default-algorithm"]').forEach((el) => {
        el.addEventListener("change", () => {
          const draft = getDraft(ecu);
          if (!draft) return;
          const index = Number(el.dataset.index);
          if (!draft[index]) return;
          draft[index].defaultAlgorithm = el.value;
          rerender();
        });
      });

      // 自选算法文件
      root.querySelectorAll('[data-role="pick-sa-file"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const index = btn.dataset.index;
          root.querySelector(`[data-role="sa-file-input"][data-index="${index}"]`)?.click();
        });
      });

      root.querySelectorAll('[data-role="sa-file-input"]').forEach((input) => {
        input.addEventListener("change", () => {
          const draft = getDraft(ecu);
          if (!draft) return;
          const index = Number(input.dataset.index);
          const file = input.files?.[0];
          if (!draft[index] || !file) return;
          draft[index].customFile = file.name;
          rerender();
        });
      });
    },
  };
})();
