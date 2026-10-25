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

// Renderer-only scene state. It intentionally has no prototype boot, listeners, or simulation loop.
const S={world:null,colony:null,colonies:{},view:'side',mapSel:null,landMode:true,landPick:null,mapDirty:true};
function buffOn(){return false}
function shipCapOf(st,s){return st.shipCap||60}
function yardSlot(rt,key){const i=rt.st.reg.ores.indexOf(key);return 1428-(i<0?3:i)*46}
function depotKeys(rt){return Object.keys(rt.c.prod||{})}
function stageX(p){return PAD_X[p]-64}
function dockedShip(rt,p){return rt.c.ships.find(s=>s.st==='dock'&&s.pad===p)}
function spark(){}
function who(uid){return S.colonies[uid]?.name||'A colonist'}
function herdAvail(c,h){return h.size||0}
const NAV_SCENE={step:()=>true,dist:()=>0,los:()=>true};

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
function buildRockPx(rt){const Pl=P(),reg=rt.st.reg;const layers=Math.max(5,Math.ceil((rt.c.levels+1)/2)),W=SW+400,H=layers*LH+16;const [cv,g]=mkCv(W,H);const R0=rng(hash(rt.depKey+'rock'));const B=(x,y,w,h,cl)=>{g.fillStyle=cl;g.fillRect(x,y,w,h)};
  for(let L=0;L<layers;L++){const y0=10+L*LH;const col=Pl.layers[L%Pl.layers.length].color;B(0,y0,W,LH+1,col);
    for(let y=0;y<LH;y+=8){if((y/8)%2)B(0,y0+y,W,4,sh(col,-0.05))}
    for(let k=0;k<5;k++){const yy=y0+Math.round(LH*(k+0.5)/5);for(let x=0;x<W;x+=4){B(x,yy+Math.round(Math.sin(x*0.011+k*2+L)*3),4,1,sh(col,-0.2))}}
    for(let k=0;k<W*LH/40;k++){const x=Math.floor(R0()*W),y=y0+Math.floor(R0()*LH);B(x,y,1+(R0()<0.2?1:0),1,R0()<0.55?sh(col,-0.25):sh(col,0.12))}
    for(let k=0;k<W/50;k++){const x=R0()*W,y=y0+8+R0()*(LH-16),rx=4+R0()*9,ry=rx*0.6;const cl=sh(col,-0.14);for(let yy=-ry;yy<=ry;yy++){const hw=Math.floor(rx*Math.sqrt(Math.max(0,1-(yy*yy)/(ry*ry))));B(Math.round(x-hw),Math.round(y+yy),hw*2+1,1,cl)}}
    if(L>0){for(let x=0;x<W;x+=3){const j=Math.floor(R0()*4);B(x,y0-j,3,j,Pl.layers[(L-1)%Pl.layers.length].color)}}}
  for(const d of rt.deps){if(!d.deco)continue;const o=oreOf(Pl,d.ore);if(!o)continue;g.drawImage(oreSprite(o.color,o.cat,d.r*0.7,hash(d.id)),Math.round(d.x+200-d.r),Math.round(d.y+10-d.r))}
  B(0,6,W,6,Pl.surface);for(let x=0;x<W;x+=2){const h=Math.floor(R0()*3);B(x,9-h,2,h+1,Pl.surface)}for(let x=0;x<W;x+=3){if(R0()<0.55){const h=1+Math.floor(R0()*4);B(x,9-h,1,h,sh(reg.biome,0.15))}}
  B(0,12,W,2,sh(Pl.surface,-0.25));return cv}
