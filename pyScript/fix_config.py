import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the detail pane content back to the original
content = content.replace(
    "${state.selected.type==='sequence'?(window.FlashConfigSequenceModule?.render?.()??''):(b?(state.selected.type==='ecu'&&e?ecuDetail(b,e):busDetail(b)):'')}",
    "${b?(state.selected.type==='ecu'&&e?ecuDetail(b,e):busDetail(b)):''}"
)

# Replace the renderOverlay injection at the end of root.innerHTML
content = content.replace(
    "${window.FlashConfigArchitectureModule?.renderOverlay?.()??''}${window.FlashConfigParallelModule?.renderOverlay?.()??''}`;",
    "${window.FlashConfigSequenceModule?.renderOverlay?.()??''}${window.FlashConfigArchitectureModule?.renderOverlay?.()??''}${window.FlashConfigParallelModule?.renderOverlay?.()??''}`;"
)

# Change the click handler for open-sequence-config back to opening the modal
content = content.replace(
    "root.querySelector('[data-role=\"open-sequence-config\"]')?.addEventListener('click',()=>{state.selected={type:'sequence',busId:'',ecuId:''};window.FlashConfigSequenceModule?.init?.();render();});",
    "root.querySelector('[data-role=\"open-sequence-config\"]')?.addEventListener('click',()=>{window.FlashConfigSequenceModule?.open(render);});"
)

# Replace the sequence bindOverlay call
content = content.replace(
    "if(state.selected.type==='sequence'&&window.FlashConfigSequenceModule&&typeof window.FlashConfigSequenceModule.bind==='function'){window.FlashConfigSequenceModule.bind({root,rerender:render});}",
    "window.FlashConfigSequenceModule?.bindOverlay?.(root,render);"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
