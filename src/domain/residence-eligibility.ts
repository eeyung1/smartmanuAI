export type ResidenceBloc =
  "ASEAN" | "EU" | "AFRICAN_UNION" | "BELT_AND_ROAD" | "GLOBAL";

export type ResidenceApplicantProfile = {
  residenceCountry?: string | null;
  nationality?: string | null;
};

export type ResidenceOpportunityRules = {
  /** Countries, blocs or "ALL" that may apply. */
  residenceCountries?: readonly (string | ResidenceBloc)[] | null;
  /** Countries, blocs or "ALL" that may not apply. */
  excludedResidenceCountries?: readonly (string | ResidenceBloc)[] | null;
  /** Country the applicant must currently reside in, for example "CN". */
  hostCountry?: string | null;
  /** The applicant must apply from outside the host country. */
  requireAbroadApplication?: boolean | null;
};

export type ResidenceEvaluationOptions = {
  locale?: "en" | "zh-Hans";
  /** Extra country codes the operator has approved, as "AA" or "AAA". */
  additionalCountries?: readonly string[];
};

export type ResidenceStatus =
  "eligible" | "ineligible" | "review_required" | "no_requirement";

export type ResidenceEvaluation = {
  eligible: boolean;
  status: ResidenceStatus;
  residenceCountry: string | null;
  matchedRule: string | null;
  reason: string;
  explanationKey: string;
  explanation: string;
  notes: string[];
};

const blocMembers: Record<ResidenceBloc, string> = {
  ASEAN:
    "BN BR KH ID LA MY MM PH SG TH VN BRN BRB KHM IDN LAO MYS MMR PHL SGP THA VNM",
  EU: "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE",
  AFRICAN_UNION:
    "DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD SZ TZ TG TN UG ZM ZW DZA AGO BEN BWA BFA BDI CMR CPV TCD COM COG COD CIV DJI EGY GNQ ERI ETH GAB GMB GHA GIN GNB KEN LSO LBR LBY MDG MWI MLI MRT MUS MYT MAR MOZ NAM NER NGA REU RWA SHN STP SEN SYC SLE SOM ZAF SSD SDN SWZ TZA TGO TUN UGA ZMB ZWE",
  BELT_AND_ROAD:
    "CN ID MY TH VN PH IN PK BD LK NP KZ UZ KG TJ TM MN RU BY IR IQ SY LB SA AE OM QA KW YE ET TZ UG ZM ZW MZ SS DJ RW CM CG CD ML MR NE TD BF GN SN MA TN DZ GH CN IND IDN MYS THA VNM PHL LAO KHM MMR PAK BGD LKA NPL RUS BLR IRN IRQ SYR LBN SAU ARE OMN QAT KWT YEM ETH TZA UGA ZMB ZWE MOZ SSD DJI RWA CMR COG COD MLI MRT NER TCD BFA GIN SEN MAR TUN DZA GHA UZB KAZ KGZ TJK TKM MNG",
  GLOBAL: "",
};

