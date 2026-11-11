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
  h += `<div class="ch">總複習</div><a href="#summary" class="${activeId === 'summary' ? 'on' : ''}"><span class="n">★</span>全部串起來</a>`;
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
  cards += '<h3>總複習</h3><div class="cards"><a class="card" href="#summary"><small>一張圖</small>全部串起來</a></div>';
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
      <a class="next" href="${next ? '#' + next.id : '#summary'}" data-done="${l.id}"><small>看懂了，${next ? '下一課' : '總複習'} →</small>${next ? next.title : '全部串起來'}</a>
    </nav>`;
}

// 總複習：把 14 課串成一張圖，每個方塊都能點回那一課
function summary() {
  const n = (id, txt) => {
    const i = LESSONS.findIndex((l) => l.id === id);
    return `<a class="node ${prog.done.includes(id) ? 'done' : ''}" href="#${id}"><small>第 ${i + 1} 課</small>${txt}</a>`;
  };
  const down = '<div class="arr">↓</div>';
  const last = LESSONS[LESSONS.length - 1];
  return `
    <div class="kicker">總複習</div>
    <h2>全部串起來</h2>
    <p class="one">地球一邊自己轉、一邊歪著身子繞太陽走。我們看到的白天黑夜、影子、四季，全都從這兩件事變出來。</p>
    <div class="flow">
      <div class="root">${n('sun-earth', '太陽是一盞燈，地球永遠只亮一半')}</div>
      <div class="cols">
        <div class="col">
          <div class="colhead">一天的事：<b>自轉</b></div>
          ${n('day-night', '地球自轉一圈＝一天，輪流轉進亮處、暗處')}${down}
          ${n('east-rise', '我們往東轉，所以太陽看起來東升西落')}${down}
          ${n('terminator', '亮暗的分界線（晨昏線）掃過，就是日出、日落')}${down}
          ${n('sky-arc', '太陽在天空的大碗上畫一條弧線')}${down}
          ${n('shadow', '影子永遠在太陽對面，太陽越低影子越長')}${down}
          ${n('alt-az', '用高度角和方位角說出太陽在哪裡')}
        </div>
        <div class="col">
          <div class="colhead">一年的事：<b>公轉＋傾斜</b></div>
          <div class="pair">${n('orbit', '繞太陽一圈＝一年')}<span class="plus">＋</span>${n('tilt', '地軸歪 23.5°，永遠歪向同一邊')}</div>${down}
          ${n('subsolar', '直射點在南北回歸線之間來回')}${down}
          <div class="pair">${n('seasons-heat', '陽光直、斜不同 → 冷熱')}<span class="plus">＋</span>${n('day-length', '白天變長、變短')}</div>
          <div class="arr">↓　這兩個加起來就是<b>四季</b></div>
          ${n('season-paths', '四季的太陽路徑和日出方位')}${down}
          ${n('noon-formula', '正午太陽高度 = 90° − |緯度 − 直射點緯度|')}
        </div>
      </div>
    </div>
    <p>兩邊其實是同一個地球：左邊看的是「一天之內」，右邊看的是「一年之間」。在模擬器裡，太空視角看右邊這條線，地面視角看左邊這條線，地球視角兩條都看得到。</p>
    <a class="golink" href="index.html"><div><b>回到模擬器：</b>三個視角一起看<span>現在你應該看得懂每一個畫面了</span></div><span class="arrow">→</span></a>
    <nav class="pager">
      <a href="#${last.id}"><small>← 上一課</small>${last.title}</a>
      <a class="next" href="#"><small>回到 →</small>開始之前</a>
    </nav>`;
}

function route() {
  currentSims.forEach((x) => x?.destroy()); currentSims = [];
  document.body.classList.remove('toc-open');
  const id = location.hash.slice(1);
  const l = LESSONS.find((x) => x.id === id);
  $('page').innerHTML = l ? lesson(l) : id === 'summary' ? summary() : home();
  toc(l?.id || (id === 'summary' ? 'summary' : ''));
  if (l) {
    if (l.pre) currentSims.push(SIMS[l.pre.sim]?.($('sim0')));
    currentSims.push(SIMS[l.sim]?.($('sim')));
    document.title = `${l.title}・學習指引`;
  } else document.title = id === 'summary' ? '全部串起來・學習指引' : '學習指引・地球與太陽';
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-done]');
  if (a && !prog.done.includes(a.dataset.done)) { prog.done.push(a.dataset.done); save(prog); }
});
$('tocBtn').addEventListener('click', () => document.body.classList.toggle('toc-open'));
addEventListener('hashchange', route);
route();
