#!/usr/bin/env python3
"""Generate furnitureData.ts from unpacked Stardew Data/Furniture strings."""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "public/assets/tiles/furniture.png"
WIKI = ROOT / "scripts/stardew-furniture.lua"
OUT = ROOT / "src/world/furnitureData.ts"

COLS = 32
TILE = 16
SHEET_W = 980
SHEET_H = 1488

LEGACY = {
    0: "chair",
    288: "armchair",
    416: "sofa",
    814: "table",
    1280: "cabinet",
    1283: "bookshelf-light",
    1285: "bookshelf",
    2742: "rug",
}

SKIP_SUBSTR = (
    "floor divider",
    "ceiling ",
    "light string",
    "monster danglers",
    "clouds banner",
)

DEFAULT_SPRITE = {
    "chair": (1, 2),
    "bench": (2, 2),
    "couch": (3, 2),
    "armchair": (2, 2),
    "dresser": (2, 2),
    "long table": (5, 2),
    "painting": (2, 2),
    "lamp": (1, 2),
    "decor": (1, 1),
    "bookcase": (2, 3),
    "table": (2, 2),
    "rug": (3, 2),
    "window": (1, 2),
    "fireplace": (2, 5),
    "bed": (2, 4),
    "bed double": (3, 4),
    "bed child": (2, 4),
    "fishtank": (2, 3),
    "torch": (1, 2),
    "sconce": (1, 2),
    "other": (1, 2),
}

DEFAULT_BBOX = {
    "chair": (1, 1),
    "bench": (2, 1),
    "couch": (3, 1),
    "armchair": (2, 1),
    "dresser": (2, 1),
    "long table": (5, 1),
    "painting": (2, 1),
    "lamp": (1, 1),
    "decor": (1, 1),
    "bookcase": (2, 1),
    "table": (2, 1),
    "rug": (3, 2),
    "window": (1, 1),
    "fireplace": (2, 1),
    "bed": (2, 3),
    "bed double": (3, 3),
    "bed child": (2, 3),
    "fishtank": (2, 1),
    "torch": (1, 1),
    "sconce": (1, 1),
    "other": (1, 1),
}

WALL_TYPES = {"painting", "window", "sconce"}
FLOOR_TYPES = {"rug"}
SIT_TYPES = {"chair", "armchair", "couch", "bench"}
SLEEP_TYPES = {"bed", "bed double", "bed child"}
# Official source rects stop at the tabletop; apron + legs sit in the next tile.
FRONT_DROP_TYPES = {"long table", "table"}

GROUP_FOR = {
    "chair": "seat",
    "armchair": "seat",
    "couch": "seat",
    "bench": "seat",
    "table": "table",
    "long table": "table",
    "dresser": "storage",
    "bookcase": "storage",
    "other": "storage",
    "rug": "rug",
    "painting": "wall",
    "window": "wall",
    "sconce": "wall",
    "lamp": "light",
    "torch": "light",
    "fireplace": "light",
    "bed": "bed",
    "bed double": "bed",
    "bed child": "bed",
    "fishtank": "decor",
    "decor": "decor",
}