/** ISO 3166-1 alpha-3 to alpha-2 mappings for the countries a profile may use. */
const alpha3ToAlpha2 = new Map<string, string>();
const alpha2ToAlpha3 = new Map<string, string>();
{
  const pairs =
    "AF:AFG AX:ALA AL:ALB DZ:DZA AS:ASM AD:AND AO:AGO AI:AIA AQ:ATA AG:ATG AR:ARG AM:ARM AW:ABW AU:AUS AT:AUT AZ:AZE BS:BHS BH:BHR BD:BGD BB:BRB BY:BLR BE:BEL BZ:BLZ BJ:BEN BM:BMU BT:BTN BO:BOL BQ:BES BA:BIH BW:BWA BR:BRA IO:IOT BN:BRN BG:BGR BF:BFA BI:BDI CV:CPV KH:KHM CM:CMR CA:CAN KY:CYM CF:CAF TD:TCD CL:CHL CN:CHN CX:CXR CC:CCK CO:COL KM:COM CG:COG CD:COD CK:COK CR:CRI CI:CIV HR:HRV CU:CUB CW:CUW CY:CYP CZ:CZE DK:DNK DJ:DJI DM:DMA DO:DOM EC:ECU EG:EGY SV:SLV GQ:GNQ ER:ERI EE:EST ET:ETH FK:FLK FO:FRO FJ:FJI FI:FIN FR:FRA GF:GUF PF:PYF TF:ATF GA:GAB GM:GMB GE:GEO DE:DEU GH:GHA GI:GIB GR:GRC GL:GRL GD:GRD GP:GLP GU:GUM GT:GTM GG:GGY GN:GIN GW:GNB GY:GUY HT:HTI HM:HMD VA:VAO HN:HND HK:HKG HU:HUN IS:ISL IN:IND ID:IDN IR:IRN IQ:IRQ IE:IRL IM:IMN IL:ISR IT:ITA JM:JAM JP:JPN JE:JEY JO:JOR KZ:KAZ KE:KEN KI:KIR KP:PRK KR:KOR KW:KWT KG:KGZ LA:LAO LV:LVA LB:LBN LS:LSO LR:LBR LY:LBY LI:LIE LT:LTU LU:LUX MO:MAC MG:MDG MW:MWI MY:MYS MV:MDV ML:MLI MT:MLT MH:MHL MQ:MTQ MR:MRT MU:MUS YT:MYT MX:MEX FM:FSM MD:MDA MC:MCO MN:MNG ME:MNE MS:MSR MA:MAR MZ:MOZ MM:MMR NA:NAM NR:NRU NP:NPL NL:NLD NC:NCL NZ:NZL NI:NIC NE:NER NG:NGA NU:NIU NF:NFK MK:MKD MP:MNP NO:NOR OM:OMN PK:PAK PW:PLW PS:PSE PA:PAN PG:PNG PY:PRY PE:PER PH:PHL PN:PCN PL:POL PT:PRT PR:PRI QA:QAT RE:REU RO:ROU RU:RUS RW:RWA BL:BLM SH:SHN KN:KNA LC:LCA MF:MFM PM:SPM VC:VCT WS:WSM SM:SMR ST:STP SA:SAU SN:SEN RS:SRB SC:SYC SL:SLE SG:SGP SX:SXM SK:SVK SI:SVN SB:SLB SO:SOM ZA:ZAF GS:SGS SS:SSD ES:ESP LK:LKA SD:SDN SR:SUR SJ:SJM SE:SWE CH:CHE SY:SYR TW:TWN TJ:TJK TZ:TZA TH:THA TL:TLS TG:TGO TK:TKL TO:TON TT:TTO TN:TUN TR:TUR TM:TKM TC:TCA TV:TUV UG:UGA UA:UKR AE:ARE GB:GBR US:USA UM:UMI UY:URY UZ:UZB VU:VUT VE:VEN VN:VNM VG:VGB VI:VIR WF:WLF EH:ESH YE:YEM ZM:ZMB ZW:ZWE";
  for (const pair of pairs.split(/\s+/)) {
    const [alpha2, alpha3] = pair.split(":");
    if (!alpha2 || !alpha3) continue;
    alpha3ToAlpha2.set(alpha3, alpha2);
    alpha2ToAlpha3.set(alpha2, alpha3);
  }
}

const blocNames = new Set<string>([
  "ASEAN",
  "EU",
  "AFRICAN_UNION",
  "BELT_AND_ROAD",
  "GLOBAL",
]);

const blocMembership = new Map<string, Set<string>>();
for (const [bloc, members] of Object.entries(blocMembers))
  blocMembership.set(bloc, new Set(members.split(/\s+/).filter(Boolean)));

const messages: Record<string, { en: string; zh: string }> = {
  "residence.eligible": {
    en: "Your country of residence satisfies this opportunity.",
    zh: "您当前的居住国家符合该机会的要求。",
  },
  "residence.no_requirement": {
    en: "This opportunity states no country-of-residence restriction.",
    zh: "该机会未说明居住国家限制。",
  },
  "residence.not_allowed": {
    en: "This opportunity is not open to applicants residing in your country.",
    zh: "该机会不向居住在您当前国家的申请者开放。",
  },
  "residence.excluded": {
    en: "This opportunity excludes applicants residing in your country.",
    zh: "该机会明确排除居住在您当前国家的申请者。",
  },
  "residence.must_reside_in_host_country": {
    en: "This opportunity requires applicants to currently reside in the host country.",
    zh: "该机会要求申请者当前居住在主办国家。",
  },
  "residence.must_apply_from_abroad": {
    en: "This opportunity requires applicants to apply from outside the host country.",
    zh: "该机会要求申请者从主办国家以外提出申请。",
  },
  "residence.review_required": {
    en: "Your country of residence could not be read, so this needs review.",
    zh: "无法读取您的居住国家，因此需要人工核实。",
  },
  "residence.missing": {
    en: "Add your country of residence to check this restriction.",
    zh: "请补充居住国家以核实该限制。",
  },
  "residence.nationality_evaluated_separately": {
    en: "Nationality requirements are checked separately from country of residence.",
    zh: "国籍要求与居住国家分别核实。",
  },
};

