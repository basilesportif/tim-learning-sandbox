// Minimal ZIP reader (stored/deflate entries) using node:zlib - avoids adding a
// dependency just to read one CSV out of an ISTAT download.
import zlib from 'node:zlib'

export function readZipEntries(buf) {
  // Locate End Of Central Directory record.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a zip file (no EOCD)')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad central directory')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    entries.push({
      name,
      read() {
        const lNameLen = buf.readUInt16LE(localOffset + 26)
        const lExtraLen = buf.readUInt16LE(localOffset + 28)
        const start = localOffset + 30 + lNameLen + lExtraLen
        const data = buf.subarray(start, start + compSize)
        if (method === 0) return data
        if (method === 8) return zlib.inflateRawSync(data)
        throw new Error(`Unsupported zip method ${method} for ${name}`)
      },
    })
  }
  return entries
}
