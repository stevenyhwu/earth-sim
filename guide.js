import { CHAPTERS, LESSONS, COMING } from './guide-lessons.js';
import { SIMS } from './guide-sims.js';

const $ = (id) => document.getElementById(id);
const KEY = 'earthsim.guide.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { done: [] }; } catch { return { done: [] }; } };
const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 私密瀏覽等情況存不了，沒關係 */ } };
let prog = load();
let currentSims = [];
const isPhone = () => matchMedia('(max-width: 900px)').matches;
const chName = (n) => `第${'一二三四五六七八九十'[n - 1]}章`;

function toc(activeId) {
  let h = '<a href="#" class="' + (activeId ? '' : 'on') + '"><span class="n">⌂</span>開始之前</a>';
  for (const ch of CHAPTERS) {
    h += `<div class="ch">${chName(ch.id)}・${ch.title}</div>`;
    LESSONS.forEach((l, i) => {
      if (l.chapter !== ch.id) return;
      const cls = [l.id === activeId ? 'on' : '', prog.done.includes(l.id) ? 'done' : ''].join(' ');
      h += `<a href="#${l.id}" class="${cls}"><span class="n">${i + 1}</span>${l.title}</a>`;
    });
    for (const c of COMING.filter((c) => c.chapter === ch.id)) h += `<div class="soon">${c.title}（製作中）</div>`;
  }
  $('toc').innerHTML = h;
  $('bar').style.width = `${(prog.done.length / (LESSONS.length + COMING.length)) * 100}%`;
}

function home() {
  const next = LESSONS.find((l) => !prog.done.includes(l.id)) || LESSONS[0];
  let cards = '';
  for (const ch of CHAPTERS) {
    cards += `<h3>${chName(ch.id)}・${ch.title}</h3><div class="cards">`;
    LESSONS.forEach((l, i) => {
      if (l.chapter === ch.id) cards += `<a class="card ${prog.done.includes(l.id) ? 'done' : ''}" href="#${l.id}"><small>第 ${i + 1} 課${prog.done.includes(l.id) ? '・看完了 ✓' : ''}</small>${l.title}</a>`;
    });
    for (const c of COMING.filter((c) => c.chapter === ch.id)) cards += `<div class="card soon"><small>製作中</small>${c.title}</div>`;
    cards += '</div>';
  }
  return `<div class="home">
    <div class="kicker">學習指引</div>
    <h2>從「太陽是一盞燈」開始，一步一步看懂地球和太陽</h2>
    <p class="intro">這份指引會從最簡單的地方開始，一課只講一件事，最後讓你看懂模擬器上的每一個畫面。</p>
    <p>每一課都長這樣：</p>
    <ol class="steps">
      <li><b>一句話</b>先講答案</li>
      <li>用<b>一個生活比喻</b>幫你想像</li>
      <li>幾個<b>短步驟</b>說明怎麼回事</li>
      <li>一個可以用手指拖拖看的<b>小模擬</b></li>
      <li>想知道正確名詞和數字的話，打開<b>大人版補充</b></li>
      <li>最後一個按鈕，<b>帶你到真正的模擬器</b>裡看同一件事</li>
    </ol>
    <p>一課大約 3 分鐘。看完一課按「看懂了，下一課」，這台裝置會記住你看到哪裡。</p>
    <a class="start" href="#${next.id}">${prog.done.length ? '繼續上次的進度' : '從第 1 課開始'} →</a>
    ${cards}
  </div>`;
}

function lesson(l) {
  const i = LESSONS.indexOf(l);
  const prev = LESSONS[i - 1], next = LESSONS[i + 1];
  const href = `index.html?${l.link.q}`;
  const target = isPhone() ? '' : ' target="_blank" rel="noopener"';
  return `
    <div class="kicker">${chName(l.chapter)}・${CHAPTERS.find((c) => c.id === l.chapter).title}　第 ${i + 1} 課</div>
    <h2>${l.title}</h2>
    <p class="one">${l.one}</p>
    <div class="analogy"><span class="label">打個比方</span><p>${l.analogy}</p></div>
    ${l.pre ? `<div class="simwrap"><span class="label">${l.pre.label}</span><p>${l.pre.intro}</p><div id="sim0"></div><p class="try">${l.pre.tryIt}</p></div>` : ''}
    <ol class="steps">${l.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    <div class="simwrap"><div id="sim"></div><p class="try">${l.tryIt}</p></div>
    <p class="why"><span class="label">為什麼重要</span><br>${l.why}</p>
    <details class="adult"><summary>大人版補充</summary><div>${l.adult}</div></details>
    <a class="golink" href="${href}"${target}><div><b>到模擬器裡看看：</b>${l.link.label}<span>${l.link.sub}</span></div><span class="arrow">→</span></a>
    <nav class="pager">
      ${prev ? `<a href="#${prev.id}"><small>← 上一課</small>${prev.title}</a>` : '<a href="#"><small>← 回到</small>開始之前</a>'}
      <a class="next" href="${next ? '#' + next.id : '#'}" data-done="${l.id}"><small>看懂了，${next ? '下一課' : '回目錄'} →</small>${next ? next.title : (COMING.length ? '更多課程製作中' : '全部完成！')}</a>
    </nav>`;
}

function route() {
  currentSims.forEach((x) => x?.destroy()); currentSims = [];
  document.body.classList.remove('toc-open');
  const id = location.hash.slice(1);
  const l = LESSONS.find((x) => x.id === id);
  $('page').innerHTML = l ? lesson(l) : home();
  toc(l?.id);
  if (l) {
    if (l.pre) currentSims.push(SIMS[l.pre.sim]?.($('sim0')));
    currentSims.push(SIMS[l.sim]?.($('sim')));
    document.title = `${l.title}・學習指引`;
  } else document.title = '學習指引・地球與太陽';
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-done]');
  if (a && !prog.done.includes(a.dataset.done)) { prog.done.push(a.dataset.done); save(prog); }
});
$('tocBtn').addEventListener('click', () => document.body.classList.toggle('toc-open'));
addEventListener('hashchange', route);
route();
