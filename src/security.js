import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const cost = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const token = () => randomBytes(32).toString('hex');
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, cost);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  const [algorithm, salt, expected] = hash.split(':');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const key = await derive(password, salt, 64, cost);
  const saved = Buffer.from(expected, 'hex');
  return saved.length === key.length && timingSafeEqual(saved, key);
}
export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new AppError(status, message);
}
export function text(value, label, max = 120, min = 1) {
  requireValue(typeof value === 'string', `${label}: očekává se text.`);
  const result = value.trim();
  requireValue(result.length >= min && result.length <= max, `${label}: zadejte ${min}–${max} znaků.`);
  return result;
}
export function integer(value, label, min = 1, max = 1000000000) {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max,
    `${label}: zadejte celé číslo ${min}–${max}.`);
  return value;
}
export function email(value) {
  const result = text(value, 'E-mail', 254).toLowerCase();
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'Zadejte platný e-mail.');
  return result;
}
export function password(value) {
  requireValue(typeof value === 'string' && value.length >= 12 && value.length <= 128,
    'Heslo musí mít 12–128 znaků.');
  return value;
}
