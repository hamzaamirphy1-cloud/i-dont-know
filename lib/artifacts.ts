import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const HOSTED_UPLOAD_BYTES = 4 * 1024 * 1024;

type PrivatePutOptions = {
  access: "private";
  token: string;
  addRandomSuffix: false;
  allowOverwrite: false;
  contentType: "application/zip";
};
type PrivateGetOptions = {
  access: "private";
  token: string;
  useCache: false;
};

// The optional SDK boundary is for server-side tests. Request handlers do not
// accept or expose it, and private blob URLs are never stored in public data.
export type ArtifactGateway = {
  put(
    pathname: string,
    body: Buffer,
    options: PrivatePutOptions,
  ): Promise<unknown>;
  get(
    pathname: string,
    options: PrivateGetOptions,
  ): Promise<{
    statusCode: number;
    stream: ReadableStream<Uint8Array> | null;
    blob: { size: number | null };
  } | null>;
};

function usesBlobStorage() {
  return (
    process.env.VERCEL === "1" || process.env.ARTIFACT_STORAGE === "vercel-blob"
  );
}

export function sourceStorageConfigured() {
  return !usesBlobStorage() || !!process.env.BLOB_READ_WRITE_TOKEN?.trim();
}

export function artifactUploadLimit() {
  // Keep the multipart body safely below Vercel Functions' 4.5 MB request limit.
  return process.env.VERCEL === "1" ? HOSTED_UPLOAD_BYTES : MAX_ARCHIVE_BYTES;
}

function validateKey(key: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.zip$/i.test(
      key,
    )
  ) {
    throw new Error("Invalid private archive reference.");
  }
}

function localDirectory() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.ARTIFACT_DIR || "./data/artifacts",
  );
}

function blobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Private source storage is not connected. Configure a private Vercel Blob store.",
    );
  }
  return token;
}

export async function saveArtifact(
  key: string,
  data: Buffer,
  gateway?: ArtifactGateway,
): Promise<void> {
  validateKey(key);
  if (data.length > artifactUploadLimit()) {
    throw new Error("Source archive exceeds the upload size limit.");
  }
  if (usesBlobStorage()) {
    const token = blobToken();
    await (gateway ?? { get, put }).put(`vibe96/artifacts/${key}`, data, {
      access: "private",
      token,
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/zip",
    });
    return;
  }
  await mkdir(localDirectory(), { recursive: true });
  await writeFile(path.join(localDirectory(), key), data, {
    flag: "wx",
    mode: 0o600,
  });
}

export async function readArtifact(
  key: string,
  gateway?: ArtifactGateway,
): Promise<Buffer> {
  validateKey(key);
  if (!usesBlobStorage()) {
    const bytes = await readFile(
      /*turbopackIgnore: true*/ path.join(
        /*turbopackIgnore: true*/ localDirectory(),
        key,
      ),
    );
    if (bytes.length > MAX_ARCHIVE_BYTES) {
      throw new Error("Private source archive exceeds the maximum size.");
    }
    return bytes;
  }
  const token = blobToken();
  const result = await (gateway ?? { get, put }).get(
    `vibe96/artifacts/${key}`,
    { access: "private", token, useCache: false },
  );
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("The private source archive is currently unavailable.");
  }
  const reader = result.stream.getReader();
  const declaredSize = result.blob.size;
  if (
    declaredSize === null ||
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 0 ||
    declaredSize > MAX_ARCHIVE_BYTES
  ) {
    await reader.cancel();
    throw new Error("Private source archive has an unsupported size.");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      // Count actual bytes rather than trusting provider metadata alone.
      if (total > MAX_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new Error("Private source archive exceeds the maximum size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== declaredSize) {
    throw new Error("Private source archive size does not match its metadata.");
  }
  return Buffer.concat(chunks, total);
}
