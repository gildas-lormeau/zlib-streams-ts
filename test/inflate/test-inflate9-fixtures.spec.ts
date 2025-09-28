import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_STREAM_END, Z_FINISH } from "../../src/index";

function findFixtures(): string[] {
  const candidates: string[] = [];
  const thisFile = new URL(import.meta.url);
  const base1 = path.resolve(path.dirname(thisFile.pathname), "../data");
  const base2 = path.resolve(path.dirname(thisFile.pathname), "../../ref-test/ref-data");
  [base1, base2].forEach((dir) => {
    try {
      const names = fs.readdirSync(dir);
      for (const n of names) {
        if (n.endsWith(".deflate64")) {
          candidates.push(path.join(dir, n));
        }
      }
    } catch {
      // ignore missing dirs
    }
  });
  return candidates;
}

describe("inflate9: fixture sweep", () => {
  const fixtures = findFixtures();
  for (const fixture of fixtures) {
    it(`inflate9: ${path.relative(process.cwd(), fixture)}`, () => {
      const data = fs.readFileSync(fixture);
      const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const out = new Uint8Array(1024 * 1024 * 4);
      const strm = createInflateStream(true);
      let ret = inflateInit(strm);
      assert.strictEqual(ret, Z_OK, `raw init failed: ${ret}`);
      strm.next_in = input;
      strm.next_out = out;
      strm.avail_in = input.length;
      strm.avail_out = out.length;
      ret = inflate(strm, Z_FINISH);
      if (ret !== Z_OK && ret !== Z_STREAM_END) {
        throw new Error(`inflate returned unexpected code: ${ret}`);
      }
      assert.ok(strm.total_out > 0, `no output for ${fixture}`);
      ret = inflateEnd(strm);
      assert.strictEqual(ret, Z_OK, `inflateEnd returned ${ret}`);
    });
  }
});
