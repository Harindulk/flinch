/** Playtests live in this browser's IndexedDB: session records in one store, the two video files in another. */
import type { Session, Videos } from "./types";

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("flinch", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("sessions", { keyPath: "id" });
      req.result.createObjectStore("videos");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      db = null;
      reject(req.error);
    };
  });
  return db;
}

async function run<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  const t = (await open()).transaction(stores, mode);
  const req = fn(t);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = t.onabort = () => reject(t.error ?? new Error("Storage failed"));
  });
}

export function saveSession(session: Session, videos: Videos): Promise<void> {
  return run(["sessions", "videos"], "readwrite", (t) => {
    t.objectStore("sessions").put(session);
    t.objectStore("videos").put(videos, session.id);
  });
}

export function updateSession(session: Session): Promise<void> {
  return run(["sessions"], "readwrite", (t) => void t.objectStore("sessions").put(session));
}

export async function listSessions(): Promise<Session[]> {
  const all = await run<Session[]>(["sessions"], "readonly", (t) => t.objectStore("sessions").getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSession(id: string): Promise<{ session: Session; videos: Videos } | null> {
  let s!: IDBRequest<Session | undefined>, v!: IDBRequest<Videos | undefined>;
  await run(["sessions", "videos"], "readonly", (t) => {
    s = t.objectStore("sessions").get(id);
    v = t.objectStore("videos").get(id);
  });
  return s.result && v.result ? { session: s.result, videos: v.result } : null;
}

export function deleteSession(id: string): Promise<void> {
  return run(["sessions", "videos"], "readwrite", (t) => {
    t.objectStore("sessions").delete(id);
    t.objectStore("videos").delete(id);
  });
}
