import fsp from 'node:fs/promises';
import path from 'node:path';

const queues = new Map();

function enqueue(file, operation) {
  const previous = queues.get(file) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  const tracked = next.finally(() => {
    if (queues.get(file) === tracked) queues.delete(file);
  });
  queues.set(file, tracked);
  return next;
}

/**
 * Atomic JSON file store with a per-file write queue.
 * Safe for concurrent reads/writes in a single Node process (hackathon / single-region deploy).
 */
export function createJsonStore(file, { fallback = [] } = {}) {
  async function readRaw() {
    try {
      const value = JSON.parse(await fsp.readFile(file, 'utf8'));
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return typeof fallback === 'function' ? fallback() : structuredClone(fallback);
      throw error;
    }
  }

  async function writeRaw(value) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
    await fsp.rename(temporary, file);
  }

  return {
    file,
    read() {
      return enqueue(file, readRaw);
    },
    write(value) {
      return enqueue(file, () => writeRaw(value));
    },
    update(mutator) {
      return enqueue(file, async () => {
        const current = await readRaw();
        const next = await mutator(current);
        await writeRaw(next);
        return next;
      });
    }
  };
}
