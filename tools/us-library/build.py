import json,re,collections
CHK="2026-11-25"
def gs1(x):
    s=sum(int(c)*(3 if i%2==0 else 1) for i,c in enumerate(reversed(x[:-1]))); return (10-s%10)%10==int(x[-1])
def act_name(s):
    s=re.split(r'\bPurpose\b',s,flags=re.I)[0]
    s=re.sub(r'\([^()]*(\([^()]*\))?[^()]*\)','',s)
    s=re.sub(r'\d+(\.\d+)?\s*%.*$','',s)
    return s.strip(' ,;:.')
DESC=re.compile(r'^(helps|provides|an ingredient|a ingredient|dissolves|used to|keeps|adds|this )',re.I)
def ing_lines(lines):
    out=[]
    for l in lines:
        if ' ' not in l and len(l)>25: l=re.sub(r'(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])',' ',l)
        if DESC.match(l) or (len(l.split())>9 and re.search(r'\b(the|and|to|helps|provides|is|for|your|this)\b',l)): continue
        out.append(l.strip(' ,.'))
    return out
def ddate(s):
    m=re.match(r'(\d{4})-(\d\d)-(\d\d)',s)
    if m: return s[:10]
    m=re.match(r'(\d\d)/(\d\d)/(\d{4})',s)
    if m: return f"{m.group(3)}-{m.group(1)}-{m.group(2)}"
    m=re.match(r'(\d{8})$',s)
    if m: return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return s
CATMAP={'conditioner':'hair'}
lib={}  # upc -> entry
# 1) SmartLabel (maker pages)
for l in open('scraped.jsonl'):
    r=json.loads(l)
    if r.get('err') or not r.get('ok'): continue
    if re.search(r'two[- ]step|2[- ]step|\bkit\b|pack of|\bduo\b|\btwin\b|variety',r['name'],re.I): continue
    acts=[act_name(a) for a in r.get('active',[]) if act_name(a)]
    rest=ing_lines(r.get('inactive',[]) or [])+ing_lines(r.get('ingredients',[]) or [])
    if len(rest)<3: continue
    host=r['url'].split('/')[2].lower()
    pg='pg.com' in host
    u=r['upc']
    if not gs1(u): continue
    e={'u':u,'n':r['name'],'b':r['brand'],'c':CATMAP.get(r['cat'],r['cat']),'i':', '.join(acts+rest),'a':'; '.join(r.get('active',[])),
       's':r['url'].replace('SmartLabel.pg.com','smartlabel.pg.com'),'sn':'Procter & Gamble SmartLabel (smartlabel.pg.com)' if pg else 'Colgate-Palmolive SmartLabel (colgatepalmolive.com)',
       'd':ddate(r.get('updated','')),'k':CHK}
    lib[u]=e
TYPES=[('mouthwash',r'mouthwash|mouth rinse|oral rinse|\brinse\b'),('toothpaste',r'toothpaste|tooth paste'),('deodorant',r'deodorant|antiperspirant'),('bodywash',r'body wash|shower gel'),('soap',r'soap'),('hair',r'conditioner'),('shampoo',r'shampoo'),('lotion',r'lotion')]
for l in open('probed.jsonl'):
    r=json.loads(l)
    if r.get('err') or '404' in r.get('final','') : continue
    pg='pg.com' in r['url']
    if pg and not r.get('upcSeen'): continue
    name=max([x for x in r.get('title2',[]) if x not in ('Manage Cookies','Click to zoom') and not re.fullmatch(r'[\d ]+',x)] or [''],key=len)
    if not name: continue
    c=next((k for k,rx in TYPES if re.search(rx,name,re.I)),None)
    if not c: continue
    acts=[act_name(a) for a in r.get('active',[]) if act_name(a)]
    rest=ing_lines(r.get('inactive',[]) or [])+ing_lines(r.get('ingredients',[]) or [])
    if len(acts+rest)<2 or len(' '.join(rest).split())<4: continue
    u=r['upc']
    lib[u]={'u':u,'n':name,'b':name.split(' ')[0] if not name.startswith(('Irish Spring',"Tom's of Maine")) else ('Irish Spring' if name.startswith('Irish') else "Tom's of Maine"),'c':c,'i':', '.join(acts+rest),'a':'; '.join(r.get('active',[])),
       's':r['url'],'sn':'Procter & Gamble SmartLabel (smartlabel.pg.com)' if pg else 'Colgate-Palmolive SmartLabel (colgatepalmolive.com)','d':ddate(r.get('updated','')),'k':CHK}
    print('probed add',u,name)
n_sl=len(lib)
BR=[('old spice','Old Spice'),('head and shoulders','Head & Shoulders'),('head & shoulders','Head & Shoulders'),('lady speed stick','Lady Speed Stick'),('ladies speed stick','Lady Speed Stick'),('speed stick','Speed Stick'),('toms of maine',"Tom's of Maine"),("tom's of maine","Tom's of Maine"),('right guard','Right Guard'),('unlimited by degree','Degree'),('arm and hammer','Arm & Hammer'),('therabreath','TheraBreath'),('crest','Crest'),('scope','Scope'),('dove','Dove'),('degree','Degree'),('secret','Secret'),('gillette','Gillette'),('suave','Suave'),('axe','Axe'),('dial','Dial'),('lume','Lume'),('mitchum','Mitchum'),('listerine','Listerine'),('colgate','Colgate'),('neutrogena','Neutrogena'),('act','ACT'),('hello','hello'),('softsoap','Softsoap'),('safeguard','Safeguard'),('native','Native')]
def brand_of(n,b):
    l=n.lower()
    for k,v in BR:
        if l.startswith(k) or (' '+k+' ') in (' '+l+' '): return v
    return b
# 2) openFDA / DailyMed labels
for p in json.load(open('curated.json')):
    if re.search(r'\d{5}-\d{3}',p['inactive']) or len(re.split(r'[,•·;]',p['inactive']))<3: continue
    ing=', '.join([x for x in [p['active']] if x]+[p['inactive']])
    for u in p['upcs']:
        if u in lib: continue
        lib[u]={'u':u,'n':p['name'],'b':brand_of(p['name'],p['brand']),'c':p['cat'],'i':ing,'a':p['activeText'][:200],'s':p['src'],'sn':'FDA drug label on DailyMed (submitted by '+p['mfr']+')','d':ddate(p['labelDate']),'k':CHK}
print('smartlabel',n_sl,'total',len(lib))
print(collections.Counter(e['c'] for e in lib.values()))
print(collections.Counter(e['b'] for e in lib.values()).most_common(40))
# compact: ingredient table + source-name table
I=[];Ii={};S=[];Si={}
rows=[]
for e in sorted(lib.values(),key=lambda e:(e['c'],e['n'])):
    if e['i'] not in Ii: Ii[e['i']]=len(I); I.append(e['i'])
    if e['sn'] not in Si: Si[e['sn']]=len(S); S.append(e['sn'])
    rows.append([e['u'],e['n'],e['b'],e['c'],Ii[e['i']],e['a'],e['s'],Si[e['sn']],e['d']])
out={'checked':CHK,'note':'Ingredient lists copied from manufacturer SmartLabel pages and FDA drug labels (DailyMed). Each row: upc, name, brand, category, ingredient-list index, active ingredients text, source URL, source-name index, date the source says it was updated.','sources':S,'ing':I,'rows':rows}
s=json.dumps(out,separators=(',',':'),ensure_ascii=False)
open('us-products.json','w').write(s)
print('bytes',len(s),'unique lists',len(I))
