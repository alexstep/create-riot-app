# Riot.js app

Демо, которое создаёт `create-riot-app`: верхняя панель, выезжающее меню, звуки клика и три экрана. Среда — Bun, сборка — Vite, компоненты — Riot 10 и TypeScript.

```bash
bun install
bun run dev
```

Откройте <http://localhost:5173>. Страницы: `/dashboard`, `/groups`, `/settings`.

```bash
bun run typecheck
bun run build
bun run preview
```

Маршруты: `#/dashboard`, `#/groups`, `#/settings`. Меню открывается кнопкой слева; на телефоне его можно вытянуть свайпом от левого края. Звуки лежат в `public/sounds`. Аватар в меню задаётся в `.env` переменной `VITE_APP_AVATAR_URL`.
