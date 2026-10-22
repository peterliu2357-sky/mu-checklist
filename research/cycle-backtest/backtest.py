"""Lead test of 周期 signals against Micron's 2018-2023 cycle turns.

Rule (fixed before looking at results):
  g(t)   = YoY % change of the signal's 3-month (or 1-quarter) average; for
           inventory-type signals the sign is flipped, so "worse" is always down.
  A peak warning fires when g has fallen n periods in a row (n = 3 months for
  monthly data, 2 quarters for quarterly data) and the total fall is at least
  D, half the median absolute n-period change of g before 2017.
  A trough all-clear is the mirror image (3 rises, total rise >= D).
  Warnings re-arm only after an opposite-direction signal.
  A warning is known once it is published: month end + publication lag.
  Lead = target turn quarter end - publication date (months). At each turn the
  signal's state is its latest published warning; a hit needs a matching warning
  3-18 months old. Scored twice: with warnings re-arming only after the opposite
  warning, and with a fresh warning each time the condition newly appears.
  Any other warning in 2015-2025 is a false alarm.
"""
import json, datetime as dt, os, statistics as st, sys

B = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'inputs') + os.sep
D = lambda s: dt.date.fromisoformat(s)

def month_end(ym):
    y, m = int(ym[:4]), int(ym[4:])
    n = dt.date(y + (m == 12), m % 12 + 1, 1)
    return n - dt.timedelta(days=1)

def add_days(d, n):
    return d + dt.timedelta(days=n)

def months_between(a, b):
    return round((b - a).days / 30.44, 1)

# Targets: Micron gross margin turns (XBRL) and DRAM ASP turns (10-Q text).
TURNS = [
    # name, kind, GM turn quarter end, ASP turn quarter end; minor turns only stop matching warnings counting as false alarms
    ('2016 谷', 'trough', '2016-06-02', '2016-06-02', 'minor'),
    ('2020 小峰', 'peak', '2020-09-03', '2020-09-03', 'minor'),
    ('2021 小谷', 'trough', '2021-03-04', '2020-12-03', 'minor'),
    ('2018 峰', 'peak', '2018-08-30', '2018-08-30', 'major'),
    ('2019 谷', 'trough', '2019-11-28', '2020-02-27', 'major'),
    ('2022 峰', 'peak', '2022-06-02', '2021-09-02', 'major'),
    ('2023 谷', 'trough', '2023-03-02', '2023-08-31', 'major'),
]

def monthly(path):
    d = json.load(open(B + path))
    return [(k, float(v)) for k, v in sorted(d.items())]

def ratio(a, b):
    a, b = dict(monthly(a)), dict(monthly(b))
    return [(k, a[k] / b[k]) for k in sorted(a) if k in b and b[k]]

def comtrade(codes):
    d = json.load(open(B + 'comtrade.json'))
    out = []
    for k in sorted(d):
        if all(c in d[k] for c in codes):
            out.append((k, sum(d[k][c] for c in codes) / 1e6))
    return out

def quarterly_capex():
    """Four hyperscalers' cash capex per calendar quarter (YTD differenced)."""
    total = {}
    for name in ['msft', 'amzn', 'amzn2', 'googl', 'meta']:
        u = json.load(open(B + f'capex_{name}.json'))
        ytd = {}
        for x in u:
            if 'start' not in x: continue
            ytd.setdefault((x['start'], x['end']), x['val'])
        q = {}
        for (s, e), v in ytd.items():
            days = (D(e) - D(s)).days
            if 80 <= days <= 100:
                q[e] = v
        for (s, e), v in sorted(ytd.items(), key=lambda kv: kv[0][1]):
            if e in q: continue
            prev = [(s2, e2) for (s2, e2) in ytd if s2 == s and 80 <= (D(e) - D(e2)).days <= 100]
            if prev:
                q[e] = v - ytd[prev[0]]
        for e, v in q.items():
            key = e[:4] + {'03': '03', '06': '06', '09': '09', '12': '12'}.get(e[5:7], e[5:7])
            # Amazon renamed its capex tag in 2017; the newer tag only fills quarters the older one lacks.
            slot = total.setdefault(key, {})
            company = 'amzn' if name == 'amzn2' else name
            if name != 'amzn2' or company not in slot:
                slot[company] = v
    out = []
    for k in sorted(total):
        if len(total[k]) == 4:
            out.append((k, sum(total[k].values()) / 1e6))
    return out

def mu_quarters(field):
    q = json.load(open(B + 'mu_quarters.json'))
    return [(o['end'][:4] + o['end'][5:7], o[field]) for o in q if o[field] is not None]

