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
            60,
            60,
            1700,
            320
        ],
        "openinpresentation": 1,
        "default_fontsize": 12,
        "default_fontface": 0,
        "default_fontname": "Arial",
        "boxes": [
            {
                "box": {
                    "id": "obj-1",
                    "maxclass": "newobj",
                    "patching_rect": [
                        20,
                        20,
                        90,
                        22
                    ],
                    "text": "live.thisdevice"
                }
            },
            {
                "box": {
                    "id": "obj-2",
                    "maxclass": "newobj",
                    "patching_rect": [
                        20,
                        50,
                        276,
                        22
                    ],
                    "text": "node.script beca_control_node.js @autostart 1"
                }
            },
            {
                "box": {
                    "id": "obj-3",
                    "maxclass": "jsui",
                    "filename": "beca_control_ui.js",
                    "patching_rect": [
                        20,
                        80,
                        1640,
                        169
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        12,
                        10,
                        1668,
                        169
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-4",
                    "maxclass": "newobj",
                    "patching_rect": [
                        340,
                        50,
                        40,
                        22
                    ],
                    "text": "t l l"
                }
            },
            {
                "box": {
                    "id": "obj-5",
                    "maxclass": "newobj",
                    "patching_rect": [
                        390,
                        50,
                        220,
                        22
                    ],
                    "text": "route midi_bytes serial_write"
                }
            },
            {
                "box": {
                    "id": "obj-6",
                    "maxclass": "newobj",
                    "patching_rect": [
                        620,
                        50,
                        52,
                        22
                    ],
                    "text": "midiout"
                }
            },
            {
                "box": {
                    "id": "obj-7",
                    "maxclass": "newobj",
                    "patching_rect": [
                        680,
                        50,
                        120,
                        22
                    ],
                    "text": "print beca_serial_tx"
                }
            },
            {
                "box": {
                    "id": "obj-8",
                    "maxclass": "newobj",
                    "patching_rect": [
                        20,
                        872,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-9",
                    "maxclass": "message",
                    "patching_rect": [
                        84,
                        872,
                        60,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-10",
                    "maxclass": "comment",
                    "patching_rect": [
                        150,
                        875,
                        320,
                        16
                    ],
                    "text": "BECA Control Dashboard v6 (device-IP adoption + larger aspect layout)"
                }
            },
            {
                "box": {
                    "id": "obj-11",
                    "maxclass": "comment",
                    "patching_rect": [
                        150,
                        894,
                        460,
                        16
                    ],
                    "text": "BECA Control Dashboard v7 (fixed-height compact layout + auto-discovery fallback)"
                }
            },
            {
                "box": {
                    "id": "obj-12",
                    "maxclass": "comment",
                    "patching_rect": [
                        150,
                        913,
                        520,
                        16
                    ],
                    "text": "v8 adaptive layout: all-sections dashboard on taller lanes, compact tabs on short lanes"
                }
            },
            {
                "box": {
                    "id": "obj-13",
                    "maxclass": "comment",
                    "patching_rect": [
                        150,
                        932,
                        600,
                        16
                    ],
                    "text": "v10 Live-safe height tuning: controls always visible at Ableton max device lane height"
                }
            },
            {
                "box": {
                    "id": "obj-14",
                    "maxclass": "newobj",
                    "patching_rect": [
                        340,
                        78,
                        150,
                        22
                    ],
                    "text": "route request_scale_sync"
                }
            },
            {
                "box": {
                    "id": "obj-15",
                    "maxclass": "newobj",
                    "patching_rect": [
                        500,
                        78,
                        170,
                        22
                    ],
                    "text": "js code/beca_scale_sync.js"
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "source": [
                        "obj-3",
                        0
                    ],
                    "destination": [
                        "obj-2",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-2",
                        0
                    ],
                    "destination": [
                        "obj-4",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-4",
                        0
                    ],
                    "destination": [
                        "obj-3",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-4",
                        1
                    ],
                    "destination": [
                        "obj-14",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-14",
                        0
                    ],
                    "destination": [
                        "obj-15",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-14",
                        1
                    ],
                    "destination": [
                        "obj-5",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-15",
                        0
                    ],
                    "destination": [
                        "obj-2",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-5",
                        0
                    ],
                    "destination": [
                        "obj-6",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-5",
                        1
                    ],
                    "destination": [
                        "obj-7",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-8",
                        0
                    ],
                    "destination": [
                        "obj-9",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-9",
                        0
                    ],
                    "destination": [
                        "obj-3",
                        0
                    ]
                }
            }
        ]
    }
}
