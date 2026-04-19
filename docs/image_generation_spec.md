# Генерация иконок станков и изделий

> Дочерняя спека к [`factory_spec.md`](factory_spec.md).
> Отвечает за: thumbnail'ы 7 типов станков (токарный, ЧПУ-фрезерный, плазморез, сварочный, покраска, ОТК, упаковка) и 4 типа изделий (вал, рамный корпус, сборочный узел, кронштейн), размещаемые в `factory/static/img/`.

Оптимизация: сервер `automatic1111` уже поднят локально — это путь 1 из трёх рассмотренных ниже.

## Инфраструктура

Automatic1111 WebUI работает на сервере Михаила (3060, 12 ГБ):

- URL: `http://192.168.0.80:6290/`
- Пароль WebUI - в файле src/.env
- API endpoint: `http://192.168.0.80:6290/sdapi/v1/` (`txt2img`, `options`, `sd-models`)
- Разрешение для Claude Code: `Bash(curl *192.168.0.80:6290*)` (с пробелом после `curl`, чтобы `curl222` и подобное не матчилось)

API endpoint запускается из Докера AIGen http://192.168.0.80:6280 через 
```cd /project/SDWebUI
./webui.sh --api```

### Установленные модели

```
dreamshaper_7-inpainting.safetensors                   (4.3 ГБ, SD 1.5, inpainting)
flux1DevHyperNF4Flux1DevBNB_flux1DevHyperNF4.safetensors (12.3 ГБ, Flux NF4, тяжёлый)
gurilamashXXXSDXL_gurilamashv3.safetensors             (6.9 ГБ, SDXL, стилизованные иллюстрации)
reapony_v90.safetensors                                (6.9 ГБ, пони-стиль, не подходит)
sd-v1-5-inpainting.ckpt                                (4.3 ГБ, SD 1.5, inpainting)
v1-5-pruned-emaonly.safetensors                        (4.3 ГБ, базовая SD 1.5, среднее качество)
```

**Выбор**: `gurilamashXXXSDXL_gurilamashv3.safetensors` — SDXL-качество + стиль подходит для промышленных иллюстраций. Остальные либо inpainting (не нужно), либо пони, либо SD 1.5 (хуже детализация), либо Flux NF4 (12 ГБ, медленно грузится).

### Переключение модели через API

```bash
curl -X POST http://192.168.0.80:6290/sdapi/v1/options \
  -H "Content-Type: application/json" \
  -d '{"sd_model_checkpoint":"gurilamashXXXSDXL_gurilamashv3.safetensors"}'
```

Первое переключение занимает ~30–60 сек (модель загружается в VRAM). Проверка текущей:

```bash
curl -s http://192.168.0.80:6290/sdapi/v1/options | python3 -c "import sys,json; print(json.load(sys.stdin).get('sd_model_checkpoint'))"
```

## Стиль

Целевая эстетика — **Factorio** (на ноутбуке Михаила 650 ч наиграно, доменная узнаваемость жюри). Не «нейросетевой клипарт», а инженерно выверенный визуальный язык — **читабельно, последовательно, функционально**.

### 5 принципов Factorio

1. **Чёткая изометрия + физическая обоснованность.** ~45° 3/4-view, небольшая перспектива, объект «стоит на земле». У объектов есть масса и тень. Видно, как оно могло бы работать в реальности. Типовая ошибка SD — делать плоскую «1/2D icon»; пишем `3/4 view, slight perspective, grounded object, isometric, pre-rendered 3D`.
2. **Материалы, а не формы.** Показываем металл (царапины, износ), болты, швы, грязь, масло, покраску с потёртостями. Не «clean concept art», а `dirty industrial realism, weathered steel, oil stains, scuffed paint`.
3. **Ограниченная палитра.** База — серый / сталь / бетон (90% площади), акцент — один цвет на группу (оранжевый Райтек `#ff6b1a`). Не «красиво и разноцветно»: `muted grey, steel, concrete, 90% neutral, single orange accent`.
4. **Консистентность масштаба и света.** Одинаковый уровень детализации, одинаковый угол света у всех 8 спрайтов (верхний левый, тёплый). Нейросеть по умолчанию дрейфует — лечится **одним base_style-префиксом** на все генерации и одинаковыми параметрами.
5. **Функциональность > украшательство.** Каждый элемент мгновенно читается по назначению (горизонтальный шпиндель = токарный, вертикальный инструмент = фрезерный, дуга + искры = сварочный). Игрок думает о системе, не о графике.

### Оговорка

В самом Factorio тоже не всё идеально читаемо — три уровня сборщика визуально почти одинаковы (синий/жёлтый/зелёный одинаковой формы), splitter ≈ underground belt в миниатюре, chemical plant путается с oil refinery. **Цель не превзойти Factorio, а не быть хуже**: 7 наших типов станков должны различаться как минимум на уровне «токарный vs плазморез vs сварочный» — то есть по силуэту и характерному рабочему элементу, не по цвету акцента.

### Анти-паттерны (если картинка выглядит «ИИ-клипарт»)

- Плоская иконка без теней/перспективы → чинить принципом 1.
- «Чистый» концепт-арт без износа → чинить принципом 2 (`weathered`, `grime`).
- Много цветов / радужные акценты → чинить принципом 3 (убрать лишние цвета, оставить серый + оранжевый).
- Стиль 8 спрайтов разный (сцены разного настроения) → чинить принципом 4 (общий base_style, общий seed-диапазон, одинаковые steps/cfg).
- Декоративные детали мешают понять, что это за станок → чинить принципом 5 (упростить силуэт, оставить функциональный маркер).