def yoy(series, step, invert=False, avg=3):
    """YoY % of a trailing 3-month average (monthly) or of the quarter itself (quarterly, matched to the
    quarter ending 11-13 months earlier, so a missing quarter cannot shift the comparison)."""
    keys = [k for k, _ in series]; vals = [v for _, v in series]
    month = lambda k: int(k[:4]) * 12 + int(k[4:]) - 1
    out = []
    for i in range(len(vals)):
        if step == 1:
            if i - 12 - avg + 1 < 0 or month(keys[i]) - month(keys[i - 12]) != 12: continue
            cur = sum(vals[i - avg + 1:i + 1]) / avg
            old = sum(vals[i - 12 - avg + 1:i - 12 + 1]) / avg
        else:
            prior = [j for j in range(i) if 11 <= month(keys[i]) - month(keys[j]) <= 13]
            if not prior: continue
            cur, old = vals[i], vals[prior[-1]]
        if old <= 0: continue
        g = (cur / old - 1) * 100
        out.append((keys[i], -g if invert else g))
    return out

def warnings(g, step, lag_days, end_date_of, rearm='opposite'):
    """n consistent moves confirm a turn: 3 months for monthly data, 2 quarters for quarterly data.

    rearm='opposite': after a warning, the same warning fires again only after the opposite one.
    rearm='fresh': a warning fires each time the condition newly appears (stricter: leads count from the latest one).
    The threshold uses only changes dated before 2017, ahead of the first scored turn.
    """
    n = 3 if step == 1 else 2
    keys = [k for k, _ in g]; vals = [v for _, v in g]
    base = [abs(vals[i] - vals[i - n]) for i in range(n, len(vals)) if keys[i] < '201701']
    thr = 0.5 * st.median(base)
    out = []; armed = {'peak': True, 'trough': True}; previous = None
    for i in range(n, len(vals)):
        d1 = [vals[j] - vals[j - 1] for j in range(i - n + 1, i + 1)]
        fall = vals[i - n] - vals[i]
        kind = None
        if all(x < 0 for x in d1) and fall >= thr: kind = 'peak'
        if all(x > 0 for x in d1) and -fall >= thr: kind = 'trough'
        fire = kind and (armed[kind] if rearm == 'opposite' else kind != previous)
        previous = kind
        if fire:
            pub = add_days(end_date_of(keys[i]), lag_days)
            out.append((kind, keys[i], pub))
            armed[kind] = False
            armed['trough' if kind == 'peak' else 'peak'] = True
    return out, thr

def score(warns, which):
    """The signal's state at the turn is its latest published warning.

    Hit: that warning matches the turn, is at most 18 months old and at least 3 months old.
    Late: the matching warning is published after the turn (within 6 months); lead is negative.
    """
    res = []; used = set()
    for name, kind, gm, asp, size in sorted(TURNS, key=lambda t: t[2]):
        target = D(gm if which == 'gm' else asp)
        before = [w for w in warns if w[2] <= target]
        state = before[-1] if before else None
        if state and state[0] == kind and months_between(state[2], target) <= 18:
            w = state
        else:
            after = [w for w in warns if w[0] == kind and target < w[2] <= add_days(target, 183)]
            w = after[0] if after else None
        if w:
            used.add(w)
            lead = months_between(w[2], target)
            res.append({'size': size, 'turn': name, 'warn_month': w[1], 'published': w[2].isoformat(), 'lead_months': lead, 'hit': lead >= 3})
        else:
            res.append({'size': size, 'turn': name, 'warn_month': None, 'published': None, 'lead_months': None, 'hit': False})
    false = [w for w in warns if w not in used and '201501' <= w[1] <= '202512']
    return res, false

def corr(a, b):
    ma, mb = st.mean(a), st.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5
    return num / den if den else 0

def xcorr(g, step):
    """Correlation of the signal's YoY (at Micron quarter ends) with Micron GM YoY change k quarters later."""
    gm = mu_quarters('gm')
    gmd = [(k, gm[i][1] - gm[i - 4][1]) for i, (k, _) in enumerate(gm) if i >= 4 and '201501' <= k <= '202412']
    gd = dict(g)
    def at(k):
        if step == 3:
            for kk in [k, f"{k[:4]}{int(k[4:]) - 1:02d}" if int(k[4:]) > 1 else None]:
                if kk in gd: return gd[kk]
            # nearest calendar quarter end on or before
            cands = [x for x in gd if x <= k]
            return gd[max(cands)] if cands else None
        return gd.get(k)
    out = {}
    for lag in range(0, 5):
        xs, ys = [], []
        for i in range(len(gmd)):
            if i - lag < 0: continue
            v = at(gmd[i - lag][0])
            if v is None: continue
            xs.append(v); ys.append(gmd[i][1])
        if len(xs) > 12:
            out[lag] = round(corr(xs, ys), 2)
    return out

def qend(k):
    q = json.load(open(B + 'mu_quarters.json'))
    for o in q:
        if o['end'][:4] + o['end'][5:7] == k: return D(o['end'])
    return month_end(k)

