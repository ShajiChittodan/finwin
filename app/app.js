/*
 * FinWin — private, manual finance tracker.
 * Logic adapted from the FinWin design prototype. All data is kept in this
 * browser's localStorage; nothing is sent anywhere.
 *
 * Money model: every FX rate is stored as "units of that currency per 1 USD"
 * (USD is only an internal pivot). Values are converted to USD with value ÷ rate,
 * then shown in the base currency with × (base currency's rate). The base
 * currency defaults to AED.
 */
var DCLogic = FinWinEngine.DCLogic;
var TODAY_ISO = isoOf(new Date());
var STORE_KEY = 'finwin:v1';
var SCHEMA = 1;
var DEFAULT_BASE = 'AED';
var PERSIST_KEYS = ['data','base','themePref','numFmt','dateFmt','fire','asmEdited','staleDays','lastBackup','reminder','persisted','allocBy','csv'];
function monthOf(iso){ return iso.slice(0,7); }
function addMonths(ym,n){ var y=+ym.slice(0,4), m=+ym.slice(5,7)-1+n; y+=Math.floor(m/12); m=((m%12)+12)%12; return y+'-'+String(m+1).padStart(2,'0'); }
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var IC = {
  dash:'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-4H3zM13 3v4h8V3z',
  hold:'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  liab:'M3 6h18v12H3zM3 10h18M7 15h4',
  fire:'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3 0-3-1-5.5 0-8z',
  settings:'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  plus:'M12 5v14M5 12h14',
  info:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon:'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  lock:'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  chevD:'M6 9l6 6 6-6', chevR:'M9 6l6 6-6 6', chevL:'M15 6l-6 6 6 6', chevU:'M6 15l6-6 6 6',
  close:'M6 6l12 12M18 6L6 18',
  download:'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload:'M12 15V3M7 8l5-5 5 5M4 21h16',
  image:'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 8.5h.01',
  alert:'M12 3l10 18H2zM12 10v4M12 17h.01',
  check:'M5 12l5 5 9-11',
  clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  search:'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  pencil:'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  car:'M5 16h14M6 16l1.5-5h9L18 16M4 16v3h3v-3M17 16v3h3v-3',
  house:'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  person:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  cap:'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  brief:'M3 8h18v12H3zM8 8V5h8v3M3 13h18'
};
var TYPES = [
  {k:'stocks',l:'Stocks',subs:['Individual stocks','ETF','Index fund'],icon:'M3 17l6-6 4 4 8-8M15 7h6v6'},
  {k:'mf',l:'Mutual funds',subs:['Equity fund','Debt fund','Hybrid fund','Index fund'],icon:'M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z'},
  {k:'fd',l:'Fixed deposits',subs:['Bank FD','NRE FD','Corporate FD'],icon:'M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18'},
  {k:'nps',l:'NPS / pension',subs:['NPS Tier I','NPS Tier II','Employer pension','Other pension'],icon:'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4M9 15l2 2 4-4'},
  {k:'gold',l:'Gold',subs:['Physical','Digital','ETF','Sovereign bond'],icon:'M2 20l3-6h7l3 6zM9 14l3-6h7l3 6M15 20h7l-3-6'},
  {k:'re',l:'Real estate',subs:['Home I live in','Rental','Land','Commercial'],icon:IC.house},
  {k:'crypto',l:'Crypto',subs:['Bitcoin','Ethereum','Stablecoin','Other crypto'],icon:'M12 3l8 4.5v9L12 21l-8-4.5v-9zM9.5 8.5h4a1.75 1.75 0 0 1 0 3.5h-4zM9.5 12h4.5a1.75 1.75 0 0 1 0 3.5H9.5zM9.5 8.5v7'},
  {k:'cash',l:'Cash',subs:['Savings','Current','Wallet','Emergency fund'],icon:'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3zM3 7l13-3v3M16.5 13.5h.01'},
  {k:'other',l:'Other',subs:['Business stake','Collectibles','Money lent','Other'],icon:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h.01M12 12h.01M16 12h.01'}
];
var LTYPES = [{k:'home',l:'Home loan',icon:IC.house},{k:'car',l:'Car loan',icon:IC.car},{k:'personal',l:'Personal loan',icon:IC.person},{k:'card',l:'Credit card',icon:IC.liab},{k:'edu',l:'Education loan',icon:IC.cap},{k:'biz',l:'Business loan',icon:IC.brief},{k:'other',l:'Other',icon:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8'}];
var POPULAR = [['USD','US dollar','US'],['EUR','Euro','EU'],['JPY','Japanese yen','JP'],['GBP','British pound','GB'],['CNY','Chinese yuan','CN'],['CHF','Swiss franc','CH'],['AUD','Australian dollar','AU'],['CAD','Canadian dollar','CA'],['HKD','Hong Kong dollar','HK'],['SGD','Singapore dollar','SG']];
var ALLCUR = 'AED:UAE dirham|AFN:Afghan afghani|ALL:Albanian lek|AMD:Armenian dram|AOA:Angolan kwanza|ARS:Argentine peso|AWG:Aruban florin|AZN:Azerbaijani manat|BAM:Bosnia convertible mark|BBD:Barbadian dollar|BDT:Bangladeshi taka|BGN:Bulgarian lev|BHD:Bahraini dinar|BIF:Burundian franc|BMD:Bermudian dollar|BND:Brunei dollar|BOB:Bolivian boliviano|BRL:Brazilian real|BSD:Bahamian dollar|BTN:Bhutanese ngultrum|BWP:Botswana pula|BYN:Belarusian ruble|BZD:Belize dollar|CDF:Congolese franc|CLP:Chilean peso|COP:Colombian peso|CRC:Costa Rican colón|CUP:Cuban peso|CVE:Cape Verdean escudo|CZK:Czech koruna|DJF:Djiboutian franc|DKK:Danish krone|DOP:Dominican peso|DZD:Algerian dinar|EGP:Egyptian pound|ERN:Eritrean nakfa|ETB:Ethiopian birr|FJD:Fijian dollar|FKP:Falkland Islands pound|GEL:Georgian lari|GHS:Ghanaian cedi|GIP:Gibraltar pound|GMD:Gambian dalasi|GNF:Guinean franc|GTQ:Guatemalan quetzal|GYD:Guyanese dollar|HNL:Honduran lempira|HTG:Haitian gourde|HUF:Hungarian forint|IDR:Indonesian rupiah|ILS:Israeli new shekel|INR:Indian rupee|IQD:Iraqi dinar|IRR:Iranian rial|ISK:Icelandic króna|JMD:Jamaican dollar|JOD:Jordanian dinar|KES:Kenyan shilling|KGS:Kyrgyz som|KHR:Cambodian riel|KMF:Comorian franc|KPW:North Korean won|KRW:South Korean won|KWD:Kuwaiti dinar|KYD:Cayman Islands dollar|KZT:Kazakhstani tenge|LAK:Lao kip|LBP:Lebanese pound|LKR:Sri Lankan rupee|LRD:Liberian dollar|LSL:Lesotho loti|LYD:Libyan dinar|MAD:Moroccan dirham|MDL:Moldovan leu|MGA:Malagasy ariary|MKD:Macedonian denar|MMK:Myanmar kyat|MNT:Mongolian tögrög|MOP:Macanese pataca|MRU:Mauritanian ouguiya|MUR:Mauritian rupee|MVR:Maldivian rufiyaa|MWK:Malawian kwacha|MXN:Mexican peso|MYR:Malaysian ringgit|MZN:Mozambican metical|NAD:Namibian dollar|NGN:Nigerian naira|NIO:Nicaraguan córdoba|NOK:Norwegian krone|NPR:Nepalese rupee|NZD:New Zealand dollar|OMR:Omani rial|PAB:Panamanian balboa|PEN:Peruvian sol|PGK:Papua New Guinean kina|PHP:Philippine peso|PKR:Pakistani rupee|PLN:Polish złoty|PYG:Paraguayan guaraní|QAR:Qatari riyal|RON:Romanian leu|RSD:Serbian dinar|RUB:Russian ruble|RWF:Rwandan franc|SAR:Saudi riyal|SBD:Solomon Islands dollar|SCR:Seychellois rupee|SDG:Sudanese pound|SEK:Swedish krona|SHP:Saint Helena pound|SLE:Sierra Leonean leone|SOS:Somali shilling|SRD:Surinamese dollar|SSP:South Sudanese pound|STN:São Tomé dobra|SYP:Syrian pound|SZL:Eswatini lilangeni|THB:Thai baht|TJS:Tajikistani somoni|TMT:Turkmenistani manat|TND:Tunisian dinar|TOP:Tongan paʻanga|TRY:Turkish lira|TTD:Trinidad and Tobago dollar|TWD:New Taiwan dollar|TZS:Tanzanian shilling|UAH:Ukrainian hryvnia|UGX:Ugandan shilling|UYU:Uruguayan peso|UZS:Uzbekistani som|VES:Venezuelan bolívar|VND:Vietnamese đồng|VUV:Vanuatu vatu|WST:Samoan tālā|XAF:Central African CFA franc|XCD:East Caribbean dollar|XOF:West African CFA franc|XPF:CFP franc|YER:Yemeni rial|ZAR:South African rand|ZMW:Zambian kwacha|ZWG:Zimbabwe gold'.split('|').map(function(s){var p=s.split(':');return [p[0],p[1],p[0].slice(0,2)];});
var CURALL = POPULAR.concat(ALLCUR);
var CURNAME = {}; CURALL.forEach(function(c){CURNAME[c[0]]=c[1];});
var SRNAME = {USD:'US dollars',AED:'UAE dirhams',INR:'Indian rupees',EUR:'euros',GBP:'British pounds',JPY:'Japanese yen'};
var SYM = {USD:'$',EUR:'€',GBP:'£',JPY:'¥',INR:'₹',CNY:'CN¥',AUD:'A$',CAD:'C$',HKD:'HK$',SGD:'S$'};
var DEF = {infl:3,ret:7,swr:4,stale:90,AED:3.6725,INR:88};
var RAMP_L = ['#7A0B55','#B0127A','#C94A95','#DC7BB2','#E9A8CC','#5C0A42','#9E3D7E','#D49ABD','#F0C7DE'];
var RAMP_D = ['#FF4FB8','#C2147F','#FF85CE','#8E1E66','#FFB3DE','#E0399F','#6E1A52','#FFD1EA','#B5408A'];

function pd(iso){var p=iso.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function daysAgo(iso){return Math.round((pd(TODAY_ISO)-pd(iso))/864e5);}
function addDays(iso,n){var d=pd(iso);d.setDate(d.getDate()+n);return isoOf(d);}
function isoOf(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function grp(i,f){
  if(f==='in'){if(i.length<=3)return i;var l3=i.slice(-3),r=i.slice(0,-3),p=[];while(r.length>2){p.unshift(r.slice(-2));r=r.slice(0,-2);}if(r)p.unshift(r);return p.join(',')+','+l3;}
  return i.replace(/\B(?=(\d{3})+(?!\d))/g,f==='eu'?'.':',');
}
// Removes floating-point noise (e.g. 485310.49999999994 → 485310.5) before rounding for display.
function nf(n,dec,f){var x=Math.abs(n); if(isFinite(x)&&x!==0) x=+x.toPrecision(12); var s=x.toFixed(dec).split('.');return (n<0?'−':'')+grp(s[0],f)+(s[1]?(f==='eu'?',':'.')+s[1]:'');}
function sumBy(a,f){return a.reduce(function(s,x){return s+f(x);},0);}
function typeOf(k){return TYPES.filter(function(t){return t.k===k;})[0]||TYPES[8];}
function ltypeOf(k){return LTYPES.filter(function(t){return t.k===k;})[0]||LTYPES[6];}
function n0(v){var x=parseFloat(v);return isNaN(x)?null:x;}

// Dummy data from the design. Dates are set relative to today so "stale" flags behave the same on any day.
function demoData(){
  var ago=function(n){return addDays(TODAY_ISO,-n);};
  var H=[
    ['h1','Savings account','cash','Savings','USD',12000,12000,ago(8),true,''],
    ['h2','US stock portfolio','stocks','Individual stocks','USD',40000,52500,ago(2),true,''],
    ['h3','Indian equity mutual funds','mf','Equity fund','INR',1500000,1980000,ago(4),true,''],
    ['h4','UAE fixed deposit','fd','Bank FD','AED',100000,104000,ago(7),true,''],
    ['h5','NPS account','nps','NPS Tier I','INR',600000,750000,ago(120),true,'Locked until 60'],
    ['h6','Gold (100 g)','gold','Physical','USD',7000,10500,ago(6),true,''],
    ['h7','Apartment','re','Home I live in','USD',180000,210000,ago(55),false,''],
    ['h8','Crypto','crypto','Bitcoin','USD',5000,3800,ago(1),true,''],
    ['h9','Business stake','other','Business stake','USD',10000,10000,ago(159),false,'']
  ].map(function(a){
    var hist=[0.55,0.7,0.85,1].map(function(f,i){return {d:addDays(a[7],(i-3)*30),v:Math.round(a[5]+(a[6]-a[5])*f)};});
    return {id:a[0],name:a[1],type:a[2],sub:a[3],cur:a[4],invested:a[5],current:a[6],date:a[7],fire:a[8],tag:a[9],notes:'',history:hist};
  });
  // 11 past monthly net-worth snapshots (stored in USD, like every converted value)
  var snapVals=[198400,201900,199700,204300,207800,206100,210900,214200,212600,218300,221480], cm=monthOf(TODAY_ISO);
  return {
    demo:true,
    holdings:H,
    liabilities:[
      {id:'l1',name:'Home loan',type:'home',cur:'USD',balance:120000,rate:6.5,monthly:1100,original:150000,date:ago(8)},
      {id:'l2',name:'Car loan',type:'car',cur:'AED',balance:38000,rate:7.0,monthly:1450,original:60000,date:ago(8)},
      {id:'l3',name:'Credit card',type:'card',cur:'USD',balance:1800,rate:null,monthly:null,original:null,date:ago(5)}
    ],
    rates:{AED:{rate:3.6725,date:ago(7)},INR:{rate:88,date:ago(7)}},
    snapshots:snapVals.map(function(v,i){return {m:addMonths(cm,i-snapVals.length),v:v};})
  };
}
// Empty data still knows the AED↔USD rate so the AED base currency works from the first entry.
function emptyData(){return {demo:false,holdings:[],liabilities:[],rates:{AED:{rate:DEF.AED,date:TODAY_ISO}},snapshots:[]};}
function defaultSettings(){
  return {base:DEFAULT_BASE,themePref:'system',numFmt:'en',dateFmt:'dmy',
    fire:{age:'35',target:'50',exp:'13000',infl:'3',ret:'7',swr:'4',can:'5500'},
    asmEdited:{infl:TODAY_ISO,ret:TODAY_ISO,swr:TODAY_ISO,stale:TODAY_ISO},
    staleDays:90,lastBackup:null,reminder:'monthly',persisted:false,allocBy:'type',csv:'holdings'};
}

/* ---------- validation (used for localStorage and backup files) ---------- */
function isNum(x){return typeof x==='number'&&isFinite(x);}
function isIso(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x);}
function cleanData(raw){
  if(!raw||typeof raw!=='object') throw new Error('No data section');
  if(!Array.isArray(raw.holdings)||!Array.isArray(raw.liabilities)) throw new Error('Missing holdings or liabilities');
  var ids={};
  var holdings=raw.holdings.map(function(h,i){
    if(!h||typeof h.id!=='string'||!h.id||typeof h.name!=='string') throw new Error('Holding '+(i+1)+' has no id or name');
    if(ids['h'+h.id]) throw new Error('Duplicate holding id '+h.id); ids['h'+h.id]=1;
    if(!isNum(h.invested)||!isNum(h.current)||h.invested<0||h.current<0) throw new Error('Holding “'+h.name+'” has an invalid amount');
    if(typeof h.cur!=='string'||!/^[A-Z]{3}$/.test(h.cur)) throw new Error('Holding “'+h.name+'” has an invalid currency');
    var hist=Array.isArray(h.history)?h.history.filter(function(e){return e&&isIso(e.d)&&isNum(e.v);}).map(function(e){return {d:e.d,v:e.v};}):[];
    return {id:h.id,name:h.name,type:typeOf(h.type).k,sub:typeof h.sub==='string'?h.sub:typeOf(h.type).subs[0],cur:h.cur,invested:h.invested,current:h.current,
      date:isIso(h.date)?h.date:TODAY_ISO,fire:h.fire!==false,tag:typeof h.tag==='string'?h.tag:'',notes:typeof h.notes==='string'?h.notes:'',history:hist.length?hist:[{d:isIso(h.date)?h.date:TODAY_ISO,v:h.current}]};
  });
  var liabilities=raw.liabilities.map(function(l,i){
    if(!l||typeof l.id!=='string'||!l.id||typeof l.name!=='string') throw new Error('Liability '+(i+1)+' has no id or name');
    if(ids['l'+l.id]) throw new Error('Duplicate liability id '+l.id); ids['l'+l.id]=1;
    if(!isNum(l.balance)||l.balance<0) throw new Error('Liability “'+l.name+'” has an invalid balance');
    if(typeof l.cur!=='string'||!/^[A-Z]{3}$/.test(l.cur)) throw new Error('Liability “'+l.name+'” has an invalid currency');
    var opt=function(x){return isNum(x)&&x>=0?x:null;};
    return {id:l.id,name:l.name,type:ltypeOf(l.type).k,cur:l.cur,balance:l.balance,rate:opt(l.rate),monthly:opt(l.monthly),original:opt(l.original),date:isIso(l.date)?l.date:TODAY_ISO};
  });
  var rates={};
  Object.keys(raw.rates||{}).forEach(function(k){var r=raw.rates[k]; if(/^[A-Z]{3}$/.test(k)&&k!=='USD'&&r&&isNum(r.rate)&&r.rate>0) rates[k]={rate:r.rate,date:isIso(r.date)?r.date:TODAY_ISO};});
  holdings.concat(liabilities).forEach(function(x){if(x.cur!=='USD'&&!rates[x.cur]) throw new Error('No FX rate for '+x.cur+' (used by “'+x.name+'”)');});
  var snapshots=Array.isArray(raw.snapshots)?raw.snapshots.filter(function(s){return s&&/^\d{4}-\d{2}$/.test(s.m)&&isNum(s.v);}).map(function(s){return {m:s.m,v:s.v};}):[];
  return {demo:raw.demo===true,holdings:holdings,liabilities:liabilities,rates:rates,snapshots:snapshots};
}
function cleanSettings(raw,data){
  var d=defaultSettings(), s=raw&&typeof raw==='object'?raw:{};
  var out={};
  out.base=typeof s.base==='string'&&(s.base==='USD'||data.rates[s.base])?s.base:(data.rates[DEFAULT_BASE]?DEFAULT_BASE:'USD');
  out.themePref=['light','dark','system'].indexOf(s.themePref)>=0?s.themePref:d.themePref;
  out.numFmt=['en','eu','in'].indexOf(s.numFmt)>=0?s.numFmt:d.numFmt;
  out.dateFmt=['dmy','dd','mm','iso'].indexOf(s.dateFmt)>=0?s.dateFmt:d.dateFmt;
  out.fire=Object.assign({},d.fire);
  if(s.fire&&typeof s.fire==='object') Object.keys(d.fire).forEach(function(k){if(typeof s.fire[k]==='string'||isNum(s.fire[k])) out.fire[k]=String(s.fire[k]);});
  out.asmEdited=Object.assign({},d.asmEdited);
  if(s.asmEdited) Object.keys(d.asmEdited).forEach(function(k){if(isIso(s.asmEdited[k])) out.asmEdited[k]=s.asmEdited[k];});
  out.staleDays=isNum(s.staleDays)&&s.staleDays>0?Math.round(s.staleDays):d.staleDays;
  out.lastBackup=isIso(s.lastBackup)?s.lastBackup:null;
  out.reminder=['off','weekly','monthly'].indexOf(s.reminder)>=0?s.reminder:d.reminder;
  out.persisted=s.persisted===true;
  out.allocBy=s.allocBy==='cur'?'cur':'type';
  out.csv=['holdings','liabilities','history'].indexOf(s.csv)>=0?s.csv:d.csv;
  return out;
}
function loadSaved(){
  var raw=null;
  try{ raw=window.localStorage.getItem(STORE_KEY); }catch(e){ return null; }
  if(!raw) return null;
  try{
    var p=JSON.parse(raw);
    var data=cleanData(p.data);
    return Object.assign(cleanSettings(p,data),{data:data});
  }catch(e){
    // Never silently overwrite data we couldn't read: keep a copy aside.
    try{ window.localStorage.setItem(STORE_KEY+':unreadable-'+Date.now(),raw); }catch(e2){}
    console.error('FinWin: saved data could not be read',e);
    return null;
  }
}
function downloadFile(name,text,mime){
  var blob=new Blob([text],{type:mime}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},2000);
}
function csvCell(v){ if(v==null) return ''; var s=String(v); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function toCsv(rows){ return '﻿'+rows.map(function(r){return r.map(csvCell).join(',');}).join('\r\n')+'\r\n'; }
function round2(x){ return Math.round(x*100)/100; }
function blankForm(kind,base){return {kind:kind||'asset',mode:'quick',id:null,name:'',type:'cash',sub:'Savings',cur:base||'USD',invested:'',current:'',date:TODAY_ISO,fire:true,notes:'',ltype:'personal',balance:'',rate:'',monthly:'',original:'',fx:'',tried:false};}

class Component extends DCLogic {
  constructor(props){
    super(props);
    var saved = loadSaved();
    // First visit: the design's dummy data, with AED as the base currency.
    var start = saved || Object.assign(defaultSettings(), {data: props.startEmpty ? emptyData() : demoData()});
    this.firstVisit = !saved;
    this.state = Object.assign({
      screen: props.startScreen || 'dashboard', prevScreen:'fire', sysDark:false,
      sheet:null, calcKey:null, form:blankForm('asset',start.base), qaTab:'type', picker:false, search:'',
      allocPick:-1, allocTable:false,
      fType:'all', fCur:'all', fFire:'all', sort:'value', collapsed:{},
      hid:'h2', lid:'l1', uvVal:'', uvDate:TODAY_ISO, uvTried:false,
      canOpen:false, whichOpen:false, fireView:'chart',
      baseErr:'', restoreMode:'replace', pending:null, delTarget:null, eraseVal:'', toast:null
    }, start);
    this.state.data = this.withSnapshot(this.state.data, this.state.base);
  }
  componentDidMount(){
    try{ this.mq = window.matchMedia('(prefers-color-scheme: dark)'); this.setState({sysDark:this.mq.matches}); this.mql=(e)=>this.setState({sysDark:e.matches}); this.mq.addEventListener('change',this.mql);}catch(e){}
    var self=this;
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&self.state.sheet) self.setState({sheet:null,picker:false}); });
    try{ if(navigator.storage&&navigator.storage.persisted) navigator.storage.persisted().then(function(p){ if(p!==self.state.persisted) self.setState({persisted:p}); }); }catch(e){}
    this.save();
  }
  componentDidUpdate(prev){
    var s=this.state;
    if(PERSIST_KEYS.some(function(k){return prev[k]!==s[k];})) this.save();
  }
  // Records this month's net worth (in USD) so the dashboard trend line builds up over time.
  withSnapshot(d,base){
    var rates={USD:1}; Object.keys(d.rates).forEach(function(k){rates[k]=d.rates[k].rate;});
    var nw=sumBy(d.holdings,function(h){return h.current/(rates[h.cur]||1);})-sumBy(d.liabilities,function(l){return l.balance/(rates[l.cur]||1);});
    var m=monthOf(TODAY_ISO), snaps=d.snapshots.filter(function(x){return x.m!==m;});
    if(d.holdings.length||d.liabilities.length) snaps.push({m:m,v:round2(nw)});
    snaps.sort(function(a,b){return a.m<b.m?-1:a.m>b.m?1:0;});
    return Object.assign({},d,{snapshots:snaps});
  }
  save(){
    var s=this.state, out={app:'FinWin',schema:SCHEMA,savedAt:new Date().toISOString()};
    PERSIST_KEYS.forEach(function(k){out[k]=s[k];});
    out.data=this.withSnapshot(s.data,s.base);
    try{ window.localStorage.setItem(STORE_KEY,JSON.stringify(out)); this.saveFailed=false; }
    catch(e){ if(!this.saveFailed){ this.saveFailed=true; this.flash('Couldn’t save — this browser is blocking storage. Download a backup now.'); } }
  }
  backupPayload(){
    var s=this.state, settings={};
    ['base','themePref','numFmt','dateFmt','fire','asmEdited','staleDays','reminder'].forEach(function(k){settings[k]=s[k];});
    return {app:'FinWin',schema:SCHEMA,exportedAt:new Date().toISOString(),settings:settings,data:this.withSnapshot(s.data,s.base)};
  }
  doBackup(){
    var name='finwin-backup-'+TODAY_ISO+'.json';
    downloadFile(name,JSON.stringify(this.backupPayload(),null,2),'application/json');
    this.setState({lastBackup:TODAY_ISO});
    this.flash('Backup downloaded · '+name);
  }
  // Reads a backup file, checks it, and opens the preview. Nothing changes until the user confirms.
  readBackupText(text,fileName){
    var p;
    try{ p=JSON.parse(text); }catch(e){ this.flash('That file isn’t valid JSON — nothing was changed.'); return false; }
    try{
      if(!p||p.app!=='FinWin') throw new Error('Not a FinWin backup');
      if(!isNum(p.schema)||p.schema>SCHEMA) throw new Error('This backup is from a newer version of FinWin');
      var data=cleanData(p.data), settings=cleanSettings(p.settings,data);
      var made=typeof p.exportedAt==='string'&&isIso(p.exportedAt.slice(0,10))?p.exportedAt.slice(0,10):null;
      this.setState({sheet:'restore',restoreMode:'replace',pending:{name:fileName||'backup.json',made:made,data:data,settings:settings}});
      return true;
    }catch(e){ this.flash('Can’t restore: '+e.message+'. Nothing was changed.'); return false; }
  }
  pickBackup(){
    var self=this, inp=document.createElement('input');
    inp.type='file'; inp.accept='.json,application/json'; inp.style.display='none';
    inp.addEventListener('change',function(){ var f=inp.files&&inp.files[0]; inp.remove(); if(!f) return;
      var r=new FileReader(); r.onload=function(){self.readBackupText(String(r.result),f.name);}; r.onerror=function(){self.flash('Couldn’t read that file — nothing was changed.');}; r.readAsText(f); });
    document.body.appendChild(inp); inp.click();
  }
  applyRestore(){
    var s=this.state, p=s.pending; if(!p) return;
    if(s.restoreMode==='replace'){
      var st=Object.assign({},p.settings); delete st.persisted;
      this.setState(Object.assign(st,{data:this.withSnapshot(p.data,p.settings.base),lastBackup:p.made||s.lastBackup,sheet:null,pending:null,screen:'dashboard',form:blankForm('asset',p.settings.base)}));
    } else {
      var d=JSON.parse(JSON.stringify(s.data)), b=p.data;
      b.holdings.forEach(function(h){var i=d.holdings.findIndex(function(x){return x.id===h.id;}); if(i>=0) d.holdings[i]=h; else d.holdings.push(h);});
      b.liabilities.forEach(function(l){var i=d.liabilities.findIndex(function(x){return x.id===l.id;}); if(i>=0) d.liabilities[i]=l; else d.liabilities.push(l);});
      Object.keys(b.rates).forEach(function(k){var cur=d.rates[k]; if(!cur||b.rates[k].date>=cur.date) d.rates[k]=b.rates[k];});
      var have={}; d.snapshots.forEach(function(x){have[x.m]=1;}); b.snapshots.forEach(function(x){if(!have[x.m]) d.snapshots.push(x);});
      d.demo=d.demo&&b.demo;
      this.setState({data:this.withSnapshot(d,s.base),sheet:null,pending:null});
    }
    this.flash(s.restoreMode==='replace'?'Restored from '+p.name:'Merged '+p.name+' into your data');
  }
  downloadCsv(){
    var s=this.state, c=this.compute(), b=s.base, rows, self=this;
    if(s.csv==='holdings'){
      rows=[['Name','Type','Sub-type','Currency','Amount invested','Current value','Value in '+b,'Gain','Gain %','Counts toward FIRE','Last updated','Notes']].concat(c.H.map(function(h){
        return [h.name,typeOf(h.type).l,h.sub,h.cur,h.invested,h.current,round2(h.cu*c.bR),round2(h.current-h.invested),round2(h.gp),h.fire?'Yes':'No',h.date,h.notes||''];}));
    } else if(s.csv==='liabilities'){
      rows=[['Name','Type','Currency','Outstanding balance','Balance in '+b,'Interest rate %','Monthly payment','Original amount','Estimated payoff','Last updated']].concat(c.L.map(function(l){
        return [l.name,ltypeOf(l.type).l,l.cur,l.balance,round2(l.bu*c.bR),l.rate,l.monthly,l.original,l.po.ok?l.po.iso.slice(0,7):'',l.date];}));
    } else {
      rows=[['Holding','Currency','Date','Value']];
      s.data.holdings.forEach(function(h){h.history.slice().sort(function(a,x){return a.d<x.d?-1:1;}).forEach(function(e){rows.push([h.name,h.cur,e.d,e.v]);});});
    }
    var name='finwin-'+s.csv+'-'+TODAY_ISO+'.csv';
    downloadFile(name,toCsv(rows),'text/csv;charset=utf-8');
    this.flash('Downloaded '+name);
  }
  requestPersist(){
    var self=this;
    if(!(navigator.storage&&navigator.storage.persist)){ this.flash('This browser doesn’t support that — keep regular backups.'); return; }
    navigator.storage.persist().then(function(ok){
      self.setState({persisted:ok});
      self.flash(ok?'This browser will keep your data unless you clear it':'The browser said no for now — it often allows it once the app is installed or used regularly.');
    });
  }
  // Setting "1 base = x USD" changes the base currency's own rate; other currencies are rescaled so their rates vs the base don't move.
  setBaseUsd(v){
    var b=this.state.base; if(b==='USD'||!(v>0)) return;
    this.setData(function(d){var old=d.rates[b].rate, nb=1/v, f=nb/old;
      Object.keys(d.rates).forEach(function(k){d.rates[k]={rate:k===b?nb:d.rates[k].rate*f,date:k===b?TODAY_ISO:d.rates[k].date};});
      d.rates[b].date=TODAY_ISO;});
  }
  deleteItem(){
    var t=this.state.delTarget; if(!t) return;
    this.setData(function(d){ if(t.kind==='asset') d.holdings=d.holdings.filter(function(h){return h.id!==t.id;}); else d.liabilities=d.liabilities.filter(function(l){return l.id!==t.id;}); });
    this.setState({sheet:null,delTarget:null,screen:t.kind==='asset'?'holdings':'liabilities'});
    this.flash('Deleted — '+t.name);
  }
  componentWillUnmount(){ try{this.mq.removeEventListener('change',this.mql);}catch(e){} clearTimeout(this.tt); clearTimeout(this.ot); }
  flash(text){ clearTimeout(this.tt); this.setState({toast:text}); this.tt=setTimeout(()=>this.setState({toast:null}),3200); }
  go(screen){ var p={screen:screen,sheet:null}; if(screen==='assumptions') p.prevScreen=this.state.screen==='assumptions'?this.state.prevScreen:this.state.screen; this.setState(p); }
  setData(fn){ var self=this; this.setState(function(s){ var d=JSON.parse(JSON.stringify(s.data)); fn(d); return {data:self.withSnapshot(d,s.base)}; }); }

  fmtDate(iso){ if(!iso) return '—'; var d=pd(iso), f=this.state.dateFmt, dd=String(d.getDate()).padStart(2,'0'), mm=String(d.getMonth()+1).padStart(2,'0');
    if(f==='dd') return dd+'/'+mm+'/'+d.getFullYear(); if(f==='mm') return mm+'/'+dd+'/'+d.getFullYear(); if(f==='iso') return iso; return d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear(); }
  ago(iso){ var a=daysAgo(iso); if(a<=0) return 'Today'; if(a===1) return 'Yesterday'; if(a<31) return a+' days ago'; return this.fmtDate(iso); }
  money(v,cur,dec){ var f=this.state.numFmt, s=nf(Math.abs(v),dec||0,f), p=SYM[cur]!==undefined?SYM[cur]:cur+' '; return (v<-0.0001&&Math.round(Math.abs(v)*Math.pow(10,dec||0))>0?'−':'')+p+s; }
  smoney(v,cur){ var f=this.state.numFmt, p=SYM[cur]!==undefined?SYM[cur]:cur+' '; return (v>=0?'+':'−')+p+nf(Math.abs(v),0,f); }
  pct(v,dec,signed){ var s=nf(Math.abs(v),dec===undefined?1:dec,this.state.numFmt)+'%'; if(!signed) return (v<0?'−':'')+s; return (v>0.0001?'+':v<-0.0001?'−':'')+s; }
  gi(v){ return v>0.0001?{cls:'gain',arrow:'↑'}:v<-0.0001?{cls:'loss',arrow:'↓'}:{cls:'flat',arrow:'→'}; }

  compute(){
    var s=this.state, d=s.data, self=this;
    var rates={USD:1}; Object.keys(d.rates).forEach(function(k){rates[k]=d.rates[k].rate;});
    var bR = rates[s.base]||1;
    var M=function(usd,dec){return self.money(usd*bR,s.base,dec);};
    var SM=function(usd){return self.smoney(usd*bR,s.base);};
    var SR=function(usd){return nf(usd*bR,0,'en')+' '+(SRNAME[s.base]||CURNAME[s.base]||s.base);};
    var H=d.holdings.map(function(h){var r=rates[h.cur]||1;var cu=h.current/r,iu=h.invested/r;var age=daysAgo(h.date);return Object.assign({},h,{r:r,cu:cu,iu:iu,gp:h.invested>0?(h.current-h.invested)/h.invested*100:0,age:age,stale:age>=s.staleDays});});
    var L=d.liabilities.map(function(l){var r=rates[l.cur]||1;return Object.assign({},l,{r:r,bu:l.balance/r,mu:l.monthly?l.monthly/r:0,po:self.payoff(l)});});
    var tA=sumBy(H,function(h){return h.cu;}), tI=sumBy(H,function(h){return h.iu;}), tL=sumBy(L,function(l){return l.bu;});
    var nw=tA-tL, dta=tA>0?tL/tA*100:0;
    var fireA=sumBy(H.filter(function(h){return h.fire;}),function(h){return h.cu;});
    var nonMort=sumBy(L.filter(function(l){return l.type!=='home';}),function(l){return l.bu;});
    var fireP=fireA-nonMort;
    var f=s.fire, age=n0(f.age)||35, tgt=n0(f.target)||50, expU=(n0(f.exp)||0)/bR, infl=(n0(f.infl)||0)/100, ret=(n0(f.ret)||0)/100, swr=(n0(f.swr)||4)/100, canU=(n0(f.can)||0)/bR;
    var yrs=Math.max(0,tgt-age);
    var fn=expU*12/swr, fnF=fn*Math.pow(1+infl,yrs), prog=fn>0?fireP/fn*100:0, grow=fireP*Math.pow(1+ret,yrs);
    var rm=ret/12, af=rm>0?(Math.pow(1+rm,yrs*12)-1)/rm:yrs*12, need=af>0?Math.max(0,(fnF-grow)/af):0;
    var portAt=function(m,c){return fireP*Math.pow(1+ret,m/12)+c*(rm>0?(Math.pow(1+rm,m)-1)/rm:m);};
    var tgtAt=function(m){return fn*Math.pow(1+infl,m/12);};
    var fireAge=function(c){for(var m=0;m<=(100-age)*12;m++){if(portAt(m,c)>=tgtAt(m)) return age+m/12;}return null;};
    var staleFx=Object.keys(d.rates).filter(function(k){return daysAgo(d.rates[k].date)>=s.staleDays;});
    return {rates:rates,bR:bR,M:M,SM:SM,SR:SR,H:H,L:L,tA:tA,tI:tI,tL:tL,nw:nw,dta:dta,fireA:fireA,nonMort:nonMort,fireP:fireP,age:age,tgt:tgt,yrs:yrs,expU:expU,infl:infl,ret:ret,swr:swr,canU:canU,fn:fn,fnF:fnF,prog:prog,grow:grow,rm:rm,af:af,need:need,portAt:portAt,tgtAt:tgtAt,fireAge:fireAge,staleFx:staleFx};
  }
  payoff(l){
    var B=l.balance,P=l.monthly,r=(l.rate||0)/100/12;
    if(!P) return {ok:false,reason:'No monthly payment entered — add one to estimate a payoff date.'};
    if(r>0&&P<=r*B) return {ok:false,reason:"The monthly payment doesn't cover the interest, so the balance never reaches zero."};
    var n=r>0?-Math.log(1-r*B/P)/Math.log(1+r):B/P, months=Math.ceil(n), dt=pd(TODAY_ISO); dt.setMonth(dt.getMonth()+months);
    return {ok:true,n:n,months:months,date:dt,iso:isoOf(dt),interest:Math.max(0,n*P-B),r:r};
  }
  srcOf(cur){ var d=this.state.data; if(cur===this.state.base) return 'Entered by you'; var fx=d.rates[cur]; return fx?('FX rate — entered by you on '+this.fmtDate(fx.date)+' (Dummy rate)'):'No FX rate yet'; }
  rateTxt(cur,c){ var base=this.state.base; var r=c.rates[cur]/c.bR; return '1 '+base+' = '+nf(r,4,this.state.numFmt)+' '+cur; }

  calcPanel(key,c){
    var s=this.state, self=this, M=c.M, b=s.base, go=function(sc){return function(){self.go(sc);};};
    var hv=function(h){return h.cur===b?{k:h.name,v:self.money(h.current,h.cur),src:'Entered by you · updated '+self.fmtDate(h.date)}:{k:h.name,v:self.money(h.current,h.cur)+' → '+M(h.cu),src:self.rateTxt(h.cur,c)+' · '+self.srcOf(h.cur)};};
    var lv=function(l){return l.cur===b?{k:l.name,v:self.money(l.balance,l.cur),src:'Entered by you · '+self.fmtDate(l.date)}:{k:l.name,v:self.money(l.balance,l.cur)+' → '+M(l.bu),src:self.rateTxt(l.cur,c)+' · '+self.srcOf(l.cur)};};
    var P={};
    P.nw={t:'Net worth',plain:'Net worth = total assets − total liabilities.',sub:M(c.tA)+' − '+M(c.tL)+' = '+M(c.nw),inputs:[{k:'Total assets',v:M(c.tA),src:c.H.length+' holdings, current values, converted with your FX rates'},{k:'Total liabilities',v:M(c.tL),src:c.L.length+' liabilities, outstanding balances'}],edit:['Edit holdings',go('holdings')]};
    P.assets={t:'Total assets',plain:'Total assets = the current value of every holding, each converted to '+b+' with the FX rate you entered.',sub:c.H.map(function(h){return M(h.cu);}).join(' + ')+'\n= '+M(c.tA),inputs:c.H.map(hv),edit:['Edit holdings',go('holdings')]};
    P.liabs={t:'Total liabilities',plain:'Total liabilities = every outstanding balance, converted to '+b+'.',sub:c.L.map(function(l){return M(l.bu);}).join(' + ')+' = '+M(c.tL),inputs:c.L.map(lv),edit:['Edit liabilities',go('liabilities')]};
    P.gain={t:'Total gain / loss',plain:'Gain = total current value − total amount invested. Gain % = gain ÷ amount invested.',sub:M(c.tA)+' − '+M(c.tI)+' = '+c.SM(c.tA-c.tI)+'\n'+c.SM(c.tA-c.tI)+' ÷ '+M(c.tI)+' = '+this.pct((c.tA-c.tI)/(c.tI||1)*100,1,true),inputs:[{k:'Total current value',v:M(c.tA),src:'Sum of current values you entered'},{k:'Total invested',v:M(c.tI),src:'Sum of amounts invested you entered, converted at today’s FX rates'}],note:'Invested amounts in other currencies are converted at your current FX rate, not the rate on the day you invested.',edit:['Edit holdings',go('holdings')]};
    P.dta={t:'Debt-to-asset ratio',plain:'Debt-to-asset ratio = total liabilities ÷ total assets. Lower means less of what you own is borrowed.',sub:M(c.tL)+' ÷ '+M(c.tA)+' = '+this.pct(c.dta),inputs:[{k:'Total liabilities',v:M(c.tL),src:'All liabilities'},{k:'Total assets',v:M(c.tA),src:'All holdings, including your home'}],edit:['Edit liabilities',go('liabilities')]};
    P.alloc={t:'Allocation',plain:'Each slice = that group’s current value ÷ total assets.',sub:'Total assets '+M(c.tA),inputs:c.H.map(hv),edit:['Edit holdings',go('holdings')]};
    var fireH=c.H.filter(function(h){return h.fire;}), nmL=c.L.filter(function(l){return l.type!=='home';});
    P.fireP={t:'FIRE portfolio',plain:'FIRE portfolio = assets you marked “Counts toward FIRE” − debts other than your mortgage. Your home and the mortgage are left out because you live in it.',sub:M(c.fireA)+' − '+M(c.nonMort)+' = '+M(c.fireP),inputs:fireH.map(hv).concat(nmL.map(function(l){var x=lv(l);x.k='Debt: '+x.k;return x;})),edit:['Choose which assets count',function(){self.setState({screen:'fire',sheet:null,whichOpen:true});}]};
    P.fireNum={t:'FIRE number (today’s money)',plain:'FIRE number = yearly expenses ÷ safe withdrawal rate.',sub:M(c.expU)+' × 12 ÷ '+this.pct(c.swr*100)+' = '+M(c.fn),inputs:[{k:'Monthly expenses',v:M(c.expU),src:'Entered by you on the FIRE screen'},{k:'Safe withdrawal rate',v:this.pct(c.swr*100),src:'Assumption — default 4.0%, last edited '+this.fmtDate(s.asmEdited.swr)}],edit:['Edit assumptions',go('assumptions')]};
    P.fireFut={t:'FIRE number at age '+c.tgt,plain:'Future FIRE number = today’s FIRE number × (1 + inflation) ^ years to retirement.',sub:M(c.fn)+' × '+nf(1+c.infl,2,'en')+'^'+c.yrs+' ≈ '+M(c.fnF),inputs:[{k:'FIRE number today',v:M(c.fn),src:'Calculated'},{k:'Inflation',v:this.pct(c.infl*100),src:'Assumption — last edited '+this.fmtDate(s.asmEdited.infl)},{k:'Years to retirement',v:String(c.yrs),src:'Target age '+c.tgt+' − current age '+c.age}],edit:['Edit assumptions',go('assumptions')]};
    P.prog={t:'FIRE progress',plain:'Progress = FIRE portfolio ÷ FIRE number in today’s money.',sub:M(c.fireP)+' ÷ '+M(c.fn)+' = '+this.pct(c.prog),inputs:[{k:'FIRE portfolio',v:M(c.fireP),src:'FIRE-counted assets − non-mortgage debts'},{k:'FIRE number (today)',v:M(c.fn),src:'Monthly expenses × 12 ÷ safe withdrawal rate'}],edit:['Open FIRE plan',go('fire')]};
    P.need={t:'Monthly investment needed',plain:'1) Grow today’s FIRE portfolio at the expected return, once a year, until your target age. 2) The gap to the future FIRE number is filled by a fixed monthly investment, compounded monthly at return ÷ 12.',sub:'Portfolio at '+c.tgt+': '+M(c.fireP)+' × '+nf(1+c.ret,2,'en')+'^'+c.yrs+' ≈ '+M(c.grow)+'\nGap: '+M(c.fnF)+' − '+M(c.grow)+' = '+M(Math.max(0,c.fnF-c.grow))+'\nMonthly: gap ÷ (((1 + '+nf(c.ret*100,1,'en')+'% ÷ 12)^'+(c.yrs*12)+' − 1) ÷ ('+nf(c.ret*100,1,'en')+'% ÷ 12)) ≈ '+M(c.need),inputs:[{k:'FIRE portfolio today',v:M(c.fireP),src:'Calculated'},{k:'Expected return',v:this.pct(c.ret*100),src:'Assumption (nominal) — last edited '+this.fmtDate(s.asmEdited.ret)},{k:'FIRE number at '+c.tgt,v:M(c.fnF),src:'Inflation-adjusted'},{k:'Months',v:String(c.yrs*12),src:'Years to retirement × 12'}],note:'Existing portfolio compounds yearly; new monthly investments compound monthly. Both are simplifications.',edit:['Edit assumptions',go('assumptions')]};
    var fa=c.fireAge(c.canU);
    P.fireAge={t:'Estimated FIRE age',plain:'Month by month, we grow your FIRE portfolio and add your monthly investment, and raise the FIRE number with inflation. Your FIRE age is the first month the portfolio reaches the target.',sub:'Monthly investment '+M(c.canU)+'\nFIRE age ≈ '+(fa?nf(fa,1,'en'):'not reached by 100'),inputs:[{k:'FIRE portfolio today',v:M(c.fireP),src:'Calculated'},{k:'Monthly investment',v:M(c.canU),src:'Entered by you'},{k:'Expected return',v:this.pct(c.ret*100),src:'Assumption'},{k:'Inflation',v:this.pct(c.infl*100),src:'Assumption'}],edit:['Edit assumptions',go('assumptions')]};
    if(key&&key.indexOf('h:')===0){var h=c.H.filter(function(x){return x.id===key.slice(2);})[0]; if(h){var g=h.current-h.invested;
      P[key]={t:h.name,plain:'Value in '+b+' = current value ÷ FX rate. Gain = current value − amount invested; gain % = gain ÷ amount invested.',sub:(h.cur===b?'':this.money(h.current,h.cur)+' ÷ '+nf(h.r/c.bR,4,'en')+' = '+M(h.cu)+'\n')+this.money(h.current,h.cur)+' − '+this.money(h.invested,h.cur)+' = '+this.smoney(g,h.cur)+' ('+this.pct(h.gp,1,true)+')',inputs:[{k:'Current value',v:this.money(h.current,h.cur),src:'Entered by you · '+this.fmtDate(h.date)},{k:'Amount invested',v:this.money(h.invested,h.cur),src:'Entered by you'}].concat(h.cur===b?[]:[{k:'FX rate',v:this.rateTxt(h.cur,c),src:this.srcOf(h.cur)}]),edit:['Edit this holding',function(){self.openEditH(h.id);}]};}}
    if(key&&key.indexOf('l:')===0){var l=c.L.filter(function(x){return x.id===key.slice(2);})[0]; if(l){var po=l.po;
      P[key]={t:l.name+' payoff',plain:'Months to pay off = −ln(1 − r × balance ÷ payment) ÷ ln(1 + r), where r = yearly interest rate ÷ 12. This is the standard amortisation formula.',sub:po.ok?('r = '+nf(l.rate||0,2,'en')+'% ÷ 12 = '+nf(po.r,5,'en')+'\nn = −ln(1 − '+nf(po.r,5,'en')+' × '+nf(l.balance,0,'en')+' ÷ '+nf(l.monthly,0,'en')+') ÷ ln(1 + '+nf(po.r,5,'en')+') ≈ '+nf(po.n,1,'en')+' months\n→ '+MON[po.date.getMonth()]+' '+po.date.getFullYear()):po.reason,inputs:[{k:'Balance',v:this.money(l.balance,l.cur),src:'Entered by you · '+this.fmtDate(l.date)},{k:'Interest rate',v:l.rate!=null?this.pct(l.rate,2):'—',src:'Entered by you'},{k:'Monthly payment',v:l.monthly?this.money(l.monthly,l.cur):'—',src:'Entered by you'}],note:'Estimate — your lender’s schedule may differ (fees, rate changes, day-count rules).',edit:['Edit this liability',function(){self.openEditL(l.id);}]};}}
    P.monthly={t:'Total monthly debt payments',plain:'Sum of every monthly payment you entered, converted to '+b+'.',sub:c.L.filter(function(l){return l.monthly;}).map(function(l){return M(l.mu);}).join(' + ')+' = '+M(sumBy(c.L,function(l){return l.mu;})),inputs:c.L.filter(function(l){return l.monthly;}).map(function(l){return {k:l.name,v:self.money(l.monthly,l.cur),src:l.cur===b?'Entered by you':self.rateTxt(l.cur,c)};}),edit:['Edit liabilities',go('liabilities')]};
    P.debtfree={t:'Estimated debt-free date',plain:'The latest payoff date among liabilities that have a rate and monthly payment.',sub:c.L.filter(function(l){return l.po.ok;}).map(function(l){return l.name+': '+MON[l.po.date.getMonth()]+' '+l.po.date.getFullYear();}).join('\n')||'No estimates yet',inputs:c.L.filter(function(l){return !l.po.ok;}).map(function(l){return {k:l.name+' — not included',v:'',src:l.po.reason};}),note:'Estimate — your lender’s schedule may differ.',edit:['Edit liabilities',go('liabilities')]};
    var p=P[key]||P.nw;
    return {title:p.t,plain:p.plain,sub:p.sub,inputs:p.inputs,hasNote:!!p.note,note:p.note||'',editLabel:p.edit[0],edit:p.edit[1]};
  }
  openCalc(key){ this.setState({sheet:'calc',calcKey:key}); }
  openQA(tab){ this.setState({sheet:'form',form:blankForm('asset',this.state.base),qaTab:tab||'type',picker:false,search:'',shot:'idle'}); }
  openEditH(id){ var h=this.state.data.holdings.filter(function(x){return x.id===id;})[0]; if(!h) return;
    this.setState({sheet:'form',picker:false,qaTab:'type',form:Object.assign(blankForm('asset',this.state.base),{mode:'edit',id:id,name:h.name,type:h.type,sub:h.sub,cur:h.cur,invested:String(h.invested),current:String(h.current),date:h.date,fire:h.fire,notes:h.notes||''})}); }
  openEditL(id){ var l=this.state.data.liabilities.filter(function(x){return x.id===id;})[0]; if(!l) return;
    this.setState({sheet:'form',picker:false,qaTab:'type',form:Object.assign(blankForm('liability',this.state.base),{kind:'liability',mode:'edit',id:id,name:l.name,ltype:l.type,cur:l.cur,balance:String(l.balance),rate:l.rate!=null?String(l.rate):'',monthly:l.monthly!=null?String(l.monthly):'',original:l.original!=null?String(l.original):'',date:l.date})}); }
  setForm(p){ this.setState(function(s){return {form:Object.assign({},s.form,p)};}); }
  formErrors(f){
    var e={}, has=this.state.data.rates[f.cur]||f.cur==='USD';
    if(!f.name.trim()) e.name=true;
    if(!has && !(n0(f.fx)>0)) e.fx=true;
    if(f.kind==='asset'){ var i=n0(f.invested), c=n0(f.current);
      if(i===null) {e.invested=true;e.investedTxt='Required.';} else if(i<0){e.invested=true;e.investedTxt='Can’t be negative.';}
      if(c===null) {e.current=true;e.currentTxt='Required.';} else if(c<0){e.current=true;e.currentTxt='Can’t be negative.';}
    } else { var b=n0(f.balance);
      if(b===null){e.balance=true;e.balanceTxt='Required.';} else if(b<0){e.balance=true;e.balanceTxt='Can’t be negative.';}
      var r=n0(f.rate); if(f.rate!==''&&(r===null||r<0||r>100)) e.rate=true;
      var m=n0(f.monthly); if(f.monthly!==''&&(m===null||m<0)) e.monthly=true;
    }
    return e;
  }
  saveForm(another){
    var f=this.state.form, e=this.formErrors(f);
    if(Object.keys(e).length){ this.setForm({tried:true}); return; }
    var self=this, isNew=f.mode!=='edit', id=f.id||('x'+Date.now());
    this.setData(function(d){
      if(!(d.rates[f.cur]||f.cur==='USD')) d.rates[f.cur]={rate:n0(f.fx)*(self.state.base==='USD'?1:(d.rates[self.state.base]?d.rates[self.state.base].rate:1)),date:TODAY_ISO};
      if(f.kind==='asset'){
        var rec={id:id,name:f.name.trim(),type:f.type,sub:f.sub,cur:f.cur,invested:n0(f.invested),current:n0(f.current),date:f.date||TODAY_ISO,fire:f.fire,notes:f.notes,tag:''};
        if(isNew){ rec.history=[{d:rec.date,v:rec.current}]; d.holdings.push(rec); }
        else d.holdings=d.holdings.map(function(h){ if(h.id!==id) return h; var n=Object.assign({},h,rec,{tag:h.tag,history:h.history}); if(h.current!==rec.current) n.history=h.history.concat([{d:rec.date,v:rec.current}]); return n; });
      } else {
        var lr={id:id,name:f.name.trim(),type:f.ltype,cur:f.cur,balance:n0(f.balance),rate:f.rate===''?null:n0(f.rate),monthly:f.monthly===''?null:n0(f.monthly),original:f.original===''?null:n0(f.original),date:f.date||TODAY_ISO};
        if(isNew) d.liabilities.push(lr); else d.liabilities=d.liabilities.map(function(l){return l.id===id?lr:l;});
      }
    });
    this.flash((isNew?'Saved — ':'Updated — ')+f.name.trim());
    if(another) this.setState({form:Object.assign(blankForm(f.kind,f.cur),{type:f.type,sub:f.sub,ltype:f.ltype,cur:f.cur,fire:f.fire})});
    else this.setState({sheet:null});
  }

  renderVals(){
    var s=this.state, self=this, c=this.compute(), M=c.M, d=s.data, b=s.base;
    var hasData=d.holdings.length>0||d.liabilities.length>0;
    var theme=s.themePref==='system'?(s.sysDark?'dark':'light'):s.themePref;
    var scr=s.screen;
    var is={}; ['dashboard','holdings','holding','liabilities','liability','fire','assumptions','settings'].forEach(function(k){is[k]=false;});
    var needsData={dashboard:1,holdings:1,holding:1,liabilities:1,liability:1,fire:1};
    var showEmpty=!hasData&&!!needsData[scr];
    if(!showEmpty) is[scr]=true;
    var navDefs=[['dashboard','Dashboard','Home',IC.dash],['holdings','Holdings','Holdings',IC.hold],['liabilities','Liabilities','Debts',IC.liab],['fire','FIRE','FIRE',IC.fire],['settings','Settings','Settings',IC.settings]];
    var section={holding:'holdings',liability:'liabilities',assumptions:s.prevScreen==='settings'?'settings':'fire'}[scr]||scr;
    var nav=navDefs.map(function(n){var on=section===n[0];return {label:n[1],short:n[2],icon:n[3],cls:'navitem'+(on?' on':''),tabCls:'tab'+(on?' on':''),cur:on?'page':null,go:function(){self.go(n[0]);}};});
    var titles={dashboard:'Dashboard',holdings:'Holdings',holding:'Holding',liabilities:'Liabilities',liability:'Liability',fire:'FIRE plan',assumptions:'All assumptions',settings:'Settings & backup'};
    var bd=s.lastBackup?daysAgo(s.lastBackup):null;
    var remDays={weekly:7,monthly:30,off:Infinity}[s.reminder]||30;
    var backupOld=bd===null||bd>remDays;
    var backupText=bd===null?'No backup yet':bd===0?'Last backup: today':'Last backup: '+bd+' days ago';
    var baseCur=CURALL.filter(function(x){return x[0]===b;})[0]||['USD','US dollar','US'];
    var hdr={title:titles[scr],base:b,baseFlag:baseCur[2],baseAria:'Base currency '+baseCur[1]+'. Change in Settings',backupText:backupText,backupCls:'chip '+(backupOld?'amber':'ok'),
      themeIcon:theme==='dark'?IC.sun:IC.moon,themeAria:theme==='dark'?'Switch to light mode':'Switch to dark mode',
      toggleTheme:function(){self.setState({themePref:theme==='dark'?'light':'dark'});},goSettings:function(){self.go('settings');},openQA:function(){self.openQA('type');}};
    var doBackup=function(){self.doBackup();};

    // empty
    var emptyCopy={dashboard:['Welcome to FinWin','Track what you own and owe, privately. Everything you enter stays in this browser on this device — no sign-up, no bank links.','Add your first holding',IC.lock],
      holdings:['Add your first holding','Type a name and amount, or paste a screenshot of a statement. FinWin reads it on this device.','Add your first holding',IC.hold],
      holding:['Add your first holding','Type a name and amount, or paste a screenshot of a statement.','Add your first holding',IC.hold],
      liabilities:['No liabilities yet','Add loans and cards to see your net worth, payoff dates and debt-free date.','Add a liability',IC.liab],
      liability:['No liabilities yet','Add loans and cards to see payoff estimates.','Add a liability',IC.liab],
      fire:['Your FIRE plan needs holdings','Add the assets that will fund your retirement, then set your age and expenses here.','Add your first holding',IC.fire]}[scr]||['','','',IC.lock];
    var empty={title:emptyCopy[0],body:emptyCopy[1],addLabel:emptyCopy[2],icon:emptyCopy[3],
      add:function(){self.openQA('type'); if(scr==='liabilities'||scr==='liability') self.setForm({kind:'liability'});},
      shot:function(){self.openQA('shot');},
      demo:function(){self.setState({data:self.withSnapshot(demoData(),s.base)});self.flash('Demo data loaded — explore freely');}};

    // dashboard
    var cm=monthOf(TODAY_ISO), past=d.snapshots.filter(function(x){return x.m<cm;}).slice(-11);
    var snaps=past.map(function(x){return x.v;}).concat([c.nw]); var prev=past.length?past[past.length-1].v:c.nw;
    var sp=this.spark(snaps,300,72,6);
    var chg=c.nw-prev, chgP=prev?chg/prev*100:0, cg=this.gi(chg);
    var ramp=theme==='dark'?RAMP_D:RAMP_L;
    var groups={}; c.H.forEach(function(h){var k=s.allocBy==='type'?h.type:h.cur; groups[k]=(groups[k]||0)+h.cu;});
    var gk=Object.keys(groups).sort(function(a,x){return groups[x]-groups[a];});
    var a0=-Math.PI/2, alloc=gk.map(function(k,i){var fr=c.tA?groups[k]/c.tA:0;var a1=a0+fr*Math.PI*2;var seg=self.arc(60,60,46,a0+0.012,a1-0.012,fr);a0=a1;var on=s.allocPick===i;
      return {d:seg,color:on?(theme==='dark'?'#3FE0F0':'#0E9AAE'):ramp[i%ramp.length],label:s.allocBy==='type'?typeOf(k).l:(k+' — '+(CURNAME[k]||k)),pct:self.pct(fr*100),val:M(groups[k]),on:on,cls:on?'on':'',pick:function(){self.setState({allocPick:on?-1:i});}};});
    var picked=alloc[s.allocPick];
    var tiles=[
      {label:'Total assets',val:M(c.tA),sr:c.SR(c.tA),sub:c.H.length+' holdings',subCls:'sub muted',arrow:'',info:function(){self.openCalc('assets');},infoAria:'How total assets is calculated'},
      {label:'Total liabilities',val:M(c.tL),sr:c.SR(c.tL),sub:c.L.length+' liabilities',subCls:'sub muted',arrow:'',info:function(){self.openCalc('liabs');},infoAria:'How total liabilities is calculated'},
      {label:'Total gain / loss',val:c.SM(c.tA-c.tI),sr:c.SR(c.tA-c.tI),sub:this.pct((c.tA-c.tI)/(c.tI||1)*100,1,true)+' on '+M(c.tI)+' invested',subCls:'sub '+this.gi(c.tA-c.tI).cls,arrow:this.gi(c.tA-c.tI).arrow,info:function(){self.openCalc('gain');},infoAria:'How total gain is calculated'},
      {label:'Debt-to-asset ratio',val:this.pct(c.dta),sr:this.pct(c.dta)+' debt to assets',sub:'liabilities ÷ assets',subCls:'sub muted',arrow:'',info:function(){self.openCalc('dta');},infoAria:'How debt-to-asset ratio is calculated'}
    ];
    var staleList=c.H.filter(function(h){return h.stale;}).sort(function(a,x){return x.age-a.age;}).map(function(h){return {name:h.name,icon:typeOf(h.type).icon,ago:'Last updated '+h.age+' days ago',go:function(){self.setState({screen:'holding',hid:h.id,uvVal:'',uvTried:false});}};})
      .concat(c.staleFx.map(function(k){return {name:'FX rate '+b+' → '+k,icon:IC.settings,ago:'Last updated '+daysAgo(d.rates[k].date)+' days ago',go:function(){self.go('settings');}};}));
    var ml=function(ym){return MON[+ym.slice(5,7)-1]+' '+ym.slice(0,4);};
    var sm=past.length?[ml(past[0].m),ml(cm)]:['',ml(cm)];
    var dash={nw:M(c.nw),nwSR:'Net worth '+c.SR(c.nw),chg:{cls:cg.cls,arrow:cg.arrow,txt:c.SM(chg)+' ('+this.pct(chgP,1,true)+')'},
      sparkLine:sp.line,sparkArea:sp.area,sparkFrom:sm[0],sparkTo:sm[1],sparkSR:'Net worth over '+snaps.length+' months, from '+M(snaps[0])+' to '+M(c.nw),sparkTag:d.demo?'Includes demo history':(past.length?'Monthly snapshots':'First month — trend builds over time'),hasPrev:past.length>0,
      tiles:tiles,alloc:alloc,allocCenterLabel:picked?picked.label.split(' — ')[0]:'Total assets',allocCenter:picked?picked.pct:M(c.tA),allocSR:'Allocation: '+alloc.map(function(a){return a.label+' '+a.pct;}).join(', '),
      isType:s.allocBy==='type',isCur:s.allocBy==='cur',byTypeCls:s.allocBy==='type'?'on':'',byCurCls:s.allocBy==='cur'?'on':'',
      byType:function(){self.setState({allocBy:'type',allocPick:-1});},byCur:function(){self.setState({allocBy:'cur',allocPick:-1});},
      allocChart:!s.allocTable,allocTable:s.allocTable,allocTableLabel:s.allocTable?'View as chart':'View as table',toggleAllocTable:function(){self.setState({allocTable:!s.allocTable});},
      fireP:M(c.fireP),firePct:this.pct(c.prog),fireNum:M(c.fn),fireBar:Math.max(0,Math.min(100,c.prog)).toFixed(1),fireBarN:Math.round(c.prog),fireTarget:c.tgt,goFire:function(){self.go('fire');},
      stale:staleList,staleCount:staleList.length+' item'+(staleList.length===1?'':'s'),noStale:staleList.length===0,staleDays:s.staleDays,
      backupTitle:backupOld?(bd===null?'No backup yet':'Last backup '+bd+' days ago'):'Backed up '+(bd===0?'today':bd+' days ago'),backupCardCls:'card'+(backupOld?'':' accent'),
      info:{nw:function(){self.openCalc('nw');},alloc:function(){self.openCalc('alloc');},prog:function(){self.openCalc('prog');}}};

    // holdings
    var fl=c.H.filter(function(h){return (s.fType==='all'||h.type===s.fType)&&(s.fCur==='all'||h.cur===s.fCur)&&(s.fFire==='all'||(s.fFire==='yes')===h.fire);});
    var sorter={value:function(a,x){return x.cu-a.cu;},gain:function(a,x){return x.gp-a.gp;},updated:function(a,x){return pd(x.date)-pd(a.date);}}[s.sort];
    var gmap={}; fl.forEach(function(h){(gmap[h.type]=gmap[h.type]||[]).push(h);});
    var hgroups=Object.keys(gmap).map(function(k){var rows=gmap[k].slice().sort(sorter);var tot=sumBy(rows,function(h){return h.cu;});var open=!s.collapsed[k];var t=typeOf(k);
      return {k:k,tot:tot,label:t.l,icon:t.icon,count:rows.length+(rows.length===1?' holding':' holdings'),total:M(tot),pct:self.pct(c.tA?tot/c.tA*100:0),open:open,chev:open?IC.chevU:IC.chevD,
        toggle:function(){var col=Object.assign({},s.collapsed);col[k]=open;self.setState({collapsed:col});},
        rows:rows.map(function(h){var g=self.gi(h.current-h.invested);return {name:h.name,sub:h.sub+' · '+h.cur,orig:h.cur===b?'—':self.money(h.current,h.cur),val:M(h.cu),gp:self.pct(h.gp,1,true),gcls:g.cls,arrow:g.arrow,share:self.pct(c.tA?h.cu/c.tA*100:0),
          fireCls:h.fire?'tag cy':'tag line',fireTxt:h.fire?'FIRE':'Not in FIRE',hasTag:!!h.tag,tag:h.tag,stale:h.stale,updated:h.stale?('Stale · '+h.age+'d'):self.ago(h.date),
          open:function(){self.setState({screen:'holding',hid:h.id,uvVal:'',uvTried:false,uvDate:TODAY_ISO});}};})};}).sort(function(a,x){return x.tot-a.tot;});
    var usedTypes=TYPES.filter(function(t){return c.H.some(function(h){return h.type===t.k;});});
    var usedCurs=[]; c.H.forEach(function(h){if(usedCurs.indexOf(h.cur)<0) usedCurs.push(h.cur);});
    var filtered=s.fType!=='all'||s.fCur!=='all'||s.fFire!=='all';
    var hg=this.gi(c.tA-c.tI);
    var hold={total:M(c.tA),invested:M(c.tI),gain:{cls:hg.cls,arrow:hg.arrow,txt:c.SM(c.tA-c.tI)+' ('+this.pct((c.tA-c.tI)/(c.tI||1)*100,1,true)+')'},infoGain:function(){self.openCalc('gain');},
      fType:s.fType,fCur:s.fCur,fFire:s.fFire,sort:s.sort,typeOpts:usedTypes.map(function(t){return {v:t.k,l:'Type: '+t.l};}),curOpts:usedCurs.map(function(x){return {v:x,l:'Currency: '+x};}),
      setType:function(e){self.setState({fType:e.target.value});},setCur:function(e){self.setState({fCur:e.target.value});},setFire:function(e){self.setState({fFire:e.target.value});},setSort:function(e){self.setState({sort:e.target.value});},
      clear:function(){self.setState({fType:'all',fCur:'all',fFire:'all'});},filtered:filtered,filterNote:'Showing '+fl.length+' of '+c.H.length+' holdings · '+M(sumBy(fl,function(h){return h.cu;})),
      groups:hgroups,none:fl.length===0&&c.H.length>0,baseCol:'Value ('+b+')'};

    // holding detail
    var H1=c.H.filter(function(h){return h.id===s.hid;})[0]||c.H[0];
    var hd={};
    if(H1){ var hs=H1.history.slice().sort(function(a,x){return pd(a.d)-pd(x.d);}); var hsp=this.spark(hs.map(function(e){return e.v;}),300,72,6); var g1=this.gi(H1.current-H1.invested);
      var uv=n0(s.uvVal), uvBad=s.uvTried&&(uv===null||uv<0);
      hd={name:H1.name,icon:typeOf(H1.type).icon,typeLine:typeOf(H1.type).l+' · '+H1.sub+' · '+H1.cur,stale:H1.stale,val:M(H1.cu),orig:H1.cur===b?'':self.money(H1.current,H1.cur),cur:H1.cur,
        g:{cls:g1.cls,arrow:g1.arrow,txt:self.smoney(H1.current-H1.invested,H1.cur)+' ('+self.pct(H1.gp,1,true)+')'},
        info:function(){self.openCalc('h:'+H1.id);},line:hsp.line,area:hsp.area,sparkSR:'Value history for '+H1.name,
        hist:hs.slice().reverse().map(function(e){return {date:self.fmtDate(e.d),val:self.money(e.v,H1.cur)};}),histNote:d.demo?'Includes demo entries':'Your entries',
        uvVal:s.uvVal,uvDate:s.uvDate,uvErr:uvBad,uvCls:'input'+(uvBad?' bad':''),setUv:function(e){self.setState({uvVal:e.target.value});},setUvDate:function(e){self.setState({uvDate:e.target.value||TODAY_ISO});},
        logUpdate:function(){var v=n0(s.uvVal); if(v===null||v<0){self.setState({uvTried:true});return;} self.setData(function(dd){dd.holdings=dd.holdings.map(function(h){if(h.id!==H1.id) return h; var nd=s.uvDate||TODAY_ISO; return Object.assign({},h,{current:v,date:nd>h.date?nd:h.date,history:h.history.concat([{d:nd,v:v}])});});}); self.setState({uvVal:'',uvTried:false}); self.flash('Value logged for '+H1.name);},
        edit:function(){self.openEditH(H1.id);},back:function(){self.go('holdings');},del:function(){self.setState({sheet:'del',delTarget:{kind:'asset',id:H1.id,name:H1.name}});},
        fields:[{k:'Type',v:typeOf(H1.type).l},{k:'Sub-type',v:H1.sub},{k:'Currency',v:H1.cur+' — '+(CURNAME[H1.cur]||'')},{k:'Amount invested',v:self.money(H1.invested,H1.cur)},{k:'Current value',v:self.money(H1.current,H1.cur)},{k:'Last updated',v:self.fmtDate(H1.date)},{k:'Counts toward FIRE',v:H1.fire?'Yes':'No'},{k:'Share of portfolio',v:self.pct(c.tA?H1.cu/c.tA*100:0)}].concat(H1.tag?[{k:'Tag',v:H1.tag}]:[]).concat(H1.notes?[{k:'Notes',v:H1.notes}]:[])};
    }

    // liabilities
    var totM=sumBy(c.L,function(l){return l.mu;}), okL=c.L.filter(function(l){return l.po.ok;});
    var last=okL.sort(function(a,x){return x.po.date-a.po.date;})[0];
    var liab={tiles:[
      {label:'Total liabilities',val:M(c.tL),sub:c.L.length+' items',info:function(){self.openCalc('liabs');},infoAria:'How total liabilities is calculated'},
      {label:'Monthly debt payments',val:M(totM),sub:'per month',info:function(){self.openCalc('monthly');},infoAria:'How monthly payments are calculated'},
      {label:'Estimated debt-free',val:last?(MON[last.po.date.getMonth()]+' '+last.po.date.getFullYear()):'—',sub:'Estimate · excludes items without a payment',info:function(){self.openCalc('debtfree');},infoAria:'How the debt-free date is estimated'}],
      rows:c.L.slice().sort(function(a,x){return x.bu-a.bu;}).map(function(l){var hasBar=!!(l.original&&l.original>=l.balance);var paid=hasBar?(1-l.balance/l.original)*100:0;
        return {name:l.name,icon:ltypeOf(l.type).icon,type:ltypeOf(l.type).l,rate:l.rate!=null?self.pct(l.rate,1)+' interest':'No rate set',monthly:l.monthly?self.money(l.monthly,l.cur)+'/mo':'No monthly payment',val:M(l.bu),orig:l.cur===b?'':self.money(l.balance,l.cur),
          payoff:l.po.ok?('Payoff ≈ '+MON[l.po.date.getMonth()]+' '+l.po.date.getFullYear()):'No payoff estimate',hasBar:hasBar,noBar:!hasBar,paid:paid.toFixed(1),paidN:Math.round(paid),paidTxt:self.pct(paid,0)+' paid of '+self.money(l.original||0,l.cur),barAria:'Paid off '+Math.round(paid)+' percent',
          noBarTxt:l.type==='card'?'Revolving balance — no payoff bar':'Add the original amount to see payoff progress',
          open:function(){self.setState({screen:'liability',lid:l.id});}};})};
    var L1=c.L.filter(function(l){return l.id===s.lid;})[0]||c.L[0], ld={};
    if(L1){var hb=!!(L1.original&&L1.original>=L1.balance), pd1=hb?(1-L1.balance/L1.original)*100:0;
      ld={name:L1.name,icon:ltypeOf(L1.type).icon,type:ltypeOf(L1.type).l+' · '+L1.cur,val:M(L1.bu),orig:L1.cur===b?'':self.money(L1.balance,L1.cur),hasBar:hb,paid:pd1.toFixed(1),paidTxt:self.pct(pd1,0)+' paid of '+self.money(L1.original||0,L1.cur),
        payoffDate:L1.po.ok?(MON[L1.po.date.getMonth()]+' '+L1.po.date.getFullYear()):'Can’t estimate',payoffSub:L1.po.ok?('About '+L1.po.months+' monthly payments left'):L1.po.reason,
        fields:[{k:'Interest rate',v:L1.rate!=null?self.pct(L1.rate,2):'—'},{k:'Monthly payment',v:L1.monthly?self.money(L1.monthly,L1.cur):'—'},{k:'Months remaining',v:L1.po.ok?nf(L1.po.n,1,s.numFmt):'—'},{k:'Interest still to pay (est.)',v:L1.po.ok?self.money(L1.po.interest,L1.cur):'—'},{k:'Last updated',v:self.fmtDate(L1.date)}],
        info:function(){self.openCalc('l:'+L1.id);},edit:function(){self.openEditL(L1.id);},back:function(){self.go('liabilities');},del:function(){self.setState({sheet:'del',delTarget:{kind:'liability',id:L1.id,name:L1.name}});}};}

    // FIRE
    var f=s.fire, setF=function(k){return function(e){var v=e.target.value;self.setState(function(st){var nf2=Object.assign({},st.fire);nf2[k]=v;var ed=st.asmEdited;if(['infl','ret','swr'].indexOf(k)>=0){ed=Object.assign({},ed);ed[k]=TODAY_ISO;}return {fire:nf2,asmEdited:ed};});};};
    var expDisp=f.exp, ageN=n0(f.age), tgtN=n0(f.target), expN=n0(f.exp);
    var inErr=ageN===null||tgtN===null||tgtN<=ageN||expN===null||expN<0;
    var contrib=s.canOpen?c.canU:c.need, faC=c.fireAge(contrib);
    var ch=this.fireChart(c,contrib,faC);
    var fa2=c.fireAge(c.canU);
    var fire={age:f.age,target:f.target,exp:expDisp,can:f.can,base:b,setAge:setF('age'),setTarget:setF('target'),setExp:setF('exp'),setCan:setF('can'),
      ageCls:'input big'+(ageN===null?' bad':''),tgtCls:'input big'+(tgtN===null||(ageN!==null&&tgtN<=ageN)?' bad':''),expCls:'input big'+(expN===null||expN<0?' bad':''),
      inErr:inErr,inErrTxt:tgtN!==null&&ageN!==null&&tgtN<=ageN?'Target retirement age must be later than your current age.':'Enter your age, target age and monthly expenses (0 or more).',
      asms:[['infl','Inflation','% a year','Prices rise by this much each year, so your FIRE number grows with it.'],['ret','Expected investment return','% a year','Nominal (before inflation). Used to grow your portfolio and monthly investments.'],['swr','Safe withdrawal rate','%','A common rule of thumb from US market history; a lower rate is more cautious.']].map(function(a){
        return {id:'fa-'+a[0],name:a[1],unit:a[2],note:a[3],val:f[a[0]],set:setF(a[0]),changed:n0(f[a[0]])!==DEF[a[0]],reset:function(){self.setState(function(st){var x=Object.assign({},st.fire);x[a[0]]=String(DEF[a[0]]);return {fire:x};});}};}),
      fpEq:M(c.fireA)+' − '+M(c.nonMort)+' = '+M(c.fireP),
      whichOpen:s.whichOpen,whichLabel:s.whichOpen?'Hide which assets count':'Choose which assets count',toggleWhich:function(){self.setState({whichOpen:!s.whichOpen});},
      which:c.H.map(function(h){return {name:h.name,val:M(h.cu),on:h.fire,toggle:function(){self.setData(function(dd){dd.holdings.forEach(function(x){if(x.id===h.id) x.fire=!x.fire;});});}};}),
      results:[
        {label:'FIRE number (today’s money)',val:M(c.fn),plain:'Monthly expenses × 12 ÷ safe withdrawal rate',eq:M(c.expU)+' × 12 ÷ '+this.pct(c.swr*100)+' = '+M(c.fn),info:function(){self.openCalc('fireNum');},infoAria:'How the FIRE number is calculated',hasBar:false,hasNote:false,note:''},
        {label:'FIRE number at age '+c.tgt,val:'≈ '+M(c.fnF),plain:'Today’s FIRE number × (1 + inflation) ^ years',eq:nf(c.fn,0,s.numFmt)+' × '+nf(1+c.infl,2,'en')+'^'+c.yrs+' ≈ '+M(c.fnF),info:function(){self.openCalc('fireFut');},infoAria:'How the future FIRE number is calculated',hasBar:false,hasNote:true,note:'Inflation-adjusted to the year you retire.'},
        {label:'Progress',val:this.pct(c.prog),plain:'FIRE portfolio ÷ FIRE number (today)',eq:M(c.fireP)+' ÷ '+M(c.fn)+' = '+this.pct(c.prog),info:function(){self.openCalc('prog');},infoAria:'How progress is calculated',hasBar:true,bar:Math.max(0,Math.min(100,c.prog)).toFixed(1),hasNote:false,note:''},
        {label:'Monthly investment needed to FIRE by '+c.tgt,val:'≈ '+M(c.need),plain:'Fills the gap after today’s portfolio grows at '+this.pct(c.ret*100)+' a year',eq:'Portfolio at '+c.tgt+' ≈ '+M(c.grow)+' · gap ≈ '+M(Math.max(0,c.fnF-c.grow)),info:function(){self.openCalc('need');},infoAria:'How the monthly investment is calculated',hasBar:false,hasNote:true,note:'The rest comes from monthly investing at '+this.pct(c.ret*100)+'.'}
      ],
      canOpen:s.canOpen,canChev:s.canOpen?IC.chevU:IC.chevD,toggleCan:function(){self.setState({canOpen:!s.canOpen});},canAge:fa2?'≈ '+nf(fa2,1,s.numFmt):'Not before 100',
      ret:this.pct(c.ret*100),infl:this.pct(c.infl*100),info:{fireP:function(){self.openCalc('fireP');},fireAge:function(){self.openCalc('fireAge');}},
      goAsm:function(){self.go('assumptions');},
      isChart:s.fireView==='chart',isTable:s.fireView==='table',chartCls:s.fireView==='chart'?'on':'',tableCls:s.fireView==='table'?'on':'',showChart:function(){self.setState({fireView:'chart'});},showTable:function(){self.setState({fireView:'table'});},
      chartSub:'Age '+c.age+' to 70 · investing '+M(contrib)+'/month'+(s.canOpen?' (your amount)':' (amount needed)')};
    Object.assign(fire,ch);

    // assumptions
    var setRate=function(k){return function(e){var v=n0(e.target.value);if(v===null||v<=0)return;self.setData(function(dd){dd.rates[k]={rate:v*c.bR,date:TODAY_ISO};});};};
    // One list of FX rates (each shown as "1 base = x currency"), shared by Settings and All assumptions.
    var defRel=function(k){var top=k==='USD'?1:DEF[k], bot=b==='USD'?1:DEF[b]; return top&&bot?top/bot:null;};
    var fxRows=Object.keys(d.rates).filter(function(k){return k!==b;}).sort().concat(b!=='USD'?['USD']:[]).map(function(k){
      var rel=(k==='USD'?1:d.rates[k].rate)/c.bR, dt=k==='USD'?(d.rates[b]?d.rates[b].date:TODAY_ISO):d.rates[k].date, dr=defRel(k);
      return {code:k,name:CURNAME[k]||'',val:String(+rel.toFixed(4)),date:self.fmtDate(dt),stale:daysAgo(dt)>=s.staleDays,tag:d.demo?'Dummy rate':'Entered by you',
        defTxt:dr?nf(dr,4,'en'):'—',isDefault:!dr||Math.abs(rel-dr)<1e-9*Math.max(1,dr),
        set:k==='USD'?function(e){var v=n0(e.target.value);if(v===null||v<=0)return;self.setBaseUsd(v);}:setRate(k),
        reset:function(){if(!dr)return; if(k==='USD') self.setBaseUsd(dr); else self.setData(function(dd){dd.rates[k]={rate:dr*c.bR,date:TODAY_ISO};});}};});
    var asmRows=[
      {id:'as-infl',name:'Inflation',tag:'Assumption',tagCls:'tag asm',val:f.infl,unit:'% a year',step:'0.1',used:'FIRE number at retirement, projection chart, FIRE age',edited:this.fmtDate(s.asmEdited.infl),def:'3.0%',isDefault:n0(f.infl)===DEF.infl,set:setF('infl'),reset:function(){self.setState(function(st){return {fire:Object.assign({},st.fire,{infl:'3'})};});}},
      {id:'as-ret',name:'Expected investment return (nominal)',tag:'Assumption',tagCls:'tag asm',val:f.ret,unit:'% a year',step:'0.1',used:'Portfolio growth, monthly investment needed, FIRE age',edited:this.fmtDate(s.asmEdited.ret),def:'7.0%',isDefault:n0(f.ret)===DEF.ret,set:setF('ret'),reset:function(){self.setState(function(st){return {fire:Object.assign({},st.fire,{ret:'7'})};});}},
      {id:'as-swr',name:'Safe withdrawal rate',tag:'Assumption',tagCls:'tag asm',val:f.swr,unit:'%',step:'0.1',used:'FIRE number, progress',edited:this.fmtDate(s.asmEdited.swr),def:'4.0%',isDefault:n0(f.swr)===DEF.swr,set:setF('swr'),reset:function(){self.setState(function(st){return {fire:Object.assign({},st.fire,{swr:'4'})};});}},
      {id:'as-stale',name:'Mark as stale after',tag:'Assumption',tagCls:'tag asm',val:String(s.staleDays),unit:'days',step:'1',used:'Needs updating list, Stale tags',edited:this.fmtDate(s.asmEdited.stale),def:'90 days',isDefault:s.staleDays===DEF.stale,set:function(e){var v=parseInt(e.target.value,10);if(v>0)self.setState({staleDays:v,asmEdited:Object.assign({},s.asmEdited,{stale:TODAY_ISO})});},reset:function(){self.setState({staleDays:90});}}
    ].concat(fxRows.map(function(r){return {id:'as-fx-'+r.code,name:'FX rate: 1 '+b+' in '+r.code,tag:r.tag,tagCls:'tag line',val:r.val,unit:r.code,step:'0.0001',used:'Every '+r.code+' holding and liability, all totals',edited:r.date,def:r.defTxt,isDefault:r.isDefault,set:r.set,reset:r.reset};}));
    var asm={rows:asmRows,back:function(){self.go(s.prevScreen||'fire');},backLabel:s.prevScreen==='settings'?'Settings':'FIRE plan'};

    // settings
    var tp=s.themePref;
    var set={base:b,baseErr:!!s.baseErr,baseErrTxt:s.baseErr,popular:POPULAR.map(function(x){return {code:x[0],name:x[1]};}),all:ALLCUR.map(function(x){return {code:x[0],name:x[1]};}),
      setBase:function(e){var v=e.target.value; if(v==='USD'||d.rates[v]) self.setState({base:v,baseErr:'',form:Object.assign({},s.form,{cur:v})}); else self.setState({baseErr:'Add an FX rate for '+v+' first (add a holding in '+v+', or enter its rate), then switch.'});},
      numFmt:s.numFmt,dateFmt:s.dateFmt,setNum:function(e){self.setState({numFmt:e.target.value});},setDate:function(e){self.setState({dateFmt:e.target.value});},
      themes:[['light','Light'],['dark','Dark'],['system','System']].map(function(t){return {l:t[1],on:tp===t[0],cls:tp===t[0]?'on':'',pick:function(){self.setState({themePref:t[0]});}};}),
      fx:fxRows.map(function(r){return Object.assign({id:'fx-'+r.code},r);}),
      noFx:fxRows.length===0,goAsm:function(){self.go('assumptions');},
      counts:[{n:d.holdings.length,l:'holdings'},{n:d.liabilities.length,l:'liabilities'},{n:sumBy(d.holdings,function(h){return h.history.length;}),l:'value entries'},{n:'≈ '+Math.max(1,Math.round(JSON.stringify(d).length/1024))+' KB',l:'storage used'}],
      persisted:s.persisted,persist:function(){self.requestPersist();},persistTxt:s.persisted?'Protected — persistent storage granted':'Not requested yet — the browser may clear data when space runs low',persistCls:s.persisted?'tag cy':'tag amber',
      todayIso:TODAY_ISO,csv:s.csv,setCsv:function(e){self.setState({csv:e.target.value});},dlCsv:function(){self.downloadCsv();},
      restore:function(){self.pickBackup();},reminder:s.reminder,setReminder:function(e){self.setState({reminder:e.target.value});},
      lastTxt:s.lastBackup?self.fmtDate(s.lastBackup)+(backupOld?' · over 30 days':''):'Never — no backup yet',lastCls:'chip '+(backupOld?'amber':'ok'),
      erase:function(){self.setState({sheet:'erase',eraseVal:''});}};

    // sheet
    var sheetTitle={calc:'How is this calculated?',restore:'Restore preview',erase:'Erase all data',del:'Delete '+(s.delTarget&&s.delTarget.kind==='liability'?'liability':'holding')}[s.sheet]||'';
    var F=s.form, isAsset=F.kind==='asset';
    if(s.sheet==='form') sheetTitle=F.mode==='edit'?(isAsset?'Edit holding':'Edit liability'):(s.picker?'Choose currency':'Quick add');
    var sheet={open:!!s.sheet,close:function(){self.setState({sheet:null,picker:false});},title:sheetTitle,isCalc:s.sheet==='calc',isForm:s.sheet==='form',isRestore:s.sheet==='restore'&&!!s.pending,isErase:s.sheet==='erase',isDel:s.sheet==='del'&&!!s.delTarget};
    var calc=s.sheet==='calc'?this.calcPanel(s.calcKey,c):{title:'',plain:'',sub:'',inputs:[],hasNote:false,note:'',editLabel:'',edit:function(){}};
    if(s.sheet==='calc') sheet.title=calc.title;

    // form
    var E=F.tried?this.formErrors(F):{}, t=typeOf(F.type), fi=n0(F.invested), fc=n0(F.current);
    var hasRate=F.cur==='USD'||!!d.rates[F.cur]; var full=F.mode==='edit';
    var curRow=CURALL.filter(function(x){return x[0]===F.cur;})[0]||[F.cur,F.cur,F.cur.slice(0,2)];
    var sf=function(k){return function(e){var p={};p[k]=e.target.value;self.setForm(p);};};
    var q=(s.search||'').trim().toLowerCase();
    var mk=function(x){var on=x[0]===F.cur;return {code:x[0],name:x[1],flag:x[2],on:on,cls:'pick'+(on?' on':''),pick:function(){self.setState({picker:false,search:'',form:Object.assign({},s.form,{cur:x[0]})});}};};
    var match=function(x){return !q||x[0].toLowerCase().indexOf(q)>=0||x[1].toLowerCase().indexOf(q)>=0;};
    var allList=(q?CURALL:ALLCUR).filter(match).map(mk);
    var live=null; if(fi!==null&&fc!==null&&fi>=0&&fc>=0){var gg=fc-fi, gp=fi>0?gg/fi*100:0, g3=this.gi(gg); live={cls:g3.cls,arrow:g3.arrow,txt:this.smoney(gg,F.cur)+(fi>0?' ('+this.pct(gp,1,true)+')':'')};}
    var qa={showTabs:false,isType:s.qaTab==='type',isShot:s.qaTab==='shot',tabTypeCls:s.qaTab==='type'?'on':'',tabShotCls:s.qaTab==='shot'?'on':'',
      tabType:function(){self.setState({qaTab:'type',shot:'idle'});},tabShot:function(){self.setState({qaTab:'shot'});},
      showForm:!s.picker,showPicker:s.picker,showShot:false,
      showKind:F.mode!=='edit',isAsset:isAsset,isLiab:!isAsset,assetCls:isAsset?'on':'',liabCls:isAsset?'':'on',setAsset:function(){self.setForm({kind:'asset',tried:false});},setLiab:function(){self.setForm({kind:'liability',tried:false});},
      f:F,e:E,full:full,compact:!full,types:TYPES,subs:t.subs,ltypes:LTYPES,base:b,
      setType:function(e){var nt=typeOf(e.target.value);self.setForm({type:nt.k,sub:nt.subs[0],fire:!(nt.k==='re'&&nt.subs[0]==='Home I live in')});},
      setSub:function(e){var v=e.target.value;self.setForm({sub:v,fire:!(F.type==='re'&&v==='Home I live in')});},
      setLtype:function(e){var lt=ltypeOf(e.target.value);self.setForm({ltype:lt.k,name:F.name||''});},
      setName:sf('name'),setInv:sf('invested'),setCurV:sf('current'),setDateF:sf('date'),setNotes:sf('notes'),setBal:sf('balance'),setRate:sf('rate'),setMonthly:sf('monthly'),setOriginal:sf('original'),setFx:sf('fx'),
      toggleFire:function(){self.setForm({fire:!F.fire});},
      curFlag:curRow[2],curName:curRow[1],needRate:!hasRate,
      nameCls:'input'+(E.name?' bad':''),invCls:'input'+(E.invested?' bad':''),curCls:'input'+(E.current?' bad':''),balCls:'input'+(E.balance?' bad':''),lrCls:'input'+(E.rate?' bad':''),lmCls:'input'+(E.monthly?' bad':''),rateCls:'input'+(E.fx?' bad':''),
      hasLive:isAsset&&!!live,live:live||{cls:'',arrow:'',txt:''},
      fireHint:'Counts toward FIRE: '+(F.fire?'Yes':'No')+' (default for '+t.l+(F.type==='re'?' · '+F.sub:'')+'). Change it later on the holding.',
      canAnother:F.mode!=='edit',canDelete:F.mode==='edit',del:function(){self.setState({sheet:'del',delTarget:{kind:F.kind,id:F.id,name:F.name||'this item'}});},saveLabel:F.mode==='edit'?'Save changes':'Save',save:function(){self.saveForm(false);},saveAnother:function(){self.saveForm(true);},
      openPicker:function(){self.setState({picker:true,search:''});},closePicker:function(){self.setState({picker:false});},search:s.search,setSearch:function(e){self.setState({search:e.target.value});},
      showPopular:!q,popular:POPULAR.map(mk),allCur:allList,noMatch:q&&allList.length===0};

    var rs={isReplace:s.restoreMode==='replace',isMerge:s.restoreMode==='merge',replaceCls:s.restoreMode==='replace'?'on':'',mergeCls:s.restoreMode==='merge'?'on':'',
      setReplace:function(){self.setState({restoreMode:'replace'});},setMerge:function(){self.setState({restoreMode:'merge'});},
      note:s.restoreMode==='replace'?'Everything on this device is replaced with the backup.':'Backup entries are added; holdings with the same ID are updated from the backup.',
      confirmLabel:s.restoreMode==='replace'?'Replace all':'Merge',
      confirm:function(){self.applyRestore();}};
    var pd2=s.pending;
    if(pd2){ rs.fileName=pd2.name; rs.madeTxt=pd2.made?'Backup made '+self.fmtDate(pd2.made):'Backup date not recorded';
      rs.counts=[{n:pd2.data.holdings.length,l:'holdings'},{n:pd2.data.liabilities.length,l:'liabilities'},{n:Object.keys(pd2.data.rates).length,l:'FX rates'},{n:sumBy(pd2.data.holdings,function(h){return h.history.length;}),l:'value entries'}];
      rs.baseTxt='Base currency in backup: '+pd2.settings.base+(pd2.data.demo?' · contains demo data':''); }
    var del={txt:s.delTarget?('“'+s.delTarget.name+'” will be removed from this device, with its value history. Totals update straight away. This can’t be undone unless you restore a backup.'):'',confirm:function(){self.deleteItem();}};
    var er={val:s.eraseVal,set:function(e){self.setState({eraseVal:e.target.value});},disabled:s.eraseVal!=='DELETE',summary:d.holdings.length+' holdings, '+d.liabilities.length+' liabilities, '+Object.keys(d.rates).length+' FX rates and your settings',
      confirm:function(){if(s.eraseVal!=='DELETE')return;self.setState(Object.assign(defaultSettings(),{sheet:null,data:emptyData(),screen:'dashboard',eraseVal:'',persisted:s.persisted,form:blankForm('asset',DEFAULT_BASE)}));self.flash('All data erased from this device');}};

    return {appClass:'app '+theme,ic:IC,nav:nav,hdr:hdr,is:is,showEmpty:showEmpty,empty:empty,doBackup:doBackup,dash:dash,hold:hold,hd:hd,liab:liab,ld:ld,fire:fire,asm:asm,set:set,sheet:sheet,calc:calc,qa:qa,rs:rs,er:er,del:del,
      toast:{show:!!s.toast,text:s.toast||''}};
  }

  spark(vals,w,h,pad){
    if(!vals.length) return {line:'',area:''};
    var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rg=mx-mn||1,n=vals.length;
    var pts=vals.map(function(v,i){return [n===1?w/2:i*(w/(n-1)),h-pad-(v-mn)/rg*(h-pad*2)];});
    var line='M'+pts.map(function(p){return p[0].toFixed(1)+' '+p[1].toFixed(1);}).join(' L');
    return {line:line,area:line+' L'+w+' '+h+' L0 '+h+' Z'};
  }
  arc(cx,cy,r,a0,a1,fr){
    if(fr>=0.999) return 'M'+(cx-r)+' '+cy+' a'+r+' '+r+' 0 1 0 '+(2*r)+' 0 a'+r+' '+r+' 0 1 0 '+(-2*r)+' 0';
    if(a1<=a0) a1=a0+0.001;
    var x0=cx+r*Math.cos(a0),y0=cy+r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1);
    return 'M'+x0.toFixed(2)+' '+y0.toFixed(2)+' A'+r+' '+r+' 0 '+(a1-a0>Math.PI?1:0)+' 1 '+x1.toFixed(2)+' '+y1.toFixed(2);
  }
  fireChart(c,contrib,fa){
    var self=this, a0=c.age, a1=Math.max(70,a0+5), L=64, R=628, T=16, B=240, ages=[];
    for(var a=a0;a<=a1;a++) ages.push(a);
    var port=ages.map(function(a){return c.portAt((a-a0)*12,contrib);}), tg=ages.map(function(a){return c.tgtAt((a-a0)*12);});
    var mx=Math.max(Math.max.apply(null,tg),Math.min(Math.max.apply(null,port),Math.max.apply(null,tg)*1.6))*1.05||1;
    var X=function(a){return L+(a-a0)/(a1-a0)*(R-L);}, Y=function(v){return B-Math.min(v,mx)/mx*(B-T);};
    var path=function(arr){return 'M'+arr.map(function(v,i){return X(ages[i]).toFixed(1)+' '+Y(v).toFixed(1);}).join(' L');};
    var pp=path(port), step=Math.pow(10,Math.floor(Math.log10(mx/4))), nice=Math.ceil(mx/4/step)*step;
    var yt=[]; for(var v=0;v<=mx;v+=nice) yt.push({y:Y(v).toFixed(1),ty:(Y(v)+4).toFixed(1),l:self.compact(v*c.bR)});
    var xt=[]; for(var a2=Math.ceil(a0/5)*5;a2<=a1;a2+=5) xt.push({x:X(a2).toFixed(1),l:String(a2)});
    var out={yt:yt,xt:xt,tgtPath:path(tg),portPath:pp,area:pp+' L'+X(a1).toFixed(1)+' '+B+' L'+L+' '+B+' Z',hasCross:!!fa&&fa<=a1,
      chartSR:'Projected portfolio versus FIRE target from age '+a0+' to '+a1+(fa?'; they cross at about age '+nf(fa,1,'en'):'; no crossover before '+a1),
      rows:ages.map(function(a,i){var ok=port[i]>=tg[i];return {age:a,tgt:c.M(tg[i]),port:c.M(port[i]),status:ok?'FIRE reached':'Gap '+c.M(tg[i]-port[i]),cls:ok?'tag cy':'muted'};})};
    if(out.hasCross){var cv=c.tgtAt((fa-a0)*12);out.cx=X(fa).toFixed(1);out.cy=Y(cv).toFixed(1);var right=X(fa)>(L+R)/2;out.lx=(X(fa)+(right?-14:14)).toFixed(1);out.ly=(Y(cv)-14).toFixed(1);out.lanchor=right?'end':'start';out.crossLabel='FIRE at '+nf(fa,1,'en')+' · '+c.M(cv);}
    else {out.cx=0;out.cy=0;out.lx=0;out.ly=0;out.lanchor='start';out.crossLabel='';}
    return out;
  }
  compact(v){ var s=this.state.base, p=SYM[s]!==undefined?SYM[s]:s+' '; if(v>=1e6) return p+(v/1e6).toFixed(v>=1e7?0:1)+'M'; if(v>=1e3) return p+Math.round(v/1e3)+'k'; return p+Math.round(v); }
}
window.FinWinApp = Component;
