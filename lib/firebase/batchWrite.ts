import type { WriteBatch } from "firebase-admin/firestore";
import { getDb } from "./admin";

const CHUNK_SIZE = 450; // stay under Firestore's 500 ops/batch limit

export type BatchOp = (batch: WriteBatch) => void;

export async function commitInChunks(ops: BatchOp[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + CHUNK_SIZE)) {
      op(batch);
    }
    await batch.commit();
  }
}
