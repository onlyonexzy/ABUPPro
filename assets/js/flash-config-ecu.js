(function () {
  const state = {
    editingEcuId: "",
    drafts: {},
  };

  const getDraft = (ecu) => state.drafts[ecu.id] || null;
  const isEditing = (ecu) => state.editingEcuId === ecu.id && !!getDraft(ecu);
  const cloneStrategyConfig = (ecu) => (
    window.FlashConfigEcuStrategyModule && typeof window.FlashConfigEcuStrategyModule.cloneConfig === "function"
      ? window.FlashConfigEcuStrategyModule.cloneConfig(ecu)
      : null
  );

  const createDraft = (bus, ecu) => ({
    busId: bus.id,
    frameFormat: ecu.frameFormat || "11bit",
    tpType: ecu.tpType || (bus.protocol === "ETH" ? "DoIP" : "ISO-TP"),
    tpData: ecu.tpData || "8",
    tpCycle: ecu.tpCycle || "0 ms",
    stmin: ecu.stmin || "0 ms",
    stminTx: ecu.stminTx || "0 ms",
    bs: ecu.bs || "8",
    p2Timeout: ecu.p2Timeout || "50 ms",
    gatewayDirectChannel: Boolean(ecu.gatewayDirectChannel),
    strategyConfig: cloneStrategyConfig(ecu),
  });

  const readonlyField = (label, value, esc) => `
    <label class="flash-config-form-item">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </label>
  `;

  const editableField = (label, field, value, esc, options) => `
    <label class="flash-config-form-item">
      <span>${esc(label)}</span>
      ${
        options
          ? `<select class="flash-config-select" data-role="ecu-field" data-field="${esc(field)}">
              ${options
                .map((option) => {
                  const optionValue = typeof option === "object" && option !== null ? option.value : option;
                  const optionLabel = typeof option === "object" && option !== null ? option.label : option;
                  return `<option value="${esc(optionValue)}" ${optionValue === value ? "selected" : ""}>${esc(optionLabel)}</option>`;
                })
                .join("")}
            </select>`
          : `<input class="flash-config-input" type="text" data-role="ecu-field" data-field="${esc(field)}" value="${esc(value)}" />`
      }
    </label>
  `;

  const checkboxField = (label, field, checked, esc, editing) => `
    <label class="flash-config-form-item">
      <span>${esc(label)}</span>
      <label class="flash-config-checkbox ${editing ? "" : "is-disabled"}">
        <input
          type="checkbox"
          data-role="ecu-field"
          data-field="${esc(field)}"
          ${checked ? "checked" : ""}
          ${editing ? "" : "disabled"}
        />
        <span>开启</span>
      </label>
    </label>
  `;

  const renderSubsection = (title, body) => `
    <div class="flash-config-ecu-subsection">
      <div class="flash-config-ecu-subsection__title">${title}</div>
      ${body}
    </div>
  `;

  const renderAttrPanel = ({ bus, ecu, esc, buses }) => {
    const draft = getDraft(ecu) || createDraft(bus, ecu);
    const editing = isEditing(ecu);
    const diagnosticFlowSection =
      window.FlashConfigEcuStrategyModule && typeof window.FlashConfigEcuStrategyModule.renderDiagnosticFlowSection === "function"
        ? window.FlashConfigEcuStrategyModule.renderDiagnosticFlowSection({
            ecu,
            esc,
            editing,
            config: draft.strategyConfig,
            embedded: true,
          })
        : "";
    const actions = `
      <div class="flash-config-sheet__actions">
        ${
          editing
            ? `
              <button class="flash-config-action-btn is-primary" type="button" data-role="save-ecu-attr">保存</button>
              <button class="flash-config-action-btn" type="button" data-role="cancel-ecu-attr">取消</button>
            `
            : `<button class="flash-config-action-btn is-primary" type="button" data-role="edit-ecu-attr">编辑</button>`
        }
      </div>
    `;

    const canShowGatewayDirectChannel = bus.protocol === "ETH" && !ecu.mirrorSourceProtocol;
    const formatFlashType = (type) => {
      const map = {
        'ETHBootloaderonIP_TypeI': 'ETHBootloaderonIP_TypeI（以太网34服务刷写）',
        'ETHBootloaderonIP_TypeII': 'ETHBootloaderonIP_TypeII（以太网38服务刷写）',
        'CANFBL_uncompressed': 'CANFBL_uncompressed（CAN非压缩刷写）',
        'CANFBL_compressed': 'CANFBL_compressed（CAN压缩格式刷写）'
      };
      return map[type] || type;
    };

    const baseRows = [
      readonlyField("ECU", ecu.shortName, esc),
      readonlyField("供应商编码", ecu.supplierCode || "--", esc),
      readonlyField("所属总线", bus.name, esc),
      readonlyField("刷写类型", formatFlashType(ecu.flashType), esc),
      canShowGatewayDirectChannel
        ? checkboxField("网关直连通道", "gatewayDirectChannel", draft.gatewayDirectChannel, esc, editing)
        : "",
    ].join("");

    const commRows =
      bus.protocol === "ETH"
        ? [
            readonlyField("逻辑地址", ecu.logicAddress, esc),
            readonlyField("功能寻址", ecu.functionAddress, esc),
            readonlyField("IP地址", ecu.ipAddress, esc),
          ]
        : [
            editing ? editableField("帧格式", "frameFormat", draft.frameFormat, esc, ["11bit", "29bit"]) : readonlyField("帧格式", ecu.frameFormat, esc),
            readonlyField("请求地址", ecu.requestId, esc),
            readonlyField("响应地址", ecu.responseId, esc),
            readonlyField("功能寻址", ecu.functionId, esc),
            readonlyField("逻辑地址", ecu.xotaLogicalAddress, esc),
            editing ? editableField("Stmin", "stmin", draft.stmin, esc) : readonlyField("Stmin", ecu.stmin || "--", esc),
            editing ? editableField("Stmin_Tx", "stminTx", draft.stminTx, esc) : readonlyField("Stmin_Tx", ecu.stminTx || "--", esc),
            editing ? editableField("BS", "bs", draft.bs, esc) : readonlyField("BS", ecu.bs || "--", esc),
            editing ? editableField("P2Timeout", "p2Timeout", draft.p2Timeout, esc) : readonlyField("P2Timeout", ecu.p2Timeout || "--", esc),
            readonlyField("CRC类型", ecu.crcType, esc),
          ];

    return `
      <div class="flash-config-detail-grid">
        <section class="flash-config-sheet flash-config-sheet--main">
          <div class="flash-config-sheet__title flash-config-sheet__title--with-actions">
            <span>基础信息</span>
            ${actions}
          </div>
          <div class="flash-config-ecu-sheet__body">
            <div class="flash-config-form-grid">${baseRows}</div>
            ${diagnosticFlowSection}
            ${renderSubsection("通讯参数", `<div class="flash-config-form-grid">${commRows.join("")}</div>`)}
          </div>
        </section>
      </div>
    `;
  };

  const renderInfoGrid = (rows, info) => `<div class="flash-config-info-grid">${info(rows)}</div>`;

  window.FlashConfigEcuModule = {
    render({ bus, ecu, activeTab, esc, panel, tabs, info, formatTime, buses }) {
      const saBody =
        window.FlashConfigEcuSaModule && typeof window.FlashConfigEcuSaModule.render === "function"
          ? window.FlashConfigEcuSaModule.render({ bus, ecu, esc })
          : panel("SA算法", renderInfoGrid([{ label: "算法来源", value: "待配置" }], info), "flash-config-sheet--main");
      const strategyBody =
        window.FlashConfigEcuStrategyModule && typeof window.FlashConfigEcuStrategyModule.render === "function"
          ? window.FlashConfigEcuStrategyModule.render({ bus, ecu, esc, info, formatTime, buses })
          : panel("单件策略", renderInfoGrid([{ label: "状态", value: "待配置" }], info), "flash-config-sheet--main");

      const body =
        activeTab === "ecu-sa"
          ? saBody
          : activeTab === "ecu-strategy"
            ? strategyBody
            : renderAttrPanel({ bus, ecu, esc, buses });

      return `
        <div class="flash-config-detail-head">
          <h2>${esc(ecu.shortName)}</h2>
        </div>
        ${tabs(
          [
            { key: "ecu-attr", label: "ECU参数" },
            { key: "ecu-sa", label: "SA算法" },
            { key: "ecu-strategy", label: "单件策略" },
          ],
          activeTab
        )}
        <div class="flash-config-detail-body">${body}</div>
      `;
    },

    bind({ root, bus, ecu, rerender, buses, activeTab }) {
      root.querySelector('[data-role="edit-ecu-attr"]')?.addEventListener("click", () => {
        state.editingEcuId = ecu.id;
        state.drafts[ecu.id] = createDraft(bus, ecu);
        rerender();
      });

      root.querySelector('[data-role="cancel-ecu-attr"]')?.addEventListener("click", () => {
        delete state.drafts[ecu.id];
        state.editingEcuId = "";
        rerender();
      });

      root.querySelector('[data-role="save-ecu-attr"]')?.addEventListener("click", () => {
        const draft = getDraft(ecu);
        if (!draft) return;
        ecu.gatewayDirectChannel = Boolean(draft.gatewayDirectChannel);
        if (bus.protocol !== "ETH") {
          ecu.frameFormat = draft.frameFormat;
        }
        ecu.tpType = draft.tpType;
        ecu.tpData = draft.tpData;
        ecu.tpCycle = draft.tpCycle;
        if (bus.protocol !== "ETH") {
          ecu.stmin = draft.stmin;
          ecu.stminTx = draft.stminTx;
          ecu.bs = draft.bs;
          ecu.p2Timeout = draft.p2Timeout;
        }
        if (draft.strategyConfig && window.FlashConfigEcuStrategyModule && typeof window.FlashConfigEcuStrategyModule.applyConfig === "function") {
          window.FlashConfigEcuStrategyModule.applyConfig(ecu, draft.strategyConfig);
        }
        delete state.drafts[ecu.id];
        state.editingEcuId = "";
        rerender();
      });

      root.querySelectorAll('[data-role="ecu-field"]').forEach((element) => {
        const handler = () => {
          const draft = getDraft(ecu);
          if (!draft) return;
          draft[element.dataset.field] = element.type === "checkbox" ? element.checked : element.value;
        };
        element.addEventListener("input", handler);
        element.addEventListener("change", handler);
      });

      if (activeTab === "ecu-sa" && window.FlashConfigEcuSaModule && typeof window.FlashConfigEcuSaModule.bind === "function") {
        window.FlashConfigEcuSaModule.bind({ root, bus, ecu, rerender });
      }

      if (
        activeTab === "ecu-attr"
        && window.FlashConfigEcuStrategyModule
        && typeof window.FlashConfigEcuStrategyModule.bindDiagnosticFlowSection === "function"
      ) {
        window.FlashConfigEcuStrategyModule.bindDiagnosticFlowSection({
          root,
          ecu,
          config: getDraft(ecu)?.strategyConfig || null,
          rerender,
          editable: isEditing(ecu),
        });
      }

      if (activeTab === "ecu-strategy" && window.FlashConfigEcuStrategyModule && typeof window.FlashConfigEcuStrategyModule.bind === "function") {
        window.FlashConfigEcuStrategyModule.bind({ root, bus, ecu, rerender, buses });
      }
    },
  };
})();
