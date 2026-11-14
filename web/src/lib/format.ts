// Formatting only. These functions change how a number is written, never which number it is.

export function fmtNumber(v: number, digits?: number): string {
  const d = digits ?? (Number.isInteger(v) ? 0 : Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
  return v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export const FUEL_LABEL: Record<string, string> = {
  gas: "Gas flame",
  droplet: "Droplet",
  solid: "Solid material",
  emulator: "Solid emulator (BRE)",
  none: "Not a fuel",
};

export const SOURCE_LABEL: Record<string, string> = {
  psi_table: "PSI experiment table",
  psi_page: "PSI investigation page",
  published_paper: "Published paper",
  reference_document: "Challenge statement",
  derived: "Derived calculation",
};

export const FIELD_LABEL: Record<string, string> = {
  o2_pct: "O2",
  pressure_kpa: "Pressure (kPa)",
  pressure_psi: "Pressure (psi)",
  co2_pct: "CO2",
  he_pct: "He",
  n2_pct: "N2",
  flow_cm_s: "Flow",
  fuel_conc_pct: "Fuel concentration",
  n_flames: "Flames",
  test_label: "Test",
  test_date: "Date",
  fuel: "Fuel",
  material: "Material",
  diluent: "Diluent",
  outcome_label: "Outcome (verbatim)",
  suppressant: "Suppressant",
  gravity_level: "Gravity",
  o2_basis: "O2 basis",
  notes: "Notes",
};

export function doiUrl(doi?: string | null): string | undefined {
  return doi ? `https://doi.org/${doi}` : undefined;
}

export function ntrsUrl(id?: string | null): string | undefined {
  return id ? `https://ntrs.nasa.gov/citations/${id}` : undefined;
}
