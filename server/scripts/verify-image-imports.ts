/** Проверка, что в образе лежит всё, что нужно серверным скриптам.
 *
 *  Образ бэкенда копирует из фронтенда не весь `src`, а срез: `src/data`,
 *  `src/lib` и `src/theme.ts` (см. server/Dockerfile). Срез — вещь хрупкая:
 *  достаточно добавить во фронтенде один импорт за его пределы, и `npm run
 *  seed` внутри контейнера падает с MODULE_NOT_FOUND. Именно так и вышло
 *  01.08.2026: `src/data/cabinet.ts` стал импортировать `../theme`, деплой
 *  дошёл до сида и остановился — а вместе с ним не установились и резервные
 *  копии, потому что этот шаг идёт следом.
 *
 *  Локально такое не ловится: в рабочей копии лежит весь репозиторий, урезанный
 *  срез существует только внутри образа. Поэтому проверка выполняется на сборке
 *  (RUN в server/Dockerfile) — там же, где живёт настоящий срез.
 *
 *  Проверяется РАЗРЕШЕНИЕ импортов, а не выполнение модулей: от входных точек
 *  (seed, clean-demo) обходятся относительные импорты вглубь, и каждый должен
 *  найтись файлом на диске. Выполнять модули нельзя — часть `src/lib` тянет
 *  react, которого на сервере нет и не должно быть; но эти файлы в цепочку
 *  сида и не входят, и обход это показывает, а не угадывает.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

/** Входные точки, которые запускаются внутри контейнера. */
const ENTRIES = [
  'prisma/seed.ts',
  'scripts/clean-demo.ts',
];

/** Расширения и index-файлы — как их ищет tsx. */
const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

/** Относительные импорты: `from '../x'`, `import('../x')`, `require('../x')`. */
const IMPORT_RE = /(?:from|import|require)\s*\(?\s*['"](\.[^'"]+)['"]/g;

const ROOT = resolve(__dirname, '..');

function resolveFile(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const ext of CANDIDATES) {
    const candidate = base + ext;
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      try {
        readFileSync(candidate);
        return candidate;
      } catch {
        /* каталог, а не файл — пробуем следующий вариант */
      }
    }
  }
  return null;
}

const seen = new Set<string>();
const missing: Array<{ importer: string; spec: string }> = [];

function walk(file: string) {
  if (seen.has(file)) return;
  seen.add(file);

  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1];
    const target = resolveFile(file, spec);
    if (!target) {
      missing.push({ importer: relative(ROOT, file), spec });
      continue;
    }
    walk(target);
  }
}

for (const entry of ENTRIES) {
  const path = resolve(ROOT, entry);
  if (!existsSync(path)) {
    missing.push({ importer: '(Dockerfile)', spec: entry });
    continue;
  }
  walk(path);
}

if (missing.length) {
  console.error('\nВ образе не хватает файлов — серверные скрипты их не найдут:\n');
  for (const m of missing) console.error(`  ${m.importer}  →  ${m.spec}`);
  console.error(
    '\nЧинится в server/Dockerfile: добавьте недостающий путь в COPY рядом\n'
    + 'с `COPY src/data` / `COPY src/lib` / `COPY src/theme.ts`.\n'
    + 'Без этого `npm run seed` и `npm run clean:demo` упадут уже на сервере,\n'
    + 'после миграций и до установки резервных копий.\n',
  );
  process.exit(1);
}

console.log(`Срез фронтенда в образе полный: ${seen.size} файлов, все импорты разрешились.`);
