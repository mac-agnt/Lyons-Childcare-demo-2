/* ─────────────────────────────────────────────────────────────────────────────
   SHOURNAGH OS · SYNTHETIC DEMO DATASET (single source of truth)

   EVERYTHING HERE IS FICTIONAL SAMPLE DATA FOR A SALES DEMONSTRATION.
   Real, public facts used:
     - Shournagh Childcare, Blarney, Co. Cork. Owner/manager Edel Lyons.
     - Elmgrove, Shournagh Road: Tusla TU2015CC365, registered capacity 77.
     - Ballyneety, Shournagh Road: Tusla TU2015CC366, registered sessional capacity 55,
       register associates Claire Lyons; a school-age service at Ballyneety is
       registered separately as TU2021CC067SA (capacity not added to any count here).
   DEMO ASSUMPTIONS (need client validation):
     - Room names, room sizes, ages and which rooms run in which building.
     - Every child, guardian and staff name other than Edel Lyons (and Claire Lyons,
       shown only as the public register contact) is invented.
     - Fees, invoice amounts and funding amounts are illustrative, not current prices.
     - "placesPerDay" is a planning figure for the booking grid, not a ratio or
       regulatory number. No statutory ratio rules are configured.
     - Acorn Cloud, NCS/ECCE portals and Early Years Hive are shown as existing
       systems or manual workflows; no live integration exists.
   ───────────────────────────────────────────────────────────────────────────── */
import type {
  Site, Room, Child, Guardian, Family, Staff, Invoice, FundingItem, Policy, Task,
  Approval, Exception, DemoEvent, Message, Enquiry, CareLog, ProgressReport,
  Handover, CleaningItem, LeaveRequest, Onboarding, SiteId,
} from "./types";

/* ── Demo clock ────────────────────────────────────────────────────────────── */
export const DEMO_NOW = "09:42";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const today = new Date();
export const DEMO_DATE = today;
/** Day label offset from the demo day, e.g. dayLabel(-3) = "13 Nov". */
export function dayLabel(offset: number): string {
  const d = new Date(today.getTime() + offset * 86400000);
  return d.getDate() + " " + MONTHS[d.getMonth()];
}
export const TODAY_LABEL = DAYS[today.getDay()] + " " + dayLabel(0);
/** Mon..Fri index of the demo day (weekends show as Monday). */
export const TODAY_IDX = (() => { const g = today.getDay(); return g >= 1 && g <= 5 ? g - 1 : 0; })();
export const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri"];

/* ── Deterministic generator ───────────────────────────────────────────────── */
function prng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(20261116);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

/* ── Sites ─────────────────────────────────────────────────────────────────── */
export const SITES: Site[] = [
  {
    id: "elm", name: "Elmgrove", full: "Shournagh Childcare",
    address: "Elmgrove, Shournagh Road, Blarney, Co. Cork",
    tusla: "TU2015CC365", capacity: 77, capacityLabel: "Registered capacity",
    serviceType: "Full day care, ECCE preschool",
    registryContact: "Edel Lyons", manager: "s01",
    extraRegistrations: [],
    programmes: ["Full day care", "ECCE (within full day)", "Breakfast club", "Holiday programme"],
  },
  {
    id: "bal", name: "Ballyneety", full: "Shournagh Childcare (Ballyneety)",
    address: "Ballyneety, Shournagh Road, Blarney, Co. Cork",
    tusla: "TU2015CC366", capacity: 55, capacityLabel: "Registered sessional capacity",
    serviceType: "Sessional ECCE playschool",
    registryContact: "Claire Lyons", manager: "s18",
    extraRegistrations: [
      { ref: "TU2021CC067SA", label: "School-age service (after-school)", note: "Separate registration. Its places are not added to the 55 sessional places." },
    ],
    programmes: ["ECCE playschool (sessional)", "After-school (school-age service)", "Holiday programme"],
  },
];
export const siteName = (id: SiteId) => (id === "elm" ? "Elmgrove" : "Ballyneety");

/* ── Rooms ─────────────────────────────────────────────────────────────────── */
function week(base: number[], todayVal: number): [number, number, number, number, number] {
  const w = base.slice() as [number, number, number, number, number];
  w[TODAY_IDX] = todayVal;
  return w;
}
export const ROOMS: Room[] = [
  { id: "elm-babies", site: "elm", name: "Babies", programme: "babies", ages: "6 to 12 months", hours: "08:00-18:00", leader: "s03", placesPerDay: 10, bookedByDay: week([9, 10, 10, 9, 8], 9), tabletId: "TAB-E1" },
  { id: "elm-wobblers", site: "elm", name: "Wobblers", programme: "wobblers", ages: "1 to 2 years", hours: "08:00-18:00", leader: "s05", placesPerDay: 14, bookedByDay: week([12, 14, 12, 14, 11], 12), tabletId: "TAB-E2" },
  { id: "elm-toddlers", site: "elm", name: "Toddlers", programme: "toddlers", ages: "2 to 3 years", hours: "08:00-18:00", leader: "s07", placesPerDay: 20, bookedByDay: week([17, 19, 18, 20, 16], 17), tabletId: "TAB-E3" },
  { id: "elm-preschool", site: "elm", name: "Preschool", programme: "preschool", ages: "3 to 5 years (ECCE + full day)", hours: "08:00-18:00", leader: "s10", placesPerDay: 26, bookedByDay: week([24, 25, 24, 26, 22], 24), tabletId: "TAB-E4" },
  { id: "bal-robins", site: "bal", name: "Robins", programme: "ecce", ages: "ECCE, 2 years 8 months to school age", hours: "09:00-12:00", leader: "s19", placesPerDay: 24, bookedByDay: week([22, 24, 23, 24, 22], 22), tabletId: "TAB-B1" },
  { id: "bal-wrens", site: "bal", name: "Wrens", programme: "ecce", ages: "ECCE, 2 years 8 months to school age", hours: "09:00-12:00", leader: "s22", placesPerDay: 18, bookedByDay: week([12, 15, 16, 14, 12], 12), tabletId: "TAB-B2" },
  { id: "bal-afterschool", site: "bal", name: "After-school", programme: "afterschool", ages: "School age, 4 to 12 years", hours: "13:30-18:00", leader: "s25", placesPerDay: 14, bookedByDay: week([8, 10, 11, 9, 8], 8), tabletId: "TAB-B3" },
];
/** Children holding a current booking per room, and attending today. */
export const ROOM_COUNTS: Record<string, { booked: number; attending: number; notIn: number }> = {
  "elm-babies": { booked: 10, attending: 9, notIn: 0 },
  "elm-wobblers": { booked: 14, attending: 12, notIn: 1 },
  "elm-toddlers": { booked: 20, attending: 17, notIn: 1 },
  "elm-preschool": { booked: 26, attending: 24, notIn: 2 },
  "bal-robins": { booked: 24, attending: 22, notIn: 0 },
  "bal-wrens": { booked: 16, attending: 12, notIn: 1 },
  "bal-afterschool": { booked: 11, attending: 8, notIn: 8 },
};

