# USDA MARS MCP Skill Authoring Guide

This guide explains how to build report-specific Codex or ChatGPT skills on top of the generic USDA AMS MARS MCP tools in this repository. A skill should capture report-specific knowledge, while the MCP server stays generic and reusable.

## Recommended workflow

Use the tools in this order when researching a new report or writing a skill:

1. **Discover candidate reports** with `mars_list_reports`.
2. **Inspect the report page** with `mars_get_report_info` to learn the report purpose, API examples, and any human-readable notes.
3. **Inspect available fields** with `mars_get_report_columns` before writing `q` or `sort` filters.
4. **Fetch rows** with `mars_get_report_data`, usually with `lastReports`, `q`, and `sort` once the report-specific fields are known.
5. **Check metadata and corrections** with `mars_get_report_details` when freshness, changed reports, or corrections matter.
6. **Use normalized rows when available** for stable tabular processing. If normalization is unsupported or not implemented for the returned shape, fall back to the raw payload and preserve it in the skill response.

## MCP call examples

### 1. Find candidate report slugs

```json
{
  "tool": "mars_list_reports",
  "arguments": {}
}
```

Look for a report entry whose name, commodity, office, or market type matches the skill goal. Save the chosen slug in the skill instructions when it is stable.

### 2. Read report information

```json
{
  "tool": "mars_get_report_info",
  "arguments": {
    "slug": "REPORT_SLUG"
  }
}
```

Use this result to document the report's purpose, caveats, and source page. If the result includes API URLs, compare them with the generic calls your skill plans to make.

### 3. Inspect fields before filtering

```json
{
  "tool": "mars_get_report_columns",
  "arguments": {
    "slug": "REPORT_SLUG"
  }
}
```

Record known field names and example values in the skill. Do not guess `q` fields; MARS query syntax is report-specific and can vary by report.

### 4. Fetch report data

```json
{
  "tool": "mars_get_report_data",
  "arguments": {
    "slug": "REPORT_SLUG",
    "lastReports": 3,
    "sort": "-report_date"
  }
}
```

Add `q` only after confirming field names and valid values. Keep `lastReports` or other limiting arguments as small as the use case allows.

### 5. Check corrections or recent changes

```json
{
  "tool": "mars_get_report_details",
  "arguments": {
    "slug": "REPORT_SLUG",
    "correctionsOnly": true,
    "lastDays": 30
  }
}
```

Use this when the skill answers questions where changed reports or corrections can alter the conclusion.

## Designing a report-specific skill

A useful report skill should include:

- **Pinned slug**: the exact MARS report slug used by default.
- **Purpose**: what user questions the skill should answer and what it should refuse as out of scope.
- **Required user inputs**: date range, commodity, location, grade/class, market, or sale type, as applicable.
- **Known filters**: field names and example `q` fragments confirmed with `mars_get_report_columns` and live data.
- **Sort and limits**: default `sort`, `lastReports`, or `lastDays` values that keep calls fast and focused.
- **Freshness policy**: whether to call `mars_get_report_details` for corrections or recent changes before finalizing an answer.
- **Output policy**: how to cite the USDA report, summarize missing data, and preserve raw values without unit or price coercion.

## Handling missing rows and errors

When the MCP tool returns no rows or an error envelope:

- Tell the user which slug and filters were used.
- Explain that no matching MARS rows were returned, rather than inventing values.
- Suggest a narrower or broader filter only if the skill knows the relevant fields.
- For USDA or network errors, summarize the `error_code`, `message`, and `http_status` if present.
- Do not expose API keys, bearer tokens, or other secrets in logs, examples, or user-facing output.

## Example report-specific skill template

The following template shows the shape of a skill for a single report. Replace the placeholder slug and filters only after verifying them through the workflow above.

```markdown
# Example MARS Report Skill

Use the USDA MARS MCP server to answer questions about [REPORT PURPOSE].

## Default report

- Slug: `REPORT_SLUG`
- Source: USDA AMS MARS / MyMarketNews

## Inputs to collect

Ask for these only when not provided by the user:

- Commodity or product: [known field name or accepted values]
- Location or market: [known field name or accepted values]
- Date or report count: default to the latest 1-3 reports unless the user asks for history

## Tool workflow

1. Call `mars_get_report_columns` for `REPORT_SLUG` if field names are not already cached in the skill context.
2. Build a conservative `q` string using only confirmed fields and values.
3. Call `mars_get_report_data` with `lastReports`, `q`, and `sort`.
4. If the user asks about corrections, call `mars_get_report_details` with `correctionsOnly` or `lastDays`.
5. If normalized rows are returned, use them for tables. Otherwise, summarize from raw data without coercing values.

## Response rules

- State the slug and filters used.
- Preserve USDA units, dates, prices, and market terminology exactly as returned.
- If rows are missing, say no matching rows were returned and ask for a different date, commodity, or location.
- If the API errors, report the tool error and avoid speculation.
```

## Maintenance checklist

Before publishing or updating a report skill:

- Re-run `mars_get_report_info` and `mars_get_report_columns` for the pinned slug.
- Verify at least one representative `mars_get_report_data` call returns the expected shape.
- Confirm examples use non-secret placeholders for credentials.
- Update the skill if MARS field names, report slugs, or response shapes change.
