# Frontend Admin React - Coding Standards

## Tech Stack

- **Next.js 15.x** with **React 19.x**
- Application is fully **SPA** (no server-side rendering)
- Exported as fully static JavaScript application
- **Ant Design (antd)** for UI components
- **TailwindCSS** for styling

## Development Principles

- Follow requirements carefully & to the letter
- Think step-by-step - describe your plan in detail before coding
- Always write correct, best practice, DRY principle (Don't Repeat Yourself)
- Write bug-free, fully functional and working code
- Focus on readability over performance
- Fully implement all requested functionality
- Leave NO todos, placeholders or missing pieces
- Ensure code is complete and thoroughly verified
- Include all required imports and proper naming of key components
- Be concise, minimize unnecessary prose
- If you think there might not be a correct answer, say so
- If you do not know the answer, say so instead of guessing

## Groupon IQ Structure Rules

Architecture and refactor standards for this frontend live in `_documentation/groupon_frontend/`.

Follow these rules when working in `apps/admin-react-fe`:

- Default to feature-local placement under `src/app/<feature>/...`
- Keep shared folders for truly generic reusable code only
- Keep route entry files thin and compositional
- Use feature-prefixed names for feature-local components and helpers
- Use one React component per file
- Split large components into smaller focused files early

## Code Implementation Guidelines

### Component Structure
- Use **functional components** with hooks (no class components)
- Use **const arrow functions**: `const ComponentName = () => {}`
- Define TypeScript types/interfaces for all props and complex data

### Code Style
- Use **early returns** whenever possible to make code more readable
- Always use **Tailwind classes** for styling HTML elements (avoid inline CSS or `<style>` tags)
- Use "class:" instead of the ternary operator in class tags whenever possible
- Use **descriptive variable and function/const names**
- Event handlers should use **"handle" prefix**: `handleClick`, `handleKeyDown`, `handleSubmit`

### Accessibility
- Implement accessibility features on interactive elements:
  - `tabindex="0"` for keyboard navigation
  - `aria-label` for screen readers
  - Both `onClick` and `onKeyDown` handlers
  - Proper semantic HTML elements

### TypeScript
- Define types for all props and complex data structures
- Use TypeScript interfaces over type aliases for objects
- Ensure all code passes strict type checks

## UI Library

Use **Ant Design (antd)** for UI components. Follow Ant Design conventions and patterns.
