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

Зависимости установлены, новый package-lock.json создан. Для воспроизводимой установки используется npm ci. Полная типизация и production build проходят. Проверены 114 тестов: 86 базовых, 25 UI/Canvas и 3 настоящего Rapier WASM. Визуальная проверка полного сценария в браузере остаётся отдельным шагом.

## Состояние

Для работы с моделями подготовлен [Python-мост Blender](docs/rewrite/blender-setup.md). После однократного запуска bridge.py в открытом Blender доступны npm run blender -- status/import/exec/save/export/render. Соединение ещё требует активации в Blender; сам мост при подключении сцену не меняет.

На стартовом экране показывается подвешенный сундук без симуляции физики. По нажатию превью уезжает вверх, затем начинается отдельное физическое падение. Все кнопки используют исходные btn styles; оба прохода рулетки имеют одинаковый масштаб и скорость. [Итерация 10](docs/rewrite/iteration-10.md).

Экран разделён на IntroScene, ChestScene, RouletteScene и PrizeScene. По нажатию контент разъезжается от середины экрана вверх/вниз, затем идут падение сундука, открытие, вспышка и Canvas 2D рулетка. Порядком управляет application controller; сцены не вызывают друг друга. Нижняя лента вырезана внутри линзы. Визуальный ориентир — собственный старый дизайн проекта, CS:GO только референс композиции/механики. Проходят 82 базовых, 25 UI/Canvas и 3 Rapier-теста. [Сцены и переходы](docs/rewrite/iteration-08.md), [исправление запуска и оформление](docs/rewrite/iteration-09.md).

`npm test` работает без установки пакетов: встроенный Node test runner исполняет TypeScript-ядро, data adapters, frame scheduler и composition с type stripping. `npm run test:ui` требует devDependencies, компилирует React-компоненты и проверяет их рендер/взаимодействия в Happy DOM. `npm run test:physics` проверяет настоящий Rapier WASM и требует установленный Rapier. `npm run test:all` выполняет все группы. Domain проверяется без DOM-библиотеки; Three.js/Rapier отдельно проверяются через `npm run typecheck:scene`.

Draco decoder синхронизируется с установленным Three.js при npm install, перед dev и при build. Файлы в `public/vendor/draco` генерируются, а не переносятся из старой версии decoder.

[Итерация 01 — ядро](docs/rewrite/iteration-01.md). [Итерация 02 — данные и UI](docs/rewrite/iteration-02.md). [Итерация 03 — сцена](docs/rewrite/iteration-03.md). [Итерация 04 — игровой цикл](docs/rewrite/iteration-04.md).

[Итерация 05 — отмена и уменьшенная анимация](docs/rewrite/iteration-05.md). [Итерация 06 — Canvas 2D](docs/rewrite/iteration-06.md).

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
