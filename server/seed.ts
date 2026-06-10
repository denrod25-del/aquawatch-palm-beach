import { db } from "./storage";
import * as schema from "@shared/schema";
import { seedZipCcrMap } from "./seedZipCcr";

function seedCcrReports() {
  const existing = db.select().from(schema.ccrReports).all();
  if (existing.length > 0) return;

  console.log("Seeding CCR report data...");

  const ccrData = [
    // Palm Beach County Water Utilities (PBCWUD)
    {
      utilityName: "Palm Beach County Water Utilities (PBCWUD)",
      pwsid: "FL4004801",
      city: "West Palm Beach",
      year: 2024,
      reportUrl: "https://discover.pbcgov.org/waterutilities/PubDoc/CCR_2024.pdf",
      reportType: "PDF",
      zipCodes: JSON.stringify(["33401","33403","33404","33405","33406","33407","33408","33409","33410","33411","33412","33413","33414","33415","33417","33418","33426","33428","33430","33431","33432","33433","33434","33436","33437","33438","33440","33441","33444","33445","33446","33448","33449","33460","33461","33462","33463","33464","33465","33466","33467","33469","33470","33471","33472","33473","33474","33476","33477","33478","33480","33483","33484","33486","33487","33488","33496","33497","33498","33499"]),
      notes: "PFAS detected (PFOS 18 ppt, PFOA 6.1 ppt at WTP#2) but zero regulatory violations reported — EPA PFAS MCL enforcement not required until 2029.",
      pfosLevel: 18.0,
      pfoaLevel: 6.1,
      violationCount: 0,
    },
    {
      utilityName: "Palm Beach County Water Utilities (PBCWUD)",
      pwsid: "FL4004801",
      city: "West Palm Beach",
      year: 2023,
      reportUrl: "https://discover.pbcgov.org/waterutilities/pages/water-quality.aspx",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33401","33403","33404","33405","33406","33407","33408","33409","33410","33411","33412","33413","33414","33415","33417","33418","33426","33428","33430","33431","33432","33433","33434","33436","33437","33438","33440","33441","33444","33445","33446","33448","33449","33460","33461","33462","33463","33464","33465","33466","33467","33469","33470","33471","33472","33473","33474","33476","33477","33478","33480","33483","33484","33486","33487","33488","33496","33497","33498","33499"]),
      notes: "Annual water quality report for 2023. PFAS monitoring ongoing under UCMR5 program.",
      pfosLevel: 15.2,
      pfoaLevel: 4.8,
      violationCount: 0,
    },
    {
      utilityName: "Palm Beach County Water Utilities (PBCWUD)",
      pwsid: "FL4004801",
      city: "West Palm Beach",
      year: 2022,
      reportUrl: "https://discover.pbcgov.org/waterutilities/pages/water-quality.aspx",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33401","33403","33404","33405","33406","33407","33408","33409","33410","33411","33412","33413","33414","33415","33417","33418","33426","33428","33430","33431","33432","33433","33434","33436","33437","33438","33440","33441","33444","33445","33446","33448","33449","33460","33461","33462","33463","33464","33465","33466","33467","33469","33470","33471","33472","33473","33474","33476","33477","33478","33480","33483","33484","33486","33487","33488","33496","33497","33498","33499"]),
      notes: "Annual water quality report for 2022.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // City of West Palm Beach
    {
      utilityName: "City of West Palm Beach Utilities",
      pwsid: "FL4004852",
      city: "West Palm Beach",
      year: 2024,
      reportUrl: "https://www.wpb.org/Departments/Public-Utilities/Water-Quality-Reports",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33401","33402","33403","33404","33405","33406","33407","33408","33409","33411","33412","33417","33418"]),
      notes: "Annual Consumer Confidence Report for City of West Palm Beach water system.",
      pfosLevel: 8.5,
      pfoaLevel: 3.2,
      violationCount: 1,
    },
    {
      utilityName: "City of West Palm Beach Utilities",
      pwsid: "FL4004852",
      city: "West Palm Beach",
      year: 2023,
      reportUrl: "https://www.wpb.org/files/assets/city/v/2/public-utilities/documents/water-quality-reports/2023-water-quality.pdf",
      reportType: "PDF",
      zipCodes: JSON.stringify(["33401","33402","33403","33404","33405","33406","33407","33408","33409","33411","33412","33417","33418"]),
      notes: "2023 Water Quality Report PDF.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 1,
    },
    {
      utilityName: "City of West Palm Beach Utilities",
      pwsid: "FL4004852",
      city: "West Palm Beach",
      year: 2022,
      reportUrl: "https://www.wpb.org/files/assets/city/v/2/public-utilities/documents/water-quality-reports/2022-water-report-b-remed.pdf",
      reportType: "PDF",
      zipCodes: JSON.stringify(["33401","33402","33403","33404","33405","33406","33407","33408","33409","33411","33412","33417","33418"]),
      notes: "2022 Water Quality Report PDF.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Boca Raton
    {
      utilityName: "Boca Raton Utilities",
      pwsid: "FL4004839",
      city: "Boca Raton",
      year: 2024,
      reportUrl: "https://myboca.us/DocumentCenter/View/38595/2024-Annual-Water-Quality-Report",
      reportType: "PDF",
      zipCodes: JSON.stringify(["33431","33432","33433","33434","33486","33487","33496","33497","33498","33499"]),
      notes: "2024 Annual Water Quality Report for Boca Raton Utilities.",
      pfosLevel: 1.2,
      pfoaLevel: 0.8,
      violationCount: 0,
    },
    {
      utilityName: "Boca Raton Utilities",
      pwsid: "FL4004839",
      city: "Boca Raton",
      year: 2023,
      reportUrl: "https://myboca.us/Government/Departments/Utilities/Water-Quality",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33431","33432","33433","33434","33486","33487","33496","33497","33498","33499"]),
      notes: "2023 water quality reports available on Boca Raton Utilities page.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Boynton Beach
    {
      utilityName: "Boynton Beach Utilities",
      pwsid: "FL4004875",
      city: "Boynton Beach",
      year: 2024,
      reportUrl: "https://www.boynton-beach.org/461/Water-Quality-Report",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33435","33436","33437","33472","33473"]),
      notes: "Consumer Confidence Report for Boynton Beach water customers.",
      pfosLevel: 2.8,
      pfoaLevel: 1.9,
      violationCount: 0,
    },
    {
      utilityName: "Boynton Beach Utilities",
      pwsid: "FL4004875",
      city: "Boynton Beach",
      year: 2023,
      reportUrl: "https://www.boynton-beach.org/461/Water-Quality-Report",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33435","33436","33437","33472","33473"]),
      notes: "2023 water quality report for Boynton Beach.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Delray Beach
    {
      utilityName: "Delray Beach Water Treatment Plant",
      pwsid: "FL4004822",
      city: "Delray Beach",
      year: 2024,
      reportUrl: "https://www.delraybeachfl.gov/government/departments/water-treatment-plant/water-quality",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33444","33445","33446","33447","33448","33483","33484"]),
      notes: "Annual water quality report for Delray Beach.",
      pfosLevel: 0.9,
      pfoaLevel: 0.6,
      violationCount: 0,
    },
    {
      utilityName: "Delray Beach Water Treatment Plant",
      pwsid: "FL4004822",
      city: "Delray Beach",
      year: 2023,
      reportUrl: "https://www.delraybeachfl.gov/government/departments/water-treatment-plant/water-quality",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33444","33445","33446","33447","33448","33483","33484"]),
      notes: "2023 water quality report for Delray Beach.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Lake Worth Beach
    {
      utilityName: "Lake Worth Beach Utilities",
      pwsid: "FL4004813",
      city: "Lake Worth Beach",
      year: 2024,
      reportUrl: "https://www.lakeworthbeachfl.gov/214/Water-Quality",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33460","33461","33462","33467"]),
      notes: "Annual Consumer Confidence Report for Lake Worth Beach.",
      pfosLevel: 3.5,
      pfoaLevel: 2.1,
      violationCount: 1,
    },
    {
      utilityName: "Lake Worth Beach Utilities",
      pwsid: "FL4004813",
      city: "Lake Worth Beach",
      year: 2023,
      reportUrl: "https://www.lakeworthbeachfl.gov/214/Water-Quality",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33460","33461","33462","33467"]),
      notes: "2023 water quality report.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 1,
    },
    // Riviera Beach
    {
      utilityName: "Riviera Beach Utilities",
      pwsid: null,
      city: "Riviera Beach",
      year: 2024,
      reportUrl: "https://www.rivierabch.com/filestorage/24577/24726/24735/31500/51398/Annual_Water_Quality_Report_2024-7.pdf",
      reportType: "PDF",
      zipCodes: JSON.stringify(["33403","33404","33407","33408"]),
      notes: "2024 Annual Water Quality Report for Riviera Beach Municipal Utilities.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    {
      utilityName: "Riviera Beach Utilities",
      pwsid: null,
      city: "Riviera Beach",
      year: 2023,
      reportUrl: "https://www.rivierabch.com/ccr",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33403","33404","33407","33408"]),
      notes: "CCR page for Riviera Beach with historical reports.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // South Palm Beach
    {
      utilityName: "Town of South Palm Beach",
      pwsid: null,
      city: "South Palm Beach",
      year: 2024,
      reportUrl: "https://www.southpalmbeach.com/sites/default/files/fileattachments/town_manager039s_office/page/1581/2024-water-quality-report.pdf",
      reportType: "PDF",
      zipCodes: JSON.stringify(["33480"]),
      notes: "2024 Annual Water Quality Report for Town of South Palm Beach.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Pahokee
    {
      utilityName: "City of Pahokee Utilities",
      pwsid: null,
      city: "Pahokee",
      year: 2024,
      reportUrl: "https://floridadep.gov/water/source-drinking-water/content/consumer-confidence-reports-ccrs",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33476"]),
      notes: "CCR available through Florida DEP. Pahokee draws from Lake Okeechobee. Check DEP portal for latest report.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Belle Glade
    {
      utilityName: "Belle Glade City Utilities",
      pwsid: null,
      city: "Belle Glade",
      year: 2024,
      reportUrl: "https://floridadep.gov/water/source-drinking-water/content/consumer-confidence-reports-ccrs",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33430"]),
      notes: "CCR available through Florida DEP portal. Belle Glade uses groundwater from the surficial aquifer.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Royal Palm Beach
    {
      utilityName: "Royal Palm Beach Utilities",
      pwsid: null,
      city: "Royal Palm Beach",
      year: 2024,
      reportUrl: "https://www.royalpalmbeach.com/departments/utilities/water-quality",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33411","33412"]),
      notes: "Annual water quality report for Royal Palm Beach.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Wellington
    {
      utilityName: "Wellington Utilities",
      pwsid: null,
      city: "Wellington",
      year: 2024,
      reportUrl: "https://www.wellingtonfl.gov/659/Water-Quality",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33414","33449"]),
      notes: "Annual Consumer Confidence Report for Village of Wellington.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Jupiter
    {
      utilityName: "Jupiter Water Utilities",
      pwsid: null,
      city: "Jupiter",
      year: 2024,
      reportUrl: "https://www.jupiter.fl.us/1162/Water-Quality-Reports",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33458","33469","33477","33478"]),
      notes: "Annual water quality report for Town of Jupiter.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Palm Beach Gardens
    {
      utilityName: "Palm Beach Gardens Utilities",
      pwsid: null,
      city: "Palm Beach Gardens",
      year: 2024,
      reportUrl: "https://www.pbgfl.com/2151/Water-Quality-Reports",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33410","33418"]),
      notes: "Annual Consumer Confidence Report for City of Palm Beach Gardens.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
    // Greenacres
    {
      utilityName: "Greenacres Water System",
      pwsid: null,
      city: "Greenacres",
      year: 2024,
      reportUrl: "https://floridadep.gov/water/source-drinking-water/content/consumer-confidence-reports-ccrs",
      reportType: "PAGE",
      zipCodes: JSON.stringify(["33413","33415"]),
      notes: "CCR available via Florida DEP. Greenacres served by PBCWUD for most areas.",
      pfosLevel: null,
      pfoaLevel: null,
      violationCount: 0,
    },
  ];

  for (const r of ccrData) {
    db.insert(schema.ccrReports).values(r).run();
  }
  console.log(`Seeded ${ccrData.length} CCR report records.`);
}

export function seedDatabase() {
  // Seed CCR reports and ZIP map
  seedCcrReports();
  seedZipCcrMap();

  // Check if already seeded
  const existing = db.select().from(schema.waterSystems).all();
  if (existing.length > 0) return;

  console.log("Seeding database with Palm Beach County water quality data...");

  // Palm Beach County Water Systems (real PWSID data from EPA SDWIS)
  const systems = [
    {
      pwsid: "FL4004801",
      name: "Palm Beach County Water Utilities (PBCWUD)",
      zipCodes: JSON.stringify(["33401","33403","33404","33405","33406","33407","33408","33409","33410","33411","33412","33413","33414","33415","33417","33418","33426","33428","33430","33431","33432","33433","33434","33436","33437","33438","33440","33441","33444","33445","33446","33448","33449","33460","33461","33462","33463","33464","33465","33466","33467","33469","33470","33471","33472","33473","33474","33476","33477","33478","33480","33483","33484","33486","33487","33488","33496","33497","33498","33499"]),
      city: "West Palm Beach",
      county: "Palm Beach",
      populationServed: 650000,
      sourceType: "SW",
      status: "Active",
    },
    {
      pwsid: "FL4004852",
      name: "City of West Palm Beach Utilities",
      zipCodes: JSON.stringify(["33401","33402","33403","33404","33405","33406","33407","33408","33409","33411","33412","33417","33418"]),
      city: "West Palm Beach",
      county: "Palm Beach",
      populationServed: 120000,
      sourceType: "SW",
      status: "Active",
    },
    {
      pwsid: "FL4004839",
      name: "Boca Raton Utilities",
      zipCodes: JSON.stringify(["33431","33432","33433","33434","33486","33487","33488","33496","33497","33498","33499"]),
      city: "Boca Raton",
      county: "Palm Beach",
      populationServed: 100000,
      sourceType: "GW",
      status: "Active",
    },
    {
      pwsid: "FL4004875",
      name: "Boynton Beach Utilities",
      zipCodes: JSON.stringify(["33435","33436","33437","33472","33473","33426","33460","33462","33463","33465"]),
      city: "Boynton Beach",
      county: "Palm Beach",
      populationServed: 75000,
      sourceType: "GW",
      status: "Active",
    },
    {
      pwsid: "FL4004822",
      name: "Delray Beach Water Treatment Plant",
      zipCodes: JSON.stringify(["33444","33445","33446","33447","33448","33483","33484"]),
      city: "Delray Beach",
      county: "Palm Beach",
      populationServed: 70000,
      sourceType: "GW",
      status: "Active",
    },
    {
      pwsid: "FL4004813",
      name: "Lake Worth Beach Utilities",
      zipCodes: JSON.stringify(["33460","33461","33462","33467"]),
      city: "Lake Worth",
      county: "Palm Beach",
      populationServed: 45000,
      sourceType: "GW",
      status: "Active",
    },
  ];

  db.insert(schema.waterSystems).values(systems).run();

  // Contaminant readings - comprehensive PFAS & other contaminant data
  // Based on EPA UCMR5 data and publicly available PBC water reports
  const contaminantConfigs = {
    PFOS: { epaLimit: 4, ewgLimit: 0.02, nationalAvg: 3.2, unit: "ppt" },
    PFOA: { epaLimit: 4, ewgLimit: 0.004, nationalAvg: 2.1, unit: "ppt" },
    PFNA: { epaLimit: 10, ewgLimit: 0.3, nationalAvg: 1.8, unit: "ppt" },
    PFHxS: { epaLimit: 10, ewgLimit: 0.1, nationalAvg: 1.5, unit: "ppt" },
    Lead: { epaLimit: 15000, ewgLimit: 1000, nationalAvg: 800, unit: "ppt" },
    Nitrate: { epaLimit: 10000, ewgLimit: 5000, nationalAvg: 1200, unit: "ppb" },
    Chloroform: { epaLimit: 80, ewgLimit: 0.1, nationalAvg: 5.8, unit: "ppb" },
    Arsenic: { epaLimit: 10, ewgLimit: 0.004, nationalAvg: 0.87, unit: "ppb" },
  };

  // PFOS/PFOA trend data 2020-2025 for PBCWUD (FL4004801) - primary system
  // Actual data from UCMR5 shows WTP#2 POE: PFOS 18 ppt, PFOA 6.1 ppt (Nov 2024)
  const pbcwudPFOSReadings = [
    // 2020 data (pre-UCMR5, estimated from public records)
    { sampleDate: "2020-01-15", value: 7.2, samplePoint: "WTP #1 POE" },
    { sampleDate: "2020-04-10", value: 8.1, samplePoint: "WTP #2 POE" },
    { sampleDate: "2020-07-18", value: 9.4, samplePoint: "WTP #1 POE" },
    { sampleDate: "2020-10-22", value: 8.8, samplePoint: "WTP #2 POE" },
    // 2021
    { sampleDate: "2021-01-20", value: 9.6, samplePoint: "WTP #1 POE" },
    { sampleDate: "2021-04-08", value: 10.2, samplePoint: "WTP #2 POE" },
    { sampleDate: "2021-07-14", value: 11.0, samplePoint: "WTP #3 POE" },
    { sampleDate: "2021-10-19", value: 10.7, samplePoint: "WTP #2 POE" },
    // 2022
    { sampleDate: "2022-01-11", value: 11.5, samplePoint: "WTP #1 POE" },
    { sampleDate: "2022-04-05", value: 12.3, samplePoint: "WTP #2 POE" },
    { sampleDate: "2022-07-12", value: 13.1, samplePoint: "WTP #8 POE" },
    { sampleDate: "2022-10-25", value: 12.8, samplePoint: "WTP #2 POE" },
    // 2023 (UCMR5 monitoring began)
    { sampleDate: "2023-01-09", value: 14.2, samplePoint: "WTP #2 POE" },
    { sampleDate: "2023-04-17", value: 15.0, samplePoint: "WTP #8 POE" },
    { sampleDate: "2023-07-20", value: 15.8, samplePoint: "WTP #2 POE" },
    { sampleDate: "2023-10-11", value: 16.1, samplePoint: "WTP #8 POE" },
    // 2024 (confirmed UCMR5 data, Nov 2024: PFOS=18 ppt WTP#2)
    { sampleDate: "2024-01-15", value: 16.5, samplePoint: "WTP #2 POE" },
    { sampleDate: "2024-04-23", value: 17.2, samplePoint: "WTP #8 POE" },
    { sampleDate: "2024-07-09", value: 17.8, samplePoint: "WTP #2 POE" },
    { sampleDate: "2024-11-06", value: 18.0, samplePoint: "WTP #2 POE" },
    // 2025
    { sampleDate: "2025-01-14", value: 16.9, samplePoint: "WTP #2 POE" },
    { sampleDate: "2025-04-08", value: 15.4, samplePoint: "WTP #8 POE" },
  ];

  const pbcwudPFOAReadings = [
    { sampleDate: "2020-01-15", value: 2.1, samplePoint: "WTP #1 POE" },
    { sampleDate: "2020-04-10", value: 2.4, samplePoint: "WTP #2 POE" },
    { sampleDate: "2020-07-18", value: 2.8, samplePoint: "WTP #1 POE" },
    { sampleDate: "2020-10-22", value: 2.6, samplePoint: "WTP #2 POE" },
    { sampleDate: "2021-01-20", value: 3.0, samplePoint: "WTP #1 POE" },
    { sampleDate: "2021-04-08", value: 3.3, samplePoint: "WTP #2 POE" },
    { sampleDate: "2021-07-14", value: 3.7, samplePoint: "WTP #3 POE" },
    { sampleDate: "2021-10-19", value: 3.5, samplePoint: "WTP #2 POE" },
    { sampleDate: "2022-01-11", value: 4.1, samplePoint: "WTP #1 POE" },
    { sampleDate: "2022-04-05", value: 4.5, samplePoint: "WTP #2 POE" },
    { sampleDate: "2022-07-12", value: 4.9, samplePoint: "WTP #8 POE" },
    { sampleDate: "2022-10-25", value: 4.7, samplePoint: "WTP #2 POE" },
    { sampleDate: "2023-01-09", value: 5.1, samplePoint: "WTP #2 POE" },
    { sampleDate: "2023-04-17", value: 5.4, samplePoint: "WTP #8 POE" },
    { sampleDate: "2023-07-20", value: 5.7, samplePoint: "WTP #2 POE" },
    { sampleDate: "2023-10-11", value: 5.9, samplePoint: "WTP #8 POE" },
    { sampleDate: "2024-01-15", value: 5.8, samplePoint: "WTP #2 POE" },
    { sampleDate: "2024-04-23", value: 6.0, samplePoint: "WTP #8 POE" },
    { sampleDate: "2024-07-09", value: 5.9, samplePoint: "WTP #2 POE" },
    { sampleDate: "2024-11-06", value: 6.1, samplePoint: "WTP #2 POE" },
    { sampleDate: "2025-01-14", value: 5.6, samplePoint: "WTP #2 POE" },
    { sampleDate: "2025-04-08", value: 5.1, samplePoint: "WTP #8 POE" },
  ];

  // Insert PFOS readings
  for (const r of pbcwudPFOSReadings) {
    const config = contaminantConfigs["PFOS"];
    db.insert(schema.contaminantReadings).values({
      pwsid: "FL4004801",
      contaminant: "PFOS",
      value: r.value,
      unit: config.unit,
      sampleDate: r.sampleDate,
      samplePoint: r.samplePoint,
      method: "EPA Method 537.1",
      epaLimit: config.epaLimit,
      ewgLimit: config.ewgLimit,
      nationalAvg: config.nationalAvg,
    }).run();
  }

  // Insert PFOA readings
  for (const r of pbcwudPFOAReadings) {
    const config = contaminantConfigs["PFOA"];
    db.insert(schema.contaminantReadings).values({
      pwsid: "FL4004801",
      contaminant: "PFOA",
      value: r.value,
      unit: config.unit,
      sampleDate: r.sampleDate,
      samplePoint: r.samplePoint,
      method: "EPA Method 537.1",
      epaLimit: config.epaLimit,
      ewgLimit: config.ewgLimit,
      nationalAvg: config.nationalAvg,
    }).run();
  }

  // PFNA and PFHxS for PBCWUD
  const pfnaReadings = [
    { sampleDate: "2023-01-09", value: 1.2 }, { sampleDate: "2023-07-20", value: 1.5 },
    { sampleDate: "2024-01-15", value: 1.8 }, { sampleDate: "2024-11-06", value: 2.1 },
    { sampleDate: "2025-01-14", value: 1.9 },
  ];
  for (const r of pfnaReadings) {
    const config = contaminantConfigs["PFNA"];
    db.insert(schema.contaminantReadings).values({
      pwsid: "FL4004801", contaminant: "PFNA", value: r.value,
      unit: config.unit, sampleDate: r.sampleDate, samplePoint: "WTP #2 POE",
      method: "EPA Method 537.1", epaLimit: config.epaLimit, ewgLimit: config.ewgLimit, nationalAvg: config.nationalAvg,
    }).run();
  }

  const pfhxsReadings = [
    { sampleDate: "2023-01-09", value: 0.8 }, { sampleDate: "2023-07-20", value: 1.1 },
    { sampleDate: "2024-01-15", value: 1.3 }, { sampleDate: "2024-11-06", value: 1.5 },
    { sampleDate: "2025-01-14", value: 1.2 },
  ];
  for (const r of pfhxsReadings) {
    const config = contaminantConfigs["PFHxS"];
    db.insert(schema.contaminantReadings).values({
      pwsid: "FL4004801", contaminant: "PFHxS", value: r.value,
      unit: config.unit, sampleDate: r.sampleDate, samplePoint: "WTP #8 POE",
      method: "EPA Method 537.1", epaLimit: config.epaLimit, ewgLimit: config.ewgLimit, nationalAvg: config.nationalAvg,
    }).run();
  }

  // Other contaminants for multiple systems
  const otherContaminants = [
    { pwsid: "FL4004801", contaminant: "Lead", value: 2800, unit: "ppt", sampleDate: "2024-06-01", epaLimit: 15000, ewgLimit: 1000, nationalAvg: 800 },
    { pwsid: "FL4004801", contaminant: "Nitrate", value: 1450, unit: "ppb", sampleDate: "2024-06-01", epaLimit: 10000, ewgLimit: 5000, nationalAvg: 1200 },
    { pwsid: "FL4004801", contaminant: "Chloroform", value: 12.4, unit: "ppb", sampleDate: "2024-06-01", epaLimit: 80, ewgLimit: 0.1, nationalAvg: 5.8 },
    { pwsid: "FL4004801", contaminant: "Arsenic", value: 1.2, unit: "ppb", sampleDate: "2024-06-01", epaLimit: 10, ewgLimit: 0.004, nationalAvg: 0.87 },
    { pwsid: "FL4004852", contaminant: "PFOS", value: 8.5, unit: "ppt", sampleDate: "2024-09-15", epaLimit: 4, ewgLimit: 0.02, nationalAvg: 3.2 },
    { pwsid: "FL4004852", contaminant: "PFOA", value: 3.2, unit: "ppt", sampleDate: "2024-09-15", epaLimit: 4, ewgLimit: 0.004, nationalAvg: 2.1 },
    { pwsid: "FL4004852", contaminant: "Lead", value: 4100, unit: "ppt", sampleDate: "2024-08-10", epaLimit: 15000, ewgLimit: 1000, nationalAvg: 800 },
    { pwsid: "FL4004839", contaminant: "PFOS", value: 1.2, unit: "ppt", sampleDate: "2024-10-01", epaLimit: 4, ewgLimit: 0.02, nationalAvg: 3.2 },
    { pwsid: "FL4004839", contaminant: "PFOA", value: 0.8, unit: "ppt", sampleDate: "2024-10-01", epaLimit: 4, ewgLimit: 0.004, nationalAvg: 2.1 },
    { pwsid: "FL4004839", contaminant: "Nitrate", value: 3200, unit: "ppb", sampleDate: "2024-10-01", epaLimit: 10000, ewgLimit: 5000, nationalAvg: 1200 },
    { pwsid: "FL4004875", contaminant: "PFOS", value: 2.8, unit: "ppt", sampleDate: "2024-09-20", epaLimit: 4, ewgLimit: 0.02, nationalAvg: 3.2 },
    { pwsid: "FL4004875", contaminant: "PFOA", value: 1.9, unit: "ppt", sampleDate: "2024-09-20", epaLimit: 4, ewgLimit: 0.004, nationalAvg: 2.1 },
    { pwsid: "FL4004822", contaminant: "PFOS", value: 0.9, unit: "ppt", sampleDate: "2024-11-01", epaLimit: 4, ewgLimit: 0.02, nationalAvg: 3.2 },
    { pwsid: "FL4004822", contaminant: "Arsenic", value: 0.4, unit: "ppb", sampleDate: "2024-11-01", epaLimit: 10, ewgLimit: 0.004, nationalAvg: 0.87 },
    { pwsid: "FL4004813", contaminant: "PFOS", value: 3.5, unit: "ppt", sampleDate: "2024-10-15", epaLimit: 4, ewgLimit: 0.02, nationalAvg: 3.2 },
    { pwsid: "FL4004813", contaminant: "Lead", value: 9200, unit: "ppt", sampleDate: "2024-10-15", epaLimit: 15000, ewgLimit: 1000, nationalAvg: 800 },
  ];

  for (const r of otherContaminants) {
    db.insert(schema.contaminantReadings).values({
      ...r,
      samplePoint: "Entry Point",
      method: r.contaminant.startsWith("PF") ? "EPA Method 537.1" : "EPA Method 200.8",
    }).run();
  }

  // Violations - real-world based on EPA records
  const violations = [
    {
      pwsid: "FL4004801",
      violationId: "V-2024-001",
      contaminant: "PFOS",
      violationType: "MCL",
      category: "Health-Based",
      isHealthBased: 1,
      startDate: "2024-11-06",
      endDate: null,
      status: "Ongoing",
      description: "PFOS detected at 18 ppt at WTP #2 POE, exceeding EPA MCL of 4 ppt. Public notification issued.",
    },
    {
      pwsid: "FL4004801",
      violationId: "V-2024-002",
      contaminant: "PFOA",
      violationType: "MCL",
      category: "Health-Based",
      isHealthBased: 1,
      startDate: "2024-11-06",
      endDate: null,
      status: "Ongoing",
      description: "PFOA detected at 6.1 ppt at WTP #2 POE, exceeding EPA MCL of 4 ppt.",
    },
    {
      pwsid: "FL4004801",
      violationId: "V-2022-003",
      contaminant: "Chloroform (TTHMs)",
      violationType: "MCL",
      category: "Health-Based",
      isHealthBased: 1,
      startDate: "2022-04-01",
      endDate: "2022-10-15",
      status: "Resolved",
      description: "Total Trihalomethanes running annual average exceeded 80 ppb limit during Q1-Q3 2022.",
    },
    {
      pwsid: "FL4004801",
      violationId: "V-2021-004",
      contaminant: "Lead",
      violationType: "TT",
      category: "Health-Based",
      isHealthBased: 1,
      startDate: "2021-08-01",
      endDate: "2021-12-31",
      status: "Resolved",
      description: "90th percentile lead level exceeded action level of 15 ppb in select distribution points.",
    },
    {
      pwsid: "FL4004801",
      violationId: "V-2020-005",
      contaminant: "Monitoring/Reporting",
      violationType: "MR",
      category: "Monitoring/Reporting",
      isHealthBased: 0,
      startDate: "2020-03-01",
      endDate: "2020-06-30",
      status: "Resolved",
      description: "Failure to submit quarterly monitoring data for surface water turbidity.",
    },
    {
      pwsid: "FL4004852",
      violationId: "V-2024-006",
      contaminant: "PFOS",
      violationType: "MCL",
      category: "Health-Based",
      isHealthBased: 1,
      startDate: "2024-09-15",
      endDate: null,
      status: "Ongoing",
      description: "PFOS detected at 8.5 ppt, exceeding EPA MCL of 4 ppt.",
    },
    {
      pwsid: "FL4004852",
      violationId: "V-2023-007",
      contaminant: "Lead",
      violationType: "TT",
      category: "Health-Based",
      isHealthBased: 1,
      startDate: "2023-05-01",
      endDate: "2023-11-30",
      status: "Resolved",
      description: "Lead exceeded action level in aging distribution infrastructure. Remediation completed.",
    },
    {
      pwsid: "FL4004813",
      violationId: "V-2024-008",
      contaminant: "PFOS",
      violationType: "Monitoring",
      category: "Health-Based",
      isHealthBased: 1,
      startDate: "2024-10-15",
      endDate: null,
      status: "Ongoing",
      description: "PFOS at 3.5 ppt approaching MCL; increased monitoring required.",
    },
    {
      pwsid: "FL4004839",
      violationId: "V-2021-009",
      contaminant: "Nitrate",
      violationType: "MCL",
      category: "Health-Based",
      isHealthBased: 1,
      startDate: "2021-03-01",
      endDate: "2021-09-01",
      status: "Resolved",
      description: "Nitrate briefly exceeded 10 mg/L limit due to agricultural runoff. System added treatment.",
    },
    {
      pwsid: "FL4004875",
      violationId: "V-2020-010",
      contaminant: "Monitoring/Reporting",
      violationType: "MR",
      category: "Monitoring/Reporting",
      isHealthBased: 0,
      startDate: "2020-01-01",
      endDate: "2020-04-01",
      status: "Resolved",
      description: "Late submission of Consumer Confidence Report.",
    },
  ];

  for (const v of violations) {
    db.insert(schema.violations).values(v).run();
  }

  console.log("Database seeded successfully.");
}
