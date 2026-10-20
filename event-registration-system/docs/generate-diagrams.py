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
    """Crow's-foot ERD for the CURRENT schema (8 tables).

    Improvements over the original diagram:
      * one row per real column, including the new tables (VENUES, ATTENDANCE,
        REGISTRATION_STATUS_CHANGES, AUDIT_LOGS, SESSIONS) and deleted_at;
      * every relationship line starts and ends on the FK/IPK row it describes
        (no arbitrary y coordinates);
      * solid lines = enforced foreign keys, dashed = nullable audit reference;
      * cardinality marks drawn on the correct end (1 bar / 0..1 circle /
        0..* crow's foot);
      * unique keys, indexes, soft delete and the 3NF notes are written on the
        diagram instead of a separate paragraph.
    """
    HEAD, ROW, BOX_W = 44, 30, 360
    W, H = 1500, 1470
    XA, XB, XC = 40, 560, 1080
    Y1, Y2, Y3 = 132, 480, 800

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'font-family="{FONT}">',
        '<defs>',
        '<linearGradient id="hd" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0%" stop-color="#26407a"/><stop offset="100%" stop-color="#2f5bff"/></linearGradient>',
        '<style>'
        '.ent-title{fill:#fff;font-size:16px;font-weight:700;letter-spacing:.05em}'
        '.fld{fill:#15203a;font-size:13px}'
        '.typ{fill:#6b7691;font-size:11px}'
        '.pk{fill:#b42b45;font-size:10px;font-weight:700}'
        '.fk{fill:#2440a8;font-size:10px;font-weight:700}'
        '.uq{fill:#0c7a52;font-size:10px;font-weight:700}'
        '.rel{fill:#15203a;font-size:12.5px;font-weight:700}'
        '.card{fill:#46527a;font-size:11.5px}'
        '.note{fill:#33406b;font-size:12px}'
        '.note-b{fill:#15203a;font-size:12.5px;font-weight:700}'
        '.h1{fill:#15203a;font-size:22px;font-weight:700}'
        '.sub{fill:#6b7691;font-size:12.5px}'
        '.legend{fill:#46527a;font-size:11.5px}'
        '</style>',
        '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#15203a" flood-opacity="0.12"/></filter>',
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="#f5f7fb"/>',
        '<text class="h1" x="40" y="48">Entity Relationship Diagram — Event Registration System</text>',
        '<text class="sub" x="40" y="72">8 tables · crow&#8217;s-foot notation · solid = enforced foreign key, '
        'dashed = nullable audit reference</text>',
    ]

    def entity(x, y, name, rows):
        """rows: (field, type, key, nullable); key in {PK, FK, UQ, FK/UQ, None}."""
        h = HEAD + ROW * len(rows)
        out = ['<g filter="url(#sh)">',
               f'<rect x="{x}" y="{y}" width="{BOX_W}" height="{h}" rx="11" fill="#fff" stroke="#dbe2f0"/>',
               f'<path d="M{x} {y+11} a11 11 0 0 1 11-11 h{BOX_W-22} a11 11 0 0 1 11 11 v{HEAD-11} h{-BOX_W} z" '
               'fill="url(#hd)"/>',
               f'<text class="ent-title" x="{x+16}" y="{y+29}">{name}</text>',
               '</g>']
        anchors = {}
        cy = y + HEAD
        for i, (fname, ftype, key, nullable) in enumerate(rows):
            if i:
                out.append(f'<line x1="{x}" y1="{cy}" x2="{x+BOX_W}" y2="{cy}" stroke="#eef1f8"/>')
            if key:
                label = 'UQ' if key == 'UQ' else ('FK' if key == 'FK' else 'PK')
                if key == 'FK/UQ':
                    label = 'UQ'
                fill = {'PK': '#fdeaee', 'FK': '#e8eeff', 'UQ': '#e6f7ef', 'FK/UQ': '#e6f7ef'}[key]
                colour = {'PK': 'pk', 'FK': 'fk', 'UQ': 'uq', 'FK/UQ': 'uq'}[key]
                out.append(f'<rect x="{x+12}" y="{cy+8}" width="24" height="14" rx="4" fill="{fill}"/>'
                           f'<text class="{colour}" x="{x+18}" y="{cy+19}">{label}</text>')
            out.append(f'<text class="fld" x="{x+46}" y="{cy+20}">{fname}</text>')
            type_text = f'{ftype} &#183; NULL' if nullable else ftype
            out.append(f'<text class="typ" x="{x+BOX_W-12}" y="{cy+20}" text-anchor="end">{type_text}</text>')
            anchors[fname] = cy + ROW / 2
            cy += ROW
        return out, anchors, h

    users_svg, U, users_h = entity(XA, Y1, 'USERS', [
        ('user_id', 'INT AI', 'PK', False),
        ('full_name', 'VARCHAR(120)', None, False),
        ('email', 'VARCHAR(160)', 'UQ', False),
        ('password', 'VARCHAR(255) bcrypt', None, False),
        ('role', "ENUM('admin','participant')", None, False),
        ('reset_password_token', 'CHAR(64) sha256', None, True),
        ('reset_password_expires', 'DATETIME', None, True),
    ])
    reg_svg, R, _ = entity(XB, Y1, 'REGISTRATIONS', [
        ('registration_id', 'INT AI', 'PK', False),
        ('user_id', 'INT &#8594; USERS', 'FK', False),
        ('event_id', 'INT &#8594; EVENTS', 'FK', False),
        ('registration_date', 'DATETIME', None, False),
        ('status', "ENUM('confirmed','waitlisted','cancelled')", None, False),
    ])
    events_svg, E, _ = entity(XC, Y1, 'EVENTS', [
        ('event_id', 'INT AI', 'PK', False),
        ('title', 'VARCHAR(180)', None, False),
        ('description', 'TEXT', None, True),
        ('event_date', 'DATETIME', None, False),
        ('venue_id', 'INT &#8594; VENUES', 'FK', False),
        ('max_participants', 'INT &#8805; 1', None, False),
        ('deleted_at', 'DATETIME (soft delete)', None, True),
    ])
    audit_svg, A, _ = entity(XA, Y2, 'AUDIT_LOGS', [
        ('log_id', 'BIGINT AI', 'PK', False),
        ('actor_id', 'INT &#8594; USERS', 'FK', True),
        ('action', 'VARCHAR(60)', None, False),
        ('entity', 'VARCHAR(60)', None, False),
        ('entity_id', 'VARCHAR(60)', None, True),
        ('detail', 'JSON/TEXT', None, True),
        ('created_at', 'DATETIME', None, False),
    ])
    rsc_svg, S, _ = entity(XB, Y2, 'REGISTRATION_STATUS_CHANGES', [
        ('change_id', 'INT AI', 'PK', False),
        ('registration_id', 'INT &#8594; REGISTRATIONS', 'FK', False),
        ('from_status', 'VARCHAR(20)', None, True),
        ('to_status', 'VARCHAR(20)', None, False),
        ('changed_at', 'DATETIME', None, False),
        ('changed_by', 'INT &#8594; USERS', 'FK', True),
        ('reason', 'VARCHAR(255)', None, True),
    ])
    venues_svg, V, _ = entity(XC, Y2, 'VENUES', [
        ('venue_id', 'INT AI', 'PK', False),
        ('name', 'VARCHAR(180)', 'UQ', False),
        ('address', 'VARCHAR(255)', None, True),
        ('city', 'VARCHAR(120)', 'UQ', False),
    ])
    sessions_svg, SS, _ = entity(XC, Y3, 'SESSIONS', [
        ('sid', 'VARCHAR(64)', 'PK', False),
        ('data', 'TEXT (session JSON)', None, False),
        ('expires_at', 'DATETIME', None, False),
    ])
    att_svg, AT, _ = entity(XB, Y3, 'ATTENDANCE', [
        ('attendance_id', 'INT AI', 'PK', False),
        ('registration_id', 'INT &#8594; REGISTRATIONS', 'FK/UQ', False),
        ('checked_in_at', 'DATETIME', None, False),
        ('checked_in_by', 'INT &#8594; USERS', 'FK', True),
        ('remarks', 'VARCHAR(255)', None, True),
    ])

    # ------------------------------- marks --------------------------------- #
    def bar_v(x, y):
        return f'<line x1="{x}" y1="{y-10}" x2="{x}" y2="{y+10}" stroke="#46527a" stroke-width="2.4"/>'

    def bar_h(x, y):
        return f'<line x1="{x-10}" y1="{y}" x2="{x+10}" y2="{y}" stroke="#46527a" stroke-width="2.4"/>'

    def crow_h(x, y, direction):
        """Crow's foot whose prongs touch the entity edge at (x, y)."""
        tip = x + direction * 20
        return (
            f'<line x1="{x}" y1="{y-10}" x2="{tip}" y2="{y}" stroke="#46527a" stroke-width="1.8"/>'
            f'<line x1="{x}" y1="{y+10}" x2="{tip}" y2="{y}" stroke="#46527a" stroke-width="1.8"/>'
        )

    def crow_v(x, y, direction):
        """Crow's foot whose prongs touch the entity edge at (x, y); the foot
        opens away from the box, so pass -1 for an entity below the line."""
        tip = y + direction * 20
        return (
            f'<line x1="{x-10}" y1="{y}" x2="{x}" y2="{tip}" stroke="#46527a" stroke-width="1.8"/>'
            f'<line x1="{x+10}" y1="{y}" x2="{x}" y2="{tip}" stroke="#46527a" stroke-width="1.8"/>'
        )

    def circle(x, y):
        return f'<circle cx="{x}" cy="{y}" r="5" fill="#fff" stroke="#46527a" stroke-width="1.8"/>'

    def line(points, dashed=False):
        d = ' '.join(('M' if i == 0 else 'L') + f'{px} {py}' for i, (px, py) in enumerate(points))
        dash = ' stroke-dasharray="7 5"' if dashed else ''
        return f'<path d="{d}" fill="none" stroke="#46527a" stroke-width="1.7"{dash}/>'

    def label(x, y, text, anchor='middle', cls='rel'):
        return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{text}</text>'

    A_RIGHT, B_LEFT, B_RIGHT, C_LEFT = XA + BOX_W, XB, XB + BOX_W, XC
    BOX_BOTTOM_1 = Y1 + HEAD + ROW * 7
    lines = []

    # 1. USERS (1) ---< REGISTRATIONS (0..*), anchored on user_id
    rail = 462
    lines.append(line([(A_RIGHT, U['user_id']), (rail, U['user_id']), (rail, R['user_id']), (B_LEFT, R['user_id'])]))
    lines.append(bar_v(A_RIGHT + 14, U['user_id']))
    lines.append(crow_h(B_LEFT, R['user_id'], -1))
    lines.append(label(A_RIGHT + 22, U['user_id'] - 12, '1'))
    lines.append(label(B_LEFT - 34, R['user_id'] - 13, '0..*'))

    # 2. EVENTS (1) ---< REGISTRATIONS (0..*), anchored on event_id
    rail2 = 962
    lines.append(line([(C_LEFT, E['event_id']), (rail2, E['event_id']), (rail2, R['event_id']), (B_RIGHT, R['event_id'])]))
    lines.append(bar_h(C_LEFT - 14, E['event_id']))
    lines.append(crow_h(B_RIGHT, R['event_id'], 1))
    lines.append(label(C_LEFT - 22, E['event_id'] - 12, '1', 'end'))
    lines.append(label(B_RIGHT + 34, R['event_id'] - 13, '0..*', 'start'))

    # 3. VENUES (1) ---< EVENTS (0..*), vertical inside column C
    vx = XC + 150
    ev_bottom = Y1 + HEAD + ROW * 7
    lines.append(line([(vx, ev_bottom), (vx, Y2)]))
    lines.append(bar_h(vx, Y2 - 12))
    lines.append(crow_v(vx, ev_bottom, 1))
    lines.append(label(vx + 14, ev_bottom + 24, '0..*', 'start'))
    lines.append(label(vx + 14, Y2 - 20, '1', 'start'))

    # 4. REGISTRATIONS (1) ---< REGISTRATION_STATUS_CHANGES (0..*)
    rx = XB + 130
    reg_bottom = Y1 + HEAD + ROW * 5
    lines.append(line([(rx, reg_bottom), (rx, Y2)]))
    lines.append(bar_v(rx, reg_bottom + 12))
    lines.append(crow_v(rx, Y2, -1))
    lines.append(label(rx + 14, reg_bottom + 26, '1', 'start'))
    lines.append(label(rx + 14, Y2 - 22, '0..*', 'start'))

    # 5. REGISTRATIONS (1) ---o ATTENDANCE (0..1) routed through the corridor
    corridor = 1000
    att_y = AT['registration_id']
    lines.append(line([(XB + 250, reg_bottom), (XB + 250, 420), (corridor, 420), (corridor, att_y), (B_RIGHT, att_y)]))
    lines.append(bar_v(XB + 250, reg_bottom + 12))
    lines.append(circle(B_RIGHT - 16, att_y))
    lines.append(label(corridor + 14, 412, '0..1', 'start', 'rel'))

    # 6. USERS (1) ---< AUDIT_LOGS (0..*), vertical inside column A
    ax = XA + 120
    lines.append(line([(ax, Y1 + HEAD + ROW * 7), (ax, Y2)]))
    lines.append(bar_h(ax, Y1 + HEAD + ROW * 7 + 12))
    lines.append(crow_v(ax, Y2, -1))
    lines.append(label(ax + 14, Y1 + HEAD + ROW * 7 + 32, '1', 'start'))
    lines.append(label(ax + 14, Y2 - 22, '0..*', 'start'))

    # 7. USERS (1) ---< REGISTRATION_STATUS_CHANGES (changed_by, dashed)
    rail3 = 500
    lines.append(line([(A_RIGHT, 372), (rail3, 372), (rail3, S['changed_by']), (B_LEFT, S['changed_by'])], dashed=True))
    lines.append(crow_h(B_LEFT, S['changed_by'], -1))
    lines.append(bar_v(A_RIGHT + 14, 372))


    notes = []
    parts += lines + users_svg + reg_svg + events_svg + audit_svg + rsc_svg + venues_svg + sessions_svg + att_svg
    parts += notes

    # ------------------------------- legend -------------------------------- #
    ly = 84
    parts += [
        f'<rect x="{W-470}" y="{ly}" width="430" height="54" rx="9" fill="#fff" stroke="#dbe2f0"/>',
        f'<rect x="{W-456}" y="{ly+13}" width="24" height="14" rx="4" fill="#fdeaee"/>'
        f'<text class="pk" x="{W-450}" y="{ly+24}">PK</text>'
        f'<text class="legend" x="{W-426}" y="{ly+25}">primary key</text>',
        f'<rect x="{W-336}" y="{ly+13}" width="24" height="14" rx="4" fill="#e8eeff"/>'
        f'<text class="fk" x="{W-330}" y="{ly+24}">FK</text>'
        f'<text class="legend" x="{W-306}" y="{ly+25}">foreign key</text>',
        f'<rect x="{W-216}" y="{ly+13}" width="24" height="14" rx="4" fill="#e6f7ef"/>'
        f'<text class="uq" x="{W-210}" y="{ly+24}">UQ</text>'
        f'<text class="legend" x="{W-186}" y="{ly+25}">unique key</text>',
        f'<line x1="{W-116}" y1="{ly+21}" x2="{W-86}" y2="{ly+21}" stroke="#46527a" stroke-width="1.7"/>'
        f'<text class="legend" x="{W-80}" y="{ly+25}">1</text>',
        f'<text class="legend" x="{W-64}" y="{ly+25}">bar</text>',
        f'<text class="legend" x="{W-456}" y="{ly+44}">0..* = zero or many &#183; 0..1 = optional one &#183; '
        'dashed = nullable audit reference</text>',
    ]

    # --------------------------- constraints ------------------------------- #
    ny = 1010
    parts += [
        f'<rect x="40" y="{ny}" width="{W-80}" height="382" rx="14" fill="#e8eeff" stroke="#c6d3fb"/>',
        f'<text class="note-b" x="66" y="{ny+30}">Keys, constraints and rules enforced by the schema</text>',
        f'<text class="note" x="66" y="{ny+56}"><tspan font-weight="700">Duplicate rule:</tspan> '
        'UNIQUE (event_id, user_id) on REGISTRATIONS &#8212; one registration per participant per event.</text>',
        f'<text class="note" x="66" y="{ny+80}"><tspan font-weight="700">Capacity rule:</tspan> '
        "COUNT(status = 'confirmed') may never exceed EVENTS.max_participants; checked inside a transaction "
        'with a row lock.</text>',
        f'<text class="note" x="66" y="{ny+104}"><tspan font-weight="700">Attendance rule:</tspan> '
        'UNIQUE (registration_id) on ATTENDANCE &#8212; a participant can be checked in only once, and only '
        'while confirmed.</text>',
        f'<text class="note" x="66" y="{ny+128}"><tspan font-weight="700">Venue rule:</tspan> '
        'UNIQUE (name, city) on VENUES; EVENTS.venue_id is NOT NULL, so the venue name is stored once.</text>',
        f'<text class="note" x="66" y="{ny+152}"><tspan font-weight="700">Referential integrity:</tspan> '
        'REGISTRATIONS &#8594; USERS/EVENTS, ATTENDANCE &#8594; REGISTRATIONS, '
        'REGISTRATION_STATUS_CHANGES &#8594; REGISTRATIONS &#8594; ON DELETE CASCADE;</text>',
        f'<text class="note" x="66" y="{ny+172}">AUDIT_LOGS.actor_id and the audit columns use ON DELETE SET NULL '
        'so history survives a deleted user.</text>',
        f'<text class="note" x="66" y="{ny+196}"><tspan font-weight="700">Soft delete:</tspan> '
        'EVENTS.deleted_at keeps an archived event&#8217;s registrations, attendance and status history '
        'available for reports.</text>',
        f'<text class="note" x="66" y="{ny+220}"><tspan font-weight="700">Indexes:</tspan> '
        'USERS(email UQ, reset_password_token UQ, role), VENUES(name, city UQ), EVENTS(event_date, venue_id),</text>',
        f'<text class="note" x="66" y="{ny+240}">REGISTRATIONS(event_id,status), (user_id,status), '
        '(status,registration_date) &#8212; the FIFO waitlist queue; ATTENDANCE(registration_id UQ);</text>',
        f'<text class="note" x="66" y="{ny+260}">REGISTRATION_STATUS_CHANGES(registration_id, changed_at); '
        'AUDIT_LOGS(entity, entity_id), (created_at); SESSIONS(expires_at).</text>',
        f'<text class="note" x="66" y="{ny+286}"><tspan font-weight="700">SESSIONS:</tspan> '
        'no foreign key &#8212; it stores the serialised express-session payload and is purged by expiry.</text>',
        f'<text class="note" x="66" y="{ny+318}" fill="#8a3b12"><tspan font-weight="700">Normalisation:</tspan> '
        '1NF/2NF/3NF are satisfied for every table shown; the one remaining 3NF exception is the single-use '
        'reset token on USERS.</text>',
        f'<text class="note" x="66" y="{ny+344}" fill="#8a3b12">'
        'A stricter variant (PASSWORD_RESET_TOKENS, lookup tables, NOTIFICATIONS) is proposed in '
        'docs/schema-3nf.sql.</text>',
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