/* ── Staff (30, excluding Edel) ────────────────────────────────────────────── */
type S = [string, string, string, Staff["access"], SiteId, string | null, Staff["status"], string, string, string];
const STAFF_ROWS: S[] = [
  // id, name, role, access, site, room, status, statusNote, shift, qualification
  ["s01", "Gráinne Twomey", "Centre Manager, Elmgrove", "Site Manager", "elm", null, "on", "", "07:30-16:00", "BA Early Childhood Studies (QQI L8)"],
  ["s02", "Deirdre Nagle", "HR and Finance Administrator", "HR/Finance", "elm", null, "on", "Works across both sites", "08:30-16:30", "Certificate in Payroll (IPASS)"],
  ["s03", "Orla Fitzgerald", "Room Leader, Babies", "Room Leader", "elm", "elm-babies", "on", "", "08:00-16:30", "QQI Level 7"],
  ["s04", "Úna Healy", "Early Years Educator", "Early Years Educator", "elm", "elm-babies", "on", "", "09:30-18:00", "QQI Level 6"],
  ["s05", "Lorraine Kiely", "Room Leader, Wobblers", "Room Leader", "elm", "elm-wobblers", "on", "", "08:00-16:30", "QQI Level 6"],
  ["s06", "Sinéad Daly", "Early Years Educator", "Early Years Educator", "elm", "elm-wobblers", "on", "", "09:30-18:00", "QQI Level 5"],
  ["s07", "Aisling Corcoran", "Room Leader, Toddlers", "Room Leader", "elm", "elm-toddlers", "on", "", "08:00-16:30", "QQI Level 8"],
  ["s08", "Méabh Ryan", "Early Years Educator", "Early Years Educator", "elm", "elm-toddlers", "on", "", "08:00-16:30", "QQI Level 6"],
  ["s09", "Hannah Keane", "Early Years Educator", "Early Years Educator", "elm", "elm-toddlers", "leave", "Annual leave (approved)", "", "QQI Level 6"],
  ["s10", "Rachel Buckley", "Room Leader, Preschool", "Room Leader", "elm", "elm-preschool", "on", "", "08:00-16:30", "QQI Level 8"],
  ["s11", "Clodagh Walsh", "Early Years Educator", "Early Years Educator", "elm", "elm-preschool", "on", "", "08:30-17:00", "QQI Level 6"],
  ["s12", "Niamh Sheehan", "Early Years Educator", "Early Years Educator", "elm", "elm-preschool", "on", "", "09:30-18:00", "QQI Level 5"],
  ["s13", "Eimear Lynch", "Early Years Educator (floater)", "Early Years Educator", "elm", null, "sick", "Sick leave, called in 07:05", "", "QQI Level 6"],
  ["s14", "Mary O'Leary", "Cook", "Support", "elm", null, "on", "", "08:00-14:00", "Food Safety (HACCP) Level 2"],
  ["s15", "Joanne Cotter", "Early Years Educator", "Early Years Educator", "elm", "elm-wobblers", "off", "Rostered day off", "", "QQI Level 6"],
  ["s16", "Ella Mahony", "Early Years Educator (new hire)", "Early Years Educator", "elm", "elm-toddlers", "onboarding", "Induction, not yet on the floor", "", "QQI Level 6 (certificate copy outstanding)"],
  ["s17", "Kate Murray", "Early Years Educator", "Early Years Educator", "elm", "elm-babies", "on", "", "08:00-16:30", "QQI Level 6"],
  ["s18", "Siobhán Barry", "Centre Manager, Ballyneety", "Site Manager", "bal", null, "on", "", "08:00-16:00", "BA Early Childhood Care and Education (QQI L8)"],
  ["s19", "Aoibhinn Quinlan", "Room Leader, Robins", "Room Leader", "bal", "bal-robins", "on", "", "08:30-12:30", "QQI Level 7"],
  ["s20", "Leah Crowley", "Early Years Educator", "Early Years Educator", "bal", "bal-robins", "on", "", "08:30-12:30", "QQI Level 6"],
  ["s21", "Fiona Hurley", "Early Years Educator", "Early Years Educator", "bal", "bal-robins", "on", "", "08:30-12:30", "QQI Level 6"],
  ["s22", "Tara Nolan", "Room Leader, Wrens", "Room Leader", "bal", "bal-wrens", "on", "", "08:30-12:30", "QQI Level 7"],
  ["s23", "Caoimhe Desmond", "Early Years Educator", "Early Years Educator", "bal", "bal-wrens", "on", "", "08:30-12:30", "QQI Level 6"],
  ["s24", "Gemma Forde", "Early Years Educator", "Early Years Educator", "bal", "bal-wrens", "training", "Paediatric first aid course", "", "QQI Level 6"],
  ["s25", "Ciarán Moynihan", "After-school Leader", "Room Leader", "bal", "bal-afterschool", "sick", "Sick leave, after-school shift uncovered", "", "QQI Level 7"],
  ["s26", "Jack Hegarty", "After-school Educator", "Early Years Educator", "bal", "bal-afterschool", "on", "", "13:00-18:30", "QQI Level 5"],
  ["s27", "Shauna Kelleher", "After-school Educator", "Early Years Educator", "bal", "bal-afterschool", "on", "", "13:00-18:30", "QQI Level 6"],
  ["s28", "Michelle Coughlan", "Early Years Educator (floater)", "Early Years Educator", "bal", null, "on", "Available 14:00-18:00 (approved availability)", "08:30-12:30", "QQI Level 6"],
  ["s29", "Paula Dineen", "Deputy Manager and Administrator", "Site Manager", "bal", null, "on", "", "08:00-14:00", "QQI Level 7"],
  ["s30", "Ruth Kingston", "Early Years Educator", "Early Years Educator", "bal", "bal-robins", "leave", "Annual leave (approved)", "", "QQI Level 6"],
];
const SAFE_SLEEP_PENDING = new Set(["s16", "s26", "s27", "s28"]);
const VETTING_DUE = new Set(["s12", "s21"]);
export const STAFF: Staff[] = STAFF_ROWS.map((r, i) => {
  const [id, name, role, access, site, room, status, statusNote, shift, qualification] = r;
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const weekShifts = WEEKDAYS.map((_, d) => (d === TODAY_IDX ? (shift || "Off") : (rnd() < 0.18 ? "Off" : (shift || "08:00-16:30"))));
  return {
    id, name, initials, role, access, site, room, status, statusNote, shift,
    week: weekShifts,
    contract: id === "s16" ? "Signed 2026" : (i % 7 === 3 ? "Awaiting signature" : "Signed 2026"),
    qualification,
    vetting: VETTING_DUE.has(id)
      ? { status: "Renewal due", date: dayLabel(21) }
      : { status: "Valid", date: dayLabel(-120 - i * 9) },
    firstAid: i % 6 === 2 ? "Expires " + dayLabel(34) : "Valid to " + dayLabel(200 + i * 5),
    childrenFirst: "Completed (Tusla e-learning)",
    induction: id === "s16" ? "In progress" : "Complete",
    safeSleepSigned: SAFE_SLEEP_PENDING.has(id) ? null : (i % 3 === 0 ? dayLabel(-5) : dayLabel(-4)),
    started: id === "s16" ? dayLabel(-6) : String(2012 + (i % 13)),
  };
});
export const EDEL = { id: "edel", name: "Edel Lyons", initials: "EL", role: "Owner" };

/* ── Children, families, guardians ─────────────────────────────────────────── */
const FIRSTS = ["Cian","Sadhbh","Éabha","Tom","Grace","Jack","Molly","Seán","Róisín","Liam","Ciara","Noah","Isla","Rían","Caoimhe","Senan","Ella","James","Anna","Luke","Hannah","Daniel","Méabh","Conall","Emily","Odhrán","Freya","Harry","Sophie","Cormac","Clodagh","Adam","Nora","Bláthnaid","Ronan","Kate","Dara","Charlie","Lucy","Finn","Erin","Patrick","Holly","Eoin","Mia","Ruairí","Zoe","Shane","Amelia","Ben","Orla","Max","Leah","Alex","Niamh","Colm","Ailbhe","Josh","Kayla","Peadar","Saoirse","Fiach","Lorcan","Aoibhe","Evie","Olivia","Darcy","Tiernan","Clara","Rosie"];
const SURNAMES = ["Kelleher","O'Sullivan","O'Connor","Barrett","Collins","Callaghan","Leahy","Horgan","Noonan","Riordan","Cahill","Long","Kearney","Coakley","Galvin","Hogan","Linehan","Moloney","Ahern","Dennehy","Fitzpatrick","Harrington","McSweeney","O'Driscoll","Power","Roche","Spillane","Tobin","Mullins","Corkery","O'Keeffe","Donovan","O'Neill","Ring","Duggan","Twomey","Murray","Foley","Creedon","Lordan","Cremin","Herlihy","Kenneally","Lane","Sexton","Buckley","Desmond","Hayes"];
const ADULTS_F = ["Ciara","Laura","Siobhán","Aoife","Rachel","Emma","Sarah","Niamh","Claire","Louise","Gillian","Fiona","Karen","Orla","Michelle","Deborah","Catherine","Ann-Marie","Yvonne","Sinéad"];
const ADULTS_M = ["Tom","Eoin","Brian","Kevin","David","Mark","John","Pádraig","Barry","Colm","Declan","Gavin","Ronan","Seán","Alan","Fergal","Dónal","Cathal","Niall","Paul"];

const ROOM_AGE: Record<string, () => string> = {
  "elm-babies": () => (6 + Math.floor(rnd() * 6)) + " months",
  "elm-wobblers": () => "1 year " + Math.floor(rnd() * 11) + " months",
  "elm-toddlers": () => "2 years " + Math.floor(rnd() * 11) + " months",
  "elm-preschool": () => (3 + Math.floor(rnd() * 2)) + " years " + Math.floor(rnd() * 11) + " months",
  "bal-robins": () => (3 + Math.floor(rnd() * 2)) + " years " + Math.floor(rnd() * 11) + " months",
  "bal-wrens": () => "3 years " + Math.floor(rnd() * 11) + " months",
  "bal-afterschool": () => (5 + Math.floor(rnd() * 6)) + " years",
};
const KEYWORKERS: Record<string, string[]> = {
  "elm-babies": ["s03", "s04", "s17"], "elm-wobblers": ["s05", "s06"], "elm-toddlers": ["s07", "s08"],
  "elm-preschool": ["s10", "s11", "s12"], "bal-robins": ["s19", "s20", "s21"], "bal-wrens": ["s22", "s23"],
  "bal-afterschool": ["s26", "s27"],
};

