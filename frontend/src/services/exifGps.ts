export interface PhotoExifGps {
  lat: number;
  lng: number;
  capturedAt: string | null;
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  entryOffset: number;
}

const TYPE_BYTES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(start, start + length)).replace(/\0+$/, "");
}

function findTiffOffset(bytes: Uint8Array): number | null {
  // JPEG APP1 EXIF segment.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2 || offset + 2 + length > bytes.length) break;
      const payload = offset + 4;
      if (marker === 0xe1 && ascii(bytes, payload, 6) === "Exif") return payload + 6;
      offset += 2 + length;
    }
  }

  // WebP EXIF chunk.
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkName = ascii(bytes, offset, 4);
      const chunkLength = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
      const payload = offset + 8;
      if (payload + chunkLength > bytes.length) break;
      if (chunkName === "EXIF") {
        return ascii(bytes, payload, 6) === "Exif" ? payload + 6 : payload;
      }
      offset = payload + chunkLength + (chunkLength % 2);
    }
  }
  return null;
}

function capturedTimeFromExif(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}` : null;
}

async function readLegacyPhotoExifGps(file: File): Promise<PhotoExifGps | null> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const tiffStart = findTiffOffset(bytes);
    if (tiffStart == null || tiffStart + 8 > bytes.length) return null;
    const view = new DataView(buffer);
    const byteOrder = ascii(bytes, tiffStart, 2);
    if (byteOrder !== "II" && byteOrder !== "MM") return null;
    const littleEndian = byteOrder === "II";
    const u16 = (offset: number) => view.getUint16(offset, littleEndian);
    const u32 = (offset: number) => view.getUint32(offset, littleEndian);

    if (u16(tiffStart + 2) !== 42) return null;
    const ifd0Offset = tiffStart + u32(tiffStart + 4);
    const readIfd = (offset: number): IfdEntry[] => {
      if (offset + 2 > bytes.length) return [];
      const count = Math.min(u16(offset), 1024);
      const entries: IfdEntry[] = [];
      for (let index = 0; index < count; index += 1) {
        const entryOffset = offset + 2 + index * 12;
        if (entryOffset + 12 > bytes.length) break;
        entries.push({
          tag: u16(entryOffset),
          type: u16(entryOffset + 2),
          count: u32(entryOffset + 4),
          entryOffset,
        });
      }
      return entries;
    };
    const valueOffset = (entry: IfdEntry): number => {
      const byteLength = (TYPE_BYTES[entry.type] || 1) * entry.count;
      return byteLength <= 4 ? entry.entryOffset + 8 : tiffStart + u32(entry.entryOffset + 8);
    };
    const readAscii = (entry: IfdEntry | undefined): string | undefined => {
      if (!entry || entry.type !== 2 || entry.count > 256) return undefined;
      const offset = valueOffset(entry);
      return offset + entry.count <= bytes.length ? ascii(bytes, offset, entry.count) : undefined;
    };
    const readLong = (entry: IfdEntry | undefined): number | undefined => {
      if (!entry || entry.count < 1 || (entry.type !== 3 && entry.type !== 4)) return undefined;
      const offset = valueOffset(entry);
      if (offset + (entry.type === 3 ? 2 : 4) > bytes.length) return undefined;
      return entry.type === 3 ? u16(offset) : u32(offset);
    };
    const readRationals = (entry: IfdEntry | undefined): number[] | undefined => {
      if (!entry || entry.type !== 5 || entry.count < 3 || entry.count > 16) return undefined;
      const offset = valueOffset(entry);
      if (offset + entry.count * 8 > bytes.length) return undefined;
      const values: number[] = [];
      for (let index = 0; index < entry.count; index += 1) {
        const numerator = u32(offset + index * 8);
        const denominator = u32(offset + index * 8 + 4);
        values.push(denominator ? numerator / denominator : NaN);
      }
      return values;
    };

    const ifd0 = readIfd(ifd0Offset);
    const byTag = (entries: IfdEntry[], tag: number) => entries.find((entry) => entry.tag === tag);
    const gpsPointer = readLong(byTag(ifd0, 0x8825));
    if (gpsPointer == null) return null;
    const gps = readIfd(tiffStart + gpsPointer);
    const latParts = readRationals(byTag(gps, 2));
    const lngParts = readRationals(byTag(gps, 4));
    const latRef = readAscii(byTag(gps, 1))?.toUpperCase();
    const lngRef = readAscii(byTag(gps, 3))?.toUpperCase();
    if (!latParts || !lngParts || !["N", "S"].includes(latRef || "") || !["E", "W"].includes(lngRef || "")) return null;

    const dmsToDegrees = (parts: number[]) => parts[0] + parts[1] / 60 + parts[2] / 3600;
    const lat = dmsToDegrees(latParts) * (latRef === "S" ? -1 : 1);
    const lng = dmsToDegrees(lngParts) * (lngRef === "W" ? -1 : 1);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    const exifPointer = readLong(byTag(ifd0, 0x8769));
    const exifIfd = exifPointer == null ? [] : readIfd(tiffStart + exifPointer);
    const capturedAt = capturedTimeFromExif(
      readAscii(byTag(exifIfd, 0x9003)) || readAscii(byTag(ifd0, 0x0132))
    );
    return { lat, lng, capturedAt };
  } catch {
    return null;
  }
}


export type PhotoMetadataResult =
  | { status: "ok"; gps: PhotoExifGps }
  | { status: "missing_gps" | "unsupported_format" | "read_error"; message: string };

export async function inspectPhotoMetadata(file: File): Promise<PhotoMetadataResult> {
  // Parse the original before canvas/HEIC conversion, which can remove EXIF.
  try {
    const { parse } = await import("exifr");
    const metadata = await parse(await file.arrayBuffer(), {
      gps: true, exif: true, xmp: true, icc: false, iptc: false, reviveValues: false,
    });
    if (metadata) {
      const lat = metadata.latitude;
      const lng = metadata.longitude;
      if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
        && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        const rawTime = metadata.DateTimeOriginal || metadata.CreateDate || metadata.DateTime;
        const capturedAt = typeof rawTime === "string" ? capturedTimeFromExif(rawTime)
          : rawTime instanceof Date && !isNaN(rawTime.getTime()) ? rawTime.toISOString() : null;
        return { status: "ok", gps: { lat, lng, capturedAt } };
      }
    }
    const fallback = await readLegacyPhotoExifGps(file);
    if (fallback) return { status: "ok", gps: fallback };
    return { status: "missing_gps", message: "ファイルにGPS位置情報がありません。写真アプリに位置が表示されても、共有・書き出しで位置情報が削除される場合があります。「ファイルから原本を選択」でDCIM／Camera内の元画像を選択してください。" };
  } catch {
    const fallback = await readLegacyPhotoExifGps(file);
    if (fallback) return { status: "ok", gps: fallback };
    const supported = /\.(jpe?g|heic|heif|avif|png|tiff?|webp)$/i.test(file.name)
      || /^image\/(jpeg|heic|heif|avif|png|tiff|webp)$/.test(file.type);
    return supported
      ? { status: "read_error", message: "この画像のメタデータを読み取れませんでした。元画像の形式・書き出し方法を確認してください。" }
      : { status: "unsupported_format", message: "この画像形式の位置情報には対応していません。" };
  }
}

export async function readPhotoExifGps(file: File): Promise<PhotoExifGps | null> {
  const result = await inspectPhotoMetadata(file);
  return result.status === "ok" ? result.gps : null;
}
