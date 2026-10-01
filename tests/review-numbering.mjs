import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('app/src/main/assets/ui/app.js','utf8');
const code=source.match(/  function reviewMovePrefix\(move\) \{[\s\S]*?\n  \}/)[0];
const prefix=vm.runInNewContext(code+'\nreviewMovePrefix');
for(const initialSide of [0,1])for(let index=1;index<=100;index++){
  const side=(index-1+initialSide)%2;
  const full=Math.floor((index-1+initialSide)/2)+1;
  assert.equal(prefix({index,side}),full+(side===0?'.':'…'));
}
assert.equal(prefix({index:1}),'1.');
assert.equal(prefix({index:2}),'1…');
console.log('Review numbering PASS: 202 assertions, including Black-first endgames');
