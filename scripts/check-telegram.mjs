import { register } from 'node:module';

register(new URL('./telegram-resolve-hook.mjs', import.meta.url).href, {
  parentURL: import.meta.url,
});

await import('./check-telegram.ts');
