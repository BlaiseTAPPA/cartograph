import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

// A tar reader for exactly what GitHub's archives contain: ustar headers, pax
// headers (the global one carries the commit) and GNU long names. Written here
// rather than installed because it is small and every entry needs a decision
// about whether it can land on disk, which a general extractor makes for you.

const BLOCK = 512;

// Above this the archive is too large to hold unpacked in one run.
export const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;

export type Unwritten = {
  path: string;
  reason: "link" | "special-entry" | "unsafe-path" | "name-not-allowed-here" | "case-collision" | "write-failed";
};

export type Unpacked = {
  /** From the archive's pax global header. Null when the archive has none. */
  commitSha: string | null;
  /** Regular files written to disk. */
  written: number;
  /** Entries that are not on disk, each with why. Never silently dropped. */
  unwritten: Unwritten[];
};

/**
 * Writes a GitHub tarball into `destination`, without the single top-level
 * folder GitHub wraps everything in, so paths are relative to the repository.
 */
export function unpackTarGz(archive: Buffer, destination: string): Unpacked {
  let tar: Buffer;
  try {
    tar = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES });
  } catch (cause) {
    if (cause instanceof RangeError) {
      throw new Error(`The repository is larger than ${MAX_UNPACKED_BYTES / 1024 / 1024} MB unpacked, which is more than one run can analyse.`);
    }
    throw new Error(`The archive could not be decompressed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  let commitSha: string | null = null;
  let written = 0;
  const unwritten: Unwritten[] = [];
  // Lowercased paths already written. On a case-insensitive disk a second file
  // differing only in case would overwrite the first without a word.
  const caseInsensitive = process.platform === "win32" || process.platform === "darwin";
  const seen = new Set<string>();

  let nextPath: string | null = null;
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break;

    const size = readSize(header);
    const type = String.fromCharCode(header[156] || 48);
    const bodyStart = offset + BLOCK;
    const body = tar.subarray(bodyStart, bodyStart + size);
    offset = bodyStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "g") {
      commitSha = paxRecords(body).get("comment") ?? commitSha;
      continue;
    }
    if (type === "x") {
      nextPath = paxRecords(body).get("path") ?? null;
      continue;
    }
    if (type === "L") {
      nextPath = cString(body, 0, body.length);
      continue;
    }

    const entryPath = nextPath ?? headerPath(header);
    nextPath = null;
    const relative = stripTopFolder(entryPath);
    if (relative === null) continue; // The top folder itself.

    if (type === "5") continue; // Directories are created as files need them.
    if (type === "1" || type === "2") {
      // The walk doesn't follow links either, so nothing parsed is lost.
      unwritten.push({ path: relative, reason: "link" });
      continue;
    }
    if (type !== "0" && type !== "7") {
      unwritten.push({ path: relative, reason: "special-entry" });
      continue;
    }

    const segments = relative.split("/");
    if (segments.some((s) => s === "" || s === "." || s === "..") || relative.includes("\\")) {
      unwritten.push({ path: relative, reason: "unsafe-path" });
      continue;
    }
    if (process.platform === "win32" && segments.some(notAllowedOnWindows)) {
      unwritten.push({ path: relative, reason: "name-not-allowed-here" });
      continue;
    }
    if (caseInsensitive) {
      const key = relative.toLowerCase();
      if (seen.has(key)) {
        unwritten.push({ path: relative, reason: "case-collision" });
        continue;
      }
      seen.add(key);
    }

    const target = path.join(destination, ...segments);
    try {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, body);
      written += 1;
    } catch {
      unwritten.push({ path: relative, reason: "write-failed" });
    }
  }

  return { commitSha, written, unwritten };
}

function readSize(header: Buffer): number {
  // GNU base-256 for sizes too large for the octal field.
  if (header[124] & 0x80) {
    let n = 0;
    for (let i = 125; i < 136; i++) n = n * 256 + header[i];
    return n;
  }
  return parseInt(cString(header, 124, 12).trim() || "0", 8);
}

function headerPath(header: Buffer): string {
  const name = cString(header, 0, 100);
  // ustar splits long paths into a prefix and a name.
  const prefix = cString(header, 257, 6) === "ustar" ? cString(header, 345, 155) : "";
  return prefix ? `${prefix}/${name}` : name;
}

function cString(buf: Buffer, start: number, length: number): string {
  const slice = buf.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

/** Pax records are "<length> <key>=<value>\n", length counting the whole record. */
function paxRecords(body: Buffer): Map<string, string> {
  const records = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    const space = body.indexOf(0x20, i);
    if (space === -1) break;
    const length = parseInt(body.subarray(i, space).toString("utf8"), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = body.subarray(space + 1, i + length - 1).toString("utf8");
    const eq = record.indexOf("=");
    if (eq !== -1) records.set(record.slice(0, eq), record.slice(eq + 1));
    i += length;
  }
  return records;
}

function stripTopFolder(entryPath: string): string | null {
  const clean = entryPath.replace(/\/+$/, "");
  const slash = clean.indexOf("/");
  return slash === -1 ? null : clean.slice(slash + 1);
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

function notAllowedOnWindows(segment: string): boolean {
  return (
    /[<>:"|?*\u0000-\u001f]/.test(segment) || /[. ]$/.test(segment) || WINDOWS_RESERVED.test(segment)
  );
}