/* Named story children: [id, first, last, room, family, age, funding, alert] */
type Named = [string, string, string, string, string, string, Child["funding"], string | null];
const NAMED: Named[] = [
  ["c-aoife", "Aoife", "Murphy", "elm-toddlers", "fam-murphy", "2 years 4 months", "NCS", null],
  ["c-darragh", "Darragh", "Murphy", "elm-preschool", "fam-murphy", "4 years 1 month", "ECCE + NCS", null],
  ["c-oisin", "Oisín", "Brennan", "elm-wobblers", "fam-brennan", "1 year 7 months", "NCS", null],
  ["c-saoirse", "Saoirse", "O'Mahony", "elm-preschool", "fam-omahony", "3 years 9 months", "ECCE + NCS", "Nut allergy: care plan on file"],
  ["c-rory", "Rory", "Hayes", "elm-toddlers", "fam-hayes", "2 years 7 months", "NCS", null],
  ["c-ellie", "Ellie", "Dempsey", "bal-afterschool", "fam-dempsey", "7 years", "Private", null],
  ["c-fiadh", "Fiadh", "Cronin", "bal-robins", "fam-cronin", "3 years 11 months", "ECCE", null],
  ["c-tadhg", "Tadhg", "McCarthy", "elm-babies", "fam-mccarthy", "9 months", "NCS", "Dairy-free diet: care plan on file"],
  ["c-lily", "Lily", "Hennessy", "elm-toddlers", "fam-hennessy", "2 years 9 months", "NCS", null],
  ["c-conor", "Conor", "Lucey", "bal-wrens", "fam-lucey", "3 years 3 months", "ECCE", null],
  ["c-ava", "Ava", "Twohig", "elm-preschool", "fam-twohig", "3 years 6 months", "ECCE + NCS", "Asthma: inhaler kept in room"],
];
const NOT_IN_TODAY: Record<string, number> = { "elm-wobblers": 1, "elm-toddlers": 1, "elm-preschool": 2, "bal-wrens": 1, "bal-afterschool": 8 };

export const CHILDREN: Child[] = [];
export const FAMILIES: Family[] = [];
export const GUARDIANS: Guardian[] = [];

function arrivalFor(room: Room): string {
  if (room.programme === "ecce") return "08:5" + Math.floor(rnd() * 10);
  if (room.programme === "afterschool") return "13:35";
  const m = 45 + Math.floor(rnd() * 75);
  const h = 7 + Math.floor(m / 60);
  return String(h).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}
function patternFor(attending: boolean, ecce: boolean): string[] {
  if (ecce) return attending ? WEEKDAYS.slice() : WEEKDAYS.filter((_, i) => i !== TODAY_IDX);
  const n = 2 + Math.floor(rnd() * 4);
  const days = WEEKDAYS.filter((_, i) => i !== TODAY_IDX).sort(() => rnd() - 0.5).slice(0, attending ? n - 1 : n);
  if (attending) days.push(WEEKDAYS[TODAY_IDX]);
  return WEEKDAYS.filter((d) => days.includes(d));
}
function addFamily(id: string, surname: string, site: SiteId, guardians?: [string, string, boolean][]) {
  const gs = guardians || [[pick(ADULTS_F) + " " + surname, "Mother", true], [pick(ADULTS_M) + " " + surname, "Father", false]];
  const ids: string[] = [];
  gs.forEach((g, gi) => {
    const gid = id + "-g" + (gi + 1);
    ids.push(gid);
    const first = g[0].split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    GUARDIANS.push({
      id: gid, name: g[0], relation: g[1], family: id,
      phone: "087 ••• " + String(1000 + Math.floor(rnd() * 8999)).slice(0, 4),
      email: first.charAt(0) + "•••@" + pick(["gmail.com", "eircom.net", "outlook.ie", "icloud.com"]),
      authorisedCollect: true, primary: g[2],
    });
  });
  FAMILIES.push({ id, name: surname + " family", guardians: ids, children: [], site, balance: 0, ackParentComms: rnd() < 0.62 });
}

// story families first, with fixed guardians
addFamily("fam-murphy", "Murphy", "elm", [["Laura Murphy", "Mother", true], ["Eoin Murphy", "Father", false], ["Mary Murphy", "Grandmother", false]]);
addFamily("fam-brennan", "Brennan", "elm", [["Ciara Brennan", "Mother", true], ["Tom Brennan", "Father", false]]);
addFamily("fam-omahony", "O'Mahony", "elm", [["Rachel O'Mahony", "Mother", true]]);
addFamily("fam-hayes", "Hayes", "elm", [["Gillian Hayes", "Mother", true], ["Brian Hayes", "Father", false]]);
addFamily("fam-dempsey", "Dempsey", "bal", [["Louise Dempsey", "Mother", true], ["Mark Dempsey", "Father", false]]);
addFamily("fam-cronin", "Cronin", "bal", [["Karen Cronin", "Mother", true], ["Declan Cronin", "Father", false]]);
addFamily("fam-mccarthy", "McCarthy", "elm", [["Fiona McCarthy", "Mother", true], ["Niall McCarthy", "Father", false]]);
addFamily("fam-hennessy", "Hennessy", "elm", [["Orla Hennessy", "Mother", true], ["David Hennessy", "Father", false]]);
addFamily("fam-lucey", "Lucey", "bal", [["Yvonne Lucey", "Mother", true], ["Alan Lucey", "Father", false]]);
addFamily("fam-twohig", "Twohig", "elm", [["Catherine Twohig", "Mother", true], ["Pádraig Twohig", "Father", false]]);
FAMILIES.find((f) => f.id === "fam-murphy")!.ackParentComms = false;
FAMILIES.find((f) => f.id === "fam-murphy")!.balance = 212.4;
GUARDIANS.find((g) => g.id === "fam-dempsey-g3"); // (no third guardian: grandmother is NOT authorised, see messages)

const usedNames = new Set(NAMED.map((n) => n[1] + " " + n[2]));
let famSeq = 0;
for (const room of ROOMS) {
  const counts = ROOM_COUNTS[room.id];
  const named = NAMED.filter((n) => n[3] === room.id);
  const kids: { id: string; first: string; last: string; family: string; age: string; funding: Child["funding"]; alert: string | null }[] = [];
  named.forEach((n) => kids.push({ id: n[0], first: n[1], last: n[2], family: n[4], age: n[5], funding: n[6], alert: n[7] }));
  let k = 0;
  while (kids.length < counts.booked) {
    let first = pick(FIRSTS), last = pick(SURNAMES);
    while (usedNames.has(first + " " + last)) { first = pick(FIRSTS); last = pick(SURNAMES); }
    usedNames.add(first + " " + last);
    const fid = "fam-" + (++famSeq);
    addFamily(fid, last, room.site);
    const ecce = room.programme === "ecce";
    const funding: Child["funding"] = ecce ? "ECCE" : room.programme === "preschool" ? (rnd() < 0.7 ? "ECCE + NCS" : "ECCE") : room.programme === "afterschool" ? (rnd() < 0.4 ? "NCS" : "Private") : (rnd() < 0.82 ? "NCS" : "Private");
    kids.push({ id: room.id + "-" + (++k), first, last, family: fid, age: ROOM_AGE[room.id](), funding, alert: rnd() < 0.05 ? pick(["Egg allergy: care plan on file", "Eczema: cream consent on file"]) : null });
  }
  // attending: the first `attending` kids (named kids are always attending, except none)
  const notIn = NOT_IN_TODAY[room.id] || 0;
  kids.forEach((kid, idx) => {
    const attending = idx < counts.attending;
    const isLate = attending && idx >= counts.attending - notIn;
    const expected = arrivalFor(room);
    let checkedIn: string | null = attending && !isLate ? expected : null;
    if (kid.id === "c-aoife" || kid.id === "c-darragh") checkedIn = "08:10";
    const kws = KEYWORKERS[room.id];
    const child: Child = {
      id: kid.id, first: kid.first, last: kid.last, site: room.site, room: room.id, age: kid.age,
      family: kid.family, pattern: patternFor(attending, room.programme === "ecce"),
      hours: room.programme === "ecce" ? "15 hrs (ECCE)" : room.programme === "afterschool" ? (8 + Math.floor(rnd() * 12)) + " hrs" : (20 + Math.floor(rnd() * 5) * 5) + " hrs",
      funding: kid.funding, attendingToday: attending,
      expected: isLate ? (room.programme === "afterschool" ? "13:35" : room.programme === "ecce" ? "09:00 (late)" : pick(["09:50", "10:00", "10:30"])) : expected,
      checkedIn, checkedOut: null, alert: kid.alert,
      consents: { photos: rnd() > 0.08, sunscreen: rnd() > 0.04, outings: rnd() > 0.06, firstAid: true },
      keyworker: kid.id === "c-aoife" ? "s08" : kws[idx % kws.length],
    };
    if (kid.id === "c-aoife") child.expected = "08:10";
    CHILDREN.push(child);
    const fam = FAMILIES.find((f) => f.id === kid.family)!;
    fam.children.push(kid.id);
  });
}
// Aoife was dropped by Laura; Darragh is awaiting collection (illustrative)
const darragh = CHILDREN.find((c) => c.id === "c-darragh")!;
darragh.alert = "Awaiting collection: temperature (guardian ETA 10:00)";
// Story families' balances (the 6 overdue invoices are separate from current balance)
FAMILIES.forEach((f) => { if (!f.balance) f.balance = f.children.length ? Math.round((40 + rnd() * 220) * 10) / 10 : 0; });

