export type BeforeReplace = () => Promise<boolean>;

export async function passesBeforeReplace(beforeReplace?: unknown): Promise<boolean> {
  if (typeof beforeReplace !== "function") return true;
  return Boolean(await beforeReplace());
}
