declare const process: {
  env: Record<string, string | undefined>;
};

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}