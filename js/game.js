'use strict';
/* ================= utilities ================= */
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
function hash(s){let h=2166136261>>>0;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=(seed>>>0)||1;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const SUF=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc'];
function fmt(n){if(n==null||isNaN(n))return '0';if(!isFinite(n))return '∞';const neg=n<0;n=Math.abs(n);let s;if(n<1000)s=n<10?(Math.round(n*10)/10).toString():Math.floor(n).toString();else{const i=Math.min(SUF.length-1,Math.floor(Math.log10(n)/3));const v=n/Math.pow(1000,i);s=(v<10?v.toFixed(2):v<100?v.toFixed(1):v.toFixed(0))+SUF[i]}return(neg?'-':'')+s}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hex(v,d){return /^#[0-9a-f]{6}$/i.test(String(v||''))?v:d}
function str(v,d,max){v=(typeof v==='string'?v:'').trim();return (v||d||'').slice(0,max||200)}
function shade(h,a){const n=parseInt(h.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;if(a<0){r*=1+a;g*=1+a;b*=1+a}else{r+=(255-r)*a;g+=(255-g)*a;b+=(255-b)*a}return `rgb(${r|0},${g|0},${b|0})`}
function rgba(h,al){const n=parseInt(h.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${al})`}
function lsGet(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function monthKey(t){const d=new Date(t);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')}
function monthEnd(mk){const [y,m]=mk.split('-').map(Number);return Date.UTC(y,m,1)}
function monthName(mk){const [y,m]=mk.split('-').map(Number);return new Date(Date.UTC(y,m-1,15)).toLocaleString(undefined,{month:'long',year:'numeric',timeZone:'UTC'})}
function dur(ms){if(ms<=0)return 'now';const s=ms/1000,d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?`${d}d ${h}h`:h?`${h}h ${m}m`:m?`${m}m ${Math.floor(s%60)}s`:`${Math.ceil(s)}s`}
function ago(t){const s=(Date.now()-t)/1000;return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d'}
function errMsg(e){return (e&&(e.message||e.code))||String(e)}
let toastT;function toast(m,ms=3200){const t=$('#toast');if(!t)return;t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms)}
function sumv(o){let s=0;for(const k in o)s+=o[k];return s}
function pick(R,a){return a[Math.floor(R()*a.length)]}
function cap1(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function addTo(o,k,v){if(!(v>0))return;o[k]=(o[k]||0)+v}
function takeFrom(o,k,v){const h=o[k]||0;const t=Math.min(h,Math.max(0,v));o[k]=h-t;if(o[k]<=1e-6)delete o[k];return t}
function shuffle(R,a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

/* ================= static game data ================= */
const CATS=['metal','crystal','gas','organic','exotic'];
const CAT={
  metal:{label:'Metal',ref:'Smelter',build:300},
  crystal:{label:'Crystal',ref:'Crystal Kiln',build:700},
  gas:{label:'Gas',ref:'Gas Condenser',build:1200},
  organic:{label:'Organic',ref:'Bio-Vat',build:1800},
  exotic:{label:'Exotic',ref:'Paradox Reactor',build:40000}};
const ORE_HUES=['#ff4d4d','#ff9f1c','#ffe14d','#9bf04a','#2ee6a0','#2ee6e6','#4db8ff','#6b7bff','#b05cff','#ff5ec4','#f2ede0','#a8b3c2'];
const TIER_VALUE=[2,6,18,60,200];
const TIER_NAME=['Common','Uncommon','Rare','Precious','Mythic'];
const WEATHER={
  clear:{name:'Clear skies',fx:'',stat:'',mag:0,desc:'Nothing trying to kill you. From the sky, anyway.'},
  acid:{name:'Acid Drizzle',fx:'rain',stat:'mining',mag:-0.15,desc:'Mining −15%. Miners complain about melting.'},
  fog:{name:'Giggle Fog',fx:'fog',stat:'shipping',mag:-0.2,desc:'Ship trips 20% slower. Pilots cannot stop laughing.'},
  lava:{name:'Lava Surge',fx:'lava',stat:'hazard',mag:1,desc:'Lava bubbles into the deepest level and cooks the occasional miner.'},
  quake:{name:'Grumblequake',fx:'quake',stat:'mining',mag:0.25,desc:'Mining +25%. The rock shakes loose.'},
  meteor:{name:'Meteor Shower',fx:'meteor',stat:'hazard',mag:1,desc:'Rocks fall from space. Surface crews get flattened.'},
  aurora:{name:'Greed Aurora',fx:'aurora',stat:'prices',mag:0.15,desc:'Sale prices +15%. Traders feel lucky.'},
  wind:{name:'Screaming Wind',fx:'wind',stat:'shipping',mag:-0.15,desc:'Ship trips 15% slower. The wind screams your name.'},
  blood:{name:'Blood Moon',fx:'blood',stat:'raids',mag:1,desc:'Cave monsters attack twice as often.'}};
const TOOLS=[null,
  {name:'Rusty Pick',pow:1,hard:1,cost:0},
  {name:'Jackhammer',pow:1.8,hard:2,cost:2500},
  {name:'Plasma Drill',pow:3,hard:3,cost:60000},
  {name:'Gravity Auger',pow:4.8,hard:4,cost:1.5e6},
  {name:'Quantum Spoon',pow:7.5,hard:5,cost:4e7}];
const WEAPONS=[null,
  {name:'Pointy Sticks',type:'melee',range:13,dmg:9,cd:0.8,cost:0},
  {name:'Boom Rifles',type:'bullet',range:150,dmg:11,cd:1.1,cost:1500},
  {name:'Gibbinators',type:'pellet',range:95,dmg:7,pellets:5,cd:1.5,cost:30000},
  {name:'Meat Lasers',type:'beam',range:220,dmg:34,cd:1.0,cost:6e5},
  {name:'Orbital Sporks',type:'strike',range:280,dmg:140,aoe:36,cd:3,cost:1.5e7}];
const SHIPS=[
  {name:'Duct-Tape Hopper',cap:60,spd:1,cost:0},
  {name:'Cargo Bus',cap:150,spd:1.15,cost:3000},
  {name:'Hauler Mk3',cap:400,spd:1.3,cost:50000},
  {name:'Freight Comet',cap:1000,spd:1.5,cost:1e6},
  {name:'Warp Wheelbarrow',cap:2600,spd:1.8,cost:2.5e7}];
const TRANSLATORS=[{name:'No translator',acc:0,cost:0},{name:'Phrasebook Parrot',acc:0.6,cost:800},{name:'Pocket Interpreter',acc:0.82,cost:15000},{name:'Neural Babelfish',acc:0.95,cost:250000}];
const LIFTS=['Bucket on a Rope','Rickety Cage','Steam Cage','Screaming Elevator','Mag-Lift','Gravity Chute','Teleporter-ish','Hole-Shaped Miracle','The Big Yank'];
const ARMORS=['Bare Skin','Cardboard Vests','Pot Helmets','Riot Onesies','Plate Pajamas','Divine Bubble Wrap'];
const GEAR={
  tool:{label:'Mining tool',min:1,max:5,cost:l=>TOOLS[l].cost,name:l=>TOOLS[l].name,desc:l=>`Breaks hardness ${TOOLS[l].hard} rock · dig ×${TOOLS[l].pow}`,drop:'Drill crate'},
  lift:{label:'Mine lift',min:1,max:8,cost:l=>700*Math.pow(3.1,l-2),name:l=>LIFTS[l],desc:l=>`${fmt(20*Math.pow(1.6,l))} cargo per trip · ${Math.round(70*(1+0.25*l))} m/s`,drop:'Lift parts'},
  yard:{label:'Ore yard',min:1,max:10,cost:l=>400*Math.pow(2.6,l-2),name:l=>'Yard level '+l,desc:l=>`Holds ${fmt(400*Math.pow(1.8,l))} raw ore`,drop:'Fence posts'},
  depot:{label:'Product depot',min:1,max:10,cost:l=>500*Math.pow(2.6,l-2),name:l=>'Depot level '+l,desc:l=>`Holds ${fmt(300*Math.pow(1.8,l))} refined goods`,drop:'Shelving'},
  weapon:{label:'Soldier weapons',min:1,max:5,cost:l=>WEAPONS[l].cost,name:l=>WEAPONS[l].name,desc:l=>{const w=WEAPONS[l];return `${w.type==='melee'?'Melee':'Range '+w.range} · ${w.pellets?w.pellets+'×':''}${w.dmg} dmg${w.aoe?' area':''}`},drop:'Weapon crate'},
  armor:{label:'Armor',min:0,max:5,cost:l=>1200*Math.pow(7,l-1),name:l=>ARMORS[l],desc:l=>`Soldier HP +${25*l}%`,drop:'Armor crate'},
  translator:{label:'Translator',min:0,max:3,cost:l=>TRANSLATORS[l].cost,name:l=>TRANSLATORS[l].name,desc:l=>`About ${Math.round(TRANSLATORS[l].acc*100)}% accurate`,drop:'Translator'},
  ship:{label:'Cargo ship model',min:0,max:4,cost:l=>SHIPS[l].cost,name:l=>SHIPS[l].name,desc:l=>`${fmt(SHIPS[l].cap)} cargo · speed ×${SHIPS[l].spd}`,drop:'Ship refit kit'},
  fleet:{label:'Fleet size',min:1,max:6,cost:l=>2500*Math.pow(5,l-2),name:l=>l+' ships',desc:l=>`${l} cargo ships rotating through your pads`,drop:null},
  factory:{label:'Bot factory',min:0,max:10,cost:l=>220*Math.pow(2.7,l-1),name:l=>'Factory level '+l,desc:l=>`Builds a robot miner every ${Math.max(3,Math.round(30/l))}s, up to ${12+12*l}`,drop:'Factory module'},
  pads:{label:'Launch pads',min:1,max:4,cost:l=>4000*Math.pow(6,l-2),name:l=>l+(l>1?' pads':' pad'),desc:l=>`${l} ships can load at the same time`,drop:'Pad plating'},
  shuttle:{label:'Supply shuttle',min:1,max:5,cost:l=>[0,0,2000,15000,90000,600000][l],name:l=>SHUTTLES[l],desc:l=>`Brings ${SHUTTLE_CAP[l]} hires per landing`,drop:'Shuttle refit'},
  cruisers:{label:'Cruisers',min:0,max:4,cost:l=>8000*Math.pow(4,l-1),name:l=>l+(l===1?' cruiser':' cruisers'),desc:l=>`${l} fast, small cargo ships`,drop:null}};
const SHUTTLES=['','Clown Car','Commuter Pod','Bus of Holding','Troop Hauler','Mass Migrator'];
const SHUTTLE_CAP=[0,12,20,32,50,80];

/* species */
const TRACKS=[
  {k:'labor',label:'Labor',perk:t=>`Workers carry +${20*t}% and walk +${10*t}% faster`},
  {k:'weapons',label:'Weapons',perk:t=>`Soldier damage +${15*t}%, HP +${10*t}%`+(t>=5?'. Berserk below 30% HP':'')},
  {k:'logistics',label:'Shipments',perk:t=>`Ship cargo +${20*t}%, speed +${8*t}%`+(t>=3?'. Second launch pad':'')+(t>=5?'. Shuttles 2× as often':'')},
  {k:'trade',label:'Trade',perk:t=>`Sale prices +${6*t}%`+(t>=3?'. Price forecasts':'')+(t>=5?'. No station tax':'')},
  {k:'charisma',label:'Charisma',perk:t=>`Tribe goodwill +${20*t}%, translation +${7*t}%`+(t>=3?'. Better deals':'')+(t>=5?'. Tribes never strike first':'')},
  {k:'infra',label:'Infrastructure',perk:t=>`Lift and refineries +${15*t}%, storage +${25*t}%`+(t>=5?'. Porters carry double':'')},
  {k:'mining',label:'Mining',perk:t=>`Dig speed +${15*t}%`+(t>=2?'. +1 hardness':'')+(t>=4?'. Veins yield +25%':'')+(t>=5?'. See every vein':'')}];
const ARCH={
  clank:{name:'Clankforged',sig:'labor',blurb:'Squishy, useless bodies. Brilliant factories. Robot miners build themselves forever but shatter easily.',perk:'Cannot hire miners. Bot factories spit out free robot miners that dig 20% faster and die to a stiff breeze.',look:{skin:'#9aa7b8',accent:'#ffcc33',head:'visor'}},
  haul:{name:'Void Haulers',sig:'logistics',blurb:'Born in cargo holds. Think the ground is overrated.',perk:'Start with 2 ships and 2 launch pads. Ships carry +25% and fly 30% faster. Supply shuttles come twice as often.',look:{skin:'#7ad1ff',accent:'#ff8a3d',head:'antenna'}},
  ledger:{name:'Ledgerkin',sig:'trade',blurb:'Small, numerous, and constantly doing math about you.',perk:'Sell 10% higher. Start with the Price Pump ability. Always see price forecasts.',look:{skin:'#5ee6a8',accent:'#ffd23f',head:'cyclops'}},
  gore:{name:'Gorehorn Clan',sig:'weapons',blurb:'Settle disputes by headbutt. Settle everything by headbutt.',perk:'Soldiers have +50% HP and +25% damage, cost 30% less. Hunts bring home double trophies.',look:{skin:'#c76b4a',accent:'#ff3d7f',head:'horn'}},
  delve:{name:'Deepdelvers',sig:'mining',blurb:'Molelike, nearly blind, deeply in love with rock.',perk:'Dig 40% faster, tunnels advance 50% faster, +1 hardness, start with a Jackhammer, see every vein.',look:{skin:'#b892ff',accent:'#9bf04a',head:'dome'}},
  choir:{name:'Silvertongue Choir',sig:'charisma',blurb:'Everything they say sounds like a lullaby, including threats.',perk:'Built-in Pocket Interpreter. Tribes start friendlier, goodwill grows 30% faster, deals are 25% better.',look:{skin:'#ff9fd0',accent:'#7ad1ff',head:'tentacle'}}};
const HEADS=['dome','antenna','horn','tentacle','cyclops','visor','tall'];

/* scene geometry (side view, world units; y grows downward, surface y=0) */
const SW=3000,SX=1500,LH=160,TH=24,NLV=10;
function lvY(i){return Math.floor(i/2)*LH+58+(i%2)*72}
function lvLayer(i){return Math.floor(i/2)}
const DROP_X=640,HAB_X=860,BARR_X=1050,ANT_X=470,PAD_X=[2400,2560,2720,2880],POL_X=2330;
const REF_X={metal:1620,crystal:1715,gas:1810,organic:1905,exotic:2000};
const MAPW=1000,MAP_SPD=7,FOGN=32;

/* ================= species skill tree ================= */
const BRANCHES=[
  {k:'labor',label:'Labor',col:'#ff8a3d'},{k:'weapons',label:'Weapons',col:'#ff5a6e'},{k:'logistics',label:'Shipments',col:'#7ad1ff'},
  {k:'trade',label:'Trade',col:'#ffd23f'},{k:'charisma',label:'Charisma',col:'#ff9fd0'},{k:'infra',label:'Infrastructure',col:'#9be37a'},
  {k:'mining',label:'Mining',col:'#d08a52'},{k:'heritage',label:'Heritage',col:'#b892ff'}];
const KIND_LABEL={perk:'Perk',ability:'Ability',unit:'New unit',build:'New build'};
// t = tier 1-5, s = slot (-1 left fork, 0 single, 1 right fork). Forks at the same tier lock each other out.
const TREE=[
  {id:'lab1',br:'labor',t:1,s:0,kind:'perk',name:'Calloused Hands',desc:'Workers carry 25% more and walk 10% faster.'},
  {id:'lab2a',br:'labor',t:2,s:-1,kind:'ability',name:'Overtime Whistle',desc:'Ability: every worker moves and digs twice as fast for 45 seconds. Recharges in 6 minutes.'},
  {id:'lab2b',br:'labor',t:2,s:1,kind:'perk',name:'Union of the Damned',desc:'Miners and porters never run from monsters. They punch back instead.'},
  {id:'lab3',br:'labor',t:3,s:0,kind:'unit',name:'Brutes',desc:'Hire Brutes: huge workers who dig 2.5× as fast as a miner, and drop the pick to brawl when monsters show up.'},
  {id:'lab4a',br:'labor',t:4,s:-1,kind:'perk',name:'Pack Mules',desc:'Porters carry twice as much per trip.'},
  {id:'lab4b',br:'labor',t:4,s:1,kind:'perk',name:'Assembly Chant',desc:'Miners dig 1% faster for every 4 miners in the same shaft (up to +40%).'},
  {id:'lab5',br:'labor',t:5,s:0,kind:'perk',name:'Unkillable Shift',desc:'Dead workers have a 35% chance to get back up and keep working. They are green now.'},

  {id:'wpn1',br:'weapons',t:1,s:0,kind:'perk',name:'Pointier Ends',desc:'Soldiers deal 20% more damage.'},
  {id:'wpn2a',br:'weapons',t:2,s:-1,kind:'perk',name:'Beast Tamer',desc:'Monsters beaten below 30% health may surrender and join you as pets (up to 6). Pets live at the barracks and fight for you.'},
  {id:'wpn2b',br:'weapons',t:2,s:1,kind:'perk',name:'Trophy Taxidermy',desc:'Hunting trophies sell for twice as much.'},
  {id:'wpn3',br:'weapons',t:3,s:0,kind:'unit',name:'Grenadiers',desc:'Hire Grenadiers: they lob grenades that blow up everything in a small radius. They guard home and never leave on hunts.'},
  {id:'wpn4a',br:'weapons',t:4,s:-1,kind:'perk',name:'Blood Frenzy',desc:'Each kill heals the soldier 30% and makes them faster for a few seconds.'},
  {id:'wpn4b',br:'weapons',t:4,s:1,kind:'perk',name:'Mercenary Guild',desc:'Soldiers cost 40% less and supply shuttles carry 10 more passengers.'},
  {id:'wpn5',br:'weapons',t:5,s:0,kind:'ability',name:'Orbital Mom',desc:'Ability: a laser from orbit deletes every monster and raider in your colony. Recharges in 10 minutes.'},

  {id:'log1',br:'logistics',t:1,s:0,kind:'perk',name:'Bigger Holds',desc:'Cargo ships carry 25% more.'},
  {id:'log2a',br:'logistics',t:2,s:-1,kind:'perk',name:'Rocket Worship',desc:'Whenever a ship lands or takes off, every miner digs 60% faster for 20 seconds while they cheer.'},
  {id:'log2b',br:'logistics',t:2,s:1,kind:'perk',name:'Express Lane',desc:'Cargo trips take 30% less time.'},
  {id:'log3',br:'logistics',t:3,s:0,kind:'unit',name:'Cruisers',desc:'Buy Cruisers: tiny ships with a third of the cargo that finish a trip three times as fast. Great for rare ore.'},
  {id:'log4a',br:'logistics',t:4,s:-1,kind:'build',name:'Pad Permit',desc:'One free extra launch pad, and pads cost half as much.'},
  {id:'log4b',br:'logistics',t:4,s:1,kind:'perk',name:'Cargo Insurance',desc:'Every ship comes home with 20% more coin.'},
  {id:'log5',br:'logistics',t:5,s:0,kind:'ability',name:"Smuggler's Run",desc:'Ability: your next 3 ships sell for 80% more. Recharges in 15 minutes.'},

  {id:'trd1',br:'trade',t:1,s:0,kind:'perk',name:'Haggling',desc:'Everything sells for 8% more.'},
  {id:'trd2a',br:'trade',t:2,s:-1,kind:'perk',name:'Market Rumors',desc:'See where each price is heading and which station pays best right now.'},
  {id:'trd2b',br:'trade',t:2,s:1,kind:'perk',name:'Bulk Discount',desc:'Hires, gear, buildings and shaft upgrades cost 12% less.'},
  {id:'trd3',br:'trade',t:3,s:0,kind:'unit',name:'Politicians',desc:'Hire Politicians: each one gives speeches at the pads and raises your sale prices 3% (up to 10 of them).'},
  {id:'trd4a',br:'trade',t:4,s:-1,kind:'ability',name:'Price Pump',desc:'Ability: one category sells for 30% more at your station for 10 minutes. Recharges in 12 minutes.'},
  {id:'trd4b',br:'trade',t:4,s:1,kind:'perk',name:'Tax Haven',desc:'Stations stop charging you tax.'},
  {id:'trd5',br:'trade',t:5,s:0,kind:'ability',name:'Corner the Market',desc:'Ability: everything sells for 60% more for 3 minutes. Recharges in 20 minutes.'},

  {id:'cha1',br:'charisma',t:1,s:0,kind:'perk',name:'Winning Smile',desc:'Goodwill gains with tribes are 30% bigger.'},
  {id:'cha2a',br:'charisma',t:2,s:-1,kind:'perk',name:'Babel Glands',desc:'Translation +15%, and you understand half of any language without a translator.'},
  {id:'cha2b',br:'charisma',t:2,s:1,kind:'perk',name:'Gift Wrapping',desc:'Tribe deals are 20% cheaper.'},
  {id:'cha3',br:'charisma',t:3,s:0,kind:'unit',name:'Envoys',desc:'Hire Envoys (up to 4): they wander off to visit tribes and raise goodwill with everyone every minute, even enemies.'},
  {id:'cha4a',br:'charisma',t:4,s:-1,kind:'perk',name:'Cult of Personality',desc:'Allied tribes send 3 free workers every 15 minutes.'},
  {id:'cha4b',br:'charisma',t:4,s:1,kind:'perk',name:'Silver Threats',desc:'Neutral tribes pay you tribute every 10 minutes while your army is scarier than theirs.'},
  {id:'cha5',br:'charisma',t:5,s:0,kind:'perk',name:'Prophet',desc:'Tribes never attack first, and allies send warriors to defend you during raids.'},

  {id:'inf1',br:'infra',t:1,s:0,kind:'perk',name:'Grease Everything',desc:'Lifts move 20% faster and carry 20% more. Refineries +15%.'},
  {id:'inf2a',br:'infra',t:2,s:-1,kind:'build',name:'Conveyor Belt',desc:'A belt feeds ore from the yard straight into your refineries.'},
  {id:'inf2b',br:'infra',t:2,s:1,kind:'perk',name:'Bigger Silos',desc:'Ore yard and depot hold 60% more.'},
  {id:'inf3',br:'infra',t:3,s:0,kind:'build',name:'Loader Cranes',desc:'A crane at every pad swings goods from the depot straight into docked ships.'},
  {id:'inf4a',br:'infra',t:4,s:-1,kind:'build',name:'Second Elevator',desc:'A second lift car runs in the main shaft.'},
  {id:'inf4b',br:'infra',t:4,s:1,kind:'perk',name:'Overclocked Refineries',desc:'Refineries run 60% faster. Sometimes one explodes.'},
  {id:'inf5',br:'infra',t:5,s:0,kind:'build',name:'Ore Teleporter',desc:'30% of the ore dumped in any chute teleports straight to the yard.'},

  {id:'min1',br:'mining',t:1,s:0,kind:'perk',name:'Sharp Picks',desc:'Everyone digs 20% faster.'},
  {id:'min2a',br:'mining',t:2,s:-1,kind:'ability',name:'Dynamite',desc:'Ability: blast every tunnel face 60 m deeper at once. Usually only kills one or two miners. Recharges in 4 minutes.'},
  {id:'min2b',br:'mining',t:2,s:1,kind:'perk',name:'Steady Hands',desc:'Break one hardness level higher than your tools allow.'},
  {id:'min3',br:'mining',t:3,s:0,kind:'unit',name:'Excavators',desc:'Buy Excavator mechs: each mines like 6 miners, never flees and is very hard to kill. Slow walkers.'},
  {id:'min4a',br:'mining',t:4,s:-1,kind:'perk',name:'Vein Sense',desc:'See every vein. Veins yield 40% more.'},
  {id:'min4b',br:'mining',t:4,s:1,kind:'perk',name:'Deep Lungs',desc:'No more cave-ins, and monsters ignore half your dark shafts.'},
  {id:'min5',br:'mining',t:5,s:0,kind:'perk',name:'Core Tap',desc:'Your deepest shaft yields double.'}];
const HERITAGE={
  clank:[{name:'Overclocked Bots',desc:'Robot miners work 40% faster.'},{name:'Self-Repair',desc:'Robots that die have a 50% chance to reboot.'},{name:'Gigafactory',desc:'The bot factory builds 3 bots at a time and holds twice as many.'}],
  haul:[{name:'Hyperspace Shortcut',desc:'Cargo trips take 20% less time.'},{name:'Cargo Tetris',desc:'Ships carry 30% more.'},{name:'Fleet Admiral',desc:'Two free cargo ships arrive now.'}],
  ledger:[{name:'Insider Trading',desc:'Price pumps hit 50% instead of 30%.'},{name:'Price Psychic',desc:'Ships automatically sell at whichever station pays the most for their cargo.'},{name:'Monopoly',desc:'Everything sells for 15% more.'}],
  gore:[{name:'War Paint',desc:'Soldiers have 25% more health.'},{name:'Headbutt Charge',desc:'Melee hits knock enemies flying and deal 50% more damage.'},{name:'Living Legend',desc:'Legendary kills award double Spectacle Points.'}],
  delve:[{name:'Echolocation',desc:'Veins yield 25% more.'},{name:'Tunnel Sprint',desc:'Tunnels advance 50% faster.'},{name:'Earth Mother',desc:'No cave-ins and one more hardness level.'}],
  choir:[{name:'Lullaby',desc:'Monsters that attack have a 15% chance to fall asleep and become pets.'},{name:'Harmony',desc:'Goodwill gains are 25% bigger.'},{name:'Siren Song',desc:'Raiders have a 30% chance to switch sides mid-raid.'}]};
const TIER_SP=[1,2,3,5,8];
function treeNodes(arch){const out=TREE.slice();const H=HERITAGE[arch]||HERITAGE.delve;H.forEach((h,i)=>out.push({id:'her'+(i+1),br:'heritage',t:[1,3,5][i],s:0,kind:'perk',name:h.name,desc:h.desc}));return out}
function nodeOf(arch,id){return treeNodes(arch).find(n=>n.id===id)}
function hasT(c,id){return !!(c&&c.tree&&c.tree[id])}
function nodeCost(c,n){const sig=c.species&&ARCH[c.species.arch].sig===n.br;const b=n.br==='heritage'?[2,4,8][[1,3,5].indexOf(n.t)]:TIER_SP[n.t-1];return sig?Math.max(1,Math.round(b*0.6)):b}
function nodeState(c,n){if(hasT(c,n.id))return 'got';const nodes=treeNodes(c.species.arch);
  if(n.s!==0&&nodes.some(o=>o.br===n.br&&o.t===n.t&&o.id!==n.id&&hasT(c,o.id)))return 'locked-out';
  if(n.t>1){const prev=nodes.filter(o=>o.br===n.br&&o.t<n.t);const maxT=Math.max(...prev.map(o=>o.t));if(!prev.some(o=>o.t===maxT&&hasT(c,o.id)))return 'locked'}
  return 'open'}

/* ================= unlockable units & abilities ================= */
const UNITS={
  brutes:{label:'Brutes',node:'lab3',base:300,r:1.1,max:200,desc:'Dig 2.5× as fast as a miner. Brawl when monsters come.'},
  grenadiers:{label:'Grenadiers',node:'wpn3',base:300,r:1.1,max:200,desc:'Lob grenades with area damage. Guard home only.'},
  politicians:{label:'Politicians',node:'trd3',base:2500,r:1.4,max:10,desc:'Give speeches at the pads. Each one raises sale prices 3%.'},
  envoys:{label:'Envoys',node:'cha3',base:1500,r:1.7,max:4,desc:'Visit tribes and raise goodwill with all of them every minute.'},
  excavators:{label:'Excavators',node:'min3',base:4000,r:1.3,max:30,desc:'Mining mech. Digs like 6 miners and never flees.'}};
const ABILITIES={
  whistle:{node:'lab2a',name:'Overtime Whistle',cd:360,dur:45,glyph:'!'},
  orbital:{node:'wpn5',name:'Orbital Mom',cd:600,dur:0,glyph:'*'},
  smuggle:{node:'log5',name:"Smuggler's Run",cd:900,dur:0,glyph:'$'},
  pump:{node:'trd4a',name:'Price Pump',cd:720,dur:600,glyph:'^'},
  corner:{node:'trd5',name:'Corner the Market',cd:1200,dur:180,glyph:'%'},
  dynamite:{node:'min2a',name:'Dynamite',cd:240,dur:0,glyph:'#'}};
function hasAbility(c,k){if(k==='pump'&&c.species&&c.species.arch==='ledger')return true;return hasT(c,ABILITIES[k].node)}
function unitUnlocked(c,k){return hasT(c,UNITS[k].node)}

/* per-shaft upgrades */
const SHAFT_UP={
  light:{label:'Lights',names:['Pitch dark','Candles','Lanterns','Floodlights'],desc:['Miners dig in the dark. Monsters love it.','Dig +10%. Fewer monsters.','Dig +20%. Monsters avoid it.','Dig +30%. Monsters rarely come.'],base:150,r:3},
  support:{label:'Supports',names:['None','Wooden beams','Steel arches','Force struts'],desc:['Cave-ins happen.','Half as many cave-ins.','A fifth as many cave-ins.','No cave-ins.'],base:200,r:3},
  cart:{label:'Mine carts',names:['On foot','Wheelbarrow cart','Rail cart','Rocket cart'],desc:['Miners walk every load back to the lift.','A cart hauls ore so miners stay at the face.','Bigger, faster cart.','Huge, very fast cart.'],base:400,r:3.2}};
function shaftUpCost(c,i,k,lvl){return SHAFT_UP[k].base*(1+i*0.6)*Math.pow(SHAFT_UP[k].r,lvl-1)*costMul(c)}
function costMul(c){return hasT(c,'trd2b')?0.88:1}

/* ================= planet generation & balancing ================= */
const POOL={metal:['Rustmeat','Grumblesteel','Bonzium','Clankite','Ferrogoo','Spite Iron','Gnawed Copper','Tantrumite','Core Gold'],crystal:['Sobstone','Screamquartz','Glintbone','Prism Teeth','Shardlings','Mood Opal','Weepglass','Wailglass'],gas:['Burpane','Wheezon','Gigglemist','Sighgas','Hiccupon','Yodel Vapor'],organic:['Squishroot','Meatmoss','Bog Cheese','Larva Jelly','Fungal Bacon','Gristle Kelp'],exotic:['Paradox Paste','Void Lint','Chronojam','Maybeium','Spare Gravity','Echo Dust']};
const SYL=['gor','blu','zan','thr','ok','vex','mu','la','dro','qua','ix','pel','sno','rak','ul','bim','zorp'];
const ADJ=['Crusty','Grumpy','Wailing','Molten','Gooey','Bitter','Spiteful','Sticky','Haunted','Moist','Furious','Sleepy'];
const LNOUN=['Topsoil','Clay','Shale','Mantle','Core'];
const RNOUN=['Flats','Basin','Bruise','Reach','Rim','Wastes','Gulch','Sprawl','Hollows','Teeth'];
const SNOUN=['Depot','Bazaar','Exchange','Outpost','Mall','Maw','Swap Meet'];
const SURF_FAUNA=[['Gnasher Grub',1],['Spleen Goat',1],['Bog Llama',2],['Screech Hog',2],['Crab Lawyer',3],['Moist Horror',3],['Tusked Regret',4],['Cave Goose',2],['Ankle Biter',1],['Thunder Slug',4]];
const CAVE_FAUNA=[['Tunnel Leech',1,0],['Gnasher Grub',2,0],['Shale Wyrm',3,1],['Rock Mimic',3,2],['Lava Weasel',4,3],['The Accountant',5,4]];
const BIOMES=['#7a5a3c','#4f6b3a','#5b4a7a','#3c6670','#7a3c4a','#8a7a3c','#4a4f6b','#6b3c6b'];
const TRIBE_COLS=['#ff6b6b','#ffd23f','#7ad1ff','#9bf04a','#ff9fd0','#ffb347'];
const PERSONALITIES=['proud','greedy','peaceful','warlike','spiritual','paranoid'];
const LANGS=[
  {sounds:'hard clicks and growls',C:['k','g','r','z','t','x','gr'],V:['a','o','u'],P:['CVC','CVC-CV','CVCC']},
  {sounds:'bubbly gurgles',C:['b','l','m','p','w','bl'],V:['u','o','oo','ee'],P:['CVV','CVCV','CVVC']},
  {sounds:'hissing whispers',C:['s','sh','th','f','h','ss'],V:['i','e','a'],P:['CVC','VCV','CVCVC']},
  {sounds:'booming chants',C:['d','m','n','g','b','dr'],V:['o','a','oo'],P:['CVCV','CVN','CV-CVN']},
  {sounds:'chirpy squeaks',C:['t','p','k','ch','y','tw'],V:['i','ee','e'],P:['CV-CV','CVCV','CVCVC']}];
const CONCEPTS=['hello','friend','enemy','trade','gift','war','peace','hunt','ore','coin','yes','no','stranger','leader'];
function genWord(R,L){const p=pick(R,L.P);let w='';for(const ch of p){if(ch==='C')w+=pick(R,L.C);else if(ch==='V')w+=pick(R,L.V);else if(ch==='N')w+=pick(R,['n','m','ng']);else w+=ch}return w}
function procName(R){return cap1(pick(R,SYL)+pick(R,SYL)+pick(R,SYL))+'-'+(2+Math.floor(R()*97))}
function mkStation(s,R){const loves=CATS.includes(s.loves)?s.loves:pick(R,CATS);let hates=CATS.includes(s.hates)?s.hates:pick(R,CATS);if(hates===loves)hates=CATS[(CATS.indexOf(loves)+2)%5];const mult={};CATS.forEach(c=>mult[c]=c===loves?1.4:c===hates?0.6:1);const dist={near:35,mid:50,far:75}[s.distance]||50;const tax={near:0.12,mid:0.06,far:0}[s.distance]||0.06;return{id:s.id,name:s.name,blurb:s.blurb||'',loves,hates,mult,dist,tax,distance:s.distance||'mid'}}

function buildPlanet(raw,seed){
  raw=(raw&&typeof raw==='object')?raw:{};const R=rng(hash(seed));
  const p={v:2,id:raw.id||('p'+hash(seed+'id').toString(36)),created:Date.now(),
    name:str(raw.name,procName(R),40),tagline:str(raw.tagline,pick(R,['A planet that hates you personally.','Rich in ore. Richer in teeth.','The Maker made this one on a Monday.']),90),
    story:str(raw.story,'',800),sky:[hex(raw.sky&&raw.sky[0],'#2a1446'),hex(raw.sky&&raw.sky[1],'#ff8a5c')],surface:hex(raw.surface,'#8a4f3d'),
    layers:[],ores:[],stations:[],regions:[],fauna:[],tribes:[],herds:[],prompt:raw.prompt||'',author:raw.author||null};
  if(!p.story)p.story=`${p.name} was assembled by the Maker out of leftover grudges and a bucket of ore. The crust is soft, the caves are hungry, and the locals have opinions. Colonists are welcome, in the sense that food is welcome.`;
  const LC=['#8a5a44','#6e4a5e','#4e3f6b','#7a2e3a','#3b1f4f'];
  for(let i=0;i<5;i++){const L=(Array.isArray(raw.layers)&&raw.layers[i])||{};p.layers.push({name:str(L.name,pick(R,ADJ)+' '+LNOUN[i],32),color:hex(L.color,LC[i])})}
  // ores: distinct hue per ore, every tier present twice
  const seen=new Set();const list=[];
  for(const o of (Array.isArray(raw.ores)?raw.ores:[]).slice(0,12)){const cat=CATS.includes(o&&o.category)?o.category:null;const name=str(o&&o.name,'',28);if(!cat||!name||seen.has(name.toLowerCase()))continue;seen.add(name.toLowerCase());let tier=clamp(Math.round(+o.tier||0),0,4);if(cat==='exotic')tier=Math.max(3,tier);list.push({name,cat,tier,blurb:str(o.blurb,'',90)})}
  for(let t=0;t<5;t++){while(list.filter(o=>o.tier===t).length<2&&list.length<12){const cat=t>=3&&R()<0.5?'exotic':pick(R,['metal','crystal','gas','organic']);const nm=pick(R,POOL[cat].filter(n=>!seen.has(n.toLowerCase())))||(cap1(pick(R,SYL))+'ite');seen.add(nm.toLowerCase());list.push({name:nm,cat,tier:t,blurb:''})}}
  list.sort((a,b)=>a.tier-b.tier);const hues=shuffle(R,ORE_HUES);
  list.forEach((o,i)=>p.ores.push({id:'o'+i,name:o.name,cat:o.cat,tier:o.tier,blurb:o.blurb,color:hues[i%hues.length],value:Math.round(TIER_VALUE[o.tier]*(0.9+R()*0.2)*100)/100}));
  // stations
  for(let i=0;i<3;i++){const s=(Array.isArray(raw.stations)&&raw.stations[i])||{};p.stations.push(mkStation({id:'s'+i,name:str(s.name,cap1(pick(R,SYL)+pick(R,SYL))+' '+pick(R,SNOUN),32),blurb:str(s.blurb,'',90),loves:s.loves,hates:s.hates,distance:['near','mid','far'].includes(s.distance)?s.distance:['near','mid','far'][i]},R))}
  // fauna
  let fi=0;const fseen=new Set();
  const addF=(f,kind)=>{const name=str(f.name,'',32);if(!name||fseen.has(name.toLowerCase()))return;fseen.add(name.toLowerCase());p.fauna.push({id:'f'+(fi++),name,kind,threat:clamp(Math.round(+f.threat||2),1,5),minLayer:kind==='cave'?clamp(Math.round(+f.minLayer||0),0,4):0,color:hex(f.color,pick(R,['#ff8a3d','#9b7bff','#e94b6a','#5ee6a8','#ffd23f','#7ad1ff'])),blurb:str(f.blurb,'',90)})};
  for(const f of (Array.isArray(raw.fauna)?raw.fauna:[]).slice(0,10))addF(f,f&&f.kind==='cave'?'cave':'surface');
  for(const [n,t] of shuffle(R,SURF_FAUNA)){if(p.fauna.filter(f=>f.kind==='surface').length>=5)break;addF({name:n,threat:t},'surface')}
  for(const [n,t,l] of CAVE_FAUNA){if(p.fauna.filter(f=>f.kind==='cave').length>=4)break;addF({name:n,threat:t,minLayer:l},'cave')}
  if(!p.fauna.some(f=>f.kind==='cave'&&f.minLayer===0))addF({name:'Tunnel Leech',threat:1,minLayer:0},'cave');
  if(!p.fauna.some(f=>f.kind==='surface'&&f.threat<=2))addF({name:'Spleen Goat',threat:1},'surface');
  // tribes
  const tr=(Array.isArray(raw.tribes)?raw.tribes:[]).slice(0,4);while(tr.length<4)tr.push({});
  tr.forEach((t,i)=>{const L=LANGS[(hash(seed)+i)%LANGS.length];const words={};const w0=t.words&&typeof t.words==='object'?t.words:{};CONCEPTS.forEach(k=>words[k]=str(w0[k],genWord(R,L),16));
    const people=str(t.people,cap1(genWord(R,L))+(pick(R,['ites','folk','kin',' Clan','lings'])),28);
    p.tribes.push({id:'t'+i,name:str(t.name,'The '+people,32),people,color:TRIBE_COLS[i%TRIBE_COLS.length],leader:str(t.leader,cap1(genWord(R,L))+' '+cap1(genWord(R,L)),32),title:str(t.title,pick(R,['Chieftain','Grand Snack','High Yeller','Elder','Warboss','Speaker']),24),
      personality:PERSONALITIES.includes(t.personality)?t.personality:pick(R,PERSONALITIES),lang:{sounds:str(t.sounds,L.sounds,60),words},warriors:20+Math.floor(R()*35),weapon:R()<0.6?1:2,likes:CATS.includes(t.likes)?t.likes:pick(R,['metal','crystal','organic','gas']),blurb:str(t.blurb,'',140),region:null,village:null})});
  // regions: 7 Voronoi seeds, 4 tribal, 3 frontier
  const pts=[];let guard=0;while(pts.length<7&&guard++<4000){const x=110+R()*780,y=110+R()*780;if(pts.every(q=>Math.hypot(q.x-x,q.y-y)>255))pts.push({x,y})}
  while(pts.length<7)pts.push({x:110+R()*780,y:110+R()*780});
  const rnames=(Array.isArray(raw.regions)?raw.regions:[]);const WX=Object.keys(WEATHER).filter(k=>k!=='clear');
  const order=shuffle(R,[0,1,2,3,4,5,6]);
  pts.forEach((q,i)=>{const rr=rnames[i]||{};const tribe=order.indexOf(i)<4?p.tribes[order.indexOf(i)]:null;
    const ores=[];for(let t=0;t<5;t++){const cands=p.ores.filter(o=>o.tier===t);ores.push(cands[(i+Math.floor(R()*3))%cands.length].id)}
    const sf=p.fauna.filter(f=>f.kind==='surface');const mySurf=shuffle(R,sf).slice(0,tribe?2:1+Math.floor(R()*2)).map(f=>f.id);
    const reg={id:'g'+i,name:str(rr.name,pick(R,ADJ)+' '+pick(R,RNOUN),32),blurb:str(rr.blurb,'',90),x:q.x,y:q.y,biome:hex(rr.color,BIOMES[i%BIOMES.length]),
      hardMod:tribe?pick(R,[0,0,1]):pick(R,[-1,0,0]),extract:Math.round((0.85+R()*0.4)*100)/100,ores,
      weather:tribe?['clear',pick(R,WX),pick(R,WX)]:['clear','clear',pick(R,WX)],surface:mySurf,tribe:tribe?tribe.id:null,frontier:!tribe};
    if(Array.isArray(rr.weather)){const w=rr.weather.filter(x=>WEATHER[x]);if(w.length)reg.weather=['clear'].concat(w.slice(0,3))}
    if(tribe){tribe.region=reg.id;tribe.village={x:q.x,y:q.y}}
    p.regions.push(reg)});
  // herds
  let hi=0;for(const reg of p.regions){for(const fid of reg.surface){const f=p.fauna.find(x=>x.id===fid);const n=f.threat>=4?1:2;for(let k=0;k<n;k++){const a=R()*6.28,d=60+R()*90;p.herds.push({id:'h'+(hi++),fauna:fid,region:reg.id,cx:clamp(reg.x+Math.cos(a)*d,30,970),cy:clamp(reg.y+Math.sin(a)*d,30,970),r:40+R()*70,size:f.threat>=4?2+Math.floor(R()*2):3+Math.floor(R()*5),w1:6.283/(900+R()*1500),w2:6.283/(400+R()*700),p1:R()*6.28,p2:R()*6.28,p3:R()*6.28})}}}
  return p}

function upgradeV1(old){
  const raw={id:old.id,name:old.name,tagline:old.tagline,story:old.story,sky:old.sky,surface:old.surface,prompt:old.prompt,author:old.author,
    layers:(old.layers||[]).map(l=>({name:l.name,color:l.color})),
    ores:(old.resources||[]).map(r=>({name:r.name,category:r.cat,tier:r.layer,blurb:r.blurb})),
    stations:(old.stations||[]).slice(0,3).map(s=>({name:s.name,blurb:s.blurb,loves:s.loves,hates:s.hates,distance:s.dist<0.9?'near':s.dist>1.1?'far':'mid'})),
    regions:(old.regions||[]).map(r=>({name:r.name,blurb:r.blurb})),
    fauna:(old.creatures||[]).map(k=>({name:k.name,threat:k.threat,minLayer:k.layer,color:k.color,blurb:k.blurb,kind:'cave'}))};
  return buildPlanet(raw,old.id||'gorbulon')}

/* ================= planet helpers ================= */
const P=()=>S.world&&S.world.planet;
function regOf(Pl,id){return Pl.regions.find(r=>r.id===id)||Pl.regions[0]}
function regionAt(Pl,x,y){let b=null,bd=1e18;for(const r of Pl.regions){const d=(r.x-x)**2+(r.y-y)**2;if(d<bd){bd=d;b=r}}return b}
function layerHard(reg,L){return clamp(L+1+(reg.hardMod||0),1,6)}
function oreOf(Pl,id){return Pl.ores.find(o=>o.id===id)}
function faunaOf(Pl,id){return Pl.fauna.find(f=>f.id===id)}
function tribeOf(Pl,id){return Pl.tribes.find(t=>t.id===id)}
function weatherOf(reg,now){const per=75*60e3;const i=Math.floor(now/per);const k=reg.weather[hash(reg.id+':'+i)%reg.weather.length];return Object.assign({id:k,ends:(i+1)*per},WEATHER[k]||WEATHER.clear)}
function herdPos(h,now){const t=now/1000;return{x:clamp(h.cx+h.r*(0.75*Math.sin(t*h.w1+h.p1)+0.25*Math.sin(t*h.w2+h.p2)),12,988),y:clamp(h.cy+h.r*(0.75*Math.cos(t*h.w1*0.83+h.p3)+0.25*Math.sin(t*h.w2*1.1+h.p1)),12,988)}}
function itemInfo(Pl,key){
  if(key.startsWith('h:')){const f=faunaOf(Pl,key.slice(2));return{name:(f?f.name:'Mystery')+' trophies',cat:'organic',value:f?6*f.threat*f.threat+4:6,color:f?f.color:'#c66',trophy:true}}
  const o=oreOf(Pl,key);return o?{name:o.name,cat:o.cat,value:o.value,color:o.color,ore:o,tier:o.tier}:{name:'Mystery ore',cat:'metal',value:1,color:'#888'}}
function drift(cat,sid,now,pid){const h=hash(cat+sid+pid);const per=3600e3*(2+h%5);return 1+0.2*Math.sin(2*Math.PI*now/per+(h%628)/100)}

/* ================= global state ================= */
const S={db:null,user:null,uid:null,local:false,canWrite:true,isOwner:false,ready:false,
  world:null,colony:null,colonies:{},feed:[],profiles:{},tab:'crew',amt:1,lastSave:0,saveAt:0,
  rt:null,watch:null,view:'side',modal:null,ovKey:'',away:null,rolling:false,chat:null,deal:null,armMissile:false,landPick:null,mapSel:null,cam:null,rate:0,treeSel:null};

/* ================= colony state ================= */
const CREW_KEYS=['miners','porters','soldiers','brutes','grenadiers','politicians','envoys','excavators'];
function mkShip(type,st){return{type:type||'cargo',st:st||'wait',cargo:{},value:0,ret:0,pad:0}}
function runState(arch){
  const r={coin:150,earned:0,kills:0,deaths:0,crew:{miners:3,porters:2,soldiers:2,brutes:0,grenadiers:0,politicians:0,envoys:0,excavators:0},orders:[],
    gear:{tool:1,lift:1,yard:1,depot:1,weapon:1,armor:0,translator:0,ship:0,fleet:1,factory:0,pads:1,shuttle:1,cruisers:0},pods:[],
    levels:1,shaftJob:null,faces:{},depl:{},raw:{},prod:{},chute:{},hopper:{},fbuf:{},stage:{},shafts:[],rubble:{},
    ref:{metal:0,crystal:0,gas:0,organic:0,exotic:0},ships:[mkShip('cargo','dock')],
    station:'s0',autoLaunch:true,army:{auto:false,size:4,keep:2,targets:{}},parties:[],drone:null,
    tribes:{},herdKills:{},nextBeast:0,nextShuttle:0,nextCave:0,pump:null,trips:0,runStart:Date.now(),buffs:{},abil:{},pets:[],smuggle:0};
  if(arch==='delve')r.gear.tool=2;
  if(arch==='haul'){r.gear.fleet=2;r.gear.pads=2;r.ships.push(mkShip('cargo','wait'))}
  if(arch==='clank'){r.gear.factory=1}
  if(arch==='gore')r.crew.soldiers=4;
  if(arch==='ledger')r.coin+=200;
  return r}
function newColony(uid){return Object.assign({v:2,uid,name:'',planetId:null,landed:false,region:null,base:null,species:null,techs:{},tree:{},treeRev:1,sp:0,spLife:0,wins:0,prestiges:0,lastWinMonth:null,grant:0,fog:'',lastTick:Date.now()},runState())}
function freshRun(c){const keep={tribes:c.tribes,fog:c.fog};Object.assign(c,runState(c.species&&c.species.arch));if(c.landed){c.tribes=keep.tribes||{};c.fog=keep.fog||''}
  if(hasT(c,'her3')&&c.species&&c.species.arch==='haul'){c.ships.push(mkShip(),mkShip());c.gear.fleet+=2}
  for(const k in c.tribes){const t=c.tribes[k];if(t.st==='war'){t.st='neutral';t.rel=Math.min(t.rel,-20)}t.nextRaid=0}}
function migrateV1(old){const c=newColony(old.uid);c.name=old.name||'';c.sp=Math.max(old.sp||0,old.spLife||0);c.spLife=old.spLife||0;c.wins=old.wins||0;c.prestiges=old.prestiges||0;c.lastWinMonth=old.lastWinMonth||null;
  const e=Math.max(old.earned||0,old.coin||0);c.grant=Math.round(Math.min(40000,Math.max(0,200*Math.pow(e,0.25))));c.migrated=true;c.v1earned=Math.round(e);return c}
function normColony(c){const base=newColony(c.uid);
  // one-time: old tech tracks become a full SP refund for the new skill tree
  if(!c.treeRev){let ref=0;const sig=c.species&&ARCH[c.species.arch]?ARCH[c.species.arch].sig:null;
    for(const k in (c.techs||{})){for(let t=1;t<=c.techs[k];t++){if(k===sig&&t===1)continue;const b=TIER_SP[t-1];ref+=k===sig?Math.max(1,Math.round(b*0.6)):b}}
    if(c.gear&&!c.gear.pads)c.gear.pads=(c.species&&c.species.arch==='haul')||(c.techs&&c.techs.logistics>=3)?2:1;
    if(ref>0){c.sp=(c.sp||0)+ref;c.spRefund=ref}c.techs={};c.tree={};c.treeRev=1}
  for(const k in base)if(c[k]===undefined)c[k]=JSON.parse(JSON.stringify(base[k]));
  for(const k in base.gear)if(c.gear[k]===undefined)c.gear[k]=base.gear[k];for(const k of CREW_KEYS)if(c.crew[k]===undefined)c.crew[k]=0;
  CATS.forEach(k=>c.ref[k]=c.ref[k]||0);c.army=Object.assign({auto:false,size:4,keep:2,targets:{}},c.army||{});if(!Array.isArray(c.ships)||!c.ships.length)c.ships=[mkShip('cargo','dock')];
  c.ships.forEach(s=>{if(!s.type)s.type='cargo';if(!s.cargo)s.cargo={}});
  for(const k of ['parties','orders','pods','shafts','pets'])if(!Array.isArray(c[k]))c[k]=[];
  for(const k of ['buffs','abil','stage','fbuf','rubble','tree'])if(!c[k]||typeof c[k]!=='object'||Array.isArray(c[k]))c[k]={};
  return c}
function shaftCfg(c,i){let s=c.shafts[i];if(!s){s=c.shafts[i]={want:null,light:0,support:0,cart:0}}return s}
function initTribes(c,Pl){const choir=c.species&&c.species.arch==='choir';for(const t of Pl.tribes){if(c.tribes[t.id])continue;const base={proud:-5,greedy:0,peaceful:15,warlike:-20,spiritual:5,paranoid:-10}[t.personality]||0;
  c.tribes[t.id]={rel:clamp(base+(choir?20:0),-100,100),st:'neutral',rights:false,warriors:t.warriors,wtier:t.weapon,skill:0,log:[],nextRaid:0,nextGift:0,mapped:false}}}

/* ================= derived stats ================= */
function techT(c,k){return 0}
function buffOn(c,k,now){return c.buffs&&c.buffs[k]>(now||Date.now())}
function stats(c,Pl,now){
  now=now||Date.now();const a=c.species?c.species.arch:null;const H=id=>hasT(c,id);
  const reg=regOf(Pl,c.region);const st=Pl.stations.find(s=>s.id===c.station)||Pl.stations[0];const W=weatherOf(reg,now);
  const o={reg,st,W,arch:a,H};
  const whistle=buffOn(c,'whistle',now)?2:1;
  o.tool=TOOLS[c.gear.tool];o.hard=o.tool.hard+(H('min2b')?1:0)+(a==='delve'?1:0)+(H('her3')&&a==='delve'?1:0);
  const wm=W.stat==='mining'?1+W.mag:1;
  o.dig=o.tool.pow*(H('min1')?1.2:1)*(a==='delve'?1.4:1)*reg.extract*wm*whistle*(buffOn(c,'worship',now)?1.6:1);
  o.adv=0.55*(a==='delve'?1.5:1)*(H('her2')&&a==='delve'?1.5:1);
  o.carry=5*(H('lab1')?1.25:1);o.walk=32*(H('lab1')?1.1:1)*whistle;
  o.liftCap=20*Math.pow(1.6,c.gear.lift)*(H('inf1')?1.2:1);o.liftSpd=70*(1+0.25*c.gear.lift)*(H('inf1')?1.2:1);
  const silo=H('inf2b')?1.6:1;o.yardCap=400*Math.pow(1.8,c.gear.yard)*silo;o.depotCap=300*Math.pow(1.8,c.gear.depot)*silo;
  o.chuteCap=60*(1+0.5*c.gear.lift);
  o.pCarry=6*(H('lab1')?1.25:1)*(H('lab4a')?2:1);o.pWalk=36*(H('lab1')?1.1:1)*whistle;
  o.refRate=0.6*(H('inf1')?1.15:1)*(H('inf4b')?1.6:1);o.hopCap=30;
  const sh=SHIPS[c.gear.ship];o.shipCap=sh.cap*(H('log1')?1.25:1)*(a==='haul'?1.25:1)*(H('her2')&&a==='haul'?1.3:1);o.shipSpd=sh.spd*(a==='haul'?1.3:1);
  const shipW=W.stat==='shipping'?1/(1+W.mag):1;o.trip=st.dist/o.shipSpd*shipW*(H('log2b')?0.7:1)*(H('her1')&&a==='haul'?0.8:1);
  o.pads=Math.min(4,c.gear.pads+(H('log4a')?1:0));o.shuttleEvery=a==='haul'?15:30;o.shuttleCap=SHUTTLE_CAP[c.gear.shuttle||1]+(H('wpn4b')?10:0);
  const pols=Math.min(10,c.crew.politicians||0);
  o.sell=(H('trd1')?1.08:1)*(a==='ledger'?1.1:1)*(H('her3')&&a==='ledger'?1.15:1)*(1+0.03*pols)*(W.stat==='prices'?1+W.mag:1)*(buffOn(c,'corner',now)?1.6:1);
  o.tax=H('trd4b')?0:st.tax;o.insure=H('log4b')?1.2:1;o.trophyPrice=H('wpn2b')?2:1;
  o.sHp=40*(1+0.25*c.gear.armor)*(a==='gore'?1.5:1)*(H('her1')&&a==='gore'?1.25:1);o.sDmg=(H('wpn1')?1.2:1)*(a==='gore'?1.25:1)*(H('her2')&&a==='gore'?1.5:1);o.frenzy=H('wpn4a');
  o.wpn=WEAPONS[c.gear.weapon];
  const tAcc=TRANSLATORS[c.gear.translator].acc;o.acc=Math.min(0.99,Math.max(tAcc,a==='choir'?0.82:0,H('cha2a')?0.5:0)+(H('cha2a')?0.15:0));
  o.relMult=(H('cha1')?1.3:1)*(a==='choir'?1.3:1)*(H('her2')&&a==='choir'?1.25:1);o.dealBonus=(H('cha2b')?0.2:0)+(a==='choir'?0.25:0);o.noWarFirst=H('cha5');
  o.robot=a==='clank';o.robotSpd=H('her1')&&a==='clank'?1.4:1;o.trophyMult=a==='gore'?2:1;
  o.revealDeps=a==='delve'||H('min4a');o.depYield=(H('min4a')?1.4:1)*(H('her1')&&a==='delve'?1.25:1);o.forecast=H('trd2a')||a==='ledger';
  o.raidMult=W.stat==='raids'?2:1;o.hazard=W.stat==='hazard'?W.fx:null;
  o.soldierCost=(a==='gore'?0.7:1)*(H('wpn4b')?0.6:1);
  o.noCaveIn=H('min4b')||(H('her3')&&a==='delve');o.union=H('lab2b');o.chant=H('lab4b');o.coreTap=H('min5');o.revive=H('lab5')?0.35:0;
  o.tamer=H('wpn2a');o.lullaby=H('her1')&&a==='choir';o.siren=H('her3')&&a==='choir';o.legend=H('her3')&&a==='gore'?2:1;o.headbutt=H('her2')&&a==='gore';o.selfRepair=H('her2')&&a==='clank'?0.5:0;
  o.worship=H('log2a');o.conveyor=H('inf2a');o.cranes=H('inf3');o.lifts=H('inf4a')?2:1;o.boom=H('inf4b');o.teleport=H('inf5')?0.3:0;
  o.factMul=H('her3')&&a==='clank'?3:1;o.factCap=H('her3')&&a==='clank'?2:1;o.psychic=H('her2')&&a==='ledger';
  o.cartCap=[0,20,45,100];o.cartSpd=[0,45,70,115];
  o.costMul=costMul(c);
  return o}
function shaftMult(c,SS,i){const sh=c.shafts[i]||{};let m=1+0.1*(sh.light||0);if(SS.coreTap&&i===c.levels-1)m*=2;return m}
function shipCapOf(SS,s){return s&&s.type==='cruiser'?SS.shipCap*0.35:SS.shipCap}
function shipTripOf(SS,s){return s&&s.type==='cruiser'?SS.trip/3:SS.trip}
function bestStationFor(c,Pl,SS,cargo,now){let best=SS.st,bv=-1;for(const st of Pl.stations){const S2=Object.assign({},SS,{st,tax:SS.H('trd4b')?0:st.tax});const v=cargoValue(c,Pl,S2,cargo,now);if(v>bv){bv=v;best=st}}return best}
function priceOf(c,Pl,SS,key,refined,now){const it=itemInfo(Pl,key);const st=SS.st;let p=it.value*(refined&&!it.trophy?3:1)*(it.trophy?SS.trophyPrice:1)*st.mult[it.cat]*drift(it.cat,st.id,now,Pl.id)*(1-SS.tax)*SS.sell;if(c.pump&&c.pump.until>now&&c.pump.cat===it.cat&&c.pump.st===st.id)p*=c.pump.mult||1.3;return p}
function cargoValue(c,Pl,SS,cargo,now){let v=0;for(const k in cargo){const refined=k[0]==='p';v+=cargo[k]*priceOf(c,Pl,SS,k.slice(2),refined,now)}return v}
function unitCount(c,k){return (c.crew[k]||0)+c.orders.filter(o=>o.k===k).length}
function crewCost(c,k,extra){const n=unitCount(c,k)+(extra||0);const m=costMul(c);
  if(k==='miners')return 15*Math.pow(1.07,n)*m;if(k==='porters')return 25*Math.pow(1.075,n)*m;
  if(UNITS[k])return UNITS[k].base*Math.pow(UNITS[k].r,n)*m*(k==='grenadiers'?stSoldierMul(c):1);
  return 40*Math.pow(1.075,n)*m*stSoldierMul(c)}
function stSoldierMul(c){return (c.species&&c.species.arch==='gore'?0.7:1)*(hasT(c,'wpn4b')?0.6:1)}
function crewBatch(c,k,want){let tot=0,n=0;const cap=UNITS[k]?UNITS[k].max-unitCount(c,k):500;const max=Math.min(cap,want==='max'?500:want);while(n<max){const p=crewCost(c,k,n);if(want==='max'&&tot+p>c.coin)break;tot+=p;n++}return{n:Math.max(want==='max'||cap<=0?0:1,n),cost:tot,capped:cap<=0}}
function shaftCost(i,c){return 250*Math.pow(2.5,i-1)*(c?costMul(c):1)}
function refCost(cat,lvl,c){return CAT[cat].build*Math.pow(1.7,lvl)*(c?costMul(c):1)}
function gearCost(c,k,l){let v=GEAR[k].cost(l)*costMul(c);if(k==='pads'&&hasT(c,'log4a'))v*=0.5;return v}
function deepestOpenLayer(c){return lvLayer(Math.max(0,c.levels-1))}
function soldiersAway(c){return c.parties.reduce((s,p)=>s+p.n,0)}
function minerPower(c,SS){return c.crew.miners*(SS.robot?1.2*SS.robotSpd:1)+2.5*(c.crew.brutes||0)+6*(c.crew.excavators||0)}

/* ================= steady-state throughput (offline + forecasts) ================= */
function throughput(c,Pl,SS){
  const reg=SS.reg;const faces=[];
  for(let i=0;i<c.levels;i++){const L=lvLayer(i);if(layerHard(reg,L)>SS.hard)continue;const hf=1/(1+0.25*(layerHard(reg,L)-1));const sh=c.shafts[i]||{};const sm=shaftMult(c,SS,i);
    for(const side of [-1,1]){const len=c.faces[i+(side>0?'R':'L')]||40;const mo=oreOf(Pl,reg.ores[L]),vo=oreOf(Pl,reg.ores[Math.min(4,L+1)]);const val=0.65*mo.value+0.35*vo.value*1.2*SS.depYield;
      const y=SS.dig*hf*sm;let cycle;if(sh.cart){cycle=SS.carry/y+0.4}else cycle=2*len/SS.walk+SS.carry/y+1.2;
      let cartRate=sh.cart?SS.cartCap[sh.cart]/(2*len/SS.cartSpd[sh.cart]+2.4):1e9;faces.push({k:i+(side>0?'R':'L'),i,val,rate:SS.carry/cycle,cartRate,len,ore:mo.id,vein:vo.id})}}
  faces.sort((a,b)=>b.val*b.rate-a.val*a.rate);
  let m=minerPower(c,SS),mined=0,val=0;const per={};
  for(const f of faces){if(m<=0)break;const n=Math.min(m,8);let r=0;for(let k=0;k<Math.ceil(n);k++)r+=f.rate/(1+0.1*k)*Math.min(1,n-k);r=Math.min(r,f.cartRate);mined+=r;val+=r*f.val;per[f.k]={n,r,ore:f.ore,vein:f.vein};m-=n}
  const avgVal=mined>0?val/mined:1;
  const used=faces.filter(f=>per[f.k]);const avgDepth=used.length?used.reduce((s,f)=>s+lvY(f.i),0)/used.length:60;
  const lift=SS.lifts*SS.liftCap/(2*avgDepth/SS.liftSpd+2.6)+mined*SS.teleport+(c.crew.porters>0?0:0);
  const flow=Math.min(mined,lift);
  let refCap=0;for(const k of CATS)refCap+=(c.ref[k]||0)*SS.refRate;const refShare=flow>0?Math.min(1,refCap/flow):0;
  const porterTrips=c.crew.porters*SS.pCarry/(2*650/SS.pWalk+1.3);
  const crane=SS.cranes?SS.pads*4*(1+c.gear.ship*0.5):0;const belt=SS.conveyor?refCap:0;
  const moves=flow*(1+refShare)-Math.min(flow*refShare,belt)-Math.min(flow,crane);const porterFlow=moves>0?flow*porterTrips/moves:1e9;
  let shipRate=0;for(const s of c.ships){shipRate+=shipCapOf(SS,s)/(shipTripOf(SS,s)+9)}
  const padRate=SS.pads*SS.shipCap/(9+SS.shipCap/40);const ships=Math.min(shipRate,padRate);
  const units=Math.min(flow,porterFlow,ships);
  const mult=SS.st.mult?((SS.st.mult.metal+SS.st.mult.crystal+SS.st.mult.gas+SS.st.mult.organic)/4):1;
  const coin=units*avgVal*(refShare*3+(1-refShare))*mult*(1-SS.tax)*SS.sell*SS.insure;
  const bn=units===mined?'miners':units===lift?'lift':units===porterFlow?'porters':ships===padRate&&shipRate>padRate?'pads':'ships';
  return{mined,lift,refCap,porterFlow,ships,units,coin,avgVal,per,bottleneck:bn}}

/* ================= colony runtime: tangible simulation ================= */
function genDeposits(c,Pl){
  const reg=regOf(Pl,c.region);const R=rng(hash(c.uid+Pl.id+c.region+(c.prestiges||0)));const out=[];
  for(let i=0;i<NLV;i++){const L=lvLayer(i);const vein=reg.ores[Math.min(4,L+1)];
    for(const side of [-1,1]){let d=80+R()*90;for(let k=0;k<6;k++){const r=20+R()*22;const amt=Math.round((70+R()*150)*(1+L*0.35));
      out.push({id:'d'+i+(side>0?'R':'L')+k,lvl:i,side,x:SX+side*(d+r),y:lvY(i)-TH/2,r,ore:R()<0.82?vein:reg.ores[L],amt});d+=2*r+100+R()*230;if(d>1380)break}}}
  for(let k=0;k<180;k++){const L=Math.floor(R()*5);out.push({id:'x'+k,deco:true,x:-150+R()*(SW+300),y:L*LH+12+R()*(LH-24),r:3+R()*9,ore:R()<0.7?reg.ores[L]:reg.ores[Math.min(4,L+1)]})}
  return out}
function mkLift(i){return{y:-6,st:'idle',lvl:0,cargo:{},t:0,i,x:i?SX-7:SX+5}}
function makeRT(c,mode){
  const rt={c,mode,own:mode==='own',u:[],projs:[],rags:[],parts:[],decals:[],pops:[],fx:[],podAnim:{},delivAnim:{},
    lifts:[mkLift(0)],shuttle:null,deps:[],depLine:{},depKey:'',uid:1,t:0,shake:0,carts:{},
    faces:[],fcount:{},inc:{},srcRes:{},refOn:{},refAcc:{},refDown:{},hazT:0,factT:0,battles:[],hostiles:[],tick:0,tick3:0,nav:null,crates:[],meteors:[],lava:[],
    belt:[],beltT:0,craneT:{},xfer:{},boomT:0,envT:0};
  rt.nav=NAV_SCENE;rt.st=stats(c,P(),Date.now());
  if(c.liftCargo){for(const k in c.liftCargo)addTo(c.raw,k,c.liftCargo[k]);c.liftCargo={}}
  rebuildDeps(rt);faceList(rt);populate(rt);return rt}
function rebuildDeps(rt){const c=rt.c,Pl=P();const k=c.uid+Pl.id+c.region+(c.prestiges||0);if(rt.depKey===k)return;rt.depKey=k;rt.deps=genDeposits(c,Pl);rt.depLine={};for(const d of rt.deps){if(d.deco)continue;const key=d.lvl+(d.side>0?'R':'L');(rt.depLine[key]||(rt.depLine[key]=[])).push(d)}rt.rock=null}

/* ---------- navigation: everything connects through the shaft ---------- */
function navStep(u,tx,ty,d){
  if(Math.abs(u.y-ty)<0.6){const dx=tx-u.x;u.climb=false;if(Math.abs(dx)<=d){u.x=tx;u.y=ty;return true}u.x+=Math.sign(dx)*d;u.dir=Math.sign(dx);return false}
  if(Math.abs(u.x-SX)>0.6){const dx=SX-u.x;const m=Math.min(Math.abs(dx),d);u.x+=Math.sign(dx)*m;u.dir=Math.sign(dx)||u.dir;u.climb=false;return false}
  const dy=ty-u.y;const m=Math.min(Math.abs(dy),d*0.75);u.y+=Math.sign(dy)*m;u.x=SX;u.climb=true;return false}
function navDist(a,b){if(Math.abs(a.y-b.y)<3)return Math.abs(a.x-b.x);return Math.abs(a.x-SX)+Math.abs(a.y-b.y)+Math.abs(b.x-SX)}
function losScene(a,b){return Math.abs(a.y-b.y)<4||(Math.abs(a.x-SX)<3&&Math.abs(b.x-SX)<3)}
const NAV_SCENE={step:navStep,dist:navDist,los:losScene};
const NAV_FLAT={step:(u,tx,ty,d)=>{const dx=tx-u.x;if(Math.abs(dx)<=d){u.x=tx;return true}u.x+=Math.sign(dx)*d;u.dir=Math.sign(dx);return false},dist:(a,b)=>Math.abs(a.x-b.x),los:()=>true};
function floorUnder(rt,x,y){if(rt.arena)return 0;if(Math.abs(y)<2)return 0;if(Math.abs(x-SX)<14){for(let i=0;i<rt.c.levels;i++){const ly=lvY(i);if(ly>=y-1)return ly}return lvY(Math.max(0,rt.c.levels-1))}return y}
function ceilAbove(rt,x,y){if(rt.arena||Math.abs(y)<2||Math.abs(x-SX)<14)return -3000;return y-TH}

/* ---------- units ---------- */
const CK_KIND={miners:'miner',brutes:'miner',excavators:'miner',porters:'porter',soldiers:'soldier',grenadiers:'soldier',politicians:'politician',envoys:'envoy'};
function mkUnit(rt,kind,x,y,extra){
  const st=rt.st,look=(rt.c.species&&rt.c.species.look)||ARCH.delve.look;
  const u=Object.assign({id:rt.uid++,kind,x,y,side:0,st:'idle',t:0,ph:Math.random()*10,dir:Math.random()<0.5?-1:1,cd:Math.random(),h:14,w:6,hp:20,maxhp:20,spd:30,skin:look.skin,head:look.head,accent:look.accent,sh:-1},extra||{});
  if(!u.ck)u.ck={miner:'miners',porter:'porters',soldier:'soldiers',politician:'politicians',envoy:'envoys'}[kind]||null;
  if(kind==='miner'){u.robot=st.robot&&u.ck==='miners';u.brute=u.ck==='brutes';u.exc=u.ck==='excavators';
    u.hp=u.maxhp=u.exc?260:u.brute?120:u.robot?8:20;u.spd=st.walk*(u.robot?1.1*st.robotSpd:1)*(u.exc?0.6:1);u.role=u.exc?'exc':u.brute?'brute':'miner';u.digMul=u.exc?6:u.brute?2.5:u.robot?1.2*st.robotSpd:1;u.carryMul=u.exc?4:u.brute?1.6:1;if(u.brute){u.h=19;u.w=8}if(u.exc){u.h=22;u.w=12}}
  if(kind==='porter'){u.spd=st.pWalk;u.role='porter'}
  if(kind==='soldier'){const gren=u.ck==='grenadiers';u.hp=u.maxhp=st.sHp;u.spd=42;u.fighter=true;u.role=gren?'grenadier':'soldier';u.wpn=gren?{type:'grenade',range:170,dmg:26*Math.pow(1.7,rt.c.gear.weapon-1),aoe:30,cd:2.4}:st.wpn;u.wt=rt.c.gear.weapon;u.dmgMul=st.sDmg;u.frenzy=st.frenzy}
  if(kind==='politician'){u.spd=26;u.role='politician'}
  if(kind==='envoy'){u.spd=30;u.role='envoy'}
  rt.u.push(u);return u}
function mkBeast(B,f,x,y,extra){const s=8+f.threat*3.2;const u=Object.assign({id:B.uid++,kind:'beast',fauna:f.id,x,y,side:1,st:'hunt',t:0,ph:Math.random()*9,dir:-1,cd:1,h:s*1.6,w:s,size:s,color:f.color,hp:25*Math.pow(f.threat,1.6),spd:20+4*(5-f.threat)+Math.random()*5,emerge:B.arena?0:2.5,fighter:true,kills:0,maxKills:1+f.threat,born:0,idle:0,name:f.name,threat:f.threat,
  wpn:{type:'melee',range:s*0.9+5,dmg:4+4*f.threat,cd:1}},extra||{});u.maxhp=u.hp;B.u.push(u);return u}
function mkPet(rt,f,x,y){const u=mkBeast(rt,f,x,y,{side:0,kind:'pet',st:'pen',emerge:0,ck:'pets'});u.hp=u.maxhp=u.maxhp*1.5;u.dir=1;return u}
function mkWarrior(B,tribe,wt,x,y,side,extra){const w=WEAPONS[clamp(wt,1,5)];const wpn=wt<=1?{type:'spear',range:110,dmg:8,cd:1.6}:{type:w.type,range:w.range,dmg:w.dmg*0.8,cd:w.cd*1.1,pellets:w.pellets,aoe:w.aoe};
  const u=Object.assign({id:B.uid++,kind:'warrior',tribe:tribe.id,x,y,side,st:'raid',t:0,ph:Math.random()*9,dir:side?-1:1,cd:Math.random()*1.5,h:15,w:6,hp:30+10*wt,spd:38,fighter:true,color:tribe.color,role:'warrior',wpn,wt},extra||{});u.maxhp=u.hp;B.u.push(u);return u}
function homeSoldiers(rt){return rt.u.filter(u=>u.kind==='soldier'&&u.ck==='soldiers'&&!u.dead&&!u.party)}
function populate(rt){const c=rt.c;
  for(const ck of CREW_KEYS){const n=ck==='soldiers'?Math.max(0,c.crew.soldiers-soldiersAway(c)):(c.crew[ck]||0);for(let i=0;i<n;i++)spawnCrew(rt,ck,true)}
  for(const p of (c.pets||[])){const f=faunaOf(P(),p.fauna);if(f)mkPet(rt,f,BARR_X+60+Math.random()*60,0)}}
function spawnCrew(rt,ck,initial){const kind=CK_KIND[ck];let u;
  if(kind==='miner'){u=mkUnit(rt,'miner',SX+(Math.random()-0.5)*20,0,{ck});u.st='arrive';if(initial&&rt.faces.length){const f=rt.faces[Math.floor(Math.random()*rt.faces.length)];u.x=SX+f.s*(10+Math.random()*Math.max(5,(rt.c.faces[f.k]||40)-14));u.y=lvY(f.i);u.st='assign'}}
  else if(kind==='porter'){u=mkUnit(rt,'porter',initial?1250+Math.random()*900:1300,0,{ck});u.st='idle';u.t=Math.random()}
  else if(kind==='soldier'){u=mkUnit(rt,'soldier',initial?BARR_X-50+Math.random()*100:BARR_X,0,{ck});u.st='bar';u.t=Math.random()*20}
  else if(kind==='politician'){u=mkUnit(rt,'politician',POL_X-20+Math.random()*40,0,{ck});u.st='speech';u.t=Math.random()*8}
  else if(kind==='envoy'){u=mkUnit(rt,'envoy',HAB_X+Math.random()*40,0,{ck});u.st='home';u.t=5+Math.random()*20}
  return u}
function reconcile(rt){const c=rt.c;
  for(const ck of CREW_KEYS){const want=ck==='soldiers'?Math.max(0,c.crew.soldiers-soldiersAway(c)):(c.crew[ck]||0);
    const list=rt.u.filter(u=>u.ck===ck&&!u.dead&&!u.party&&!u.gone&&u.kind!=='pet');let n=list.length;
    while(n<want){spawnCrew(rt,ck,false);n++}for(let i=0;n>want&&i<list.length;i++){list[list.length-1-i].gone=true;n--}}
  const pets=rt.u.filter(u=>u.kind==='pet'&&!u.dead&&!u.gone);if(pets.length<(c.pets||[]).length){for(const p of c.pets.slice(pets.length)){const f=faunaOf(P(),p.fauna);if(f)mkPet(rt,f,BARR_X+80,0)}}}
function refreshUnitStats(rt){const st=rt.st;for(const u of rt.u){if(u.kind==='soldier'){const r=u.hp/u.maxhp;u.maxhp=st.sHp;u.hp=r*st.sHp;if(u.role!=='grenadier')u.wpn=st.wpn;u.wt=rt.c.gear.weapon;u.dmgMul=st.sDmg;u.frenzy=st.frenzy}else if(u.kind==='miner'){u.spd=st.walk*(u.robot?1.1*st.robotSpd:1)*(u.exc?0.6:1)}else if(u.kind==='porter')u.spd=st.pWalk}}

/* ---------- shafts, faces, deposits ---------- */
function faceList(rt){const c=rt.c,reg=rt.st.reg,out=[];for(let i=0;i<c.levels;i++){const L=lvLayer(i);const h=layerHard(reg,L);if(h>rt.st.hard)continue;for(const s of [-1,1])out.push({i,s,k:i+(s>0?'R':'L'),L,h})}rt.faces=out;
  rt.fcount={};rt.shN={};for(const u of rt.u)if(u.kind==='miner'&&u.face&&(u.st==='go'||u.st==='mine'||u.st==='drop'||u.st==='clear'||u.st==='wait')){rt.fcount[u.face.k]=(rt.fcount[u.face.k]||0)+1;rt.shN[u.face.i]=(rt.shN[u.face.i]||0)+1}}
function validFace(rt,f){return f&&rt.faces.some(x=>x.k===f.k)}
function openShafts(rt){const s=new Set();for(const f of rt.faces)s.add(f.i);return [...s]}
function allocateMiners(rt){const c=rt.c;const open=openShafts(rt);const miners=rt.u.filter(u=>u.kind==='miner'&&!u.dead&&!u.gone);
  const have={};for(const u of miners){if(u.sh>=0&&!open.includes(u.sh)){u.sh=-1;u.st='assign'}if(u.sh>=0)have[u.sh]=(have[u.sh]||0)+1}
  for(const i of open){const want=c.shafts[i]&&c.shafts[i].want;if(want==null)continue;let n=have[i]||0;
    if(n>want){for(const u of miners){if(n<=want)break;if(u.sh===i){u.sh=-1;u.st='assign';u.face=null;n--}}}
    else if(n<want){const pool=miners.filter(u=>u.sh<0).sort((a,b)=>Math.abs(a.y-lvY(i))-Math.abs(b.y-lvY(i)));for(const u of pool){if(n>=want)break;u.sh=i;u.st='assign';u.face=null;n++}}
    have[i]=n}
  for(const u of miners)if(u.sh>=0&&(c.shafts[u.sh]||{}).want==null)u.sh=-1}
function autoShafts(rt){const c=rt.c;return openShafts(rt).filter(i=>!c.shafts[i]||c.shafts[i].want==null)}
function depAtFace(rt,f){const c=rt.c;const fx=SX+f.s*(c.faces[f.k]||40);for(const d of (rt.depLine[f.k]||[])){if(d.amt-(c.depl[d.id]||0)<=0)continue;if(Math.abs(fx-d.x)<=d.r+3)return d}return null}
function faceOre(rt,f){const d=depAtFace(rt,f);return d?{ore:d.ore,dep:d}:{ore:rt.st.reg.ores[f.L],dep:null}}
function faceRate(rt,f,fo,u){const c=rt.c,st=rt.st;let r=st.dig/(1+0.25*(f.h-1))*(fo&&fo.dep?1.3*st.depYield:1)*shaftMult(c,st,f.i);if(st.chant){const n=(rt.shN||{})[f.i]||0;r*=1+Math.min(0.4,Math.floor(n/4)*0.01)}return r*(u?u.digMul||1:1)}
function faceScore(rt,f){const len=rt.c.faces[f.k]||40;const fo=faceOre(rt,f);const o=oreOf(P(),fo.ore);const y=faceRate(rt,f,fo);const cart=(rt.c.shafts[f.i]||{}).cart;const cyc=cart?rt.st.carry/y+0.4:2*len/rt.st.walk+2*lvY(f.i)/(rt.st.walk*0.75)+rt.st.carry/y+1.2;return o.value*(fo.dep?rt.st.depYield:1)*rt.st.carry/cyc}
function pickFace(rt,u){const allow=u.sh>=0?[u.sh]:autoShafts(rt);let best=null,bs=-1;for(const f of rt.faces){if(!allow.includes(f.i))continue;const n=rt.fcount[f.k]||0;if(n>=8)continue;const sc=faceScore(rt,f)/(1+0.35*n);if(sc>bs){bs=sc;best=f}}if(best)rt.fcount[best.k]=(rt.fcount[best.k]||0)+1;return best}
function faceX(rt,f,u){return SX+f.s*Math.max(14,(rt.c.faces[f.k]||40)-5-(u.slot||0)*6)}
function rubbleOn(rt,f,tx){const r=rt.c.rubble[f.k];if(!r)return null;const rx=SX+f.s*r.d;if(f.s>0?rx<tx:rx>tx)return r;return null}

/* ---------- workers ---------- */
function workerDefend(rt,u,dt){if(!rt.hostiles.length)return false;const {h,d}=nearestHostile(rt,u);if(!h)return false;
  if(u.brute||u.exc){if(d<260){if(!u.wpn)u.wpn={type:'melee',range:12,dmg:u.exc?40:22,cd:0.9};u.fighter=true;u.side=0;if(fightStep(rt,u,dt))return true}return false}
  if(rt.st.union&&d<40){if(!u.wpn)u.wpn={type:'melee',range:10,dmg:5,cd:0.9};u.fighter=true;return fightStep(rt,u,dt)}
  return false}
function updMiner(rt,u,dt){
  const c=rt.c,st=rt.st;if(workerDefend(rt,u,dt))return;if(u.flee&&!u.brute&&!u.exc){fleeStep(rt,u,dt);return}
  const carry=st.carry*(u.carryMul||1);
  switch(u.st){
    case 'arrive':if(navStep(u,SX,0,u.spd*dt))u.st='assign';break;
    case 'assign':{const f=pickFace(rt,u);if(!f){u.st='idle';u.t=2;break}u.face=f;u.slot=(rt.fcount[f.k]||1)-1;u.st='go';break}
    case 'go':{const f=u.face;if(!validFace(rt,f)){u.st='assign';break}let tx=faceX(rt,f,u);const rb=rubbleOn(rt,f,tx);if(rb)tx=SX+f.s*(rb.d-6);if(navStep(u,tx,lvY(f.i),u.spd*dt)){u.st=rb?'clear':'mine';u.dir=f.s}break}
    case 'clear':{const f=u.face;const rb=c.rubble[f.k];if(!rb){u.st='go';break}const amt=faceRate(rt,f,null,u)*dt*1.5;rb.amt-=amt;if(Math.random()<dt*4)spark(rt,u.x+f.s*6,lvY(f.i)-6,'#9a8a7a');if(rb.amt<=0){delete c.rubble[f.k];pop(rt,u.x,u.y-20,'CLEARED','#5ee6a8',1)}break}
    case 'mine':{const f=u.face;if(!validFace(rt,f)){u.st='assign';break}
      const tx=faceX(rt,f,u);if(Math.abs(u.x-tx)>4||rubbleOn(rt,f,tx)){u.st='go';break}
      const fo=faceOre(rt,f);if(u.load&&u.load.ore!==fo.ore&&u.load.amt>0.5){u.st=(c.shafts[f.i]||{}).cart?'drop':'haul';break}
      const rate=faceRate(rt,f,fo,u);const amt=Math.min(rate*dt,carry-(u.load?u.load.amt:0));
      if(!u.load)u.load={ore:fo.ore,amt:0};u.load.ore=fo.ore;u.load.amt+=amt;
      if(fo.dep)addTo(c.depl,fo.dep.id,amt/(st.depYield||1));else c.faces[f.k]=Math.min(1420,(c.faces[f.k]||40)+amt*st.adv/(u.digMul||1)*Math.min(2,u.digMul||1));
      if(Math.random()<dt*2.5)spark(rt,SX+f.s*(c.faces[f.k]||40),lvY(f.i)-6-Math.random()*12,oreOf(P(),fo.ore).color);
      if(u.load.amt>=carry-0.01)u.st=(c.shafts[f.i]||{}).cart?'drop':'haul';break}
    case 'drop':{const f=u.face;if(!f){u.st='assign';break}const cap=st.cartCap[(c.shafts[f.i]||{}).cart||1]*2;const buf=c.fbuf[f.k]||(c.fbuf[f.k]={});
      if(!(c.shafts[f.i]||{}).cart){u.st='haul';break}
      if(!u.load||sumv(buf)+u.load.amt<=cap){if(u.load)addTo(buf,u.load.ore,u.load.amt);u.load=null;u.st='mine'}else{u.st='wait';u.t=1}break}
    case 'wait':u.t-=dt;if(u.t<=0)u.st='drop';break;
    case 'haul':{const f=u.face;if(!f){u.st='assign';break}if(navStep(u,SX+f.s*16,lvY(f.i),u.spd*dt)){if(!u.load){u.st='assign';break}if(dumpChute(rt,f.i,u.load.ore,u.load.amt)){u.load=null;u.st='assign'}else{u.st='full';u.t=1.5}}break}
    case 'full':u.t-=dt;if(u.t<=0)u.st='haul';break;
    case 'idle':u.t-=dt;if(u.t<=0)u.st='assign';if(!rt.faces.length||(u.sh<0&&!autoShafts(rt).length)){navStep(u,HAB_X-30+(u.id%9)*8,0,u.spd*0.5*dt)}break;
    default:u.st='assign'}}
function dumpChute(rt,i,ore,amt){const c=rt.c,st=rt.st;const ch=c.chute[i]||(c.chute[i]={});if(sumv(ch)+amt>st.chuteCap)return false;
  let a=amt;if(st.teleport){const space=st.yardCap-sumv(c.raw);const tp=Math.min(space,a*st.teleport);if(tp>0){addTo(c.raw,ore,tp);a-=tp;if(Math.random()<0.3){rt.fx.push({type:'tele',x:SX-24,y:lvY(i)-6,t:0.4})}}}
  addTo(ch,ore,a);return true}
function updCarts(rt,dt){const c=rt.c,st=rt.st;
  for(const f of rt.faces){const lv=(c.shafts[f.i]||{}).cart||0;if(!lv){delete rt.carts[f.k];continue}
    let k=rt.carts[f.k];if(!k)k=rt.carts[f.k]={d:18,st:'home',load:{},t:0};const len=Math.max(30,(c.faces[f.k]||40)-14);const spd=st.cartSpd[lv];const cap=st.cartCap[lv];const buf=c.fbuf[f.k]||{};
    const rb=c.rubble[f.k];const far=rb?Math.max(18,rb.d-10):len;
    if(k.st==='home'){k.t+=dt;if(sumv(buf)>=Math.min(cap*0.6,4)||(sumv(buf)>0.5&&k.t>3)){k.st='out';k.t=0}}
    else if(k.st==='out'){k.d=Math.min(far,k.d+spd*dt);if(k.d>=far-0.5){k.st='fill';k.t=0.5}}
    else if(k.st==='fill'){k.t-=dt;if(k.t<=0){let sp=cap-sumv(k.load);for(const o of Object.keys(buf)){if(sp<=0)break;const t=takeFrom(buf,o,sp);addTo(k.load,o,t);sp-=t}k.st='back'}}
    else if(k.st==='back'){k.d=Math.max(18,k.d-spd*dt);if(k.d<=18.5){k.st='dump';k.t=0.5}}
    else if(k.st==='dump'){k.t-=dt;if(k.t<=0){for(const o of Object.keys(k.load)){const a=k.load[o];const ch=c.chute[f.i]||(c.chute[f.i]={});const room=st.chuteCap-sumv(ch);const t=Math.min(a,room);if(t>0&&dumpChute(rt,f.i,o,t))k.load[o]-=t;if(k.load[o]<=0.01)delete k.load[o]}
      if(!Object.keys(k.load).length){k.st='home';k.t=0}else k.t=1}}}}

/* ---------- porters: always do the most valuable job available ---------- */
function yardSlot(rt,key){let i=rt.st.reg.ores.indexOf(key);if(i<0)i=5+(hash(key)%3);return 1428-i*46}
function depotKeys(rt){if(rt.dk)return rt.dk;const Pl=P();rt.dk=Object.keys(rt.c.prod).sort((a,b)=>(a[0]==='h')-(b[0]==='h')||(itemInfo(Pl,a).tier||0)-(itemInfo(Pl,b).tier||0)||(a<b?-1:1));return rt.dk}
function depotSlot(rt,key){const ks=depotKeys(rt);let i=ks.indexOf(key);if(i<0)i=ks.length;return 2090+Math.min(i,7)*30}
function stageX(p){return PAD_X[p]-64}
function dockedShip(rt,pad){return rt.c.ships.find(s=>s.st==='dock'&&s.pad===pad)}
function stageCap(rt){return rt.st.shipCap}
function avail(rt,pile,src,key){return (pile[key]||0)-(rt.srcRes[src+key]||0)}
function findJob(rt,u){
  const c=rt.c,st=rt.st,Pl=P();const now=Date.now();let best=null,bs=0;
  const pc=st.pCarry;const tm=(x0,y0,x1)=>{const a={x:u.x,y:u.y},b={x:x0,y:y0||0};return (navDist(a,b)+Math.abs(x1-x0))/Math.max(10,u.spd)+1.3};
  const yardFill=sumv(c.raw)/st.yardCap,depotFill=sumv(c.prod)/st.depotCap;
  const consider=(sc,j)=>{if(sc>bs){bs=sc;best=j}};
  // shippable goods, highest sale price first
  const goods=[];for(const key in c.prod){const a=avail(rt,c.prod,'prod:',key);if(a>=0.5)goods.push({src:'prod',key,a,price:priceOf(c,Pl,st,key,true,now),x0:depotSlot(rt,key)+6})}
  for(const key in c.raw){const a=avail(rt,c.raw,'raw:',key);if(a<0.5)continue;const it=itemInfo(Pl,key);const refinable=c.ref[it.cat]>0&&!rt.refDown[it.cat];if(refinable&&yardFill<0.75)continue;goods.push({src:'raw',key,a,price:priceOf(c,Pl,st,key,false,now),x0:yardSlot(rt,key)+6})}
  for(let p=0;p<st.pads;p++){const ship=dockedShip(rt,p);
    if(ship){const space=shipCapOf(st,ship)-sumv(ship.cargo)-(rt.inc['ship:'+p]||0)-sumv(c.stage[p]||{});if(space<1)continue;
      for(const g of goods){const amt=Math.min(pc,g.a,space);consider(amt*g.price*2/tm(g.x0,0,PAD_X[p]-40),{dst:'ship:'+p,src:g.src,key:g.key,x0:g.x0,x1:PAD_X[p]-40,amt})}}
    else{const space=stageCap(rt)-sumv(c.stage[p]||{})-(rt.inc['stage:'+p]||0);if(space<1)continue;
      for(const g of goods){const amt=Math.min(pc,g.a,space);consider(amt*g.price*1.1/tm(g.x0,0,stageX(p)),{dst:'stage:'+p,src:g.src,key:g.key,x0:g.x0,x1:stageX(p),amt})}}}
  if(depotFill<0.97){for(const k of CATS){if(!c.ref[k]||rt.refDown[k])continue;const space=st.hopCap*c.ref[k]-sumv(c.hopper[k]||{})-(rt.inc['ref:'+k]||0);if(space<1)continue;
    for(const key in c.raw){const it=itemInfo(Pl,key);if(it.cat!==k)continue;const a=avail(rt,c.raw,'raw:',key);if(a<0.5)continue;const amt=Math.min(pc,a,space);const gain=priceOf(c,Pl,st,key,true,now)-priceOf(c,Pl,st,key,false,now);
      consider(amt*gain*(yardFill>0.6?1.4:1)/tm(yardSlot(rt,key)+6,0,REF_X[k]-20),{dst:'ref:'+k,src:'raw',key,x0:yardSlot(rt,key)+6,x1:REF_X[k]-20,amt})}}}
  // help the lift: carry ore up the ladder when chutes are jammed
  if(yardFill<0.95){for(let i=0;i<c.levels;i++){const ch=c.chute[i]||{};const tot=sumv(ch)-(rt.srcRes['chute'+i]||0);if(tot<st.chuteCap*0.5||tot<pc)continue;const key=Object.keys(ch).sort((a,b)=>ch[b]-ch[a])[0];const amt=Math.min(pc,ch[key]||0);if(amt<1)continue;
    const t=tm(SX-24,lvY(i),SX)+lvY(i)*2/(u.spd*0.75);consider(amt*priceOf(c,Pl,st,key,false,now)*0.6/t,{dst:'yard',src:'chute'+i,key,x0:SX-22,y0:lvY(i),x1:yardSlot(rt,key)+6,amt,lvl:i})}}
  return best}
function reserve(rt,j){rt.inc[j.dst]=(rt.inc[j.dst]||0)+j.amt;const sk=j.src.startsWith('chute')?j.src:j.src+':'+j.key;rt.srcRes[sk]=(rt.srcRes[sk]||0)+j.amt;j.sk=sk;j.res=true}
function releaseJob(rt,u){const j=u.job;if(j&&j.res){rt.inc[j.dst]=Math.max(0,(rt.inc[j.dst]||0)-j.amt);if(!j.taken)rt.srcRes[j.sk]=Math.max(0,(rt.srcRes[j.sk]||0)-j.amt);j.res=false}}
function updPorter(rt,u,dt){
  const c=rt.c,st=rt.st;if(workerDefend(rt,u,dt))return;if(u.flee){if(u.job&&!u.carry){releaseJob(rt,u);u.job=null;u.st='idle';u.t=0.5}fleeStep(rt,u,dt);return}
  switch(u.st){
    case 'arrive':if(navStep(u,1250+Math.random()*60,0,u.spd*dt)){u.st='idle';u.t=0}break;
    case 'idle':u.t-=dt;if(u.t<=0){const j=findJob(rt,u);if(j){reserve(rt,j);u.job=j;u.st='toSrc';u.why=null}else{u.why=whyIdle(rt);const wx=u.why==='ships'?PAD_X[(u.id%Math.max(1,st.pads))]-90+Math.random()*30:1250+Math.random()*900;u.wx=wx;u.st='wander'}}break;
    case 'wander':if(navStep(u,u.wx,0,u.spd*0.35*dt)){u.st='idle';u.t=0.6+Math.random()*0.8}else if(Math.random()<dt*0.7){u.st='idle';u.t=0}break;
    case 'toSrc':{const j=u.job;if(!j){u.st='idle';u.t=0;break}if(navStep(u,j.x0,j.y0||0,u.spd*dt)){let pile,src=j.src;if(src==='raw')pile=c.raw;else if(src==='prod')pile=c.prod;else pile=c.chute[j.lvl]||{};
      j.taken=true;rt.srcRes[j.sk]=Math.max(0,(rt.srcRes[j.sk]||0)-j.amt);const amt=takeFrom(pile,j.key,j.amt);rt.dk=null;
      if(amt<=0.01){releaseJob(rt,u);u.job=null;u.st='idle';u.t=0.1;break}u.carry={key:j.key,amt,src:src==='prod'?'prod':'raw'};u.st='shovel';u.t=0.5;u.dir=1}break}
    case 'shovel':u.t-=dt;if(u.t<=0)u.st='toDst';break;
    case 'toDst':if(!u.job){u.carry=null;u.st='idle';u.t=0;break}if(navStep(u,u.job.x1,0,u.spd*dt)){deliverCarry(rt,u);u.st='dump';u.t=0.35}break;
    case 'dump':u.t-=dt;if(u.t<=0){u.st='idle';u.t=0}break;
    default:u.st='idle'}}
function deliverCarry(rt,u){const c=rt.c,j=u.job,cr=u.carry;releaseJob(rt,u);u.job=null;u.carry=null;if(!cr||!j)return;const pre=(cr.src==='raw'?'r:':'p:');
  if(j.dst.startsWith('ref:')){const k=j.dst.slice(4);const hop=c.hopper[k]||(c.hopper[k]={});addTo(hop,cr.key,cr.amt);puff(rt,REF_X[k]-14,-34,itemInfo(P(),cr.key).color,6,40,1.5,true)}
  else if(j.dst==='yard'){addTo(c.raw,cr.key,cr.amt);puff(rt,yardSlot(rt,cr.key),-4,itemInfo(P(),cr.key).color,4,40,1.4,true)}
  else if(j.dst.startsWith('ship:')){const p=+j.dst.slice(5);const s=dockedShip(rt,p);if(s){addTo(s.cargo,pre+cr.key,cr.amt);s.loadT=0}else{addTo(c.stage[p]||(c.stage[p]={}),pre+cr.key,cr.amt)}}
  else if(j.dst.startsWith('stage:')){const p=+j.dst.slice(6);const s=dockedShip(rt,p);if(s){addTo(s.cargo,pre+cr.key,cr.amt);s.loadT=0}else addTo(c.stage[p]||(c.stage[p]={}),pre+cr.key,cr.amt)}}
function whyIdle(rt){const c=rt.c,st=rt.st;const shippable=sumv(c.prod)+sumv(c.raw);
  let stagedFull=true;for(let p=0;p<st.pads;p++){const s=dockedShip(rt,p);if(s){if(sumv(s.cargo)<shipCapOf(st,s)-1)stagedFull=false}else if(sumv(c.stage[p]||{})<stageCap(rt)-1)stagedFull=false}
  if(shippable>5&&stagedFull)return 'ships';if(shippable<5)return 'nothing';return 'busy'}

/* ---------- machines ---------- */
function updLifts(rt,dt){const c=rt.c,st=rt.st;while(rt.lifts.length<st.lifts)rt.lifts.push(mkLift(rt.lifts.length));for(const L of rt.lifts)updLift(rt,L,dt)}
function updLift(rt,L,dt){const c=rt.c,st=rt.st;const top=-6;const other=rt.lifts.find(x=>x!==L);
  switch(L.st){
    case 'idle':{let best=-1,bv=0.5;for(let i=0;i<c.levels;i++){if(other&&other.st!=='idle'&&other.lvl===i&&other.st!=='up')continue;const v=sumv(c.chute[i]||{})-(rt.srcRes['chute'+i]||0);if(v>bv){bv=v;best=i}}if(best>=0&&sumv(c.raw)<st.yardCap-1){L.lvl=best;L.st='down'}break}
    case 'down':{const ty=lvY(L.lvl)-2;L.y=Math.min(ty,L.y+st.liftSpd*dt);if(L.y>=ty){L.st='load';L.t=1.1}break}
    case 'load':L.t-=dt;if(L.t<=0){const ch=c.chute[L.lvl]||{};let space=st.liftCap-sumv(L.cargo);for(const k of Object.keys(ch)){if(space<=0)break;const t=takeFrom(ch,k,Math.min(space,(ch[k]||0)));addTo(L.cargo,k,t);space-=t}
      let nx=-1;if(space>2){for(let i=L.lvl-1;i>=0;i--){if(sumv(c.chute[i]||{})>2){nx=i;break}}}if(nx>=0){L.lvl=nx;L.st='upstop'}else L.st='up'}break;
    case 'upstop':{const ty=lvY(L.lvl)-2;L.y=Math.max(ty,L.y-st.liftSpd*dt);if(L.y<=ty){L.st='load';L.t=0.9}break}
    case 'up':L.y=Math.max(top,L.y-st.liftSpd*dt);if(L.y<=top){L.st='unload';L.t=1.1}break;
    case 'unload':L.t-=dt;if(L.t<=0){let space=st.yardCap-sumv(c.raw);for(const k of Object.keys(L.cargo)){if(space<=0)break;const t=takeFrom(L.cargo,k,space);addTo(c.raw,k,t);space-=t;puff(rt,yardSlot(rt,k),-4,itemInfo(P(),k).color,4,50,1.6,true)}
      if(sumv(L.cargo)<0.01){L.cargo={};L.st='idle'}else L.t=1}break;
    default:L.st='idle'}}
function updRefineries(rt,dt){const c=rt.c,st=rt.st;const now=Date.now();
  for(const k of CATS){const lv=c.ref[k];if(rt.refDown[k]){rt.refDown[k]-=dt;if(rt.refDown[k]<=0)delete rt.refDown[k];rt.refOn[k]=0;continue}
    if(!lv){rt.refOn[k]=0;continue}const hop=c.hopper[k];if(!hop||!Object.keys(hop).length){rt.refOn[k]=Math.max(0,(rt.refOn[k]||0)-dt);continue}
    let cap=Math.min(st.refRate*lv*dt,st.depotCap-sumv(c.prod));if(cap<=0){rt.refOn[k]=0;continue}
    for(const key of Object.keys(hop)){if(cap<=0)break;const t=takeFrom(hop,key,cap);if(!c.prod[key])rt.dk=null;addTo(c.prod,key,t);cap-=t;rt.refAcc[k]=(rt.refAcc[k]||0)+t;if(rt.refAcc[k]>=6){rt.refAcc[k]=0;rt.crates.push({x:REF_X[k]+22,tx:depotSlot(rt,key)+8,col:itemInfo(P(),key).color,t:0})}}
    rt.refOn[k]=1;
    if(st.boom&&Math.random()<dt/(600*Math.max(1,CATS.filter(q=>c.ref[q]).length))){rt.refDown[k]=20;rt.shake=12;puff(rt,REF_X[k],-30,'#ffb347',50,260,4,false);puff(rt,REF_X[k],-30,'#ff3d7f',20,200,3,false);rt.fx.push({type:'boom',x:REF_X[k],y:-20,t:0.45,r:40});pop(rt,REF_X[k],-90,'KABOOM','#ff8a3d',2);
      for(const u of rt.u){if(u.dead||u.side!==0||Math.abs(u.y)>2)continue;if(Math.abs(u.x-REF_X[k])<42)hurt(rt,u,999,Math.sign(u.x-REF_X[k])||1,null,'meteor')}if(rt.own)addFeed(`{p}'s ${CAT[k].ref} exploded. Overclocking has consequences.`,'boom')}}
  // conveyor belt feeds hoppers straight from the yard
  if(st.conveyor){rt.beltT+=dt;for(const k of CATS){if(!c.ref[k]||rt.refDown[k])continue;const space=st.hopCap*c.ref[k]-sumv(c.hopper[k]||{});if(space<0.5)continue;let mv=Math.min(space,st.refRate*c.ref[k]*dt*1.2);
    for(const key in c.raw){if(mv<=0)break;if(itemInfo(P(),key).cat!==k)continue;const a=avail(rt,c.raw,'raw:',key);const t=takeFrom(c.raw,key,Math.min(mv,Math.max(0,a)));if(t>0){addTo(c.hopper[k]||(c.hopper[k]={}),key,t);mv-=t;if(rt.beltT>0.25){rt.beltT=0;rt.belt.push({x:1440,tx:REF_X[k]-26,col:itemInfo(P(),key).color,t:0})}}}}}
  for(const b of rt.belt)b.t+=dt;rt.belt=rt.belt.filter(b=>b.t<2.2)}
function freePad(rt){for(let p=0;p<rt.st.pads;p++){if(!rt.c.ships.some(s=>s.pad===p&&(s.st==='dock'||s.st==='land'||s.st==='launch')))return p}return -1}
function launchShip(rt,s,now){const c=rt.c,st=rt.st,Pl=P();if(!sumv(s.cargo))return;let SS=st;if(st.psychic){const best=bestStationFor(c,Pl,st,s.cargo,now);SS=Object.assign({},st,{st:best,tax:st.H('trd4b')?0:best.tax});s.dest=best.name}
  s.value=cargoValue(c,Pl,SS,s.cargo,now+shipTripOf(st,s)*500)*st.insure;if(c.smuggle>0){s.value*=1.8;c.smuggle--;s.smuggled=true}else s.smuggled=false;
  s.shipped=sumv(s.cargo);s.st='launch';s.anim=0;s.ret=now+shipTripOf(st,s)*1000+3000;c.trips=(c.trips||0)+1;rt.inc['ship:'+s.pad]=0;
  for(const u of rt.u)if(u.kind==='porter'&&u.job&&u.job.dst==='ship:'+s.pad&&!u.carry){releaseJob(rt,u);u.job=null;u.st='idle';u.t=0}
  worship(rt,now)}
function worship(rt,now){if(!rt.st.worship)return;rt.c.buffs.worship=now+20000;for(const u of rt.u){if(u.kind==='miner'&&Math.random()<0.15)pop(rt,u.x,u.y-22,pick(Math.random,['PRAISE','ROCKET!','WOO','HALLELUJAH']),'#ffd23f',1.4)}}
function updShips(rt,dt,now){const c=rt.c,st=rt.st;
  for(const s of c.ships){
    if(s.pad>=st.pads)s.pad=0;
    if(s.st==='dock'){s.loadT=(s.loadT||0)+dt;const cap=shipCapOf(st,s);
      // staged cargo swings aboard fast
      const stg=c.stage[s.pad];if(stg&&sumv(stg)>0.01&&sumv(s.cargo)<cap-0.01){let mv=Math.min(cap-sumv(s.cargo),(30+cap*0.25)*dt);for(const k of Object.keys(stg)){if(mv<=0)break;const t=takeFrom(stg,k,mv);addTo(s.cargo,k,t);mv-=t}s.loadT=0;rt.xfer[s.pad]=0.3}
      // loader cranes move goods from the depot
      if(st.cranes&&sumv(s.cargo)<cap-0.01){rt.craneT[s.pad]=(rt.craneT[s.pad]||0)+dt;let mv=Math.min(cap-sumv(s.cargo),4*(1+c.gear.ship*0.5)*dt);const ks=Object.keys(c.prod).sort((a,b)=>priceOf(c,P(),st,b,true,now)-priceOf(c,P(),st,a,true,now));
        for(const k of ks){if(mv<=0)break;const a=avail(rt,c.prod,'prod:',k);const t=takeFrom(c.prod,k,Math.min(mv,Math.max(0,a)));if(t>0){addTo(s.cargo,'p:'+k,t);mv-=t;s.loadT=0;rt.dk=null}}}
      if(rt.xfer[s.pad])rt.xfer[s.pad]=Math.max(0,rt.xfer[s.pad]-dt);
      const tot=sumv(s.cargo);if(tot>=cap-0.5||(c.autoLaunch&&tot>0&&((s.loadT>25&&tot>=cap*0.4)||s.loadT>60)))launchShip(rt,s,now)}
    else if(s.st==='launch'){s.anim+=dt;if(s.anim>=3){s.st='away';s.cargo={}}}
    else if(s.st==='away'){if(now>=s.ret){const p=freePad(rt);if(p>=0){s.pad=p;s.st='land';s.anim=0}else s.st='wait'}}
    else if(s.st==='wait'){const p=freePad(rt);if(p>=0){s.pad=p;s.st='land';s.anim=0}}
    else if(s.st==='land'){s.anim+=dt;if(s.anim>=3){s.st='dock';s.loadT=0;s.cargo={};worship(rt,now);if(s.value>0){if(rt.own){c.coin+=s.value;c.earned+=s.value}pop(rt,PAD_X[s.pad],-70,'+'+fmt(s.value)+(s.smuggled?' SMUGGLED':''),'#ffd23f',2.2);puff(rt,PAD_X[s.pad],-30,'#ffd23f',18,140,2,false)}s.value=0}}
    else s.st='dock'}}
function updShuttle(rt,dt,now){const c=rt.c,st=rt.st;let sh=rt.shuttle;
  if(!sh){if(rt.own&&c.orders.length&&now>=(c.nextShuttle||0))rt.shuttle={st:'down',y:-560,t:0,cap:Math.min(st.shuttleCap,c.orders.length),out:0};return}
  if(sh.st==='down'){sh.y=Math.min(-6,sh.y+(sh.y<-160?220:80)*dt);if(sh.y>=-6){sh.st='open';sh.t=0.6;puff(rt,DROP_X,-2,'#c8a080',14,90,3,true)}}
  else if(sh.st==='open'){sh.t-=dt;if(sh.t<=0){if(sh.out<sh.cap&&c.orders.length){const o=c.orders.shift();c.crew[o.k]=(c.crew[o.k]||0)+1;const u=spawnCrew(rt,o.k,false);u.x=DROP_X+(Math.random()-0.5)*16;if(u.kind==='miner'||u.kind==='porter')u.st='arrive';sh.out++;sh.t=Math.max(0.12,0.4-sh.cap*0.004)}else{sh.st='up'}}}
  else if(sh.st==='up'){sh.y-=(sh.y>-160?90:220)*dt;if(sh.y<-640){rt.shuttle=null;c.nextShuttle=now+st.shuttleEvery*1000}}}
function podTarget(k){if(k.startsWith('ref:'))return REF_X[k.slice(4)];return {tool:SX-80,lift:SX+60,yard:1300,depot:2160,weapon:BARR_X-30,armor:BARR_X+40,translator:ANT_X,ship:PAD_X[0]-90,factory:HAB_X-60,pads:PAD_X[1],shuttle:DROP_X+40}[k]||(k.startsWith('sh:')?SX+30:1500)}
function applyPod(rt,p){const c=rt.c;if(p.k.startsWith('ref:')){const k=p.k.slice(4);c.ref[k]=Math.max(c.ref[k]||0,p.lvl)}else if(p.k.startsWith('sh:')){const [,i,k]=p.k.split(':');const s=shaftCfg(c,+i);s[k]=Math.max(s[k]||0,p.lvl)}else c.gear[p.k]=Math.max(c.gear[p.k]||0,p.lvl);rt.st=stats(c,P(),Date.now());refreshUnitStats(rt);faceList(rt)}
function updPods(rt,dt){const c=rt.c;
  for(const p of c.pods){if(!rt.podAnim[p.id])rt.podAnim[p.id]={x:podTarget(p.k)+(Math.random()-0.5)*30,y:-600-Math.random()*150,st:'fall',t:0,k:p.k,lvl:p.lvl}}
  for(const id in rt.podAnim){const a=rt.podAnim[id];a.t+=dt;
    if(a.st==='fall'){a.y+=(a.y<-220?170:65)*dt;if(a.y>=-1){a.y=0;a.st='open';a.t=0;puff(rt,a.x,-2,'#c8a080',12,80,3,true);rt.shake=Math.max(rt.shake,3)}}
    else if(a.st==='open'&&a.t>1.2){const i=c.pods.findIndex(p=>p.id===id);if(i>=0){const p=c.pods[i];c.pods.splice(i,1);applyPod(rt,p);if(rt.own){toast(`Installed: ${podLabel(p)}`);markSave(300)}}puff(rt,a.x,-10,'#ffd23f',22,120,2,false);a.st='done';a.t=0}
    else if(a.st==='done'&&a.t>2.5)delete rt.podAnim[id]}}
function podLabel(p){if(p.k.startsWith('ref:'))return `${CAT[p.k.slice(4)].ref} level ${p.lvl}`;if(p.k.startsWith('sh:')){const [,i,k]=p.k.split(':');return `Shaft ${+i+1} ${SHAFT_UP[k].names[p.lvl]}`}const g=GEAR[p.k];return g?`${g.name(p.lvl)}`:p.k}
function updDeliveries(rt,dt,now){const c=rt.c;if(!c.deliv)return;
  for(const d of c.deliv){if(rt.delivAnim[d.id])continue;const fromL=d.side==='L';const tribe=tribeOf(P(),d.tribe);const n=Math.min(5,2+Math.floor((d.warriors||0)/2));const grp=[];
    for(let i=0;i<n;i++){const u={id:rt.uid++,kind:'carrier',x:fromL?-40-i*16:SW+40+i*16,y:0,side:2,st:'in',dir:fromL?1:-1,h:15,w:6,hp:1,maxhp:1,spd:34,ph:Math.random()*9,color:tribe?tribe.color:'#7ad1ff',role:'warrior',deliv:d.id,crate:true};rt.u.push(u);grp.push(u)}
    rt.delivAnim[d.id]={grp,t:0}}}
function arriveDelivery(rt,id){const c=rt.c;const i=(c.deliv||[]).findIndex(d=>d.id===id);if(i<0)return;const d=c.deliv[i];c.deliv.splice(i,1);
  if(d.coin){if(rt.own){c.coin+=d.coin}pop(rt,1300,-60,'+'+fmt(d.coin)+' coin','#ffd23f',2)}
  for(const k in (d.ore||{}))addTo(c.raw,k,d.ore[k]);for(const k in (d.prod||{})){addTo(c.prod,k,d.prod[k]);rt.dk=null}
  if(d.warriors){c.crew.soldiers+=d.warriors;for(let k=0;k<d.warriors;k++){const u=spawnCrew(rt,'soldiers',false);u.x=1300;u.merc=d.tribe}}
  if(d.workers){for(const k in d.workers){c.crew[k]=(c.crew[k]||0)+d.workers[k];for(let q=0;q<d.workers[k];q++){const u=spawnCrew(rt,k,false);u.x=1300}}}
  if(rt.own){toast(d.note||'A delivery arrived.');markSave(300)}}
function updCarrier(rt,u,dt){if(u.st==='in'){if(navStep(u,1320+(u.id%5)*12,0,u.spd*dt)){u.st='out';u.crate=false;if(rt.delivAnim[u.deliv]&&!rt.delivAnim[u.deliv].done){rt.delivAnim[u.deliv].done=true;arriveDelivery(rt,u.deliv)}}}
  else{const ex=u.dir>0?-60:SW+60;if(navStep(u,ex,0,u.spd*dt))u.gone=true}}

/* ---------- politicians, envoys, pets ---------- */
const SPEECH=['VOTE ORE!','JOBS! TEETH!','4 MORE PITS','TRUST ME','NO NEW TAXES','MINE MINE MINE','I LOVE ROCKS'];
function updPolitician(rt,u,dt){if(rt.hostiles.length){checkFlee(rt,u)}if(u.flee){fleeStep(rt,u,dt);return}u.t-=dt;
  const tx=POL_X-24+(u.id%5)*12;if(Math.abs(u.x-tx)>1){u.moving=true;navStep(u,tx,0,u.spd*dt)}else{u.moving=false;u.dir=(Math.floor(rt.t/3+u.ph)%2)?1:-1}
  if(u.t<=0){u.t=6+Math.random()*10;pop(rt,u.x,u.y-26,pick(Math.random,SPEECH),'#ffd23f',1.8)}}
function updEnvoy(rt,u,dt){if(u.st==='away'){u.t-=dt;u.hidden=true;if(u.t<=0){u.st='return';u.hidden=false;u.x=u.exitR?SW+40:-40}return}
  if(rt.hostiles.length)checkFlee(rt,u);if(u.flee){fleeStep(rt,u,dt);return}
  if(u.st==='home'){u.t-=dt;u.moving=false;if(u.t<=0){u.st='leave';u.exitR=Math.random()<0.5}}
  else if(u.st==='leave'){u.moving=true;if(navStep(u,u.exitR?SW+40:-40,0,u.spd*dt)){u.st='away';u.t=40+Math.random()*30}}
  else if(u.st==='return'){u.moving=true;if(navStep(u,HAB_X+(u.id%4)*14,0,u.spd*dt)){u.st='home';u.t=10+Math.random()*20;pop(rt,u.x,u.y-24,'THEY LIKE US','#ff9fd0',1.5)}}}
function updPet(rt,u,dt){if(rt.hostiles.length&&fightStep(rt,u,dt))return;u.t-=dt;u.moving=false;const tx=BARR_X+50+(u.id%6)*18;
  if(u.t<=0){u.t=3+Math.random()*6;u.wx=tx+(Math.random()-0.5)*40}if(u.wx!=null&&Math.abs(u.x-u.wx)>1){u.moving=true;navStep(u,u.wx,0,u.spd*0.4*dt)}}
function tame(rt,u){const c=rt.c;if((c.pets||[]).length>=6||u.kind!=='beast')return false;u.side=0;u.kind='pet';u.ck='pets';u.st='pen';u.tgt=0;u.hp=u.maxhp;u.hx=null;u.dir=1;c.pets.push({fauna:u.fauna});pop(rt,u.x,u.y-u.h-8,'TAMED!','#5ee6a8',1.8);if(rt.own){addFeed(`{p} tamed a ${u.name}. It lives at the barracks now.`,'gore');markSave(500)}return true}

/* ---------- events: monsters, cave-ins, raids, hazards ---------- */
function spawnBeasts(rt,now){const c=rt.c,Pl=P(),st=rt.st;const deep=deepestOpenLayer(c);const opts=Pl.fauna.filter(f=>f.kind==='cave'&&f.minLayer<=deep);if(!opts.length||!rt.faces.length)return;
  const w=opts.map(f=>1+f.minLayer*1.5);let r=Math.random()*w.reduce((a,b)=>a+b,0),f=opts[0];for(let i=0;i<opts.length;i++){r-=w[i];if(r<=0){f=opts[i];break}}
  let faces=rt.faces.filter(x=>x.L>=f.minLayer);if(!faces.length)faces=rt.faces;
  const fw=faces.map(x=>{const L=(c.shafts[x.i]||{}).light||0;return Math.max(0.05,(4-L)*(st.noCaveIn&&L===0&&st.H('min4b')?0.5:1))});let q=Math.random()*fw.reduce((a,b)=>a+b,0),fc=faces[0];for(let i=0;i<faces.length;i++){q-=fw[i];if(q<=0){fc=faces[i];break}}
  const n=f.threat<=2?2:1;const fx=SX+fc.s*(c.faces[fc.k]||40);
  for(let i=0;i<n;i++){const b=mkBeast(rt,f,fx-fc.s*(4+i*10),lvY(fc.i));b.hx=fx;b.hy=lvY(fc.i)}
  puff(rt,fx,lvY(fc.i)-10,'#8a7a6a',26,160,3,false);rt.shake=Math.max(rt.shake,6);
  rt.alarmMsg=`${n>1?n+' × ':''}${f.name} broke into shaft ${fc.i+1}!`;rt.alarmAt={x:fx,y:lvY(fc.i)};rt.alarmT=Date.now()}
function caveIn(rt,now){const c=rt.c,st=rt.st;if(st.noCaveIn)return;const cand=[];for(const f of rt.faces){const sup=(c.shafts[f.i]||{}).support||0;if(sup>=3)continue;const len=c.faces[f.k]||40;if(len<80)continue;cand.push({f,w:[1,0.5,0.2][sup]*(1+f.i*0.3)})}
  if(!cand.length)return;let q=Math.random()*cand.reduce((a,b)=>a+b.w,0),pk=cand[0];for(const x of cand){q-=x.w;if(q<=0){pk=x;break}}
  const f=pk.f;const len=c.faces[f.k]||40;const d=30+Math.random()*(len-50);const x=SX+f.s*d,y=lvY(f.i);
  c.rubble[f.k]={d,amt:40+f.i*10};rt.fx.push({type:'cavein',x,y,t:1.2});rt.shake=Math.max(rt.shake,10);for(let i=0;i<30;i++)rt.parts.push({x:x+(Math.random()-0.5)*36,y:y-TH-Math.random()*6,vx:(Math.random()-0.5)*30,vy:Math.random()*40,life:1.2,age:0,col:Math.random()<0.5?'#6b5a4a':'#8a7a6a',size:2+Math.random()*3,g:500,floor:y});
  let dead=0;for(const u of rt.u){if(u.dead||u.side!==0||Math.abs(u.y-y)>2)continue;if(Math.abs(u.x-x)<20&&!u.exc){hurt(rt,u,999,Math.sign(u.x-x)||1,null,'cavein');dead++}}
  pop(rt,x,y-30,'CAVE-IN!','#ff8a3d',2);rt.alarmMsg=`Cave-in in shaft ${f.i+1}${dead?`: ${dead} crushed`:''}. Better supports stop this.`;rt.alarmT=Date.now();rt.alarmAt={x,y};rt.alarmSoft=Date.now();
  if(rt.own&&dead>1)addFeed(`A cave-in crushed ${dead} of {p}'s miners. Supports are for cowards, apparently.`,'gore')}
function spawnRaid(rt,tribe,ts){const c=rt.c,st=rt.st;const n=clamp(2+Math.floor(ts.warriors/10),2,10);const fromL=tribe.village.x<c.base.x;const ex=fromL?-40:SW+40;
  for(let i=0;i<n;i++){const u=mkWarrior(rt,tribe,ts.wtier,ex+(fromL?-1:1)*i*18,0,1);u.ex=ex;u.st='raid';if(st.siren&&Math.random()<0.3)u.defect=3+Math.random()*4}
  if(st.noWarFirst){const ally=P().tribes.find(t=>c.tribes[t.id]&&c.tribes[t.id].st==='allied');if(ally){for(let i=0;i<3;i++){const w=mkWarrior(rt,ally,c.tribes[ally.id].wtier,(fromL?SW+40:-40)+(fromL?1:-1)*i*16,0,0);w.st='ally'}pop(rt,fromL?SW-200:200,-40,`${ally.people} ARRIVE!`,'#5ee6a8',2)}}
  rt.alarmMsg=`${tribe.name} war party (${n}) is raiding your settlement!`;rt.alarmAt={x:fromL?300:SW-300,y:0};rt.alarmT=Date.now();addFeed(`${tribe.name} raided {p}'s colony.`,'war')}
function updEvents(rt,dt,now){const c=rt.c,st=rt.st,Pl=P();
  if(!c.nextBeast)c.nextBeast=now+240e3;
  if(now>=c.nextBeast){if(c.levels>=1&&rt.hostiles.length<6)spawnBeasts(rt,now);c.nextBeast=now+(300+Math.random()*300)*1000/st.raidMult}
  if(!c.nextCave)c.nextCave=now+200e3;if(now>=c.nextCave){caveIn(rt,now);c.nextCave=now+(180+Math.random()*240)*1000}
  rt.envT+=dt;if(rt.envT>=60){rt.envT=0;const env=c.crew.envoys||0;
    for(const t of Pl.tribes){const ts=c.tribes[t.id];if(!ts||ts.st==='wiped')continue;if(env)ts.rel=clamp(ts.rel+env*(ts.st==='war'?0.5:1)*st.relMult,-100,100);
      if(st.H('cha4b')&&ts.st==='neutral'&&c.crew.soldiers>ts.warriors/3){ts.trib=(ts.trib||0)+1;if(ts.trib>=10){ts.trib=0;const amt=Math.round(dealScale(c)*0.3);(c.deliv||(c.deliv=[])).push({id:'tb'+now.toString(36)+t.id,side:t.village.x<c.base.x?'L':'R',tribe:t.id,coin:amt,note:`${t.name} paid ${fmt(amt)} coin in tribute. They looked nervous.`})}}
      if(st.H('cha4a')&&ts.st==='allied'){ts.cult=(ts.cult||0)+1;if(ts.cult>=15){ts.cult=0;(c.deliv||(c.deliv=[])).push({id:'cu'+now.toString(36)+t.id,side:t.village.x<c.base.x?'L':'R',tribe:t.id,workers:{miners:2,porters:1},note:`${t.name} sent 3 devoted workers. They brought snacks.`})}}}}
  for(const t of Pl.tribes){const ts=c.tribes[t.id];if(!ts)continue;
    if(ts.st==='war'&&ts.warriors>0){if(!ts.nextRaid)ts.nextRaid=now+150e3;if(now>=ts.nextRaid){spawnRaid(rt,t,ts);ts.nextRaid=now+(360+Math.random()*300)*1000;markSave(500)}}
    if(ts.st==='allied'){if(!ts.nextGift)ts.nextGift=now+15*60e3;if(now>=ts.nextGift){ts.nextGift=now+20*60e3;const reg=regOf(Pl,t.region);const ore=reg.ores[Math.floor(Math.random()*3)];(c.deliv||(c.deliv=[])).push({id:'g'+now.toString(36),side:t.village.x<c.base.x?'L':'R',tribe:t.id,ore:{[ore]:40+Math.round(Math.random()*60)},note:`${t.name} sent a gift of ${oreOf(Pl,ore).name}.`});markSave(500)}}}
  rt.hazT+=dt;
  if(st.hazard==='lava'&&rt.hazT>50){rt.hazT=0;const deep=c.levels-1;const vict=rt.u.filter(u=>u.kind==='miner'&&!u.dead&&Math.abs(u.y-lvY(deep))<2);rt.lava.push({lvl:deep,t:0});if(vict.length){const v=vict[Math.floor(Math.random()*vict.length)];hurt(rt,v,999,Math.random()<0.5?-1:1,null,'lava');pop(rt,v.x,v.y-30,'LAVA!','#ff8a3d',1.5)}}
  if(st.hazard==='meteor'&&rt.hazT>35){rt.hazT=0;rt.meteors.push({x:400+Math.random()*2400,y:-700,t:0})}}
function updHazardFx(rt,dt){for(const m of rt.meteors){m.t+=dt;m.y+=520*dt;m.x-=120*dt;if(m.y>=0&&!m.hit){m.hit=true;puff(rt,m.x,-4,'#ffb347',40,260,3,false);puff(rt,m.x,-4,'#5a4a4a',20,160,4,false);rt.shake=Math.max(rt.shake,10);rt.decals.push({x:m.x,y:0,r:22,col:'rgba(20,10,10,0.6)',t:0});
  for(const u of rt.u){if(u.dead||u.side!==0||Math.abs(u.y)>2)continue;if(Math.abs(u.x-m.x)<28)hurt(rt,u,999,Math.sign(u.x-m.x)||1,null,'meteor')}}}
  rt.meteors=rt.meteors.filter(m=>m.t<3);for(const l of rt.lava)l.t+=dt;rt.lava=rt.lava.filter(l=>l.t<4)}

/* ---------- abilities ---------- */
function useAbility(rt,k,arg){const c=rt.c,now=Date.now();const A=ABILITIES[k];if(!A||!hasAbility(c,k))return false;if((c.abil[k]||0)>now)return false;
  c.abil[k]=now+A.cd*1000;
  if(k==='whistle'){c.buffs.whistle=now+A.dur*1000;for(const u of rt.u)if((u.kind==='miner'||u.kind==='porter')&&Math.random()<0.2)pop(rt,u.x,u.y-22,'OVERTIME!','#ff8a3d',1.2);rt.st=stats(c,P(),now);refreshUnitStats(rt)}
  else if(k==='orbital'){let n=0;for(const u of rt.u){if(u.side===1&&!u.dead){rt.fx.push({type:'beam',x1:u.x,y1:-900,x2:u.x,y2:u.y-6,t:0.5,col:'#ffd23f'});hurt(rt,u,99999,1,null,'meteor');n++}}rt.shake=20;pop(rt,SX,-160,n?`MOM DELETED ${n}`:'MOM SAYS HI','#ffd23f',2.4)}
  else if(k==='smuggle'){c.smuggle=3;pop(rt,PAD_X[0],-110,'SMUGGLER MODE','#ffd23f',2)}
  else if(k==='pump'){const cat=arg||CATS[0];c.pump={cat,st:c.station,until:now+A.dur*1000,mult:c.species&&c.species.arch==='ledger'&&hasT(c,'her1')?1.5:1.3}}
  else if(k==='corner'){c.buffs.corner=now+A.dur*1000;pop(rt,PAD_X[0],-110,'MARKET CORNERED','#ffd23f',2)}
  else if(k==='dynamite'){let dead=0;for(const f of rt.faces){const x=SX+f.s*(c.faces[f.k]||40);rt.fx.push({type:'boom',x,y:lvY(f.i)-8,t:0.45,r:26});puff(rt,x,lvY(f.i)-8,'#ffb347',20,200,3,false);c.faces[f.k]=Math.min(1420,(c.faces[f.k]||40)+60);delete c.rubble[f.k]}
    const vic=rt.u.filter(u=>u.kind==='miner'&&!u.dead&&!u.exc&&u.st==='mine');for(let i=0;i<Math.min(vic.length,Math.floor(Math.random()*3));i++){hurt(rt,vic[Math.floor(Math.random()*vic.length)],999,1,null,'meteor');dead++}
    rt.shake=18;pop(rt,SX,lvY(0)-30,dead?`BOOM (${dead} oops)`:'BOOM','#ff8a3d',2)}
  if(rt.own){markSave(300)}return true}

/* ---------- flee ---------- */
function nearestHostile(rt,u){let b=null,bd=1e9;for(const h of rt.hostiles){const d=navDist(u,h);if(d<bd){bd=d;b=h}}return{h:b,d:bd}}
function checkFlee(rt,u){if(!rt.hostiles.length||rt.st.union&&(u.kind==='miner'||u.kind==='porter')||u.exc||u.brute){u.flee=false;return}const {d}=nearestHostile(rt,u);if(d<150)u.flee=true;else if(u.flee&&d>280)u.flee=false}
function fleeStep(rt,u,dt){const {h}=nearestHostile(rt,u);if(!h){u.flee=false;return}
  if(u.y>2){navStep(u,HAB_X,0,u.spd*1.5*dt);return}
  const away=u.x<h.x?-1:1;const tx=clamp(u.x+away*120,40,SW-40);navStep(u,tx,0,u.spd*1.25*dt)}

/* ---------- master update ---------- */
function updateRT(rt,dt,now){
  const c=rt.c,Pl=P();if(!Pl)return;rt.st=stats(c,Pl,now);rt.t+=dt;rebuildDeps(rt);
  rt.tick+=dt;if(rt.tick>1){rt.tick=0;faceList(rt);reconcile(rt);allocateMiners(rt);rt.dk=null}
  rt.hostiles=rt.u.filter(u=>u.side===1&&!u.dead);
  if(c.shaftJob&&now>=c.shaftJob.until){c.levels=Math.max(c.levels,c.shaftJob.i+1);if(rt.own){toast(`Shaft ${c.shaftJob.i+1} open: ${Pl.layers[lvLayer(c.shaftJob.i)].name}`);markSave(300)}c.shaftJob=null;faceList(rt)}
  if(rt.own&&rt.st.robot&&c.gear.factory>0){rt.factT+=dt;const iv=Math.max(3,30/c.gear.factory);const cap=(12+12*c.gear.factory)*rt.st.factCap;if(rt.factT>=iv){rt.factT=0;for(let q=0;q<rt.st.factMul&&c.crew.miners<cap;q++){c.crew.miners++;const u=spawnCrew(rt,'miners',false);u.x=HAB_X-60;puff(rt,HAB_X-60,-10,'#ffcc33',10,80,2,false)}}}
  updShuttle(rt,dt,now);updPods(rt,dt);updDeliveries(rt,dt,now);updLifts(rt,dt);updCarts(rt,dt);updRefineries(rt,dt);updShips(rt,dt,now);
  rt.tick3+=dt;const doFlee=rt.tick3>0.25;if(doFlee)rt.tick3=0;
  for(const u of rt.u){if(u.dead||u.gone)continue;
    if(u.kx){u.x+=u.kx*dt;u.kx*=Math.pow(0.02,dt);if(Math.abs(u.kx)<1)u.kx=0;clampToFloor(rt,u)}
    if(u.hitT)u.hitT=Math.max(0,u.hitT-dt);if(u.atkT)u.atkT=Math.max(0,u.atkT-dt);if(u.rise>0){u.rise-=dt;continue}
    switch(u.kind){
      case 'miner':if(doFlee)checkFlee(rt,u);updMiner(rt,u,dt);break;
      case 'porter':if(doFlee)checkFlee(rt,u);updPorter(rt,u,dt);break;
      case 'soldier':updSoldier(rt,u,dt);break;
      case 'beast':updBeast(rt,u,dt);break;
      case 'pet':updPet(rt,u,dt);break;
      case 'warrior':if(u.defect>0){u.defect-=dt;if(u.defect<=0){u.side=0;u.st='ally';u.tgt=0;pop(rt,u.x,u.y-24,'DEFECTED!','#5ee6a8',1.6)}}updWarrior(rt,u,dt);break;
      case 'politician':if(doFlee)checkFlee(rt,u);updPolitician(rt,u,dt);break;
      case 'envoy':updEnvoy(rt,u,dt);break;
      case 'carrier':updCarrier(rt,u,dt);break}}
  updCombatFx(rt,dt);updHazardFx(rt,dt);
  for(const cr of rt.crates){cr.t+=dt}rt.crates=rt.crates.filter(cr=>cr.t<1.4);
  if(rt.own){updEvents(rt,dt,now);updParties(rt,dt,now);updDrone(rt,dt)}
  for(const b of rt.battles)updBattle(rt,b,dt,now);rt.battles=rt.battles.filter(b=>!b.closed);
  rt.u=rt.u.filter(u=>!u.gone);rt.shake=Math.max(0,rt.shake*Math.pow(0.05,dt)-0.05)}
function clampToFloor(rt,u){if(rt.arena)return;if(Math.abs(u.y)<1){u.x=clamp(u.x,-80,SW+80);return}if(Math.abs(u.x-SX)<1&&!isOnLevel(u.y))return;const lv=levelOfY(u.y);if(lv<0)return;const lo=SX-(rt.c.faces[lv+'L']||40)+4,hi=SX+(rt.c.faces[lv+'R']||40)-4;u.x=clamp(u.x,lo,hi)}
function levelOfY(y){for(let i=0;i<NLV;i++)if(Math.abs(lvY(i)-y)<1)return i;return -1}
function isOnLevel(y){return levelOfY(y)>=0||Math.abs(y)<1}

/* ---------- live diagnosis: what is actually holding the colony back ---------- */
function diagnose(rt){const c=rt.c,st=rt.st;const yard=sumv(c.raw)/st.yardCap,depot=sumv(c.prod)/st.depotCap;
  const porters=rt.u.filter(u=>u.kind==='porter'&&!u.dead);const idle=porters.filter(u=>!u.job&&!u.carry);const why=idle.length?whyIdle(rt):'busy';
  const waiting=c.ships.filter(s=>s.st==='wait').length;let chFull=0;for(let i=0;i<c.levels;i++)if(sumv(c.chute[i]||{})>=st.chuteCap*0.95)chFull++;
  const miners=rt.u.filter(u=>u.kind==='miner'&&!u.dead);const stuck=miners.filter(u=>u.st==='full'||u.st==='wait').length;
  if(why==='ships'&&idle.length>=2)return{k:'ships',msg:`${idle.length} porters are waiting for ships. Every pad is stacked with cargo.${waiting?` ${waiting} ship${waiting>1?'s are':' is'} stuck in orbit waiting for a free pad: buy more launch pads.`:' Buy more ships, bigger ships, or Cruisers.'}`};
  if(waiting>0)return{k:'pads',msg:`${waiting} ship${waiting>1?'s are':' is'} circling in orbit because every pad is taken. Buy another launch pad.`};
  if(chFull&&yard<0.95)return{k:'lift',msg:`${chFull} shaft chute${chFull>1?'s are':' is'} full and ${stuck} miners are waiting. Upgrade the lift (Build) or add carts.`};
  if(yard>=0.97&&depot>=0.97)return{k:'storage',msg:'The ore yard and depot are both full. Ship faster, or expand storage.'};
  if(yard>=0.97)return{k:'yard',msg:'The ore yard is full, so the lift has stopped. Build or upgrade refineries, hire porters, or expand the yard.'};
  if(depot>=0.97)return{k:'depot',msg:'The depot is full, so refineries have stopped. Add ships or pads, or expand the depot.'};
  const walk=miners.filter(u=>u.st==='go'||u.st==='haul').length;if(miners.length>=6&&walk>miners.length*0.6){const noCart=[];for(let i=0;i<c.levels;i++)if((rt.shN||{})[i]&&!(c.shafts[i]||{}).cart)noCart.push(i+1);if(noCart.length)return{k:'walk',msg:`${walk} of ${miners.length} miners are walking, not digging. The tunnels are long. Buy mine carts for shaft${noCart.length>1?'s':''} ${noCart.join(', ')} in the Mine tab.`}}
  if(!idle.length&&porters.length&&(yard>0.5||depot>0.5))return{k:'porters',msg:'Every porter is busy and goods are piling up. Hire more porters.'};
  return{k:'miners',msg:'Goods are flowing. More diggers (or better tools and lights) means more coin.'}}

/* ================= combat, ragdolls, gore ================= */
const QUIPS=['SPLAT','OOF','YEET','CRUNCH','BONK','NOM','SQUELCH','KABLOOEY','RIP','SPLORT','THWACK','GG'];
function findTarget(B,u){const nav=B.nav;let b=null,bd=u.aggro||1e9;for(const v of B.u){if(v.dead||v.gone||v.side===u.side||v.side===2)continue;if(u.side===0&&v.side!==1)continue;let d=nav.dist(u,v);if(u.side===1&&v.kind==='soldier')d*=0.8;if(d<bd){bd=d;b=v}}return b}
function fightStep(B,u,dt){
  u.cd-=dt;let t=u.tgt?B.u.find(x=>x.id===u.tgt):null;u.retarget=(u.retarget||0)-dt;
  if(!t||t.dead||t.gone||u.retarget<=0){t=findTarget(B,u);u.tgt=t?t.id:0;u.retarget=0.6}
  if(!t)return false;
  const nav=B.nav,w=u.wpn;const d=nav.dist(u,t);
  const ok=d<=w.range*0.9&&(w.type==='melee'?Math.abs(u.y-t.y)<6:nav.los(u,t));
  if(!ok){nav.step(u,t.x,t.y,u.spd*dt*(u.side===0&&!B.arena?1.25:1));u.moving=true;return true}
  u.moving=false;u.climb=false;u.dir=Math.sign(t.x-u.x)||u.dir;if(u.cd<=0){attack(B,u,t);u.cd=w.cd*(0.85+Math.random()*0.3)}return true}
function attack(B,u,t){const w=u.wpn;let dmg=w.dmg*(u.dmgMul||1);const dir=Math.sign(t.x-u.x)||u.dir;u.atkT=0.25;
  if(!B.arena&&u.kind==='beast'&&B.st&&B.st.lullaby&&!u.lulled){u.lulled=true;if(Math.random()<0.15){pop(B,u.x,u.y-u.h-6,'zzz','#b892ff',1.6);tame(B,u);return}}
  let kb=1;if(w.type==='melee'&&u.kind==='soldier'&&B.st&&B.st.headbutt){dmg*=1.5;kb=3}
  const sx=u.x+dir*7,sy=u.y-u.h*0.6;
  switch(w.type){
    case 'melee':hurt(B,t,dmg*(0.8+Math.random()*0.4),dir*kb,u);break;
    case 'grenade':{const T=Math.max(0.5,Math.abs(t.x-sx)/170);const vx=(t.x-sx)/T,vy=((t.y-2)-sy)/T-0.5*360*T;B.projs.push({x:sx,y:sy,vx,vy,g:360,dmg,aoe:w.aoe||28,side:u.side,life:T+0.4,kind:'grenade',src:u.id,spin:0,fl:B.arena?0:Math.max(u.y,t.y)});break}
    case 'bullet':proj(B,u,sx,sy,t,{spd:480,dmg,kind:'bullet'});flash(B,sx,sy);break;
    case 'pellet':for(let i=0;i<(w.pellets||5);i++)proj(B,u,sx,sy,t,{spd:420,dmg,kind:'pellet',spread:(Math.random()-0.5)*0.4,life:w.range/420*1.3});flash(B,sx,sy);break;
    case 'beam':hurt(B,t,dmg,dir,u);B.fx.push({type:'beam',x1:sx,y1:sy,x2:t.x,y2:t.y-t.h*0.5,t:0.18,col:'#ff3d7f'});break;
    case 'strike':B.fx.push({type:'mark',x:t.x,y:t.y,t:0.8,dmg,aoe:w.aoe||34,side:u.side});break;
    case 'spear':{const T=Math.max(0.35,Math.abs(t.x-sx)/190);const vx=(t.x-sx)/T,vy=((t.y-t.h*0.5)-sy)/T-0.5*300*T;B.projs.push({x:sx,y:sy,vx,vy,g:300,dmg,side:u.side,life:T+0.3,kind:'spear',src:u.id});break}}}
function proj(B,u,x,y,t,o){const ang=Math.atan2((t.y-t.h*0.5)-y,t.x-x)+(o.spread||0);B.projs.push({x,y,vx:Math.cos(ang)*o.spd,vy:Math.sin(ang)*o.spd,dmg:o.dmg,side:u.side,life:o.life||1.2,kind:o.kind,src:u.id})}
function flash(B,x,y){B.parts.push({x,y,vx:0,vy:0,life:0.06,age:0,col:'#fff3a0',size:5,g:0,nofloor:true})}
function hurt(B,v,dmg,dir,att,cause){if(v.dead||v.gone)return;v.hp-=dmg;v.hitT=0.14;v.kx=(v.kx||0)+dir*Math.min(90*Math.max(1,Math.abs(dir)),dmg*2.5*Math.abs(dir));dir=Math.sign(dir)||1;
  if(!B.arena&&v.kind==='beast'&&v.side===1&&B.st&&B.st.tamer&&!v.tameRoll&&v.hp>0&&v.hp<v.maxhp*0.3){v.tameRoll=true;if(Math.random()<0.25){tame(B,v);return}}
  blood(B,v.x,v.y-v.h*0.55,dir,Math.min(16,2+dmg/3),v.kind==='beast'||v.kind==='pet'?(v.color||'#ff3d7f'):v.robot||v.exc?'#ffcc33':v.zombie?'#7bd95a':'#ff3d7f');
  if(v.hp<=0)kill(B,v,-v.hp,dir,att,cause)}
function kill(B,v,over,dir,att,cause){v.dead=true;v.gone=true;ragdoll(B,v,dir,over);
  B.decals.push({x:v.x,y:floorUnder(B,v.x,v.y),r:4+Math.min(10,over/6)+(v.size||6)*0.3,col:v.kind==='beast'?rgba(v.color||'#ff3d7f',0.75):(v.robot?'rgba(255,204,51,0.6)':'rgba(220,30,80,0.75)'),t:0});if(B.decals.length>140)B.decals.shift();
  if(over>25||cause==='meteor'||cause==='lava'){for(let i=0;i<5;i++)B.parts.push({x:v.x,y:v.y-v.h*0.5,vx:dir*(60+Math.random()*220)+(Math.random()-0.5)*160,vy:-120-Math.random()*220,life:2,age:0,col:i%2?'#ff3d7f':(v.color||v.skin||'#c66'),size:2.5+Math.random()*2.5,g:600,floor:floorUnder(B,v.x,v.y),blood:true,chunk:true})}
  pop(B,v.x,v.y-v.h-6,cause==='lava'?'SIZZLE':cause==='meteor'?'FLATTENED':QUIPS[Math.floor(Math.random()*QUIPS.length)],v.side===0?'#ff5a6e':'#ffd23f',1.2);
  if(att&&att.kind==='beast')att.kills++;
  if(att&&att.frenzy&&!att.dead){att.hp=Math.min(att.maxhp,att.hp+att.maxhp*0.3);att.fz=3;pop(B,att.x,att.y-att.h-10,'FRENZY','#ff3d7f',1)}
  if(B.arena){const tl=B.tally[v.side];tl[v.kind]=(tl[v.kind]||0)+1;return}
  onSceneDeath(B,v,att,cause)}
function onSceneDeath(rt,v,att,cause){const c=rt.c,Pl=P();if(!rt.own)return;const st=rt.st;
  if(v.side===0&&v.kind==='pet'){const i=(c.pets||[]).findIndex(p=>p.fauna===v.fauna);if(i>=0)c.pets.splice(i,1);c.deaths++;markSave(1500);return}
  if(v.side===0&&v.ck&&c.crew[v.ck]!=null){if(v.kind==='porter')releaseJob(rt,v);
    const rv=(v.kind==='miner'||v.kind==='porter')&&!v.exc?Math.max(st.revive,v.robot?st.selfRepair:0):0;
    if(rv&&Math.random()<rv&&cause!=='lava'){const z=spawnCrew(rt,v.ck,false);z.x=v.x;z.y=v.y;z.st=z.kind==='miner'?'assign':'idle';z.rise=1.6;z.zombie=!v.robot;z.skin=v.robot?z.skin:'#7bd95a';pop(rt,v.x,v.y-26,v.robot?'REBOOTED':'STILL ON SHIFT','#7bd95a',1.6);return}
    c.crew[v.ck]=Math.max(0,(c.crew[v.ck]||0)-1);c.deaths++;markSave(1500)}
  else if(v.kind==='beast'){const f=faunaOf(Pl,v.fauna);c.kills++;if(f){addTo(c.prod,'h:'+f.id,f.threat*2*rt.st.trophyMult);rt.dk=null;rt.crates.push({x:v.x,tx:depotSlot(rt,'h:'+f.id)+8,col:f.color,t:0,from:{x:v.x,y:v.y}});if(f.threat>=4){c.sp+=1;c.spLife=(c.spLife||0)+1;addFeed(`{p}'s soldiers turned a ${f.name} into modern art. The Maker awarded 1 SP.`,'gore')}}markSave(1500)}
  else if(v.kind==='warrior'){const ts=c.tribes[v.tribe];if(ts&&v.side===1)ts.warriors=Math.max(0,ts.warriors-1);if(v.loot&&v.loot.key){addTo(c.raw,v.loot.key,v.loot.amt)}markSave(1500)}}
function ragdoll(B,u,dir,over){
  const h=u.h||14,x=u.x,y=u.y;const beast=u.kind==='beast'||u.kind==='pet';let pts,sticks;
  if(!beast){pts=[[0,-h],[0,-h*0.74],[0,-h*0.38],[-h*0.3,-h*0.52],[h*0.3,-h*0.52],[-h*0.17,0],[h*0.17,0]];sticks=[[0,1],[1,2],[1,3],[1,4],[2,5],[2,6],[3,2],[4,2],[5,6]]}
  else{const s=u.size;pts=[[0,-s*0.9],[s*0.95,-s*1.15],[-s*0.7,-s*0.25],[-s*0.25,0],[s*0.35,0],[s*0.75,-s*0.25]];sticks=[[0,1],[0,2],[0,3],[0,4],[0,5],[1,5],[2,3]]}
  const sp=Math.min(1,0.4+over/60);const vx=dir*(1.2+Math.random()*2.2)*sp*(beast?0.6:1),vy=-(1.4+Math.random()*2.4)*sp*(beast?0.6:1);
  const Pp=pts.map(([px,py],i)=>{const X=x+px*(u.dir||1),Y=y+py;const j=(Math.random()-0.5)*1.4;return{x:X,y:Y,ox:X-vx-j,oy:Y-vy-(i===0?0.8:0)+j*0.5}});
  const St=sticks.map(([a,b])=>[a,b,Math.hypot(Pp[a].x-Pp[b].x,Pp[a].y-Pp[b].y)]);
  B.rags.push({p:Pp,s:St,beast,kind:u.kind,color:u.color,skin:u.skin,head:u.head,role:u.role,robot:u.robot,zombie:u.zombie,brute:u.brute,exc:u.exc,size:u.size,h,floor:floorUnder(B,x,y),ceil:ceilAbove(B,x,y),t:0});
  if(B.rags.length>50)B.rags.shift()}
function updRag(r,dt){r.t+=dt;if(r.t>40)return;const steps=2,g=900*(dt/steps)*(dt/steps);
  for(let s=0;s<steps;s++){
    for(const p of r.p){const vx=(p.x-p.ox)*0.992,vy=(p.y-p.oy)*0.992;p.ox=p.x;p.oy=p.y;p.x+=vx;p.y+=vy+g;
      if(p.y>r.floor){p.y=r.floor;p.ox=p.x-vx*0.55;p.oy=p.y+vy*0.25}if(p.y<r.ceil){p.y=r.ceil;p.oy=p.y+Math.abs(vy)*0.3}}
    for(let it=0;it<3;it++)for(const [a,b,len] of r.s){const A=r.p[a],Bp=r.p[b];const dx=Bp.x-A.x,dy=Bp.y-A.y;const d=Math.hypot(dx,dy)||0.001;const df=(d-len)/d*0.5;A.x+=dx*df;A.y+=dy*df;Bp.x-=dx*df;Bp.y-=dy*df}}}
function explode(B,x,y,r,dmg,side){B.shake=Math.max(B.shake||0,8);puff(B,x,y-4,'#ffb347',26,220,3,false);puff(B,x,y-4,'#5a4a4a',12,140,3,false);B.fx.push({type:'boom',x,y,t:0.45,r});
  for(const v of B.u){if(v.dead||v.gone||v.side===side||v.side===2)continue;if(Math.abs(v.x-x)<r&&Math.abs(v.y-y)<24)hurt(B,v,dmg,Math.sign(v.x-x)||1,null)}}
function puff(B,x,y,col,n,sp,size,ground){const fl=B.arena?0:floorUnder(B,x,y);for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=sp*(0.3+Math.random());B.parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-sp*0.4,life:0.5+Math.random()*0.8,age:0,col,size:size*(0.5+Math.random()),g:ground?150:400,floor:fl,nofloor:!ground})}if(B.parts.length>700)B.parts.splice(0,B.parts.length-700)}
function spark(B,x,y,col){B.parts.push({x,y,vx:(Math.random()-0.5)*140,vy:-30-Math.random()*90,life:0.35,age:0,col,size:1.5,g:400,nofloor:true})}
function blood(B,x,y,dir,n,col){const fl=floorUnder(B,x,y);for(let i=0;i<n;i++)B.parts.push({x,y,vx:dir*(40+Math.random()*170)+(Math.random()-0.5)*70,vy:-50-Math.random()*150,life:1.4,age:0,col,size:1+Math.random()*2.2,g:600,floor:fl,blood:true})}
function pop(B,x,y,text,col,life){B.pops.push({x,y,text,col,t:0,life:life||1.4});if(B.pops.length>30)B.pops.shift()}
function updCombatFx(B,dt){
  for(const p of B.projs){p.life-=dt;if(p.g)p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
    if(p.kind==='grenade'){const fl=p.fl||0;if(p.y>=fl-1||p.life<=0){p.life=0;explode(B,p.x,Math.min(p.y,fl),p.aoe,p.dmg,p.side)}continue}
    for(const v of B.u){if(v.dead||v.gone||v.side===p.side||v.side===2)continue;if(Math.abs(p.x-v.x)<(v.w||6)+1&&p.y>v.y-v.h-2&&p.y<v.y+2){hurt(B,v,p.dmg,Math.sign(p.vx)||1,B.u.find(x=>x.id===p.src));p.life=0;break}}
    if(!B.arena&&p.y>floorUnder(B,p.x,p.y)+1)p.life=0;if(B.arena&&p.y>2)p.life=0}
  B.projs=B.projs.filter(p=>p.life>0);
  for(const f of B.fx){f.t-=dt;if(f.type==='mark'&&f.t<=0&&!f.done){f.done=true;B.shake=Math.max(B.shake||0,12);puff(B,f.x,f.y-6,'#ffb347',40,280,3.5,false);puff(B,f.x,f.y-6,'#ff3d7f',20,200,3,false);
      for(const v of B.u){if(v.dead||v.gone||v.side===f.side||v.side===2)continue;if(Math.abs(v.x-f.x)<f.aoe&&Math.abs(v.y-f.y)<30)hurt(B,v,f.dmg,Math.sign(v.x-f.x)||1,null)}B.fx.push({type:'boom',x:f.x,y:f.y,t:0.45,r:f.aoe})}}
  B.fx=B.fx.filter(f=>f.t>0||(f.type==='mark'&&!f.done));
  for(const r of B.rags)updRag(r,dt);B.rags=B.rags.filter(r=>r.t<40);
  for(const p of B.parts){p.age+=dt;p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(!p.nofloor&&p.y>=p.floor){p.y=p.floor;if(p.blood){if(Math.random()<0.25&&B.decals.length<160)B.decals.push({x:p.x,y:p.floor,r:p.chunk?3:1.2+Math.random()*1.6,col:p.col,t:0});p.age=p.life}else{p.vy=0;p.vx*=0.8}}}
  B.parts=B.parts.filter(p=>p.age<p.life);
  for(const d of B.decals)d.t+=dt;if(B.decals.length>140)B.decals.splice(0,B.decals.length-140);B.decals=B.decals.filter(d=>d.t<240);
  for(const p of B.pops)p.t+=dt;B.pops=B.pops.filter(p=>p.t<p.life)}

/* ---------- scene behaviors ---------- */
function patrolPoint(rt){if(Math.random()<0.5||!rt.faces.length)return{x:300+Math.random()*2550,y:0};const f=rt.faces[Math.floor(Math.random()*rt.faces.length)];const len=rt.c.faces[f.k]||40;return{x:SX+f.s*(14+Math.random()*Math.max(1,len-24)),y:lvY(f.i)}}
function updSoldier(rt,u,dt){
  if(u.fz>0){u.fz-=dt;u.spd=60}else u.spd=42;
  if(u.party){if(navStep(u,-50,0,u.spd*dt))u.gone=true;return}
  if(rt.hostiles.length&&fightStep(rt,u,dt))return;
  if(u.carry){if(navStep(u,depotSlot(rt,u.carry.key)+8,0,u.spd*dt)){if(u.carry.key==='coin'){if(rt.own){rt.c.coin+=u.carry.amt;rt.c.earned+=u.carry.amt}pop(rt,u.x,-40,'+'+fmt(u.carry.amt),'#ffd23f',1.6)}else{addTo(rt.c.prod,u.carry.key,u.carry.amt);rt.dk=null}u.carry=null;u.st='bar';if(rt.own)markSave(800)}return}
  u.t-=dt;
  if(u.st==='bar'){const slot=u.id%10;const tx=BARR_X-75+slot*15;if(Math.abs(u.x-tx)>1||Math.abs(u.y)>1){navStep(u,tx,0,u.spd*0.7*dt);u.moving=true}else{u.moving=false;u.dir=(Math.floor(rt.t/2.5+u.ph)%2)?1:-1}
    if(u.t<=0){u.t=12+Math.random()*25;if(Math.random()<0.45){u.st='patrol';u.wps=2+Math.floor(Math.random()*3);u.wp=null}}}
  else if(u.st==='patrol'){if(!u.wp)u.wp=patrolPoint(rt);u.moving=true;if(navStep(u,u.wp.x,u.wp.y,u.spd*0.5*dt)){u.wp=null;u.wps--;u.t=2+Math.random()*3;u.st='pause';u.moving=false}}
  else if(u.st==='pause'){if(u.t<=0)u.st=u.wps>0?'patrol':'bar'}
  else u.st='bar'}
function updBeast(B,u,dt){
  if(u.st==='leave'){u.moving=true;if(B.nav.step(u,u.hx,u.hy,u.spd*dt)){u.gone=true;puff(B,u.x,u.y-8,'#8a7a6a',14,90,3,false)}return}
  if(u.st==='flee'){u.moving=true;u.x+=u.spd*1.3*dt;u.dir=1;if(u.x>520)u.gone=true;return}
  u.born=(u.born||0)+dt;if(u.emerge>0){u.emerge-=dt;u.moving=false;if(Math.random()<dt*8)puff(B,u.x,u.y-6,'#8a7a6a',2,60,2,false);return}
  if(!B.arena&&(u.kills>=u.maxKills||u.born>90||u.idle>8||(u.hp<u.maxhp*0.25&&Math.random()<dt*0.4))){u.st='leave';return}
  if(fightStep(B,u,dt))u.idle=0;else if(!B.arena){u.idle=(u.idle||0)+dt;u.moving=true;B.nav.step(u,SX,0,u.spd*0.4*dt)}}
function updWarrior(B,u,dt){
  if(B.arena||u.side===0){if(!fightStep(B,u,dt)){u.moving=false;if(!B.arena&&u.st==='ally'&&!B.hostiles.length){u.moving=true;const ex=u.x<SX?-60:SW+60;if(navStep(u,ex,0,u.spd*dt))u.gone=true}}return}
  if(u.loot){u.moving=true;if(navStep(u,u.ex,0,u.spd*dt)){u.gone=true;if(B.own&&u.loot.key)toast(`Raiders escaped with ${fmt(u.loot.amt)} ${itemInfo(P(),u.loot.key).name}.`)}return}
  if(u.hp<u.maxhp*0.3&&Math.random()<dt*0.25){u.loot={key:null,amt:0};return}
  u.aggro=240;if(fightStep(B,u,dt))return;
  let best=null,bv=0;for(const k in B.c.raw){if(B.c.raw[k]>bv){bv=B.c.raw[k];best=k}}
  if(!best){u.loot={key:null,amt:0};return}
  u.moving=true;if(navStep(u,yardSlot(B,best)+4,0,u.spd*dt)){const amt=takeFrom(B.c.raw,best,25);u.loot={key:best,amt};pop(B,u.x,-30,'YOINK','#ff5a6e',1.2)}}

/* ---------- field battles (hunts and invasions) ---------- */
function herdAvail(c,h,now){const k=c.herdKills[h.id];if(!k)return h.size;const back=Math.floor((now-k.t)/240000);return clamp(h.size-Math.max(0,k.n-back),0,h.size)}
function killHerd(c,h,n,now){const cur=h.size-herdAvail(c,h,now);c.herdKills[h.id]={n:Math.min(h.size,cur+n),t:now}}
function territoryAt(c,Pl,x,y){if(c.base&&Math.hypot(x-c.base.x,y-c.base.y)<95)return{own:true};const reg=regionAt(Pl,x,y);if(!reg.tribe)return{frontier:true,reg};const ts=c.tribes[reg.tribe];if(!ts||ts.st==='wiped')return{frontier:true,reg,wiped:true};return{tribe:reg.tribe,reg,ts,legal:ts.rights||ts.st==='allied'}}
function makeBattle(rt,p,now){const Pl=P(),c=rt.c;const reg=regionAt(Pl,p.x,p.y);
  const b={arena:true,kind:p.kind,party:p.id,region:reg.id,u:[],projs:[],rags:[],parts:[],decals:[],pops:[],fx:[],t:0,uid:1,nav:NAV_FLAT,shake:0,tally:{0:{},1:{}},closed:false,own:false,c,st:rt.st,title:''};
  for(let i=0;i<p.n;i++){const u=mkUnit(b,'soldier',-150-i*13-Math.random()*8,0);u.st='fight'}
  if(p.kind==='hunt'){const h=Pl.herds.find(x=>x.id===p.target.herd);const f=faunaOf(Pl,h.fauna);const k=Math.min(herdAvail(c,h,now),8);for(let i=0;i<k;i++)mkBeast(b,f,140+i*17+Math.random()*10,0);b.title=`${p.n} soldiers vs ${k} ${f.name}`;b.initial=k;
    const T=territoryAt(c,Pl,p.x,p.y);if(T.tribe){const t=tribeOf(Pl,T.tribe);if(T.ts.st==='allied'){for(let i=0;i<2;i++){const w=mkWarrior(b,t,T.ts.wtier,-200-i*14,0,0)}b.title+=` (+2 ${t.people} allies)`}
      else if(!T.ts.rights){b.illegal=true;b.tribe=t.id;const ch=T.ts.st==='war'?0.65:T.ts.rel<20?0.35:0.1;if(Math.random()<ch&&T.ts.warriors>0){const n=Math.min(T.ts.warriors,2+Math.floor(Math.random()*3));for(let i=0;i<n;i++)mkWarrior(b,t,T.ts.wtier,260+i*16,0,1);b.ambush=n;b.title+=` · AMBUSHED by ${n} ${t.people}`}}}}
  else if(p.kind==='war'){const t=tribeOf(Pl,p.target.tribe);const ts=c.tribes[t.id];const n=Math.min(ts.warriors,p.n+4,16);for(let i=0;i<n;i++)mkWarrior(b,t,ts.wtier,150+i*15+Math.random()*8,0,1);b.tribe=t.id;b.initial=n;b.title=`Assault on ${t.name}: ${p.n} vs ${n}`}
  rt.battles.push(b);return b}
function updBattle(rt,b,dt,now){b.t+=dt;b.shake=Math.max(0,(b.shake||0)*Math.pow(0.05,dt)-0.05);
  for(const u of b.u){if(u.dead||u.gone)continue;if(u.kx){u.x+=u.kx*dt;u.kx*=Math.pow(0.02,dt);if(Math.abs(u.kx)<1)u.kx=0}if(u.hitT)u.hitT=Math.max(0,u.hitT-dt);
    if(u.kind==='beast')updBeast(b,u,dt);else if(!fightStep(b,u,dt))u.moving=false}
  if(b.kind==='hunt'&&!b.done){const alive=b.u.filter(u=>u.kind==='beast'&&!u.dead&&!u.gone&&u.st!=='flee');if(b.initial>2&&alive.length&&alive.length<=Math.ceil(b.initial*0.3)&&b.u.some(u=>u.side===0&&!u.dead))for(const u of alive)u.st='flee'}
  updCombatFx(b,dt);b.u=b.u.filter(u=>!u.gone);
  const s0=b.u.filter(u=>u.side===0&&!u.dead).length,s1=b.u.filter(u=>u.side===1&&!u.dead&&u.st!=='flee').length;
  if(!b.done&&(s0===0||s1===0||b.t>150)){b.done=true;b.endT=b.t;b.won=s0>0&&s1===0;resolveBattle(rt,b,now)}
  if(b.done&&b.t>b.endT+8)b.closed=true}
function resolveBattle(rt,b,now){const alive=b.u.filter(u=>u.kind==='soldier'&&u.side===0&&!u.dead).length;applyFight(rt,b.party,{alive,kB:b.tally[1].beast||0,kW:b.tally[1].warrior||0,won:b.won,tribe:b.tribe,illegal:b.illegal,ambush:b.ambush},now)}
function applyFight(rt,pid,r,now){const c=rt.c,Pl=P();const p=c.parties.find(x=>x.id===pid);if(!p)return;
  const lost=Math.max(0,p.n-r.alive);c.crew.soldiers=Math.max(0,c.crew.soldiers-lost);c.deaths+=lost;p.lost=(p.lost||0)+lost;p.n=r.alive;
  if(p.kind==='hunt'){const h=Pl.herds.find(x=>x.id===p.target.herd);const f=h&&faunaOf(Pl,h.fauna);
    if(f&&r.kB){addTo(p.loot,'h:'+f.id,r.kB*f.threat*2*rt.st.trophyMult);killHerd(c,h,r.kB,now);c.kills+=r.kB;p.kills=(p.kills||0)+r.kB;if(f.threat>=5){c.sp+=2;c.spLife=(c.spLife||0)+2;addFeed(`{p} brought down a legendary ${f.name}. The Maker awarded 2 SP.`,'gore')}}
    if(r.tribe){const ts=c.tribes[r.tribe];const t=tribeOf(Pl,r.tribe);if(ts){ts.warriors=Math.max(0,ts.warriors-r.kW);if(r.illegal){ts.rel=clamp(ts.rel-3*r.kB-(r.ambush?10:0),-100,100);if(ts.rel<=-70&&ts.st==='neutral'){ts.st='war';ts.nextRaid=now+120e3;toast(`${t.name} declared war over your poaching!`,5000);addFeed(`${t.name} declared war on {p} for poaching.`,'war')}}}}
    if(rt.own)toast(r.alive?`Hunt over: ${r.kB} killed, ${lost} lost. Bringing trophies home.`:`Your hunting party was wiped out.`,4500)}
  else if(p.kind==='war'){const t=tribeOf(Pl,p.target.tribe);const ts=c.tribes[t.id];ts.warriors=Math.max(0,ts.warriors-r.kW);
    if(r.won&&r.alive>0){const plunder=Math.round((300+r.kW*120)*Math.pow(1.6,c.gear.weapon));if(ts.warriors<=0){ts.st='wiped';ts.rel=-100;addTo(p.loot,'coin',plunder*4);c.sp+=3;c.spLife=(c.spLife||0)+3;addFeed(`{p} wiped out ${t.name}. Their village is a crater. The Maker awarded 3 SP.`,'war');toast(`${t.name} is wiped out. Their land is yours to hunt.`,5000)}
      else{addTo(p.loot,'coin',plunder);addFeed(`{p} sacked a ${t.people} village and killed ${r.kW} warriors.`,'war');toast(`Village sacked. ${ts.warriors} ${t.people} warriors remain.`,4500)}}
    else if(rt.own){toast(r.alive?`The assault failed. ${lost} soldiers lost.`:`Your whole war party died.`,4500)}}
  if(p.n<=0)c.parties=c.parties.filter(x=>x.id!==p.id);else{p.st='back'}markSave(500)}
function soldierPower(st){const w=st.wpn;return (w.dmg*(w.pellets||1)*(w.type==='pellet'?0.6:1)*(w.aoe?2.2:1)/w.cd)*st.sDmg*st.sHp}
function beastPower(f){return 25*Math.pow(f.threat,1.6)*(4+4*f.threat)}
function warriorPower(wt){const w=WEAPONS[clamp(wt,1,5)];return (30+10*wt)*(wt<=1?8/1.6:w.dmg*0.8*(w.pellets||1)/(w.cd*1.1))}
function abstractFight(rt,p,now){const c=rt.c,Pl=P(),st=rt.st;let A=p.n*soldierPower(st),Bp=0,kB=0,kW=0,tribe=null,illegal=false,amb=0;
  if(p.kind==='hunt'){const h=Pl.herds.find(x=>x.id===p.target.herd);if(!h){p.st='back';return}const f=faunaOf(Pl,h.fauna);const k=Math.min(herdAvail(c,h,now),8);Bp=k*beastPower(f);const T=territoryAt(c,Pl,p.x,p.y);
    if(T.tribe&&!T.legal){illegal=true;tribe=T.tribe;if(Math.random()<(T.ts.st==='war'?0.65:T.ts.rel<20?0.35:0.1)){amb=Math.min(T.ts.warriors,3);Bp+=amb*warriorPower(T.ts.wtier)}}
    const won=A>Bp*0.9;const ratio=Bp/Math.max(1,A);const alive=won?Math.max(1,Math.round(p.n*(1-Math.min(0.8,ratio*0.5)))):Math.round(p.n*Math.max(0,0.5-ratio*0.3));kB=won?Math.max(1,Math.round(k*0.8)):Math.round(k*0.3);kW=won?amb:0;
    applyFight(rt,p.id,{alive,kB,kW,won,tribe,illegal,ambush:amb},now)}
  else{const t=tribeOf(Pl,p.target.tribe);const ts=c.tribes[t.id];const n=Math.min(ts.warriors,p.n+4,16);Bp=n*warriorPower(ts.wtier);const won=A>Bp;const ratio=Bp/Math.max(1,A);
    const alive=won?Math.max(1,Math.round(p.n*(1-Math.min(0.85,ratio*0.6)))):0;kW=won?n:Math.round(n*Math.min(1,A/Math.max(1,Bp))*0.6);applyFight(rt,p.id,{alive,kB:0,kW,won,tribe:t.id},now)}}

/* ================= planet map: fog, parties, drone ================= */
let FOG=null,FOGKEY='';
function fogArr(c){const key=c.uid+'|'+(c.planetId||'');if(!FOG||FOGKEY!==key){FOGKEY=key;FOG=new Uint8Array(FOGN*FOGN/8);const s=c.fog||'';for(let i=0;i<FOG.length&&i*2<s.length;i++)FOG[i]=parseInt(s.substr(i*2,2),16)||0}return FOG}
function fogSave(c){if(!FOG)return;let s='';for(let i=0;i<FOG.length;i++)s+=FOG[i].toString(16).padStart(2,'0');c.fog=s}
function fogSeen(c,x,y){const a=fogArr(c);const ix=clamp(Math.floor(x/MAPW*FOGN),0,FOGN-1),iy=clamp(Math.floor(y/MAPW*FOGN),0,FOGN-1);const i=iy*FOGN+ix;return (a[i>>3]>>(i&7))&1}
function reveal(c,x,y,r){const a=fogArr(c);const cs=MAPW/FOGN;let ch=false;for(let iy=Math.floor((y-r)/cs);iy<=Math.floor((y+r)/cs);iy++)for(let ix=Math.floor((x-r)/cs);ix<=Math.floor((x+r)/cs);ix++){if(ix<0||iy<0||ix>=FOGN||iy>=FOGN)continue;const cx=(ix+0.5)*cs,cy=(iy+0.5)*cs;if(Math.hypot(cx-x,cy-y)>r+cs*0.5)continue;const i=iy*FOGN+ix;if(!((a[i>>3]>>(i&7))&1)){a[i>>3]|=1<<(i&7);ch=true}}if(ch){S.fogDirty=true;S.mapDirty=true}}
function revealTribe(c,Pl,tid){const t=tribeOf(Pl,tid);const reg=regOf(Pl,t.region);for(let y=10;y<MAPW;y+=30)for(let x=10;x<MAPW;x+=30){if(regionAt(Pl,x,y)===reg)reveal(c,x,y,20)}}
function partyTarget(c,Pl,p,now){if(p.kind==='hunt'){const h=Pl.herds.find(x=>x.id===p.target.herd);return h?herdPos(h,now):null}if(p.kind==='war'){const t=tribeOf(Pl,p.target.tribe);return t?t.village:null}return null}
function sendParty(rt,kind,n,target){const c=rt.c;const home=homeSoldiers(rt).filter(u=>!u.carry);n=Math.min(n,home.length);if(n<1){toast('No soldiers at home to send.');return null}
  const p={id:'p'+Date.now().toString(36)+Math.floor(Math.random()*99),kind,n,x:c.base.x,y:c.base.y,st:'muster',t:5,target,loot:{},lost:0,kills:0,start:Date.now()};
  home.sort((a,b)=>Math.abs(a.x)-Math.abs(b.x)).slice(0,n).forEach(u=>{u.party=p.id;u.tgt=0});
  c.parties.push(p);markSave(400);return p}
function updParties(rt,dt,now){const c=rt.c,Pl=P();if(!c.base)return;
  for(const p of c.parties.slice()){
    if(p.st==='muster'){p.t-=dt;if(p.t<=0)p.st='out'}
    else if(p.st==='out'){const tp=partyTarget(c,Pl,p,now);if(!tp||(p.kind==='war'&&c.tribes[p.target.tribe].st==='wiped')){p.st='back';continue}
      const dx=tp.x-p.x,dy=tp.y-p.y,d=Math.hypot(dx,dy);reveal(c,p.x,p.y,48);
      if(d<10){if(p.kind==='hunt'){const h=Pl.herds.find(x=>x.id===p.target.herd);if(!h||herdAvail(c,h,now)<=0){p.st='back';toast('The herd was gone. Hunters are heading home.');continue}}p.st='fight';makeBattle(rt,p,now);if(rt.own){S.alertBattle={party:p.id,t:Date.now()}}}
      else{const m=Math.min(d,MAP_SPD*dt);p.x+=dx/d*m;p.y+=dy/d*m}}
    else if(p.st==='fight'){if(!rt.battles.some(b=>b.party===p.id))abstractFight(rt,p,now)}
    else if(p.st==='back'){const dx=c.base.x-p.x,dy=c.base.y-p.y,d=Math.hypot(dx,dy);if(d<8){partyHome(rt,p)}else{const m=Math.min(d,MAP_SPD*dt);p.x+=dx/d*m;p.y+=dy/d*m}}}
  if(c.army.auto){rt.autoT=(rt.autoT||0)-dt;if(rt.autoT<=0){rt.autoT=3;autoHunt(rt,now)}}}
function partyHome(rt,p){const c=rt.c;c.parties=c.parties.filter(x=>x.id!==p.id);const keys=Object.keys(p.loot);let li=0;
  for(let i=0;i<p.n;i++){const u=mkUnit(rt,'soldier',-40-i*14,0);u.st='bar';if(li<keys.length){const k=keys[li++];u.carry={key:k,amt:p.loot[k]}}}
  for(;li<keys.length;li++){if(keys[li]==='coin'){if(rt.own){c.coin+=p.loot.coin;c.earned+=p.loot.coin}}else{addTo(c.prod,keys[li],p.loot[keys[li]]);rt.dk=null}}
  if(rt.own){markSave(400);if(p.n)toast(`${p.n} soldiers are back${keys.length?' with loot':''}.`)}}
function autoHunt(rt,now){const c=rt.c,Pl=P();if(c.parties.some(p=>p.kind==='hunt'))return;const home=homeSoldiers(rt).filter(u=>!u.carry).length;if(home<c.army.size+c.army.keep||rt.hostiles.length)return;
  const allowed=Object.keys(c.army.targets).filter(k=>c.army.targets[k]);let best=null,bd=650;
  for(const h of Pl.herds){if(allowed.length&&!allowed.includes(h.fauna))continue;if(!allowed.length&&faunaOf(Pl,h.fauna).threat>3)continue;if(herdAvail(c,h,now)<=0)continue;const hp=herdPos(h,now);if(!fogSeen(c,hp.x,hp.y))continue;const T=territoryAt(c,Pl,hp.x,hp.y);if(T.tribe&&!T.legal)continue;const d=Math.hypot(hp.x-c.base.x,hp.y-c.base.y);if(d<bd){bd=d;best=h}}
  if(best){const p=sendParty(rt,'hunt',c.army.size,{herd:best.id});if(p)addFeedLocal(`Auto-hunt: ${p.n} soldiers left to hunt ${faunaOf(Pl,best.fauna).name}.`)}}
function updDrone(rt,dt){const c=rt.c;if(!c.base)return;if(!c.drone)c.drone={x:c.base.x,y:c.base.y,tx:c.base.x,ty:c.base.y};const d=c.drone;const dx=d.tx-d.x,dy=d.ty-d.y,dd=Math.hypot(dx,dy);if(dd>1){const m=Math.min(dd,30*dt);d.x+=dx/dd*m;d.y+=dy/dd*m}reveal(c,d.x,d.y,70)}
function scoutCost(c,x,y){const d=c.drone?Math.hypot(x-c.drone.x,y-c.drone.y):300;return Math.round((60+d*2.2)*costMul(c))}
function addFeedLocal(t){S.localLog=(S.localLog||[]);S.localLog.unshift({t:Date.now(),text:t});S.localLog=S.localLog.slice(0,20)}

/* ================= offline catch-up (summarized) ================= */
function catchUp(c,now){
  const Pl=P();if(!Pl||!c.landed)return null;const end=Math.min(now,monthEnd(S.world.month));let dt=(end-(c.lastTick||end))/1000;c.lastTick=now;if(dt<20)return null;dt=Math.min(dt,48*3600);
  const sum={secs:dt,earned:0,trips:0,beasts:0,kills:0,deaths:0,raids:0,raidLoss:0,hunts:0,trophies:0,hires:0};
  const SS=stats(c,Pl,now);
  // orders, pods, shaft jobs, deliveries finish while away
  if(c.orders.length){for(const o of c.orders){c.crew[o.k]=(c.crew[o.k]||0)+1;sum.hires++}c.orders=[]}
  for(const p of c.pods){if(p.k.startsWith('ref:'))c.ref[p.k.slice(4)]=Math.max(c.ref[p.k.slice(4)]||0,p.lvl);else if(p.k.startsWith('sh:')){const [,i,k]=p.k.split(':');const s=shaftCfg(c,+i);s[k]=Math.max(s[k]||0,p.lvl)}else c.gear[p.k]=Math.max(c.gear[p.k]||0,p.lvl)}c.pods=[];
  for(const k in (c.stage||{})){for(const q in c.stage[k]){addTo(q[0]==='p'?c.prod:c.raw,q.slice(2),c.stage[q]?0:c.stage[k][q])}c.stage[k]={}}
  if(c.shaftJob){c.levels=Math.max(c.levels,c.shaftJob.i+1);c.shaftJob=null}
  for(const d of (c.deliv||[])){if(d.coin)c.coin+=d.coin;for(const k in (d.ore||{}))addTo(c.raw,k,d.ore[k]);for(const k in (d.prod||{}))addTo(c.prod,k,d.prod[k]);if(d.warriors)c.crew.soldiers+=d.warriors}c.deliv=[];
  if(c.gear.factory>0&&SS.robot){const cap=(12+12*c.gear.factory)*SS.factCap;const add=Math.min(Math.max(0,cap-c.crew.miners),Math.floor(dt/Math.max(3,30/c.gear.factory)));c.crew.miners+=add;sum.hires+=add}
  // ships in flight return
  for(const s of c.ships){if((s.st==='away'||s.st==='launch')&&s.ret<=now){c.coin+=s.value||0;c.earned+=s.value||0;sum.earned+=s.value||0;s.value=0;s.st='dock';s.cargo={};s.pad=0;sum.trips++}else if(s.st==='land'){c.coin+=s.value||0;c.earned+=s.value||0;sum.earned+=s.value||0;s.value=0;s.st='dock';s.cargo={}}}
  {let p=0;c.ships.forEach(s=>{if(s.st==='dock'||s.st==='wait'){if(p<SS.pads){s.st='dock';s.pad=p++}else{s.st='wait';s.pad=0}}})}
  // steady-state production
  const tp=throughput(c,Pl,SS);const eff=0.85;sum.bottleneck=tp.bottleneck;const coin=tp.coin*dt*eff;c.coin+=coin;c.earned+=coin;sum.earned+=coin;sum.trips+=Math.floor(tp.units*dt/Math.max(1,SS.shipCap));c.trips=(c.trips||0)+sum.trips;
  // tunnels advance / veins deplete
  for(const k in tp.per){const per=tp.per[k];const amt=per.r*dt*eff;c.faces[k]=Math.min(1420,(c.faces[k]||40)+amt*0.55*SS.adv)}
  // cave monsters
  const deep=deepestOpenLayer(c);const cave=Pl.fauna.filter(f=>f.kind==='cave'&&f.minLayer<=deep);const nB=Math.floor(dt/360*SS.raidMult);const home=Math.max(0,c.crew.soldiers-soldiersAway(c));const pow=home*soldierPower(SS);
  for(let i=0;i<Math.min(nB,400)&&cave.length;i++){const f=cave[Math.floor(Math.random()*cave.length)];const n=f.threat<=2?2:1;sum.beasts++;
    if(pow>beastPower(f)*n*0.8){sum.kills+=n;c.kills+=n;addTo(c.prod,'h:'+f.id,f.threat*2*n*SS.trophyMult);sum.trophies+=n}else{const lost=Math.min(Math.max(0,c.crew.miners-1),f.threat+1);c.crew.miners-=lost;c.deaths+=lost;sum.deaths+=lost;if(home>0&&Math.random()<0.4){c.crew.soldiers--;c.deaths++;sum.deaths++}}}
  // tribe raids
  for(const t of Pl.tribes){const ts=c.tribes[t.id];if(!ts||ts.st!=='war'||ts.warriors<=0)continue;const n=Math.floor(dt/480);for(let i=0;i<Math.min(n,200);i++){sum.raids++;const w=clamp(2+Math.floor(ts.warriors/10),2,10);if(pow>w*warriorPower(ts.wtier)){ts.warriors=Math.max(0,ts.warriors-Math.ceil(w*0.6))}else{const lose=Math.min(c.crew.porters>1?2:0,c.crew.porters-1);c.crew.porters-=lose;c.deaths+=lose;sum.deaths+=lose;for(const k in c.raw){const tk=c.raw[k]*0.15;c.raw[k]-=tk;sum.raidLoss+=tk}}}}
  // parties
  const rt0={c,st:SS,own:true,battles:[],u:[]};
  for(const p of c.parties.slice()){if(p.st!=='back'){p.x=partyTarget(c,Pl,p,now)?.x??p.x;abstractFight(rt0,p,now);sum.hunts++}
    const q=c.parties.find(x=>x.id===p.id);if(q){c.parties=c.parties.filter(x=>x.id!==q.id);for(const k in q.loot){if(k==='coin'){c.coin+=q.loot.coin;c.earned+=q.loot.coin;sum.earned+=q.loot.coin}else addTo(c.prod,k,q.loot[k])}}}
  if(c.army.auto&&dt>600){const cycles=Math.min(200,Math.floor(dt/900));const hp=c.army.size*soldierPower(SS);const surf=Pl.fauna.filter(f=>f.kind==='surface'&&f.threat<=3&&(!Object.keys(c.army.targets).some(k=>c.army.targets[k])||c.army.targets[f.id]));
    for(let i=0;i<cycles&&surf.length&&c.crew.soldiers>=c.army.size+c.army.keep;i++){const f=surf[Math.floor(Math.random()*surf.length)];const k=3;sum.hunts++;if(hp>beastPower(f)*k){addTo(c.prod,'h:'+f.id,k*0.8*f.threat*2*SS.trophyMult);sum.trophies+=Math.round(k*0.8);c.kills+=2;if(Math.random()<0.3){c.crew.soldiers--;c.deaths++;sum.deaths++}}else{const l=Math.min(c.army.size,2);c.crew.soldiers-=l;c.deaths+=l;sum.deaths+=l}}
    const tv=sumv(Object.fromEntries(Object.entries(c.prod).filter(([k])=>k.startsWith('h:'))));}
  // trophies in depot get shipped over time: convert their value proportionally
  let trophyVal=0;for(const k in c.prod){if(k.startsWith('h:')){trophyVal+=c.prod[k]*priceOf(c,Pl,SS,k,true,now);delete c.prod[k]}}if(trophyVal>0){c.coin+=trophyVal*0.9;c.earned+=trophyVal*0.9;sum.earned+=trophyVal*0.9}
  // clamp piles to storage
  const clampPile=(o,cap)=>{const t=sumv(o);if(t>cap){const f=cap/t;for(const k in o)o[k]*=f}};clampPile(c.raw,SS.yardCap);clampPile(c.prod,SS.depotCap);
  c.crew.miners=Math.max(c.crew.miners,0);c.crew.soldiers=Math.max(c.crew.soldiers,0);c.crew.porters=Math.max(c.crew.porters,0);
  return sum}

/* ================= pixel renderer =================
   Every world scene is drawn into a low-resolution buffer (1 world unit = 1 art pixel at zoom 1)
   and blown up with nearest-neighbour scaling, so everything stays crisp, chunky pixel art. */
let DPR=1;
function ease(t){return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2}
function CAT_COL(k){return{metal:'#d08a52',crystal:'#7ad1ff',gas:'#9be37a',organic:'#ff7fb0',exotic:'#b892ff'}[k]}
const OUTLINE='#140c1c';
function mkTarget(){return{buf:null,g:null,lm:null,lg:null,bw:0,bh:0,ps:2,s:1,ox:0,oy:0,labels:[]}}
const MAIN_T=mkTarget(),ARENA_T=mkTarget();let PXC=MAIN_T;
function PXS(){return Math.max(2,Math.round(1.5*DPR))}
function snapS(s){if(s>=1)return Math.min(10,Math.round(s));return Math.max(0.125,Math.round(s*8)/8)}
function viewZ(cam){const ps=PXS();return snapS(cam.z/ps)*ps}
function ensureBuf(T,W,H){PXC=T;const ps=PXS();const bw=Math.max(8,Math.ceil(W/ps)),bh=Math.max(8,Math.ceil(H/ps));if(!T.buf){T.buf=document.createElement('canvas');T.lm=document.createElement('canvas')}
  if(T.buf.width!==bw||T.buf.height!==bh){T.buf.width=bw;T.buf.height=bh;T.lm.width=bw;T.lm.height=bh}T.g=T.buf.getContext('2d');T.lg=T.lm.getContext('2d');T.g.imageSmoothingEnabled=false;T.lg.imageSmoothingEnabled=false;T.bw=bw;T.bh=bh;T.ps=ps;T.labels=[];T.g.setTransform(1,0,0,1,0,0);T.g.globalAlpha=1;return T.g}
function setView(cx,cy,s){PXC.s=s;PXC.ox=Math.round(PXC.bw/2-cx*s);PXC.oy=Math.round(PXC.bh/2-cy*s)}
function bx(x){return Math.round(x*PXC.s+PXC.ox)}function by(y){return Math.round(y*PXC.s+PXC.oy)}
function pR(x,y,w,h,col){const x0=bx(x),y0=by(y),x1=bx(x+w),y1=by(y+h);PXC.g.fillStyle=col;PXC.g.fillRect(x0,y0,Math.max(1,x1-x0),Math.max(1,y1-y0))}
function pB(x,y,w,h,col,g){g=g||PXC.g;g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)))}
function pL(x0,y0,x1,y1,col,w){const g=PXC.g;g.fillStyle=col;const s=PXC.s;const X0=x0*s+PXC.ox,Y0=y0*s+PXC.oy,X1=x1*s+PXC.ox,Y1=y1*s+PXC.oy;const n=Math.max(1,Math.ceil(Math.max(Math.abs(X1-X0),Math.abs(Y1-Y0))));const ww=Math.max(1,Math.round(w||1));for(let i=0;i<=n;i++){const t=i/n;g.fillRect(Math.round(X0+(X1-X0)*t-ww/2),Math.round(Y0+(Y1-Y0)*t-ww/2),ww,ww)}}
function pD(x,y,r,col,g,screen){g=g||PXC.g;g.fillStyle=col;const cx=screen?x:x*PXC.s+PXC.ox,cy=screen?y:y*PXC.s+PXC.oy,rr=Math.max(0.6,screen?r:r*PXC.s);const R0=Math.ceil(rr);for(let dy=-R0;dy<=R0;dy++){const q=rr*rr-dy*dy;if(q<0)continue;const hw=Math.floor(Math.sqrt(q));g.fillRect(Math.round(cx-hw),Math.round(cy+dy),hw*2+1,1)}}
function pS(img,x,y,ax,ay,flip,k,alpha){if(!img)return;const s=PXC.s*(k||1);const w=Math.max(1,Math.round(img.width*s)),h=Math.max(1,Math.round(img.height*s));const X=Math.round(x*PXC.s+PXC.ox),Y=Math.round(y*PXC.s+PXC.oy);const g=PXC.g;if(alpha!=null)g.globalAlpha=alpha;
  if(flip){g.save();g.translate(X,Y);g.scale(-1,1);g.drawImage(img,-Math.round(ax*s),-Math.round(ay*s),w,h);g.restore()}else g.drawImage(img,X-Math.round(ax*s),Y-Math.round(ay*s),w,h);if(alpha!=null)g.globalAlpha=1}
function pT(x,y,text,col,big,box){PXC.labels.push({x:x*PXC.s+PXC.ox,y:y*PXC.s+PXC.oy,text,col:col||'#f4edff',big,box:box!==false})}
function present(g,W,H){const T=PXC;g.setTransform(1,0,0,1,0,0);g.imageSmoothingEnabled=false;g.drawImage(T.buf,0,0,T.bw*T.ps,T.bh*T.ps);
  g.textAlign='center';g.textBaseline='middle';for(const l of T.labels){const fs=Math.round((l.big?16:11)*DPR);g.font=`${l.big?700:600} ${fs}px 'Pixelify Sans','Silkscreen',monospace`;const X=Math.round(l.x*T.ps),Y=Math.round(l.y*T.ps);
    if(l.alpha!=null)g.globalAlpha=l.alpha;g.textAlign=l.left?'left':'center';if(l.box){const w=g.measureText(l.text).width;g.fillStyle='rgba(12,7,20,0.78)';g.fillRect(Math.round((l.left?X+w/2:X)-w/2-4*DPR),Math.round(Y-fs*0.62),Math.round(w+8*DPR),Math.round(fs*1.24))}
    else{g.fillStyle=OUTLINE;for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[1,1]])g.fillText(l.text,X+dx*DPR*1.5,Y+dy*DPR*1.5)}g.fillStyle=l.col;g.fillText(l.text,X,Y);g.globalAlpha=1}g.textAlign='left'}
function viewBounds(){return{x0:(-PXC.ox)/PXC.s,x1:(PXC.bw-PXC.ox)/PXC.s,y0:(-PXC.oy)/PXC.s,y1:(PXC.bh-PXC.oy)/PXC.s}}

/* ---------- sprite factory ---------- */
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
function excSprite(skin,f){const key='x|'+skin+'|'+f;let cv=SPRC.get(key);if(cv)return cv;const [c,g]=mkCv(32,30);const B=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x,y,w,h)};
  B(3,23,22,6,'#2a2430');for(let i=0;i<6;i++)B(4+i*4+(f%2?1:0),25,2,2,'#6a6a7a');B(5,13,18,10,'#e0b020');B(5,13,18,1,'#ffd860');for(let i=0;i<5;i++)B(6+i*4,21,2,2,'#2a2430');
  B(12,14,8,6,'#7ad1ff');B(14,15,3,3,skin);B(13,14,1,1,'#ffffff');B(8,6,2,7,'#5a5a66');if(f%2)B(7,4,3,2,'#9a9aa8');
  B(22,16,4,3,'#9aa7b8');for(let i=0;i<4;i++)B(26+i,15+(i%2)+(f%2?1:0)-(i>1?0:0),1,5-i,i%2?'#cfd6e0':'#7a8494');outline(c);SPRC.set(key,c);return c}
function beastSprite(f,frame,atk,pet){const key='b|'+f.id+'|'+f.color+'|'+frame+'|'+(atk?1:0)+'|'+(pet?1:0);let cv=SPRC.get(key);if(cv)return cv;
  const s0=8+f.threat*3.2;const W=Math.ceil(s0*2.7)+6,H=Math.ceil(s0*2)+6;const [c,g]=mkCv(W,H);const col=f.color,dk=sh(col,-0.35),lt=sh(col,0.25),plan=hash(f.id)%3;
  const P1=(x,y,cl)=>{g.fillStyle=cl;g.fillRect(Math.round(x),Math.round(y),1,1)};
  const ell=(cx,cy,rx,ry,cl,shade)=>{for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++){const q=((x-cx)/rx)**2+((y-cy)/ry)**2;if(q<=1){let k=cl;if(shade){const ty=(y-(cy-ry))/(2*ry);k=ty<0.3?lt:ty>0.75?dk:cl}P1(x,y,k)}}};
  const base=H-2;let hx,hy,hr;
  if(plan===1){const n=5;for(let i=0;i<n;i++){const r=s0*(0.42+0.12*i/n+0.1);const x=3+s0*0.5+i*s0*0.42;const y=base-r-Math.sin(i*1.3+frame*1.6)*1.5;ell(x,y,r,r*0.9,col,true);if(i===n-1){hx=x+r*0.3;hy=y;hr=r}}}
  else if(plan===2){const rx=s0*1.05,ry=s0*0.45;const cx=W*0.45,cy=base-s0*0.55-ry*0.5;for(let i=0;i<3;i++){const lx=cx-rx*0.6+i*rx*0.6;const sw=(frame+i)%2?2:-2;for(let k=0;k<6;k++){P1(lx+k*0.4+sw*k/6,cy+ry*0.6+k,dk)}for(let k=0;k<6;k++)P1(lx-k*0.3-sw*k/6+3,cy+ry*0.6+k,dk)}
    ell(cx,cy,rx,ry,col,true);hx=cx+rx*0.85;hy=cy;hr=ry*1.1;ell(hx,hy,hr,hr*0.9,col,true);P1(hx+hr,hy+1,'#f2ead8');P1(hx+hr+1,hy+2,'#f2ead8')}
  else{const legH=Math.max(2,Math.round(s0*0.38));const rx=s0*0.95,ry=s0*0.62;const cx=W*0.42,cy=base-legH-ry+2;const lw=Math.max(2,Math.round(s0*0.2));
    for(let i=0;i<4;i++){const lx=cx-rx*0.7+i*rx*0.45+((i+frame)%2?1:-1);g.fillStyle=dk;g.fillRect(Math.round(lx),Math.round(cy+ry*0.5),lw,Math.round(base-(cy+ry*0.5))+1)}
    ell(cx,cy,rx,ry,col,true);for(let x=cx-rx*0.6;x<cx+rx*0.5;x+=3){P1(x,cy-ry-1,dk);P1(x+1,cy-ry-2,dk);P1(x+1,cy-ry-1,dk)}
    P1(cx-rx-1,cy-1,dk);P1(cx-rx-2,cy-2,dk);P1(cx-rx-3,cy-2,col);
    hx=cx+rx*0.92;hy=cy-ry*0.25;hr=s0*0.5;ell(hx,hy,hr,hr,col,true)}
  // face
  const ey=hy-hr*0.35,ex=hx+hr*0.25;g.fillStyle='#ffffff';g.fillRect(Math.round(ex),Math.round(ey),2,2);P1(ex+1,ey+1,'#111');
  const my=hy+hr*0.3;const mo=atk?Math.max(2,Math.round(hr*0.5)):1;g.fillStyle='#2a0612';g.fillRect(Math.round(hx-hr*0.1),Math.round(my),Math.round(hr*1.1),mo);
  for(let x=Math.round(hx-hr*0.05);x<hx+hr;x+=2){P1(x,my,'#ffffff');if(atk)P1(x,my+mo-1,'#ffffff')}
  if(pet){g.fillStyle='#ff3d3d';g.fillRect(Math.round(hx-hr*0.9),Math.round(hy+hr*0.1),2,Math.round(hr*0.9))}
  outline(c);const out={cv:c,ax:W/2,ay:H-1};SPRC.set(key,out);return out}
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

/* ---------- units ---------- */
function walkFrame(t,ph,fast){const q=Math.floor(t*(fast?14:8)+ph*3)%4;return [0,1,0,2][q]}
function unitPose(u,t,rt){const moving=u.moving||['arrive','go','haul','toSrc','toDst','wander','in','out','leave','return'].includes(u.st)||u.flee;
  let pose='walk',frame=moving?walkFrame(t,u.ph,u.flee):0,load=null,tier=u.toolTier||1;
  if(u.climb){pose='climb';frame=Math.floor(t*6+u.ph)%2}
  if(u.kind==='miner'){if((u.st==='mine'||u.st==='clear')&&!u.climb){pose='swing';frame=[0,1,2,1][Math.floor(t*7+u.ph*3)%4]}if(u.load&&u.load.amt>0.3)load=itemInfo(P(),u.load.ore).color;if(u.wpn&&u.tgt&&rt&&rt.hostiles.length){pose=u.atkT>0?'fight':'walk'}
    if(rt&&buffOn(rt.c,'worship')&&u.st==='mine'&&(u.ph%1)>0.6)pose='cheer'}
  else if(u.kind==='porter'){if(u.st==='shovel'){pose='shovel';frame=Math.floor(t*6)%2}else if(u.carry){pose='carry';load=u.carry.key==='coin'?'#ffd23f':itemInfo(P(),u.carry.key).color}if(u.wpn&&u.atkT>0)pose='fight'}
  else if(u.kind==='soldier'){if(u.carry){pose='carry';load=u.carry.key==='coin'?'#ffd23f':itemInfo(P(),u.carry.key).color}else if(u.role==='grenadier'){pose=u.atkT>0?'grenade':'gun';tier=2}else{const w=u.wpn||{};pose=w.type==='melee'?(u.atkT>0?'fight':'gun'):(u.atkT>0.12?'gunfire':'gun');tier=u.wt||1;if(w.type==='melee')tier=1}}
  else if(u.kind==='warrior'||u.kind==='carrier'){if(u.crate){pose='carry';load=u.color}else{pose=u.wt<=1?'spear':(u.atkT>0.12?'gunfire':'gun');tier=u.wt||1}}
  else if(u.kind==='politician'){pose=(u.t%8)>5?'speech':'walk'}
  else if(u.kind==='envoy'){pose='flag'}
  if(u.climb)pose='climb';return{pose,frame,load,tier}}
function drawUnit(u,t,rt){if(u.hidden)return;const flip=u.dir<0;
  if(u.kind==='beast'||u.kind==='pet'){const f=faunaOf(P(),u.fauna)||{id:'x',color:u.color||'#c66',threat:u.threat||2};const fr=u.moving?Math.floor(t*8+u.ph)%2:0;const sp=beastSprite(f,fr,u.atkT>0,u.kind==='pet');
    let y=u.y;if(u.emerge>0)y+=u.emerge*4;pS(sp.cv,u.x,y,sp.ax,sp.ay,flip,1,u.hitT>0?0.55:null)}
  else if(u.exc){pS(excSprite(u.skin||'#f2c9a5',Math.floor(t*10)%2),u.x,u.y,14,29,flip,1,u.hitT>0?0.55:null)}
  else{const p=unitPose(u,t,rt);const role=u.kind==='warrior'||u.kind==='carrier'?'warrior':u.role||u.kind;
    const sp=personSprite({skin:u.skin,head:u.kind==='warrior'||u.kind==='carrier'?'dome':u.head,role,pose:p.pose,frame:p.frame,tier:p.tier,load:p.load,tc:u.color,z:u.zombie,robot:u.robot,accent:u.accent});
    let y=u.y;if(u.rise>0){pS(sp,u.x,y,10,26,flip,1,0.6);return}pS(sp,u.x,y,10,26,flip,1,u.hitT>0?0.55:null)}
  if((u.side===1||u.kind==='soldier'||u.kind==='pet'||u.brute||u.exc)&&u.hp<u.maxhp&&!u.dead){const w=Math.max(6,Math.round(10*PXC.s)),X=bx(u.x)-w/2,Y=by(u.y-(u.h||14)-(u.kind==='beast'||u.kind==='pet'?6:10));pB(X,Y,w,1,'#1a1022');pB(X,Y,w*clamp(u.hp/u.maxhp,0,1),1,u.side===1?'#ff5a6e':'#5ee6a8')}}
function drawRag(r){const fade=r.t>32?1-(r.t-32)/8:1;if(fade<=0)return;PXC.g.globalAlpha=clamp(fade,0,1);const p=r.p;const s=PXC.s;
  if(r.beast){const sz=r.size;const col=r.color||'#c66';for(const i of [2,3,4,5])pL(p[0].x,p[0].y,p[i].x,p[i].y,sh(col,-0.35),Math.max(1,sz*0.22*s));pD(p[0].x,p[0].y,sz*0.8,col);pD(p[1].x,p[1].y,sz*0.42,col);pB(bx(p[1].x),by(p[1].y)-1,1,1,'#111')}
  else{const k=(r.h||14)/14;const rc=ROLEC[r.robot?'robot':(r.kind==='warrior'||r.kind==='carrier'?'warrior':r.role)]||ROLEC.miner;const body=r.kind==='warrior'||r.kind==='carrier'?(r.color||rc.body):rc.body;const skin=r.zombie?'#7bd95a':r.robot?'#c0c8d4':(r.skin||'#f2c9a5');
    const w1=Math.max(1,Math.round(2*k*s)),w2=Math.max(1,Math.round(4*k*s));
    pL(p[2].x,p[2].y,p[5].x,p[5].y,rc.pants,w1);pL(p[2].x,p[2].y,p[6].x,p[6].y,rc.pants,w1);pL(p[1].x,p[1].y,p[2].x,p[2].y,body,w2);pL(p[1].x,p[1].y,p[3].x,p[3].y,body,w1);pL(p[1].x,p[1].y,p[4].x,p[4].y,body,w1);
    pD(p[0].x,p[0].y,2.6*k,skin);if(rc.hat&&!r.robot)pD(p[0].x,p[0].y-1.4*k,2.2*k,rc.hat);pB(bx(p[0].x),by(p[0].y),1,1,'#1a1022')}
  PXC.g.globalAlpha=1}
function drawFxPx(B,t){
  for(const p of B.projs){if(p.kind==='spear')pL(p.x-p.vx*0.03,p.y-p.vy*0.03,p.x,p.y,'#c9a36b',1);else if(p.kind==='grenade'){pB(bx(p.x)-1,by(p.y)-1,Math.max(2,PXC.s*2),Math.max(2,PXC.s*2),'#3a5a24')}else pL(p.x,p.y,p.x-p.vx*0.02,p.y-p.vy*0.02,p.kind==='pellet'?'#ffb347':'#fff3a0',Math.max(1,PXC.s*0.8))}
  for(const f of B.fx){if(f.type==='beam'){pL(f.x1,f.y1,f.x2,f.y2,f.col,Math.max(1,3*PXC.s*(f.t/0.2)));pL(f.x1,f.y1,f.x2,f.y2,'#ffffff',1)}
    else if(f.type==='mark'){const r=f.aoe*(0.3+f.t);for(let a=0;a<6.28;a+=0.4)pB(bx(f.x+Math.cos(a)*r),by(f.y-1+Math.sin(a)*r*0.3),1,1,'#ff5a6e');pL(f.x,f.y-600,f.x,f.y,'rgba(255,210,63,0.6)',1)}
    else if(f.type==='boom'){const k=f.t/0.45;pD(f.x,f.y-6,f.r*(1.4-k*0.6),k>0.5?'#fff3c0':'#ffb347');pD(f.x,f.y-6,f.r*(0.8-k*0.5),'#ff5a2a')}
    else if(f.type==='tele'){pD(f.x,f.y,6*(1-f.t),'#b892ff')}
    else if(f.type==='cavein'){for(let i=0;i<6;i++)pB(bx(f.x+(i-3)*5),by(f.y-TH+(1.2-f.t)*TH*0.9),Math.max(1,3*PXC.s),Math.max(1,3*PXC.s),'#7a6a5a')}}
  for(const p of B.parts){if(p.age>p.life)continue;PXC.g.globalAlpha=Math.max(0,1-p.age/p.life);const z=Math.max(1,Math.round(p.size*PXC.s*0.7));pB(bx(p.x)-z/2,by(p.y)-z/2,z,z,p.col)}PXC.g.globalAlpha=1}
function drawDecals(B){for(const d of B.decals){const a=Math.max(0,1-d.t/240);if(a<=0)continue;PXC.g.globalAlpha=a;const w=d.r*1.6;pR(d.x-w,d.y-1,w*2,1,d.col);pR(d.x-w*0.6,d.y-2,w*1.2,1,d.col)}PXC.g.globalAlpha=1}
function pushPops(B){for(const p of B.pops){const k=p.t/p.life;PXC.labels.push({x:p.x*PXC.s+PXC.ox,y:(p.y-k*30)*PXC.s+PXC.oy,text:p.text,col:p.col,big:true,box:false,alpha:Math.max(0,1-k*k)})}}

/* ---------- side view: sky, rock, tunnels ---------- */
const SKY={};
function skyBands(Pl,blood){const k=Pl.id+(blood?'b':'');if(SKY.bk===k)return SKY.bands;const a=blood?'#2a0610':Pl.sky[0],b=blood?'#a0182a':Pl.sky[1];SKY.bands=[];for(let i=0;i<10;i++)SKY.bands.push(hexMix(a,b,i/9));SKY.bk=k;return SKY.bands}
function drawSkyPx(rt,cam,t){const Pl=P(),st=rt.st,T=PXC;const hy=by(0);if(hy<=0)return;const blood=st.W.fx==='blood';const bands=skyBands(Pl,blood);
  const top=Math.min(0,hy-Math.round(700*T.s));const span=hy-top;for(let i=0;i<10;i++){const y0=top+Math.floor(span*i/10),y1=top+Math.floor(span*(i+1)/10);pB(0,y0,T.bw,y1-y0+1,bands[i])}
  if(SKY.key!==Pl.id){const R0=rng(hash(Pl.id));SKY.key=Pl.id;SKY.stars=Array.from({length:120},()=>({x:R0()*1600,y:R0()*240,b:R0()<0.15,a:0.3+R0()*0.7}));SKY.moons=[{x:R0()*900,y:60+R0()*60,r:9+R0()*7},{x:R0()*900,y:30+R0()*50,r:4+R0()*4}]}
  for(const s of SKY.stars){const x=((s.x-cam.x*0.04)%T.bw+T.bw)%T.bw,y=hy-40-s.y;if(y<0||y>hy-10)continue;const tw=(Math.sin(t*2+s.x)>0.6)?1:0.6;T.g.globalAlpha=s.a*tw;pB(x,y,s.b?2:1,s.b?2:1,'#ffffff');T.g.globalAlpha=1}
  for(const m of SKY.moons){const x=((m.x-cam.x*0.06)%(T.bw+60)+T.bw+60)%(T.bw+60)-30,y=hy-80-m.y;if(y<-20)continue;pD(x,y,m.r,blood?'#ff3d3d':sh(Pl.sky[1],0.45),T.g,true);pD(x+m.r*0.35,y-m.r*0.2,m.r*0.25,sh(Pl.sky[1],0.2),T.g,true);pD(x-m.r*0.3,y+m.r*0.3,m.r*0.18,sh(Pl.sky[1],0.25),T.g,true)}
  const far=sh(st.reg.biome,-0.5),near=sh(st.reg.biome,-0.3);
  for(let col=0;col<T.bw;col+=2){const wx=cam.x*0.5+(col-T.bw/2)/T.s*0.5;const h=(30+Math.abs(Math.sin(wx*0.004))*80+Math.abs(Math.sin(wx*0.013))*24)*Math.min(1.5,T.s)*0.8;pB(col,hy-h,2,h,far)}
  for(let col=0;col<T.bw;col+=2){const wx=cam.x*0.75+(col-T.bw/2)/T.s*0.75;const h=(10+Math.abs(Math.sin(wx*0.007+2))*36)*Math.min(1.5,T.s)*0.9;pB(col,hy-h,2,h,near)}
  drawWeatherPx(st.W,hy,t)}
function drawWeatherPx(W2,hy,t){const T=PXC,g=T.g;const fx=W2.fx;if(!fx)return;
  if(fx==='rain'){g.fillStyle='rgba(180,255,160,0.55)';for(let i=0;i<70;i++){const x=((i*53+t*120)%(T.bw+20))-10,y=((i*37+t*200)%Math.max(1,hy));g.fillRect(Math.round(x),Math.round(y),1,3)}}
  else if(fx==='fog'){g.fillStyle='rgba(150,255,120,0.10)';for(let i=0;i<5;i++){const y=Math.round(hy*(0.35+i*0.12));g.fillRect(0,y,T.bw,Math.max(2,Math.round(hy*0.05)))}}
  else if(fx==='aurora'){for(let i=0;i<3;i++){g.fillStyle=`rgba(${120+i*50},255,${200-i*40},0.22)`;for(let x=0;x<T.bw;x+=2){const y=hy*(0.15+i*0.1)+Math.sin(x*0.03+t+i)*5;g.fillRect(x,Math.round(y),2,4)}}}
  else if(fx==='wind'){g.fillStyle='rgba(255,255,255,0.3)';for(let i=0;i<16;i++){const x=((i*97+t*260)%(T.bw+60))-30,y=(i*29)%Math.max(1,hy);g.fillRect(Math.round(x),y,14,1)}}
  else if(fx==='meteor'){const ph=(t*0.5)%1;const x=T.bw*(0.9-ph*0.7),y=hy*ph;for(let i=0;i<12;i++)pB(x+i,y-i*0.7,1,1,i<3?'#fff3c0':'rgba(255,200,120,0.6)')}
  else if(fx==='lava'){g.fillStyle='rgba(255,90,40,0.14)';g.fillRect(0,Math.round(hy*0.6),T.bw,Math.round(hy*0.4))}}
function buildRockPx(rt){const Pl=P(),reg=rt.st.reg;const W=SW+400,H=5*LH+16;const [cv,g]=mkCv(W,H);const R0=rng(hash(rt.depKey+'rock'));const B=(x,y,w,h,cl)=>{g.fillStyle=cl;g.fillRect(x,y,w,h)};
  for(let L=0;L<5;L++){const y0=10+L*LH;const col=Pl.layers[L].color;B(0,y0,W,LH+1,col);
    for(let y=0;y<LH;y+=8){if((y/8)%2)B(0,y0+y,W,4,sh(col,-0.05))}
    for(let k=0;k<5;k++){const yy=y0+Math.round(LH*(k+0.5)/5);for(let x=0;x<W;x+=4){B(x,yy+Math.round(Math.sin(x*0.011+k*2+L)*3),4,1,sh(col,-0.2))}}
    for(let k=0;k<W*LH/40;k++){const x=Math.floor(R0()*W),y=y0+Math.floor(R0()*LH);B(x,y,1+(R0()<0.2?1:0),1,R0()<0.55?sh(col,-0.25):sh(col,0.12))}
    for(let k=0;k<W/50;k++){const x=R0()*W,y=y0+8+R0()*(LH-16),rx=4+R0()*9,ry=rx*0.6;const cl=sh(col,-0.14);for(let yy=-ry;yy<=ry;yy++){const hw=Math.floor(rx*Math.sqrt(Math.max(0,1-(yy*yy)/(ry*ry))));B(Math.round(x-hw),Math.round(y+yy),hw*2+1,1,cl)}}
    if(L>0){for(let x=0;x<W;x+=3){const j=Math.floor(R0()*4);B(x,y0-j,3,j,Pl.layers[L-1].color)}}}
  for(const d of rt.deps){if(!d.deco)continue;const o=oreOf(Pl,d.ore);if(!o)continue;g.drawImage(oreSprite(o.color,o.cat,d.r*0.7,hash(d.id)),Math.round(d.x+200-d.r),Math.round(d.y+10-d.r))}
  B(0,6,W,6,Pl.surface);for(let x=0;x<W;x+=2){const h=Math.floor(R0()*3);B(x,9-h,2,h+1,Pl.surface)}for(let x=0;x<W;x+=3){if(R0()<0.55){const h=1+Math.floor(R0()*4);B(x,9-h,1,h,sh(reg.biome,0.15))}}
  B(0,12,W,2,sh(Pl.surface,-0.25));return cv}
function drawRockPx(rt){const T=PXC;if(!rt.rock)rt.rock=buildRockPx(rt);const rk=rt.rock;const vb=viewBounds();
  const wx0=Math.max(-200,Math.floor(vb.x0)-2),wx1=Math.min(SW+200,Math.ceil(vb.x1)+2),wy0=Math.max(-10,Math.floor(vb.y0)-2),wy1=Math.min(5*LH+6,Math.ceil(vb.y1)+2);if(wx1<=wx0||wy1<=wy0)return;
  T.g.drawImage(rk,wx0+200,wy0+10,wx1-wx0,wy1-wy0,bx(wx0),by(wy0),bx(wx1)-bx(wx0),by(wy1)-by(wy0));
  if(vb.y1>5*LH)pR(-200,5*LH+6,SW+400,Math.max(0,vb.y1-5*LH),'#0d0816')}
function tunnelEdges(rt,i){const k='te'+i;if(rt[k])return rt[k];const R0=rng(i*977+31);const a=[];for(let x=0;x<1500;x+=4)a.push(Math.floor(R0()*3));rt[k]=a;return a}
function drawTunnels(rt,t){const c=rt.c,st=rt.st,Pl=P();const vb=viewBounds();
  for(let i=0;i<c.levels;i++){const y=lvY(i);if(y<vb.y0-30||y-TH>vb.y1)continue;const cfg=c.shafts[i]||{};const lenL=c.faces[i+'L']||40,lenR=c.faces[i+'R']||40;const xl=SX-lenL,xr=SX+lenR;const E=tunnelEdges(rt,i);
    pR(xl,y-TH,xr-xl,TH,'#1d1228');
    for(let x=Math.max(xl,vb.x0-4);x<Math.min(xr,vb.x1+4);x+=4){const j=E[Math.floor(Math.abs(x-SX)/4)%E.length];if(j)pR(x,y-TH-j,4,j,'#1d1228');if((Math.floor(x/9)+i)%5===0)pR(x,y-TH+5+((x*7)%9),1,1,'#2a1c38')}
    for(const sd of [-1,1]){const fx=sd>0?xr:xl;for(let k=0;k<5;k++)pR(fx-(sd>0?0:2)+(k%2?sd:0),y-TH+k*5,2,4,'#1d1228')}
    pR(xl,y-2,xr-xl,2,'#3a2a3a');pR(xl,y-TH,xr-xl,1,'#140a1c');
    // supports
    const sup=cfg.support||0;const spc=[130,64,52,48][sup];
    for(const sd of [-1,1]){const len=sd>0?lenR:lenL;for(let d=34;d<len-10;d+=spc){const x=SX+sd*d;if(x<vb.x0-10||x>vb.x1+10)continue;
      if(sup===0){if(((d/spc)|0)%2)continue;pL(x,y,x+sd*2,y-TH+3,'#6a4a2a',Math.max(1,PXC.s*1.5))}
      else if(sup===1){pR(x-1,y-TH+1,2,TH-2,'#7a5230');pR(x-5,y-TH+1,10,2,'#8a6238');pR(x-1,y-TH+1,1,TH-2,'#9a7046')}
      else if(sup===2){pR(x-5,y-TH+3,2,TH-4,'#8a96a8');pR(x+3,y-TH+3,2,TH-4,'#8a96a8');pR(x-4,y-TH+1,8,2,'#aab4c4');pR(x-5,y-TH+5,1,1,'#ffffff');pR(x+4,y-TH+5,1,1,'#ffffff')}
      else{const on=(Math.sin(t*3+d)>0);pR(x-1,y-TH+1,2,TH-2,on?'#7ad1ff':'#4a9ac8');pR(x-4,y-TH+1,8,1,'#b8f0ff')}}}
    // lights
    const L=cfg.light||0;if(L){const lsp=[0,80,60,48][L];for(const sd of [-1,1]){const len=sd>0?lenR:lenL;for(let d=56;d<len-6;d+=lsp){const x=SX+sd*d;if(x<vb.x0-10||x>vb.x1+10)continue;
      if(L===1){pR(x,y-10,1,2,'#fff6c2');pR(x,y-8,1,1,'#ff8a3d');pR(x-1,y-7,3,1,'#c9a36b')}else if(L===2){pR(x,y-TH+1,1,4,'#4a4a52');pR(x-1,y-TH+5,3,3,'#ffd678');pR(x,y-TH+5,1,1,'#fff6c2')}else{pR(x-2,y-TH+1,4,2,'#fff6c2');PXC.g.globalAlpha=0.18;pR(x-6,y-TH+3,12,TH-5,'#fff6c2');PXC.g.globalAlpha=1}}}}
    // rails & cart
    const cart=cfg.cart||0;if(cart){for(const sd of [-1,1]){const len=(sd>0?lenR:lenL)-6;pR(sd>0?SX+14:SX-len,y-3,len-14,1,'#8a8a9a');for(let d=16;d<len;d+=6){const x=SX+sd*d;if(x>vb.x0&&x<vb.x1)pR(x,y-2,2,1,'#5a3e28')}
      const k=rt.carts[i+(sd>0?'R':'L')];if(k){const x=SX+sd*k.d;const ld=sumv(k.load);const lc=ld>0?itemInfo(Pl,Object.keys(k.load)[0]).color:null;pR(x-5,y-9,10,6,cart===3?'#c84a2a':'#6a5a4a');pR(x-5,y-9,10,1,'#9a8a7a');if(lc)pR(x-4,y-10,8,2,lc);pR(x-4,y-3,2,2,'#1a1022');pR(x+2,y-3,2,2,'#1a1022');
        if(cart===3&&(k.st==='out'||k.st==='back')){const fl=k.st==='out'?-sd:sd;pR(x+fl*6-(fl<0?3:0),y-7,3,2,Math.sin(t*40)>0?'#ffb347':'#ff5a2a')}}
      const fb=c.fbuf[i+(sd>0?'R':'L')];if(fb&&sumv(fb)>0.5){const x=SX+sd*((sd>0?lenR:lenL)-16);const h=Math.min(6,1+Math.sqrt(sumv(fb)));const oc=itemInfo(Pl,Object.keys(fb)[0]).color;for(let q=0;q<h;q++)pR(x-(h-q),y-2-q,(h-q)*2,1,q%2?sh(oc,-0.2):oc)}}}
    // rubble
    for(const sd of [-1,1]){const rb=c.rubble[i+(sd>0?'R':'L')];if(rb){const x=SX+sd*rb.d;const h=Math.min(TH-2,6+rb.amt*0.25);for(let q=0;q<h;q++){const w=(h-q)*1.4;pR(x-w,y-2-q,w*2,1,q%3?'#7a6a5a':'#5a4a3a')}if(rt.mode==='own')pT(x,y-TH-6,'CAVE-IN','#ff8a3d')}}
    // chute bin
    const ch=c.chute[i]||{};const tot=sumv(ch);pR(SX-38,y-12,22,12,'#4a3a2a');pR(SX-37,y-11,20,10,'#241a14');if(tot>0.5){const top=Object.keys(ch).sort((a,b)=>ch[b]-ch[a])[0];const fh=Math.round(10*Math.min(1,tot/st.chuteCap));pR(SX-37,y-1-fh,20,fh,itemInfo(Pl,top).color);pR(SX-37,y-1-fh,20,1,sh(itemInfo(Pl,top).color,0.3))}
    if(tot>=st.chuteCap*0.97)pT(SX-27,y-18,'FULL','#ff5a6e');
    if(PXC.s>=0.5)pT(SX-60,y-TH+6,`S${i+1}`,'#b3a5d3')}}
function drawShaftPx(rt,t){const c=rt.c,st=rt.st,now=Date.now();
  const bottom=c.shaftJob?lvY(c.shaftJob.i)*Math.min(1,1-(c.shaftJob.until-now)/c.shaftJob.dur)+lvY(Math.max(0,c.levels-1))*Math.max(0,(c.shaftJob.until-now)/c.shaftJob.dur):lvY(Math.max(0,c.levels-1));
  pR(SX-13,-2,26,bottom+2,'#120a1a');pR(SX-11,0,1,bottom,'#6a4a2a');pR(SX-4,0,1,bottom,'#6a4a2a');for(let y=4;y<bottom;y+=6)pR(SX-11,y,8,1,'#5a3e28');
  if(c.shaftJob){pR(SX-9,bottom-8,18,8,'#ffb347');pR(SX-4,bottom,8,2+(Math.floor(t*30)%2)*2,'#cfd6e0');spark(rt,SX+(Math.random()-0.5)*10,bottom+6,'#ffd23f')}
  for(const L of rt.lifts){pL(L.x,-58,L.x,L.y-12,'#9aa7b8',1);pR(L.x-6,L.y-12,12,12,'#ffb347');pR(L.x-5,L.y-11,10,4,'#2a2238');const lc=sumv(L.cargo);if(lc>0){pR(L.x-5,L.y-6,10,Math.max(1,Math.round(5*Math.min(1,lc/st.liftCap))),itemInfo(P(),Object.keys(L.cargo)[0]).color)}pR(L.x-6,L.y-12,12,1,'#ffd860')}}
function lightPass(rt,t){const c=rt.c,T=PXC,lg=T.lg;lg.globalCompositeOperation='source-over';lg.clearRect(0,0,T.bw,T.bh);const vb=viewBounds();let any=false;
  for(let i=0;i<c.levels;i++){const y=lvY(i);if(y<vb.y0-30||y-TH>vb.y1)continue;const L=(c.shafts[i]||{}).light||0;const a=[0.72,0.5,0.28,0.1][L];lg.fillStyle=`rgba(4,2,12,${a})`;const xl=SX-(c.faces[i+'L']||40),xr=SX+(c.faces[i+'R']||40);lg.fillRect(bx(xl)-2,by(y-TH-3),bx(xr)-bx(xl)+4,by(y+1)-by(y-TH-3));any=true}
  if(!any)return;lg.globalCompositeOperation='destination-out';
  for(let i=0;i<c.levels;i++){const y=lvY(i);const L=(c.shafts[i]||{}).light||0;if(!L)continue;const lsp=[0,80,60,48][L],r=[0,13,20,26][L];for(const sd of [-1,1]){const len=c.faces[i+(sd>0?'R':'L')]||40;for(let d=56;d<len-6;d+=lsp){const x=SX+sd*d;if(x<vb.x0-30||x>vb.x1+30)continue;pD(x,y-12,r,'rgba(0,0,0,0.9)',lg)}}}
  for(const u of rt.u){if(u.y<4||u.dead||u.hidden)continue;if(u.kind==='miner'||u.kind==='porter'||u.kind==='soldier'){pD(u.x+(u.dir||1)*5,u.y-10,u.exc?18:11,'rgba(0,0,0,0.85)',lg)}}
  for(const L of rt.lifts)pD(L.x,L.y-6,10,'rgba(0,0,0,0.9)',lg);for(const k in rt.carts){const cr=rt.carts[k];const i=parseInt(k);const sd=k.endsWith('R')?1:-1;pD(SX+sd*cr.d,lvY(i)-6,8,'rgba(0,0,0,0.7)',lg)}
  pD(SX,0,24,'rgba(0,0,0,0.9)',lg);
  lg.globalCompositeOperation='source-over';T.g.drawImage(T.lm,0,0)}

/* ---------- surface ---------- */
function drawShipPx(model,type,x,y,flame,t){const sp=shipSprite(model,type);pS(sp.cv,x,y,sp.ax,sp.ay,false);
  if(flame){const k=type==='cruiser'?0.5:1+model*0.2;const f=Math.floor(t*30)%2;for(const ex of type==='cruiser'?[-12]:[-14*k,10*k]){pR(x+ex-3,y,6,3,'#ffb347');pR(x+ex-2,y+3,4,3+f*2,'#ff8a3d');pR(x+ex-1,y+6+f*2,2,2+f,'#ffe066')}}}
function drawPile(x,amt,col,maxH){const h=Math.max(2,Math.min(maxH||40,3+Math.sqrt(amt)*1.3));const w=10+Math.min(10,h*0.35);for(let q=0;q<h;q++){const ww=w*(1-q/h)+1;pR(x-ww,-q-1,ww*2,1,q%4===0?sh(col,-0.25):(q%4===2?sh(col,0.12):col))}return h}
function drawCrateStack(x,amt,col,trophy,max){const n=Math.min(max||8,Math.ceil(amt/25));const cr=crateSprite(col,trophy);for(let j=0;j<n;j++)pS(cr,x,-1-j*7,6,8,false);return n}
function drawSurfacePx(rt,t){const c=rt.c,st=rt.st,Pl=P();const now=Date.now();const z=PXC.s;
  // antenna
  const tl=c.gear.translator||(st.arch==='choir'?2:0);pL(ANT_X-12,0,ANT_X,-46-tl*14,'#8a7aa8',Math.max(1,z*1.5));pL(ANT_X+12,0,ANT_X,-46-tl*14,'#8a7aa8',Math.max(1,z*1.5));pR(ANT_X-8,-20,16,1,'#8a7aa8');if(tl){pD(ANT_X,-48-tl*14,2+tl,'#7ad1ff');if(Math.floor(t*2)%2)pD(ANT_X,-48-tl*14,5+tl*2,'rgba(122,209,255,0.25)')}
  if(z>=0.5)pT(ANT_X,10,tl?TRANSLATORS[Math.min(3,tl)].name.toUpperCase():'NO TRANSLATOR');
  // supply pad
  pR(DROP_X-50,-3,100,3,'#2b2238');for(let i=0;i<6;i++)pR(DROP_X-48+i*17,-4,8,1,'#ffd23f');if(z>=0.5)pT(DROP_X,10,'SUPPLY PAD');
  // hab dome or bot factory
  if(st.robot){pR(HAB_X-110,-46,84,46,'#4a3d5f');pR(HAB_X-110,-46,84,2,'#6a5d7f');for(let i=0;i<3;i++)pR(HAB_X-100+i*26,-66,10,20,'#2e2540');pR(HAB_X-100,-30,64,6,'#ffcc33');for(let i=0;i<8;i++)pR(HAB_X-100+i*8,-30,4,6,'#2a2238');
    for(let i=0;i<3;i++){const ph=(t*0.6+i/3)%1;PXC.g.globalAlpha=(1-ph)*0.6;pD(HAB_X-95+i*26,-70-ph*40,3+ph*6,'#9aa7b8');PXC.g.globalAlpha=1}if(z>=0.5)pT(HAB_X-68,10,'BOT FACTORY L'+c.gear.factory)}
  for(let dy=0;dy<38;dy+=2){const hw=Math.sqrt(38*38-dy*dy);pR(HAB_X+20-hw,-dy-2,hw*2,2,dy>34?'#cfe7ff':'rgba(170,215,255,0.32)')}for(let i=0;i<5;i++)pR(HAB_X-8+i*12,-16,6,6,Math.sin(t*0.7+i*2)>-0.3?'#ffe08a':'#4a3d5a');pR(HAB_X+12,-12,10,12,'#2a2238');if(z>=0.5)pT(HAB_X+20,10,'HAB DOME');
  // barracks
  pR(BARR_X-90,-44,120,44,'#3d4a2a');for(let q=0;q<10;q++)pR(BARR_X-96+q*6.6,-44-q*1.8,132-q*13.2,2,'#2a3320');pR(BARR_X-40,-26,20,26,'#1a1f14');pR(BARR_X-80,-34,12,8,'#ffe08a');pR(BARR_X+6,-34,12,8,'#ffe08a');
  pR(BARR_X+20,-84,1,40,'#dddddd');const fl=Math.floor(t*5)%3;for(let q=0;q<5;q++)pR(BARR_X+21+q*4,-84+(q>2?fl-1:0),4,10-q,(c.species&&c.species.look&&c.species.look.accent)||'#ff8a3d');
  for(let i=0;i<3;i++){const x=BARR_X+50+i*16;pR(x-1,-14,2,14,'#c9a36b');pD(x,-17,4,'#c9a36b');pR(x-1,-18,1,1,'#ff3d7f')}if(z>=0.5)pT(BARR_X-30,10,'BARRACKS');
  // yard
  for(let x=1170;x<=1458;x+=8)pR(x,-8,1,8,'#6b5a4a');pR(1170,-6,288,1,'#6b5a4a');
  for(const k of Object.keys(c.raw)){if(c.raw[k]<0.5)continue;const x=yardSlot(rt,k);const it=itemInfo(Pl,k);const h=drawPile(x,c.raw[k],it.color,44);if(z>=1)pT(x,-h-8,`${it.name} ${fmt(c.raw[k])}`,it.color)}
  if(z>=0.5)pT(1310,10,`ORE YARD ${fmt(sumv(c.raw))}/${fmt(st.yardCap)}`,sumv(c.raw)>st.yardCap*0.97?'#ff5a6e':null);
  // headframe + wheel
  const alarm=rt.hostiles.length>0;pL(SX-22,0,SX,-58,'#4a3f5a',Math.max(1,z*2.5));pL(SX+22,0,SX,-58,'#4a3f5a',Math.max(1,z*2.5));pR(SX-12,-30,24,2,'#4a3f5a');
  const moving=rt.lifts.some(L=>L.st==='down'||L.st==='up'||L.st==='upstop');const ang=moving?t*6:0;pD(SX,-58,9,'#ffb347');pD(SX,-58,7,'#2a2238');for(let k=0;k<4;k++){const a=ang+k*Math.PI/2;pL(SX,-58,SX+Math.cos(a)*7,-58+Math.sin(a)*7,'#ffb347',1)}
  if(alarm&&Math.floor(t*6)%2){pD(SX,-72,3,'#ff3d3d');PXC.g.globalAlpha=0.25;pD(SX,-72,14,'#ff3d3d');PXC.g.globalAlpha=1}else pD(SX,-72,3,'#5a1010');
  if(z>=0.5)pT(SX,-86,`LIFT: ${LIFTS[c.gear.lift]}${st.lifts>1?' ×2':''}`);
  // conveyor
  if(st.conveyor){pR(1440,-4,REF_X.exotic-1440,2,'#3a3a46');for(let x=1440;x<REF_X.exotic;x+=6)pR(x+Math.floor(t*12)%6,-4,1,1,'#6a6a7a');for(const b of rt.belt){const k=b.t/2.2;pR(lerp(b.x,b.tx,k)-2,-8,4,4,b.col)}}
  // refineries
  for(const k of CATS){const x=REF_X[k];const lv=c.ref[k];if(!lv){if(z>=0.7){for(let q=0;q<60;q+=6){pR(x-30+q,-50,3,1,'rgba(255,255,255,0.2)');pR(x-30+q,0,3,1,'rgba(255,255,255,0.2)')}pT(x,-25,`${CAT[k].ref}?`,'#b3a5d3')}continue}
    const bh=44+Math.min(lv,12)*2.5;const on=rt.refOn[k]>0;const col=CAT_COL(k);const down=rt.refDown[k];
    pR(x-30,-bh,60,bh,down?'#3a2a2a':'#4a3d5f');pR(x-30,-bh,60,2,'#6a5d7f');pR(x+8,-bh-22,10,22,'#2e2540');pR(x+8,-bh-22,10,2,'#4e4560');if(lv>4)pR(x-6,-bh-16,8,16,'#2e2540');
    pR(x-22,-bh+10,30,8,on?col:'#2a2238');pR(x-22,-20,14,12,on?(Math.floor(t*8)%2?'#ffd890':'#ffb347'):'#3a3050');pR(x-34,-bh+4,20,4,'#6b5a7a');pR(x-30,-bh+8,12,8,'#6b5a7a');
    const hop=sumv(c.hopper[k]||{});if(hop>0){const hk=Object.keys(c.hopper[k])[0];pR(x-33,-bh+4,18,Math.min(4,1+hop/st.hopCap/lv*4),itemInfo(Pl,hk).color)}
    const ga=on?t*4:0;pD(x+12,-12,6,'#ffb347');pD(x+12,-12,4,'#2a2238');for(let q=0;q<4;q++){const a=ga+q*Math.PI/2;pL(x+12,-12,x+12+Math.cos(a)*5,-12+Math.sin(a)*5,'#ffb347',1)}
    if(on)for(let p=0;p<4;p++){const ph=(t*0.5+p/4)%1;PXC.g.globalAlpha=(1-ph)*0.6;pD(x+13+Math.sin(ph*6+p)*5,-bh-24-ph*40,3+ph*7,col);PXC.g.globalAlpha=1}
    if(down){pD(x,-bh-10,8+Math.sin(t*10)*2,'#5a4a4a')}
    pR(x+30,-6,60,3,'#2b2238');if(z>=0.5)pT(x,10,`${CAT[k].ref} L${lv}`,down?'#ff5a6e':col)}
  for(const cr of rt.crates){const k=cr.t/1.4;const x=lerp(cr.x,cr.tx,k),y=-6-Math.sin(k*Math.PI)*10;pS(crateSprite(cr.col),x,y,6,4,false,0.6)}
  // depot
  pR(2080,-4,250,4,'#3a3050');depotKeys(rt).forEach((k,i)=>{const x=2090+Math.min(i,7)*30+8;const amt=c.prod[k]||0;const it=itemInfo(Pl,k);const n=drawCrateStack(x,amt,it.color,it.trophy);if(z>=1.2)pT(x,-12-n*7,`${it.name.split(' ')[0]} ${fmt(amt)}`,it.color)});
  if(z>=0.5)pT(2200,10,`DEPOT ${fmt(sumv(c.prod))}/${fmt(st.depotCap)}`,sumv(c.prod)>st.depotCap*0.97?'#ff5a6e':null);
  // politician podium
  if((c.crew.politicians||0)>0){pR(POL_X-26,-6,52,6,'#7a2a2a');pR(POL_X-26,-6,52,1,'#ffd23f');pR(POL_X-4,-14,8,8,'#5a2a2a');pR(POL_X-30,-30,1,24,'#ddd');pR(POL_X-29,-30,10,6,'#c42a2a');pR(POL_X-29,-28,10,1,'#ffffff')}
  // pads, staging piles, cranes
  for(let p=0;p<4;p++){const x=PAD_X[p];if(p>=st.pads){if(z>=0.7){for(let q=0;q<100;q+=8)pR(x-50+q,-3,4,1,'rgba(255,255,255,0.18)');pT(x,10,'BUY PAD','#b3a5d3')}continue}
    pR(x-50,-4,100,4,'#2b2238');pR(x-50,-4,100,1,'#4b4258');const blink=Math.floor(t*3+p)%2;pR(x-50,-6,3,2,blink?'#ff5a6e':'#5a1a2a');pR(x+47,-6,3,2,blink?'#5ee6a8':'#1a4a2a');if(z>=0.5)pT(x,10,`PAD ${p+1}`);
    const stg=c.stage[p];const sv=stg?sumv(stg):0;if(sv>0.5){const k0=Object.keys(stg).sort((a,b)=>stg[b]-stg[a])[0];const n=drawCrateStack(stageX(p),sv,itemInfo(Pl,k0.slice(2)).color,false,9);if(z>=0.8)pT(stageX(p),-12-n*7,`STAGED ${fmt(sv)}`,'#ffd23f')}
    if(st.cranes){const cx=x-34;pR(cx-2,-58,4,58,'#c8a020');for(let q=0;q<58;q+=6)pR(cx-2,-q-3,4,1,'#8a6a10');const sw=Math.sin((rt.craneT[p]||0)*2)*0.5;const ex=cx+Math.cos(sw)*30,ey=-58+Math.sin(sw)*4;pL(cx,-58,ex,ey,'#c8a020',Math.max(1,z*2));pL(ex,ey,ex,ey+14,'#9aa7b8',1);if(dockedShip(rt,p)&&rt.craneT[p])pS(crateSprite('#ffd23f'),ex,ey+20,6,4,false,0.7)}}
  for(const s of c.ships){const model=c.gear.ship;const ty=s.type||'cargo';
    if(s.st==='dock'){const x=PAD_X[s.pad];drawShipPx(model,ty,x,-4,false,t);const cap=shipCapOf(st,s);const f=sumv(s.cargo)/cap;pR(x-22,-62,44,3,'#1a1022');pR(x-22,-62,44*clamp(f,0,1),3,'#ffd23f');if(rt.xfer[s.pad])for(let q=0;q<3;q++)pS(crateSprite('#ffd23f'),stageX(s.pad)+20+((t*60+q*12)%30),-10-Math.sin(((t*60+q*12)%30)/30*Math.PI)*14,6,4,false,0.6);if(z>=0.6)pT(x,-70,`${fmt(sumv(s.cargo))}/${fmt(cap)}`,'#ffd23f')}
    else if(s.st==='launch'){const k=ease(s.anim/3);drawShipPx(model,ty,PAD_X[s.pad]+k*120,-4-k*700,true,t)}
    else if(s.st==='land'){const k=1-ease(s.anim/3);drawShipPx(model,ty,PAD_X[s.pad]+k*120,-4-k*700,true,t)}
    else if(s.st==='wait'){const i=c.ships.indexOf(s);drawShipPx(model,ty,PAD_X[0]+120+(i%3)*70+Math.sin(t+i)*8,-230-(i%4)*36+Math.sin(t*1.3+i)*5,true,t);if(z>=0.6)pT(PAD_X[0]+120+(i%3)*70,-276-(i%4)*36,'WAITING FOR PAD','#ff8a3d')}}
  // supply shuttle
  const shu=rt.shuttle;if(shu){const x=DROP_X,y=shu.y;pR(x-26,y-34,52,30,'#d8d2e8');pR(x-26,y-34,52,2,'#ffffff');pR(x-26,y-22,52,6,'#ff8a3d');for(let i=0;i<5;i++)pR(x-22+i*9,y-30,6,5,'#7ad1ff');pR(x-8,shu.st==='open'?y-16:y-12,16,shu.st==='open'?16:4,'#2a2238');
    pR(x-24,y-4,4,4,'#4a4a52');pR(x+20,y-4,4,4,'#4a4a52');if(shu.st!=='open'){const f=Math.floor(t*30)%2;pR(x-20,y,6,4+f*3,'#ffb347');pR(x+14,y,6,4+f*3,'#ffb347')}}
  // helipods
  for(const id in rt.podAnim){const a=rt.podAnim[id];if(a.st==='fall'){pL(a.x-6,a.y-10,a.x-16,a.y-40,'#dddddd',1);pL(a.x+6,a.y-10,a.x+16,a.y-40,'#dddddd',1);for(let dy=0;dy<14;dy++){const hw=Math.sqrt(18*18-(dy*1.3)**2);pR(a.x-hw,a.y-40-dy,hw*2,1,dy%4<2?'#ff5a6e':'#ffffff')}}
    if(a.st!=='done')pS(crateSprite('#ffd23f'),a.x,a.y,6,8,false,1.4);else{const k=a.t/2.5;PXC.g.globalAlpha=1-k;for(let q=0;q<12;q++){const an=q/12*6.28;pR(a.x+Math.cos(an)*(8+k*30),a.y-8+Math.sin(an)*(8+k*30),1,1,'#ffd23f')}PXC.g.globalAlpha=1}}}
function drawSide(g,rt,cam,W,H,t){const c=rt.c,st=rt.st,Pl=P();const now=Date.now();
  ensureBuf(MAIN_T,W,H);const s=snapS(cam.z/PXC.ps);setView(cam.x,cam.y,s);if(rt.shake>0.3){PXC.ox+=Math.round((Math.random()-0.5)*rt.shake*0.6);PXC.oy+=Math.round((Math.random()-0.5)*rt.shake*0.6)}
  const G=PXC.g;G.fillStyle='#0b0714';G.fillRect(0,0,PXC.bw,PXC.bh);
  drawSkyPx(rt,cam,t);drawRockPx(rt);const vb=viewBounds();
  for(let L=0;L<5;L++){if(layerHard(st.reg,L)>st.hard){PXC.g.globalAlpha=0.5;pR(-200,L*LH,SW+400,LH,'#0a0512');PXC.g.globalAlpha=1;if(s>=0.4)pT(SX+260,L*LH+20,`LOCKED · ${Pl.layers[L].name} · hardness ${layerHard(st.reg,L)}`,'#ff9aa8')}
    else if(s>=0.4)pT(SX-340,L*LH+14,`${L+1} · ${Pl.layers[L].name} · H${layerHard(st.reg,L)}`,null)}
  for(const d of rt.deps){if(d.deco)continue;if(d.x<vb.x0-50||d.x>vb.x1+50||d.y<vb.y0-50||d.y>vb.y1+50)continue;const rem=d.amt-(c.depl[d.id]||0);if(rem<=0)continue;const o=oreOf(Pl,d.ore);const k=d.lvl+(d.side>0?'R':'L');const fx=SX+d.side*(c.faces[k]||40);const vis=(d.lvl<c.levels&&Math.abs(fx-d.x)<240)||st.revealDeps;
    const r=d.r*Math.sqrt(rem/d.amt)*0.9+4;const R0=rng(hash(d.id));for(let i=0;i<5;i++)pS(oreSprite(o.color,o.cat,r*0.38,hash(d.id+i)),d.x+(R0()-0.5)*r*1.3,d.y+(R0()-0.5)*r*0.9,r*0.38+1,r*0.38+1,false,1,vis?1:0.35)}
  drawTunnels(rt,t);drawShaftPx(rt,t);
  for(const l of rt.lava){const y=lvY(l.lvl);const k=Math.sin(l.t/4*Math.PI);const xl=SX-(c.faces[l.lvl+'L']||40);pR(xl,y-6*k,(c.faces[l.lvl+'L']||40)+(c.faces[l.lvl+'R']||40),6*k,Math.floor(t*10)%2?'#ff6428':'#ffb347')}
  drawSurfacePx(rt,t);drawDecals(rt);for(const r of rt.rags)drawRag(r);
  const tool=c.gear.tool;for(const u of rt.u){if(u.x<vb.x0-40||u.x>vb.x1+40||u.y<vb.y0-40||u.y>vb.y1+30)continue;u.toolTier=tool;drawUnit(u,t,rt)}
  drawFxPx(rt,t);for(const m of rt.meteors){if(m.hit)continue;pL(m.x,m.y,m.x+40,m.y-80,'#ffb347',Math.max(1,s*3));pD(m.x,m.y,5,'#fff3c0')}
  lightPass(rt,t);
  if(st.W.fx==='blood'){G.fillStyle='rgba(160,0,30,0.08)';G.fillRect(0,0,PXC.bw,PXC.bh)}
  pushPops(rt);present(g,W,H)}

/* ---------- top-down map ---------- */
const MAPC={key:'',cv:null};
function buildMapTerrain(Pl){const N=250;const [cv,g]=mkCv(N,N);const img=g.createImageData(N,N);const R0=rng(hash(Pl.id+'map'));
  const nz=(x,y)=>Math.sin(x*0.09+Math.sin(y*0.05)*2)*0.5+Math.sin(y*0.12+x*0.03)*0.5;
  const regAt=(x,y)=>{const wx=x/N*MAPW+nz(x,y)*12,wy=y/N*MAPW+nz(y,x)*12;let b=0,bd=1e18;Pl.regions.forEach((r,i)=>{const d=(r.x-wx)**2+(r.y-wy)**2;if(d<bd){bd=d;b=i}});return b};
  const grid=new Int8Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++)grid[y*N+x]=regAt(x,y);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=grid[y*N+x];const r=Pl.regions[i];const n=parseInt(r.biome.slice(1),16);let cr=n>>16,cg=n>>8&255,cb=n&255;const q=nz(x*2.5,y*2.5);const k=q>0.45?1.18:q<-0.45?0.82:1;const d=((x+y)%2===0&&Math.abs(q)<0.08)?0.92:1;cr*=k*d;cg*=k*d;cb*=k*d;
    const edge=(x>0&&grid[y*N+x-1]!==i)||(y>0&&grid[(y-1)*N+x]!==i);if(edge){cr*=0.4;cg*=0.4;cb*=0.4}
    if(r.tribe&&((x+y)%8===0)){const t=Pl.tribes.find(q2=>q2.id===r.tribe);const tn=parseInt(t.color.slice(1),16);cr=cr*0.65+(tn>>16)*0.35;cg=cg*0.65+(tn>>8&255)*0.35;cb=cb*0.65+(tn&255)*0.35}
    if(R0()<0.012){cr*=0.7;cg*=0.7;cb*=0.7}
    const o=(y*N+x)*4;img.data[o]=cr;img.data[o+1]=cg;img.data[o+2]=cb;img.data[o+3]=255}
  g.putImageData(img,0,0);return cv}
function mapTerrain(Pl){if(MAPC.key!==Pl.id){MAPC.key=Pl.id;MAPC.cv=buildMapTerrain(Pl)}return MAPC.cv}
let FOGCV=null;
function fogCanvas(c){if(!FOGCV){FOGCV=document.createElement('canvas');FOGCV.width=FOGN;FOGCV.height=FOGN}if(S.mapDirty||!FOGCV.done){const g=FOGCV.getContext('2d');const img=g.createImageData(FOGN,FOGN);for(let y=0;y<FOGN;y++)for(let x=0;x<FOGN;x++){const o=(y*FOGN+x)*4;const seen=fogSeen(c,(x+0.5)*MAPW/FOGN,(y+0.5)*MAPW/FOGN);img.data[o]=12;img.data[o+1]=7;img.data[o+2]=22;img.data[o+3]=seen?0:225}g.putImageData(img,0,0);FOGCV.done=true;S.mapDirty=false}return FOGCV}
function hutIcon(x,y,col,dead){pB(x-3,y-2,7,4,dead?'#3a3030':'#8a6a4a');pB(x-2,y-4,5,2,dead?'#3a3030':'#6a4a2a');pB(x-1,y-5,3,1,dead?'#3a3030':'#6a4a2a');if(!dead)pB(x,y-8,1,3,col);pB(x,y,1,2,'#2a1a10')}
function drawMap(g,cam,W,H,t){const Pl=P(),c=S.colony;const now=Date.now();ensureBuf(MAIN_T,W,H);const s=snapS(cam.z/PXC.ps);setView(cam.x,cam.y,s);const G=PXC.g;
  G.fillStyle='#0b0714';G.fillRect(0,0,PXC.bw,PXC.bh);G.drawImage(mapTerrain(Pl),bx(0),by(0),bx(MAPW)-bx(0),by(MAPW)-by(0));
  for(const r of Pl.regions){pT(r.x,r.y-30,r.name.toUpperCase(),'#ffffff',false,false);const W2=weatherOf(r,now);if(W2.id!=='clear')pT(r.x,r.y-30+14/s/PXC.ps*DPR*1.2,W2.name,'#ffd23f',false,false)}
  if(c&&c.base){for(let a=0;a<6.28;a+=0.08)if(Math.floor(a*10)%2)pB(bx(c.base.x+Math.cos(a)*95),by(c.base.y+Math.sin(a)*95),1,1,'#ff8a3d')}
  for(const tr of Pl.tribes){const v=tr.village;if(c&&!S.landMode&&!fogSeen(c,v.x,v.y)&&!(c.tribes[tr.id]&&c.tribes[tr.id].mapped))continue;const ts=c&&c.tribes[tr.id];const wiped=ts&&ts.st==='wiped';
    for(let i=0;i<5;i++){const a=i/5*6.28;hutIcon(bx(v.x)+Math.cos(a)*9,by(v.y)+Math.sin(a)*6,tr.color,wiped)}
    pT(v.x,v.y+16/s,tr.name,tr.color,false,true);if(ts)pT(v.x,v.y+16/s+10/s,ts.st==='war'?'AT WAR':ts.st==='allied'?'ALLIED':ts.st==='wiped'?'WIPED OUT':ts.rights?'HUNTING RIGHTS':'NEUTRAL',ts.st==='war'?'#ff5a6e':ts.st==='allied'?'#5ee6a8':'#b3a5d3',false,false)}
  for(const h of Pl.herds){const p=herdPos(h,now);if(c&&!S.landMode&&!fogSeen(c,p.x,p.y))continue;const f=faunaOf(Pl,h.fauna);const n=c?herdAvail(c,h,now):h.size;if(n<=0)continue;
    for(let i=0;i<n;i++){const a=i*2.4+h.p1,d=1.5+i*1.2;const X=bx(p.x)+Math.round(Math.cos(a)*d*2),Y=by(p.y)+Math.round(Math.sin(a)*d*1.5);const sz=1+Math.ceil(f.threat/2);pB(X-sz,Y-1,sz*2,2,f.color);pB(X+sz,Y-2,2,2,f.color);pB(X-sz,Y+1,1,1,OUTLINE);pB(X+sz-1,Y+1,1,1,OUTLINE);pB(X+sz+1,Y-2,1,1,'#ffffff')}
    if(s>=0.7||S.mapSel&&S.mapSel.herd===h.id)pT(p.x,p.y-10/s,`${f.name} ×${n}`,'#ffffff',false,false)}
  const cols=Object.values(S.colonies).concat(c&&c.landed?[c]:[]);const seenIds=new Set();
  for(const o of cols){if(!o||o.v!==2||!o.landed||!o.base||o.planetId!==Pl.id||seenIds.has(o.uid))continue;seenIds.add(o.uid);const me=c&&o.uid===c.uid;const X=bx(o.base.x),Y=by(o.base.y);const col=me?'#ff8a3d':'#b892ff';
    for(let dy=0;dy<6;dy++){const hw=Math.round(Math.sqrt(36-dy*dy));pB(X-hw,Y-dy,hw*2+1,1,col)}pB(X-7,Y,15,2,'#ffffff');pB(X,Y-9,1,3,'#ffffff');pB(X+1,Y-9,3,2,col);
    pT(o.base.x,o.base.y+14/s,me?(o.name||'You')+' (you)':who(o.uid),me?'#ffb347':'#d9c6ff',false,true)}
  if(c){for(const p of c.parties){const tp=partyTarget(c,Pl,p,now);if(tp&&p.st==='out'){const n=Math.ceil(Math.hypot(tp.x-p.x,tp.y-p.y)*s/4);for(let i=0;i<n;i+=2)pB(lerp(bx(p.x),bx(tp.x),i/n),lerp(by(p.y),by(tp.y),i/n),1,1,'#ffd23f')}
      const X=bx(p.x),Y=by(p.y);pD(X,Y,4,p.kind==='war'?'#ff5a6e':'#5ee6a8',G,true);pD(X,Y,2,OUTLINE,G,true);PXC.labels.push({x:X,y:Y-8,text:String(p.n)+(p.st==='fight'?' ⚔':''),col:'#ffffff',box:true})}
    if(c.drone){const d=c.drone;const X=bx(d.x),Y=by(d.y);const f=Math.floor(t*12)%2;pB(X-3,Y,7,1,'#7ad1ff');pB(X,Y-3,1,7,'#7ad1ff');pB(X-4+f,Y-4,2,1,'#ffffff');pB(X+3-f,Y+4,2,1,'#ffffff');for(let a=0;a<6.28;a+=0.12)if(Math.floor(a*8+t*4)%3===0)pB(bx(d.x+Math.cos(a)*70),by(d.y+Math.sin(a)*70),1,1,'rgba(122,209,255,0.6)')}
    if(!S.landMode)G.drawImage(fogCanvas(c),bx(0),by(0),bx(MAPW)-bx(0),by(MAPW)-by(0))}
  if(S.mapSel&&S.mapSel.x!=null){const r=16+Math.sin(t*5)*2;for(let a=0;a<6.28;a+=0.15)pB(bx(S.mapSel.x)+Math.cos(a)*r*Math.max(1,s),by(S.mapSel.y)+Math.sin(a)*r*Math.max(1,s),1,1,'#ffd23f')}
  if(S.landPick){for(let a=0;a<6.28;a+=0.05)pB(bx(S.landPick.x+Math.cos(a)*95),by(S.landPick.y+Math.sin(a)*95),1,1,'#ff8a3d');pD(S.landPick.x,S.landPick.y,5,'#ff8a3d')}
  present(g,W,H)}

/* ---------- field cam ---------- */
function drawArena(g,b,W,H,t){const Pl=P();const reg=regOf(Pl,b.region);ensureBuf(ARENA_T,W,H);const s=Math.max(1,Math.floor(PXC.bw/330));const al=b.u.filter(u=>!u.dead);const cx=al.length?al.reduce((q,u)=>q+u.x,0)/al.length:0;b.camx=b.camx==null?cx:lerp(b.camx,cx,0.05);
  setView(b.camx,-PXC.bh*0.22/s,s);if((b.shake||0)>0.3){PXC.ox+=Math.round((Math.random()-0.5)*b.shake*0.5)}const G=PXC.g;const hy=by(0);
  const bands=skyBands(Pl,false);for(let i=0;i<10;i++)pB(0,Math.floor(hy*i/10),PXC.bw,Math.ceil(hy/10)+1,bands[i]);
  const far=sh(reg.biome,-0.45);for(let col=0;col<PXC.bw;col+=2){const wx=b.camx*0.5+(col-PXC.bw/2)/s*0.5;const h=(16+Math.abs(Math.sin(wx*0.01))*30)*s;pB(col,hy-h,2,h,far)}
  pB(0,hy,PXC.bw,PXC.bh-hy,reg.biome);for(let x=0;x<PXC.bw;x+=3)pB(x,hy+((x*7)%5)+2,1,1,sh(reg.biome,-0.2));pB(0,hy,PXC.bw,1,sh(reg.biome,0.2));
  if(b.kind==='war'){const tr=tribeOf(Pl,b.tribe);for(let i=0;i<4;i++){const x=220+i*55;for(let q=0;q<30;q++)pR(x-22+q*0.7,-q,44-q*1.4,1,q%5?'#8a6a4a':'#6a4a2a');pR(x-1,-44,2,14,tr.color)}}
  drawDecals(b);for(const r of b.rags)drawRag(r);for(const u of b.u)drawUnit(u,t,null);drawFxPx(b,t);pushPops(b);
  PXC.labels.push({x:6,y:8,text:b.title||'',col:'#ffffff',box:true,left:true});
  if(b.done)PXC.labels.push({x:PXC.bw/2,y:PXC.bh*0.32,text:b.won?'VICTORY':'DEFEAT',col:b.won?'#ffd23f':'#ff5a6e',big:true,box:false});
  present(g,W,H)}
function drawMini(g,W,H){const Pl=P();if(!Pl)return;g.setTransform(1,0,0,1,0,0);g.imageSmoothingEnabled=false;
  if(S.view==='side'){g.drawImage(mapTerrain(Pl),0,0,W,H);const c=S.colony;if(c&&c.base){g.fillStyle='#ff8a3d';const X=Math.round(c.base.x/MAPW*W),Y=Math.round(c.base.y/MAPW*H);g.fillRect(X-3*DPR,Y-3*DPR,6*DPR,6*DPR);g.fillStyle='#fff';g.fillRect(X-1*DPR,Y-1*DPR,2*DPR,2*DPR)}}
  else{const q=Math.max(2,Math.round(3*DPR));g.fillStyle=Pl.sky[0];g.fillRect(0,0,W,H*0.45);g.fillStyle=Pl.layers[0].color;g.fillRect(0,Math.round(H*0.45),W,H);g.fillStyle='#1d1228';g.fillRect(Math.round(W/2-q),Math.round(H*0.45),q*2,Math.round(H*0.5));g.fillRect(Math.round(W*0.2),Math.round(H*0.65),Math.round(W*0.6),q*2);g.fillRect(Math.round(W*0.3),Math.round(H*0.82),Math.round(W*0.4),q*2);g.fillStyle='#ffb347';g.fillRect(Math.round(W/2-q*1.5),Math.round(H*0.6),q*3,q*2)}}

/* ================= UI ================= */
function playing(){const c=S.colony,w=S.world;return !!(c&&w&&w.status==='active'&&c.landed&&c.species&&c.planetId===w.planetId&&S.canWrite&&!S.missile&&Date.now()<monthEnd(w.month))}
function who(uid){const c=(S.colony&&S.colony.uid===uid)?S.colony:S.colonies[uid];const pn=S.profiles[uid]&&S.profiles[uid].name;if(c&&c.name)return pn?`${c.name} (${pn})`:c.name;return pn||'A colonist'}
function markSave(ms=1500){const t=Date.now()+ms;if(!S.saveAt||t<S.saveAt)S.saveAt=t}
let LIVE=[],lid=0;
function L(fn,cls){const id='lv'+(lid++);LIVE.push({id,fn,type:'text'});let v='';try{v=fn()}catch(e){}return `<span id="${id}" class="${cls||''}">${esc(v)}</span>`}
function BTN(act,fn,cls){const id='lv'+(lid++);LIVE.push({id,fn,type:'btn'});let r={label:'…',disabled:true};try{r=fn()}catch(e){}return `<button id="${id}" class="buy ${cls||''}" data-act="${act}" ${r.disabled?'disabled':''}>${esc(r.label)}</button>`}
function updateLive(){for(const it of LIVE){const el=it.el||(it.el=document.getElementById(it.id));if(!el)continue;let r;try{r=it.fn()}catch(e){continue}if(it.type==='text'){if(el.textContent!==String(r))el.textContent=r}else{if(el.textContent!==r.label)el.textContent=r.label;if(el.disabled!==!!r.disabled)el.disabled=!!r.disabled}}}
const TABS=[['crew','Crew'],['mine','Mine'],['build','Build'],['army','Army'],['tribes','Tribes'],['market','Market'],['ranks','Ranks']];
function renderTabs(){const c=S.colony;const war=c&&Object.values(c.tribes||{}).some(t=>t.st==='war');$('#tabs').innerHTML=TABS.map(([k,l])=>`<button class="tab" role="tab" aria-selected="${S.tab===k}" data-act="tab:${k}">${l}${k==='tribes'&&war?'<i class="dot"></i>':''}</button>`).join('')}
function amtBar(){return `<div class="amt" role="group" aria-label="Order amount">${[1,10,'max'].map(a=>`<button data-act="amt:${a}" aria-pressed="${S.amt===a}">${a==='max'?'MAX':'×'+a}</button>`).join('')}</div>`}
function relBar(rel){const w=Math.abs(rel)/2;return `<div class="relbar"><i style="${rel>=0?'left:50%':'right:50%;left:auto'};width:${w}%;background:${rel>=0?'var(--ok)':'var(--bad)'}"></i></div>`}
function statusPill(ts){if(!ts)return '';const m={war:['bad','At war'],allied:['ok','Allied'],wiped:['mut','Wiped out'],neutral:[ts.rights?'ok':'mut',ts.rights?'Hunting rights':'Neutral']}[ts.st]||['mut',ts.st];return `<span class="pill ${m[0]}">${m[1]}</span>`}
function pendingLvl(c,k){let l=k.startsWith('ref:')?(c.ref[k.slice(4)]||0):k.startsWith('sh:')?((c.shafts[+k.split(':')[1]]||{})[k.split(':')[2]]||0):(c.gear[k]||0);for(const p of c.pods)if(p.k===k)l=Math.max(l,p.lvl);return l}
function podId(){return 'pod'+Date.now().toString(36)+Math.floor(Math.random()*999)}

/* ---------- purchases ---------- */
function hire(k){const c=S.colony;if(!playing())return;if(k==='miners'&&S.rt&&S.rt.st.robot){toast('Clankforged cannot hire miners. Upgrade your bot factory.');return}if(UNITS[k]&&!unitUnlocked(c,k)){toast('Unlock this unit in your skill tree first.');return}
  const b=crewBatch(c,k,S.amt);if(b.n<1||b.cost>c.coin)return;c.coin-=b.cost;for(let i=0;i<b.n;i++)c.orders.push({k});toast(`${b.n} ${(UNITS[k]||{}).label||k} booked on the next supply shuttle.`);markSave(400);renderTab()}
function hireInfo(k){const c=S.colony;if(UNITS[k]&&unitCount(c,k)>=UNITS[k].max)return{label:'Max reached',disabled:true};const b=crewBatch(c,k,S.amt);return{label:b.n<1?'Can\'t afford':`Hire ${b.n} · ${fmt(b.cost)}`,disabled:!playing()||b.n<1||b.cost>c.coin}}
function gearNext(c,k){const g=GEAR[k];const cur=pendingLvl(c,k);if(cur>=g.max)return null;return{lvl:cur+1,cost:gearCost(c,k,cur+1)}}
function buyGear(k){const c=S.colony;if(!playing())return;if(k==='cruisers'&&!hasT(c,'log3')){toast('Unlock Cruisers in the Shipments branch of your skill tree.');return}const n=gearNext(c,k);if(!n||c.coin<n.cost)return;c.coin-=n.cost;
  if(k==='fleet'){c.gear.fleet=n.lvl;c.ships.push(mkShip('cargo','wait'));toast('A new cargo ship is on its way down.')}
  else if(k==='cruisers'){c.gear.cruisers=n.lvl;c.ships.push(mkShip('cruiser','wait'));toast('A Cruiser is on its way down.')}
  else{c.pods.push({id:podId(),k,lvl:n.lvl});toast(`${GEAR[k].name(n.lvl)} ordered. Watch for the helipod.`)}
  markSave(300);renderTab()}
function buyRef(cat){const c=S.colony;if(!playing())return;const cur=pendingLvl(c,'ref:'+cat);const cost=refCost(cat,cur,c);if(c.coin<cost)return;c.coin-=cost;c.pods.push({id:podId(),k:'ref:'+cat,lvl:cur+1});toast(`${CAT[cat].ref} parts inbound by helipod.`);markSave(300);renderTab()}
function shaftInfo(){const c=S.colony,rt=S.rt;const i=c.levels;if(c.shaftJob)return{label:`Digging · ${dur(c.shaftJob.until-Date.now())}`,disabled:true};if(i>=NLV)return{label:'Bottom reached',disabled:true};const h=layerHard(rt.st.reg,lvLayer(i));if(h>rt.st.hard)return{label:`Needs hardness ${h} tool`,disabled:true};const cost=shaftCost(i,c);return{label:`Dig shaft ${i+1} · ${fmt(cost)}`,disabled:!playing()||c.coin<cost}}
function buyShaft(){const c=S.colony;const inf=shaftInfo();if(inf.disabled)return;const i=c.levels;const cost=shaftCost(i,c);c.coin-=cost;const d=(8+2*i)*1000;c.shaftJob={i,until:Date.now()+d,dur:d};toast('The drill rig is boring a new shaft.');markSave(300);renderTab()}
function shaftUpInfo(i,k){const c=S.colony;const key=`sh:${i}:${k}`;if(c.pods.some(p=>p.k===key))return{label:'Inbound',disabled:true};const cur=pendingLvl(c,key);if(cur>=3)return{label:'Maxed',disabled:true};const cost=shaftUpCost(c,i,k,cur+1);return{label:`${SHAFT_UP[k].names[cur+1]} · ${fmt(cost)}`,disabled:!playing()||c.coin<cost}}
function buyShaftUp(i,k){const c=S.colony;const inf=shaftUpInfo(i,k);if(inf.disabled)return;const key=`sh:${i}:${k}`;const cur=pendingLvl(c,key);const cost=shaftUpCost(c,i,k,cur+1);c.coin-=cost;c.pods.push({id:podId(),k:key,lvl:cur+1});toast(`${SHAFT_UP[k].names[cur+1]} for shaft ${i+1} on the way.`);markSave(300);renderTab()}
function setWant(i,v){const c=S.colony;const s=shaftCfg(c,i);if(v==='auto')s.want=null;else s.want=Math.max(0,(s.want==null?((S.rt&&S.rt.shN&&S.rt.shN[i])||0):s.want)+(+v));markSave();if(S.rt)allocateMiners(S.rt);renderTab()}
function buyNode(id){const c=S.colony;if(!c||!c.species)return;const n=nodeOf(c.species.arch,id);if(!n)return;if(nodeState(c,n)!=='open')return;const cost=nodeCost(c,n);if(c.sp<cost){toast('Not enough Spectacle Points.');return}
  c.sp-=cost;c.tree[id]=true;c.spRefund=0;toast(`Evolved: ${n.name}`);addFeed(`{p}'s species evolved ${n.name}.`,'sp');
  if(id==='her3'&&c.species.arch==='haul'){c.ships.push(mkShip(),mkShip());c.gear.fleet+=2}
  if(S.rt){S.rt.st=stats(c,P(),Date.now());refreshUnitStats(S.rt)}markSave(300);refreshOverlay(true);renderTab()}
function spGain(c){return Math.floor(Math.sqrt(Math.max(0,c.earned)/12500))}

/* ---------- tab content ---------- */
function renderTab(){
  renderTabs();LIVE=[];const el=$('#tabbody');const c=S.colony,w=S.world;
  if(!S.ready||!w){el.innerHTML=`<p class="lede">Connecting to the colony network…</p>`;return}
  const needCol=['crew','mine','build','army','market'].includes(S.tab);
  if(needCol&&(!c||!c.landed||c.planetId!==w.planetId||!S.rt)){el.innerHTML=`<h2>No colony yet</h2><p class="lede">${!S.canWrite||!S.uid?'You are watching. Reload the page to reconnect.':!c||!c.species?'Create your species first.':'Open the map and pick a landing site in a frontier region.'}</p>${S.canWrite&&S.uid?`<div class="btnrow"><button class="buy" data-act="${!c||!c.species?'show-species':'show-land'}">${!c||!c.species?'Create species':'Choose landing site'}</button></div>`:''}`;return}
  let h='';
  try{h=({crew:crewTab,mine:mineTab,build:buildTab,army:armyTab,tribes:tribesTab,market:marketTab,ranks:ranksTab}[S.tab]||crewTab)()}catch(e){console.error(e);h=`<p class="lede">Something broke drawing this tab: ${esc(errMsg(e))}</p>`}
  el.innerHTML=h;if(S.tab==='tribes'&&S.chat){const lg=$('#chatlog');if(lg)lg.scrollTop=lg.scrollHeight}}
function unitRow(k,name,desc,stateFn){const c=S.colony;return `<div class="row"><div><div class="t">${name} ${L(()=>fmt(S.colony.crew[k]||0)+(S.colony.orders.filter(o=>o.k===k).length?` (+${S.colony.orders.filter(o=>o.k===k).length})`:''),'own')}</div><div class="d">${desc}</div>${stateFn?`<div class="e">${L(stateFn)}</div>`:''}</div>${BTN('hire:'+k,()=>hireInfo(k))}</div>`}
function crewTab(){const c=S.colony,rt=S.rt;const st=rt.st;
  let h=`<div class="diag" id="diag">${L(()=>diagnose(S.rt).msg)}</div>`;
  h+=`<h2>Crew</h2><p class="lede">Hires arrive on the supply shuttle (${SHUTTLE_CAP[c.gear.shuttle||1]+(st.H('wpn4b')?10:0)} per trip). ${L(()=>{const n=c.orders.length;return n?`${n} waiting · next shuttle ${S.rt.shuttle?'landing now':dur((c.nextShuttle||0)-Date.now())}`:'No one waiting.'})}</p>${amtBar()}<div class="rows">`;
  const M=k=>rt.u.filter(u=>u.kind==='miner'&&u.ck===k&&!u.dead);
  const mstate=k=>()=>{const m=M(k);return `${m.filter(u=>u.st==='mine'||u.st==='clear').length} digging · ${m.filter(u=>u.st==='haul'||u.st==='go'||u.st==='arrive'||u.st==='assign').length} walking · ${m.filter(u=>u.st==='full'||u.st==='wait').length} waiting for the lift${m.filter(u=>u.flee).length?` · ${m.filter(u=>u.flee).length} fleeing`:''}`};
  if(st.robot)h+=`<div class="row"><div><div class="t">Robot miners ${L(()=>fmt(c.crew.miners),'own')}</div><div class="d">Built by your bot factory, up to ${(12+12*c.gear.factory)*st.factCap}. Upgrade the factory in Build.</div><div class="e">${L(mstate('miners'))}</div></div></div>`;
  else h+=unitRow('miners','Miners','Dig at the face. Assign them to shafts in the Mine tab.',mstate('miners'));
  h+=unitRow('porters','Porters','Load ships with the most valuable goods first, feed refineries, and haul ore up the ladder when the lift jams.',()=>{const p=rt.u.filter(u=>u.kind==='porter'&&!u.dead);const idle=p.filter(u=>!u.job&&!u.carry);const w=idle.length?whyIdle(rt):'';return `${p.length-idle.length} working · ${idle.length} idle${idle.length?w==='ships'?' (waiting for a ship)':w==='nothing'?' (nothing to move)':'':''}`});
  h+=unitRow('soldiers','Soldiers',`Guard the mine, hunt and fight tribes. Armed with ${esc(WEAPONS[c.gear.weapon].name)}.`,()=>`${homeSoldiers(rt).length} home · ${soldiersAway(c)} away`);
  h+=`</div><h3>Special units</h3><div class="rows">`;
  for(const k of Object.keys(UNITS)){const U=UNITS[k];const n=nodeOf(c.species.arch,U.node);if(unitUnlocked(c,k))h+=unitRow(k,U.label,U.desc+(U.max<100?` Max ${U.max}.`:''),null);
    else h+=`<div class="row locked"><div><div class="t">${U.label} <span class="pill mut">Locked</span></div><div class="d">${U.desc}</div><div class="d">Unlock: ${esc(n.name)} in the ${BRANCHES.find(b=>b.k===n.br).label} branch.</div></div><button class="buy sm ghost" data-act="tree">Skill tree</button></div>`}
  h+=`</div><h3>Supply shuttle</h3><div class="rows">${gearRow('shuttle')}</div>`;
  return h}
function mineTab(){const c=S.colony,rt=S.rt,Pl=P(),st=rt.st;let h=`<h2>Mine</h2><p class="lede">Each shaft is one level of tunnels off the main lift. Pin miners to a shaft or leave it on Auto, and upgrade each one. Unpinned miners go wherever the ore is worth most.</p>`;
  h+=`<div class="rows">`;
  for(let i=0;i<c.levels;i++){const cfg=shaftCfg(c,i);const Ly=lvLayer(i);const hd=layerHard(st.reg,Ly);const can=hd<=st.hard;const ore=oreOf(Pl,st.reg.ores[Ly]),vein=oreOf(Pl,st.reg.ores[Math.min(4,Ly+1)]);
    h+=`<div class="shaft"><div class="shead"><b>Shaft ${i+1}</b> <span class="lede">${esc(Pl.layers[Ly].name)} · H${hd}</span>${can?'':' <span class="pill bad">Too hard</span>'}${c.rubble[i+'L']||c.rubble[i+'R']?' <span class="pill warn">Cave-in</span>':''}</div>
      <div class="d"><span class="swatch" style="background:${ore.color}"></span> ${esc(ore.name)} · veins of <span class="swatch" style="background:${vein.color}"></span> ${esc(vein.name)} · ${L(()=>`${fmt(Math.round(Math.max(S.colony.faces[i+'L']||40,S.colony.faces[i+'R']||40)))} m deep`)}</div>
      <div class="assign"><span>Miners</span><span class="stepper"><button data-act="want:${i}:-1" aria-label="Fewer miners in shaft ${i+1}">−</button><b>${L(()=>{const w=(S.colony.shafts[i]||{}).want;const n=(S.rt.shN||{})[i]||0;return w==null?`Auto · ${n}`:`${n}/${w}`})}</b><button data-act="want:${i}:1" aria-label="More miners in shaft ${i+1}">+</button></span>${cfg.want!=null?`<button class="buy sm ghost" data-act="want:${i}:auto">Auto</button>`:''}</div>
      <div class="ups">${['light','support','cart'].map(k=>`<div class="up"><small>${SHAFT_UP[k].label}</small><b>${L(()=>SHAFT_UP[k].names[(S.colony.shafts[i]||{})[k]||0])}</b><span class="d">${L(()=>SHAFT_UP[k].desc[(S.colony.shafts[i]||{})[k]||0])}</span>${BTN(`shup:${i}:${k}`,()=>shaftUpInfo(i,k),'sm')}</div>`).join('')}</div></div>`}
  h+=`</div><div class="btnrow">${BTN('shaft',shaftInfo)}</div><p class="lede">${L(()=>{const i=c.levels;if(i>=NLV)return 'Every shaft is open.';return `Next: shaft ${i+1} in ${Pl.layers[lvLayer(i)].name} (hardness ${layerHard(st.reg,lvLayer(i))}).`})}</p>`;
  h+=`<h3>Unassigned</h3><p class="lede">${L(()=>{const pinned=c.shafts.slice(0,c.levels).some(s=>s&&s.want!=null);const auto=autoShafts(S.rt).length;const n=S.rt.u.filter(u=>u.kind==='miner'&&u.sh<0&&!u.dead).length;return pinned&&!auto&&n?`${n} miners have no shaft to go to. Set a shaft to Auto or raise a pin.`:`${n} miners are on Auto.`})}</p>`;
  return h}
function gearRow(k,eff){const c=S.colony,g=GEAR[k];return `<div class="row"><div><div class="t">${g.label} <span class="own">${L(()=>g.name(S.colony.gear[k]||g.min))}</span></div><div class="d">${L(()=>{const n=gearNext(S.colony,k);return n?`Next: ${g.name(n.lvl)}. ${g.desc(n.lvl)}`:'Fully upgraded.'})}</div>${GEAR_PERK[k]?`<div class="d perk">${L(()=>GEAR_PERK[k](S.colony.gear[k]||0))}</div>`:''}${eff?`<div class="e">${L(eff)}</div>`:''}</div>${BTN('gear:'+k,()=>{const c=S.colony;if(c.pods.some(p=>p.k===k))return{label:'Helipod inbound',disabled:true};const n=gearNext(c,k);if(!n)return{label:'Maxed',disabled:true};return{label:`${k==='fleet'||k==='cruisers'?'Buy':'Order'} · ${fmt(n.cost)}`,disabled:!playing()||c.coin<n.cost}})}</div>`}
const GEAR_PERK={tool:l=>['','','Jackhammer: rattles loose 10% extra from veins.','Plasma Drill: miners can fight back a little.','Gravity Auger: tunnels advance faster.','Quantum Spoon: digs things that should not exist.'][l]||'',
  armor:l=>l>=3?'Spiked armor: attackers take a little damage back.':'',pads:l=>`${l} pad${l>1?'s':''}. Ships with no free pad circle in orbit and do nothing.`};
function buildTab(){const c=S.colony,rt=S.rt,Pl=P();const st=rt.st;let h=`<h2>Build</h2><p class="lede">Upgrades arrive by helipod and install when they land. Shaft upgrades live in the Mine tab.</p>`;
  h+=`<h3>Digging</h3><div class="rows">`+gearRow('tool',()=>`Can break hardness ${st.hard}`)+gearRow('lift',()=>`${fmt(st.liftCap)} per trip${st.lifts>1?' · 2 cars':''}`)+`</div>`;
  if(st.robot)h+=`<div class="rows" style="margin-top:8px">${gearRow('factory')}</div>`;
  h+=`<h3>Refining (refined goods sell for 3×)</h3><div class="rows">`;
  for(const k of CATS){const ores=st.reg.ores.map(id=>oreOf(Pl,id)).filter(o=>o.cat===k);h+=`<div class="row"><div><div class="t"><span style="color:${CAT_COL(k)}">${CAT[k].ref}</span> ${L(()=>'L'+(S.colony.ref[k]||0),'own')}</div><div class="d">${ores.length?'Your ores: '+ores.map(o=>`<span class="swatch" style="background:${o.color}"></span> ${esc(o.name)}`).join(', '):'None of your local ores are '+CAT[k].label.toLowerCase()+'.'}</div><div class="e">${L(()=>`${fmt(st.refRate*(S.colony.ref[k]||0))}/s`)}</div></div>${BTN('ref:'+k,()=>{const c=S.colony;if(c.pods.some(p=>p.k==='ref:'+k))return{label:'Helipod inbound',disabled:true};const cost=refCost(k,pendingLvl(c,'ref:'+k),c);return{label:`${c.ref[k]?'Upgrade':'Build'} · ${fmt(cost)}`,disabled:!playing()||c.coin<cost}})}</div>`}
  h+=`</div><h3>Storage</h3><div class="rows">`+gearRow('yard',()=>`${fmt(sumv(c.raw))} / ${fmt(st.yardCap)}`)+gearRow('depot',()=>`${fmt(sumv(c.prod))} / ${fmt(st.depotCap)}`)+`</div>`;
  h+=`<h3>Shipping</h3><p class="lede">Porters stack the best goods on each pad while its ship is away, so a landing ship fills in seconds.</p><div class="rows">`+gearRow('pads',()=>`${st.pads} active${st.H('log4a')?' (1 from Pad Permit)':''} · ${c.ships.filter(s=>s.st==='wait').length} ships waiting in orbit`)+gearRow('ship',()=>`${fmt(st.shipCap)} cargo · ${Math.round(st.trip)}s trip to ${st.st.name}`)+gearRow('fleet');
  h+=hasT(c,'log3')?gearRow('cruisers',()=>`${fmt(st.shipCap*0.35)} cargo · ${Math.round(st.trip/3)}s trip`):`<div class="row locked"><div><div class="t">Cruisers <span class="pill mut">Locked</span></div><div class="d">Fast ships with small holds. Unlock in the Shipments branch.</div></div><button class="buy sm ghost" data-act="tree">Skill tree</button></div>`;
  h+=`</div><h3>Army &amp; diplomacy</h3><div class="rows">`+gearRow('weapon')+gearRow('armor')+gearRow('translator',()=>`Current accuracy ${Math.round(st.acc*100)}%`)+`</div>`;return h}
function armyTab(){const c=S.colony,rt=S.rt,Pl=P();const now=Date.now();let h=`<h2>Army</h2><p class="lede">Soldiers at home guard the barracks and patrol the mine. When something breaks in, every one of them runs to fight it.</p>`;
  h+=`<div class="chips"><span class="chip">${L(()=>homeSoldiers(rt).length+' home')}</span><span class="chip">${L(()=>soldiersAway(c)+' away')}</span>${c.crew.grenadiers?`<span class="chip">${L(()=>S.colony.crew.grenadiers+' grenadiers')}</span>`:''}<span class="chip">${esc(WEAPONS[c.gear.weapon].name)}</span><span class="chip">${esc(ARMORS[c.gear.armor])}</span><span class="chip">${L(()=>'HP '+Math.round(rt.st.sHp))}</span></div>`;
  if((c.pets||[]).length)h+=`<h3>Pets</h3><div class="chips">${c.pets.map(p=>{const f=faunaOf(Pl,p.fauna);return f?`<span class="chip"><i style="background:${f.color}"></i>${esc(f.name)}</span>`:''}).join('')}</div>`;
  h+=`<h3>Hunting</h3><label class="toggle"><input type="checkbox" id="autohunt" data-act="autohunt" ${c.army.auto?'checked':''}> Auto-hunt known herds in safe territory</label>
    <p>Party size <span class="stepper"><button data-act="army:size:-1" aria-label="Fewer">−</button><b>${c.army.size}</b><button data-act="army:size:1" aria-label="More">+</button></span> &nbsp; Keep home <span class="stepper"><button data-act="army:keep:-1" aria-label="Fewer">−</button><b>${c.army.keep}</b><button data-act="army:keep:1" aria-label="More">+</button></span></p>
    <p class="lede">Hunt these (none picked means anything threat 3 or lower):</p><div class="chips">${Pl.fauna.filter(f=>f.kind==='surface').map(f=>`<button class="chip" data-act="target:${f.id}" aria-pressed="${!!c.army.targets[f.id]}"><i style="background:${f.color}"></i>${esc(f.name)} · T${f.threat}</button>`).join('')}</div>
    <p class="lede">Hunting inside tribal land without rights angers the tribe and risks an ambush. Open the map to pick a herd by hand.</p>`;
  h+=`<h3>Parties in the field</h3><div class="rows">${c.parties.length?c.parties.map(p=>{const tgt=p.kind==='hunt'?(()=>{const hh=Pl.herds.find(x=>x.id===p.target.herd);return hh?faunaOf(Pl,hh.fauna).name:'herd'})():tribeOf(Pl,p.target.tribe).name;return `<div class="row"><div><div class="t">${p.kind==='hunt'?'Hunt':'Assault'}: ${esc(tgt)} <span class="own">${p.n} soldiers</span></div><div class="d">${{muster:'Mustering',out:'Marching',fight:'Fighting now',back:'Heading home'}[p.st]||p.st}${Object.keys(p.loot).length?' · carrying loot':''}</div></div>${p.st==='fight'?`<button class="buy sm danger" data-act="cam:${p.id}">Watch fight</button>`:`<button class="buy sm ghost" data-act="mapfocus:${p.id}">Show</button>`}</div>`}).join(''):'<p class="lede">No one is out right now.</p>'}</div>`;
  const war=Pl.tribes.filter(t=>c.tribes[t.id]&&c.tribes[t.id].st==='war');
  if(war.length)h+=`<h3>Wars</h3><div class="rows">${war.map(t=>{const ts=c.tribes[t.id];return `<div class="row"><div><div class="t" style="color:${t.color}">${esc(t.name)}</div><div class="d">About ${ts.warriors} warriors left · next raid ${ts.nextRaid?dur(ts.nextRaid-now):'soon'}</div></div><button class="buy sm danger" data-act="invade:${t.id}" ${playing()?'':'disabled'}>Invade with ${c.army.size}</button></div>`}).join('')}</div>`;
  h+=`<h3>Body count this run</h3><p>${L(()=>`${fmt(c.kills)} creatures killed · ${fmt(c.deaths)} of your people lost`)}</p>`;return h}
function tribesTab(){const c=S.colony,Pl=P();if(!c||!c.landed)return `<h2>Tribes</h2><p class="lede">Land first. Then you can meet the locals.</p>`;if(S.chat)return chatView();
  let h=`<h2>Tribes</h2><p class="lede">Each tribe claims a region and speaks its own language. Talk to them through your translator. Trade, buy hunting rights, ally, or go to war.</p><div class="rows">`;
  for(const t of Pl.tribes){const ts=c.tribes[t.id];if(!ts)continue;const reg=regOf(Pl,t.region);h+=`<div class="row"><div><div class="t"><span style="color:${t.color}">${esc(t.name)}</span> ${statusPill(ts)}</div><div class="d">${esc(t.title)} ${esc(t.leader)} · ${esc(reg.name)} · they sound like ${esc(t.lang.sounds)}${ts.st!=='wiped'?` · ~${ts.warriors} warriors`:''}</div>${relBar(ts.rel)}</div><div style="display:flex;flex-direction:column;gap:6px">${ts.st!=='wiped'?`<button class="buy sm alt" data-act="chat:${t.id}">Talk</button><button class="buy sm danger" data-act="invade:${t.id}" ${playing()?'':'disabled'}>Invade</button>`:'<span class="pill mut">Gone</span>'}</div></div>`}
  return h+`</div>`}
function marketTab(){const c=S.colony,rt=S.rt,Pl=P();const now=Date.now();const st=rt.st;let h=`<h2>Market</h2><p class="lede">You get paid when a ship comes back. Pick where your ships sell.${st.psychic?' Price Psychic: each ship picks the best station for its own cargo.':''}</p><div class="cards">`;
  h+=Pl.stations.map(s=>`<button class="card" data-act="station:${s.id}" aria-pressed="${c.station===s.id}"><b>${esc(s.name)}</b><small>${esc(s.blurb)}</small><small>Loves <span style="color:${CAT_COL(s.loves)}">${CAT[s.loves].label}</span> +40% · hates <span style="color:${CAT_COL(s.hates)}">${CAT[s.hates].label}</span> −40%</small><small>${s.distance} · ${s.dist}s base trip · tax ${Math.round((st.H('trd4b')?0:s.tax)*100)}%</small></button>`).join('')+`</div>`;
  h+=`<h3>Fleet</h3><label class="toggle"><input type="checkbox" data-act="autolaunch" ${c.autoLaunch?'checked':''}> Launch partly full ships when nothing new is coming</label><div class="rows">`;
  c.ships.forEach((s,i)=>{h+=`<div class="row"><div><div class="t">${s.type==='cruiser'?'Cruiser':'Ship'} ${i+1} <span class="own">${L(()=>{const s2=S.colony.ships[i];return s2?({dock:'Loading on pad '+(s2.pad+1),launch:'Launching',away:'Trading',land:'Landing',wait:'Waiting for a pad'})[s2.st]||'':''})}</span></div><div class="d">${L(()=>{const s2=S.colony.ships[i];if(!s2)return '';if(s2.st==='dock')return `${fmt(sumv(s2.cargo))}/${fmt(shipCapOf(st,s2))} loaded · worth ≈ ${fmt(cargoValue(c,Pl,S.rt.st,s2.cargo,Date.now()))}`;if(s2.st==='away')return `Back in ${dur(s2.ret-Date.now())} with ≈ ${fmt(s2.value)} coin${s2.dest?' from '+s2.dest:''}`;if(s2.st==='wait')return 'Buy another launch pad to use this ship.';return ''})}</div></div>${BTN('launch:'+i,()=>{const s2=S.colony.ships[i];return{label:'Launch now',disabled:!s2||s2.st!=='dock'||sumv(s2.cargo)<1||!playing()}},'sm')}</div>`});
  h+=`</div>`;
  if(c.pump&&c.pump.until>now)h+=`<p class="note">${CAT[c.pump.cat].label} is pumped for ${L(()=>dur(c.pump.until-Date.now()))}.</p>`;
  h+=`<h3>Ore prices at ${esc(st.st.name)}</h3><div class="tablewrap"><table><thead><tr><th>Ore</th><th>Type</th><th>Found in</th><th class="n">Raw</th><th class="n">Refined</th>${st.forecast?'<th class="n">Trend</th>':''}</tr></thead><tbody>`;
  for(const o of Pl.ores.slice().sort((a,b)=>a.tier-b.tier)){const regs=Pl.regions.filter(r=>r.ores.includes(o.id));const mine=st.reg.ores.includes(o.id);const trend=drift(o.cat,st.st.id,now+20*60e3,Pl.id)-drift(o.cat,st.st.id,now,Pl.id);
    h+=`<tr class="${mine?'me':''}"><td><span class="swatch" style="background:${o.color}"></span> <b>${esc(o.name)}</b><br><small style="color:var(--muted)">${TIER_NAME[o.tier]} · layer ${o.tier+1}+</small></td><td>${CAT[o.cat].label}</td><td>${regs.map(r=>esc(r.name)).join(', ')||'—'}</td><td class="n">${L(()=>fmt(priceOf(c,Pl,S.rt.st,o.id,false,Date.now())))}</td><td class="n">${L(()=>fmt(priceOf(c,Pl,S.rt.st,o.id,true,Date.now())))}</td>${st.forecast?`<td class="n" style="color:${trend>=0?'var(--ok)':'var(--bad)'}">${trend>=0?'▲':'▼'}</td>`:''}</tr>`}
  h+=`</tbody></table></div><p class="lede">Highlighted rows are ores you can mine here. Trophies from hunts sell as organic goods.</p>`;return h}
function leaders(){const w=S.world;if(!w)return[];const m={};for(const id in S.colonies){const c=S.colonies[id];if(c.v===2&&c.planetId===w.planetId&&c.landed)m[id]=c}if(S.colony&&S.colony.landed&&S.colony.planetId===w.planetId)m[S.colony.uid]=S.colony;return Object.values(m).sort((a,b)=>b.coin-a.coin)}
function crewTotal(c){let n=0;for(const k of CREW_KEYS)n+=(c.crew&&c.crew[k])||0;return n}
function ranksTab(){const w=S.world,lb=leaders();const old=Object.values(S.colonies).filter(c=>c.v!==2&&c.planetId===w.planetId);let h=`<h2>${esc(monthName(w.month))} on ${esc(w.planet.name)}</h2><p class="lede">Most coin when the month ends wins and writes the prompt for next month's planet. Ends in ${L(()=>dur(monthEnd(S.world.month)-Date.now()))}.</p>`;
  h+=`<div class="tablewrap"><table><thead><tr><th>#</th><th>Colony</th><th class="n">Coin</th><th class="n">Crew</th><th class="n">Shafts</th><th class="n">Kills</th><th class="n">Lost</th></tr></thead><tbody>${lb.map((c,i)=>{const me=S.colony&&c.uid===S.colony.uid;return `<tr class="${me?'me':''}"><td>${i+1}</td><td>${esc(who(c.uid))}${c.species?`<br><small style="color:var(--muted)">${esc(c.species.name)} · ${esc(ARCH[c.species.arch].name)}</small>`:''}${c.wins?` <span class="pill sp">${c.wins}× champ</span>`:''}</td><td class="n">${me?L(()=>fmt(S.colony.coin)):fmt(c.coin)}</td><td class="n">${fmt(crewTotal(c))}</td><td class="n">${c.levels}</td><td class="n">${fmt(c.kills)}</td><td class="n">${fmt(c.deaths)}</td></tr>`}).join('')||'<tr><td colspan="7">No colonies yet.</td></tr>'}</tbody></table></div>`;
  if(old.length)h+=`<p class="lede">${old.length} colonist${old.length>1?'s have':' has'} not opened the new version yet.</p>`;
  const others=lb.filter(c=>!S.colony||c.uid!==S.colony.uid);if(others.length)h+=`<h3>Watch a colony</h3><div class="rows">${others.map(c=>`<div class="row"><div><div class="t">${esc(who(c.uid))}</div><div class="d">${fmt(c.crew.miners)} miners · ${c.levels} shafts · ${esc(TOOLS[c.gear.tool].name)}</div></div><button class="buy sm ghost" data-act="watch:${esc(c.uid)}">Watch</button></div>`).join('')}</div>`;
  h+=`<h3>Hall of champions</h3>${(w.history||[]).length?`<div class="rows">${w.history.slice().reverse().map(x=>`<div class="row"><div><div class="t">${esc(monthName(x.month))} · ${esc(x.planet)}</div><div class="d">${x.winner?`${esc(who(x.winner))} won with ${fmt(x.coin)} coin`:'Nobody showed up'} · ${x.players} colonies</div></div></div>`).join('')}</div>`:'<p class="lede">No champions yet.</p>'}`;
  h+=`<h3>Colony feed</h3><div class="feed">${S.feed.slice(0,25).map(f=>`<div><time>${ago(f.t)}</time>${esc(String(f.text).replace(/\{p\}/g,who(f.by)))}</div>`).join('')||'<p class="lede">Quiet. Too quiet.</p>'}</div>`;
  if(S.isOwner||S.local)h+=`<h3>Host tools (testing)</h3><div class="btnrow"><button class="buy ghost" data-act="admin-rollover">End the month now</button><button class="buy ghost" data-act="admin-regen">Improvise a new planet now</button></div>`;
  return h}
function renderTicker(){$('#ticker').innerHTML=S.feed.slice(0,3).map(f=>`<div>${esc(String(f.text).replace(/\{p\}/g,who(f.by)))}</div>`).join('')||'<div>The colony feed is empty. Someone has to die first.</div>'}

/* ---------- skill tree popup ---------- */
function treeHTML(){const c=S.colony;if(!c||!c.species)return '';const sp=c.species,A=ARCH[sp.arch];const nodes=treeNodes(sp.arch);const sel=S.treeSel&&nodes.find(n=>n.id===S.treeSel);
  let h=`<button class="buy ghost close" data-act="close">Close</button><h1>${esc(sp.name)}</h1><p class="tagline">${esc(sp.tagline||A.blurb)}</p>
    <div class="treehead"><div><b class="big sp">${fmt(c.sp)} SP</b><span class="lede"> to spend · ${fmt(c.spLife||0)} earned all-time</span></div><p class="lede"><b>${esc(A.name)}:</b> ${esc(A.perk)} Signature branch: ${esc(BRANCHES.find(b=>b.k===A.sig).label)} (cheaper).</p></div>
    ${c.spRefund?`<p class="note">Your old tech was refunded: +${c.spRefund} SP. Spend it on the new tree.</p>`:''}
    <div class="tree" role="group" aria-label="Skill tree">`;
  for(const b of BRANCHES){const bn=nodes.filter(n=>n.br===b.k);h+=`<div class="branch" style="--bc:${b.col}"><div class="bname">${esc(b.label)}${A.sig===b.k?' ★':''}</div>`;
    for(let t=1;t<=5;t++){const tier=bn.filter(n=>n.t===t);h+=`<div class="tierrow">`;if(!tier.length){h+=`<div class="node empty"></div>`}
      for(const n of tier){const s=nodeState(c,n);const cost=nodeCost(c,n);h+=`<button class="node ${s} ${sel&&sel.id===n.id?'sel':''}" data-act="tsel:${n.id}" aria-pressed="${sel&&sel.id===n.id}"><span class="nk">${KIND_LABEL[n.kind]}</span><b>${esc(n.name)}</b><span class="nc">${s==='got'?'Owned':s==='locked-out'?'Other path':cost+' SP'}</span></button>`}
      h+=`</div>`}h+=`</div>`}
  h+=`</div>`;
  if(sel){const s=nodeState(c,sel);const cost=nodeCost(c,sel);const other=sel.s!==0?nodes.find(o=>o.br===sel.br&&o.t===sel.t&&o.id!==sel.id):null;
    h+=`<div class="nodecard"><div><span class="pill sp">${KIND_LABEL[sel.kind]}</span> <b>${esc(sel.name)}</b> <span class="lede">· ${esc(BRANCHES.find(b=>b.k===sel.br).label)} tier ${sel.t}</span></div><p>${esc(sel.desc)}</p>${other&&s==='open'?`<p class="lede">Choosing this locks out <b>${esc(other.name)}</b> for good.</p>`:''}
      <div class="btnrow">${s==='got'?'<span class="pill ok">Evolved</span>':s==='locked'?'<span class="pill mut">Evolve the tier above first</span>':s==='locked-out'?'<span class="pill mut">You took the other path</span>':`<button class="buy alt" data-act="evolve:${sel.id}" ${c.sp>=cost?'':'disabled'}>Evolve · ${cost} SP</button>`}</div></div>`}
  else h+=`<p class="lede">Tap a node to read it. Forks make you pick one of two paths.</p>`;
  h+=`<h3>Call down the missile</h3><p class="lede">The Maker obliterates your colony for an audience. You lose this run's coin, crew and gear. You keep your species, your SP and your tribe relations, and gain Spectacle Points.</p><p>${L(()=>{const g=spGain(S.colony);return g<1?`Earn ${fmt(12500-S.colony.earned)} more coin this run to qualify.`:`Payout right now: ${g} SP (run earnings ${fmt(S.colony.earned)}).`})}</p>`;
  h+=S.armMissile?`<div class="note">This wipes your ${fmt(c.coin)} coin. The month is won on coin, so time it.</div><div class="btnrow"><button class="buy danger" data-act="missile-go">Obliterate me</button><button class="buy ghost" data-act="missile-cancel">Never mind</button></div>`:`<div class="btnrow">${BTN('missile-arm',()=>({label:'Request the missile',disabled:!playing()||spGain(S.colony)<1}),'danger')}</div>`;
  return h}

/* ---------- HUD ---------- */
function abilState(c,k){const A=ABILITIES[k];const now=Date.now();const ready=(c.abil[k]||0)<=now;let on=false;if(k==='whistle')on=buffOn(c,'whistle');if(k==='corner')on=buffOn(c,'corner');if(k==='pump')on=c.pump&&c.pump.until>now;if(k==='smuggle')on=c.smuggle>0;return{ready,on,left:Math.max(0,(c.abil[k]||0)-now)}}
function updateHUD(){const c=S.colony,w=S.world;if(!w)return;const has=c&&c.landed&&c.planetId===w.planetId&&S.rt;const rt=S.rt;
  $('#hCoin').textContent=has?fmt(c.coin):'—';
  if(has){const tp=throughput(c,P(),rt.st);$('#hRate').textContent=`≈ ${fmt(tp.coin*60)}/min`;const d=c.ships.filter(s=>s.st==='dock').length,a=c.ships.filter(s=>s.st==='away'||s.st==='launch').length,wt=c.ships.filter(s=>s.st==='wait').length;$('#hShips').textContent=`${d} docked · ${a} away${wt?` · ${wt} waiting`:''}`}
  else{$('#hRate').textContent=S.canWrite?'not landed':'spectating';$('#hShips').textContent='—'}
  $('#hSP').textContent=c?fmt(c.sp)+' SP':'0';$('#hPlanet').textContent=w.planet.name;$('#hTimer').textContent=w.status==='active'?dur(monthEnd(w.month)-Date.now()):'new planet';
  const tag=$('#stageTag');const view=S.watch?S.watch.rt:rt;
  if(S.view==='map')tag.innerHTML=S.landMode?'<b>Choose a landing site.</b> Tap a spot in a frontier region (no tribe).':`<b>${esc(w.planet.name)}</b> · tap herds, villages and colonies`;
  else if(view){const W2=view.st.W;tag.innerHTML=`<b>${esc(S.watch?who(S.watch.uid):c.name)}</b> · ${esc(view.st.reg.name)} · ${esc(W2.name)}<br><span style="color:var(--muted)">${esc(W2.desc)}</span>`}
  else tag.textContent=w.status!=='active'?'Waiting for the next planet':'Spectator mode';
  const al=$('#alarm');if(rt&&!S.watch&&rt.hostiles.length&&S.view==='side'){al.hidden=false;const k=rt.alarmMsg||'Hostiles in the colony!';if(al.dataset.k!==k){al.dataset.k=k;al.innerHTML=`<span>⚠ ${esc(k)}</span><button data-act="goalarm">Watch</button>`}}
  else if(rt&&!S.watch&&rt.alarmSoft&&Date.now()-rt.alarmSoft<6000&&S.view==='side'){al.hidden=false;const k=rt.alarmMsg;if(al.dataset.k!==k){al.dataset.k=k;al.innerHTML=`<span>⚠ ${esc(k)}</span><button data-act="goalarm">Show</button>`}}
  else if(rt&&S.alertBattle&&Date.now()-S.alertBattle.t<8000&&!S.modal){al.hidden=false;const k='battle'+S.alertBattle.party;if(al.dataset.k!==k){al.dataset.k=k;al.innerHTML=`<span>⚔ Your soldiers are in a fight</span><button data-act="cam:${S.alertBattle.party}">Watch</button>`}}
  else al.hidden=true;
  const wb=$('#watchbar');if(S.watch){wb.hidden=false;if(wb.dataset.k!==S.watch.uid){wb.dataset.k=S.watch.uid;wb.innerHTML=`<span>Watching ${esc(who(S.watch.uid))}</span><button data-act="unwatch">Back to my colony</button>`}}else wb.hidden=true;
  $('#mapBtnLbl').textContent=S.view==='map'?'MINE':'MAP';
  const fb=$('#focusbar');const fk=S.view+'|'+(S.watch?1:0);if(fb.dataset.k!==fk){fb.dataset.k=fk;fb.innerHTML=S.view==='side'?[['mine','Mine face'],['lift','Lift'],['yard','Ore yard'],['ref','Refineries'],['pad','Launch pads'],['bar','Barracks'],['supply','Supply pad'],['all','Whole colony']].map(([k,l])=>`<button data-act="focus:${k}">${l}</button>`).join(''):[['base','My base'],['all','Whole planet']].map(([k,l])=>`<button data-act="focus:${k}">${l}</button>`).join('')}
  // abilities
  const ab=$('#abil');const ks=has&&!S.watch?Object.keys(ABILITIES).filter(k=>hasAbility(c,k)):[];const key=ks.join(',')+'|'+S.view;if(ab.dataset.k!==key){ab.dataset.k=key;ab.innerHTML=S.view==='side'?ks.map(k=>`<button class="ab" data-act="abil:${k}" id="ab-${k}"><i>${ABILITIES[k].glyph}</i><span>${esc(ABILITIES[k].name)}</span><em></em></button>`).join(''):''}
  for(const k of ks){const el=document.getElementById('ab-'+k);if(!el)continue;const s=abilState(c,k);el.disabled=!s.ready||!playing();el.classList.toggle('on',!!s.on);const em=el.querySelector('em');const tx=s.on?'Active':s.ready?'Ready':dur(s.left);if(em.textContent!==tx)em.textContent=tx}}

/* ---------- hover / tap inspection ---------- */
function hitSide(rt,wx,wy){const c=rt.c,st=rt.st,Pl=P();const now=Date.now();
  let best=null,bd=12;for(const u of rt.u){if(u.dead||u.hidden)continue;const d=Math.hypot(u.x-wx,(u.y-(u.h||14)/2)-wy);if(d<bd){bd=d;best=u}}
  if(best){const u=best;let t='';if(u.kind==='beast'||u.kind==='pet'){const f=faunaOf(Pl,u.fauna);t=`<b>${esc(f.name)}</b>${u.kind==='pet'?' · your pet':''}<br>Threat ${f.threat} · HP ${Math.ceil(u.hp)}/${Math.ceil(u.maxhp)}<br>${esc(f.blurb||'Hungry.')}`}
    else if(u.kind==='warrior'||u.kind==='carrier'){const tr=tribeOf(Pl,u.tribe||'');t=`<b>${u.kind==='carrier'?'Tribal porter':u.side===0?'Allied warrior':'Raider'}</b>${tr?' of '+esc(tr.name):''}${u.hp<u.maxhp?`<br>HP ${Math.ceil(u.hp)}`:''}`}
    else{const role={miner:u.exc?'Excavator':u.brute?'Brute':u.robot?'Robot miner':'Miner',porter:'Porter',soldier:u.role==='grenadier'?'Grenadier':'Soldier',politician:'Politician',envoy:'Envoy'}[u.kind]+(u.zombie?' (undead)':'');
      const doing=u.flee?'Running for their life':u.kind==='miner'?(u.wpn&&u.tgt?'Brawling':{mine:`Digging in shaft ${u.face?u.face.i+1:'?'}`,clear:'Clearing cave-in rubble',haul:'Hauling ore to the lift',go:`Walking to shaft ${u.face?u.face.i+1:'?'}`,full:'Waiting: chute full, lift too slow',wait:'Waiting: cart buffer full',arrive:'Just arrived',idle:'No shaft to work'}[u.st]||'Waiting')+(u.sh>=0?' · pinned':''):
        u.kind==='porter'?(u.carry?`Carrying ${fmt(u.carry.amt)} ${itemInfo(Pl,u.carry.key).name} to ${u.job?u.job.dst.startsWith('ref')?'a refinery':u.job.dst==='yard'?'the yard':u.job.dst.startsWith('stage')?'the pad stack':'the ship':'?'}`:u.job?`Fetching ${itemInfo(Pl,u.job.key).name}`:u.why==='ships'?'Idle: every pad is stacked, waiting for ships':u.why==='nothing'?'Idle: nothing left to move':'Looking for work'):
        u.kind==='politician'?'Giving a speech (+3% prices)':u.kind==='envoy'?(u.st==='home'?'Resting between visits':'Visiting tribes'):u.party?'Leaving with a party':u.tgt?'Fighting':u.st==='patrol'?'Patrolling':'At the barracks';
      const ld=u.load&&u.load.amt>0.2?`<br>Carrying <span class="m">${fmt(u.load.amt)} ${esc(oreOf(Pl,u.load.ore).name)}</span>`:'';t=`<b>${role}</b> · ${doing}${ld}${u.kind==='soldier'?`<br>${esc(u.role==='grenadier'?'Grenades':WEAPONS[u.wt||1].name)} · HP ${Math.ceil(u.hp)}/${Math.ceil(u.maxhp)}`:''}`}
    return{html:t,x:u.x,y:u.y}}
  for(const s of c.ships){if(s.st!=='dock')continue;const x=PAD_X[s.pad];if(Math.abs(wx-x)<36&&wy>-50&&wy<4)return{html:`<b>${esc(s.type==='cruiser'?'Cruiser':SHIPS[c.gear.ship].name)}</b> on pad ${s.pad+1}<br>${fmt(sumv(s.cargo))}/${fmt(shipCapOf(st,s))} loaded<br>Worth ≈ <span class="m">${fmt(cargoValue(c,Pl,st,s.cargo,now))} coin</span> at ${esc(st.st.name)}<br>${Object.keys(s.cargo).map(k=>`${esc(itemInfo(Pl,k.slice(2)).name)} ${k[0]==='p'?'(refined)':''}: ${fmt(s.cargo[k])}`).join('<br>')}`}}
  if(wy<2&&wy>-90){for(let p=0;p<4;p++){const sx=stageX(p);if(Math.abs(wx-sx)<10){const stg=c.stage[p]||{};return{html:`<b>Pad ${p+1} stack</b><br>${fmt(sumv(stg))}/${fmt(stageCap(rt))} staged for the next ship<br>Worth ≈ <span class="m">${fmt(cargoValue(c,Pl,st,stg,now))}</span>${Object.keys(stg).map(k=>`<br>${esc(itemInfo(Pl,k.slice(2)).name)} ${k[0]==='p'?'(refined)':''}: ${fmt(stg[k])}`).join('')}`}}
      if(Math.abs(wx-PAD_X[p])<50&&p>=st.pads&&wy>-10)return{html:`<b>Empty pad slot</b><br>Buy launch pads in Build so more ships can load at once.`}}
    for(const k of Object.keys(c.raw)){const x=yardSlot(rt,k);if(Math.abs(wx-x)<22){const it=itemInfo(Pl,k);return{html:`<b style="color:${it.color}">${esc(it.name)}</b> (raw)<br><span class="m">${fmt(c.raw[k])}</span> in the yard<br>Sells for ${fmt(priceOf(c,Pl,st,k,false,now))} raw, ${fmt(priceOf(c,Pl,st,k,true,now))} refined<br>Refined by: ${CAT[it.cat].ref}${c.ref[it.cat]?'':' (not built)'}`}}}
    for(const k of depotKeys(rt)){const x=depotSlot(rt,k)+8;if(Math.abs(wx-x)<14){const it=itemInfo(Pl,k);return{html:`<b style="color:${it.color}">${esc(it.name)}</b> ${it.trophy?'':'(refined)'}<br><span class="m">${fmt(c.prod[k])}</span> in the depot<br>Sells for ${fmt(priceOf(c,Pl,st,k,true,now))} each`}}}
    for(const k of CATS){const x=REF_X[k];if(Math.abs(wx-x)<32){const lv=c.ref[k];const hop=c.hopper[k]||{};return{html:`<b>${CAT[k].ref}</b> ${lv?'level '+lv:'(not built)'}${rt.refDown[k]?' · <span style="color:var(--bad)">exploded, rebuilding</span>':''}<br>${lv?`Refines ${fmt(st.refRate*lv)}/s · hopper ${fmt(sumv(hop))}/${fmt(st.hopCap*lv)}`:'Build it in the Build tab.'}${Object.keys(hop).map(q=>`<br>${esc(itemInfo(Pl,q).name)}: ${fmt(hop[q])}`).join('')}`}}}
    if(Math.abs(wx-SX)<24)return{html:`<b>${esc(LIFTS[c.gear.lift])}</b>${st.lifts>1?' ×2':''}<br>${fmt(st.liftCap)} per trip at ${Math.round(st.liftSpd)} m/s`};
    if(Math.abs(wx-POL_X)<28&&c.crew.politicians)return{html:`<b>Campaign stage</b><br>${c.crew.politicians} politicians · prices +${3*Math.min(10,c.crew.politicians)}%`};
    if(Math.abs(wx-(BARR_X-30))<66)return{html:`<b>Barracks</b><br>${homeSoldiers(rt).length} soldiers home · ${soldiersAway(c)} away<br>${esc(WEAPONS[c.gear.weapon].name)} · ${esc(ARMORS[c.gear.armor])}`};
    if(Math.abs(wx-DROP_X)<52)return{html:`<b>Supply pad</b><br>${c.orders.length} hires waiting · ${st.shuttleCap} per trip<br>${rt.shuttle?'Shuttle landing now':'Next shuttle '+dur((c.nextShuttle||0)-now)}`};
    if(Math.abs(wx-ANT_X)<20)return{html:`<b>Translator</b><br>${esc(TRANSLATORS[c.gear.translator].name)} · ${Math.round(st.acc*100)}% accurate`}}
  if(wy>0){for(let i=0;i<c.levels;i++){const y=lvY(i);if(wy<y+3&&wy>y-TH-3){const cfg=c.shafts[i]||{};if(Math.abs(wx-SX)<40){const ch=c.chute[i]||{};return{html:`<b>Shaft ${i+1} chute</b><br>${fmt(sumv(ch))}/${fmt(st.chuteCap)} waiting for the lift${Object.keys(ch).map(k=>`<br>${esc(itemInfo(Pl,k).name)}: ${fmt(ch[k])}`).join('')}`}}
      for(const s of [-1,1]){const k=i+(s>0?'R':'L');const fx=SX+s*(c.faces[k]||40);if(Math.abs(wx-fx)<22){const f={i,s,k,L:lvLayer(i),h:layerHard(st.reg,lvLayer(i))};const fo=faceOre(rt,f);const o=oreOf(Pl,fo.ore);return{html:`<b>Shaft ${i+1} face</b><br>Hitting <span style="color:${o.color}">${esc(o.name)}</span>${fo.dep?' (rich vein)':''}<br>${fmt(c.faces[k]||40)} m from the lift · ${rt.fcount[k]||0} miners`}}
        const rb=c.rubble[k];if(rb&&Math.abs(wx-(SX+s*rb.d))<16)return{html:`<b>Cave-in rubble</b><br>Miners are digging through it. Better supports prevent this.`};
        const ct=rt.carts[k];if(ct&&Math.abs(wx-(SX+s*ct.d))<8)return{html:`<b>${esc(SHAFT_UP.cart.names[cfg.cart||0])}</b><br>Carrying ${fmt(sumv(ct.load))}/${fmt(st.cartCap[cfg.cart||1])}`}}
      return{html:`<b>Shaft ${i+1}</b> · ${esc(SHAFT_UP.light.names[cfg.light||0])}, ${esc(SHAFT_UP.support.names[cfg.support||0])}, ${esc(SHAFT_UP.cart.names[cfg.cart||0])}<br>${(rt.shN||{})[i]||0} miners${cfg.want!=null?` (pinned to ${cfg.want})`:' (auto)'}. Manage it in the Mine tab.`}}}
    for(const d of rt.deps){if(d.deco)continue;const rem=d.amt-(c.depl[d.id]||0);if(rem<=0)continue;if(Math.hypot(wx-d.x,wy-d.y)<d.r+4){const o=oreOf(Pl,d.ore);return{html:`<b style="color:${o.color}">${esc(o.name)} vein</b><br>${fmt(rem)} left · ${TIER_NAME[o.tier]}<br>${fmt(priceOf(c,Pl,st,o.id,false,now))} raw · ${fmt(priceOf(c,Pl,st,o.id,true,now))} refined`}}}
    const L2=clamp(Math.floor(wy/LH),0,4);const h=layerHard(st.reg,L2);return{html:`<b>${esc(Pl.layers[L2].name)}</b><br>Hardness ${h}${h>st.hard?' · your tools can\'t break it':''}<br>Ore: ${esc(oreOf(Pl,st.reg.ores[L2]).name)} · veins: ${esc(oreOf(Pl,st.reg.ores[Math.min(4,L2+1)]).name)}`}}
  return null}
function hitMap(wx,wy){const Pl=P(),c=S.colony;const now=Date.now();
  for(const h of Pl.herds){const p=herdPos(h,now);if(c&&!fogSeen(c,p.x,p.y))continue;if(Math.hypot(p.x-wx,p.y-wy)<16)return{herd:h.id,x:p.x,y:p.y}}
  for(const t of Pl.tribes){const v=t.village;if(c&&!fogSeen(c,v.x,v.y)&&!(c.tribes[t.id]&&c.tribes[t.id].mapped))continue;if(Math.hypot(v.x-wx,v.y-wy)<22)return{tribe:t.id,x:v.x,y:v.y}}
  for(const o of Object.values(S.colonies)){if(o.v!==2||!o.landed||!o.base||o.planetId!==Pl.id||(c&&o.uid===c.uid))continue;if(Math.hypot(o.base.x-wx,o.base.y-wy)<16)return{colony:o.uid,x:o.base.x,y:o.base.y}}
  if(c&&c.base&&Math.hypot(c.base.x-wx,c.base.y-wy)<16)return{mine:true,x:c.base.x,y:c.base.y};
  if(c)for(const p of c.parties)if(Math.hypot(p.x-wx,p.y-wy)<12)return{party:p.id,x:p.x,y:p.y};
  const reg=regionAt(Pl,wx,wy);return{region:reg.id,x:wx,y:wy}}
function mapTip(sel){const Pl=P(),c=S.colony;const now=Date.now();
  if(sel.herd){const h=Pl.herds.find(x=>x.id===sel.herd);const f=faunaOf(Pl,h.fauna);return `<b style="color:${f.color}">${esc(f.name)}</b> herd · ×${c?herdAvail(c,h,now):h.size}<br>Threat ${f.threat} · trophies sell for ${fmt(itemInfo(Pl,'h:'+f.id).value)} each`}
  if(sel.tribe){const t=tribeOf(Pl,sel.tribe);const ts=c&&c.tribes[t.id];return `<b style="color:${t.color}">${esc(t.name)}</b><br>${esc(t.title)} ${esc(t.leader)}${ts?'<br>'+(ts.st==='wiped'?'Wiped out':`~${ts.warriors} warriors · ${ts.st}`):''}`}
  if(sel.colony)return `<b>${esc(who(sel.colony))}</b><br>Tap to watch their colony`;
  if(sel.mine)return `<b>Your colony</b><br>Tap to go back to the mine`;
  if(sel.party){const p=c.parties.find(x=>x.id===sel.party);return p?`<b>${p.kind==='hunt'?'Hunting':'War'} party</b> · ${p.n} soldiers<br>${p.st}`:''}
  const reg=regOf(Pl,sel.region);const tr=reg.tribe&&tribeOf(Pl,reg.tribe);const seen=!c||fogSeen(c,sel.x,sel.y);return `<b>${esc(reg.name)}</b>${tr?` · claimed by <span style="color:${tr.color}">${esc(tr.name)}</span>`:' · frontier'}<br>${seen?`Ores: ${reg.ores.map(id=>{const o=oreOf(Pl,id);return `<span class="swatch" style="background:${o.color}"></span>`}).join('')} · hardness ${reg.hardMod>0?'+':''}${reg.hardMod} · yield ×${reg.extract}`:'Unscouted'}`}
function mapCardHTML(sel){const Pl=P(),c=S.colony;const now=Date.now();if(!sel)return '';let h=`<button class="buy sm ghost close" data-act="mapclose">✕</button>`;
  if(S.landMode&&sel.region){const reg=regOf(Pl,sel.region);const ok=reg.frontier&&!Object.values(S.colonies).some(o=>o.v===2&&o.landed&&o.base&&o.planetId===Pl.id&&o.uid!==(c&&c.uid)&&Math.hypot(o.base.x-sel.x,o.base.y-sel.y)<90);
    h+=`<h4>${esc(reg.name)}</h4><p class="lede">${esc(reg.blurb||'')}</p>${regionDetails(reg)}${reg.frontier?'':`<div class="note">${esc(tribeOf(Pl,reg.tribe).name)} claims this land. Your first dropship has to land in frontier territory.</div>`}${ok?`<label class="f">Colony name <input type="text" id="colName" maxlength="28" value="${esc(c.name||'')}" placeholder="Hole Lot of Profit"></label><div class="btnrow"><button class="buy" data-act="land">Drop the pod here</button></div>`:reg.frontier?'<div class="note">Too close to another colony. Pick a spot a little further away.</div>':''}`;return h}
  if(sel.herd){const hd=Pl.herds.find(x=>x.id===sel.herd);const f=faunaOf(Pl,hd.fauna);const p=herdPos(hd,now);const T=territoryAt(c,Pl,p.x,p.y);const n=herdAvail(c,hd,now);
    h+=`<h4 style="color:${f.color}">${esc(f.name)}</h4><p class="lede">${esc(f.blurb||'A herd of something edible and angry.')}</p><div class="chips"><span class="chip">×${n}</span><span class="chip">Threat ${f.threat}</span><span class="chip">${fmt(itemInfo(Pl,'h:'+f.id).value)} per trophy</span></div>`;
    if(T.tribe&&!T.legal)h+=`<div class="note">This is ${esc(tribeOf(Pl,T.tribe).name)} land. Hunting here without rights angers them and risks an ambush.</div>`;
    h+=`<p>Send <span class="stepper"><button data-act="army:size:-1">−</button><b>${c.army.size}</b><button data-act="army:size:1">+</button></span> of ${homeSoldiers(S.rt).length} soldiers at home.</p><div class="btnrow"><button class="buy" data-act="hunt:${hd.id}" ${playing()&&n>0?'':'disabled'}>Send hunting party</button></div>`}
  else if(sel.tribe){const t=tribeOf(Pl,sel.tribe);const ts=c.tribes[t.id];h+=`<h4 style="color:${t.color}">${esc(t.name)}</h4><p class="lede">${esc(t.title)} ${esc(t.leader)} rules here. ${statusPill(ts)}</p>${relBar(ts.rel)}<div class="btnrow">${ts.st!=='wiped'?`<button class="buy alt" data-act="chat:${t.id}">Talk</button><button class="buy danger" data-act="invade:${t.id}" ${playing()?'':'disabled'}>Invade with ${c.army.size}</button>`:''}</div>${ts.st!=='war'&&ts.st!=='wiped'?'<p class="lede">Invading declares war.</p>':''}`}
  else if(sel.colony){h+=`<h4>${esc(who(sel.colony))}</h4><div class="btnrow"><button class="buy ghost" data-act="watch:${esc(sel.colony)}">Watch their colony</button></div>`}
  else if(sel.mine){h+=`<h4>${esc(c.name)}</h4><div class="btnrow"><button class="buy" data-act="togglemap">Back to the mine</button></div>`}
  else if(sel.party){const p=c.parties.find(x=>x.id===sel.party);if(!p)return '';h+=`<h4>${p.kind==='hunt'?'Hunting':'War'} party</h4><p>${p.n} soldiers · ${p.st}</p>${p.st==='fight'?`<div class="btnrow"><button class="buy danger" data-act="cam:${p.id}">Watch the fight</button></div>`:''}`}
  else{const reg=regOf(Pl,sel.region);const cost=scoutCost(c,sel.x,sel.y);h+=`<h4>${esc(reg.name)}</h4><p class="lede">${esc(reg.blurb||'')}</p>${fogSeen(c,sel.x,sel.y)?regionDetails(reg):'<p class="lede">Unscouted. Send the drone to see what lives here.</p>'}<div class="btnrow"><button class="buy ghost" data-act="scout" ${playing()&&c.coin>=cost?'':'disabled'}>Send scout drone · ${fmt(cost)}</button></div><p class="lede">Fuel costs more the further the drone flies.</p>`}
  return h}
function regionDetails(reg){const Pl=P();const tr=reg.tribe&&tribeOf(Pl,reg.tribe);const W2=weatherOf(reg,Date.now());
  return `<p>${reg.ores.map((id,i)=>{const o=oreOf(Pl,id);return `<span class="chip"><i style="background:${o.color}"></i>L${i+1} ${esc(o.name)}</span>`}).join(' ')}</p><p class="lede">Hardness ${reg.hardMod>0?'harder':reg.hardMod<0?'softer':'normal'} · yield ×${reg.extract} · weather now: ${esc(W2.name)}<br>Wildlife: ${reg.surface.map(id=>esc(faunaOf(Pl,id).name)).join(', ')}${tr?`<br>Claimed by <span style="color:${tr.color}">${esc(tr.name)}</span>`:''}</p>`}

/* ================= AI layer ================= */
function aiSettings(){const s=lsGet('msc_ai')||{};if(!s.provider)s.provider='off';return s}
function parseJSON(t){try{return JSON.parse(t)}catch(e){}const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(t.slice(a,b+1))}catch(e){}}throw new Error('The AI replied with something that was not JSON')}
async function askJSON(prompt,tier){
  const s=aiSettings();
  if(s.provider==='anthropic'){if(!s.key)throw new Error('No Claude API key set');const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':s.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:s.model||'claude-sonnet-5-5',max_tokens:4000,messages:[{role:'user',content:prompt}]})});if(!r.ok)throw new Error('Claude API '+r.status+' '+(await r.text().catch(()=>'')).slice(0,160));const j=await r.json();return parseJSON((j.content||[]).map(b=>b.text||'').join(''))}
  if(s.provider==='openai'){if(!s.key)throw new Error('No OpenAI key set');const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+s.key},body:JSON.stringify({model:s.model||'gpt-5',messages:[{role:'user',content:prompt}],response_format:{type:'json_object'}})});if(!r.ok)throw new Error('OpenAI '+r.status+' '+(await r.text().catch(()=>'')).slice(0,160));const j=await r.json();return parseJSON(j.choices[0].message.content)}
  throw new Error('AI is switched off in Settings')}

/* ---------- species ---------- */
async function createSpecies(arch,name,desc){
  const A=ARCH[arch];let sp={arch,name:str(name,A.name,32),demonym:'',tagline:A.blurb,look:Object.assign({},A.look)};
  try{const a=await askJSON(`You are naming an alien species for a darkly funny, cartoonishly violent pixel-art mining game where players compete as interplanetary venture capitalists.
Species name chosen by the player: "${String(name).slice(0,40)}". Player's description: "${String(desc).slice(0,400)}".
Gameplay archetype: ${A.name}: ${A.blurb} ${A.perk}
Reply with ONLY JSON: {"name":"species name (keep the player's if given)","demonym":"plural name","tagline":"one funny sentence, max 16 words","look":{"skin":"#hex","accent":"#hex","head":"dome|antenna|horn|tentacle|cyclops|visor|tall"}}`,'quick');
    sp.name=str(a.name,sp.name,32);sp.demonym=str(a.demonym,'',32);sp.tagline=str(a.tagline,A.blurb,140);if(a.look){sp.look.skin=hex(a.look.skin,sp.look.skin);sp.look.accent=hex(a.look.accent,sp.look.accent);if(HEADS.includes(a.look.head))sp.look.head=a.look.head}
  }catch(e){sp.aiError=errMsg(e)}
  return sp}

/* ---------- diplomacy ---------- */
function dealScale(c){const rt=S.rt;const tp=rt?throughput(c,P(),rt.st):{coin:2};return Math.max(150,tp.coin*90)}
function weaponUnit(c){return 40*Math.pow(3,c.gear.weapon-1)}
function itemValue(c,it){const Pl=P(),V=dealScale(c);const k=String(it.item||''),n=Math.max(0,Math.round(+it.amount||0));
  if(k==='coin')return n;if(k.startsWith('ore:')){const o=oreOf(Pl,k.slice(4));return o?n*o.value:0}if(k==='weapons')return n*weaponUnit(c);
  return {hunting_rights:4*V,alliance:15*V,peace:8*V,warriors:n*crewCost(c,'soldiers')*1.2,map:2*V,lessons:3*V}[k]||0}
function normDeal(c,t,ts,raw){if(!raw||typeof raw!=='object')return null;const Pl=P();const okGive=['coin','weapons'],okGet=['coin','hunting_rights','alliance','peace','warriors','map','lessons'];
  const clean=(arr,ok,give)=>(Array.isArray(arr)?arr:[]).slice(0,4).map(x=>({item:String(x&&x.item||''),amount:Math.max(0,Math.round(+(x&&x.amount)||0))})).filter(x=>(ok.includes(x.item)||(x.item.startsWith('ore:')&&oreOf(Pl,x.item.slice(4))))&&(['hunting_rights','alliance','peace','map','lessons'].includes(x.item)||x.amount>0));
  let give=clean(raw.you_give,okGive,true),get=clean(raw.you_get,okGet,false);
  get=get.filter(x=>!(x.item==='peace'&&ts.st!=='war')&&!(x.item==='hunting_rights'&&(ts.rights||ts.st==='allied'))&&!(x.item==='alliance'&&(ts.st==='allied'||ts.rel<40||ts.st==='war'))&&!(x.item==='map'&&ts.mapped));
  get.forEach(x=>{if(x.item==='warriors')x.amount=Math.min(x.amount,5,Math.floor(ts.warriors/4));if(x.item.startsWith('ore:'))x.amount=Math.min(x.amount,600);if(x.item==='coin')x.amount=Math.min(x.amount,dealScale(c)*6)});get=get.filter(x=>x.item!=='warriors'||x.amount>0);
  give.forEach(x=>{if(x.item==='weapons')x.amount=Math.min(x.amount,40)});
  if(!give.length&&!get.length)return null;
  const S2=S.rt.st;const ratio=Math.max(0.6,1+ts.rel/200+S2.dealBonus+(t.personality==='greedy'?-0.15:0)+(t.personality==='peaceful'?0.1:0));
  let gv=give.reduce((s,x)=>s+itemValue(c,x),0),tv=get.reduce((s,x)=>s+itemValue(c,x),0);let extra=0;
  if(!give.length&&tv>0&&!(ts.rel>=30&&tv<=dealScale(c)*0.4))extra=Math.ceil(tv/ratio);
  else if(tv>gv*ratio)extra=Math.ceil(tv/ratio-gv);
  if(extra>0){const e=give.find(x=>x.item==='coin');if(e)e.amount+=extra;else give.push({item:'coin',amount:extra})}
  return{give,get,extra,summary:str(raw.summary,'',160),id:'d'+Date.now().toString(36)}}
function itemLabel(it,acc,seed){const Pl=P();let n=it.amount;const k=it.item;const fuzzy=v=>{if(acc<0.5)return '??';if(acc<0.9){const r=rng(hash(seed+k))();return '≈'+fmt(Math.round(v*(0.65+r*0.7)))}return fmt(v)};
  if(k==='coin')return `${fuzzy(n)} coin`;if(k.startsWith('ore:')){const o=oreOf(Pl,k.slice(4));return `${fuzzy(n)} ${o?o.name:'ore'}`}if(k==='weapons')return `${fuzzy(n)} ${WEAPONS[S.colony.gear.weapon].name}`;if(k==='warriors')return `${fuzzy(n)} warriors join you`;
  return {hunting_rights:'Hunting rights in their land',alliance:'An alliance',peace:'Peace',map:'A map of their land',lessons:'Language lessons'}[k]||k}
function dipPrompt(c,Pl,t,ts,st,text){const reg=regOf(Pl,t.region);const yard=Object.keys(c.raw).filter(k=>c.raw[k]>5).map(k=>`ore:${k} (${oreOf(Pl,k)?.name}) x${Math.floor(c.raw[k])}`).join(', ')||'nothing much';
  const hist=ts.log.slice(-10).map(m=>m.who==='you'?`COLONIST: ${m.text}`:m.who==='them'?`${t.people.toUpperCase()} (meaning): ${m.meaning||m.device||''}`:`EVENT: ${m.text}`).join('\n');
  const V=Math.round(dealScale(c));
  return `You are ${t.title} ${t.leader}, leader of ${t.name} (the ${t.people}), a native tribe on the alien mining planet ${Pl.name}. Tone: darkly funny, a little violent, never cruel to real people. Personality: ${t.personality}. Your people love ${CAT[t.likes].label.toLowerCase()} goods. You claim the region "${reg.name}". You have about ${ts.warriors} warriors armed at tech level ${ts.wtier}/5.
Your language sounds like ${t.lang.sounds}. Known words: ${Object.entries(t.lang.words).map(([k,v])=>v+'='+k).join(', ')}. Invent the rest consistently in that style.
RELATIONSHIP with this colony: goodwill ${Math.round(ts.rel)} on -100..100, status ${ts.st}${ts.rights?', they already have hunting rights':''}.
THE COLONY: "${c.name}", species ${c.species.name} (${ARCH[c.species.arch].name}). ${c.crew.soldiers} soldiers with ${WEAPONS[c.gear.weapon].name}. About ${fmt(c.coin)} coin. In their yard: ${yard}.
Their translator is ${Math.round(st.acc*100)}% accurate. Their message reached you through it, so if accuracy is low you may misunderstand parts of it in plausible, funny ways.
Conversation so far:
${hist||'(first contact)'}
NEW MESSAGE FROM THE COLONIST: """${String(text).slice(0,500)}"""
Reply in character. You may propose ONE deal. Deal items the colonist can give: "coin", "weapons" (count), "ore:<id>" using ids from their yard. Items you can give: "coin", "ore:<id>" using ores of your land (${reg.ores.slice(0,3).map(id=>'ore:'+id+' '+oreOf(Pl,id).name).join(', ')}), "hunting_rights", "alliance" (only if goodwill is high), "peace" (only at war), "warriors" (count), "map", "lessons". A fair trade for this colony is on the order of ${fmt(V)} coin per favor. The game engine rebalances unfair deals, so be greedy or generous as your personality dictates.
If insulted badly, you may declare war. Keep replies short: 1-3 sentences.
Reply with ONLY JSON:
{"native":"your reply written in your language","meaning":"what it truly means in English","device":"what a ${Math.round(st.acc*100)}%-accurate translator would display. ${st.acc<0.01?'Empty string: they have no translator.':st.acc<0.9?'Include some plausible, funny mistranslations proportional to the inaccuracy.':'Nearly perfect.'}","heard":"how you understood their message","mood":"pleased|neutral|annoyed|furious|amused|scared|greedy","relation_change":-25 to 25,"deal":null or {"summary":"short","you_give":[{"item":"...","amount":n}],"you_get":[{"item":"...","amount":n}]},"declare_war":false}`}
async function sendChat(tid,text){const c=S.colony,Pl=P(),t=tribeOf(Pl,tid),ts=c.tribes[tid];if(S.chatBusy||!text.trim())return;S.chatBusy=true;const st=S.rt.st;
  ts.log.push({who:'you',text:text.slice(0,500),t:Date.now()});ts.log=ts.log.slice(-24);ts.deal=null;renderTab();
  try{const a=await askJSON(dipPrompt(c,Pl,t,ts,st,text),'default');
    const delta=clamp(+a.relation_change||0,-25,25);ts.rel=clamp(ts.rel+(delta>0?delta*st.relMult:delta),-100,100);
    const msg={who:'them',native:str(a.native,'...',320),meaning:str(a.meaning,'',320),device:st.acc>0.01?str(a.device,'',320):'',heard:str(a.heard,'',200),mood:str(a.mood,'neutral',16),t:Date.now()};ts.log.push(msg);ts.log=ts.log.slice(-24);
    const d=normDeal(c,t,ts,a.deal);if(d)ts.deal=d;
    if(ts.st!=='war'&&((a.declare_war&&ts.rel<-20)||ts.rel<=-75)&&!st.noWarFirst){ts.st='war';ts.rights=false;ts.nextRaid=Date.now()+120e3;ts.log.push({who:'sys',text:`${t.name} declared war.`,t:Date.now()});addFeed(`${t.name} declared war on {p}.`,'war');toast(`${t.name} declared war!`,5000)}
  }catch(e){ts.log.push({who:'sys',text:`No answer: ${errMsg(e)}. Check the AI engine in Settings.`,t:Date.now()})}
  S.chatBusy=false;markSave(300);renderTab()}
function canAfford(c,d){for(const x of d.give){if(x.item==='coin'&&c.coin<x.amount)return false;if(x.item==='weapons'&&c.coin<x.amount*weaponUnit(c))return false;if(x.item.startsWith('ore:')&&(c.raw[x.item.slice(4)]||0)<x.amount)return false}return true}
function acceptDeal(tid){const c=S.colony,Pl=P(),t=tribeOf(Pl,tid),ts=c.tribes[tid];const d=ts.deal;if(!d||!playing()||!canAfford(c,d))return;
  for(const x of d.give){if(x.item==='coin')c.coin-=x.amount;else if(x.item==='weapons'){c.coin-=x.amount*weaponUnit(c);if(x.amount>=5&&ts.wtier<c.gear.weapon)ts.wtier=Math.min(c.gear.weapon,ts.wtier+1)}else if(x.item.startsWith('ore:'))takeFrom(c.raw,x.item.slice(4),x.amount)}
  const del={id:'v'+Date.now().toString(36),side:t.village.x<c.base.x?'L':'R',tribe:t.id,ore:{},note:`${t.name} delivered your deal.`};let hasDel=false;
  for(const x of d.get){if(x.item==='coin'){del.coin=(del.coin||0)+x.amount;hasDel=true}else if(x.item.startsWith('ore:')){del.ore[x.item.slice(4)]=(del.ore[x.item.slice(4)]||0)+x.amount;hasDel=true}else if(x.item==='warriors'){del.warriors=(del.warriors||0)+x.amount;ts.warriors=Math.max(0,ts.warriors-x.amount);hasDel=true}
    else if(x.item==='hunting_rights')ts.rights=true;else if(x.item==='alliance'){ts.st='allied';ts.rights=true;ts.nextGift=Date.now()+15*60e3}else if(x.item==='peace'){ts.st='neutral';ts.rel=Math.max(ts.rel,-10)}else if(x.item==='map'){ts.mapped=true;revealTribe(c,Pl,t.id)}else if(x.item==='lessons')ts.skill=Math.min(0.3,(ts.skill||0)+0.1)}
  if(hasDel)(c.deliv||(c.deliv=[])).push(del);
  ts.rel=clamp(ts.rel+5,-100,100);ts.log.push({who:'sys',text:`Deal done. You gave ${d.give.map(x=>itemLabel(x,1,'')).join(', ')||'nothing'}. You get ${d.get.map(x=>itemLabel(x,1,'')).join(', ')||'nothing'}.`,t:Date.now()});ts.deal=null;
  addFeed(`{p} struck a deal with ${t.name}.`,'deal');toast(hasDel?'Deal done. Their porters are on the way.':'Deal done.');markSave(300);renderTab()}
function startInvasion(tid){const c=S.colony,Pl=P(),t=tribeOf(Pl,tid),ts=c.tribes[tid];if(!playing()||ts.st==='wiped')return;
  if(ts.st!=='war'){ts.st='war';ts.rights=false;ts.rel=Math.min(ts.rel,-60);ts.nextRaid=Date.now()+240e3;addFeed(`{p} declared war on ${t.name}.`,'war')}
  const p=sendParty(S.rt,'war',c.army.size,{tribe:tid});if(p){toast(`${p.n} soldiers are marching on ${t.name}.`);S.mapSel=null;renderTab()}}
function chatView(){const c=S.colony,Pl=P(),t=tribeOf(Pl,S.chat),ts=c.tribes[t.id];const st=S.rt.st;const acc=Math.min(0.99,st.acc+(ts.skill||0));
  let h=`<button class="buy sm ghost" data-act="chatback">← All tribes</button><h2 style="color:${t.color};margin-top:8px">${esc(t.title)} ${esc(t.leader)}</h2><p class="lede">${esc(t.name)} · ${statusPill(ts)} · they sound like ${esc(t.lang.sounds)}</p>${relBar(ts.rel)}`;
  if(st.acc<0.01)h+=`<div class="note">You have no translator. You'll only see their words. Buy one in Build, or try their words below.</div>`;
  const known=Object.entries(t.lang.words).slice(0,Math.round((ts.skill||0)*40)+3);h+=`<p class="lede" style="font-size:12px">Words you know: ${known.map(([k,v])=>`<b>${esc(v)}</b>=${esc(k)}`).join(' · ')}</p>`;
  h+=`<div class="chat" id="chatlog">${ts.log.map(m=>m.who==='you'?`<div class="msg you">${esc(m.text)}</div>`:m.who==='them'?`<div class="msg them"><div class="mood">${esc(m.mood||'')}</div><div class="native">${esc(m.native)}</div>${m.device?`<div class="dev">${esc(m.device)}</div>`:''}${acc>=0.95&&m.heard?`<div class="lede" style="font-size:12px">They heard: ${esc(m.heard)}</div>`:''}</div>`:`<div class="lede" style="font-size:13px;text-align:center">${esc(m.text)}</div>`).join('')||'<p class="lede">First contact. Say something.</p>'}${S.chatBusy?'<div class="msg them"><div class="native">…</div></div>':''}</div>`;
  if(ts.deal){const d=ts.deal;h+=`<div class="deal"><b>Proposed deal</b>${acc<0.9?' <span class="pill warn">as your translator reads it</span>':''}<div class="lede">You give:</div><ul>${d.give.map(x=>`<li>${esc(itemLabel(x,acc,d.id))}</li>`).join('')||'<li>Nothing</li>'}</ul><div class="lede">You get:</div><ul>${d.get.map(x=>`<li>${esc(itemLabel(x,acc,d.id))}</li>`).join('')||'<li>Nothing</li>'}</ul>${d.extra?`<p class="lede">They pushed the price up${acc>=0.9?` by ${fmt(d.extra)} coin`:''}.</p>`:''}<div class="btnrow"><button class="buy ok" data-act="deal-yes:${t.id}" ${playing()&&canAfford(c,d)?'':'disabled'}>${canAfford(c,d)?'Accept':'Can\'t afford'}</button><button class="buy ghost" data-act="deal-no:${t.id}">Decline</button></div></div>`}
  h+=`<label class="f">Your message <textarea id="chatIn" maxlength="500" placeholder="We come in peace and with shiny rocks. Can we hunt your goats?"></textarea></label><div class="btnrow"><button class="buy alt" data-act="chat-send:${t.id}" ${S.chatBusy?'disabled':''}>Send</button><button class="buy danger" data-act="invade:${t.id}" ${playing()?'':'disabled'}>Invade</button></div><p class="lede">Each message asks Claude, using the sender's own Claude usage.</p>`;
  return h}

/* ---------- planets ---------- */
function planetPrompt(req){return `You are THE MAKER, a bored, theatrical cosmic entity who builds absurd, cartoonishly violent, hilarious alien mining planets for a multiplayer game where friends compete as mining venture capitalists.
${req?`Last month's winner earned the right to request this month's planet. Their request: """${String(req).slice(0,600)}"""
Honor the spirit of the request, but you decide the details.`:'Nobody made a request this month. Improvise something memorable.'}
Reply with ONLY a JSON object:
{"name":"planet name","tagline":"<=12 words","story":"3-4 punchy, darkly funny sentences",
"sky":["#hex top","#hex horizon"],"surface":"#hex ground",
"layers":[5 objects shallow to deep: {"name":"","color":"#hex"}],
"ores":[10-12 objects: {"name":"","category":"metal|crystal|gas|organic|exotic","tier":0-4,"blurb":"<=12 words"}],
"regions":[7 objects: {"name":"","blurb":"<=12 words","color":"#hex biome tint","weather":[1-2 of "acid","fog","lava","quake","meteor","aurora","wind","blood"]}],
"stations":[3 off-world trading stations: {"name":"","blurb":"<=12 words","loves":"category","hates":"category","distance":"near|mid|far"}],
"fauna":[7-9 objects: {"name":"","kind":"surface|cave","threat":1-5,"minLayer":0-4,"color":"#hex","blurb":"<=12 words"}] with at least 4 surface animals to hunt and 3 cave monsters,
"tribes":[4 native tribes: {"name":"","people":"","leader":"","title":"","personality":"proud|greedy|peaceful|warlike|spiritual|paranoid","likes":"category","sounds":"how their language sounds","words":{"hello":"","friend":"","enemy":"","trade":"","war":"","peace":""},"blurb":""}]}
Give every ore tier at least two ores. Exotic only tier 3-4. The engine sets all prices, positions and numbers, so spend your effort on flavor and jokes.`}
async function generatePlanet(prompt){
  const w0=await wGet();if(!w0)return;
  if(w0.status==='generating'&&Date.now()-(w0.genAt||0)<180000){toast('The Maker is already building a planet.');return}
  await wSet({...w0,status:'generating',genBy:S.uid,genAt:Date.now()});
  let raw=null,err='';try{raw=await askJSON(planetPrompt(prompt),'complex')}catch(e){err=errMsg(e)}
  const p=buildPlanet(Object.assign({},raw||{},{prompt:prompt||'',author:prompt?S.uid:null,id:null}),Date.now().toString(36)+(S.uid||'x').slice(-5));p.improvised=!raw;
  const w1=(await wGet())||w0;
  await wSet({...w1,status:'active',planet:p,planetId:p.id,effects:[],genBy:null,promptBy:null,month:monthKey(Date.now()),v:2});
  addFeed(prompt?`{p} asked the Maker for a planet. The Maker delivered ${p.name}.`:`The Maker improvised ${p.name}. Nobody is safe.`,'world');
  if(err)toast(`AI unavailable (${err}). The Maker improvised from scraps instead.`,6000)}

/* ================= storage ================= */
async function wGet(){if(S.local)return lsGet('msc_world2');const s=await S.db.doc('world/current').get();const d=s.exists?s.data():null;return d&&d.planet?JSON.parse(JSON.stringify(d)):null}
async function wSet(w){if(S.local){lsSet('msc_world2',w);onWorld(w);return}await S.db.doc('world/current').set(w)}
async function lease(){if(S.local)return true;try{const r=await S.db.doc('locks/world').acquire({holder:S.uid||'anon',ttlMs:20000});return r.acquired}catch(e){return false}}
async function listColonies(){if(S.local)return S.colony?[S.colony]:[];const q=await S.db.collection('colonies').get();return q.docs.map(d=>d.data())}
function cleanColony(c){if(S.rt&&S.rt.c===c){const lc={};for(const l of (S.rt.lifts||[]))for(const k in (l.cargo||{}))lc[k]=(lc[k]||0)+l.cargo[k];c.liftCargo=lc}fogSave(c);const o=JSON.parse(JSON.stringify(c,(k,v)=>k&&k[0]==='_'?undefined:v));
  const rnd=m=>{const n={};for(const id in m){const v=m[id];if(v>1e-3)n[id]=Math.round(v*100)/100}return n};o.raw=rnd(o.raw);o.prod=rnd(o.prod);o.depl=rnd(o.depl);for(const k in o.faces)o.faces[k]=Math.round(o.faces[k]*10)/10;
  for(const k in o.chute)o.chute[k]=rnd(o.chute[k]);for(const k in o.hopper)o.hopper[k]=rnd(o.hopper[k]);o.ships=o.ships.map(s=>Object.assign({},s,{cargo:rnd(s.cargo||{})}));o.coin=Math.round(o.coin*100)/100;o.earned=Math.round(o.earned);o.updated=Date.now();
  for(const k in o.tribes){const t=o.tribes[k];t.log=(t.log||[]).slice(-12)}return o}
async function saveColony(force){const c=S.colony;if(!c||!S.canWrite)return;const now=Date.now();
  if(!force&&!(S.saveAt&&now>=S.saveAt)&&now-S.lastSave<20000)return;S.lastSave=now;S.saveAt=0;let data;try{data=cleanColony(c)}catch(e){console.error(e);return}
  if(S.local){lsSet('msc_colony2',data);S.colonies[c.uid]=data;return}
  try{await S.db.doc('colonies/'+c.uid).set(data)}catch(e){if(e.code==='permission-denied'){S.canWrite=false;toast('Could not save. You may be offline or not signed in. Reload to reconnect.')}}}
async function addFeed(text,kind='info',by){const e={t:Date.now(),by:by||S.uid||null,text:String(text).slice(0,240),kind};if(S.local){S.feed.unshift(e);S.feed=S.feed.slice(0,40);lsSet('msc_feed2',S.feed);renderTicker();return}try{await S.db.collection('feed').add(e)}catch(err){}}

/* ================= world lifecycle ================= */
const DEFAULT_V1={id:'pw9arte',name:'Gorbulon-7',tagline:'A planet that is 40% rock and 60% grudge.',story:"Gorbulon-7 was voted Least Likely to Support Life four eons running, and it took that personally. Its crust is riddled with ore, its caves are riddled with teeth, and its weather files formal complaints. The Maker opened it for colonization mostly to see what happens. Dig fast. Die funny.",sky:['#2a1446','#ff8a5c'],surface:'#8a4f3d',layers:[{name:'Crusty Topsoil',color:'#8a5a44'},{name:'Grumble Clay',color:'#6e4a5e'},{name:'Screaming Shale',color:'#4e3f6b'},{name:'Molten Regret',color:'#7a2e3a'},{name:'The Gooey Core',color:'#3b1f4f'}],resources:[],stations:[],regions:[],creatures:[]};
async function ensureWorld(){let w=await wGet();
  for(let tries=0;tries<12;tries++){
    if(w&&w.planet&&w.planet.v===2)return w;
    if(await lease()){w=await wGet();if(!w||!w.planet){const p=upgradeV1(DEFAULT_V1);p.id='p'+Date.now().toString(36);w={month:monthKey(Date.now()),status:'active',planet:p,planetId:p.id,effects:[],history:[],created:Date.now(),v:2};await wSet(w);addFeed(`The Maker unveiled ${p.name}. Colonists may now land and regret it.`,'world');return w}
      if(w.planet.v!==2){const p=upgradeV1(w.planet);w={...w,planet:p,planetId:p.id,effects:[],v:2};await wSet(w);addFeed(`The Maker remodeled ${p.name}: regions, tribes, herds and tangible mines. Everyone starts fresh with a starter grant.`,'world');return w}return w}
    await new Promise(r=>setTimeout(r,1500));w=await wGet()}
  return w}
function resetForPlanet(c,w){const last=(w.history||[]).slice(-1)[0];if(last&&last.winner===c.uid&&c.lastWinMonth!==last.month){c.wins=(c.wins||0)+1;c.lastWinMonth=last.month}
  c.planetId=w.planetId;c.landed=false;c.base=null;c.region=null;c.tribes={};c.fog='';c.herdKills={};freshRun(c);c.lastTick=Date.now();FOG=null;markSave(200)}
async function checkRollover(force){const w=S.world;if(!w||S.rolling)return;if(!force&&!(w.status==='active'&&monthKey(Date.now())>w.month))return;S.rolling=true;
  try{if(!(await lease()))return;const w0=await wGet();if(!w0)return;const mk=monthKey(Date.now());if(!force&&(w0.month>=mk||w0.status!=='active'))return;await saveColony(true);
    let list=(await listColonies()).filter(c=>c.v===2&&c.planetId===w0.planetId&&c.landed);if(S.colony&&S.colony.landed&&S.colony.planetId===w0.planetId){list=list.filter(c=>c.uid!==S.colony.uid);list.push(S.colony)}
    list.sort((a,b)=>b.coin-a.coin);const win=list[0];const hist=(w0.history||[]).concat([{month:w0.month,planet:w0.planet.name,winner:win?win.uid:null,colony:win?win.name:null,coin:win?Math.round(win.coin):0,players:list.length}]).slice(-24);
    if(win){await wSet({...w0,history:hist,status:'awaiting',promptBy:win.uid,awaitingSince:Date.now(),month:mk});addFeed(`{p} won ${monthName(w0.month)} on ${w0.planet.name} with ${fmt(win.coin)} coin and gets to dream up the next planet.`,'win',win.uid)}
    else{const p=buildPlanet(null,Date.now().toString(36));await wSet({...w0,history:hist,status:'active',planet:p,planetId:p.id,effects:[],month:mk})}}finally{S.rolling=false}}
function onWorld(w){if(!w||!w.planet||w.planet.v!==2)return;const prev=S.world&&S.world.planetId;S.world=w;
  if(S.colony&&w.status==='active'&&S.colony.planetId!==w.planetId&&(S.colony.landed||S.colony.planetId)){resetForPlanet(S.colony,w);S.rt=null;S.landMode=false}
  if(prev&&prev!==w.planetId){toast(`New planet: ${w.planet.name}`,5000);MAPC.key='';SKY.key=''}
  if(w.history&&w.history.length)resolveNames();renderTab();refreshOverlay()}
let nameT=0;async function resolveNames(){if(!S.user||Date.now()-nameT<4000)return;nameT=Date.now();const ids=new Set(Object.keys(S.colonies));S.feed.forEach(f=>f.by&&ids.add(f.by));((S.world&&S.world.history)||[]).forEach(h=>h.winner&&ids.add(h.winner));if(S.world&&S.world.promptBy)ids.add(S.world.promptBy);if(!ids.size)return;try{S.profiles=await S.user.profiles([...ids]);renderTicker();if(['ranks'].includes(S.tab))renderTab();refreshOverlay(true)}catch(e){}}

/* ================= colony start ================= */
function startRuntime(){const c=S.colony;if(!c||!c.landed||c.planetId!==S.world.planetId){S.rt=null;return}initTribes(c,P());S.rt=makeRT(c,'own')}
function land(){const c=S.colony,Pl=P(),sel=S.mapSel;if(!sel||!sel.region)return;const reg=regOf(Pl,sel.region);if(!reg.frontier)return;
  const nm=str(($('#colName')||{}).value,'',28)||procName(Math.random);c.name=nm;c.base={x:Math.round(sel.x),y:Math.round(sel.y)};c.region=reg.id;c.planetId=Pl.id;c.landed=true;
  freshRun(c);c.coin+=c.grant||0;c.grant=0;c.tribes={};initTribes(c,Pl);c.nextShuttle=Date.now()+5000;c.nextBeast=Date.now()+180e3;c.lastTick=Date.now();c.runStart=Date.now();
  FOG=null;reveal(c,c.base.x,c.base.y,170);c.drone={x:c.base.x,y:c.base.y,tx:c.base.x,ty:c.base.y};
  S.landMode=false;S.mapSel=null;S.view='side';S.rt=makeRT(c,'own');S.rt.shake=14;for(let i=0;i<40;i++)puff(S.rt,SX-200+Math.random()*400,-4,'#c8a080',1,200,4,true);pop(S.rt,SX,-120,'COLONY ESTABLISHED','#ffd23f',3);
  fitSide();addFeed(`{p} landed in ${reg.name}. Locals are already drooling.`,'land');markSave(100);renderTab();refreshOverlay(true);$('#mapcard').hidden=true}
function launchMissile(){const c=S.colony,g=spGain(c);if(!playing()||g<1)return;S.armMissile=false;S.missile={t0:performance.now()};S.view='side';fitSide();
  setTimeout(()=>{const rt=S.rt;if(rt){rt.shake=30;for(let i=0;i<10;i++){puff(rt,SX-600+Math.random()*1200,-20,'#ffb347',40,500,5,false);puff(rt,SX-600+Math.random()*1200,-20,'#ff3d7f',30,400,4,false)}for(const u of rt.u.slice())if(!u.dead&&u.side===0&&u.y<5)kill(rt,u,80,Math.random()<0.5?-1:1,null,'meteor');pop(rt,SX,-160,'OBLITERATED','#ffd23f',4)}},1300);
  setTimeout(()=>{c.sp+=g;c.spLife=(c.spLife||0)+g;c.prestiges=(c.prestiges||0)+1;freshRun(c);c.nextShuttle=Date.now()+4000;c.nextBeast=Date.now()+200e3;c.lastTick=Date.now();S.missile=null;S.rt=makeRT(c,'own');markSave(100);addFeed(`The Maker obliterated {p} on request. Spectacle rating: ${g} SP.`,'boom');toast(`+${g} Spectacle Points. Spend them in the skill tree.`);renderTab()},4500);renderTab()}

/* ================= overlays ================= */
function refreshOverlay(force){const ov=$('#ov'),b=$('#ovBody'),w=S.world,c=S.colony;let kind='';
  if(S.modal)kind=S.modal.kind;else if(!w)kind='';else if(w.status!=='active')kind=w.status;else if(c&&S.canWrite&&c.migrated&&!c.welcomed)kind='welcome';else if(c&&S.canWrite&&!c.species)kind='species';else if(S.away)kind='away';else if(c&&S.canWrite&&c.species&&c.landed&&c.news!==3)kind='news';
  if(!kind&&c&&S.canWrite&&c.species&&w&&w.status==='active'&&(!c.landed||c.planetId!==w.planetId)){if(!S.landMode){S.landMode=true;S.view='map';fitMap()}}
  const key=kind+'|'+(w&&w.status)+'|'+(w&&w.promptBy)+'|'+(S.modal&&S.modal.party)+'|'+(S.archPick||'');if(!force&&key===S.ovKey)return;S.ovKey=key;
  if(!kind){ov.hidden=true;b.innerHTML='';b.className='sheet';return}ov.hidden=false;b.className='sheet';let h='';
  if(kind==='settings'){const s=aiSettings();h=`<button class="buy ghost close" data-act="close">Close</button><h1>Settings</h1><h3>AI engine (tribes, species, new planets)</h3>
    <label class="f">Engine <select id="aiProv"><option value="anthropic" ${s.provider==='anthropic'?'selected':''}>My Claude API key</option><option value="openai" ${s.provider==='openai'?'selected':''}>My OpenAI API key</option><option value="off" ${s.provider==='off'?'selected':''}>Off (no tribe talk, procedural planets)</option></select></label>
    <label class="f">API key <input type="password" id="aiKey" value="${esc(s.key||'')}" autocomplete="off" placeholder="sk-…"></label><label class="f">Model (optional) <input type="text" id="aiModel" value="${esc(s.model||'')}" placeholder="claude-sonnet-5-5 or gpt-5"></label>
    <div class="note">Bring your own key. It is saved in this browser only, sent straight from your browser to Anthropic or OpenAI, and never goes into the shared game or to anyone else. AI is optional: with it off, planets are procedural and tribes will not talk. Only whoever wins a month needs a key, to dream up the next planet.</div>
    <div class="btnrow"><button class="buy" data-act="ai-save">Save</button><button class="buy ghost" data-act="ai-test">Test connection</button></div><p id="aiOut" class="lede"></p>
    <h3>Playing with friends</h3>${S.local?'<p class="lede">Single-player mode: progress saves in this browser only. The host needs to add Firebase settings (see SETUP.md) to switch on online play.</p>':`<p class="lede">You are in room <b>${esc(S.room||'main')}</b>. Everyone with this link lands on the same planet.</p><div class="btnrow"><button class="buy" data-act="copy-invite">Copy invite link</button></div>`}`}
  else if(kind==='welcome'){h=`<h1>The planet got bigger</h1><p class="story">The Maker remodeled ${esc(w.planet.name)}. Everything you own is now real: miners haul ore to a lift, porters shovel it into refineries, and you only get paid when your cargo ship comes home. There are regions, herds, tribes with their own languages, and a map in the top-left corner.</p>
    <p>Everyone restarts on equal footing, with a head start based on what you earned before.</p><p class="big">+${fmt(c.grant)} coin starter grant</p><p class="lede">Your v1 lifetime earnings: ${fmt(c.v1earned||0)}. ${c.sp?`You keep ${fmt(c.sp)} Spectacle Points to spend on your species.`:''} Champion titles carry over.</p>${c.spRefund?`<p class="note">Species tech is now a skill tree. Your old tech was refunded as ${c.spRefund} SP.</p>`:''}<div class="btnrow"><button class="buy" data-act="welcome-ok">Create my species</button></div>`}
  else if(kind==='species'){const pick=S.archPick||'delve';h=`<h1>Define your species</h1><p class="lede">Your archetype gives a starting perk, a cheaper signature branch and three heritage skills in the skill tree. Then describe them. If you have set an AI key in Settings, the AI designs their look.</p>
    <div class="archs">${Object.entries(ARCH).map(([k,A])=>`<button class="card" data-act="arch:${k}" aria-pressed="${pick===k}"><b>${esc(A.name)}</b><small>${esc(A.blurb)}</small><small style="color:var(--ok)">${esc(A.perk)}</small><small>Signature branch: ${esc(BRANCHES.find(t=>t.k===A.sig).label)}</small></button>`).join('')}</div>
    <label class="f">Species name <input type="text" id="spName" maxlength="32" placeholder="${esc(ARCH[pick].name)}" value="${esc(S.spDraft&&S.spDraft.name||'')}"></label><label class="f">What are they like? <textarea id="spDesc" maxlength="400" placeholder="Tiny furious mushrooms who communicate by screaming spores">${esc(S.spDraft&&S.spDraft.desc||'')}</textarea></label>
    <div class="btnrow"><button class="buy ghost" data-act="settings">AI key (optional)</button><button class="buy" data-act="make-species" ${S.spBusy?'disabled':''}>${S.spBusy?'Claude is drawing your species…':'Create species'}</button></div>`}
  else if(kind==='away'){const a=S.away;h=`<h1>While you were away</h1><p class="lede">${dur(a.secs*1000)} of unsupervised colonizing.</p><p class="big">+${fmt(a.earned)} coin</p><p>${fmt(a.trips)} cargo runs · ${fmt(a.beasts)} cave attacks (${fmt(a.kills)} killed) · ${fmt(a.hunts)} hunts · ${fmt(a.raids)} tribal raids · ${fmt(a.hires)} new arrivals</p><p>${fmt(a.deaths)} of your people died${a.deaths?'. Their families have been sent a coupon.':'.'}</p><div class="btnrow"><button class="buy" data-act="away-ok">Back to work</button></div>`}
  else if(kind==='news'){h=`<h1>Patch notes: Deep Shafts</h1><div class="newsgrid">
    <div><b>Porters think now</b><p class="lede">They stack the most valuable goods on every pad while ships are away, so a landing ship fills in seconds. When the lift jams they haul ore up the ladder themselves. The Crew tab tells you what is actually blocking you.</p></div>
    <div><b>More launch pads</b><p class="lede">Ships with no free pad were circling in orbit doing nothing. Buy extra pads in Build.</p></div>
    <div><b>Shafts you manage</b><p class="lede">Pin miners to each shaft and buy lights, supports (no more cave-ins) and mine carts so miners keep digging instead of walking.</p></div>
    <div><b>Skill tree</b><p class="lede">Species tech is now a tree with forks, unlockable units (brutes, grenadiers, politicians, envoys, excavators) and abilities.${c.spRefund?` Your old tech was refunded as <b>${c.spRefund} SP</b>.`:''}</p></div>
    <div><b>Pixel art</b><p class="lede">Back to chunky retro pixels.</p></div><div><b>Scout fuel</b><p class="lede">Drone flights now cost coin, more for longer trips.</p></div></div>
    <div class="btnrow"><button class="buy alt" data-act="news-tree">Open skill tree</button><button class="buy ghost" data-act="news-ok">Back to digging</button></div>`}
  else if(kind==='tree'){b.className='sheet wide treesheet';h=treeHTML()}
  else if(kind==='pump'){h=`<button class="buy ghost close" data-act="close">Close</button><h1>Price Pump</h1><p class="lede">Pick a category. Its price at ${esc(S.rt?S.rt.st.st.name:'your station')} jumps for 10 minutes.</p><div class="cards">${CATS.map(k=>`<button class="card" data-act="pumpcat:${k}"><b style="color:${CAT_COL(k)}">${CAT[k].label}</b><small>${CAT[k].ref}</small></button>`).join('')}</div>`}
  else if(kind==='cam'){b.className='sheet wide';h=`<button class="buy ghost close" data-act="close">Close</button><h1>Field cam</h1><canvas class="camcv" id="camcv"></canvas><p class="lede" id="camNote">Live from the battlefield.</p>`}
  else if(kind==='awaiting'){const mine=w.promptBy===S.uid;const waited=Date.now()-(w.awaitingSince||0);const last=(w.history||[]).slice(-1)[0];
    h=`<h1>${mine?'You won. Dream the next planet.':'The month is over'}</h1>${last?`<p class="lede">${esc(who(last.winner))} won ${esc(monthName(last.month))} on ${esc(last.planet)} with ${fmt(last.coin)} coin.</p>`:''}`;
    if(mine)h+=`<p class="lede">Describe the world everyone colonizes next. The Maker decides regions, ores, tribes, wildlife and story, then the engine balances the numbers.</p><label class="f">Your planet prompt <textarea id="planetPrompt" maxlength="600" placeholder="A candy planet where caramel caves are guarded by furious gummy bears and tribes worship a giant jawbreaker"></textarea></label><div class="btnrow"><button class="buy" data-act="gen-prompt">Create the planet</button><button class="buy ghost" data-act="gen-improv">Let the Maker improvise</button></div>`;
    else h+=`<p class="lede">Waiting for ${esc(who(w.promptBy))} to describe the next planet.</p>${(waited>24*3600e3||S.isOwner||S.local)?'<div class="btnrow"><button class="buy ghost" data-act="gen-improv">Let the Maker improvise</button></div>':`<p class="lede">If they don't answer within ${dur(24*3600e3-waited)}, anyone can let the Maker improvise.</p>`}`}
  else if(kind==='generating'){const stuck=Date.now()-(w.genAt||0)>180000;h=`<h1>The Maker is building</h1><p class="lede">Crust is being poured. Tribes are being given grudges. This takes up to a minute.</p>${stuck?'<div class="btnrow"><button class="buy ghost" data-act="gen-improv">It seems stuck. Improvise instead</button></div>':''}`}
  b.innerHTML=h}
setInterval(()=>{const w=S.world;if(w&&w.status==='generating'&&Date.now()-(w.genAt||0)>180000)refreshOverlay(true)},15000);

/* ================= camera & input ================= */
const cv=$('#cv'),ctx=cv.getContext('2d');let CW=0,CH=0;
const mini=$('#mini'),mctx=mini.getContext('2d');
new ResizeObserver(()=>{const r=$('#cwrap').getBoundingClientRect();DPR=Math.min(2,window.devicePixelRatio||1);CW=Math.max(10,Math.round(r.width*DPR));CH=Math.max(10,Math.round(r.height*DPR));cv.width=CW;cv.height=CH;const m=mini.getBoundingClientRect();mini.width=Math.max(10,Math.round(m.width*DPR));mini.height=Math.max(10,Math.round(m.height*DPR));if(!S.camInit&&CW>50){S.camInit=true;fitSide();fitMap()}}).observe($('#cwrap'));
S.cam={side:{x:SX,y:30,z:1},map:{x:500,y:500,z:1}};
function curCam(){return S.view==='map'?S.cam.map:S.cam.side}
function zLimits(){return S.view==='map'?[CW/1150,10*DPR]:[CW/3600,10*DPR]}
function clampCam(){const c=curCam();const [a,b]=zLimits();c.z=clamp(c.z,a,b);if(S.view==='map'){c.x=clamp(c.x,0,MAPW);c.y=clamp(c.y,0,MAPW)}else{c.x=clamp(c.x,-150,SW+150);c.y=clamp(c.y,-700,5*LH+60)}}
function fitSide(){const c=S.cam.side;c.z=PXS()*(CW/PXS()>1500?2:1);c.x=SX+60;c.y=-0.08*CH/viewZ(c);c.tx=null;const v=S.view;S.view='side';clampCam();S.view=v}
function fitWhole(){const c=S.cam.side;c.tz=Math.max(CW/3200,CH/1500);c.tx=SX;c.ty=(5*LH-600)/2+120;}
function fitMap(){const c=S.cam.map;c.z=Math.min(CW,CH)/1040;c.x=500;c.y=500;c.tx=null;const v=S.view;S.view='map';clampCam();S.view=v}
function focus(k){const c=curCam(),col=S.watch?S.watch.rt.c:S.colony;let t=null;
  if(S.view==='map'){if(k==='base'&&col&&col.base)t={x:col.base.x,y:col.base.y,z:3*PXS()};else{fitMap();return}}
  else{const deep=col?lvY(Math.max(0,col.levels-1)):58;t={mine:{x:SX+((col&&col.faces[(col.levels-1)+'R'])||100)*0.7,y:deep-20,z:2*PXS()},lift:{x:SX,y:80,z:PXS()},yard:{x:1310,y:-40,z:2*PXS()},ref:{x:1820,y:-50,z:2*PXS()},pad:{x:PAD_X[0]+200,y:-60,z:PXS()},bar:{x:BARR_X,y:-40,z:2*PXS()},supply:{x:DROP_X,y:-50,z:2*PXS()}}[k];if(!t){fitWhole();return}}
  c.tx=t.x;c.ty=t.y;c.tz=t.z}
const PTR=new Map();let drag=null,pinch=null,hoverXY=null;
function toWorld(px,py){const c=curCam();const T=MAIN_T;if(T.s&&T.ps){return{x:(px/T.ps-T.ox)/T.s,y:(py/T.ps-T.oy)/T.s}}const z=viewZ(c);return{x:(px-CW/2)/z+c.x,y:(py-CH/2)/z+c.y}}
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);PTR.set(e.pointerId,{x:e.offsetX*DPR,y:e.offsetY*DPR});if(PTR.size===1)drag={x:e.offsetX*DPR,y:e.offsetY*DPR,moved:0,type:e.pointerType};else if(PTR.size===2){const [a,b]=[...PTR.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:curCam().z};drag=null}});
cv.addEventListener('pointermove',e=>{const p={x:e.offsetX*DPR,y:e.offsetY*DPR};if(PTR.has(e.pointerId))PTR.set(e.pointerId,p);
  if(pinch&&PTR.size===2){const [a,b]=[...PTR.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);const c=curCam();c.z=pinch.z*d/pinch.d;c.tx=null;clampCam();return}
  if(drag){const dx=p.x-drag.x,dy=p.y-drag.y;drag.moved+=Math.abs(dx)+Math.abs(dy);if(drag.moved>6*DPR){cv.classList.add('drag');const c=curCam();const z=viewZ(c);c.x-=dx/z;c.y-=dy/z;c.tx=null;clampCam();$('#tip').hidden=true}drag.x=p.x;drag.y=p.y;return}
  if(e.pointerType==='mouse'){hoverXY=p;showTip(p,false)}});
function endPtr(e){PTR.delete(e.pointerId);cv.classList.remove('drag');if(PTR.size<2)pinch=null;if(drag&&drag.moved<=6*DPR&&e.type==='pointerup'){tap({x:e.offsetX*DPR,y:e.offsetY*DPR},drag.type)}drag=null}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);cv.addEventListener('pointerleave',()=>{hoverXY=null;if(!PTR.size)$('#tip').hidden=true});
cv.addEventListener('wheel',e=>{e.preventDefault();const c=curCam();const p={x:e.offsetX*DPR,y:e.offsetY*DPR};const z0=viewZ(c);const wx=(p.x-CW/2)/z0+c.x,wy=(p.y-CH/2)/z0+c.y;c.z*=Math.exp(-e.deltaY*0.0015);c.tx=null;clampCam();const z1=viewZ(c);c.x=wx-(p.x-CW/2)/z1;c.y=wy-(p.y-CH/2)/z1;clampCam()},{passive:false});
function showTip(p,sticky){const tip=$('#tip');const w=toWorld(p.x,p.y);let html=null;
  if(S.view==='side'){const rt=S.watch?S.watch.rt:S.rt;if(rt){const r=hitSide(rt,w.x,w.y);html=r&&r.html}}else if(S.world){const sel=hitMap(w.x,w.y);html=mapTip(sel)}
  if(!html){tip.hidden=true;return}tip.innerHTML=html;tip.hidden=false;const W=CW/DPR,H=CH/DPR;let x=p.x/DPR+14,y=p.y/DPR+14;const r=tip.getBoundingClientRect();if(x+r.width>W-8)x=p.x/DPR-r.width-14;if(y+r.height>H-8)y=Math.max(8,p.y/DPR-r.height-14);tip.style.left=x+'px';tip.style.top=y+'px';if(sticky){clearTimeout(S.tipT);S.tipT=setTimeout(()=>tip.hidden=true,3500)}}
function tap(p,type){if(S.view==='side'){showTip(p,true);return}
  const w=toWorld(p.x,p.y);const sel=hitMap(w.x,w.y);if(S.landMode&&!sel.region){sel.region=regionAt(P(),w.x,w.y).id;sel.x=w.x;sel.y=w.y}
  if(S.landMode&&sel.region){sel.x=w.x;sel.y=w.y;S.landPick={x:w.x,y:w.y}}
  if(sel.mine&&!S.landMode){S.view='side';$('#mapcard').hidden=true;S.mapSel=null;return}
  if(sel.colony&&!S.landMode){startWatch(sel.colony);return}
  S.mapSel=sel;const mc=$('#mapcard');mc.innerHTML=mapCardHTML(sel);mc.hidden=false;$('#tip').hidden=true}
function startWatch(uid){const d=S.colonies[uid];if(!d||d.v!==2||!d.landed){toast('That colony is not on this planet yet.');return}const copy=normColony(JSON.parse(JSON.stringify(d)));copy.orders=[];S.watch={uid,rt:makeRT(copy,'spy'),upd:d.updated};S.view='side';S.mapSel=null;$('#mapcard').hidden=true;fitSide()}

/* ================= events ================= */
document.addEventListener('click',async e=>{const t=e.target.closest('[data-act]');if(!t||t.disabled)return;const parts=t.dataset.act.split(':');const a=parts[0],arg=parts[1];const c=S.colony;
  switch(a){
    case 'tab':S.tab=arg;if(arg!=='tribes')S.chat=null;renderTab();$('#tabbody').scrollTop=0;break;
    case 'amt':S.amt=arg==='max'?'max':+arg;renderTab();break;
    case 'hire':hire(arg);break;case 'gear':buyGear(arg);break;case 'ref':buyRef(arg);break;case 'shaft':buyShaft();break;case 'tree':S.modal={kind:'tree'};refreshOverlay(true);break;case 'tsel':S.treeSel=arg;refreshOverlay(true);break;case 'evolve':buyNode(arg);break;
    case 'abil':{if(!playing()||!S.rt)break;if(arg==='pump'){S.modal={kind:'pump'};refreshOverlay(true);break}if(useAbility(S.rt,arg))markSave(300);break}
    case 'pumpcat':{S.modal=null;refreshOverlay(true);if(playing()&&S.rt&&useAbility(S.rt,'pump',arg))markSave(300);break}
    case 'want':setWant(+arg,parts[2]);break;case 'shup':buyShaftUp(+arg,parts[2]);break;
    case 'station':if(c){c.station=arg;markSave();renderTab()}break;
    case 'launch':{const s=c.ships[+arg];if(s&&s.st==='dock'&&playing()){launchShip(S.rt,s,Date.now());markSave(300);renderTab()}break}
    case 'army':{const k=arg,d=+parts[2];c.army[k]=clamp((c.army[k]||0)+d,k==='size'?1:0,60);markSave();renderTab();if(S.mapSel){$('#mapcard').innerHTML=mapCardHTML(S.mapSel)}break}
    case 'target':c.army.targets[arg]=!c.army.targets[arg];markSave();renderTab();break;
    case 'hunt':{const p=sendParty(S.rt,'hunt',c.army.size,{herd:arg});if(p){toast(`${p.n} soldiers are heading out to hunt.`);S.mapSel=null;$('#mapcard').hidden=true}break}
    case 'invade':startInvasion(arg);$('#mapcard').hidden=true;break;
    case 'chat':S.chat=arg;S.tab='tribes';renderTab();$('#mapcard').hidden=true;if(window.innerWidth<=860)$('#tabbody').scrollIntoView({behavior:'smooth'});if($('#layout').classList.contains('wide')){$('#layout').classList.remove('wide')}break;
    case 'chatback':S.chat=null;renderTab();break;
    case 'chat-send':{const v=$('#chatIn').value;sendChat(arg,v);break}
    case 'deal-yes':acceptDeal(arg);break;case 'deal-no':{const ts=c.tribes[arg];ts.deal=null;ts.log.push({who:'sys',text:'You declined the deal.',t:Date.now()});markSave();renderTab();break}
    case 'cam':S.modal={kind:'cam',party:arg};S.alertBattle=null;refreshOverlay(true);break;
    case 'mapfocus':{const p=c.parties.find(x=>x.id===arg);if(p){S.view='map';S.cam.map.tx=p.x;S.cam.map.ty=p.y;S.cam.map.tz=3*PXS()}break}
    case 'settings':S.modal={kind:'settings'};refreshOverlay(true);break;
    case 'close':S.modal=null;refreshOverlay(true);break;
    case 'ai-save':case 'ai-test':{const s={provider:$('#aiProv').value,key:$('#aiKey').value.trim(),model:$('#aiModel').value.trim()};lsSet('msc_ai',s);if(a==='ai-save'){toast('Saved.');S.modal=null;refreshOverlay(true)}else{$('#aiOut').textContent='Asking…';try{const r=await askJSON('Reply with only this JSON: {"ok":true,"line":"<a one-sentence threat from a cosmic mining deity>"}','quick');$('#aiOut').textContent='Working: '+str(r.line,'ok',200)}catch(err){$('#aiOut').textContent='Failed: '+errMsg(err)}}break}
    case 'news-ok':c.news=3;markSave(200);refreshOverlay(true);break;case 'news-tree':c.news=3;markSave(200);S.modal={kind:'tree'};refreshOverlay(true);break;
    case 'welcome-ok':c.welcomed=true;markSave(200);refreshOverlay(true);break;
    case 'arch':S.spDraft={name:($('#spName')||{}).value||'',desc:($('#spDesc')||{}).value||''};S.archPick=arg;refreshOverlay(true);break;
    case 'make-species':{const arch=S.archPick||'delve';const nm=$('#spName').value,ds=$('#spDesc').value;S.spDraft={name:nm,desc:ds};S.spBusy=true;refreshOverlay(true);const sp=await createSpecies(arch,nm,ds);S.spBusy=false;c.species=sp;c.tree={};c.treeRev=1;c.news=3;if(!c.landed)Object.assign(c,runState(arch));if(sp.aiError)toast('Claude was unavailable, so your species got the default look.',5000);markSave(100);S.spDraft=null;refreshOverlay(true);renderTab();break}
    case 'show-species':S.modal=null;if(c&&!c.landed){c.species=null}refreshOverlay(true);break;
    case 'show-land':S.landMode=true;S.view='map';fitMap();break;
    case 'land':land();break;
    case 'away-ok':S.away=null;refreshOverlay(true);break;
    case 'togglemap':S.view=S.view==='map'?'side':'map';$('#mapcard').hidden=S.view!=='map'||!S.mapSel;$('#tip').hidden=true;break;
    case 'mapclose':S.mapSel=null;S.landPick=null;$('#mapcard').hidden=true;break;
    case 'scout':{if(S.mapSel&&c.drone&&playing()){const cost=scoutCost(c,S.mapSel.x,S.mapSel.y);if(c.coin<cost){toast('Not enough coin for drone fuel.');break}c.coin-=cost;c.drone.tx=S.mapSel.x;c.drone.ty=S.mapSel.y;toast(`Scout drone on its way (${fmt(cost)} fuel).`);$('#mapcard').hidden=true;markSave()}break}
    case 'zoom':{const cm=curCam();if(arg==='in')cm.tz=(cm.tz||cm.z)*1.4;else if(arg==='out')cm.tz=(cm.tz||cm.z)/1.4;else{S.view==='map'?fitMap():fitSide();break}cm.tx=cm.tx??cm.x;cm.ty=cm.ty??cm.y;break}
    case 'focus':focus(arg);break;
    case 'goalarm':{const rt=S.rt;S.view='side';if(rt&&rt.hostiles.length){const h=rt.hostiles[0];S.cam.side.tx=h.x;S.cam.side.ty=h.y-20;S.cam.side.tz=2*PXS()}break}
    case 'copy-invite':{const u=new URL(location.href);u.search='?room='+encodeURIComponent(S.room||'main');u.hash='';const t=u.toString();(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('Invite link copied.'),()=>prompt('Copy this invite link:',t));break}
    case 'panel':$('#layout').classList.toggle('wide');$('#panelBtn').textContent=$('#layout').classList.contains('wide')?'⟨':'⟩';break;
    case 'watch':startWatch(arg);break;case 'unwatch':S.watch=null;fitSide();break;
    case 'missile-arm':S.armMissile=true;renderTab();break;case 'missile-cancel':S.armMissile=false;renderTab();break;case 'missile-go':launchMissile();break;
    case 'gen-prompt':{const p=str($('#planetPrompt').value,'',600);if(p.length<5){toast('Describe your planet first.');return}generatePlanet(p);break}
    case 'gen-improv':generatePlanet('');break;case 'admin-rollover':checkRollover(true);break;case 'admin-regen':generatePlanet('');break;
  }});
document.addEventListener('change',e=>{const t=e.target;const c=S.colony;if(!c)return;if(t.id==='autohunt'){c.army.auto=t.checked;markSave();toast(t.checked?'Auto-hunt on.':'Auto-hunt off.')}if(t.dataset&&t.dataset.act==='autolaunch'){c.autoLaunch=t.checked;markSave()}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&e.target&&e.target.id==='chatIn'){e.preventDefault();sendChat(S.chat,e.target.value)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveColony(true)});
window.addEventListener('pagehide',()=>saveColony(true));

/* ================= boot ================= */
async function init(){
  renderTabs();renderTab();renderTicker();let db=null,user=null;
  try{const be=window.MSC?await window.MSC.connect():null;if(be){db=be.db;user=be.user;S.room=be.room}}catch(e){console.error(e);toast('Could not reach the online server ('+errMsg(e)+'). Playing offline.',7000)}
  S.db=db;S.user=user;
  if(user){S.uid=await user.id();S.isOwner=await user.isOwner();const cw=await user.can('data.write');if(cw===false)S.canWrite=false}
  if(!db){S.local=true;S.uid=S.uid||lsGet('msc_uid')||('local-'+Math.random().toString(36).slice(2,10));lsSet('msc_uid',S.uid);S.canWrite=true;S.isOwner=true}
  if(!S.uid)S.canWrite=false;
  try{const w=await ensureWorld();if(!w||w.planet.v!==2)throw new Error('The planet is still being remodeled. Reload in a moment.');S.world=w;
    if(S.uid&&S.canWrite){let c=S.local?lsGet('msc_colony2'):null;if(!S.local){try{const s=await db.doc('colonies/'+S.uid).get();if(s.exists)c=JSON.parse(JSON.stringify(s.data()))}catch(e){}}
      if(!c||!c.uid)c=newColony(S.uid);else if(c.v!==2)c=migrateV1(c);normColony(c);S.colony=c;
      if(w.status==='active'&&c.planetId&&c.planetId!==w.planetId)resetForPlanet(c,w);
      else if(c.landed&&w.status==='active'){initTribes(c,P());const sum=catchUp(c,Date.now());if(sum&&sum.secs>60)S.away=sum}
      startRuntime();markSave(1000)}
    if(S.local){S.feed=lsGet('msc_feed2')||[];if(S.colony)S.colonies[S.colony.uid]=S.colony}
    else{db.doc('world/current').onSnapshot(s=>{const d=s.exists?s.data():null;if(d&&d.planet)onWorld(JSON.parse(JSON.stringify(d)))},()=>toast('Lost the planet feed. Reload to reconnect.'));
      db.collection('colonies').onSnapshot(q=>{const m={};q.docs.forEach(d=>{const v=d.data();if(v&&v.uid)m[v.uid]=v});S.colonies=m;resolveNames();
        if(S.watch&&m[S.watch.uid]&&m[S.watch.uid].updated!==S.watch.upd){const d=normColony(JSON.parse(JSON.stringify(m[S.watch.uid])));S.watch.upd=d.updated;const rc=S.watch.rt.c;for(const k of ['crew','gear','levels','faces','raw','prod','ref','ships','depl','chute','hopper','species','coin','kills','deaths'])rc[k]=d[k];reconcile(S.watch.rt)}
        if(S.tab==='ranks'&&!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#tabbody')))renderTab()},()=>{});
      db.collection('feed').orderBy('t','desc').limit(30).onSnapshot(q=>{S.feed=q.docs.map(d=>d.data());renderTicker();resolveNames();if(S.tab==='ranks')renderTab()},()=>{})}
    S.ready=true;renderTab();refreshOverlay(true);updateHUD();checkRollover();setInterval(()=>checkRollover(),30000);
  }catch(e){$('#stageTag').textContent='Could not reach the colony network: '+errMsg(e);console.error(e)}}

/* ================= main loop ================= */
let lastF=performance.now(),hudT=0,miniT=0;
function frame(ts){const dt=Math.min(0.1,(ts-lastF)/1000);lastF=ts;const now=Date.now();const c=S.colony,w=S.world;
  try{
    if(c&&w&&S.rt&&c.landed&&c.planetId===w.planetId){
      if(w.status==='active'&&now<monthEnd(w.month)){if(now-(c.lastTick||now)>20000){const sum=catchUp(c,now);S.rt=makeRT(c,'own');if(sum&&sum.secs>60){S.away=sum;refreshOverlay(true)}}else{updateRT(S.rt,dt,now);c.lastTick=now}saveColony(false)}
      else c.lastTick=Math.min(now,monthEnd(w.month))}
    if(S.watch)updateRT(S.watch.rt,dt,now);
    const cm=curCam();if(cm.tx!=null){const k=1-Math.pow(0.002,dt);cm.x=lerp(cm.x,cm.tx,k);cm.y=lerp(cm.y,cm.ty,k);cm.z=lerp(cm.z,cm.tz||cm.z,k);if(Math.abs(cm.x-cm.tx)<1&&Math.abs(cm.y-cm.ty)<1&&Math.abs(cm.z-(cm.tz||cm.z))<0.005)cm.tx=null;clampCam()}
    if(w&&CW>10){const vr=S.watch?S.watch.rt:S.rt;if(S.view==='side'&&vr)drawSide(ctx,vr,S.cam.side,CW,CH,ts/1000);else{const v=S.view;S.view='map';drawMap(ctx,S.cam.map,CW,CH,ts/1000);S.view=v}}
    if(S.modal&&S.modal.kind==='cam'){const cc=document.getElementById('camcv');if(cc){const r=cc.getBoundingClientRect();const W=Math.round(r.width*DPR),H=Math.round(r.height*DPR);if(W>10){if(cc.width!==W||cc.height!==H){cc.width=W;cc.height=H}const b=S.rt&&S.rt.battles.find(x=>x.party===S.modal.party);const g=cc.getContext('2d');if(b)drawArena(g,b,W,H,ts/1000);else{g.setTransform(1,0,0,1,0,0);g.fillStyle='#0b0714';g.fillRect(0,0,W,H);g.fillStyle='#b3a5d3';g.font=`${14*DPR}px 'Pixelify Sans',monospace`;g.fillText('The dust has settled. Check the Army tab for results.',16*DPR,30*DPR)}}}}
    if(ts-miniT>500&&w){miniT=ts;drawMini(mctx,mini.width,mini.height)}
    if(ts-hudT>250){hudT=ts;updateHUD();updateLive();if(S.view==='map'&&S.mapSel&&!$('#mapcard').hidden&&(S.mapSel.herd||S.mapSel.party)&&ts-(S.mcT||0)>2000){S.mcT=ts}}
    if(hoverXY&&!drag&&S.view==='side'&&ts-(S.hovT||0)>300){S.hovT=ts;showTip(hoverXY,false)}
  }catch(e){if(!S.frameErr){S.frameErr=true;console.error(e)}}
  requestAnimationFrame(frame)}
requestAnimationFrame(frame);init();

