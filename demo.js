// ============================================================
//  Floating rotation — הדגמה מונפשת של המתרגם ללא התקנה
//  דפדפן מדומה: גרירה לשורת הסימניות, לחיצה, ותרגום מול העיניים.
//  אין כאן וידאו — הכל DOM, ולכן זה חד בכל גודל ומתורגם לכל שפה.
// ============================================================
(function () {

  var RTL = ['he', 'ar'];

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  // בונה את שלד ההדגמה. t = פונקציית תרגום, lang = קוד השפה.
  function build(t, lang) {
    var wrap = el('div', 'dmo');

    var cap = el('div', 'dmo-cap');
    var capNum = el('span', 'dmo-num');
    var capTxt = el('span', 'dmo-txt');
    cap.append(capNum, capTxt);

    var win = el('div', 'dmo-win');

    // סרגל עליון עם כתובת
    var bar = el('div', 'dmo-bar');
    var dots = el('div', 'dmo-dots');
    dots.append(el('i'), el('i'), el('i'));
    var url = el('div', 'dmo-url');
    bar.append(dots, url);

    // שורת הסימניות — מתחילה מוסתרת, כמו אצל רוב האנשים
    var marks = el('div', 'dmo-marks off');
    var markLabel = el('span', 'dmo-marks-lbl', '☆');
    var chip = el('span', 'dmo-chip', t('d_bm'));
    marks.append(markLabel, chip);

    // רמז המקלדת שמדליק את שורת הסימניות
    var kbd = el('div', 'dmo-kbd');
    kbd.append(el('kbd', null, 'Ctrl'), el('span', null, '+'),
               el('kbd', null, 'Shift'), el('span', null, '+'), el('kbd', null, 'B'));

    // גוף העמוד
    var page = el('div', 'dmo-page');
    var dragBtn = el('div', 'dmo-dragbtn', t('drag'));
    var lines = el('div', 'dmo-lines');
    var panel = el('div', 'dmo-panel');
    page.append(dragBtn, lines, panel);

    // הרוח שנגררת + הסמן
    var ghost = el('div', 'dmo-ghost', t('d_bm'));
    var cursor = el('div', 'dmo-cursor');
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 2l7 18 2.5-7.5L21 10z" ' +
      'fill="#fff" stroke="#0d1620" stroke-width="1.4" stroke-linejoin="round"/></svg>';

    win.append(bar, marks, page, ghost, cursor, kbd);

    var pips = el('div', 'dmo-pips');
    for (var i = 0; i < 5; i++) pips.append(el('i'));

    var replay = el('button', 'dmo-replay', t('d_replay'));

    wrap.append(cap, win, pips, replay);

    return { wrap: wrap, win: win, url: url, marks: marks, chip: chip, kbd: kbd,
             dragBtn: dragBtn, lines: lines, panel: panel, ghost: ghost, cursor: cursor,
             capNum: capNum, capTxt: capTxt, pips: pips, replay: replay };
  }

  // ---------- הרצת ההנפשה ----------
  function play(ui, t, lang, alive) {
    var rtlUi = RTL.indexOf(lang) >= 0;
    var step = 0;

    function wait(ms) {
      return new Promise(function (r) { setTimeout(r, ms); });
    }
    function stop() { return !alive(); }

    function caption(n, key) {
      step = n;
      ui.capNum.textContent = n + '/5';
      ui.capTxt.textContent = t(key);
      [].forEach.call(ui.pips.children, function (p, i) {
        p.className = i === n - 1 ? 'on' : '';
      });
    }
    function cursorTo(x, y) {
      ui.cursor.style.left = x + '%';
      ui.cursor.style.top = y + '%';
    }
    function reset() {
      ui.win.className = 'dmo-win';
      ui.url.textContent = 'floating-rotation';
      ui.marks.classList.add('off');      // שורת הסימניות מתחילה מוסתרת
      ui.kbd.classList.remove('on');
      ui.chip.classList.remove('in');
      ui.ghost.classList.remove('on');
      ui.dragBtn.classList.remove('grabbed');
      ui.lines.textContent = '';
      ui.panel.className = 'dmo-panel';
      ui.panel.textContent = '';
      cursorTo(50, 96);
    }

    // ממלא את העמוד המדומה בשורות בשפת המקור
    function fillLines() {
      ui.lines.textContent = '';
      ['s1', 's2', 's3', 's4'].forEach(function (k, i) {
        var row = el('div', 'dmo-line' + (i === 0 ? ' head' : ''), t(k + '_en'));
        ui.lines.append(row);
      });
    }

    function buildPanel() {
      ui.panel.textContent = '';
      var head = el('div', 'dmo-p-head', 'Floating rotation');
      var sel = el('div', 'dmo-p-sel');
      sel.append(el('span', null, t('d_langname')), el('b', null, '▾'));
      var bar = el('div', 'dmo-p-bar');
      var fill = el('div', 'dmo-p-fill');
      bar.append(fill);
      var btn = el('div', 'dmo-p-btn', t('d_go'));
      ui.panel.append(head, sel, bar, btn);
      ui.panel.dir = rtlUi ? 'rtl' : 'ltr';
      return { fill: fill, btn: btn };
    }

    return (async function run() {
      while (!stop()) {
        // ---- 1: קודם כל מדליקים את שורת הסימניות ----
        // בלי זה אין לאן לגרור, וזה בדיוק מה שנכשל בפועל
        reset();
        caption(1, 'd_step0');
        await wait(900); if (stop()) return;
        ui.kbd.classList.add('on');
        await wait(1100); if (stop()) return;
        ui.marks.classList.remove('off');
        await wait(900); if (stop()) return;
        ui.kbd.classList.remove('on');
        await wait(700); if (stop()) return;

        // ---- 2: גרירה לשורת הסימניות ----
        caption(2, 'd_step1');
        ui.dragBtn.classList.add('show');
        await wait(500); if (stop()) return;
        cursorTo(50, 66);
        await wait(900); if (stop()) return;
        ui.dragBtn.classList.add('grabbed');
        ui.ghost.classList.add('on');
        ui.ghost.style.left = '50%'; ui.ghost.style.top = '62%';
        await wait(450); if (stop()) return;
        cursorTo(21, 26);
        ui.ghost.style.left = '21%'; ui.ghost.style.top = '22%';
        await wait(1100); if (stop()) return;
        ui.ghost.classList.remove('on');
        ui.chip.classList.add('in');
        await wait(1200); if (stop()) return;

        // ---- 2: נכנסים לאתר אחר ----
        caption(3, 'd_step2');
        ui.dragBtn.classList.remove('show', 'grabbed');
        ui.url.textContent = 'any-website.com';
        ui.win.classList.add('loading');
        await wait(500); if (stop()) return;
        ui.win.classList.remove('loading');
        fillLines();
        cursorTo(60, 70);
        await wait(1700); if (stop()) return;

        // ---- 3: לוחצים על הסימנייה ----
        caption(4, 'd_step3');
        cursorTo(21, 26);
        await wait(900); if (stop()) return;
        ui.chip.classList.add('hit');
        await wait(260); if (stop()) return;
        ui.chip.classList.remove('hit');
        var p = buildPanel();
        ui.panel.classList.add('in');
        await wait(1300); if (stop()) return;

        // ---- 4: בוחרים שפה והעמוד מתורגם ----
        caption(5, 'd_step4');
        cursorTo(78, 78);
        await wait(700); if (stop()) return;
        p.btn.classList.add('hit');
        await wait(260); if (stop()) return;
        p.btn.classList.remove('hit');
        p.btn.textContent = t('d_stop');
        p.btn.classList.add('busy');

        var rows = [].slice.call(ui.lines.children);
        for (var i = 0; i < rows.length; i++) {
          if (stop()) return;
          p.fill.style.width = Math.round((i + 1) / rows.length * 100) + '%';
          rows[i].classList.add('flip');
          await wait(160);
          rows[i].textContent = t('s' + (i + 1) + '_tr');
          rows[i].dir = rtlUi ? 'rtl' : 'ltr';
          rows[i].classList.remove('flip');
          rows[i].classList.add('done');
          await wait(420);
        }
        p.btn.classList.remove('busy');
        p.btn.classList.add('rest');
        p.btn.textContent = t('d_restore');
        await wait(2600); if (stop()) return;
      }
    })();
  }

  window.FLROT_DEMO = { build: build, play: play };
})();