function drawRockPx(rt){const T=PXC;if(!rt.rock)rt.rock=buildRockPx(rt);const rk=rt.rock;const vb=viewBounds();
  const wx0=Math.max(-200,Math.floor(vb.x0)-2),wx1=Math.min(SW+200,Math.ceil(vb.x1)+2),wy0=Math.max(-10,Math.floor(vb.y0)-2),wy1=Math.min(Math.max(5,Math.ceil((rt.c.levels+1)/2))*LH+6,Math.ceil(vb.y1)+2);if(wx1<=wx0||wy1<=wy0)return;
  T.g.drawImage(rk,wx0+200,wy0+10,wx1-wx0,wy1-wy0,bx(wx0),by(wy0),bx(wx1)-bx(wx0),by(wy1)-by(wy0));
  const rockBottom=Math.max(5,Math.ceil((rt.c.levels+1)/2))*LH;if(vb.y1>rockBottom)pR(-200,rockBottom+6,SW+400,Math.max(0,vb.y1-rockBottom),'#0d0816')}
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
  for(let L=0;L<Math.max(5,Math.ceil(c.levels/2));L++){if(layerHard(st.reg,L)>st.hard){PXC.g.globalAlpha=0.5;pR(-200,L*LH,SW+400,LH,'#0a0512');PXC.g.globalAlpha=1;if(s>=0.4)pT(SX+260,L*LH+20,`LOCKED · ${Pl.layers[L%Pl.layers.length].name} · hardness ${layerHard(st.reg,L)}`,'#ff9aa8')}
    else if(s>=0.4)pT(SX-340,L*LH+14,`${L+1} · ${Pl.layers[L%Pl.layers.length].name} · H${layerHard(st.reg,L)}`,null)}
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


const LEGACY_ORE_IDS=['o0','o2','o4','o6','o8','o9','o10'];
const VISUAL_ORES=[['ferrite','Ferrite','metal','#cf8152'],['cobalt','Cobalt','metal','#55a8d8'],['lithium','Lithium','crystal','#93d0ae'],['sulfur','Sulfur','gas','#e6cd65'],['crystal','Crystal','crystal','#bb97e8'],['iridium','Iridium','exotic','#90c5ce'],['mythic','Mythic','exotic','#ee9d58']];
VISUAL_ORES.forEach(([id,name,cat,color],i)=>{const o=SCENE_PLANET.ores.find(item=>item.id===LEGACY_ORE_IDS[i]);if(o)Object.assign(o,{name,cat,color})});
const SCENE_PLANET=buildPlanet({id:'extraction-original-scene',name:'Extraction',sky:['#211238','#ef8060'],surface:'#8a563f',
  layers:[{name:'Rust Crust',color:'#8a5a44'},{name:'Cobalt Shale',color:'#6e4a5e'},{name:'Violet Basalt',color:'#4e3f6b'},{name:'Sulfur Shelf',color:'#7a2e3a'},{name:'Deep Core',color:'#3b1f4f'}],
  ores:[['Ferrite','metal',0,'#cf8152'],['Cobalt','metal',0,'#55a8d8'],['Lithium','crystal',1,'#93d0ae'],['Sulfur','gas',1,'#e6cd65'],['Crystal','crystal',2,'#bb97e8'],['Iridium','exotic',3,'#90c5ce'],['Mythic','exotic',4,'#ee9d58']].map(([name,category,tier,color])=>({name,category,tier,color})),
  regions:['West Crater','Copper Flats','Ash Basin','The Long Scar','Glass Ridge','Old Landing','North Shelf'].map((name,i)=>({name,color:['#735144','#55715c','#5a4f7a','#885647','#4d6674','#76546b','#687347'][i],weather:['clear']}))},'scene-v1');
