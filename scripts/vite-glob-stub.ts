// The Spellitaire artwork list uses Vite's import.meta.glob; outside Vite it finds no files.
;(globalThis as unknown as { __glob: () => Record<string, string> }).__glob = () => ({})
export {}
