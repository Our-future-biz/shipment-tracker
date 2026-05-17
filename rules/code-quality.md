# Universal Rule: Keep Code Simple, Clean, and Functional

## Core Principles
- Always write simple, clear, and maintainable code
- Prioritize readability and functionality over clever or overly complex solutions
- Use the simplest approach that meets requirements without sacrificing quality
- Follow high coding standards: consistent formatting, proper naming conventions, and necessary comments for clarity
- Avoid unnecessary abstractions, layers, or over-engineering
- Prefer pure functions, minimal side effects, and clear data flow
- Remove unused code, imports, and variables
- Ensure all code passes strict type checks and linting
- Optimize only when proven necessary — clarity is the default priority
- **Do not break current business rules or overwrite existing functionality unless explicitly instructed**
- **Do not change the current design patterns without clear approval**

## Code Examples

### ✅ GOOD: Simple, clear function
```typescript
const getUserDisplayName = (user: User): string => {
  if (!user) return 'Unknown User';
  return user.displayName || `${user.firstName} ${user.lastName}`;
};
```

### ❌ BAD: Overly complex with unnecessary abstractions
```typescript
const getUserDisplayName = (user: User): string => {
  const userValidator = new UserValidator();
  const nameFormatter = new NameFormatter();
  const fallbackHandler = new FallbackHandler();

  if (userValidator.isValid(user)) {
    return nameFormatter.format(user) || fallbackHandler.getDefault();
  }
  return fallbackHandler.getDefault();
};
```

## Anti-Patterns to Avoid
1. **Over-Engineering**: Don't create abstractions for simple operations
2. **Premature Optimization**: Don't optimize before measuring
3. **Complex State Management**: Don't use complex patterns for simple state
4. **Unnecessary Dependencies**: Don't add packages unless absolutely necessary
5. **Breaking Existing Behavior**: Don’t remove or alter existing business logic without explicit approval
6. **Changing Approved Design**: Don’t deviate from established UI/UX or architecture patterns unless required

## Before Making Changes — Checklist

Before applying any changes, confirm:
1. **Business Rules**: Have I verified that no existing business rule will be broken?
2. **Design Consistency**: Am I following the approved UI/UX and architecture patterns?
3. **Security/Privacy**: Have I verified no sensitive data/PII exposure or new security risks?
4. **Functionality Preservation**: Will the current functionality remain intact unless explicitly told to change it?
5. **Simplicity**: Is this the simplest, cleanest way to achieve the goal?
6. **Readability**: Can another developer understand this code without additional explanation?
7. **Dependencies**: Am I adding a new dependency only if it is absolutely required?
8. **Testing**: Will the change pass all existing tests, and have I added tests for new logic?

## Remember
"Any fool can write code that a computer can understand. Good programmers write code that humans can understand." - Martin Fowler

Keep it simple. Keep it clean. Keep it functional.
