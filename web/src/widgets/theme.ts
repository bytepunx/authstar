// Story 011's fixed theming contract: a small set of CSS custom properties
// the *host* application sets, each with a sensible built-in default so a
// host that sets none of them still gets a usable, generic rendering. Every
// widget's shadow-root stylesheet starts with this block.
export const THEME_BASE_CSS = `
	:host {
		--_font-family: var(--authstar-font-family, system-ui, sans-serif);
		--_color-primary: var(--authstar-color-primary, #1d4ed8);
		--_color-text: var(--authstar-color-text, #0f172a);
		--_color-background: var(--authstar-color-background, #ffffff);
		--_border-radius: var(--authstar-border-radius, 0.375rem);
		--_spacing-unit: var(--authstar-spacing-unit, 0.5rem);

		display: block;
		font-family: var(--_font-family);
		color: var(--_color-text);
		background: var(--_color-background);
		box-sizing: border-box;
	}
	*, *::before, *::after { box-sizing: inherit; }
	a.authstar-button {
		display: inline-block;
		padding: calc(var(--_spacing-unit) * 1.5) calc(var(--_spacing-unit) * 3);
		border-radius: var(--_border-radius);
		background: var(--_color-primary);
		color: #fff;
		text-decoration: none;
		font-family: inherit;
		font-size: 0.9rem;
	}
`
