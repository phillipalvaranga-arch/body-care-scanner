import re
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
