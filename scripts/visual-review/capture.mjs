/** Requires Playwright + installed Chromium. Run only where browser execution is permitted. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
let chromium;
try{({chromium}=await import('playwright'));}catch{throw Error('Playwright is not installed. Install the optional tooling with npm install --no-save playwright, then npx playwright install chromium.');}
const out=process.argv[2]??'artifacts/visual-review/current';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1536,height:960},deviceScaleFactor:1,reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(process.env.REVIEW_URL??'http://localhost:5173/miner-scene.html?composition=C&diagnostic=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.citadelDiagnostic?.ready,{},{timeout:120000});
 const first=await page.evaluate(()=>window.citadelDiagnostic.capture());
 const second=await page.evaluate(()=>window.citadelDiagnostic.capture());
 if(first.beauty!==second.beauty||first.semanticRaw!==second.semanticRaw||first.depthRaw!==second.depthRaw)throw Error('Capture not deterministic or rendering state was not restored');
 for(const name of ['beauty','semantic','semanticRaw','depth','depthRaw'])await writeFile(`${out}/${name}.png`,Buffer.from(first[name].split(',')[1],'base64'));
 await page.locator('#scene canvas').screenshot({path:`${out}/browser.png`,animations:'disabled'});
 const metadata={...first.metadata,capture:{tool:'Playwright Chromium',browserVersion:browser.version(),url:page.url(),capturedAt:new Date().toISOString(),deterministicRepeat:true,errors},beautySha256:createHash('sha256').update(Buffer.from(first.beauty.split(',')[1],'base64')).digest('hex')};
 await writeFile(`${out}/diagnostic.json`,JSON.stringify(metadata,null,2));
 if(errors.length)throw Error(`Browser reported errors; capture is not accepted: ${errors.join('\n')}`);
 console.log(`Captured ${out}. Run: python3 scripts/visual-review/compare.py --capture ${out}`);
}finally{await browser.close();}