NAME_PT = {
    "Oak Chair": "Cadeira de carvalho",
    "Walnut Chair": "Cadeira de nogueira",
    "Birch Chair": "Cadeira de bétula",
    "Mahogany Chair": "Cadeira de mogno",
    "Red Diner Chair": "Cadeira de lanchonete vermelha",
    "Blue Diner Chair": "Cadeira de lanchonete azul",
    "Country Chair": "Cadeira rústica",
    "Breakfast Chair": "Cadeira de café",
    "Pink Office Chair": "Cadeira de escritório rosa",
    "Purple Office Chair": "Cadeira de escritório roxa",
    "Green Office Stool": "Banqueta verde",
    "Orange Office Stool": "Banqueta laranja",
    "Dark Throne": "Trono escuro",
    "Dining Chair": "Cadeira de jantar",
    "Green Plush Seat": "Poltrona de pelúcia verde",
    "Pink Plush Seat": "Poltrona de pelúcia rosa",
    "Winter Chair": "Cadeira de inverno",
    "Groovy Chair": "Cadeira groovy",
    "Cute Chair": "Cadeira fofa",
    "Stump Seat": "Assento de toco",
    "Metal Chair": "Cadeira de metal",
    "Green Stool": "Banqueta verde-clara",
    "Blue Stool": "Banqueta azul",
    "King Chair": "Cadeira real",
    "Crystal Chair": "Cadeira de cristal",
    "Tropical Chair": "Cadeira tropical",
    "Oak Bench": "Banco de carvalho",
    "Walnut Bench": "Banco de nogueira",
    "Birch Bench": "Banco de bétula",
    "Mahogany Bench": "Banco de mogno",
    "Modern Bench": "Banco moderno",
    "Blue Armchair": "Poltrona azul",
    "Red Armchair": "Poltrona vermelha",
    "Green Armchair": "Poltrona verde",
    "Yellow Armchair": "Poltrona amarela",
    "Brown Armchair": "Poltrona marrom",
    "Blue Couch": "Sofá azul",
    "Red Couch": "Sofá vermelho",
    "Green Couch": "Sofá verde",
    "Yellow Couch": "Sofá amarelo",
    "Brown Couch": "Sofá marrom",
    "Dark Couch": "Sofá escuro",
    "Wizard Couch": "Sofá de mago",
    "Woodsy Couch": "Sofá rústico",
    "Large Brown Couch": "Sofá marrom grande",
    "Oak Dresser": "Cômoda de carvalho",
    "Walnut Dresser": "Cômoda de nogueira",
    "Birch Dresser": "Cômoda de bétula",
    "Mahogany Dresser": "Cômoda de mogno",
    "Coffee Table": "Mesa de centro",
    "Stone Slab": "Laje de pedra",
    "Winter Dining Table": "Mesa de inverno",
    "Festive Dining Table": "Mesa festiva",
    "Mahogany Dining Table": "Mesa de jantar mogno",
    "Modern Dining Table": "Mesa de jantar moderna",
    "Oak Table": "Mesa de carvalho",
    "Walnut Table": "Mesa de nogueira",
    "Birch Table": "Mesa de bétula",
    "Mahogany Table": "Mesa de mogno",
    "Sun Table": "Mesa sol",
    "Moon Table": "Mesa lua",
    "Modern Table": "Mesa moderna",
    "Pub Table": "Mesa de bar",
    "Luxury Table": "Mesa luxo",
    "Diviner Table": "Mesa de oráculo",
    "Neolithic Table": "Mesa neolítica",
    "Puzzle Table": "Mesa quebra-cabeça",
    "Winter Table": "Mesa de inverno pequena",
    "Candy Table": "Mesa doce",
    "Luau Table": "Mesa luau",
    "Dark Table": "Mesa escura",
    "Oak Tea-Table": "Mesa de chá carvalho",
    "Walnut Tea-Table": "Mesa de chá nogueira",
    "Birch Tea-Table": "Mesa de chá bétula",
    "Mahogany Tea-Table": "Mesa de chá mogno",
    "Modern Tea-Table": "Mesa de chá moderna",
    "Furniture Catalogue": "Catálogo de móveis",
    "China Cabinet": "Cristaleira",
    "Artist Bookcase": "Estante clara",
    "Luxury Bookcase": "Estante de luxo",
    "Modern Bookcase": "Estante moderna",
    "Dark Bookcase": "Estante escura",
    "Indoor Palm": "Palmeira interna",
    "Manicured Pine": "Pinheiro aparado",
    "Topiary Tree": "Topiaria",
    "House Plant": "Planta",
    "Small Plant": "Planta pequena",
    "Table Plant": "Planta de mesa",
    "Oak End Table": "Mesa lateral carvalho",
    "Walnut End Table": "Mesa lateral nogueira",
    "Birch End Table": "Mesa lateral bétula",
    "Mahogany End Table": "Mesa lateral mogno",
    "Modern End Table": "Mesa lateral moderna",
    "Grandmother End Table": "Mesa da vovó",
    "Winter End Table": "Mesa lateral de inverno",
    "Country Lamp": "Abajur rústico",
    "Box Lamp": "Abajur caixa",
    "Modern Lamp": "Abajur moderno",
    "Classic Lamp": "Abajur clássico",
    "Candle Lamp": "Abajur de vela",
    "Ornate Lamp": "Abajur ornamentado",
    "Red Rug": "Tapete vermelho",
    "Patchwork Rug": "Tapete patchwork",
    "Dark Rug": "Tapete escuro",
    "Budget TV": "TV antiga",
    "Plasma TV": "TV plasma",
    "Floor TV": "TV de chão",
    "Tropical TV": "TV tropical",
    "Basic Window": "Janela básica",
    "Small Window": "Janela pequena",
    "Brick Fireplace": "Lareira de tijolo",
    "Stone Fireplace": "Lareira de pedra",
    "Stove Fireplace": "Lareira fogão",
    "Elegant Fireplace": "Lareira elegante",
    "Bed": "Cama",
    "Double Bed": "Cama de casal",
    "Child Bed": "Cama infantil",
    "Bonsai Tree": "Bonsai",
    "Calendar": "Calendário",
    "World Map": "Mapa-múndi",
    "Globe": "Globo",
    "Decorative Bowl": "Tigela decorativa",
    "Decorative Lantern": "Lanterna",
    "Industrial Pipe": "Cano industrial",
    "Ceramic Pillar": "Coluna de cerâmica",
    "Gold Pillar": "Coluna dourada",
    "CoatStand": "Mancebo",
}

