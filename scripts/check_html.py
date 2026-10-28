#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path


class PageParser(HTMLParser):
    def __init__(self, phenom: bool = False) -> None:
        super().__init__()
        self.phenom = phenom
        self.h1_count = 0
        self.h2_ids: list[str] = []
        self.images = 0
        self.pictures = 0
        self.webp_sources = 0
        self.image_alts: list[str | None] = []
        self.key_layout_half_alts: list[str | None] = []
        self.key_layout_half_sources: list[str] = []
        self.key_layout_dark_half_alts: list[str | None] = []
        self.key_layout_dark_half_sources: list[str] = []
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
        self.videos = 0
        self.video_sources = 0
        self.invalid_videos: list[str] = []
        self.detail_sequences = 0
        self.detail_items = 0
        self.visual_chapters = 0
        self.visual_variants: list[str] = []
        self.specs_chapters = 0
        self.specs_groups = 0
        self.specs_item_counts: list[int] = []
        self.definition_tags: list[str] = []
        self.cta_actions = 0
        self.immersive_heroes = 0
        self.series_showcases = 0
        self.series_cards = 0
        self.layout_previews: list[str] = []
        self.layout_preview_sources: list[str] = []
        self.source_layout_diagrams: list[str] = []
        self.source_layout_keys: list[str] = []
        self.source_layout_encoders = 0
        self.invalid_source_layouts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if self.phenom:
            for target, deferred in (("src", "data-layout-src"), ("poster", "data-poster")):
                if deferred in values:
                    values[target] = values[deferred]
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
            elif "key-layout-diagram__half-dark" in classes:
                self.key_layout_dark_half_alts.append(
                    values.get("alt", "__missing__")
                )
                self.key_layout_dark_half_sources.append(values.get("src") or "")
            else:
                self.image_alts.append(values.get("alt"))
        if tag == "picture":
            self.pictures += 1
        if tag == "source" and values.get("type") == "image/webp":
            self.webp_sources += 1
        if tag == "source" and values.get("type") == "video/mp4":
            self.video_sources += 1
        if tag == "video" and "chapter-media__video" in classes:
            self.videos += 1
            is_theme_video = "data-theme-video" in values
            required_attributes = ("muted", "loop", "playsinline")
            if (
                any(attribute not in values for attribute in required_attributes)
                or (is_theme_video and values.get("preload") != "none")
                or (is_theme_video and "autoplay" in values)
                or (not is_theme_video and "autoplay" not in values)
                or not values.get("aria-label")
                or not values.get("poster")
            ):
                self.invalid_videos.append(values.get("aria-label") or "unlabelled video")
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
            try:
                self.specs_item_counts.append(int(values.get("data-specs-item-count") or ""))
            except ValueError:
                self.specs_item_counts.append(-1)
        if tag in ("dt", "dd"):
            self.definition_tags.append(tag)
        if "data-cta-action-pending" in values or (tag == "a" and "visual-chapter__action" in classes and values.get("href")):
            self.cta_actions += 1
        if "product-hero--immersive" in classes:
            self.immersive_heroes += 1
        if "series-showcase" in classes:
            self.series_showcases += 1
        if "series-card" in classes:
            self.series_cards += 1
        if "layout-preview" in classes:
            self.layout_previews.append(values.get("data-layout-preview") or "")
            self.layout_preview_sources.append(values.get("data-layout-source") or "")
        if "source-layout-diagram" in classes:
            diagram = values.get("data-source-layout-diagram") or ""
            self.source_layout_diagrams.append(diagram)
            if values.get("role") != "img" or not values.get("aria-label"):
                self.invalid_source_layouts.append(diagram)
        if "data-source-layout-key" in values:
            self.source_layout_keys.append(values.get("data-source-layout-key") or "")
        if "data-source-layout-encoder" in values:
            self.source_layout_encoders += 1
        for key in ("href", "src"):
            if key in values and not values[key]:
                self.empty_urls.append((tag, key))


PHENOM_STORY = [
    "finger-geometry",
    "curves",
    "additive-manufacturing",
    "keycaps-switches",
    "entropy",
    "wired",
    "specs",
    "cta",
]

