#!/usr/bin/env node

/* global process */

import esbuild from "esbuild";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import { minify } from "terser";

const entry = path.resolve(process.cwd(), "src/streams-api.ts");
const out = path.resolve(process.cwd(), "dist/zlib-streams.min.js");

esbuild
  .build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "browser",
    minify: true,
    sourcemap: false,
    outfile: out,
    inject: [path.resolve(process.cwd(), "scripts/esbuild-inject-globals.js")],
    target: ["es2020"],
  })
  .then(async () => {
    const code = readFileSync(out, "utf8");
    const result = await minify(code, {
      mangle: {
        properties: {
          regex: /^_/,
        },
      },
    });
    writeFileSync(out, result.code, "utf8");
    console.log("Built and minified with Terser:", out);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
