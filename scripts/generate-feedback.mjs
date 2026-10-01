// Original dry board-contact sounds. No copied recordings, CDN or runtime audio.
import {mkdirSync,writeFileSync} from 'node:fs';
const rate=44100, directory=new URL('../app/src/main/assets/audio/',import.meta.url);
mkdirSync(directory,{recursive:true});
const sounds={move:{duration:.09,hits:[[0,1,1]]},capture:{duration:.15,hits:[[0,.65,1.3],[.038,1,.8]]},
  mistake:{duration:.14,hits:[[0,.65,.65],[.046,.5,.6]]},finish:{duration:.27,hits:[[0,.7,.9],[.11,.85,1.15]]}};
for(const [name,{duration,hits}] of Object.entries(sounds)){
  const count=Math.round(rate*duration),samples=new Float64Array(count);
  for(const [start,gain,timbre] of hits){
    let seed=197+Math.round(start*1000),low=0;
    for(let n=Math.round(start*rate);n<count;n++){
      const t=Math.max(0,n/rate-start);seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/4294967296*2-1;low=.72*low+.28*noise;
      const attack=Math.min(1,t/.0004),tail=Math.min(1,(duration-n/rate)/.006);
      const transient=(noise-low)*.8*Math.exp(-t/.0027);
      const body=low*.85*Math.exp(-t/.014);
      const wood=[[510,.28,.009],[970,.2,.006],[1730,.13,.004],[2640,.08,.0025]]
        .reduce((sum,[hz,amp,decay])=>sum+amp*Math.sin(2*Math.PI*hz*timbre*t)*Math.exp(-t/decay),0);
      samples[n]+=gain*attack*tail*(transient+body+wood);
    }
  }
  const peak=Math.max(...samples.map(Math.abs)),wav=Buffer.alloc(44+count*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
  for(let n=0;n<count;n++)wav.writeInt16LE(Math.round(samples[n]/peak*.78*32767),44+n*2);
  writeFileSync(new URL(name+'.wav',directory),wav);
  console.log(`${name}: ${Math.round(duration*1000)}ms, peak 0.78, original synthesized board contact`);
}
