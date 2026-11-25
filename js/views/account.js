// Account: inloggen, account maken, wachtwoord vergeten, uitloggen, account verwijderen.
import { A, registerView, render, go, route } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon } from '../util.js';
import { navBar } from './shared.js';
import * as cloud from '../cloud.js';
import * as fr from '../friends.js';
import { confirmDialog, promptText, toast } from '../ui.js';

A.shareToggle = async (el) => {
  const k = el.dataset.k;
  const share = { ...fr.DEFAULT_SHARE, ...(fr.F.profile.share || {}) };
  share[k] = !share[k];
  el.querySelector('.switch').classList.toggle('on', share[k]);
  try { await fr.updateProfile({ share }); } catch (e) { toast(cloud.errorText(e)); }
  render();
};
A.unChange = async () => {
  const v = await promptText({ title: t('changeUsername'), text: t('usernameHint'), value: fr.F.profile.username });
  if (v == null) return;
  const name = v.trim().replace(/^@/, '').toLowerCase();
  if (name === fr.F.profile.username) return;
  if (!/^[a-z0-9_.]{3,20}$/.test(name)) { toast(t('usernameInvalid')); return; }
  try { await fr.updateProfile({ username: name }); toast(t('usernameSaved', { name }), 'check'); } catch (e) { toast(e.code === 'username_taken' ? t('usernameTaken') : cloud.errorText(e)); }
  render();
};
A.dnChange = async () => {
  const v = await promptText({ title: t('changeDisplayName'), value: fr.F.profile.display_name || '', placeholder: t('displayNamePh') });
  if (v == null) return;
  try { await fr.updateProfile({ display_name: v.trim().slice(0, 40) || null }); } catch (e) { toast(cloud.errorText(e)); }
  render();
};

let mode = 'login';
let msg = null; // { ok, text }
let busy = false;
let email = '';

function formHTML() {
  const login = mode === 'login';
  return `${navBar({ title: t('account') })}
    <div class="card acc-intro">${icon('cloud')}<p>${t('accIntro')}</p></div>
    <div class="seg"><button class="${login ? 'on' : ''}" data-a="accMode" data-m="login">${t('login')}</button><button class="${login ? '' : 'on'}" data-a="accMode" data-m="signup">${t('signup')}</button></div>
    <form class="card acc-form" data-form="acc" novalidate>
      <label class="field"><span>${t('email')}</span><input id="acc-email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(email)}" placeholder="naam@voorbeeld.nl"></label>
      <label class="field"><span>${t('password')}</span><input id="acc-pw" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="${login ? '' : t('pwMin')}"></label>
      ${msg ? `<p class="${msg.ok ? 'ok-box' : 'error-box'}">${icon(msg.ok ? 'check' : 'warn', 'sm')}<span>${esc(msg.text)}</span></p>` : ''}
      <button type="submit" class="btn primary btn-block" data-a="accSubmit" ${busy ? 'disabled' : ''}>${busy ? t('busy') : login ? t('login') : t('signupBtn')}</button>
      ${login ? `<button type="button" class="link acc-forgot" data-a="accForgot">${t('forgotPw')}</button>` : ''}
    </form>
    <p class="hint">${t('accPrivacy')}</p>`;
}

const SHARE_LABELS = {
  sessions: ['shareSessions', 'shareSessionsSub'],
  templates: ['shareTemplates', null],
  meta: ['shareMeta', 'shareMetaSub'],
  photos: ['sharePhotos', null],
  bodyweight: ['shareBodyweight', null],
};

function friendsSettingsHTML() {
  const F = fr.F;
  const head = `<h2 class="list-h">${t('friendsSettings')}</h2>`;
  if (F.profile === undefined) {
    if (!F.loading && !F.error) fr.loadAll().then(() => { if (route.name === 'account') render(); });
    return `${head}<p class="muted small pad-s">${F.error ? esc(t('friendsOffline')) : t('loading')}</p>`;
  }
  if (!F.profile) {
    return `${head}<div class="list-card"><button class="list-row" data-a="go" data-to="friends">${icon('user')}<span class="lr-main">${t('chooseUsername')}<small>${t('setUsernameFirst')}</small></span>${icon('chevR', 'sm muted')}</button></div>`;
  }
  const share = { ...fr.DEFAULT_SHARE, ...(F.profile.share || {}) };
  return `${head}<div class="list-card">
      <button class="list-row" data-a="unChange">${icon('user')}<span class="lr-main">@${esc(F.profile.username)}<small>${t('changeUsername')}</small></span>${icon('chevR', 'sm muted')}</button>
      <button class="list-row" data-a="dnChange">${icon('note')}<span class="lr-main">${esc(F.profile.display_name || t('noDisplayName'))}<small>${t('changeDisplayName')}</small></span>${icon('chevR', 'sm muted')}</button>
    </div>
    <h2 class="list-h">${t('privacyTitle')}</h2>
    <div class="list-card">${fr.SHARE_KEYS.map((k) => {
      const [lbl, sub] = SHARE_LABELS[k];
      return `<button class="list-row" data-a="shareToggle" data-k="${k}"><span class="lr-main">${t(lbl)}${sub ? `<small>${t(sub)}</small>` : ''}</span><span class="switch ${share[k] ? 'on' : ''}"></span></button>`;
    }).join('')}</div>
    <p class="hint">${t('privacyHint')}</p>`;
}

