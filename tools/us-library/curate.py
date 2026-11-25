import json,re,collections
d=json.load(open('raw.json'))
OK=re.compile(r"kenvue|procter|colgate|unilever|conopco|church|henkel|chattem|tom'?s of maine|toms of maine|haleon|glaxo|suave brands|evermark|revlon|thriving|lume|kramer|johnson|neutrogena|galderma|hello products|edgewell|sunstar|ultradent",re.I)
BAD=re.compile(r"navajo|7venz|skinsalvation|do not use|manufactura",re.I)
def gs1(x):
    s=sum(int(c)*(3 if i%2==0 else 1) for i,c in enumerate(reversed(x[:-1])))
    return (10-s%10)%10==int(x[-1])
SKIP=re.compile(r"sanitiz|sunscreen|\bspf\b|lip |lotion|cream|wipe|acne|foot|ointment|serum|first aid|cold sore|pain|eczema|moisturiz|face|baby|sunblock|hand sanit",re.I)
def cat(r):
    inl=(r['inactive'] or '').lower()[:400]
    nm=(r['brand']+' '+(r['spl'] or '')[:90]).lower()
    t=(nm+' '+r['title']+' '+r['purpose']).lower()
    if SKIP.search(r['brand']): return None
    if re.search(r"antiperspirant|deodorant",nm) or re.search(r"antiperspirant",r['purpose'].lower()): return 'deodorant'
    if re.search(r"shampoo|dandruff|2 ?in ?1|conditioner|scalp",nm): return 'shampoo'
    if re.search(r"body wash|bodywash|shower gel",nm): return 'bodywash'
    if re.search(r"\bsoap\b|\bbar\b|hand wash|handwash",nm) or re.search(r"^\W*soap\b|sodium palmate|sodium tallowate",inl): return 'soap'
    oral=re.search(r"crest|colgate|scope|listerine|act\b|sensodyne|aquafresh|tom'?s|parodontax|arm and hammer|hello|therabreath|closys|pepsodent|phos-flur|dental|tooth|oral|mouth",t)
    if not oral: return None
    if re.search(r"toothpaste|tooth paste|dentifrice|crest plus scope|crest \+ scope|2in1 whitening",nm) or re.search(r"hydrated silica|calcium carbonate|dicalcium phosphate",inl): return 'toothpaste'
    if re.search(r"rinse|mouthwash|mouth wash|antiseptic|antigingivitis|anticavity|alcohol free|zero alcohol",t): return 'mouthwash'
    return None
def clean_inactive(s):
    s=re.sub(r"^\s*(drug facts.*?)?inactive ingredients?\s*[:\-]?\s*","",s,flags=re.I)
    s=re.split(r"\b(questions|other information|directions|warnings|distributed by|keep out)\b",s,flags=re.I)[0]
    s=re.sub(r"\s+"," ",s).strip(" .;")
    return s
def spl_name(r):
    toks=(r['spl'] or '').split()
    out=[]
    for i,t in enumerate(toks):
        w=re.sub(r"[^A-Za-z]","",t)
        if len(w)>=4 and w.isupper() and i+1<len(toks) and re.sub(r"[^A-Za-z]","",toks[i+1]).isupper(): break
        out.append(t)
    n=' '.join(out)
    g=(r.get('generic') or '')
    if g:
        gi=n.lower().find(g.lower()[:12])
        if gi>0: n=n[:gi]
    return n.strip(' ,')
def tc(s):
    return s if not s.isupper() else s.title()
prods={}; reasons=collections.Counter()
for rid,r in d.items():
    if BAD.search(r['mfr']) or not OK.search(r['mfr']): reasons['mfr']+=1; continue
    c=cat(r)
    if not c: reasons['cat']+=1; continue
    inact=clean_inactive(r['inactive'] or '')
    if len(inact)<10: reasons['noinact']+=1; continue
    upcs=[]
    for u in r['upc']:
        u=re.sub(r"\D","",u)
        if len(u)==13 and u[0]=='0': u=u[1:]
        if len(u)==12 and gs1(u): upcs.append(u)
    if not upcs: reasons['upc']+=1; continue
    act=', '.join(x.strip().title() for x in re.split(r",| and ",r.get('generic') or '') if x.strip())
    key=r['set_id']
    nm=r['brand'].strip()
    if len(nm.split())<=2:
        sn=spl_name(r)
        if len(sn)>len(nm) and sn.lower().startswith(nm.split()[0].lower()): nm=sn
    p={'name':tc(nm),'brand':tc(r['brand'].split()[0]),'mfr':r['mfr'],'cat':c,'upcs':upcs,'active':act,'inactive':inact,'activeText':re.sub(r"\s+"," ",r['active'] or '')[:300],
       'src':'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid='+key,'srcName':'DailyMed (FDA drug label)','labelDate':r['eff'],'checked':'2026-11-25','setid':key}
    if key in prods and prods[key]['labelDate']>=p['labelDate']: continue
    prods[key]=p
# UPC uniqueness: newest label wins
by={}
for p in sorted(prods.values(),key=lambda p:p['labelDate']):
    for u in p['upcs']: by[u]=p
for p in prods.values(): p['upcs']=[u for u in p['upcs'] if by[u] is p]
L=[p for p in prods.values() if p['upcs']]
print(reasons, len(L), collections.Counter(p['cat'] for p in L))
json.dump(sorted(L,key=lambda p:(p['cat'],p['name'])),open('curated.json','w'),indent=1)
for p in sorted(L,key=lambda p:(p['cat'],p['name'])): print(p['cat'],'|',p['name'][:70],'|',','.join(p['upcs']),'|',p['inactive'][:50])
