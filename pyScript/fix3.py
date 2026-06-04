import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '<div class="seq-ecu-item" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px;">',
    '<div class="seq-ecu-item" style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; padding:8px 12px;">'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("JS updated")

path_css = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/css/flash-config-sequence.css'
with open(path_css, 'r', encoding='utf-8') as f:
    content_css = f.read()

content_css = content_css.replace(
    'padding: 8px 12px; display: flex; flex-direction: column; gap: 6px;',
    'padding: 8px 12px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 6px;'
)

with open(path_css, 'w', encoding='utf-8') as f:
    f.write(content_css)

print("CSS updated")
