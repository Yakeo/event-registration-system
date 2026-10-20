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

# A locally-installed fallback is listed explicitly: the PNG is rendered with
# resvg, which does not synthesise a generic "sans-serif" and would otherwise
# draw an empty diagram.
FONT = "'Segoe UI','DejaVu Sans',Arial,Helvetica,sans-serif"
MONO = "'Consolas','DejaVu Sans Mono','Courier New',monospace"


# --------------------------------------------------------------------------- #
#                                ERD                                          #
# --------------------------------------------------------------------------- #
def erd():
    """Crow's-foot ERD for the CURRENT schema (10 tables).

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
    W, H = 1500, 1850
    XA, XB, XC = 40, 560, 1080
    Y1, Y2, Y3, Y4 = 132, 480, 800, 1170

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
        '<text class="sub" x="40" y="72">10 tables &#183; crow&#8217;s-foot notation &#183; solid = enforced '
        'foreign key, dashed = nullable reference (audit trail and outbox)</text>',
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
        ('password', 'VARCHAR(255) bcrypt &#183; NULL', None, True),
        ('claimed_at', 'DATETIME', None, True),
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
    sessions_svg, SS, _ = entity(XA, Y4, 'SESSIONS', [
        ('sid', 'VARCHAR(64)', 'PK', False),
        ('data', 'TEXT (session JSON)', None, False),
        ('expires_at', 'DATETIME', None, False),
    ])
    manage_svg, MT, _ = entity(XA, Y3, 'MANAGE_TOKENS', [
        ('token_id', 'INT AI', 'PK', False),
        ('token_hash', 'CHAR(64) sha256', 'UQ', False),
        ('user_id', 'INT &#8594; USERS', 'FK', False),
        ('registration_id', 'INT &#8594; REGISTRATIONS', 'FK', True),
        ('expires_at', 'DATETIME', None, False),
        ('used_at', 'DATETIME', None, True),
        ('created_at', 'DATETIME', None, False),
    ])
    notif_svg, N, _ = entity(XC, Y3, 'NOTIFICATIONS', [
        ('notification_id', 'INT AI', 'PK', False),
        ('user_id', 'INT &#8594; USERS', 'FK', True),
        ('email', 'VARCHAR(160)', None, False),
        ('kind', "VARCHAR(40) enum-ish", None, False),
        ('registration_id', 'INT &#8594; REGISTRATIONS', 'FK', True),
        ('event_id', 'INT &#8594; EVENTS', 'FK', True),
        ('payload', 'TEXT json', None, True),
        ('status', "VARCHAR(10) queued/sent/failed", None, False),
        ('attempts', 'INT default 0', None, False),
        ('last_error', 'VARCHAR(255)', None, True),
        ('created_at', 'DATETIME', None, False),
        ('sent_at', 'DATETIME', None, True),
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
    # USERS now has 8 rows (guest accounts carry claimed_at)
    USERS_BOTTOM = Y1 + HEAD + ROW * 8
    lines, notes = [], []

    # 1. USERS (1) ---< REGISTRATIONS (0..*), anchored on user_id
    rail = 462
    lines.append(line([(A_RIGHT, U['user_id']), (rail, U['user_id']), (rail, R['user_id']), (B_LEFT, R['user_id'])]))
    lines.append(bar_v(A_RIGHT + 14, U['user_id']))
    lines.append(crow_h(B_LEFT, R['user_id'], -1))
    lines.append(label(A_RIGHT + 22, U['user_id'] - 12, '1'))
    lines.append(label(rail + 16, R['user_id'] - 11, '0..*', 'start'))

    # 2. EVENTS (1) ---< REGISTRATIONS (0..*), anchored on event_id
    rail2 = 962
    lines.append(line([(C_LEFT, E['event_id']), (rail2, E['event_id']), (rail2, R['event_id']), (B_RIGHT, R['event_id'])]))
    lines.append(bar_h(C_LEFT - 14, E['event_id']))
    lines.append(crow_h(B_RIGHT, R['event_id'], 1))
    lines.append(label(C_LEFT - 22, E['event_id'] - 12, '1', 'end'))
    lines.append(label(B_RIGHT + 26, R['event_id'] - 11, '0..*', 'start'))

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
    lines.append(line([(ax, USERS_BOTTOM), (ax, Y2)]))
    lines.append(bar_h(ax, USERS_BOTTOM + 12))
    lines.append(crow_v(ax, Y2, -1))
    lines.append(label(ax + 14, USERS_BOTTOM + 32, '1', 'start'))
    lines.append(label(ax + 14, Y2 - 22, '0..*', 'start'))

    # 7. USERS (1) ---< REGISTRATION_STATUS_CHANGES (changed_by, dashed)
    rail3 = 500
    changed_by_y = U['reset_password_expires']
    lines.append(line([(A_RIGHT, changed_by_y), (rail3, changed_by_y), (rail3, S['changed_by']),
                       (B_LEFT, S['changed_by'])], dashed=True))
    lines.append(crow_h(B_LEFT, S['changed_by'], -1))
    lines.append(bar_v(A_RIGHT + 14, changed_by_y))

    # 8. USERS (1) ---< MANAGE_TOKENS (0..*), down the A/B corridor
    mt_u = MT['user_id']
    corridor_a = 440
    lines.append(line([(A_RIGHT, mt_u), (corridor_a, mt_u), (corridor_a, U['claimed_at']),
                       (A_RIGHT, U['claimed_at'])]))
    lines.append(bar_v(A_RIGHT + 14, U['claimed_at']))
    lines.append(crow_h(A_RIGHT, mt_u, 1))
    lines.append(label(corridor_a - 12, U['claimed_at'] + 22, '1', 'end'))
    lines.append(label(A_RIGHT + 14, mt_u - 13, '0..*', 'start'))

    # 9. REGISTRATIONS (1) ---< MANAGE_TOKENS (0..*), nullable registration_id
    mt_r = MT['registration_id']
    corridor_b = 512
    lines.append(line([(A_RIGHT, mt_r), (corridor_b, mt_r), (corridor_b, R['status']),
                       (B_LEFT, R['status'])], dashed=True))
    lines.append(crow_h(B_LEFT, R['status'], -1))
    lines.append(label(corridor_b + 12, mt_r - 11, '0..1', 'start'))
    lines.append(label(corridor_b + 12, R['status'] + 22, '0..*', 'start'))

    # 10. REGISTRATIONS (1) ---< NOTIFICATIONS (0..*), dashed: nullable FK
    nf_r = N['registration_id']
    corridor_c = 1044
    lines.append(line([(C_LEFT, nf_r), (corridor_c, nf_r), (corridor_c, R['registration_id']),
                       (B_RIGHT, R['registration_id'])], dashed=True))
    lines.append(crow_h(B_RIGHT, R['registration_id'], 1))
    lines.append(label(corridor_c - 12, nf_r - 11, '0..*', 'end'))

    # USERS / EVENTS are also nullable references from the outbox: a short note
    # next to the box keeps the diagram readable instead of adding two long rails.
    notes.append(f'<text class="card" x="{XC}" y="{Y3 + HEAD + ROW*12 + 26}">dashed FK: '
                 f'user_id &#8594; USERS, event_id &#8594; EVENTS (both nullable)</text>')


    notes += [f'<text class="card" x="{XA + BOX_W + 24}" y="{Y4 + 60}">express-session payload</text>',
              f'<text class="card" x="{XA + BOX_W + 24}" y="{Y4 + 82}">purged on expiry &#183; '
              f'no foreign key</text>',
              f'<text class="card" x="{XA + BOX_W + 24}" y="{Y4 + 104}">(table kept for the '
              f'session store)</text>']
    parts += lines + users_svg + reg_svg + events_svg + audit_svg + rsc_svg + venues_svg
    parts += sessions_svg + att_svg + manage_svg + notif_svg
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
        'dashed = nullable reference</text>',
    ]

    parts.append('</svg>')
    return '\n'.join(parts)


# --------------------------------------------------------------------------- #
#                             FLOWCHART                                       #
# --------------------------------------------------------------------------- #
#  ISO 5807 / ANSI X3.5 symbols, one A4 portrait sheet per actor:
#
#     terminal  = start / stop                io       = input / output (parallelogram)
#     process   = work done by the server      db       = stored data (cylinder)
#     decision  = branch                       predef   = named subroutine (double bar)
#     document  = printed or e-mailed artefact  connector = off-page link (A, B, C)
#
#  Every cylinder names the table and the statement it runs, because the point
#  of the diagram is the data flow, not the screens.
# --------------------------------------------------------------------------- #
INK = '#1b2536'
EDGE = '#2b3a55'
MUTED = '#5d6b85'
DB_FILL = '#eaf1fb'
DB_EDGE = '#2f4f86'
DEC_FILL = '#fffdf3'
DOC_FILL = '#f7f9fc'
W_SHEET, H_SHEET = 794, 1123        # A4 portrait at 96 dpi

GAP = 8


def _sheet_open():
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W_SHEET} {H_SHEET}" '
        f'width="{W_SHEET}" height="{H_SHEET}" font-family="{FONT}">',
        '<defs>',
        '<style>',
        '.t-term{fill:#fff;font-size:11.5px;font-weight:700;letter-spacing:.03em}',
        f'.t-proc{{fill:{INK};font-size:10.5px;font-weight:600}}',
        f'.t-db{{fill:{DB_EDGE};font-size:9.6px;font-weight:700;letter-spacing:.02em}}',
        f'.t-ops{{fill:{INK};font-size:8.7px}}',
        f'.t-tbl{{fill:#7a869c;font-size:7.6px}}',
        f'.t-lab{{fill:{MUTED};font-size:8.8px}}',
        '.t-yes{fill:#0c6b4a;font-size:9px;font-weight:700}',
        '.t-no{fill:#a52a3d;font-size:9px;font-weight:700}',
        f'.t-h1{{fill:{INK};font-size:15px;font-weight:700}}',
        f'.t-sub{{fill:{MUTED};font-size:8.8px}}',
        f'.t-con{{fill:{INK};font-size:9.5px;font-weight:700}}',
        f'.t-leg{{fill:{MUTED};font-size:8.2px}}',
        '</style>',
        '<marker id="ah" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">'
        f'<path d="M0 0 L9 3.5 L0 7 z" fill="{EDGE}"/></marker>',
        '</defs>',
        f'<rect width="{W_SHEET}" height="{H_SHEET}" fill="#ffffff"/>',
    ]


def _sheet_title(parts, no, title, subtitle):
    parts += [
        f'<text class="t-h1" x="40" y="44">{title}</text>',
        f'<text class="t-sub" x="40" y="61">{subtitle}</text>',
        f'<text class="t-sub" x="{W_SHEET-40}" y="44" text-anchor="end">Sheet {no} of 3</text>',
        f'<line x1="40" y1="70" x2="{W_SHEET-40}" y2="70" stroke="#dfe5ef"/>',
    ]


# --------------------------------- shapes ---------------------------------- #
def s_term(cx, y, text, w=220):
    h = 36
    out = [f'<rect x="{cx-w/2}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="{EDGE}"/>',
           f'<text class="t-term" x="{cx}" y="{y+h/2+4}" text-anchor="middle">{text}</text>']
    return out, h


def s_proc(cx, y, lines, w=300):
    lines = [lines] if isinstance(lines, str) else lines
    h = 20 + 14 * len(lines) + 10
    out = [f'<rect x="{cx-w/2}" y="{y}" width="{w}" height="{h}" rx="3" fill="#ffffff" '
           f'stroke="{EDGE}" stroke-width="1.5"/>']
    first = y + h / 2 - (len(lines) - 1) * 7 + 3.5
    for i, line in enumerate(lines):
        out.append(f'<text class="t-proc" x="{cx}" y="{first + i*14}" text-anchor="middle">{line}</text>')
    return out, h


def s_io(cx, y, lines, w=300, skew=14):
    lines = [lines] if isinstance(lines, str) else lines
    h = 20 + 14 * len(lines) + 10
    l, r = cx - w / 2, cx + w / 2
    d = f'M{l+skew} {y} L{r} {y} L{r-skew} {y+h} L{l} {y+h} Z'
    out = [f'<path d="{d}" fill="#ffffff" stroke="{EDGE}" stroke-width="1.5"/>']
    first = y + h / 2 - (len(lines) - 1) * 7 + 3.5
    for i, line in enumerate(lines):
        out.append(f'<text class="t-proc" x="{cx}" y="{first + i*14}" text-anchor="middle">{line}</text>')
    return out, h


def s_db(cx, y, title, ops, tag=None, w=300):
    """Cylinder (stored data). `title` and `ops` are plain English; `tag` names
    the table(s) the step touches."""
    titles = [title] if isinstance(title, str) else title
    rx, ry = w / 2, 7
    h = 20 + 12 * len(titles) + 13 * len(ops) + 12 + (11 if tag else 0)
    x = cx - rx
    d = (f'M{x} {y+ry} A{rx} {ry} 0 0 1 {x+w} {y+ry} '
         f'L{x+w} {y+h-ry} A{rx} {ry} 0 0 1 {x} {y+h-ry} Z')
    out = [f'<path d="{d}" fill="{DB_FILL}" stroke="{DB_EDGE}" stroke-width="1.4"/>',
           f'<path d="M{x} {y+ry} A{rx} {ry} 0 0 0 {x+w} {y+ry}" fill="none" '
           f'stroke="{DB_EDGE}" stroke-width="1.1"/>']
    for i, t in enumerate(titles):
        out.append(f'<text class="t-db" x="{cx}" y="{y+22+i*12}" text-anchor="middle">{t}</text>')
    top = y + 28 + 12 * (len(titles) - 1)
    if tag:
        out.append(f'<text class="t-tbl" x="{cx}" y="{top+7}" text-anchor="middle">{tag}</text>')
        top += 11
    for i, op in enumerate(ops):
        out.append(f'<text class="t-ops" x="{cx}" y="{top+15+i*13}" text-anchor="middle">{op}</text>')
    return out, h


def s_dec(cx, y, lines, w=250, h=66):
    lines = [lines] if isinstance(lines, str) else lines
    l, r = cx - w / 2, cx + w / 2
    d = f'M{cx} {y} L{r} {y+h/2} L{cx} {y+h} L{l} {y+h/2} Z'
    out = [f'<path d="{d}" fill="{DEC_FILL}" stroke="{EDGE}" stroke-width="1.5"/>']
    first = y + h / 2 - (len(lines) - 1) * 6 + 3.5
    for i, line in enumerate(lines):
        out.append(f'<text class="t-proc" x="{cx}" y="{first + i*12}" text-anchor="middle">{line}</text>')
    return out, h


def s_predef(cx, y, lines, w=260):
    lines = [lines] if isinstance(lines, str) else lines
    h = 20 + 13 * len(lines) + 8
    x = cx - w / 2
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#ffffff" stroke="{EDGE}" '
           f'stroke-width="1.5"/>',
           f'<line x1="{x+11}" y1="{y}" x2="{x+11}" y2="{y+h}" stroke="{EDGE}" stroke-width="1.1"/>',
           f'<line x1="{x+w-11}" y1="{y}" x2="{x+w-11}" y2="{y+h}" stroke="{EDGE}" stroke-width="1.1"/>']
    first = y + h / 2 - (len(lines) - 1) * 6 + 3.5
    for i, line in enumerate(lines):
        out.append(f'<text class="t-proc" x="{cx}" y="{first + i*12}" text-anchor="middle">{line}</text>')
    return out, h


def s_doc(cx, y, lines, w=300):
    lines = [lines] if isinstance(lines, str) else lines
    h = 22 + 13 * len(lines) + 10
    x = cx - w / 2
    d = (f'M{x} {y} L{x+w} {y} L{x+w} {y+h-10} '
         f'Q{x+w*0.75} {y+h-22} {cx} {y+h-10} Q{x+w*0.25} {y+h+2} {x} {y+h-10} Z')
    out = [f'<path d="{d}" fill="{DOC_FILL}" stroke="{EDGE}" stroke-width="1.5"/>']
    first = y + 17 + (0 if len(lines) == 1 else 2)
    for i, line in enumerate(lines):
        out.append(f'<text class="t-proc" x="{cx}" y="{first+i*13}" text-anchor="middle">{line}</text>')
    return out, h


def s_conn(cx, cy, letter, r=12):
    return [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#ffffff" stroke="{EDGE}" stroke-width="1.5"/>',
            f'<text class="t-con" x="{cx}" y="{cy+3.5}" text-anchor="middle">{letter}</text>'], 2 * r


def s_wire(points, dashed=False, arrow=True):
    d = ' '.join(('M' if i == 0 else 'L') + f'{x} {y}' for i, (x, y) in enumerate(points))
    dash = ' stroke-dasharray="5 4"' if dashed else ''
    head = ' marker-end="url(#ah)"' if arrow else ''
    return f'<path d="{d}" fill="none" stroke="{EDGE}" stroke-width="1.4"{dash}{head}/>'


def s_lbl(x, y, text, cls='t-lab', anchor='middle'):
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{text}</text>'


def s_legend(y):
    out = [f'<line x1="40" y1="{y}" x2="{W_SHEET-40}" y2="{y}" stroke="#dfe5ef"/>',
           f'<text class="t-leg" x="40" y="{y+16}">Symbols (ISO 5807 / ANSI X3.5):</text>']
    x, cy = 132, y + 36
    items = ['term', 'proc', 'io', 'db', 'dec', 'predef', 'doc']
    names = ['start / end', 'process', 'input / output', 'stored data', 'decision',
             'subroutine', 'document']
    for kind, name in zip(items, names):
        if kind == 'term':
            out.append(f'<rect x="{x-17}" y="{cy-8}" width="34" height="16" rx="8" fill="{EDGE}"/>')
        elif kind == 'proc':
            out.append(f'<rect x="{x-16}" y="{cy-8}" width="32" height="16" fill="#fff" stroke="{EDGE}"/>')
        elif kind == 'io':
            out.append(f'<path d="M{x-10} {cy-8} L{x+18} {cy-8} L{x+10} {cy+8} L{x-18} {cy+8} Z" '
                       f'fill="#fff" stroke="{EDGE}"/>')
        elif kind == 'db':
            out.append(f'<path d="M{x-15} {cy-6} A15 4 0 0 1 {x+15} {cy-6} L{x+15} {cy+6} '
                       f'A15 4 0 0 1 {x-15} {cy+6} Z" fill="{DB_FILL}" stroke="{DB_EDGE}"/>')
        elif kind == 'dec':
            out.append(f'<path d="M{x} {cy-9} L{x+19} {cy} L{x} {cy+9} L{x-19} {cy} Z" '
                       f'fill="{DEC_FILL}" stroke="{EDGE}"/>')
        elif kind == 'predef':
            out.append(f'<rect x="{x-16}" y="{cy-8}" width="32" height="16" fill="#fff" stroke="{EDGE}"/>'
                       f'<line x1="{x-11}" y1="{cy-8}" x2="{x-11}" y2="{cy+8}" stroke="{EDGE}"/>'
                       f'<line x1="{x+11}" y1="{cy-8}" x2="{x+11}" y2="{cy+8}" stroke="{EDGE}"/>')
        else:
            out.append(f'<path d="M{x-16} {cy-9} L{x+16} {cy-9} L{x+16} {cy+5} '
                       f'Q{x+8} {cy-3} {x} {cy+5} Q{x-8} {cy+13} {x-16} {cy+5} Z" '
                       f'fill="{DOC_FILL}" stroke="{EDGE}"/>')
        out.append(f'<text class="t-leg" x="{x}" y="{cy+24}" text-anchor="middle">{name}</text>')
        x += 104
    return out


def _footer(parts, letter):
    parts += s_legend(1006)
    parts.append(f'<circle cx="486" cy="1099" r="8" fill="#ffffff" stroke="{EDGE}" stroke-width="1.4"/>')
    parts.append(f'<text class="t-leg" x="500" y="1102">off-page connector</text>')
    parts.append(f'<text class="t-leg" x="40" y="1102">Online Event Registration System · '
                 f'sheet {letter} of 3 · regenerate with python3 docs/generate-diagrams.py</text>')
    parts.append('</svg>')
    return '\n'.join(parts)


# ------------------------------- sheet A ----------------------------------- #
def sheet_a():
    """Participant: browse, register, confirm. Plain English, no query text."""
    cx, LANE = 236, 606
    parts = _sheet_open()
    _sheet_title(parts, 'A', 'A · Participant — browse, register, confirm',
                 'What a visitor does from the first page to the confirmation.')

    y = 84
    out, h = s_term(cx, y, 'Start')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_io(cx, y, 'Opens the event list')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_db(cx, y, 'Event list',
                  ['Shows every event with its date and',
                   'place, and how many seats are left.'],
                  tag='events and venues')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_io(cx, y, 'Picks one event')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_db(cx, y, 'Event page',
                  ['Shows the details of that event',
                   'and how full it already is.'],
                  tag='one event and its bookings')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    dec_y = y
    out, h = s_dec(cx, dec_y, ['Any seats', 'left?'], w=230)
    parts += out
    y = dec_y + h

    # ---- No: waiting list ---------------------------------------------------
    no_y = dec_y + h / 2
    parts.append(s_wire([(cx + 115, no_y), (LANE - 170, no_y)]))
    parts.append(s_lbl(cx + 126, no_y - 6, 'No', 't-no', 'start'))
    wl = no_y - 18
    out, hh = s_io(LANE, wl, 'Asks to join the waiting list', w=340)
    parts += out
    out, h2 = s_db(LANE, wl + hh + 14, 'Waiting list',
                   ['Puts the person on the waiting list,',
                    'notes the change, and writes the',
                    'message that tells them so.'],
                   tag='bookings, their history, outgoing mail', w=340)
    parts += [s_wire([(LANE, wl + hh), (LANE, wl + hh + 14)])] + out
    pill = wl + hh + 14 + h2 + 14
    parts.append(s_wire([(LANE, wl + hh + 14 + h2), (LANE, pill)]))
    out, hp = s_term(LANE, pill, 'On the waiting list', w=300)
    parts += out
    parts.append(s_lbl(LANE, pill + hp + 16,
                       'moves up by itself when somebody gives up a seat'))

    # ---- Yes: register ------------------------------------------------------
    parts.append(s_wire([(cx, dec_y + h), (cx, dec_y + h + 22)]))
    parts.append(s_lbl(cx - 7, dec_y + h + 15, 'Yes', 't-yes', 'end'))
    y = dec_y + h + 22

    out, h = s_io(cx, y, 'Types name and e-mail, presses Register')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_db(cx, y, 'Checks the form',
                  ['Makes sure nothing is missing, and',
                   'that this person has not already',
                   'booked this event.'],
                  tag='people and bookings')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_db(cx, y, 'Counts the seats again',
                  ['Takes one last count of the booked',
                   'seats, so two people cannot take',
                   'the same last place.'],
                  tag='the event and its bookings')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_db(cx, y, 'Saves the booking',
                  ['Saves the booking, its history and the',
                   'message to send — all together, or not at all.'],
                  tag='booking, history, outgoing mail')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_predef(cx, y, 'Sends the confirmation e-mail')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_doc(cx, y, ['Confirmation page and e-mail,',
                           'both with the personal link'])
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_term(cx, y, 'Registered', w=240)
    parts += out
    out, _ = s_conn(cx + 132, y + h / 2, 'C')
    parts += out
    parts.append(s_lbl(cx + 150, y + h / 2 + 3, 'the e-mail is sent on sheet C', 't-lab', 'start'))

    return _footer(parts, 'A')


def sheet_b():
    """Administration: sign in, dashboard, the three day-to-day jobs."""
    cx, LANE = 236, 606
    parts = _sheet_open()
    _sheet_title(parts, 'B', 'B · Administration — what the organizer does',
                 'Sign in, read the counters, then edit an event, check people in, or change a booking.')

    y = 84
    out, h = s_term(cx, y, 'Organizer opens the dashboard', w=280)
    parts += out
    y += h + GAP

    dec_y = y
    parts.append(s_wire([(cx, dec_y - GAP), (cx, dec_y)]))
    out, h = s_dec(cx, dec_y, ['Already signed in', 'as an organizer?'], w=240)
    parts += out
    y = dec_y + h

    # ---- No: sign in --------------------------------------------------------
    no_y = dec_y + h / 2
    parts.append(s_wire([(cx + 120, no_y), (LANE - 170, no_y)]))
    parts.append(s_lbl(cx + 131, no_y - 6, 'No', 't-no', 'start'))
    ly = no_y - 20
    out, h1 = s_io(LANE, ly, 'Types e-mail and password', w=340)
    parts += out
    out, h2 = s_db(LANE, ly + h1 + 12, 'Checks the password',
                   ['Finds the account and compares the',
                    'typed password with the one kept',
                    'on file.'],
                   tag='people', w=340)
    parts += [s_wire([(LANE, ly + h1), (LANE, ly + h1 + 12)])] + out
    out, h3 = s_db(LANE, ly + h1 + h2 + 24, 'Remembers the visit',
                   ['Keeps them signed in, so the next',
                    'page does not ask again.'],
                   tag='sign-ins', w=340)
    parts += [s_wire([(LANE, ly + h1 + h2 + 12), (LANE, ly + h1 + h2 + 24)])] + out
    tail = ly + h1 + h2 + h3 + 24
    parts.append(s_wire([(LANE, tail), (LANE, tail + 12)]))
    out, h4 = s_term(LANE, tail + 12, 'Lands on the dashboard', w=300)
    parts += out

    # ---- Yes: dashboard -----------------------------------------------------
    parts.append(s_wire([(cx, dec_y + h), (cx, dec_y + h + 22)]))
    parts.append(s_lbl(cx - 7, dec_y + h + 15, 'Yes', 't-yes', 'end'))
    y = dec_y + h + 22

    out, h = s_io(cx, y, 'Reads the dashboard')
    parts += out
    y += h + GAP
    parts.append(s_wire([(cx, y - GAP), (cx, y)]))

    out, h = s_db(cx, y, 'Summary counters',
                  ['Counts the events, the booked seats,',
                   'the people waiting and who has',
                   'arrived so far.'],
                  tag='events, bookings, attendance')
    parts += out
    y += h + GAP

    dec_y = y
    parts.append(s_wire([(cx, dec_y - GAP), (cx, dec_y)]))
    out, h = s_dec(cx, dec_y, ['What does the', 'organizer do?'], w=240)
    parts += out
    y = dec_y + h

    # ---- three day-to-day jobs ----------------------------------------------
    def g_event(yy):
        return s_db(LANE, yy, 'Edits an event',
                    ['Saves a new or changed event and',
                     'its place — or puts it away, which',
                     'hides it from the public list.'],
                    tag='events and venues', w=340)

    def g_checkin(yy):
        return s_db(LANE, yy, 'Checks someone in',
                    ['Marks the person as arrived, and',
                     'notes who did the check-in.'],
                    tag='attendance and its history', w=340)

    def g_cancel(yy):
        return s_db(LANE, yy, 'Cancels or changes a booking',
                    ['Moves or cancels the booking, notes',
                     'the change, and offers the freed',
                     'seat to the next person waiting.'],
                    tag='booking, history, outgoing mail', w=340)

    groups = [
        ('works on an event', 'event', g_event),
        ('works on attendance', 'check-in', g_checkin),
        ('works on a booking', 'booking', g_cancel),
    ]

    cursor = y + 46
    taps = []
    for caption, tag, build in groups:
        _, gh = build(0)
        taps.append((cursor + gh / 2, cursor, caption, tag, build, gh))
        cursor += gh + 46

    last_bottom = taps[-1][1] + taps[-1][5]
    term_y = last_bottom + 30
    parts.append(s_wire([(cx, dec_y + h), (cx, term_y)]))
    for tap_y, top, caption, tag, build, gh in taps:
        parts.append(s_wire([(cx, tap_y), (LANE - 172, tap_y)]))
        out, _ = build(top)
        parts += out
        parts.append(s_lbl(LANE - 172, tap_y - 5, tag, 't-lab', 'end'))
        parts.append(s_lbl(LANE - 158, top - 7, caption, 't-lab', 'start'))

    out, ht = s_term(cx, term_y, 'Change saved', w=230)
    parts += out
    parts.append(s_lbl(cx, term_y + ht + 18,
                       'every change above is also kept in the history, and sends its message',
                       't-lab'))

    return _footer(parts, 'B')


def sheet_c():
    """The e-mail worker, and what happens when a guest opens the link."""
    cx, LANE, g = 236, 606, 7
    parts = _sheet_open()
    _sheet_title(parts, 'C', 'C · Sending the mail, and the guest manage link',
                 'Mail goes out in the background, so a broken mailbox never breaks a booking.')

    y = 84
    out, h = s_term(cx, y, 'Mail worker wakes up (every 15 s)', w=320)
    parts += out
    y += h + g

    parts.append(s_wire([(cx, y - g), (cx, y)]))
    out, h = s_db(cx, y, 'Mail waiting to go out',
                  ['Takes the next few messages that',
                   'are still waiting, oldest first.'],
                  tag='outgoing mail')
    parts += out
    y += h + g

    parts.append(s_wire([(cx, y - g), (cx, y)]))
    out, h = s_proc(cx, y, ['Fills in the message template, then hands',
                            'it to the mail service (files or a server)'])
    parts += out
    y += h + g

    dec_y = y
    parts.append(s_wire([(cx, dec_y - g), (cx, dec_y)]))
    out, h = s_dec(cx, dec_y, ['Did it go out?'], w=240)
    parts += out
    y = dec_y + h

    # ---- No: try again ------------------------------------------------------
    no_y = dec_y + h / 2
    parts.append(s_wire([(cx + 120, no_y), (LANE - 170, no_y)]))
    parts.append(s_lbl(cx + 131, no_y - 6, 'No', 't-no', 'start'))
    out, h2 = s_db(LANE, no_y - 30, 'Tries again later',
                   ['Notes the failed attempt and tries',
                    'again, up to three times. After that it',
                    'is marked as failed, with the reason',
                    'kept so the organizer can see it.'],
                   tag='outgoing mail', w=340)
    parts += out
    parts.append(s_lbl(LANE, no_y + 92, 'the Requeue button sends it again at once'))

    # ---- Yes ---------------------------------------------------------------
    y = dec_y + h + 22
    parts.append(s_wire([(cx, dec_y + h), (cx, y)]))
    parts.append(s_lbl(cx - 8, dec_y + h + 15, 'Yes', 't-yes', 'end'))

    out, h = s_db(cx, y, 'Marks it as sent',
                  ['Notes that the message went out,',
                   'and when.'],
                  tag='outgoing mail')
    parts += out
    y += h + g

    parts.append(s_wire([(cx, y - g), (cx, y)]))
    io_y = y
    out, h = s_io(cx, io_y, 'Participant clicks the link in the e-mail', w=330)
    parts += out
    out, _ = s_conn(cx + 165, io_y + h / 2, 'A')
    parts += out
    parts.append(s_lbl(cx + 183, io_y + h / 2 + 3, 'that link came from sheet A', 't-lab', 'start'))
    y += h + g

    parts.append(s_wire([(cx, y - g), (cx, y)]))
    out, h = s_db(cx, y, 'Looks the link up',
                  ['Finds the link, the person and the',
                   'booking. Checks it has not expired',
                   'and has not been used already.'],
                  tag='personal links and people')
    parts += out
    y += h + g

    dec_y = y
    parts.append(s_wire([(cx, dec_y - g), (cx, dec_y)]))
    out, h = s_dec(cx, dec_y, ['What do they', 'want to do?'], w=240)
    parts += out
    y = dec_y + h

    def g_view(yy):
        return s_doc(LANE, yy, 'Sees the booking: event, date, place, seats left', w=340)

    def g_cancel(yy):
        return s_db(LANE, yy, 'Cancels the booking',
                    ['The same cancellation as the signed-in',
                     'page: the seat is freed and offered to',
                     'the next person waiting.'],
                    tag='booking, history, outgoing mail', w=340)

    def g_claim(yy):
        return s_db(LANE, yy, 'Sets a password',
                    ['Saves the password, notes the day',
                     'the account was claimed, and marks',
                     'the link as used.'],
                    tag='people and their links', w=340)

    groups = [
        ('just looks', 'look', g_view),
        ('cancels', 'cancel', g_cancel),
        ('turns the guest into an account', 'claim', g_claim),
    ]

    cursor = y + 22
    taps = []
    for caption, tag, build in groups:
        _, gh = build(0)
        taps.append((cursor + gh / 2, cursor, caption, tag, build, gh))
        cursor += gh + 14

    last_bottom = taps[-1][1] + taps[-1][5]
    term_y = last_bottom + 18
    parts.append(s_wire([(cx, dec_y + h), (cx, term_y)]))
    for tap_y, top, caption, tag, build, gh in taps:
        parts.append(s_wire([(cx, tap_y), (LANE - 174, tap_y)]))
        out, _ = build(top)
        parts += out
        parts.append(s_lbl(LANE - 172, tap_y - 5, tag, 't-lab', 'end'))
        parts.append(s_lbl(LANE - 158, top - 7, caption, 't-lab', 'start'))

    out, ht = s_term(cx, term_y, 'Done', w=200)
    parts += out

    return _footer(parts, 'C')


# --------------------------------------------------------------------------- #
#                    FLOWCHART (all three sheets stacked)                      #
# --------------------------------------------------------------------------- #
def flowchart():
    """The three A4 sheets stacked vertically, for docs/SYSTEM-DOCS.html."""
    sheets = [('A', sheet_a()), ('B', sheet_b()), ('C', sheet_c())]
    W, H = W_SHEET, H_SHEET
    body = []
    for i, (key, svg) in enumerate(sheets):
        inner = svg[svg.index('>') + 1: svg.rindex('</svg>')]
        inner = inner.replace('id="ah"', f'id="ah{key}"').replace('url(#ah)', f'url(#ah{key})')
        body.append(f'<g transform="translate(0 {i*H})">{inner}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H*3}" '
            f'width="{W}" height="{H*3}" font-family="{FONT}">\n'
            + '\n'.join(body) + '\n</svg>')


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
    for name, builder in [('ERD.svg', erd), ('MVC-ARCHITECTURE.svg', mvc),
                          ('FLOWCHART.svg', flowchart),
                          ('FLOWCHART-A.svg', sheet_a), ('FLOWCHART-B.svg', sheet_b),
                          ('FLOWCHART-C.svg', sheet_c)]:
        path = os.path.join(OUT, name)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(builder())
        print('wrote', path)