/* ── Fees (illustrative only) ──────────────────────────────────────────────── */
export const FEE_SCHEDULE = [
  { programme: "Full day care (08:00-18:00), Babies and Wobblers", rows: [["5 days", 249], ["4 days", 209], ["3 days", 164], ["2 days", 114]] },
  { programme: "Full day care (08:00-18:00), Toddlers and Preschool", rows: [["5 days", 239], ["4 days", 199], ["3 days", 155], ["2 days", 108]] },
  { programme: "After-school (school pick-up to 18:00)", rows: [["5 days", 135], ["4 days", 112], ["3 days", 90], ["2 days", 62]] },
  { programme: "ECCE playschool, 3 hours (state-funded, 38 weeks)", rows: [["Core session", 0], ["Wrap-around hour", 8], ["Lunch club (per day)", 6]] },
] as { programme: string; rows: [string, number][] }[];

/* ── Overdue invoices (6, total €2,940) ────────────────────────────────────── */
const inv = (id: string, num: string, family: string, child: string, site: SiteId, amount: number, days: number, period: string, lines: Invoice["lines"]): Invoice => ({
  id, number: num, family, child, site, amount, period, issued: dayLabel(-days - 14), due: dayLabel(-days), daysOverdue: days, status: "overdue", lines,
});
export const INVOICES: Invoice[] = [
  inv("inv-2611", "INV-2611", "fam-brennan", "c-oisin", "elm", 640, 23, "Oct, weeks 3 to 4", [
    { label: "Full day care, Wobblers (4 days x 2 weeks)", qty: "8 days", amount: 418 },
    { label: "Additional days booked (2)", qty: "2 days", amount: 104.5 },
    { label: "Late collection (3 occasions)", qty: "3", amount: 45 },
    { label: "NCS subsidy applied", qty: "", amount: -52.5 },
    { label: "Balance brought forward", qty: "", amount: 125 },
  ]),
  inv("inv-2604", "INV-2604", "fam-omahony", "c-saoirse", "elm", 540, 31, "Oct, weeks 1 to 2", [
    { label: "Full day care, Preschool (5 days x 2 weeks)", qty: "10 days", amount: 478 },
    { label: "ECCE hours deducted", qty: "30 hrs", amount: -96 },
    { label: "Holiday programme day", qty: "1", amount: 52 },
    { label: "Balance brought forward", qty: "", amount: 106 },
  ]),
  inv("inv-2598", "INV-2598", "fam-hayes", "c-rory", "elm", 480, 17, "Oct, weeks 3 to 4", [
    { label: "Full day care, Toddlers (3 days x 2 weeks)", qty: "6 days", amount: 310 },
    { label: "Additional day booked", qty: "1", amount: 52 },
    { label: "Balance brought forward", qty: "", amount: 118 },
  ]),
  inv("inv-2617", "INV-2617", "fam-dempsey", "c-ellie", "bal", 450, 12, "Oct to Nov, 3 weeks", [
    { label: "After-school, 5 days x 3 weeks", qty: "15 days", amount: 405 },
    { label: "Mid-term camp day", qty: "1", amount: 45 },
  ]),
  inv("inv-2620", "INV-2620", "fam-cronin", "c-fiadh", "bal", 430, 9, "Oct to Nov, 6 weeks", [
    { label: "ECCE wrap-around hours", qty: "40 hrs", amount: 320 },
    { label: "Lunch club", qty: "15 days", amount: 90 },
    { label: "Outing contribution", qty: "1", amount: 20 },
  ]),
  inv("inv-2609", "INV-2609", "fam-mccarthy", "c-tadhg", "elm", 400, 26, "Oct, weeks 2 to 3", [
    { label: "Full day care, Babies (3 days x 2 weeks)", qty: "6 days", amount: 328 },
    { label: "NCS subsidy applied", qty: "", amount: -48 },
    { label: "Balance brought forward", qty: "", amount: 120 },
  ]),
];

/* ── Funding reconciliation exceptions (3, total €432) ─────────────────────── */
export const FUNDING: FundingItem[] = [
  { id: "fx-1", scheme: "NCS", child: "c-lily", site: "elm", amount: 182, status: "open", reviewer: null,
    issue: "Hours mismatch: Acorn booking is 40 hrs/week, NCS registration on the portal shows 35 hrs/week.",
    acorn: "Booking: Mon to Fri, 08:00-16:00 (40 hrs) since 2 Sep", portal: "NCS registration: 35 hrs/week, last updated 30 Aug",
    booking: "Toddlers, 5 days", source: "Acorn export (Fri 17:02) vs portal entry keyed manually by Deirdre Nagle" },
  { id: "fx-2", scheme: "ECCE", child: "c-conor", site: "bal", amount: 150, status: "open", reviewer: null,
    issue: "Start date differs: Acorn shows ECCE start 1 Sep, portal registration shows 15 Sep.",
    acorn: "ECCE start: 1 Sep, attended from 2 Sep", portal: "ECCE registration: start 15 Sep",
    booking: "Wrens, ECCE 5 mornings", source: "Acorn attendance export vs Early Years Hive (manual check)" },
  { id: "fx-3", scheme: "NCS", child: "c-ava", site: "elm", amount: 100, status: "open", reviewer: null,
    issue: "NCS award renewal pending: the family's award code is past its renewal date; subsidy held until renewed.",
    acorn: "Subsidy applied on Oct invoices", portal: "Award status: renewal due, parent action needed",
    booking: "Preschool, 4 days (ECCE + NCS)", source: "Portal status keyed manually, parent reminder not yet sent" },
];

