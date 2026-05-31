
// ─── Cerect Unit Tests ────────────────────────────────────────────────────────
// Run with: npm test
// These test pure functions that don't need a browser or database.

// ─── Copy the functions under test ───────────────────────────────────────────
// (Jest can't import from App.jsx directly since it uses JSX and browser globals,
//  so we duplicate the pure functions here — if you change them in App.jsx,
//  update them here too)

function nextOccurrence(dueDate, recurrence) {
  if (!dueDate || recurrence === "None") return null;
  const d = new Date(dueDate);
  if (recurrence === "Weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "Fortnightly") d.setDate(d.getDate() + 14);
  else if (recurrence === "Monthly") d.setMonth(d.getMonth() + 1);
  else if (recurrence === "Quarterly") d.setMonth(d.getMonth() + 3);
  else if (recurrence === "Annually") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function excelDateToISO(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const num = Number(s);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const months = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const longMatch = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})$/i);
  if (longMatch) {
    const day = String(longMatch[1]).padStart(2, '0');
    const month = months[longMatch[2].toLowerCase()];
    const year = longMatch[3];
    if (month) return `${year}-${String(month).padStart(2, '0')}-${day}`;
  }
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return null;
}

function authH(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function generateOrgSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function cleanImportRow(row, orgId) {
  const VALID_COLS = new Set(['id', 'org_id', 'label', 'tenant', 'email', 'phone', 'payment', 'rent', 'vat_rent', 'status', 'category', 'row_name', 'box_no', 'size', 'review', 'notes', 'address', 'lock_deposit_paid', 'lock_deposit_amount', 'tenant_deposit', 'key_number', 'archived', 'deleted_at', 'deleted_data', 'sort_order', 'move_in_date', 'move_out_date']);
  const DATE_COLS = new Set(['review', 'move_in_date', 'move_out_date', 'deleted_at']);
  const clean = { ...row, org_id: orgId, deleted_at: null, deleted_data: null, archived: false };
  Object.keys(clean).forEach(k => {
    if (!VALID_COLS.has(k)) { delete clean[k]; return; }
    if (clean[k] === "") { clean[k] = null; return; }
    if (DATE_COLS.has(k) && clean[k]) clean[k] = excelDateToISO(clean[k]);
  });
  return clean;
}

// ─── nextOccurrence tests ─────────────────────────────────────────────────────
describe("nextOccurrence", () => {
  test("returns null when recurrence is None", () => {
    expect(nextOccurrence("2025-01-01", "None")).toBeNull();
  });

  test("returns null when no due date", () => {
    expect(nextOccurrence(null, "Weekly")).toBeNull();
    expect(nextOccurrence("", "Weekly")).toBeNull();
  });

  test("weekly adds 7 days", () => {
    expect(nextOccurrence("2025-01-01", "Weekly")).toBe("2025-01-08");
  });

  test("fortnightly adds 14 days", () => {
    expect(nextOccurrence("2025-01-01", "Fortnightly")).toBe("2025-01-15");
  });

  test("monthly adds one month", () => {
    expect(nextOccurrence("2025-01-15", "Monthly")).toBe("2025-02-15");
  });

  test("monthly handles year rollover", () => {
    expect(nextOccurrence("2025-12-15", "Monthly")).toBe("2026-01-15");
  });

  test("quarterly adds 3 months", () => {
    expect(nextOccurrence("2025-01-01", "Quarterly")).toBe("2025-04-01");
  });

  test("annually adds one year", () => {
    expect(nextOccurrence("2025-06-15", "Annually")).toBe("2026-06-15");
  });

  test("annually handles leap year", () => {
    expect(nextOccurrence("2024-02-29", "Annually")).toBe("2025-03-01");
  });
});

// ─── excelDateToISO tests ─────────────────────────────────────────────────────
describe("excelDateToISO", () => {
  test("returns null for null/empty input", () => {
    expect(excelDateToISO(null)).toBeNull();
    expect(excelDateToISO("")).toBeNull();
    expect(excelDateToISO(undefined)).toBeNull();
  });

  test("passes through already-valid YYYY-MM-DD", () => {
    expect(excelDateToISO("2025-06-15")).toBe("2025-06-15");
    expect(excelDateToISO("2027-12-31")).toBe("2027-12-31");
  });

  test("converts DD/MM/YYYY format", () => {
    expect(excelDateToISO("15/06/2025")).toBe("2025-06-15");
    expect(excelDateToISO("01/01/2026")).toBe("2026-01-01");
    expect(excelDateToISO("31/12/2027")).toBe("2027-12-31");
  });

  test("converts Excel serial numbers", () => {
    // 45292 = 2024-01-01
    expect(excelDateToISO("45292")).toBe("2024-01-01");
    // 45658 = 2025-01-01 (approx)
    const result = excelDateToISO("45658");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("converts long-form English dates", () => {
    expect(excelDateToISO("31st December 2027")).toBe("2027-12-31");
    expect(excelDateToISO("1st January 2026")).toBe("2026-01-01");
    expect(excelDateToISO("15th June 2025")).toBe("2025-06-15");
    expect(excelDateToISO("2nd February 2024")).toBe("2024-02-02");
    expect(excelDateToISO("3rd March 2024")).toBe("2024-03-03");
  });

  test("handles months without ordinal suffix", () => {
    expect(excelDateToISO("31 December 2027")).toBe("2027-12-31");
  });

  test("returns null for completely invalid input", () => {
    expect(excelDateToISO("not a date")).toBeNull();
    expect(excelDateToISO("abc")).toBeNull();
  });
});

// ─── authH tests ──────────────────────────────────────────────────────────────
describe("authH", () => {
  test("includes Authorization bearer token", () => {
    const headers = authH("my-test-token");
    expect(headers.Authorization).toBe("Bearer my-test-token");
  });

  test("includes Content-Type header", () => {
    const headers = authH("token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("different tokens produce different headers", () => {
    const h1 = authH("token-a");
    const h2 = authH("token-b");
    expect(h1.Authorization).not.toBe(h2.Authorization);
  });
});

// ─── generateOrgSlug tests ────────────────────────────────────────────────────
describe("generateOrgSlug", () => {
  test("converts to lowercase", () => {
    expect(generateOrgSlug("ACME Storage")).toBe("acme-storage");
  });

  test("replaces spaces with hyphens", () => {
    expect(generateOrgSlug("Best Storage Ltd")).toBe("best-storage-ltd");
  });

  test("removes special characters", () => {
    expect(generateOrgSlug("Acme & Sons Ltd.")).toBe("acme-sons-ltd");
  });

  test("collapses multiple hyphens", () => {
    expect(generateOrgSlug("A  B   C")).toBe("a-b-c");
  });

  test("strips leading and trailing hyphens", () => {
    expect(generateOrgSlug("  Spaces  ")).toBe("spaces");
  });

  test("handles numbers", () => {
    expect(generateOrgSlug("Storage 123")).toBe("storage-123");
  });
});

// ─── cleanImportRow tests ─────────────────────────────────────────────────────
describe("cleanImportRow", () => {
  const ORG_ID = "test-org-123";

  test("adds org_id to every row", () => {
    const result = cleanImportRow({ id: "A1", tenant: "John" }, ORG_ID);
    expect(result.org_id).toBe(ORG_ID);
  });

  test("sets archived to false", () => {
    const result = cleanImportRow({ id: "A1" }, ORG_ID);
    expect(result.archived).toBe(false);
  });

  test("sets deleted_at to null", () => {
    const result = cleanImportRow({ id: "A1" }, ORG_ID);
    expect(result.deleted_at).toBeNull();
  });

  test("strips unknown columns", () => {
    const result = cleanImportRow({ id: "A1", section: "Row A", unknown_field: "xyz" }, ORG_ID);
    expect(result.section).toBeUndefined();
    expect(result.unknown_field).toBeUndefined();
  });

  test("keeps valid columns", () => {
    const result = cleanImportRow({ id: "A1", tenant: "Jane", rent: 150, category: "Storage" }, ORG_ID);
    expect(result.id).toBe("A1");
    expect(result.tenant).toBe("Jane");
    expect(result.rent).toBe(150);
    expect(result.category).toBe("Storage");
  });

  test("converts empty strings to null", () => {
    const result = cleanImportRow({ id: "A1", tenant: "", email: "" }, ORG_ID);
    expect(result.tenant).toBeNull();
    expect(result.email).toBeNull();
  });

  test("converts date columns from Excel serial", () => {
    const result = cleanImportRow({ id: "A1", review: "45292" }, ORG_ID);
    expect(result.review).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("converts date columns from long-form English", () => {
    const result = cleanImportRow({ id: "A1", move_in_date: "31st December 2027" }, ORG_ID);
    expect(result.move_in_date).toBe("2027-12-31");
  });

  test("converts date columns from DD/MM/YYYY", () => {
    const result = cleanImportRow({ id: "A1", review: "15/06/2025" }, ORG_ID);
    expect(result.review).toBe("2025-06-15");
  });

  test("leaves valid YYYY-MM-DD dates unchanged", () => {
    const result = cleanImportRow({ id: "A1", review: "2025-06-15" }, ORG_ID);
    expect(result.review).toBe("2025-06-15");
  });
});
