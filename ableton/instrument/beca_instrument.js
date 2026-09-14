// Max scheduler/control layer. Audio runs entirely in the native Gen engine.
autowatch = 0;
inlets = 1;
outlets = 4;
include('beca_spec.js');
var defs={}, values={}, voices=[], sequence=0, pedal={}, bends={}, midiStatus=0, midiData=[];
var memory={host:'beca.local',port:'COM4',slots:{}}, applying=false, ready=false, activePage=0;
var mode='', connected=false, pending={}, inflight=null, lineBuffer='', lastPlant=0;
var nextLive=0,nextSynth=0,nextHeartbeat=0,lastWrite=0,openedAt=0,waitingPull=false;
var synthSnapshot=null, undoSound=null, statusText='Play a MIDI clip or connect BECA', tickTask=null;
var edits={}, noteSnapshot=[], lastPaint='', serialDropping=false, enabledState=1;
var tempoObserver=null,transportObserver=null,liveTempo=120;
var serialObject=null,serialDiagnostics=[];
for(var i=0;i<BECA_SPEC.controls.length;i++){var d=BECA_SPEC.controls[i];defs[d.key]=d;values[d.key]=d.default;}
for(var j=0;j<8;j++)voices.push({note:-1,ch:0,down:false,held:false,age:0,until:0});

