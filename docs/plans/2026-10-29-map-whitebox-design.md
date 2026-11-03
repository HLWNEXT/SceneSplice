# Map-based white-box input — design

## Goal
Let users search an address, see the surrounding buildings as a white-box 3D model, frame a camera view, and send that view to the decay workflow as an alternative to uploading a render.

## Decisions
- **Data source:** OpenStreetMap only (Nominatim geocoding, Overpass building footprints). No API keys.
- **Workflow input:** switchable. "Upload render" keeps today's behaviour. "Place on map" sends a white-box render as the input image and a depth map as a ControlNet guide.

## Flow
1. Source toggle in the sidebar: Upload render / Place on map.
2. Address search -> Nominatim -> lat/lon.
3. Overpass query (about 250 m radius) -> building footprints with `height` or `building:levels`. Fallback height 10 m (3 m per level when levels are known).
4. Footprints are projected to local meters and extruded into white boxes in three.js. The building at the address is highlighted.
5. User orbits/zooms to frame a view. On Simulate Decay the app captures a shaded white-box PNG and a depth PNG.
6. Workflow (map mode): FLUX Kontext converts the white-box render to a photoreal as-built view, then the decay prompt runs with a depth ControlNet. Upload mode bypasses the ControlNet.

## Components
- `app/api/geo/search` and `app/api/geo/buildings`: server routes that call Nominatim/Overpass with a user-agent and cache responses.
- `lib/geo.ts`: parse OSM JSON, project to meters, height fallback (pure, unit-tested on saved fixtures).
- `lib/whitebox.ts`: build the three.js scene, capture shaded and depth images.
- `components/map-picker.tsx`: address box and 3D view.
- `lib/comfy.ts`, `lib/workflow.ts`, `workflows/decay.api.json`: upload both images, add a depth-guide input and a mode flag.

## Errors
Geocoder returns nothing -> inline message. Overpass timeout or rate limit -> retry once, then message. No buildings in radius -> message with the option to widen the radius. ControlNet model missing on the server -> surfaced by the existing workflow-rejection error.

## Testing
Unit tests for OSM parsing, projection and height fallback using fixtures, and for workflow injection in both modes. Manual check of the 3D view in a browser.

## Out of scope
Importing a proposed building model, street-level walking camera, non-OSM data sources.
