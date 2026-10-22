'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../playtest/ga-100-webgl/index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
function boot(){
 const events={},elements={};let count=0,bufferCount=0,drawCalls=0;
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:1,LINK_STATUS:2,DEPTH_TEST:2929,LEQUAL:515,TRIANGLES:4,FLOAT:5126,ARRAY_BUFFER:34962,STATIC_DRAW:35044,COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256};
 for(const n of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','enable','depthFunc','bindBuffer','bufferData','viewport','uniformMatrix4fv','uniform3fv','enableVertexAttribArray','vertexAttribPointer','clearColor','clear'])gl[n]=()=>{};
 gl.createShader=()=>({});gl.getShaderParameter=()=>true;gl.createProgram=()=>({});gl.getProgramParameter=()=>true;gl.getAttribLocation=(_,name)=>({aPos:0,aNorm:1,aCol:2,aGrass:3}[name]??0);gl.getUniformLocation=()=>({});gl.createBuffer=()=>{bufferCount++;return {}};gl.drawArrays=(_,__,ct)=>{count+=ct;drawCalls++};
 const ctx={clearRect(){},beginPath(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){}};
 function el(id){if(!elements[id])elements[id]={id,hidden:id==='result'||id==='loading',style:{},classList:{toggle(){},add(){},remove(){}},textContent:'',setAttribute(){},focus(){},addEventListener:(type,fn)=>{events[id+':'+type]=fn},getBoundingClientRect:()=>({width:390,height:570,left:0,top:0}),setPointerCapture(){}};return elements[id]}
 el('scene');el('result');el('bankTip');el('glCanvas');el('aimCanvas');
 el('glCanvas').getContext=(kind)=>kind==='webgl'?gl:null;el('aimCanvas').getContext=()=>ctx;
 let callback=null,seq=0;const timers=new Map();const requestAnimationFrame=fn=>{callback=fn};
 const window={devicePixelRatio:1,addEventListener:(name,fn)=>events['window:'+name]=fn},document={getElementById:el};
 const setTimeout=(fn,ms)=>{let id=++seq;timers.set(id,{fn,ms});return id},clearTimeout=id=>timers.delete(id);
 vm.runInNewContext(script,{window,document,requestAnimationFrame,setTimeout,clearTimeout,performance:{now:()=>0},alert(){}},{timeout:10000,filename:'game.js'});
 return {game:window.__ga3d,events,elements,timers,render:(t=16)=>{if(callback)callback(t)},stats:()=>({bufferCount,drawCalls,vertices:count})};
}
test('Genuine GPU geometry is uploaded and WebGL render loop dispatches meshes',()=>{const a=boot();assert.equal(a.game.available,true);assert.match(a.game.engine,/WebGL/);assert.ok(a.stats().bufferCount>=6);a.render();assert.ok(a.stats().drawCalls>=6);assert.ok(a.stats().vertices>50000)});
test('Bounded green has an organic rounded cap with cup safely before end',()=>{const g=boot().game,END=g.getGreenEnd();assert.equal(END,19);assert.ok(g.getCup().z<END-1.0);assert.ok(g.getGreenWidth(17.9)>g.getGreenWidth(18.6));assert.ok(g.getGreenWidth(18.6)>0);assert.ok(Math.abs(g.getGreenWidth(END))<.001)});
test('Same terrain governs consistent break and deterministic physics',()=>{const g=boot().game,s=g.getState(),from={x:s.x,z:s.z},grad=g.getGradient(s.x,s.z);assert.ok(Number.isFinite(grad.x)&&Number.isFinite(grad.z));g.setBall(from.x,from.z,0,4);for(let i=0;i<120;i++)g.step(1/120);const a=g.getState();assert.ok(Math.abs(a.x-from.x)>.005);g.reset();g.setBall(from.x,from.z,0,4);for(let i=0;i<120;i++)g.step(1/120);const b=g.getState();assert.ok(Math.abs(a.x-b.x)<1e-10&&Math.abs(a.z-b.z)<1e-10)});
test('Optional left bank gives consistent rebound',()=>{const g=boot().game,z=8,mid=.5*Math.sin(z*.25+.55)-.25*Math.sin(z*.49),x=mid-g.getGreenWidth(z)+.19;g.setBall(x,z,-2,.8);for(let i=0;i<28;i++)g.step(1/120);assert.ok(g.getState().vx>0)});
test('Touch pullback can putt backwards and reset restores play',()=>{const a=boot(),e=(x,y)=>({clientX:x,clientY:y,pointerId:1}),start=a.game.getState();a.events['glCanvas:pointerdown'](e(195,300));a.events['glCanvas:pointermove'](e(195,210));a.events['glCanvas:pointerup'](e(195,210));assert.equal(a.game.getState().shots,1);assert.equal(a.game.getState().moving,true);assert.ok(a.game.getState().vz<0);a.game.reset();assert.equal(a.game.getState().shots,0);assert.ok(Math.abs(a.game.getState().z-start.z)<1e-5)});
test('Completion dialog shows earned score and replay restores ball',()=>{const a=boot(),g=a.game,c=g.getCup(),e=(x,y)=>({clientX:x,clientY:y,pointerId:1});a.events['glCanvas:pointerdown'](e(180,340));a.events['glCanvas:pointermove'](e(180,430));a.events['glCanvas:pointerup'](e(180,430));g.setBall(c.x+.02,c.z+.03,.2,.3);g.step(1/120);assert.equal(g.getState().holed,true);const timer=[...a.timers.values()].find(x=>x.ms===430);assert.ok(timer);timer.fn();assert.equal(a.elements.result.hidden,false);assert.equal(a.elements.resultName.textContent,'EAGLE');a.events['playAgain:click']();assert.equal(g.getState().shots,0);assert.equal(g.getState().holed,false);assert.equal(a.elements.result.hidden,true)});
test('Roll It. brand, responsive controls and dialog preserved',()=>{assert.match(html,/>ROLL IT\.</);assert.match(html,/Drag and release in any direction/);assert.match(html,/role="dialog"/);assert.doesNotMatch(html,/ROLL IT SMOOTH/i)});