function now(){return Date.now();}
function finite(v){return typeof v==='number' && isFinite(v);}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function dsp(k,v){outlet(0,k,v);}
function monitor(){outlet(3,arrayfromargs(arguments));}
function textStatus(s){statusText=s;monitor('status',s);}
function object(name){return this.patcher.getnamed(name);}
function put(key,value){var o=object.call(this,'param_'+key);if(o)o.message(value);else param(key,value);}
function init(){
    applying=true;
    for(var k in defs){var o=object.call(this,'param_'+k);if(o){var v=o.getvalueof();if(v instanceof Array)v=v[0];param(k,Number(v));}}
    applying=false;ready=true;
    for(var key in values)sendLocal(key,values[key]);
    page(0);address('host',memory.host);address('port',memory.port);
    if(tickTask)tickTask.cancel();tickTask=new Task(tick,this);tickTask.interval=20;tickTask.repeat();
    monitor('title','BECA 0.1.0');textStatus('Live MIDI ready | Connect for plant input');
    if(typeof LiveAPI!=='undefined'){
        tempoObserver=new LiveAPI(function(a){if(a[0]==='tempo'){liveTempo=Number(a[1]);if(values.follow_tempo&&connected)queue('bpm',clamp(liveTempo,20,240));}},'live_set');tempoObserver.property='tempo';
        transportObserver=new LiveAPI(function(a){if(a[0]==='is_playing'&&!Number(a[1]))panic();},'live_set');transportObserver.property='is_playing';
    }
}
function sendLocal(key,v){
    if(key==='preset'){dsp('raw_mode',v===12?1:0);return;}
    if(key==='source'||key==='mono'||key==='voices'){return;}
    if(!defs[key] || defs[key].hardware || key==='send_sound'||key==='depth'||key==='drums'||key==='follow_tempo')return;
    dsp(key,v);
}
function param(key,value){
    if(!defs[key])return;var d=defs[key],v=Number(value);if(!finite(v))return;
    v=clamp(v,d.min,d.max);if(d.integer)v=Math.round(v);var old=values[key];values[key]=v;
    if(!ready || applying){sendLocal(key,v);return;}
    if(old===v)return;
    if(key==='preset'){panic();loadPreset(v);return;}
    if(key==='source'||key==='mono'||key==='voices')panic();
    if(key==='follow_tempo'){if(v&&connected)queue('bpm',clamp(liveTempo,20,240));return;}
    sendLocal(key,v);
    if(d.hardware || (values.send_sound && key!=='source' && key!=='depth' && key!=='drums' && key!=='send_sound'))queue(key,key==='ts'?d.enum[v]:v);
    monitor('parameter',key,v);
}
function loadPreset(index){
    var p=BECA_SPEC.presets[index];if(!p)return;
    undoSound=null;applying=true;
    for(var k in p.values)if(defs[k] && k!=='master' && k!=='preset')put.call(this,k,p.values[k]);
    applying=false;dsp('raw_mode',index===12?1:0);
    if(values.send_sound){
        // Explicit values avoid old firmware resetting master with a preset command.
        for(var key in p.values)if(defs[key] && key!=='preset' && key!=='master')queue(key,p.values[key]);
        queue('preset_live',index);
    }
    textStatus(index===12?'Raw sine needs fresh BECA ADC1 data':p.name);
}
function sound(){var s={};for(var k in BECA_SPEC.presets[0].values)if(defs[k] && k!=='master'&&k!=='preset')s[k]=values[k];return s;}
function recall(s){if(!s || values.preset===12)return;for(var k in s)if(defs[k]&&!defs[k].hardware&&k!=='master'&&k!=='preset')put.call(this,k,s[k]);}
function action(name){
    if(name==='panic'){panic();return;}
    if(name==='audition'){note(60,65,1);var off=new Task(function(){note(60,0,1);},this);off.schedule(350);return;}
    if(name==='usb'||name==='wifi'){connect(name);return;}
    if(name==='disconnect'){disconnect();return;}
    if(name==='ports'){ensureSerial.call(this);outlet(1,'refresh');outlet(1,'print');return;}
    if(name==='pull_sound'){if(connected){waitingPull=true;request('SYNTH');}else textStatus('Connect BECA before reading its sound');return;}
    if(values.preset===12){textStatus('Raw Sensor Sine bypasses sound variations');return;}
    if(name==='mutate'){
        undoSound=sound();var keys=['osc_mix','detune','cutoff','resonance','drive','reverb','delay_mix'];
        for(var n=0;n<keys.length;n++){var k=keys[n],d=defs[k];var delta=(Math.random()*2-1)*values.depth;
            put.call(this,k,k==='cutoff'?clamp(values[k]*Math.pow(4,delta),d.min,d.max):clamp(values[k]+delta*(d.max-d.min)*.3,d.min,d.max));}
    } else if(name==='undo'){if(undoSound){var s=undoSound;undoSound=null;recall.call(this,s);}}
    else if(name.indexOf('save_')===0){memory.slots[name.slice(5)]=sound();notifyclients();textStatus('Saved variation '+name.slice(5).toUpperCase());}
    else if(name.indexOf('recall_')===0){var slot=memory.slots[name.slice(7)];if(slot){undoSound=sound();recall.call(this,slot);}else textStatus('Save this variation first');}
}
function xy(x,y,begin){
    if(values.preset===12)return;if(begin)undoSound=sound();
    put.call(this,'cutoff',20*Math.pow(900,clamp(x,0,1)));put.call(this,'resonance',.1+clamp(y,0,1)*4.9);
}
function releaseVoice(i){var v=voices[i];v.down=false;v.held=false;v.until=now()+values.release*1000+50;dsp('g'+(i+1),0);}
function note(n,v,ch){
    if(!finite(n)||!finite(v)||!finite(ch)||n<0||n>127||ch<1||ch>16)return;
    n=Math.round(n);v=clamp(Math.round(v),0,127);ch=Math.round(ch);
    if(v>0 && (values.mute || !enabledState || values.preset===12))return;
    if(ch===10 && values.drums){if(v>0){dsp('drum_vel',v/127);dsp('drum_note',n);dsp(n===35||n===36?'kick':n===38||n===40?'snare':n===42||n===44||n===46?'hat':'percussion',++sequence);monitor('note',n,v,ch);}return;}
    var limit=values.mono?1:values.voices, slot=-1;
    if(v===0){
        // A release only affects the matching channel/note, including sustained notes.
        for(var a=0;a<8;a++)if(voices[a].note===n&&voices[a].ch===ch&&voices[a].down){
            voices[a].down=false;if(pedal[ch])voices[a].held=true;else releaseVoice(a);break;}
        monitor('note',n,0,ch);return;
    }
    for(var b=0;b<limit;b++)if(voices[b].note===n&&voices[b].ch===ch){slot=b;break;}
    if(slot<0)for(var c=0;c<limit;c++)if(!voices[c].down&&!voices[c].held&&voices[c].until<now()){slot=c;break;}
    if(slot<0){slot=0;for(var d=1;d<limit;d++)if(voices[d].age<voices[slot].age)slot=d;}
    voices[slot]={note:n,ch:ch,down:true,held:false,age:++sequence,until:0};
    dsp('n'+(slot+1),n);dsp('v'+(slot+1),v/127);dsp('b'+(slot+1),bends[ch]||0);dsp('g'+(slot+1),1);dsp('t'+(slot+1),sequence);
    monitor('note',n,v,ch);
}
function cc(k,v,ch){
    if(k===64){pedal[ch]=v>=64; if(!pedal[ch])for(var i=0;i<8;i++)if(voices[i].ch===ch&&voices[i].held)releaseVoice(i);}
    else if(k===120||k===123){for(var j=0;j<8;j++)if(voices[j].ch===ch)releaseVoice(j);pedal[ch]=false;}
    else if(k===121){pedal[ch]=false;bends[ch]=0;for(var q=0;q<8;q++)if(voices[q].ch===ch){dsp('b'+(q+1),0);if(voices[q].held)releaseVoice(q);}}
}
function midiByte(b){
    b=Number(b);if(!finite(b)||b<0||b>255)return;
    if(b>=248){if(b===252)panic();return;}
    if(b>=128){midiStatus=b<240?b:0;midiData=[];return;}
    if(!midiStatus)return;midiData.push(b);var type=midiStatus>>4, count=(type===12||type===13)?1:2;
    if(midiData.length<count)return;var ch=(midiStatus&15)+1;
    if(type===9||type===8)note(midiData[0],type===8?0:midiData[1],ch);
    else if(type===11)cc(midiData[0],midiData[1],ch);
    else if(type===14){bends[ch]=((midiData[0]+midiData[1]*128)-8192)/8192*2;for(var i=0;i<8;i++)if(voices[i].ch===ch)dsp('b'+(i+1),bends[ch]);}
    midiData=[];
}
function midi(){if(values.source!==0)return;var a=arrayfromargs(arguments);for(var i=0;i<a.length;i++)midiByte(a[i]);}
function panic(){
    for(var i=0;i<8;i++){dsp('g'+(i+1),0);voices[i]={note:-1,ch:0,down:false,held:false,age:0,until:0};}
    pedal={};bends={};midiData=[];midiStatus=0;noteSnapshot=[];dsp('panic_token',++sequence);monitor('panic');
}
function enabled(v){enabledState=Number(v)?1:0;dsp('enabled',enabledState);if(!enabledState)panic();}
function page(n){
    activePage=clamp(Math.round(n),0,7);
    for(var k in defs){var d=defs[k],o=object.call(this,'param_'+k);if(o)o.hidden=d.page!==-1&&d.page!==activePage;var label=object.call(this,'label_'+k);if(label)label.hidden=d.page!==-1&&d.page!==activePage;}
    var ids=['connect_usb','connect_wifi','connect_disconnect','connect_ports','entry_port','entry_host','entry_label_port','entry_label_host','connect_help'];
    for(var i=0;i<ids.length;i++){var c=object.call(this,ids[i]);if(c)c.hidden=activePage!==7;}
    monitor('page',activePage);
}
function address(key){
    if(key!=='host'&&key!=='port')return;var a=arrayfromargs(arguments);a.shift();var s=a.join(' ').replace(/^text /,'').trim();
    if(!s||s.length>200||/[\r\n\0]/.test(s))return;memory[key]=s;var o=object.call(this,'entry_'+key);if(o)o.message('set',s);notifyclients();
}
function getvalueof(){return JSON.stringify(memory);}
function setvalueof(s){try{var m=JSON.parse(s);if(!m||typeof m!=='object')return;memory={host:typeof m.host==='string'?m.host:'beca.local',port:typeof m.port==='string'?m.port:'COM4',slots:m.slots||{}};if(ready){address('host',memory.host);address('port',memory.port);}}catch(e){}}
function save(){embedmessage('setvalueof',getvalueof());}