SCENE_PLANET.regions.forEach(r=>r.weather=['clear']);
const BASE_LAYERS=SCENE_PLANET.layers.slice();
for(let i=BASE_LAYERS.length;i<15;i++){const base=BASE_LAYERS[i%BASE_LAYERS.length];SCENE_PLANET.layers.push({name:`${base.name} · ${Math.floor(i/BASE_LAYERS.length)+1}`,color:sh(base.color,-Math.min(0.22,0.04*Math.floor(i/BASE_LAYERS.length)))})}
const SCENE_REGION=SCENE_PLANET.regions.find(r=>r.frontier)||SCENE_PLANET.regions[0];
function visualMineState(state,profile){
  const model=state||{},prod=model.production||{},shafts=Array.isArray(prod.shafts)?prod.shafts:[];
  const n=Math.max(1,Math.min(30,shafts.length||1));
  const faceMap={},shaftCfgs=[],raw={},depl={};
  const byId=id=>{const i=Math.max(0,LEGACY_ORE_IDS.indexOf(id));return LEGACY_ORE_IDS[i]};
  for(let i=0;i<n;i++){
    const sh=shafts[i]||{},idx=Math.max(0,LEGACY_ORE_IDS.indexOf(sh.oreId));
    faceMap[i+'L']=78+Math.min(110,Math.round((sh.digLevel||1)*4));faceMap[i+'R']=faceMap[i+'L'];
    shaftCfgs.push({want:null,support:0,light:i<3?1:0,cart:0});
    if(idx>=0&&sh.bufferUnits>0)raw[byId(sh.oreId)]=(raw[byId(sh.oreId)]||0)+sh.bufferUnits;
  }
  for(const row of prod.surface?.unitsByOre||[]){const k=byId(row.oreId);raw[k]=(raw[k]||0)+row.units}
  const oreRows=prod.surface?.unitsByOre||[];
  const surfaceTotal=oreRows.reduce((sum,row)=>sum+row.units,0);
  const activeShip=model.ship||{};
  const cargo={};if(activeShip.cargoOreId&&activeShip.cargoUnits>0)cargo[byId(activeShip.cargoOreId)]=activeShip.cargoUnits;
  const look=profile?.species||{};const speciesLook={skin:hex(look.skin,'#f2c9a5'),accent:hex(look.accent,'#ff8a3d'),head:HEADS.includes(look.head)?look.head:'dome'};
  const c={v:2,uid:'scene-ghost',tribes:{},parties:[],name:profile?.name||'Your Colony',planetId:SCENE_PLANET.id,landed:true,region:SCENE_REGION.id,base:{x:SCENE_REGION.x,y:SCENE_REGION.y},species:{arch:'delve',look:speciesLook},
    levels:n,shaftJob:null,faces:faceMap,shafts:shaftCfgs,depl,rubble:{},carts:{},fbuf:{},chute:{},liftCargo:{},raw,prod:{},hopper:{metal:{},crystal:{},gas:{},organic:{},exotic:{}},stage:{},crew:{miners:model.workersHired||5,porters:0,soldiers:0,brutes:0,grenadiers:0,politicians:0,envoys:0,excavators:0},
    gear:{tool:2,lift:Math.min(8,Math.max(1,model.production?.lift?.level||1)),yard:1,depot:1,weapon:1,armor:0,translator:0,ship:activeShip.shipClass==='freighter'?2:1,fleet:1,factory:0,pads:1,shuttle:1,cruisers:0},ref:{metal:0,crystal:0,gas:0,organic:0,exotic:0},ships:[{type:activeShip.shipClass==='cruiser'?'cruiser':'cargo',st:activeShip.readyAtSecond>model.simSeconds?'launch':'dock',cargo,pad:0,anim:activeShip.readyAtSecond>model.simSeconds?0.2:0}],
    coin:model.coins||0,autoLaunch:model.autoLaunch!==false,station:'s0',army:{size:0,keep:0},parties:[],drone:null,pets:[],orders:[],pods:[],fbuf:{},stage:{}};
  const reg=Object.assign({},SCENE_REGION,{ores:SCENE_PLANET.regions[0].ores,weather:['clear']});
  const st={reg,st:SCENE_PLANET.stations[0],W:WEATHER.clear,arch:'delve',H:()=>false,robot:false,walk:32,pWalk:36,hard:6,revealDeps:true,depYield:1,
    liftCap:25*Math.max(1,model.production?.lift?.level||1),liftSpd:70,yardCap:500,depotCap:400,chuteCap:60,hopCap:30,shipCap:150,pads:1,lifts:1,
    conveyor:false,cranes:false,refRate:0.6,robotSpd:1,sHp:40,sDmg:1,wpn:WEAPONS[1],frenzy:false};
  const rt={c,st,mode:'scene',u:[],projs:[],rags:[],parts:[],decals:[],pops:[],fx:[],podAnim:{},delivAnim:{},lifts:[{x:SX+5,y:Math.max(20,lvY(n-1)*0.5),st:'idle',cargo:{}}],
    shuttle:null,deps:[],depLine:{},depKey:'scene-'+n,uid:1,t:0,shake:0,carts:{},faces:[],fcount:{},inc:{},srcRes:{},refOn:{metal:0,crystal:0,gas:0,organic:0,exotic:0},refAcc:{},refDown:{},hazT:0,factT:0,battles:[],hostiles:[],tick:0,tick3:0,nav:NAV_SCENE,crates:[],meteors:[],lava:[],belt:[],beltT:0,craneT:{},xfer:{},boomT:0,envT:0,
    rock:null,decals:[],rags:[],pops:[],fx:[],parts:[],projs:[],podAnim:{},carts:{},xfer:{},crates:[],meteors:[],lava:[],belt:[],podAnim:{},hostiles:[]};
  // A stable spread of the authentic mine deposits supplies the original ore sprites.
  for(let i=0;i<n;i++)for(const side of [-1,1])for(let j=0;j<2;j++){
    const oreId=SCENE_REGION.ores[Math.min(4,Math.floor(i/2)+(j?1:0))];
    rt.deps.push({id:`scene-${i}-${side}-${j}`,lvl:i,side,x:SX+side*(120+j*155),y:lvY(i)-TH/2+(j?4:-3),r:16+j*4,ore:oreId,amt:100,deco:false});
  }
  let made=0;
  for(let i=0;i<n&&made<120;i++){
    const workers=Math.max(0,Math.floor(shafts[i]?.workersAssigned||0));
    for(let j=0;j<Math.min(12,workers|| (n===1?5:0))&&made<120;j++,made++){
      const side=j%2?1:-1,x=SX+side*(40+(j>>1)*8),y=lvY(i);
      rt.u.push({id:rt.uid++,kind:'miner',x,y,side:0,st:'mine',t:0,ph:j*0.61,dir:side<0?1:-1,h:14,w:6,hp:20,maxhp:20,spd:32,skin:speciesLook.skin,head:speciesLook.head,accent:speciesLook.accent,ck:'miners',role:'miner',sh:i,toolTier:2});
    }
  }
  if(!made)for(let j=0;j<5;j++)rt.u.push({id:rt.uid++,kind:'miner',x:SX+(j-2)*9,y:lvY(0),side:0,st:'mine',t:0,ph:j*0.61,dir:j%2?1:-1,h:14,w:6,hp:20,maxhp:20,spd:32,skin:speciesLook.skin,head:speciesLook.head,accent:speciesLook.accent,ck:'miners',role:'miner',sh:0,toolTier:2});
  return {c,rt};
}

