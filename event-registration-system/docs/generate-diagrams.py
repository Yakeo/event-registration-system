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

    # --------------------------- constraints ------------------------------- #
    ny = 1332
    parts += [
        f'<rect x="40" y="{ny}" width="{W-80}" height="416" rx="14" fill="#e8eeff" stroke="#c6d3fb"/>',
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
        f'<text class="note" x="66" y="{ny+286}"><tspan font-weight="700">Outbox:</tspan> '
        'NOTIFICATIONS is written in the same transaction as the change it describes, then drained '
        'by the worker and retried up to 3 times.</text>',
        f'<text class="note" x="66" y="{ny+310}"><tspan font-weight="700">Guest access:</tspan> '
        'MANAGE_TOKENS stores only the SHA-256 of the link token; USERS.password is NULL until the '
        'account is claimed (claimed_at), so a guest never needs a password to cancel.</text>',
        f'<text class="note" x="66" y="{ny+334}"><tspan font-weight="700">SESSIONS:</tspan> '
        'no foreign key &#8212; it stores the serialised express-session payload and is purged by expiry.</text>',
        f'<text class="note" x="66" y="{ny+366}" fill="#8a3b12"><tspan font-weight="700">Normalisation:</tspan> '
        '1NF/2NF/3NF are satisfied for every table shown; the one remaining 3NF exception is the single-use '
        'reset token on USERS.</text>',
        f'<text class="note" x="66" y="{ny+390}" fill="#8a3b12">'
        'A stricter variant (PASSWORD_RESET_TOKENS, lookup tables, NOTIFICATIONS) is proposed in '
        'docs/schema-3nf.sql.</text>',
    ]

    parts.append('</svg>')
    return '\n'.join(parts)


