// Offline wood foley processing. Source: Kenney Impact Sounds (CC0).
// FFMPEG=<ffmpeg executable> node scripts/generate-feedback.mjs
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const rate=44100, directory=new URL('../app/src/main/assets/audio/',import.meta.url);
mkdirSync(directory,{recursive:true});
function source(name) {
  const path=fileURLToPath(new URL('../third_party/kenney-impact-sounds/'+name+'.ogg',import.meta.url));
  const data=execFileSync(process.env.FFMPEG||'ffmpeg',['-v','error','-i',path,'-af','highpass=f=160,lowpass=f=6500','-ac','1','-ar',String(rate),'-f','f32le','pipe:1']);
  const pcm=Array.from({length:data.length/4},(_,i)=>data.readFloatLE(i*4));
  const peak=pcm.reduce((p,v)=>Math.max(p,Math.abs(v)),0);
  const start=Math.max(0,pcm.findIndex(v=>Math.abs(v)>peak*.025)-44);
  return pcm.slice(start).map(v=>v/peak);
}
const light=[0,1,2].map(i=>source('impactWood_light_00'+i)),solid=source('impactWood_medium_000');
const sounds={move:{duration:.24,hits:[[0,light[0],1]]},move2:{duration:.24,hits:[[0,light[1],1]]},move3:{duration:.24,hits:[[0,light[2],1]]},
  capture:{duration:.34,hits:[[0,light[1],.48],[.085,solid,.88]]},
  mistake:{duration:.29,hits:[[0,light[2],.6],[.10,light[0],.42]]},
  finish:{duration:.40,hits:[[0,solid,.65],[.15,light[1],.65]]}};
for(const [name,{duration,hits}] of Object.entries(sounds)){
  const count=Math.round(rate*duration),samples=new Float64Array(count);
  for(const [start,pcm,gain] of hits){
    const offset=Math.round(start*rate);
    for(let i=0;i<pcm.length&&i+offset<count;i++){
      const t=i/rate,fade=Math.min(1,t/.001)*Math.min(1,(count-i-offset)/(rate*.055));
      samples[i+offset]+=pcm[i]*gain*fade*Math.exp(-t/.14);
    }
  }
  const peak=Math.max(...samples.map(Math.abs)),target=name==='mistake'?.42:name==='finish'?.58:.66,wav=Buffer.alloc(44+count*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
  for(let n=0;n<count;n++)wav.writeInt16LE(Math.round(samples[n]/peak*target*32767),44+n*2);
  writeFileSync(new URL(name+'.wav',directory),wav);
  console.log(`${name}: ${Math.round(duration*1000)}ms, peak ${target}, CC0 wood impact`);
}