/* ── Policies ──────────────────────────────────────────────────────────────── */
export const POLICIES: Policy[] = [
  { id: "pol-safesleep", title: "Safe Sleep Policy", version: "4.0", category: "Health & wellbeing", audience: "Staff", appliesTo: "All staff, both sites",
    owner: "edel", author: "s01", effective: dayLabel(-7), nextReview: dayLabel(358), status: "Published", requiresSignature: true, stage: "signatures",
    changeSummary: "Sleep checks every 10 minutes recorded on the room tablet, cot spacing updated, new sleep room sign-in sheet replaced by the tablet log.",
    sources: ["Tusla Quality and Regulatory Framework (reference)", "HSE safe sleep guidance (reference)", "Edel Lyons, owner standard"],
    excerpt: [
      { heading: "4.2 Sleep checks", text: "A named educator checks each sleeping child at least every 10 minutes and records the check on the room tablet. Checks are visual and close enough to see the child's breathing." },
      { heading: "4.3 Position and space", text: "Babies are placed on their backs to sleep, feet to foot of the cot, with no loose bedding, bumpers or soft toys." },
    ] },
  { id: "pol-illness", title: "Illness and Exclusion Policy", version: "3.1", category: "Health & wellbeing", audience: "Staff and parents", appliesTo: "All staff and families",
    owner: "edel", author: "s01", effective: dayLabel(-210), nextReview: dayLabel(40), status: "Published", requiresSignature: false, stage: "complete",
    changeSummary: "Exclusion periods aligned with HSE guidance; parent notification steps for urgent collection added.",
    sources: ["HSE Management of Infectious Disease in Childcare Facilities (reference)"],
    excerpt: [
      { heading: "5.1 When to keep your child at home", text: "If your child has a temperature of 38°C or above, vomiting or diarrhoea, please keep them at home and let the room know through the app." },
      { heading: "5.4 Chickenpox", text: "Children with chickenpox should stay at home until all spots have crusted over, usually about 5 days after the spots first appear. Please tell the centre so other families can be informed without naming your child." },
      { heading: "6.2 Urgent collection", text: "If your child becomes unwell at the centre, the room leader will contact you through an Urgent notice that needs your acknowledgement. If we do not hear back within 15 minutes we will phone you, then your second contact." },
    ] },
  { id: "pol-collection", title: "Collection Authorisation Procedure", version: "2.1", category: "Safeguarding", audience: "Staff and parents", appliesTo: "All staff and families",
    owner: "edel", author: "s18", effective: dayLabel(-300), nextReview: dayLabel(-2), status: "Published", requiresSignature: true, stage: "complete",
    changeSummary: "v2.2 draft: one-time collectors must be added in the parent app with photo ID check at the door.",
    sources: ["Children First: National Guidance (reference)"],
    excerpt: [
      { heading: "3.1 Authorised collectors", text: "Only people listed as authorised collectors on the child's record can collect. A one-time collector must be named by a guardian in advance and show photo ID." },
    ] },
  { id: "pol-safeguarding", title: "Child Safeguarding Statement", version: "5.2", category: "Safeguarding", audience: "Staff and parents", appliesTo: "Both services (separate statements per registration)",
    owner: "edel", author: "edel", effective: dayLabel(-160), nextReview: dayLabel(205), status: "Published", requiresSignature: true, stage: "complete",
    changeSummary: "Annual review. Designated Liaison Persons confirmed per site.", sources: ["Children First Act 2015 (reference)", "Tusla Children First guidance (reference)"],
    excerpt: [{ heading: "2 Designated Liaison Person", text: "Each service names its own Designated Liaison Person and deputy. Concerns are recorded and reported under Children First, never handled by software alone." }] },
  { id: "pol-medication", title: "Medication Administration Policy", version: "2.3", category: "Health & wellbeing", audience: "Staff and parents", appliesTo: "All rooms",
    owner: "edel", author: "s01", effective: dayLabel(-90), nextReview: dayLabel(275), status: "Published", requiresSignature: true, stage: "complete",
    changeSummary: "Two-person check recorded on tablet; written parent consent required before any dose.", sources: ["Tusla Early Years regulations guidance (reference)"],
    excerpt: [{ heading: "4 Giving medication", text: "Medication is only given with written parental consent on file. Two staff check the child, medicine, dose and time, and both sign the record." }] },
  { id: "pol-accident", title: "Accident and Incident Policy", version: "3.0", category: "Operations", audience: "Staff", appliesTo: "All staff",
    owner: "edel", author: "s18", effective: dayLabel(-120), nextReview: dayLabel(245), status: "Published", requiresSignature: true, stage: "complete",
    changeSummary: "Incident logs are reviewed by the room leader and manager before the parent copy is shared.", sources: ["Internal procedure"],
    excerpt: [{ heading: "3 Recording", text: "Every accident or incident is logged on the room tablet, reviewed by the room leader and the centre manager, and shared with the parent the same day." }] },
  { id: "pol-cleaning", title: "Cleaning and Infection Control", version: "3.4", category: "Operations", audience: "Staff", appliesTo: "All staff",
    owner: "s01", author: "s01", effective: dayLabel(-60), nextReview: dayLabel(120), status: "Published", requiresSignature: false, stage: "complete",
    changeSummary: "Tablet checklists replace paper sheets; photo evidence optional.", sources: ["HSE infection prevention guidance (reference)"],
    excerpt: [{ heading: "2 Daily routine", text: "Bathrooms are checked and signed off at 10:00, 13:00 and 16:00. Nappy change areas are cleaned after every change." }] },
  { id: "pol-emergency", title: "Emergency Planning and Evacuation", version: "2.2", category: "Operations", audience: "Staff", appliesTo: "Per building",
    owner: "edel", author: "s29", effective: dayLabel(-250), nextReview: dayLabel(115), status: "Published", requiresSignature: true, stage: "complete",
    changeSummary: "Separate evacuation plans per building; drill log on tablet.", sources: ["Fire safety guidance (reference)"],
    excerpt: [{ heading: "1 Drills", text: "Fire drills run once a term in every room and are logged with time to evacuate." }] },
  { id: "pol-parentcomms", title: "Parent Communications Policy", version: "1.0", category: "Parents", audience: "Parents", appliesTo: "All families",
    owner: "edel", author: "edel", effective: dayLabel(-1), nextReview: dayLabel(180), status: "Published", requiresSignature: true, stage: "signatures",
    changeSummary: "Routine care logs live in the app only. Important notices are pushed. Urgent notices need acknowledgement with phone follow-up.", sources: ["Edel Lyons, owner standard"],
    excerpt: [
      { heading: "1 Routine updates", text: "Meals, sleeps, nappies and activities are recorded in the app. We do not email you for each one." },
      { heading: "2 Important and Urgent", text: "Important notices are pushed to your phone. Urgent notices, such as a collection request, need you to tap Acknowledge. If you do not, we phone you." },
    ] },
  { id: "pol-complaints", title: "Complaints Policy", version: "2.0", category: "Parents", audience: "Parents", appliesTo: "All families",
    owner: "edel", author: "edel", effective: dayLabel(-400), nextReview: dayLabel(-35), status: "In review", requiresSignature: false, stage: "review",
    changeSummary: "Review overdue: adding a 5 working day response target.", sources: ["Internal procedure"],
    excerpt: [{ heading: "1 Raising a concern", text: "Talk to your room leader first. If it is not resolved, the centre manager responds in writing." }] },
  { id: "pol-induction", title: "Staff Induction Guide 2026", version: "1.3", category: "People", audience: "Staff", appliesTo: "New staff, both sites",
    owner: "s02", author: "s02", effective: dayLabel(-45), nextReview: dayLabel(320), status: "Published", requiresSignature: true, stage: "complete",
    changeSummary: "Linked to How We Do It playbooks; room induction checklist on tablet.", sources: ["Edel Lyons, owner standard"],
    excerpt: [{ heading: "Week one", text: "Day one is shadowing your room leader. You read and sign the core policies before working unsupervised." }] },
  { id: "pol-fees", title: "Fees and Funding Policy (NCS and ECCE)", version: "2.1", category: "Parents", audience: "Parents", appliesTo: "All families",
    owner: "edel", author: "s02", effective: dayLabel(-75), nextReview: dayLabel(290), status: "Published", requiresSignature: true, stage: "complete",
    changeSummary: "NCS award renewals: families reminded 30 days before renewal date.", sources: ["NCS and ECCE scheme rules (reference, Early Years Hive)"],
    excerpt: [{ heading: "3 Subsidies", text: "NCS subsidies are applied once the award is confirmed for your child at our service. If an award lapses, the subsidy is paused until renewed." }] },
];

/* ── Exceptions on Edel's Home (5: 4 owned by managers, 1 needs Edel) ──────── */
export const EXCEPTIONS: Exception[] = [
  { id: "x-cover", story: "A", site: "bal", owner: "s18", status: "assigned", page: "People", tab: "leave",
    title: "After-school cover 14:00-18:00", detail: "Ciarán Moynihan is off sick. Michelle Coughlan has approved availability. Siobhán is confirming." },
  { id: "x-safesleep", story: "B", site: "both", owner: "edel", status: "needs-owner", page: "Policies", tab: "versions",
    title: "Safe Sleep v4.0: approve reminder to 4 staff", detail: "26 of 30 signed. 1 at Elmgrove, 3 at Ballyneety. Managers send once you approve." },
  { id: "x-funding", story: "C", site: "both", owner: "s02", status: "assigned", page: "Finance", tab: "reconciliation",
    title: "3 NCS/ECCE mismatches, €432", detail: "Acorn and portal entries disagree. Deirdre is reviewing; nothing is submitted automatically." },
  { id: "x-fees", story: "D", site: "both", owner: "s02", status: "assigned", page: "Finance", tab: "outstanding",
    title: "6 overdue invoices, €2,940", detail: "Oldest 31 days. Reminders are drafted for approval, nothing sent." },
  { id: "x-enquiry", story: "F", site: "elm", owner: "s01", status: "assigned", page: "Families", tab: "enquiries",
    title: "New enquiry: Sarah Doyle", detail: "Toddler place, 3 days a week at Elmgrove from January. Callback due 11:00." },
];

/* ── Approvals ─────────────────────────────────────────────────────────────── */
export const APPROVALS: Approval[] = [
  { id: "ap-safesleep", kind: "Policy", title: "Send Safe Sleep v4.0 reminder to 4 staff", story: "B", site: "both",
    detail: "Targeted reminder to Ella Mahony (Elmgrove) and Jack Hegarty, Shauna Kelleher, Michelle Coughlan (Ballyneety). Managers send it from their site.",
    requestedBy: "Policy Keeper", approver: "edel", status: "pending", link: { type: "policy", id: "pol-safesleep" }, decidedAt: null },
  { id: "ap-cover", kind: "Staff cover", title: "Cover: Michelle Coughlan to After-school, 14:00-18:00", story: "A", site: "bal",
    detail: "Ciarán Moynihan off sick. Michelle has approved availability and holds QQI Level 6. Coverage watch clears when confirmed.",
    requestedBy: "Rota Coordinator", approver: "s18", status: "pending", link: { type: "room", id: "bal-afterschool" }, decidedAt: null },
  { id: "ap-fund1", kind: "Finance", title: "Resolve NCS hours mismatch for Lily Hennessy (€182)", story: "C", site: "elm",
    detail: "Proposed: update the portal registration to 40 hrs/week after the parent confirms. Human submits on the portal.",
    requestedBy: "Funding Reconciler", approver: "s01", status: "pending", link: { type: "funding", id: "fx-1" }, decidedAt: null },
  { id: "ap-notice", kind: "Parent alert", title: "Important notice to Toddlers families: library visit Thursday", story: "E", site: "elm",
    detail: "Outing consent needed by Wednesday 17:00. Classified Important (push, no email per log).",
    requestedBy: "Parent Communications", approver: "s01", status: "pending", link: { type: "room", id: "elm-toddlers" }, decidedAt: null },
  { id: "ap-leave", kind: "Leave", title: "Annual leave: Sinéad Daly, 21 to 23 Dec", story: null, site: "elm",
    detail: "Cover proposed: Joanne Cotter. Wobblers stays within the planned roster.",
    requestedBy: "s06", approver: "s01", status: "pending", link: { type: "staff", id: "s06" }, decidedAt: null },
];

/* ── Tasks ─────────────────────────────────────────────────────────────────── */
const T = (id: string, title: string, owner: string, site: Task["site"], due: string, priority: Task["priority"], status: Task["status"],
  story: Task["story"], link: Task["link"], checklist: [string, boolean][], recurring: string | null = null, doneAt: string | null = null): Task =>
  ({ id, title, owner, site, due, priority, status, story, link, checklist: checklist.map(([label, done]) => ({ label, done })), recurring, doneAt });
