import '../style.css';
import './studio.css';
import { RACES, type TeamColor } from '@sw/data';
import { loadFonts } from '../ui/font';
import { applySkin, skin } from '../ui/skin';
import { CURSOR_KINDS, cursorImage, SCROLL_DIRS } from '../ui/cursors';
import { flagHtml } from '../ui/flags';

const root = document.getElementById('studio')!;

async function main(): Promise<void> {
  await loadFonts();
  const k = window.devicePixelRatio >= 2 ? 1.5 : 2;
  document.documentElement.style.setProperty('--k', String(k));
  const sample = 'Шардфол: Ґанок, їжак, Йорж. The quick brown fox ◆ 700 ☠☠☠ ✓';
  let html = `<section><h2>Шрифт</h2><p>${sample}</p><p><b>${sample}</b></p><p style="font-size: var(--t2)"><b>SHARDFALL Ремастер</b></p></section>`;
  const colors: [TeamColor, TeamColor][] = [['white', 'olive'], ['cyan', 'white'], ['red', 'white'], ['crimson', 'lime']];
  for (const race of RACES)
    for (const [c, c2] of colors)
      html += `<div class="frame demo" data-skin="${race}/${c}/${c2}"><b class="title">${race} · ${c}</b><p class="info">Міцність 300/300 · їде</p>
        <div class="buttons"><button>Звичайна</button><button class="active">Вибрана</button><button class="primary">Почати</button><button disabled>Вимкнена</button></div></div>`;
  html += '<section><h2>Курсори</h2>';
  for (const race of RACES) {
    html += '<div>';
    for (const k of CURSOR_KINDS) html += `<img class="cur" src="${cursorImage(race, 'red', k)}">`;
    for (const d of SCROLL_DIRS) html += `<img class="cur" src="${cursorImage(race, 'red', 'scroll', d)}">`;
    html += '</div>';
  }
  html += `</section><section><h2>Прапорці</h2><span class="lang">${flagHtml('uk')} Українська</span> <span class="lang">${flagHtml('en')} English</span></section>`;
  root.innerHTML = html;
  root.querySelectorAll<HTMLElement>('[data-skin]').forEach((el) => {
    const [r, c, c2] = el.dataset.skin!.split('/') as [never, TeamColor, TeamColor];
    applySkin(el, skin(r, c, c2));
  });
  document.body.dataset.ready = 'true';
}
void main();