SIGNALS = [
    # id, label, series, step, invert, publication lag (days), site status
    ('bok_dram', '韩国央行 DRAM 出口价格指数', lambda: monthly('bok_dram.json'), 1, False, 15, 'new'),
    ('bok_flash', '韩国央行闪存出口价格指数', lambda: monthly('bok_flash.json'), 1, False, 15, 'new'),
    ('korea_memory_exports', '韩国存储芯片出口额 (HS 854232)', lambda: comtrade(['854232']), 1, False, 1, 'site'),
    ('korea_semi_exports', '韩国半导体出口额 (HS 8541+8542)', lambda: comtrade(['8541', '8542']), 1, False, 1, 'site'),
    ('nanya_revenue', '南亚科月营收', lambda: monthly('nanya.json'), 1, False, 10, 'site'),
    ('korea_inventory_ratio', '韩国电子零件业库存/出货比 (KSIC 26)', lambda: ratio('k26_inv.json', 'k26_ship.json'), 1, True, 30, 'new'),
    ('korea_semi_utilization', '韩国半导体业开工率指数', lambda: monthly('semi_util.json'), 1, False, 30, 'extra'),
    ('mu_inventory_days', '美光库存天数', lambda: mu_quarters('inv_days'), 3, True, 28, 'site'),
    ('mu_revenue', '美光总收入 (代 DRAM 收入)', lambda: mu_quarters('rev'), 3, False, 28, 'site'),
    ('hyperscaler_capex', '四家云厂商资本开支合计', quarterly_capex, 3, False, 30, 'site'),
]

def run():
    report = []
    for sid, label, f, step, inv, lag, status in SIGNALS:
        series = f()
        g = yoy(series, step, invert=inv)
        end_of = qend if sid.startswith('mu_') else month_end
        if sid == 'hyperscaler_capex': end_of = month_end
        warns, thr = warnings(g, step, lag, end_of)
        gm_res, false = score(warns, 'gm')
        asp_res, _ = score(warns, 'asp')
        fresh, _ = warnings(g, step, lag, end_of, rearm='fresh')
        fresh_res, fresh_false = score(fresh, 'gm')
        report.append({'id': sid, 'label': label, 'status': status, 'first': series[0][0], 'last': series[-1][0],
                       'threshold': round(thr, 2), 'gm': gm_res, 'asp': asp_res,
                       'false_alarms': [(w[0], w[1]) for w in false],
                       'fresh_gm': fresh_res, 'fresh_false_alarms': [(w[0], w[1]) for w in fresh_false],
                       'hits_gm': sum(r['hit'] for r in gm_res if r['size'] == 'major'), 'hits_asp': sum(r['hit'] for r in asp_res if r['size'] == 'major'),
                       'xcorr_gm': xcorr(g, step)})
    json.dump(report, open(B + '../results.json', 'w'), ensure_ascii=False, indent=1, default=str)
    for r in report:
        print(f"{r['label']:<34} {r['first']}-{r['last']} GM hits {r['hits_gm']}/4 ASP hits {r['hits_asp']}/4 false {len(r['false_alarms'])} xcorr {r['xcorr_gm']}")
        print('   GM ', [(x['turn'], x['warn_month'], x['lead_months']) for x in r['gm'] if x['size'] == 'major'])
        print('   ASP', [(x['turn'], x['warn_month'], x['lead_months']) for x in r['asp'] if x['size'] == 'major'])
        print('   false', r['false_alarms'])

if __name__ == '__main__' and len(sys.argv) == 1:
    run()

def event_study(g, lag_days, end_of, which='gm', confirm_months=3):
    """Months from the signal's YoY extreme (+ confirmation + publication lag) to each major turn.
    Descriptive only: the extreme is chosen with data up to 6 months after the turn."""
    out = []
    for name, kind, gm, asp, size in TURNS:
        if size != 'major': continue
        T = D(gm if which == 'gm' else asp)
        win = [(k, v) for k, v in g if add_days(T, -730) <= end_of(k) <= add_days(T, 183)]
        if len(win) < 6:
            out.append((name, None, None)); continue
        k, v = (max if kind == 'peak' else min)(win, key=lambda kv: kv[1])
        known = add_days(end_of(k), lag_days + int(confirm_months * 30.44))
        out.append((name, k, months_between(known, T)))
    return out

def run_events():
    rows = []
    for sid, label, f, step, inv, lag, status in SIGNALS:
        g = yoy(f(), step, invert=inv)
        end_of = qend if sid.startswith('mu_') else month_end
        gm = event_study(g, lag, end_of, 'gm')
        asp = event_study(g, lag, end_of, 'asp')
        rows.append({'id': sid, 'label': label, 'status': status, 'gm': gm, 'asp': asp, 'xcorr': xcorr(g, step)})
        print(f"{label:<34}", 'GM', [(n, x) for n, _, x in gm], '| ASP', [(n, x) for n, _, x in asp], xcorr(g, step))
    json.dump(rows, open(B + '../events.json', 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == 'events':
    run_events()
