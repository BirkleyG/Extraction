import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
test('one product lives at root with original scene and no competing game controls',()=>{
 const html=read('index.html');
 assert.match(html,/id="cv"/);assert.match(html,/id="tabs"/);assert.match(html,/src="\.\/play\/app\.js\?build=/);
 assert(!/http-equiv="refresh"/.test(html));
 for(const alternate of ['modeBtn','Legacy ↗','data-forward','pauseBtn'])assert(!html.includes(alternate));
});
test('historical entry URLs redirect to root and discard obsolete mode choices',()=>{
 for(const path of ['play/index.html','online/index.html','prototype/index.html']){
  const html=read(path);assert.match(html,/location\.replace/);assert.match(html,/q\.delete\('mode'\)/);assert(!html.includes('game.js'));assert(!html.includes('app.js'));
 }
});
