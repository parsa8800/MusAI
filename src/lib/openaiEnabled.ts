/**
 * Live OpenAI calls only when a key exists and OPENAI_ENABLED is not off.
 * Default (unset): enabled if key present. Set OPENAI_ENABLED=false to force template.
 */
export function isOpenAiLlmEnabled(): boolean {
  const flag = process.env.OPENAI_ENABLED?.trim().toLowerCase();
  if (!flag) return true;
  return flag !== "0" && flag !== "false" && flag !== "off" && flag !== "no";
}
