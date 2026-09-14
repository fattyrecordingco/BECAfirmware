"""Build BECA's native Max instrument and a portable, dependency-free package."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import struct
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
GREEN = [0, .51, .32, 1]
FIELDS = dict(waveA='wave_a', waveB='wave_b', oscMix='osc_mix', maxVoices='voices',
              filterType='filter', cutoffHz='cutoff', delayMs='delay_ms',
              delayFeedback='delay_feedback', delayMix='delay_mix', distDrive='drive',
              detuneCents='detune', gainTrim='gain_trim', drumKit='drumkit')


def presets():
    source = (ROOT / 'synth_engine.cpp').read_text()
    names = re.findall(r'"([^"]+)"', source.split('kPresetNames')[1].split('};')[0])
    body = source.split('void SynthEngine::presetDefaults')[1].split('void SynthEngine::sanitizeParams')[0]
    base, cases = body.split('switch (idx)', 1)

    def assignments(text, values):
        for stmt in text.split(';'):
            match = re.search(r'(out\.\w+\s*=\s*(?:out\.\w+\s*=\s*)*)([-\d.]+f?|SYNTH_FILTER_\w+)\s*$', stmt)
            if not match:
                continue
            val = match[2]
            val = {'SYNTH_FILTER_LOWPASS': '0', 'SYNTH_FILTER_HIGHPASS': '1', 'SYNTH_FILTER_BANDPASS': '2'}.get(val, val)
            for key in re.findall(r'out\.(\w+)', match[1]):
                values[FIELDS.get(key, key)] = float(val.rstrip('f'))

    defaults = {}
    assignments(base, defaults)
    result = []
    for n, name in enumerate(names):
        value = dict(defaults, preset=n)
        label = 'kRawSinePreset' if n == 12 else str(n)
        case = re.search(r'case ' + label + r':(.*?)break;', cases, re.S)
        if not case:
            raise ValueError(f'Missing firmware preset {name}')
        assignments(case[1], value)
        result.append(dict(name=name, values=value))
    assert len(result) == 13
    return result


def specification():
    p = presets()
    controls = []

    def c(key, label, page, lo, hi, default, enum=None, integer=False, hw=False):
        controls.append(dict(key=key, label=label, page=page, min=lo, max=hi,
                             default=default, enum=enum, integer=integer or bool(enum), hardware=hw))

    def s(key, label, page, lo, hi, enum=None, integer=False):
        c(key, label, page, lo, hi, p[0]['values'][key], enum, integer)

    c('preset', 'Soundscape', -1, 0, 12, 0, [x['name'] for x in p])
    s('master', 'Volume', -1, 0, 1)
    c('mute', 'Mute', -1, 0, 1, 0, ['Off', 'On'])
    c('source', 'Note source', -1, 0, 1, 0, ['Live MIDI', 'BECA device'])
    s('wave_a', 'Wave A', 0, 0, 3, ['Saw', 'Square', 'Triangle', 'Sine'])
    s('wave_b', 'Wave B', 0, 0, 3, ['Saw', 'Square', 'Triangle', 'Sine'])
    for key, label, lo, hi in [('osc_mix','Blend',0,1),('detune','Detune ct',0,8),('gain_trim','Gain trim',.45,1)]:
        s(key,label,0,lo,hi)
    s('mono','Mono',0,0,1,['Poly','Mono'])
    s('voices','Voices',0,1,8,integer=True)
    for key,label,lo,hi in [('attack','Attack s',.001,5),('decay','Decay s',.001,5),('sustain','Sustain',0,1),('release','Release s',.001,10),('cutoff','Cutoff Hz',20,18000),('resonance','Resonance',.1,10)]:
        s(key,label,1,lo,hi)
    s('filter','Filter',1,0,2,['Low pass','High pass','Band pass'])
    for key,label,hi in [('reverb','Reverb',1),('delay_ms','Delay ms',800),('delay_mix','Delay mix',1),('delay_feedback','Feedback',.95),('drive','Drive',1)]:
        s(key,label,2,0,hi)
    c('drums','Local drums',2,0,1,1,['Off','On'])
    c('depth','Mutation',2,0,1,.2)
    c('sens','Sensitivity',3,0,.5,.25,hw=True)
    c('mode','Playing mode',3,0,3,0,['Notes','Arpeggiator','Chords','Drum Machine'],hw=True)
    scales=['Major','Minor','Dorian','Lydian','Mixolydian','Pent Minor','Pent Major','Harm Minor','Phrygian','Whole Tone','Maj7','Min7','Dom7','Sus2','Sus4']
    c('scale','Scale',3,0,14,0,scales,hw=True)
    c('root','Root',3,0,11,0,['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],hw=True)
    c('lo','Low octave',3,1,8,3,integer=True,hw=True)
    c('hi','High octave',3,1,8,6,integer=True,hw=True)
    c('norep','No repeat',3,0,1,0,['Off','On'],hw=True)
    for key,label,lo,hi,d in [('bpm','BECA BPM',20,240,120),('swing','Swing %',0,60,0),('rest','Rest chance',0,.8,.1)]:
        c(key,label,4,lo,hi,d,hw=True)
    c('clock','BECA clock',4,0,1,0,['Internal','Plant pulses'],hw=True)
    c('note_length','Note length',4,0,7,2,['1/32','1/16t','1/16','1/8t','1/8','1/4','1/2','1/1'],hw=True)
    c('ts','Time signature',4,0,12,4,['1-1','2-2','2-4','3-4','4-4','5-4','7-4','6-8','9-8','12-8','4-8','4-16','8-32'],hw=True)
    c('follow_tempo','Follow Live BPM',4,0,1,0,['Off','On'])
    c('outputmode','Device output',5,0,3,1,['BLE MIDI','USB MIDI','Aux','USB + Aux'],hw=True)
    c('daw_sync','External clock',5,0,1,0,['Off','On'],hw=True)
    c('drumsel','Drum mask',5,0,255,0,integer=True,hw=True)
    for key,label,d in [('bright','Brightness',100),('vs','Motion',100),('vi','Intensity',100)]:
        c(key,label,6,10 if key=='bright' else 0,255,d,integer=True,hw=True)
    c('fx','LED effect',6,0,9,0,['Gradient Flow','Palette Wave','Soft Sweep','Comet Trails','Juggle','Glitter Veil','Quiet Fire','Neon Bars','Sparkle Mist','Split Fade'],hw=True)
    c('pal','LED palette',6,0,19,0,['Rainbow','Rainbow Stripe','Cloud','Ocean','Forest','Lava','Heat','Party','Sunset','Ocean Deep','Forest Glow','Cosmic','Aurora','Ice Blue','Heat Soft','Vintage','Pastel','Retro','Mojito','Tea Rose'],hw=True)
    c('send_sound','Send sound edits',6,0,1,0,['Local only','Local + hardware'])
    return dict(version='0.1.0', firmware='1.1.0', presets=p, controls=controls,
                pages=['Oscillators','Envelope / filter','Space / play','Plant / harmony','Timing','Device output','Lights / link','Connect'])


class Patch:
    def __init__(self, namespace='box'):
        self.p=dict(fileversion=1,appversion=dict(major=8,minor=6,revision=2,architecture='x64',modernui=1),
                    classnamespace=namespace,rect=[0,0,1200,780],openinpresentation=1,
                    devicewidth=1190,openrect=[0,0,1190,169],bgcolor=[.95,.96,.94,1],
                    default_fontname='Arial',default_fontsize=11,boxes=[],lines=[])

    def box(self, id, text=None, cls='newobj', rect=None, **extra):
        b=dict(id=id,maxclass=cls,patching_rect=rect or [10,220+len(self.p['boxes'])*24,160,22])
        if text is not None: b['text']=text
        b.update(extra)
        self.p['boxes'].append(dict(box=b))
        return id

    def line(self,a,b,ao=0,bi=0):
        self.p['lines'].append(dict(patchline=dict(source=[a,ao],destination=[b,bi])))


def engine_code():
    head=(HERE/'engine.genexpr').read_text()
    declarations=[]
    voices=[]
    for i in range(8):
        n=str(i+1)
        declarations.append(f'Param n{n}(60); Param v{n}(0); Param g{n}(0); Param t{n}(0); Param b{n}(0);')
        declarations.append(f'History pa{n}(0); History pb{n}(0); History e{n}(0); History st{n}(0); History last{n}(0);')
        voices.append(f'''
if (t{n} != last{n}) {{ st{n}=1; last{n}=t{n}; }}
if (g{n} == 0 && st{n} > 0 && st{n} < 4) {{ st{n}=4; }}
if (clearing) {{ st{n}=0; e{n}=0; }}
if (st{n} == 1) {{ e{n}=min(1,e{n}+ai); if (e{n}>=1) {{ st{n}=2; }} }}
else if (st{n} == 2) {{ e{n}=max(sustain,e{n}-di); if (e{n}<=sustain) {{ st{n}=3; }} }}
else if (st{n} == 3) {{ e{n}=sustain; }}
else if (st{n} == 4) {{ e{n}=max(0,e{n}-ri); if (e{n}<=0) {{ st{n}=0; }} }}
hz{n}=440*pow(2,(n{n}+b{n}-69)/12);
pa{n}=wrap(pa{n}+hz{n}/samplerate,0,1);
pb{n}=wrap(pb{n}+hz{n}*pow(2,detune*clamp((n{n}-24)/60,.35,1)/1200)/samplerate,0,1);
sumvoice += ((1-osc_mix)*oscillator(pa{n},wave_a)+osc_mix*oscillator(pb{n},wave_b))*e{n}*v{n};
active += st{n}>0;
''')
    return head.replace('// VOICE_DECLARATIONS', '\n'.join(declarations)).replace('// VOICES', '\n'.join(voices))


def build():
    spec=specification()
    (HERE/'beca_spec.js').write_text('var BECA_SPEC = '+json.dumps(spec,separators=(',',':'))+';\n',encoding='utf-8',newline='\n')
    (HERE/'presets.json').write_text(json.dumps(spec['presets'],indent=2)+'\n',encoding='utf-8',newline='\n')
    p=Patch()
    p.box('runtime','js beca_instrument.js',varname='beca_runtime',numinlets=1,numoutlets=4)
    p.box('engine','gen~',numinlets=1,numoutlets=2,patcher=dict(fileversion=1,classnamespace='dsp.gen',rect=[0,0,960,640],boxes=[dict(box=dict(id='dsp',maxclass='codebox',numinlets=0,numoutlets=2,code=engine_code(),patching_rect=[0,0,940,620]))],lines=[]))
    gen=p.p['boxes'][-1]['box']['patcher']
    for i in range(2):
        gen['boxes'].append(dict(box=dict(id='out'+str(i),maxclass='newobj',text='out '+str(i+1),numinlets=1,numoutlets=0,patching_rect=[10+i*100,650,60,22])))
        gen['lines'].append(dict(patchline=dict(source=['dsp',i],destination=['out'+str(i),0])))
    p.box('audio','plugout~',numinlets=2,numoutlets=0)
    p.line('runtime','engine');p.line('engine','audio');p.line('engine','audio',1,1)
    p.box('midi','midiin');p.box('midi-msg','prepend midi');p.line('midi','midi-msg');p.line('midi-msg','runtime')
    p.box('load','live.thisdevice');p.box('init','deferlow');p.box('init-msg','init',cls='message')
    p.line('load','init');p.line('init','init-msg');p.line('init-msg','runtime')
    p.box('enabled','prepend enabled');p.line('load','enabled',1);p.line('enabled','runtime')
    # Create serial only on explicit connection, after a hot-plugged port exists.
    p.box('serdata','prepend serialbytes',varname='beca_serdata');p.line('serdata','runtime')
    p.box('serports','prepend serialports',varname='beca_serports');p.line('serports','runtime')
    p.box('http','node.script beca_http.js @autostart 1');p.line('runtime','http',2);p.line('http','runtime')
    p.box('memory','pattr beca_memory @bindto beca_runtime @parameter_enable 1',varname='beca_memory',saved_object_attributes=dict(parameter_enable=1),saved_attribute_attributes=dict(valueof=dict(parameter_longname='BECA memory',parameter_shortname='Memory',parameter_type=3,parameter_invisible=1)))
    p.box('monitor',cls='jsui',filename='beca_monitor.js',varname='beca_monitor',numinlets=1,numoutlets=1,rect=[946,6,236,156],presentation=1,presentation_rect=[946,6,236,156])
    p.line('runtime','monitor',3);p.line('monitor','runtime')
    p.box('title','BECA INSTRUMENT',cls='comment',rect=[10,5,210,19],presentation=1,presentation_rect=[10,5,210,19],textcolor=GREEN,fontface=1,fontsize=15)
    p.box('page',cls='tab',varname='page',parameter_enable=0,rect=[238,5,692,24],presentation=1,presentation_rect=[238,5,692,24],numoutlets=3,tabs=['Osc','Env','Effects','Plant','Timing','Output','Lights','Connect'],htabcolor=GREEN)
    p.box('page-msg','prepend page');p.line('page','page-msg');p.line('page-msg','runtime')
    params={'memory':['BECA memory','Memory',0]}
    counts={}
    for ctl in spec['controls']:
        key=ctl['key'];page=ctl['page'];pos=counts.get(page,0);counts[page]=pos+1
        if page==-1:
            rect=[[10,27,214,24],[12,72,56,67],[78,72,60,24],[10,142,214,20]][pos]
        else:
            rect=[244+pos*97,52,88,67]
        ismenu=bool(ctl['enum'])
        attrs=dict(parameter_longname='BECA '+ctl['label'],parameter_shortname=ctl['label'],parameter_type=2 if ismenu else (1 if ctl['integer'] else 0),parameter_mmin=ctl['min'],parameter_mmax=ctl['max'],parameter_initial_enable=1,parameter_initial=[ctl['default']],parameter_unitstyle=0 if ctl['integer'] else 1,parameter_speedlim=0)
        if ismenu: attrs['parameter_enum']=ctl['enum']
        b=p.box('p_'+key,cls='live.menu' if ismenu else 'live.dial',rect=rect,varname='param_'+key,parameter_enable=1,numinlets=1,numoutlets=3 if ismenu else 2,presentation=1,presentation_rect=rect,hidden=int(page>0),saved_attribute_attributes=dict(valueof=attrs),activefgdialcolor=GREEN)
        p.box('msg_'+key,'prepend param '+key);p.line(b,'msg_'+key);p.line('msg_'+key,'runtime')
        if ismenu and key!='preset':
            p.box('label_'+key,ctl['label'],cls='comment',rect=[rect[0],rect[1]-17,rect[2],16],varname='label_'+key,presentation=1,presentation_rect=[rect[0],rect[1]-17,rect[2],16],hidden=int(page>0))
        params[b]=['BECA '+ctl['label'],ctl['label'],0]
    # Persistent controls never share native dial click areas.
    for id,label,x,y,w in [('panic','Panic',148,72,76),('audition','Test note',148,103,76),('mutate','Mutate',245,137,68),('undo','Undo',318,137,57),('save_a','Save A',385,137,65),('recall_a','A',453,137,32),('save_b','Save B',490,137,65),('recall_b','B',558,137,32),('save_c','Save C',595,137,65),('recall_c','C',663,137,32),('save_d','Save D',700,137,65),('recall_d','D',768,137,32),('pull_sound','Read sound',809,137,110)]:
        p.box(id,cls='live.text',text=label,texton=label,mode=0,parameter_enable=0,rect=[x,y,w,20],presentation=1,presentation_rect=[x,y,w,20],varname='button_'+id)
        p.box('act_'+id,'action '+id,cls='message');p.line(id,'act_'+id);p.line('act_'+id,'runtime')
    for id,label,x,w in [('usb','Connect USB',243,110),('wifi','Connect Wi-Fi',360,115),('disconnect','Disconnect',482,103),('ports','Refresh ports',592,113)]:
        p.box('connect_'+id,cls='live.text',text=label,texton=label,mode=0,parameter_enable=0,rect=[x,94,w,22],presentation=1,presentation_rect=[x,94,w,22],hidden=1,varname='connect_'+id)
        p.box('act_connect_'+id,'action '+id,cls='message');p.line('connect_'+id,'act_connect_'+id);p.line('act_connect_'+id,'runtime')
    for name,value,x,w in [('port','COM4',243,225),('host','beca.local',482,225)]:
        p.box('entry_'+name,cls='textedit',text=value,varname='entry_'+name,rect=[x,56,w,25],presentation=1,presentation_rect=[x,56,w,25],hidden=1,keymode=1)
        p.box('route_'+name,'route text');p.box('set_'+name,'prepend address '+name);p.line('entry_'+name,'route_'+name);p.line('route_'+name,'set_'+name);p.line('set_'+name,'runtime')
        p.box('entry_label_'+name,'USB port' if name=='port' else 'Wi-Fi host / IP',cls='comment',varname='entry_label_'+name,rect=[x,37,w,17],presentation=1,presentation_rect=[x,37,w,17],hidden=1)
    p.box('connect_help','Close other apps using USB. Pick BECA device as note source for direct input.',cls='comment',varname='connect_help',rect=[715,39,213,80],presentation=1,presentation_rect=[715,39,213,80],hidden=1,linecount=4)
    params['parameterbanks']={str(i):dict(index=i,name=name,parameters=[('p_'+c['key']) for c in spec['controls'] if c['page']==i][:8]+['-']*(8-len([c for c in spec['controls'] if c['page']==i]))) for i,name in enumerate(spec['pages'][:7])}
    params['inherited_shortname']=1
    p.p['parameters']=params
    # Fit the complete device into Live's standard laptop device lane.
    p.p['devicewidth']=954;p.p['openrect']=[0,0,954,169]
    for entry in p.p['boxes']:
        b=entry['box']
        if 'presentation_rect' not in b:continue
        rect=b['presentation_rect'][:]
        if b['id']=='monitor':rect=[754,6,192,156]
        elif rect[0]>=238:rect=[228+(rect[0]-238)*.72,rect[1],rect[2]*.72,rect[3]]
        b['presentation_rect']=rect;b['patching_rect']=rect
    p.p['dependency_cache']=[dict(name=n,type='TEXT',implicit=1) for n in ['beca_instrument.js','beca_spec.js','beca_monitor.js','beca_http.js']]
    raw=json.dumps(dict(patcher=p.p),indent=2).encode()+b'\0'
    (HERE/'BECA Instrument.maxpat').write_bytes(raw[:-1])
    (HERE/'BECA Instrument.amxd').write_bytes(b'ampf'+struct.pack('<I',4)+b'iiii'+b'meta'+struct.pack('<II',4,0)+b'ptch'+struct.pack('<I',len(raw))+raw)
    return spec


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--install',action='store_true');args=ap.parse_args()
    build()
    (HERE/'LICENSE').write_text((ROOT/'LICENSE').read_text(encoding='utf-8'),encoding='utf-8',newline='\n')
    package=['BECA Instrument.amxd','BECA Instrument.maxpat','beca_instrument.js','beca_spec.js','beca_monitor.js','beca_http.js','presets.json','README.md','VERIFICATION.md','RELEASE_NOTES.md','LICENSE']
    for n in package:
        if not (HERE/n).is_file(): raise SystemExit('Missing package file: '+n)
    (HERE/'SHA256SUMS').write_text(''.join(hashlib.sha256((HERE/n).read_bytes()).hexdigest()+'  '+n+'\n' for n in package),encoding='utf-8',newline='\n')
    out=ROOT/'dist/ableton';out.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(out/'BECA-Instrument-0.1.0.zip','w',zipfile.ZIP_DEFLATED) as z:
        for n in package+['SHA256SUMS']:z.write(HERE/n,'BECA Instrument/'+n)
    archive=out/'BECA-Instrument-0.1.0.zip'
    (out/'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n',encoding='utf-8',newline='\n')
    if args.install:
        home=Path.home();library=home/'OneDrive/Documents/Ableton/User Library'
        if not library.exists():library=home/'Documents/Ableton/User Library'
        target=library/'Presets/Instruments/Max Instrument/BECA Instrument'
        target.mkdir(parents=True,exist_ok=True)
        for n in package+['SHA256SUMS']:shutil.copy2(HERE/n,target/n)
        print('Installed:',target)
    print('Built:',out/'BECA-Instrument-0.1.0.zip')


if __name__=='__main__':main()
