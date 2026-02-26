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
            1220,
            860
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
                        310,
                        22
                    ],
                    "text": "node.script code/beca_control_node.js @autostart 1"
                }
            },
            {
                "box": {
                    "id": "obj-3",
                    "maxclass": "newobj",
                    "patching_rect": [
                        340,
                        20,
                        270,
                        22
                    ],
                    "text": "js code/beca_native_controller.js"
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
                        340,
                        80,
                        110,
                        22
                    ],
                    "text": "r beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-9",
                    "maxclass": "newobj",
                    "patching_rect": [
                        460,
                        80,
                        72,
                        22
                    ],
                    "text": "thispatcher"
                }
            },
            {
                "box": {
                    "id": "obj-11",
                    "maxclass": "comment",
                    "patching_rect": [
                        14,
                        10,
                        180,
                        16
                    ],
                    "text": "BECA Control",
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        10,
                        180,
                        16
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-12",
                    "maxclass": "comment",
                    "patching_rect": [
                        820,
                        10,
                        340,
                        16
                    ],
                    "text": "Status: ready idle",
                    "presentation": 1,
                    "presentation_rect": [
                        820,
                        10,
                        340,
                        16
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-13",
                    "maxclass": "newobj",
                    "patching_rect": [
                        820,
                        120,
                        140,
                        22
                    ],
                    "text": "r beca_status_text"
                }
            },
            {
                "box": {
                    "id": "obj-14",
                    "maxclass": "newobj",
                    "patching_rect": [
                        964,
                        120,
                        80,
                        22
                    ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-15",
                    "maxclass": "comment",
                    "patching_rect": [
                        14,
                        28,
                        80,
                        12
                    ],
                    "text": "Connection",
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        28,
                        80,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-16",
                    "maxclass": "umenu",
                    "patching_rect": [
                        14,
                        40,
                        90,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        40,
                        90,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-17",
                    "maxclass": "newobj",
                    "patching_rect": [
                        20,
                        150,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-18",
                    "maxclass": "message",
                    "patching_rect": [
                        82,
                        150,
                        280,
                        22
                    ],
                    "text": "clear, append HTTP, append Serial, append Mock, set 2"
                }
            },
            {
                "box": {
                    "id": "obj-19",
                    "maxclass": "newobj",
                    "patching_rect": [
                        366,
                        150,
                        32,
                        22
                    ],
                    "text": "- 1"
                }
            },
            {
                "box": {
                    "id": "obj-20",
                    "maxclass": "newobj",
                    "patching_rect": [
                        402,
                        150,
                        110,
                        22
                    ],
                    "text": "prepend ui_mode"
                }
            },
            {
                "box": {
                    "id": "obj-21",
                    "maxclass": "newobj",
                    "patching_rect": [
                        516,
                        150,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-22",
                    "maxclass": "textedit",
                    "patching_rect": [
                        108,
                        40,
                        120,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        108,
                        40,
                        120,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-23",
                    "maxclass": "message",
                    "patching_rect": [
                        240,
                        40,
                        100,
                        18
                    ],
                    "text": "192.168.4.1"
                }
            },
            {
                "box": {
                    "id": "obj-24",
                    "maxclass": "newobj",
                    "patching_rect": [
                        240,
                        150,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-25",
                    "maxclass": "newobj",
                    "patching_rect": [
                        640,
                        150,
                        120,
                        22
                    ],
                    "text": "prepend ui_set_ip"
                }
            },
            {
                "box": {
                    "id": "obj-26",
                    "maxclass": "newobj",
                    "patching_rect": [
                        764,
                        150,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-27",
                    "maxclass": "number",
                    "patching_rect": [
                        232,
                        40,
                        60,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        232,
                        40,
                        60,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-28",
                    "maxclass": "newobj",
                    "patching_rect": [
                        300,
                        150,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-29",
                    "maxclass": "message",
                    "patching_rect": [
                        362,
                        150,
                        32,
                        22
                    ],
                    "text": "80"
                }
            },
            {
                "box": {
                    "id": "obj-30",
                    "maxclass": "newobj",
                    "patching_rect": [
                        888,
                        150,
                        130,
                        22
                    ],
                    "text": "prepend ui_set_port"
                }
            },
            {
                "box": {
                    "id": "obj-31",
                    "maxclass": "newobj",
                    "patching_rect": [
                        1022,
                        150,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-32",
                    "maxclass": "umenu",
                    "patching_rect": [
                        296,
                        40,
                        170,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        296,
                        40,
                        170,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-33",
                    "maxclass": "newobj",
                    "patching_rect": [
                        14,
                        180,
                        160,
                        22
                    ],
                    "text": "r beca_serial_ports_menu"
                }
            },
            {
                "box": {
                    "id": "obj-34",
                    "maxclass": "newobj",
                    "patching_rect": [
                        178,
                        180,
                        180,
                        22
                    ],
                    "text": "r beca_set_serial_port_index"
                }
            },
            {
                "box": {
                    "id": "obj-35",
                    "maxclass": "newobj",
                    "patching_rect": [
                        362,
                        180,
                        80,
                        22
                    ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-36",
                    "maxclass": "newobj",
                    "patching_rect": [
                        446,
                        180,
                        32,
                        22
                    ],
                    "text": "- 1"
                }
            },
            {
                "box": {
                    "id": "obj-37",
                    "maxclass": "newobj",
                    "patching_rect": [
                        482,
                        180,
                        180,
                        22
                    ],
                    "text": "prepend ui_serial_port_index"
                }
            },
            {
                "box": {
                    "id": "obj-38",
                    "maxclass": "newobj",
                    "patching_rect": [
                        666,
                        180,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-39",
                    "maxclass": "number",
                    "patching_rect": [
                        470,
                        40,
                        70,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        470,
                        40,
                        70,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-40",
                    "maxclass": "newobj",
                    "patching_rect": [
                        544,
                        180,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-41",
                    "maxclass": "message",
                    "patching_rect": [
                        606,
                        180,
                        56,
                        22
                    ],
                    "text": "115200"
                }
            },
            {
                "box": {
                    "id": "obj-42",
                    "maxclass": "newobj",
                    "patching_rect": [
                        790,
                        180,
                        130,
                        22
                    ],
                    "text": "prepend ui_set_baud"
                }
            },
            {
                "box": {
                    "id": "obj-43",
                    "maxclass": "newobj",
                    "patching_rect": [
                        924,
                        180,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-44",
                    "maxclass": "umenu",
                    "patching_rect": [
                        544,
                        40,
                        90,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        544,
                        40,
                        90,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-45",
                    "maxclass": "newobj",
                    "patching_rect": [
                        668,
                        180,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-46",
                    "maxclass": "message",
                    "patching_rect": [
                        730,
                        180,
                        220,
                        22
                    ],
                    "text": "clear, append Reemit, append Monitor, set 1"
                }
            },
            {
                "box": {
                    "id": "obj-47",
                    "maxclass": "newobj",
                    "patching_rect": [
                        954,
                        180,
                        32,
                        22
                    ],
                    "text": "- 1"
                }
            },
            {
                "box": {
                    "id": "obj-48",
                    "maxclass": "newobj",
                    "patching_rect": [
                        990,
                        180,
                        110,
                        22
                    ],
                    "text": "prepend ui_emit"
                }
            },
            {
                "box": {
                    "id": "obj-49",
                    "maxclass": "newobj",
                    "patching_rect": [
                        1104,
                        180,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-50",
                    "maxclass": "toggle",
                    "patching_rect": [
                        638,
                        40,
                        18,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        638,
                        40,
                        18,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-51",
                    "maxclass": "comment",
                    "patching_rect": [
                        658,
                        42,
                        70,
                        12
                    ],
                    "text": "Auto",
                    "presentation": 1,
                    "presentation_rect": [
                        658,
                        42,
                        70,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-52",
                    "maxclass": "newobj",
                    "patching_rect": [
                        14,
                        210,
                        110,
                        22
                    ],
                    "text": "prepend ui_auto"
                }
            },
            {
                "box": {
                    "id": "obj-53",
                    "maxclass": "newobj",
                    "patching_rect": [
                        128,
                        210,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-54",
                    "maxclass": "newobj",
                    "patching_rect": [
                        252,
                        210,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-55",
                    "maxclass": "message",
                    "patching_rect": [
                        314,
                        210,
                        24,
                        22
                    ],
                    "text": "1"
                }
            },
            {
                "box": {
                    "id": "obj-56",
                    "maxclass": "toggle",
                    "patching_rect": [
                        706,
                        40,
                        18,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        706,
                        40,
                        18,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-57",
                    "maxclass": "comment",
                    "patching_rect": [
                        726,
                        42,
                        70,
                        12
                    ],
                    "text": "Tele",
                    "presentation": 1,
                    "presentation_rect": [
                        726,
                        42,
                        70,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-58",
                    "maxclass": "newobj",
                    "patching_rect": [
                        342,
                        210,
                        140,
                        22
                    ],
                    "text": "prepend ui_telemetry"
                }
            },
            {
                "box": {
                    "id": "obj-59",
                    "maxclass": "newobj",
                    "patching_rect": [
                        486,
                        210,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-60",
                    "maxclass": "textbutton",
                    "patching_rect": [
                        820,
                        40,
                        72,
                        18
                    ],
                    "text": "Connect",
                    "presentation": 1,
                    "presentation_rect": [
                        820,
                        40,
                        72,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-61",
                    "maxclass": "textbutton",
                    "patching_rect": [
                        896,
                        40,
                        72,
                        18
                    ],
                    "text": "Disconnect",
                    "presentation": 1,
                    "presentation_rect": [
                        896,
                        40,
                        72,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-62",
                    "maxclass": "textbutton",
                    "patching_rect": [
                        972,
                        40,
                        72,
                        18
                    ],
                    "text": "Refresh",
                    "presentation": 1,
                    "presentation_rect": [
                        972,
                        40,
                        72,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-63",
                    "maxclass": "newobj",
                    "patching_rect": [
                        610,
                        210,
                        42,
                        22
                    ],
                    "text": "sel 1"
                }
            },
            {
                "box": {
                    "id": "obj-64",
                    "maxclass": "message",
                    "patching_rect": [
                        656,
                        210,
                        100,
                        22
                    ],
                    "text": "ui_connect"
                }
            },
            {
                "box": {
                    "id": "obj-65",
                    "maxclass": "newobj",
                    "patching_rect": [
                        760,
                        210,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-66",
                    "maxclass": "newobj",
                    "patching_rect": [
                        760,
                        210,
                        42,
                        22
                    ],
                    "text": "sel 1"
                }
            },
            {
                "box": {
                    "id": "obj-67",
                    "maxclass": "message",
                    "patching_rect": [
                        806,
                        210,
                        100,
                        22
                    ],
                    "text": "ui_disconnect"
                }
            },
            {
                "box": {
                    "id": "obj-68",
                    "maxclass": "newobj",
                    "patching_rect": [
                        910,
                        210,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-69",
                    "maxclass": "newobj",
                    "patching_rect": [
                        920,
                        210,
                        42,
                        22
                    ],
                    "text": "sel 1"
                }
            },
            {
                "box": {
                    "id": "obj-70",
                    "maxclass": "message",
                    "patching_rect": [
                        966,
                        210,
                        100,
                        22
                    ],
                    "text": "ui_refresh"
                }
            },
            {
                "box": {
                    "id": "obj-71",
                    "maxclass": "newobj",
                    "patching_rect": [
                        1070,
                        210,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-72",
                    "maxclass": "comment",
                    "patching_rect": [
                        14,
                        64,
                        560,
                        12
                    ],
                    "text": "Plant",
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        64,
                        560,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-73",
                    "maxclass": "multislider",
                    "patching_rect": [
                        14,
                        76,
                        560,
                        48
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        76,
                        560,
                        48
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-74",
                    "maxclass": "newobj",
                    "patching_rect": [
                        14,
                        240,
                        110,
                        22
                    ],
                    "text": "r beca_plant_push"
                }
            },
            {
                "box": {
                    "id": "obj-75",
                    "maxclass": "newobj",
                    "patching_rect": [
                        128,
                        240,
                        88,
                        22
                    ],
                    "text": "zl stream 96"
                }
            },
            {
                "box": {
                    "id": "obj-76",
                    "maxclass": "newobj",
                    "patching_rect": [
                        220,
                        240,
                        88,
                        22
                    ],
                    "text": "prepend setlist"
                }
            },
            {
                "box": {
                    "id": "obj-77",
                    "maxclass": "newobj",
                    "patching_rect": [
                        312,
                        240,
                        110,
                        22
                    ],
                    "text": "r beca_plant_text"
                }
            },
            {
                "box": {
                    "id": "obj-78",
                    "maxclass": "newobj",
                    "patching_rect": [
                        426,
                        240,
                        80,
                        22
                    ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-79",
                    "maxclass": "comment",
                    "patching_rect": [
                        580,
                        64,
                        570,
                        12
                    ],
                    "text": "MIDI",
                    "presentation": 1,
                    "presentation_rect": [
                        580,
                        64,
                        570,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-80",
                    "maxclass": "matrixctrl",
                    "patching_rect": [
                        580,
                        76,
                        570,
                        48
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        580,
                        76,
                        570,
                        48
                    ],
                    "columns": 12,
                    "rows": 8
                }
            },
            {
                "box": {
                    "id": "obj-81",
                    "maxclass": "newobj",
                    "patching_rect": [
                        510,
                        240,
                        110,
                        22
                    ],
                    "text": "r beca_midi_text"
                }
            },
            {
                "box": {
                    "id": "obj-82",
                    "maxclass": "newobj",
                    "patching_rect": [
                        624,
                        240,
                        80,
                        22
                    ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-83",
                    "maxclass": "newobj",
                    "patching_rect": [
                        708,
                        240,
                        120,
                        22
                    ],
                    "text": "r beca_midi_matrix"
                }
            },
            {
                "box": {
                    "id": "obj-84",
                    "maxclass": "comment",
                    "patching_rect": [
                        14,
                        128,
                        60,
                        12
                    ],
                    "text": "Section",
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        128,
                        60,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-85",
                    "maxclass": "umenu",
                    "patching_rect": [
                        76,
                        126,
                        140,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        76,
                        126,
                        140,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-86",
                    "maxclass": "newobj",
                    "patching_rect": [
                        832,
                        240,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-87",
                    "maxclass": "message",
                    "patching_rect": [
                        894,
                        240,
                        320,
                        22
                    ],
                    "text": "clear, append Input, append Output, append Theory, append LED FX, append Engine, set 1"
                }
            },
            {
                "box": {
                    "id": "obj-88",
                    "maxclass": "newobj",
                    "patching_rect": [
                        14,
                        270,
                        32,
                        22
                    ],
                    "text": "- 1"
                }
            },
            {
                "box": {
                    "id": "obj-89",
                    "maxclass": "newobj",
                    "patching_rect": [
                        50,
                        270,
                        110,
                        22
                    ],
                    "text": "prepend ui_page"
                }
            },
            {
                "box": {
                    "id": "obj-90",
                    "maxclass": "newobj",
                    "patching_rect": [
                        164,
                        270,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-91",
                    "maxclass": "bpatcher",
                    "patching_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "name": "pages/input.maxpat",
                    "varname": "pg_input"
                }
            },
            {
                "box": {
                    "id": "obj-92",
                    "maxclass": "bpatcher",
                    "patching_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "name": "pages/output.maxpat",
                    "varname": "pg_output",
                    "hidden": 1
                }
            },
            {
                "box": {
                    "id": "obj-93",
                    "maxclass": "bpatcher",
                    "patching_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "name": "pages/theory.maxpat",
                    "varname": "pg_theory",
                    "hidden": 1
                }
            },
            {
                "box": {
                    "id": "obj-94",
                    "maxclass": "bpatcher",
                    "patching_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "name": "pages/led.maxpat",
                    "varname": "pg_led",
                    "hidden": 1
                }
            },
            {
                "box": {
                    "id": "obj-95",
                    "maxclass": "bpatcher",
                    "patching_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        14,
                        148,
                        1136,
                        176
                    ],
                    "name": "pages/engine.maxpat",
                    "varname": "pg_engine",
                    "hidden": 1
                }
            },
            {
                "box": {
                    "id": "obj-96",
                    "maxclass": "newobj",
                    "patching_rect": [
                        20,
                        110,
                        58,
                        22
                    ],
                    "text": "loadbang"
                }
            },
            {
                "box": {
                    "id": "obj-97",
                    "maxclass": "message",
                    "patching_rect": [
                        82,
                        110,
                        60,
                        22
                    ],
                    "text": "loadbang"
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
                        "obj-5",
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
                        "obj-3",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-3",
                        1
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
                        "obj-13",
                        0
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
                        "obj-12",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-17",
                        0
                    ],
                    "destination": [
                        "obj-18",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-18",
                        0
                    ],
                    "destination": [
                        "obj-16",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-16",
                        0
                    ],
                    "destination": [
                        "obj-19",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-19",
                        0
                    ],
                    "destination": [
                        "obj-20",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-20",
                        0
                    ],
                    "destination": [
                        "obj-21",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-24",
                        0
                    ],
                    "destination": [
                        "obj-23",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-23",
                        0
                    ],
                    "destination": [
                        "obj-22",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-22",
                        0
                    ],
                    "destination": [
                        "obj-25",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-25",
                        0
                    ],
                    "destination": [
                        "obj-26",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-28",
                        0
                    ],
                    "destination": [
                        "obj-29",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-29",
                        0
                    ],
                    "destination": [
                        "obj-27",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-27",
                        0
                    ],
                    "destination": [
                        "obj-30",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-30",
                        0
                    ],
                    "destination": [
                        "obj-31",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-33",
                        0
                    ],
                    "destination": [
                        "obj-32",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-34",
                        0
                    ],
                    "destination": [
                        "obj-35",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-35",
                        0
                    ],
                    "destination": [
                        "obj-32",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-32",
                        0
                    ],
                    "destination": [
                        "obj-36",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-36",
                        0
                    ],
                    "destination": [
                        "obj-37",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-37",
                        0
                    ],
                    "destination": [
                        "obj-38",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-40",
                        0
                    ],
                    "destination": [
                        "obj-41",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-41",
                        0
                    ],
                    "destination": [
                        "obj-39",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-39",
                        0
                    ],
                    "destination": [
                        "obj-42",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-42",
                        0
                    ],
                    "destination": [
                        "obj-43",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-45",
                        0
                    ],
                    "destination": [
                        "obj-46",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-46",
                        0
                    ],
                    "destination": [
                        "obj-44",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-44",
                        0
                    ],
                    "destination": [
                        "obj-47",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-47",
                        0
                    ],
                    "destination": [
                        "obj-48",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-48",
                        0
                    ],
                    "destination": [
                        "obj-49",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-50",
                        0
                    ],
                    "destination": [
                        "obj-52",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-52",
                        0
                    ],
                    "destination": [
                        "obj-53",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-54",
                        0
                    ],
                    "destination": [
                        "obj-55",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-55",
                        0
                    ],
                    "destination": [
                        "obj-50",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-56",
                        0
                    ],
                    "destination": [
                        "obj-58",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-58",
                        0
                    ],
                    "destination": [
                        "obj-59",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-60",
                        0
                    ],
                    "destination": [
                        "obj-63",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-63",
                        0
                    ],
                    "destination": [
                        "obj-64",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-64",
                        0
                    ],
                    "destination": [
                        "obj-65",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-61",
                        0
                    ],
                    "destination": [
                        "obj-66",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-66",
                        0
                    ],
                    "destination": [
                        "obj-67",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-67",
                        0
                    ],
                    "destination": [
                        "obj-68",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-62",
                        0
                    ],
                    "destination": [
                        "obj-69",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-69",
                        0
                    ],
                    "destination": [
                        "obj-70",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-70",
                        0
                    ],
                    "destination": [
                        "obj-71",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-74",
                        0
                    ],
                    "destination": [
                        "obj-75",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-75",
                        0
                    ],
                    "destination": [
                        "obj-76",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-76",
                        0
                    ],
                    "destination": [
                        "obj-73",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-77",
                        0
                    ],
                    "destination": [
                        "obj-78",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-78",
                        0
                    ],
                    "destination": [
                        "obj-72",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-81",
                        0
                    ],
                    "destination": [
                        "obj-82",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-82",
                        0
                    ],
                    "destination": [
                        "obj-79",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-83",
                        0
                    ],
                    "destination": [
                        "obj-80",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-86",
                        0
                    ],
                    "destination": [
                        "obj-87",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-87",
                        0
                    ],
                    "destination": [
                        "obj-85",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-85",
                        0
                    ],
                    "destination": [
                        "obj-88",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-88",
                        0
                    ],
                    "destination": [
                        "obj-89",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-89",
                        0
                    ],
                    "destination": [
                        "obj-90",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-96",
                        0
                    ],
                    "destination": [
                        "obj-97",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-97",
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