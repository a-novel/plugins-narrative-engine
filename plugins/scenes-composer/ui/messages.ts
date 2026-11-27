/** Fills the `{{name}}` places of a message with their values. */
export const fill = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name]));
