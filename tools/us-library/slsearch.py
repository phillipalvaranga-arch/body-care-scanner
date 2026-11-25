import json,urllib.request,urllib.parse,time,sys,re
brands=sys.argv[1:]
out=json.load(open('sl_cands.json')) if __import__('os').path.exists('sl_cands.json') else {}
for b in brands:
    page=1
    while True:
        u="https://api.smartlabel.org/api/search?"+urllib.parse.urlencode({'perPage':250,'page':page,'product':b})
        try: d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=60))['data']
        except Exception as e: print(b,'ERR',e); break
        for r in d['data']:
            out[r['url']]={k:r.get(k) for k in ('company_name','brand','subbrand','common','upc','url','updated_at')}
        print(b,'page',page,'of',d['last_page'],'total',d['total'],flush=True)
        if page>=d['last_page'] or page>=6: break
        page+=1; time.sleep(1)
    time.sleep(1)
json.dump(out,open('sl_cands.json','w'))
print(len(out))
