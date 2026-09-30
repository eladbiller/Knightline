import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('app/src/main/assets/ui/app.js','utf8');
const functionSource=source.slice(source.indexOf('  function evaluationMeter('),source.indexOf('  function materialBalance('));
const meter=vm.runInNewContext(functionSource+';evaluationMeter');
let checks=0;
for(const score of ['+0.00','+3.04','-3.04','#3','#-3','M3','−M3','…','—']){
  const values=[];
  for(const side of [0,1]){
    const html=meter({evaluation:score},side), y=Number(html.match(/y="([\d.]+)"/)[1]), h=Number(html.match(/height="([\d.]+)"/)[1]);
    assert(html.includes('data-top-side="'+(side===1?'white':'black')+'"'));checks++;
    assert(Math.abs(y-(side===1?0:100-h))<.11);checks++;
    assert(h>=4&&h<=96);checks++;values.push(h);
    if(score==='+3.04'||score==='M3'||score==='#3'){assert(h>50);checks++;}
    if(score==='-3.04'||score==='−M3'||score==='#-3'){assert(h<50);checks++;}
  }
  assert.equal(values[0],values[1],'Orientation reversed score meaning');checks++;
}
console.log('Evaluation orientation PASS: '+checks+' assertions');
