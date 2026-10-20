#!/usr/bin/env python3
"""
docs/generate-diagrams.py
Generates the two documentation diagrams as standalone SVG files:
  - docs/ERD.svg          (entity relationship diagram, crow's foot notation)
  - docs/FLOWCHART.svg    (system flowchart of the registration process)

Run:  python3 docs/generate-diagrams.py
"""
import os

OUT = os.path.dirname(os.path.abspath(__file__))

FONT = "'Segoe UI',Arial,Helvetica,sans-serif"
MONO = "'Consolas','Courier New',monospace"


# --------------------------------------------------------------------------- #
#                                ERD                                          #
# --------------------------------------------------------------------------- #
def erd():
    W, H = 1460, 700
    BOX_W, GAP = 330, 210
    X1 = 30
    X2 = X1 + BOX_W + GAP
    X3 = X2 + BOX_W + GAP
    Y = 118
    HEAD, ROW = 48, 32

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'font-family="{FONT}">',
        '<defs>',
        '<linearGradient id="hd" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0%" stop-color="#26407a"/><stop offset="100%" stop-color="#2f5bff"/></linearGradient>',
        '<style>'
        '.ent-title{fill:#fff;font-size:18px;font-weight:700;letter-spacing:.06em}'
        '.fld{fill:#15203a;font-size:14px}'
        '.typ{fill:#6b7691;font-size:11.5px}'
        '.pk{fill:#b42b45;font-size:11px;font-weight:700}'
        '.fk{fill:#2440a8;font-size:11px;font-weight:700}'
        '.rel{fill:#15203a;font-size:14px;font-weight:700}'
        '.card{fill:#46527a;font-size:12.5px}'
        '.note{fill:#33406b;font-size:12.5px}'
        '.h1{fill:#15203a;font-size:23px;font-weight:700}'
        '.sub{fill:#6b7691;font-size:13px}'
        '</style>',
        '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#15203a" flood-opacity="0.13"/></filter>',
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="#f5f7fb"/>',
        '<text class="h1" x="30" y="52">Entity Relationship Diagram</text>',
        '<text class="sub" x="30" y="76">Event Registration System &#183; USERS / EVENTS / REGISTRATIONS '
        '&#183; crow&#8217;s foot notation</text>',
    ]

    def entity(x, name, rows):
        """rows: list of (field, type, key) - key in {PK, FK, None}"""
        h = HEAD + ROW * len(rows)
        out = ['<g filter="url(#sh)">',
               f'<rect x="{x}" y="{Y}" width="{BOX_W}" height="{h}" rx="12" fill="#fff" stroke="#dbe2f0"/>',
               f'<path d="M{x} {Y+12} a12 12 0 0 1 12-12 h{BOX_W-24} a12 12 0 0 1 12 12 v{HEAD-12} h{-BOX_W} z" '
               f'fill="url(#hd)"/>',
               f'<text class="ent-title" x="{x+18}" y="{Y+32}">{name}</text>',
               '</g>']
        cy = Y + HEAD
        for i, (fname, ftype, key) in enumerate(rows):
            if i:
                out.append(f'<line x1="{x}" y1="{cy}" x2="{x+BOX_W}" y2="{cy}" stroke="#eef1f8"/>')
            if key == 'PK':
                out.append(f'<rect x="{x+14}" y="{cy+9}" width="26" height="15" rx="4" fill="#fdeaee"/>'
                           f'<text class="pk" x="{x+21}" y="{cy+20}">PK</text>')
            elif key == 'FK':
                out.append(f'<rect x="{x+14}" y="{cy+9}" width="26" height="15" rx="4" fill="#e8eeff"/>'
                           f'<text class="fk" x="{x+21}" y="{cy+20}">FK</text>')
            out.append(f'<text class="fld" x="{x+50}" y="{cy+21}">{fname}</text>')
            out.append(f'<text class="typ" x="{x+BOX_W-14}" y="{cy+21}" text-anchor="end">{ftype}</text>')
            cy += ROW
        return out

    parts += entity(X1, 'USERS', [
        ('user_id', 'INT', 'PK'),
        ('full_name', 'VARCHAR(120)', None),
        ('email', 'VARCHAR(160) UNIQUE', None),
        ('password', 'VARCHAR(255) hashed', None),
        ('role', 'ENUM(admin|participant)', None),
    ])
    parts += entity(X2, 'REGISTRATIONS', [
        ('registration_id', 'INT', 'PK'),
        ('user_id', 'INT &#8594; USERS', 'FK'),
        ('event_id', 'INT &#8594; EVENTS', 'FK'),
        ('registration_date', 'DATETIME', None),
        ('status', 'ENUM(confirmed|waitlisted|cancelled)', None),
    ])
    parts += entity(X3, 'EVENTS', [
        ('event_id', 'INT', 'PK'),
        ('title', 'VARCHAR(180)', None),
        ('description', 'TEXT', None),
        ('event_date', 'DATETIME', None),
        ('venue', 'VARCHAR(180)', None),
        ('max_participants', 'INT', None),
    ])

    LW = BOX_W + GAP  # left edge to left edge

    def connector(x_from, y, many_on_right):
        """Draws a 1 : 0..* line between two entities with crow's foot on the many side."""
        x_to = x_from + LW
        many_x = x_to if many_on_right else x_from
        one_x = x_from if many_on_right else x_to
        s = 1 if many_on_right else -1
        tip = many_x + s * 20
        out = [f'<line x1="{x_from}" y1="{y}" x2="{x_to}" y2="{y}" stroke="#46527a" stroke-width="1.8"/>',
               f'<line x1="{many_x}" y1="{y-13}" x2="{tip}" y2="{y}" stroke="#46527a" stroke-width="1.8"/>',
               f'<line x1="{many_x}" y1="{y+13}" x2="{tip}" y2="{y}" stroke="#46527a" stroke-width="1.8"/>',
               f'<line x1="{one_x - s*7}" y1="{y-11}" x2="{one_x - s*7}" y2="{y+11}" stroke="#46527a" stroke-width="2"/>']
        mid = x_from + LW / 2
        if many_on_right:   # USERS ---< REGISTRATIONS
            out.append(f'<text class="rel" x="{x_from+16}" y="{y-16}">1</text>')
            out.append(f'<text class="rel" x="{x_to-30}" y="{y-16}" text-anchor="end">0..*</text>')
            out.append(f'<text class="card" x="{mid}" y="{y+30}" text-anchor="middle">one user places</text>')
            out.append(f'<text class="card" x="{mid}" y="{y+46}" text-anchor="middle">many registrations</text>')
        else:               # REGISTRATIONS >--- EVENTS  (line drawn left->right)
            out.append(f'<text class="rel" x="{x_from+30}" y="{y-16}">0..*</text>')
            out.append(f'<text class="rel" x="{x_to-16}" y="{y-16}" text-anchor="end">1</text>')
            out.append(f'<text class="card" x="{mid}" y="{y+30}" text-anchor="middle">each registration is</text>')
            out.append(f'<text class="card" x="{mid}" y="{y+46}" text-anchor="middle">for exactly one event</text>')
        return out

    # connector 1: USERS (1) ----< REGISTRATIONS (0..*)  - crow's foot at the REGISTRATIONS end
    y1 = Y + HEAD + ROW * 1.5
    parts += [f'<line x1="{X1+BOX_W}" y1="{y1}" x2="{X2}" y2="{y1}" stroke="#46527a" stroke-width="1.8"/>',
              f'<line x1="{X1+BOX_W+7}" y1="{y1-11}" x2="{X1+BOX_W+7}" y2="{y1+11}" stroke="#46527a" stroke-width="2"/>',
              f'<line x1="{X2}" y1="{y1-13}" x2="{X2-20}" y2="{y1}" stroke="#46527a" stroke-width="1.8"/>',
              f'<line x1="{X2}" y1="{y1+13}" x2="{X2-20}" y2="{y1}" stroke="#46527a" stroke-width="1.8"/>',
              f'<line x1="{X2}" y1="{y1}" x2="{X2-20}" y2="{y1}" stroke="#46527a" stroke-width="1.8"/>',
              f'<text class="rel" x="{X1+BOX_W+18}" y="{y1-16}">1</text>',
              f'<text class="rel" x="{X2-30}" y="{y1-16}" text-anchor="end">0..*</text>',
              f'<text class="card" x="{X1+BOX_W+GAP/2}" y="{y1+32}" text-anchor="middle">one user places</text>',
              f'<text class="card" x="{X1+BOX_W+GAP/2}" y="{y1+48}" text-anchor="middle">many registrations</text>']

    # connector 2: REGISTRATIONS (0..*) ---- EVENTS (1) - crow's foot at the REGISTRATIONS end
    y2 = Y + HEAD + ROW * 2.5
    parts += [f'<line x1="{X2+BOX_W}" y1="{y2}" x2="{X3}" y2="{y2}" stroke="#46527a" stroke-width="1.8"/>',
              f'<line x1="{X2+BOX_W}" y1="{y2-13}" x2="{X2+BOX_W+20}" y2="{y2}" stroke="#46527a" stroke-width="1.8"/>',
              f'<line x1="{X2+BOX_W}" y1="{y2+13}" x2="{X2+BOX_W+20}" y2="{y2}" stroke="#46527a" stroke-width="1.8"/>',
              f'<line x1="{X2+BOX_W}" y1="{y2}" x2="{X2+BOX_W+20}" y2="{y2}" stroke="#46527a" stroke-width="1.8"/>',
              f'<line x1="{X3-7}" y1="{y2-11}" x2="{X3-7}" y2="{y2+11}" stroke="#46527a" stroke-width="2"/>',
              f'<text class="rel" x="{X2+BOX_W+30}" y="{y2-16}">0..*</text>',
              f'<text class="rel" x="{X3-18}" y="{y2-16}" text-anchor="end">1</text>',
              f'<text class="card" x="{X2+BOX_W+GAP/2}" y="{y2+32}" text-anchor="middle">each registration</text>',
              f'<text class="card" x="{X2+BOX_W+GAP/2}" y="{y2+48}" text-anchor="middle">is for one event</text>']

    # --- cardinality summary banner ----------------------------------------
    by = 402
    parts += [
        f'<rect x="30" y="{by}" width="{W-60}" height="106" rx="14" fill="#fff" stroke="#dbe2f0"/>',
        f'<text class="rel" x="60" y="{by+36}">[EVENTS]</text>',
        f'<text class="rel" x="152" y="{by+36}">1</text>',
        f'<line x1="168" y1="{by+31}" x2="268" y2="{by+31}" stroke="#46527a" stroke-width="1.8"/>',
        f'<text class="rel" x="284" y="{by+36}">0..*</text>',
        f'<text class="rel" x="332" y="{by+36}">[REGISTRATIONS]</text>',
        f'<text class="rel" x="514" y="{by+36}">0..*</text>',
        f'<line x1="556" y1="{by+31}" x2="656" y2="{by+31}" stroke="#46527a" stroke-width="1.8"/>',
        f'<text class="rel" x="672" y="{by+36}">1</text>',
        f'<text class="rel" x="694" y="{by+36}">[USERS]</text>',
        f'<text class="card" x="60" y="{by+68}">An EVENT has zero or many REGISTRATIONS, but each REGISTRATION is for exactly one EVENT.</text>',
        f'<text class="card" x="60" y="{by+90}">A USER has zero or many REGISTRATIONS, but each REGISTRATION belongs to exactly one USER.</text>',
    ]

    ny = 532
    parts += [
        f'<rect x="30" y="{ny}" width="{W-60}" height="122" rx="14" fill="#e8eeff" stroke="#c6d3fb"/>',
        f'<text class="note" x="56" y="{ny+32}"><tspan font-weight="700">Duplicate rule: </tspan>'
        'a composite UNIQUE index on REGISTRATIONS(event_id, user_id) blocks a second registration '
        'from the same email for the same event.</text>',
        f'<text class="note" x="56" y="{ny+58}"><tspan font-weight="700">Capacity rule: </tspan>'
        'CONFIRMED registrations may never exceed EVENTS.max_participants; once full the system shows '
        '&#8220;Event full&#8221; and offers the waiting list.</text>',
        f'<text class="note" x="56" y="{ny+84}"><tspan font-weight="700">Referential integrity: </tspan>'
        'REGISTRATIONS.user_id &#8594; USERS.user_id and REGISTRATIONS.event_id &#8594; EVENTS.event_id '
        '(ON DELETE CASCADE, ON UPDATE CASCADE).</text>',
    ]

    parts.append('</svg>')
    return '\n'.join(parts)


