import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/vehicle-flash.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the "刷写包名" field from the package row
old_pkg_name_block = """                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">刷写包名</span>
                          <span class="vehicle-flash-child-inline__value" title="${esc(pkg.name)}">${esc(pkg.name)}</span>
                        </span>"""

content = content.replace(old_pkg_name_block, "")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
