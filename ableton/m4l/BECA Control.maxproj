{
  "name": "BECA Control",
  "version": 1,
  "creationdate": "2026-02-26",
  "viewrect": [0.0, 0.0, 900.0, 600.0],
  "contents": {
    "patchers": {
      "BECA Control.maxpat": { "kind": "patcher" },
      "BECA Control.amxd": { "kind": "patcher" }
    },
    "code": {
      "code/beca_native_controller.js": { "kind": "javascript" },
      "beca_control_ui.js": { "kind": "javascript" },
      "code/beca_control_node.js": { "kind": "javascript" },
      "code/beca_control_ui.js": { "kind": "javascript" },
      "code/package.json": { "kind": "json" }
    },
    "pages": {
      "pages/input.maxpat": { "kind": "patcher" },
      "pages/output.maxpat": { "kind": "patcher" },
      "pages/theory.maxpat": { "kind": "patcher" },
      "pages/led.maxpat": { "kind": "patcher" },
      "pages/engine.maxpat": { "kind": "patcher" }
    },
    "assets": {
      "assets/README.md": { "kind": "text" }
    }
  }
}