# --------------------------------------------------------------------------- #
#                             FLOWCHART                                       #
# --------------------------------------------------------------------------- #
def flowchart():
    W = 1180
    bw, box_h, gap = 400, 56, 42
    cx = 70                      # left edge of the main column
    ccx = cx + bw / 2            # centre of the main column
    scx = 680                    # centre of the "No" branch column
    sw = 320

    parts = []
    head = [
        '<defs>',
        '<style>'
        '.box{fill:#fff;stroke:#2f5bff;stroke-width:1.8}'
        '.proc{fill:#15203a;font-size:15px;font-weight:600}'
        '.term{fill:#fff;font-size:15px;font-weight:700;letter-spacing:.05em}'
        '.arr{stroke:#46527a;stroke-width:2;fill:none}'
        '.yes{fill:#10a36b;font-size:14px;font-weight:700}'
        '.no{fill:#e0425f;font-size:14px;font-weight:700}'
        '.h1{fill:#15203a;font-size:23px;font-weight:700}'
        '.sub{fill:#6b7691;font-size:13px}'
        '</style>',
        '<marker id="ah" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto">'
        '<path d="M0 0 L11 4.5 L0 9 z" fill="#46527a"/></marker>',
        '<filter id="sh2" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#15203a" flood-opacity="0.12"/></filter>',
        '</defs>',
    ]

    def rect_box(y, label, centre=ccx, width=bw):
        return [f'<g filter="url(#sh2)"><rect class="box" x="{centre-width/2}" y="{y}" width="{width}" height="{box_h}" rx="10"/></g>',
                f'<text class="proc" x="{centre}" y="{y+box_h/2+5.5}" text-anchor="middle">{label}</text>']

    def stadium(y, label, centre=ccx, width=170, fill='#26407a'):
        return [f'<g filter="url(#sh2)"><rect x="{centre-width/2}" y="{y}" width="{width}" height="52" rx="26" fill="{fill}"/></g>',
                f'<text class="term" x="{centre}" y="{y+32}" text-anchor="middle">{label}</text>']

    def arrow(x1, y1, x2, y2):
        return f'<line class="arr" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" marker-end="url(#ah)"/>'

    body = []
    y = 112
    body += stadium(y, 'Start')
    y += 52
    body.append(arrow(ccx, y, ccx, y + gap - 8)); y += gap

    for label in ['User views event list', 'Select event']:
        body += rect_box(y, label)
        y += box_h
        body.append(arrow(ccx, y, ccx, y + gap - 8)); y += gap

    # ------------------------------ decision ------------------------------- #
    dw, dh = 330, 140
    dx, dy = ccx - dw / 2, y
    body += [
        f'<g filter="url(#sh2)"><path d="M{ccx} {dy} L{dx+dw} {dy+dh/2} L{ccx} {dy+dh} L{dx} {dy+dh/2} Z" '
        f'fill="#fff" stroke="#2f5bff" stroke-width="1.8"/></g>',
        f'<text class="proc" x="{ccx}" y="{dy+dh/2-6}" text-anchor="middle">Event has</text>',
        f'<text class="proc" x="{ccx}" y="{dy+dh/2+16}" text-anchor="middle">available slots?</text>',
    ]

    # --------------------------- No -> Event full -------------------------- #
    no_y = dy + 12
    body += [f'<line class="arr" x1="{dx+dw}" y1="{dy+dh/2}" x2="{scx-sw/2}" y2="{dy+dh/2}" marker-end="url(#ah)"/>',
             f'<text class="no" x="{dx+dw+16}" y="{dy+dh/2-14}">No</text>']
    body += rect_box(no_y, 'Show &#8220;Event full&#8221;', centre=scx, width=sw)
    body.append(arrow(scx, no_y + box_h, scx, no_y + box_h + 41))
    body += stadium(no_y + box_h + 45, 'End', centre=scx, width=150, fill='#e0425f')

    # ---------------------------- Yes -> continue -------------------------- #
    y = dy + dh
    body += [arrow(ccx, y, ccx, y + gap - 8),
             f'<text class="yes" x="{ccx+14}" y="{y+28}">Yes</text>']
    y += gap

    for label in ['Enter participant details',
                  'Validate email and required fields',
                  'Save registration',
                  'Increase registered participant count',
                  'Show confirmation']:
        body += rect_box(y, label)
        y += box_h
        body.append(arrow(ccx, y, ccx, y + gap - 8)); y += gap

    body += stadium(y, 'End')
    y += 52

    H = int(y + 56)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}">']
    parts += head
    parts += [f'<rect width="{W}" height="{H}" fill="#f5f7fb"/>',
              '<text class="h1" x="30" y="52">System Flowchart &#8212; Online Event Registration</text>',
              '<text class="sub" x="30" y="76">Start &#8594; view event list &#8594; select event &#8594; '
              'slot check &#8594; validate &#8594; save registration &#8594; confirm &#8594; End</text>']
    parts += body
    parts.append('</svg>')
    return '\n'.join(parts)


