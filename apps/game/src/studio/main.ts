import '../style.css';
import './studio.css';
import { RACES, type TeamColor } from '@sw/data';
import { loadFonts } from '../ui/font';
import { applySkin, skin } from '../ui/skin';
import { CURSOR_KINDS, cursorImage, SCROLL_DIRS } from '../ui/cursors';
import { flagHtml } from '../ui/flags';
import { battleScene, outcomeScene, portrait } from '../ui/scene3d';

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
  const kinds = ['harvester', 'light_tank', 'middle_tank', 'heavy_tank', 'defender', 'hq', 'silo', 'factory', 'wall'];
  let ph = '<section><h2>Портрети</h2>';
  for (const race of RACES) ph += `<div>${kinds.map((k) => `<img class="portrait" src="${portrait({ race, color: 'red', color2: 'white' }, k)}">`).join('')}</div>`;
  ph += '</section><section><h2>Сцени</h2><canvas class="scene" id="sc1"></canvas><canvas class="scene" id="sc2"></canvas><canvas class="scene" id="sc3"></canvas></section>';
  root.insertAdjacentHTML('beforeend', ph);
  const own = { race: 'walker', color: 'blue', color2: 'white' } as const;
  const foe = { race: 'hover', color: 'red', color2: 'white' } as const;
  await outcomeScene(document.getElementById('sc1') as HTMLCanvasElement, { won: true, own, foe, ground: 'sand', forest: true });
  await outcomeScene(document.getElementById('sc2') as HTMLCanvasElement, { won: false, own, foe, ground: 'sand', forest: true });
  await battleScene(document.getElementById('sc3') as HTMLCanvasElement, { race: 'human', color: 'white', color2: 'olive' }, foe);
  document.body.dataset.ready = 'true';
}
void main();
