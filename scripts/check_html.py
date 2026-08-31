#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.h1_count = 0
        self.h2_ids: list[str] = []
        self.images = 0
        self.pictures = 0
        self.webp_sources = 0
        self.image_alts: list[str | None] = []
        self.key_layout_half_alts: list[str | None] = []
        self.key_layout_half_sources: list[str] = []
        self.key_layout_references: list[str] = []
        self.empty_urls: list[tuple[str, str]] = []
        self.ids: list[str] = []
        self.labelled_by: list[str] = []
        self.key_layout_chapters = 0
        self.key_layout_model_controls = 0
        self.key_layout_model_views = 0
        self.key_layout_tabs = 0
        self.key_layout_panels = 0
        self.key_layout_halves = 0
        self.key_layout_keys = 0
        self.story_chapters: list[str] = []
        self.media_placeholders: list[str] = []
        self.invalid_placeholders: list[str] = []
        self.detail_sequences = 0
        self.detail_items = 0
        self.visual_chapters = 0
        self.visual_variants: list[str] = []
        self.specs_chapters = 0
        self.specs_groups = 0
        self.definition_tags: list[str] = []
        self.cta_actions = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = set((values.get("class") or "").split())
        if tag == "h1":
            self.h1_count += 1
        if tag == "h2" and values.get("id"):
            self.h2_ids.append(values["id"] or "")
        if tag == "img":
            self.images += 1
            if "key-layout-diagram__half" in classes:
                self.key_layout_halves += 1
                self.key_layout_half_alts.append(values.get("alt", "__missing__"))
                self.key_layout_half_sources.append(values.get("src") or "")
            else:
                self.image_alts.append(values.get("alt"))
        if tag == "picture":
            self.pictures += 1
        if tag == "source" and values.get("type") == "image/webp":
            self.webp_sources += 1
        if values.get("id"):
            self.ids.append(values["id"] or "")
        if values.get("aria-labelledby"):
            self.labelled_by.extend((values["aria-labelledby"] or "").split())
        if "key-layout-chapter" in classes:
            self.key_layout_chapters += 1
        if tag == "input" and "data-key-layout-model-control" in values:
            self.key_layout_model_controls += 1
        if "data-key-layout-model-view" in values:
            self.key_layout_model_views += 1
            self.key_layout_references.append(values.get("data-layout-reference") or "")
        if tag == "button" and "data-key-layout-layer-target" in values:
            self.key_layout_tabs += 1
        if "data-key-layout-layer-panel" in values:
            self.key_layout_panels += 1
        if tag == "g" and "key-layout-diagram__key" in classes:
            self.key_layout_keys += 1
        if values.get("data-product-chapter"):
            self.story_chapters.append(values["data-product-chapter"] or "")
        if "data-media-placeholder" in values:
            placeholder = values.get("data-media-placeholder") or ""
            self.media_placeholders.append(placeholder)
            if values.get("role") != "img" or not values.get("aria-label"):
                self.invalid_placeholders.append(placeholder)
        if "detail-sequence" in classes:
            self.detail_sequences += 1
        if "detail-sequence__item" in classes:
            self.detail_items += 1
        if "visual-chapter" in classes:
            self.visual_chapters += 1
            self.visual_variants.extend(
                sorted(value for value in classes if value.startswith("visual-chapter--"))
            )
        if "specs-chapter" in classes:
            self.specs_chapters += 1
        if "specs-chapter__group" in classes:
            self.specs_groups += 1
        if tag in ("dt", "dd"):
            self.definition_tags.append(tag)
        if "data-cta-action-pending" in values:
            self.cta_actions += 1
        for key in ("href", "src"):
            if key in values and not values[key]:
                self.empty_urls.append((tag, key))


PHENOM_STORY = [
    "curves",
    "finger-geometry",
    "additive-manufacturing",
    "keycaps-switches",
    "wired",
    "entropy",
    "specs",
    "cta",
]

PHENOM_H2_IDS = [
    "series-title",
    "modularity-title",
    "key-layout-title",
    "phenom-curves-title",
    "phenom-finger-geometry-title",
    "phenom-additive-manufacturing-title",
    "phenom-keycaps-switches-title",
    "phenom-wired-title",
    "phenom-entropy-title",
    "phenom-specs-title",
    "phenom-cta-title",
]

PHENOM_PLACEHOLDERS = [
    "curves-keywell",
    "curves-outer-columns",
    "curves-thumb-arc",
    "curves-side-profile",
    "finger-geometry",
    "additive-manufacturing",
    "keycaps-switches",
    "wired",
    "entropy",
    "cta",
]

