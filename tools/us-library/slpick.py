import json,collections,re
d=json.load(open('sl_cands.json'))
def gs1(x):
    s=sum(int(c)*(3 if i%2==0 else 1) for i,c in enumerate(reversed(x[:-1]))); return (10-s%10)%10==int(x[-1])
TYPES=[('mouthwash',r'mouthwash|mouth rinse|oral rinse|\brinse\b'),('toothpaste',r'toothpaste|tooth paste'),('deodorant',r'deodorant|antiperspirant'),
 ('bodywash',r'body wash|shower gel|bodywash'),('soap',r'bar soap|soap bar|hand soap|liquid hand|beauty bar|\bsoap\b'),('conditioner',r'conditioner'),('shampoo',r'shampoo'),('lotion',r'body lotion|lotion')]
SKIP=r'pack of|refill.*pack|bundle|variety|gift|kit|travel|trial|sample|wipes|razor|blade|floss|brush|laundry|dish|detergent|whitening strips|\bstrips\b|denture|pet\b|face|facial|eye|serum|regenerist|cream|spray deodorant|dry spray|body spray'
picked={}
for v in d.values():
    if not re.search(r'P&G|Colgate',v['company_name']): continue
    name=v['common'] or ''; low=name.lower()
    if re.search(SKIP,low) and not re.search(r'deodorant|antiperspirant',low) : continue
    if re.search(r'pack of|bundle|variety|gift|twin pack|\d+ ?pk\b|\d+ pack|count|ct\b',low) and not re.search(r'bar soap|soap bar|bars',low): continue
    t=None
    for k,rx in TYPES:
        if re.search(rx,low): t=k; break
    if not t: continue
    u=re.sub(r'\D','',v['upc'] or '')
    m=re.search(r'(\d{11,14})(?:\.html)?/?$',v['url'])
    if len(u)==11: u='0'+u
    if len(u)!=12 or not gs1(u): continue
    base=re.sub(r',?\s*[\d.]+\s*(fl\.? ?oz|oz|ml|l|g|ct|count)\b.*$','',name,flags=re.I).strip(' ,-')
    key=(v['brand'],base.lower())
    picked.setdefault(key,[]).append({'upc':u,'name':name,'brand':v['brand'],'cat':t,'url':v['url'],'updated':v['updated_at']})
print(len(picked))
print(collections.Counter(x[0]['cat'] for x in picked.values()))
print(collections.Counter(x[0]['brand'] for x in picked.values()).most_common())
json.dump([{'base':k[1],'items':v} for k,v in picked.items()],open('sl_picked.json','w'),indent=0)
