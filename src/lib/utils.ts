import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

export async function pollUntil<T>(
  check: () => Promise<T | null>,
  intervalMs = 3000
): Promise<T> {
  while (true) {
    await sleep(intervalMs)
    const result = await check()
    if (result !== null) return result
  }
}
