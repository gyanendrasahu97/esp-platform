/// <reference types="vite/client" />

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'esp-web-install-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { manifest?: string },
        HTMLElement
      >
    }
  }
}
