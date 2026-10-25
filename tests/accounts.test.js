'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { createAccountStore, updateElo, BOT_PROFILES } = require('../server/accounts.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-accounts-')), file = path.join(dir, 'accounts.json');
(async () => {
try {
  const store = createAccountStore({ file, now: () => 1700000000000 });
  const a = (await store.create({ email: 'a@example.com', password: 'long-password-123', username: 'Player_A' }));
  assert(a.ok && a.user.rating === 1000 && a.user.coins === 0 && a.token);
  assert(!(await store.create({ email: 'A@example.com', password: 'long-password-123', username: 'Other' })).ok);
  assert(!(await store.create({ email: 'bad', password: 'long-password-123', username: 'Other' })).ok);
  assert(!(await store.create({ email: 'b@example.com', password: 'short', username: 'Other' })).ok);
  const login = (await store.login({ email: 'A@example.com', password: 'long-password-123' })); assert(login.ok);
  assert(!(await store.login({ email: 'a@example.com', password: 'wrong-password' })).ok);
  assert(store.authenticate(login.token).id === a.user.id);
  assert(store.updateProfile(login.token, { bio: 'NORI player', avatar: '', username: 'Player Alpha' }).ok);
  assert(!store.updateProfile(login.token, { bio: 'x'.repeat(241) }).ok);
  const b = (await store.create({ email: 'b@example.com', password: 'long-password-456', username: 'Player_B' })); assert(b.ok);
  const result = store.recordRatedResult(login.token, b.token, 1); assert(result.ok && result.a.rating > 1000 && result.b.rating < 1000);
  assert.equal(updateElo(1000, 1000, 0.5).a, 1000);
  assert.equal(store.listBots().length, 20); assert.equal(BOT_PROFILES.length, 20);
  assert.equal(new Set(BOT_PROFILES.map(x => x.id)).size, 20, 'bot IDs must be unique');
  assert.equal(new Set(BOT_PROFILES.map(x => x.name)).size, 20, 'bot names must be unique');
  assert(BOT_PROFILES.every(x => x.monologue && x.bio && x.rating > 0 && x.coins >= 0));
  assert(new Set(BOT_PROFILES.map(x => x.avgWeight)).size > 1, 'profiles should vary their AI tuning');
  const google = store.loginWithGoogle({ sub: 'google-sub-001', email: 'google@example.com', email_verified: true, name: 'Google Player' }); assert(google.ok && google.created);
  const googleAgain = store.loginWithGoogle({ sub: 'google-sub-001', email: 'google@example.com', email_verified: true, name: 'Google Player' }); assert(googleAgain.ok && !googleAgain.created && googleAgain.user.id === google.user.id);
  assert(!store.loginWithGoogle({ sub: 'google-sub-002', email: 'unverified@example.com', email_verified: false, name: 'No Verify' }).ok);
  assert(!(await store.login({ email: 'google@example.com', password: 'long-password-xyz' })).ok);
  store.flush();
  const reopened = createAccountStore({ file, now: () => 1700000000000 }); assert(reopened.authenticate(login.token));
  assert(reopened.logout(login.token)); assert.equal(reopened.authenticate(login.token), null);
  console.log('accounts.test.js: Google OAuth account foundation and 20-bot catalog assertions passed');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
