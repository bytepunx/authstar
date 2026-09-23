// Logic-less mustache-style substitution (ADR 0078) -- `mustache.js`, the
// reference implementation, chosen specifically so the injection surface
// stays "wrong text appears," not arbitrary execution (Story 001).
import Mustache from 'mustache'

// herald doesn't maintain a schema of what variables `templateData` will
// contain for a given `communicationType` (Story 003) -- a template
// referencing a variable that never arrives just renders empty, which is
// mustache's own default behavior for a missing key, so no special-casing
// is needed here.
export function render(template: string, templateData: Record<string, unknown>): string {
  return Mustache.render(template, templateData)
}

// "Does it parse" validation only (Story 003) -- no deeper schema check.
// `Mustache.parse` throws on malformed tag syntax (an unclosed `{{`, a
// mismatched section), which is the only failure mode this guards against.
export function validateTemplateSyntax(template: string): void {
  Mustache.parse(template)
}