PHENOM_REFERENCE_HASHES = {
    "en": {
        "standard": "7e15a7c876250b7135fb3aef299fdb842b8e2c1c8daa52b6ea8a7e1e9d942f56",
        "mini": "37f27ad053f2e3fd57255f6971f43806a923d85d6c9f46af301f955c9733251b",
        "micro": "8ee34f9e3c9666997164bc1bf319ddedcdf2c116329b47ac2e6d758aab9504ad",
    },
    "ru": {
        "standard": "91c6a7d81c2234f924dccd32bab567405715fd46a2ec4e7186cfca1d09947023",
        "mini": "c2ff7845c8cae22090860cad775a0b82b693d86ebee330602f9fe50cb6729e88",
        "micro": "847f73ddb4c46de8e45de8aa7c60be3490da4a2dd0a7fa68dfd9279a83e546b4",
    },
}


def check_page(path: Path, language: str, domain: str, is_phenom: bool) -> list[str]:
    source = path.read_text(encoding="utf-8")
    parser = PageParser()
    parser.feed(source)
    errors: list[str] = []
    expected_images = 33 if is_phenom else 0
    if parser.h1_count != 1:
        errors.append(f"{path}: expected one h1, found {parser.h1_count}")
    if parser.images != expected_images:
        errors.append(f"{path}: expected {expected_images} img elements, found {parser.images}")
    expected_pictures = 5 if is_phenom else 0
    if parser.pictures != expected_pictures or parser.webp_sources != expected_pictures:
        errors.append(
            f"{path}: expected {expected_pictures} picture/WebP pairs, found "
            f"{parser.pictures}/{parser.webp_sources}"
        )
    if any(not alt for alt in parser.image_alts):
        errors.append(f"{path}: every product image must have meaningful alt text")
    if is_phenom and (
        len(parser.key_layout_half_alts) != 28
        or any(alt not in (None, "") for alt in parser.key_layout_half_alts)
    ):
        errors.append(
            f"{path}: the 28 layout halves must be decorative inside labelled diagrams"
        )
    if is_phenom:
        content_language = language.split("-", 1)[0]
        expected_asset_segment = f"/phenom/layouts/{content_language}/"
        if any(
            expected_asset_segment not in asset
            for asset in parser.key_layout_half_sources
        ):
            errors.append(
                f"{path}: layout assets must come only from {content_language} references"
            )
        expected_references = [
            PHENOM_REFERENCE_HASHES[content_language][model]
            for model in ("standard", "mini", "micro")
        ]
        if parser.key_layout_references != expected_references:
            errors.append(
                f"{path}: wrong localized layout references "
                f"{parser.key_layout_references}"
            )
    if parser.empty_urls:
        errors.append(f"{path}: empty href/src attributes: {parser.empty_urls}")
    if f"<html lang={language}" not in source:
        errors.append(f"{path}: wrong or missing html language {language}")
    if f"rel=canonical href={domain}" not in source:
        errors.append(f"{path}: canonical URL is not on {domain}")
    if "id=main-content" not in source:
        errors.append(f"{path}: main content target is missing")
    if re.search(r"style=|onclick=", source):
        errors.append(f"{path}: inline presentation or behavior leaked into HTML")
    if len(parser.ids) != len(set(parser.ids)):
        errors.append(f"{path}: duplicate id attributes found")
    missing_labels = sorted(set(parser.labelled_by) - set(parser.ids))
    if missing_labels:
        errors.append(f"{path}: missing aria-labelledby targets: {missing_labels}")
    if is_phenom:
        expected_layout = (1, 3, 3, 14, 14, 28, 0)
        if parser.story_chapters != PHENOM_STORY:
            errors.append(
                f"{path}: expected story order {PHENOM_STORY}, found {parser.story_chapters}"
            )
        if parser.h2_ids != PHENOM_H2_IDS:
            errors.append(f"{path}: expected h2 order {PHENOM_H2_IDS}, found {parser.h2_ids}")
        if parser.media_placeholders != PHENOM_PLACEHOLDERS:
            errors.append(
                f"{path}: expected placeholders {PHENOM_PLACEHOLDERS}, "
                f"found {parser.media_placeholders}"
            )
        if parser.invalid_placeholders:
            errors.append(
                f"{path}: placeholders need role=img and localized aria-label: "
                f"{parser.invalid_placeholders}"
            )
        story_contract = (
            parser.detail_sequences,
            parser.detail_items,
            parser.visual_chapters,
            parser.specs_chapters,
            parser.specs_groups,
            parser.cta_actions,
        )
        if story_contract != (1, 4, 7, 1, 3, 1):
            errors.append(
                f"{path}: expected story component contract (1, 4, 7, 1, 3, 1), "
                f"found {story_contract}"
            )
        expected_variants = {
            "visual-chapter--modularity": 1,
            "visual-chapter--centered": 1,
            "visual-chapter--bleed-edge": 2,
            "visual-chapter--bleed-copy-left": 1,
            "visual-chapter--split-left": 1,
            "visual-chapter--closing": 1,
        }
        for variant, expected in expected_variants.items():
            actual = parser.visual_variants.count(variant)
            if actual != expected:
                errors.append(f"{path}: expected {expected} {variant}, found {actual}")
        if parser.definition_tags != ["dt", "dd"] * 7:
            errors.append(
                f"{path}: specifications must contain seven alternating dt/dd pairs"
            )
    else:
        expected_layout = (0, 0, 0, 0, 0, 0, 0)
        story_contract = (
            parser.story_chapters,
            parser.media_placeholders,
            parser.detail_sequences,
            parser.detail_items,
            parser.visual_chapters,
            parser.specs_chapters,
            parser.specs_groups,
            parser.cta_actions,
            parser.definition_tags,
        )
        if story_contract != ([], [], 0, 0, 0, 0, 0, 0, []):
            errors.append(f"{path}: Phenom story components leaked into another page")
    actual_layout = (
        parser.key_layout_chapters,
        parser.key_layout_model_controls,
        parser.key_layout_model_views,
        parser.key_layout_tabs,
        parser.key_layout_panels,
        parser.key_layout_halves,
        parser.key_layout_keys,
    )
    if actual_layout != expected_layout:
        errors.append(
            f"{path}: expected layout contract {expected_layout}, found {actual_layout}"
        )
    return errors


