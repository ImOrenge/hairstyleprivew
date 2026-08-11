# HairFit workflow and criteria image prompts

- generated: `2026-08-09`, continuity pass `2026-08-11`
- mode: OpenAI built-in `image_gen`
- use case: `infographic-diagram`
- correction mode: `identity-preserve`
- source format: 1536×1024 PNG
- delivery format: 1536×1024 WebP, quality 86
- shared constraints: one physical Korean subject, photorealistic skin and hair, restrained warm-gold guides, no mirror, no reflection, no printed photo cards, no readable generated text, no logo, no watermark

## Workflow

### `workflow-upload-same-person-tablet.webp`

Photorealistic Korean lifestyle scene of one woman using an unbranded landscape tablet at a warm-neutral table. Over-the-shoulder framing with the tablet as the focal point. The holder and the front-facing tablet portrait must be the exact same physical woman: identical low black ponytail, center part with loose strands, cream ribbed knit sweater, skin tone, age, and facial proportions. Preserve the crop corners and simple gold confirmation icon. No different model, loose long hair, black clothing, physical photo, mirror, phone, laptop, text, or extra person.

### `workflow-choice-tablet.webp`

Photorealistic over-the-shoulder scene of one man comparing hairstyle candidates on an unbranded landscape tablet. The screen contains a clear 3×3 grid of nine hairstyles on the same model, with one option marked by a muted-gold selection ring. No printed cards, mirror, floating UI, text, or extra person.

### `workflow-choice-same-person-v2.webp`

Continue directly from `workflow-upload-same-person-tablet.webp`: the exact same Korean woman, low black ponytail, cream ribbed knit sweater, warm-neutral room, table, and unbranded landscape tablet. Show nine believable hairstyles on her own face inside a clear 3×3 tablet grid, with one restrained gold selection ring. The physical woman and every screen candidate must preserve the same facial proportions and age. No mirror, printed card, extra person, readable text, logo, or wardrobe change.

### `workflow-save-coherent-fashion-tablet.webp`

Photorealistic close over-the-shoulder scene of one woman confirming a final choice on a tablet. Replace the detached portrait and floating garment collage with one anatomically continuous, full-body Korean woman naturally wearing a cream tailored blouse, charcoal wide-leg trousers, and black loafers with the selected long layered hairstyle attached to her head. Keep only three understated color swatches, a small gold check, and one confirmation button as secondary UI. No isolated garments, handbag or shoe cutouts, mannequin, mirror, text, logo, or extra person.

### `workflow-save-same-person-v2.webp`

Continue from the previous two workflow scenes with the exact same woman, ponytail, cream knit, room, table, and tablet. The tablet shows one anatomically continuous full-body preview of that same woman wearing the selected layered hairstyle, charcoal tailored suit, and black shoes, plus only a restrained confirmation mark. No detached face, garment collage, mirror, reflection, extra person, or identity drift.

## Analysis criteria

### `criteria-face-shape-landmark-system.webp`

Front-facing head-and-shoulders portrait of one Korean woman on a warm-gray studio background. Replace the generic grid with a segmented center axis, anatomically aligned landmark dots, short end-capped width brackets at the hairline, temples, cheekbones, jaw angles and chin, one precise face-contour curve, and diagonal cheek-to-chin ratio connectors. Use two warm-gold line weights and solid/dashed rhythm without text.

### `criteria-head-balance-metrics.webp`

Three-quarter portrait of one Korean man with an accurate forehead-to-crown-to-nape silhouette, two nested crown-volume arcs, a crown-height ruler, parietal and temple width brackets, an ear reference, an occipital projection curve, landmark dots, and short normal ticks. Every line follows his actual head and hair volume; no text.

### `criteria-length-measurement-system.webp`

Front-facing bust portrait of one Korean woman with natural medium-long hair. Replace full-width lines with curved jaw, shoulder and collarbone contours, short end-capped brackets, a side ruler with minor ticks, double-ended arrows between length zones, dotted projections from both hair ends, paired anatomical landmarks, and a subtle hair-end balance arc. No text.

### `criteria-style-mood-guides.webp`

Three-quarter portrait of one Korean man with softly textured medium hair. Overlay thin warm-gold curved arrows that follow fringe direction, side volume, and crown flow plus one clean outer hairstyle silhouette.

### `criteria-style-mood-triptych-v2.webp`

Photorealistic three-panel studio comparison of the exact same Korean man in the same black jacket and neutral background. Present clean, soft, and trendy styling moods with clearly different fringe direction, side volume, crown texture, and silhouette. Add distinct restrained warm-gold contour paths, flow arrows, landmark dots, and small abstract mood glyphs to each panel. No readable text, generic repeated grid, face replacement, or clothing change.

## Copy-matched proof images

- `review-compare-tablet-v2.webp`: one woman compares three hairstyle candidates of herself on a tablet without a mirror, reflection, or printed photo strip.
- `feature-occasion-tablet-v2.webp`: one man compares everyday, work, and date looks of himself on a tablet while standing beside a real wardrobe.
- `review-salon-tablet-v2.webp`: a seated client and one designer review three hairstyle candidates of that same client on a tablet.
- `review-fashion-tablet-v2.webp`: one man compares his chosen hair-to-fashion transition on a tablet while holding the matching navy jacket.
- `pricing-plan-comparison-v2.webp`: one man presents three visually distinct plan-depth columns on a tablet without generated readable text.
- `faq-photo-self-capture-v2.webp`: one man prepares a front-facing photo with a phone tripod.
- `faq-preview-board-v2.webp`: the same man compares a 3×3 hairstyle board on a tablet.
- `faq-salon-use-v2.webp`: the same man reviews his candidates with one stylist in a salon chair.
- `faq-fashion-flow-v2.webp`: the same man sees his selected hair continue into one coherent full-body fashion preview.

## Preview identity sets

- `hero/demo/grid/female-v2-01.webp`–`female-v2-09.webp`: one female origin identity, consistent black top and warm studio background, nine hair lengths and textures.
- `hero/demo/grid/male-v2-01.webp`–`male-v2-09.webp`: one male origin identity, consistent black top and warm studio background, nine hair lengths and textures.
- `hero/fashion-demo/*-v2.webp`: male and female short, medium, and long hairstyle selections extended into six separate full-body outfits while retaining each gender's origin identity.

## Validation notes

- 36 newly referenced continuity assets are unique by SHA-256; duplicate count is zero.
- Editorial assets are 1536×1024, hairstyle cells are 418×418, and fashion portraits are 1024×1536.
- Center `object-fit: cover` simulations use 3:2 for editorial and review media; portrait fashion previews retain their dedicated tall ratio. The primary face, tablet, hairstyle comparison, and full-body silhouette remain visible.

## Salon consultation

### `salon-consultation-tablet-chair.webp`

Photorealistic premium Korean salon scene with exactly one client seated in a professional black salon chair under a neutral-gray cutting cape and one hair designer standing beside her. The designer holds one landscape tablet at the client's eye level and explains a believable HairFit interface containing three hairstyle candidates of the same client, one selected state, one coherent full-body fashion mood preview, and three neutral color swatches. No printed photos, paper lookbook, mirror, reflection, duplicate person, readable text, logo, or watermark.
