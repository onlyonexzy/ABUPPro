import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Define global scroll restoration logic and fix scoping
# Remove the broken internal rerender definitions and move to a better structure

# Let's just fix bindOverlay and the Public API
new_bind_overlay = """
  let lastRoot = null;
  let lastRerenderCb = null;

  const performRerender = () => {
    if (!lastRoot || !lastRerenderCb) return;
    
    const stepList = lastRoot.querySelector('.arch-step-list');
    const ecuPool = lastRoot.querySelector('.arch-ecu-pool');
    const stepScroll = stepList ? stepList.scrollTop : 0;
    const poolScroll = ecuPool ? (ecuPool.parentElement ? ecuPool.parentElement.scrollTop : 0) : 0;

    lastRerenderCb();

    requestAnimationFrame(() => {
      const newStepList = lastRoot.querySelector('.arch-step-list');
      const newEcuPool = lastRoot.querySelector('.arch-ecu-pool');
      if (newStepList) newStepList.scrollTop = stepScroll;
      if (newEcuPool && newEcuPool.parentElement) newEcuPool.parentElement.scrollTop = poolScroll;
    });
  };

  const bindOverlay = (root, rerenderCb) => {
    if (!state.open) return;
    lastRoot = root;
    lastRerenderCb = rerenderCb;
    state.rerender = performRerender;
"""

# Replace bindOverlay implementation
content = re.sub(r'const bindOverlay = \(root, rerenderCb\) => \{[\s\S]+?const rerender = wrappedRerender;', new_bind_overlay, content)

# Replace all calls to rerender() with performRerender() inside bindOverlay
# Wait, I can just name it rerender instead of performRerender
content = content.replace('performRerender', 'rerender')

# Fix FlashConfigSequenceModule.open
content = content.replace(
    'open: (rerenderCb) => {\n      state.rerender = rerender;\n      state.open = true;\n      initDraft();\n      rerender();\n    },',
    'open: (rerenderCb) => {\n      lastRerenderCb = rerenderCb;\n      state.open = true;\n      initDraft();\n      rerenderCb();\n    },'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
