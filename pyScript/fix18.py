import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/vehicle-flash.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update the package row rendering logic
old_inline_section = """                      <section class="vehicle-flash-child-inline">
                        <span class="vehicle-flash-child-inline__index">软件包 ${index + 1}</span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">包名</span>
                          <span class="vehicle-flash-child-inline__value" title="${esc(pkg.name)}">${esc(pkg.name)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">类型</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.packageType)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">刷写包大小</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.sizeMb)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">软件版本</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.softwareVersion)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">刷写次数</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.repeatCount)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">间隔(s)</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.intervalSec || "--")}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item vehicle-flash-child-inline__item--progress">
                          <span class="vehicle-flash-child-inline__label">进度</span>
                          <span class="vehicle-flash-child-inline__value">${renderProgressCell(
                            state.flashState.progressByKey[pkg.rowKey] || 0
                          )}</span>
                        </span>
                      </section>"""

new_inline_section = """                      <section class="vehicle-flash-child-inline">
                        <span class="vehicle-flash-child-inline__index">软件包 ${index + 1}</span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">刷写包名</span>
                          <span class="vehicle-flash-child-inline__value" title="${esc(pkg.name)}">${esc(pkg.name)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">软件版本</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.softwareVersion)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">类型</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.packageType)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">刷写包大小</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.sizeMb)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item">
                          <span class="vehicle-flash-child-inline__label">刷写后版本</span>
                          <span class="vehicle-flash-child-inline__value">${esc(pkg.softwareVersion)}</span>
                        </span>
                        <span class="vehicle-flash-child-inline__item vehicle-flash-child-inline__item--progress" style="flex: 1.5;">
                          <span class="vehicle-flash-child-inline__label">进度</span>
                          <span class="vehicle-flash-child-inline__value">${renderProgressCell(
                            state.flashState.progressByKey[pkg.rowKey] || 0
                          )}</span>
                        </span>
                      </section>"""

content = content.replace(old_inline_section, new_inline_section)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
