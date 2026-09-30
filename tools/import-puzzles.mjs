// Reproducible, bounded import from the CC0 Lichess puzzle database.
// Node 24+: pass a local archive (a bounded prefix is sufficient), downloaded
// from the URL below. Streams only until all five difficulty bands are full.
import {createZstdDecompress, constants} from 'node:zlib';
import {createReadStream, openSync, readSync, closeSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {writeFile, mkdir} from 'node:fs/promises';
const source = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const bands = [800,1200,1600,2000,2400,3001], groups = Array.from({length:5},()=>[]);
const motifOrder = ['defensiveMove','underPromotion','promotion','sacrifice','deflection','attraction','discoveredAttack','pin','skewer','fork','mateIn3','mateIn2','endgame'];
const counts = Array.from({length:5},()=>new Map());
function csv(line) { const cells=[];let cell='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){cells.push(cell);cell='';}else cell+=c;}cells.push(cell);return cells; }
if(!process.argv[2])throw Error('Usage: node tools/import-puzzles.mjs <lichess_db_puzzle.csv.zst or bounded prefix>');
let offset=0;
if(process.argv[2]) {
  const fd=openSync(process.argv[2],'r'),h=Buffer.alloc(8);
  while(readSync(fd,h,0,8,offset)===8 && (h.readUInt32LE(0)&0xfffffff0)===0x184d2a50)offset+=8+h.readUInt32LE(4);
  closeSync(fd);
}
const input=createReadStream(process.argv[2],{start:offset}), decoder=createZstdDecompress({params:{[constants.ZSTD_d_windowLogMax]:31}});
let failure;
input.on('error',e=>{if(e.name!=='AbortError')failure=e;});decoder.on('error',e=>{failure=e;});input.pipe(decoder);
const lines=createInterface({input:decoder,crlfDelay:Infinity});
let fields, scanned=0;
try {
  for await(const line of lines){
    if(!fields){fields=csv(line);continue;}
    if(++scanned>200000)throw Error('Quota not met within bounded scan');
    const p=Object.fromEntries(csv(line).map((v,i)=>[fields[i],v]));
    const rating=Number(p.Rating),band=bands.findIndex((v,i)=>i<5&&rating>=v&&rating<bands[i+1]);
    if(band<0||groups[band].length===50||Number(p.Popularity)<85||Number(p.NbPlays)<1000||Number(p.RatingDeviation)>90)continue;
    const moves=p.Moves.split(' '),themes=p.Themes.split(' ');
    if(moves.length<4||moves.length>10||moves.length%2||themes.includes('mateIn1'))continue;
    const motif=motifOrder.find(t=>themes.includes(t))||'calculation';
    if((counts[band].get(motif)||0)>=12)continue;
    counts[band].set(motif,(counts[band].get(motif)||0)+1);
    groups[band].push([p.PuzzleId,p.FEN,p.Moves,p.Rating,p.Themes,p.GameUrl]);
    if(groups.every(g=>g.length===50))break;
  }
} finally {lines.close();input.destroy();decoder.destroy();}
if(!groups.every(g=>g.length===50))throw Error('Incomplete pack after '+scanned+' rows: '+groups.map(g=>g.length)+' '+(failure?.message||''));
const entries=groups.flatMap(g=>g.sort((a,b)=>Number(a[3])-Number(b[3])));
await mkdir('app/src/main/assets/puzzles',{recursive:true});
await writeFile('app/src/main/assets/puzzles/lichess-pack.tsv',entries.map(r=>r.join('\t')).join('\n')+'\n');
console.log(JSON.stringify({source,scanned,count:entries.length,bands:groups.map((g,i)=>({from:bands[i],to:bands[i+1]-1,count:g.length,themes:Object.fromEntries(counts[i])}))},null,2));
