import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const adbPath = process.env.ADB || 'adb';
const serials = ['10ACAD2F63001KS', 'TS55QC9PIRCY4XH6'];

function clickAllow(serial) {
  try {
    const dumpPath = `/sdcard/wdump_${serial}.xml`;
    const localPath = `wdump_${serial}.xml`;
    execFileSync(adbPath, ['-s', serial, 'shell', 'uiautomator', 'dump', dumpPath], {encoding: 'utf8', stdio: 'ignore'});
    execFileSync(adbPath, ['-s', serial, 'pull', dumpPath, localPath], {encoding: 'utf8', stdio: 'ignore'});
    const xml = fs.readFileSync(localPath, 'utf8');
    
    let clicked = false;
    const textsToClick = ['Allow', 'Turn on', 'Pair', 'Yes', 'Accept', 'PAIR', 'ALLOW'];
    for (const text of textsToClick) {
      const regex = new RegExp(`text="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
      const match = xml.match(regex);
      if (match) {
        const x = Math.floor((parseInt(match[1]) + parseInt(match[3])) / 2);
        const y = Math.floor((parseInt(match[2]) + parseInt(match[4])) / 2);
        execFileSync(adbPath, ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], {encoding: 'utf8'});
        console.log(`[${serial}] Clicked "${text}" at ${x},${y}`);
        clicked = true;
      }
    }
    
    if (xml.includes('Pair') || xml.includes('Bluetooth')) {
        console.log(`[${serial}] Dialog detected on screen.`);
    }
    return clicked;
  } catch(e) {}
  return false;
}

async function loop() {
  console.log("Starting Auto-Allow for Bluetooth Dialogs...");
  while (true) {
    for (const serial of serials) {
      clickAllow(serial);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}
loop();
