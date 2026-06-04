import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/vehicle-flash.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update the package row rendering logic to highlight different versions in red
old_version_rendering = """                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">软件版本</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.softwareVersion)}</span>
                        </span>"""

new_version_rendering = """                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">软件版本</span>
                          <span class="vehicle-flash-child-inline__value" style="${(() => {
                            const pkgVer = String(pkg.softwareVersion || "").trim();
                            let currentVer = "--";
                            if (pkg.packageType === "应用") currentVer = row.f189;
                            else if (pkg.packageType === "引导") currentVer = row.f1c1;
                            else if (pkg.packageType === "标定") currentVer = row.f1c0;
                            currentVer = String(currentVer || "").trim();
                            return (pkgVer !== currentVer && currentVer !== "--") ? 'color: #ef4444; font-weight: 700;' : '';
                          })()}">${esc(pkg.softwareVersion)}</span>
                        </span>"""

content = content.replace(old_version_rendering, new_version_rendering)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
