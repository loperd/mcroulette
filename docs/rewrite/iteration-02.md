# Итерация 02: данные, композиция и React

## Рабочий результат

Production entry point загружает настоящий `public/items.json`, приводит старые поля к domain Item и отображает 14 предметов с исходными иконками и цветами редкости. Фон, JSON и иконки восстановлены из `master`; Vue-код не переносился. Loader, ошибки и Retry реагируют на состояние CatalogController через useSyncExternalStore.

CatalogController — отдельный use case с входным портом ItemCatalog. Каталог может работать независимо от игрового сценария; приложению не требуется фиктивная физика, чтобы показать предметы.

## Data adapters

FixtureCatalogGateway объединяет параллельные запросы и кэширует immutable catalog. Каждый потребитель отменяется независимо; transport прерывается только при отмене последнего потребителя либо dispose всего gateway. Ошибки не кэшируются. Поздний результат отменённого запроса не перезаписывает новый кэш.

FixturePrizeGateway читает `selected_prize.json` на каждую команду select с `cache: no-store`. Конвертер принимает числовые/string ids и числовые/string chance, проверяет schema, rarity и уникальность. Некорректные JSON/HTTP status обрабатываются как ошибки, а не как пустой каталог.

Legacy image URL `/static/...` разрешается относительно Vite deployment base. Установка в `/demo/` запрашивает `/demo/items.json` и `/demo/static/...`; внешние HTTP(S) изображения сохраняют свои URL.

## Композиция и lifecycle

createApplication создаёт catalog controller и общий catalog gateway. При предоставлении presentation ports дополнительно создаёт RouletteController с реальным fixture prize gateway, browser RandomSource и session ids. По умолчанию presentation ещё нет, поэтому production показывает каталог без кнопки Open. SessionPanel уже умеет отображать ready/busy/failure/prize-visible и вызывать Open/Retry/Reset/Close через порт.

UI получает порты, а не конкретные контроллеры и fetch. Повторная инициализация через root восстанавливает и каталог, и game session одним нажатием Retry, если оба слоя были активны.

Инициализация принадлежит main и выполняется вне StrictMode effects. HMR освобождает root и приложение. Повторный initialize не удваивает transport. Терминальный dispose отменяет запросы и освобождает весь граф.

## Проверки

56 тестов ядра, application, adapters и composition: все проходят. Среди новых проверок — реальные старые JSON и все 14 файлов изображений, deployment base, общий кэш, независимая отмена, stale response, HTTP/JSON/schema errors, no-store prize и disposal.

11 React-тестов: все проходят. Семь проверяют рендер экранов, четыре монтируют настоящий React DOM в Happy DOM. Проверены переход loading → catalog, клик Retry после transport error, StrictMode, unmount/новое приложение, общее восстановление после ошибки и Open/Close с тестовыми presentation ports. Выбранный предмет скрыт до prize-visible; фокус возвращается к кнопке после закрытия.

Проверки типов domain/application/outbound/composition и React-компонентов выполнены TypeScript 6.0.3 из локального кэша. Для UI использованы реальные React/React DOM 19.3.0, их типы и Happy DOM 20.14.5, распакованные в `/tmp/mcroulette-ui-check`; зависимости рабочего проекта этим не подменялись.

Полная установка зафиксированных зависимостей и production build по-прежнему не выполнены: npm registry недоступен по DNS. Vite entry point проверен на синтаксис; проверка типов его Vite imports и реальный browser layout остаются частью следующего запуска после npm install. Happy DOM не проверяет WebGL, CSS layout и поведение физики.

## Команды

```sh
npm test
npm run typecheck:core
npm run test:ui
npm run test:all
```

Первая команда не требует установки пакетов. Остальные требуют devDependencies; test:ui компилирует компоненты в игнорируемый `.test-build`.

## Следующая итерация

Подключить настоящую сцену Three.js, исходный GLB/Draco и Rapier drop adapter с явным reset/dispose. После этого подключить opening clips и DOM roulette presentation к уже готовому контроллеру и UI; проверить браузерный цикл и production build. Модель и звук пока не возвращены в рабочее дерево.
