# Итерация 06: Canvas 2D roulette

По запросу пользователя первым пробуется Canvas 2D для рулетки; Three.js/Rapier остаются для сундука. Если замеры покажут недостаточную производительность, следующий вариант — рулетка в общем Three.js renderer. Application/domain и RoulettePresentationPort не меняются.

## Отрисовка

CanvasRoulette заменяет DomRoulette в production composition. DOM adapter и его CSS-фильтры/слои удалены. Один видимый canvas рисует два прохода: размытый фон и резкую ленту внутри увеличенной круглой маски. Оба используют один positionAt(plan, elapsed), поэтому карточки под курсором синхронны. Сохранены stride 155, карточка 150×100, zoom 1.2, круг circle(15%) по нормализованной диагонали исходного CSS, жёлтый курсор, градиентные полосы редкости и время вращения/переходов. Подписи на самих карточках убраны: исходная рулетка показывала изображения; название результата остаётся в React.

Каждая уникальная комбинация id/image/rarity создаёт две отсоединённые canvas-карточки: обычную и предварительно размытую. Blur выполняется при подготовке карточки с padding, а не в каждом кадре. При отсутствии Canvas filter применяется разовое приближение размытия несколькими смещёнными изображениями. Реальный вид fallback требует отдельной проверки. В кадре выполняются drawImage видимого окна, clip, scale и курсор; количество draw calls зависит от ширины viewport, а не количества оборотов или всех slots. За кадром не создаются DOM-карточки, изображения или новые canvas.

Картинки загружаются до старта spin, до четырёх одновременно. Кэш переиспользуется при reset и отсекается по актуальной ленте; устаревшие карточки обнуляют backing stores. Dispose обнуляет все backing stores и снимает resize/visibility listeners. Изменение DPR/размера пересчитывает backing resolution, DPR ограничен двумя. Отмена загрузки завершается немедленно; поздний результат не добавляется в кэш и не перерисовывает новую операцию. Generation guard защищает новый spin от cleanup старого.

Методы Canvas: [drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage), [clip](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip). System reduced motion сохраняет итоговую позицию без вращения и ticks.

## Пробная страница

`npm run preview:canvas` запускает scripts/canvas-preview.mjs на 127.0.0.1:4174. Node 24.12+ удаляет TS-типы при выдаче модулей браузеру; установка npm-пакетов не нужна. Используются настоящие исходные картинки/JSON, CanvasRoulette и тот же spin plan. В полном Vite dev доступен /canvas-preview.html. Preview изолирован от React/Three.js/Rapier, поэтому позволяет оценить именно рулетку, без физики или WebGL-сцены.

Сервер выдаёт только клиентские .ts и ограниченные public routes; private paths и traversal отклоняются. Два теста проверяют весь граф импортов без npm packages, все 14 изображений, MIME, HEAD и отклонение недопустимых запросов. stripTypeScriptTypes экспериментален и может печатать ExperimentalWarning; сервер предназначен для локальной разработки.

В консоли preview доступно canvasPreview.stats(). Показатели drawSubmissionP95Ms/MaxMs измеряют выполнение RAF callback и отправку команд Canvas, а не GPU/compositor frame time. Эти числа сами по себе не подтверждают плавность. Нужны браузерный performance trace и сравнение на целевых устройствах; результат старого DOM adapter как benchmark здесь не представлен.

## Проверено

77 базовых и 23 React/Canvas-теста проходят. Canvas tests используют настоящий adapter/controller и управляемый recording context: проверяют геометрию попадания в нужную карточку, синхронность проходов, ширины 320/720/1800, частоты 30/60/120, resize, reduced motion, 100 повторов без роста canvas/image cache, отмену во время загрузки, поздний ответ, retry после image failure, освобождение устаревших карточек и отсутствие 2D context. StrictMode проходит два полных игровых цикла с двумя canvas hosts.

Recording context не растеризует пиксели: эти тесты не доказывают качество blur/маски, FPS или визуальный паритет. Browser adapters и preview прошли TypeScript 6.0.3 из локального кэша. Полная типизация Three.js/Rapier и production build остаются непроверенными.

Живой просмотр был предпринят, но окружение запретило bind localhost (`Operation not permitted`), а Arc MCP сообщил, что вызову требуется approval, недоступное при текущей политике. Использован [навык arc-drive](/Users/loper/.codex/skills/arc-drive/SKILL.md); вкладка не была открыта, браузерные замеры не получены. npm DNS остаётся прежним ограничением полного приложения. На стороне пользователя первый следующий шаг — npm run preview:canvas и просмотр/профилирование линзы в браузере.