PHENOM_H2_IDS = [
    "series-title",
    "modularity-title",
    "key-layout-title",
    "phenom-finger-geometry-title",
    "phenom-curves-title",
    "phenom-additive-manufacturing-title",
    "phenom-keycaps-switches-title",
    "phenom-entropy-title",
    "phenom-wired-title",
    "phenom-specs-title",
    "phenom-cta-title",
]

PHENOM_PLACEHOLDERS = []

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

PRODUCT_CONTRACTS = {
    "phenom": {
        "images": 70,
        "pictures": 14,
        "immersive_heroes": 1,
        "series": (1, 3),
        "story": PHENOM_STORY,
        "h2_ids": PHENOM_H2_IDS,
        "placeholders": PHENOM_PLACEHOLDERS,
        "layout": (1, 3, 3, 14, 14, 28, 0),
        "layout_previews": ([], []),
        "source_layout": ([], 0, 0),
        "story_contract": (1, 4, 7, 1, 6, 2),
        "definition_tags": ["dt", "dd"] * 18,
        "variants": {
            "visual-chapter--modularity": 1,
            "visual-chapter--centered": 1,
            "visual-chapter--bleed-edge": 2,
            "visual-chapter--bleed-copy-left": 1,
            "visual-chapter--split-left": 1,
            "visual-chapter--closing": 1,
        },
    },
    "k04": {
        "images": 0,
        "pictures": 0,
        "immersive_heroes": 1,
        "series": (1, 3),
        "story": [
            "modularity",
            "wireless",
            "layout",
            "column-stagger",
            "entropy",
            "keycaps-switches",
            "compact-powerful",
            "comfort",
            "specs",
            "cta",
        ],
        "h2_ids": [
            "series-title",
            "k04-modularity-title",
            "k04-wireless-title",
            "k04-layout-title",
            "k04-column-stagger-title",
            "k04-entropy-title",
            "k04-keycaps-switches-title",
            "k04-compact-title",
            "k04-comfort-title",
            "k04-specs-title",
            "k04-cta-title",
        ],
        "placeholders": [
            "k04-hero",
            "k04-series-standard",
            "k04-series-mini",
            "k04-series-micro",
            "k04-modularity",
            "k04-wireless",
            "k04-column-stagger",
            "k04-entropy",
            "k04-keycaps-switches",
            "k04-compact",
            "k04-comfort-sculpt",
            "k04-comfort-handrests",
            "k04-comfort-tenting",
            "k04-cta",
        ],
        "layout": (0, 0, 0, 0, 0, 0, 0),
        "layout_previews": (
            ["k04"],
            ["c84a649f6871de0b14a97ebf1400efc559f51d5d"],
        ),
        "source_layout": (["k04"], 58, 0),
        "story_contract": (1, 3, 7, 1, 3, 1),
        "definition_tags": ["dt", "dd"] * 10,
        "variants": {
            "visual-chapter--modularity": 1,
            "visual-chapter--bleed-edge": 3,
            "visual-chapter--bleed-copy-left": 1,
            "visual-chapter--split-left": 1,
            "visual-chapter--closing": 1,
        },
    },
    "macropad": {
        "images": 0,
        "pictures": 0,
        "immersive_heroes": 1,
        "series": (0, 0),
        "story": [
            "designed-for",
            "display",
            "entropy",
            "layout",
            "design",
            "keycaps-switches",
            "compact-powerful",
            "specs",
            "cta",
        ],
        "h2_ids": [
            "macropad-designed-for-title",
            "macropad-display-title",
            "macropad-entropy-title",
            "macropad-layout-title",
            "macropad-design-title",
            "macropad-keycaps-switches-title",
            "macropad-compact-title",
            "macropad-specs-title",
            "macropad-cta-title",
        ],
        "placeholders": [
            "macropad-hero",
            "macropad-engineering",
            "macropad-programming",
            "macropad-gaming",
            "macropad-display",
            "macropad-entropy",
            "macropad-design",
            "macropad-keycaps-switches",
            "macropad-compact",
            "macropad-cta",
        ],
        "layout": (0, 0, 0, 0, 0, 0, 0),
        "layout_previews": (
            ["macropad"],
            ["cb48b91787fc47767d2fda263286873d3e438ea5"],
        ),
        "source_layout": (["macropad"], 12, 1),
        "story_contract": (1, 3, 6, 1, 3, 1),
        "definition_tags": ["dt", "dd"] * 10,
        "variants": {
            "visual-chapter--bleed-copy-left": 2,
            "visual-chapter--split-left": 1,
            "visual-chapter--bleed-edge": 2,
            "visual-chapter--closing": 1,
        },
    },
}