function accountHTML() {
  return `${navBar({ title: t('account') })}
    <div class="card acc-card">
      <div class="acc-avatar">${icon('user')}</div>
      <div class="acc-email">${esc(cloud.userEmail())}</div>
      <div class="muted small" data-sync-status>${esc(cloud.statusText())}</div>
      <button class="btn secondary btn-block" data-a="accSync">${icon('refresh', 'sm')} ${t('syncNow')}</button>
    </div>
    <p class="hint">${t('accSyncInfo')}</p>
    ${friendsSettingsHTML()}
    <h2 class="list-h">${t('account')}</h2>
    <div class="list-card">
      <button class="list-row" data-a="accLogout">${icon('logout')}<span class="lr-main">${t('logout')}<small>${t('logoutSub')}</small></span></button>
      <button class="list-row danger" data-a="accDelete">${icon('trash')}<span class="lr-main">${t('deleteAccount')}<small>${t('deleteAccountSub')}</small></span></button>
    </div>`;
}

registerView('account', () => (cloud.loggedIn() ? accountHTML() : formHTML()), { tab: 'profile' });

A.accMode = (el) => {
  const input = document.getElementById('acc-email');
  if (input) email = input.value.trim();
  mode = el.dataset.m;
  msg = null;
  render();
};

A.accSubmit = async () => {
  const em = document.getElementById('acc-email').value.trim();
  const pw = document.getElementById('acc-pw').value;
  email = em;
  if (!em || !pw) { msg = { text: t('fillBoth') }; render(); return; }
  if (mode === 'signup' && pw.length < 6) { msg = { text: t('errWeakPw') }; render(); return; }
  busy = true;
  msg = null;
  render();
  try {
    if (mode === 'login') {
      await cloud.signIn(em, pw);
      toast(t('loggedIn'), 'check');
    } else {
      const r = await cloud.signUp(em, pw);
      if (r.confirm) { msg = { ok: true, text: t('confirmSent', { email: em }) }; mode = 'login'; } else toast(t('accountCreated'), 'check');
    }
  } catch (e) {
    msg = { text: cloud.errorText(e) };
  }
  busy = false;
  render();
};

A.accForgot = async () => {
  const em = document.getElementById('acc-email').value.trim();
  email = em;
  if (!em) { msg = { text: t('fillEmailFirst') }; render(); return; }
  try {
    await cloud.recover(em);
    msg = { ok: true, text: t('resetSent', { email: em }) };
  } catch (e) {
    msg = { text: cloud.errorText(e) };
  }
  render();
};

A.accSync = async () => {
  await cloud.syncNow();
  render();
};

A.accLogout = async () => {
  const ok = await confirmDialog({ title: t('logoutQ'), text: t('logoutText'), ok: t('logout') });
  if (!ok) return;
  await cloud.logout();
  msg = null;
  mode = 'login';
  render();
};

A.accDelete = async () => {
  const ok = await confirmDialog({ title: t('deleteAccountQ'), text: t('deleteAccountText'), ok: t('deleteAccount'), danger: true });
  if (!ok) return;
  const ok2 = await confirmDialog({ title: t('wipeQ2'), text: t('deleteAccountText2'), ok: t('deleteAccount'), danger: true });
  if (!ok2) return;
  try {
    await cloud.deleteAccount();
    toast(t('accountDeleted'), 'check');
  } catch (e) {
    toast(cloud.errorText(e));
  }
  render();
};

// ---------- Landingspagina voor links uit e-mails ----------
let linkMsg = null;
let seenLink = null;
registerView('auth-link', () => {
  const L = cloud.pendingLink;
  if (L !== seenLink) { seenLink = L; linkMsg = null; }
  const head = navBar({ title: t('account'), back: false });
  const home = `<button class="btn primary btn-block" data-a="linkHome">${t('toGymbie')}</button>`;
  if (!L) return `${head}<div class="card center pad">${home}</div>`;
  if (L.error || !L.token) {
    return `${head}<div class="card link-card">${icon('warn', 'lg')}<h3>${t('linkInvalid')}</h3><p class="muted">${esc(L.error || '')}</p>${home}</div>`;
  }
  if (L.type === 'recovery') {
    if (linkMsg && linkMsg.ok) return `${head}<div class="card link-card">${icon('check', 'lg')}<h3>${t('pwChanged')}</h3><p class="muted">${t('pwChangedText')}</p>${home}</div>`;
    return `${head}<form class="card acc-form" data-form="newpw" novalidate>
      <h3 class="card-h">${t('newPwTitle')}</h3>
      <label class="field"><span>${t('newPassword')}</span><input id="new-pw" type="password" autocomplete="new-password" placeholder="${t('pwMin')}"></label>
      ${linkMsg ? `<p class="error-box">${icon('warn', 'sm')}<span>${esc(linkMsg.text)}</span></p>` : ''}
      <button type="submit" class="btn primary btn-block" data-a="linkSetPw">${t('save')}</button></form>`;
  }
  return `${head}<div class="card link-card">${icon('check', 'lg')}<h3>${t('emailConfirmed')}</h3><p class="muted">${t('emailConfirmedText')}</p>${home}</div>`;
}, { tab: 'profile' });

A.linkSetPw = async () => {
  const pw = document.getElementById('new-pw').value;
  if (pw.length < 6) { linkMsg = { text: t('errWeakPw') }; render(); return; }
  try {
    await cloud.setPasswordFromLink(pw);
    linkMsg = { ok: true };
  } catch (e) {
    linkMsg = { text: cloud.errorText(e) };
  }
  render();
};

A.linkHome = () => go(cloud.loggedIn() ? 'home' : 'account', true);
