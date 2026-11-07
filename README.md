# VentureOS

ScaleGate Africa's application and selection platform for the **VentureOS Center** (Make. Grow. Create.) and for
ventures seeking **equity, debt or grant** funding through ScaleGate. Its own app, its own sign-in and its own
PostgreSQL database on the Lagos server.

## The website

The **front page** presents the programme: announcements of the **monthly investment presentations and meetups**
(register to attend, or submit a venture to present), **cohorts** (e.g. Cohort 0, mid-2027) and **campuses** (the
VentureOS Center in Lagos as designed), what VentureOS is about (Make, Grow, Create and its principles), the
**projects that interest ScaleGate**, and how to apply. Staff edit all of it without code changes: *Events*,
*Cohorts* (tick "show on the front page") and *Front page* (projects and campuses).

**Events.** Staff announce a presentation evening or meetup (date, venue, online link, places, presenting slots,
closing date for submissions) and can copy it to the same weekday of next month. Anyone registers to attend (no
account needed; a link in the confirmation email cancels their place). Founders sign in to submit a venture to
present, optionally linked to their application, with a deck; staff shortlist and select presenters, who are
emailed with their slot. Registrations download as a spreadsheet.

**The applicant portal.** For each application the founder has: the application itself; **Meetings** — invitations
from ScaleGate (first meeting, follow-ups, interview, due diligence, site visit; in person, video or phone) with a
calendar invitation, which they accept, decline or ask to move, and a reminder the day before; **Follow-ups and
requested documents** — next steps agreed at meetings (theirs and ScaleGate's) and documents ScaleGate asks for,
uploaded against each request; and **Messages**. After a meeting staff record a summary for the founder, internal
notes, and the agreed actions and documents in one go; the founder is emailed the follow-up.


**Two parts.** Founders first send a short **initial submission** (Part 1): the venture, founders, problem and
market, traction and what they are asking for — for equity, the valuation with its method and workings; for debt,
the loan, its purpose, the repayment source and any credit history — with a pitch deck, business plan and CVs.
ScaleGate screens it and either declines, asks for more, or **invites the venture to the full documentation**
(Part 2): the rest of the valuation, cap table, governance, three years of financials and projections, loans,
security, and documents including the business background questionnaire (`public/templates/`), financial
statements, tax returns and bank statements. Which questions and documents belong to Part 1 is set in
`PART_TWO_SECTIONS`, `PART_ONE_FIELDS` and `PART_TWO_FIELDS` (`src/domain/questions.js`) and `PART_ONE_DOCS`
(`src/domain/documents.js`). A residency can go to review on Part 1 alone.

**Founders** sign in with their email and a six-digit code (no passwords), start an application and choose what they
are asking for — any mix of *residency*, *equity*, *debt* and *grant*. The questions and the document checklist adjust
to that choice. They save as they go, upload documents, see exactly what is still missing, and send. If staff ask for
more information the application reopens for them. They see their stage, messages and (as residents) their innovator
tab statement.

What each kind of request asks for (`src/domain/questions.js`, `src/domain/documents.js`):

| Request | Beyond the common questions (venture, founders, problem and market, traction, legal and IP, declaration) |
|---|---|
| Residency | Challenge track; relocation; 2-minute video; Make → technical depth, Grow → farm/value-chain experience, Create → portfolio; immersion and build plan; facilities; cross-pillar work; Grow's equity-or-royalty choice; innovator tab acknowledgement |
| Equity | The raise (amount, instrument, pre-money, stake offered); **basis of the valuation** (methods, workings of 120+ characters, comparables, assumptions, who set it, why not lower, downside case); use of funds and milestones; cap table and prior rounds; governance and investor rights (board, independent directors, owner–manager separation, audit, investor director, private placement by owners, listing, exit); 5-year financials and projections |
| Debt | Amount, currency, purpose, tenor, moratorium, repayment structure, rate; repayment source and revenue currency; contracts and offtake; customer concentration; working-capital days; monthly cash in/out; existing loans and their status; credit history and bureau consent; collateral (market and forced-sale values, title, existing charges); guarantees; board approval |
| Grant | Amount, purpose, measurable impact, co-funding, sustainability, reporting |

**Staff** see the pipeline and, for each application, a **first read** worked out from the answers
(`src/domain/analysis.js`): post-money, implied versus offered stake, pre-money ÷ revenue and ÷ EBITDA, uplift on the
last round, founders after the round; annual debt service, debt service cover (EBITDA ÷ all debt service), total debt
÷ EBITDA, net monthly cash against the new instalment, security cover at forced-sale value — and red, amber and info
**flags** (a valuation with no method; numbers that do not agree; currency mismatch; non-performing loans; pledged
security; customer concentration; unaudited accounts; owner-run with no independent director; IP held by founders;
politically exposed persons; projections growing faster than 150% a year…).

Roles: **admin** (everything), **reviewer** (only applications assigned to them; must declare any conflict of
interest before reading; sees other reviewers' scores only after sending their own), **committee** (sees all,
records decisions), **finance** (the innovator tab). Rubrics (`src/domain/scoring.js`) score 0–5 per criterion,
weighted to 100: the residency rubric is the selection criteria in the planning document (Problem 25, Ability 25,
Commitment 20, Solution 15, Collaboration 10, Pan-African 5); equity, debt and grant have their own.

Stages: draft → submitted (Part 1) → screening → invited to full documentation → full documentation received (Part 2) → independent review → challenge task (residency) or due diligence (funding) →
interview → committee → accepted / offer / waitlisted / declined. Information can be requested at any stage before a
decision. Every change, document opened and decision is in the history.

The **innovator tab** records each venture's carrying costs (housing, meals, workspace, studio, services, uplift)
less sponsorship, repayments, write-offs and conversions, with a running balance the founder can see.

## Put it on the Lagos server

1. Download this code from GitHub (green **Code** button → **Download ZIP**) and unzip it.
2. Point **ventureos.africa** at the server: an **A record** for `ventureos.africa` (and, optionally, `www.ventureos.africa`) → `102.204.2.229`.
3. Double-click `deploy\windows\Install-or-update-VentureOS.bat`, press Enter for ventureos.africa, and enter your SSH key
   passphrase when asked. The last line says **VENTUREOS IS LIVE**.

To update later: download the new code and double-click the same file (press Enter to keep the address). The
database, uploaded documents and settings stay.

What the setup does (`deploy/ventureos-setup.sh`): installs PostgreSQL if needed and creates the `ventureos` database
and user; writes the settings to `/etc/ventureos/ventureos.env` (random secrets; mail settings copied from the Oxi
apps the first time); copies the code to `/opt/apps/ventureos`; runs it as the `ventureos` service on
`127.0.0.1:4300`; backs up the database and documents daily to `/var/backups/ventureos` (14 days); adds the address
to Caddy or nginx with HTTPS.

## Run locally

```
npm install
VENTUREOS_DATABASE_URL=postgres://… node scripts/demo.js   # sample data
VENTUREOS_DATABASE_URL=postgres://… npm start              # http://localhost:4300, codes print in the log
VENTUREOS_TEST_DATABASE_URL=postgres://… npm test          # a throwaway database
```

| Setting | Purpose |
|---|---|
| `VENTUREOS_DATABASE_URL` | Its own PostgreSQL database |
| `VENTUREOS_BASE_URL` | `https://ventureos.africa` |
| `VENTUREOS_SESSION_SECRET` | Signs sessions |
| `VENTUREOS_ADMINS` | Emails that are administrators on first sign-in (default `alex@scalegate.org,alexnwuba@gmail.com`) |
| `VENTUREOS_UPLOADS` | Where documents are stored |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | Email for sign-in codes and notices |
| `PORT` | Default 4300 |

Thresholds used by the first read (`debt_assumed_rate` 27%, `dscr_minimum` 1.25, `leverage_maximum` 3.5,
`collateral_haircut` 30%) are rows in the `settings` table.
