#!/usr/bin/env python3
"""Run deciding-source mutations against the committed, isolated server candidate."""
import argparse, json, os, pathlib, re, subprocess
parser=argparse.ArgumentParser()
parser.add_argument('worktree',type=pathlib.Path)
parser.add_argument('--output',type=pathlib.Path,required=True)
parser.add_argument('--only')
args=parser.parse_args()
root=args.worktree.resolve(); app=root/'app'; args.output.mkdir(parents=True,exist_ok=True)
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
# The existing committed candidate is the restore authority. Never restore another agent's edit.
def case(name,file,old,new,project,test): return dict(name=name,file=file,old=old,new=new,project=project,test=test)
cases=[
case('signed-issuer-expiry','providers.ts','const { payload } = await jwtVerify(token, keys[c.provider], {\n      issuer:\n        c.provider === "apple"\n          ? "https://appleid.apple.com"\n          : ["https://accounts.google.com", "accounts.google.com"],\n      audience: clientId(c),\n      algorithms: ["RS256"],\n      requiredClaims: ["sub", "exp", "nonce"],\n    });','const payload = JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString()) as JWTPayload;','unit','providers.test.ts'),
case('signed-nonce-audience','providers.ts','payload.nonce !== c.nonce || payload.aud !== clientId(c)','false','unit','providers.test.ts'),
case('exchange-subject','providers.ts','initial && exchanged.sub !== initial.sub','false','unit','providers.test.ts'),
case('provider-state','providers.ts','proof.state !== c.state','false','unit','providers.test.ts'),
case('retained-grant','providers.ts','refreshToken: requiredText(result.refresh_token, 8192)','refreshToken: "corrupt"','unit','providers.test.ts'),
case('form-post-producer','providers.ts','params.response_mode = "form_post"','params.response_mode = "query"','unit','providers.test.ts'),
case('binding','attempts.ts','a.bindingHash !== hashToken(bindingSecret) || a.surface !== surface','false','integration','attempts.integration.test.ts'),
case('expiry-authority','attempts.ts','expires_at>now()','TRUE','integration','attempts.integration.test.ts'),
case('physical-cleanup','attempts.ts','DELETE FROM auth_attempts WHERE expires_at<=now()','SELECT id FROM auth_attempts WHERE expires_at<=now()','integration','attempts.integration.test.ts'),
case('grant-atomicity','attempts.ts','if (a.appleClientId && a.appleRefreshToken)','if (false)','integration','attempts.integration.test.ts'),
case('email-required','attempts.ts','if (!identity.emailVerified || !identity.email)','if (false)','integration','attempts.integration.test.ts'),
case('existing-proof-owner','attempts.ts','if (user?.id !== session.userId)','if (false)','integration','attempts.integration.test.ts'),
case('exact-session','attempts.ts','if (currentSessionId !== a.originalSessionId)','if (false)','integration','attempts.integration.test.ts'),
case('resident-cap','attempts.ts','if (count >= 512)','if (count >= 513)','integration','attempts.integration.test.ts'),
case('returning-subject-first','attempts.ts','if (user) return finishSignin(tx, a, user);','if (false && user) return finishSignin(tx, a, user);','integration','attempts.integration.test.ts'),
case('signup-conflict','attempts.ts',' ON CONFLICT(${column}) DO UPDATE SET ${column}=excluded.${column}','','integration','attempts.integration.test.ts'),
case('link-profile','attempts.ts','UPDATE users SET ${column}=$1 WHERE','UPDATE users SET name=\'corrupt\',email=\'corrupt\',${column}=$1 WHERE','integration','attempts.integration.test.ts'),
case('session-before-attempt-lock','attempts.ts','    if (expected.originalSessionId)\n      await original(tx, expected.originalSessionId, true);\n','', 'integration','attempts.integration.test.ts'),
case('callback-mount','../app.ts','"/api/auth/apple/callback",\n      noStore','"/api/auth/apple/callback-broken",\n      noStore','integration','frontDoorRoutes.integration.test.ts'),
case('callback-cancel-erasure','frontDoorRoutes.ts','if (!(await discard(a))) throw new AuthFailure("attempt_expired");','await Promise.resolve();','integration','frontDoorRoutes.integration.test.ts'),
case('web-token-projection','frontDoorRoutes.ts','return projection;','return s;','integration','frontDoorRoutes.integration.test.ts'),
case('legacy-open-admission','routes.ts','if (!frontDoor)\n      return signInWithClaims','if (true)\n      return signInWithClaims','integration','frontDoorRoutes.integration.test.ts'),
case('default-dark','../app.ts','frontDoorEnabled: Boolean(deps.frontDoor)','frontDoorEnabled: true','unit','frontDoor.test.ts'),
case('flag-literal','frontDoor.ts','if (env.FRONT_DOOR_ENABLED !== "1")','if (env.FRONT_DOOR_ENABLED === "1")','unit','frontDoor.test.ts'),
]
cases += [
case('valid-boot-key','frontDoor.ts','nativeClientId,\n      webClientId,','nativeClientId: "corrupt",\n      webClientId,','unit','frontDoor.test.ts'),
case('startup-sweep','frontDoor.ts','  await sweep();\n  const timer','  const timer','unit','frontDoor.test.ts'),
case('sweep-interval','frontDoor.ts','}, 60000);','}, 60001);','unit','frontDoor.test.ts'),
case('sweep-shutdown','frontDoor.ts','close: () => clearInterval(timer)','close: () => undefined','unit','frontDoor.test.ts'),
case('native-nonce-rotation','attempts.ts','nonce: random(),','nonce: a.nonce,','integration','frontDoorRoutes.integration.test.ts'),
case('native-input-bounds','frontDoorErrors.ts',' || !value.trim() || value.length > max','', 'integration','frontDoorRoutes.integration.test.ts'),
case('native-code-required','frontDoorRoutes.ts','attemptProvider(owned) === "apple" && !proof.authorizationCode','false', 'integration','frontDoorRoutes.integration.test.ts'),
case('native-cancel-erasure','attempts.ts','DELETE FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3','SELECT id FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3','integration','frontDoorRoutes.integration.test.ts'),
case('callback-provider-intent','frontDoorRoutes.ts','state !== a.state || attemptProvider(a) !== provider','state !== a.state','integration','frontDoorRoutes.integration.test.ts'),
case('old-callback-stage','frontDoorRoutes.ts','!["authorize", "reauth_authorize", "target_authorize"].includes(a.stage)','false','integration','frontDoorRoutes.integration.test.ts'),
case('reauth-freshness','attempts.ts','Date.now() - a.reauthenticatedAt.getTime() >= ttl','false','integration','attempts.integration.test.ts'),
]
cases += [
case('disabled-route-response','../app.ts','res.status(503).json({ error: "unavailable" });','res.status(200).json({ error: "unavailable" });','unit','frontDoor.test.ts'),
case('begin-shape','frontDoorRoutes.ts','(body.provider !== "apple" && body.provider !== "google") ||\n            (body.purpose !== "signin" && body.purpose !== "link")','false','integration','frontDoorRoutes.integration.test.ts'),
]
audience=case('signed-audience-both-guards','providers.ts','audience: clientId(c),','audience: undefined,','unit','providers.test.ts')
audience['also']=['payload.aud !== clientId(c)','false']
cases.append(audience)
cases += [
case('http-start-limit','frontDoorRoutes.ts','limit: 120,','limit: 121,','integration','frontDoorRoutes.integration.test.ts'),
case('legacy-native-start-charge','routes.ts','    router.post("/api/auth/native", frontDoor.admission);\n','','integration','frontDoorRoutes.integration.test.ts'),
case('legacy-web-start-charge','routes.ts','    router.get("/api/auth/signin", frontDoor.admission);\n','','integration','frontDoorRoutes.integration.test.ts'),
]
cases += [
case('failure-id-only-cleanup','attempts.ts','    async discard(expected: Attempt): Promise<boolean> {\n      const result = await pool.query(\n        `DELETE FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3 AND purpose=$4 AND target_provider=$5 AND existing_provider IS NOT DISTINCT FROM $6 AND stage=$7 AND version=$8 AND state=$9 AND nonce=$10 AND original_session_id IS NOT DISTINCT FROM $11`,\n        [\n          expected.id,\n          expected.bindingHash,\n          expected.surface,\n          expected.purpose,\n          expected.targetProvider,\n          expected.existingProvider,\n          expected.stage,\n          expected.version,\n          expected.state,\n          expected.nonce,\n          expected.originalSessionId,\n        ],\n      );\n      return result.rowCount === 1;\n    },\n','    async discard(expected: Attempt): Promise<boolean> {\n      const result = await pool.query("DELETE FROM auth_attempts WHERE id=$1", [expected.id]);\n      return result.rowCount === 1;\n    },\n','integration','frontDoorRoutes.integration.test.ts'),
case('failure-stale-cookie','frontDoorRoutes.ts','if (owned && (await discard(owned)))','if (owned && ((await discard(owned)) || true))','integration','frontDoorRoutes.integration.test.ts'),
case('failure-claimed-snapshot','frontDoorRoutes.ts','      owned = claimed;\n','','integration','frontDoorRoutes.integration.test.ts'),
case('native-failure-cleanup','frontDoorRoutes.ts','if (claimed) await discard(claimed);','if (false && claimed) await discard(claimed);','integration','frontDoorRoutes.integration.test.ts'),
case('failure-cleanup-error-cookie','frontDoorRoutes.ts','      return false;\n    }\n  }\n  async function callback','      return true;\n    }\n  }\n  async function callback','integration','frontDoorRoutes.integration.test.ts'),
case('lost-response-grant','attempts.ts','        await grant(tx, session.userId, a);','        await Promise.resolve();','integration','frontDoorRoutes.integration.test.ts'),
]
report=[]
for c in cases:
 if args.only and c["name"] != args.only: continue
 path=(app/'server/auth'/c['file']).resolve(); rel=path.relative_to(root).as_posix()
 original=subprocess.check_output(['git','show',f'{head}:{rel}'],cwd=root)
 if path.read_bytes()!=original: raise SystemExit(f'Refusing to overwrite uncommitted source: {rel}')
 text=original.decode();count=text.count(c['old'])
 if not count: raise SystemExit(f"Mutation anchor missing: {c['name']}")
 command=['pnpm','test','--project',c['project'],'server/auth/'+c['test']]
 try:
  changed=text.replace(c['old'],c['new'])
  if 'also' in c:
   assert c['also'][0] in changed
   changed=changed.replace(*c['also'])
  path.write_text(changed)
  result=subprocess.run(command,cwd=app,text=True,capture_output=True)
  log=result.stdout+result.stderr
  (args.output/(c['name']+'.log')).write_text(log)
  if result.returncode==0 or result.returncode<0 or 'Allocation failed' in log or not re.search(r'Tests\s+\d+ failed',log):
   raise SystemExit(f"Mutation did not produce an assertion failure: {c['name']} (exit {result.returncode})")
  report.append({'name':c['name'],'source':rel,'replacements':count,'command':command,'exit':result.returncode,'head':head,'failed_summary':re.findall(r'Tests\s+[^\n]+',log)})
  print(c['name']+': rejected',flush=True)
 finally: path.write_bytes(original)
(args.output/'mutations.json').write_text(json.dumps(report,indent=2)+'\n')
print('Restored all committed source bytes.',flush=True)
