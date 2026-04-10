import type { ComponentChildren } from "preact";

type AnyProps = { [key: string]: unknown };
type WithChildren = { children?: ComponentChildren };

declare module "preact" {
  namespace createElement.JSX {
    interface IntrinsicElements {
      "s-section": AnyProps & WithChildren & { heading?: string };
      "s-banner": AnyProps & WithChildren & { tone?: string; heading?: string; dismissible?: boolean };
      "s-form": AnyProps & WithChildren;
      "s-stack": AnyProps & WithChildren & { direction?: string; gap?: string };
      "s-select": AnyProps & WithChildren & { label?: string; name?: string; value?: string; onChange?: (e: Event) => void };
      "s-option": AnyProps & WithChildren & { value?: string };
      "s-text-field": AnyProps & {
        label?: string;
        name?: string;
        value?: string;
        disabled?: boolean;
        placeholder?: string;
        onInput?: (e: Event) => void;
      };
      "s-date-field": AnyProps & { label?: string; name?: string; value?: string; onChange?: (e: Event) => void };
      "s-button": AnyProps & WithChildren & { variant?: string; type?: string; loading?: boolean; onClick?: () => void };
      "s-text": AnyProps & WithChildren & { tone?: string };
      "s-spinner": AnyProps & { "accessibility-label"?: string };
      "s-heading": AnyProps & WithChildren;
      "s-box": AnyProps & WithChildren & { "padding-block-end"?: string; padding?: string };
    }
  }
}
