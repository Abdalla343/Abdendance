interface Detector {
  detect(image: ImageData): Promise<Array<{ rawValue: string }>>;
}
interface DetectorConstructor {
  new(options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

/** Optional platform decoder. Every decoded value still needs consecutive frames and an exact worker match. */
export class EmployeeBarcode {
  private loading: Promise<Detector | null> | null = null;
  private failed = false;

  private load() {
    return this.loading ??= (async () => {
      const Native = (globalThis as typeof globalThis & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (!Native) return null;
      const supported = await Native.getSupportedFormats();
      const formats = supported.filter((format) => format !== "unknown");
      return formats.length ? new Native({ formats }) : null;
    })().catch(() => null);
  }

  async read(pixels: Uint8ClampedArray, width: number, height: number): Promise<string[]> {
    if (this.failed) return [];
    const detector = await this.load();
    if (!detector) return [];
    try {
      const detected = await detector.detect(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height));
      return [...new Set(detected.map(({ rawValue }) => rawValue.trim().toUpperCase())
        .filter((value) => /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/.test(value))
        .map((value) => value.replace(/-/g, "")))];
    } catch {
      this.failed = true;
      return [];
    }
  }
}
