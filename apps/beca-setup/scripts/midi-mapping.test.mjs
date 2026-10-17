import { test } from "node:test";
import assert from "node:assert/strict";
import { MidiMapper, decodeControl, validateMappings } from "../ui/src/midi-mapping.js";
const binding = (extra = {}) => ({ device: "Knobs", target: "cutoff", kind: "cc", channel: 1, number: 74, mode: "pickup", ...extra });
function fixture(stored = [], overrides = {}) {
  const values = { cutoff: 50, mute: 0, mode: "a", ...overrides };
  const controls = new Map([
    ["cutoff", () => ({ enabled: true, min: 0, max: 100, step: 1, value: values.cutoff })],
    ["mute", () => ({ enabled: true, toggle: true, value: values.mute })],
    ["mode", () => ({ enabled: true, options: ["a", "b", "c"], value: values.mode })]
  ]);
  const edits = [];
  const mapper = new MidiMapper({ controls, stored, change: changes => { edits.push(changes); Object.assign(values, changes); } });
  return { mapper, edits, values, controls };
}

test("decodes all channels and bend; rejects clock, SysEx, malformed data and channel mode commands", () => {
  assert.equal(decodeControl([0xbf, 74, 127]).channel, 16);
  assert.equal(decodeControl([0xe0, 127, 127]).value, 16383);
  assert.equal(decodeControl([0x90, 60, 0]).pressed, false);
  for (const bytes of [[0xf8], [0xf0, 1, 2], [0xb0, 120, 0], [0xb0, -1, 12], [0xb0, 1, NaN], [0x70, 1, 1]]) assert.equal(decodeControl(bytes), null);
});
test("validates and bounds untrusted saved mappings", () => {
  const keys = new Set(["cutoff"]);
  assert.deepEqual(validateMappings({}, keys), []);
  assert.equal(validateMappings([binding(), binding(), binding({ channel: 0 }), binding({ mode: "__proto__" }), binding({ target: "wifi_password" })], keys).length, 1);
  assert.equal(validateMappings(Array.from({ length: 100 }, (_, number) => binding({ number })), keys).length, 64);
});
test("learn is silent, replaces an occupied source, and isolates input and channel", () => {
  const { mapper, edits } = fixture([binding()]);
  mapper.learn("mute", "Knobs"); mapper.receive("Other", [0xb0, 74, 0]);
  assert.ok(mapper.learning);
  mapper.receive("Knobs", [0xb0, 74, 0]);
  assert.equal(mapper.mappings.length, 1); assert.equal(mapper.mappings[0].target, "mute"); assert.equal(edits.length, 0);
  mapper.receive("Knobs", [0xb1, 74, 127]); assert.equal(edits.length, 0);
  mapper.receive("Knobs", [0xb0, 74, 127]); assert.deepEqual(edits, [{ mute: 1 }]);
});
test("pickup waits for crossing and rearms after mouse, preset or device changes", () => {
  const { mapper, edits, values } = fixture([binding()]);
  mapper.receive("Knobs", [0xb0, 74, 0]); assert.equal(edits.length, 0);
  mapper.receive("Knobs", [0xb0, 74, 80]); assert.equal(values.cutoff, 63);
  mapper.receive("Knobs", [0xb0, 74, 100]); assert.equal(values.cutoff, 79);
  values.cutoff = 20;
  mapper.receive("Knobs", [0xb0, 74, 110]); assert.equal(values.cutoff, 20);
  mapper.receive("Knobs", [0xb0, 74, 20]); assert.equal(values.cutoff, 16);
  mapper.reset(); mapper.receive("Knobs", [0xb0, 74, 127]); assert.equal(values.cutoff, 16);
});
test("note pads toggle once per press and ignore releases and repeated held events", () => {
  const { mapper, values } = fixture([binding({ target: "mute", kind: "note", number: 60, mode: "direct" })]);
  mapper.receive("Knobs", [0x90, 60, 100]); assert.equal(values.mute, 1);
  mapper.receive("Knobs", [0x90, 60, 100]); assert.equal(values.mute, 1);
  mapper.receive("Knobs", [0x80, 60, 100]); assert.equal(values.mute, 1);
  mapper.receive("Knobs", [0x90, 60, 100]); assert.equal(values.mute, 0);
});
test("a learned pad requires release before it can change a setting", () => {
  const { mapper, edits } = fixture(); mapper.learn("mute", "Knobs");
  mapper.receive("Knobs", [0x90, 60, 100]); mapper.receive("Knobs", [0x90, 60, 100]); assert.equal(edits.length, 0);
  mapper.receive("Knobs", [0x90, 60, 0]); mapper.receive("Knobs", [0x90, 60, 100]); assert.deepEqual(edits, [{ mute: 1 }]);
});
test("relative encoders handle each format, boundaries and reverse", () => {
  for (const [mode, up, down] of [["twos", 1, 127], ["offset", 65, 63], ["sign", 1, 65]]) {
    const { mapper, values } = fixture([binding({ mode })]);
    mapper.receive("Knobs", [0xb0, 74, up]); assert.equal(values.cutoff, 51);
    mapper.receive("Knobs", [0xb0, 74, down]); assert.equal(values.cutoff, 50);
    mapper.mappings[0].inverted = true; mapper.receive("Knobs", [0xb0, 74, up]); assert.equal(values.cutoff, 49);
    values.cutoff = 0; mapper.receive("Knobs", [0xb0, 74, up]); assert.equal(values.cutoff, 0);
  }
});
test("selects retain protocol values; ranges and bend stay bounded", () => {
  const { mapper, values } = fixture([binding({ target: "mode", mode: "direct" }), binding({ number: 0, kind: "bend", mode: "direct" })]);
  mapper.receive("Knobs", [0xb0, 74, 127]); assert.equal(values.mode, "c");
  mapper.receive("Knobs", [0xe0, 127, 127]); assert.equal(values.cutoff, 100);
  mapper.receive("Knobs", [0xe0, 0, 0]); assert.equal(values.cutoff, 0);
});
test("hidden, disabled and unavailable controls never change", () => {
  const { mapper, edits, controls } = fixture([binding({ mode: "direct" })]);
  controls.set("cutoff", () => ({ enabled: false })); mapper.receive("Knobs", [0xb0, 74, 127]); assert.equal(edits.length, 0);
});

test("learning a held CC switch ignores its release", () => {
  const { mapper, values, edits } = fixture([], { mute: 1 });
  mapper.learn("mute", "Knobs"); mapper.receive("Knobs", [0xb0, 21, 127]);
  mapper.receive("Knobs", [0xb0, 21, 0]); assert.equal(edits.length, 0); assert.equal(values.mute, 1);
  mapper.receive("Knobs", [0xb0, 21, 127]); mapper.receive("Knobs", [0xb0, 21, 0]); assert.equal(values.mute, 0);
});
