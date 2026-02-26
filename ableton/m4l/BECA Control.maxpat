{
    "patcher":  {
                    "fileversion":  1,
                    "appversion":  {
                                       "major":  8,
                                       "minor":  6,
                                       "revision":  2,
                                       "architecture":  "x64",
                                       "modernui":  1
                                   },
                    "classnamespace":  "box",
                    "rect":  [
                                 60,
                                 60,
                                 1200,
                                 820
                             ],
                    "openinpresentation":  1,
                    "default_fontsize":  12,
                    "default_fontface":  0,
                    "default_fontname":  "Arial",
                    "boxes":  [
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        20,
                                                                        20,
                                                                        90,
                                                                        22
                                                                    ],
                                                  "id":  "obj-1",
                                                  "maxclass":  "newobj",
                                                  "text":  "live.thisdevice"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        20,
                                                                        50,
                                                                        300,
                                                                        22
                                                                    ],
                                                  "id":  "obj-2",
                                                  "maxclass":  "newobj",
                                                  "text":  "node.script code/beca_control_node.js @autostart 1"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "id":  "obj-3",
                                                  "text":  "jsui @filename beca_control_ui.js",
                                                  "maxclass":  "jsui",
                                                  "presentation":  1,
                                                  "patching_rect":  [
                                                                        20,
                                                                        90,
                                                                        1140,
                                                                        690
                                                                    ],
                                                  "presentation_rect":  [
                                                                            10,
                                                                            10,
                                                                            1140,
                                                                            690
                                                                        ],
                                                  "filename":  "beca_control_ui.js",
                                                  "jsarguments":  [

                                                                  ]
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        340,
                                                                        50,
                                                                        690,
                                                                        22
                                                                    ],
                                                  "id":  "obj-4",
                                                  "maxclass":  "newobj",
                                                  "text":  "route status plant state midi_event note_grid serial_ports serial_ports_list params synth serial_write midi_bytes"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        340,
                                                                        90,
                                                                        90,
                                                                        22
                                                                    ],
                                                  "id":  "obj-5",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend status"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        434,
                                                                        90,
                                                                        90,
                                                                        22
                                                                    ],
                                                  "id":  "obj-6",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend plant"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        528,
                                                                        90,
                                                                        90,
                                                                        22
                                                                    ],
                                                  "id":  "obj-7",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend state"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        622,
                                                                        90,
                                                                        120,
                                                                        22
                                                                    ],
                                                  "id":  "obj-8",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend midi_event"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        746,
                                                                        90,
                                                                        120,
                                                                        22
                                                                    ],
                                                  "id":  "obj-9",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend note_grid"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        870,
                                                                        90,
                                                                        130,
                                                                        22
                                                                    ],
                                                  "id":  "obj-10",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend serial_ports"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        1004,
                                                                        90,
                                                                        156,
                                                                        22
                                                                    ],
                                                  "id":  "obj-11",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend serial_ports_list"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        340,
                                                                        120,
                                                                        100,
                                                                        22
                                                                    ],
                                                  "id":  "obj-12",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend params"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        444,
                                                                        120,
                                                                        90,
                                                                        22
                                                                    ],
                                                  "id":  "obj-13",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend synth"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        538,
                                                                        120,
                                                                        120,
                                                                        22
                                                                    ],
                                                  "id":  "obj-14",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend serial_write"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        662,
                                                                        120,
                                                                        120,
                                                                        22
                                                                    ],
                                                  "id":  "obj-15",
                                                  "maxclass":  "newobj",
                                                  "text":  "prepend midi_bytes"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        786,
                                                                        120,
                                                                        52,
                                                                        22
                                                                    ],
                                                  "id":  "obj-16",
                                                  "maxclass":  "newobj",
                                                  "text":  "midiout"
                                              }
                                  },
                                  {
                                      "box":  {
                                                  "presentation":  0,
                                                  "patching_rect":  [
                                                                        842,
                                                                        120,
                                                                        120,
                                                                        22
                                                                    ],
                                                  "id":  "obj-17",
                                                  "maxclass":  "newobj",
                                                  "text":  "print beca_serial_tx"
                                              }
                                  }
                              ],
                    "lines":  [
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-2",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-3",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-4",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-2",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-5",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-6",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       1
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-7",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       2
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-8",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       3
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-9",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       4
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-10",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       5
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-11",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       6
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-12",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       7
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-13",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       8
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-14",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       9
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-15",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       10
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-16",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-4",
                                                                       10
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-5",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-6",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-7",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-8",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-9",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-10",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-11",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-12",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-13",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-14",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-17",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-14",
                                                                       0
                                                                   ]
                                                    }
                                  },
                                  {
                                      "patchline":  {
                                                        "destination":  [
                                                                            "obj-3",
                                                                            0
                                                                        ],
                                                        "source":  [
                                                                       "obj-15",
                                                                       0
                                                                   ]
                                                    }
                                  }
                              ]
                }
}