PLANT_WORDS = ("plant", "palm", "pine", "tree", "topiary", "bonsai", "cactus", "flower", "sunflower")


def slug(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:48]


def parse_size(raw: str, fallback: tuple[int, int]) -> tuple[int, int]:
    if raw == "-1":
        return fallback
    parts = raw.split()
    if len(parts) != 2:
        return fallback
    return int(parts[0]), int(parts[1])


def index_xy(index: int) -> tuple[int, int]:
    return (index % COLS) * TILE, (index // COLS) * TILE


def opaque_count(px, x: int, y: int, w: int, h: int, sheet_w: int, sheet_h: int) -> int:
    total = 0
    for yy in range(y, min(sheet_h, y + h)):
        for xx in range(x, min(sheet_w, x + w)):
            if px[xx, yy][3] > 24:
                total += 1
    return total


def rects_overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return a[0] < b[0] + b[2] and a[0] + a[2] > b[0] and a[1] < b[1] + b[3] and a[1] + a[3] > b[1]


def front_drop(
    px,
    fx: int,
    fy: int,
    fw: int,
    fh: int,
    occupied: list[tuple[int, int, int, int]],
) -> int:
    extra = 0
    for _ in range(TILE):
        row = (fx, fy + fh + extra, fw, 1)
        if row[1] >= SHEET_H:
            break
        if opaque_count(px, row[0], row[1], row[2], row[3], SHEET_W, SHEET_H) < 3:
            break
        if any(rects_overlap(row, other) for other in occupied):
            break
        extra += 1
    return extra


def group_for(typ: str, name: str) -> str:
    lower = name.lower()
    if any(word in lower for word in PLANT_WORDS):
        return "plant"
    if "tv" in lower:
        return "decor"
    return GROUP_FOR.get(typ, "decor")


def label_for(name: str, used: dict[str, int]) -> str:
    base = NAME_PT.get(name, name.strip("'\""))
    if name.startswith("House Plant"):
        used["house-plant"] = used.get("house-plant", 0) + 1
        return f"Planta {used['house-plant']}"
    if name == "Dining Chair":
        used["dining-chair"] = used.get("dining-chair", 0) + 1
        if used["dining-chair"] > 1:
            return f"{base} {used['dining-chair']}"
    return base


def frames_for(typ: str, tw: int, th: int, rotations: int) -> list[dict]:
    """Return crop offsets in tiles from the item origin."""
    down = {"slot": "down", "dx": 0, "dy": 0, "tw": tw, "th": th}
    if rotations <= 1:
        return [down]
    if typ == "chair" and tw == 1 and rotations == 4:
        return [
            down,
            {"slot": "right", "dx": 1, "dy": 0, "tw": 1, "th": th},
            {"slot": "up", "dx": 2, "dy": 0, "tw": 1, "th": th},
        ]
    if typ == "armchair" and rotations == 4:
        return [
            down,
            {"slot": "right", "dx": tw, "dy": 0, "tw": tw, "th": th},
            {"slot": "up", "dx": tw * 2, "dy": 0, "tw": tw, "th": th},
        ]
    if typ == "couch" and rotations == 4:
        side = 2
        return [
            down,
            {"slot": "right", "dx": tw, "dy": 0, "tw": side, "th": th},
            {"slot": "up", "dx": tw + side, "dy": 0, "tw": tw, "th": th},
        ]
    if typ in {"bench", "dresser"} and rotations == 4:
        return [
            down,
            {"slot": "right", "dx": tw, "dy": 0, "tw": 1, "th": th},
            {"slot": "up", "dx": tw + 1, "dy": 0, "tw": tw, "th": th},
        ]
    if typ == "long table" and rotations == 2:
        return [
            down,
            {"slot": "right", "dx": tw, "dy": 0, "tw": 2, "th": th},
        ]
    if rotations == 2:
        side_w = 1 if tw <= 1 else max(1, tw - 1)
        if typ == "rug" and tw >= 3:
            side_w = max(1, tw - 1)
        return [
            down,
            {"slot": "right", "dx": tw, "dy": 0, "tw": side_w, "th": th},
        ]
    if rotations == 4:
        return [
            down,
            {"slot": "right", "dx": tw, "dy": 0, "tw": tw, "th": th},
            {"slot": "up", "dx": tw * 2, "dy": 0, "tw": tw, "th": th},
        ]
    return [down]


def side_footprint(typ: str, bw: int, bh: int, side_tw: int) -> tuple[int, int] | None:
    if typ == "couch":
        return side_tw, bh
    if typ in {"bench", "dresser"}:
        return 1, bh
    if typ == "long table":
        return side_tw, 1
    if typ == "rug":
        return bh, bw
    if typ in {"table"} and side_tw != bw:
        return side_tw, bh
    return None


def parse_entries(text: str) -> list[dict]:
    entries = []
    for match in re.finditer(r"\['(\d+)'\]\s*=\s*\"([^\"]+)\"", text):
        index = int(match.group(1))
        fields = match.group(2).split("/")
        name = fields[0]
        typ = fields[1]
        sheet = fields[2]
        box = fields[3]
        rotations = int(fields[4])
        placement = fields[6] if len(fields) > 6 else "-1"
        texture = fields[9] if len(fields) > 9 else ""
        if texture and "furniture" not in texture.lower() and texture not in {"", "true"}:
            continue
        extra = texture.lower()
        if any(tag in extra for tag in ("furniture_2", "furniture_3", "joja_", "wizard_", "junimo_", "retro_", "freecactuses")):
            continue
        if placement == "1":
            continue
        if any(s in name.lower() for s in SKIP_SUBSTR):
            continue
        if typ == "randomized_plant":
            continue
        entries.append(
            {
                "index": index,
                "name": name,
                "type": typ,
                "sheet": sheet,
                "box": box,
                "rotations": rotations,
            }
        )
    return entries


def ts_str(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def main() -> None:
    text = WIKI.read_text()
    image = Image.open(SHEET).convert("RGBA")
    px = image.load()
    used_labels: dict[str, int] = {}
    used_ids: set[str] = set()
    items: list[dict] = []
    parsed = parse_entries(text)

    occupied: list[tuple[int, int, int, int]] = []
    for entry in parsed:
        typ = entry["type"]
        tw, th = parse_size(entry["sheet"], DEFAULT_SPRITE.get(typ, (1, 2)))
        ox, oy = index_xy(entry["index"])
        if ox + tw * TILE > SHEET_W or oy + th * TILE > SHEET_H:
            continue
        for frame in frames_for(typ, tw, th, entry["rotations"]):
            fx = ox + frame["dx"] * TILE
            fy = oy + frame["dy"] * TILE
            fw = frame["tw"] * TILE
            fh = frame["th"] * TILE
            if fx + fw > SHEET_W or fy + fh > SHEET_H:
                continue
            occupied.append((fx, fy, fw, fh))

    for entry in parsed:
        typ = entry["type"]
        sprite_fb = DEFAULT_SPRITE.get(typ, (1, 2))
        box_fb = DEFAULT_BBOX.get(typ, (1, 1))
        tw, th = parse_size(entry["sheet"], sprite_fb)
        bw, bh = parse_size(entry["box"], box_fb)
        # 2.5D: collision is the south row; tabletop hangs north, drop/legs hang south.
        if typ in {"table", "long table"}:
            bh = min(bh, DEFAULT_BBOX[typ][1])
        if typ in WALL_TYPES:
            bh = 1
            bw = max(1, tw)
        ox, oy = index_xy(entry["index"])
        if ox + tw * TILE > SHEET_W or oy + th * TILE > SHEET_H:
            continue
        if opaque_count(px, ox, oy, tw * TILE, th * TILE, SHEET_W, SHEET_H) < 12:
            continue

        item_id = LEGACY.get(entry["index"]) or slug(entry["name"])
        if item_id in used_ids:
            item_id = f"{item_id}-{entry['index']}"
        used_ids.add(item_id)

        frames = frames_for(typ, tw, th, entry["rotations"])
        slices = []
        sprites: dict[str, str] = {}
        valid = True
        for frame in frames:
            fx = ox + frame["dx"] * TILE
            fy = oy + frame["dy"] * TILE
            fw = frame["tw"] * TILE
            fh = frame["th"] * TILE
            if fx + fw > SHEET_W or fy + fh > SHEET_H:
                if frame["slot"] == "down":
                    valid = False
                continue
            if opaque_count(px, fx, fy, fw, fh, SHEET_W, SHEET_H) < 8:
                if frame["slot"] == "down":
                    valid = False
                continue
            key = item_id if frame["slot"] == "down" else f"{item_id}-{frame['slot']}"
            if item_id == "rug" and frame["slot"] == "down":
                fx, fy, fw, fh = 354, 1362, 93, 62
            drop = 0
            if typ in FRONT_DROP_TYPES and item_id != "rug":
                drop = front_drop(px, fx, fy, fw, fh, occupied)
                fh += drop
            slice_out: dict = {"key": key, "x": fx, "y": fy, "w": fw, "h": fh}
            if drop:
                slice_out["drop"] = drop
            slices.append(slice_out)
            sprites[frame["slot"]] = key
        if not valid or "down" not in sprites:
            continue

        right_frame = next((f for f in frames if f["slot"] == "right"), None)
        side = None
        if right_frame:
            side = side_footprint(typ, bw, bh, right_frame["tw"])

        layer = "floor" if typ in FLOOR_TYPES else "object"
        collide = typ not in FLOOR_TYPES
        use = "sit" if typ in SIT_TYPES else "sleep" if typ in SLEEP_TYPES else None
        group = group_for(typ, entry["name"])
        label = label_for(entry["name"], used_labels)

        items.append(
            {
                "id": item_id,
                "label": label,
                "group": group,
                "w": bw,
                "h": bh,
                "collide": collide,
                "layer": layer,
                "use": use,
                "side": side,
                "sprites": sprites,
                "slices": slices,
            }
        )

    items.sort(key=lambda item: (item["group"], item["label"], item["id"]))

    lines = [
        "/** Generated by scripts/gen-furniture-catalog.py — crops from furniture.png. */",
        "",
        "export type FurnitureGroup =",
        "  | 'seat'",
        "  | 'table'",
        "  | 'storage'",
        "  | 'plant'",
        "  | 'rug'",
        "  | 'wall'",
        "  | 'light'",
        "  | 'decor'",
        "  | 'bed'",
        "  | 'kitchen';",
        "",
        "export type FurnitureSlice = {",
        "  key: string;",
        "  x: number;",
        "  y: number;",
        "  w: number;",
        "  h: number;",
        "  /** Extra pixels below the official source rect (apron / legs). */",
        "  drop?: number;",
        "};",
        "",
        "export type CatalogEntry = {",
        "  id: string;",
        "  label: string;",
        "  group: FurnitureGroup;",
        "  w: number;",
        "  h: number;",
        "  collide: boolean;",
        "  layer: 'floor' | 'object';",
        "  use?: 'sit' | 'sleep';",
        "  side?: { w: number; h: number };",
        "  sprites: { down: string; right?: string; up?: string };",
        "};",
        "",
        "export const FURNITURE_SLICES: FurnitureSlice[] = [",
    ]
    for item in items:
        for sl in item["slices"]:
            drop = sl.get("drop")
            extra = f", drop: {drop}" if drop else ""
            lines.append(
                f"  {{ key: {ts_str(sl['key'])}, x: {sl['x']}, y: {sl['y']}, w: {sl['w']}, h: {sl['h']}{extra} }},"
            )
    lines.append("];")
    lines.append("")
    lines.append("export const GENERATED_CATALOG: CatalogEntry[] = [")
    for item in items:
        sprites = item["sprites"]
        sprite_parts = [f"down: {ts_str(sprites['down'])}"]
        if "right" in sprites:
            sprite_parts.append(f"right: {ts_str(sprites['right'])}")
        if "up" in sprites:
            sprite_parts.append(f"up: {ts_str(sprites['up'])}")
        sprite_txt = "{ " + ", ".join(sprite_parts) + " }"
        bits = [
            f"id: {ts_str(item['id'])}",
            f"label: {ts_str(item['label'])}",
            f"group: {ts_str(item['group'])}",
            f"w: {item['w']}",
            f"h: {item['h']}",
            f"collide: {str(item['collide']).lower()}",
            f"layer: {ts_str(item['layer'])}",
        ]
        if item["use"]:
            bits.append(f"use: '{item['use']}'")
        if item["side"]:
            bits.append(f"side: {{ w: {item['side'][0]}, h: {item['side'][1]} }}")
        bits.append(f"sprites: {sprite_txt}")
        lines.append("  { " + ", ".join(bits) + " },")
    lines.append("];")
    lines.append("")

    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT} ({len(items)} items, {sum(len(i['slices']) for i in items)} slices)")
    by_group: dict[str, int] = {}
    for item in items:
        by_group[item["group"]] = by_group.get(item["group"], 0) + 1
    print(json.dumps(by_group, indent=2))


if __name__ == "__main__":
    main()
