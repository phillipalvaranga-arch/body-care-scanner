import asyncio,json,re,os,sys
from playwright.async_api import async_playwright
P=json.load(open('sl_picked.json'))
P=[x for x in P if x['items'][0]['brand'] not in ('Suavitel','Fabuloso','Murphy Oil Soap','Afta')]
items=[i for x in P for i in x['items']]
done=set()
if os.path.exists('scraped.jsonl'):
    for l in open('scraped.jsonl'): done.add(json.loads(l)['url'])
todo=[i for i in items if i['url'] not in done]
print('todo',len(todo),flush=True)
out=open('scraped.jsonl','a')
STOP=re.compile(r'^(Information (last )?updated|Please refer|DISTR|Distributed|Manufactured|Accessibility|Human Health|Health, Safety|Usage Instructions|Claims listed|Contact Us)',re.I)
def parse(t):
    lines=[l.strip() for l in t.split('\n') if l.strip()]
    res={'active':[],'inactive':[],'ingredients':[]}
    mode=None
    for l in lines:
        u=l.upper()
        if u in ('ACTIVE INGREDIENT','ACTIVE INGREDIENTS'): mode='active'; continue
        if u in ('INACTIVE INGREDIENT','INACTIVE INGREDIENTS'): mode='inactive'; continue
        if u=='INGREDIENTS' : mode='ingredients'; continue
        if STOP.match(l): mode=None; continue
        if mode:
            if l in ('DL','Click to zoom') or len(l)>160: continue
            res[mode].append(l)
    m=re.search(r'Information (?:last )?updated on ([0-9A-Za-z-]+)',t)
    res['updated']=m.group(1) if m else ''
    return res
async def worker(ctx,q):
    pg=await ctx.new_page()
    await pg.route("**/*",lambda r: r.abort() if r.request.resource_type in ("image","font","media") else r.continue_())
    while True:
        try: it=q.get_nowait()
        except asyncio.QueueEmpty: break
        rec=dict(it)
        try:
            await pg.goto(it['url'],wait_until="domcontentloaded",timeout=45000)
            ok=False
            for _ in range(24):
                await pg.wait_for_timeout(500)
                t=await pg.inner_text("body")
                if re.search(r'Information (last )?updated',t): ok=True; break
            rec['text']=t[:6000]; rec.update(parse(t)); rec['ok']=ok
            lines=[l.strip() for l in t.split('\n') if l.strip()]
            rec['pageUpcSeen']=it['upc'][1:] in t or it['upc'] in t
        except Exception as e:
            rec['err']=str(e)[:200]
        out.write(json.dumps(rec)+'\n'); out.flush()
    await pg.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")
        q=asyncio.Queue()
        lim=int(sys.argv[1]) if len(sys.argv)>1 else len(todo)
        for i in todo[:lim]: q.put_nowait(i)
        await asyncio.gather(*[worker(ctx,q) for _ in range(5)])
        await b.close()
asyncio.run(main())
