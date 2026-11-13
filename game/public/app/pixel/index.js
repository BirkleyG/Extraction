/* Pixel-art kit for Mineshaft Capital v2. Browser only (canvas 2D); import from /app/pixel/index.js.
 * view = { x, y, scale, w, h }: screen = (world - view.xy) * scale; surface at world y = 0, sky above, rock below.
 * See sprites.js (view convention, sprites) and scene.js (sky, landscape, strata, weather). */
export { pen, mkCv, outline, OUTLINE, ROLEC, personSprite, shipSprite, drawShip, oreSprite, drawOre, drawPile, crateSprite } from './sprites.js';
export { drawSky, drawLandscape, drawStrata, drawWeather, drawScene, groundColor, layerOfDepth, GROUND_H, LAYER_H } from './scene.js';
export { SPEC, DECOR, ridgeLayer } from './terrains.js';
