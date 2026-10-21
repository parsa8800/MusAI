const STORAGE_KEY = "musai-scale-fingering";
const CHANGE_EVENT = "musai-scale-fingering";

/** Off unless the player has chosen to keep fingering on. */
export function parseScaleFingeringStored(value: string | null): boolean {
  return value === "1";
}

export function readScaleFingeringEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return parseScaleFingeringStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function writeScaleFingeringEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeScaleFingering(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
