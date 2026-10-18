/**
 * GA-100 Revision 2: zero-dependency smoke and physics regression checks.
 * Run locally: node --test tests/ga100-revision2.test.cjs
 * These tests verify program behavior with stub canvas drawing primitives;
 * they do NOT replace visual QA on iPhone Safari or desktop browsers.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname, '../playtest/ga-100/index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source, 'The test page should include its gameplay script');

function makeApp(width = 390, height = 570) {
  const elements = Object.create(null);
  const handlers = Object.create(null);
  const fnames = ['setTransform', 'fillRect', 'save', 'restore', 'beginPath',
    'closePath', 'moveTo', 'lineTo', 'fill', 'stroke', 'ellipse', 'arc',
    'roundRect', 'fillText', 'drawImage', 'setLineDash'];
  function context() {
    const c = {};
    for (const fn of fnames) c[fn] = () => {};
    c.createLinearGradient = c.createRadialGradient = () => ({ addColorStop() {} });
    return c;
  }
  function el(id) {
    if (!elements[id]) elements[id] = {
      style: {}, classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {}, scrollIntoView() {},
      addEventListener(type, callback) { handlers[id + ':' + type] = callback; }
    };
    return elements[id];
  }
  // These DOM elements exist in the real HTML, including the initial tip.
  el('bankIntro').hidden = false;
  const timers = new Map();
  let nextTimerId = 0;
  const setTimeoutStub = (fn, ms) => {
    const id = ++nextTimerId;
    timers.set(id, { fn, ms });
    return id;
  };
  const clearTimeoutStub = id => timers.delete(id);
  const canvas = el('course');
  canvas.getContext = context;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
  canvas.setPointerCapture = () => {};
  const document = {
    querySelector: () => canvas,
    getElementById: el,
    createElement: () => ({ getContext: context })
  };
  const window = { devicePixelRatio: 1, addEventListener() {}, alert() {} };
  vm.runInNewContext(source, {
    window, document, requestAnimationFrame() {},
    setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub
  }, { filename: 'ga-100-preview.js', timeout: 12000 });
  return { hooks: window.__gaTest, handlers, elements, timers };
}

test('Revision 2 is correctly identified and existing branding is preserved', () => {
  assert.match(html, /GA-100 · REVISION 2/);
  assert.match(html, /ROLL IT SMOOTH/);
  assert.match(html, /QUICK TIP · BANK SHOTS/);
  assert.doesNotMatch(html, /renderBankHint/);
});

test('putting roll is moderately faster for weak, medium and strong shots', () => {
  const { hooks: t } = makeApp();
  for (const power of [0.2, 0.5, 0.85, 1.0]) {
    const baseline = 2.1 + 6.45 * power;
    const revised = t.getAimSpeed(power);
    assert.ok(revised > baseline * 1.04, 'Revised speed should increase at ' + power);
    assert.ok(revised < baseline * 1.13, 'Revised speed should remain modest at ' + power);
  }
});

test('touch pullback causes one putt and ball reaches rest', () => {
  const { hooks: t, handlers } = makeApp();
  const e = (x, y) => ({ clientX: x, clientY: y, pointerId: 1 });
  handlers['course:pointerdown'](e(195, 380));
  handlers['course:pointermove'](e(205, 467));
  handlers['course:pointerup'](e(205, 467));
  assert.equal(t.getState().shots, 1);
  assert.equal(t.getState().moving, true);
  t.advance(10);
  assert.equal(t.getState().moving, false);
});

test('camera automatically reframes after stopped ball; ball and cup stay in view', () => {
  for (const [width, height] of [[390, 570], [1160, 620]]) {
    const { hooks: t } = makeApp(width, height);
    const start = t.getState();
    t.setBall(start.x, start.z, 0, 4);
    t.advance(10);
    assert.equal(t.getState().moving, false);
    for (let i = 0; i < 11; i++) t.updateCamera(0.12);
    const cam = t.getCamera(), ball = t.getBallScreen(), cup = t.getCupScreen();
    assert.ok(cam.hasTakenShot, 'A new shot should enable tracking');
    assert.ok(cam.cam.z < t.getState().z, 'Camera should stay behind ball');
    for (const [label, p] of [['ball', ball], ['cup', cup]]) {
      assert.ok(p && p.x > 0 && p.x < width && p.y > 0 && p.y < height,
        label + ' should remain in view at viewport ' + width);
    }
  }
});

test('left-edge bank produces a consistent rebound', () => {
  const { hooks: t } = makeApp();
  const z = 8, middle = .48 * Math.sin(z * .26 + .5) - .28 * Math.sin(z * .57);
  const w = 2.33 + .16 * Math.sin(z * .52) + .10 * z / 18;
  t.setBall(middle - w + .19, z, -2, 0.8);
  t.advance(0.25);
  assert.ok(t.getState().vx > 0, 'Ball must rebound toward center');
});

test('rolling is deterministic and reset clears shot and camera state', () => {
  const { hooks: t } = makeApp();
  const start = t.getState();
  t.setBall(start.x, start.z, 2, 6);
  t.advance(0.8);
  const a = t.getState();
  t.reset();
  t.setBall(start.x, start.z, 2, 6);
  t.advance(0.8);
  const b = t.getState();
  assert.ok(Math.abs(a.x - b.x) < 1e-10 && Math.abs(a.z - b.z) < 1e-10);
  t.reset();
  assert.equal(t.getState().shots, 0);
  assert.equal(t.getCamera().hasTakenShot, false);
});

test('all 360 degrees of aiming are possible, including backward and sideways', () => {
  const { hooks: t, handlers } = makeApp();
  const e = (x,y) => ({ clientX:x, clientY:y, pointerId:1 });
  for (const [dx,dy] of [[0,100],[0,-100],[100,0],[-100,0],[100,100],[-100,100],[100,-100],[-100,-100]]) {
    t.reset();
    handlers['course:pointerdown'](e(195,310));
    handlers['course:pointermove'](e(195+dx,310+dy));
    const shot=t.getAim();
    assert.ok(shot && Number.isFinite(shot.vx) && Number.isFinite(shot.vz),
      'Valid 360-degree shot should exist for drag '+dx+','+dy);
    if (dy<0 && dx===0) assert.ok(shot.vz<0,'Pulling up aims back toward tee');
    if (dy>0 && dx===0) assert.ok(shot.vz>0,'Pulling down aims up the course');
    handlers['course:pointercancel'](e(195+dx,310+dy));
  }
});

test('after overshooting the cup, camera turns around and pulling down shoots back to cup', () => {
  const { hooks: t, handlers } = makeApp();
  const cup=t.getCup(),e=(x,y)=>({clientX:x,clientY:y,pointerId:1});
  t.setBall(cup.x+.5,cup.z+.9,0,0);
  t.advance(1);
  assert.equal(t.getState().moving,false);
  for (let i=0;i<130;i++) t.updateCamera(.04);
  const camera=t.getCamera();
  assert.ok(Math.abs(camera.cameraYaw)>2.2,'Camera must reverse after ball passes the cup');
  assert.ok(camera.cam.z>t.getState().z,'Camera must be behind ball facing cup');
  const target=t.getCupScreen();
  assert.ok(target&&target.x>0&&target.x<390&&target.y>0&&target.y<570,
    'Cup must remain on screen after turning around');
  handlers['course:pointerdown'](e(180,370));
  handlers['course:pointermove'](e(180,460));
  const shot=t.getAim();
  assert.ok(shot?.vz<0,'Pulling down should shoot back in negative world z');
  handlers['course:pointerup'](e(180,460));
  assert.equal(t.getState().shots,1);
});

test('holed ball disappears visually and reset returns it', () => {
  const { hooks:t }=makeApp(),cup=t.getCup();
  t.setBall(cup.x+.03,cup.z+.03,.2,.25);
  t.advance(1);
  assert.equal(t.getState().holed,true);
  assert.equal(t.getRenderBallVisible(),false);
  t.reset();
  assert.equal(t.getState().holed,false);
  assert.equal(t.getRenderBallVisible(),true);
});

test('banking tip is outside green, dismissible, and automatically times out', () => {
  assert.ok(html.indexOf('id="bankIntro"')<html.indexOf('id="course"'),
    'Tip must appear above canvas, never over cup');
  const app=makeApp();
  assert.equal(app.elements.bankIntro.hidden,false);
  assert.equal(app.timers.size,1);
  const onlyTimer=[...app.timers.values()][0];
  assert.equal(onlyTimer.ms,6500);
  onlyTimer.fn();
  assert.equal(app.elements.bankIntro.hidden,true);
  const again=makeApp();
  again.handlers['dismissBankTip:click']();
  assert.equal(again.elements.bankIntro.hidden,true);
  assert.equal(again.timers.size,0);
});


test('GA-108 scorecard matches actual putts, par and golf outcomes', () => {
  const { hooks:t }=makeApp();
  const expected=[
    [1,'EAGLE','-2'],[2,'BIRDIE','-1'],[3,'PAR','E'],
    [4,'BOGEY','+1'],[5,'DOUBLE BOGEY','+2'],[6,'TRIPLE BOGEY','+3'],
    [7,'4 OVER PAR','+4']
  ];
  for(const [putts,name,relative] of expected){
    const score=t.getHoleScore(putts,3);
    assert.equal(score.name,name,'name for '+putts);
    assert.equal(score.relative,relative,'to par for '+putts);
    assert.equal(score.putts,putts);
    assert.equal(score.par,3);
    assert.equal(score.ace,putts===1);
  }
});

test('GA-108 celebration is hidden during play, appears only after valid cup capture', () => {
  const { hooks:t,elements,timers,handlers }=makeApp();
  assert.equal(elements.holeResult?.hidden,true,'hidden by default on loading the game');
  const cup=t.getCup();
  // Near miss is never an earned score.
  t.setBall(cup.x+.62,cup.z+.50,.2,.2);
  t.advance(.3);
  assert.notEqual(t.getState().holed,true);
  assert.equal(elements.holeResult.hidden,true);
  assert.equal(timers.size,1,'only bank tutorial timeout exists before hole out');
  // Force authentic cup capture via the same physics code path.
  t.reset();
  const e=(x,y)=>({clientX:x,clientY:y,pointerId:1});
  handlers['course:pointerdown'](e(195,350));
  handlers['course:pointermove'](e(195,450));
  handlers['course:pointerup'](e(195,450));
  assert.equal(t.getState().shots,1);
  t.setBall(cup.x+.03,cup.z+.03,.2,.25);
  t.advance(1);
  assert.equal(t.getState().holed,true);
  assert.equal(t.getRenderBallVisible(),false);
  assert.equal(elements.holeResult.hidden,true,'popup waits briefly for ball to disappear');
  assert.equal(timers.size,1,'completion timer after initial tip is dismissed on first shot');
  const resultTimer=[...timers.values()].find(x=>x.ms===420);
  assert.ok(resultTimer);
  resultTimer.fn();
  assert.equal(elements.holeResult.hidden,false,'shown after successful hole');
  assert.equal(elements.resultName.textContent,'EAGLE');
  assert.equal(elements.resultRelative.textContent,'-2');
  assert.equal(elements.resultPutts.textContent,1,'one putt is recognized');
});

test('GA-108 scorecard supports dismiss, replay and Escape', () => {
  const { hooks:t,elements,handlers,timers }=makeApp();
  const cup=t.getCup();
  const hole=()=>{ t.setBall(cup.x+.03,cup.z+.03,.2,.25);t.advance(1);t.showHoleResult();};
  hole();
  assert.equal(elements.holeResult.hidden,false);
  handlers['resultDismiss:click']();
  assert.equal(elements.holeResult.hidden,true,'View Green dismisses');
  t.reset();hole();
  handlers['resultReplay:click']();
  assert.equal(t.getState().shots,0,'Replay restores stroke count');
  assert.equal(t.getState().holed,false,'Replay restores playable hole');
  assert.equal(elements.holeResult.hidden,true,'Replay hides popup');
});

test('GA-108 reset cancels pending celebration timer', () => {
  const { hooks:t,elements,timers }=makeApp();
  const cup=t.getCup();
  t.setBall(cup.x+.03,cup.z+.03,.2,.25);t.advance(1);
  assert.ok([...timers.values()].some(x=>x.ms===420));
  t.reset();
  assert.equal(elements.holeResult.hidden,true);
  assert.ok(![...timers.values()].some(x=>x.ms===420));
  t.showHoleResult();
  assert.equal(elements.holeResult.hidden,true,'No delayed ghost popup after reset');
});

test('GA-109: green and fringe terminate together in a rounded cap', () => {
  const { hooks:t }=makeApp();
  const end=t.getGreenEnd();
  assert.equal(end,18.90);
  assert.ok(t.getWidth(17.65)>t.getWidth(18.45),'Green narrows smoothly behind cup');
  assert.ok(t.getWidth(18.45)>0,'End of green remains playable before boundary');
  assert.ok(Math.abs(t.getWidth(end))<.001,'Green closes at actual far terminus');
  assert.ok(Math.abs(t.getOuterWidth(end))<.001,'Fringe terminates with green; no flying strips');
  for(let z=17.6;z<end;z+=.08){
    assert.ok(t.getWidth(z)>=0,'No negative playable width');
    assert.ok(t.getOuterWidth(z)>=t.getWidth(z),'Fringe outside playable green');
  }
});

test('GA-109: red flag is enlarged and visibly distinct from the cup', () => {
  assert.match(html, /P\(cup\.x,cup\.z,1\.63\)/,'Raised pin should be taller than previous 1.13');
  assert.match(html, /'#dd303c'/,'Red flag material should render');
  assert.match(html, /'#a91e30'/,'Red fold/shadow should render');
  assert.match(html, /const fw=clamp\(p\.s\*\.62,19,43\)/,'Readable flag in portrait mode');
});

test('GA-109: compact scorecard retains scoring and actions', () => {
  const css=html.match(/\/\* GA-109: smaller score feedback[\s\S]*?<\/style>/)?.[0];
  assert.ok(css,'GA-109 compact scorecard CSS exists');
  assert.match(css,/width:min\(100%,260px\)/,'Compact popup width <=260px');
  assert.match(css,/rgba\(3,24,18,\.24\)/,'Backdrop transparency retains course visibility');
  const { hooks:t, handlers,elements }=makeApp();
  const cup=t.getCup();
  // Use a real stroke first; physics-only test helpers don't count putts.
  const e=(x,y)=>({clientX:x,clientY:y,pointerId:1});
  handlers['course:pointerdown'](e(195,350));
  handlers['course:pointermove'](e(195,450));
  handlers['course:pointerup'](e(195,450));
  assert.equal(t.getState().shots,1);
  t.setBall(cup.x+.03,cup.z+.03,.2,.25);
  t.advance(1);
  t.showHoleResult();
  assert.equal(elements.holeResult.hidden,false);
  assert.equal(elements.resultName.textContent,'EAGLE');
  handlers['resultDismiss:click']();
  assert.equal(elements.holeResult.hidden,true);
  t.reset();
  assert.equal(t.getState().holed,false);
});

test('GA-109: terminal fringe geometry is bounded and backward camera stays stable', () => {
  const { hooks:t }=makeApp();
  const cup=t.getCup(),end=t.getGreenEnd();
  assert.ok(end>cup.z+.8,'End cap must be beyond cup');
  t.setBall(cup.x+.6,cup.z+.8,0,0);
  t.advance(1);
  for(let i=0;i<100;i++)t.updateCamera(.04);
  const cam=t.getCamera(),cupScreen=t.getCupScreen();
  assert.ok(Math.abs(cam.cameraYaw)>2.1,'Reverse camera after overshoot');
  assert.ok(cupScreen&&cupScreen.dep>.1,'Cup remains renderable in reverse view');
});
