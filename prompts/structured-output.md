# Structured output

Return a JSON array. Each item must contain `issue`, `why_it_matters`, `evidence`, `confidence`, and `recommended_action`. Evidence items must contain `source_type`, `source_id`, `label`, and a short verbatim `excerpt` from the supplied context. Confidence must be a number from 0 to 1. Do not add keys or surrounding prose.
