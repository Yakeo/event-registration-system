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
    """Corrected crow's-foot ERD.

    Fixes over the previous version:
      * every relationship line is anchored to the actual FK row
        (REGISTRATIONS.user_id / REGISTRATIONS.event_id), not to a random y;
      * the reset-password columns that exist in the schema are shown;
      * unique / index / business constraints are written on the diagram;
      * the summary strip follows the same left-to-right direction as the
        boxes (USERS -> REGISTRATIONS <- EVENTS).
    """
    W, H = 1540, 880
    BOX_W, HEAD, ROW = 380, 50, 34
    X1, X2, X3 = 40, 580, 1120
    Y = 148

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'font-family="{FONT}">',
        '<defs>',
        '<linearGradient id="hd" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0%" stop-color="#26407a"/><stop offset="100%" stop-color="#2f5bff"/></linearGradient>',
        '<style>'
        '.ent-title{fill:#fff;font-size:18px;font-weight:700;letter-spacing:.06em}'
        '.fld{fill:#15203a;font-size:13.5px}'
        '.typ{fill:#6b7691;font-size:11.5px}'
        '.pk{fill:#b42b45;font-size:10.5px;font-weight:700}'
        '.fk{fill:#2440a8;font-size:10.5px;font-weight:700}'
        '.uq{fill:#0c7a52;font-size:10.5px;font-weight:700}'
        '.rel{fill:#15203a;font-size:13.5px;font-weight:700}'
        '.card{fill:#46527a;font-size:12px}'
        '.note{fill:#33406b;font-size:12.5px}'
        '.note-b{fill:#15203a;font-size:12.5px;font-weight:700}'
        '.h1{fill:#15203a;font-size:23px;font-weight:700}'
        '.sub{fill:#6b7691;font-size:13px}'
        '.legend{fill:#46527a;font-size:12px}'
        '</style>',
        '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#15203a" flood-opacity="0.13"/></filter>',
        '<marker id="many" markerWidth="1" markerHeight="1"/>',
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="#f5f7fb"/>',
        '<text class="h1" x="40" y="54">Entity Relationship Diagram (current schema)</text>',
        '<text class="sub" x="40" y="78">Event Registration System &#183; USERS / EVENTS / REGISTRATIONS &#183; '
        'crow&#8217;s-foot notation &#183; field-level anchors</text>',
    ]

    # ---------------------------- legend ----------------------------------- #
    lx, ly = 1030, 40
    parts += [
        f'<rect x="{lx}" y="{ly}" width="470" height="62" rx="10" fill="#fff" stroke="#dbe2f0"/>',
        f'<rect x="{lx+14}" y="{ly+14}" width="26" height="15" rx="4" fill="#fdeaee"/>'
        f'<text class="pk" x="{lx+21}" y="{ly+25}">PK</text>'
        f'<text class="legend" x="{lx+48}" y="{ly+26}">primary key</text>',
        f'<rect x="{lx+150}" y="{ly+14}" width="26" height="15" rx="4" fill="#e8eeff"/>'
        f'<text class="fk" x="{lx+157}" y="{ly+25}">FK</text>'
        f'<text class="legend" x="{lx+184}" y="{ly+26}">foreign key</text>',
        f'<rect x="{lx+290}" y="{ly+14}" width="26" height="15" rx="4" fill="#e6f7ef"/>'
        f'<text class="uq" x="{lx+294}" y="{ly+25}">UQ</text>'
        f'<text class="legend" x="{lx+324}" y="{ly+26}">unique</text>',
        f'<text class="legend" x="{lx+14}" y="{ly+48}">&#8226; NOT NULL unless marked NULL &#183; '
        '1 = exactly one &#183; 0..* = zero or many</text>',
    ]

    def entity(x, name, rows):
        """Draws a table box. rows: (field, type, key, nullable). Returns (parts, anchors)."""
        h = HEAD + ROW * len(rows)
        out = ['<g filter="url(#sh)">',
               f'<rect x="{x}" y="{Y}" width="{BOX_W}" height="{h}" rx="12" fill="#fff" stroke="#dbe2f0"/>',
               f'<path d="M{x} {Y+12} a12 12 0 0 1 12-12 h{BOX_W-24} a12 12 0 0 1 12 12 v{HEAD-12} h{-BOX_W} z" '
               f'fill="url(#hd)"/>',
               f'<text class="ent-title" x="{x+18}" y="{Y+33}">{name}</text>',
               '</g>']
        anchors = {}
        cy = Y + HEAD
        for i, (fname, ftype, key, nullable) in enumerate(rows):
            if i:
                out.append(f'<line x1="{x}" y1="{cy}" x2="{x+BOX_W}" y2="{cy}" stroke="#eef1f8"/>')
            if key:
                fill = {'PK': '#fdeaee', 'FK': '#e8eeff', 'UQ': '#e6f7ef'}[key]
                colour = {'PK': 'pk', 'FK': 'fk', 'UQ': 'uq'}[key]
                out.append(f'<rect x="{x+14}" y="{cy+9}" width="26" height="15" rx="4" fill="{fill}"/>'
                           f'<text class="{colour}" x="{x+21}" y="{cy+20}">{key}</text>')
            out.append(f'<text class="fld" x="{x+50}" y="{cy+22}">{fname}</text>')
            if nullable:
                out.append(f'<text class="typ" x="{x+BOX_W-14}" y="{cy+22}" text-anchor="end">'
                           f'{ftype} &#183; NULL</text>')
            else:
                out.append(f'<text class="typ" x="{x+BOX_W-14}" y="{cy+22}" text-anchor="end">{ftype}</text>')
            anchors[fname] = cy + ROW / 2
            cy += ROW
        return out, anchors

    users_svg, users_a = entity(X1, 'USERS', [
        ('user_id', 'INT AI', 'PK', False),
        ('full_name', 'VARCHAR(120)', None, False),
        ('email', 'VARCHAR(160)', 'UQ', False),
        ('password', 'VARCHAR(255) bcrypt', None, False),
        ('role', "ENUM('admin','participant')", None, False),
        ('reset_password_token', 'CHAR(64) sha256', None, True),
        ('reset_password_expires', 'DATETIME', None, True),
    ])
    reg_svg, reg_a = entity(X2, 'REGISTRATIONS', [
        ('registration_id', 'INT AI', 'PK', False),
        ('user_id', 'INT &#8594; USERS', 'FK', False),
        ('event_id', 'INT &#8594; EVENTS', 'FK', False),
        ('registration_date', 'DATETIME', None, False),
        ('status', "ENUM('confirmed','waitlisted','cancelled')", None, False),
    ])
    event_svg, event_a = entity(X3, 'EVENTS', [
        ('event_id', 'INT AI', 'PK', False),
        ('title', 'VARCHAR(180)', None, False),
        ('description', 'TEXT', None, True),
        ('event_date', 'DATETIME', None, False),
        ('venue', 'VARCHAR(180)', None, False),
        ('max_participants', 'INT &#8805; 1', None, False),
    ])

    # ------------------------- connectors (behind boxes) ------------------- #
    lines = []
    uy = users_a['user_id']
    ry_user = reg_a['user_id']
    ry_event = reg_a['event_id']
    ey = event_a['event_id']
    mid_left = (X1 + BOX_W + X2) / 2
    mid_right = (X2 + BOX_W + X3) / 2

    # USERS (1) ---< REGISTRATIONS (0..*): anchored to user_id on both sides
    lines += [
        f'<polyline points="{X1+BOX_W},{uy} {mid_left},{uy} {mid_left},{ry_user} {X2},{ry_user}" '
        'fill="none" stroke="#46527a" stroke-width="1.8"/>',
        # exactly-one bar near USERS
        f'<line x1="{X1+BOX_W+16}" y1="{uy-11}" x2="{X1+BOX_W+16}" y2="{uy+11}" stroke="#46527a" stroke-width="2.4"/>',
        # crow's foot at REGISTRATIONS.user_id (opening away from the box)
        f'<line x1="{X2}" y1="{ry_user-11}" x2="{X2-20}" y2="{ry_user}" stroke="#46527a" stroke-width="1.8"/>',
        f'<line x1="{X2}" y1="{ry_user+11}" x2="{X2-20}" y2="{ry_user}" stroke="#46527a" stroke-width="1.8"/>',
    ]

    # EVENTS (1) ---< REGISTRATIONS (0..*): anchored to event_id on both sides
    lines += [
        f'<polyline points="{X3},{ey} {mid_right},{ey} {mid_right},{ry_event} {X2+BOX_W},{ry_event}" '
        'fill="none" stroke="#46527a" stroke-width="1.8"/>',
        f'<line x1="{X3-16}" y1="{ey-11}" x2="{X3-16}" y2="{ey+11}" stroke="#46527a" stroke-width="2.4"/>',
        f'<line x1="{X2+BOX_W}" y1="{ry_event-11}" x2="{X2+BOX_W+20}" y2="{ry_event}" stroke="#46527a" stroke-width="1.8"/>',
        f'<line x1="{X2+BOX_W}" y1="{ry_event+11}" x2="{X2+BOX_W+20}" y2="{ry_event}" stroke="#46527a" stroke-width="1.8"/>',
    ]

    labels = [
        f'<text class="rel" x="{X1+BOX_W+26}" y="{uy-16}">1</text>',
        f'<text class="rel" x="{X2-46}" y="{ry_user-18}" text-anchor="end">0..*</text>',
        f'<text class="rel" x="{X3-30}" y="{ey-16}" text-anchor="end">1</text>',
        f'<text class="rel" x="{X2+BOX_W+30}" y="{ry_event-18}">0..*</text>',
    ]

    parts += lines + users_svg + reg_svg + event_svg + labels

    # --------------------------- summary strip ----------------------------- #
    by = 520
    parts += [
        f'<rect x="40" y="{by}" width="{W-80}" height="96" rx="14" fill="#fff" stroke="#dbe2f0"/>',
        f'<text class="rel" x="70" y="{by+36}">[USERS]</text>',
        f'<text class="rel" x="156" y="{by+36}">1</text>',
        f'<line x1="172" y1="{by+31}" x2="252" y2="{by+31}" stroke="#46527a" stroke-width="1.8"/>',
        f'<text class="rel" x="268" y="{by+36}">0..*</text>',
        f'<text class="rel" x="322" y="{by+36}">[REGISTRATIONS]</text>',
        f'<text class="rel" x="500" y="{by+36}">0..*</text>',
        f'<line x1="542" y1="{by+31}" x2="622" y2="{by+31}" stroke="#46527a" stroke-width="1.8"/>',
        f'<text class="rel" x="638" y="{by+36}">1</text>',
        f'<text class="rel" x="660" y="{by+36}">[EVENTS]</text>',
        f'<text class="card" x="70" y="{by+66}">A USER has zero or many REGISTRATIONS; each REGISTRATION belongs to exactly one USER '
        '(REGISTRATIONS.user_id is NOT NULL).</text>',
        f'<text class="card" x="70" y="{by+86}">An EVENT has zero or many REGISTRATIONS; each REGISTRATION is for exactly one EVENT '
        '(REGISTRATIONS.event_id is NOT NULL).</text>',
    ]

    # --------------------------- constraints ------------------------------- #
    ny = 636
    parts += [
        f'<rect x="40" y="{ny}" width="{W-80}" height="212" rx="14" fill="#e8eeff" stroke="#c6d3fb"/>',
        f'<text class="note-b" x="66" y="{ny+30}">Constraints and indexes shown in the database</text>',
        f'<text class="note" x="66" y="{ny+56}">'
        '<tspan font-weight="700">Duplicate rule:</tspan> UNIQUE (event_id, user_id) on REGISTRATIONS &#8212; '
        'one registration per participant per event (also backs the cancelled-then-reactivated flow).</text>',
        f'<text class="note" x="66" y="{ny+80}">'
        '<tspan font-weight="700">Capacity rule:</tspan> COUNT(status = &#8217;confirmed&#8217;) may never exceed '
        'EVENTS.max_participants; enforced in a transaction with row locking.</text>',
        f'<text class="note" x="66" y="{ny+104}">'
        '<tspan font-weight="700">Referential integrity:</tspan> REGISTRATIONS.user_id &#8594; USERS.user_id and '
        'REGISTRATIONS.event_id &#8594; EVENTS.event_id (ON DELETE CASCADE, ON UPDATE CASCADE).</text>',
        f'<text class="note" x="66" y="{ny+128}">'
        '<tspan font-weight="700">Indexes:</tspan> USERS(email UNIQUE, reset_password_token UNIQUE, role), '
        'EVENTS(event_date), REGISTRATIONS(event_id, status),</text>',
        f'<text class="note" x="66" y="{ny+148}">'
        'REGISTRATIONS(user_id, status), REGISTRATIONS(status, registration_date) for the waitlist FIFO queue.</text>',
        f'<text class="note" x="66" y="{ny+176}" fill="#8a3b12">'
        '<tspan font-weight="700">Normalisation caveat:</tspan> USERS still carries the single-use reset token. '
        'Because that token has its own key and lifetime, the</text>',
        f'<text class="note" x="66" y="{ny+196}" fill="#8a3b12">'
        'strictly 3NF form is a separate PASSWORD_RESET_TOKENS table &#8212; see docs/DATABASE-AUDIT.md for the '
        'proposed schema.</text>',
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
                  'Recompute confirmed count (COUNT)',
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