def main() -> int:
    project = Path(__file__).resolve().parents[1]
    pages = {
        "en": (project / "public/en", "en-US", "https://projects.eh.industries/"),
        "ru": (project / "public/ru", "ru-RU", "https://projects.eh.works/"),
    }
    errors: list[str] = []
    diagram_path = project / "data/key_layouts/phenom.json"
    try:
        diagram = json.loads(diagram_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{diagram_path}: cannot read layout data: {error}")
    else:
        source = diagram.get("source", {})
        models = diagram.get("models", [])
        expected_models = {"standard": 58, "mini": 46, "micro": 40}
        qmk_models = {
            "standard": "phenom",
            "mini": "phenom_mini",
            "micro": "phenom_micro",
        }
        expected_layers = {
            "standard": ["base", "numbers", "symbols", "cursor"],
            "mini": ["base", "numbers", "symbols", "function", "cursor"],
            "micro": ["base", "numbers", "symbols", "function", "cursor"],
        }
        expected_references = PHENOM_REFERENCE_HASHES
        expected_palette = {
            "base": ("white", "#F1F1F1"),
            "numbers": ("#D15150", "#A34940"),
            "symbols": ("#79C9E2", "#80AFC3"),
            "function": ("#EDE1A5", "#EDCC29"),
            "cursor": ("#86D994", "#78D087"),
        }
        expected_active_keys = {
            "standard": {"base": 58, "numbers": 42, "symbols": 27, "cursor": 12},
            "mini": {
                "base": 46,
                "numbers": 24,
                "symbols": 27,
                "function": 18,
                "cursor": 12,
            },
            "micro": {
                "base": 40,
                "numbers": 24,
                "symbols": 27,
                "function": 19,
                "cursor": 12,
            },
        }
        layout_assets = project / "assets/images/products/phenom/layouts"
        expected_asset_root = "images/products/phenom/layouts"
        declared_assets: set[Path] = set()
        if source.get("asset_root") != expected_asset_root:
            errors.append(f"{diagram_path}: wrong localized layout asset root")
        if [model.get("id") for model in models] != list(expected_models):
            errors.append(f"{diagram_path}: expected Standard, Mini, Micro model order")
        for model in models:
            model_id = model.get("id")
            key_count = expected_models.get(model_id)
            layers = model.get("layers", [])
            if key_count is None:
                continue
            if model.get("key_count") != key_count:
                errors.append(f"{diagram_path}: {model_id} must describe {key_count} keys")
            if [layer.get("id") for layer in layers] != expected_layers[model_id]:
                errors.append(
                    f"{diagram_path}: {model_id} must contain layers "
                    f"{expected_layers[model_id]}"
                )
            expected_model_references = {
                locale: {
                    "sha256": locale_references[model_id],
                    "key_count": key_count,
                }
                for locale, locale_references in expected_references.items()
            }
            if model.get("references", {}) != expected_model_references:
                errors.append(
                    f"{diagram_path}: wrong {model_id} localized vector reference pins"
                )
            for layer in layers:
                layer_id = layer.get("id", "")
                for locale, locale_references in expected_references.items():
                    layer_keys: list[ET.Element] = []
                    for side in ("left", "right"):
                        relative_asset = (
                            f"{expected_asset_root}/{locale}/"
                            f"{model_id}-{layer_id}-{side}.svg"
                        )
                        asset = project / "assets" / relative_asset
                        declared_assets.add(asset)
                        if not asset.is_file():
                            errors.append(
                                f"{diagram_path}: missing layout asset {relative_asset}"
                            )
                            continue
                        try:
                            root = ET.parse(asset).getroot()
                        except (OSError, ET.ParseError) as error:
                            errors.append(f"{asset}: cannot parse SVG: {error}")
                            continue
                        expected_metadata = {
                            "data-reference-sha256": locale_references[model_id],
                            "data-model": model_id,
                            "data-layer": layer_id,
                            "data-side": side,
                            "data-locale": locale,
                            "data-key-canvas-width": "8.18",
                        }
                        for field, value in expected_metadata.items():
                            if root.get(field) != value:
                                errors.append(f"{asset}: wrong {field}")
                        if root.get("fill") != "none":
                            errors.append(
                                f"{asset}: must preserve the reference root fill=none"
                            )
                        paths = root.findall("{http://www.w3.org/2000/svg}path")
                        legend_paths = [
                            path
                            for path in paths
                            if path.get("data-key-legend") == "letter"
                        ]
                        legend_fields = (
                            "data-base-legend-source-ratio",
                            "data-base-legend-target-ratio",
                            "data-base-legend-scale",
                        )
                        should_scale = (
                            locale == "en"
                            and model_id == "micro"
                            and layer_id == "base"
                        )
                        if should_scale:
                            try:
                                source_ratio, target_ratio, legend_scale = (
                                    float(root.get(field, ""))
                                    for field in legend_fields
                                )
                            except ValueError:
                                errors.append(f"{asset}: invalid base legend metadata")
                            else:
                                if not 0.1536 < target_ratio < 0.1538:
                                    errors.append(
                                        f"{asset}: base legend target ratio changed"
                                    )
                                if abs(source_ratio * legend_scale - target_ratio) > 0.0001:
                                    errors.append(
                                        f"{asset}: base legend scale misses its target"
                                    )
                                if not 0.9 < legend_scale < 0.92:
                                    errors.append(
                                        f"{asset}: wrong model-to-model legend scale"
                                    )
                            expected_legend_indices = (
                                {str(index) for index in range(15)}
                                if side == "left"
                                else {
                                    "0", "1", "2", "3", "4", "7", "8", "9",
                                    "10", "16", "17",
                                }
                            )
                            actual_legend_indices = {
                                path.get("data-key-index", "<missing>")
                                for path in legend_paths
                            }
                            if actual_legend_indices != expected_legend_indices:
                                errors.append(
                                    f"{asset}: wrong primary letter key indices "
                                    f"{sorted(actual_legend_indices)}"
                                )
                            elif len(legend_paths) != len(expected_legend_indices):
                                errors.append(f"{asset}: duplicate primary letter legends")
                            elif any(
                                path.get("transform") is None for path in legend_paths
                            ):
                                errors.append(
                                    f"{asset}: scaled base legend is missing a transform"
                                )
                            elif any(
                                not re.fullmatch(
                                    rf"matrix\({legend_scale:.6f} 0 0 "
                                    rf"{legend_scale:.6f} -?\d+(?:\.\d+)? "
                                    rf"-?\d+(?:\.\d+)?\)",
                                    path.get("transform", ""),
                                )
                                for path in legend_paths
                            ):
                                errors.append(
                                    f"{asset}: primary letters use the wrong scale matrix"
                                )
                            elif any(
                                path.get("transform") is not None
                                for path in paths
                                if path not in legend_paths
                            ):
                                errors.append(
                                    f"{asset}: non-letter artwork must stay untransformed"
                                )
                        elif legend_paths or any(root.get(field) for field in legend_fields):
                            errors.append(
                                f"{asset}: English Micro Base normalization leaked elsewhere"
                            )
                        try:
                            view_box = [
                                float(value)
                                for value in root.get("viewBox", "").split()
                            ]
                        except ValueError:
                            view_box = []
                        if len(view_box) != 4 or view_box[2] <= 0 or view_box[3] <= 0:
                            errors.append(f"{asset}: invalid viewBox")
                        rects = root.findall("{http://www.w3.org/2000/svg}rect")
                        large_keys = [
                            rect
                            for rect in rects
                            if 100 < float(rect.get("width", "0")) < 200
                            and 100 < float(rect.get("height", "0")) < 200
                        ]
                        if len(large_keys) != key_count // 2:
                            errors.append(
                                f"{asset}: expected {key_count // 2} keys, "
                                f"found {len(large_keys)}"
                            )
                        elif len(view_box) == 4:
                            key_scale = view_box[2] / float(
                                large_keys[0].get("width", "0")
                            )
                            if abs(key_scale - 8.18) > 0.0001:
                                errors.append(
                                    f"{asset}: key canvas ratio must be 8.18, "
                                    f"found {key_scale}"
                                )
                        layer_keys.extend(large_keys)
                        if root.findall("{http://www.w3.org/2000/svg}text"):
                            errors.append(
                                f"{asset}: reference legends must remain outlined paths"
                            )
                    fill, stroke = expected_palette[layer_id]
                    if any(
                        key.get("fill") != fill
                        or key.get("stroke") != stroke
                        or key.get("opacity") not in (None, "0.5")
                        for key in layer_keys
                    ):
                        errors.append(
                            f"{diagram_path}: {locale}/{model_id}/{layer_id} "
                            "palette differs from reference"
                        )
                    active_keys = sum(
                        key.get("opacity") is None for key in layer_keys
                    )
                    if active_keys != expected_active_keys[model_id][layer_id]:
                        errors.append(
                            f"{diagram_path}: {locale}/{model_id}/{layer_id} must have "
                            f"{expected_active_keys[model_id][layer_id]} active keys, "
                            f"found {active_keys}"
                        )
            model_source = model.get("source", {})
            source_root = f"keyboards/ergohaven/{qmk_models[model_id]}"
            expected_paths = {
                "vial_path": f"{source_root}/keymaps/v1/vial.json",
                "keymap_path": f"{source_root}/keymaps/v1/keymap.c",
                "layout_path": f"{source_root}/rev1/keyboard.json",
            }
            for field, expected_path in expected_paths.items():
                if model_source.get(field) != expected_path:
                    errors.append(f"{diagram_path}: wrong {model_id} {field}")
                hash_field = field.replace("_path", "_sha256")
                if not re.fullmatch(r"[0-9a-f]{64}", model_source.get(hash_field, "")):
                    errors.append(f"{diagram_path}: missing {model_id} {hash_field}")
        actual_assets = set(layout_assets.rglob("*.svg")) if layout_assets.is_dir() else set()
        if actual_assets != declared_assets:
            errors.append(
                f"{layout_assets}: expected exactly {len(declared_assets)} declared SVG assets, "
                f"found {len(actual_assets)}"
            )
        if source.get("repository") != "https://github.com/ergohaven/vial-qmk":
            errors.append(f"{diagram_path}: wrong QMK source repository")
        if source.get("branch") != "ergohaven":
            errors.append(f"{diagram_path}: wrong QMK source branch")
        if source.get("commit") != "cb48b91787fc47767d2fda263286873d3e438ea5":
            errors.append(f"{diagram_path}: QMK source commit is not pinned")
        if source.get("layer_mapping") != {
            "base": "_BASE",
            "numbers": "_LOWER",
            "symbols": "_RAISE",
            "function": "_ADJUST",
            "cursor": "_FOUR",
        }:
            errors.append(f"{diagram_path}: QMK layer mapping changed")
    for root_name, (root, language, domain) in pages.items():
        expected = [
            "index.html",
            "k04/index.html",
            "phenom/index.html",
            "macropad/index.html",
            "404.html",
        ]
        for relative in expected:
            path = root / relative
            if not path.is_file():
                errors.append(f"{root_name}: missing {relative}")
                continue
            errors.extend(
                check_page(path, language, domain, relative == "phenom/index.html")
            )
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(
        "HTML contract OK: 10 pages, paired locales, Phenom imagery, "
        "56 localized reference-exact layout assets, and chapters 04–11"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
