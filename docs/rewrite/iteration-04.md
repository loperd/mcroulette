# Итерация 04: подключение игрового цикла

## Поведение

Production composition переведена с отдельного drop preview на RouletteController с настоящими presentation adapters. Последовательность: подготовка → падение → Open → параллельные ответ demo PrizeGateway и открытие сундука → вращение → остановка 1.2 s → переход к награде 0.6 s → Close → reset 0.5 s → следующее падение.

Результат приходит из selected_prize.json на каждое новое открытие. Лента и план остановки создаются независимым domain code; DOM adapter не выбирает выигрыш. Повторный цикл сохраняет добавленный King в ленте. Сетевая ошибка повторяет тот же session id, а успешный ответ сохраняется для retry анимации.

## Three.js opening

ThreeChestDropScene теперь реализует полный ChestPresentationPort и прежний ChestDropPort для отдельного preview. AnimationMixer привязан к исходной GLTF scene внутри normalization group. Chest_topAction и Key.001Action.001 играются параллельно через LoopOnce с clampWhenFinished. Promise завершается только после finished для обеих actions и окончания движения группы; вычисленного таймера суммы длительностей нет. API использован согласно [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html) и [AnimationAction](https://threejs.org/docs/pages/AnimationAction.html).

При opening физика перестаёт изменять visual pose. Движение группы длится 25/60 s, выражено в нормализованных единицах (смещение вниз 0.7, увеличение масштаба до 1.25); это стартовые параметры для настройки в браузере, а не установленный визуальный паритет. Key виден только при opening. После завершения clips остаются на последнем кадре до hide/reset.

Reset останавливает mixer, восстанавливает локальные transforms всех исходных nodes, скрывает key, возвращает outer scale и spawn pose. Geometry и renderer переиспользуются. Abort/reset/dispose/context loss прекращают pending opening и удаляют finished/abort listeners. При освобождении mixer останавливается и uncacheRoot удаляет bindings до освобождения model.

Runtime errors сцены подписаны на RouletteController. Ошибка отменяет активную операцию, очищает ленту и предлагает повторную инициализацию renderer/world. Старое завершение opening не может выдать награду после runtime failure. Initialize очищает прежний session id и результат.

## DOM roulette и звук

DomRoulette владеет двумя синхронными track elements: размытый фон и увеличенная центральная маска с курсором. Stride 155 px содержит карточку 150 px, центрированную внутри своей ячейки. Поэтому logical landing из domain попадает внутрь карточки, а не в зазор. Обе transform берутся из одного positionAt(plan, elapsed).

Вместо огромного количества полных оборотов в DOM используется циклическое окно ceil(viewportWidth/155)+4 cells на каждый track. Индексы считаются с корректным modulo для отрицательных позиций. Рулетка работает даже с единственной карточкой. Resize меняет окно/offset, сохраняя logical position и результат. Названия вставляются через textContent, изображения через src.

FrameTimeline обеспечивает cancellation, окончание на точной конечной позиции и pause/resume без начисления скрытого времени. Длинный кадр ограничен 0.1 s. У каждого visual adapter своё расписание, но в штатной последовательности активен один RAF: drop/opening либо spin либо transition. Visibility subscriptions принадлежат адаптерам и снимаются на dispose; это не одна общая subscription на приложение.

Восстановлен исходный public/audio/click.wav. ClickSound использует максимум четыре HTMLAudioElement, volume 0.05. Open gesture разблокирует звук синхронно; autoplay rejection не мешает игре. При пересечении нескольких карточек за кадр вызывается один tick. Занятые voices не прерываются и не создаются новые. Reset останавливает звук; dispose освобождает источники.

## React

GameViewport монтирует два внешних host elements до завершения подготовки и сохраняет их между фазами. StrictMode ref cleanup отсоединяет hosts и не уничтожает принадлежащие composition root renderer/roulette. React не обновляет физическую позу или покадровый transform. SessionPanel отвечает за команды, сообщения состояния и отображение авторитетной награды; focus возвращается на Close/Open.

## Проверки

75 базовых тестов и 17 React/DOM-тестов проходят. Добавлены проверки timeline при 30/60/120 Hz, отмены/замены/dispose, hidden/resume, frame error, отказа autoplay и ограниченного audio pool, runtime scene error с retry initialization.

Настоящий DOM adapter проверен в Happy DOM: обе ленты останавливаются внутри выбранной карточки при ширине 320/720/1800 и 30/60/120 Hz. Проверены один-item strip, безопасный textContent, 100 spins с ограниченным количеством DOM cells, отмена и длительности hold/reveal/reset. React StrictMode проходит два полных цикла через настоящий контроллер, реальные DOM/transition adapters и реальные fixture gateways; только chest port заменён управляемой тестовой реализацией. Проверяются ожидание clips, отсутствие ранней награды, сохранение hosts/ленты и focus.

Domain/application/browser adapters и React проверены TypeScript 6.0.3 из локального кэша. React 19.3.0 и Happy DOM 20.14.5 также взяты из кэша в /tmp. Эти временные инструменты не являются установленным package.json stack и не создают lock-файл.

Three.js scene и main прошли только transpileModule syntax check. Настоящая типизация сторонних API, Draco decode, AnimationMixer на GLB, WebGL/GPU cleanup, Rapier WASM и production build ещё не проверены. В workspace нет зависимостей Three.js/Rapier; npm ping завершился ENOTFOUND. Успешный тест DOM не проверяет CSS rendering, реальное audio playback или GPU.

## Следующий шаг

После восстановления доступа к registry: npm install, сохранить package-lock.json, npm run typecheck, npm run test:all, npm run build. Затем живой браузер: поправить выявленные ошибки API/decoder, настроить камеру/отскок/движение/центральную маску по эталону, проверить звук и 100 циклов reset с GPU/WASM diagnostics. До этого полного восстановления проекта утверждать нельзя.