/** Normalizes an ISO-3166-1 alpha-2 or alpha-3 country code. */
export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (!code) return null;
  if (/^[A-Z]{2}$/.test(code)) return code === "XX" ? null : code;
  if (/^[A-Z]{3}$/.test(code)) return alpha3ToAlpha2.get(code) ?? null;
  return null;
}

function isBloc(value: string) {
  return blocNames.has(value.toUpperCase());
}

function blocFor(code: string) {
  for (const [bloc, members] of blocMembership)
    if (members.has(code)) return bloc;
  return null;
}

function ruleTokens(values: readonly string[] | null | undefined) {
  return (values ?? []).map((value) => String(value).trim().toUpperCase());
}

/**
 * Evaluates an applicant's physical country of residence against an
 * opportunity's geographic rules. Nationality is never used for this decision.
 */
export function evaluateResidenceEligibility(
  applicantProfile: ResidenceApplicantProfile | null | undefined,
  opportunityRules: ResidenceOpportunityRules | null | undefined,
  options: ResidenceEvaluationOptions = {},
): ResidenceEvaluation {
  const locale = options.locale === "zh-Hans" ? "zh-Hans" : "en";
  const notes: string[] = [];
  const finish = (
    status: ResidenceStatus,
    eligible: boolean,
    code: string,
    matchedRule: string | null,
    extraNotes: string[] = [],
  ): ResidenceEvaluation => {
    const entry = messages[code];
    return {
      eligible,
      status,
      residenceCountry: residenceCountry,
      matchedRule,
      reason: code,
      explanationKey: `residence.${code.replace(/^residence\./, "")}`,
      explanation: entry ? (locale === "zh-Hans" ? entry.zh : entry.en) : code,
      notes: [...notes, ...extraNotes],
    };
  };

  const applicantResidence = applicantProfile?.residenceCountry ?? null;
  const residenceCountry = normalizeCountryCode(applicantResidence);
  if (applicantProfile?.nationality)
    notes.push("residence.nationality_evaluated_separately");

  const allowed = ruleTokens(opportunityRules?.residenceCountries);
  const excluded = ruleTokens(opportunityRules?.excludedResidenceCountries);
  const hostCountry = normalizeCountryCode(opportunityRules?.hostCountry);
  const requireAbroad = opportunityRules?.requireAbroadApplication === true;
  const hasRules =
    allowed.length > 0 ||
    excluded.length > 0 ||
    hostCountry !== null ||
    requireAbroad;

  if (!hasRules)
    return finish("no_requirement", true, "residence.no_requirement", null);
  if (!applicantResidence)
    return finish("review_required", false, "residence.missing", null);
  if (!residenceCountry)
    return finish("review_required", false, "residence.review_required", null);

  const matches = (tokens: string[]) => {
    for (const token of tokens) {
      if (token === "ALL" || token === "GLOBAL") return token;
      if (isBloc(token)) {
        if (blocMembership.get(token.toUpperCase())?.has(residenceCountry!))
          return token.toUpperCase();
        if (
          blocMembership
            .get(token.toUpperCase())
            ?.has(alpha3Of(residenceCountry!))
        )
          return token.toUpperCase();
        continue;
      }
      const normalized = normalizeCountryCode(token);
      if (normalized && normalized === residenceCountry) return token;
    }
    return null;
  };

  const excludedMatch = matches(excluded);
  if (excludedMatch)
    return finish("ineligible", false, "residence.excluded", excludedMatch);

  if (hostCountry && requireAbroad) {
    if (residenceCountry === hostCountry)
      return finish(
        "ineligible",
        false,
        "residence.must_apply_from_abroad",
        hostCountry,
      );
  } else if (hostCountry) {
    if (residenceCountry !== hostCountry)
      return finish(
        "ineligible",
        false,
        "residence.must_reside_in_host_country",
        hostCountry,
      );
  }

  if (allowed.length) {
    const allowedMatch = matches(allowed);
    if (!allowedMatch)
      return finish("ineligible", false, "residence.not_allowed", null);
    return finish("eligible", true, "residence.eligible", allowedMatch);
  }
  return finish("eligible", true, "residence.eligible", null);
}

function alpha3Of(alpha2: string) {
  return alpha2ToAlpha3.get(alpha2) ?? "";
}
