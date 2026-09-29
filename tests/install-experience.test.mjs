import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './helpers/bundle.mjs';
const { installEnvironment, canSuggestInstall, installReminderRoute } = await bundle("export * from './lib/install-experience';");
void test('Install guidance detects iPhone, desktop-mode iPad, Android and embedded browsers', () => {
  assert.deepEqual(installEnvironment('iPhone Safari','iPhone',1),{device:'ios',embedded:false});
  assert.deepEqual(installEnvironment('Macintosh Safari','MacIntel',5),{device:'ios',embedded:false});
  assert.deepEqual(installEnvironment('iPhone KAKAOTALK','iPhone',1),{device:'ios',embedded:true});
  assert.deepEqual(installEnvironment('Android; wv) Chrome','Linux',1),{device:'android',embedded:true});
  assert.deepEqual(installEnvironment('Android Chrome','Linux',1),{device:'android',embedded:false});
  assert.deepEqual(installEnvironment('Macintosh Chrome','MacIntel',0),{device:'desktop',embedded:false});
});
void test('A reminder never nags first visits, reloads, recent reminders or dismissed visitors', () => {
  const now=2_000_000_000;
  assert.equal(canSuggestInstall(0,0,now,false),false);
  assert.equal(canSuggestInstall(now-1000,0,now,false),false);
  assert.equal(canSuggestInstall(now-1800_000,0,now,false),true);
  assert.equal(canSuggestInstall(now-1800_000,now-86400_000,now,false),false);
  assert.equal(canSuggestInstall(now-1800_000,now-7*86400_000,now,false),true);
  assert.equal(canSuggestInstall(now-1800_000,0,now,true),false);
  assert.equal(canSuggestInstall(NaN,NaN,now,false),false);
});
void test('Installation reminders stay away from wallet handoffs and sign-in flows', () => {
  for (const path of ['/install','/wallet/connect/id','/admin/community']) assert.equal(installReminderRoute(path,''),false);
  for (const query of ['?join=1','?float_handoff=id','?float_wallet=backpack']) assert.equal(installReminderRoute('/',query),false);
  assert.equal(installReminderRoute('/markets',''),true);
});
