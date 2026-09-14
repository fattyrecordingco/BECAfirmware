{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 8,
      "minor": 6,
      "revision": 2,
      "architecture": "x64",
      "modernui": 1
    },
    "classnamespace": "box",
    "rect": [
      0,
      0,
      1200,
      780
    ],
    "openinpresentation": 1,
    "devicewidth": 954,
    "openrect": [
      0,
      0,
      954,
      169
    ],
    "bgcolor": [
      0.95,
      0.96,
      0.94,
      1
    ],
    "default_fontname": "Arial",
    "default_fontsize": 11,
    "boxes": [
      {
        "box": {
          "id": "runtime",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            220,
            160,
            22
          ],
          "text": "js beca_instrument.js",
          "varname": "beca_runtime",
          "numinlets": 1,
          "numoutlets": 4
        }
      },
      {
        "box": {
          "id": "engine",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            244,
            160,
            22
          ],
          "text": "gen~",
          "numinlets": 1,
          "numoutlets": 2,
          "patcher": {
            "fileversion": 1,
            "classnamespace": "dsp.gen",
            "rect": [
              0,
              0,
              960,
              640
            ],
            "boxes": [
              {
                "box": {
                  "id": "dsp",
                  "maxclass": "codebox",
                  "numinlets": 0,
                  "numoutlets": 2,
                  "code": "// BECA firmware equations ported to native Gen, at the host sample rate.\noscillator(p,w) { return w==0 ? 2*p-1 : w==1 ? (p<.5 ? 1 : -1) : w==2 ? 1-2*abs(2*p-1) : sin(p*twopi); }\nsoftclip(x) { return x*(27+x*x)/(27+9*x*x); }\nParam wave_a(0); Param wave_b(1); Param osc_mix(.45); Param detune(4);\nParam attack(.006); Param decay(.2); Param sustain(.66); Param release(.24);\nParam cutoff(5200); Param resonance(1.7); Param filter(0);\nParam drive(.22); Param gain_trim(.95); Param master(.25); Param mute(0);\nParam reverb(.12); Param delay_ms(115); Param delay_mix(.12); Param delay_feedback(.22);\nParam raw_mode(0); Param sensor_hz(0); Param panic_token(0); Param enabled(1);\nParam kick(0); Param snare(0); Param hat(0); Param percussion(0); Param drum_note(60); Param drum_vel(.5);\nHistory previouspanic(0); History z1(0); History z2(0);\nHistory rvL(0); History rvR(0); History dcxL(0); History dcxR(0); History dcyL(0); History dcyR(0);\nHistory mastergain(0); History rawphase(0); History rawgain(0); History delayhold(0);\nHistory ek(0); History es(0); History eh(0); History ep(0); History pk(0); History pp(0);\nHistory lk(0); History ls(0); History lh(0); History lp(0);\nDelay echo(192001);\nParam n1(60); Param v1(0); Param g1(0); Param t1(0); Param b1(0);\nHistory pa1(0); History pb1(0); History e1(0); History st1(0); History last1(0);\nParam n2(60); Param v2(0); Param g2(0); Param t2(0); Param b2(0);\nHistory pa2(0); History pb2(0); History e2(0); History st2(0); History last2(0);\nParam n3(60); Param v3(0); Param g3(0); Param t3(0); Param b3(0);\nHistory pa3(0); History pb3(0); History e3(0); History st3(0); History last3(0);\nParam n4(60); Param v4(0); Param g4(0); Param t4(0); Param b4(0);\nHistory pa4(0); History pb4(0); History e4(0); History st4(0); History last4(0);\nParam n5(60); Param v5(0); Param g5(0); Param t5(0); Param b5(0);\nHistory pa5(0); History pb5(0); History e5(0); History st5(0); History last5(0);\nParam n6(60); Param v6(0); Param g6(0); Param t6(0); Param b6(0);\nHistory pa6(0); History pb6(0); History e6(0); History st6(0); History last6(0);\nParam n7(60); Param v7(0); Param g7(0); Param t7(0); Param b7(0);\nHistory pa7(0); History pb7(0); History e7(0); History st7(0); History last7(0);\nParam n8(60); Param v8(0); Param g8(0); Param t8(0); Param b8(0);\nHistory pa8(0); History pb8(0); History e8(0); History st8(0); History last8(0);\nclearing = panic_token != previouspanic;\npreviouspanic=panic_token;\nai=1/(max(.001,attack)*samplerate);\ndi=(1-sustain)/(max(.001,decay)*samplerate);\nri=1/(max(.001,release)*samplerate);\nsumvoice=0;active=0;\n\nif (t1 != last1) { st1=1; last1=t1; }\nif (g1 == 0 && st1 > 0 && st1 < 4) { st1=4; }\nif (clearing) { st1=0; e1=0; }\nif (st1 == 1) { e1=min(1,e1+ai); if (e1>=1) { st1=2; } }\nelse if (st1 == 2) { e1=max(sustain,e1-di); if (e1<=sustain) { st1=3; } }\nelse if (st1 == 3) { e1=sustain; }\nelse if (st1 == 4) { e1=max(0,e1-ri); if (e1<=0) { st1=0; } }\nhz1=440*pow(2,(n1+b1-69)/12);\npa1=wrap(pa1+hz1/samplerate,0,1);\npb1=wrap(pb1+hz1*pow(2,detune*clamp((n1-24)/60,.35,1)/1200)/samplerate,0,1);\nsumvoice += ((1-osc_mix)*oscillator(pa1,wave_a)+osc_mix*oscillator(pb1,wave_b))*e1*v1;\nactive += st1>0;\n\n\nif (t2 != last2) { st2=1; last2=t2; }\nif (g2 == 0 && st2 > 0 && st2 < 4) { st2=4; }\nif (clearing) { st2=0; e2=0; }\nif (st2 == 1) { e2=min(1,e2+ai); if (e2>=1) { st2=2; } }\nelse if (st2 == 2) { e2=max(sustain,e2-di); if (e2<=sustain) { st2=3; } }\nelse if (st2 == 3) { e2=sustain; }\nelse if (st2 == 4) { e2=max(0,e2-ri); if (e2<=0) { st2=0; } }\nhz2=440*pow(2,(n2+b2-69)/12);\npa2=wrap(pa2+hz2/samplerate,0,1);\npb2=wrap(pb2+hz2*pow(2,detune*clamp((n2-24)/60,.35,1)/1200)/samplerate,0,1);\nsumvoice += ((1-osc_mix)*oscillator(pa2,wave_a)+osc_mix*oscillator(pb2,wave_b))*e2*v2;\nactive += st2>0;\n\n\nif (t3 != last3) { st3=1; last3=t3; }\nif (g3 == 0 && st3 > 0 && st3 < 4) { st3=4; }\nif (clearing) { st3=0; e3=0; }\nif (st3 == 1) { e3=min(1,e3+ai); if (e3>=1) { st3=2; } }\nelse if (st3 == 2) { e3=max(sustain,e3-di); if (e3<=sustain) { st3=3; } }\nelse if (st3 == 3) { e3=sustain; }\nelse if (st3 == 4) { e3=max(0,e3-ri); if (e3<=0) { st3=0; } }\nhz3=440*pow(2,(n3+b3-69)/12);\npa3=wrap(pa3+hz3/samplerate,0,1);\npb3=wrap(pb3+hz3*pow(2,detune*clamp((n3-24)/60,.35,1)/1200)/samplerate,0,1);\nsumvoice += ((1-osc_mix)*oscillator(pa3,wave_a)+osc_mix*oscillator(pb3,wave_b))*e3*v3;\nactive += st3>0;\n\n\nif (t4 != last4) { st4=1; last4=t4; }\nif (g4 == 0 && st4 > 0 && st4 < 4) { st4=4; }\nif (clearing) { st4=0; e4=0; }\nif (st4 == 1) { e4=min(1,e4+ai); if (e4>=1) { st4=2; } }\nelse if (st4 == 2) { e4=max(sustain,e4-di); if (e4<=sustain) { st4=3; } }\nelse if (st4 == 3) { e4=sustain; }\nelse if (st4 == 4) { e4=max(0,e4-ri); if (e4<=0) { st4=0; } }\nhz4=440*pow(2,(n4+b4-69)/12);\npa4=wrap(pa4+hz4/samplerate,0,1);\npb4=wrap(pb4+hz4*pow(2,detune*clamp((n4-24)/60,.35,1)/1200)/samplerate,0,1);\nsumvoice += ((1-osc_mix)*oscillator(pa4,wave_a)+osc_mix*oscillator(pb4,wave_b))*e4*v4;\nactive += st4>0;\n\n\nif (t5 != last5) { st5=1; last5=t5; }\nif (g5 == 0 && st5 > 0 && st5 < 4) { st5=4; }\nif (clearing) { st5=0; e5=0; }\nif (st5 == 1) { e5=min(1,e5+ai); if (e5>=1) { st5=2; } }\nelse if (st5 == 2) { e5=max(sustain,e5-di); if (e5<=sustain) { st5=3; } }\nelse if (st5 == 3) { e5=sustain; }\nelse if (st5 == 4) { e5=max(0,e5-ri); if (e5<=0) { st5=0; } }\nhz5=440*pow(2,(n5+b5-69)/12);\npa5=wrap(pa5+hz5/samplerate,0,1);\npb5=wrap(pb5+hz5*pow(2,detune*clamp((n5-24)/60,.35,1)/1200)/samplerate,0,1);\nsumvoice += ((1-osc_mix)*oscillator(pa5,wave_a)+osc_mix*oscillator(pb5,wave_b))*e5*v5;\nactive += st5>0;\n\n\nif (t6 != last6) { st6=1; last6=t6; }\nif (g6 == 0 && st6 > 0 && st6 < 4) { st6=4; }\nif (clearing) { st6=0; e6=0; }\nif (st6 == 1) { e6=min(1,e6+ai); if (e6>=1) { st6=2; } }\nelse if (st6 == 2) { e6=max(sustain,e6-di); if (e6<=sustain) { st6=3; } }\nelse if (st6 == 3) { e6=sustain; }\nelse if (st6 == 4) { e6=max(0,e6-ri); if (e6<=0) { st6=0; } }\nhz6=440*pow(2,(n6+b6-69)/12);\npa6=wrap(pa6+hz6/samplerate,0,1);\npb6=wrap(pb6+hz6*pow(2,detune*clamp((n6-24)/60,.35,1)/1200)/samplerate,0,1);\nsumvoice += ((1-osc_mix)*oscillator(pa6,wave_a)+osc_mix*oscillator(pb6,wave_b))*e6*v6;\nactive += st6>0;\n\n\nif (t7 != last7) { st7=1; last7=t7; }\nif (g7 == 0 && st7 > 0 && st7 < 4) { st7=4; }\nif (clearing) { st7=0; e7=0; }\nif (st7 == 1) { e7=min(1,e7+ai); if (e7>=1) { st7=2; } }\nelse if (st7 == 2) { e7=max(sustain,e7-di); if (e7<=sustain) { st7=3; } }\nelse if (st7 == 3) { e7=sustain; }\nelse if (st7 == 4) { e7=max(0,e7-ri); if (e7<=0) { st7=0; } }\nhz7=440*pow(2,(n7+b7-69)/12);\npa7=wrap(pa7+hz7/samplerate,0,1);\npb7=wrap(pb7+hz7*pow(2,detune*clamp((n7-24)/60,.35,1)/1200)/samplerate,0,1);\nsumvoice += ((1-osc_mix)*oscillator(pa7,wave_a)+osc_mix*oscillator(pb7,wave_b))*e7*v7;\nactive += st7>0;\n\n\nif (t8 != last8) { st8=1; last8=t8; }\nif (g8 == 0 && st8 > 0 && st8 < 4) { st8=4; }\nif (clearing) { st8=0; e8=0; }\nif (st8 == 1) { e8=min(1,e8+ai); if (e8>=1) { st8=2; } }\nelse if (st8 == 2) { e8=max(sustain,e8-di); if (e8<=sustain) { st8=3; } }\nelse if (st8 == 3) { e8=sustain; }\nelse if (st8 == 4) { e8=max(0,e8-ri); if (e8<=0) { st8=0; } }\nhz8=440*pow(2,(n8+b8-69)/12);\npa8=wrap(pa8+hz8/samplerate,0,1);\npb8=wrap(pb8+hz8*pow(2,detune*clamp((n8-24)/60,.35,1)/1200)/samplerate,0,1);\nsumvoice += ((1-osc_mix)*oscillator(pa8,wave_a)+osc_mix*oscillator(pb8,wave_b))*e8*v8;\nactive += st8>0;\n\nif (clearing) { z1=0;z2=0;rvL=0;rvR=0;dcxL=0;dcxR=0;dcyL=0;dcyR=0;delayhold=samplerate*.801;ek=0;es=0;eh=0;ep=0; }\nmono=sumvoice*.25/sqrt(max(1,active))*gain_trim;\ndg=1+drive*5.5;\nmono=softclip(mono*dg)/dg;\nw0=twopi*clamp(cutoff,20,min(18000,samplerate*.45))/samplerate;\nc=cos(w0);a=sin(w0)/(2*clamp(resonance,.1,10));a0=1+a;\nfb0=filter==0 ? (1-c)*.5/a0 : filter==1 ? (1+c)*.5/a0 : a/a0;\nfb1=filter==0 ? (1-c)/a0 : filter==1 ? -(1+c)/a0 : 0;\nfb2=filter==2 ? -fb0 : fb0;\na1=-2*c/a0;a2=(1-a)/a0;\nfiltered=fb0*mono+z1;z1=fb1*mono-a1*filtered+z2;z2=fb2*mono-a2*filtered;\nif (kick!=lk) { ek=drum_vel;lk=kick;pk=0; }\nif (snare!=ls) { es=drum_vel;ls=snare; }\nif (hat!=lh) { eh=drum_vel;lh=hat; }\nif (percussion!=lp) { ep=drum_vel;lp=percussion;pp=0; }\nek=ek*exp(-1/(.16*samplerate));es=es*exp(-1/(.11*samplerate));eh=eh*exp(-1/(.035*samplerate));ep=ep*exp(-1/(.19*samplerate));\npk=wrap(pk+(48+ek*100)/samplerate,0,1);pp=wrap(pp+440*pow(2,(drum_note-69)/12)/samplerate,0,1);\ndrum=sin(pk*twopi)*ek*.25+noise()*es*.10+noise()*eh*.07+sin(pp*twopi)*ep*.18;\nmix=filtered+drum;\nd=echo.read(clamp(delay_ms*samplerate/1000,1,min(192000,samplerate*.8)));\ndelayhold=max(0,delayhold-1);\nd=delayhold>0 ? 0 : d;\necho.write(trunc(clamp(mix+d*delay_feedback,-1,1)*127)/127);\nmix=mix*(1-delay_mix)+d*delay_mix;\nrvL=rvL*.974+mix*.026;rvR=rvR*.972+mix*.028;\nleft=mix+(rvL*.62+rvR*.15)*reverb;\nright=mix+(rvR*.62+rvL*.15)*reverb;\nmg=master*(drive>.8 ? .92 : 1);\nleft=left*mg;right=right*mg;\ndcl=left-dcxL+.995*dcyL;dcr=right-dcxR+.995*dcyR;\ndcxL=left;dcxR=right;dcyL=dcl;dcyR=dcr;\nleft=softclip(dcl*1.6)/1.6;right=softclip(dcr*1.6)/1.6;\nrawphase=wrap(rawphase+clamp(sensor_hz,0,4095)/samplerate,0,1);\nrawgain=rawgain+clamp((sensor_hz>0 ? master*.25 : 0)-rawgain,-1/(.005*samplerate),1/(.005*samplerate));\nraw=sin(rawphase*twopi)*rawgain;\nmastergain=mastergain+clamp((enabled*(1-mute))-mastergain,-1/(.005*samplerate),1/(.005*samplerate));\nout1=clamp((raw_mode ? raw : left)*mastergain,-1,1);\nout2=clamp((raw_mode ? raw : right)*mastergain,-1,1);\n",
                  "patching_rect": [
                    0,
                    0,
                    940,
                    620
                  ]
                }
              },
              {
                "box": {
                  "id": "out0",
                  "maxclass": "newobj",
                  "text": "out 1",
                  "numinlets": 1,
                  "numoutlets": 0,
                  "patching_rect": [
                    10,
                    650,
                    60,
                    22
                  ]
                }
              },
              {
                "box": {
                  "id": "out1",
                  "maxclass": "newobj",
                  "text": "out 2",
                  "numinlets": 1,
                  "numoutlets": 0,
                  "patching_rect": [
                    110,
                    650,
                    60,
                    22
                  ]
                }
              }
            ],
            "lines": [
              {
                "patchline": {
                  "source": [
                    "dsp",
                    0
                  ],
                  "destination": [
                    "out0",
                    0
                  ]
                }
              },
              {
                "patchline": {
                  "source": [
                    "dsp",
                    1
                  ],
                  "destination": [
                    "out1",
                    0
                  ]
                }
              }
            ]
          }
        }
      },
      {
        "box": {
          "id": "audio",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            268,
            160,
            22
          ],
          "text": "plugout~",
          "numinlets": 2,
          "numoutlets": 0
        }
      },
      {
        "box": {
          "id": "midi",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            292,
            160,
            22
          ],
          "text": "midiin"
        }
      },
      {
        "box": {
          "id": "midi-msg",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            316,
            160,
            22
          ],
          "text": "prepend midi"
        }
      },
      {
        "box": {
          "id": "load",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            340,
            160,
            22
          ],
          "text": "live.thisdevice"
        }
      },
      {
        "box": {
          "id": "init",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            364,
            160,
            22
          ],
          "text": "deferlow"
        }
      },
      {
        "box": {
          "id": "init-msg",
          "maxclass": "message",
          "patching_rect": [
            10,
            388,
            160,
            22
          ],
          "text": "init"
        }
      },
      {
        "box": {
          "id": "enabled",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            412,
            160,
            22
          ],
          "text": "prepend enabled"
        }
      },
      {
        "box": {
          "id": "serdata",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            436,
            160,
            22
          ],
          "text": "prepend serialbytes",
          "varname": "beca_serdata"
        }
      },
      {
        "box": {
          "id": "serports",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            460,
            160,
            22
          ],
          "text": "prepend serialports",
          "varname": "beca_serports"
        }
      },
      {
        "box": {
          "id": "http",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            484,
            160,
            22
          ],
          "text": "node.script beca_http.js @autostart 1"
        }
      },
      {
        "box": {
          "id": "memory",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            508,
            160,
            22
          ],
          "text": "pattr beca_memory @bindto beca_runtime @parameter_enable 1",
          "varname": "beca_memory",
          "saved_object_attributes": {
            "parameter_enable": 1
          },
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA memory",
              "parameter_shortname": "Memory",
              "parameter_type": 3,
              "parameter_invisible": 1
            }
          }
        }
      },
      {
        "box": {
          "id": "monitor",
          "maxclass": "jsui",
          "patching_rect": [
            754,
            6,
            192,
            156
          ],
          "filename": "beca_monitor.js",
          "varname": "beca_monitor",
          "numinlets": 1,
          "numoutlets": 1,
          "presentation": 1,
          "presentation_rect": [
            754,
            6,
            192,
            156
          ]
        }
      },
      {
        "box": {
          "id": "title",
          "maxclass": "comment",
          "patching_rect": [
            10,
            5,
            210,
            19
          ],
          "text": "BECA INSTRUMENT",
          "presentation": 1,
          "presentation_rect": [
            10,
            5,
            210,
            19
          ],
          "textcolor": [
            0,
            0.51,
            0.32,
            1
          ],
          "fontface": 1,
          "fontsize": 15
        }
      },
      {
        "box": {
          "id": "page",
          "maxclass": "tab",
          "patching_rect": [
            228.0,
            5,
            498.24,
            24
          ],
          "varname": "page",
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            228.0,
            5,
            498.24,
            24
          ],
          "numoutlets": 3,
          "tabs": [
            "Osc",
            "Env",
            "Effects",
            "Plant",
            "Timing",
            "Output",
            "Lights",
            "Connect"
          ],
          "htabcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "page-msg",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            604,
            160,
            22
          ],
          "text": "prepend page"
        }
      },
      {
        "box": {
          "id": "p_preset",
          "maxclass": "live.menu",
          "patching_rect": [
            10,
            27,
            214,
            24
          ],
          "varname": "param_preset",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            10,
            27,
            214,
            24
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Soundscape",
              "parameter_shortname": "Soundscape",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 12,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Fatty Neon Lead",
                "Prism Poly Lead",
                "Verdant Pad",
                "Forest Choir Pad",
                "Thick Mono Bass",
                "Rubber Bass",
                "Dewdrop Glass",
                "Moon Garden",
                "Moss Bells",
                "Firefly Pluck",
                "Bubble Reed",
                "Pollen Drift",
                "Raw Sensor Sine"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_preset",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            652,
            160,
            22
          ],
          "text": "prepend param preset"
        }
      },
      {
        "box": {
          "id": "p_master",
          "maxclass": "live.dial",
          "patching_rect": [
            12,
            72,
            56,
            67
          ],
          "varname": "param_master",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            12,
            72,
            56,
            67
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Volume",
              "parameter_shortname": "Volume",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.6
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_master",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            700,
            160,
            22
          ],
          "text": "prepend param master"
        }
      },
      {
        "box": {
          "id": "p_mute",
          "maxclass": "live.menu",
          "patching_rect": [
            78,
            72,
            60,
            24
          ],
          "varname": "param_mute",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            78,
            72,
            60,
            24
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Mute",
              "parameter_shortname": "Mute",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Off",
                "On"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_mute",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            748,
            160,
            22
          ],
          "text": "prepend param mute"
        }
      },
      {
        "box": {
          "id": "label_mute",
          "maxclass": "comment",
          "patching_rect": [
            78,
            55,
            60,
            16
          ],
          "text": "Mute",
          "varname": "label_mute",
          "presentation": 1,
          "presentation_rect": [
            78,
            55,
            60,
            16
          ],
          "hidden": 0
        }
      },
      {
        "box": {
          "id": "p_source",
          "maxclass": "live.menu",
          "patching_rect": [
            10,
            142,
            214,
            20
          ],
          "varname": "param_source",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            10,
            142,
            214,
            20
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Note source",
              "parameter_shortname": "Note source",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Live MIDI",
                "BECA device"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_source",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            820,
            160,
            22
          ],
          "text": "prepend param source"
        }
      },
      {
        "box": {
          "id": "label_source",
          "maxclass": "comment",
          "patching_rect": [
            10,
            125,
            214,
            16
          ],
          "text": "Note source",
          "varname": "label_source",
          "presentation": 1,
          "presentation_rect": [
            10,
            125,
            214,
            16
          ],
          "hidden": 0
        }
      },
      {
        "box": {
          "id": "p_wave_a",
          "maxclass": "live.menu",
          "patching_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "varname": "param_wave_a",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Wave A",
              "parameter_shortname": "Wave A",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 3,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Saw",
                "Square",
                "Triangle",
                "Sine"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_wave_a",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            892,
            160,
            22
          ],
          "text": "prepend param wave_a"
        }
      },
      {
        "box": {
          "id": "label_wave_a",
          "maxclass": "comment",
          "patching_rect": [
            232.32,
            35,
            63.36,
            16
          ],
          "text": "Wave A",
          "varname": "label_wave_a",
          "presentation": 1,
          "presentation_rect": [
            232.32,
            35,
            63.36,
            16
          ],
          "hidden": 0
        }
      },
      {
        "box": {
          "id": "p_wave_b",
          "maxclass": "live.menu",
          "patching_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "varname": "param_wave_b",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Wave B",
              "parameter_shortname": "Wave B",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 3,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                1.0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Saw",
                "Square",
                "Triangle",
                "Sine"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_wave_b",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            964,
            160,
            22
          ],
          "text": "prepend param wave_b"
        }
      },
      {
        "box": {
          "id": "label_wave_b",
          "maxclass": "comment",
          "patching_rect": [
            302.15999999999997,
            35,
            63.36,
            16
          ],
          "text": "Wave B",
          "varname": "label_wave_b",
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            35,
            63.36,
            16
          ],
          "hidden": 0
        }
      },
      {
        "box": {
          "id": "p_osc_mix",
          "maxclass": "live.dial",
          "patching_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "varname": "param_osc_mix",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Blend",
              "parameter_shortname": "Blend",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.45
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_osc_mix",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1036,
            160,
            22
          ],
          "text": "prepend param osc_mix"
        }
      },
      {
        "box": {
          "id": "p_detune",
          "maxclass": "live.dial",
          "patching_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "varname": "param_detune",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Detune ct",
              "parameter_shortname": "Detune ct",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 8,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                4.0
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_detune",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1084,
            160,
            22
          ],
          "text": "prepend param detune"
        }
      },
      {
        "box": {
          "id": "p_gain_trim",
          "maxclass": "live.dial",
          "patching_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "varname": "param_gain_trim",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Gain trim",
              "parameter_shortname": "Gain trim",
              "parameter_type": 0,
              "parameter_mmin": 0.45,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.95
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_gain_trim",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1132,
            160,
            22
          ],
          "text": "prepend param gain_trim"
        }
      },
      {
        "box": {
          "id": "p_mono",
          "maxclass": "live.menu",
          "patching_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "varname": "param_mono",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Mono",
              "parameter_shortname": "Mono",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                1.0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Poly",
                "Mono"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_mono",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1180,
            160,
            22
          ],
          "text": "prepend param mono"
        }
      },
      {
        "box": {
          "id": "label_mono",
          "maxclass": "comment",
          "patching_rect": [
            581.52,
            35,
            63.36,
            16
          ],
          "text": "Mono",
          "varname": "label_mono",
          "presentation": 1,
          "presentation_rect": [
            581.52,
            35,
            63.36,
            16
          ],
          "hidden": 0
        }
      },
      {
        "box": {
          "id": "p_voices",
          "maxclass": "live.dial",
          "patching_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "varname": "param_voices",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "hidden": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Voices",
              "parameter_shortname": "Voices",
              "parameter_type": 1,
              "parameter_mmin": 1,
              "parameter_mmax": 8,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                1.0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_voices",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1252,
            160,
            22
          ],
          "text": "prepend param voices"
        }
      },
      {
        "box": {
          "id": "p_attack",
          "maxclass": "live.dial",
          "patching_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "varname": "param_attack",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Attack s",
              "parameter_shortname": "Attack s",
              "parameter_type": 0,
              "parameter_mmin": 0.001,
              "parameter_mmax": 5,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.006
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_attack",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1300,
            160,
            22
          ],
          "text": "prepend param attack"
        }
      },
      {
        "box": {
          "id": "p_decay",
          "maxclass": "live.dial",
          "patching_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "varname": "param_decay",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Decay s",
              "parameter_shortname": "Decay s",
              "parameter_type": 0,
              "parameter_mmin": 0.001,
              "parameter_mmax": 5,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.2
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_decay",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1348,
            160,
            22
          ],
          "text": "prepend param decay"
        }
      },
      {
        "box": {
          "id": "p_sustain",
          "maxclass": "live.dial",
          "patching_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "varname": "param_sustain",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Sustain",
              "parameter_shortname": "Sustain",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.66
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_sustain",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1396,
            160,
            22
          ],
          "text": "prepend param sustain"
        }
      },
      {
        "box": {
          "id": "p_release",
          "maxclass": "live.dial",
          "patching_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "varname": "param_release",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Release s",
              "parameter_shortname": "Release s",
              "parameter_type": 0,
              "parameter_mmin": 0.001,
              "parameter_mmax": 10,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.24
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_release",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1444,
            160,
            22
          ],
          "text": "prepend param release"
        }
      },
      {
        "box": {
          "id": "p_cutoff",
          "maxclass": "live.dial",
          "patching_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "varname": "param_cutoff",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Cutoff Hz",
              "parameter_shortname": "Cutoff Hz",
              "parameter_type": 0,
              "parameter_mmin": 20,
              "parameter_mmax": 18000,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                5200.0
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_cutoff",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1492,
            160,
            22
          ],
          "text": "prepend param cutoff"
        }
      },
      {
        "box": {
          "id": "p_resonance",
          "maxclass": "live.dial",
          "patching_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "varname": "param_resonance",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Resonance",
              "parameter_shortname": "Resonance",
              "parameter_type": 0,
              "parameter_mmin": 0.1,
              "parameter_mmax": 10,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                1.7
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_resonance",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1540,
            160,
            22
          ],
          "text": "prepend param resonance"
        }
      },
      {
        "box": {
          "id": "p_filter",
          "maxclass": "live.menu",
          "patching_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "varname": "param_filter",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Filter",
              "parameter_shortname": "Filter",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 2,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Low pass",
                "High pass",
                "Band pass"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_filter",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1588,
            160,
            22
          ],
          "text": "prepend param filter"
        }
      },
      {
        "box": {
          "id": "label_filter",
          "maxclass": "comment",
          "patching_rect": [
            651.3599999999999,
            35,
            63.36,
            16
          ],
          "text": "Filter",
          "varname": "label_filter",
          "presentation": 1,
          "presentation_rect": [
            651.3599999999999,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_reverb",
          "maxclass": "live.dial",
          "patching_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "varname": "param_reverb",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Reverb",
              "parameter_shortname": "Reverb",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.12
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_reverb",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1660,
            160,
            22
          ],
          "text": "prepend param reverb"
        }
      },
      {
        "box": {
          "id": "p_delay_ms",
          "maxclass": "live.dial",
          "patching_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "varname": "param_delay_ms",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Delay ms",
              "parameter_shortname": "Delay ms",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 800,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                115.0
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_delay_ms",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1708,
            160,
            22
          ],
          "text": "prepend param delay_ms"
        }
      },
      {
        "box": {
          "id": "p_delay_mix",
          "maxclass": "live.dial",
          "patching_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "varname": "param_delay_mix",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Delay mix",
              "parameter_shortname": "Delay mix",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.12
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_delay_mix",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1756,
            160,
            22
          ],
          "text": "prepend param delay_mix"
        }
      },
      {
        "box": {
          "id": "p_delay_feedback",
          "maxclass": "live.dial",
          "patching_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "varname": "param_delay_feedback",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Feedback",
              "parameter_shortname": "Feedback",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 0.95,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.22
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_delay_feedback",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1804,
            160,
            22
          ],
          "text": "prepend param delay_feedback"
        }
      },
      {
        "box": {
          "id": "p_drive",
          "maxclass": "live.dial",
          "patching_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "varname": "param_drive",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Drive",
              "parameter_shortname": "Drive",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.22
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_drive",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1852,
            160,
            22
          ],
          "text": "prepend param drive"
        }
      },
      {
        "box": {
          "id": "p_drums",
          "maxclass": "live.menu",
          "patching_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "varname": "param_drums",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Local drums",
              "parameter_shortname": "Local drums",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                1
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Off",
                "On"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_drums",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1900,
            160,
            22
          ],
          "text": "prepend param drums"
        }
      },
      {
        "box": {
          "id": "label_drums",
          "maxclass": "comment",
          "patching_rect": [
            581.52,
            35,
            63.36,
            16
          ],
          "text": "Local drums",
          "varname": "label_drums",
          "presentation": 1,
          "presentation_rect": [
            581.52,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_depth",
          "maxclass": "live.dial",
          "patching_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "varname": "param_depth",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Mutation",
              "parameter_shortname": "Mutation",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.2
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_depth",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            1972,
            160,
            22
          ],
          "text": "prepend param depth"
        }
      },
      {
        "box": {
          "id": "p_sens",
          "maxclass": "live.dial",
          "patching_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "varname": "param_sens",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Sensitivity",
              "parameter_shortname": "Sensitivity",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 0.5,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.25
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_sens",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2020,
            160,
            22
          ],
          "text": "prepend param sens"
        }
      },
      {
        "box": {
          "id": "p_mode",
          "maxclass": "live.menu",
          "patching_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "varname": "param_mode",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Playing mode",
              "parameter_shortname": "Playing mode",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 3,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Notes",
                "Arpeggiator",
                "Chords",
                "Drum Machine"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_mode",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2068,
            160,
            22
          ],
          "text": "prepend param mode"
        }
      },
      {
        "box": {
          "id": "label_mode",
          "maxclass": "comment",
          "patching_rect": [
            302.15999999999997,
            35,
            63.36,
            16
          ],
          "text": "Playing mode",
          "varname": "label_mode",
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_scale",
          "maxclass": "live.menu",
          "patching_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "varname": "param_scale",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Scale",
              "parameter_shortname": "Scale",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 14,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Major",
                "Minor",
                "Dorian",
                "Lydian",
                "Mixolydian",
                "Pent Minor",
                "Pent Major",
                "Harm Minor",
                "Phrygian",
                "Whole Tone",
                "Maj7",
                "Min7",
                "Dom7",
                "Sus2",
                "Sus4"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_scale",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2140,
            160,
            22
          ],
          "text": "prepend param scale"
        }
      },
      {
        "box": {
          "id": "label_scale",
          "maxclass": "comment",
          "patching_rect": [
            372.0,
            35,
            63.36,
            16
          ],
          "text": "Scale",
          "varname": "label_scale",
          "presentation": 1,
          "presentation_rect": [
            372.0,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_root",
          "maxclass": "live.menu",
          "patching_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "varname": "param_root",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Root",
              "parameter_shortname": "Root",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 11,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "C",
                "C#",
                "D",
                "D#",
                "E",
                "F",
                "F#",
                "G",
                "G#",
                "A",
                "A#",
                "B"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_root",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2212,
            160,
            22
          ],
          "text": "prepend param root"
        }
      },
      {
        "box": {
          "id": "label_root",
          "maxclass": "comment",
          "patching_rect": [
            441.84000000000003,
            35,
            63.36,
            16
          ],
          "text": "Root",
          "varname": "label_root",
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_lo",
          "maxclass": "live.dial",
          "patching_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "varname": "param_lo",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Low octave",
              "parameter_shortname": "Low octave",
              "parameter_type": 1,
              "parameter_mmin": 1,
              "parameter_mmax": 8,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                3
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_lo",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2284,
            160,
            22
          ],
          "text": "prepend param lo"
        }
      },
      {
        "box": {
          "id": "p_hi",
          "maxclass": "live.dial",
          "patching_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "varname": "param_hi",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA High octave",
              "parameter_shortname": "High octave",
              "parameter_type": 1,
              "parameter_mmin": 1,
              "parameter_mmax": 8,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                6
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_hi",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2332,
            160,
            22
          ],
          "text": "prepend param hi"
        }
      },
      {
        "box": {
          "id": "p_norep",
          "maxclass": "live.menu",
          "patching_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "varname": "param_norep",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA No repeat",
              "parameter_shortname": "No repeat",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Off",
                "On"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_norep",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2380,
            160,
            22
          ],
          "text": "prepend param norep"
        }
      },
      {
        "box": {
          "id": "label_norep",
          "maxclass": "comment",
          "patching_rect": [
            651.3599999999999,
            35,
            63.36,
            16
          ],
          "text": "No repeat",
          "varname": "label_norep",
          "presentation": 1,
          "presentation_rect": [
            651.3599999999999,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_bpm",
          "maxclass": "live.dial",
          "patching_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "varname": "param_bpm",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA BECA BPM",
              "parameter_shortname": "BECA BPM",
              "parameter_type": 0,
              "parameter_mmin": 20,
              "parameter_mmax": 240,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                120
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_bpm",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2452,
            160,
            22
          ],
          "text": "prepend param bpm"
        }
      },
      {
        "box": {
          "id": "p_swing",
          "maxclass": "live.dial",
          "patching_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "varname": "param_swing",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Swing %",
              "parameter_shortname": "Swing %",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 60,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_swing",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2500,
            160,
            22
          ],
          "text": "prepend param swing"
        }
      },
      {
        "box": {
          "id": "p_rest",
          "maxclass": "live.dial",
          "patching_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "varname": "param_rest",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Rest chance",
              "parameter_shortname": "Rest chance",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 0.8,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0.1
              ],
              "parameter_unitstyle": 1,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_rest",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2548,
            160,
            22
          ],
          "text": "prepend param rest"
        }
      },
      {
        "box": {
          "id": "p_clock",
          "maxclass": "live.menu",
          "patching_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "varname": "param_clock",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA BECA clock",
              "parameter_shortname": "BECA clock",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Internal",
                "Plant pulses"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_clock",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2596,
            160,
            22
          ],
          "text": "prepend param clock"
        }
      },
      {
        "box": {
          "id": "label_clock",
          "maxclass": "comment",
          "patching_rect": [
            441.84000000000003,
            35,
            63.36,
            16
          ],
          "text": "BECA clock",
          "varname": "label_clock",
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_note_length",
          "maxclass": "live.menu",
          "patching_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "varname": "param_note_length",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Note length",
              "parameter_shortname": "Note length",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 7,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                2
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "1/32",
                "1/16t",
                "1/16",
                "1/8t",
                "1/8",
                "1/4",
                "1/2",
                "1/1"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_note_length",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2668,
            160,
            22
          ],
          "text": "prepend param note_length"
        }
      },
      {
        "box": {
          "id": "label_note_length",
          "maxclass": "comment",
          "patching_rect": [
            511.68,
            35,
            63.36,
            16
          ],
          "text": "Note length",
          "varname": "label_note_length",
          "presentation": 1,
          "presentation_rect": [
            511.68,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_ts",
          "maxclass": "live.menu",
          "patching_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "varname": "param_ts",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Time signature",
              "parameter_shortname": "Time signature",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 12,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                4
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "1-1",
                "2-2",
                "2-4",
                "3-4",
                "4-4",
                "5-4",
                "7-4",
                "6-8",
                "9-8",
                "12-8",
                "4-8",
                "4-16",
                "8-32"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_ts",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2740,
            160,
            22
          ],
          "text": "prepend param ts"
        }
      },
      {
        "box": {
          "id": "label_ts",
          "maxclass": "comment",
          "patching_rect": [
            581.52,
            35,
            63.36,
            16
          ],
          "text": "Time signature",
          "varname": "label_ts",
          "presentation": 1,
          "presentation_rect": [
            581.52,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_follow_tempo",
          "maxclass": "live.menu",
          "patching_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "varname": "param_follow_tempo",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            651.3599999999999,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Follow Live BPM",
              "parameter_shortname": "Follow Live BPM",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Off",
                "On"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_follow_tempo",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2812,
            160,
            22
          ],
          "text": "prepend param follow_tempo"
        }
      },
      {
        "box": {
          "id": "label_follow_tempo",
          "maxclass": "comment",
          "patching_rect": [
            651.3599999999999,
            35,
            63.36,
            16
          ],
          "text": "Follow Live BPM",
          "varname": "label_follow_tempo",
          "presentation": 1,
          "presentation_rect": [
            651.3599999999999,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_outputmode",
          "maxclass": "live.menu",
          "patching_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "varname": "param_outputmode",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Device output",
              "parameter_shortname": "Device output",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 3,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                1
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "BLE MIDI",
                "USB MIDI",
                "Aux",
                "USB + Aux"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_outputmode",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2884,
            160,
            22
          ],
          "text": "prepend param outputmode"
        }
      },
      {
        "box": {
          "id": "label_outputmode",
          "maxclass": "comment",
          "patching_rect": [
            232.32,
            35,
            63.36,
            16
          ],
          "text": "Device output",
          "varname": "label_outputmode",
          "presentation": 1,
          "presentation_rect": [
            232.32,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_daw_sync",
          "maxclass": "live.menu",
          "patching_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "varname": "param_daw_sync",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA External clock",
              "parameter_shortname": "External clock",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Off",
                "On"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_daw_sync",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            2956,
            160,
            22
          ],
          "text": "prepend param daw_sync"
        }
      },
      {
        "box": {
          "id": "label_daw_sync",
          "maxclass": "comment",
          "patching_rect": [
            302.15999999999997,
            35,
            63.36,
            16
          ],
          "text": "External clock",
          "varname": "label_daw_sync",
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_drumsel",
          "maxclass": "live.dial",
          "patching_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "varname": "param_drumsel",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Drum mask",
              "parameter_shortname": "Drum mask",
              "parameter_type": 1,
              "parameter_mmin": 0,
              "parameter_mmax": 255,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_drumsel",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            3028,
            160,
            22
          ],
          "text": "prepend param drumsel"
        }
      },
      {
        "box": {
          "id": "p_bright",
          "maxclass": "live.dial",
          "patching_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "varname": "param_bright",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            232.32,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Brightness",
              "parameter_shortname": "Brightness",
              "parameter_type": 1,
              "parameter_mmin": 10,
              "parameter_mmax": 255,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                100
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_bright",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            3076,
            160,
            22
          ],
          "text": "prepend param bright"
        }
      },
      {
        "box": {
          "id": "p_vs",
          "maxclass": "live.dial",
          "patching_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "varname": "param_vs",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            302.15999999999997,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Motion",
              "parameter_shortname": "Motion",
              "parameter_type": 1,
              "parameter_mmin": 0,
              "parameter_mmax": 255,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                100
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_vs",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            3124,
            160,
            22
          ],
          "text": "prepend param vs"
        }
      },
      {
        "box": {
          "id": "p_vi",
          "maxclass": "live.dial",
          "patching_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "varname": "param_vi",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 2,
          "presentation": 1,
          "presentation_rect": [
            372.0,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Intensity",
              "parameter_shortname": "Intensity",
              "parameter_type": 1,
              "parameter_mmin": 0,
              "parameter_mmax": 255,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                100
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_vi",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            3172,
            160,
            22
          ],
          "text": "prepend param vi"
        }
      },
      {
        "box": {
          "id": "p_fx",
          "maxclass": "live.menu",
          "patching_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "varname": "param_fx",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA LED effect",
              "parameter_shortname": "LED effect",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 9,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Gradient Flow",
                "Palette Wave",
                "Soft Sweep",
                "Comet Trails",
                "Juggle",
                "Glitter Veil",
                "Quiet Fire",
                "Neon Bars",
                "Sparkle Mist",
                "Split Fade"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_fx",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            3220,
            160,
            22
          ],
          "text": "prepend param fx"
        }
      },
      {
        "box": {
          "id": "label_fx",
          "maxclass": "comment",
          "patching_rect": [
            441.84000000000003,
            35,
            63.36,
            16
          ],
          "text": "LED effect",
          "varname": "label_fx",
          "presentation": 1,
          "presentation_rect": [
            441.84000000000003,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_pal",
          "maxclass": "live.menu",
          "patching_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "varname": "param_pal",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            511.68,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA LED palette",
              "parameter_shortname": "LED palette",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 19,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Rainbow",
                "Rainbow Stripe",
                "Cloud",
                "Ocean",
                "Forest",
                "Lava",
                "Heat",
                "Party",
                "Sunset",
                "Ocean Deep",
                "Forest Glow",
                "Cosmic",
                "Aurora",
                "Ice Blue",
                "Heat Soft",
                "Vintage",
                "Pastel",
                "Retro",
                "Mojito",
                "Tea Rose"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_pal",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            3292,
            160,
            22
          ],
          "text": "prepend param pal"
        }
      },
      {
        "box": {
          "id": "label_pal",
          "maxclass": "comment",
          "patching_rect": [
            511.68,
            35,
            63.36,
            16
          ],
          "text": "LED palette",
          "varname": "label_pal",
          "presentation": 1,
          "presentation_rect": [
            511.68,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "p_send_sound",
          "maxclass": "live.menu",
          "patching_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "varname": "param_send_sound",
          "parameter_enable": 1,
          "numinlets": 1,
          "numoutlets": 3,
          "presentation": 1,
          "presentation_rect": [
            581.52,
            52,
            63.36,
            67
          ],
          "hidden": 1,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "BECA Send sound edits",
              "parameter_shortname": "Send sound edits",
              "parameter_type": 2,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0,
              "parameter_speedlim": 0,
              "parameter_enum": [
                "Local only",
                "Local + hardware"
              ]
            }
          },
          "activefgdialcolor": [
            0,
            0.51,
            0.32,
            1
          ]
        }
      },
      {
        "box": {
          "id": "msg_send_sound",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            3364,
            160,
            22
          ],
          "text": "prepend param send_sound"
        }
      },
      {
        "box": {
          "id": "label_send_sound",
          "maxclass": "comment",
          "patching_rect": [
            581.52,
            35,
            63.36,
            16
          ],
          "text": "Send sound edits",
          "varname": "label_send_sound",
          "presentation": 1,
          "presentation_rect": [
            581.52,
            35,
            63.36,
            16
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "panic",
          "maxclass": "live.text",
          "patching_rect": [
            148,
            72,
            76,
            20
          ],
          "text": "Panic",
          "texton": "Panic",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            148,
            72,
            76,
            20
          ],
          "varname": "button_panic"
        }
      },
      {
        "box": {
          "id": "act_panic",
          "maxclass": "message",
          "patching_rect": [
            10,
            3436,
            160,
            22
          ],
          "text": "action panic"
        }
      },
      {
        "box": {
          "id": "audition",
          "maxclass": "live.text",
          "patching_rect": [
            148,
            103,
            76,
            20
          ],
          "text": "Test note",
          "texton": "Test note",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            148,
            103,
            76,
            20
          ],
          "varname": "button_audition"
        }
      },
      {
        "box": {
          "id": "act_audition",
          "maxclass": "message",
          "patching_rect": [
            10,
            3484,
            160,
            22
          ],
          "text": "action audition"
        }
      },
      {
        "box": {
          "id": "mutate",
          "maxclass": "live.text",
          "patching_rect": [
            233.04,
            137,
            48.96,
            20
          ],
          "text": "Mutate",
          "texton": "Mutate",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            233.04,
            137,
            48.96,
            20
          ],
          "varname": "button_mutate"
        }
      },
      {
        "box": {
          "id": "act_mutate",
          "maxclass": "message",
          "patching_rect": [
            10,
            3532,
            160,
            22
          ],
          "text": "action mutate"
        }
      },
      {
        "box": {
          "id": "undo",
          "maxclass": "live.text",
          "patching_rect": [
            285.6,
            137,
            41.04,
            20
          ],
          "text": "Undo",
          "texton": "Undo",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            285.6,
            137,
            41.04,
            20
          ],
          "varname": "button_undo"
        }
      },
      {
        "box": {
          "id": "act_undo",
          "maxclass": "message",
          "patching_rect": [
            10,
            3580,
            160,
            22
          ],
          "text": "action undo"
        }
      },
      {
        "box": {
          "id": "save_a",
          "maxclass": "live.text",
          "patching_rect": [
            333.84,
            137,
            46.8,
            20
          ],
          "text": "Save A",
          "texton": "Save A",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            333.84,
            137,
            46.8,
            20
          ],
          "varname": "button_save_a"
        }
      },
      {
        "box": {
          "id": "act_save_a",
          "maxclass": "message",
          "patching_rect": [
            10,
            3628,
            160,
            22
          ],
          "text": "action save_a"
        }
      },
      {
        "box": {
          "id": "recall_a",
          "maxclass": "live.text",
          "patching_rect": [
            382.79999999999995,
            137,
            23.04,
            20
          ],
          "text": "A",
          "texton": "A",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            382.79999999999995,
            137,
            23.04,
            20
          ],
          "varname": "button_recall_a"
        }
      },
      {
        "box": {
          "id": "act_recall_a",
          "maxclass": "message",
          "patching_rect": [
            10,
            3676,
            160,
            22
          ],
          "text": "action recall_a"
        }
      },
      {
        "box": {
          "id": "save_b",
          "maxclass": "live.text",
          "patching_rect": [
            409.44,
            137,
            46.8,
            20
          ],
          "text": "Save B",
          "texton": "Save B",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            409.44,
            137,
            46.8,
            20
          ],
          "varname": "button_save_b"
        }
      },
      {
        "box": {
          "id": "act_save_b",
          "maxclass": "message",
          "patching_rect": [
            10,
            3724,
            160,
            22
          ],
          "text": "action save_b"
        }
      },
      {
        "box": {
          "id": "recall_b",
          "maxclass": "live.text",
          "patching_rect": [
            458.4,
            137,
            23.04,
            20
          ],
          "text": "B",
          "texton": "B",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            458.4,
            137,
            23.04,
            20
          ],
          "varname": "button_recall_b"
        }
      },
      {
        "box": {
          "id": "act_recall_b",
          "maxclass": "message",
          "patching_rect": [
            10,
            3772,
            160,
            22
          ],
          "text": "action recall_b"
        }
      },
      {
        "box": {
          "id": "save_c",
          "maxclass": "live.text",
          "patching_rect": [
            485.03999999999996,
            137,
            46.8,
            20
          ],
          "text": "Save C",
          "texton": "Save C",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            485.03999999999996,
            137,
            46.8,
            20
          ],
          "varname": "button_save_c"
        }
      },
      {
        "box": {
          "id": "act_save_c",
          "maxclass": "message",
          "patching_rect": [
            10,
            3820,
            160,
            22
          ],
          "text": "action save_c"
        }
      },
      {
        "box": {
          "id": "recall_c",
          "maxclass": "live.text",
          "patching_rect": [
            534.0,
            137,
            23.04,
            20
          ],
          "text": "C",
          "texton": "C",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            534.0,
            137,
            23.04,
            20
          ],
          "varname": "button_recall_c"
        }
      },
      {
        "box": {
          "id": "act_recall_c",
          "maxclass": "message",
          "patching_rect": [
            10,
            3868,
            160,
            22
          ],
          "text": "action recall_c"
        }
      },
      {
        "box": {
          "id": "save_d",
          "maxclass": "live.text",
          "patching_rect": [
            560.64,
            137,
            46.8,
            20
          ],
          "text": "Save D",
          "texton": "Save D",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            560.64,
            137,
            46.8,
            20
          ],
          "varname": "button_save_d"
        }
      },
      {
        "box": {
          "id": "act_save_d",
          "maxclass": "message",
          "patching_rect": [
            10,
            3916,
            160,
            22
          ],
          "text": "action save_d"
        }
      },
      {
        "box": {
          "id": "recall_d",
          "maxclass": "live.text",
          "patching_rect": [
            609.5999999999999,
            137,
            23.04,
            20
          ],
          "text": "D",
          "texton": "D",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            609.5999999999999,
            137,
            23.04,
            20
          ],
          "varname": "button_recall_d"
        }
      },
      {
        "box": {
          "id": "act_recall_d",
          "maxclass": "message",
          "patching_rect": [
            10,
            3964,
            160,
            22
          ],
          "text": "action recall_d"
        }
      },
      {
        "box": {
          "id": "pull_sound",
          "maxclass": "live.text",
          "patching_rect": [
            639.12,
            137,
            79.2,
            20
          ],
          "text": "Read sound",
          "texton": "Read sound",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            639.12,
            137,
            79.2,
            20
          ],
          "varname": "button_pull_sound"
        }
      },
      {
        "box": {
          "id": "act_pull_sound",
          "maxclass": "message",
          "patching_rect": [
            10,
            4012,
            160,
            22
          ],
          "text": "action pull_sound"
        }
      },
      {
        "box": {
          "id": "connect_usb",
          "maxclass": "live.text",
          "patching_rect": [
            231.6,
            94,
            79.2,
            22
          ],
          "text": "Connect USB",
          "texton": "Connect USB",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            231.6,
            94,
            79.2,
            22
          ],
          "hidden": 1,
          "varname": "connect_usb"
        }
      },
      {
        "box": {
          "id": "act_connect_usb",
          "maxclass": "message",
          "patching_rect": [
            10,
            4060,
            160,
            22
          ],
          "text": "action usb"
        }
      },
      {
        "box": {
          "id": "connect_wifi",
          "maxclass": "live.text",
          "patching_rect": [
            315.84000000000003,
            94,
            82.8,
            22
          ],
          "text": "Connect Wi-Fi",
          "texton": "Connect Wi-Fi",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            315.84000000000003,
            94,
            82.8,
            22
          ],
          "hidden": 1,
          "varname": "connect_wifi"
        }
      },
      {
        "box": {
          "id": "act_connect_wifi",
          "maxclass": "message",
          "patching_rect": [
            10,
            4108,
            160,
            22
          ],
          "text": "action wifi"
        }
      },
      {
        "box": {
          "id": "connect_disconnect",
          "maxclass": "live.text",
          "patching_rect": [
            403.68,
            94,
            74.16,
            22
          ],
          "text": "Disconnect",
          "texton": "Disconnect",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            403.68,
            94,
            74.16,
            22
          ],
          "hidden": 1,
          "varname": "connect_disconnect"
        }
      },
      {
        "box": {
          "id": "act_connect_disconnect",
          "maxclass": "message",
          "patching_rect": [
            10,
            4156,
            160,
            22
          ],
          "text": "action disconnect"
        }
      },
      {
        "box": {
          "id": "connect_ports",
          "maxclass": "live.text",
          "patching_rect": [
            482.88,
            94,
            81.36,
            22
          ],
          "text": "Refresh ports",
          "texton": "Refresh ports",
          "mode": 0,
          "parameter_enable": 0,
          "presentation": 1,
          "presentation_rect": [
            482.88,
            94,
            81.36,
            22
          ],
          "hidden": 1,
          "varname": "connect_ports"
        }
      },
      {
        "box": {
          "id": "act_connect_ports",
          "maxclass": "message",
          "patching_rect": [
            10,
            4204,
            160,
            22
          ],
          "text": "action ports"
        }
      },
      {
        "box": {
          "id": "entry_port",
          "maxclass": "textedit",
          "patching_rect": [
            231.6,
            56,
            162.0,
            25
          ],
          "text": "COM4",
          "varname": "entry_port",
          "presentation": 1,
          "presentation_rect": [
            231.6,
            56,
            162.0,
            25
          ],
          "hidden": 1,
          "keymode": 1
        }
      },
      {
        "box": {
          "id": "route_port",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            4252,
            160,
            22
          ],
          "text": "route text"
        }
      },
      {
        "box": {
          "id": "set_port",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            4276,
            160,
            22
          ],
          "text": "prepend address port"
        }
      },
      {
        "box": {
          "id": "entry_label_port",
          "maxclass": "comment",
          "patching_rect": [
            231.6,
            37,
            162.0,
            17
          ],
          "text": "USB port",
          "varname": "entry_label_port",
          "presentation": 1,
          "presentation_rect": [
            231.6,
            37,
            162.0,
            17
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "entry_host",
          "maxclass": "textedit",
          "patching_rect": [
            403.68,
            56,
            162.0,
            25
          ],
          "text": "beca.local",
          "varname": "entry_host",
          "presentation": 1,
          "presentation_rect": [
            403.68,
            56,
            162.0,
            25
          ],
          "hidden": 1,
          "keymode": 1
        }
      },
      {
        "box": {
          "id": "route_host",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            4348,
            160,
            22
          ],
          "text": "route text"
        }
      },
      {
        "box": {
          "id": "set_host",
          "maxclass": "newobj",
          "patching_rect": [
            10,
            4372,
            160,
            22
          ],
          "text": "prepend address host"
        }
      },
      {
        "box": {
          "id": "entry_label_host",
          "maxclass": "comment",
          "patching_rect": [
            403.68,
            37,
            162.0,
            17
          ],
          "text": "Wi-Fi host / IP",
          "varname": "entry_label_host",
          "presentation": 1,
          "presentation_rect": [
            403.68,
            37,
            162.0,
            17
          ],
          "hidden": 1
        }
      },
      {
        "box": {
          "id": "connect_help",
          "maxclass": "comment",
          "patching_rect": [
            571.44,
            39,
            153.35999999999999,
            80
          ],
          "text": "Close other apps using USB. Pick BECA device as note source for direct input.",
          "varname": "connect_help",
          "presentation": 1,
          "presentation_rect": [
            571.44,
            39,
            153.35999999999999,
            80
          ],
          "hidden": 1,
          "linecount": 4
        }
      }
    ],
    "lines": [
      {
        "patchline": {
          "source": [
            "runtime",
            0
          ],
          "destination": [
            "engine",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "engine",
            0
          ],
          "destination": [
            "audio",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "engine",
            1
          ],
          "destination": [
            "audio",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "midi",
            0
          ],
          "destination": [
            "midi-msg",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "midi-msg",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "load",
            0
          ],
          "destination": [
            "init",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "init",
            0
          ],
          "destination": [
            "init-msg",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "init-msg",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "load",
            1
          ],
          "destination": [
            "enabled",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "enabled",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "serdata",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "serports",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "runtime",
            2
          ],
          "destination": [
            "http",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "http",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "runtime",
            3
          ],
          "destination": [
            "monitor",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "monitor",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "page",
            0
          ],
          "destination": [
            "page-msg",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "page-msg",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_preset",
            0
          ],
          "destination": [
            "msg_preset",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_preset",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_master",
            0
          ],
          "destination": [
            "msg_master",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_master",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_mute",
            0
          ],
          "destination": [
            "msg_mute",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_mute",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_source",
            0
          ],
          "destination": [
            "msg_source",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_source",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_wave_a",
            0
          ],
          "destination": [
            "msg_wave_a",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_wave_a",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_wave_b",
            0
          ],
          "destination": [
            "msg_wave_b",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_wave_b",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_osc_mix",
            0
          ],
          "destination": [
            "msg_osc_mix",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_osc_mix",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_detune",
            0
          ],
          "destination": [
            "msg_detune",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_detune",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_gain_trim",
            0
          ],
          "destination": [
            "msg_gain_trim",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_gain_trim",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_mono",
            0
          ],
          "destination": [
            "msg_mono",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_mono",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_voices",
            0
          ],
          "destination": [
            "msg_voices",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_voices",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_attack",
            0
          ],
          "destination": [
            "msg_attack",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_attack",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_decay",
            0
          ],
          "destination": [
            "msg_decay",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_decay",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_sustain",
            0
          ],
          "destination": [
            "msg_sustain",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_sustain",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_release",
            0
          ],
          "destination": [
            "msg_release",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_release",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_cutoff",
            0
          ],
          "destination": [
            "msg_cutoff",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_cutoff",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_resonance",
            0
          ],
          "destination": [
            "msg_resonance",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_resonance",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_filter",
            0
          ],
          "destination": [
            "msg_filter",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_filter",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_reverb",
            0
          ],
          "destination": [
            "msg_reverb",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_reverb",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_delay_ms",
            0
          ],
          "destination": [
            "msg_delay_ms",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_delay_ms",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_delay_mix",
            0
          ],
          "destination": [
            "msg_delay_mix",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_delay_mix",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_delay_feedback",
            0
          ],
          "destination": [
            "msg_delay_feedback",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_delay_feedback",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_drive",
            0
          ],
          "destination": [
            "msg_drive",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_drive",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_drums",
            0
          ],
          "destination": [
            "msg_drums",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_drums",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_depth",
            0
          ],
          "destination": [
            "msg_depth",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_depth",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_sens",
            0
          ],
          "destination": [
            "msg_sens",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_sens",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_mode",
            0
          ],
          "destination": [
            "msg_mode",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_mode",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_scale",
            0
          ],
          "destination": [
            "msg_scale",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_scale",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_root",
            0
          ],
          "destination": [
            "msg_root",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_root",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_lo",
            0
          ],
          "destination": [
            "msg_lo",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_lo",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_hi",
            0
          ],
          "destination": [
            "msg_hi",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_hi",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_norep",
            0
          ],
          "destination": [
            "msg_norep",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_norep",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_bpm",
            0
          ],
          "destination": [
            "msg_bpm",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_bpm",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_swing",
            0
          ],
          "destination": [
            "msg_swing",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_swing",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_rest",
            0
          ],
          "destination": [
            "msg_rest",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_rest",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_clock",
            0
          ],
          "destination": [
            "msg_clock",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_clock",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_note_length",
            0
          ],
          "destination": [
            "msg_note_length",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_note_length",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_ts",
            0
          ],
          "destination": [
            "msg_ts",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_ts",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_follow_tempo",
            0
          ],
          "destination": [
            "msg_follow_tempo",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_follow_tempo",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_outputmode",
            0
          ],
          "destination": [
            "msg_outputmode",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_outputmode",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_daw_sync",
            0
          ],
          "destination": [
            "msg_daw_sync",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_daw_sync",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_drumsel",
            0
          ],
          "destination": [
            "msg_drumsel",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_drumsel",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_bright",
            0
          ],
          "destination": [
            "msg_bright",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_bright",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_vs",
            0
          ],
          "destination": [
            "msg_vs",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_vs",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_vi",
            0
          ],
          "destination": [
            "msg_vi",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_vi",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_fx",
            0
          ],
          "destination": [
            "msg_fx",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_fx",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_pal",
            0
          ],
          "destination": [
            "msg_pal",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_pal",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "p_send_sound",
            0
          ],
          "destination": [
            "msg_send_sound",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "msg_send_sound",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "panic",
            0
          ],
          "destination": [
            "act_panic",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_panic",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "audition",
            0
          ],
          "destination": [
            "act_audition",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_audition",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "mutate",
            0
          ],
          "destination": [
            "act_mutate",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_mutate",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "undo",
            0
          ],
          "destination": [
            "act_undo",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_undo",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "save_a",
            0
          ],
          "destination": [
            "act_save_a",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_save_a",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "recall_a",
            0
          ],
          "destination": [
            "act_recall_a",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_recall_a",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "save_b",
            0
          ],
          "destination": [
            "act_save_b",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_save_b",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "recall_b",
            0
          ],
          "destination": [
            "act_recall_b",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_recall_b",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "save_c",
            0
          ],
          "destination": [
            "act_save_c",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_save_c",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "recall_c",
            0
          ],
          "destination": [
            "act_recall_c",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_recall_c",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "save_d",
            0
          ],
          "destination": [
            "act_save_d",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_save_d",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "recall_d",
            0
          ],
          "destination": [
            "act_recall_d",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_recall_d",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "pull_sound",
            0
          ],
          "destination": [
            "act_pull_sound",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_pull_sound",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "connect_usb",
            0
          ],
          "destination": [
            "act_connect_usb",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_connect_usb",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "connect_wifi",
            0
          ],
          "destination": [
            "act_connect_wifi",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_connect_wifi",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "connect_disconnect",
            0
          ],
          "destination": [
            "act_connect_disconnect",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_connect_disconnect",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "connect_ports",
            0
          ],
          "destination": [
            "act_connect_ports",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "act_connect_ports",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "entry_port",
            0
          ],
          "destination": [
            "route_port",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route_port",
            0
          ],
          "destination": [
            "set_port",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "set_port",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "entry_host",
            0
          ],
          "destination": [
            "route_host",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route_host",
            0
          ],
          "destination": [
            "set_host",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "set_host",
            0
          ],
          "destination": [
            "runtime",
            0
          ]
        }
      }
    ],
    "parameters": {
      "memory": [
        "BECA memory",
        "Memory",
        0
      ],
      "p_preset": [
        "BECA Soundscape",
        "Soundscape",
        0
      ],
      "p_master": [
        "BECA Volume",
        "Volume",
        0
      ],
      "p_mute": [
        "BECA Mute",
        "Mute",
        0
      ],
      "p_source": [
        "BECA Note source",
        "Note source",
        0
      ],
      "p_wave_a": [
        "BECA Wave A",
        "Wave A",
        0
      ],
      "p_wave_b": [
        "BECA Wave B",
        "Wave B",
        0
      ],
      "p_osc_mix": [
        "BECA Blend",
        "Blend",
        0
      ],
      "p_detune": [
        "BECA Detune ct",
        "Detune ct",
        0
      ],
      "p_gain_trim": [
        "BECA Gain trim",
        "Gain trim",
        0
      ],
      "p_mono": [
        "BECA Mono",
        "Mono",
        0
      ],
      "p_voices": [
        "BECA Voices",
        "Voices",
        0
      ],
      "p_attack": [
        "BECA Attack s",
        "Attack s",
        0
      ],
      "p_decay": [
        "BECA Decay s",
        "Decay s",
        0
      ],
      "p_sustain": [
        "BECA Sustain",
        "Sustain",
        0
      ],
      "p_release": [
        "BECA Release s",
        "Release s",
        0
      ],
      "p_cutoff": [
        "BECA Cutoff Hz",
        "Cutoff Hz",
        0
      ],
      "p_resonance": [
        "BECA Resonance",
        "Resonance",
        0
      ],
      "p_filter": [
        "BECA Filter",
        "Filter",
        0
      ],
      "p_reverb": [
        "BECA Reverb",
        "Reverb",
        0
      ],
      "p_delay_ms": [
        "BECA Delay ms",
        "Delay ms",
        0
      ],
      "p_delay_mix": [
        "BECA Delay mix",
        "Delay mix",
        0
      ],
      "p_delay_feedback": [
        "BECA Feedback",
        "Feedback",
        0
      ],
      "p_drive": [
        "BECA Drive",
        "Drive",
        0
      ],
      "p_drums": [
        "BECA Local drums",
        "Local drums",
        0
      ],
      "p_depth": [
        "BECA Mutation",
        "Mutation",
        0
      ],
      "p_sens": [
        "BECA Sensitivity",
        "Sensitivity",
        0
      ],
      "p_mode": [
        "BECA Playing mode",
        "Playing mode",
        0
      ],
      "p_scale": [
        "BECA Scale",
        "Scale",
        0
      ],
      "p_root": [
        "BECA Root",
        "Root",
        0
      ],
      "p_lo": [
        "BECA Low octave",
        "Low octave",
        0
      ],
      "p_hi": [
        "BECA High octave",
        "High octave",
        0
      ],
      "p_norep": [
        "BECA No repeat",
        "No repeat",
        0
      ],
      "p_bpm": [
        "BECA BECA BPM",
        "BECA BPM",
        0
      ],
      "p_swing": [
        "BECA Swing %",
        "Swing %",
        0
      ],
      "p_rest": [
        "BECA Rest chance",
        "Rest chance",
        0
      ],
      "p_clock": [
        "BECA BECA clock",
        "BECA clock",
        0
      ],
      "p_note_length": [
        "BECA Note length",
        "Note length",
        0
      ],
      "p_ts": [
        "BECA Time signature",
        "Time signature",
        0
      ],
      "p_follow_tempo": [
        "BECA Follow Live BPM",
        "Follow Live BPM",
        0
      ],
      "p_outputmode": [
        "BECA Device output",
        "Device output",
        0
      ],
      "p_daw_sync": [
        "BECA External clock",
        "External clock",
        0
      ],
      "p_drumsel": [
        "BECA Drum mask",
        "Drum mask",
        0
      ],
      "p_bright": [
        "BECA Brightness",
        "Brightness",
        0
      ],
      "p_vs": [
        "BECA Motion",
        "Motion",
        0
      ],
      "p_vi": [
        "BECA Intensity",
        "Intensity",
        0
      ],
      "p_fx": [
        "BECA LED effect",
        "LED effect",
        0
      ],
      "p_pal": [
        "BECA LED palette",
        "LED palette",
        0
      ],
      "p_send_sound": [
        "BECA Send sound edits",
        "Send sound edits",
        0
      ],
      "parameterbanks": {
        "0": {
          "index": 0,
          "name": "Oscillators",
          "parameters": [
            "p_wave_a",
            "p_wave_b",
            "p_osc_mix",
            "p_detune",
            "p_gain_trim",
            "p_mono",
            "p_voices",
            "-"
          ]
        },
        "1": {
          "index": 1,
          "name": "Envelope / filter",
          "parameters": [
            "p_attack",
            "p_decay",
            "p_sustain",
            "p_release",
            "p_cutoff",
            "p_resonance",
            "p_filter",
            "-"
          ]
        },
        "2": {
          "index": 2,
          "name": "Space / play",
          "parameters": [
            "p_reverb",
            "p_delay_ms",
            "p_delay_mix",
            "p_delay_feedback",
            "p_drive",
            "p_drums",
            "p_depth",
            "-"
          ]
        },
        "3": {
          "index": 3,
          "name": "Plant / harmony",
          "parameters": [
            "p_sens",
            "p_mode",
            "p_scale",
            "p_root",
            "p_lo",
            "p_hi",
            "p_norep",
            "-"
          ]
        },
        "4": {
          "index": 4,
          "name": "Timing",
          "parameters": [
            "p_bpm",
            "p_swing",
            "p_rest",
            "p_clock",
            "p_note_length",
            "p_ts",
            "p_follow_tempo",
            "-"
          ]
        },
        "5": {
          "index": 5,
          "name": "Device output",
          "parameters": [
            "p_outputmode",
            "p_daw_sync",
            "p_drumsel",
            "-",
            "-",
            "-",
            "-",
            "-"
          ]
        },
        "6": {
          "index": 6,
          "name": "Lights / link",
          "parameters": [
            "p_bright",
            "p_vs",
            "p_vi",
            "p_fx",
            "p_pal",
            "p_send_sound",
            "-",
            "-"
          ]
        }
      },
      "inherited_shortname": 1
    },
    "dependency_cache": [
      {
        "name": "beca_instrument.js",
        "type": "TEXT",
        "implicit": 1
      },
      {
        "name": "beca_spec.js",
        "type": "TEXT",
        "implicit": 1
      },
      {
        "name": "beca_monitor.js",
        "type": "TEXT",
        "implicit": 1
      },
      {
        "name": "beca_http.js",
        "type": "TEXT",
        "implicit": 1
      }
    ]
  }
}