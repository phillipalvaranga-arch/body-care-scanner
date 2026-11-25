import asyncio,json,re,sys
from playwright.async_api import async_playwright
sys.path.insert(0,'.')
from scrape_parse import parse
C=json.load(open('cp_cands.json'))
have=set(r[0] for r in json.load(open('us-products.json'))['rows'])
todo=[]
for u,(b,n) in C.items():
    if u in have: continue
    if u.startswith(('035000','074182','022200','077326','827854','076606')): todo.append((u,'https://www.colgatepalmolive.com/en-us/smartlabel/'+u.lstrip('0') if u[0]=='0' else 'https://www.colgatepalmolive.com/en-us/smartlabel/'+u,b,n))
    elif u.startswith(('037000','080878','012044','030772','041848')): todo.append((u,'https://smartlabel.pg.com/00'+u+'.html',b,n))
print(len(todo))
out=open('probed.jsonl','w')
async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch(); ctx=await br.new_context(user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")
        pg=await ctx.new_page()
        for u,url,b,n in todo:
            rec={'upc':u,'url':url,'obf':[b,n]}
            try:
                await pg.goto(url,wait_until="domcontentloaded",timeout=45000)
                t=''
                for _ in range(20):
                    await pg.wait_for_timeout(500); t=await pg.inner_text("body")
                    if re.search(r'Information (last )?updated|404|doesn.t exist',t): break
                rec['final']=pg.url; rec['text']=t[:5000]; rec.update(parse(t))
                rec['upcSeen']=u.lstrip('0') in t
                lines=[l.strip() for l in t.split('\n') if l.strip()]
                i=[k for k,l in enumerate(lines) if l in ('Ingredients & Contents','Drug Facts')]
                rec['title']=lines[i[0]-3] if i and i[0]>=3 else ''
                rec['title2']=lines[max(0,i[0]-4):i[0]] if i else []
            except Exception as e: rec['err']=str(e)[:200]
            print(u, rec.get('upcSeen'), len(rec.get('inactive',[]))+len(rec.get('ingredients',[])), rec.get('title2'), '404' in rec.get('final','') , flush=True)
            out.write(json.dumps(rec)+'\n'); out.flush()
        await br.close()
asyncio.run(main())
