/** Minimal server-sent-events reader: yields the `data:` payload of each event. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      // A final event without a trailing blank line still counts.
      buffer += done
        ? `${decoder.decode()}\n\n`
        : decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
