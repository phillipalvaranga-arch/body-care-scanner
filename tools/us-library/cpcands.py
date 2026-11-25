import json,urllib.request,urllib.parse,time
codes={}
for host in ['world.openbeautyfacts.org','world.openfoodfacts.org','world.openproductsfacts.org']:
    for b in ['colgate','irish-spring','softsoap','speed-stick','lady-speed-stick','palmolive','tom-s-of-maine','hello','colgate-palmolive']:
        u=f"https://{host}/api/v2/search?"+urllib.parse.urlencode({'brands_tags':b,'countries_tags':'en:united-states','page_size':200,'fields':'code,product_name,brands'})
        try: d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'BodyCareScanner/1.0'}),timeout=60))
        except Exception as e: print(host,b,'ERR',e); continue
        for p in d.get('products',[]):
            c=p.get('code','')
            if len(c)==13 and c[0]=='0': c=c[1:]
            if len(c)==12: codes[c]=(p.get('brands'),p.get('product_name'))
        print(host,b,d.get('count'),flush=True); time.sleep(1.5)
for l in open('/tmp/upcs.txt'):
    u=l.strip().split('|')[2]; codes.setdefault(u,('test',l.strip()))
json.dump(codes,open('cp_cands.json','w'),indent=0); print(len(codes))