export function createLegacyScene({canvas,miniCanvas,onInspect=()=>{},onError=()=>{}}={}){
  if(!canvas)throw new Error('createLegacyScene requires a canvas');
  const ctx=canvas.getContext('2d'),miniCtx=miniCanvas?.getContext('2d');
  let width=0,height=0,dpr=1,alive=true,state=null,profile={},visualCache=null,frameId=0,last=0,miniAt=0,view='side';
  const cam={side:{x:SX,y:0,z:4,tx:null,ty:null,tz:null},map:{x:500,y:500,z:1,tx:null,ty:null,tz:null}};
  const points=new Map();let drag=null,pinch=null;
  S.world={planet:SCENE_PLANET};S.colony=null;S.colonies={};S.landMode=true;S.mapSel=null;S.landPick=null;S.mapDirty=true;
  function report(e){try{onError(e)}catch{} }
  function resize(){if(!alive)return;const r=canvas.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);width=Math.max(10,Math.round(r.width*dpr));height=Math.max(10,Math.round(r.height*dpr));if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}if(miniCanvas){const m=miniCanvas.getBoundingClientRect();miniCanvas.width=Math.max(10,Math.round(m.width*dpr));miniCanvas.height=Math.max(10,Math.round(m.height*dpr))}DPR=dpr;if(cam[view].z<0.1)cam[view].z=PXS()}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function current(){return cam[view]}
  function clampCam(){const c=current();c.z=clamp(c.z,0.2,view==='side'?20:8);c.x=clamp(c.x,view==='side'?-200:0,view==='side'?SW+200:MAPW);c.y=clamp(c.y,view==='side'?-800:-50,view==='side'?Math.max(5*LH,lvY((visualCache?.c.levels||10)-1))+300:MAPW+50)}
  function fit(){const c=current();if(view==='side'){c.x=SX+60;c.z=PXS()*(width/PXS()>1500?2:1);c.y=-0.08*height/viewZ(c)}else{c.x=500;c.y=500;c.z=Math.max(0.5,Math.min(width,height)/MAPW)*PXS()}c.tx=c.ty=c.tz=null;clampCam()}
  function worldPoint(e){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*dpr,y=(e.clientY-r.top)*dpr,z=viewZ(current());return{x:(x-width/2)/z+current().x,y:(y-height/2)/z+current().y,xp:x,yp:y}}
  function render(ts){if(!alive)return;try{const dt=last?Math.min(.1,(ts-last)/1000):0;last=ts;const c=current();if(c.tx!=null){const k=1-Math.pow(.002,dt);c.x=lerp(c.x,c.tx,k);c.y=lerp(c.y,c.ty,k);c.z=lerp(c.z,c.tz||c.z,k);if(Math.abs(c.x-c.tx)<1&&Math.abs(c.y-c.ty)<1&&Math.abs(c.z-(c.tz||c.z))<.005)c.tx=null;clampCam()}
      if(width>10){const visual=visualCache||(visualCache=visualMineState(state,profile));if(view==='side'){S.colony=visual.c;S.colonies={};drawSide(ctx,visual.rt,cam.side,width,height,ts/1000)}else{S.colony=visual.c;S.colonies={};drawMap(ctx,cam.map,width,height,ts/1000)}}
      if(miniCtx&&miniCanvas&&ts-miniAt>500){miniAt=ts;S.view=view;drawMini(miniCtx,miniCanvas.width,miniCanvas.height)}
    }catch(e){report(e)}frameId=requestAnimationFrame(render)}
  function down(e){canvas.setPointerCapture(e.pointerId);const p={x:e.offsetX*dpr,y:e.offsetY*dpr};points.set(e.pointerId,p);if(points.size===1)drag={x:p.x,y:p.y,moved:0};else if(points.size===2){const [a,b]=[...points.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:current().z};drag=null}}
  function move(e){const p={x:e.offsetX*dpr,y:e.offsetY*dpr};if(points.has(e.pointerId))points.set(e.pointerId,p);if(points.size===2&&pinch){const[a,b]=[...points.values()],d=Math.hypot(a.x-b.x,a.y-b.y);current().z=pinch.z*d/Math.max(1,pinch.d);clampCam();return}if(!drag)return;const dx=p.x-drag.x,dy=p.y-drag.y;drag.moved+=Math.abs(dx)+Math.abs(dy);if(drag.moved>4){const c=current(),z=viewZ(c);c.x-=dx/z;c.y-=dy/z;c.tx=null;clampCam()}drag.x=p.x;drag.y=p.y}
  function up(e){points.delete(e.pointerId);if(points.size<2)pinch=null;if(drag&&drag.moved<8){const p=worldPoint(e);if(view==='map'){const reg=regionAt(SCENE_PLANET,p.x,p.y);onInspect({kind:'site',x:Math.round(p.x),y:Math.round(p.y),regionId:reg?.id||SCENE_REGION.id})}else if(p.x>SX-100&&p.x<SX+100&&p.y>10){const shaft=Math.max(1,Math.floor(p.y/LH)+1);onInspect({kind:'shaft',shaftNumber:shaft})}else if(p.x>1450&&p.x<2070)onInspect({kind:'section',tab:'build'});else if(Math.abs(p.x-SX)<180)onInspect({kind:'section',tab:'mine'})}drag=null}
  function wheel(e){e.preventDefault();const c=current(),p=worldPoint(e),z0=viewZ(c),wx=(p.xp-width/2)/z0+c.x,wy=(p.yp-height/2)/z0+c.y;c.z*=Math.exp(-e.deltaY*.0015);clampCam();const z1=viewZ(c);c.x=wx-(p.xp-width/2)/z1;c.y=wy-(p.yp-height/2)/z1;clampCam()}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
  resize();fit();frameId=requestAnimationFrame(render);
  return {setState(next,cosmetic={}){state=next;profile=cosmetic||{};visualCache=visualMineState(state,profile);S.mapDirty=true},setView(next){if(next!=='side'&&next!=='map')return;view=next;S.view=view;fit()},zoom(which){const c=current();if(which==='fit'){fit();return}c.z*=which==='in'?1.4:1/1.4;clampCam()},focus(where){const c=current();if(view==='map'){c.tx=SCENE_REGION.x;c.ty=SCENE_REGION.y;c.tz=2;return}const targets={mine:[SX,250],lift:[SX,-30],yard:[1310,-20],pad:[PAD_X[0],-20],bar:[BARR_X,-20],base:[SX,0]};const p=targets[where]||targets.base;c.tx=p[0];c.ty=p[1];c.tz=Math.max(c.z,2)},destroy(){alive=false;cancelAnimationFrame(frameId);observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel)}};
}
