import os

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update renderSerialSeqTab to include search box
old_serial_tab_start = """    return `
      <div class="seq-tab-panel ${state.activeTab === 'serial-seq' ? 'is-active' : ''}" style="flex-direction: column; align-items: center;">
        <div class="seq-simple-list" style="width: 100%; max-width: 600px; display: flex; flex-direction: column; gap: 8px;">"""

new_serial_tab_start = """    return `
      <div class="seq-tab-panel ${state.activeTab === 'serial-seq' ? 'is-active' : ''}" style="flex-direction: column; align-items: center; gap: 12px;">
        <div class="seq-search-bar" style="position: relative; width: 100%; max-width: 600px;">
          <i class="fa-solid fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8;"></i>
          <input type="text" data-role="seq-search" placeholder="搜索串行列表中的 ECU..." style="width: 100%; padding: 8px 12px 8px 32px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#cbd5e1'">
        </div>
        <div class="seq-simple-list" style="width: 100%; max-width: 600px; display: flex; flex-direction: column; gap: 8px;">"""

content = content.replace(old_serial_tab_start, new_serial_tab_start)

# 2. Update search listener to target both item types
old_search_listener = """    root.querySelector('[data-role="seq-search"]')?.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      root.querySelectorAll('.seq-ecu-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(q)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    });"""

new_search_listener = """    root.querySelector('[data-role="seq-search"]')?.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      root.querySelectorAll('.seq-ecu-item, .seq-simple-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });"""

content = content.replace(old_search_listener, new_search_listener)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
