// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/fixtures/register.js
// The simulator's register: fictitious companies that read as real businesses, on company numbers
// Companies House does not issue (00000001 to 00000010, SC000001, NI000001; 00000011 is the number
// the register does not hold). Each has its officers, its persons with significant control, an
// address in a real town on a plain street, an email at test.diyaccounting.co.uk and a statement of
// capital. A company with a lastAccountsType has filed the accounts of the year before the next;
// one without has filed none. The dates are computed from the day: a 31 March year end, accounts due nine months after
// it, and a confirmation statement made up to the anniversary of incorporation, due 14 days later.
// The module uses no Node API, so the simulator, the tests and the scene scripts read one register.

import { accountsDueNineMonthsAfter } from "../../../web/public/lib/accounting-reference-period.js";

export const TEST_EMAIL_DOMAIN = "test.diyaccounting.co.uk";

// The number the register does not hold, so a lookup of it answers 404.
export const NOT_HELD_COMPANY_NUMBER = "00000011";

// The company authentication code every company of the register answers to.
export const COMPANY_AUTHENTICATION_CODE = "SIMCS01";

const email = (forename, surname) => `${forename}.${surname}`.toLowerCase().replace(/[^a-z.]/g, "") + `@${TEST_EMAIL_DOMAIN}`;

const person = (title, forename, surname, birthYear, birthMonth, nationality, residence) => ({
  title,
  forename,
  surname,
  dateOfBirth: { year: birthYear, month: birthMonth },
  nationality,
  countryOfResidence: residence,
  email: email(forename, surname),
});

/** The people the register's companies name as officers and persons with significant control. */
export const PEOPLE = {
  eleanorBramwell: person("Mrs", "Eleanor", "Bramwell", 1970, 1, "British", "England"),
  marcusTennant: person("Mr", "Marcus", "Tennant", 1975, 2, "British", "England"),
  priyaHaldane: person("Ms", "Priya", "Haldane", 1983, 6, "British", "England"),
  owenPrys: person("Mr", "Owen", "Prys", 1968, 9, "British", "Wales"),
  catrionaMacleod: person("Ms", "Catriona", "MacLeod", 1979, 4, "British", "Scotland"),
  ciaranDoherty: person("Mr", "Ciaran", "Doherty", 1981, 11, "Irish", "Northern Ireland"),
  samPatel: person("Mr", "Sam", "Patel", 1988, 4, "British", "England"),
};

const ONE_VOTE_A_SHARE = "One vote a share. Each share takes part equally in dividends and in a distribution of capital. Not redeemable.";

const ordinary = (numShares, nominalEach = 1, totalAmountUnpaid = 0) => ({
  totalAmountUnpaid: String(totalAmountUnpaid),
  totalNumberOfIssuedShares: String(numShares),
  shareCurrency: "GBP",
  totalAggregateNominalValue: String(numShares * nominalEach),
  shares: [
    {
      shareClass: "Ordinary",
      prescribedParticulars: ONE_VOTE_A_SHARE,
      numShares: String(numShares),
      aggregateNominalValue: String(numShares * nominalEach),
    },
  ],
});

const director = (who, appointedOn, verified = false) => ({ ...who, role: "director", appointedOn, verified });
const individualPsc = (who, naturesOfControl, notifiedOn, verified = false) => ({
  kind: "individual-person-with-significant-control",
  ...who,
  naturesOfControl,
  notifiedOn,
  verified,
});
const corporatePsc = (name, naturesOfControl, notifiedOn) => ({
  kind: "corporate-entity-person-with-significant-control",
  name,
  naturesOfControl,
  notifiedOn,
});

const MAJORITY = ["ownership-of-shares-50-to-75-percent", "voting-rights-50-to-75-percent"];
const MINORITY = ["ownership-of-shares-25-to-50-percent", "voting-rights-25-to-50-percent"];

// How a company's confirmation statement falls: made up to the next anniversary of incorporation
// after today ("next"), or to the latest anniversary on or before today, so a statement is due now
// ("due"), as the confirmation statement journey's company has it.
const NEXT = "next";
const DUE_NOW = "due";

