import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hashes=[];
for(const [name,duration,target] of [['move',240,.66],['move2',240,.66],['move3',240,.66],['capture',340,.66],['mistake',290,.42],['finish',400,.58]]) {
  const b=readFileSync(new URL('../app/src/main/assets/audio/'+name+'.wav',import.meta.url));
  assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');
  assert.equal(b.readUInt16LE(20),1);assert.equal(b.readUInt16LE(22),1);
  assert.equal(b.readUInt32LE(24),44100);assert.equal(b.readUInt16LE(34),16);
  assert.equal(b.readUInt32LE(40),b.length-44);assert.equal((b.length-44)/2/44100*1000,duration);
  const pcm=Array.from({length:(b.length-44)/2},(_,i)=>b.readInt16LE(44+i*2)/32767);
  const peak=Math.max(...pcm.map(Math.abs)),rms=Math.sqrt(pcm.reduce((s,x)=>s+x*x,0)/pcm.length);
  assert(Math.abs(peak-target)<.001);assert(peak<.8);assert(rms>.015 && rms<.3);
  assert.equal(pcm[0],0);assert(Math.abs(pcm.at(-1))<.001);
  hashes.push(createHash('sha256').update(b).digest('hex'));
  console.log(`${name}: ${duration}ms, peak=${peak.toFixed(3)}, RMS=${rms.toFixed(3)}, no clipped samples`);
}
assert.equal(new Set(hashes).size,6,'Feedback variants must be distinct');
assert(readFileSync(new URL('../app/src/main/assets/audio/KENNEY-LICENSE.txt',import.meta.url),'utf8').includes('CC0'));
console.log('PASS: six distinct PCM assets and packaged license (not a perceptual listening test)');
