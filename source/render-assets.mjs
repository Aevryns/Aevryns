import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const work=await mkdtemp(join(tmpdir(),'aevryns-profile-'));
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+pathname);
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const types={'.html':'text/html; charset=utf-8','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
const command=(file,args,quiet=false)=>new Promise((resolve,reject)=>{
 const child=spawn(file,args,{stdio:quiet?'ignore':'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(file+' exited with status '+code)));
});
let browser;
try{
 await command('ffmpeg',['-hide_banner','-loglevel','error','-version'],true);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 browser=await chromium.launch({executablePath:executable,headless:true,args:process.platform==='linux'?['--no-sandbox']:[]});
 for(const [asset,width,height,output,colors]of [['hero',1000,360,'aevryns-banner',192],['divider',1000,32,'stardust-divider',96],['star',40,40,'little-star',64]]){
  const dir=join(work,asset);await mkdir(dir);
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${port}/source/animation.html?capture=1&asset=${asset}`);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelector('.character').complete&&document.querySelector('.character').naturalWidth>0);
  // Opaque ivory makes the large GIF much smaller; the PNG still keeps rounded transparent corners.
  if(asset==='hero')await page.evaluate(()=>{document.documentElement.style.background='#fcfafc';document.body.style.background='#fcfafc';});
  for(let i=0;i<72;i++){await page.evaluate(time=>window.renderAt(time),i*6000/72);await page.screenshot({path:join(dir,String(i).padStart(3,'0')+'.png'),omitBackground:true});}
  if(asset==='hero'){await page.evaluate(()=>{window.renderAt(0);document.documentElement.style.background='transparent';document.body.style.background='transparent';});await page.screenshot({path:join(work,'aevryns-banner.png'),omitBackground:true});}
  await page.close();
  await command('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','12','-i',join(dir,'%03d.png'),'-filter_complex',`[0:v]split[a][b];[a]palettegen=max_colors=${colors}:reserve_transparent=1:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle:alpha_threshold=32`,'-loop','0',join(work,output+'.gif')]);
  process.stdout.write(`Rendered ${output}: 72 frames, 6 seconds\n`);
 }
 // Replace the public assets only after all render/encode steps succeed.
 for(const name of ['aevryns-banner.gif','aevryns-banner.png','stardust-divider.gif','little-star.gif'])await copyFile(join(work,name),join(root,'assets',name));
 process.stdout.write('Profile artwork updated in assets/.\n');
}finally{
 if(browser)await browser.close();
 if(server.listening)await new Promise(resolve=>server.close(resolve));
 await rm(work,{recursive:true,force:true});
}
