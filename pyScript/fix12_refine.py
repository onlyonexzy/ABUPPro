import os

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Refine scroll restoration
content = content.replace(
    '    state.rerender = rerenderCb;',
    '    state.rerender = rerender;'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
