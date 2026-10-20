import { registerHooks } from 'node:module'
// Existing source uses extensionless ESM specifiers. Resolve only the audited src graph.
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/') && specifier.startsWith('.') && !specifier.endsWith('.js'))
    return next(specifier + '.js', context)
  return next(specifier, context)
} })