const COMPANIES = [
  {
    number: "00000001",
    name: "HARBOUR LANE JOINERY LIMITED",
    status: "active",
    jurisdiction: "england-wales",
    incorporatedOn: "2009-04-16",
    address: {
      premises: "12",
      street: "Harbour Lane",
      locality: "Whitby",
      postalCode: "YO21 1DN",
      country: "England",
      countryCode: "GB-ENG",
    },
    sicCodes: ["16230", "43320"],
    lastAccountsType: "micro-entity",
    email: email("eleanor", "bramwell"),
    officers: [director(PEOPLE.eleanorBramwell, "2015-01-01", true), director(PEOPLE.marcusTennant, "2015-01-01")],
    officersActiveCount: 3,
    pscs: [
      individualPsc(PEOPLE.eleanorBramwell, MAJORITY, "2016-04-06", true),
      individualPsc(PEOPLE.marcusTennant, MINORITY, "2016-04-06"),
      corporatePsc("TEIFI VALLEY HOLDINGS LIMITED", ["ownership-of-shares-25-to-50-percent"], "2019-06-01"),
    ],
    capital: ordinary(100),
    shareholdings: [
      { shareClass: "Ordinary", numberHeld: "60", shareholders: [{ surname: "BRAMWELL", forename: "ELEANOR" }] },
      { shareClass: "Ordinary", numberHeld: "40", shareholders: [{ surname: "TENNANT", forename: "MARCUS" }] },
    ],
  },
  {
    number: "00000002",
    name: "NORTHGATE PRINTING LIMITED",
    status: "dissolved",
    jurisdiction: "england-wales",
    incorporatedOn: "1990-01-01",
    address: {
      premises: "3",
      street: "Mill Lane",
      locality: "Hebden Bridge",
      postalCode: "HX7 8BX",
      country: "England",
      countryCode: "GB-ENG",
    },
    sicCodes: ["18129"],
    lastAccountsType: "micro-entity",
    email: email("marcus", "tennant"),
    officers: [],
    pscs: [],
  },
  {
    number: "00000003",
    name: "MARSH LANE BAKERY LIMITED",
    status: "active",
    jurisdiction: "england-wales",
    incorporatedOn: "2018-03-12",
    address: { premises: "14", street: "Marsh Lane", locality: "Leeds", postalCode: "LS9 8AB", country: "England", countryCode: "GB-ENG" },
    sicCodes: ["10710"],
    lastAccountsType: "micro-entity",
    email: email("sam", "patel"),
    officers: [director(PEOPLE.samPatel, "2018-03-12")],
    pscs: [individualPsc(PEOPLE.samPatel, ["ownership-of-shares-75-to-100-percent", "voting-rights-75-to-100-percent"], "2018-03-12")],
    capital: [
      ordinary(1000),
      {
        totalAmountUnpaid: "50",
        totalNumberOfIssuedShares: "500",
        shareCurrency: "EUR",
        totalAggregateNominalValue: "250",
        shares: [
          {
            shareClass: "A Preference",
            prescribedParticulars: "No vote. A fixed dividend of 6 cents a share each year, paid before any ordinary dividend.",
            numShares: "500",
            aggregateNominalValue: "250",
          },
        ],
      },
    ],
  },
  {
    number: "00000004",
    name: "KINGFISHER DESIGN STUDIO LIMITED",
    status: "active",
    jurisdiction: "england-wales",
    incorporatedOn: "2011-09-21",
    confirmationStatement: DUE_NOW,
    address: {
      premises: "22",
      street: "Bridge Street",
      locality: "Chester",
      postalCode: "CH1 1NQ",
      country: "England",
      countryCode: "GB-ENG",
    },
    sicCodes: ["74100", "74201"],
    lastAccountsType: "micro-entity",
    email: email("eleanor", "bramwell"),
    officers: [director(PEOPLE.eleanorBramwell, "2015-01-01"), director(PEOPLE.marcusTennant, "2015-01-01")],
    pscs: [individualPsc(PEOPLE.eleanorBramwell, MAJORITY, "2016-04-06"), individualPsc(PEOPLE.marcusTennant, MINORITY, "2016-04-06")],
    capital: {
      ...ordinary(100),
      shares: [{ shareClass: "ORDINARY", prescribedParticulars: ONE_VOTE_A_SHARE, numShares: "100", aggregateNominalValue: "100" }],
    },
    shareholdings: [
      { shareClass: "ORDINARY", numberHeld: "50", shareholders: [{ surname: "BRAMWELL", forename: "ELEANOR" }] },
      { shareClass: "ORDINARY", numberHeld: "50", shareholders: [{ surname: "TENNANT", forename: "MARCUS" }] },
    ],
  },
  {
    number: "00000005",
    name: "ELM CLOSE PROPERTIES LIMITED",
    status: "active",
    jurisdiction: "england-wales",
    incorporatedOn: "2016-07-04",
    address: { premises: "7", street: "Elm Close", locality: "Taunton", postalCode: "TA1 2DQ", country: "England", countryCode: "GB-ENG" },
    sicCodes: ["99999"],
    lastAccountsType: "dormant",
    email: email("priya", "haldane"),
    officers: [director(PEOPLE.priyaHaldane, "2016-07-04")],
    pscs: [individualPsc(PEOPLE.priyaHaldane, ["ownership-of-shares-75-to-100-percent"], "2016-07-04")],
    capital: ordinary(1),
  },
  {
    number: "00000006",
    name: "TEIFI VALLEY HOLDINGS LIMITED",
    status: "active",
    jurisdiction: "wales",
    incorporatedOn: "2012-02-28",
    address: {
      premises: "Unit 2",
      street: "Teifi Valley Business Park",
      locality: "Cardigan",
      postalCode: "SA43 1JW",
      country: "Wales",
      countryCode: "GB-WLS",
    },
    sicCodes: ["70100"],
    lastAccountsType: "total-exemption-full",
    email: email("owen", "prys"),
    officers: [director(PEOPLE.owenPrys, "2012-02-28")],
    pscs: [individualPsc(PEOPLE.owenPrys, ["ownership-of-shares-75-to-100-percent"], "2016-04-06")],
    capital: ordinary(1000),
  },
  {
    number: "00000007",
    name: "PRECISION CODE LTD",
    status: "active",
    jurisdiction: "england-wales",
    incorporatedOn: "2020-01-01",
    address: {
      premises: "123",
      street: "High Street",
      locality: "Manchester",
      postalCode: "M1 1AA",
      country: "England",
      countryCode: "GB-ENG",
    },
    sicCodes: ["62020"],
    lastAccountsType: null,
    email: email("sam", "patel"),
    officers: [director(PEOPLE.samPatel, "2020-02-01")],
    pscs: [],
    capital: ordinary(100),
  },
  {
    number: "00000008",
    name: "CASTLE STREET DENTAL CARE LIMITED",
    status: "active",
    jurisdiction: "england-wales",
    incorporatedOn: "2014-05-14",
    address: {
      premises: "14",
      street: "Castle Street",
      locality: "Shrewsbury",
      postalCode: "SY1 2BQ",
      country: "England",
      countryCode: "GB-ENG",
    },
    sicCodes: ["86230"],
    lastAccountsType: "total-exemption-full",
    email: email("priya", "haldane"),
    officers: [director(PEOPLE.priyaHaldane, "2014-05-14")],
    pscs: [individualPsc(PEOPLE.priyaHaldane, MAJORITY, "2016-04-06")],
    capital: ordinary(100),
  },
  {
    number: "00000009",
    name: "OAKWAY COMPANY SECRETARIES LIMITED",
    status: "active",
    jurisdiction: "england-wales",
    incorporatedOn: "2008-10-01",
    address: {
      premises: "12",
      street: "Quay Street",
      locality: "Bristol",
      postalCode: "BS1 4DJ",
      country: "England",
      countryCode: "GB-ENG",
    },
    sicCodes: ["82990"],
    lastAccountsType: "total-exemption-full",
    email: email("priya", "haldane"),
    officers: [director(PEOPLE.priyaHaldane, "2008-10-01")],
    pscs: [],
    capital: ordinary(10),
  },
  {
    number: "00000010",
    name: "BRAMWELL TENNANT TRADING LIMITED",
    status: "active",
    jurisdiction: "england-wales",
    incorporatedOn: "2017-11-08",
    address: { premises: "5", street: "Mill Lane", locality: "Ludlow", postalCode: "SY8 1BB", country: "England", countryCode: "GB-ENG" },
    sicCodes: ["47190"],
    lastAccountsType: null,
    email: email("marcus", "tennant"),
    officers: [director(PEOPLE.eleanorBramwell, "2017-11-08"), director(PEOPLE.marcusTennant, "2017-11-08")],
    pscs: [individualPsc(PEOPLE.eleanorBramwell, MINORITY, "2017-11-08"), individualPsc(PEOPLE.marcusTennant, MINORITY, "2017-11-08")],
    capital: ordinary(2),
  },
  {
    number: "SC000001",
    name: "GLENMORE ENGINEERING LIMITED",
    status: "active",
    jurisdiction: "scotland",
    incorporatedOn: "2015-06-01",
    address: {
      premises: "3",
      street: "Glenmore Road",
      locality: "Perth",
      postalCode: "PH1 5RU",
      country: "Scotland",
      countryCode: "GB-SCT",
    },
    sicCodes: ["28290"],
    lastAccountsType: "total-exemption-full",
    email: email("catriona", "macleod"),
    officers: [director(PEOPLE.catrionaMacleod, "2015-06-01")],
    pscs: [individualPsc(PEOPLE.catrionaMacleod, ["ownership-of-shares-75-to-100-percent"], "2016-04-06")],
    capital: ordinary(1),
  },
  {
    number: "NI000001",
    name: "LOUGH ERNE FOODS LIMITED",
    status: "active",
    jurisdiction: "northern-ireland",
    incorporatedOn: "2013-03-18",
    address: {
      premises: "7",
      street: "Shore Road",
      locality: "Enniskillen",
      postalCode: "BT74 7EF",
      country: "Northern Ireland",
      countryCode: "GB-NIR",
    },
    sicCodes: ["10890"],
    lastAccountsType: "micro-entity",
    email: email("ciaran", "doherty"),
    officers: [director(PEOPLE.ciaranDoherty, "2013-03-18")],
    pscs: [individualPsc(PEOPLE.ciaranDoherty, ["ownership-of-shares-75-to-100-percent"], "2016-04-06")],
    capital: ordinary(100),
  },
];