### Промпты

Базовый стиль (подклеивается к каждому конкретному промпту):

```
isometric, pre-rendered 3D, Factorio-style industrial sprite, warm lighting from upper-left,
45-degree angle, orange safety stripes (#ff6b1a), metal wear, visible bolts and rivets,
muted grey workshop background, centered, 512x512
```

Negative prompt (общий для всех):

```
text, watermark, signature, blurry, low quality, photorealistic photo, pony, anime,
dark background, cluttered background, multiple objects
```

Конкретные промпты (склеиваются с базовым стилем):

| Файл | Что | Ключевые элементы |
|---|---|---|
| `lathe.png` | Токарный станок | rotating chuck, cutting tool, horizontal spindle, metal chips, coolant stream, 3/4 view, slight perspective, grounded object, muted grey 90%, orange accent, weathered steel, oil stains |
| `cnc_mill.png` | Фрезерный ЧПУ-центр | CNC control panel with glowing screen showing G-code, vertical spindle, end mill cutter above workpiece, coolant nozzle, protective enclosure, 3/4 view, slight perspective, grounded object, muted grey 90%, orange accent, weathered steel, oil stains |
| `plasma.png` | Плазморез | plasma cutting torch over steel sheet, bright plasma arc, cutting sparks, flat metal table, sheet metal offcuts, 3/4 view, slight perspective, grounded object, muted grey 90%, orange accent, weathered steel |
| `weld.png` | Сварочный пост | glowing weld bead, arc sparks, MIG welding torch, protective screen, welded metal frame on table, 3/4 view, slight perspective, grounded object, muted grey 90%, orange accent, weathered steel, soot marks |
| `paint.png` | Покрасочная камера | powder coating spray gun, metal part hanging on hook, paint mist, ventilation ducts, industrial paint booth interior, 3/4 view, slight perspective, grounded object, muted grey 90%, orange accent |
| `qc.png` | ОТК (контроль качества) | digital caliper measuring shaft, inspection table, magnifying glass, finished machined part, measurement markings, 3/4 view, slight perspective, grounded object, muted grey 90%, orange accent |
| `pack.png` | Упаковка | industrial cardboard box being sealed with tape dispenser, short conveyor section, wrapped metal part inside open box, 3/4 view, slight perspective, grounded object, muted grey 90%, orange accent |
| `shaft.png` | Вал | metallic cylindrical shaft with machined keyway groove, ground finish, lying horizontal, slight reflections, 3/4 view, slight perspective, muted grey 90%, orange accent highlight |
| `sheet_frame.png` | Рамный корпус | welded steel rectangular frame with mounting flanges and drilled holes, painted surface, 3/4 view, slight perspective, muted grey 90%, orange accent |
| `assembly_unit.png` | Сборочный узел | assembled mechanical unit with bolts, shaft, machined housing, painted body, technical part feel, 3/4 view, slight perspective, muted grey 90%, orange accent |
| `bracket.png` | Кронштейн | welded and painted steel bracket with bolt holes, L-shaped profile, clean painted surface, 3/4 view, slight perspective, muted grey 90%, orange accent |

### Параметры генерации

```json
{
  "width": 512, "height": 512,
  "steps": 25, "sampler_name": "Euler a", "cfg_scale": 7,
  "seed": -1
}
```

Seed случайный для разнообразия; если нужна стабильность — фиксируется после утверждения удачного варианта.

## Размещение

Сгенерированные PNG кладутся в `factory/static/img/` (см. «Организация папок» в `factory_spec.md`). FastAPI раздаёт их через `app.mount("/static", ...)` → в HTML: `<img src="/static/img/lathe.png">`.

## Подключение в UI

В `factory/static/index.html` иконки станков показываются в header-строке боковой панели или как фон группы Ганта (через `groupTemplate` vis-timeline). Иконки изделий — в тултипе операции. Детальный wireup — в отдельной подзадаче UI.

## Альтернативные пути (если SD сломался)

Запасные варианты, рассмотренные и отвергнутые в пользу пути 1:

| Путь | Плюсы | Минусы | Когда использовать |
|---|---|---|---|
| **1. Собственный SD на 3060 (выбран)** | Копирайт наш, единый стиль, офлайн. | Нужны промпты + 20–40 мин на всё. | Основной путь. |
| **2. CC0 коллекции** (Openverse, Wikimedia «Machine tools», The Noun Project) | Юридически чисто, быстро. | Зоопарк стилей, attribution для CC-BY. | Fallback, если SD упал. |
| **3. Онлайн-провайдеры** (OpenAI Images, Recraft, Midjourney) | Быстрее SD. | Сеть ненадёжна на стенде; ToS у бесплатных серые. | Не нужно. |

## Что **не** делаем

- **Не тянем из Яндекс/Google Картинок и Pinterest** — там «All Rights Reserved» по умолчанию, риск жалобы после демо.
- **Не используем логотипы Raytec / Ai2B / 1С** — торговые знаки. Упоминание только в контексте цитат (как в `real_plans.md`).
- **Не закладываем ControlNet / IP-Adapter** — лишние 2 часа на стабилизацию стиля; тёплая палитра + единый seed дают серию и без этого.

## Attribution

В футер `index.html` добавить строку (юридическая страховка на сцене перед жюри):

```html
<small>Иконки сгенерированы локальной Stable Diffusion (SDXL, gurilamash v3).</small>
```

Если пришлось подмешать CC0 из Openverse — добавить: `CC0 иконки из Openverse.`