export const TASKS: Task[] = [
  T("t-open-elm", "Opening checks, Elmgrove", "s01", "elm", "08:00", "High", "done", "A", { type: "site", id: "elm" }, [["Building walk-through", true], ["Heating and water temperature", true], ["Room tablets online", true], ["Sign-in of staff on duty", true]], "Daily 07:30", "07:52"),
  T("t-open-bal", "Opening checks, Ballyneety", "s18", "bal", "08:30", "High", "done", "A", { type: "site", id: "bal" }, [["Building walk-through", true], ["Outdoor area check", true], ["Room tablets online", true], ["Sign-in of staff on duty", true]], "Daily 08:00", "08:20"),
  T("t-roster-elm", "Confirm morning roster, Elmgrove", "s01", "elm", "08:15", "High", "done", "A", null, [["Absences logged (Eimear sick)", true], ["Floater cover confirmed", true]], "Daily 08:00", "08:09"),
  T("t-roster-bal", "Confirm morning roster, Ballyneety", "s18", "bal", "08:45", "High", "done", "A", null, [["Absences logged (Ciarán sick, Gemma training)", true], ["Morning rooms covered", true]], "Daily 08:00", "08:31"),
  T("t-cover", "Arrange After-school cover 14:00-18:00", "s18", "bal", "12:00", "High", "doing", "A", { type: "approval", id: "ap-cover" }, [["Check approved availability", true], ["Confirm with Michelle Coughlan", false], ["Update rota", false]]),
  T("t-safesleep", "Send Safe Sleep v4.0 reminders", "s01", "both", "Today", "High", "blocked", "B", { type: "policy", id: "pol-safesleep" }, [["Owner approves reminder", false], ["Elmgrove: remind Ella Mahony", false], ["Ballyneety: remind 3 staff", false]]),
  T("t-doyle", "Call back Sarah Doyle (toddler place)", "s01", "elm", "11:00", "High", "todo", "F", { type: "enquiry", id: "enq-doyle" }, [["Check Toddlers capacity Mon/Wed/Fri", false], ["Call and offer a visit", false], ["Log outcome", false]]),
  T("t-funding", "Review 3 NCS/ECCE mismatches", "s02", "both", "Today", "High", "todo", "C", { type: "funding", id: "fx-1" }, [["Compare Acorn export with portal", false], ["Mark each item reviewed", false], ["Note portal corrections for a human to submit", false]], "Monthly, 1st week"),
  T("t-fees", "Review 6 overdue invoices", "s02", "both", "Today", "Medium", "todo", "D", { type: "invoice", id: "inv-2611" }, [["Check each statement", false], ["Approve reminder drafts", false]]),
  T("t-ella", "Ella Mahony: obtain QQI Level 6 certificate copy", "s02", "elm", dayLabel(1), "High", "blocked", null, { type: "staff", id: "s16" }, [["Transcript received", true], ["Certificate copy uploaded", false], ["Qualification verified", false]]),
  T("t-clean-tod", "Bathroom sign-off 10:00, Toddlers", "s07", "elm", "10:00", "Medium", "todo", null, { type: "room", id: "elm-toddlers" }, [["Clean and check", false], ["Sign on tablet", false]], "Daily 10:00, 13:00, 16:00"),
  T("t-obs-tod", "Review 4 observations, Toddlers", "s07", "elm", "Today", "Medium", "todo", null, { type: "room", id: "elm-toddlers" }, [["Read draft observations", false], ["Approve or return", false]], "Weekly"),
  T("t-plan-pre", "Publish weekly learning plan, Preschool", "s10", "elm", "Fri", "Low", "doing", null, { type: "room", id: "elm-preschool" }, [["Aistear themes chosen", true], ["Activities assigned", false]], "Weekly, Friday"),
  T("t-darragh", "Confirm Darragh Murphy collected and log time", "s10", "elm", "10:15", "High", "todo", "E", { type: "child", id: "c-darragh" }, [["Guardian on the way (acknowledged 09:26)", true], ["Hand over to authorised guardian", false]]),
  T("t-drill-bal", "Fire drill log Q4, Ballyneety", "s29", "bal", "Fri", "Medium", "todo", null, { type: "site", id: "bal" }, [["Run drill in Robins", false], ["Run drill in Wrens", false], ["Log times", false]], "Termly"),
  T("t-collection-v22", "Review Collection Authorisation v2.2 draft", "s18", "both", dayLabel(3), "Medium", "todo", null, { type: "policy", id: "pol-collection" }, [["Read change summary", false], ["Approve or return to author", false]]),
  T("t-handover", "Manager handover", "s01", "both", "17:30", "Medium", "todo", "A", null, [["Elmgrove notes", false], ["Ballyneety notes", false]], "Daily 17:30"),
  T("t-vetting", "Garda vetting renewals due (2 staff)", "s02", "both", dayLabel(14), "Medium", "todo", null, { type: "staff", id: "s12" }, [["Niamh Sheehan", false], ["Fiona Hurley", false]]),
  T("t-ncs-month", "Monthly scheme reconciliation (NCS and ECCE)", "s02", "both", dayLabel(5), "Medium", "doing", "C", null, [["Acorn export", true], ["Portal cross-check", false], ["Exceptions to human review", false]], "Monthly, 1st week"),
];

/* ── Enquiries ─────────────────────────────────────────────────────────────── */
export const ENQUIRIES: Enquiry[] = [
  { id: "enq-doyle", parent: "Sarah Doyle", child: "Fionn Doyle", childAge: "2 years 1 month", programme: "Full day care, Toddlers", site: "elm", room: "elm-toddlers",
    days: ["Mon", "Wed", "Fri"], start: "4 Jan 2027", status: "new", received: "Today 07:48", owner: "s01", source: "Website enquiry form",
    note: "Moving to Tower in December. Would like to visit before Christmas." },
  { id: "enq-kenneally", parent: "Aine Kenneally", child: "Ruby Kenneally", childAge: "7 months", programme: "Full day care, Babies", site: "elm", room: "elm-babies",
    days: ["Tue", "Wed", "Thu"], start: "Mar 2027", status: "contacted", received: dayLabel(-3), owner: "s01", source: "Phone", note: "Called back Fri, sending fee schedule." },
  { id: "enq-herlihy", parent: "Declan Herlihy", child: "Fia Herlihy", childAge: "2 years 6 months", programme: "ECCE playschool", site: "bal", room: "bal-robins",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: "Sep 2027", status: "visit", received: dayLabel(-6), owner: "s18", source: "Website enquiry form", note: "Visit arranged Thursday 11:00." },
  { id: "enq-lordan", parent: "Emma Lordan", child: "Sam Lordan", childAge: "6 years", programme: "After-school", site: "bal", room: "bal-afterschool",
    days: ["Mon", "Tue", "Thu"], start: "Jan 2027", status: "offered", received: dayLabel(-12), owner: "s18", source: "Referral", note: "Offer sent, reply due Friday." },
  { id: "enq-ahern", parent: "Ruth Ahern", child: "Oscar Ahern", childAge: "1 year 3 months", programme: "Full day care, Wobblers", site: "elm", room: "elm-wobblers",
    days: ["Tue", "Thu"], start: "Feb 2027", status: "waitlist", received: dayLabel(-20), owner: "s01", source: "Website enquiry form", note: "Tue and Thu full in Wobblers. Waitlisted, offered Mon/Wed instead." },
  { id: "enq-cremin", parent: "Paddy Cremin", child: "Nell Cremin", childAge: "2 years 11 months", programme: "Preschool (ECCE + full day)", site: "elm", room: "elm-preschool",
    days: ["Mon", "Tue", "Wed", "Thu"], start: "Sep 2027", status: "enrolled", received: dayLabel(-41), owner: "s01", source: "Sibling", note: "Deposit received. Enrolment forms complete." },
  { id: "enq-kiernan", parent: "Áine Kiernan", child: "Bobby Kiernan", childAge: "3 years 1 month", programme: "ECCE playschool", site: "bal", room: "bal-wrens",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: "Jan 2027", status: "contacted", received: dayLabel(-1), owner: "s18", source: "Website enquiry form", note: "Called this morning, sending ECCE info pack." },
];

