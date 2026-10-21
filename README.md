# create-riot-app

Стартер Riot.js-приложения — аналог Create React App. Команда создаёт демо с боковым меню, звуками и тремя экранами. Сборка и dev-сервер работают на Bun.

В репозитории два слоя:

- `bin/create-riot-app.ts` — CLI, копирует шаблон в новую папку.
- `template/` — само демо. Его же получает новый проект.

## Стек

| | |
| --- | --- |
| Среда и пакеты | [Bun](https://bun.sh) |
| UI | [Riot.js 10.1.6](https://riot.js.org) |
| Компилятор тегов | `@riotjs/compiler` 10.0.5 через `rollup-plugin-riot` |
| Роутер | `@riotjs/route` 10 |
| Сборка и dev-сервер | [Vite](https://vite.dev) 8, HMR и прод-сборка |
| Язык | TypeScript там, где его понимает Riot (`lang="ts"` в компонентах и обычные `.ts` модули) |
| Стили | нативный CSS: вложенность, custom properties, `hsl(from …)` |

Riot 10 — текущая стабильная ветка в npm (последний 9.x — 9.4.11, его сменил 10.0.0 в августе 2025). Компоненты по-прежнему пишутся как `.riot` с `export default`. Отдельного Vite-плагина у Riot нет: официальный компилятор подключается как Rollup-плагин, а Vite этот плагин выполняет. Поэтому выбран Vite, а не `bun.build`: у Bun нет такого же dev-сервера с HMR для `.riot`, а Vite даёт и быструю перезагрузку, и `vite build`.

## Создать проект

Из этого репозитория:

```bash
bun ./bin/create-riot-app.ts my-app
cd my-app
```

Тот же шаблон через встроенный `bun create` (сам поставит зависимости):

```bash
bun create ./template my-app
cd my-app
```

После публикации пакета в npm эквивалент такой:

```bash
bun create riot-app my-app
# то же самое: bunx create-riot-app my-app
```

CLI ставит зависимости сам. Флаг `--no-install` оставляет только файлы, `--force` пишет в непустую папку.

## Запуск демо из этого репозитория

```bash
cd template
bun install
bun run dev
```

Dev-сервер: <http://localhost:5173>. Страницы: `/dashboard`, `/groups`, `/settings`. Dev-сервер и `vite preview` отдают `index.html` на эти адреса, поэтому обновление страницы оставляет тот же экран.

Проверка типов и прод-сборка:

```bash
bun run typecheck
bun run build
bun run preview
```

Сборка лежит в `template/dist`.

## Что внутри демо

- Верхняя панель и выезжающий drawer: кнопка, затемнение, анимация 0.3s, свайп от левого края на тач-экране.
- Звуки из `public/sounds`: `tick` на открытие меню, пункт меню и кнопку настроек; `hover` при наведении мышью; `card` при выборе карточки в списке. Если браузер не играет Ogg, берётся Mp3. Ошибка autoplay не попадает в консоль.
- Экраны: Dashboard, список с загрузкой первых десяти фото из jsonplaceholder (спиннер около секунды), Settings.
- На узком экране список прячет верхнюю панель при прокрутке — как в старом демо.
- Иконки, фавиконки и манифест лежат в `public/` и `src/icons`.

Логика приложения — TypeScript (`src/router.ts`, `src/sounds.ts`, `src/swipe.ts`, `src/api.ts`). Разметка экранов — компоненты `.riot` со скриптом `lang="ts"`. Стили экранов собраны в `src/styles` и подключаются один раз, без jQuery и Hammer.

## Скрипты шаблона

| Команда | Действие |
| --- | --- |
| `bun run dev` | Vite dev-сервер с HMR |
| `bun run build` | Прод-сборка в `dist/` |
| `bun run preview` | Локальный просмотр сборки |
| `bun run typecheck` | `tsc --noEmit` для `.ts` |

Переменные с префиксом `VITE_` читаются из `.env`. Адрес аватара в шапке drawer — `VITE_APP_AVATAR_URL`.

## Визуальный тест

`visual/test.ts` снимает восемь экранов (desktop 1280×800 и mobile 390×844: главная, открытый drawer, список, настройки) через Playwright и сравнивает их с эталонами старого демо в `visual/baselines` библиотекой pixelmatch. Анимации на снимках выключены. Отдельно проверяются анимация drawer (0.3s и промежуточные кадры), звук `tick` и отсутствие ошибок в консоли.

```bash
cd visual && bun install
bunx playwright install chromium
cd ..
bun run visual
```

Эталоны переснимаются со запущенного сервера так:

```bash
cd visual && bun test.ts --update --url http://127.0.0.1:9999
```
