/** Quita espacios al inicio y al final de los textos recibidos. */
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
