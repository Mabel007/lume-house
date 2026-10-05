export function accountInitials(name: string | null | undefined): string {
  const words = (name ?? "").normalize("NFC").trim().split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word));
  if (!words.length) return "LH";
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const initial = (word: string) => Array.from(segmenter.segment(word)).find(part => /[\p{L}\p{N}]/u.test(part.segment))?.segment ?? "";
  return (initial(words[0]) + (words.length > 1 ? initial(words[words.length - 1]) : "")).toLocaleUpperCase();
}
