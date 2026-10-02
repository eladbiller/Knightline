import http from 'http';

function getWsUrl(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(p => p.type === 'page');
          if (page && page.webSocketDebuggerUrl) resolve(page.webSocketDebuggerUrl);
          else reject(new Error(`No page target on port ${port}`));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDP {
  pending = new Map(); id = 0;
  async open(url) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', ({data}) => {
      const msg = JSON.parse(data);
      const request = this.pending.get(msg.id);
      if (!request) return;
      this.pending.delete(msg.id);
      if (msg.error) request.reject(new Error(JSON.stringify(msg.error)));
      else request.resolve(msg.result);
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, {once: true});
      this.ws.addEventListener('error', reject, {once: true});
    });
  }
  call(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, {resolve, reject, timeout: setTimeout(() => reject(new Error('timeout')), 5000)});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  close() { this.ws.close(); }
}

async function run() {
  console.log("Starting Step 2 Rebranding & Orientation Test...");
  const wsUrl = await getWsUrl(9225);
  const cdp = new CDP();
  await cdp.open(wsUrl);

  // 1. Check document.title
  const title = await cdp.evaluate("document.title");
  console.log("Document Title:", title);
  if (title !== "Knightline") {
    throw new Error(`Expected title 'Knightline', got '${title}'`);
  }

  // 2. Check for any stale "Knightline Preview" text in the DOM
  const hasPreview = await cdp.evaluate("document.body.innerHTML.includes('Knightline Preview')");
  console.log("DOM contains 'Knightline Preview':", hasPreview);
  if (hasPreview) {
    throw new Error("DOM still contains stale 'Knightline Preview' branding!");
  }

  // 3. Check responsive landscape layout emulation
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 800,
    height: 400,
    deviceScaleFactor: 2,
    mobile: true,
    screenOrientation: { angle: 90, type: 'landscapePrimary' }
  });

  const bodyWidth = await cdp.evaluate("document.body.clientWidth");
  console.log("Emulated landscape width:", bodyWidth);
  if (bodyWidth < 700) {
    throw new Error(`Expected landscape width >= 700, got ${bodyWidth}`);
  }

  // Reset emulation
  await cdp.call('Emulation.clearDeviceMetricsOverride', {});

  console.log("Specific Test 1 (Rebranding & Orientation): PASSED");
  cdp.close();
  process.exit(0);
}

run().catch(err => {
  console.error("Test Failed:", err);
  process.exit(1);
});