/* ── Messages ──────────────────────────────────────────────────────────────── */
export const MESSAGES: Message[] = [
  { id: "m-urgent", family: "fam-murphy", child: "c-darragh", from: "Rachel Buckley, Preschool", fromKind: "room", to: "Laura Murphy", priority: "Urgent", site: "elm",
    subject: "Please collect Darragh: temperature 38.4°C",
    body: "Darragh's temperature was 38.2°C at 09:05 and 38.4°C at 09:20. He is resting quietly with Rachel. In line with our Illness and Exclusion Policy, please collect him as soon as you can.",
    at: "09:22", ackRequired: true, ackAt: "09:26", ackBy: "Laura Murphy",
    escalation: [
      { step: "Approved by Gráinne Twomey and sent as Urgent (push + SMS) 09:22", state: "done" },
      { step: "Acknowledged by Laura Murphy 09:26: \"On my way, there by 10:00\"", state: "done" },
      { step: "No acknowledgement in 15 min: phone Laura", state: "skipped" },
      { step: "Then phone Eoin Murphy (second guardian)", state: "skipped" },
      { step: "Then centre manager calls emergency contact", state: "skipped" },
    ] },
  { id: "m-policy", family: "fam-murphy", child: null, from: "Edel Lyons, Shournagh Childcare", fromKind: "centre", to: "All families", priority: "Important", site: "elm",
    subject: "How we'll contact you from now on",
    body: "We have a new Parent Communications Policy (v1.0). Routine updates like meals and naps stay in the app. Important notices come to your phone. Urgent ones need you to tap Acknowledge. Please read it and acknowledge.",
    at: "Yesterday 16:00", ackRequired: true, ackAt: null, ackBy: null, escalation: [] },
  { id: "m-aoife-1", family: "fam-murphy", child: "c-aoife", from: "Laura Murphy", fromKind: "guardian", to: "Toddlers room", priority: "Routine", site: "elm",
    subject: "Aoife's night", body: "Aoife didn't sleep well last night, she might need her nap a bit earlier today.", at: "08:12", ackRequired: false, ackAt: "08:14", ackBy: "Méabh Ryan", escalation: [] },
  { id: "m-aoife-2", family: "fam-murphy", child: "c-aoife", from: "Méabh Ryan, Toddlers", fromKind: "room", to: "Laura Murphy", priority: "Routine", site: "elm",
    subject: "Re: Aoife's night", body: "Thanks Laura, we'll watch for tired signs and settle her early.", at: "08:15", ackRequired: false, ackAt: null, ackBy: null, escalation: [] },
  { id: "m-dempsey", family: "fam-dempsey", child: "c-ellie", from: "Louise Dempsey", fromKind: "guardian", to: "After-school", priority: "Important", site: "bal",
    subject: "Grandmother collecting Ellie today", body: "My mother, Ann Dempsey, will collect Ellie at 17:30 today.", at: "08:51", ackRequired: true, ackAt: null, ackBy: null,
    escalation: [{ step: "Ann Dempsey is not an authorised collector: manager to confirm with Louise and check photo ID", state: "standby" }] },
  { id: "m-brennan", family: "fam-brennan", child: "c-oisin", from: "Ciara Brennan", fromKind: "guardian", to: "Elmgrove office", priority: "Routine", site: "elm",
    subject: "October invoice", body: "Could you send me a breakdown of the late collection charges? Thanks.", at: "Yesterday 19:40", ackRequired: false, ackAt: null, ackBy: null, escalation: [] },
  { id: "m-cronin", family: "fam-cronin", child: "c-fiadh", from: "Karen Cronin", fromKind: "guardian", to: "Ballyneety office", priority: "Routine", site: "bal",
    subject: "Place for Fiadh's brother", body: "Is there likely to be an ECCE place for Fiadh's brother next September?", at: "Yesterday 12:05", ackRequired: false, ackAt: null, ackBy: null, escalation: [] },
  { id: "m-hayes", family: "fam-hayes", child: "c-rory", from: "Aisling Corcoran, Toddlers", fromKind: "room", to: "Gillian Hayes", priority: "Important", site: "elm",
    subject: "Rory's spare clothes", body: "Rory's spare clothes bag is running low. Could you send in two changes tomorrow?", at: "08:58", ackRequired: false, ackAt: "09:03", ackBy: "Gillian Hayes", escalation: [] },
];

/* ── Care logs (human-entered on room tablets) ─────────────────────────────── */
export const CARE_LOGS: CareLog[] = [];
let logSeq = 0;
const LOG = (child: string, kind: CareLog["kind"], at: string, title: string, detail: string, by: string, status: CareLog["status"] = "logged", parentVisible = true) =>
  CARE_LOGS.push({ id: "l" + (++logSeq), child, kind, at, title, detail, by, status, parentVisible });
LOG("c-aoife", "arrival", "08:10", "Arrived", "Dropped off by Laura. Note from home: slept poorly.", "s08");
LOG("c-aoife", "meal", "08:35", "Breakfast", "Porridge and banana. Ate most.", "s08");
LOG("c-aoife", "drink", "08:40", "Drink", "Milk, about 150ml.", "s08");
LOG("c-aoife", "nappy", "09:05", "Nappy", "Wet.", "s08");
LOG("c-aoife", "activity", "09:20", "Sand and water tray", "Filled and poured cups for a long stretch, chatting about \"big\" and \"small\". Aistear: Exploring and Thinking.", "s07");
LOG("c-darragh", "arrival", "08:10", "Arrived", "Dropped off by Laura.", "s10");
LOG("c-darragh", "meal", "08:40", "Breakfast", "Toast. Ate a little.", "s11");
LOG("c-darragh", "note", "09:05", "Temperature check", "38.2°C. Room leader informed, resting in quiet corner.", "s10");
LOG("c-darragh", "note", "09:20", "Temperature check", "38.4°C. Urgent collection notice sent with manager approval.", "s10");
LOG("c-rory", "meal", "08:45", "Breakfast", "Weetabix. Ate all.", "s07");
LOG("c-lily", "meal", "08:30", "Breakfast", "Toast and fruit. Ate most.", "s08");
// Ballyneety (sessional ECCE) entries
LOG("c-fiadh", "arrival", "08:57", "Arrived", "Dropped off by Karen.", "s20");
LOG("c-fiadh", "meal", "09:30", "Morning snack", "Apple slices and crackers. Ate all.", "s19");
LOG("c-conor", "arrival", "09:02", "Arrived", "Dropped off by Yvonne.", "s23");
LOG("c-conor", "activity", "09:20", "Outdoor play", "Built a ramp for the cars with Caoimhe. Aistear: Exploring and Thinking.", "s22");
LOG("bal-robins-1", "meal", "09:30", "Morning snack", "Toast and milk. Ate most.", "s21");
LOG("bal-robins-1", "incident", "09:28", "Minor bump (awaiting review)", "Bumped knee on the outdoor step. Cold compress applied, no further concern. Parent copy goes after manager review.", "s21", "pending-review", false);
LOG("c-conor", "observation", "09:35", "Observation (draft)", "Conor counted five ducks on the pond walk and pointed to each one.", "s23", "pending-review", false);
// draft observations awaiting room-leader review (not parent visible until approved)
LOG("c-aoife", "observation", "09:25", "Observation (draft)", "Aoife sorted cups by size without prompting and named \"big one\". Possible next step: nesting cups.", "s08", "pending-review", false);
LOG("c-rory", "observation", "09:10", "Observation (draft)", "Rory built a tower of six blocks and counted to four.", "s08", "pending-review", false);
LOG("c-lily", "observation", "Yesterday", "Observation (draft)", "Lily joined the circle song and did the actions for the first time.", "s07", "pending-review", false);
CHILDREN.filter((c) => c.room === "elm-toddlers" && c.checkedIn && !["c-aoife", "c-rory", "c-lily"].includes(c.id)).slice(0, 1).forEach((c) =>
  LOG(c.id, "observation", "Yesterday", "Observation (draft)", c.first + " helped tidy the home corner and matched cups to plates.", "s07", "pending-review", false));

/* ── Progress reports (educator reviewed before parents see them) ──────────── */
export const PROGRESS: ProgressReport[] = [
  { id: "pr-aoife-w", child: "c-aoife", period: "Weekly", label: "Week to " + dayLabel(-3), status: "approved", reviewedBy: "s07", reviewedAt: dayLabel(-3) + ", 16:10",
    aistear: ["Exploring and Thinking", "Communicating"],
    body: ["Aoife spent a lot of this week at the sand and water tray, pouring and filling.", "She is using two-word phrases more often, especially \"more water\" and \"my turn\".", "Next week: nesting cups and a pouring song at circle time."] },
  { id: "pr-aoife-m", child: "c-aoife", period: "Monthly", label: "October development summary", status: "approved", reviewedBy: "s07", reviewedAt: dayLabel(-14) + ", 15:30",
    aistear: ["Well-being", "Identity and Belonging", "Communicating", "Exploring and Thinking"],
    body: ["Aoife settled quickly after the October mid-term and greets her keyworker Méabh by name.", "She is beginning to take turns in small groups of two or three children.", "Language is growing: new words this month include \"bubbles\", \"outside\" and \"wellies\".", "This summary is drawn from 11 educator observations and reviewed by Aisling Corcoran, Room Leader. It is not a developmental assessment."] },
  { id: "pr-aoife-nov", child: "c-aoife", period: "Monthly", label: "November development summary", status: "draft", reviewedBy: null, reviewedAt: null,
    aistear: ["Exploring and Thinking"], body: ["Draft prepared from 6 approved observations. Awaiting room leader review before parents can see it."] },
  { id: "pr-darragh-w", child: "c-darragh", period: "Weekly", label: "Week to " + dayLabel(-3), status: "approved", reviewedBy: "s10", reviewedAt: dayLabel(-3) + ", 16:30",
    aistear: ["Communicating", "Identity and Belonging"],
    body: ["Darragh told the group about his trip to the beach and drew a picture of it.", "He is recognising the letters in his name."] },
];