# --------------------------------------------------------------------------- #
#                          MVC ARCHITECTURE                                   #
# --------------------------------------------------------------------------- #
def mvc():
    W, H = 1250, 610
    p = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}">',
        '<defs><style>'
        '.t{fill:#15203a;font-size:16px;font-weight:700}'
        '.s{fill:#46527a;font-size:12.5px}'
        '.h1{fill:#15203a;font-size:23px;font-weight:700}'
        '.sub{fill:#6b7691;font-size:13px}'
        '.lab{fill:#46527a;font-size:12px;font-weight:600}'
        '.seq{fill:#33406b;font-size:13px}'
        '</style>'
        '<marker id="a3" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto">'
        '<path d="M0 0 L11 4.5 L0 9 z" fill="#46527a"/></marker>'
        '<filter id="sh3" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#15203a" flood-opacity="0.12"/></filter>'
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="#f5f7fb"/>',
        '<text class="h1" x="30" y="52">MVC Architecture</text>',
        '<text class="sub" x="30" y="76">Express request lifecycle &#8212; Model &#183; View &#183; Controller</text>',
    ]

    CW, CH = 260, 158

    def card(x, y, title, lines, accent, w=CW, h=CH):
        p.append(f'<g filter="url(#sh3)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="#fff" stroke="#dbe2f0"/></g>')
        p.append(f'<rect x="{x}" y="{y}" width="6" height="{h}" rx="3" fill="{accent}"/>')
        p.append(f'<text class="t" x="{x+22}" y="{y+30}">{title}</text>')
        for i, l in enumerate(lines):
            p.append(f'<text class="s" x="{x+22}" y="{y+56+i*19}">{l}</text>')

    def arrow(pts, label='', lx=0, ly=0, anchor='middle'):
        d = ' '.join(('M' if i == 0 else 'L') + f'{x} {y}' for i, (x, y) in enumerate(pts))
        p.append(f'<path d="{d}" fill="none" stroke="#46527a" stroke-width="1.8" marker-end="url(#a3)"/>')
        if label:
            p.append(f'<text class="lab" x="{lx}" y="{ly}" text-anchor="{anchor}">{label}</text>')

    # ---- row 1 : request path ------------------------------------------------
    card(30, 150, 'Browser (Client)', [
        'EJS-rendered HTML + CSS', 'GET  /                &#8594; event list',
        'GET  /events/:id', 'POST /events/:id/register',
        'public/js/main.js  (client validation)'], '#6b7691')
    card(330, 150, 'Router', [
        'routes/index.js', 'Maps URL + HTTP verb', 'to a controller action,',
        'then applies the auth /', 'role guards'], '#e79a12')
    card(630, 150, 'Controller', [
        'eventController', 'registrationController',
        'adminController / authController', 'Validates input, enforces',
        'capacity + duplicate rules'], '#2f5bff')

    # ---- row 2 : data + presentation ----------------------------------------
    card(630, 360, 'Model (Sequelize)', [
        'User   &#8594; USERS', 'Event  &#8594; EVENTS',
        'Registration &#8594; REGISTRATIONS', 'Associations, validations,',
        'transactions, unique index'], '#10a36b')
    card(950, 360, 'Database', [
        'MySQL / PostgreSQL', '(SQLite for the demo)', 'Tables: USERS &#183; EVENTS',
        '&#183; REGISTRATIONS', 'Seeded via npm run seed'], '#2440a8')
    card(330, 360, 'View (EJS)', [
        'views/events/*.ejs', 'views/admin/*.ejs',
        'views/partials/header|footer', 'Confirmation, &#8220;Event full&#8221;',
        'and duplicate pages'], '#8b5cf6')

    # ---- arrows --------------------------------------------------------------
    arrow([(290, 229), (322, 229)], 'request', 306, 218)
    arrow([(590, 229), (622, 229)], 'dispatch', 618, 218, 'end')
    arrow([(760, 308), (760, 352)], 'query / save', 772, 336, 'start')
    arrow([(890, 415), (942, 415)], 'SQL', 916, 404)
    arrow([(950, 455), (898, 455)], 'rows', 924, 478)
    arrow([(650, 308), (650, 334), (470, 334), (470, 352)], 'render', 578, 326)
    arrow([(330, 440), (160, 440), (160, 314)], 'rendered HTML response', 236, 462)

    # ---- sequence strip ------------------------------------------------------
    p.append('<rect x="30" y="548" width="1190" height="40" rx="10" fill="#e8eeff" stroke="#c6d3fb"/>')
    p.append('<text class="seq" x="50" y="573"><tspan font-weight="700">Request sequence:  </tspan>'
             'Browser &#8594; Router &#8594; Controller &#8594; Model &#8594; Database &#8594; Model '
             '&#8594; Controller &#8594; View (EJS) &#8594; Browser</text>')
    return '\n'.join(p + ['</svg>'])


if __name__ == '__main__':
    for name, builder in [('ERD.svg', erd), ('FLOWCHART.svg', flowchart), ('MVC-ARCHITECTURE.svg', mvc)]:
        path = os.path.join(OUT, name)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(builder())
        print('wrote', path)
