# Official Source Feasibility Sample

Version 0.1 | Checked 29 October 2026

This is a research source registry for the planned collector, not a list of guaranteed open funded opportunities. References: [PRD](smartmanuAI_PRD_v0_1.md) and [Provider feasibility](provider-feasibility.md).

## 1 Inspection method and limits

Inspected eight public official entry points through the available research reader; the financial-support entry point timed out on a follow-up retrieval. “Readable” means text was available during this check; it does not mean a production HTTP collector has been tested. Do not infer robots permission, legal reuse rights, API availability or reliable uptime from that result.

Before enabling each automated source, inspect its access policy and robots rules, test retrieval from the selected hosting region, identify a stable listing page, set a conservative per-domain rate and record the result. Logged-in application portals are outside the collector boundary. Do not bypass access controls.

## 2 Initial registry

| ID | Official page | Role and observed facts | Collector decision |
| --- | --- | --- | --- |
| SRC01 | [Tsinghua SIGS Intelligent Manufacturing](https://www.sigs.tsinghua.edu.cn/en/2024/1230/c7587a99314/page.psp) | Readable program page; master's level, Chinese or English instruction, and a displayed May 15 2027 application date | Relevant degree lead; funding not established on this page |
| SRC02 | [Tsinghua SIGS Financial Support](https://www.sigs.tsinghua.edu.cn/en/7409/list.psp) | Official support entry point retrieved initially; a follow-up read timed out | Retry and inspect award details before enabling; verify degree, intake and applicant applicability |
| SRC03 | [HUST Scholarship Information and Tips](https://iso.hust.edu.cn/Scholarships/Scholarship_Information_and_Tips.htm) | Readable scholarship routes; Type B postgraduate path lists an 800 CNY application fee and a February 25 2027 deadline | Candidate scholarship evidence; join only to supported program lists and show application cost |
| SRC04 | [HUST 2027 Undergraduate Guide](https://iso.hust.edu.cn/info/1194/5144.htm) | Readable bilingual guide includes English-taught Intelligent Manufacturing Engineering, tuition and an application fee | Useful negative fixture: a relevant degree is not automatically free |
| SRC05 | [XJTU 2027 Undergraduate Programs](https://sie.xjtu.edu.cn/en/info/1119/3271.htm) | Readable degree and scholarship sections; Intelligent Manufacturing Engineering listed; scholarship timelines differ from general admission | Preserve award-specific routes, deadlines and first-year limitations; no inferred full-duration funding |
| SRC06 | [Shanghai government CGS guide](https://english.shanghai.gov.cn/en-Individuals-HigherEducation-Scholarships/20260813/305c553a1e5946929d81b3715bff50e0.html) | Readable public guidance on CGS categories, coverage and university-specific conditions | Background reference; do not turn a general guide into an intake-specific alert |
| SRC07 | [UNIDO Smart Manufacturing and Industry 4.0](https://www.unido.org/learning-resources/smart-manufacturing-industry-40) | Readable official listing explicitly labels the course virtual, English and free | Strong course candidate; certificate costs, enrollment availability and eligibility still require checking |
| SRC08 | [UNIDO Upcoming Events](https://www.unido.org/events) | Readable official discovery index | Monitor relevant event detail pages; no particular upcoming event verified as free in this sample |

The sample includes three Chinese universities, a government information source, one explicit free course and an event discovery source. Expand to additional institutions and official organizers before advertising broad coverage. The PRD's 30-source workload is a planning assumption, not a registry already collected.

## 3 Important extraction rules

- The same university can have different deadlines for admission and scholarships. Store the scholarship deadline separately and label its purpose.
- A scholarship's nationality or subject restriction applies to that award, not automatically to all awards at the institution.
- General tuition information is useful evidence of remaining costs, not evidence of a waiver.
- An annual award, a first-year award and a full-degree scholarship are different benefits. Store coverage duration and renewal conditions.
- An application fee is separate from tuition funding. A fully supported study award may still require an upfront fee.
- A publication date or old-looking URL does not determine the intake. Read current page fields and retain source-retrieval time.
- Course registration, certificate issuance and participation can have different cost conditions.
- Event indexes and generic scholarship explainers are discovery sources, not publishable opportunity records.

## 4 Funding and fee clarification for implementation

Extend the planned funding components with application fee, participation fee, certificate fee, travel, visa, insurance and coverage duration. Each value needs amount and currency where stated, plus evidence. Unknown is distinct from zero.

Propose a user filter called “No application or registration fee.” Do not enable it by assumption for every scholarship seeker; confirm the final preference behavior in the product design. Regardless of that filter, the detail page must show known upfront costs prominently.

If a user requests strictly zero-fee opportunities, exclude known fee-bearing records and label unknown fees for checking. Never call a scholarship “completely free” merely because tuition, accommodation and a stipend are supported.

## 5 Proposed retrieval policy

Begin with HTML text and linked public documents. Use weekly checks for background policy pages, daily discovery for active listings and the PRD's deadline-based recheck policy for accepted opportunities. Browser automation remains disabled for the first collector.

Start at one concurrent request per domain and a configurable delay of at least five seconds between requests, subject to any stricter source rule. Apply bounded retry with backoff, content hashing, conditional HTTP requests where supported and byte or time limits. These are proposed polite defaults, not an assertion of permission.

Do not send personal user profiles to universities or search engines. Search queries should contain topics, scholarship terms and geography only. Source availability failures create a retry state; they do not mean a scholarship closed.

## 6 Fixtures to create in the scaffold

| Fixture | Expected result |
| --- | --- |
| Relevant degree without award evidence | Hold as lead; suppress funded-opportunity alert |
| Fully supported scholarship with application fee | Display coverage and fee separately; strict zero-fee filter excludes |
| Generic scholarship guide | Reference only; no fabricated intake or deadline |
| First-year tuition award | Record duration; never imply four years of funding |
| Program date differs from award date | Show both labels; reminder follows the applicable award deadline |
| Course labelled free without certificate policy | Free participation candidate; certificate cost unknown |
| Event index without event fee evidence | Discovery lead only |
| Changed page keeps old URL | Extract actual current intake; preserve prior revision |

All fixtures must use synthetic or minimal attributed excerpts rather than copying complete webpages. Source approval and human publication review remain required before live alerts.
