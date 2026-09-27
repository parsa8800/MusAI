export type CoachMemoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type CoachMemory = {
  open: boolean;
  messages: CoachMemoryMessage[];
};

const memory = new Map<string, CoachMemory>();

function entry(key: string): CoachMemory {
  return memory.get(key) ?? { open: false, messages: [] };
}

export function readCoachMemory(key: string): CoachMemory {
  const saved = entry(key);
  return { open: saved.open, messages: [...saved.messages] };
}

export function writeCoachMessages(
  key: string,
  messages: readonly CoachMemoryMessage[],
): void {
  memory.set(key, { ...entry(key), messages: [...messages] });
}

export function writeCoachOpen(key: string, open: boolean): void {
  memory.set(key, { ...entry(key), open });
}

export function clearCoachMemory(): void {
  memory.clear();
}
