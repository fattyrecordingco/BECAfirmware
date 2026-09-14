const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function runtime(){
  let time=10000;const outputs=[],objects={};let context;
  const sandbox={JSON,Math,isFinite,parseInt,Date:{now:()=>time},notifyclients(){},embedmessage(){},post(){},
    arrayfromargs:a=>Array.from(a),outlet:(...a)=>outputs.push(a),
    Task:function(fn,self){this.cancel=()=>{};this.repeat=()=>{};this.schedule=()=>{};},
    patcher:{newdefault(){return {};},connect(){},getnamed(name){if(!objects[name])objects[name]={hidden:false,value:0,message(...args){
      if(name.startsWith('param_')&&args[0]!=='set'){this.value=args[0];context.param(name.slice(6),args[0]);}},getvalueof(){return this.value;}};return objects[name];}},
    include(name){vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);}};
  context=vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'beca_instrument.js'),'utf8'),context);
  for(const d of context.BECA_SPEC.controls)context.patcher.getnamed('param_'+d.key).value=d.default;
  context.init();outputs.length=0;
  return {c:context,outputs,advance(ms){time+=ms;},last(key){return outputs.filter(x=>x[0]===0&&x[1]===key).at(-1)?.[2];}};
}
test('all firmware presets, floating defaults and MIDI velocity-zero release',()=>{
  const {c,last}=runtime();assert.equal(c.BECA_SPEC.presets.length,13);assert.equal(c.values.osc_mix,.45);
  c.midi(144,60,100);assert.equal(last('g1'),1);c.midi(60,0);assert.equal(last('g1'),0);
});
test('sustain releases only its own channel',()=>{
  const {c,last}=runtime();c.param('mono',0);c.param('voices',8);
  c.note(60,90,1);c.note(60,90,2);c.cc(64,127,1);c.note(60,0,1);
  assert.equal(last('g1'),1);c.cc(64,0,1);assert.equal(last('g1'),0);assert.equal(last('g2'),1);
});
test('voice stealing cannot let an old note-off cut off the replacement',()=>{
  const {c,last}=runtime();c.note(60,80,1);c.note(64,80,1);c.note(60,0,1);
  assert.equal(last('n1'),64);assert.equal(last('g1'),1);c.note(64,0,1);assert.equal(last('g1'),0);
});
test('MIDI bytes split across calls retain running status; realtime is transparent',()=>{
  const {c,last}=runtime();c.midi(144,60);c.midi(248,90);assert.equal(last('n1'),60);assert.equal(last('v1'),90/127);
  c.midi(60,0);assert.equal(last('g1'),0);
});
test('source selection prevents double input and switch releases held notes',()=>{
  const {c,last}=runtime();c.midi(144,60,80);c.param('source',1);c.midi(144,64,80);assert.equal(last('g1'),0);
});

test('USB reconnect restores polling after close and port changes',()=>{
  const {c,outputs}=runtime();c.connect('usb');
  const lastOpen=outputs.findLastIndex(x=>x[0]===1&&x[1]==='open');
  assert(outputs.slice(lastOpen+1).some(x=>x[0]===1&&x[1]==='poll'&&x[2]===4));
  c.disconnect();outputs.length=0;c.connect('usb');
  assert(outputs.some(x=>x[0]===1&&x[1]==='refresh'));
  assert(outputs.some(x=>x[0]===1&&x[1]==='poll'&&x[2]===4));
});
test('preset changes and variations preserve master',()=>{
  const {c}=runtime();c.param('master',.17);c.param('preset',8);assert.equal(c.values.master,.17);assert.equal(c.values.attack,.002);
  c.action('save_a');c.param('cutoff',300);c.param('master',.22);c.action('recall_a');assert.notEqual(c.values.cutoff,300);assert.equal(c.values.master,.22);
});
test('malformed parameters and raw telemetry never reach DSP',()=>{
  const {c,last,advance}=runtime();c.param('master',NaN);assert.equal(c.values.master,.6);
  c.param('preset',12);c.note(60,100,1);assert.equal(last('g1'),0);
  c.receive('plant',{value:.4,raw:440});assert.equal(last('sensor_hz'),440);
  c.receive('plant',{value:.4,raw:5000});assert.equal(last('sensor_hz'),440);
  advance(1600);c.tick();assert.equal(last('sensor_hz'),0);
});
test('USB writes coalesce, require acknowledgement and cap at 20 per second',()=>{
  const {c,outputs,advance}=runtime();c.mode='usb';c.connected=true;c.nextLive=1e9;c.nextSynth=1e9;c.nextHeartbeat=1e9;
  for(let i=0;i<100;i++)c.queue('cutoff',i*100);assert.equal(Object.keys(c.pending).length,1);
  c.tick();assert.equal(c.inflight.key,'cutoff');c.queue('cutoff',2500);advance(100);c.tick();assert.equal(c.pending.cutoff,2500);
  c.serialLine('@R SET {"ok":1}');c.tick();assert.equal(c.inflight.key,'cutoff');assert.equal(Object.keys(c.pending).length,0);
  const lines=outputs.filter(x=>x[0]===1&&Array.isArray(x[1])).map(x=>String.fromCharCode(...x[1]));
  assert(lines.some(x=>x.includes('9900')));assert(lines.some(x=>x.includes('2500')));
});
test('USB timeout clears pending commands and device notes',()=>{
  const {c,last,advance}=runtime();c.mode='usb';c.connected=true;c.values.source=1;c.note(60,90,1);c.inflight={tag:'SET',at:10000};c.pending={cutoff:500};
  advance(1900);c.tick();assert.equal(c.connected,false);assert.equal(Object.keys(c.pending).length,0);assert.equal(last('g1'),0);
});
test('hardware snapshots never overwrite local sound or recently edited hardware',()=>{
  const {c}=runtime();c.mode='usb';c.connected=true;c.param('sens',.3);c.receive('state',{sens:.1,master:.1});
  assert.equal(c.values.sens,.3);assert.equal(c.values.master,.6);c.receive('synth',{cutoff:10});assert.equal(c.values.cutoff,5200);
});
test('saved connection and variation memory restores without connecting or writing',()=>{
  const a=runtime();a.c.action('save_a');const state=a.c.getvalueof();const b=runtime();b.c.setvalueof(state);
  assert(b.c.memory.slots.a);assert.equal(b.c.mode,'');assert.equal(Object.keys(b.c.pending).length,0);
});
test('8-voice bound survives a burst, panic clears sustain and every gate',()=>{
  const {c,last}=runtime();c.param('mono',0);c.param('voices',8);for(let n=0;n<128;n++)c.note(n,100,1);
  assert.equal(c.voices.length,8);c.cc(64,127,1);c.panic();for(let i=1;i<=8;i++)assert.equal(last('g'+i),0);assert.equal(Object.keys(c.pedal).length,0);
});