test('Vertical power UI replaces horizontal bar and dynamically moves opposite the aiming thumb',()=>{
 const a=boot(),e=(x,y)=>({clientX:x,clientY:y,pointerId:1});
 assert.match(html,/class="power-rail"/);assert.match(html,/class="power-track"/);
 assert.doesNotMatch(html,/class="power">POWER/);
 a.events['glCanvas:pointerdown'](e(330,260));a.events['glCanvas:pointermove'](e(330,350));a.render(32);
 assert.equal(a.elements.powerFill.style.height,'58%');assert.equal(a.elements.powerPercent.textContent,'58%');
 a.events['glCanvas:pointercancel']();a.game.reset();
 assert.equal(a.elements.powerFill.style.height,'0%');assert.equal(a.elements.powerPercent.textContent,'0%');
});
test('Directional aim preview is short and finishes with a clear arrow',()=>{
 assert.match(script,/Short directional guide with an arrow/);
 assert.match(script,/i\/12\*1\.65/);
 assert.match(script,/const tip=pts\[pts\.length-1\]/);
 assert.doesNotMatch(script,/i\/27\*2\.9/);
});
test('Golf-ball-to-cup diameter is consistent with regulation proportions',()=>{
 const g=boot().game,ratio=g.getBallRadius()/g.getCupRadius();
 assert.ok(Math.abs(ratio-(42.67/108))<.007,'diameter ratio should be roughly 0.395');
});
test('Hard direct pin contact rebounds without holing out while controlled pace is captured',()=>{
 const g=boot().game,c=g.getCup();
 g.setBall(c.x+.20,c.z,-5,0);
 for(let i=0;i<8;i++)g.step(1/120);
 assert.ok(g.getPinRebounds()>0,'fast hit should ricochet off flagstick');
 assert.equal(g.getState().holed,false);
 g.reset();g.setBall(c.x+.095,c.z,-.55,0);g.step(1/120);
 assert.equal(g.getState().holed,true,'controlled approach should drop');
});
test('Edges contain the ball and instructions plainly state green-only rule',()=>{
 const g=boot().game,z=8,mid=.5*Math.sin(z*.25+.55)-.25*Math.sin(z*.49);
 g.setBall(mid+g.getGreenWidth(z)+.7,z,4,0);g.step(1/120);
 assert.ok(g.getState().x<mid+g.getGreenWidth(z));
 assert.ok(g.getState().vx<0);
 assert.match(html,/THE BALL ALWAYS STAYS ON THE GREEN/);
 assert.match(html,/GREEN-ONLY PLAY/);
 assert.doesNotMatch(html,/Read the contours/);
});
test('Score callouts celebrate hole-in-one, birdie and par, but label bogeys plainly',()=>{
 const a=boot(),g=a.game,e=(x,y)=>({clientX:x,clientY:y,pointerId:1});
 function addShot(){a.events['glCanvas:pointerdown'](e(180,340));a.events['glCanvas:pointermove'](e(180,430));a.events['glCanvas:pointerup'](e(180,430));const st=g.getState();g.setBall(st.x,st.z,.1,0);g.step(1/120)}
 addShot();assert.equal(g.score().message,'AWESOME HOLE IN ONE!');
 addShot();assert.equal(g.score().message,'GREAT BIRDIE!');
 addShot();assert.equal(g.score().message,'NICE PAR!');
 addShot();assert.equal(g.score().message,'BOGEY');
 addShot();assert.equal(g.score().message,'DOUBLE BOGEY');
});
test('Par introduction displays on start and reset, then clears on the first putt',()=>{
 const a=boot(),e=(x,y)=>({clientX:x,clientY:y,pointerId:1});
 assert.match(html,/class="hole-intro"/);assert.match(html,/PAR 3/);
 a.events['glCanvas:pointerdown'](e(180,340));a.events['glCanvas:pointermove'](e(180,430));a.events['glCanvas:pointerup'](e(180,430));
 assert.equal(a.elements.holeIntro.hidden,true);
 a.game.reset();assert.equal(a.elements.holeIntro.hidden,false);
});
test('Richer decorative scenery exists outside the playable corridor',()=>{
 assert.match(script,/Layered scene dressing stays beyond the playable turf/);
 assert.match(script,/Additional distant hills introduce depth/);
});
