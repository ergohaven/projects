# Ergohaven landings design rules

## Design posture

The product is the primary visual object. Copy supports the photography instead of competing with it.

Use Teenage Engineering's image-led, editorial product presentation as a directional reference: large controlled photography, compact technical captions, generous whitespace, and a clear modular grid. Preserve Ergohaven's own identity through its typography, palette, language, and product-specific details; do not reproduce another brand's visual system.

## Page rhythm

Build each product landing as a sequence of visual chapters:

`Hero → Form → Modularity → Finger geometry → Connection and software → Materials → Specifications → CTA`

- Give each viewport one primary idea.
- Let photography occupy 70–85% of a desktop section, or use a full-bleed image when the composition supports it.
- Keep supporting copy in a narrow side column with a short heading and no more than two or three concise lines.
- Alternate the caption side between chapters to create rhythm without changing the underlying grid.
- Use section numbers, fine rules, and restrained technical labels where they clarify the story.
- Avoid repeating equal 50/50 panels, long editorial paragraphs, card grids, or decorative UI around the product.

## Core section types

1. **Immersive hero** — a full-viewport product image with only the essential identity, headline, and short descriptor.
2. **Media with side note** — one dominant image and one compact caption column, aligned left or right.
3. **Full-bleed detail** — a single close-up or profile image with a small edge caption.
4. **Detail sequence** — three or four related images only when they explain one shared idea.
5. **Software chapter** — a large interface image with a short explanation; feature lists remain secondary.
6. **Specification strip** — a compact, scannable data block near the end of the page.
7. **Closing frame** — a final product image with one clear action.

For Phenom, turn the current principles into visual chapters rather than text-led list items:

- overall form and sculpted architecture;
- modular arrangement and configuration freedom;
- keywell geometry shaped around the fingers.

Keep the approved product-specific chapter order intact:

- **K:04:** hero → series → modularity → wireless → layout → column stagger → Entropy → keycaps and switches → compact form → comfort options → specifications → CTA.
- **Macropad:** hero → use cases → IPS display → Entropy → default layout → angled design → keycaps and switches → compact form → specifications → CTA.

Until product photography is supplied for K:04 and Macropad, use labelled, localized media placeholders in the intended image positions. A placeholder must expose `role="img"` and a meaningful localized `aria-label`. Layout chapters are not photography placeholders: render their key geometry and default legends from checksum-pinned RMK/QMK sources, and do not invent missing controls.

## Typography and copy

- Use `Zen Kaku Gothic New` as the site type family.
- Keep headlines direct and compact. Do not use long explanatory headings.
- Keep side copy visually quiet, with enough weight for legibility but clearly subordinate to the image.
- Preserve intentional phrase grouping and line breaks when they carry meaning.
- Prefer concrete product language over marketing abstractions.

## Photography

Plan for six to eight purposeful images per product:

- hero or complete product view;
- three-quarter view;
- side profile;
- keywell or control close-up;
- modular or exploded arrangement;
- connector, cable, or hardware detail;
- additive-manufacturing surface detail;
- hands-on usage when it explains scale or ergonomics.

Keep lighting, background, crop logic, and color grading consistent within a landing. Every image must reveal a different property of the product; do not add photography only to fill space.

## Responsive behavior

- On mobile, place the image at full available width and move its caption directly below it.
- Do not preserve narrow desktop side columns on small screens.
- Keep complete sentences and meaningful phrase groups together where the viewport allows it.
- Avoid placing essential text over visually busy areas of an image.
- Keep the reading order identical in markup and visual presentation.

## Motion and interaction

- Use motion sparingly to reinforce hierarchy, never as scroll-jacking or a prerequisite for understanding the page.
- Prefer simple reveals and image transitions over elaborate parallax.
- Respect `prefers-reduced-motion`.
- Keep navigation and controls visually secondary to the product story.

## Image delivery and accessibility

- Continue generating responsive JPEG and WebP variants through Hugo.
- Reserve intrinsic image dimensions to prevent layout shift.
- Load the hero eagerly; lazy-load non-critical chapter images.
- Give every meaningful image localized alt text that describes the product property shown.
- Maintain readable contrast and keyboard-visible focus states in every theme.
