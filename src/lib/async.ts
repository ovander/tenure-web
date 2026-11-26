// Small helpers against write and read races (the app writes with If-Match
// versions and reloads on watchers): keep the saves of one record in order,
// and drop an answer that is no longer the latest one asked for.

// queueByKey runs the tasks of one key one after the other, in the order they
// were queued, each once: unlike serialByKey (which collapses calls into one
// rerun with the latest draft), no task is dropped, so every patch is sent.
// Each task starts only once the previous one of its key has settled, so it
// can build its body from the record as the previous save left it. A failed
// task rejects its own promise and does not stop the next one. Different keys
// run side by side.
export interface KeyQueue {
  <T>(key: string, task: () => Promise<T>): Promise<T>
  // idle resolves once no task of any key is queued or running, including
  // tasks queued while it waits.
  idle(): Promise<void>
}

export function queueByKey(): KeyQueue {
  const tails = new Map<string, Promise<unknown>>()
  const run = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const prev = tails.get(key) ?? Promise.resolve()
    const p = prev.then(task, task)
    const tail = p.catch(() => undefined)
    tails.set(key, tail)
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key)
    })
    return p
  }
  const idle = async (): Promise<void> => {
    while (tails.size) await Promise.all([...tails.values()])
  }
  return Object.assign(run, { idle })
}

// useLatest guards a screen against answers arriving out of order: take a
// token when a request starts, and assign its answer only while the token is
// still the latest one taken (a later watcher run or action supersedes it).
//
//   const latest = useLatest()
//   async function load() {
//     const token = latest.next()
//     const data = await fetch()
//     if (!latest.isLatest(token)) return
//     rows.value = data
//   }
export interface Latest {
  next(): number
  isLatest(token: number): boolean
}

export function useLatest(): Latest {
  let seq = 0
  return {
    next: () => ++seq,
    isLatest: (token: number) => token === seq,
  }
}
