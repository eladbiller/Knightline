// Original, deterministic wood-like feedback. No external audio or runtime downloads.
import {mkdirSync,writeFileSync} from 'node:fs';
const rate=22050, directory=new URL('../app/src/main/assets/audio/',import.meta.url);
mkdirSync(directory,{recursive:true});
for(const [name,duration,pitch] of [['move',.09,390],['capture',.13,260],['mistake',.18,190],['finish',.28,520]]) {
  const count=Math.round(rate*duration), wav=Buffer.alloc(44+count*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
  let seed=71,previous=0;
  for(let n=0;n<count;n++) {
    const t=n/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    previous=.6*previous+.4*(seed/4294967296*2-1);
    const envelope=Math.min(1,t/.002)*Math.exp(-t/(duration/5))*(1-n/count);
    const tone=Math.sin(2*Math.PI*pitch*t)+.35*Math.sin(2*Math.PI*pitch*2.7*t);
    const sample=envelope*(.45*tone+.32*previous);
    wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*22000),44+n*2);
  }
  writeFileSync(new URL(name+'.wav',directory),wav);
}
