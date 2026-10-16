# Управление Blender для MC Roulette

Подготовлен локальный Python-мост. Blender исполняет команды в главном потоке через bpy.app.timers; Node-клиент отправляет задания и читает результаты в .blender/. Сеть, MCP-сервер и новые npm/Python-пакеты не требуются. Окно Blender и текущая сцена сохраняются: подключение само ничего не удаляет и не импортирует.

## Один раз в открытом Blender

Открыть Python Console через Shift+F4 и выполнить:

```python
import runpy; mcroulette_bridge = runpy.run_path('/Users/loper/projects/mcroulette/scripts/blender/bridge.py', run_name='__main__')
```

Затем вернуться в 3D View через Shift+F5. После этого агент может работать через команды проекта:

```sh
npm run blender -- status
npm run blender -- import public/models/treasure-game.glb
npm run blender -- exec scripts/blender/my-model-script.py
npm run blender -- save assets/chests/workbench.blend
npm run blender -- export public/models/new-chest.glb
npm run blender -- render assets/chests/preview.png
```

exec запускает Python-файл проекта; bpy и ROOT доступны в scope, RESULT можно заполнить JSON-данными для ответа. import добавляет объекты к текущей сцене. export экспортирует сцену с анимациями. render использует существующую камеру и настройки рендера. save/export/render записывают указанный файл, поэтому рабочие варианты сохранять отдельно от оригиналов.

По умолчанию ожидание 15 s. Для долгого рендера BLENDER_TIMEOUT_MS=120000; сам рендер может блокировать UI Blender. Истёкшие задания, ещё не начавшие исполнение, не выполняются. Повторять выполняющуюся команду после timeout без проверки результата нельзя.

Чтобы отключить мост, в Blender Console:

```python
import sys; sys.modules['mcroulette_blender_bridge'].stop()
```

Повторный запуск bridge.py в том же процессе заменяет прежний timer. Мост живёт до закрытия Blender; при новом запуске приложения нужна одна строка подключения снова.

Один проект обслуживает один Blender-процесс: owner.json предотвращает одновременное управление разными сценами из двух окон/процессов. Файлы .blender/ исключены из git. Три Node-теста проверяют обмен запросом/ответом, propagation ошибок и удаление задания при timeout; Python syntax check проходит. Это проверки протокола, не реальное выполнение bpy.

## Текущее ограничение

Найден /Applications/Blender.app, версия 5.2.3 LTS Release Candidate. --version работает. Запуск нового Blender из среды агента с --background --factory-startup падает до Python в Metal GPU initialization (supports_barycentric_whitelist, exit 139). OpenGL эта сборка не поддерживает. Поэтому подключение нужно активировать в уже открытом пользовательском окне. Мост подготовлен, но реальное соединение нельзя объявлять рабочим до успешного status.

Механизм timer: [Blender Python API](https://docs.blender.org/api/3.6/bpy.app.timers.html). Реальные import/export/render необходимо проверить в установленной 5.2 после активации.
