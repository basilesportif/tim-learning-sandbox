import fs from 'fs';
import { basename, dirname, join } from 'path';

// Writes JSON so readers never see a half-written file: write a temp file in
// the same directory, then rename it over the target (atomic on POSIX).
export function writeJsonAtomic(filePath, value, fsImpl = fs) {
  const tmpPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fsImpl.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
    fsImpl.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fsImpl.rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
    throw error;
  }
}
