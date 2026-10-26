import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  artifactUploadLimit,
  readArtifact,
  saveArtifact,
  sourceStorageConfigured,
  type ArtifactGateway,
} from "../lib/artifacts";

const environmentNames = [
  "VERCEL",
  "ARTIFACT_STORAGE",
  "ARTIFACT_DIR",
  "BLOB_READ_WRITE_TOKEN",
] as const;
const previous = new Map<string, string | undefined>();
let directory: string;
const source = Buffer.from("Private source archive test bytes.");

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "vibe96-storage-"));
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});
beforeEach(() => {
  for (const name of environmentNames) {
    previous.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.ARTIFACT_DIR = directory;
});
afterEach(() => {
  for (const name of environmentNames) {
    const value = previous.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function streamed(bytes: Uint8Array, declaredSize = bytes.length) {
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    blob: { size: declaredSize },
  };
}
function gateway(result: Awaited<ReturnType<ArtifactGateway["get"]>>) {
  const puts: Parameters<ArtifactGateway["put"]>[] = [];
  const gets: Parameters<ArtifactGateway["get"]>[] = [];
  const client: ArtifactGateway = {
    async put(...args) {
      puts.push(args);
      return {};
    },
    async get(...args) {
      gets.push(args);
      return result;
    },
  };
  return { client, puts, gets };
}
function hosted() {
  process.env.VERCEL = "1";
  process.env.BLOB_READ_WRITE_TOKEN =
    "vercel_blob_rw_test_fixture_not_a_real_token";
}

test("local storage writes private immutable files and reads exact source bytes", async () => {
  const key = randomUUID() + ".zip";
  assert.equal(sourceStorageConfigured(), true);
  assert.equal(artifactUploadLimit(), 10 * 1024 * 1024);
  await saveArtifact(key, source);
  assert.deepEqual(await readArtifact(key), source);
  assert.equal((await stat(path.join(directory, key))).mode & 0o777, 0o600);
  await assert.rejects(saveArtifact(key, source), /EEXIST/);
});

test("archive keys reject path traversal, URLs and malformed names before storage calls", async () => {
  hosted();
  const mock = gateway(null);
  for (const key of [
    "../source.zip",
    "https://example.com/a.zip",
    "source.zip",
    "a/" + randomUUID() + ".zip",
    randomUUID() + ".zip/other",
  ]) {
    await assert.rejects(
      saveArtifact(key, source, mock.client),
      /Invalid private archive reference/,
    );
    await assert.rejects(
      readArtifact(key, mock.client),
      /Invalid private archive reference/,
    );
  }
  assert.equal(mock.gets.length, 0);
  assert.equal(mock.puts.length, 0);
});

test("Vercel cannot fall back to ephemeral filesystem without a private Blob binding", async () => {
  const key = randomUUID() + ".zip";
  await saveArtifact(key, source);
  process.env.VERCEL = "1";
  process.env.ARTIFACT_STORAGE = "local";
  assert.equal(sourceStorageConfigured(), false);
  assert.equal(artifactUploadLimit(), 4 * 1024 * 1024);
  await assert.rejects(readArtifact(key), /not connected/);
  await assert.rejects(
    saveArtifact(randomUUID() + ".zip", source),
    /not connected/,
  );
  process.env.BLOB_READ_WRITE_TOKEN = "   ";
  assert.equal(sourceStorageConfigured(), false);
});

test("explicit Blob selection also fails closed outside Vercel", async () => {
  process.env.ARTIFACT_STORAGE = "vercel-blob";
  assert.equal(sourceStorageConfigured(), false);
  await assert.rejects(readArtifact(randomUUID() + ".zip"), /not connected/);
  assert.equal(artifactUploadLimit(), 10 * 1024 * 1024);
});

test("Blob SDK boundary uses private immutable uploads and private uncached reads", async () => {
  hosted();
  const key = randomUUID() + ".zip";
  const mock = gateway(streamed(source));
  assert.equal(sourceStorageConfigured(), true);
  await saveArtifact(key, source, mock.client);
  assert.equal(mock.puts[0][0], `vibe96/artifacts/${key}`);
  assert.deepEqual(mock.puts[0][1], source);
  assert.deepEqual(mock.puts[0][2], {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/zip",
  });
  assert.deepEqual(await readArtifact(key, mock.client), source);
  assert.deepEqual(mock.gets[0], [
    `vibe96/artifacts/${key}`,
    {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      useCache: false,
    },
  ]);
});

test("missing and non-200 private Blob results cannot be delivered", async () => {
  hosted();
  for (const result of [
    null,
    { statusCode: 304, stream: null, blob: { size: null } },
  ]) {
    await assert.rejects(
      readArtifact(randomUUID() + ".zip", gateway(result).client),
      /unavailable/,
    );
  }
});

test("private Blob reads reject oversized declarations and forged stream sizes", async () => {
  hosted();
  await assert.rejects(
    readArtifact(
      randomUUID() + ".zip",
      gateway(streamed(source, 10 * 1024 * 1024 + 1)).client,
    ),
    /unsupported size/,
  );
  await assert.rejects(
    readArtifact(
      randomUUID() + ".zip",
      gateway(streamed(source, source.length - 1)).client,
    ),
    /does not match/,
  );
  await assert.rejects(
    readArtifact(
      randomUUID() + ".zip",
      gateway(streamed(new Uint8Array(10 * 1024 * 1024 + 1), 1)).client,
    ),
    /maximum size/,
  );
});

test("hosted uploads enforce 4 MiB before calling the Blob provider", async () => {
  hosted();
  const mock = gateway(null);
  await assert.rejects(
    saveArtifact(
      randomUUID() + ".zip",
      Buffer.alloc(4 * 1024 * 1024 + 1),
      mock.client,
    ),
    /upload size limit/,
  );
  assert.equal(mock.puts.length, 0);
});
