import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";

const MODEL = "mistral-large-latest";

function getMistralClient(): Mistral {
  const apiKey = process.env["MISTRAL_API_KEY"];
  if (!apiKey) throw new Error("MISTRAL_API_KEY not set");
  return new Mistral({ apiKey });
}

async function askMistral(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getMistralClient();
  const response = await client.chat.complete({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 8192,
  });
  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from Mistral");
  return typeof content === "string" ? content : JSON.stringify(content);
}

const DESIGN_SYSTEM = `You are an expert UI/UX designer and frontend developer.
You understand design systems, visual hierarchy, accessibility, and modern web/mobile design.
When suggesting designs or generating design tokens, be specific and practical.
Provide real CSS values, Tailwind classes, and hex colors — not placeholders.`;

export function registerDesignTools(server: McpServer) {
  server.registerTool(
    "suggest_design",
    {
      description:
        "Get AI-powered design suggestions for a UI component, page, or app based on a description",
      inputSchema: {
        description: z
          .string()
          .describe("Describe what you want to design (component, page, app)"),
        style: z
          .string()
          .optional()
          .describe("Design style preference (e.g. minimal, bold, glassmorphism, neumorphism)"),
        platform: z
          .enum(["web", "mobile", "both"])
          .optional()
          .default("web"),
        framework: z
          .string()
          .optional()
          .describe("Target framework (e.g. React + Tailwind, React Native + NativeWind)"),
      },
    },
    async ({ description, style, platform, framework }) => {
      const prompt = `
Design request: ${description}
${style ? `Style preference: ${style}` : ""}
Platform: ${platform ?? "web"}
${framework ? `Framework: ${framework}` : ""}

Provide:
1. **Design concept** — overall visual direction, mood, personality
2. **Color palette** — primary, secondary, accent, background, text (with hex values)
3. **Typography** — font recommendations and size scale
4. **Component breakdown** — key UI components needed
5. **Layout suggestions** — structure and spacing
6. **Code example** — a sample implementation in the target framework
7. **UX considerations** — interaction patterns, accessibility notes
`;
      const result = await askMistral(DESIGN_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "extract_design_tokens",
    {
      description:
        "Generate a complete design token system (colors, typography, spacing, shadows) for a product",
      inputSchema: {
        product_description: z
          .string()
          .describe("Describe the product, brand, and target audience"),
        format: z
          .enum(["css-variables", "tailwind", "json", "scss"])
          .optional()
          .default("css-variables"),
        dark_mode: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include dark mode tokens"),
      },
    },
    async ({ product_description, format, dark_mode }) => {
      const prompt = `
Generate a complete design token system for: ${product_description}

Format: ${format ?? "css-variables"}
Include dark mode: ${dark_mode ?? true}

Provide tokens for:
- Colors (brand, semantic: success/warning/error/info, neutrals)
- Typography (font families, sizes, weights, line heights)
- Spacing scale (4px base)
- Border radius
- Shadows / elevation
- Z-index scale
- Transition durations

Output complete, copy-paste-ready ${format ?? "CSS variables"} code.
Make the palette distinctive and appropriate to the product, not generic.
`;
      const result = await askMistral(DESIGN_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "generate_component",
    {
      description: "Generate a UI component with complete code (React, Vue, or HTML/CSS)",
      inputSchema: {
        component: z
          .string()
          .describe("Component to generate (e.g. pricing table, hero section, data table, modal)"),
        framework: z
          .enum(["react-tailwind", "react-css", "vue-tailwind", "html-css", "react-native"])
          .optional()
          .default("react-tailwind"),
        props: z
          .string()
          .optional()
          .describe("Props or configuration options for the component"),
        style: z
          .string()
          .optional()
          .describe("Visual style or aesthetic"),
      },
    },
    async ({ component, framework, props, style }) => {
      const prompt = `
Generate a complete, production-ready ${component} component.
Framework: ${framework ?? "react-tailwind"}
${props ? `Props/Config: ${props}` : ""}
${style ? `Style: ${style}` : ""}

Requirements:
- Fully functional with real content (not Lorem Ipsum for named components)
- Responsive design
- Accessible (proper ARIA, keyboard nav)
- TypeScript types if using React
- Beautiful, modern UI — not generic
- Complete code, ready to copy-paste and use

Include all necessary imports and a usage example.
`;
      const result = await askMistral(DESIGN_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "analyze_design",
    {
      description:
        "Analyze a design description or UI code and get improvement suggestions",
      inputSchema: {
        input: z
          .string()
          .describe("Design description, UI code, or CSS to analyze"),
        focus: z
          .array(
            z.enum([
              "accessibility",
              "ux",
              "visual-hierarchy",
              "performance",
              "responsiveness",
              "all",
            ]),
          )
          .optional()
          .default(["all"]),
      },
    },
    async ({ input, focus }) => {
      const focusAreas = focus?.join(", ") ?? "all";
      const prompt = `
Analyze this design/UI and provide improvement suggestions. Focus: ${focusAreas}

Input:
${input}

Provide:
1. **Current issues** — what's wrong or could be improved
2. **Specific fixes** — actionable changes with code examples
3. **Accessibility issues** — WCAG violations or risks
4. **UX improvements** — interaction and usability enhancements
5. **Visual improvements** — hierarchy, contrast, spacing
Rate each issue: 🔴 Critical, 🟠 Important, 🟡 Nice-to-have
`;
      const result = await askMistral(DESIGN_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "generate_landing_page",
    {
      description:
        "Generate a complete, beautiful landing page in HTML/CSS or React",
      inputSchema: {
        product_name: z.string().describe("Product or company name"),
        tagline: z.string().describe("One-line value proposition"),
        description: z
          .string()
          .describe("What the product does and who it's for"),
        framework: z
          .enum(["html-css", "react-tailwind"])
          .optional()
          .default("react-tailwind"),
        sections: z
          .array(z.string())
          .optional()
          .describe("Sections to include (e.g. hero, features, pricing, testimonials, faq, cta)"),
      },
    },
    async ({ product_name, tagline, description, framework, sections }) => {
      const sectionList =
        sections?.join(", ") ?? "hero, features, how it works, pricing, testimonials, faq, cta";
      const prompt = `
Generate a complete, beautiful landing page for:
Product: ${product_name}
Tagline: ${tagline}
Description: ${description}
Framework: ${framework ?? "react-tailwind"}
Sections: ${sectionList}

Requirements:
- Modern, professional design with a distinctive visual identity
- Real content (not placeholder text) based on the product description
- Smooth scroll animations and micro-interactions
- Fully responsive (mobile-first)
- Complete working code, ready to use
- Strong CTA and conversion-focused design

Make it look like it was designed by a top-tier design studio.
`;
      const result = await askMistral(DESIGN_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );
}