const isoDate = (date) => date.toISOString().slice(0, 10);
const utc = (year, monthIndex, day) => new Date(Date.UTC(year, monthIndex, day));

/** The ISO date some days after another. */
export function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return isoDate(utc(year, month - 1, day + days));
}

/** The ISO date some months after another, on the same day or the month's last. */
export function addMonths(iso, months) {
  const [year, month, day] = iso.split("-").map(Number);
  const target = utc(year, month - 1 + months, 1);
  const last = utc(target.getUTCFullYear(), target.getUTCMonth() + 1, 0).getUTCDate();
  return isoDate(utc(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)));
}

/**
 * The register's accounting dates on a day: the period whose accounts fall due next (the latest
 * 31 March at least three months past, and the year to it), the year before it, whose accounts
 * are on the register, and the year before that.
 * @param {Date} [today]
 */
export function registerDates(today = new Date()) {
  const day = isoDate(today);
  let endYear = today.getUTCFullYear();
  while (addMonths(`${endYear}-03-31`, 3) > day) endYear -= 1;
  const period = (end) => ({ start: addDays(addMonths(end, -12), 1), end });
  const next = period(`${endYear}-03-31`);
  const filed = period(`${endYear - 1}-03-31`);
  const earlier = period(`${endYear - 2}-03-31`);
  return {
    today: day,
    next: { ...next, due: accountsDueNineMonthsAfter(next.end) },
    filed: { ...filed, due: accountsDueNineMonthsAfter(filed.end), filedOn: addMonths(filed.end, 7), approvedOn: addMonths(filed.end, 6) },
    earlier: { ...earlier, filedOn: addMonths(earlier.end, 8) },
  };
}

