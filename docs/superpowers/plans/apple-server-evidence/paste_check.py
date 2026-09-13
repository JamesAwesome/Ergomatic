#!/usr/bin/env python3
"""Round-trip complete plan patches through an exclusively owned clean worktree."""
import argparse,pathlib,re,subprocess
p=argparse.ArgumentParser();p.add_argument('plan',type=pathlib.Path);p.add_argument('worktree',type=pathlib.Path);a=p.parse_args()
root=a.worktree.resolve()
if subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip(): raise SystemExit('Worktree must be clean before paste-check')
patches=re.findall(r'<!-- candidate-patch:\d+ -->\n```diff\n(.*?)```',a.plan.read_text(),re.S)
if not patches: raise SystemExit('No complete patches found')
patch=''.join(patches).encode()
subprocess.run(['git','apply','--reverse','--check','-'],cwd=root,input=patch,check=True)
subprocess.run(['git','apply','--reverse','-'],cwd=root,input=patch,check=True)
try: subprocess.run(['git','apply','-'],cwd=root,input=patch,check=True)
except BaseException: raise SystemExit('Reapply failed; source needs restoration from the recorded clean HEAD')
subprocess.run(['git','diff','--exit-code'],cwd=root,check=True)
print('Plan patches extracted to their real paths and byte-identical to committed candidate.')
