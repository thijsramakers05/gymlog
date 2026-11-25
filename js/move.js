// Verhuismelding: de app staat sinds versie 1.3.0 op https://gymbie.github.io/.
// Alleen zichtbaar op het oude adres (thijsramakers05.github.io/gymlog/).
import { t } from './i18n.js';
import { icon } from './util.js';
import { setNotice } from './core.js';
import { loggedIn } from './cloud.js';

export const NEW_URL = 'https://gymbie.github.io/';
const OLD_HOST = 'thijsramakers05.github.io';

export function moveNotice() {
  const acc = loggedIn();
  return `<div class="move-banner">${icon('info')}<div class="mb-body"><b>${t('movedTitle')}</b>
    <p>${acc ? t('movedTextAcc') : t('movedTextNoAcc')}</p>
    <div class="mb-btns"><a class="btn small primary" href="${NEW_URL}" target="_blank" rel="noopener">${t('movedOpen')}</a>${acc ? '' : `<button class="btn small secondary" data-a="go" data-to="account">${t('movedMakeAccount')}</button>`}</div></div></div>`;
}

export function initMoveNotice() {
  if (location.hostname === OLD_HOST) setNotice(moveNotice);
}