/**
 * A company's confirmation statement dates on a day, from its date of incorporation.
 * @param {string} incorporatedOn
 * @param {"next"|"due"} kind
 * @param {Date} [today]
 */
export function confirmationStatementDates(incorporatedOn, kind = NEXT, today = new Date()) {
  const day = isoDate(today);
  const [, month, date] = incorporatedOn.split("-");
  let year = today.getUTCFullYear();
  if (kind === DUE_NOW) {
    if (`${year}-${month}-${date}` > day) year -= 1;
  } else if (`${year}-${month}-${date}` <= day) {
    year += 1;
  }
  const madeUpTo = `${year}-${month}-${date}`;
  return { madeUpTo, due: addDays(madeUpTo, 14), lastMadeUpTo: `${year - 1}-${month}-${date}` };
}

/** The address as one line, as the register's search writes it. */
export function addressLine1(address) {
  return `${address.premises} ${address.street}`;
}

/**
 * Every company of the register with its dates on a day.
 * @param {Date} [today]
 */
export function registerCompanies(today = new Date()) {
  const dates = registerDates(today);
  return COMPANIES.map((company) => ({
    ...structuredClone(company),
    accounts: {
      accountingReferenceDate: { day: "31", month: "03" },
      next: dates.next,
      last: company.lastAccountsType ? { start: dates.filed.start, end: dates.filed.end, type: company.lastAccountsType } : null,
    },
    confirmationStatementDates: confirmationStatementDates(company.incorporatedOn, company.confirmationStatement ?? NEXT, today),
  }));
}

/**
 * One company of the register with its dates on a day, or undefined.
 * @param {string} companyNumber
 * @param {Date} [today]
 */
export function registerCompany(companyNumber, today = new Date()) {
  return registerCompanies(today).find((company) => company.number === companyNumber);
}

/** Every company number the register holds. */
export const REGISTER_COMPANY_NUMBERS = COMPANIES.map((company) => company.number);
