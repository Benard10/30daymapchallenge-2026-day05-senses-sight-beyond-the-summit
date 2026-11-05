# BEYOND THE SUMMIT

**Day 5 · Senses: Sight · #30DayMapChallenge 2026**

How far can you see from the roof of Africa?

[Open the live map](https://benard10.github.io/30daymapchallenge-2026-day05-senses-sight-beyond-the-summit/)

This interactive map explores the landscape potentially visible from Kilimanjaro's Uhuru Peak. A gold line points across East Africa. The terrain profile below follows that direction, showing the mountains and valleys between the observer and a selected place.

## What the app communicates

Being high up does not mean everything is visible. A nearby ridge can hide a distant valley, while the Earth's curve gradually hides lower ground farther away. Red highlights ground that the sampled terrain model leaves in view. Darker ground is hidden.

These are possible clear-weather views, not promises of what a visitor will see. Clouds, haze, vegetation, buildings and elevation errors can change the view. Named places are contextual points; a sampled ray may miss a narrow summit.

## Explore

1. Choose a direction using the slider, a landmark button or the map.
2. The opening view reaches 400 km, including Mount Kenya and the Aberdares. Change the distance from 10 to 1,000 km, or use either landmark shortcut to turn towards it.
3. Start or pause the sweep. Visible ground appears only as the beam passes each direction. The profile and selected point follow the beam automatically. Pause/resume retains progress; after a full turn, the scan stops. Choose **Scan again** to clear it and start fresh. Changing the distance or curvature also starts a fresh scan.
4. The **In view** panel lists labelled landmarks only after their direction has been scanned and the sampled terrain permits a sightline. Click an entry to inspect it. On smaller screens, expand the panel when needed. Click the map or profile to inspect any other point. The dashed sightline and explanation show whether closer terrain obstructs it.
5. Switch Earth's curve off to see how ignoring it changes the view. Leave it on for the main analysis.

Map keyboard controls: left/right arrows turn the direction; space starts or pauses the sweep. The help and data panels also work without the terrain having loaded.

## Run locally

From this repository folder:

```powershell
python -m http.server 5500 --bind 127.0.0.1
```

Open http://127.0.0.1:5500/ . If you serve the full challenge collection instead, use `/2026/day05-senses-sight/`. Reuse Live Server if it is already running on that port. Opening the HTML directly as a file will not load the data. No API key, package installation or build step is needed. All terrain assets are local; Google Fonts are optional.

## Data and method

Landscape heights come from **Mapzen / Tilezen Terrain Tiles**, hosted by AWS. Source tiles combine SRTM, GMTED2010 and ETOPO1. [Source registry](https://registry.opendata.aws/terrain-tiles/) · [Source documentation](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md) · [Attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

- Observer: −3.07583°, 37.35333°, near Uhuru Peak. Eye height: 2 m above the sampled elevation model (5,863.6 m), rather than adding the conventional 5,895 m to the terrain. The introductory summit height and model height are explained separately in the app.
- Source tiles: zoom 12 within 15 km (about 38 m per pixel), zoom 10 within 110 km (about 153 m), and zoom 8 farther away (about 611 m). Bilinear interpolation samples the terrain. Source transitions and coarse terrain can affect visibility.
- 1,440 bearings, 0.25° apart. Sample spacing: 30 m to 15 km, 250 m to 100 km, 500 m to 500 km, then 1 km to 1,000 km. Finer sampling does not improve the source resolution. Radial gaps widen with distance (about 2.2 km at 500 km and 4.4 km at 1,000 km).
- Every sample is compared to the maximum apparent elevation angle of nearer samples along its bearing. Curvature adjustment is `(1 − 0.13) × distance² / (2 × 6371000)`, with distances in metres. A fixed atmospheric refraction coefficient of 0.13 is an assumption, not a weather measurement. The flat comparison omits both corrections.
- Targets are ground/surface level. Negative source elevations are set to zero to represent sea surface. Lakes use source heights. No-data in preparation causes a failure rather than being silently treated as visible.
- The map uses a spherical azimuthal equidistant layout centred on the observer. Distances and directions from the summit are preserved; the map is north-up. Map and profile use the same samples and visibility flags. A shaded relief provides context; it is not the visibility calculation. Its geographic coverage extends 3,000 km west, 2,000 km east and 1,400 km north and south of the observer. This fills the landscape viewport with real regional terrain rather than stretching the image. Coarser zoom-6 tiles provide distant background context; the visibility calculation still uses zoom 8 or finer within its 1,000 km maximum range.
- The profile shows terrain heights above sea level on a linear, vertically exaggerated axis. The sightline is transformed into the same height reference, retaining curvature when enabled. This keeps actual hills and valleys readable at long range while preserving the terrain-to-sightline clearance used by the visibility calculation.
- This is an approximate radial visibility explorer, not a full-resolution geodesic viewshed, navigation tool or survey. Near-horizon results are sensitive to the source terrain and atmospheric assumptions.

`data/metadata.json` records all downloaded tile URLs, SHA-256 hashes, preparation time and the exact sample distances. `data/terrain.bin` contains little-endian signed 16-bit metre heights, ordered by bearing then distance. `relief.webp` is a local shaded terrain image; `countries.geojson` contains contextual boundaries.

To reproduce the data, run `scripts/prepare_terrain.py` from the collection workspace using Python, NumPy and Pillow. It currently reads the shared `.day04-tools` Python dependencies and Day 4 Natural Earth boundaries. Raw source tiles are cached in `.day05-cache` outside this app. The shipped app does not need those preparation inputs.

## Credits

Mapzen / Tilezen. SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data: U.S. National Oceanic and Atmospheric Administration. Natural Earth boundaries are public domain and illustrative only.

Built with HTML, CSS, Canvas 2D and a Web Worker. Visibility is calculated once in the worker for both curvature settings; the browser animates the prepared result.

## GitHub Pages deployment

The entry point is `index.html` at the repository root. In **Settings > Pages**, choose **Deploy from a branch**, then **main** and **/ (root)**. Keep `app.js`, `scan-state.js`, `visibility-worker.js`, `styles.css`, `icon.svg`, `.nojekyll` and the complete `data/` folder beside it. Uploading only the HTML file will not load the terrain or controls.

No build command, server backend, database or API key is required. GitHub Pages serves the HTML, JavaScript, worker and terrain files directly.

## Checks

With Node.js installed:

```powershell
node scripts/check_visibility.cjs
node scripts/check_controls.cjs
```

The checks cover Earth-curvature geometry, terrain visibility, scan coverage, profile sightline clearance and slider behaviour.