function disconnect(){
    var wasDevice=values.source===1;mode='';connected=false;pending={};inflight=null;lineBuffer='';serialDropping=false;waitingPull=false;
    outlet(1,'close');outlet(2,'disconnect');dsp('sensor_hz',0);if(wasDevice)panic();
    textStatus('Disconnected | Live MIDI is available');monitor('connected',0);
}
function ensureSerial(){
    if(serialObject)return;
    serialObject=this.patcher.newdefault(20,800,'serial',memory.port,115200,'@autoopen',0,'@dtr',0,'@rts',0,'@xonxoff',0,'@poll',4,'@bufsize',32768);
    this.patcher.connect(this.box,1,serialObject,0);
    this.patcher.connect(serialObject,0,object.call(this,'beca_serdata'),0);
    this.patcher.connect(serialObject,1,object.call(this,'beca_serports'),0);
}
function connect(kind){
    disconnect();mode=kind;openedAt=now();nextLive=0;nextSynth=0;nextHeartbeat=0;
    if(kind==='usb'){ensureSerial.call(this);outlet(1,'refresh');outlet(1,'port',memory.port);outlet(1,'baud',115200);outlet(1,'open');outlet(1,'dtr',0);outlet(1,'rts',0);outlet(1,'poll',4);request('PING');textStatus('Identifying '+memory.port);}
    else {outlet(2,'connect',memory.host);textStatus('Connecting '+memory.host);}
}
function serialports(){var args=arrayfromargs(arguments);serialDiagnostics.push(args.join(' '));if(serialDiagnostics.length>5)serialDiagnostics.shift();if(args.shift()==='port')textStatus('USB ports: '+args.join(' '));}
function serialbytes(){
    if(mode!=='usb')return;var bytes=arrayfromargs(arguments);
    for(var i=0;i<bytes.length;i++){
        var b=Number(bytes[i]);if(b===10){if(!serialDropping)serialLine(lineBuffer);lineBuffer='';serialDropping=false;}
        else if(b!==13){if(lineBuffer.length>=16384){serialDropping=true;lineBuffer='';}if(!serialDropping)lineBuffer+=String.fromCharCode(b);}
    }
}
function serialLine(line){
    if(line.indexOf('@M ')===0){if(values.source===1){var a=line.slice(3).split(' ');for(var i=0;i<a.length;i++)midiByte(parseInt(a[i],16));}return;}
    if(line.indexOf('@R ')!==0)return;var ix=line.indexOf(' ',3);if(ix<0)return;
    var tag=line.slice(3,ix),payload;try{payload=JSON.parse(line.slice(ix+1));}catch(e){return;}
    if(inflight&&inflight.tag===tag){if(payload.ok===0){textStatus('BECA rejected '+(inflight.key||tag));pending={};}inflight=null;}
    if(tag==='PING'){connected=true;monitor('connected',1);textStatus('USB connected: '+memory.port);request('PARAMS');}
    else receive(tag.toLowerCase(),payload);
}
function request(tag){
    if(mode==='usb'){if(!inflight){outlet(1,ascii('@C '+tag+'\n'));inflight={tag:tag,at:now()};}}
    else if(mode==='wifi')outlet(2,'read',tag.toLowerCase());
}
function ascii(s){var b=[];for(var i=0;i<s.length;i++)b.push(s.charCodeAt(i));return b;}
function queue(k,v){
    if(!connected){textStatus('Connect BECA to change hardware');return;}
    if(k==='ts'){if(defs.ts.enum.indexOf(v)<0)return;pending[k]=v;}
    else {if(!finite(Number(v)))return;pending[k]=Number(v);}edits[k]=now();
}
function tick(){
    var t=now();
    if(lastPlant&&t-lastPlant>1500){dsp('sensor_hz',0);monitor('stale',1);lastPlant=0;}
    if(mode==='usb'){
        if(inflight&&t-inflight.at>1800){post('BECA serial timeout '+JSON.stringify({request:inflight.tag,status:serialDiagnostics,partial:lineBuffer.slice(0,120)})+'\n');disconnect();textStatus('USB response timed out; reconnect (edits were cleared)');return;}
        if(!connected&&t-openedAt>4000){disconnect();textStatus('No BECA reply; check USB port and close the app bridge');return;}
        if(connected&&t>=nextHeartbeat){outlet(1,ascii('@C SERIAL_HOST\n'));nextHeartbeat=t+1000;}
    }
    if(!connected)return;
    if(!inflight&&t-lastWrite>=50){
        for(var key in pending){var val=pending[key];delete pending[key];lastWrite=t;
            if(mode==='usb'){outlet(1,ascii('@C SET '+key+' '+val+'\n'));inflight={tag:'SET',key:key,at:t};}
            else {outlet(2,'write',key,val);inflight={tag:'SET',key:key,at:t};}return;}
    }
    if(!inflight&&t>=nextLive){request('LIVE');nextLive=t+500;}
    else if(!inflight&&t>=nextSynth){request('SYNTH');nextSynth=t+2000;}
}
function receive(tag,p){
    if(tag==='live'){if(p.state)receive('state',p.state);if(p.plant)receive('plant',p.plant);return;}
    if(tag==='plant'){
        var energy=Number(p.value),raw=Number(p.raw);if(!finite(energy)||!finite(raw)||energy<0||energy>1||raw<0||raw>4095)return;
        lastPlant=now();dsp('sensor_hz',p.connected===false||p.connected===0?0:raw);monitor('plant',energy,raw,Number(p.raw2)||0);return;
    }
    if(tag==='state'){
        var aliases={nr:'norep',note_length_idx:'note_length'};applying=true;
        for(var k in p){var key=aliases[k]||k;if(defs[key]&&defs[key].hardware&&!(key in pending)&&(!inflight||inflight.key!==key)&&now()-(edits[key]||0)>1500){var val=key==='ts'?defs.ts.enum.indexOf(String(p[k]).replace('/','-')):Number(p[k]);if(finite(val)&&val>=defs[key].min)put.call(this,key,val);}}
        applying=false;return;
    }
    if(tag==='params'){monitor('firmware',p.synth_presets?p.synth_presets.length:0);return;}
    if(tag==='synth'){
        synthSnapshot=p;if(waitingPull){waitingPull=false;applying=true;panic();for(var q in p)if(defs[q]&&!defs[q].hardware)put.call(this,q,Number(p[q]));applying=false;dsp('raw_mode',values.preset===12?1:0);textStatus('Read BECA sound into Live');}return;
    }
}
function hardware(tag,json){if(mode!=='wifi')return;try{receive(tag,JSON.parse(json));}catch(e){}}
function httpstatus(ok,detail){if(mode!=='wifi')return;connected=Number(ok)===1;monitor('connected',connected?1:0);textStatus(String(detail));if(!connected){pending={};inflight=null;dsp('sensor_hz',0);if(values.source===1)panic();}}
function ack(ok,key){if(mode!=='wifi')return;inflight=null;if(!Number(ok)){pending={};textStatus('BECA rejected '+key+'; edits cleared');}}
function remote_notes(json){
    if(mode!=='wifi'||values.source!==1)return;var p;try{p=JSON.parse(json);}catch(e){return;}
    var notes=p.notes||[];for(var i=0;i<noteSnapshot.length;i++)if(notes.indexOf(noteSnapshot[i])<0)note(noteSnapshot[i],0,1);
    for(var j=0;j<notes.length;j++)if(noteSnapshot.indexOf(notes[j])<0)note(Number(notes[j]),Number(p.vel)||80,1);noteSnapshot=notes.slice(0,8);
}
function notifydeleted(){if(tickTask)tickTask.cancel();if(tempoObserver)tempoObserver.property='';if(transportObserver)transportObserver.property='';disconnect();panic();}
