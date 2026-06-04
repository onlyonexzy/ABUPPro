import os

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Implement scroll restoration in bindOverlay
# 1. Define the wrapper inside bindOverlay
# 2. Use it instead of rerenderCb

scroll_logic = """
  const bindOverlay = (root, rerenderCb) => {
    if (!state.open) return;
    state.rerender = rerenderCb;

    // --- Scroll Restoration Logic ---
    const wrappedRerender = () => {
      const stepList = root.querySelector('.arch-step-list');
      const ecuPool = root.querySelector('.arch-ecu-pool');
      const stepScroll = stepList ? stepList.scrollTop : 0;
      const poolScroll = ecuPool ? ecuPool.parentElement.scrollTop : 0; // The .arch-panel-content is usually the scroll container for pool

      rerenderCb();

      requestAnimationFrame(() => {
        const newStepList = root.querySelector('.arch-step-list');
        const newEcuPool = root.querySelector('.arch-ecu-pool');
        if (newStepList) newStepList.scrollTop = stepScroll;
        if (newEcuPool) newEcuPool.parentElement.scrollTop = poolScroll;
      });
    };
    const rerender = wrappedRerender;
"""

content = content.replace(
    '  const bindOverlay = (root, rerenderCb) => {\n    if (!state.open) return;\n    state.rerender = rerenderCb;',
    scroll_logic
)

# Now replace all rerenderCb() calls inside bindOverlay with rerender()
# Note: I need to be careful not to replace it in the public API or other places if not needed.
# Actually, inside bindOverlay, it's mostly rerenderCb().

# Let's use regex to replace rerenderCb() with rerender() ONLY inside the bindOverlay function body.
# Wait, I already added 'const rerender = wrappedRerender;' so if I just replace 'rerenderCb()' with 'rerender()' it should work.

# First, replace the simple ones
content = content.replace('rerenderCb();', 'rerender();')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
