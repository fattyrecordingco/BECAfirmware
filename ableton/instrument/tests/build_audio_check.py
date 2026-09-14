"""Create a local-only Live test device that records the actual Gen engine."""
import importlib.util
import json
from pathlib import Path
import shutil
import struct

folder=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('builder',folder/'build_instrument.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
builder.build()
output=builder.ROOT/'.beca-cache/instrument-audio'
output.mkdir(parents=True,exist_ok=True)
target=Path.home()/'OneDrive/Documents/Ableton/User Library/Presets/Instruments/Max Instrument/BECA Instrument QA'
target.mkdir(parents=True,exist_ok=True)
for name in ['beca_instrument.js','beca_spec.js','beca_monitor.js','beca_http.js']:
    shutil.copy2(folder/name,target/name)
patch=json.loads((folder/'BECA Instrument.maxpat').read_text())['patcher']
for entry in patch['boxes']:
    if entry['box']['id']=='title':entry['box']['text']='BECA AUDIO CHECK'
patch['boxes'] += [dict(box=dict(id='qa',maxclass='newobj',text='js beca_audio_check.js',numinlets=1,numoutlets=3,patching_rect=[0,850,200,22])),dict(box=dict(id='record',maxclass='newobj',text='sfrecord~ 2',numinlets=2,numoutlets=1,patching_rect=[0,900,120,22]))]
for a,ao,b,bi in [('load',0,'qa',0),('qa',0,'runtime',0),('qa',1,'record',0),('qa',2,'engine',0),('engine',0,'record',0),('engine',1,'record',1)]:
    patch['lines'].append(dict(patchline=dict(source=[a,ao],destination=[b,bi])))
driver=r'''
inlets=1;outlets=3;var pending=[],started=false;
function later(ms,fn){var t=new Task(fn,this);pending.push(t);t.schedule(ms);}
function bang(){
 if(started)return;started=true;
 for(var i=0;i<14;i++)(function(n){
   var start=3000+n*3200;
   later(start,function(){outlet(0,'panic');outlet(0,'param','preset',Math.min(n,12));outlet(0,'param','master',.18);outlet(1,'open',OUTPUT+'/preset-'+n+'.wav');});
   later(start+150,function(){outlet(1,1);});
   later(start+250,function(){if(n<12){outlet(0,'note',60,100,1);}else if(n===12){outlet(2,'sensor_hz',440);}else{outlet(0,'panic');outlet(2,'sensor_hz',0);}});
   later(start+2100,function(){outlet(0,'note',60,0,1);if(n===12)outlet(2,'sensor_hz',0);});
   later(start+2900,function(){outlet(1,0);});
 })(i);
 later(48500,function(){outlet(0,'panic');post('BECA_AUDIO_CHECK_COMPLETE\n');});
}
function notifydeleted(){for(var i=0;i<pending.length;i++)pending[i].cancel();}
'''.replace('OUTPUT',json.dumps(output.as_posix()))
(target/'beca_audio_check.js').write_text(driver)
raw=json.dumps(dict(patcher=patch)).encode()+b'\0'
(target/'BECA Instrument QA.amxd').write_bytes(b'ampf'+struct.pack('<I',4)+b'iiii'+b'meta'+struct.pack('<II',4,0)+b'ptch'+struct.pack('<I',len(raw))+raw)
print(target/'BECA Instrument QA.amxd')
print(output)