# --------------------------------------------------------------------------- #
#                             FLOWCHART                                       #
# --------------------------------------------------------------------------- #
def flowchart():
    """Complete system flowchart - three bands, three columns.

    Columns: the actor's step, the database work it triggers, and the "No"
    branch / failure path. Every read and write is drawn explicitly.

    Bands
      A  participant      - browse, register, confirm (+ waiting-list branch)
      B  administration   - login, dashboard, event / attendance / status changes
      C  worker + guest   - e-mail delivery, retries, and /r/:token self-service
    """
    W = 1600
    MCX, MW = 350, 380       # process column
    DCX, DW = 830, 470       # database column
    SCX, SW = 1345, 470      # No / failure column

    # ---- vertical plan (computed once so the bands cannot overlap) ----------
    A0 = 96
    ay = 170
    A_BOTTOM = 1210

    B0 = A_BOTTOM + 24       # 1234
    byy = B0 + 76
    B_BOTTOM = B0 + 528

    C0 = B_BOTTOM + 24
    cyy = C0 + 82
    C_BOTTOM = 2628 + 46
    H = C_BOTTOM + 40

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'font-family="{FONT}">',
        '<defs>',
        '<style>',
        '.box{fill:#fff;stroke:#2f5bff;stroke-width:1.8}',
        '.proc{fill:#15203a;font-size:14px;font-weight:600}',
        '.proc-s{fill:#15203a;font-size:12.5px;font-weight:600}',
        '.term{fill:#fff;font-size:14px;font-weight:700;letter-spacing:.04em}',
        '.arr{stroke:#46527a;stroke-width:1.9;fill:none}',
        '.yes{fill:#0c7a52;font-size:12.5px;font-weight:700}',
        '.no{fill:#e0425f;font-size:12.5px;font-weight:700}',
        '.h1{fill:#15203a;font-size:24px;font-weight:700}',
        '.sub{fill:#6b7691;font-size:13px}',
        '.sec{fill:#15203a;font-size:16px;font-weight:700}',
        '.secs{fill:#6b7691;font-size:12px}',
        '.colhead{fill:#2440a8;font-size:11.5px;font-weight:700;letter-spacing:.14em}',
        '.db{fill:#eef4ff;stroke:#2440a8;stroke-width:1.4}',
        '.dbn{fill:#f7f2fb;stroke:#5b4b8a;stroke-width:1.4}',
        '.dbt{fill:#15203a;font-family:' + MONO + ';font-size:11.5px}',
        '.dbn-t{fill:#3f3268;font-family:' + MONO + ';font-size:11.5px}',
        '.rw{fill:#0c7a52;font-size:10px;font-weight:700;letter-spacing:.1em}',
        '.ww{fill:#b42b45;font-size:10px;font-weight:700;letter-spacing:.1em}',
        '.note{fill:#5a6584;font-size:11.5px}',
        '</style>',
        '<marker id="ah" markerWidth="11" markerHeight="9" refX="9" refY="4.5" orient="auto">'
        '<path d="M0 0 L11 4.5 L0 9 z" fill="#46527a"/></marker>',
        '<marker id="ahs" markerWidth="11" markerHeight="9" refX="2" refY="4.5" orient="auto">'
        '<path d="M11 0 L0 4.5 L11 9 z" fill="#46527a"/></marker>',
        '<filter id="sh" x="-20%" y="-30%" width="140%" height="160%">'
        '<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#15203a" flood-opacity="0.10"/></filter>',
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="#f5f7fb"/>',
        '<text class="h1" x="40" y="50">System Flowchart &#8212; Online Event Registration</text>',
        '<text class="sub" x="40" y="74">Participant registration, administration, and the '
        'notification worker &#8212; with every database read and write shown in order.</text>',
    ]

    # ------------------------------------------------------------------ helpers
    def box(y, lines, cx=MCX, w=MW, h=None, small=False):
        if isinstance(lines, str):
            lines = [lines]
        h = h or (34 + 19 * (len(lines) - 1) + 28)
        out = [f'<g filter="url(#sh)"><rect class="box" x="{cx-w/2}" y="{y}" width="{w}" height="{h}" '
               f'rx="10"/></g>']
        first = y + h / 2 - (len(lines) - 1) * 9.5 + 4.5
        for i, line in enumerate(lines):
            cls = 'proc-s' if (small or len(lines) > 1) else 'proc'
            out.append(f'<text class="{cls}" x="{cx}" y="{first + i*19}" text-anchor="middle">{line}</text>')
        return out, h

    def stadium(y, label, cx=MCX, w=250, fill='#26407a', h=46):
        return [f'<g filter="url(#sh)"><rect x="{cx-w/2}" y="{y}" width="{w}" height="{h}" rx="{h/2}" '
                f'fill="{fill}"/></g>',
                f'<text class="term" x="{cx}" y="{y+h/2+5}" text-anchor="middle">{label}</text>'], h

    def dbox_h(lines):
        return 20 + 17 * len(lines) + 8

    def dbox(y, lines, cx=DCX, w=DW, kind='db'):
        h = dbox_h(lines)
        cls = 'db' if kind == 'db' else 'dbn'
        accent = '#2440a8' if kind == 'db' else '#5b4b8a'
        tcls = 'dbt' if kind == 'db' else 'dbn-t'
        out = [f'<g filter="url(#sh)"><rect class="{cls}" x="{cx-w/2}" y="{y}" width="{w}" height="{h}" '
               f'rx="8"/></g>',
               f'<rect x="{cx-w/2}" y="{y}" width="5" height="{h}" rx="2.5" fill="{accent}"/>']
        for i, line in enumerate(lines):
            out.append(f'<text class="{tcls}" x="{cx-w/2+18}" y="{y+24+i*17}">{line}</text>')
        return out

    def diamond(cx, y, w, h, lines):
        out = [f'<g filter="url(#sh)"><path d="M{cx} {y} L{cx+w/2} {y+h/2} L{cx} {y+h} '
               f'L{cx-w/2} {y+h/2} Z" fill="#fff" stroke="#2f5bff" stroke-width="1.8"/></g>']
        first = y + h / 2 - (len(lines) - 1) * 9 + 5
        for i, line in enumerate(lines):
            out.append(f'<text class="proc" x="{cx}" y="{first + i*18}" text-anchor="middle">{line}</text>')
        return out

    def path(pts, both=False):
        d = ' '.join(('M' if i == 0 else 'L') + f'{x} {y}' for i, (x, y) in enumerate(pts))
        start = ' marker-start="url(#ahs)"' if both else ''
        return f'<path class="arr" d="{d}" marker-end="url(#ah)"{start} fill="none"/>'

    def tag(x, y, text, cls='rw', anchor='middle'):
        return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{text}</text>'

    def row(y, lines, ops=None, h=None, kind='read', cx=MCX, w=MW, small=False):
        """Process box with an optional database box centred beside it."""
        out, hh = box(y, lines, cx=cx, w=w, h=h, small=small)
        if ops:
            dh = dbox_h(ops)
            dy = y + (hh - dh) / 2
            out += dbox(dy, ops)
            mid = y + hh / 2
            out += [path([(cx + w/2, mid), (DCX - DW/2 - 3, mid)], both=True),
                    tag((cx + w/2 + DCX - DW/2) / 2, mid - 8,
                        'READ' if kind == 'read' else 'WRITE', 'rw' if kind == 'read' else 'ww')]
        return out, y + hh

    body = []

    # ================================================================ BAND A
    body.append(f'<rect x="24" y="{A0}" width="{W-48}" height="{A_BOTTOM-A0}" rx="16" '
                f'fill="#ffffff" stroke="#dbe2f0"/>')
    body += ['<text class="sec" x="48" y="128">A &#183; Participant &#8212; browse, register, '
             'confirm</text>',
             '<text class="secs" x="48" y="148">Public pages. No login: the e-mailed link is the '
             'credential, so a guest never has to invent a password.</text>',
             f'<text class="colhead" x="{DCX}" y="128" text-anchor="middle">DATABASE</text>',
             f'<text class="colhead" x="{SCX}" y="128" text-anchor="middle">WAITING LIST</text>']

    y = ay
    st, h = stadium(y, 'Start')
    body += st
    y += h
    body += [path([(MCX, y), (MCX, 242)])]

    r, y = row(242, 'Opens the event list  ( GET / )',
               ['SELECT EVENTS &#10227; VENUES',
                "COUNT(*) WHERE status='confirmed'",
                'remaining = max_participants - taken'])
    body += r
    body += [path([(MCX, y), (MCX, 340)])]

    r, y = row(340, 'Selects one event  ( GET /events/:id )',
               ['SELECT event + venue', 'COUNT confirmed seats'])
    body += r
    body += [path([(MCX, y), (MCX, 438)])]

    body += diamond(MCX, 438, 260, 108, ['Seats still', 'available?'])

    # ---- No -> waiting list
    body += [path([(MCX + 130, 492), (SCX - SW/2 - 3, 492)]),
             tag(MCX + 168, 482, 'No', 'no', 'start')]
    r, hh = box(466, 'Joins the waiting list', cx=SCX, w=SW)
    body += r
    body += [path([(SCX, 466 + hh), (SCX, 558)])]
    body += dbox(558, ["INSERT REGISTRATIONS", "  status = 'waitlisted'",
                       'INSERT REGISTRATION_STATUS_CHANGES', "INSERT NOTIFICATIONS  ('queued')"],
                 cx=SCX, w=SW)
    body += [tag(SCX + SW/2 - 44, 548, 'WRITE', 'ww', 'start'),
             path([(SCX, 558 + dbox_h([0, 0, 0, 0])), (SCX, 682)])]
    st, _ = stadium(682, 'End &#8212; on the waiting list', cx=SCX, w=320, fill='#5a6584')
    body += st
    body += [f'<text class="note" x="{SCX}" y="752" text-anchor="middle">Promoted to confirmed '
             f'automatically when a seat frees up</text>',
             f'<text class="note" x="{SCX}" y="770" text-anchor="middle">(band C: FIFO by '
             f'registration_date)</text>']

    # ---- Yes -> continue
    body += [path([(MCX, 546), (MCX, 580)]), tag(MCX + 10, 570, 'Yes', 'yes', 'start')]
    r, y = row(580, 'Enters full name + e-mail address')
    body += r
    body += [f'<text class="note" x="{DCX}" y="{y-14}" text-anchor="middle">no write yet &#8212; '
             f'nothing is stored before validation</text>']
    body += [path([(MCX, y), (MCX, 676)])]

    r, y = row(676, 'Server validates fields and the duplicate rule',
               ['SELECT USERS, REGISTRATIONS', 'WHERE (event_id, user_id)'])
    body += r
    body += [path([(MCX, y), (MCX, 772)])]

    r, y = row(772, 'Re-checks capacity inside a transaction',
               ['SELECT event ... FOR UPDATE', 'COUNT confirmed (locked row)'])
    body += r
    body += [path([(MCX, y), (MCX, 868)])]

    body += box(868, ['BEGIN &#8594; INSERT registration',
                      '+ status history + notification',
                      '&#8594; COMMIT  (rollback on error)'], h=86)[0]
    body += dbox(864, ['BEGIN', 'INSERT REGISTRATIONS', 'INSERT REGISTRATION_STATUS_CHANGES',
                       "INSERT NOTIFICATIONS ('queued')", 'COMMIT'])
    body += [path([(MCX + MW/2, 911), (DCX - DW/2 - 3, 911)]),
             tag((MCX + MW/2 + DCX - DW/2) / 2, 903, 'WRITE', 'ww'),
             f'<text class="note" x="{DCX}" y="986" text-anchor="middle">one atomic unit: the '
             f'booking, its history and the e-mail are all-or-nothing</text>']
    body += [path([(MCX, 954), (MCX, 1004)])]

    r, y = row(1004, 'Renders the confirmation page',
               ['SELECT COUNT confirmed (fresh)',
                'reference = HMAC(registration_id)',
                'shown as REG-00049-7F3A9C'])
    body += r
    body += [path([(MCX, y), (MCX, 1100)])]

    st, _ = stadium(1100, 'End &#8212; registration stored', w=340)
    body += st
    body += [f'<text class="note" x="{MCX}" y="1174" text-anchor="middle">the queued e-mail '
             f'carries /r/:token &#8594; band C</text>']

    # ================================================================ BAND B
    body.append(f'<rect x="24" y="{B0}" width="{W-48}" height="{B_BOTTOM-B0}" rx="16" '
                f'fill="#ffffff" stroke="#dbe2f0"/>')
    body += [f'<text class="sec" x="48" y="{B0+34}">B &#183; Administration &#8212; authenticated '
             f'session required</text>',
             f'<text class="secs" x="48" y="{B0+54}">requireLogin + requireAdmin guard every route. '
             f'Each action writes AUDIT_LOGS and queues a notification.</text>',
             f'<text class="colhead" x="{DCX}" y="{B0+34}" text-anchor="middle">DATABASE</text>']

    y = byy
    st, h = stadium(y, 'Admin logs in  ( POST /login )', w=310)
    body += st
    body += dbox(y - 12, ['SELECT USERS WHERE email = ?',
                          'bcrypt.compare(password, hash)',
                          'INSERT / UPDATE SESSIONS'])
    body += [path([(MCX + 155, y + 23), (DCX - DW/2 - 3, y + 37)]),
             tag((MCX + 155 + DCX - DW/2) / 2, y + 18, 'WRITE', 'ww')]
    y += h
    body += [path([(MCX, y), (MCX, 1386)])]

    r, y = row(1386, 'Dashboard  ( GET /admin )',
               ['SELECT aggregates:',
                'events &#183; confirmed &#183; waitlisted',
                'check-ins &#183; users'])
    body += r
    body += [path([(MCX, y), (MCX, 1482)])]

    acts = [(300, ['Creates / edits /', 'archives an event'],
             ['INSERT / UPDATE EVENTS', 'INSERT / UPDATE VENUES', 'UPDATE deleted_at (archive)']),
            (800, ['Checks a participant in'],
             ['INSERT ATTENDANCE', 'UNIQUE(registration_id)', 'INSERT AUDIT_LOGS']),
            (1300, ['Cancels or changes', 'a status'],
             ['UPDATE REGISTRATIONS', 'INSERT STATUS_CHANGES', 'promote waitlist (FIFO)'])]
    for cx, label, ops in acts:
        body += box(1482, label, cx=cx, w=420)[0]
        body += [path([(cx, 1542), (cx, 1570)])]
        body += dbox(1570, ops, cx=cx, w=420)
        body += [tag(cx, 1678, 'WRITE', 'ww')]

    body += [f'<rect x="48" y="1696" width="{W-96}" height="46" rx="9" fill="#fdf2f5" '
             f'stroke="#f3c9d4"/>',
             f'<text class="note" x="68" y="1724">Every branch also writes '
             f'<tspan font-weight="700">AUDIT_LOGS</tspan> (actor, action, entity, before/after) and '
             f'queues <tspan font-weight="700">NOTIFICATIONS</tspan> rows &#8212; archiving an event '
             f'queues one cancellation e-mail per affected participant.</text>']

    # ================================================================ BAND C
    body.append(f'<rect x="24" y="{C0}" width="{W-48}" height="{C_BOTTOM-C0}" rx="16" '
                f'fill="#ffffff" stroke="#dbe2f0"/>')
    body += [f'<text class="sec" x="48" y="{C0+34}">C &#183; Notification worker and guest '
             f'self-service  ( /r/:token )</text>',
             f'<text class="secs" x="48" y="{C0+54}">Delivery happens out of band, so an SMTP outage '
             f'can never fail a registration; failures stay visible and retryable.</text>',
             f'<text class="colhead" x="{DCX}" y="{C0+34}" text-anchor="middle">DATABASE</text>',
             f'<text class="colhead" x="{SCX}" y="{C0+34}" text-anchor="middle">ON FAILURE</text>']

    y = cyy
    st, h = stadium(y, 'Worker timer fires (every 15 s)', w=340, fill='#0f4c5c')
    body += st
    body += dbox(y - 12, ["SELECT NOTIFICATIONS", "WHERE status = 'queued'",
                          'ORDER BY created_at LIMIT 20'])
    body += [path([(MCX + 170, y + 23), (DCX - DW/2 - 3, y + 34)]),
             tag((MCX + 170 + DCX - DW/2) / 2, y + 18, 'READ', 'rw')]
    y += h
    body += [path([(MCX, y), (MCX, 1944)])]

    r, y = row(1944, ['Renders the EJS e-mail template',
                      '(subject + HTML + text alternative)'], h=72)
    body += r
    body += [path([(MCX, y), (MCX, 2046)])]

    r, y = row(2046, 'Sends through the transport (console .eml / SMTP)')
    body += r
    body += [path([(MCX, y), (MCX, 2140)])]

    body += diamond(MCX, 2140, 260, 104, ['Delivered?'])
    body += [path([(MCX + 130, 2192), (SCX - SW/2 - 3, 2192)]),
             tag(MCX + 168, 2182, 'No', 'no', 'start')]
    body += dbox(2146, ['attempts = attempts + 1',
                        'requeue while attempts &lt; 3',
                        "then status = 'failed'",
                        '+ last_error (shown in the UI)'], cx=SCX, w=SW, kind='note')
    body += [tag(SCX - SW/2 + 58, 2182, 'WRITE', 'ww'),
             f'<text class="note" x="{SCX}" y="2272" text-anchor="middle">the Requeue button in '
             f'/admin/notifications drains it immediately</text>']

    body += [path([(MCX, 2244), (MCX, 2282)]), tag(MCX + 10, 2270, 'Yes', 'yes', 'start')]
    body += dbox(2282, ['UPDATE NOTIFICATIONS',
                        "SET status = 'sent', sent_at = NOW()"], cx=MCX, w=430)
    body += [path([(MCX, 2282 + dbox_h([0, 0])), (MCX, 2372)])]

    r, y = row(2372, 'Participant receives the e-mail')
    body += r
    body += [path([(MCX, y), (MCX, 2464)])]

    r, y = row(2464, 'Opens /r/:token &#8212; no password required',
               ['SELECT MANAGE_TOKENS', 'WHERE token_hash = SHA-256(token)',
                'JOIN USERS, REGISTRATIONS'])
    body += r
    body += [path([(MCX, y), (MCX, 2556)])]

    body += box(2556, ['Views the booking, cancels it,',
                       'or optionally sets a password'], w=340, h=72)[0]
    body += dbox(2552, ["UPDATE status = 'cancelled'", 'INSERT STATUS_CHANGES',
                        'promote next waitlisted (FIFO)',
                        "INSERT NOTIFICATIONS ('queued')"])
    body += [path([(MCX + 170, 2592), (DCX - DW/2 - 3, 2592)]),
             tag((MCX + 170 + DCX - DW/2) / 2, 2582, 'WRITE', 'ww')]
    body += [f'<text class="note" x="{MCX}" y="2660" text-anchor="middle">same engine as the '
             f'logged-in cancel &#8212; cancelRegistration()</text>']

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
