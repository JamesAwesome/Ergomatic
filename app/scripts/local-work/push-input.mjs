import fs from "node:fs";
import { git } from "./selection-git.mjs";

export async function readBounded(stream, limit, deadlineMs) {
  let length = 0;
  const chunks = [];
  const timer = setTimeout(
    () => stream.destroy(new Error("Input deadline exceeded")),
    deadlineMs,
  );
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > limit) throw new Error("Input size limit exceeded");
      chunks.push(bytes);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } finally {
    clearTimeout(timer);
    stream.destroy();
  }
}

export function parseFullRequest(text, head) {
  const packet = JSON.parse(text);
  if (
    packet?.version !== 1 ||
    packet.mode !== "full" ||
    packet.head !== head ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head) ||
    JSON.stringify(packet.projects) !== JSON.stringify(["unit", "client"])
  )
    throw new Error("Invalid or stale invocation-scoped full-push request");
  return packet;
}

export async function readPushRequest(
  root,
  env = process.env,
  input = process.stdin,
) {
  let full = false;
  if (env.ERGOMATIC_FULL_PUSH_FD !== undefined) {
    if (env.ERGOMATIC_FULL_PUSH_FD !== "3")
      throw new Error("Invalid full-push descriptor");
    const packet = await readBounded(
      fs.createReadStream(null, { fd: 3 }),
      4096,
      2000,
    );
    parseFullRequest(packet, git(root, ["rev-parse", "HEAD"]).trim());
    full = true;
  }
  return { full, input: await readBounded(input, 1024 * 1024, 2000) };
}
