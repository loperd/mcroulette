# Итерация 03: Three.js и Rapier drop preview

## Код

Добавлен ThreeChestDropScene: прозрачный WebGL renderer, освещение/тень, responsive camera и загрузка исходного `treasure-game.glb` через GLTFLoader/DRACOLoader. Исходный GLB восстановлен из master, 214 780 байт. Required meshes и clips проверяются по именам; key скрыт во время падения.

Bounds корпуса и закрытой крышки берутся из BufferGeometry после применения исходных matrixWorld. Общая нормализация масштаба/центра одинаково преобразует визуальную иерархию и offsets двух box colliders. Физические объекты не наследуют Three.js Mesh.

RapierPhysicsWorld реализует технический PhysicsWorldPort с plain DTO. Один неподвижный пол и одно динамическое compound body, CCD, friction/restitution и sleeping. Reset удаляет прежнее тело с коллайдерами и создаёт новое; renderer, geometry и физический мир переиспользуются.

Подготовка assets/WASM параллельная, отменяемая. Generation guards предотвращают присоединение устаревших resources к новой сцене; поздний результат освобождается. Dispose прекращает RAF, снимает visibility/resize/context listeners, освобождает World, geometry/materials/textures и WebGL context. Draco workers освобождаются после загрузки или отмены.

Draco decoder копируется из установленного Three.js в `public/vendor/draco` через scripts/sync-draco.mjs: postinstall, predev и build. Это предотвращает привязку современного loader к старым decoder-файлам. Generated assets не коммитятся; license и attribution также копируются в vendor directory.

## UI и application

Production composition создаёт CatalogController и отдельный ChestPreviewController. Preview готовит сцену и запускает падение; «Ещё раз» делает reset/drop, runtime error предлагает Retry. Каталог остаётся независимым. Preview и полный игровой режим не могут одновременно владеть renderer.

React только монтирует внешний canvas host и подписывается на preview state. StrictMode ref cleanup отсоединяет host, а не уничтожает сцену. Opening и DOM roulette пока не реализованы; кнопка Open не заменяется фиктивной анимацией.

## Время и ресурсы

Один RAF и одна visibility subscription. FixedStepper: шаг 1/60 s, максимум пять substeps на кадр. В скрытой вкладке RAF останавливается; resume очищает clock/accumulator, поэтому нет прыжка на время отсутствия. Отменённый старый callback проверяет generation до изменения текущего RAF.

Reset держит число тел/коллайдеров постоянным в коде; подтверждение этого свойства настоящим Rapier остаётся отдельной интеграционной проверкой. Geometry/materials принадлежат scene assets, поэтому при каждом reset они не освобождаются и не перезагружаются.

## Выполненные проверки

70 базовых тестов проходят. Новые проверки: нормализация bounds, структура настоящего GLB, 30/60/120 Hz, ограничение catch-up, pause/resume, stale RAF, 100 start/stop и 100 preview replays, ошибка подготовки/runtime и cancellation/dispose.

12 React-тестов проходят на React 19.3.0 и Happy DOM 20.14.5 из локального кэша. Новая проверка монтирует внешний canvas host в StrictMode и вызывает Replay/Retry через настоящий preview controller с тестовым scene port.

Domain/application/pure adapters и React-компоненты проверены TypeScript 6.0.3 из кэша. Синтаксис Three.js/Rapier adapter и main проверен transpileModule; это не проверка API третьих библиотек.

## Заблокированные проверки

В workspace нет Three.js и Rapier. npm registry по-прежнему не разрешается DNS (`ENOTFOUND`). Поэтому `tsconfig.scene.json` не может проверить реальные library types, а `npm run test:physics` останавливается на `ERR_MODULE_NOT_FOUND` ещё до выполнения тестов. Эти проверки не считаются успешными.

Написаны три интеграционных теста настоящего Rapier: compound body падает на пол; 100 resets сохраняют два bodies/три colliders и сбрасывают скорость; отменённый init не создаёт мир. Тесты готовы к запуску после установки, но их результат ещё неизвестен.

Production build, GLB/Draco decoding в браузере, WebGL output, коллайдеры и параметры камеры/отскока не проверены. Нельзя утверждать визуальный паритет или отсутствие настоящих GPU/WASM-утечек. Начальные значения 1.7/3.3 и camera `(6,4,-6)` требуют калибровки на живой сцене.

## Следующий шаг

```sh
npm install
npm run typecheck
npm run test:all
npm run build
npm run dev
```

После разблокирования npm сначала устранить реальные type/runtime failures и проверить падение/reset в браузере. Затем подключить opening clips, движение сундука, DOM roulette и звук к уже реализованному игровому контроллеру. Preview станет отдельным режимом, а полный игровой режим получит самостоятельное владение сценой.
