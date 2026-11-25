import json,urllib.request,urllib.parse,time,sys
Q=sys.argv[1:]
out=json.load(open('raw.json')) if __import__('os').path.exists('raw.json') else {}
for q in Q:
    skip=0
    while True:
        u="https://api.fda.gov/drug/label.json?"+urllib.parse.urlencode({'search':q,'limit':100,'skip':skip})
        try: d=json.load(urllib.request.urlopen(u,timeout=40))
        except Exception as e: print(q,'ERR',e); break
        rs=d.get('results',[])
        for r in rs:
            o=r.get('openfda',{})
            if not o.get('upc'): continue
            out[r['id']]={'q':q,'brand':o.get('brand_name',[''])[0],'mfr':o.get('manufacturer_name',[''])[0],'upc':o.get('upc'),'set_id':r.get('set_id'),'eff':r.get('effective_time'),
              'active':(r.get('active_ingredient') or [''])[0],'generic':o.get('generic_name',[''])[0],'subst':o.get('substance_name'),'inactive':(r.get('inactive_ingredient') or [''])[0],'purpose':(r.get('purpose') or [''])[0][:200],'route':o.get('route'),'ptype':o.get('product_type'),
              'title':(r.get('package_label_principal_display_panel') or [''])[0][:300],'spl':(r.get('spl_product_data_elements') or [''])[0][:200]}
        print(q,d['meta']['results']['total'],'got',len(rs))
        skip+=100
        if skip>=d['meta']['results']['total'] or skip>=900: break
        time.sleep(0.3)
    time.sleep(0.3)
json.dump(out,open('raw.json','w'))
print('records',len(out))
