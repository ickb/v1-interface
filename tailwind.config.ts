import type { Config } from "tailwindcss";
import tailwindcssReactAriaComponents from "tailwindcss-react-aria-components";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,css}"],
  theme: {
    extend: {},
  },
  plugins: [tailwindcssReactAriaComponents, tailwindcssAnimate],
} satisfies Config;