PINNED_PREVIEW_DATA = {
    "k04": {
        "source": {
            "repository": "https://github.com/ergohaven/rmk",
            "branch": "main",
            "commit": "c84a649f6871de0b14a97ebf1400efc559f51d5d",
        },
        "models": [
            {
                "id": "standard",
                "name": "K:04 Standard",
                "source": {
                    "vial_path": "keyboards/k04/vial.json",
                    "vial_sha256": "ab38a886eda1d3ab1dc48433888a67d77f7fe6e72ae507925eb94bbf41439829",
                    "keymap_path": "keyboards/k04/keyboard.toml",
                    "keymap_sha256": "398bf7d14da926f9e406bf19e36fccb3ae5d40e756b19eefc6a5324207cdafab",
                },
            },
            {
                "id": "mini",
                "name": "K:04 Mini",
                "source": {
                    "vial_path": "keyboards/k04/vial_mini.json",
                    "vial_sha256": "5ff463d402ec58a15bce0b1cc041c18b73321691fb69c7e061b043137bfd8a1e",
                    "keymap_path": "keyboards/k04/keyboard_mini.toml",
                    "keymap_sha256": "27a87025a507d2596b9c01137fe8339ac33a814d33c9d2377be86e8c1f42de1e",
                },
            },
            {
                "id": "micro",
                "name": "K:04 Micro",
                "source": {
                    "vial_path": "keyboards/k04/vial_micro.json",
                    "vial_sha256": "69822c2ce4e72e3c8b411f93621f3e1a580dbb2e0c04ea1c222690c105989f63",
                    "keymap_path": "keyboards/k04/keyboard_micro.toml",
                    "keymap_sha256": "e98616c958bbe48a493b782e99f40c218c3e3a9284739fc0d6d66033fc7a2b0f",
                },
            },
        ],
        "featured_layout": {"model": "standard", "key_count": 58},
    },
    "macropad": {
        "source": {
            "repository": "https://github.com/ergohaven/vial-qmk",
            "branch": "ergohaven",
            "commit": "cb48b91787fc47767d2fda263286873d3e438ea5",
        },
        "model": {
            "id": "default",
            "name": "Ergohaven Macropad",
            "key_count": 12,
            "source": {
                "vial_path": "keyboards/ergohaven/macropad/keymaps/v3/vial.json",
                "vial_sha256": "505f08fdb1481969fc7dd203e14ed47847fa31077d300849a39decfd8b47cdb7",
                "keymap_path": "keyboards/ergohaven/macropad/keymaps/v3/keymap.c",
                "keymap_sha256": "03f5ea9721203d7a1743cc004776d8482803f02a8f1796e4271b5bb18ec3daa6",
                "layout_path": "keyboards/ergohaven/macropad/rev3/keyboard.json",
                "layout_sha256": "37f1fe7a415de3b1870f266c76d79a2639d8b1bca4acf7307be0ac82f049cc1c",
            },
            "default_keys": [
                ["7", "8", "9"],
                ["4", "5", "6"],
                ["1", "2", "3"],
                ["0", "Previous layer", "Next layer"],
            ],
            "encoder": {
                "press": "Mute",
                "counterclockwise": "Volume down",
                "clockwise": "Volume up",
            },
        },
    },
}

PINNED_PREVIEW_DIAGRAM_HASHES = {
    "k04": "b93afe6a8fec265e056cd3d0b2e00e3f3503b181673a1e93744f08167fe2187b",
    "macropad": "c017e7300608b49ccdfa071e42184247eca43b468df1be1eadfef1dd6dae199e",
}


