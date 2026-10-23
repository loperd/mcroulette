"""Assemble the review package from verified artifacts; never mark GPU passed."""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'artifacts/relic-v4';ASSET=ROOT/'assets/chests/relic-v4'

def main():
    full=json.loads((OUT/'render-full.json').read_text());studies=json.loads((OUT/'render-studies.json').read_text());shots=full+studies
    for shot in shots:
        assert hashlib.sha256(Path(shot['asset']).read_bytes()).hexdigest()==shot['assetSha256'],shot['file']
        assert hashlib.sha256((OUT/shot['file']).read_bytes()).hexdigest()==shot['imageSha256'],shot['file']
    for a,b in [('full-v3-neutral','full-v4-neutral'),('full-v3-showcase','full-v4-showcase')]:
        x=next(s for s in full if s['file']==a+'.png');y=next(s for s in full if s['file']==b+'.png')
        for key in ['camera','rig','lightScale','size','spp','exposure','shaderSha256']:assert x[key]==y[key],key
    maps=Image.new('RGB',(1440,1356),(22,27,34));draw=ImageDraw.Draw(maps)
    for row,family in enumerate(['obsidian','metal','crystal']):
        draw.text((8,row*452+7),family.upper()+' / RAW CHANNELS / NO CONTRAST GAIN',fill=(220,230,232));maps.paste(Image.open(OUT/(family+'-channels.png')),(0,row*452+32))
    maps.save(OUT/'material-channels.png')
    selections=[('01-full-before-after.png','full-neutral-compare.png'),('02-full-beauty.png','full-v4-neutral.png'),('03-full-showcase.png','full-v4-showcase.png'),('04-crystal-emission.png','crystal-emission.png'),('05-material-channels.png','material-channels.png'),('06-obsidian-before-after.png','obsidian-grazing-compare.png'),('07-metal-before-after.png','metal-grazing-compare.png'),('08-full-lock-close.png','full-v4-lock-close.png'),('09-full-stone-close.png','full-v4-stone-close.png'),('10-full-metal-close.png','full-v4-metal-close.png')]
    selected=OUT/'review-10';selected.mkdir(exist_ok=True)
    for target,source in selections:shutil.copyfile(OUT/source,selected/target)
    # A navigable local contact sheet uses only actual rendered GLB evidence.
    cards='\n'.join(f'<figure><a href="{f}"><img src="{f}"></a><figcaption>{f}</figcaption></figure>'for f,_ in selections)
    (selected/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Relic V4 review</title><style>body{background:#181d24;color:#dde8e9;font:14px system-ui}main{display:grid;grid-template-columns:repeat(2,1fr)}img{width:100%}figure{margin:12px}a{color:#8bdccc}</style><p>V4 candidate — offline GLB renders. GPU review pending. No bloom or additional crystal lights.</p><main>'+cards+'</main>')
    geometry=json.loads((OUT/'validation/geometry-validation.json').read_text());pbr=json.loads((OUT/'validation/pbr-validation.json').read_text());old=ROOT/'assets/chests/relic-v3-pbr/relic.glb'
    assert geometry['assetSha256']==hashlib.sha256((ASSET/'relic.glb').read_bytes()).hexdigest()
    assert geometry['assetSha256']==pbr['assetSha256']
    report=f'''# Relic Chest V4 — material review candidate

**Статус: готов к художественному ревью; техническое завершение ограничено отсутствием GPU-проверки.** Геометрия V3 сохранена. Rune не изменялся. Активный production case не переключён.

## Root Causes

- Balanced-кристалл: слишком мала площадь яркой emissive-карты, после sRGB→linear её тёмные значения дополнительно умножались на `[0.07, 0.22, 0.15]`. При ярком внешнем свете отражённый Base Color маскировал вклад эмиссии. Полный V3 использовал другой, тоже слабый множитель `[0.12, 0.32, 0.24]`. Это не отсутствие emissive binding. Реальные линейные значения из GLB приведены в `{OUT}/emission-diagnostic.json`.
- Камень Balanced: контраст трещин был в значительной мере нарисован цветом; регулярные концентрические полосы и отдельная многоугольная область повреждения выглядели штампами. Слабая связь цвета, рельефа и roughness не объясняла происхождение повреждений.
- Металл: повторяющиеся пятна и недостаточная привязка износа к назначению детали. Слишком высокие частоты микрофактуры терялись при существующей плотности UV.
- Диагностический path tracer прежде допускал непрямое освещение от emissive-поверхностей. Для новых сравнений включён режим **surface-only emission**: кристалл не подсвечивает соседей. Режим по умолчанию старых инструментов сохранён.

## Material Decisions

| Материал | Изменение | Причина |
|---|---|---|
| Crystal | Base Color темнее и глубже; зональность роста и две нерегулярные внутренние жилы, intrinsic facet variation | Убрать плоскую яркую заливку, сохранить гранёный силуэт |
| Crystal | Emissive factor `[0.25,1,1]`; неоднородная карта с широким внутренним ядром и тёмными краями; Accent `[0.09,0.48,0.42]` | Реальное линейное свечение вместо яркого Base Color; акценты слабее главного кристалла |
| Crystal | Roughness около 0.18–0.28, metallic 0, opaque core glTF PBR | Грани реагируют на свет; никаких неподдерживаемых преломлений/каустик |
| Obsidian | Стекловидная основа, отдельные свежие раковистые изломы, шероховатый край и короткая сужающаяся микротрещина у существующего скола | Повреждения имеют конструктивное происхождение, не повторяются на каждой панели |
| Obsidian | Цветовой контраст трещин уменьшен; roughness ~0.19–0.75 согласована с полем повреждений; normal содержит асимметричные перекрывающиеся лопасти | Излом читается реакцией на свет, а не чёрной линией |
| Metal | Сохранён бирюзово-серый металл; локально открытые/полированные кромки, направленные царапины, ограниченные окисленные участки | Уголки, замок и защищённые полосы изнашиваются по-разному |
| Metal | Roughness ~0.29–0.53 (основной металл), metallic ~0.74–0.96; меньше metallic только в областях покрытия/окисления | Контраст гладкого металла и повреждённых участков при корректном PBR |

Значения roughness выше — выборки по реальной геометрии, не обещание всех экстремумов карты. Диапазоны полностью приведены в PBR-validation. Внутренний материал сохранён без изменений.

### Surface Wear Implementation

**Macro:** существующие геометрические сколы V3 сохранены; новой геометрии повреждений нет. **Meso:** свежий излом у реального верхнего скола FrontInsert1, несколько нерегулярных полей шероховатости/потёртости, локальный контактный износ замка. **Micro:** непрерывные в координатах детали зернистость и направленные риски, согласованные normal/roughness. Частоты ограничены существующими 128 texels/block; двухкратная выборка по каждой оси снижает алиасинг при записи карты. Цвет не содержит студийных теней или направленных бликов.

Поле оценивается в исходных координатах, а не отдельно для каждого UV-острова. Для разных деталей используется стабильная асимметрия. Повреждения не распределяются равномерным шумом по всем панелям. Незначительные составные изменения цвета разных граней кристалла не зависят от камеры или источников света.

## Before / After

- Полный V3 и V4: одинаковые ортографическая камера, scale 1.62, target `[0,.48,0]`, direction `[1.5,1.15,-1.9]`, свет, экспозиция 1, tone mapping, sampling и seed. До сравнения V3 заново отрендерен текущим диагностическим шейдером; старые изображения с другими настройками не использованы.
- Локальные материалы: **Balanced → V4**, на тех же реальных деталях, UV и камере. Это три варианта материалов в сумме, не очередная матрица десятков альтернатив.
- Изолированные тесты используют прежние 256 texels/block; production остаётся 128 texels/block. Поэтому дополнительно сняты крупные планы **из полного GLB**: stone / metal / lock. Качество тестового образца не выдаётся за качество production-атласа.
- Сравнения: `{OUT}/full-neutral-compare.png`, `{OUT}/full-showcase-compare.png`; для каждого материала `{{obsidian,metal,crystal}}-{{neutral,grazing}}-compare.png` в той же папке.

## Rendering & Lighting

CPU GGX renderer читает реальные треугольники, normal/ORM/emissive PNG, факторы и позу из экспортированного GLB. Это **не Blender и не WebGL**. Нейтральный свет и grazing/light-showcase используют отдельные фиксированные схемы; полная спецификация каждого кадра, хеш GLB/шейдера, экспозиция, spp и камера находятся в render-full.json и render-studies.json.

Нет bloom, прозрачности, светящихся proxy-мешей или дополнительных источников света около кристалла. Для ON/OFF внешнее освещение одинаково ослаблено до 4%, экспозиция остаётся 1. Стандартная glTF-эмиссия — свечение самой поверхности; она не освещает соседнюю геометрию в штатном raster renderer.

## Runtime Validation

| Проверка | Результат |
|---|---|
| GLB load через реальный GLTFLoader / production loadChestAssets | PASS; Node-тест с bitmap stub, без GPU |
| Body/LidAssembly, hierarchy, accessor data, geometry/index/UV buffers, animation | Побайтно совпадают с V3, кроме названия сцены |
| Закрытые габариты | min {geometry['bounds']['min']}, max {geometry['bounds']['max']}; внутри X/Z ±0.5, Y 0..1 |
| Крышка | Pivot `[0,.659375,.478125]`, 0–105°, sweep через 1°; {len(geometry['hingeSweep']['surfaceCrossings'])} обнаруженных пересечений |
| Конструкция | Две связанные сборки, без висящих элементов; existing construction check PASS |
| Нормали / UV / manifold | Existing geometry check PASS; physical UV density {pbr['uvTexelsPerBlockRange']} |
| Карты | Все 23 встроенные PNG совпадают с canonical source files; sRGB color/emissive, linear normal/ORM; ORM R=AO/G=roughness/B=metallic |
| Экспорт из editable BB | No-edit roundtrip byte-identical; ручные geometry/UV/roughness изменения сохраняются |
| Бюджет | {geometry['triangles']} triangles, {geometry['parts']} parts, 14 material primitives, 7 materials, 23 images; {geometry['bytes']:,} bytes против {old.stat().st_size:,} в V3 |
| Texture memory | Размеры и число текстур прежние: около 32 MiB RGBA8 с полными mipmaps; draw calls ассета не увеличены |
| Viewer | Targeted strict TypeScript и Vite build PASS |
| Реальный GPU / финальное приложение | **BLOCKED**: повтор 2026-10-22 остановлен на `listen EPERM 127.0.0.1:4186`; ранее Chromium завершался до открытия страницы. runtime/capture-failure.txt и runtime-probe.txt содержат исходные ошибки. Не выдано за PASS |

Для проверки в среде с работающим WebGL: `node scripts/chests/capture-relic-runtime.mjs --v4`. Viewer `/relic-review.html` использует production loader, режим Application lights, V3/V4, neutral/showcase/weak light и emissive toggle. Команда создаёт runtime-снимки и validation.json; сейчас этих файлов успешной GPU-проверки нет. Активная игровая модель остаётся прежней до ревью; полный новый GLB применяет V4 ко всему Relic.

### Runtime follow-up — 2026-10-22

Подготовлен автономный пакет `{OUT}/runtime-package`: Vite bundle, V3/V4 GLB, локальные декодеры и manifest.json с SHA-256 каждого файла. Запуск: перейти в эту папку и выполнить `python3 -m http.server 4186 --bind 127.0.0.1` вне ограниченной среды; открыть `/relic-review.html`. Сайт не зависит от npm, CDN или исходников проекта, но требует HTTP из-за браузерных правил modules/fetch. Это проверенная offline-сборка, **не выполненная GPU-проверка**.

Capture поддерживает `RELIC_REVIEW_URL`, сверяет SHA-256 фактически полученного браузером GLB с проверенным ассетом и записывает `passed:false` при сбое до завершения проверки. Поддержка переносимого пути добавлена только в dev-viewer; геометрия, карты и GLB не изменялись.

## Remaining Limitations

- Художественное принятие остаётся за визуальным ревью. Это кандидат, не утверждённый финал; без GPU-проверки технический Definition of Done полностью не закрыт.
- Варьирование цвета и эмиссии создаёт убедительную условную глубину непрозрачного минерала, а не физическую объёмную прозрачность/SSS/refraction.
- Сохранённая геометрия не получает новых силуэтных сколов. Раковистые микроповреждения в normal не являются displacement и заметнее в скользящем свете.
- Микроцарапины ограничены 128 texels/block в полном ассете. В 64 px они не обязаны читаться; там оцениваются силуэт, материал крупных масс и центральный акцент. Рельеф и освещение по-прежнему важнее количества карт.
- Износ намеренно сдержанный; на целом сундуке наиболее заметно изменился кристалл, а выразительность камня/металла зависит от угла света. Достаточность этого прироста требует художественного ревью.
- CPU рендер имеет остаточный Monte Carlo noise. Сравнения используют одинаковые настройки; этот шум не следует принимать за микрофактуру.
- Blockbench native MER-preview приблизительный: независимые RGB-emission и AO полностью сохраняются только controlled GLB-export. Запуск GUI Blockbench не проверен в этой среде.

## Rendering Evidence

Папка из десяти отдельных изображений: **{selected}**. Контактный лист: `{selected}/index.html`.

'''
    for file in sorted(OUT.glob('*.png')):
        if '-quick'in file.name:continue
        report+=f'- `{file}`\n'
    sizes_path=OUT/'optimization/package-sizes.json'
    if sizes_path.exists():
        sizes=json.loads(sizes_path.read_text());optimized=json.loads((ASSET.parent/'relic-v4-runtime/optimization.json').read_text())
        report+=f'''\n## Runtime Optimization\n\nОтдельный runtime GLB: `{ASSET.parent}/relic-v4-runtime/relic.glb`. Исходный authoring GLB и BB сохранены.\n\n| Показатель | До | После |\n|---|---:|---:|\n| V4 GLB, bytes | {optimized['bytesBefore']} | {optimized['bytesAfter']} |\n| Runtime ZIP, bytes | {sizes['zipBefore']} | {sizes['zipAfter']} |\n| Пакет без ZIP, bytes | {sizes['unpackedBefore']} | {sizes['unpackedAfter']} |\n| V4 RGBA8 + mipmaps | 32 MiB | 14 MiB |\n\nDraco 16-bit positions / 12-bit normals / 16-bit UV, порядок треугольников сохранён. WebP lossless после явно заданного downscale крупных атласов до 512 px; кристаллы остаются 256 px. Normal maps перенормализованы, цветовые карты уменьшены в линейном пространстве. Один WASM-декодер; убраны дублированные Vite-ресурсы и неиспользуемый JS-decoder.\n\nСжатые модели реально декодированы штатным Three DRACOLoader/WASM в Node workers, загружены через production loadChestAssets, проверены PBR-bindings и open/reverse-close. Это не WebGL-проверка. 106 поз крышки на независимо декодированной геометрии прошли existing geometry validator. Сравнение качества: `{OUT}/optimization/before-after.png`; подробности и файлы для ревью: `{OUT}/optimization/OPTIMIZATION.md`.\n'''
    report+='\n## Files Required for Review\n\n### Required\n\n| Exact path | Role | Priority | Назначение / зачем просмотреть |\n|---|---|---|---|\n'
    if (OUT/'lossless-study/transport.json').exists():
        delivery=next(r for r in json.loads((OUT/'lossless-study/transport.json').read_text())if r['version']=='relic-v4')
        report=report.replace('## Files Required for Review',f'''## Further Lossless Pass

Текущий GLB: {delivery['decodedBytes']} bytes; подготовленный HTTP Brotli: {delivery['br']} bytes, Gzip: {delivery['gzip']} bytes. Относительно прежнего runtime 496168 bytes пиксели, размеры текстур, Draco-данные, UV и анимация сохранены точно. Пакет включает `node serve.mjs` с согласованием кодирования и ETag/304. Это подготовленная отдача, а не подтверждённая публикация на Cloudflare. Доказательства: `{OUT}/lossless-study/LOSSLESS.md`.

## Files Required for Review''')
    required=[('assets/chests/relic-v4/relic.glb','asset','P0','Полный интегрированный candidate; проверить реальные материалы и открытие'),('assets/chests/relic-v4/relic.bbmodel','asset','P1','Editable geometry/UV; убедиться, что сохранена принятая конструкция'),('assets/chests/relic-v4/materials.json','contract','P0','Канонические glTF-факторы и bindings, особенно emissive'),('assets/chests/relic-v4/contract.json','contract','P0','Масштаб, pivot, ограничения и статус'),('assets/chests/relic-v4/texture-manifest.json','contract','P1','Неизменённые размеры/плотность/паддинг атласов'),('scripts/chests/build-relic-v4.py','generator','P0','Все новые поля материала, распределение износа, неизменность UV'),('scripts/chests/build-relic.py','generator','P0','Неизменённый production-compatible экспорт core glTF PBR и BB roundtrip'),('scripts/chests/build-relic-pbr.py','generator','P1','Переиспользуемая функция BB MER-preview; не вызывается перестройка geometry V3'),('scripts/chests/review-relic-v4.py','generator','P0','Материальные участки, строго одинаковые условия сравнения и ablations'),('scripts/chests/review-relic.py','generator','P1','Декодер фактического GLB, цветовые пространства карт'),('scripts/chests/review-tracer.cpp','generator','P0','GGX, tangent-space normal, surface-only emission и lightScale'),('scripts/chests/validate-relic-v4.py','test','P1','Проверка реальных PNG/UV/PBR-каналов и нормалей'),('tests/adapters/relic-v4.test.mjs','test','P0','GLTFLoader, production loader, animation, идентичность geometry buffers'),('scripts/chests/validate-relic.py','test','P1','Existing envelope, manifold, normals и hinge sweep'),('scripts/chests/check-relic-construction.py','test','P1','Existing support graph и опоры'),('scripts/chests/test-authoring.py','test','P1','Existing no-edit и ручной BB re-export'),('src/dev/relic-review.ts','production code','P0','Dev-only runtime review через production loader и emissive toggle'),('relic-review.html','docs','P1','Визуальное управление runtime-ревью'),('scripts/chests/capture-relic-runtime.mjs','test','P0','Воспроизводимая GPU-проверка --v4, ещё не пройдена'),('src/adapters/outbound/chest/chest-assets.ts','production code','P0','Production loader: явные URL Draco WASM, нормализация и сохранение материалов'),('scripts/chests/report-relic-v4.py','docs','P2','Пакет ревью и проверка provenance снимков')]
    for png in sorted(ASSET.glob('*.png')):
        if '-bb-mer'in png.name:continue
        required.append((str(png.relative_to(ROOT)),'asset','P1','Каноническая PBR-карта, реально встроенная в финальный GLB'))
    if sizes_path.exists():
        for path,role,why in [('scripts/chests/optimize-relic-runtime.py','generator','Draco, WebP, downscale, контроль ошибок и сохранение источников'),('scripts/chests/test-relic-optimized.mjs','test','Реальное декодирование штатным Three WASM в Node workers'),('assets/chests/relic-v4-runtime/relic.glb','asset','Сжатая runtime-модель'),('assets/chests/relic-v4-runtime/contract.json','contract','Контракт производного сжатого ассета'),('assets/chests/relic-v4-runtime/optimization.json','contract','Квантизация, размеры текстур, бюджет и хеши'),('artifacts/relic-v4/optimization/OPTIMIZATION.md','docs','Отчёт оптимизации'),('artifacts/relic-v4/optimization/before-after.png','asset','Одинаковое освещение до/после сжатия'),('artifacts/relic-v4/runtime-package.zip','asset','Пересобранный компактный runtime-пакет')]:
            required.append((path,role,'P1',why))
    if (OUT/'lossless-study/LOSSLESS.md').exists():
        for path,role,why in [('scripts/chests/repack-relic-lossless.py','generator','Сохранение всех пикселей и не-графических буферов'),('scripts/chests/http-assets.mjs','production code','Brotli/Gzip, правильные HTTP-заголовки и ETag'),('scripts/chests/test-http-assets.mjs','test','Проверки HTTP-отдачи без сокетов'),('scripts/chests/precompress-relic.mjs','generator','Предварительное сжатие для origin/CDN'),('artifacts/relic-v4/lossless-study/LOSSLESS.md','docs','Отчёт строго lossless-этапа')]:required.append((path,role,'P1',why))
    for path,role,why in [('scripts/chests/package-relic-runtime.mjs','generator','Автономная offline-сборка runtime, без запуска сервера'),('artifacts/relic-v4/runtime-package/manifest.json','contract','Хеши файлов переносимой runtime-сборки'),('artifacts/relic-v4/runtime-package/README.txt','docs','Запуск и ограничения переносимого viewer'),('artifacts/relic-v4/runtime/capture-failure.txt','docs','Фактический EPERM повторной runtime-проверки')]:
        required.append((path,role,'P1',why))
    for file in sorted((OUT/'validation').glob('*')):required.append((str(file.relative_to(ROOT)),'test','P1','Фактические результаты проверок'))
    for file in ['render-full.json','render-studies.json','runtime-probe.txt','emission-diagnostic.json','channel-ablation.json','REPORT.md']:required.append((str((OUT/file).relative_to(ROOT)),'docs','P0'if file=='runtime-probe.txt'else'P1','Provenance / ограничения / результаты ревью'))
    for file in ['full-v4-clay.png','full-v4-front.png','full-v4-top.png','full-v4-open.png','preview-128.png','preview-64.png','obsidian-channels.png','metal-channels.png','crystal-channels.png','obsidian-normal-off.png','obsidian-roughness-off.png','obsidian-after-grazing.png','metal-metallic-off.png','metal-after-grazing.png','crystal-neutral-emissive-off.png','crystal-after-neutral.png','crystal-lowlight-on.png','crystal-lowlight-off.png']:
        required.append((str((OUT/file).relative_to(ROOT)),'asset','P1','Обязательный ракурс / каналы / контрольный ON-OFF кадр'))
    for target,_ in selections:required.append((str((selected/target).relative_to(ROOT)),'asset','P0','Отдельное изображение для визуального принятия'))
    for path,role,priority,why in required:report+=f'| [{ROOT/path}]({ROOT/path}) | {role} | {priority} | {why} |\n'
    report+='\n### Reference\n\n| Exact path | Role | Priority | Назначение / зачем просмотреть |\n|---|---|---|---|\n'
    refs=[('assets/chests/relic-v3-pbr/relic.glb','asset','P1','Неизменённый Before полного сундука'),('assets/chests/relic-v3-pbr/relic.bbmodel','asset','P1','Неизменённый источник геометрии и UV'),('assets/chests/relic-v3-pbr/materials.json','contract','P1','Скалярные параметры/карты Before'),('src/adapters/outbound/chest/three-chest-drop-scene.ts','production code','P1','Освещение приложения; не изменялось этой задачей'),('src/adapters/outbound/chest/chest-preview-renderer.ts','production code','P2','Отличия интерфейсного preview lighting'),('src/adapters/outbound/chest/chest-bounds.ts','production code','P1','Нормализация в приложении: authored block scale против CHEST_WIDTH'),('src/config/cases.ts','contract','P1','Активная модель/production-профиль не переключены'),('scripts/chests/relic-lookdev.py','generator','P2','Ранее отвергнутые Balanced fields для Before-исследований')]
    for family in ['obsidian','metal','crystal']:
        refs.append((f'assets/chests/relic-material-lookdev/{family}/balanced/relic.glb','asset','P1','Реальный Balanced Before на неизменённой геометрии'))
        refs.append((f'assets/chests/relic-v4/studies/{family}/relic.glb','asset','P1','Изолированная V4-проверка; не подменяет полный GLB'))
    for path,role,priority,why in refs:report+=f'| [{ROOT/path}]({ROOT/path}) | {role} | {priority} | {why} |\n'
    (OUT/'REPORT.md').write_text(report)
    (ASSET/'README.md').write_text(f'# Relic V4 material candidate\n\nFull editable BB + core GLB PBR. Geometry and UVs retained from V3.\n\nReport: `{OUT}/REPORT.md`. Review: `{selected}`.\n\nControlled export: `python3.13 scripts/chests/build-relic.py --from-bbmodel assets/chests/relic-v4/relic.bbmodel --output-dir assets/chests/relic-v4`\n\nGPU/art approval pending; do not treat offline evidence as runtime approval.\n')
    print(OUT/'REPORT.md')

if __name__=='__main__':main()
