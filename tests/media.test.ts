import test from "node:test";
import assert from "node:assert/strict";
import { mediaKindFromExt, sniffMedia } from "../src/lib/media-shared";

const bytes = (...n: number[]) => Uint8Array.from([...n, ...new Array(16).fill(0)]);

test("reconhece JPEG, PNG e GIF pelos bytes", () => {
  assert.equal(sniffMedia(bytes(0xff, 0xd8, 0xff)), "image");
  assert.equal(sniffMedia(bytes(0x89, 0x50, 0x4e, 0x47)), "image");
  assert.equal(sniffMedia(bytes(0x47, 0x49, 0x46, 0x38)), "image");
});

test("reconhece MP4 pelo ftyp", () => {
  assert.equal(sniffMedia(Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])), "video");
});

test("recusa executável/HTML disfarçado", () => {
  assert.equal(sniffMedia(Uint8Array.from(Buffer.from("<html><script>alert(1)</script>"))), null);
  assert.equal(sniffMedia(Uint8Array.from(Buffer.from("MZ\x90\x00"))), null);
});

test("extensões permitidas", () => {
  assert.equal(mediaKindFromExt("JPG"), "image");
  assert.equal(mediaKindFromExt("mp4"), "video");
  assert.equal(mediaKindFromExt("exe"), null);
});