/* ── Handovers ─────────────────────────────────────────────────────────────── */
export const HANDOVERS: Handover[] = [
  { id: "h1", room: "elm-toddlers", kind: "Shift", from: "s07", to: "s08", at: "08:05", note: "Aoife slept poorly at home, early nap. Rory's spare clothes low (asked Gillian).", read: true, outstanding: null },
  { id: "h2", room: "elm-preschool", kind: "Parent", from: "s10", to: "Laura Murphy", at: "09:22", note: "Darragh temperature 38.4°C, urgent collection notice sent.", read: true, outstanding: "Hand over to guardian on arrival" },
  { id: "h3", room: "bal-afterschool", kind: "Shift", from: "s18", to: "s26", at: "08:40", note: "Ciarán off sick. Cover for 14:00-18:00 being confirmed. Ellie Dempsey: grandmother collecting, not authorised yet.", read: false, outstanding: "Confirm cover; check collector" },
  { id: "h4", room: "bal-robins", kind: "Room to room", from: "s19", to: "s26", at: "Yesterday 12:05", note: "Two Robins children go on to After-school Tuesdays from next week.", read: true, outstanding: null },
];

/* ── Cleaning and safety checklists ────────────────────────────────────────── */
export const CLEANING: CleaningItem[] = [
  { id: "cl1", site: "elm", area: "Toddlers bathroom", task: "Clean and sign off", due: "10:00", owner: "s07", done: null, evidence: null },
  { id: "cl2", site: "elm", area: "Babies sleep room", task: "Cot linen change and spacing check", due: "09:00", owner: "s03", done: "08:52", evidence: "Tablet checklist" },
  { id: "cl3", site: "elm", area: "Kitchen", task: "Fridge temperature log (AM)", due: "08:30", owner: "s14", done: "08:16", evidence: "3.4°C recorded" },
  { id: "cl4", site: "elm", area: "Wobblers nappy area", task: "Deep clean", due: "09:30", owner: "s05", done: null, evidence: null },
  { id: "cl5", site: "elm", area: "Garden", task: "Outdoor play area safety check", due: "09:00", owner: "s01", done: "07:48", evidence: "Photo attached" },
  { id: "cl6", site: "bal", area: "Robins room", task: "Tables and surfaces sanitised", due: "08:45", owner: "s19", done: "08:40", evidence: "Tablet checklist" },
  { id: "cl7", site: "bal", area: "Wrens bathroom", task: "Clean and sign off", due: "10:00", owner: "s22", done: null, evidence: null },
  { id: "cl8", site: "bal", area: "Front gate", task: "Gate latch and fence check", due: "08:30", owner: "s29", done: "08:25", evidence: "Photo attached" },
  { id: "cl9", site: "bal", area: "First aid boxes", task: "Weekly contents check", due: "Yesterday", owner: "s29", done: null, evidence: null },
];

/* ── Leave and onboarding ──────────────────────────────────────────────────── */
export const LEAVE: LeaveRequest[] = [
  { id: "lv1", staff: "s09", dates: "Today", kind: "Annual leave", status: "approved", cover: "Covered within Toddlers roster" },
  { id: "lv2", staff: "s30", dates: "Today to " + dayLabel(2), kind: "Annual leave", status: "approved", cover: "Covered within Robins roster" },
  { id: "lv3", staff: "s06", dates: "21 to 23 Dec", kind: "Annual leave", status: "pending", cover: "Proposed: Joanne Cotter" },
  { id: "lv4", staff: "s20", dates: dayLabel(16), kind: "Training", status: "pending", cover: "Proposed: Michelle Coughlan" },
  { id: "lv5", staff: "s10", dates: "18 Dec", kind: "Annual leave", status: "pending", cover: "Proposed: Clodagh Walsh as acting room leader" },
];
export const ONBOARDING: Onboarding[] = [
  { id: "ob-ella", name: "Ella Mahony", role: "Early Years Educator, Toddlers", site: "elm", start: dayLabel(-6), staff: "s16",
    steps: [
      { label: "Invite", state: "done", note: "Accepted " + dayLabel(-14) },
      { label: "Personal details", state: "done", note: "Complete" },
      { label: "Contract", state: "done", note: "Signed " + dayLabel(-8) },
      { label: "Garda vetting confirmation", state: "done", note: "NVB disclosure received " + dayLabel(-7) + " (recorded by HR; the app does not vet)" },
      { label: "Qualifications checked", state: "blocked", note: "QQI Level 6: transcript only. Certificate copy needed." },
      { label: "Policies read and signed", state: "current", note: "11 of 12 signed. Safe Sleep v4.0 outstanding." },
      { label: "Room induction", state: "todo", note: "Toddlers, with Aisling Corcoran" },
      { label: "Ready for the floor", state: "todo", note: "" },
    ] },
  { id: "ob-zoe", name: "Zoe Barrett", role: "Early Years Educator, Wrens", site: "bal", start: "6 Jan 2027", staff: null,
    steps: [
      { label: "Invite", state: "done", note: "Accepted " + dayLabel(-4) },
      { label: "Personal details", state: "done", note: "Complete" },
      { label: "Contract", state: "current", note: "Sent " + dayLabel(-2) + ", awaiting signature" },
      { label: "Garda vetting confirmation", state: "todo", note: "Invitation to be sent by HR" },
      { label: "Qualifications checked", state: "todo", note: "" },
      { label: "Policies read and signed", state: "todo", note: "" },
      { label: "Room induction", state: "todo", note: "" },
      { label: "Ready for the floor", state: "todo", note: "" },
    ] },
];

/* ── Activity seed (oldest last) ───────────────────────────────────────────── */
let evSeq = 0;
const E = (at: string, actor: string, actorKind: DemoEvent["actorKind"], action: string, target: string, kind: DemoEvent["kind"], site: DemoEvent["site"], story: DemoEvent["story"] = null): DemoEvent =>
  ({ id: "ev" + (++evSeq), at, actor, actorKind, action, target, kind, site, story });
export const EVENTS: DemoEvent[] = [
  E("09:41", "Ops Watchdog", "agent", "kept watch on", "After-school cover (14:00-18:00), owned by Siobhán Barry", "agent", "bal", "A"),
  E("09:38", "Policy Keeper", "agent", "drafted reminder for approval", "Safe Sleep v4.0 to 4 staff", "agent", "both", "B"),
  E("09:35", "Funding Reconciler", "agent", "queued 3 items for human review", "NCS/ECCE mismatches, €432", "agent", "both", "C"),
  E("09:31", "Méabh Ryan", "person", "signed in on", "Toddlers tablet (TAB-E3) with personal PIN", "access", "elm"),
  E("09:26", "Laura Murphy", "parent", "acknowledged urgent notice", "Collect Darragh: temperature", "people", "elm", "E"),
  E("09:22", "Gráinne Twomey", "person", "approved and sent urgent notice", "Darragh Murphy, collection request", "people", "elm", "E"),
  E("09:20", "Rachel Buckley", "person", "logged temperature 38.4°C", "Darragh Murphy, Preschool", "people", "elm", "E"),
  E("09:12", "Acorn Cloud", "system", "nightly export compared", "121 bookings, 3 funding mismatches found", "data", "both", "C"),
  E("09:05", "Billing check", "system", "flagged", "6 invoices past due, €2,940", "data", "both", "D"),
  E("08:58", "Aisling Corcoran", "person", "sent Important message", "Gillian Hayes, spare clothes", "people", "elm"),
  E("08:51", "Louise Dempsey", "parent", "sent collection change", "Ellie Dempsey, After-school", "people", "bal"),
  E("08:44", "Rota Coordinator", "agent", "found approved availability", "Michelle Coughlan for After-school 14:00-18:00", "agent", "bal", "A"),
  E("08:31", "Siobhán Barry", "person", "confirmed morning roster", "Ballyneety, 10 on duty", "people", "bal", "A"),
  E("08:20", "Siobhán Barry", "person", "completed opening checks", "Ballyneety", "people", "bal", "A"),
  E("08:09", "Gráinne Twomey", "person", "confirmed morning roster", "Elmgrove, 13 on duty", "people", "elm", "A"),
  E("07:52", "Gráinne Twomey", "person", "completed opening checks", "Elmgrove", "people", "elm", "A"),
  E("07:48", "Website form", "system", "new enquiry received", "Sarah Doyle, toddler place at Elmgrove", "data", "elm", "F"),
  E("07:30", "Briefing", "agent", "prepared morning briefing", "Edel Lyons, both centres", "agent", "both"),
  E("07:05", "Eimear Lynch", "person", "reported sick", "Elmgrove floater, covered from roster", "people", "elm", "A"),
  E("06:58", "Ciarán Moynihan", "person", "reported sick", "Ballyneety After-school leader", "people", "bal", "A"),
  E("02:10", "Backup", "system", "nightly encrypted backup completed", "Demo environment (EU region, illustrative)", "data", "both"),
  E("Yesterday 17:44", "Deirdre Nagle", "person", "viewed", "Payroll export (role: HR/Finance)", "access", "both"),
  E("Yesterday 16:00", "Edel Lyons", "person", "published", "Parent Communications Policy v1.0 to all families", "people", "both", "E"),
];
