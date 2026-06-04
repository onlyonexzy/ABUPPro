import os
import re

path = 'd:/00_xzy/04_remoteDiag/GDTTools/assets/js/flash-config-sequence.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix the state object - explicitly insert the missing variables
state_match = re.search(r'const state = \{([\s\S]+?)\};', content)
if state_match:
    state_body = state_match.group(1)
    if 'parallelSteps' not in state_body:
        new_state_vars = """
    parallelSteps: [], // {id, name, segments: [{id, name, ecus: [ecuId, ...]}]}
    parallelAddStepName: "",
    parallelAddSegName: {}, // stepId -> input text
    parallelFilterText: "","""
        # Insert before collapsedGroups or at the end
        if 'collapsedGroups' in state_body:
            state_body = state_body.replace('collapsedGroups:', new_state_vars + '\n    collapsedGroups:')
        else:
            state_body += new_state_vars
        
        content = content.replace(state_match.group(1), state_body)

# 2. Clean up duplicate or old parallel logic if any
# The old preview logic used buildParallelStepsHtml. We should remove it if it's unused.
# But more importantly, ensure renderOverlay uses the correct tabs.
# Currently renderOverlay (lines 532-562) has:
# ${renderEcuConfigTab()}
# ${renderSerialSeqTab()}
# ${renderParallelSeqTab()}
# This is correct.

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
