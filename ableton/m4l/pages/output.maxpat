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
            1120,
            170
        ],
        "openinpresentation": 0,
        "default_fontsize": 12,
        "default_fontface": 0,
        "default_fontname": "Arial",
        "boxes": [
            {
                "box": {
                    "id": "obj-2",
                    "maxclass": "comment",
                    "patching_rect": [
                        8,
                        3,
                        500,
                        14
                    ],
                    "text": "Output",
                    "presentation": 1,
                    "presentation_rect": [
                        8,
                        3,
                        500,
                        14
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-3",
                    "maxclass": "comment",
                    "patching_rect": [
                        8,
                        18,
                        170,
                        12
                    ],
                    "text": "Output Mode",
                    "presentation": 1,
                    "presentation_rect": [
                        8,
                        18,
                        170,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-4",
                    "maxclass": "umenu",
                    "patching_rect": [
                        8,
                        30,
                        170,
                        18
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        8,
                        30,
                        170,
                        18
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-5",
                    "maxclass": "newobj",
                    "patching_rect": [
                        8,
                        208,
                        150,
                        22
                    ],
                    "text": "r beca_menu_outputmode"
                }
            },
            {
                "box": {
                    "id": "obj-6",
                    "maxclass": "newobj",
                    "patching_rect": [
                        162,
                        208,
                        130,
                        22
                    ],
                    "text": "r beca_set_outputmode"
                }
            },
            {
                "box": {
                    "id": "obj-7",
                    "maxclass": "newobj",
                    "patching_rect": [
                        296,
                        208,
                        80,
                        22
                    ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-8",
                    "maxclass": "newobj",
                    "patching_rect": [
                        380,
                        208,
                        32,
                        22
                    ],
                    "text": "- 1"
                }
            },
            {
                "box": {
                    "id": "obj-9",
                    "maxclass": "newobj",
                    "patching_rect": [
                        416,
                        208,
                        170,
                        22
                    ],
                    "text": "prepend ui_param outputmode"
                }
            },
            {
                "box": {
                    "id": "obj-10",
                    "maxclass": "newobj",
                    "patching_rect": [
                        590,
                        208,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-11",
                    "maxclass": "comment",
                    "patching_rect": [
                        192,
                        18,
                        120,
                        12
                    ],
                    "text": "Mute I/O",
                    "presentation": 1,
                    "presentation_rect": [
                        192,
                        18,
                        120,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-12",
                    "maxclass": "toggle",
                    "patching_rect": [
                        192,
                        30,
                        20,
                        20
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        192,
                        30,
                        20,
                        20
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-13",
                    "maxclass": "newobj",
                    "patching_rect": [
                        192,
                        208,
                        130,
                        22
                    ],
                    "text": "r beca_set_mute"
                }
            },
            {
                "box": {
                    "id": "obj-14",
                    "maxclass": "newobj",
                    "patching_rect": [
                        326,
                        208,
                        80,
                        22
                    ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-15",
                    "maxclass": "newobj",
                    "patching_rect": [
                        410,
                        208,
                        170,
                        22
                    ],
                    "text": "prepend ui_param mute"
                }
            },
            {
                "box": {
                    "id": "obj-16",
                    "maxclass": "newobj",
                    "patching_rect": [
                        584,
                        208,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            },
            {
                "box": {
                    "id": "obj-17",
                    "maxclass": "comment",
                    "patching_rect": [
                        376,
                        18,
                        120,
                        12
                    ],
                    "text": "DAW Sync",
                    "presentation": 1,
                    "presentation_rect": [
                        376,
                        18,
                        120,
                        12
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-18",
                    "maxclass": "toggle",
                    "patching_rect": [
                        376,
                        30,
                        20,
                        20
                    ],
                    "presentation": 1,
                    "presentation_rect": [
                        376,
                        30,
                        20,
                        20
                    ]
                }
            },
            {
                "box": {
                    "id": "obj-19",
                    "maxclass": "newobj",
                    "patching_rect": [
                        376,
                        208,
                        130,
                        22
                    ],
                    "text": "r beca_set_sync"
                }
            },
            {
                "box": {
                    "id": "obj-20",
                    "maxclass": "newobj",
                    "patching_rect": [
                        510,
                        208,
                        80,
                        22
                    ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-21",
                    "maxclass": "newobj",
                    "patching_rect": [
                        594,
                        208,
                        170,
                        22
                    ],
                    "text": "prepend ui_param sync"
                }
            },
            {
                "box": {
                    "id": "obj-22",
                    "maxclass": "newobj",
                    "patching_rect": [
                        768,
                        208,
                        120,
                        22
                    ],
                    "text": "s beca_ui_events"
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "source": [
                        "obj-5",
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
                        "obj-6",
                        0
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
                        "obj-7",
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
                        "obj-8",
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
                        "obj-10",
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
                        "obj-12",
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
                        "obj-15",
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
                        "obj-21",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "obj-21",
                        0
                    ],
                    "destination": [
                        "obj-22",
                        0
                    ]
                }
            }
        ]
    }
}