def check_preview_data(project: Path) -> list[str]:
    errors: list[str] = []
    for product, expected in PINNED_PREVIEW_DATA.items():
        path = project / "data/key_layouts" / f"{product}.json"
        try:
            actual = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"{path}: cannot read layout preview data: {error}")
            continue
        diagram = actual.get("diagram")
        actual_contract = {key: value for key, value in actual.items() if key != "diagram"}
        if actual_contract != expected:
            errors.append(f"{path}: source-pinned layout preview contract changed")
        if not isinstance(diagram, dict):
            errors.append(f"{path}: source-derived diagram is missing")
            continue
        diagram_json = json.dumps(
            diagram,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        diagram_hash = hashlib.sha256(diagram_json).hexdigest()
        if diagram_hash != PINNED_PREVIEW_DIAGRAM_HASHES[product]:
            errors.append(f"{path}: source-derived diagram geometry changed")
    return errors


def check_page(
    path: Path,
    language: str,
    domain: str,
    product: str | None,
) -> list[str]:
    source = path.read_text(encoding="utf-8")
    parser = PageParser(phenom=product == "phenom")
    # With scripting enabled noscript children are text, not duplicate DOM.
    # Isolation checks separately validate every fallback resource and layout half.
    parsed_source = re.sub(r"<noscript\b[^>]*>.*?</noscript>", "", source, flags=re.S) if product == "phenom" else source
    parser.feed(parsed_source)
    errors: list[str] = []
    contract = PRODUCT_CONTRACTS.get(product or "")
    is_phenom = product == "phenom"
    expected_images = contract["images"] if contract else 0
    if parser.h1_count != 1:
        errors.append(f"{path}: expected one h1, found {parser.h1_count}")
    if parser.images != expected_images:
        errors.append(f"{path}: expected {expected_images} img elements, found {parser.images}")
    expected_pictures = contract["pictures"] if contract else 0
    expected_webp = 17 if is_phenom else expected_pictures
    if parser.pictures != expected_pictures or parser.webp_sources != expected_webp:
        errors.append(
            f"{path}: expected {expected_pictures}/{expected_webp} picture/WebP elements, found "
            f"{parser.pictures}/{parser.webp_sources}"
        )
    if any(not alt for alt in parser.image_alts):
        errors.append(f"{path}: every product image must have meaningful alt text")
    if is_phenom and (
        len(parser.key_layout_half_alts) != 28
        or any(alt not in (None, "") for alt in parser.key_layout_half_alts)
        or len(parser.key_layout_dark_half_alts) != 28
        or any(alt not in (None, "") for alt in parser.key_layout_dark_half_alts)
    ):
        errors.append(
            f"{path}: the 28 light and 28 dark layout halves must be decorative "
            "inside labelled diagrams"
        )
    if is_phenom:
        content_language = language.split("-", 1)[0]
        expected_asset_segment = f"/phenom/layouts/{content_language}/"
        if any(
            expected_asset_segment not in asset
            for asset in (
                parser.key_layout_half_sources + parser.key_layout_dark_half_sources
            )
        ):
            errors.append(
                f"{path}: layout assets must come only from {content_language} references"
            )
        if parser.specs_item_counts != [3] * 6:
            errors.append(
                f"{path}: Phenom must have 6 specification groups with 3 rows each, "
                f"found {parser.specs_item_counts}"
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
    if contract:
        expected_layout = contract["layout"]
        if parser.immersive_heroes != contract["immersive_heroes"]:
            errors.append(
                f"{path}: expected {contract['immersive_heroes']} immersive hero, "
                f"found {parser.immersive_heroes}"
            )
        actual_series = (parser.series_showcases, parser.series_cards)
        if actual_series != contract["series"]:
            errors.append(
                f"{path}: expected series contract {contract['series']}, "
                f"found {actual_series}"
            )
        if parser.story_chapters != contract["story"]:
            errors.append(
                f"{path}: expected story order {contract['story']}, "
                f"found {parser.story_chapters}"
            )
        if parser.h2_ids != contract["h2_ids"]:
            errors.append(
                f"{path}: expected h2 order {contract['h2_ids']}, "
                f"found {parser.h2_ids}"
            )
        expected_placeholders = contract["placeholders"]
        if is_phenom:
            expected_placeholders = []
        if parser.media_placeholders != expected_placeholders:
            errors.append(
                f"{path}: expected placeholders {expected_placeholders}, "
                f"found {parser.media_placeholders}"
            )
        if parser.invalid_placeholders:
            errors.append(
                f"{path}: placeholders need role=img and localized aria-label: "
                f"{parser.invalid_placeholders}"
            )
        expected_videos = 2 if is_phenom else 0
        if parser.videos != expected_videos or parser.video_sources != expected_videos:
            errors.append(
                f"{path}: expected {expected_videos} video/source pair, found "
                f"{parser.videos}/{parser.video_sources}"
            )
        if parser.invalid_videos:
            errors.append(
                f"{path}: videos need muted/loop/playsinline, a poster and an "
                f"accessible label; theme videos must use preload=none without "
                f"autoplay: {parser.invalid_videos}"
            )
        story_contract = (
            parser.detail_sequences,
            parser.detail_items,
            parser.visual_chapters,
            parser.specs_chapters,
            parser.specs_groups,
            parser.cta_actions,
        )
        if story_contract != contract["story_contract"]:
            errors.append(
                f"{path}: expected story component contract "
                f"{contract['story_contract']}, "
                f"found {story_contract}"
            )
        for variant, expected in contract["variants"].items():
            actual = parser.visual_variants.count(variant)
            if actual != expected:
                errors.append(f"{path}: expected {expected} {variant}, found {actual}")
        expected_preview_names, expected_preview_sources = contract["layout_previews"]
        if (
            parser.layout_previews != expected_preview_names
            or parser.layout_preview_sources != expected_preview_sources
        ):
            errors.append(
                f"{path}: expected layout previews "
                f"{contract['layout_previews']}, found "
                f"{(parser.layout_previews, parser.layout_preview_sources)}"
            )
        actual_source_layout = (
            parser.source_layout_diagrams,
            len(parser.source_layout_keys),
            parser.source_layout_encoders,
        )
        if actual_source_layout != contract["source_layout"]:
            errors.append(
                f"{path}: expected source layout contract "
                f"{contract['source_layout']}, found {actual_source_layout}"
            )
        if parser.invalid_source_layouts:
            errors.append(
                f"{path}: source layout diagrams need role=img and a localized "
                f"aria-label: {parser.invalid_source_layouts}"
            )
        if parser.definition_tags != contract["definition_tags"]:
            errors.append(
                f"{path}: expected alternating definition tags "
                f"{contract['definition_tags']}, found {parser.definition_tags}"
            )
    else:
        expected_layout = (0, 0, 0, 0, 0, 0, 0)
        story_contract = (
            parser.immersive_heroes,
            parser.series_showcases,
            parser.series_cards,
            parser.story_chapters,
            parser.media_placeholders,
            parser.detail_sequences,
            parser.detail_items,
            parser.visual_chapters,
            parser.specs_chapters,
            parser.specs_groups,
            parser.cta_actions,
            parser.definition_tags,
            parser.layout_previews,
            parser.layout_preview_sources,
            parser.source_layout_diagrams,
            parser.source_layout_keys,
            parser.source_layout_encoders,
        )
        if story_contract != (
            0, 0, 0, [], [], 0, 0, 0, 0, 0, 0, [], [], [], [], [], 0
        ):
            errors.append(f"{path}: product story components leaked into another page")
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
    errors.extend(check_preview_data(project))
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
                            "data-key-grid-normalized": "true",
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
                                if path not in legend_paths and path.get("data-standard-legend-size") != "true"
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
        light_assets = {
            asset for asset in actual_assets if not asset.stem.endswith("-dark")
        }
        dark_assets = actual_assets - light_assets
        expected_dark_assets = {
            asset.with_name(f"{asset.stem}-dark.svg") for asset in declared_assets
        }
        if light_assets != declared_assets or dark_assets != expected_dark_assets:
            errors.append(
                f"{layout_assets}: expected {len(declared_assets)} declared light and "
                f"{len(expected_dark_assets)} derived dark SVG assets, found "
                f"{len(light_assets)} light and {len(dark_assets)} dark"
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
            product = {
                "k04/index.html": "k04",
                "phenom/index.html": "phenom",
                "macropad/index.html": "macropad",
            }.get(relative)
            errors.extend(check_page(path, language, domain, product))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(
        "HTML contract OK: 10 pages, paired locales, three immersive product "
        "stories, source-derived K:04/Macropad diagrams, and 56 "
        "reference-derived, geometry-normalized Phenom layout assets with "
        "matching dark-theme variants"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
