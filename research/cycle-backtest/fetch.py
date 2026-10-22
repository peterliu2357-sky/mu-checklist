"""Download the public inputs for the cycle back-test into inputs/.

Sources (all free, no key):
  SEC XBRL companyfacts   Micron revenue, gross profit, COGS, inventory; hyperscaler cash capex
  Bank of Korea ECOS      402Y016 export price index by item (DRAM, flash; USD basis)
                          901Y032 KSIC 26 producer shipment and inventory indices
                          901Y035 semiconductor manufacturing operating-rate index
  UN Comtrade (preview)   Korea monthly exports, HS 854232 (memory) and 8541+8542
  Nanya IR                consolidated monthly revenue tables

ECOS's public "sample" key returns at most 10 rows per request, and the Comtrade
preview takes one month per request, so a full refresh takes about an hour.
Run: python3 -I research/cycle-backtest/fetch.py
"""
import datetime as dt, html, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'inputs')
UA = 'mu-checklist research (public repository)'
START, END = '201001', dt.date.today().strftime('%Y%m')


def get(url, tries=4):
    for t in range(tries):
        r = subprocess.run(['curl', '-s', '--max-time', '60', '-A', UA, url], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout:
            return r.stdout
        time.sleep(2 * (t + 1))
    raise RuntimeError(f'fetch failed: {url}')


def save(name, data):
    with open(os.path.join(OUT, name), 'w') as f:
        json.dump(data, f, ensure_ascii=False)


def months(a, b):
    y, m = int(a[:4]), int(a[4:])
    while f'{y}{m:02d}' <= b:
        yield f'{y}{m:02d}'
        m += 1
        if m > 12:
            y, m = y + 1, 1


def ecos(table, item, item2):
    keys, res = list(months(START, END)), {}
    for i in range(0, len(keys), 10):
        a, b = keys[i], keys[min(i + 9, len(keys) - 1)]
        d = json.loads(get(f'https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/{table}/M/{a}/{b}/{item}/{item2}'))
        for row in d.get('StatisticSearch', {}).get('row', []):
            res[row['TIME']] = float(row['DATA_VALUE'])
    return dict(sorted(res.items()))


def sec_facts():
    d = json.loads(get('https://data.sec.gov/api/xbrl/companyfacts/CIK0000723125.json'))['facts']['us-gaap']
    P = dt.date.fromisoformat

    def quarterly(keys):
        q, annual = {}, {}
        for k in keys:
            for x in d.get(k, {}).get('units', {}).get('USD', []):
                if 'start' not in x:
                    continue
                days = (P(x['end']) - P(x['start'])).days
                if 80 <= days <= 100:
                    q.setdefault(x['end'], x['val'])
                elif 355 <= days <= 375:
                    annual.setdefault(x['end'], (x['start'], x['val']))
        for e, (s, v) in annual.items():
            inside = [k for k in q if P(s) < P(k) < P(e)]
            if e not in q and len(inside) == 3:
                q[e] = v - sum(q[k] for k in inside)
        return q

    rev = quarterly(['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'])
    gp = quarterly(['GrossProfit'])
    cogs = quarterly(['CostOfGoodsAndServicesSold', 'CostOfRevenue'])
    inv = {}
    for x in d['InventoryNet']['units']['USD']:
        inv.setdefault(x['end'], x['val'])
    out = []
    for e in sorted(gp):
        if rev.get(e):
            c = cogs.get(e)
            out.append({'end': e, 'rev': rev[e], 'gm': round(gp[e] / rev[e] * 100, 2),
                        'inv_days': round(inv[e] / (c / 91), 1) if e in inv and c else None})
    save('mu_quarters.json', out)


def capex():
    for name, cik, concept in [('msft', 789019, 'PaymentsToAcquirePropertyPlantAndEquipment'),
                               ('amzn', 1018724, 'PaymentsToAcquirePropertyPlantAndEquipment'),
                               ('amzn2', 1018724, 'PaymentsToAcquireProductiveAssets'),
                               ('googl', 1652044, 'PaymentsToAcquirePropertyPlantAndEquipment'),
                               ('meta', 1326801, 'PaymentsToAcquirePropertyPlantAndEquipment')]:
        d = json.loads(get(f'https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{concept}.json'))
        save(f'capex_{name}.json', [{k: x[k] for k in ('start', 'end', 'val', 'form', 'fy', 'fp') if k in x} for x in d['units']['USD']])
        time.sleep(0.3)


def comtrade():
    path = os.path.join(OUT, 'comtrade.json')
    res = json.load(open(path)) if os.path.exists(path) else {}
    for p in months('201501', END):
        if p in res:
            continue
        url = ('https://comtradeapi.un.org/public/v1/preview/C/M/HS?reporterCode=410&period=' + p +
               '&cmdCode=854232,8541,8542&flowCode=X&partnerCode=0&partner2Code=0&customsCode=C00&motCode=0')
        for t in range(5):
            try:
                d = json.loads(get(url))
                if d.get('data'):
                    res[p] = {x['cmdCode']: x['primaryValue'] for x in d['data']}
                break
            except Exception:
                time.sleep(5 * (t + 1))
        save('comtrade.json', res)
        time.sleep(1.5)


def nanya():
    names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    out = {}
    for y in range(2015, int(END[:4]) + 1):
        t = get(f'https://www.nanya.com/en/IR/36/Monthly%20Revenue?Year={y}')
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', t, flags=re.S):
            cells = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', c))).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, flags=re.S)]
            if len(cells) > 1 and cells[0] in names and cells[1].replace(',', '').isdigit():
                out[f'{y}{names.index(cells[0]) + 1:02d}'] = int(cells[1].replace(',', ''))
    save('nanya.json', dict(sorted(out.items())))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sec_facts(); capex()
    save('bok_dram.json', ecos('402Y016', '30911201AA', 'D'))
    save('bok_flash.json', ecos('402Y016', '30911202AA', 'D'))
    save('k26_ship.json', ecos('901Y032', 'I11ACQ', '3'))
    save('k26_inv.json', ecos('901Y032', 'I11ACQ', '5'))
    save('semi_util.json', ecos('901Y035', 'I32AO1', 'I11B'))
    nanya()
    if '--skip-comtrade' not in sys.argv:
        comtrade()
