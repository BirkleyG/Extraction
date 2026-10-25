/* Pixel sprite + draw helpers lifted verbatim from the original Mineshaft Capital renderer (js/game.js) so the new game draws with the same sprites. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
function hash(s){let h=2166136261>>>0;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=(seed>>>0)||1;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function ease(t){return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2}
const PXC={buf:null,g:null,bw:0,bh:0,ps:2,s:1,ox:0,oy:0,labels:[]};
const OUTLINE='#140c1c';
function setView(cx,cy,s){PXC.s=s;PXC.ox=Math.round(PXC.bw/2-cx*s);PXC.oy=Math.round(PXC.bh/2-cy*s)}
function bx(x){return Math.round(x*PXC.s+PXC.ox)}function by(y){return Math.round(y*PXC.s+PXC.oy)}
function pR(x,y,w,h,col){const x0=bx(x),y0=by(y),x1=bx(x+w),y1=by(y+h);PXC.g.fillStyle=col;PXC.g.fillRect(x0,y0,Math.max(1,x1-x0),Math.max(1,y1-y0))}
function pB(x,y,w,h,col,g){g=g||PXC.g;g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)))}
function pL(x0,y0,x1,y1,col,w){const g=PXC.g;g.fillStyle=col;const s=PXC.s;const X0=x0*s+PXC.ox,Y0=y0*s+PXC.oy,X1=x1*s+PXC.ox,Y1=y1*s+PXC.oy;const n=Math.max(1,Math.ceil(Math.max(Math.abs(X1-X0),Math.abs(Y1-Y0))));const ww=Math.max(1,Math.round(w||1));for(let i=0;i<=n;i++){const t=i/n;g.fillRect(Math.round(X0+(X1-X0)*t-ww/2),Math.round(Y0+(Y1-Y0)*t-ww/2),ww,ww)}}
function pD(x,y,r,col,g,screen){g=g||PXC.g;g.fillStyle=col;const cx=screen?x:x*PXC.s+PXC.ox,cy=screen?y:y*PXC.s+PXC.oy,rr=Math.max(0.6,screen?r:r*PXC.s);const R0=Math.ceil(rr);for(let dy=-R0;dy<=R0;dy++){const q=rr*rr-dy*dy;if(q<0)continue;const hw=Math.floor(Math.sqrt(q));g.fillRect(Math.round(cx-hw),Math.round(cy+dy),hw*2+1,1)}}
function pS(img,x,y,ax,ay,flip,k,alpha){if(!img)return;const s=PXC.s*(k||1);const w=Math.max(1,Math.round(img.width*s)),h=Math.max(1,Math.round(img.height*s));const X=Math.round(x*PXC.s+PXC.ox),Y=Math.round(y*PXC.s+PXC.oy);const g=PXC.g;if(alpha!=null)g.globalAlpha=alpha;
  if(flip){g.save();g.translate(X,Y);g.scale(-1,1);g.drawImage(img,-Math.round(ax*s),-Math.round(ay*s),w,h);g.restore()}else g.drawImage(img,X-Math.round(ax*s),Y-Math.round(ay*s),w,h);if(alpha!=null)g.globalAlpha=1}
const SPRC=new Map();
function mkCv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');return [c,g]}
function outline(cv,col){const g=cv.getContext('2d');const w=cv.width,h=cv.height;const id=g.getImageData(0,0,w,h);const d=id.data;const out=new Uint8ClampedArray(d);const n=parseInt((col||OUTLINE).slice(1),16);
  const op=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&d[(y*w+x)*4+3]>40;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(d[i+3]>40)continue;if(op(x-1,y)||op(x+1,y)||op(x,y-1)||op(x,y+1)){out[i]=n>>16;out[i+1]=n>>8&255;out[i+2]=n&255;out[i+3]=255}}
  id.data.set(out);g.putImageData(id,0,0);return cv}
function hexMix(a,b,t){const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16);const r=Math.round((A>>16)*(1-t)+(B>>16)*t),g=Math.round((A>>8&255)*(1-t)+(B>>8&255)*t),bl=Math.round((A&255)*(1-t)+(B&255)*t);return '#'+((1<<24)|(r<<16)|(g<<8)|bl).toString(16).slice(1)}
function sh(h,a){const n=parseInt(h.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;if(a<0){r*=1+a;g*=1+a;b*=1+a}else{r+=(255-r)*a;g+=(255-g)*a;b+=(255-b)*a}return '#'+((1<<24)|((r|0)<<16)|((g|0)<<8)|(b|0)).toString(16).slice(1)}
const ROLEC={miner:{body:'#e0702a',pants:'#3a2c4a',hat:'#ffd23f'},porter:{body:'#3f86c8',pants:'#2a2a3a',hat:'#1f4f80'},soldier:{body:'#5a7a34',pants:'#2f3a20',hat:'#3b4f24'},grenadier:{body:'#7a7a2a',pants:'#33331a',hat:'#4a4a1c'},
  brute:{body:'#a04a2a',pants:'#3a1f1f',hat:'#d03030'},politician:{body:'#2c2c38',pants:'#1a1a22',hat:'#111118'},envoy:{body:'#c85a9a',pants:'#3a2440',hat:'#ff9fd0'},warrior:{body:'#7a4a2a',pants:'#3a2416',hat:null},robot:{body:'#8a96a8',pants:'#4a5262',hat:null}};
const TOOLCOL=['#cfd6e0','#cfd6e0','#9aa7b8','#ff5ec4','#7ad1ff','#ffd23f'];
function personSprite(o){const key='p|'+[o.skin,o.head,o.role,o.pose,o.frame,o.tier||0,o.load||'',o.tc||'',o.z?1:0,o.robot?1:0,o.accent||''].join('|');let cv=SPRC.get(key);if(cv)return cv;
  const [c,g]=mkCv(24,27);const P1=(x,y,col)=>{g.fillStyle=col;g.fillRect(x,y,1,1)};const B=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x,y,w,h)};
  const rc=ROLEC[o.robot?'robot':o.role]||ROLEC.miner;const body=o.role==='warrior'&&o.tc?o.tc:rc.body;const pants=rc.pants;const skin=o.z?'#7bd95a':o.robot?'#c0c8d4':(o.skin||'#f2c9a5');const dk=sh(body,-0.32),lt=sh(body,0.22);const shoe='#1d1424';
  const brute=o.role==='brute';const f=o.frame||0;
  // legs (feet on row 24)
  const leg=(x,top,w)=>{B(x,top,w||2,25-top,pants);B(x,24,w||2,1,shoe)};
  if(o.pose==='climb'){if(f%2){leg(8,20);leg(12,22)}else{leg(8,22);leg(12,20)}}
  else if(brute){if(f===1){leg(6,20,3);leg(13,20,3)}else if(f===2){leg(8,20,3);leg(11,20,3)}else{leg(7,20,3);leg(12,20,3)}}
  else{if(f===1){leg(7,20);leg(13,20)}else if(f===2){leg(9,20);leg(11,20)}else{leg(8,20);leg(12,20)}}
  // torso
  if(brute){B(6,13,10,7,body);B(15,14,1,6,dk);B(5,14,1,4,body);B(16,14,1,4,body);B(6,18,10,1,'#2a1f18')}
  else{B(8,14,6,6,body);B(13,14,1,6,dk);B(8,18,6,1,'#2a1f18');P1(10,18,'#d9b860')}
  if(o.role==='porter'){B(10,14,1,4,lt)}if(o.role==='soldier'||o.role==='grenadier'){P1(9,15,dk);P1(11,16,dk);P1(12,15,lt)}
  if(o.role==='politician'){B(10,14,2,4,'#f0f0f0');B(10,15,1,3,'#c42a2a')}
  if(o.robot){B(9,15,3,2,'#4ad0ff')}if(o.role==='envoy'){P1(8,14,o.accent||'#fff');P1(9,15,o.accent||'#fff');P1(10,16,o.accent||'#fff');P1(11,17,o.accent||'#fff')}
  if(o.role==='warrior'){B(8,16,6,1,'#f2ead8')}if(o.z){P1(9,16,'#3a2a2a');P1(12,15,'#3a2a2a');P1(8,19,'#3a2a2a')}
  // head (rows 9-13)
  const hd=o.robot?'visor':(o.head||'dome');const hx=brute?9:8;
  if(hd==='visor'){B(hx,9,5,5,o.robot?'#c0c8d4':skin);B(hx+1,11,4,1,'#4ad0ff');P1(hx+2,7,'#9aa7b8');P1(hx+2,8,'#9aa7b8');P1(hx+2,6,'#ff5a6e')}
  else{if(hd==='tall'){B(hx+1,6,3,3,skin)}B(hx+1,9,3,1,skin);B(hx,10,5,4,skin);
    if(hd==='cyclops'){B(hx+2,10,2,2,'#ffffff');P1(hx+3,11,'#111')}else{P1(hx+3,11,o.z?'#ff3030':'#1a1022');P1(hx+4,12,sh(skin,-0.25))}
    if(hd==='antenna'){P1(hx+2,8,sh(skin,-0.2));P1(hx+2,7,sh(skin,-0.2));P1(hx+2,6,o.accent||'#ff8a3d')}
    if(hd==='horn'){const bone='#f2ead8';P1(hx-1,9,bone);P1(hx-1,8,bone);P1(hx-2,7,bone);P1(hx+5,9,bone);P1(hx+5,8,bone);P1(hx+6,7,bone)}
    if(hd==='tentacle'){const t2=sh(skin,-0.25);P1(hx+1,14,t2);P1(hx+1,15,t2);P1(hx+3,14,t2);P1(hx+3,15,t2)}}
  // hats
  const hat=rc.hat;
  if(!o.robot&&o.pose!=='carry'){
    if(o.role==='miner'){B(hx-1,9,7,1,hat);B(hx,8,5,1,hat);B(hx+1,7,3,1,hat);P1(hx+5,9,'#fff6c2')}
    else if(o.role==='porter'){B(hx,8,5,2,hat);P1(hx+5,9,hat);P1(hx+6,9,hat)}
    else if(o.role==='soldier'){B(hx-1,9,7,1,hat);B(hx,8,5,1,hat);B(hx+1,7,3,1,sh(hat,0.15))}
    else if(o.role==='grenadier'){B(hx-1,9,7,1,hat);B(hx,8,5,1,hat);B(hx+2,11,3,1,'#ff8a3d')}
    else if(o.role==='politician'){B(hx+1,4,3,5,hat);B(hx-1,8,7,1,hat);B(hx+1,7,3,1,'#c42a2a')}
    else if(o.role==='envoy'){B(hx,8,5,1,hat);P1(hx+5,7,'#fff');P1(hx+6,6,'#fff');P1(hx+6,5,'#fff')}
    else if(o.role==='brute'){B(hx,10,5,1,hat);P1(hx-1,10,hat);P1(hx-1,11,hat)}
    else if(o.role==='warrior'){B(hx+2,7,1,2,o.tc||'#ff8a3d');B(hx+1,6,1,2,o.tc||'#ff8a3d');P1(hx+1,12,'#f2ead8')}}
  // arms + items (facing right)
  const tc=TOOLCOL[o.tier||1]||TOOLCOL[1];const wood='#8a5a3c';const ax=brute?15:13;
  const arm=(pts)=>{for(const [x,y] of pts)P1(x,y,body)};const hand=(x,y)=>P1(x,y,skin);
  switch(o.pose){
    case 'swing':{if(f===0){arm([[ax,14],[ax,13],[ax+1,12],[ax+1,11]]);hand(ax+1,10);P1(ax+1,9,wood);P1(ax,8,wood);P1(ax,7,wood);B(ax-3,6,7,1,tc);P1(ax-3,7,tc);P1(ax+3,7,tc)}
      else if(f===1){arm([[ax,15],[ax+1,15],[ax+2,15]]);hand(ax+3,15);B(ax+4,15,3,1,wood);B(ax+7,13,1,5,tc);P1(ax+8,13,tc)}
      else{arm([[ax,15],[ax+1,16],[ax+2,17]]);hand(ax+3,18);P1(ax+4,19,wood);P1(ax+5,20,wood);B(ax+4,21,4,1,tc);P1(ax+7,20,tc)}
      if(o.tier>=2&&f!==0){P1(ax+8,16,sh(tc,0.3))}break}
    case 'carry':{arm([[8,13],[8,12],[8,11],[ax,13],[ax,12],[ax,11]]);B(7,4,8,6,'#7a5230');B(7,6,8,2,o.load||'#c9a36b');B(7,4,8,1,'#9a7046');P1(7,9,'#5a3a20');P1(14,9,'#5a3a20');break}
    case 'shovel':{if(f===0){arm([[ax,15],[ax+1,16]]);hand(ax+2,17);P1(ax+3,18,wood);P1(ax+4,19,wood);B(ax+4,20,3,2,'#9aa7b8');P1(ax+5,20,o.load||'#c9a36b')}
      else{arm([[ax,14],[ax+1,13]]);hand(ax+2,12);P1(ax+3,11,wood);P1(ax+4,10,wood);B(ax+4,8,3,2,'#9aa7b8');P1(ax+5,8,o.load||'#c9a36b')}break}
    case 'gun':case 'gunfire':{arm([[ax,15],[ax+1,15]]);hand(ax+2,15);const T=o.tier||1;
      if(T<=1){for(let i=0;i<7;i++)P1(ax+2+i,15-Math.floor(i/2),'#c9a36b');P1(ax+9,11,'#e8e8f0');P1(ax+9,12,'#e8e8f0')}
      else if(T===2){B(ax+2,14,6,1,'#2b2b33');B(ax+1,15,2,2,wood)}
      else if(T===3){B(ax+2,13,5,3,'#2b2b33');B(ax+7,13,1,3,'#ff8a3d')}
      else if(T===4){B(ax+2,14,6,1,'#ff3d7f');P1(ax+8,14,'#ffffff');P1(ax+3,13,'#ffb0cc')}
      else{for(let i=0;i<7;i++)P1(ax+2+i,15-Math.floor(i/2),'#ffd23f');P1(ax+9,10,'#ffd23f');P1(ax+10,11,'#ffd23f');P1(ax+9,12,'#ffd23f')}
      if(o.pose==='gunfire'){B(ax+9,13,2,3,'#ffe066');P1(ax+11,14,'#fff6c2')}break}
    case 'grenade':{arm([[ax,14],[ax+1,13],[ax+1,12]]);hand(ax+1,11);B(ax+1,9,2,2,'#3a5a24');P1(ax+2,8,'#9aa7b8');break}
    case 'spear':{arm([[ax,15],[ax+1,15]]);hand(ax+2,15);for(let i=0;i<11;i++)P1(ax-3+i,20-i,'#c9a36b');P1(ax+8,9,'#e8e8f0');P1(ax+9,8,'#e8e8f0');break}
    case 'cheer':case 'climb':{arm([[8,13],[7,12],[7,11],[ax,13],[ax+1,12],[ax+1,11]]);hand(7,10);hand(ax+1,10);break}
    case 'speech':{arm([[ax,14],[ax+1,13],[ax+1,12]]);hand(ax+1,11);break}
    case 'fight':{arm([[ax,15],[ax+1,15],[ax+2,15]]);B(ax+3,14,2,2,skin);break}
    case 'flag':{B(6,3,1,17,wood);B(7,3,5,4,o.accent||'#ff9fd0');P1(9,4,'#fff');arm([[ax,15]]);hand(ax,16);break}
    default:{if(f===1){arm([[ax,14],[ax+1,15]]);hand(ax+1,16)}else if(f===2){arm([[ax-1,14],[ax-1,15]]);hand(ax-1,16)}else{arm([[ax,14],[ax,15]]);hand(ax,16)}}}
  if(o.load&&o.pose!=='carry'&&o.pose!=='shovel'){B(4,13,4,5,o.load);P1(4,13,sh(o.load,0.35));P1(7,17,sh(o.load,-0.35));B(5,12,2,1,'#c9a36b')}
  outline(c);SPRC.set(key,c);return c}
const SHIPCOL=['#e8e4f2','#ffd23f','#7ad1ff','#ff8a3d','#b892ff'];
function shipSprite(model,type){const key='s|'+model+'|'+type;let cv=SPRC.get(key);if(cv)return cv;
  if(type==='cruiser'){const [c,g]=mkCv(46,20);const B=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x,y,w,h)};B(4,8,32,6,'#9a6aff');B(10,5,20,3,'#b892ff');for(let i=0;i<8;i++)B(36+i,9+Math.floor(i/3),1,5-Math.floor(i/1.7),'#9a6aff');B(26,6,5,2,'#7ad1ff');B(2,6,4,10,'#5a3a9a');B(6,14,4,3,'#4a4a5a');B(30,14,2,4,'#2a2238');B(10,14,2,4,'#2a2238');B(12,11,20,1,'#ffd23f');outline(c);const o={cv:c,ax:23,ay:19};SPRC.set(key,o);return o}
  const k=1+model*0.2;const W=Math.round(54*k),H=Math.round(34*k);const [c,g]=mkCv(W+2,H+2);const B=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)))};const col=SHIPCOL[model]||SHIPCOL[0];
  B(5,H*0.36,W-14,H*0.42,col);B(W*0.18,H*0.16,W*0.55,H*0.22,col);for(let i=0;i<8;i++)B(W-9+i,H*0.36+i*H*0.05,1,H*0.42-i*H*0.1,col);
  B(5,H*0.36,W-14,2,sh(col,0.3));B(5,H*0.72,W-14,2,sh(col,-0.3));B(W*0.6,H*0.2,W*0.12,H*0.12,'#7ad1ff');B(W*0.62,H*0.21,2,2,'#ffffff');
  B(3,H*0.05,7,H*0.33,'#ff5a6e');B(6,H*0.0,3,H*0.1,'#ff5a6e');B(5,H*0.56,W-16,2,model>1?'#ff8a3d':'#4a3d5f');
  B(W*0.3,H*0.4,W*0.2,H*0.28,sh(col,-0.15));B(W*0.3,H*0.4,1,H*0.28,sh(col,-0.4));
  B(W*0.22,H*0.78,5,4,'#5a5a66');B(W*0.6,H*0.78,5,4,'#5a5a66');B(8,H*0.78,2,H*0.2,'#2a2238');B(W-16,H*0.78,2,H*0.2,'#2a2238');B(6,H-2,6,2,'#2a2238');B(W-18,H-2,6,2,'#2a2238');
  outline(c);const o={cv:c,ax:(W+2)/2,ay:H+1};SPRC.set(key,o);return o}
function oreSprite(col,cat,r,seed){r=Math.max(2,Math.round(r));const key='o|'+col+'|'+cat+'|'+r+'|'+(seed%5);let cv=SPRC.get(key);if(cv)return cv;const S2=r*2+3;const [c,g]=mkCv(S2,S2);const R0=rng(seed);const P1=(x,y,cl)=>{g.fillStyle=cl;g.fillRect(Math.round(x),Math.round(y),1,1)};const cx=S2/2,cy=S2/2;const lt=sh(col,0.35),dk=sh(col,-0.3);
  if(cat==='crystal'){for(let i=0;i<3;i++){const a=-1.9+i*0.9+R0()*0.4,l=r*(0.8+R0()*0.4);for(let t=0;t<l;t++){const x=cx+Math.cos(a)*t,y=cy+Math.sin(a)*t;P1(x,y,t>l*0.6?lt:col);P1(x+1,y,dk)}}}
  else if(cat==='gas'){for(let i=0;i<3;i++){const x0=cx+(R0()-0.5)*r,y0=cy+(R0()-0.5)*r,rr=r*(0.35+R0()*0.25);for(let y=-rr;y<=rr;y++)for(let x=-rr;x<=rr;x++)if(x*x+y*y<=rr*rr)P1(x0+x,y0+y,x+y<-rr*0.6?lt:col)}}
  else if(cat==='exotic'){for(let i=0;i<5;i++){const a=i/5*6.28;for(let t=0;t<r;t++)P1(cx+Math.cos(a)*t,cy+Math.sin(a)*t,t<r*0.4?lt:col)}P1(cx,cy,'#ffffff')}
  else{for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){const q=(x*x)/(r*r)+(y*y)/(r*r*0.75);if(q<=1+R0()*0.25)P1(cx+x,cy+y,(x+y)<-r*0.5?lt:(x+y)>r*0.6?dk:col)}if(cat==='organic'){P1(cx-1,cy,dk);P1(cx+1,cy+1,dk)}else P1(cx-r*0.3,cy-r*0.3,'#ffffff')}
  outline(c,'#1a1022');SPRC.set(key,c);return c}
function crateSprite(col,trophy){const key='c|'+col+'|'+(trophy?1:0);let cv=SPRC.get(key);if(cv)return cv;const [c,g]=mkCv(12,9);const B=(x,y,w,h,cl)=>{g.fillStyle=cl;g.fillRect(x,y,w,h)};
  B(1,1,10,7,trophy?'#7a3a2a':'#7a5230');B(1,1,10,1,trophy?'#9a5a3a':'#9a7046');B(1,4,10,2,col);B(5,1,1,7,'#5a3a20');outline(c);SPRC.set(key,c);return c}
function drawShipPx(model,type,x,y,flame,t){const sp=shipSprite(model,type);pS(sp.cv,x,y,sp.ax,sp.ay,false);
  if(flame){const k=type==='cruiser'?0.5:1+model*0.2;const f=Math.floor(t*30)%2;for(const ex of type==='cruiser'?[-12]:[-14*k,10*k]){pR(x+ex-3,y,6,3,'#ffb347');pR(x+ex-2,y+3,4,3+f*2,'#ff8a3d');pR(x+ex-1,y+6+f*2,2,2+f,'#ffe066')}}}
function drawPile(x,amt,col,maxH){const h=Math.max(2,Math.min(maxH||40,3+Math.sqrt(amt)*1.3));const w=10+Math.min(10,h*0.35);for(let q=0;q<h;q++){const ww=w*(1-q/h)+1;pR(x-ww,-q-1,ww*2,1,q%4===0?sh(col,-0.25):(q%4===2?sh(col,0.12):col))}return h}
function drawCrateStack(x,amt,col,trophy,max){const n=Math.min(max||8,Math.ceil(amt/25));const cr=crateSprite(col,trophy);for(let j=0;j<n;j++)pS(cr,x,-1-j*7,6,8,false);return n}
export{PXC,hash,rng,clamp,lerp,ease,OUTLINE,setView,bx,by,pR,pB,pL,pD,pS,SPRC,mkCv,outline,hexMix,sh,ROLEC,personSprite,shipSprite,oreSprite,crateSprite,drawShipPx,drawPile,drawCrateStack};
