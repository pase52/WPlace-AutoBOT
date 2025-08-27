import { v4 as uuidv4 } from 'uuid';

export const newId = () => uuidv4();

export const assertString = (v, name, maxLen = 200) => {
  if (typeof v !== 'string' || v.length === 0) throw new Error(`${name} is required`);
  if (v.length > maxLen) throw new Error(`${name} too long`);
  return v;
};

export const safeJSON = {
  parse: (s, fallback = null) => {
    try { return JSON.parse(s); } catch { return fallback; }
  },
  stringify: (o) => JSON.stringify(o ?? null),
};
