# MC Roulette

Новая версия в ветке `rewrite-react-rapier`: React, TypeScript, Vite, Three.js и Rapier. Hexagonal architecture: независимое ядро, application ports и адаптеры интерфейса/данных/сцены. Без React Three Fiber, Redux и DI-framework.

## Запуск

Node 24.12+ (см. `.nvmrc`).

```sh
npm install
npm run dev
```

```sh
npm run typecheck
npm test
npm run test:ui
npm run test:physics
npm run build
npm run preview
```

Для воспроизводимой установки используется npm ci. Проверки: `npm run typecheck`, `npm run test:all`, `npm run build`.

## Состояние

Для работы с моделями подготовлен [Python-мост Blender](docs/rewrite/blender-setup.md). После однократного запуска bridge.py в открытом Blender доступны npm run blender -- status/import/exec/save/export/render. Соединение ещё требует активации в Blender; сам мост при подключении сцену не меняет.

Актуальные документы:

- [Модификации сундуков: контракт и эталоны](docs/rewrite/chest-modifications.md) — профиль модели, эффекты, просмотр `/mods-preview.html`.
- [Разрушение сундука](docs/rewrite/chest-breakage.md) — исход от сервера, физика обломков, просмотр `/breakage-preview.html`.
- [Навигация и восстановление](docs/rewrite/navigation-and-recovery.md), [поведение](docs/rewrite/behavior.md), [архитектура](docs/rewrite/architecture.md).
- [Продуктовое направление](docs/rewrite/product-direction.md) и [план](docs/rewrite/product-roadmap.md).

`npm test` работает без установки пакетов: встроенный Node test runner исполняет TypeScript-ядро, data adapters, frame scheduler и composition с type stripping. `npm run test:ui` требует devDependencies, компилирует React-компоненты и проверяет их рендер/взаимодействия в Happy DOM. `npm run test:physics` проверяет настоящий Rapier WASM и требует установленный Rapier. `npm run test:all` выполняет все группы. Domain проверяется без DOM-библиотеки; Three.js/Rapier отдельно проверяются через `npm run typecheck:scene`.

Draco decoder синхронизируется с установленным Three.js при npm install, перед dev и при build. Файлы в `public/vendor/draco` генерируются, а не переносятся из старой версии decoder.


Рулетку отдельно можно попробовать без npm install и без Three.js/Rapier:

```sh
npm run preview:canvas
```

Открыть http://127.0.0.1:4174/canvas-preview.html. В Vite доступен тот же /canvas-preview.html. Пробная страница использует настоящий CanvasRoulette и исходные картинки; звук и сундук доступны в полном приложении. Для замеров в консоли есть canvasPreview.stats(): время отправки команд отрисовки, без гарантии GPU/compositor FPS. Если Canvas 2D окажется медленным на целевых устройствах, следующий вариант — рулетка в общем Three.js canvas.

[Спецификация переписывания](docs/rewrite/README.md) описывает поведение, архитектуру и критерии приёмки.

## Архив

Старая версия сохранена в ветке `master`, исходный commit: `b4496b37a73af10751796492fa83e2af757e061d`. Legacy-код удалён из рабочей версии этой ветки; история сохранена. Нужные assets переносятся из `master` поэтапно. Отдельные каталоги `next/` и `legacy/` не используются.

Каталог, результат demo, иконки, фон, эталонный GLB и click.wav перенесены. Функциональность восстанавливается по спецификации, а не путём переноса Vue-компонентов.

Лицензия: GPL-3.0-or-later, см. LICENSE.

Текущие приоритеты и принятые решения: [WORKING_STATE](docs/rewrite/WORKING_STATE.md). Маршруты и восстановление: [navigation-and-recovery](docs/rewrite/navigation-and-recovery.md). Каталог пока черновой; запланированный главный экран — инвентарь экземпляров кейсов.
