# Bug solutions

Record of root cause and fix. Check this file before changing the same behavior again. The narrative journal for the same pass is `HANDOFF.md` section 5.

## Silhouettes hid true size

**Symptom.** The two country icons in the comparison hero were the same box size for every nation.

**Root cause.** `CountryMiniSilhouette` used `geoMercator().fitExtent`, which scales each feature to fill the icon.

**Fix.** Draw with `geoEqualEarth`. When both countries are on screen, use the smaller of the two fit scales so the larger country fills the icon and the smaller one stays in proportion. The Mercator mythbuster uses that outline, scaled by the linear Mercator ratio versus home latitude.

**Files.** `src/components/ComparisonPanel.tsx`

## Radar and bars overstated small values

**Symptom.** A much smaller country still occupied a visible wedge on the radar. Coastlines of 0 km still drew a bar. HDI values near each other looked like a near-even split.

**Root cause.** Radar ratios were clamped with `Math.max(0.15, ...)`. Share bars were clamped to 8–92%. The coastline row added 100 km before measuring the split. HDI and life expectancy were drawn as a share of the two numbers added together.

**Fix.** Plot the raw ratio. Remove the 8–92 clamp. Draw HDI against 1, and life expectancy and forest cover against 100, as separate bars. Remove the coastline offset.

**Files.** `src/components/ComparisonPanel.tsx`

## Unresearched countries showed invented vital statistics

**Symptom.** Countries outside the hand-written list displayed precise GDP, HDI, peaks, currency, and exports.

**Root cause.** `buildFallbackStats` hashed those fields so every polygon had a full `CountryStats` object, and every view treated that object as researched. Choropleth, terrain tint, and night-capital glow consumed the same fields.

**Fix.** Set `dataQuality: 'estimated'` on fallback profiles. Keep spherical `areaKm2`. Show "Estimated" in the panel, poster, and share text for every other vital. Hide density and GDP swaps, and the cost-of-living result, unless both countries are curated. Choropleth paints estimated countries neutral except for the Land Area metric. Skip estimated countries in the per-country terrain peak wash and the per-country night capital glow. Leave the authored mountain ranges and city clusters in place.

**Files.** `src/data/countryDatabase.ts`, `src/utils/sphericalMath.ts`, `src/utils/globeTextures.ts`, `src/components/ComparisonPanel.tsx`, `src/components/SharePosterModal.tsx`, `src/App.tsx`

## Nomad bearing was the compass twist

**Symptom.** The cell labeled Bearing showed `90° Rotated` after the overlay was turned 90°, including when the country had not moved.

**Root cause.** The cell rendered `rotationDeg`.

**Fix.** `initialBearingDeg` is the initial great-circle bearing from the dragged country's home centroid to the current target. The overlay twist stays on the compass slider and is named in the caption.

**Check.** From `(0,0)` the bearing to `(0,10)`, `(10,0)`, `(0,-10)`, and `(-10,0)` is 0°, 90°, 180°, and 270°.

**Files.** `src/utils/sphericalMath.ts`, `src/components/ComparisonPanel.tsx`

## Quiz score could exceed the number of questions

**Symptom.** After the last question, Next returned to question 1 and the score kept rising past "N / N".

**Root cause.** The advance handler used modulo and cleared the selected option, then the answer handler incremented `quizScore` again.

**Fix.** Store one pick per question. Derive the score from those picks. The last card restarts the round instead of wrapping.

**Files.** `src/components/ComparisonPanel.tsx`

## Space, graticule, second country, and the phone dock

**Symptom.** The keyboard comment promised Space toggles orbit, and it did not. `showGraticule` had no control. The 2nd button always chose Japan or the United Kingdom. Below `md`, the country dock was `hidden`, so a phone could not change country.

**Root cause.** The key handler only implemented R and Escape. The graticule flag was never written from the UI. The 2nd button toggled a hard-coded id. The dock used `hidden md:flex` with no other entry.

**Fix.** Space toggles `autoRotate` unless focus is in a field, button, or link. Escape closes the pickers and the share sheet even when the search field is focused. G and a Grid button toggle `showGraticule`. The 2nd button opens a search of countries other than the one being dragged. A Countries button, visible only below `md`, opens the same left dock.

**Files.** `src/App.tsx`
